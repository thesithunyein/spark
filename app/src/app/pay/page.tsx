"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
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
import { config } from "@/lib/config";
import { sepoliaPaymentAbi, creditLineAbi } from "@/lib/abi";
import { encodePaymentProof, formatEth } from "@/lib/format";
import {
  buildAttestcoinProof,
  type AttestcoinPhase,
  type AttestcoinProofMeta,
} from "@/lib/usc";
import { creditcoinTestnet } from "@/lib/wagmi";
import { friendlyError } from "@/lib/errors";
import { journalActivity } from "@/hooks/usePaymentActivity";

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
  const [proofLabel, setProofLabel] = useState("deposit");
  const [attestPhase, setAttestPhase] = useState<AttestcoinPhase | "submitting" | "done" | null>(
    null,
  );
  const [attestMeta, setAttestMeta] = useState<Partial<AttestcoinProofMeta> | null>(null);
  const autoVerifyStarted = useRef(false);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isLoading: waiting, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  async function onPay() {
    setError(null);
    autoVerifyStarted.current = false;
    setAttestPhase(null);
    setAttestMeta(null);
    setCreditTx(undefined);
    setBalanceTxHash(undefined);
    setAttestedBalanceWei(null);
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
      kind: "deposit",
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
      const amountWei = parseEther(amount || "0.01");

      setStatusNote("Attesting Sepolia ETH balance (second Attestcoin data type)…");
      setProofLabel("balance");
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
        setProofLabel("deposit");
        setAttestPhase("finding_tx");
        setAttestMeta(null);
        setStatusNote("Attestcoin proof 1/2 — deposit payment…");
        const depBuilt = await buildAttestcoinProof(txHash, (phase, meta) => {
          setAttestPhase(phase);
          if (meta) setAttestMeta((prev) => ({ ...prev, ...meta }));
        });
        depositProof = depBuilt.proof;

        setProofLabel("balance");
        setAttestPhase("finding_tx");
        setStatusNote("Attestcoin proof 2/2 — Sepolia ETH balance…");
        const balBuilt = await buildAttestcoinProof(balHash, (phase, meta) => {
          setAttestPhase(phase);
          if (meta) setAttestMeta((prev) => ({ ...prev, ...meta }));
        });
        balanceProof = balBuilt.proof;
        setAttestMeta(balBuilt.meta);
        setAttestPhase("submitting");
        setStatusNote("Both USC proofs ready. Opening credit on Creditcoin…");
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
        kind: "deposit",
        href: `${config.explorerCreditcoin}/tx/${openHash}`,
      });
      setStatusNote(null);
      if (config.attestcoin) setAttestPhase("done");
      setStep(4);
    } catch (e) {
      setError(friendlyError(e));
      setStatusNote(null);
      setAttestPhase(null);
      setStep(2);
      autoVerifyStarted.current = false;
    }
  }

  useEffect(() => {
    if (!isSuccess || step !== 2 || autoVerifyStarted.current || !txHash) return;
    autoVerifyStarted.current = true;
    void onProveAndOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, step, txHash]);

  const stage = isSuccess && step === 2 ? 2 : step;
  const verifying = step === 3 || (isSuccess && step === 2 && autoVerifyStarted.current);

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
            disabled={!isConnected || isPending || waiting || verifying || step === 4}
            className="rounded-full bg-brand px-4 py-3 text-[14px] font-medium text-white transition hover:bg-accent2 disabled:opacity-50"
          >
            {isPending || waiting
              ? "Confirm in wallet…"
              : verifying
                ? "Verifying deposit + balance…"
                : step === 4
                  ? "Credit ready"
                  : "Pay deposit"}
          </button>
          {isSuccess && step >= 2 && step < 4 && !verifying && (
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

        {config.attestcoin && attestPhase && address && (
          <AttestcoinProofPanel
            phase={attestPhase}
            meta={attestMeta}
            paymentTx={proofLabel === "balance" ? balanceTxHash : txHash}
            creditTx={creditTx}
            claim={{
              payer: address,
              amountLabel:
                proofLabel === "balance" && attestedBalanceWei != null
                  ? formatEth(attestedBalanceWei)
                  : amount || "0.01",
              kind: proofLabel === "balance" ? "balance" : "deposit",
            }}
          />
        )}

        {txHash && !attestPhase && (
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
        {step === 4 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-[15px] font-medium text-text">Credit ready</p>
            <p className="mt-1 text-[13px] text-muted">
              Opened with attested deposit
              {attestedBalanceWei != null ? ` + ${formatEth(attestedBalanceWei)} ETH balance` : ""}.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/withdraw" className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white">
                Withdraw credit
              </Link>
              <Link href="/overview" className="rounded-full border border-border px-4 py-2 text-[13px] font-medium">
                View credit
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
