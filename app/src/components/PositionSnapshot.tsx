import { formatEth } from "@/lib/format";

type Props = {
  deposit: bigint;
  credit: bigint;
  debt: bigint;
  empty?: boolean;
};

export function PositionSnapshot({ deposit, credit, debt, empty }: Props) {
  if (empty) {
    return (
      <div className="rounded-2xl border border-border bg-panel/80 p-6 shadow-soft">
        <p className="text-[11px] font-medium uppercase tracking-label text-muted">Position</p>
        <p className="mt-8 text-sm text-muted">No open position yet.</p>
      </div>
    );
  }

  const available = credit > debt ? credit - debt : 0n;
  const rows = [
    { label: "Deposit", value: deposit, tone: "bg-white/20" },
    { label: "Credit", value: credit, tone: "bg-brand" },
    { label: "Debt", value: debt, tone: "bg-white/40" },
    { label: "Available", value: available, tone: "bg-success" },
  ];
  const max = Math.max(...rows.map((r) => Number(r.value)), 1);

  return (
    <div className="rounded-2xl border border-border bg-panel/80 p-6 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-label text-muted">Position</p>
      <ul className="mt-6 space-y-5">
        {rows.map((row) => {
          const pct = Math.max(2, (Number(row.value) / max) * 100);
          return (
            <li key={row.label}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="text-[13px] text-muted">{row.label}</span>
                <span className="text-[13px] font-medium tabular-nums text-text">
                  {formatEth(row.value)} ETH
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
