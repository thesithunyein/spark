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
    <div className="card-hover anim anim-scale-in border border-border bg-panel/80 p-6 shadow-soft">
      <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted transition-colors duration-300 group-hover:text-text/80">
        {label}
      </p>
      {loading ? (
        <div className="shimmer mt-3 space-y-2.5" aria-hidden>
          <div className="h-6 w-24 bg-white/10" />
          <div className="h-3 w-32 bg-white/[0.06]" />
        </div>
      ) : (
        <>
          <p className="mt-3 text-[28px] font-medium leading-none tracking-tight text-text">
            {value}
          </p>
          {hint && <p className="mt-3 text-sm text-muted">{hint}</p>}
        </>
      )}
    </div>
  );
}