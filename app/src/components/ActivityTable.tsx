import clsx from "clsx";
import type { ActivityItem } from "@/lib/format";

export function ActivityTable({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted">
        No payments yet
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-panel/80 shadow-soft">
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-3.5 text-[13px]">
            <div className="min-w-0">
              <p className="truncate font-medium text-text">{item.type}</p>
              <p className="mt-0.5 text-[12px] text-muted">{item.at}</p>
            </div>
            <div className="shrink-0 text-right">
              {item.amount && <p className="tabular-nums text-text">{item.amount}</p>}
              <div className="mt-1 flex flex-col items-end gap-0.5">
                <span
                  className={clsx(
                    "text-[11px]",
                    item.status === "Completed" || item.status === "Confirmed"
                      ? "text-success"
                      : item.status === "Pending" || item.status === "Confirming"
                        ? "text-brand"
                        : "text-muted",
                  )}
                >
                  {item.status}
                </span>
                {item.href && (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-muted hover:text-brand hover:underline"
                  >
                    View tx
                  </a>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
