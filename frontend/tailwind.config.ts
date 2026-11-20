import type { Config } from "tailwindcss";

// Colors mirror docs/01_design_system.md (team palette). Never add hex codes elsewhere.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        border: "var(--border)",
        text: { DEFAULT: "var(--text)", muted: "var(--text-muted)" },
        charcoal: "var(--charcoal)",
        brand: { 50: "var(--brand-50)", 600: "var(--brand-600)", 700: "var(--brand-700)" },
        critical: { DEFAULT: "var(--critical)", 50: "var(--critical-50)" },
        ok: { DEFAULT: "var(--ok)", 50: "var(--ok-50)" },
        warn: { 50: "var(--warn-50)" },
        viz: { teal: "var(--viz-teal)", violet: "var(--viz-violet)", ochre: "var(--viz-ochre)" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "ui-monospace", "monospace"] },
      borderRadius: { card: "8px", ctl: "6px" },
    },
  },
  plugins: [],
} satisfies Config;
