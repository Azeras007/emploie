import type { Config } from "tailwindcss";

/**
 * Palette et typographie du système de design Kiabi (le « kmn » de kiabi.com) :
 * bleu pétrole pour les actions et la structure, corail pour les accents,
 * gris neutres relevés d'un soupçon de bleu.
 *
 * Les noms sémantiques hérités (primaire, custom1…) sont conservés : ils
 * portent désormais les valeurs Kiabi, et tout le code déjà écrit se retrouve
 * habillé sans être réécrit.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Bleu pétrole : la couleur des boutons et des aplats sombres.
        primaire: "#040037",
        "primaire-hover": "#36335f",
        "primaire-pale": "#e6e6eb",

        // Corail : l'accent. Jamais en aplat sous du texte blanc — son
        // contraste (3,4:1) ne suffirait pas. Voir `corail-fonce`.
        corail: "#ff4529",
        "corail-pale": "#ffecea",
        "corail-fonce": "#b5311d",

        jaune: "#ffda00",
        succes: "#177d35",
        danger: "#e41529",

        // Vert profond, réservé aux profils retenus.
        secondaire: "#00565a",

        custom1: "#4c4c54",
        custom2: "#87878c",
        custom3: "#e2e2e4",

        // Alias sémantiques utilisés dans l'app.
        ink: "#131314",
        paper: "#ffffff",
        rule: "#e2e2e4",
        rule2: "#ededee",
        muted: "#4c4c54",
        hint: "#87878c",
        wash: "#f8f8f8",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: { tightest: "-0.03em", tighter: "-0.02em" },
      maxWidth: { measure: "38rem" },
      // Rayons du système Kiabi : 0,75rem, 1rem, 1,5rem.
      borderRadius: { xs: "0.75rem", s: "1rem", m: "1.5rem" },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(0 0 0 / 0.08)",
        card: "0 0 8px 0 rgb(0 0 0 / 0.12)",
        lift: "0 0 24px 0 rgb(0 0 0 / 0.16)",
      },
    },
  },
  plugins: [],
} satisfies Config;
