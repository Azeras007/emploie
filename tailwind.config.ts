import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0B0C",
        paper: "#FFFFFF",
        rule: "#E4E4E4",
        rule2: "#F0F0F0",
        muted: "#6E6E73",
        wash: "#F6F6F6",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: { tightest: "-0.045em", tighter: "-0.03em" },
      maxWidth: { measure: "38rem" },
    },
  },
  plugins: [],
} satisfies Config;
