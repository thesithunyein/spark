import clsx from "clsx";

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
  glow?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-panel/80 p-6 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-label text-muted">{label}</p>
      <p className="mt-3 text-[28px] font-medium leading-none tracking-tight text-text">{value}</p>
      {hint && <p className="mt-3 text-sm text-muted">{hint}</p>}
    </div>
  );
}
