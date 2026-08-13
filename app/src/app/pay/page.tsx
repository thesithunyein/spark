"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useSwitchChain,
} from "wagmi";
import {
  parseEther,
  keccak256,
  toBytes,
  decodeEventLog,
  type Hex,
  type Log,
} from "viem";
import { sepolia } from "wagmi/chains";
import { AppShell } from "@/components/AppShell";
import { ConfirmingStages } from "@/components/ConfirmingStages";
import { AttestcoinProofPanel } from "@/components/AttestcoinProofPanel";
import { ConnectButton } from "@/components/ConnectButton";
import { SuccessBanner } from "@/components/SuccessBanner";
import { config } from "@/lib/config";
import { sepoliaPaymentAbi, creditLineAbi } from "@/lib/abi";
import { encodePaymentProof, formatEth } from "@/lib/format";
import {
  buildAttestcoinProofPair,
  type AttestcoinPhase,
  type AttestcoinProofMeta,
} from "@/lib/usc";
import { creditcoinTestnet } from "@/lib/wagmi";
import { friendlyError } from "@/lib/errors";
import { journalActivity } from "@/hooks/usePaymentActivity";
import { useChainTxConfirmation } from "@/hooks/useChainTxConfirmation";

function readAttestedBalance(logs: Log[], payment: `0x${string}`): bigint | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== payment.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: sepoliaPaymentAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "BalanceAttested") {
        return decoded.args.ethBalance as bigint;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

export default function PayPage() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const [amount, setAmount] = useState("0.01");
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [txHash, setTxHash] = useState<Hex | undefined>();
  const [balanceTxHash, setBalanceTxHash] = useState<Hex | undefined>();
  const [attestedBalanceWei, setAttestedBalanceWei] = useState<bigint | null>(null);
  const [creditTx, setCreditTx] = useState<Hex | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [attestPhase, setAttestPhase] = useState<AttestcoinPhase | "submitting" | "done" | null>(
    null,
  );
  const [attestMeta, setAttestMeta] = useState<Partial<AttestcoinProofMeta> | null>(null);
  const [verifyStartedAt, setVerifyStartedAt] = useState<number | null>(null);
  const autoVerifyStarted = useRef(false);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: isSigning } = useWriteContract();
  const sepoliaTx = useChainTxConfirmation(sepolia.id);

  async function onPay() {
    setError(null);
    autoVerifyStarted.current = false;
    setAttestPhase(null);
    setAttestMeta(null);
    setCreditTx(undefined);
    setBalanceTxHash(undefined);
    setAttestedBalanceWei(null);
    sepoliaTx.reset();
    if (!address) {
      setError("Connect a wallet first.");
      return;
    }
    if (config.paymentAddress.endsWith("0000")) {
      setError("Payment contract not configured yet.");
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
      sepoliaTx.track(hash);
      setStep(2);
      journalActivity(address, {
        id: `${hash}-dep`,
        type: "Deposit paid",
        amount: `${amount || "0.01"} ETH`,
        status: "Confirmed",
        at: "Sepolia",
        kind: "deposit",
        href: `${config.explorerSepolia}/tx/${hash}`,
      });
    } catch (e) {
      setError(friendlyError(e));
      setStep(0);
    }
  }

  async function attestSepoliaBalance(): Promise<{ hash: Hex; balanceWei: bigint }> {
    if (!address || !publicClient) throw new Error("Wallet / RPC not ready.");
    if (chainId !== sepolia.id) {
      await switchChainAsync({ chainId: sepolia.id });
    }
    const ref = keccak256(toBytes(`spark-bal-${address}-${Date.now()}`));
    const hash = await writeContractAsync({
      address: config.paymentAddress,
      abi: sepoliaPaymentAbi,
      functionName: "attestBalance",
      args: [ref],
      chainId: sepolia.id,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const balanceWei = readAttestedBalance(receipt.logs, config.paymentAddress);
    if (balanceWei == null) {
      throw new Error("BalanceAttested event missing from receipt.");
    }
    journalActivity(address, {
      id: `${hash}-bal`,
      type: "Balance attested",
      amount: `${formatEth(balanceWei)} ETH`,
      status: "Confirmed",
      at: "Sepolia",
      kind: "attest",
      href: `${config.explorerSepolia}/tx/${hash}`,
    });
    return { hash, balanceWei };
  }

  async function onProveAndOpen() {
    setError(null);
    setStatusNote(null);
    setCreditTx(undefined);
    if (!address || !txHash) return;
    if (config.creditLineAddress.endsWith("0000")) {
      setError("CreditLine not configured yet.");
      return;
    }
    try {
      setStep(3);
      setVerifyStartedAt(Date.now());
      const amountWei = parseEther(amount || "0.01");

      setStatusNote("Recording Sepolia ETH balance on-chain…");
      const { hash: balHash, balanceWei } = balanceTxHash && attestedBalanceWei != null
        ? { hash: balanceTxHash, balanceWei: attestedBalanceWei }
        : await attestSepoliaBalance();
      setBalanceTxHash(balHash);
      setAttestedBalanceWei(balanceWei);

      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }

      let depositProof: Hex;
      let balanceProof: Hex;

      if (config.attestcoin) {
        setAttestPhase("finding_tx");
        setAttestMeta(null);
        setStatusNote("Attestcoin proofs — waiting for Sepolia attestation (both in parallel)…");
        const pair = await buildAttestcoinProofPair(txHash, balHash, ({ phase, meta, parallel }) => {
          setAttestPhase(phase);
          if (meta) setAttestMeta((prev) => ({ ...prev, ...meta }));
          if (phase === "waiting_attestation") {
            setStatusNote(
              parallel
                ? "Attestcoin attestation for deposit + balance (~8–10 min once, parallel)…"
                : "Attestcoin attestation (~8–10 min)…",
            );
          }
          if (phase === "building_proof") {
            setStatusNote("Building USC proofs…");
          }
        });
        depositProof = pair.deposit.proof;
        balanceProof = pair.balance.proof;
        setAttestMeta(pair.balance.meta);
        setAttestPhase("submitting");
        setStatusNote("Both proofs ready. Opening credit on Creditcoin…");
      } else {
        depositProof = encodePaymentProof({
          txHash,
          payer: address,
          amountWei,
          kind: 1,
        });
        balanceProof = encodePaymentProof({
          txHash: balHash,
          payer: address,
          amountWei: balanceWei,
          kind: 3,
        });
      }

      const openHash = await writeContractAsync({
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
          depositProof,
          {
            txHash: balHash,
            payer: address,
            amount: balanceWei,
            kind: 3,
          },
          balanceProof,
        ],
        chainId: creditcoinTestnet.id,
      });
      setCreditTx(openHash);
      journalActivity(address, {
        id: `${openHash}-open`,
        type: "Credit opened",
        amount: `${formatEth(amountWei)} ETH`,
        status: "Completed",
        at: "Creditcoin",
        kind: "credit",
        href: `${config.explorerCreditcoin}/tx/${openHash}`,
      });
      setStatusNote(null);
      if (config.attestcoin) setAttestPhase("done");
      setStep(4);
      setVerifyStartedAt(null);
    } catch (e) {
      setError(friendlyError(e));
      setStatusNote(null);
      setAttestPhase(null);
      setVerifyStartedAt(null);
      setStep(2);
      autoVerifyStarted.current = false;
    }
  }

  useEffect(() => {
    if (!sepoliaTx.confirmed || step !== 2 || autoVerifyStarted.current || !txHash) return;
    autoVerifyStarted.current = true;
    void onProveAndOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sepoliaTx.confirmed, step, txHash]);

  const awaitingWallet = isSigning && !sepoliaTx.hash;
  const sepoliaConfirming = Boolean(sepoliaTx.hash && !sepoliaTx.confirmed && step >= 1 && step < 3);
  const verifying = step === 3 || (sepoliaTx.confirmed && step === 2 && autoVerifyStarted.current);
  const stage: 0 | 1 | 2 | 3 | 4 =
    step === 4 ? 4 : verifying ? 3 : sepoliaTx.confirmed ? 2 : sepoliaTx.hash ? 2 : step;

  return (
    <AppShell
      title="Pay deposit"
      subtitle="Prove deposit + Sepolia balance via Attestcoin, then unlock credit on Creditcoin."
    >
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-panel/80 p-7 shadow-soft">
        {!isConnected && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">Connect a wallet to pay</p>
            <p className="mt-1 text-[13px] text-muted">
              You’ll pay on Sepolia, attest your ETH balance, then unlock credit on Creditcoin.
            </p>
            <div className="mt-4">
              <ConnectButton />
            </div>
          </div>
        )}

        {sepoliaTx.confirmed && step >= 2 && step < 4 && txHash && (
          <div className="mb-6">
            <SuccessBanner
              title="Deposit confirmed on Sepolia"
              description={`${amount || "0.01"} ETH received. Attestcoin proofs are building — this usually takes 8–10 minutes.`}
              href={`${config.explorerSepolia}/tx/${txHash}`}
              hrefLabel="View Sepolia payment"
            />
          </div>
        )}

        {step === 4 && (
          <div className="mb-6">
            <SuccessBanner
              title="Credit line opened"
              description={`Deposit verified and credit unlocked on Creditcoin${attestedBalanceWei != null ? ` with ${formatEth(attestedBalanceWei)} ETH attested balance` : ""}.`}
              href={creditTx ? `${config.explorerCreditcoin}/tx/${creditTx}` : undefined}
              hrefLabel="View Creditcoin tx"
              actions={
                <>
                  <Link
                    href="/withdraw"
                    className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white"
                  >
                    Withdraw credit
                  </Link>
                  <Link
                    href="/overview"
                    className="rounded-full border border-border px-4 py-2 text-[13px] font-medium"
                  >
                    View overview
                  </Link>
                </>
              }
            />
          </div>
        )}

        {step < 4 && (
          <>
        <label className="text-[11px] font-medium uppercase tracking-label text-muted">Amount (ETH)</label>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-transparent px-4 py-3.5 text-[18px] tabular-nums outline-none transition focus:border-brand/50"
        />
        <p className="mt-2 text-[12px] text-muted">
          Credit LTV rises with attested Sepolia balance (85%/90%) and linked payment history (+2.5% /
          +5%). Debt accrues 10% APR.{" "}
          <a href="/score" className="text-brand hover:underline">
            Link history first
          </a>{" "}
          for the bonus — use a fresh deposit tx to open.
        </p>
        <p className="mt-2 text-[12px] text-muted">
          Faucet:{" "}
          <a
            className="text-text/80 underline-offset-2 hover:underline"
            href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
            target="_blank"
            rel="noreferrer"
          >
            Sepolia ETH
          </a>
          {" · "}
          <a
            className="text-text/80 underline-offset-2 hover:underline"
            href="https://discord.com/invite/creditcoin"
            target="_blank"
            rel="noreferrer"
          >
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
            disabled={!isConnected || awaitingWallet || sepoliaConfirming || verifying || step === 4}
            className="rounded-full bg-brand px-4 py-3 text-[14px] font-medium text-white transition hover:bg-accent2 disabled:opacity-50"
          >
            {awaitingWallet
              ? "Confirm in MetaMask…"
              : sepoliaConfirming
                ? "Confirming on Sepolia…"
                : verifying
                  ? "Verifying deposit + balance…"
                  : step === 4
                    ? "Credit ready"
                    : "Pay deposit"}
          </button>
          {sepoliaTx.confirmed && step >= 2 && step < 4 && !verifying && (
            <button
              type="button"
              onClick={onProveAndOpen}
              className="rounded-full border border-border px-4 py-3 text-[14px] font-medium text-text transition hover:bg-white/[0.03]"
            >
              Verify & open credit
            </button>
          )}
          {verifying && step < 4 && (
            <p className="text-center text-[12px] text-muted">
              {statusNote || "Building Attestcoin proofs for deposit and balance…"}
            </p>
          )}
        </div>
          </>
        )}

        {config.attestcoin && attestPhase && address && step < 4 && (
          <AttestcoinProofPanel
            phase={attestPhase}
            meta={attestMeta}
            dualProof
            verifyStartedAt={verifyStartedAt ?? undefined}
            paymentTx={txHash}
            creditTx={creditTx}
            claim={{
              payer: address,
              amountLabel: amount || "0.01",
              kind: "deposit",
            }}
          />
        )}

        {txHash && !attestPhase && step < 4 && (
          <p className="mt-5 break-all text-[12px] text-muted">
            Payment tx:{" "}
            <a
              className="text-text/80 hover:underline"
              href={`${config.explorerSepolia}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              {txHash}
            </a>
          </p>
        )}
        {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
      </div>
    </AppShell>
  );
}
