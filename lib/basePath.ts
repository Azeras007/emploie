/**
 * Préfixe sous lequel l'application est servie (/candidature en production).
 *
 * `next/link`, `next/router` et les redirections serveur l'ajoutent d'eux-mêmes.
 * Tout le reste — `fetch`, `<a href>`, `<img src>` écrits à la main — part de la
 * racine du domaine et doit donc le préfixer explicitement, sans quoi les
 * requêtes tombent à côté de l'application.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Chemin absolu vers une route de l'application. */
export function appPath(path: string): string {
  return `${BASE_PATH}${path}`;
}
