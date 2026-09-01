import { FlatCompat } from "@eslint/eslintrc";

/**
 * Configuration ESLint.
 *
 * Elle manquait, et ESLint n'était pas installé : `next lint` ne lintait donc
 * rien, et `next build` sautait l'étape en silence. Pour un produit qu'on livre
 * à des clients, une vérification qui ne vérifie rien est pire que pas de
 * vérification du tout — elle rassure à tort.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // `next-env.d.ts` est engendré par Next et pointe vers le répertoire de
    // compilation en cours : il change selon qu'on vient de lancer `dev` ou
    // `verif`, et il n'y a rien à y corriger.
    ignores: [".next/**", ".next-verif/**", "node_modules/**", ".data*/**", "next-env.d.ts"],
  },
  {
    rules: {
      /**
       * L'apostrophe non échappée : règle désarmée pour ce seul caractère.
       *
       * Tout le texte de cette application est en français, donc criblé
       * d'apostrophes. Les écrire « &apos; » dans le source rendrait chaque
       * phrase illisible à la relecture, pour un gain nul : l'apostrophe ne
       * casse pas le JSX. Ce sont « > » et « } » qui le cassent, et ceux-là
       * restent des erreurs.
       */
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
    },
  },
];

export default config;
