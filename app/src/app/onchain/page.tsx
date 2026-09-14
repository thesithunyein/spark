import Link from "next/link";
import type { ReactNode } from "react";
import { chainActivity } from "@/lib/chainActivity";

/**
 * On-chain record.
 *
 * Every row on this page is a real log entry read off the deployed contracts by
 * scripts/gen-chain-activity.mjs, which writes src/lib/chainActivity.ts. Nothing is
 * hand-typed, so the page cannot drift from the chain, and every row links to the
 * explorer so a reader can check any of it without trusting this page.
 *
 * The page requires no wallet, which is the point: the product's own history is
 * otherwise invisible, because /activity is scoped to the connected address.
 *
 * Matches the landing page dark UI/UX style.
 */

const A = chainActivity;
const S = A.summary;
const F = A.funnel;

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 text-[24px] font-extralight leading-none text-white">{value}</p>
      {sub && <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">{sub}</p>}
    </div>
  );
}

function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <h2 className="mt-12 flex items-baseline gap-3 text-[clamp(18px,1.6vw,26px)] font-extralight tracking-[0.02em] text-white">
      <span className="font-mono text-[11px] text-accent2">{n}</span>
      {children}
    </h2>
  );
}

/**
 * Formatting the ISO string by hand rather than through `Date.toLocaleString`, because
 * locale-dependent formatting renders differently on the server than in the browser and
 * would desynchronise hydration on a page that is otherwise purely static.
 */
function stamp(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, h, mi] = m;
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

/** Raw Solidity event names read as one run-on word once uppercased. */
const EVENT_LABEL: Record<string, string> = {
  CreditOpened: "Credit opened",
  AttestedPaymentLinked: "Attested payment linked",
  CreditWithdrawn: "Credit withdrawn",
  CreditRedeemed: "Credit redeemed",
  InterestAccrued: "Interest accrued",
  CreditRepaid: "Credit repaid",
  CreditClosed: "Credit closed",
  DepositPaid: "Deposit paid",
  RepaymentPaid: "Repayment paid",
  BalanceAttested: "Balance attested",
  Withdrawn: "Withdrawn",
};

const CHAIN_STYLE: Record<string, { label: string; badge: string }> = {
  creditcoin: {
    label: "Creditcoin",
    badge: "border-violet-400/40 bg-violet-400/[0.10] text-violet-200",
  },
  sepolia: {
    label: "Sepolia",
    badge: "border-sky-400/40 bg-sky-400/[0.10] text-sky-200",
  },
};

export default function OnchainPage() {
  const events = A.events;
  // The generated module is emitted `as const`, so every count arrives as a literal type and
  // a runtime branch on it fails to compile. Widening here keeps the copy below able to
  // branch on the numbers without casting at each use site.
  const actors: number = S.distinctActors;

  return (
    <div className="relative isolate min-h-[100svh] w-full bg-black">
      <div className="absolute inset-0 -z-10 bg-black" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 70% 15%, rgba(139,92,246,0.09) 0%, transparent 60%), radial-gradient(ellipse at 25% 85%, rgba(56,189,248,0.06) 0%, transparent 55%)",
          }}
        />
      </div>

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
              { href: "/onchain", label: "On-chain" },
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

      <main className="relative z-10 px-[clamp(20px,5vw,100px)] pb-24">
        <div className="stagger mx-auto w-[min(1080px,100%)]">
          <span className="inline-block border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 font-mono text-[11px] uppercase leading-none tracking-[0.2em] text-emerald-300">
            [ No wallet required ]
          </span>
          <h1 className="mt-6 text-[clamp(32px,4vw,56px)] font-extralight leading-[0.95] tracking-[0.03em] text-white">
            On-chain record
          </h1>
          <p className="mt-3 font-mono text-[13px] font-light uppercase leading-[1.4] tracking-[0.14em] text-white/60">
            Everything the deployed contracts have done, read straight off the chain
          </p>
          <p className="mt-5 max-w-3xl text-[15px] font-light leading-relaxed text-white/85">
            Spark&apos;s payment and credit history is otherwise scoped to whoever is connected, which
            means a reviewer with a fresh wallet sees an empty product. It should not work that way.
            Every event below is a real log entry from a deployed contract on Creditcoin testnet or
            Ethereum Sepolia, and every row links to the explorer, so nothing here has to be taken on
            trust.
          </p>

          {/* Scope, stated up front rather than left to be discovered. */}
          <div className="mt-7 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-amber-300">Scope</p>
            <p className="mt-2 text-[13px] font-light leading-relaxed text-white/80">
              All {S.totalEvents} events were produced by{" "}
              <strong className="font-normal text-white">{actors === 1 ? "a single wallet" : `${actors} wallets`}</strong>{" "}
              ({actors} distinct indexed address
              {actors === 1 ? "" : "es"}). That is enough to prove the loop closes end to
              end. It is not enough to prove a market exists, and this page does not claim
              otherwise.
            </p>
          </div>

          <SectionTitle n="01">What the contracts have actually done</SectionTitle>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Credit lines opened" value={String(S.linesOpened)} sub={`${S.linesClosed} closed, ${S.linesActive} still open`} />
            <Metric label="Attested payments linked" value={String(S.paymentsLinked)} sub="On-chain history, not self-reported" />
            <Metric
              label="Credit drawn"
              value={`${S.creditDrawnEth} ETH`}
              sub="Against proven deposits and a proven balance"
            />
            <Metric label="Events recorded" value={String(S.totalEvents)} sub="Across both chains" />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Metric label="Deposits paid on Sepolia" value={String(S.depositsPaid)} sub={`${S.depositVolumeEth} ETH total`} />
            <Metric label="Repayments paid on Sepolia" value={String(S.repaymentsPaid)} sub={`${S.repayVolumeEth} ETH total`} />
            <Metric label="Balances attested" value={String(S.balancesAttested)} sub="The solvency half of each open" />
          </div>

          <SectionTitle n="02">The funnel, counted from the chain</SectionTitle>
          <p className="mt-2 max-w-3xl text-[13px] font-light leading-relaxed text-white/70">
            Each stage counts <strong className="font-normal text-white">distinct wallets</strong>, not
            events, because the question a reviewer asks is how many people got this far. The counts come
            from the indexed actor field on each log, so nothing here is self-reported and nothing is
            extrapolated.
          </p>

          <div className="mt-4 space-y-2">
            {F.stages.map((s, i) => {
              const pct = F.stages[0].wallets > 0 ? (s.wallets / F.stages[0].wallets) * 100 : 0;
              return (
                <div key={s.key} className="rounded-lg border border-white/[0.10] bg-white/[0.03] px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[13px] font-light text-white/85">{s.label}</span>
                    <span className="ml-auto font-mono text-[16px] tabular-nums leading-none text-white">{s.wallets}</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">
                      wallet{s.wallets === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full bg-accent2/70" style={{ width: `${pct}%` }} />
                  </div>
                  {i > 0 && (
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
                      +{s.entered} entered &middot; {s.dropped} dropped from the stage above
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-amber-300">Read this number honestly</p>
            <p className="mt-2 text-[13px] font-light leading-relaxed text-white/80">
              It no longer reads the same number at every stage.{" "}
              <strong className="font-normal text-white">{F.distinctWallets}</strong> distinct wallets
              produced the {S.totalEvents} events on this page, and{" "}
              <strong className="font-normal text-white">{F.openedWithoutDeposit}</strong> of them reached
              a credit line through the deposit-free balance path. That is why &ldquo;paid a deposit&rdquo;
              sits below &ldquo;had a balance attested&rdquo;. Two addresses and one deposit-free path is
              still not a market, so the limit stands: the addresses are recruited one conversation at a
              time, and no repository can supply them.
            </p>
          </div>

          <SectionTitle n="03">Every event, oldest first</SectionTitle>
          <p className="mt-2 max-w-3xl text-[13px] font-light leading-relaxed text-white/60">
            {A.sources.length} deployed contracts contribute. Chronological order, because the point
            is the loop: deposit proved, balance proved, credit opened, drawn, redeemed, repaid,
            closed.
          </p>

          <ol className="mt-5 space-y-2">
            {events.map((e) => {
              const t = stamp(e.timestamp);
              const chain = CHAIN_STYLE[e.chain];
              return (
                <li
                  key={`${e.chain}-${e.txHash}-${e.logIndex}`}
                  className="rounded-lg border border-white/[0.10] bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${chain.badge}`}>
                      {chain.label}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/85">
                      {EVENT_LABEL[e.event] ?? e.event}
                    </span>
                    {e.role === "legacy" && (
                      <span className="border border-white/[0.16] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
                        legacy
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[10px] tabular-nums text-white/35">
                      {typeof t === "string" ? t : `${t.date} ${t.time}`}
                    </span>
                  </div>

                  <p className="mt-1.5 text-[13px] font-light text-white/85">{e.headline}</p>

                  {e.fields.length > 0 && (
                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                      {e.fields.map(([label, value]) => (
                        <div key={label} className="flex items-baseline gap-1.5">
                          <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/35">{label}</dt>
                          <dd className="font-mono text-[11px] text-white/70">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 font-mono text-[10px] text-white/35">
                    <span>block {e.block.toLocaleString("en-US")}</span>
                    <a
                      href={e.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="link-underline text-white/55 transition hover:text-white"
                    >
                      {e.txHash.slice(0, 14)}… ↗
                    </a>
                  </div>
                </li>
              );
            })}
          </ol>

          <SectionTitle n="04">How to check any of this yourself</SectionTitle>
          <p className="mt-2 max-w-3xl text-[13px] font-light leading-relaxed text-white/70">
            The contracts are verified on Blockscout, so their source and their event logs are public.
            No key, no wallet and no permission are needed to read any of it.
          </p>
          <div className="mt-4 space-y-2">
            {A.sources.map((s) => (
              <div key={s.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-white/[0.10] bg-white/[0.03] px-4 py-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/80">{s.contract}</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">{s.role}</span>
                <a
                  href={`${s.explorer}/address/${s.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link-underline font-mono text-[11px] text-white/60 transition hover:text-white"
                >
                  {s.address} ↗
                </a>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-white/[0.12] bg-white/[0.03] px-5 py-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">This page is generated</p>
            <p className="mt-2 text-[13px] font-light leading-relaxed text-white/75">
              Snapshot taken at Creditcoin testnet block{" "}
              <span className="font-mono text-white/90">{A.asOf.creditcoinBlock.toLocaleString("en-US")}</span> and Sepolia
              block <span className="font-mono text-white/90">{A.asOf.sepoliaBlock.toLocaleString("en-US")}</span>. The rows are
              written into a typed module from those reads, so the page cannot drift from the chain.
              Refresh it with:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-white/[0.10] bg-black/60 px-4 py-3 font-mono text-[11px] leading-relaxed text-white/75">
              <code>{`cd app && npm run gen:activity`}</code>
            </pre>
            <p className="mt-3 text-[12px] font-light leading-relaxed text-white/55">
              A live read is not used here because Spark&apos;s history spans hundreds of thousands of
              blocks across two chains and public RPCs cap log ranges well below that. A snapshot that
              states its own block height is the honest version of this page; an indexer is the live one.
            </p>
          </div>

          <p className="mt-8 text-[13px] text-white/60">
            Related:{" "}
            <Link href="/bonus" className="link-underline text-white transition hover:text-white/70">
              Mainnet position proof
            </Link>{" "}
            on the protocol depth behind the credit-sizing layer.
          </p>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.14] px-[clamp(20px,5vw,100px)] py-[clamp(18px,1.7vw,30px)] text-center" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <p className="text-[clamp(12px,0.82vw,16px)] font-light leading-[1.5] text-white/60">
          Spark verifies payments on Sepolia and opens credit on Creditcoin.{" "}
          <span className="text-accent3">Testnet prototype.</span>
        </p>
      </footer>
    </div>
  );
}
