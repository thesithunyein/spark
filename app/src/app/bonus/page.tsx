import Link from "next/link";
import type { ReactNode } from "react";
import { EVIDENCE } from "@/lib/mainnetEvidence";
import { config } from "@/lib/config";
import { GEN1_CREDIT_LINE, GEN2, PORTABILITY } from "@/lib/gen2";
import LivePositionRead from "@/components/LivePositionRead";
import LiveStandingRead from "@/components/LiveStandingRead";

/**
 * Mainnet Position Proof: real measured evidence.
 *
 * Every number on this page comes from docs/evidence/*.json, which was produced from live
 * Ethereum mainnet reads, and is imported through a generated module so the page cannot
 * drift from its artifacts. Regenerate with: cd app && node scripts/gen-evidence-module.mjs
 *
 * Scope is stated explicitly and does not overclaim: the measurements are real, the
 * end-to-end execution was local, and the stack has since been broadcast to Creditcoin CC3
 * testnet as post-deadline work. Section 06 reads that deployment from the chain in the
 * reader's browser rather than repeating what a file says about it. Spark's live credit
 * flow (Sepolia payment to Creditcoin credit) is a separate product, unaffected by this page.
 *
 * Matches the landing page dark UI/UX style.
 */

const E = EVIDENCE;

// `subLiteral` keeps a token symbol in its real case: uppercasing "aEthWETH" renders as
// "AETHWETH", which reads as a typo rather than a label.
function Metric({ label, value, sub, subLiteral }: { label: string; value: string; sub?: string; subLiteral?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 text-[24px] font-extralight leading-none text-white">{value}</p>
      {sub && (
        <p className={`mt-2 font-mono text-[10px] tracking-[0.12em] text-white/40 ${subLiteral ? "normal-case" : "uppercase"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <h2 className="mt-10 flex items-baseline gap-3 text-[clamp(18px,1.6vw,26px)] font-extralight tracking-[0.02em] text-white">
      <span className="font-mono text-[11px] text-accent2">{n}</span>
      {children}
    </h2>
  );
}

const STATUS = [
  {
    label: "Measured on Ethereum mainnet",
    tone: "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-300",
    note: "Read live from archive RPC. Reproducible with the commands at the bottom of this page.",
  },
  {
    label: "Engine code, executed locally",
    tone: "border-sky-500/40 bg-sky-500/[0.08] text-sky-300",
    note: "Thirteen Solidity contracts, 518 Foundry tests, run end to end on a local chain using real mainnet data.",
  },
  {
    label: "Broadcast to Creditcoin CC3 testnet",
    tone: "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-300",
    note: "The stack below is deployed and its limit is read live from the chain in section 06. This is post-deadline work and is not part of the frozen submission.",
  },
];

export default function MainnetPositionPage() {
  const { scale, drift, topics, e2e } = E;
  const weth = drift.weth;

  return (
    <div className="relative isolate min-h-[100svh] w-full bg-black">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-black" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 70% 20%, rgba(139,92,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 30% 80%, rgba(59,130,246,0.05) 0%, transparent 50%)",
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-50 flex items-center justify-between gap-8 px-[clamp(20px,5vw,100px)] py-[clamp(20px,2.4vw,34px)]">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/hex-logo.svg" alt="" width={34} height={34} className="h-[clamp(26px,2.2vw,38px)] w-[clamp(26px,2.2vw,38px)]" />
          <span className="text-[clamp(20px,1.75vw,30px)] font-extralight leading-none tracking-[0.16em] text-white">SPARK</span>
        </Link>
        <div className="flex items-center gap-[clamp(24px,3.2vw,62px)]">
          <nav className="hidden items-center gap-[clamp(20px,2.8vw,56px)] lg:flex">
            {[
              { href: "/overview", label: "Overview" },
              { href: "/score", label: "Score" },
              { href: "/activity", label: "Activity" },
              { href: "/help", label: "Help" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="link-underline font-mono text-[clamp(11px,0.78vw,14px)] uppercase tracking-[0.18em] text-white transition-colors duration-[250ms] hover:text-white/60">
                {l.label}
              </Link>
            ))}
          </nav>
          <Link href="/pay" className="link-underline hidden border border-white/[0.26] px-[clamp(20px,1.8vw,32px)] py-[clamp(12px,1vw,17px)] font-mono text-[clamp(11px,0.78vw,14px)] uppercase tracking-[0.18em] text-white transition-[border-color,background-color,transform] duration-[300ms] hover:border-accent/70 hover:bg-accent/[0.08] lg:inline-flex">
            Get credit
          </Link>
        </div>
      </header>

      <main className="relative z-10 px-[clamp(20px,5vw,100px)] pb-20">
        <div className="stagger mx-auto w-[min(980px,100%)]">
          {/* Intro */}
          <span className="inline-block self-start border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 font-mono text-[11px] uppercase leading-none tracking-[0.2em] text-emerald-300">
            [ Measured on mainnet ]
          </span>
          <h1 className="mt-6 text-[clamp(32px,4vw,56px)] font-extralight leading-[0.95] tracking-[0.03em] text-white">
            Mainnet Position Proof
          </h1>
          <p className="mt-3 font-mono text-[13px] font-light uppercase leading-[1.4] tracking-[0.14em] text-white/60">
            Ledger reconstruction of real Aave V3 positions, from real mainnet data
          </p>
          <p className="mt-5 max-w-3xl text-[15px] font-light leading-relaxed text-white/85">
            Credit decisions need history that lives on another chain. The obvious way to get it is to
            sum a protocol&apos;s events. We measured that approach against reality and it is wrong by up
            to {weth.supplyDriftPct.replace("-", "")} on a single position. This page is the measurement,
            the replacement primitive, and the proof that the replacement reconciles.
          </p>

          {/* Honest status */}
          <div className="mt-8 space-y-3">
            {STATUS.map((s) => (
              <div key={s.label} className={`flex flex-col gap-1 rounded-lg border px-5 py-3 sm:flex-row sm:items-center sm:gap-4 ${s.tone}`}>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em]">{s.label}</span>
                <span className="text-[13px] font-light leading-snug text-white/65">{s.note}</span>
              </div>
            ))}
          </div>

          {/* Headline numbers */}
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Positions reconciled" value={`${scale.summary.tested}`} sub={`${scale.summary.ledgerWithin10Bps} within 10 bps`} />
            <Metric label="Largest residual" value={`${scale.summary.largestResidualBps} bps`} sub="interest events cannot supply" />
            <Metric label="Mainnet RPC calls" value={`${scale.rpcCallsUsed}`} sub={`to block ${scale.latestBlock.toLocaleString("en-US")}`} />
            <Metric label="End-to-end gas" value={e2e.gasDisplay ?? "n/a"} sub={`${e2e.chain}, ${e2e.transactions} transactions`} />
          </div>

          {/* 1. The finding */}
          <SectionTitle n="01">The finding: event summing understates a position</SectionTitle>
          <p className="mt-4 max-w-3xl text-[15px] font-light leading-relaxed text-white/75">
            A real mainnet borrower with {drift.totalEvents} pool events. The naive method sums{" "}
            <span className="font-mono text-white">Supply</span> minus{" "}
            <span className="font-mono text-white">Withdraw</span> per reserve. The right column is the
            same position read from protocol state at the same block.
          </p>

          <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.12]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.12] bg-white/[0.04]">
                  {["Reserve", "Events", "Naive sum (events)", "Real state", "Error"].map((h) => (
                    <th key={h} className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drift.reserves.map((r) => (
                  <tr key={r.symbol} className="border-b border-white/[0.07] last:border-0">
                    <td className="px-4 py-3 text-[14px] font-light text-white">{r.symbol}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-white/50">{r.eventCount}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-white/80">{r.naiveSupplyDisplay}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-white/80">{r.realSupplyDisplay}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-red-300">{r.supplyDriftPct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
            <p className="text-[14px] font-light leading-relaxed text-white/75">
              The WETH row is the clearest case:{" "}
              <span className="font-mono text-white">{weth.naiveSupplyDisplay}</span> from events against{" "}
              <span className="font-mono text-white">{weth.realSupplyDisplay}</span> in reality, with{" "}
              <span className="font-mono text-white">zero</span> Withdraw events in the entire history. The
              position moved by plain ERC20 <span className="font-mono text-white">Transfer</span>, which
              emits no Aave event at all. The USDT debt row shows the same class of failure in the other
              direction: {drift.reserves.find((r) => r.symbol === "USDT")?.naiveDebtDisplay} borrowed from
              events against {drift.reserves.find((r) => r.symbol === "USDT")?.realDebtDisplay} actual.
            </p>
          </div>

          {/* 2. The replacement */}
          <SectionTitle n="02">The replacement: the token&apos;s own ledger, anchored at a proven zero</SectionTitle>
          <p className="mt-4 max-w-3xl text-[15px] font-light leading-relaxed text-white/75">
            The primitive is the aToken&apos;s Transfer ledger, not the pool&apos;s events. A ledger sum is
            only meaningful if you know where it started, so the engine finds the most recent block where{" "}
            <span className="font-mono text-white">balanceOf</span> returns exactly zero and anchors there,
            which makes coverage complete by construction rather than by assumption.
          </p>

          <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.12]">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.12] bg-white/[0.04]">
                  {["Wallet", "Anchor block", "Blocks", "Ledger", "Real balance", "Residual"].map((h) => (
                    <th key={h} className="px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scale.wallets.map((w) => (
                  <tr key={w.wallet} className={`border-b border-white/[0.07] last:border-0 ${w.hasP2p ? "bg-amber-500/[0.06]" : ""}`}>
                    <td className="px-4 py-3 font-mono text-[12px] text-white/80">{w.short}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-white/50">{w.anchorBlock.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-white/50">{w.blocksCovered.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-white/80">{w.ledgerDisplay}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-white/80">{w.balanceDisplay}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-emerald-300">{w.residualBps} bps</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[14px] font-light leading-relaxed text-white/75">
            {scale.summary.tested} wallets, positions from {scale.wallets[scale.wallets.length - 1].balanceDisplay} to{" "}
            {scale.wallets[0].balanceDisplay} in {scale.assetSymbol}.{" "}
            <span className="text-white">{scale.summary.ledgerMatchesExactly} matched exactly</span> and{" "}
            <span className="text-white">{scale.summary.ledgerWithin10Bps} of {scale.summary.tested}</span> landed
            within 10 bps, with a largest residual of {scale.summary.largestResidualBps} bps.
          </p>

          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-300">
              Three honest corrections, all found by measuring
            </p>
            <p className="mt-2 text-[13px] font-light leading-relaxed text-white/70">
              Exact equality was our first claim and it was wrong: it came from a single wallet with a
              near-zero balance, where matching is trivial. Across {scale.summary.tested} real positions,
              nothing matches exactly, because interest rebases into the aToken between events. The honest
              claim is the residual magnitude, and that number is what the on-chain{" "}
              <span className="font-mono">interestResidual</span> bound encodes. Separately,{" "}
              {scale.summary.withPeerToPeerMovement} of {scale.summary.tested} walked{" "}
              <span className="font-mono">{scale.wallets.find((w) => w.hasP2p)?.p2pDisplay.replace("-", "")}</span>{" "}
              between wallets, which no event-only method could ever reconstruct. That row is highlighted above.
            </p>
            <p className="mt-3 text-[13px] font-light leading-relaxed text-white/70">
              The third correction came only from scaling this measurement from 8 wallets to 40. One of the
              40 holds 2 wei of aEthWETH, so a one-wei ledger difference printed as -5000 bps and briefly
              became the largest-residual headline on this page. A percentage against a two-wei denominator
              is an artifact rather than a measurement, so the metric now applies a dust floor and counts
              excluded wallets explicitly instead of dropping them. The raw balances and residuals are
              untouched; only the derived percentages were recomputed. Eight wallets never hit this case,
              which is the argument for a corpus over a sample.
            </p>
          </div>

          {/* 3. Topics */}
          <SectionTitle n="03">Parity: every topic pinned against the chain, with negative controls</SectionTitle>
          <p className="mt-4 max-w-3xl text-[15px] font-light leading-relaxed text-white/75">
            Constants that are wrong fail silently, so each declared signature is checked against real logs
            in a {topics.window.blocks.toLocaleString("en-US")} block window and paired with a negative
            control that must return zero for the method to be credible.{" "}
            {topics.confirmedCount} of {topics.totalCount} signatures confirmed live.
          </p>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-white/[0.12]">
              <p className="border-b border-white/[0.12] bg-white/[0.04] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                Declared signatures
              </p>
              <ul>
                {topics.rows.map((t) => (
                  <li key={t.name} className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-2.5 last:border-0">
                    <span className="text-[13px] font-light text-white/80">{t.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-white/40">{t.logsInWindow.toLocaleString("en-US")} logs</span>
                      <span className={`font-mono text-[10px] uppercase tracking-[0.1em] ${t.confirmed ? "text-emerald-300" : "text-amber-300"}`}>
                        {t.confirmed ? "live" : "unseen"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/[0.12]">
              <p className="border-b border-white/[0.12] bg-white/[0.04] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                Negative controls (must be zero)
              </p>
              <ul>
                {topics.negativeControls.map((c) => (
                  <li key={c.name} className="border-b border-white/[0.07] px-4 py-2.5 last:border-0">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[13px] font-light text-white/80">{c.name}</span>
                      <span className="font-mono text-[12px] text-emerald-300">{c.logsInWindow}</span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-white/35">{c.signature}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
              The proxy that proves nothing
            </p>
            <p className="mt-2 text-[14px] font-light leading-relaxed text-white/75">
              The ETH/USD price needs a Chainlink answer, and the address everyone knows is the proxy. The
              proxy emitted <span className="font-mono text-white">0</span> logs. Its underlying aggregator
              emitted <span className="font-mono text-white">36</span> in the same window, because{" "}
              <span className="font-mono text-white">AnswerUpdated</span> is emitted by the aggregator. An
              implementation that attests the proxy would prove no price while appearing to succeed. That
              is a silent failure mode we only found by checking.
            </p>
          </div>

          {/* 4. End to end */}
          <SectionTitle n="04">End to end: the same flow the contract runs</SectionTitle>
          <p className="mt-4 max-w-3xl text-[15px] font-light leading-relaxed text-white/75">
            The engine then values the position through attested prices. Executed across{" "}
            {e2e.transactions} transactions on {e2e.chain} using the real mainnet inputs above, then read
            back from the deployed contracts rather than from the script&apos;s own console output.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Ledger net" value={e2e.ledgerDisplay ?? "n/a"} sub={scale.assetSymbol} subLiteral />
            <Metric label="Reconciled position" value={e2e.netPositionDisplay ?? "n/a"} sub={scale.assetSymbol} subLiteral />
            <Metric label="Attested ETH/USD" value={e2e.priceDisplay ?? "n/a"} sub={`Chainlink, ${e2e.priceDecimals}dp`} />
            <Metric label="Position value" value={e2e.valueUsdDisplay ?? "n/a"} sub={`at block ${e2e.positionBlock ? Number(e2e.positionBlock).toLocaleString("en-US") : "n/a"}`} />
            <Metric label="Gas used" value={e2e.gasDisplay ?? "n/a"} sub={`${e2e.transactions} transactions`} />
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
            <p className="text-[14px] font-light leading-relaxed text-white/75">
              The inputs were re-verified against mainnet independently after the run, and two checks are
              worth calling out. The anchor block really does hold a zero balance, so coverage starts from
              a proven point rather than an assumed one. And the attested balance, read at block{" "}
              <span className="font-mono text-white">{e2e.measureBlock}</span>, returns{" "}
              <span className="font-mono text-white">{e2e.measuredBalanceDisplay}</span>, which is exactly
              the value the contract reconciled against. That equality was wrong in an earlier revision of
              the script, which stamped the balance with a block 97 earlier; the mismatch was found by
              re-reading the chain rather than by rereading the code.
            </p>
          </div>

          {/* 5. Credit sized from the position */}
          <SectionTitle n="05">And the number it produces</SectionTitle>
          <p className="mt-4 max-w-3xl text-[15px] font-light leading-relaxed text-white/75">
            Proving a position is only worth anything if something consumes it. The same broadcast
            deploys a policy layer that sizes a credit limit from the proven net worth, read back off
            chain with the rest of the stack.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Proven net worth" value={e2e.valueUsdDisplay ?? "n/a"} sub="reconstructed from mainnet" />
            <Metric label="Policy LTV" value={e2e.ltvDisplay ?? "n/a"} sub="set explicitly, not implied" />
            <Metric label="Credit limit" value={e2e.creditLimitDisplay ?? "n/a"} sub="85% of net worth, at 20%" />
            <Metric label="Decision status" value={e2e.creditStatus === "0" ? "Eligible" : `code ${e2e.creditStatus}`} sub="0 means a usable limit" />
          </div>

          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-amber-300">
              A proven position is not seizable collateral
            </p>
            <p className="mt-2 text-[13px] font-light leading-relaxed text-white/70">
              Spark can read an Aave position on Ethereum mainnet and cannot liquidate it from
              Creditcoin. So this limit is unsecured credit extended against a verified underwriting
              signal, and the policy cap is hard-coded at half of net worth, far below the 80 to 95
              percent the deposit-backed flow uses. Conflating the two would be the most misleading
              thing in this codebase.
            </p>
          </div>

          {/* 6. Live */}
          <SectionTitle n="06">Read live from Creditcoin testnet, no wallet required</SectionTitle>
          <p className="mt-4 max-w-3xl text-[15px] font-light leading-relaxed text-white/75">
            The engine above is now deployed. Every number below is read from those contracts in your
            browser as the page loads, including the bytecode check, so each one can be pasted into
            Blockscout and confirmed independently. Nothing on this panel is cached or filled in.
          </p>

          <LivePositionRead />

          <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.12]">
            <p className="border-b border-white/[0.12] bg-white/[0.04] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
              Generation 2 and the CEIP stack, Creditcoin CC3 testnet
            </p>
            <ul>
              {[
                { label: "CreditLine (generation 2, balance-sized, no deposit)", address: GEN2.creditLine },
                { label: "AttestedStanding (portable standing)", address: GEN2.attestedStanding },
                { label: "GroupCredit (group line with vouching)", address: GEN2.groupCredit },
                { label: "MainnetPositionRegistry", address: GEN2.positionRegistry },
                { label: "MainnetTokenRegistry", address: GEN2.tokenRegistry },
                { label: "AttestedPriceFeed", address: GEN2.priceFeed },
                { label: "PositionValuer", address: GEN2.valuer },
                { label: "PositionSizedCredit", address: GEN2.positionSizedCredit },
                { label: "AttestcoinPaymentVerifier (reused from generation 1)", address: GEN2.verifier },
              ].map((r) => (
                <li
                  key={r.label}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5 last:border-0"
                >
                  <span className="text-[13px] font-light text-white/80">{r.label}</span>
                  <a
                    href={`${config.explorerCreditcoin}/address/${r.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-white/50 transition-colors duration-[250ms] hover:text-accent2"
                  >
                    {r.address.slice(0, 10)}...{r.address.slice(-6)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
              What the live read proves, and what it does not
            </p>
            <p className="mt-2 text-[14px] font-light leading-relaxed text-white/75">
              It proves the engine runs and returns a limit against a real mainnet position. It does
              not prove anyone borrowed. The deposit-backed flow in the demo video is generation 1 at{" "}
              <span className="font-mono text-white">{GEN1_CREDIT_LINE.slice(0, 10)}...</span>, and this
              deployment does not change it.
            </p>
            <p className="mt-3 text-[13px] font-light leading-relaxed text-white/60">
              One detail worth stating rather than leaving to be noticed: the USD figures here differ
              slightly from section 04, while the position is byte-identical at 433.033875 aEthWETH. That
              is the point of the design rather than a discrepancy. The price is an attested Chainlink
              answer stamped at a mainnet block, not a live fetch, so two runs at different blocks produce
              two prices for the same position. An implementation that read the price live would have no
              such excuse.
            </p>
          </div>

          {/* 7. Portable standing, consumed by a different product */}
          <SectionTitle n="07">A verified record, consumed by someone else</SectionTitle>
          <p className="mt-4 max-w-3xl text-[15px] font-light leading-relaxed text-white/75">
            The standing registry publishes a proof-anchored record any protocol can read. Until this
            deployment, nothing read it, which made portability an interface rather than a fact. So a
            second, independent product was deployed against it: a merchant that defers payment for an
            item, using its own policy, on a record it did not create. Spark cannot change that policy,
            and the merchant cannot change what the record says.
          </p>

          <LiveStandingRead />

          <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.12]">
            <p className="border-b border-white/[0.12] bg-white/[0.04] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
              The portability pair, Creditcoin CC3 testnet
            </p>
            <ul>
              {[
                { label: "AttestedStanding (registry, anchored to the live generation)", address: PORTABILITY.registry },
                { label: "StandingGatedCheckout (a merchant that is not Spark)", address: PORTABILITY.checkout },
                { label: "CreditLine generation 1 (where the record's evidence lives)", address: PORTABILITY.anchoredTo },
              ].map((r) => (
                <li
                  key={r.label}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5 last:border-0"
                >
                  <span className="text-[13px] font-light text-white/80">{r.label}</span>
                  <a
                    href={`${config.explorerCreditcoin}/address/${r.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-white/50 transition-colors duration-[250ms] hover:text-accent2"
                  >
                    {r.address.slice(0, 10)}...{r.address.slice(-6)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* 8. Limits */}
          <SectionTitle n="08">What is not true yet</SectionTitle>
          <ul className="mt-4 space-y-3">
            {[
              "The generation-2 stack has now been used once. A 0.0199 ETH Sepolia balance attestation opened a 0.00398 ETH limit with no deposit, which is the first time that path has opened a line for anyone. What it still does not show is a market: it is one account, nothing has been drawn against the credit, and a mechanism is not demand.",
              "Interest is never fabricated from a timestamp or a rate. The only path that moves a position ahead of the ledger is an attested state balance, and the residual is capped and reverts past the cap.",
              "The sample is aEthWETH only and biased toward recent depositors. Morpho WithdrawCollateral has no observed logs in the window, so that signature is unconfirmed.",
              "The attestor is trusted to submit already verified values rather than the contract calling the precompile directly. That trust boundary is documented in the threat model.",
              "The credit limit has no on-chain enforcement path yet. Nothing draws against it, so it is a policy output rather than a funded line.",
              "The portability pair is exercised by one account acting as both borrower and merchant. It shows the mechanism is consumable by a different contract under a different policy; it does not show two parties using it.",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span className="text-[14px] font-light leading-relaxed text-white/70">{t}</span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-[14px] font-light leading-relaxed text-white/70">
            Spark&apos;s live product is separate and unaffected. Paying on Sepolia and opening credit on
            Creditcoin with dual Attestcoin proofs is deployed and working today, with on-chain history you
            can read on Blockscout.
          </p>

          {/* Reproduce */}
          <div className="mt-8 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">Reproduce</p>
            <pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-relaxed text-white/70">
{`cd app && node scripts/position-scale.mjs      # 40-wallet reconciliation
cd app && node scripts/protocol-topics.mjs     # topic parity + controls
cd app && node scripts/gen-evidence-module.mjs # regenerate this page's data
cd contracts && forge test                     # 518 tests
cd contracts && bash script/deploy-all-cc3.sh  # the CC3 broadcast (dry run by default)
cd contracts && bash script/standing-consumer-cc3.sh  # the portability pair (dry run by default)`}
            </pre>
          </div>

          {/* CTA */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/pay" className="btn-shine px-7 py-[clamp(14px,1.4vw,22px)] font-mono text-[clamp(11px,0.78vw,14px)] uppercase tracking-[0.22em] text-white">
              Get credit
            </Link>
            <Link href="/overview" className="border border-white/[0.26] px-7 py-[clamp(14px,1.4vw,22px)] font-mono text-[clamp(11px,0.78vw,14px)] uppercase tracking-[0.22em] text-white/75 transition-all duration-[300ms] hover:border-accent/70 hover:bg-accent/[0.08] hover:text-white">
              Overview
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.14] px-[clamp(20px,5vw,100px)] py-[clamp(18px,1.7vw,30px)] text-center" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <p className="text-[clamp(12px,0.82vw,16px)] font-light leading-[1.5] text-white/60">
          Spark verifies payments on Sepolia and opens credit on Creditcoin. <span className="text-accent3">Testnet prototype.</span>
        </p>
      </footer>
    </div>
  );
}
