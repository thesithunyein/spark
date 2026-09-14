"use client";

import { useEffect, useState } from "react";
import { createPublicClient, formatUnits, http, type Address } from "viem";
import { config } from "@/lib/config";
import { GEN1_CREDIT_LINE, GEN2, GEN2_SUBJECT, SELECTORS } from "@/lib/gen2";

/**
 * Live reads of the generation-2 position engine on Creditcoin CC3 testnet.
 *
 * ── Why this is a client component ──────────────────────────────────────────
 * A reviewer should be able to see the engine answer without connecting a wallet, and
 * a number read in the browser is checkable against Blockscout by whoever is looking.
 * A build-time constant would only ever prove that a file once said something.
 *
 * ── What it deliberately does not do ────────────────────────────────────────
 * It does not interpolate, smooth, or fill anything in. If a read fails the panel says
 * so and shows the error, because a page that quietly renders stale numbers is worse
 * than one that admits it could not reach the chain.
 *
 * Match the landing page dark UI/UX style.
 */

const CC3 = {
  id: 102031,
  name: "Creditcoin Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] } },
} as const;

const RPC = config.creditcoinRpc || CC3.rpcUrls.default.http[0];

const POSITION_SIZED_CREDIT_ABI = [
  { type: "function", name: "ltvBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxCreditUsd8", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "minNetWorthUsd8", stateMutability: "view", inputs: [], outputs: [{ type: "int256" }] },
  {
    type: "function",
    name: "limitFor",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address[]" }, { type: "address[]" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "netWorthUsd8", type: "int256" },
          { name: "limitUsd8", type: "uint256" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
] as const;

const VALUER_ABI = [
  {
    type: "function",
    name: "valuationOf",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "position", type: "int256" },
          { name: "tokenDecimals", type: "uint8" },
          { name: "price", type: "int256" },
          { name: "priceDecimals", type: "uint8" },
          { name: "valueUsd8", type: "int256" },
          { name: "positionBlock", type: "uint64" },
        ],
      },
    ],
  },
] as const;

/** Mirrors PositionSizedCredit.Status. A zero limit has five different meanings. */
const STATUS_LABELS = ["Eligible", "Unanchored", "Negative net worth", "Below floor", "Policy rejected"];

function usd(v: bigint, decimals = 8) {
  const n = Number(formatUnits(v, decimals));
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function units(v: bigint, decimals: number, maxFrac = 6) {
  return Number(formatUnits(v, decimals)).toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

/** A price is money, so it keeps two decimals: $2,509.80, not $2,509.8. */
function usdAtAnyDecimals(v: bigint, decimals: number) {
  const n = Number(formatUnits(v, decimals));
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Read = {
  block: bigint;
  ltvBps: bigint;
  capUsd8: bigint;
  floorUsd8: bigint;
  netWorthUsd8: bigint;
  limitUsd8: bigint;
  status: number;
  position: bigint;
  price: bigint;
  priceDecimals: number;
  positionBlock: bigint;
  gen2HasOpenFromBalance: boolean;
  gen1HasOpenFromBalance: boolean;
};

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className={`mt-2 text-[22px] font-extralight leading-none ${tone ?? "text-white"}`}>{value}</p>
      {sub && <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">{sub}</p>}
    </div>
  );
}

export default function LivePositionRead() {
  const [data, setData] = useState<Read | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const client = createPublicClient({ chain: CC3, transport: http(RPC) });
        const psc = GEN2.positionSizedCredit as Address;
        const { borrower, aEthWETH, ethUsdAggregator } = GEN2_SUBJECT;

        const [block, ltvBps, capUsd8, floorUsd8, decision, valuation, gen2Code, gen1Code] = await Promise.all([
          client.getBlockNumber(),
          client.readContract({ address: psc, abi: POSITION_SIZED_CREDIT_ABI, functionName: "ltvBps" }),
          client.readContract({ address: psc, abi: POSITION_SIZED_CREDIT_ABI, functionName: "maxCreditUsd8" }),
          client.readContract({ address: psc, abi: POSITION_SIZED_CREDIT_ABI, functionName: "minNetWorthUsd8" }),
          client.readContract({
            address: psc,
            abi: POSITION_SIZED_CREDIT_ABI,
            functionName: "limitFor",
            args: [borrower, [aEthWETH], [ethUsdAggregator]],
          }),
          client.readContract({
            address: GEN2.valuer as Address,
            abi: VALUER_ABI,
            functionName: "valuationOf",
            args: [borrower, aEthWETH, ethUsdAggregator],
          }),
          client.getBytecode({ address: GEN2.creditLine as Address }),
          client.getBytecode({ address: GEN1_CREDIT_LINE as Address }),
        ]);

        if (cancelled) return;
        setData({
          block,
          ltvBps,
          capUsd8,
          floorUsd8,
          netWorthUsd8: decision.netWorthUsd8,
          limitUsd8: decision.limitUsd8,
          status: Number(decision.status),
          position: valuation.position,
          price: valuation.price,
          priceDecimals: Number(valuation.priceDecimals),
          positionBlock: valuation.positionBlock,
          gen2HasOpenFromBalance: (gen2Code ?? "").includes(SELECTORS.openCreditFromBalance),
          gen1HasOpenFromBalance: (gen1Code ?? "").includes(SELECTORS.openCreditFromBalance),
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
          Reading Creditcoin CC3 testnet...
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
          The addresses in section 07 are still checkable directly on Blockscout. Nothing on this
          panel is cached or filled in, so an unreachable RPC shows as a failure rather than as a
          number that might be stale.
        </p>
      </div>
    );
  }

  const eligible = data.status === 0;

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Proven net worth" value={usd(data.netWorthUsd8)} sub="reconstructed from mainnet" />
        <Metric label="Policy LTV" value={`${Number(data.ltvBps) / 100}%`} sub="hard-capped at 50% in code" />
        <Metric
          label="Credit limit"
          value={data.limitUsd8 === 0n ? "$0.00" : usd(data.limitUsd8)}
          sub={STATUS_LABELS[data.status] ?? `status ${data.status}`}
          tone={eligible ? "text-emerald-300" : "text-amber-300"}
        />
        <Metric
          label="Attested ETH/USD"
          value={usdAtAnyDecimals(data.price, data.priceDecimals)}
          sub={`position block ${data.positionBlock.toLocaleString("en-US")}`}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
            Position the limit was sized from
          </p>
          <p className="mt-2 font-mono text-[13px] text-white/80">
            {units(data.position, 18)} aEthWETH
          </p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.1em] text-white/40">
            subject {GEN2_SUBJECT.borrower.slice(0, 10)}...{GEN2_SUBJECT.borrower.slice(-6)}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
            Policy bounds, read live
          </p>
          <p className="mt-2 font-mono text-[13px] text-white/80">cap {usd(data.capUsd8)} per account</p>
          <p className="mt-1 font-mono text-[13px] text-white/80">floor {usd(data.floorUsd8)} net worth</p>
        </div>
      </div>

      {/* The check that generation 2 exists for. */}
      <div className="mt-3 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
          Bytecode check: <span className="normal-case tracking-normal">openCreditFromBalance</span> (selector{" "}
          {SELECTORS.openCreditFromBalance})
        </p>
        <ul className="mt-3 space-y-2">
          <li className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] text-white/60">gen 2 {GEN2.creditLine.slice(0, 10)}...</span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                data.gen2HasOpenFromBalance ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {data.gen2HasOpenFromBalance ? "present" : "absent"}
            </span>
            <span className="text-[12px] font-light text-white/55">no deposit required</span>
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[11px] text-white/60">gen 1 {GEN1_CREDIT_LINE.slice(0, 10)}...</span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                data.gen1HasOpenFromBalance ? "text-emerald-300" : "text-amber-300"
              }`}
            >
              {data.gen1HasOpenFromBalance ? "present" : "absent"}
            </span>
            <span className="text-[12px] font-light text-white/55">sizes from the deposit</span>
          </li>
        </ul>
        <p className="mt-3 text-[13px] font-light leading-relaxed text-white/65">
          This is read from chain bytecode in your browser, not from a claim in this page. Generation
          1 genuinely lacks the function, which is why the deposit-free path needed a redeploy.
        </p>
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
        Read at CC3 block {data.block.toLocaleString("en-US")} - no wallet, no sign-in
      </p>
    </>
  );
}
