"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

const SPEAK_BG =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_031045_0e1165dd-ab48-46e3-ad3d-5fe77f217647.mp4";

export default function HomePage() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    const play = () => {
      void el.play().catch(() => {});
    };
    play();
    el.addEventListener("canplay", play);
    return () => el.removeEventListener("canplay", play);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <video
          ref={videoRef}
          className="h-full w-full scale-105 object-cover"
          src={SPEAK_BG}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="absolute inset-0 bg-bg/55" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(9,9,11,0.72)_0%,_rgba(9,9,11,0.35)_45%,_transparent_75%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/50 via-transparent to-bg/80" />
      </div>

      <div className="relative z-10 flex flex-col items-center [text-shadow:0_2px_24px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.9)]">
        <Image
          src="/brand/logo.png"
          alt="Spark"
          width={64}
          height={64}
          priority
          className="rounded-[18px] shadow-[0_8px_40px_rgba(0,0,0,0.55)]"
        />

        <p className="mt-8 text-[13px] font-medium tracking-wide text-brand">Spark</p>

        <h1 className="mt-3 max-w-xl text-[40px] font-medium leading-[1.1] tracking-tight text-white sm:text-[52px]">
          Pay once.
          <br />
          Unlock credit.
        </h1>

        <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/85">
          We verify your payment so credit can open. No paperwork chase.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3 [text-shadow:none]">
          <Link
            href="/pay"
            className="inline-flex rounded-full bg-brand px-7 py-3 text-[14px] font-medium text-white transition hover:bg-accent2"
          >
            Get credit
          </Link>
          <Link
            href="/overview"
            className="inline-flex rounded-full border border-white/25 bg-bg/55 px-7 py-3 text-[14px] font-medium text-white backdrop-blur-sm transition hover:bg-bg/70"
          >
            Overview
          </Link>
        </div>

        <ol className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[13px] text-white/75">
          {[
            { n: "01", t: "Pay deposit" },
            { n: "02", t: "We verify" },
            { n: "03", t: "Credit unlocks" },
          ].map((s, i) => (
            <li key={s.n} className="flex items-center gap-3">
              {i > 0 && <span className="mr-5 hidden h-px w-8 bg-white/25 sm:block" aria-hidden />}
              <span className="font-mono text-[11px] text-brand">{s.n}</span>
              <span className="text-white/95">{s.t}</span>
            </li>
          ))}
        </ol>

        <p className="mt-10 text-[13px] text-white/70">
          New here?{" "}
          <Link href="/help" className="text-white underline-offset-4 transition hover:text-brand hover:underline">
            How Spark works
          </Link>
        </p>
      </div>
    </div>
  );
}
