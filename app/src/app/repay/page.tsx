"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useWriteContract,
  useSwitchChain,
  useReadContract,
} from "wagmi";
import { parseEther, type Hex, keccak256, toBytes, formatEther } from "viem";
import { sepolia } from "wagmi/chains";
import { Check } from "lucide-react";
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
import { useChainTxConfirmation } from "@/hooks/useChainTxConfirmation";

export default function RepayPage() {
  const { address, chainId, isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [creditTx, setCreditTx] = useState<Hex | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [attestPhase, setAttestPhase] = useState<AttestcoinPhase | "submitting" | "done" | null>(
    null,
  );
  const [attestMeta, setAttestMeta] = useState<Partial<AttestcoinProofMeta> | null>(null);
  const autoVerifyStarted = useRef(false);
  const amountWeiRef = useRef<bigint>(0n);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: isSigning } = useWriteContract();
  const sepoliaTx = useChainTxConfirmation(sepolia.id);

  const { data: position, refetch: refetchPosition } = useReadContract({
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

  useEffect(() => {
    if (debt > 0n && !amount) {
      setAmount(formatEther(debt));
    }
  }, [debt, amount]);

  useEffect(() => {
    if (!sepoliaTx.confirmed || step !== 2 || autoVerifyStarted.current || !sepoliaTx.hash) return;
    autoVerifyStarted.current = true;
    void onProveRepay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sepoliaTx.confirmed, step, sepoliaTx.hash]);

  async function onRepayPay() {
    setError(null);
    autoVerifyStarted.current = false;
    setAttestPhase(null);
    setAttestMeta(null);
    setCreditTx(undefined);
    sepoliaTx.reset();
    if (!address) return setError("Connect a wallet first.");
    if (!hasActiveLine) return setError("No active credit line to repay.");
    if (config.paymentAddress.endsWith("0000")) {
      return setError("Payment contract not configured.");
    }
    try {
      if (chainId !== sepolia.id) await switchChainAsync({ chainId: sepolia.id });
      const value = parseEther(amount || "0");
      if (value === 0n) return setError("Enter an amount greater than 0.");
      amountWeiRef.current = value;
      setStep(1);
      const ref = keccak256(toBytes(`spark-repay-${address}-${Date.now()}`));
      const hash = await writeContractAsync({
        address: config.paymentAddress,
        abi: sepoliaPaymentAbi,
        functionName: "payRepayment",
        args: [ref],
        value,
        chainId: sepolia.id,
      });
      sepoliaTx.track(hash);
      setStep(2);
      journalActivity(address, {
        id: `${hash}-rep`,
        type: "Repayment paid",
        amount: `${formatEth(value)} ETH`,
        status: "Confirmed",
        at: "Sepolia",
        kind: "repay",
        href: `${config.explorerSepolia}/tx/${hash}`,
      });
    } catch (e) {
      setError(friendlyError(e));
      setStep(0);
      sepoliaTx.reset();
    }
  }

  async function onProveRepay() {
    setError(null);
    setStatusNote(null);
    setCreditTx(undefined);
    const txHash = sepoliaTx.hash;
    if (!address || !txHash) return;
    try {
      setStep(3);
      if (chainId !== creditcoinTestnet.id) {
        await switchChainAsync({ chainId: creditcoinTestnet.id });
      }
      const amountWei = amountWeiRef.current || parseEther(amount || "0");
      let proof: Hex;
      if (config.attestcoin) {
        setAttestPhase("finding_tx");
        setAttestMeta(null);
        setStatusNote("Waiting for Attestcoin attestation, then building USC proof…");
        const built = await buildAttestcoinProof(txHash, (phase, meta) => {
          setAttestPhase(phase);
          if (meta) setAttestMeta((prev) => ({ ...prev, ...meta }));
        });
        proof = built.proof;
        setAttestMeta(built.meta);
        setAttestPhase("submitting");
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
      setCreditTx(repayHash);
      journalActivity(address, {
        id: `${repayHash}-crepay`,
        type: "Credit repaid",
        amount: `${formatEth(amountWei)} sCREDIT`,
        status: "Completed",
        at: "Creditcoin",
        kind: "repay",
        href: `${config.explorerCreditcoin}/tx/${repayHash}`,
      });
      setStatusNote(null);
      if (config.attestcoin) setAttestPhase("done");
      setStep(4);
      void refetchPosition();
    } catch (e) {
      setError(friendlyError(e));
      setStatusNote(null);
      setAttestPhase(null);
      setStep(2);
      autoVerifyStarted.current = false;
    }
  }

  const awaitingWallet = isSigning && !sepoliaTx.hash;
  const sepoliaConfirming = Boolean(sepoliaTx.hash && !sepoliaTx.confirmed && step >= 1 && step < 3);
  const verifying = step === 3;
  const sepoliaPaid = sepoliaTx.confirmed && step >= 2 && step < 4;
  const stage: 0 | 1 | 2 | 3 | 4 =
    step === 4 ? 4 : verifying ? 3 : sepoliaTx.confirmed ? 2 : sepoliaTx.hash ? 2 : step;

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

        {isConnected && !hasActiveLine && status === 2 && (
          <div className="mb-6 rounded-xl border border-success/30 bg-success/10 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
                <Check className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[15px] font-medium text-text">Credit line closed</p>
                <p className="mt-1 text-[13px] text-muted">Repayment verified on Creditcoin.</p>
                <Link href="/overview" className="mt-3 inline-flex text-[13px] font-medium text-brand hover:underline">
                  Back to overview
                </Link>
              </div>
            </div>
          </div>
        )}

        {isConnected && !hasActiveLine && status !== 2 && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">No active credit line</p>
            <p className="mt-1 text-[13px] text-muted">Open credit with a deposit before you can repay.</p>
            <Link href="/pay" className="mt-4 inline-flex rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white">
              Pay deposit
            </Link>
          </div>
        )}

        {sepoliaPaid && step < 4 && (
          <div className="mb-6 rounded-xl border border-success/30 bg-success/10 p-4">
            <p className="text-[15px] font-medium text-text">Sepolia repayment confirmed</p>
            <p className="mt-1 text-[13px] text-muted">
              {verifying
                ? "Building Attestcoin proof and updating Creditcoin…"
                : "Starting verification on Creditcoin…"}
            </p>
            {sepoliaTx.hash && (
              <a
                className="mt-2 inline-block break-all text-[12px] text-brand hover:underline"
                href={`${config.explorerSepolia}/tx/${sepoliaTx.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View Sepolia tx
              </a>
            )}
          </div>
        )}

        {hasActiveLine && (
          <p className="mb-5 text-[13px] text-muted">
            Outstanding debt: <span className="tabular-nums text-text">{formatEth(debt)} sCREDIT</span>
          </p>
        )}

        {hasActiveLine && (
          <>
            <label className="text-[11px] font-medium uppercase tracking-label text-muted">
              Repay amount (ETH)
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={step === 3 || step === 4}
              className="mt-2 w-full rounded-xl border border-border bg-transparent px-4 py-3.5 text-[18px] tabular-nums outline-none transition focus:border-brand/50 disabled:opacity-50"
            />
            <div className="mt-8">
              <ConfirmingStages step={stage} />
            </div>
            <div className="mt-8 flex flex-col gap-2">
              <button
                type="button"
                onClick={onRepayPay}
                disabled={awaitingWallet || sepoliaConfirming || verifying || step === 4}
                className="rounded-full bg-brand px-4 py-3 text-[14px] font-medium text-white transition hover:bg-accent2 disabled:opacity-50"
              >
                {awaitingWallet
                  ? "Confirm in MetaMask…"
                  : sepoliaConfirming
                    ? "Confirming on Sepolia…"
                    : verifying
                      ? "Verifying on Creditcoin…"
                      : step === 4
                        ? "Repayment complete"
                        : "Make repayment"}
              </button>
              {sepoliaTx.confirmed && step === 2 && !verifying && (
                <button
                  type="button"
                  onClick={() => {
                    autoVerifyStarted.current = true;
                    void onProveRepay();
                  }}
                  className="rounded-full border border-border px-4 py-3 text-[14px] font-medium transition hover:bg-white/[0.03]"
                >
                  Verify repayment & update credit
                </button>
              )}
              {verifying && step < 4 && !config.attestcoin && (
                <p className="text-center text-[12px] text-muted">
                  {statusNote || "Payment confirmed. Updating credit on Creditcoin…"}
                </p>
              )}
            </div>
          </>
        )}

        {config.attestcoin && attestPhase && address && (
          <AttestcoinProofPanel
            phase={attestPhase}
            meta={attestMeta}
            paymentTx={sepoliaTx.hash}
            creditTx={creditTx}
            claim={{
              payer: address,
              amountLabel: amount || "0",
              kind: "repay",
            }}
          />
        )}

        {sepoliaTx.hash && !sepoliaTx.confirmed && step < 4 && (
          <p className="mt-5 break-all text-[12px] text-muted">
            <a
              className="text-brand hover:underline"
              href={`${config.explorerSepolia}/tx/${sepoliaTx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {sepoliaTx.hash}
            </a>
          </p>
        )}
        {error && <p className="mt-3 text-[13px] text-red-400">{error}</p>}
        {step === 4 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-[15px] font-medium text-text">Loan closed</p>
            <p className="mt-1 text-[13px] text-muted">Debt cleared on Creditcoin.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/overview" className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white">
                Back to overview
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
