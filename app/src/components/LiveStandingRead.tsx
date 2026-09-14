"use client";

import { useEffect, useState } from "react";
import { createPublicClient, formatUnits, http, type Address } from "viem";
import { config } from "@/lib/config";
import { CHECKOUT_ABI, PORTABILITY, STANDING_ABI } from "@/lib/gen2";

/**
 * Live reads of portable standing, demonstrated end to end on Creditcoin CC3 testnet.
 *
 * ── What this panel is for ──────────────────────────────────────────────────
 * The claim is narrow and checkable: a verified record produced by one product was read by
 * a DIFFERENT product, which applied its OWN policy and froze its decision alongside the
 * proof it relied on. Every number below is read from the chain in this browser, and the
 * evidence reference is linked to Blockscout so the underlying Attestcoin proof can be
 * inspected rather than believed.
 *
 * ── Why the snapshot comparison is the point ────────────────────────────────
 * A merchant that must be able to show a counterparty what it relied on needs the decision
 * to be frozen. So this panel compares the order's recorded evidence reference against the
 * registry's, rather than printing the deferred amount and calling it done. If a later
 * refresh moved the record, the two would differ, and the panel would show that.
 *
 * ── What it deliberately does not do ────────────────────────────────────────
 * It does not fill in, cache, or smooth anything. A failed read says so and shows the
 * error, because a page that quietly renders stale numbers is worse than one that admits
 * it could not reach the chain.
 *
 * Styled to match the landing page dark UI/UX.
 */

const CC3 = {
  id: 102031,
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] } },
} as const;

const RPC = config.creditcoinRpc || CC3.rpcUrls.default.http[0];
const EXPLORER = "https://creditcoin-testnet.blockscout.com";

type Read = {
  block: bigint;
  recordCount: number;
  anchoredTo: string;
  score: number;
  payments: number;
  volumeWei: bigint;
  attestedBalanceWei: bigint;
  evidenceRef: string;
  issuedAt: number;
  ageSeconds: number;
  // The merchant's policy, as it exists on chain.
  minScore: number;
  minPayments: number;
  maxAgeSeconds: number;
  termSeconds: number;
  maxDeferredWei: bigint;
  advanceBps: number;
  // The order.
  itemPriceWei: bigint;
  sold: boolean;
  deferredWei: bigint;
  dueAt: number;
  orderEvidenceRef: string;
  scoreAtDecision: number;
  paymentsAtDecision: number;
  closed: boolean;
  overdue: boolean;
  outstandingWei: bigint;
  canDeferNow: boolean;
  canDeferLimitWei: bigint;
};

function short(a: string) {
  return `${a.slice(0, 10)}...${a.slice(-6)}`;
}

function eth(v: bigint, maxFrac = 6) {
  return Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

function when(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className={`mt-2 text-[22px] font-extralight leading-none ${tone ?? "text-white"}`}>{value}</p>
      {sub && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">{sub}</p>
      )}
    </div>
  );
}

export default function LiveStandingRead() {
  const [data, setData] = useState<Read | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const client = createPublicClient({ chain: CC3, transport: http(RPC) });
        const registry = PORTABILITY.registry as Address;
        const checkout = PORTABILITY.checkout as Address;
        const account = PORTABILITY.account as Address;
        const p = PORTABILITY.policy;

        const [
          block,
          recordCount,
          anchoredTo,
          standing,
          age,
          policy,
          item,
          order,
          outstanding,
          overdue,
          deferNow,
        ] = await Promise.all([
          client.getBlockNumber(),
          client.readContract({ address: registry, abi: STANDING_ABI, functionName: "recordCount" }),
          client.readContract({ address: registry, abi: STANDING_ABI, functionName: "creditLine" }),
          client.readContract({
            address: registry,
            abi: STANDING_ABI,
            functionName: "standingOf",
            args: [account],
          }),
          client.readContract({
            address: registry,
            abi: STANDING_ABI,
            functionName: "standingAge",
            args: [account],
          }),
          client.readContract({
            address: checkout,
            abi: CHECKOUT_ABI,
            functionName: "policyOf",
            args: [account],
          }),
          client.readContract({ address: checkout, abi: CHECKOUT_ABI, functionName: "itemOf", args: [1n] }),
          client.readContract({ address: checkout, abi: CHECKOUT_ABI, functionName: "orderOf", args: [1n] }),
          client.readContract({
            address: checkout,
            abi: CHECKOUT_ABI,
            functionName: "outstanding",
            args: [account, account],
          }),
          client.readContract({ address: checkout, abi: CHECKOUT_ABI, functionName: "isOverdue", args: [1n] }),
          client.readContract({
            address: checkout,
            abi: CHECKOUT_ABI,
            functionName: "canDefer",
            args: [account, account, PORTABILITY.itemPriceWei],
          }),
        ]);

        if (cancelled) return;
        setData({
          block,
          recordCount: Number(recordCount),
          anchoredTo: anchoredTo as string,
          score: Number(standing.score),
          payments: Number(standing.payments),
          volumeWei: standing.volume,
          attestedBalanceWei: standing.attestedBalance,
          evidenceRef: standing.evidenceRef,
          issuedAt: Number(standing.issuedAt),
          ageSeconds: Number(age),
          minScore: Number(policy.minScore),
          minPayments: Number(policy.minPayments),
          maxAgeSeconds: Number(policy.maxAgeSeconds),
          termSeconds: Number(policy.termSeconds),
          maxDeferredWei: policy.maxDeferred,
          advanceBps: Number(policy.advanceBps),
          itemPriceWei: item.price,
          sold: item.sold,
          deferredWei: order.deferred,
          dueAt: Number(order.dueAt),
          orderEvidenceRef: order.evidenceRef,
          scoreAtDecision: Number(order.scoreAtDecision),
          paymentsAtDecision: Number(order.paymentsAtDecision),
          closed: order.closed,
          overdue,
          outstandingWei: outstanding,
          canDeferNow: deferNow[0],
          canDeferLimitWei: deferNow[1],
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="mt-5 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
          Reading the registry and the merchant on Creditcoin CC3...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-5 py-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-300">
          Could not reach the chain from this browser
        </p>
        <p className="mt-2 font-mono text-[11px] leading-relaxed break-all text-white/60">{error}</p>
        <p className="mt-2 text-[13px] font-light leading-relaxed text-white/70">
          Both addresses are still checkable directly on Blockscout, and nothing here is cached
          or filled in, so an unreachable RPC shows as a failure rather than as a number that
          might be stale.
        </p>
      </div>
    );
  }

  const zeroRef = /^0x0+$/.test(data.evidenceRef);
  const snapshotMatches = data.orderEvidenceRef === data.evidenceRef;
  const provenVolumeEth = eth(data.volumeWei);
  const advanceCapEth = eth((data.volumeWei * BigInt(data.advanceBps)) / 10_000n);
  const ageDays = Math.floor(data.ageSeconds / 86400);

  return (
    <>
      {/* 1. The record, and where it came from. */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Standing score"
          value={String(data.score)}
          sub="from attested payments"
          tone="text-emerald-300"
        />
        <Metric label="Attested payments" value={String(data.payments)} sub="each a proven event" />
        <Metric
          label="Proven volume"
          value={`${provenVolumeEth} ETH`}
          sub="source-chain payments"
        />
        <Metric
          label="Attested balance"
          value={`${eth(data.attestedBalanceWei, 4)} ETH`}
          sub="the solvency half"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
            Evidence the record rests on
          </p>
          {zeroRef ? (
            <p className="mt-2 font-mono text-[12px] text-amber-300">
              no reference - this record cannot be consumed (the merchant refuses it)
            </p>
          ) : (
            <a
              href={`${EXPLORER}/tx/${data.evidenceRef}`}
              className="mt-2 block font-mono text-[11px] leading-relaxed break-all text-emerald-300 underline decoration-emerald-300/30 hover:decoration-emerald-300"
            >
              {short(data.evidenceRef)} ↗
            </a>
          )}
          <p className="mt-2 text-[12px] font-light leading-relaxed text-white/60">
            An actual transaction hash, not a hash of a claim. Opening it shows the Attestcoin proof
            the record was derived from.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
            Where the record came from
          </p>
          <p className="mt-2 font-mono text-[11px] text-white/80">
            CreditLine {short(data.anchoredTo)}
          </p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.1em] text-white/40">
            the live generation - the registry points at any deployment
          </p>
          <p className="mt-2 text-[12px] font-light leading-relaxed text-white/60">
            {data.recordCount} record{data.recordCount === 1 ? "" : "s"} total. Refreshing is
            permissionless: anyone can keep a record current, and nobody can forge one, because the
            data comes from a contract that only records an entry behind a proof.
          </p>
        </div>
      </div>

      {/* 2. The merchant's own policy - the part Spark does not control. */}
      <div className="mt-3 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          Merchant policy, set on chain by the merchant
        </p>
        <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <p className="font-mono text-[12px] text-white/75">
            min score <span className="text-white">{data.minScore}</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            min attested payments <span className="text-white">{data.minPayments}</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            record freshness window{" "}
            <span className="text-white">{Math.round(data.maxAgeSeconds / 86400)} days</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            term to settle <span className="text-white">{Math.round(data.termSeconds / 86400)} days</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            ceiling per buyer <span className="text-white">{eth(data.maxDeferredWei, 4)} ETH</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            advance against proven volume{" "}
            <span className="text-white">{(data.advanceBps / 100).toFixed(2)}%</span>
          </p>
        </div>
        <p className="mt-3 text-[13px] font-light leading-relaxed text-white/65">
          These are the merchant&apos;s numbers, and they are stricter than Spark&apos;s own gate of
          a single attested payment. That is the point: a third party decides, on facts it did not
          verify itself. Nothing in Spark can change this policy, and the merchant cannot change
          what the record says.
        </p>
      </div>

      {/* 3. The decision, and the proof it was made on. */}
      <div className="mt-3 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          The order, and the evidence it was decided on
        </p>
        <div className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          <p className="font-mono text-[12px] text-white/75">
            item price <span className="text-white">{eth(data.itemPriceWei, 4)} ETH</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            deferred at checkout <span className="text-white">{eth(data.deferredWei)} ETH</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            score when decided <span className="text-white">{data.scoreAtDecision}</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            payments when decided <span className="text-white">{data.paymentsAtDecision}</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            due <span className="text-white">{when(data.dueAt)}</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            settled{" "}
            <span className={data.closed ? "text-emerald-300" : "text-amber-300"}>
              {data.closed ? "yes" : "not yet"}
            </span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            outstanding now <span className="text-white">{eth(data.outstandingWei)} ETH</span>
          </p>
          <p className="font-mono text-[12px] text-white/75">
            overdue{" "}
            <span className={data.overdue ? "text-amber-300" : "text-white"}>
              {data.overdue ? "yes" : "no"}
            </span>
          </p>
        </div>

        {/* The deferred amount is the merchant's advance against the borrower's proven
            volume, so showing the arithmetic is what makes it checkable. */}
        <p className="mt-3 font-mono text-[11px] leading-relaxed text-white/55">
          {provenVolumeEth} ETH proven volume x {(data.advanceBps / 100).toFixed(2)}% ={" "}
          {advanceCapEth} ETH the merchant will advance, capped by the item price and the
          buyer&apos;s remaining ceiling. The order was deferred at {eth(data.deferredWei)} ETH.
        </p>

        <p
          className={`mt-3 font-mono text-[11px] uppercase tracking-[0.14em] ${
            snapshotMatches && !zeroRef ? "text-emerald-300" : "text-amber-300"
          }`}
        >
          {snapshotMatches && !zeroRef
            ? "snapshot matches the record - a later refresh cannot rewrite this decision"
            : "snapshot differs from the record, or carries no reference"}
        </p>
      </div>

      {/* 4. What this does not prove, said plainly rather than left for a reader to find. */}
      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300/90">
          What this demonstrates, and what it does not
        </p>
        <ul className="mt-3 space-y-2 text-[13px] font-light leading-relaxed text-white/70">
          <li>
            <span className="text-white/90">It does:</span> prove that a record produced by one
            product is readable and consumable by a different contract, under that contract&apos;s
            own policy, with the Attestcoin evidence reference carried into the decision.
          </li>
          <li>
            <span className="text-white/90">It does not:</span> prove two parties used it. Borrower
            and merchant are the same testnet account, so this shows the mechanism works, not that a
            market exists.
          </li>
          <li>
            <span className="text-white/90">It cannot:</span> move the record to another chain.
            Attestcoin writability was out of scope for this hackathon, so portability here means
            across applications on Creditcoin, which is the version that exists.
          </li>
          <li>
            <span className="text-white/90">It holds no collateral.</span> An unpaid order stays
            unpaid; lateness is reported rather than enforced. There is nothing to seize, which is
            set out in docs/UNIT_ECONOMICS.md.
          </li>
        </ul>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
        Registry {short(PORTABILITY.registry)} - merchant {short(PORTABILITY.checkout)} - read at CC3
        block {data.block.toLocaleString("en-US")} - no wallet, no sign-in
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
        Record issued {when(data.issuedAt)} - {ageDays === 0 ? "under a day" : `${ageDays} day(s)`} old
        {data.recordCount > 0 && data.canDeferNow ? " - the merchant would still defer today" : ""}
        {data.canDeferNow ? ` (up to ${eth(data.canDeferLimitWei, 4)} ETH)` : ""}
      </p>
    </>
  );
}
