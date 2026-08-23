export function SimpleChart({ points }: { points: number[] }) {
  const max = Math.max(...points, 1);
  const w = 560;
  const h = 180;
  const pad = 12;
  const coords = points.map((p, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - (p / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  const line = coords.join(" ");
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;

  return (
    <div className=" border border-border bg-panel p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Position snapshot</p>
      {points.every((p) => p === 0) ? (
        <p className="py-12 text-center text-sm text-muted">No position yet</p>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full">
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#sparkFill)" />
          <polyline points={line} fill="none" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
      )}
    </div>
  );
}
