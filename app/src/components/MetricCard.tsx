import clsx from "clsx";

export function MetricCard({
  label,
  value,
  hint,
  glow,
}: {
  label: string;
  value: string;
  hint?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-border bg-panel p-5",
        glow && "relative overflow-hidden shadow-glow",
      )}
    >
      {glow && (
        <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-brand/35 blur-3xl" />
      )}
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-2 text-sm text-success">{hint}</p>}
    </div>
  );
}
