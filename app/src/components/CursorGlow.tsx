"use client";

import { useEffect, useRef, useState } from "react";

/**
 * CursorGlow — monochrome pointer ambient effect.
 * - A soft white radial glow that eases toward the cursor (creates "spotlight" ambient)
 * - A thin ring that tracks the cursor and expands over interactive elements
 * - Disabled on touch devices and when prefers-reduced-motion is set
 */
export function CursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduced.matches) return;

    setEnabled(true);

    const pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const glow = { x: pos.x, y: pos.y };
    const ring = { x: pos.x, y: pos.y };
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      const target = e.target as HTMLElement | null;
      const interactive = Boolean(
        target?.closest(
          "a, button, [role='button'], input, textarea, select, label, summary",
        ),
      );
      document.documentElement.classList.toggle("cursor-glow-hover", interactive);
    };

    const onDown = () =>
      document.documentElement.classList.add("cursor-glow-press");
    const onUp = () =>
      document.documentElement.classList.remove("cursor-glow-press");

    const loop = () => {
      // Glow lags further behind for a soft ambient feel; ring is tighter.
      glow.x += (pos.x - glow.x) * 0.11;
      glow.y += (pos.y - glow.y) * 0.11;
      ring.x += (pos.x - ring.x) * 0.42;
      ring.y += (pos.y - ring.y) * 0.42;

      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${glow.x - 300}px, ${glow.y - 300}px, 0)`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.x - 14}px, ${ring.y - 14}px, 0)`;
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${ring.x - 2}px, ${ring.y - 2}px, 0)`;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.documentElement.classList.remove(
        "cursor-glow-hover",
        "cursor-glow-press",
      );
    };
  }, []);

  if (!enabled) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100] hidden md:block">
      {/* Ambient glow */}
      <div
        ref={glowRef}
        className="cg-glow absolute left-0 top-0 h-[600px] w-[600px] opacity-80 will-change-transform"
        style={{
          background:
            "radial-gradient(circle, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.04) 40%, transparent 68%)",
        }}
      />
      {/* Tracking ring (28px, centered via translate3d) */}
      <div
        ref={ringRef}
        className="absolute left-0 top-0 h-[28px] w-[28px] will-change-transform"
      >
        <div className="cg-ring-inner h-full w-full rounded-full border border-white/50 shadow-[0_0_12px_rgba(255,255,255,0.35)]" />
      </div>
      {/* Center dot for a crisp anchor */}
      <div
        ref={dotRef}
        className="absolute left-0 top-0 h-1 w-1 will-change-transform"
      >
        <div className="h-full w-full rounded-full bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
      </div>
    </div>
  );
}