import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(255,102,0,0.14),_transparent_55%)]" />

      <Image
        src="/brand/logo.png"
        alt="Spark"
        width={64}
        height={64}
        priority
        className="rounded-[18px]"
      />

      <p className="mt-8 text-[13px] font-medium tracking-wide text-brand">Spark</p>

      <h1 className="mt-3 max-w-xl text-[40px] font-medium leading-[1.1] tracking-tight text-text sm:text-[52px]">
        Pay once.
        <br />
        Unlock credit.
      </h1>

      <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted">
        We verify your payment so credit can open. No paperwork chase.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/pay"
          className="inline-flex rounded-full bg-brand px-7 py-3 text-[14px] font-medium text-white transition hover:bg-accent2"
        >
          Get credit
        </Link>
        <Link
          href="/overview"
          className="inline-flex rounded-full border border-border px-7 py-3 text-[14px] font-medium text-text transition hover:bg-white/[0.03]"
        >
          Overview
        </Link>
      </div>

      <ol className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[13px] text-muted">
        {[
          { n: "01", t: "Pay deposit" },
          { n: "02", t: "We verify" },
          { n: "03", t: "Credit unlocks" },
        ].map((s, i) => (
          <li key={s.n} className="flex items-center gap-3">
            {i > 0 && <span className="mr-5 hidden h-px w-8 bg-border sm:block" aria-hidden />}
            <span className="font-mono text-[11px] text-brand/80">{s.n}</span>
            <span className="text-text/90">{s.t}</span>
          </li>
        ))}
      </ol>

      <p className="mt-10 text-[13px] text-muted">
        New here?{" "}
        <Link href="/help" className="text-text/80 underline-offset-4 transition hover:text-brand hover:underline">
          How Spark works
        </Link>
      </p>
    </div>
  );
}
