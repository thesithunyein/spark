import clsx from "clsx";
import type { ActivityItem } from "@/lib/format";

export function ActivityTable({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-panel/50 px-5 py-10 text-center text-sm text-muted">
        No payments yet. Pay a deposit to start.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-panel">
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <div>
              <p className="font-medium text-text">{item.type}</p>
              <p className="text-xs text-muted">{item.at}</p>
            </div>
            <div className="text-right">
              {item.amount && <p className="font-mono tabular-nums">{item.amount}</p>}
              <span
                className={clsx(
                  "mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                  item.status === "Completed" || item.status === "Confirmed"
                    ? "bg-success/15 text-success"
                    : item.status === "Pending" || item.status === "Confirming"
                      ? "bg-brand/15 text-brand"
                      : "bg-white/5 text-muted",
                )}
              >
                {item.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
