import type { Config } from "tailwindcss";

/**
 * Le thème n'est plus écrit ici : il vit en base et sort en variables CSS
 * (voir lib/theme.ts). Ce fichier ne fait plus que donner des noms aux jetons.
 *
 * Les couleurs sont déclarées en `rgb(var(--x) / <alpha-value>)` et non en
 * `var(--x)` : c'est la seule forme qui laisse Tailwind composer les opacités.
 * Avec `var(--primaire)`, tous les `bg-primaire/10` du projet tomberaient en
 * silence — la classe serait générée, et n'afficherait rien.
 */
const jeton = (nom: string) => `rgb(var(--${nom}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primaire: jeton("primaire"),
        "primaire-hover": jeton("primaire-hover"),
        "primaire-pale": jeton("primaire-pale"),
        "sur-primaire": jeton("sur-primaire"),

        corail: jeton("corail"),
        "corail-pale": jeton("corail-pale"),
        "corail-fonce": jeton("corail-fonce"),

        secondaire: jeton("secondaire"),
        "sur-secondaire": jeton("sur-secondaire"),

        succes: jeton("succes"),
        danger: jeton("danger"),

        custom1: jeton("custom1"),
        custom2: jeton("custom2"),
        custom3: jeton("custom3"),

        ink: jeton("ink"),
        paper: jeton("paper"),
        wash: jeton("wash"),
        rule: jeton("custom3"),
        muted: jeton("custom1"),
        hint: jeton("custom2"),
      },
      fontFamily: {
        display: ["var(--police-titre)"],
        sans: ["var(--police-texte)"],
        mono: ["var(--police-texte)"],
      },
      letterSpacing: { tightest: "-0.03em", tighter: "-0.02em" },
      maxWidth: { measure: "38rem" },
      borderRadius: {
        champ: "var(--rayon-champ)",
        carte: "var(--rayon-carte)",
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(0 0 0 / 0.08)",
        card: "0 0 8px 0 rgb(0 0 0 / 0.12)",
        lift: "0 0 24px 0 rgb(0 0 0 / 0.16)",
      },
    },
  },
  plugins: [],
} satisfies Config;
