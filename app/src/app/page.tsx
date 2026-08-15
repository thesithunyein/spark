"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_LINKS = [
  { href: "/overview", label: "Overview" },
  { href: "/score", label: "Score" },
  { href: "/activity", label: "Activity" },
  { href: "/help", label: "Help" },
];

const ROBOT_BG =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260411_104032_69319010-2458-492b-b04d-b40a5dfa4482.mp4";

const STEPS = [
  { n: "01", t: "Pay deposit" },
  { n: "02", t: "We verify" },
  { n: "03", t: "Credit unlocks" },
];

function Cell({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-black p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/50">{label}</p>
      <p className="mt-2 text-[18px] font-medium leading-none text-white">{value}</p>
      <p className="mt-2 text-[11px] text-white/50">{hint}</p>
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative mr-2 inline-flex h-1.5 w-1.5 align-middle">
      <span className="absolute inline-flex h-full w-full animate-ping bg-white/50" />
      <span className="relative inline-flex h-1.5 w-1.5 bg-white" />
    </span>
  );
}

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative isolate grid h-[100svh] w-full grid-rows-[auto_1fr_auto] overflow-hidden bg-black">
      <div className="absolute inset-0 -z-10 bg-black" aria-hidden>
        <video
          className="h-full w-full scale-[1.55] -translate-x-[25%] translate-y-[4%] object-cover object-center grayscale"
          src={ROBOT_BG}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div
          className="absolute inset-0 hidden sm:block"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.30) 38%, rgba(0,0,0,0.62) 66%, rgba(0,0,0,0.88) 100%), linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 22%, transparent 80%, rgba(0,0,0,0.75) 100%)",
          }}
        />
        <div
          className="absolute inset-0 sm:hidden"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 30%, rgba(0,0,0,0.85) 100%)",
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
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="font-mono text-[clamp(11px,0.78vw,14px)] uppercase tracking-[0.18em] text-white transition-colors duration-[250ms] hover:text-white/60">
                {l.label}
              </Link>
            ))}
          </nav>
          <Link href="/pay" className="hidden border border-white/[0.26] px-[clamp(20px,1.8vw,32px)] py-[clamp(12px,1vw,17px)] font-mono text-[clamp(11px,0.78vw,14px)] uppercase tracking-[0.18em] text-white transition-colors duration-[250ms] hover:border-white/50 hover:bg-white/[0.05] lg:inline-flex">
            Get credit
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobileMenu"
            className="relative h-11 w-11 lg:hidden"
          >
            <span className="absolute left-1/2 h-px w-[22px] -translate-x-1/2 bg-white transition-all duration-[450ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]" style={menuOpen ? { top: "22px", transform: "translateX(-50%) rotate(45deg)" } : { top: "16px" }} />
            <span className="absolute left-1/2 top-[22px] h-px w-[22px] -translate-x-1/2 bg-white transition-all duration-[250ms]" style={menuOpen ? { opacity: 0, transform: "translateX(-50%) scaleX(0)" } : { opacity: 1 }} />
            <span className="absolute left-1/2 h-px w-[22px] -translate-x-1/2 bg-white transition-all duration-[450ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]" style={menuOpen ? { top: "22px", transform: "translateX(-50%) rotate(-45deg)" } : { top: "28px" }} />
          </button>
        </div>
      </header>

      <div
        id="mobileMenu"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        aria-hidden={!menuOpen}
        className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-[rgba(4,4,6,0.94)] backdrop-blur-[28px] backdrop-saturate-150 transition-[clip-path,opacity] duration-[700ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] lg:hidden"
        style={{
          clipPath: menuOpen ? "circle(150% at calc(100% - 42px) 42px)" : "circle(3% at calc(100% - 42px) 42px)",
          opacity: menuOpen ? 1 : 0,
          pointerEvents: menuOpen ? "auto" : "none",
        }}
        onClick={() => setMenuOpen(false)}
      >
        {[...NAV_LINKS.map((l) => ({ ...l, cta: false })), { href: "/pay", label: "Get credit", cta: true }].map((item, i) => (
          <Link
            key={item.label}
            href={item.href}
            onClick={() => setMenuOpen(false)}
            className={item.cta ? "mt-6 border border-white/[0.26] px-10 py-4 font-mono text-[clamp(20px,5.5vw,28px)] uppercase tracking-[0.22em] text-white" : "py-1 font-mono text-[clamp(20px,5.5vw,28px)] uppercase tracking-[0.14em] text-white"}
            style={{
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen ? "translateY(0)" : "translateY(16px)",
              transition: "opacity 0.4s ease, transform 0.5s cubic-bezier(0.16,1,0.3,1)",
              transitionDelay: `${180 + i * 70}ms`,
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <main className="relative z-10 flex min-h-0 overflow-y-auto px-[clamp(20px,5vw,100px)]">
        <div className="m-auto grid w-full max-w-[1180px] items-center gap-[clamp(36px,5vw,72px)] py-[clamp(20px,3vw,40px)] lg:grid-cols-[1.05fr_1fr] lg:gap-[clamp(48px,6vw,96px)]">
          <div className="order-2 lg:order-1">
            <div className="border border-white/[0.14] bg-black/65 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/[0.12] px-6 py-4">
                <span className="flex items-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">
                  <LiveDot /> Live · attested
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Credit line</span>
              </div>
              <div className="p-6 sm:p-8">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Credit available</p>
                <p className="mt-3 text-[clamp(34px,3.6vw,50px)] font-extralight leading-none tracking-tight text-white">
                  0.0095 <span className="text-white/60">sCREDIT</span>
                </p>
                <p className="mt-3 text-[13px] text-white/60">Ready to withdraw · 10% APR on debt</p>
                <div className="mt-7 grid grid-cols-3 gap-px border border-white/[0.12] bg-white/[0.12]">
                  <Cell label="Deposit locked" value="0.01 ETH" hint="On Sepolia" />
                  <Cell label="Credit score" value="82" hint="+5% LTV bonus" />
                  <Cell label="Status" value="ACTIVE" hint="3 verified" />
                </div>
                <div className="mt-7">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
                    <span>LTV · history bonus applied</span>
                    <span>95%</span>
                  </div>
                  <div className="mt-2 h-px w-full bg-white/10">
                    <div className="h-px w-[95%] bg-white" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.12] px-6 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                <span>Sepolia deposit</span>
                <span aria-hidden>→</span>
                <span>Attestcoin</span>
                <span aria-hidden>→</span>
                <span>Creditcoin line</span>
              </div>
            </div>
            <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">
              Sample position · connect a wallet to see yours
            </p>
          </div>

          <div className="order-1 lg:order-2">
            <span className="inline-block self-start bg-white/[0.09] px-[clamp(14px,1.1vw,20px)] py-[clamp(9px,0.8vw,14px)] font-mono text-[clamp(11px,0.72vw,14px)] uppercase leading-none tracking-[0.2em] text-white">
              [ Verified credit ]
            </span>
            <h1 className="mt-[clamp(28px,3vw,52px)] text-[clamp(54px,6.2vw,118px)] font-extralight leading-[0.95] tracking-[0.03em] text-white">
              SPARK
            </h1>
            <p className="mt-[clamp(14px,1.4vw,24px)] font-mono text-[clamp(11px,0.94vw,17px)] font-light uppercase leading-[1.4] tracking-[0.14em] text-white/60">
              Pay once. Unlock credit.
            </p>
            <p className="mt-[clamp(14px,1.4vw,24px)] max-w-sm text-[15px] font-light leading-relaxed text-white/85">
              Pay a small deposit on Sepolia. Attestcoin verifies it on-chain, then a credit line unlocks on Creditcoin. No credit check, no paperwork.
            </p>
            <div className="mt-[clamp(38px,4.6vw,82px)] flex flex-wrap items-center gap-3">
              <Link href="/pay" className="bg-white px-7 py-[clamp(17px,1.6vw,27px)] font-mono text-[clamp(11px,0.78vw,14px)] uppercase tracking-[0.22em] text-black transition-colors duration-[250ms] hover:bg-white/85">
                Get credit
              </Link>
              <Link href="/overview" className="border border-white/[0.26] px-7 py-[clamp(17px,1.6vw,27px)] font-mono text-[clamp(11px,0.78vw,14px)] uppercase tracking-[0.22em] text-white/70 transition-colors duration-[250ms] hover:border-white/50 hover:bg-white/[0.05] hover:text-white">
                Overview
              </Link>
            </div>
            <ol className="mt-[clamp(26px,2.6vw,46px)] flex flex-nowrap items-center gap-x-3 sm:gap-x-4">
              {STEPS.map((s, i) => (
                <li key={s.n} className="flex items-center gap-2">
                  {i > 0 && <span className="mr-1 h-px w-5 bg-white/25" aria-hidden />}
                  <span className="font-mono text-[11px] text-white">{s.n}</span>
                  <span className="text-[13px] text-white/95">{s.t}</span>
                </li>
              ))}
            </ol>
            <p className="mt-[clamp(26px,2.6vw,46px)] self-start text-[13px] text-white/70">
              New here?{" "}
              <Link href="/help" className="text-white underline-offset-4 transition hover:text-white hover:underline">
                How Spark works
              </Link>
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.14] px-[clamp(20px,5vw,100px)] py-[clamp(18px,1.7vw,30px)] text-center">
        <p className="text-[clamp(12px,0.82vw,16px)] font-light leading-[1.5] text-white/60">
          Spark verifies payments on Sepolia and opens credit on Creditcoin. Testnet prototype.
        </p>
      </footer>
    </div>
  );
}
