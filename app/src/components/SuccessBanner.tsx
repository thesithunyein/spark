import { Check } from "lucide-react";
import type { ReactNode } from "react";

type SuccessBannerProps = {
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  actions?: ReactNode;
};

export function SuccessBanner({
  title,
  description,
  href,
  hrefLabel = "View transaction",
  actions,
}: SuccessBannerProps) {
  return (
    <div className="rounded-xl border border-success/30 bg-success/10 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-text">{title}</p>
          {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
          {href && (
            <a
              className="mt-2 inline-block break-all text-[12px] font-medium text-brand hover:underline"
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {hrefLabel}
            </a>
          )}
          {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
