import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#06070A",
        surface: "#0B0D12",
        line: "rgba(255,255,255,0.07)",
        lineBright: "rgba(255,255,255,0.14)",
        accent: {
          DEFAULT: "#4FD1FF",
          dim: "rgba(79,209,255,0.14)",
          glow: "rgba(79,209,255,0.45)",
        },
        warn: "#FFB454",
        danger: "#FF6B6B",
        ok: "#3DDC97",
        ink: {
          DEFAULT: "#EDF1F7",
          soft: "#9BA5B7",
          // 4.9:1 on the near-black canvas. The previous value was 3.4:1, which
          // failed AA for the small text it was used on almost everywhere.
          faint: "#737D8F",
        },
        /** Blocks and tasks with no track. Was hard-coded in five files. */
        untracked: "#7C8598",
      },

      /*
       * Four steps, not nine.
       *
       * The interface previously used 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13,
       * 13.5 and 15px — differences of half a pixel that no one can perceive but
       * which guarantee two supposedly-equal labels never match. A product UI
       * wants a tight fixed scale (ratio ~1.1) and consistent application, not
       * fluid type. 10px is the floor; below that it stops being readable.
       */
      fontSize: {
        micro: ["0.625rem", { lineHeight: "0.8125rem", letterSpacing: "0.01em" }],
        mini: ["0.6875rem", { lineHeight: "0.9375rem" }],
        dense: ["0.75rem", { lineHeight: "1.0625rem" }],
        body: ["0.8125rem", { lineHeight: "1.1875rem" }],
        lede: ["0.9375rem", { lineHeight: "1.3125rem" }],
      },

      /*
       * Semantic stacking order. Arbitrary z-index values (z-[35], z-[90]) are
       * how stacking bugs get born: nothing tells you what a number is competing
       * with. These names are the layering contract.
       */
      zIndex: {
        block: "10",
        marker: "35",
        now: "40",
        sticky: "45",
        drag: "50",
        zoom: "60",
        inspector: "70",
        modal: "80",
        toast: "90",
      },

      fontFamily: {
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SF Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: { xl: "14px", "2xl": "18px" },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.35", transform: "scale(0.8)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 260ms cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in 180ms cubic-bezier(0.16,1,0.3,1) both",
        "pulse-dot": "pulse-dot 2.4s ease-in-out infinite",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
