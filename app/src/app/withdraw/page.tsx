"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { formatEther, parseEther, type Hex } from "viem";
import { AppShell } from "@/components/AppShell";
import { ConnectButton } from "@/components/ConnectButton";
import { config } from "@/lib/config";
import { creditLineAbi, sparkCreditAbi } from "@/lib/abi";
import { formatEth } from "@/lib/format";
import { creditcoinTestnet } from "@/lib/wagmi";
import { friendlyError } from "@/lib/errors";
import { journalActivity } from "@/hooks/usePaymentActivity";

export default function WithdrawPage() {
  const { address, chainId, isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: waiting, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

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

  useEffect(() => {
    if (availableWei > 0n && !amount) {
      setAmount(formatEther(availableWei));
    }
  }, [availableWei, amount]);

  useEffect(() => {
    if (!isSuccess) return;
    void refetchPosition();
    void refetchAvailable();
    void refetchWallet();
  }, [isSuccess, refetchPosition, refetchAvailable, refetchWallet]);

  async function onWithdraw() {
    setError(null);
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

      const hash = await writeContractAsync({
        address: config.creditLineAddress,
        abi: creditLineAbi,
        functionName: "withdraw",
        args: [value],
        chainId: creditcoinTestnet.id,
      });
      setTxHash(hash);
      journalActivity(address, {
        id: `${hash}-wd`,
        type: "Credit withdrawn",
        amount: `${formatEth(value)} sCREDIT`,
        status: "Completed",
        at: "Creditcoin",
        kind: "deposit",
        href: `${config.explorerCreditcoin}/tx/${hash}`,
      });
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  async function onMax() {
    setAmount(formatEther(availableWei));
  }

  return (
    <AppShell
      title="Withdraw"
      subtitle="Send available credit to your wallet as sCREDIT (testnet units)."
    >
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-panel/80 p-7 shadow-soft">
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
              className="mt-4 inline-flex rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white"
            >
              Pay deposit
            </Link>
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
              <span className="tabular-nums text-text">{formatEth(walletCredit ?? 0n)} sCREDIT</span>
            </p>
            <p>
              Debt after withdraw rises — repay later to clear the line.
            </p>
          </div>
        )}

        <div className="flex items-end justify-between gap-3">
          <label className="text-[11px] font-medium uppercase tracking-label text-muted">
            Amount (sCREDIT)
          </label>
          {hasActiveLine && availableWei > 0n && (
            <button
              type="button"
              onClick={onMax}
              className="text-[12px] font-medium text-brand hover:underline"
            >
              Max
            </button>
          )}
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!hasActiveLine || availableWei === 0n}
          className="mt-2 w-full rounded-xl border border-border bg-transparent px-4 py-3.5 text-[18px] tabular-nums outline-none transition focus:border-brand/50 disabled:opacity-50"
        />

        <p className="mt-3 text-[12px] text-muted">
          sCREDIT is a testnet credit unit minted to your wallet. Not real money. No liquidity pool
          needed — withdraw still proves the credit line works.
        </p>

        <div className="mt-8 flex flex-col gap-2">
          <button
            type="button"
            onClick={onWithdraw}
            disabled={!hasActiveLine || isPending || waiting || availableWei === 0n || isSuccess}
            className="rounded-full bg-brand px-4 py-3 text-[14px] font-medium text-white transition hover:bg-accent2 disabled:opacity-50"
          >
            {isPending || waiting
              ? "Confirm in wallet…"
              : isSuccess
                ? "Withdrawn"
                : "Withdraw to wallet"}
          </button>
        </div>

        {txHash && (
          <p className="mt-5 break-all text-[12px] text-muted">
            <a
              className="hover:underline"
              href={`${config.explorerCreditcoin}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {txHash}
            </a>
          </p>
        )}
        {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
        {isSuccess && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-[15px] font-medium text-text">Credit in your wallet</p>
            <p className="mt-1 text-[13px] text-muted">
              sCREDIT was minted to your address on Creditcoin.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/overview"
                className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white"
              >
                Overview
              </Link>
              <Link
                href="/transfer"
                className="rounded-full border border-border px-4 py-2 text-[13px] font-medium"
              >
                Send & Receive
              </Link>
              <Link
                href="/repay"
                className="rounded-full border border-border px-4 py-2 text-[13px] font-medium"
              >
                Repay later
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
