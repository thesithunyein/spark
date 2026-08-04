"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from "wagmi";
import { parseEther, keccak256, toBytes, type Hex } from "viem";
import { sepolia } from "wagmi/chains";
import { AppShell } from "@/components/AppShell";
import { ConfirmingStages } from "@/components/ConfirmingStages";
import { ConnectButton } from "@/components/ConnectButton";
import { config } from "@/lib/config";
import { sepoliaPaymentAbi, creditLineAbi } from "@/lib/abi";
import { encodeMockProof } from "@/lib/format";
import { creditcoinTestnet } from "@/lib/wagmi";

export default function PayPage() {
  const { address, chainId, isConnected } = useAccount();
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
      // Demo path: MockPaymentVerifier. Swap to Attestcoin USC proof for production depth.
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
    <AppShell title="Pay deposit" subtitle="Pay on Sepolia. We verify, then unlock credit on Creditcoin.">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-panel/80 p-7 shadow-soft">
        {!isConnected && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">Connect a wallet to pay</p>
            <p className="mt-1 text-[13px] text-muted">You’ll pay on Sepolia, then unlock credit on Creditcoin.</p>
            <div className="mt-4">
              <ConnectButton />
            </div>
          </div>
        )}

        <label className="text-[11px] font-medium uppercase tracking-label text-muted">Amount (ETH)</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-transparent px-4 py-3.5 text-[18px] tabular-nums outline-none transition focus:border-brand/50"
        />
        <p className="mt-2 text-[12px] text-muted">
          Faucet:{" "}
          <a className="text-text/80 underline-offset-2 hover:underline" href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia" target="_blank" rel="noreferrer">
            Sepolia ETH
          </a>
          {" · "}
          <a className="text-text/80 underline-offset-2 hover:underline" href="https://discord.com/invite/creditcoin" target="_blank" rel="noreferrer">
            Creditcoin faucet
          </a>
        </p>

        <div className="mt-8">
          <ConfirmingStages step={stage === 0 ? 0 : stage} />
        </div>

        <div className="mt-8 flex flex-col gap-2">
          <button
            type="button"
            onClick={onPay}
            disabled={!isConnected || isPending || waiting}
            className="rounded-full bg-brand px-4 py-3 text-[14px] font-medium text-white transition hover:bg-accent2 disabled:opacity-50"
          >
            {isPending || waiting ? "Confirm in wallet…" : "Pay deposit"}
          </button>
          {isSuccess && step >= 2 && step < 4 && (
            <button
              type="button"
              onClick={onProveAndOpen}
              className="rounded-full border border-border px-4 py-3 text-[14px] font-medium text-text transition hover:bg-white/[0.03]"
            >
              Verify payment & open credit
            </button>
          )}
        </div>

        {txHash && (
          <p className="mt-5 break-all text-[12px] text-muted">
            Payment tx:{" "}
            <a className="text-text/80 hover:underline" href={`${config.explorerSepolia}/tx/${txHash}`} target="_blank" rel="noreferrer">
              {txHash}
            </a>
          </p>
        )}
        {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
        {step === 4 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-[15px] font-medium text-text">Credit ready</p>
            <p className="mt-1 text-[13px] text-muted">Your line is open on Creditcoin.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/overview" className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white">
                View credit
              </Link>
              <Link href="/activity" className="rounded-full border border-border px-4 py-2 text-[13px] font-medium">
                See payments
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
