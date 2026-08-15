"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { config } from "@/lib/config";
import {
  BLOCK_PROVER,
  type AttestcoinPhase,
  type AttestcoinProofMeta,
} from "@/lib/usc";

const STAGES = [
  { id: "request", label: "Request" },
  { id: "attest", label: "Attest" },
  { id: "unlock", label: "Unlock" },
];

const STAGE_OF: Record<string, number> = {
  finding_tx: 0,
  waiting_attestation: 1,
  attested: 2,
  building_proof: 2,
  proof_ready: 2,
  submitting: 2,
  done: 2,
};

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
  const statusLine: Record<string, string> = {
    finding_tx: "locating payment on Sepolia",
    waiting_attestation: "waiting for Attestcoin to attest the block",
    attested: "block attested on Creditcoin",
    building_proof: "building BlockProver proof",
    proof_ready: "proof ready",
    submitting: "submitting on Creditcoin",
    done: "credit opened on Creditcoin",
  };

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

  const stageIdx = phase === "done" ? 3 : STAGE_OF[phase] ?? 0;
  const stageSub: string[] = [
    stageIdx > 0 || phase === "done" ? "Payment found" : "Locating payment",
    stageIdx > 1 || phase === "done"
      ? "Block attested"
      : waiting
        ? "Waiting for Attestcoin"
        : "Queued",
    phase === "done"
      ? "Credit opened"
      : stageIdx === 2
        ? "Submitting to Creditcoin"
        : "Queued",
  ];

  return (
    <div className="mt-5 border border-border bg-white/[0.02] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">
          Verification{dualProof ? " · deposit + balance" : claim?.kind ? ` · ${claim.kind}` : ""}
        </p>
        {waiting && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#3DDC97]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping bg-[#3DDC97] opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 bg-[#3DDC97]" />
            </span>
            Live · attestation running
          </span>
        )}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12px] text-white/85">
        <span className="text-white/40">$</span>
        <span>
          {statusLine[phase] ?? "processing"}
          <span className="ml-0.5 inline-block w-[7px] animate-pulse text-white/60">▍</span>
        </span>
        {waiting && (
          <span className="tabular-nums text-white/40">
            · usually 8–20 min · {formatElapsed(elapsed)}
          </span>
        )}
      </p>

      {waiting && (
        <div className="mt-3 h-px w-full animate-pulse overflow-hidden bg-white/20" aria-hidden />
      )}

      <div className="mt-4 grid grid-cols-3 gap-px border border-white/[0.12] bg-white/[0.12]">
        {STAGES.map((st, i) => {
          const done = stageIdx > i;
          const active = stageIdx === i && phase !== "done";
          return (
            <div key={st.id} className={active ? "bg-white/[0.04]" : "bg-black"}>
              <div className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <span
                    className={
                      done || active
                        ? "font-mono text-[10px] tabular-nums text-white/70"
                        : "font-mono text-[10px] tabular-nums text-white/25"
                    }
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {done ? (
                    <span className="font-mono text-[11px] text-[#3DDC97]">✓</span>
                  ) : active ? (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping bg-white opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 bg-white" />
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-white/20">—</span>
                  )}
                </div>
                <p
                  className={
                    done || active
                      ? "mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white"
                      : "mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/30"
                  }
                >
                  {st.label}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-muted">{stageSub[i]}</p>
              </div>
            </div>
          );
        })}
      </div>

      {phase === "done" && (
        <div className="mt-4 flex items-center gap-2 border border-[#3DDC97]/40 bg-[#3DDC97]/[0.06] px-3 py-2.5">
          <span className="font-mono text-[12px] text-[#3DDC97]">✓</span>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#3DDC97]">
            Credit opened on Creditcoin
          </p>
        </div>
      )}

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
