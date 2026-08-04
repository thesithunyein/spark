"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from "wagmi";
import { parseEther, type Hex, keccak256, toBytes } from "viem";
import { sepolia } from "wagmi/chains";
import { AppShell } from "@/components/AppShell";
import { ConfirmingStages } from "@/components/ConfirmingStages";
import { ConnectButton } from "@/components/ConnectButton";
import { config } from "@/lib/config";
import { sepoliaPaymentAbi, creditLineAbi } from "@/lib/abi";
import { encodePaymentProof, formatEth } from "@/lib/format";
import { buildAttestcoinProof } from "@/lib/usc";
import { creditcoinTestnet } from "@/lib/wagmi";
import { friendlyError } from "@/lib/errors";
import { journalActivity } from "@/hooks/usePaymentActivity";

export default function RepayPage() {
  const { address, chainId, isConnected } = useAccount();
  const [amount, setAmount] = useState("0.008");
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const autoVerifyStarted = useRef(false);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: waiting, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: position } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled:
        Boolean(address) &&
        config.creditLineAddress !== "0x0000000000000000000000000000000000000000",
    },
  });

  const status = position ? Number(position.status) : 0;
  const hasActiveLine = status === 1;
  const debt = position?.debt ?? 0n;

  async function onRepayPay() {
    setError(null);
    autoVerifyStarted.current = false;
    if (!address) return setError("Connect a wallet first.");
    if (!hasActiveLine) return setError("No active credit line to repay.");
    if (config.paymentAddress.endsWith("0000")) {
      return setError("Payment contract not configured.");
    }
    try {
      if (chainId !== sepolia.id) await switchChainAsync({ chainId: sepolia.id });
      setStep(1);
      const ref = keccak256(toBytes(`spark-repay-${address}-${Date.now()}`));
      const hash = await writeContractAsync({
        address: config.paymentAddress,
        abi: sepoliaPaymentAbi,
        functionName: "payRepayment",
        args: [ref],
        value: parseEther(amount || "0.008"),
        chainId: sepolia.id,
      });
      setTxHash(hash);
      setStep(2);
      journalActivity(address, {
        id: `${hash}-rep`,
        type: "Repayment paid",
        amount: `${amount || "0.008"} ETH`,
        status: "Confirmed",
        at: "Sepolia",
        kind: "repay",
        href: `${config.explorerSepolia}/tx/${hash}`,
      });
    } catch (e) {
      setError(friendlyError(e));
      setStep(0);
    }
  }

  async function onProveRepay() {
    setError(null);
    setStatusNote(null);
    if (!address || !txHash) return;
    try {
      setStep(3);
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const amountWei = parseEther(amount || "0.008");
      let proof: Hex;
      if (config.attestcoin) {
        setStatusNote("Waiting for Attestcoin attestation, then building USC proof…");
        proof = await buildAttestcoinProof(txHash);
        setStatusNote("USC proof ready. Updating credit on Creditcoin…");
      } else {
        proof = encodePaymentProof({ txHash, payer: address, amountWei, kind: 2 });
      }
      const repayHash = await writeContractAsync({
        address: config.creditLineAddress,
        abi: creditLineAbi,
        functionName: "repayCredit",
        args: [{ txHash, payer: address, amount: amountWei, kind: 2 }, proof],
        chainId: creditcoinTestnet.id,
      });
      journalActivity(address, {
        id: `${repayHash}-crepay`,
        type: "Credit repaid",
        amount: `${formatEth(amountWei)} ETH`,
        status: "Completed",
        at: "Creditcoin",
        kind: "repay",
        href: `${config.explorerCreditcoin}/tx/${repayHash}`,
      });
      setStatusNote(null);
      setStep(4);
    } catch (e) {
      setError(friendlyError(e));
      setStatusNote(null);
      setStep(2);
      autoVerifyStarted.current = false;
    }
  }

  useEffect(() => {
    if (!isSuccess || step !== 2 || autoVerifyStarted.current || !txHash) return;
    autoVerifyStarted.current = true;
    void onProveRepay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, step, txHash]);

  const verifying = step === 3 || (isSuccess && step === 2 && autoVerifyStarted.current);

  return (
    <AppShell title="Repay" subtitle="Pay on Sepolia, verify, clear debt on Creditcoin.">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-panel/80 p-7 shadow-soft">
        {!isConnected && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">Connect a wallet to repay</p>
            <div className="mt-4">
              <ConnectButton />
            </div>
          </div>
        )}

        {isConnected && !hasActiveLine && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">No active credit line</p>
            <p className="mt-1 text-[13px] text-muted">Open credit with a deposit before you can repay.</p>
            <Link href="/pay" className="mt-4 inline-flex rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white">
              Pay deposit
            </Link>
          </div>
        )}

        {hasActiveLine && (
          <p className="mb-5 text-[13px] text-muted">
            Outstanding debt: <span className="tabular-nums text-text">{formatEth(debt)} ETH</span>
          </p>
        )}

        <label className="text-[11px] font-medium uppercase tracking-label text-muted">Repay amount (ETH)</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!hasActiveLine}
          className="mt-2 w-full rounded-xl border border-border bg-transparent px-4 py-3.5 text-[18px] tabular-nums outline-none transition focus:border-brand/50 disabled:opacity-50"
        />
        <div className="mt-8">
          <ConfirmingStages step={step} />
        </div>
        <div className="mt-8 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRepayPay}
            disabled={!hasActiveLine || isPending || waiting || verifying || step === 4}
            className="rounded-full bg-brand px-4 py-3 text-[14px] font-medium text-white transition hover:bg-accent2 disabled:opacity-50"
          >
            {isPending || waiting
              ? "Confirm in wallet…"
              : verifying
                ? "Verifying repayment…"
                : "Make repayment"}
          </button>
          {isSuccess && step >= 2 && step < 4 && !verifying && (
            <button
              type="button"
              onClick={onProveRepay}
              className="rounded-full border border-border px-4 py-3 text-[14px] font-medium transition hover:bg-white/[0.03]"
            >
              Verify repayment & update credit
            </button>
          )}
          {verifying && step < 4 && (
            <p className="text-center text-[12px] text-muted">
              {statusNote ||
                (config.attestcoin
                  ? "Payment confirmed. Waiting for Attestcoin / USC proof…"
                  : "Payment confirmed. Updating credit on Creditcoin…")}
            </p>
          )}
        </div>
        {txHash && (
          <p className="mt-5 break-all text-[12px] text-muted">
            <a className="hover:underline" href={`${config.explorerSepolia}/tx/${txHash}`} target="_blank" rel="noreferrer">
              {txHash}
            </a>
          </p>
        )}
        {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
        {step === 4 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-[15px] font-medium text-text">Loan updated</p>
            <Link href="/overview" className="mt-4 inline-flex rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white">
              Back to overview
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
