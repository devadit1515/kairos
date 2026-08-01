/**
 * Shared motion vocabulary.
 *
 * Animation reads as designed rather than decorative when everything shares a
 * small set of curves. Three springs cover the whole app:
 *
 *   snappy  — direct manipulation (drag, hover, press). Must feel instant.
 *   smooth  — layout changes and entrances. Should feel considered.
 *   gentle  — large surfaces (modals, panels). Should feel weighty.
 *
 * Durations are deliberately short. The most common mistake in animated UI is
 * making transitions long enough to notice; the goal is for motion to explain
 * where something came from, then get out of the way.
 */

import type { Transition, Variants } from "motion/react";

export const spring = {
  snappy: { type: "spring", stiffness: 620, damping: 38, mass: 0.6 },
  smooth: { type: "spring", stiffness: 380, damping: 34, mass: 0.9 },
  gentle: { type: "spring", stiffness: 260, damping: 30, mass: 1 },
} satisfies Record<string, Transition>;

export const ease = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Standard entrance: rise slightly and fade. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: spring.smooth },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
};

/** Modal / overlay content. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: spring.gentle },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.14 } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.14 } },
};

/**
 * Stagger children on mount. Kept short — a long stagger over a list of 20
 * items means the last one appears half a second late, which reads as lag.
 */
export function staggerParent(stagger = 0.028, delay = 0): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
}

/** Calendar blocks: scale up from their own origin so they feel placed, not dropped in. */
export const blockIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: spring.smooth },
  exit: { opacity: 0, scale: 0.94, transition: { duration: 0.12 } },
};

export const toastIn: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring.smooth },
  exit: { opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.16 } },
};
