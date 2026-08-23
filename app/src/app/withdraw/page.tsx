"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { formatEther, parseEther, type Hex } from "viem";
import { Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConnectButton } from "@/components/ConnectButton";
import { config } from "@/lib/config";
import { creditLineAbi, sparkCreditAbi } from "@/lib/abi";
import { formatEth } from "@/lib/format";
import { creditcoinTestnet } from "@/lib/wagmi";
import { friendlyError } from "@/lib/errors";
import { journalActivity } from "@/hooks/usePaymentActivity";

type Action = "withdraw" | "redeem";

type SuccessState = {
  action: Action;
  hash: Hex;
  amountLabel: string;
};

export default function WithdrawPage() {
  const { address, chainId, isConnected } = useAccount();
  const creditClient = usePublicClient({ chainId: creditcoinTestnet.id });
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [confirmTimedOut, setConfirmTimedOut] = useState(false);
  const journaledHash = useRef<Hex | undefined>(undefined);
  const submittedRef = useRef<{ action: Action; hash: Hex; value: bigint } | null>(null);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: isSigning } = useWriteContract();
  const {
    isLoading: waitingReceipt,
    isSuccess: receiptSuccess,
    isError: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: creditcoinTestnet.id,
    confirmations: 1,
    pollingInterval: 2_000,
    query: { enabled: Boolean(txHash) && !success },
  });

  const enabled =
    Boolean(address) &&
    config.creditLineAddress !== "0x0000000000000000000000000000000000000000";

  const { data: position, refetch: refetchPosition } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled },
  });

  const { data: available, refetch: refetchAvailable } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "availableCredit",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: { enabled },
  });

  const { data: walletCredit, refetch: refetchWallet } = useReadContract({
    address: config.creditTokenAddress,
    abi: sparkCreditAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled:
        Boolean(address) &&
        config.creditTokenAddress !== "0x0000000000000000000000000000000000000000",
    },
  });

  const status = position ? Number(position.status) : 0;
  const hasActiveLine = status === 1;
  const availableWei = available ?? 0n;
  const debtWei = position?.debt ?? 0n;
  const walletWei = walletCredit ?? 0n;

  const awaitingWallet = Boolean(pendingAction && isSigning && !txHash);
  const isConfirming = Boolean(txHash && pendingAction && !success);
  const isBusy = awaitingWallet || isConfirming;

  const refetchBalances = useCallback(async () => {
    await Promise.all([refetchPosition(), refetchAvailable(), refetchWallet()]);
  }, [refetchPosition, refetchAvailable, refetchWallet]);

  useEffect(() => {
    if (availableWei > 0n && !amount && !success) {
      setAmount(formatEther(availableWei));
    }
  }, [availableWei, amount, success]);

  const markSuccess = useCallback(
    async (action: Action, hash: Hex, value: bigint) => {
      setSuccess({ action, hash, amountLabel: `${formatEth(value)} sCREDIT` });
      setPendingAction(null);
      setTxHash(undefined);
      setConfirmTimedOut(false);
      submittedRef.current = null;
      await refetchBalances();
    },
    [refetchBalances],
  );

  const tryConfirmReceipt = useCallback(
    async (hash: Hex, action: Action, value: bigint) => {
      if (!creditClient || success) return false;
      try {
        const receipt = await creditClient.getTransactionReceipt({ hash });
        if (receipt.status === "success") {
          await markSuccess(action, hash, value);
          return true;
        }
        if (receipt.status === "reverted") {
          setError("Transaction reverted on Creditcoin.");
          setPendingAction(null);
          setTxHash(undefined);
          submittedRef.current = null;
        }
      } catch {
        /* not mined yet */
      }
      return false;
    },
    [creditClient, success, markSuccess],
  );

  useEffect(() => {
    if (!receiptSuccess || !txHash || !pendingAction || success) return;
    const submitted = submittedRef.current;
    const value = submitted?.value ?? parseEther(amount || "0");
    const action = submitted?.action ?? pendingAction;
    void markSuccess(action, txHash, value);
  }, [receiptSuccess, txHash, pendingAction, success, amount, markSuccess]);

  // Creditcoin RPC sometimes misses wagmi receipt polling — fall back to direct poll.
  useEffect(() => {
    if (!txHash || !pendingAction || success || receiptSuccess || !creditClient) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (!cancelled) setConfirmTimedOut(true);
    }, 45_000);

    void (async () => {
      const submitted = submittedRef.current;
      if (!submitted) return;

      if (await tryConfirmReceipt(submitted.hash, submitted.action, submitted.value)) return;

      for (let i = 0; i < 30 && !cancelled; i++) {
        if (await tryConfirmReceipt(submitted.hash, submitted.action, submitted.value)) return;
        await new Promise((r) => setTimeout(r, 2_000));
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    txHash,
    pendingAction,
    success,
    receiptSuccess,
    creditClient,
    tryConfirmReceipt,
  ]);

  useEffect(() => {
    if (!receiptError || !txHash || success) return;
    const submitted = submittedRef.current;
    if (!submitted) return;
    void tryConfirmReceipt(submitted.hash, submitted.action, submitted.value);
    setConfirmTimedOut(true);
  }, [receiptError, txHash, success, tryConfirmReceipt]);

  function journalOnce(
    hash: Hex,
    action: Action,
    value: bigint,
  ) {
    if (!address || journaledHash.current === hash) return;
    journaledHash.current = hash;
    journalActivity(address, {
      id: `${hash}-${action === "withdraw" ? "wd" : "rd"}`,
      type: action === "withdraw" ? "Credit withdrawn" : "Credit redeemed",
      amount: `${formatEth(value)} sCREDIT`,
      status: "Completed",
      at: "Creditcoin",
      kind: action === "withdraw" ? "withdraw" : "redeem",
      href: `${config.explorerCreditcoin}/tx/${hash}`,
    });
  }

  async function onWithdraw() {
    setError(null);
    setSuccess(null);
    setConfirmTimedOut(false);
    journaledHash.current = undefined;
    submittedRef.current = null;
    if (!address) return setError("Connect a wallet first.");
    if (!hasActiveLine) return setError("Open a credit line before withdrawing.");
    if (availableWei === 0n) return setError("No available credit to withdraw.");
    try {
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const value = parseEther(amount || "0");
      if (value === 0n) return setError("Enter an amount greater than 0.");
      if (value > availableWei) return setError("Amount exceeds available credit.");

      setPendingAction("withdraw");
      const hash = await writeContractAsync({
        address: config.creditLineAddress,
        abi: creditLineAbi,
        functionName: "withdraw",
        args: [value],
        chainId: creditcoinTestnet.id,
      });
      setTxHash(hash);
      submittedRef.current = { action: "withdraw", hash, value };
      journalOnce(hash, "withdraw", value);
      void tryConfirmReceipt(hash, "withdraw", value);
    } catch (e) {
      setError(friendlyError(e));
      setPendingAction(null);
      setTxHash(undefined);
      submittedRef.current = null;
    }
  }

  async function onRedeem() {
    setError(null);
    setSuccess(null);
    setConfirmTimedOut(false);
    journaledHash.current = undefined;
    submittedRef.current = null;
    if (!address) return setError("Connect a wallet first.");
    if (!hasActiveLine) return setError("No active credit line.");
    if (debtWei === 0n) return setError("No debt to redeem against.");
    try {
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const value = parseEther(amount || "0");
      if (value === 0n) return setError("Enter an amount greater than 0.");
      if (value > walletWei) return setError("Amount exceeds wallet sCREDIT.");
      if (value > debtWei) return setError("Amount exceeds current debt.");

      setPendingAction("redeem");
      const hash = await writeContractAsync({
        address: config.creditLineAddress,
        abi: creditLineAbi,
        functionName: "redeem",
        args: [value],
        chainId: creditcoinTestnet.id,
      });
      setTxHash(hash);
      submittedRef.current = { action: "redeem", hash, value };
      journalOnce(hash, "redeem", value);
      void tryConfirmReceipt(hash, "redeem", value);
    } catch (e) {
      setError(friendlyError(e));
      setPendingAction(null);
      setTxHash(undefined);
      submittedRef.current = null;
    }
  }

  function onMax() {
    setAmount(formatEther(availableWei));
  }

  function dismissSuccess() {
    setSuccess(null);
    setTxHash(undefined);
    setPendingAction(null);
    setConfirmTimedOut(false);
    submittedRef.current = null;
    if (availableWei > 0n) {
      setAmount(formatEther(availableWei));
    }
  }

  return (
    <AppShell
      title="Withdraw"
      subtitle="Mint sCREDIT from your line, or redeem sCREDIT against accruing debt."
    >
      <div className="mx-auto max-w-md border border-border bg-panel/80 p-5 sm:p-7 shadow-soft">
        {!isConnected && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">Connect a wallet to withdraw</p>
            <div className="mt-4">
              <ConnectButton />
            </div>
          </div>
        )}

        {isConnected && !hasActiveLine && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">No active credit line</p>
            <p className="mt-1 text-[13px] text-muted">
              Pay a deposit and open credit first, then withdraw to your wallet.
            </p>
            <Link
              href="/pay"
              className="btn-shine mt-4 inline-flex px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white"
            >
              Pay deposit
            </Link>
          </div>
        )}

        {success && (
          <div className="mb-6 border border-success/30 bg-success/10 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-success/20 text-success">
                <Check className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium text-text">
                  {success.action === "withdraw" ? "Withdrawn" : "Redeemed"} {success.amountLabel}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  Confirmed on Creditcoin. Balances updated below.
                </p>
                <a
                  className="mt-2 inline-block break-all text-[12px] text-white hover:underline"
                  href={`${config.explorerCreditcoin}/tx/${success.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={dismissSuccess}
                className=" border border-border px-4 py-2 text-[13px] font-medium text-text hover:bg-white/[0.03]"
              >
                {success.action === "withdraw" ? "Withdraw more" : "Redeem more"}
              </button>
              {success.action === "withdraw" && walletWei > 0n && debtWei > 0n && (
                <button
                  type="button"
                  onClick={() => {
                    dismissSuccess();
                    setAmount(formatEther(walletWei < debtWei ? walletWei : debtWei));
                  }}
                  className="btn-shine px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white"
                >
                  Redeem against debt
                </button>
              )}
              <Link
                href="/repay"
                className=" border border-border px-4 py-2 text-[13px] font-medium text-text hover:bg-white/[0.03]"
              >
                Repay on Sepolia
              </Link>
            </div>
          </div>
        )}

        {hasActiveLine && (
          <div className="mb-5 space-y-1 text-[13px] text-muted">
            <p>
              Available:{" "}
              <span className="tabular-nums text-text">{formatEth(availableWei)} sCREDIT</span>
            </p>
            <p>
              In wallet:{" "}
              <span className="tabular-nums text-text">{formatEth(walletWei)} sCREDIT</span>
            </p>
            <p>
              Debt:{" "}
              <span className="tabular-nums text-text">{formatEth(debtWei)} sCREDIT</span>
              <span className="text-muted"> · 10% APR</span>
            </p>
          </div>
        )}

        <div className="flex items-end justify-between gap-3">
          <label className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">
            Amount (sCREDIT)
          </label>
          {hasActiveLine && availableWei > 0n && !isBusy && (
            <button
              type="button"
              onClick={onMax}
              className="text-[12px] font-medium text-white hover:underline"
            >
              Max available
            </button>
          )}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!hasActiveLine || isBusy}
          className="mt-2 w-full border border-border bg-transparent px-4 py-3.5 text-[18px] tabular-nums text-text outline-none transition focus:border-accent/60 disabled:opacity-50"
        />

        <p className="mt-3 text-[12px] text-muted">
          Withdraw mints sCREDIT and raises debt. Redeem burns sCREDIT to cut debt. Attested Sepolia
          repayment still closes the line.
        </p>

        {(awaitingWallet || isConfirming) && !success && (
          <p className="mt-4 text-[13px] text-muted">
            {awaitingWallet
              ? "Confirm in MetaMask…"
              : confirmTimedOut
                ? "Still confirming on Creditcoin — check the explorer link below. Balances update once mined."
                : pendingAction === "redeem"
                  ? "Redeem submitted — waiting for Creditcoin confirmation…"
                  : "Withdrawal submitted — waiting for Creditcoin confirmation…"}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-2">
          <button
            type="button"
            onClick={onWithdraw}
            disabled={!hasActiveLine || isBusy || availableWei === 0n || Boolean(success)}
            className="btn-shine px-4 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-white disabled:opacity-50"
          >
            {awaitingWallet && pendingAction === "withdraw"
              ? "Confirm in MetaMask…"
              : isConfirming && pendingAction === "withdraw"
                ? "Confirming withdrawal…"
                : "Withdraw to wallet"}
          </button>
          <button
            type="button"
            onClick={onRedeem}
            disabled={
              !hasActiveLine ||
              isBusy ||
              walletWei === 0n ||
              debtWei === 0n ||
              Boolean(success)
            }
            className=" border border-border px-4 py-3 text-[14px] font-medium text-text transition hover:bg-white/[0.03] disabled:opacity-50"
          >
            {awaitingWallet && pendingAction === "redeem"
              ? "Confirm in MetaMask…"
              : isConfirming && pendingAction === "redeem"
                ? "Confirming redeem…"
                : "Redeem against debt"}
          </button>
        </div>

        {txHash && isConfirming && (
          <div className="mt-5 space-y-2">
            <p className="break-all text-[12px] text-muted">
              <a
                className="text-white hover:underline"
                href={`${config.explorerCreditcoin}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {txHash}
              </a>
            </p>
            {confirmTimedOut && submittedRef.current && (
              <button
                type="button"
                onClick={() => {
                  const s = submittedRef.current;
                  if (!s) return;
                  void tryConfirmReceipt(s.hash, s.action, s.value);
                }}
                className="text-[12px] font-medium text-white hover:underline"
              >
                Check confirmation again
              </button>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
      </div>
    </AppShell>
  );
}
