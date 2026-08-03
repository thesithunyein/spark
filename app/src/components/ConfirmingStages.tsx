export function ConfirmingStages({ step }: { step: 0 | 1 | 2 | 3 | 4 }) {
  const stages = ["Submitted", "Confirming payment", "Verifying", "Credit ready"];
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      {stages.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const current = step === n;
        return (
          <li key={label} className="flex items-center gap-2 text-xs">
            <span
              className={
                done || current
                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white"
                  : "flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted"
              }
            >
              {done ? "✓" : n}
            </span>
            <span className={current || done ? "text-text" : "text-muted"}>{label}</span>
            {i < stages.length - 1 && <span className="hidden text-border sm:inline">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
