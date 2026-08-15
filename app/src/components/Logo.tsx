import Link from "next/link";
import clsx from "clsx";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={clsx("inline-flex select-none items-center gap-2.5", className)}
      aria-label="Spark home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/hex-logo.svg" alt="" width={28} height={28} className="h-7 w-7" />
      <span className="text-[15px] font-extralight leading-none tracking-[0.16em] text-white">
        SPARK
      </span>
    </Link>
  );
}
