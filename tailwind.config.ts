import type { Config } from "tailwindcss";

/**
 * Palette et typographie reprises de Valeur Ajoutée
 * (src/app/globals.css du site principal) : orange de marque, vert foncé,
 * gris neutres. Les noms sémantiques d'origine sont conservés à côté pour
 * que le code déjà écrit continue de fonctionner.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primaire: "#f46f40",
        "primaire-hover": "#d95a2e",
        secondaire: "#234737",
        custom1: "#5b5b5b",
        custom2: "#a0a0a0",
        custom3: "#dbdbdb",

        // Alias sémantiques utilisés dans l'app.
        ink: "#000000",
        paper: "#ffffff",
        rule: "#dbdbdb",
        rule2: "#ededed",
        muted: "#5b5b5b",
        hint: "#a0a0a0",
        wash: "#f7f7f7",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: { tightest: "-0.03em", tighter: "-0.02em" },
      maxWidth: { measure: "38rem" },
      boxShadow: {
        soft: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        card: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        lift: "0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
