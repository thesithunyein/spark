import { Check } from "lucide-react";
import clsx from "clsx";

export function ConfirmingStages({ step }: { step: 0 | 1 | 2 | 3 | 4 }) {
  const stages = ["Submitted", "Confirming", "Verifying", "Ready"];

  return (
    <ol className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stages.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const current = step === n;
        const upcoming = step < n;

        return (
          <li key={label} className="flex flex-col items-center gap-2 text-center">
            <span
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-medium transition",
                done && "bg-success/20 text-success",
                current && "bg-brand/20 text-brand ring-2 ring-brand/40",
                upcoming && "border border-border bg-white/[0.02] text-muted",
              )}
            >
              {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : n}
            </span>
            <span
              className={clsx(
                "text-[11px] leading-tight",
                done && "font-medium text-success",
                current && "font-medium text-text",
                upcoming && "text-muted",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
