"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from "wagmi";
import { parseEther, keccak256, toBytes, type Hex } from "viem";
import { sepolia } from "wagmi/chains";
import { AppShell } from "@/components/AppShell";
import { ConfirmingStages } from "@/components/ConfirmingStages";
import { config } from "@/lib/config";
import { sepoliaPaymentAbi, creditLineAbi } from "@/lib/abi";
import { encodeMockProof } from "@/lib/format";
import { creditcoinTestnet } from "@/lib/wagmi";

export default function PayPage() {
  const { address, chainId } = useAccount();
  const [amount, setAmount] = useState("0.01");
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: waiting, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  async function onPay() {
    setError(null);
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (config.paymentAddress.endsWith("0000")) {
      setError("Payment contract not deployed yet. Set NEXT_PUBLIC_PAYMENT_ADDRESS after forge deploy.");
      return;
    }
    try {
      if (chainId !== sepolia.id) {
        await switchChainAsync({ chainId: sepolia.id });
      }
      setStep(1);
      const ref = keccak256(toBytes(`spark-${address}-${Date.now()}`));
      const hash = await writeContractAsync({
        address: config.paymentAddress,
        abi: sepoliaPaymentAbi,
        functionName: "payDeposit",
        args: [ref],
        value: parseEther(amount || "0.01"),
        chainId: sepolia.id,
      });
      setTxHash(hash);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setStep(0);
    }
  }

  async function onProveAndOpen() {
    setError(null);
    if (!address || !txHash) return;
    if (config.creditLineAddress.endsWith("0000")) {
      setError("CreditLine not deployed. Set NEXT_PUBLIC_CREDITLINE_ADDRESS.");
      return;
    }
    try {
      setStep(3);
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const amountWei = parseEther(amount || "0.01");
      // Structured proof for MockPaymentVerifier. Replace with USC SDK proof for Attestcoin depth on live testnet.
      const proof = encodeMockProof({
        txHash,
        payer: address,
        amountWei,
        kind: 1,
      });
      await writeContractAsync({
        address: config.creditLineAddress,
        abi: creditLineAbi,
        functionName: "openCredit",
        args: [
          {
            txHash,
            payer: address,
            amount: amountWei,
            kind: 1,
          },
          proof,
        ],
        chainId: creditcoinTestnet.id,
      });
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
      setStep(2);
    }
  }

  const stage = isSuccess && step === 2 ? 2 : step;

  return (
    <AppShell title="Pay deposit" subtitle="Pay on Sepolia. Spark verifies it, then unlocks credit on Creditcoin.">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-panel p-6 shadow-glow">
        <label className="text-xs font-medium uppercase tracking-wide text-muted">Amount (ETH)</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-panel2 px-3 py-3 font-mono text-lg outline-none ring-accent focus:ring-1"
        />
        <p className="mt-2 text-xs text-muted">
          Faucet:{" "}
          <a className="text-accent underline" href="https://www.alchemy.com/faucets/ethereum-sepolia" target="_blank" rel="noreferrer">
            Sepolia ETH
          </a>
          {" · "}
          <a className="text-accent underline" href="https://discord.com/invite/creditcoin" target="_blank" rel="noreferrer">
            Creditcoin Discord faucet
          </a>
        </p>

        <div className="mt-6">
          <ConfirmingStages step={stage === 0 ? 0 : stage} />
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onPay}
            disabled={isPending || waiting}
            className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-accent2 disabled:opacity-50"
          >
            {isPending || waiting ? "Confirm in wallet…" : "Pay deposit"}
          </button>
          {isSuccess && step >= 2 && step < 4 && (
            <button
              type="button"
              onClick={onProveAndOpen}
              className="rounded-xl border border-brand/50 bg-brand/10 px-4 py-3 text-sm font-semibold text-text"
            >
              Verify payment & open credit
            </button>
          )}
        </div>

        {txHash && (
          <p className="mt-4 break-all text-xs text-muted">
            Payment tx:{" "}
            <a className="text-accent" href={`${config.explorerSepolia}/tx/${txHash}`} target="_blank" rel="noreferrer">
              {txHash}
            </a>
          </p>
        )}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {step === 4 && (
          <p className="mt-3 text-sm text-success">Credit ready. Go to Overview.</p>
        )}
      </div>
    </AppShell>
  );
}
