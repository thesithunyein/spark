import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(255,102,0,0.28),_transparent_55%)]" />
      <Image
        src="/brand/logo.png"
        alt="Spark"
        width={88}
        height={88}
        priority
        className="rounded-2xl shadow-glow"
      />
      <h1 className="mt-8 max-w-xl text-4xl font-semibold tracking-tight text-text sm:text-5xl">
        Pay once. Unlock credit.
      </h1>
      <p className="mt-4 max-w-md text-base text-muted sm:text-lg">
        We verify your payment so credit can open—no paperwork chase.
      </p>
      <Link
        href="/pay"
        className="mt-8 inline-flex rounded-xl bg-brand px-8 py-3 text-sm font-semibold text-white shadow-glow transition hover:bg-accent2"
      >
        Get credit
      </Link>
      <ol className="mt-10 grid w-full max-w-lg gap-3 text-left text-sm text-muted sm:grid-cols-3">
        {[
          { n: "1", t: "Pay deposit" },
          { n: "2", t: "We verify it" },
          { n: "3", t: "Credit unlocks" },
        ].map((s) => (
          <li key={s.n} className="rounded-xl border border-border bg-panel/70 px-3 py-3">
            <span className="font-semibold text-brand">{s.n}</span>
            <p className="mt-1 text-text">{s.t}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
