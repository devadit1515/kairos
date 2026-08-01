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
          faint: "#5C6577",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SF Mono",
          "JetBrains Mono",
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
