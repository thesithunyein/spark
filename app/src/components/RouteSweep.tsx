"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * RouteSweep — a light monochrome sweep across the viewport on every
 * client-side route change. Lives in the root layout so it persists
 * across page mounts (each page renders its own AppShell instance).
 */
export function RouteSweep() {
  const pathname = usePathname();
  const prev = useRef(pathname);
  const [sweepKey, setSweepKey] = useState(0);

  useEffect(() => {
    if (prev.current !== pathname) {
      prev.current = pathname;
      setSweepKey((k) => k + 1);
    }
  }, [pathname]);

  if (sweepKey === 0) return null;

  return <div key={sweepKey} className="route-sweep" aria-hidden />;
}