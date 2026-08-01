"use client";

import { useEffect, useState } from "react";

/**
 * The current-time indicator.
 *
 * Ticks on a 30-second interval rather than every second: a calendar pixel is
 * roughly a minute, so faster updates cost renders and change nothing visible.
 * The interval is also aligned to the wall clock on mount so the line doesn't
 * drift relative to the hour marks over a long session.
 */
export function NowLine({
  dayStartMin,
  dayEndMin,
}: {
  dayStartMin: number;
  dayEndMin: number;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Render nothing on the server pass — the client fills it in after mount,
  // which avoids a hydration mismatch on a value that is different every ms.
  if (!now) return null;

  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  if (minuteOfDay < dayStartMin || minuteOfDay > dayEndMin) return null;

  const ratio = (minuteOfDay - dayStartMin) / (dayEndMin - dayStartMin);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-40"
      style={{ top: `${ratio * 100}%` }}
    >
      <div
        className="h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, var(--accent), rgba(79,209,255,0.25))",
          boxShadow: "0 0 10px var(--accent-glow)",
        }}
      />
      <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] animate-pulse-dot rounded-full bg-accent" />
    </div>
  );
}
