"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from "wagmi";
import { parseEther, type Hex, keccak256, toBytes } from "viem";
import { sepolia } from "wagmi/chains";
import { AppShell } from "@/components/AppShell";
import { ConfirmingStages } from "@/components/ConfirmingStages";
import { ConnectButton } from "@/components/ConnectButton";
import { config } from "@/lib/config";
import { sepoliaPaymentAbi, creditLineAbi } from "@/lib/abi";
import { encodeMockProof, formatEth } from "@/lib/format";
import { creditcoinTestnet } from "@/lib/wagmi";

export default function RepayPage() {
  const { address, chainId, isConnected } = useAccount();
  const [amount, setAmount] = useState("0.008");
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [error, setError] = useState<string | null>(null);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Repayment payment failed");
      setStep(0);
    }
  }

  async function onProveRepay() {
    setError(null);
    if (!address || !txHash) return;
    try {
      setStep(3);
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const amountWei = parseEther(amount || "0.008");
      const proof = encodeMockProof({ txHash, payer: address, amountWei, kind: 2 });
      await writeContractAsync({
        address: config.creditLineAddress,
        abi: creditLineAbi,
        functionName: "repayCredit",
        args: [{ txHash, payer: address, amount: amountWei, kind: 2 }, proof],
        chainId: creditcoinTestnet.id,
      });
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify repay failed");
      setStep(2);
    }
  }

  return (
    <AppShell title="Repay" subtitle="Pay on Sepolia, verify the payment, clear debt on Creditcoin.">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-panel p-6">
        {!isConnected && (
          <div className="mb-5 rounded-xl border border-border bg-panel2 px-4 py-4">
            <p className="text-sm font-medium text-text">Connect a wallet to repay</p>
            <div className="mt-3">
              <ConnectButton />
            </div>
          </div>
        )}

        {isConnected && !hasActiveLine && (
          <div className="mb-5 rounded-xl border border-border bg-panel2 px-4 py-4">
            <p className="text-sm font-medium text-text">No active credit line</p>
            <p className="mt-1 text-xs text-muted">Open credit with a deposit before you can repay.</p>
            <Link href="/pay" className="mt-3 inline-flex rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">
              Pay deposit
            </Link>
          </div>
        )}

        {hasActiveLine && (
          <p className="mb-4 text-sm text-muted">
            Outstanding debt: <span className="font-mono text-text">{formatEth(debt)} ETH</span>
          </p>
        )}

        <label className="text-xs font-medium uppercase tracking-wide text-muted">Repay amount (ETH)</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!hasActiveLine}
          className="mt-2 w-full rounded-lg border border-border bg-panel2 px-3 py-3 font-mono text-lg outline-none ring-accent focus:ring-1 disabled:opacity-50"
        />
        <div className="mt-6">
          <ConfirmingStages step={step} />
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRepayPay}
            disabled={!hasActiveLine || isPending || waiting}
            className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-accent2 disabled:opacity-50"
          >
            {isPending || waiting ? "Confirm in wallet…" : "Make repayment"}
          </button>
          {isSuccess && step >= 2 && step < 4 && (
            <button
              type="button"
              onClick={onProveRepay}
              className="rounded-xl border border-brand/50 bg-brand/10 px-4 py-3 text-sm font-semibold"
            >
              Verify repayment & update credit
            </button>
          )}
        </div>
        {txHash && (
          <p className="mt-4 break-all text-xs text-muted">
            <a className="text-accent" href={`${config.explorerSepolia}/tx/${txHash}`} target="_blank" rel="noreferrer">
              {txHash}
            </a>
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {step === 4 && (
          <div className="mt-4 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
            <p className="text-sm font-medium text-success">Loan updated</p>
            <Link href="/overview" className="mt-3 inline-flex rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">
              Back to overview
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
