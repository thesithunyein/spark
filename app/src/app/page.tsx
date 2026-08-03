import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(255,102,0,0.2),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(168,85,247,0.12),_transparent_50%)]" />
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
        href="/overview"
        className="mt-8 inline-flex rounded-xl bg-gradient-to-r from-accent to-accent2 px-8 py-3 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
      >
        Get credit
      </Link>
      <p className="mt-4 text-xs text-muted">Demo funds on test network</p>
    </div>
  );
}
