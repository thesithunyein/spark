"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useWriteContract,
  useSwitchChain,
  useReadContract,
  usePublicClient,
} from "wagmi";
import { parseEther, type Hex, keccak256, toBytes, formatEther, parseAbiItem, decodeEventLog } from "viem";
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
import { ensureCreditcoinChain, ensureSepoliaChain } from "@/lib/chains";
import { creditcoinTestnet } from "@/lib/wagmi";
import { friendlyError } from "@/lib/errors";
import {
  getPendingSepoliaRepay,
  journalActivity,
} from "@/hooks/usePaymentActivity";
import { useChainTxConfirmation } from "@/hooks/useChainTxConfirmation";
import { clearRepayFlow, loadRepayFlow, saveRepayFlow } from "@/lib/flowState";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const repaymentPaidEvent = parseAbiItem(
  "event RepaymentPaid(address indexed payer, uint256 amount, bytes32 indexed ref)",
);

function formatDebtLabel(wei: bigint) {
  if (wei === 0n) return "0";
  const n = Number(wei) / 1e18;
  if (n > 0 && n < 0.0001) return n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  return formatEth(wei);
}

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
  const [verifyStartedAt, setVerifyStartedAt] = useState<number | null>(null);
  const [proving, setProving] = useState(false);
  const autoVerifyStarted = useRef(false);
  const autoAttemptHash = useRef<string | null>(null);
  const provingRef = useRef(false);
  const lastAttestPhaseRef = useRef<AttestcoinPhase | "submitting" | null>(null);
  const resumeChecked = useRef(false);
  const amountWeiRef = useRef<bigint>(0n);
  const creditLineRef = useRef<`0x${string}`>(config.creditLineAddress);
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: isSigning } = useWriteContract();
  const sepoliaTx = useChainTxConfirmation(sepolia.id);
  const creditClient = usePublicClient({ chainId: creditcoinTestnet.id });
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });

  const hasLegacy =
    config.legacyCreditLineAddress !== ZERO &&
    config.legacyCreditLineAddress !== config.creditLineAddress;

  const { data: position, refetch: refetchPosition } = useReadContract({
    address: config.creditLineAddress,
    abi: creditLineAbi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled:
        Boolean(address) &&
        config.creditLineAddress !== ZERO,
    },
  });

  const { data: legacyPosition, refetch: refetchLegacy } = useReadContract({
    address: config.legacyCreditLineAddress,
    abi: creditLineAbi,
    functionName: "getPosition",
    args: address ? [address] : undefined,
    chainId: creditcoinTestnet.id,
    query: {
      enabled: Boolean(address) && hasLegacy,
    },
  });

  const status = position ? Number(position.status) : 0;
  const legacyStatus = legacyPosition ? Number(legacyPosition.status) : 0;
  const hasActiveLine = status === 1;
  const legacyActive = legacyStatus === 1;
  const effectiveActive = hasActiveLine || legacyActive;
  const debt = position?.debt ?? 0n;
  const legacyDebt = legacyPosition?.debt ?? 0n;
  const effectiveDebt = hasActiveLine ? debt : legacyDebt;
  const isLegacyClose = legacyActive && !hasActiveLine;

  creditLineRef.current = hasActiveLine
    ? config.creditLineAddress
    : legacyActive
      ? config.legacyCreditLineAddress
      : config.creditLineAddress;

  useEffect(() => {
    if (effectiveDebt > 0n && !amount) {
      // Overpay tiny dust so interest accrual can't leave the line Active.
      const floor = parseEther("0.001");
      const pay = effectiveDebt < floor ? floor : effectiveDebt;
      setAmount(formatEther(pay));
    }
  }, [effectiveDebt, amount]);

  useEffect(() => {
    if (!address || !creditClient || resumeChecked.current || step >= 2) return;
    if (status === 2) {
      resumeChecked.current = true;
      setStep(4);
      clearRepayFlow(address);
      return;
    }
    const saved = loadRepayFlow(address);
    const pending = saved?.txHash
      ? { txHash: saved.txHash, amountLabel: saved.amount }
      : getPendingSepoliaRepay(address);
    if (!pending) {
      resumeChecked.current = true;
      return;
    }

    resumeChecked.current = true;
    void (async () => {
      const lines: `0x${string}`[] = [];
      if (hasLegacy) lines.push(config.legacyCreditLineAddress);
      if (config.creditLineAddress !== ZERO) lines.push(config.creditLineAddress);

      for (const line of lines) {
        try {
          const used = await creditClient.readContract({
            address: line,
            abi: creditLineAbi,
            functionName: "usedTx",
            args: [pending.txHash],
          });
          if (used) {
            const pos = await creditClient.readContract({
              address: line,
              abi: creditLineAbi,
              functionName: "getPosition",
              args: [address],
            });
            if (Number(pos.status) === 2) {
              clearRepayFlow(address);
              setStep(4);
              return;
            }
            continue;
          }
          const pos = await creditClient.readContract({
            address: line,
            abi: creditLineAbi,
            functionName: "getPosition",
            args: [address],
          });
          if (Number(pos.status) !== 1) continue;
          creditLineRef.current = line;
          setAmount(pending.amountLabel);
          amountWeiRef.current = parseEther(pending.amountLabel || "0");
          sepoliaTx.track(pending.txHash);
          setStep(2);
          setStatusNote("Resumed — tap Verify. Don't pay again.");
          return;
        } catch {
          /* try next line */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, creditClient, step, hasLegacy, status]);

  useEffect(() => {
    if (!sepoliaTx.confirmed || step !== 2 || !sepoliaTx.hash) return;
    if (autoAttemptHash.current === sepoliaTx.hash) return;
    if (provingRef.current) return;
    autoAttemptHash.current = sepoliaTx.hash;
    autoVerifyStarted.current = true;
    void onProveRepay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sepoliaTx.confirmed, step, sepoliaTx.hash]);

  async function onRepayPay() {
    setError(null);
    autoVerifyStarted.current = false;
    autoAttemptHash.current = null;
    provingRef.current = false;
    setAttestPhase(null);
    setAttestMeta(null);
    lastAttestPhaseRef.current = null;
    setCreditTx(undefined);
    setVerifyStartedAt(null);
    sepoliaTx.reset();
    if (!address) return setError("Connect a wallet first.");
    if (!hasActiveLine) return setError("No active credit line to repay.");
    if (config.paymentAddress.endsWith("0000")) {
      return setError("Payment contract not configured.");
    }
    try {
      if (chainId !== sepolia.id) await ensureSepoliaChain(switchChainAsync);
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
    if (provingRef.current) return;
    provingRef.current = true;
    setProving(true);
    const creditLine = creditLineRef.current;
    try {
      if (creditClient) {
        const used = await creditClient.readContract({
          address: creditLine,
          abi: creditLineAbi,
          functionName: "usedTx",
          args: [txHash],
        });
        if (used) {
          const pos = await refetchPosition();
          if (pos.data && Number(pos.data.status) === 2) {
            clearRepayFlow(address);
            setStep(4);
            setAttestPhase("done");
            return;
          }
          setError("This Sepolia repayment was already applied on Creditcoin.");
          setStep(0);
          sepoliaTx.reset();
          clearRepayFlow(address);
          return;
        }
      }

      setStep(3);
      if (!verifyStartedAt) setVerifyStartedAt(Date.now());
      saveRepayFlow(address, { txHash, amount: amount || "0", step: 3 });

      // Repay amount from Sepolia receipt (claim must match paid tx).
      let amountWei = amountWeiRef.current || parseEther(amount || "0");
      if (sepoliaClient) {
        try {
          const receipt = await sepoliaClient.getTransactionReceipt({ hash: txHash });
          for (const log of receipt.logs) {
            const addr = log.address.toLowerCase();
            if (
              addr !== config.paymentAddress.toLowerCase() &&
              addr !== config.legacyPaymentAddress.toLowerCase()
            ) {
              continue;
            }
            try {
              const decoded = decodeEventLog({
                abi: [repaymentPaidEvent],
                data: log.data,
                topics: log.topics,
              });
              if (decoded.eventName === "RepaymentPaid" && decoded.args.amount != null) {
                amountWei = decoded.args.amount;
                amountWeiRef.current = decoded.args.amount;
                setAmount(formatEther(decoded.args.amount));
                break;
              }
            } catch {
              /* skip */
            }
          }
        } catch {
          /* keep amountWeiRef */
        }
      }
      if (amountWei === 0n) {
        throw new Error("Could not read Sepolia repayment amount. Refresh and try Verify again.");
      }

      let proof: Hex;
      if (config.attestcoin) {
        setAttestPhase("finding_tx");
        setAttestMeta(null);
        setStatusNote("Verifying… usually 8–20 min");
        const built = await buildAttestcoinProof(txHash, (phase, meta) => {
          lastAttestPhaseRef.current = phase;
          setAttestPhase(phase);
          if (meta) setAttestMeta((prev) => ({ ...prev, ...meta }));
          if (phase === "building_proof") setStatusNote("Building proof…");
          if (phase === "proof_ready") setStatusNote("Confirm in MetaMask");
        });
        proof = built.proof;
        setAttestMeta(built.meta);
        lastAttestPhaseRef.current = "submitting";
        setAttestPhase("submitting");
        setStatusNote("Confirm in MetaMask");
      } else {
        proof = encodePaymentProof({ txHash, payer: address, amountWei, kind: 2 });
      }

      await ensureCreditcoinChain(switchChainAsync);

      const repayHash = await writeContractAsync({
        address: creditLine,
        abi: creditLineAbi,
        functionName: "repayCredit",
        args: [{ txHash, payer: address, amount: amountWei, kind: 2 }, proof],
        chainId: creditcoinTestnet.id,
      });
      setCreditTx(repayHash);
      if (creditClient) {
        await creditClient.waitForTransactionReceipt({ hash: repayHash });
      }
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

      // Brief pause so RPC reflects state, then check closed vs dust left.
      await new Promise((r) => setTimeout(r, 1500));
      const posAfter = await refetchPosition();
      void refetchLegacy();
      const nextStatus = posAfter.data ? Number(posAfter.data.status) : 0;
      let nextDebt = posAfter.data?.debt ?? 0n;
      if (creditClient && address) {
        try {
          nextDebt = await creditClient.readContract({
            address: creditLine,
            abi: creditLineAbi,
            functionName: "currentDebt",
            args: [address],
          });
        } catch {
          /* use posAfter */
        }
      }
      if (nextStatus === 2 || nextDebt === 0n) {
        clearRepayFlow(address);
        setStep(4);
      } else {
        setStep(0);
        sepoliaTx.reset();
        autoVerifyStarted.current = false;
        autoAttemptHash.current = null;
        setAttestPhase(null);
        setAmount(formatEther(nextDebt < parseEther("0.001") ? parseEther("0.001") : nextDebt));
        setError(
          "Repayment applied, but tiny interest dust remains — line still Active. Pay 0.001 ETH once more and verify to fully close.",
        );
      }
      setVerifyStartedAt(null);
    } catch (e) {
      setError(friendlyError(e));
      const lastPhase = lastAttestPhaseRef.current;
      const pastAttestation =
        lastPhase === "attested" ||
        lastPhase === "building_proof" ||
        lastPhase === "proof_ready" ||
        lastPhase === "submitting";
      if (pastAttestation) {
        setStep(3);
        setAttestPhase(lastPhase === "submitting" ? "submitting" : "proof_ready");
        setStatusNote("Confirm in MetaMask or tap Retry.");
      } else {
        setStatusNote(null);
        setAttestPhase(null);
        setStep(2);
      }
      autoVerifyStarted.current = true;
    } finally {
      provingRef.current = false;
      setProving(false);
    }
  }

  function resumePendingRepay() {
    if (!address) return;
    const pending = getPendingSepoliaRepay(address);
    if (!pending) {
      setError("No pending Sepolia repayment in this browser.");
      return;
    }
    resumeChecked.current = false;
    autoAttemptHash.current = null;
    provingRef.current = false;
    setAmount(pending.amountLabel);
    amountWeiRef.current = parseEther(pending.amountLabel || "0");
    sepoliaTx.track(pending.txHash);
    setStep(2);
    setError(null);
    setVerifyStartedAt(null);
  }

  function retryVerify() {
    if (provingRef.current) return;
    setError(null);
    setStep(3);
    // Allow one more attempt for this same Sepolia hash.
    autoAttemptHash.current = null;
    autoVerifyStarted.current = true;
    void onProveRepay();
  }

  const awaitingWallet = isSigning && !sepoliaTx.hash;
  const sepoliaConfirming = Boolean(sepoliaTx.hash && !sepoliaTx.confirmed && step >= 1 && step < 3);
  const verifying = step === 3 || proving;
  const sepoliaPaid = sepoliaTx.confirmed && step >= 2 && step < 4;
  const stage: 0 | 1 | 2 | 3 | 4 =
    step === 4 ? 4 : verifying ? 3 : sepoliaTx.confirmed ? 2 : sepoliaTx.hash ? 2 : step;
  const lineClosed = step === 4 || (!effectiveActive && (status === 2 || legacyStatus === 2));
  const pendingJournal = address ? getPendingSepoliaRepay(address) : null;

  return (
    <AppShell title="Repay" subtitle="Pay on Sepolia, verify, clear debt on Creditcoin.">
      <div className="mx-auto max-w-md border border-border bg-panel/80 p-7 shadow-soft">
        {!isConnected && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">Connect a wallet to repay</p>
            <div className="mt-4">
              <ConnectButton />
            </div>
          </div>
        )}

        {isConnected && lineClosed && step !== 4 && (
          <div className="mb-6 border border-success/30 bg-success/10 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-success/20 text-success">
                <Check className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[15px] font-medium text-text">Credit line closed</p>
                <p className="mt-1 text-[13px] text-muted">Repayment verified on Creditcoin.</p>
                <Link href="/overview" className="mt-3 inline-flex text-[13px] font-medium text-white hover:underline">
                  Back to overview
                </Link>
              </div>
            </div>
          </div>
        )}

        {isConnected && !effectiveActive && !lineClosed && pendingJournal && (
          <div className="mb-6 border border-white/30 bg-white/10 p-4">
            <p className="text-[15px] font-medium text-text">Sepolia repayment ready to verify</p>
            <p className="mt-1 text-[13px] text-muted">
              You paid on Sepolia ({pendingJournal.txHash.slice(0, 10)}…). Finish with{" "}
              <code className="text-[12px]">repayCredit</code> on Creditcoin (~8–10 min attestation).
            </p>
            <button
              type="button"
              onClick={resumePendingRepay}
              className="btn-shine mt-4 px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.18em] text-white"
            >
              Finish close on Creditcoin
            </button>
          </div>
        )}

        {isConnected && isLegacyClose && step < 4 && (
          <div className="mb-6 border border-border bg-white/[0.02] p-4">
            <p className="text-[13px] text-muted">
              Closing your previous credit line on the Aug 13 deployment. Sepolia is already paid —
              only Creditcoin verification remains.
            </p>
          </div>
        )}

        {isConnected && !effectiveActive && !lineClosed && !pendingJournal && (
          <div className="mb-6">
            <p className="text-[15px] font-medium text-text">No active credit line</p>
            <p className="mt-1 text-[13px] text-muted">Open credit with a deposit before you can repay.</p>
            <Link href="/pay" className="btn-shine mt-4 inline-flex px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white">
              Pay deposit
            </Link>
          </div>
        )}

        {sepoliaPaid && step < 4 && (
          <div className="mb-6 border border-success/30 bg-success/10 p-4">
            <p className="text-[15px] font-medium text-text">Sepolia repayment confirmed</p>
            <p className="mt-1 text-[13px] text-muted">
              {verifying ? "Verifying on Creditcoin…" : "Ready to verify on Creditcoin."}
            </p>
            {sepoliaTx.hash && (
              <a
                className="mt-2 inline-block break-all text-[12px] text-white hover:underline"
                href={`${config.explorerSepolia}/tx/${sepoliaTx.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View Sepolia tx
              </a>
            )}
          </div>
        )}

        {effectiveActive && step < 4 && (
          <p className="mb-5 text-[13px] text-muted">
            Outstanding debt:{" "}
            <span className="tabular-nums text-text">{formatDebtLabel(effectiveDebt)} sCREDIT</span>
          </p>
        )}

        {hasActiveLine && !isLegacyClose && step < 2 && (
          <>
            <label className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">
              Repay amount (ETH)
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-2 w-full border border-border bg-transparent px-4 py-3.5 text-[18px] tabular-nums outline-none transition focus:border-white/50"
            />
            {effectiveDebt > 0n && effectiveDebt < parseEther("0.001") && (
              <p className="mt-2 text-[12px] text-muted">
                Dust debt left after the last repay. Use <span className="tabular-nums text-text">0.001 ETH</span>{" "}
                (overpay is fine) so interest can&apos;t leave the line open.
              </p>
            )}
            <div className="mt-8 flex flex-col gap-2">
              <button
                type="button"
                onClick={onRepayPay}
                disabled={awaitingWallet || sepoliaConfirming || verifying}
                className="btn-shine px-4 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-white disabled:opacity-50"
              >
                {awaitingWallet
                  ? "Confirm in MetaMask…"
                  : sepoliaConfirming
                    ? "Confirming on Sepolia…"
                    : "Make repayment"}
              </button>
            </div>
          </>
        )}

        {effectiveActive && (step >= 2 || isLegacyClose) && step < 4 && (
          <>
            <div className={hasActiveLine && !isLegacyClose && step < 2 ? "mt-8" : ""}>
              <ConfirmingStages step={stage} />
            </div>
            <div className="mt-8 flex flex-col gap-2">
              {sepoliaTx.confirmed && step >= 2 && step < 4 && (
                <button
                  type="button"
                  onClick={() => void onProveRepay()}
                  disabled={proving || verifying}
                  className="btn-shine px-4 py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-white disabled:opacity-50"
                >
                  {verifying
                    ? attestPhase === "submitting"
                      ? "Confirm in MetaMask…"
                      : "Verifying…"
                    : "Verify & close"}
                </button>
              )}
              {sepoliaTx.confirmed && step >= 2 && step < 4 && (
                <button
                  type="button"
                  onClick={retryVerify}
                  disabled={proving}
                  className=" border border-border px-4 py-3 text-[14px] font-medium transition hover:bg-white/[0.03] disabled:opacity-50"
                >
                  Retry verify
                </button>
              )}
              {statusNote && (
                <p className="text-center text-[12px] text-muted">{statusNote}</p>
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
            verifyStartedAt={verifyStartedAt ?? undefined}
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
              className="text-white hover:underline"
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
              <Link href="/overview" className="btn-shine px-4 py-2 font-mono text-[12px] uppercase tracking-[0.16em] text-white">
                Back to overview
              </Link>
              <Link href="/score" className=" border border-border px-4 py-2 text-[13px] font-medium">
                Build credit score
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
