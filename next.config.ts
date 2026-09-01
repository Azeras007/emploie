import type { NextConfig } from "next";

/**
 * L'application est servie sous /candidature, y compris ses routes API et ses
 * fichiers statiques. Elle se greffe ainsi telle quelle sur un domaine Kiabi
 * par une simple réécriture, sans que rien dans le code n'ait à connaître le
 * domaine hôte : `next/link`, `next/image` et `fetch` relatif ajoutent le
 * préfixe d'eux-mêmes.
 *
 * BASE_PATH permet de la servir ailleurs ; la chaîne vide la remet à la racine,
 * et les adresses des QR codes suivent (voir lib/links.ts).
 */
const basePath = process.env.BASE_PATH ?? "/candidature";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  /**
   * Un `next build` lancé pendant qu'un serveur de développement tourne écrase
   * les fragments que celui-ci sert encore, et la page se retrouve sans style,
   * sans script, avec des 404 partout. `npm run verif` bâtit donc ailleurs.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pg", "mammoth", "bcryptjs"],
  // Exposé au navigateur : les <img> et <link> écrits à la main doivent
  // préfixer eux-mêmes leur chemin, contrairement à next/link.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
