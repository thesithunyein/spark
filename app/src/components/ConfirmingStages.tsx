export function ConfirmingStages({ step }: { step: 0 | 1 | 2 | 3 | 4 }) {
  const stages = ["Submitted", "Confirming", "Verifying", "Ready"];
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stages.map((label, i) => {
        const n = i + 1;
        const done = step > n;
        const current = step === n;
        return (
          <li key={label} className="flex flex-col gap-2">
            <div
              className={
                done || current ? "h-0.5 rounded-full bg-brand" : "h-0.5 rounded-full bg-white/[0.08]"
              }
            />
            <span className={`text-[12px] ${current || done ? "text-text" : "text-muted"}`}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
