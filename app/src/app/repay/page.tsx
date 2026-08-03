"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from "wagmi";
import { parseEther, type Hex } from "viem";
import { sepolia } from "wagmi/chains";
import { AppShell } from "@/components/AppShell";
import { ConfirmingStages } from "@/components/ConfirmingStages";
import { config } from "@/lib/config";
import { sepoliaPaymentAbi, creditLineAbi } from "@/lib/abi";
import { encodeMockProof, formatEth } from "@/lib/format";
import { creditcoinTestnet } from "@/lib/wagmi";
import { keccak256, toBytes } from "viem";

export default function RepayPage() {
  const { address, chainId } = useAccount();
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

  async function onRepayPay() {
    setError(null);
    if (!address) return setError("Connect a wallet first.");
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
    <AppShell title="Repay" subtitle="Pay on Sepolia, verify with Attestcoin, clear debt on Creditcoin.">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-panel p-6">
        {position && Number(position.status) === 1 && (
          <p className="mb-4 text-sm text-muted">
            Outstanding debt: <span className="font-mono text-text">{formatEth(position.debt)} ETH</span>
          </p>
        )}
        <label className="text-xs font-medium uppercase tracking-wide text-muted">Repay amount (ETH)</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-panel2 px-3 py-3 font-mono text-lg outline-none ring-accent focus:ring-1"
        />
        <div className="mt-6">
          <ConfirmingStages step={step} />
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRepayPay}
            disabled={isPending || waiting}
            className="rounded-xl bg-gradient-to-r from-accent to-accent2 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isPending || waiting ? "Confirm in wallet…" : "Make repayment"}
          </button>
          {isSuccess && step >= 2 && step < 4 && (
            <button
              type="button"
              onClick={onProveRepay}
              className="rounded-xl border border-accent/50 bg-accent/10 px-4 py-3 text-sm font-semibold"
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
        {step === 4 && <p className="mt-3 text-sm text-success">Loan updated / closed.</p>}
      </div>
    </AppShell>
  );
}
