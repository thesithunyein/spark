import clsx from "clsx";
import { Check, Clock, Loader2 } from "lucide-react";
import type { ActivityItem } from "@/lib/format";

function StatusBadge({ status }: { status: string }) {
  const ok = status === "Completed" || status === "Confirmed";
  const pending = status === "Pending" || status === "Confirming";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 text-[11px] font-medium",
        ok && "text-success",
        pending && "text-brand",
        !ok && !pending && "text-muted",
      )}
    >
      {ok ? (
        <Check className="h-3 w-3" strokeWidth={2.5} />
      ) : pending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {status}
    </span>
  );
}

export function ActivityTable({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className=" border border-dashed border-border px-5 py-10 text-center text-[13px] text-muted">
        No payments yet
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-border bg-panel/80 shadow-soft">
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
                <StatusBadge status={item.status} />
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
