import clsx from "clsx";

export function MetricCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  glow?: boolean;
  loading?: boolean;
}) {
  return (
    <div className=" border border-border bg-panel/80 p-6 shadow-soft">
      <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">{label}</p>
      {loading ? (
        <div className="mt-3 space-y-2.5" aria-hidden>
          <div className="h-6 w-24 animate-pulse bg-white/10" />
          <div className="h-3 w-32 animate-pulse bg-white/[0.06]" />
        </div>
      ) : (
        <>
          <p className="mt-3 text-[28px] font-medium leading-none tracking-tight text-text">{value}</p>
          {hint && <p className="mt-3 text-sm text-muted">{hint}</p>}
        </>
      )}
    </div>
  );
}
