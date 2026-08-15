import Link from "next/link";
import clsx from "clsx";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex select-none items-center text-[15px] font-extralight leading-none tracking-[0.16em] text-white",
        className,
      )}
      aria-label="Spark home"
    >
      SPARK
    </Link>
  );
}
