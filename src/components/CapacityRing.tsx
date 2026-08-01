"use client";

import { motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";

/**
 * Load gauge.
 *
 * Shows outstanding work as a proportion of remaining free time. The scale is
 * deliberately non-linear past 100%: once you're over-committed, the exact
 * multiple matters far less than the fact that you are, so the arc saturates
 * and the colour does the talking.
 */
export function CapacityRing({
  load,
  size = 120,
  stroke = 8,
  label,
  sublabel,
}: {
  load: number;
  size?: number;
  stroke?: number;
  label: string;
  sublabel?: string;
}) {
  const reduce = useReducedMotion();
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const clamped = Math.min(load, 1);
  const over = load > 1;

  const tone =
    load > 1 ? "var(--danger)" : load > 0.85 ? "var(--warn)" : "var(--accent)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        // Rotate so the arc starts at 12 o'clock rather than 3.
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 120, damping: 22 }
          }
          style={{ filter: `drop-shadow(0 0 8px ${tone}66)` }}
        />
        {/* Overflow arc: a second, inset ring makes ">100%" legible at a glance
            without inventing a scale nobody can read. */}
        {over && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius - stroke - 2}
            fill="none"
            stroke="var(--danger)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * (radius - stroke - 2)}
            initial={false}
            animate={{
              strokeDashoffset:
                2 * Math.PI * (radius - stroke - 2) * (1 - Math.min(load - 1, 1)),
            }}
            transition={reduce ? { duration: 0 } : { duration: 0.6 }}
            opacity={0.65}
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={clsx("metric text-2xl font-semibold leading-none")}
          style={{ color: tone }}
        >
          {label}
        </span>
        {sublabel && (
          <span className="eyebrow mt-1">{sublabel}</span>
        )}
      </div>
    </div>
  );
}
