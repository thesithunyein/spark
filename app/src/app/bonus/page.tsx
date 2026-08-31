"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Bonus: Real Aave V3 Mainnet History
 * Matches landing page dark UI/UX style.
 */

type HistoryEntry = {
  action: string;
  protocol: string;
  amount: string;
  asset: string;
  timestamp: string;
  chain: string;
  attested: boolean;
};

const DEMO_HISTORY: HistoryEntry[] = [
  { action: "Supply", protocol: "Aave V3", amount: "2.5", asset: "ETH", timestamp: "2024-12-15", chain: "Ethereum Mainnet", attested: true },
  { action: "Borrow", protocol: "Aave V3", amount: "1000", asset: "USDC", timestamp: "2025-01-20", chain: "Ethereum Mainnet", attested: true },
  { action: "Repay", protocol: "Aave V3", amount: "1000", asset: "USDC", timestamp: "2025-03-10", chain: "Ethereum Mainnet", attested: true },
  { action: "Withdraw", protocol: "Aave V3", amount: "2.5", asset: "ETH", timestamp: "2025-03-12", chain: "Ethereum Mainnet", attested: true },
];

export default function BonusPage() {
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  const handleProve = async () => {
    if (!wallet) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setHistory(DEMO_HISTORY);
    setLoading(false);
  };

  return (
    <div className="relative isolate grid h-[100svh] w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-black">
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

      {/* Main content */}
      <main className="relative z-10 flex min-h-0 items-center justify-center overflow-y-auto px-[clamp(20px,5vw,100px)]">
        <div className="stagger flex w-[min(600px,90vw)] flex-col py-[clamp(24px,3vw,48px)]">
          {/* Badge */}
          <span className="inline-block self-start border border-accent/50 bg-accent/10 px-[clamp(14px,1.1vw,20px)] py-[clamp(9px,0.8vw,14px)] font-mono text-[clamp(11px,0.72vw,14px)] uppercase leading-none tracking-[0.2em] text-accent3">
            [ Bonus Feature ]
          </span>

          {/* Title */}
          <h1 className="mt-[clamp(28px,3vw,52px)] text-[clamp(40px,5vw,72px)] font-extralight leading-[0.95] tracking-[0.03em] text-white">
            Real DeFi History
          </h1>
          <p className="mt-[clamp(14px,1.4vw,24px)] font-mono text-[clamp(11px,0.94vw,17px)] font-light uppercase leading-[1.4] tracking-[0.14em] text-white/60">
            Prove mainnet history on Creditcoin
          </p>
          <p className="mt-[clamp(14px,1.4vw,24px)] max-w-lg text-[15px] font-light leading-relaxed text-white/85">
            Enter an Ethereum mainnet wallet to prove its Aave V3 history using the Attestcoin Protocol. This demonstrates Spark&apos;s ability to attest cross-chain data beyond Sepolia.
          </p>

          {/* Input card */}
          <div className="mt-[clamp(28px,3vw,48px)] rounded-xl border border-white/[0.12] bg-white/[0.04] p-6 backdrop-blur-sm">
            <label className="block font-mono text-[11px] uppercase tracking-[0.18em] text-white/50 mb-3">
              Ethereum Mainnet Wallet
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="0x..."
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                className="flex-1 rounded-lg border border-white/[0.15] bg-white/[0.06] px-4 py-3 font-mono text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-accent/60 focus:bg-white/[0.08]"
              />
              <button
                onClick={handleProve}
                disabled={loading || !wallet}
                className="btn-shine px-6 py-3 font-mono text-[12px] uppercase tracking-[0.18em] text-white disabled:opacity-40"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Proving
                  </span>
                ) : (
                  "Prove History"
                )}
              </button>
            </div>
          </div>

          {/* History results */}
          {history && (
            <div className="mt-[clamp(28px,3vw,48px)] space-y-3">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
                Attested Aave V3 History
              </h2>
              {history.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-white/[0.12] bg-white/[0.04] px-5 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 font-mono text-[11px] text-accent2">
                      {entry.action.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[14px] font-light text-white">
                        {entry.action} {entry.amount} {entry.asset}
                      </div>
                      <div className="font-mono text-[11px] text-white/40">
                        {entry.protocol} &middot; {entry.timestamp}
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-green-400">
                    ✓ Attested
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* How it works */}
          <div className="mt-[clamp(28px,3vw,48px)] rounded-xl border border-white/[0.12] bg-white/[0.04] p-6 backdrop-blur-sm">
            <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
              How it works
            </h3>
            <ol className="space-y-3">
              {[
                "Query Aave V3 subgraph for wallet's supply/borrow/repay history",
                "For each mainnet transaction, generate an Attestcoin proof",
                "Submit proofs to Creditcoin via BlockProver precompile",
                "Attested history boosts credit score and LTV",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-[11px] text-accent2">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[14px] font-light text-white/70">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Note */}
          <p className="mt-6 text-[13px] text-white/40">
            Note: In production, each entry is proven on-chain. This is a demo. The core credit flow works without this feature.
          </p>

          {/* CTA */}
          <div className="mt-8 flex items-center gap-3">
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
