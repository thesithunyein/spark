"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { config } from "@/lib/config";
import {
  BLOCK_PROVER,
  type AttestcoinPhase,
  type AttestcoinProofMeta,
} from "@/lib/usc";

const PHASES: { id: AttestcoinPhase; label: string }[] = [
  { id: "finding_tx", label: "Find payment" },
  { id: "waiting_attestation", label: "Wait for attestation" },
  { id: "attested", label: "Attested on Creditcoin" },
  { id: "building_proof", label: "Build proof" },
  { id: "proof_ready", label: "Proof ready" },
];

const ORDER: AttestcoinPhase[] = PHASES.map((p) => p.id);

function shortHex(value: string, left = 6, right = 4) {
  if (value.length <= left + right + 2) return value;
  return `${value.slice(0, left + 2)}…${value.slice(-right)}`;
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

type Props = {
  phase: AttestcoinPhase | "submitting" | "done" | null;
  meta: Partial<AttestcoinProofMeta> | null;
  paymentTx?: Hex;
  creditTx?: Hex;
  dualProof?: boolean;
  verifyStartedAt?: number;
  claim?: {
    payer: string;
    amountLabel: string;
    kind: "deposit" | "repay" | "balance";
  };
};

export function AttestcoinProofPanel({
  phase,
  meta,
  paymentTx,
  creditTx,
  dualProof,
  verifyStartedAt,
  claim,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const waiting = phase === "waiting_attestation";

  useEffect(() => {
    if (!waiting && !verifyStartedAt) {
      setElapsed(0);
      return;
    }
    const started = verifyStartedAt ?? Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [waiting, verifyStartedAt, phase]);

  if (!phase) return null;

  const phaseIndex =
    phase === "submitting" || phase === "done"
      ? ORDER.length
      : Math.max(0, ORDER.indexOf(phase));

  return (
    <div className="mt-5 rounded-xl border border-border bg-white/[0.02] p-4">
      <p className="text-[11px] font-medium uppercase tracking-label text-muted">
        Verification{dualProof ? " · deposit + balance" : claim?.kind ? ` · ${claim.kind}` : ""}
      </p>

      {waiting && (
        <p className="mt-2 text-[13px] text-text/85">
          Usually 8–20 min
          <span className="text-muted"> · {formatElapsed(elapsed)}</span>
        </p>
      )}

      <ol className="mt-3 space-y-2">
        {PHASES.map((item, i) => {
          const done = phaseIndex > i || phase === "done" || phase === "submitting";
          const current = ORDER[i] === phase;
          return (
            <li key={item.id} className="flex items-start gap-2 text-[13px]">
              <span
                className={
                  done
                    ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                    : current
                      ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60"
                      : "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/15"
                }
              />
              <span className={done || current ? "text-text" : "text-muted"}>
                {item.label}
              </span>
            </li>
          );
        })}
        <li className="flex items-start gap-2 text-[13px]">
          <span
            className={
              phase === "done"
                ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                : phase === "submitting"
                  ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/60"
                  : "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/15"
            }
          />
          <span className={phase === "submitting" || phase === "done" ? "text-text" : "text-muted"}>
            {phase === "done" ? "Done on Creditcoin" : "Submit on Creditcoin"}
          </span>
        </li>
      </ol>

      {(claim || meta || paymentTx || creditTx) && (
        <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-[12px] text-muted">
          {claim && (
            <>
              <div className="flex justify-between gap-3">
                <dt>Claim</dt>
                <dd className="text-right text-text/80">{claim.kind}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Amount</dt>
                <dd className="tabular-nums text-text/80">{claim.amountLabel} ETH</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Payer</dt>
                <dd className="font-mono text-text/80">{shortHex(claim.payer)}</dd>
              </div>
            </>
          )}
          {meta?.blockNumber != null && (
            <div className="flex justify-between gap-3">
              <dt>Sepolia block</dt>
              <dd className="tabular-nums text-text/80">{meta.blockNumber}</dd>
            </div>
          )}
          {meta?.headerNumber != null && (
            <div className="flex justify-between gap-3">
              <dt>Attested header</dt>
              <dd className="tabular-nums text-text/80">{meta.headerNumber}</dd>
            </div>
          )}
          {meta?.chainKey != null && (
            <div className="flex justify-between gap-3">
              <dt>Chain key</dt>
              <dd className="tabular-nums text-text/80">{meta.chainKey}</dd>
            </div>
          )}
          {meta?.root && (
            <div className="flex justify-between gap-3">
              <dt>Merkle root</dt>
              <dd className="font-mono text-text/80">{shortHex(meta.root)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt>BlockProver</dt>
            <dd className="font-mono text-text/80">{shortHex(BLOCK_PROVER)}</dd>
          </div>
          {paymentTx && (
            <div className="pt-1">
              <a
                className="text-text/80 underline-offset-2 hover:underline"
                href={`${config.explorerSepolia}/tx/${paymentTx}`}
                target="_blank"
                rel="noreferrer"
              >
                Sepolia tx
              </a>
            </div>
          )}
          {creditTx && (
            <div>
              <a
                className="text-text/80 underline-offset-2 hover:underline"
                href={`${config.explorerCreditcoin}/tx/${creditTx}`}
                target="_blank"
                rel="noreferrer"
              >
                Creditcoin tx
              </a>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
