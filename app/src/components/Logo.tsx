import Link from "next/link";
import Image from "next/image";
import clsx from "clsx";

type Props = {
  variant?: "chip" | "wordmark";
  className?: string;
  href?: string;
};

export function Logo({ variant = "wordmark", className, href = "/" }: Props) {
  const inner =
    variant === "chip" ? (
      <Image src="/brand/logo-on-orange.svg" alt="Spark" width={32} height={32} priority />
    ) : (
      <span className="flex items-center gap-2.5">
        <Image src="/brand/logo-on-orange.svg" alt="" width={32} height={32} priority />
        <span className="text-[17px] font-semibold tracking-tight text-text">Spark</span>
      </span>
    );

  return (
    <Link href={href} className={clsx("inline-flex items-center", className)} aria-label="Spark home">
      {inner}
    </Link>
  );
}
