import { getTheme } from "@/lib/db";
import { derivePalette } from "@/lib/theme";

export const dynamic = "force-dynamic";

/**
 * Le favicon, dessiné à partir du thème.
 *
 * Une enseigne qui change ses couleurs voit son onglet suivre, sans qu'on lui
 * demande un fichier .ico. Quand un logotype officiel a été déposé, c'est lui
 * qui sert ; sinon on compose un carré aux couleurs de la marque, frappé de
 * son initiale.
 *
 * En SVG : un favicon vectoriel reste net sur les écrans à haute densité, et se
 * régénère à chaque changement de charte sans passer par une bibliothèque
 * d'images.
 */
export async function GET(): Promise<Response> {
  const theme = await getTheme();
  const palette = derivePalette(theme);

  const initiale = (theme.logo.mot || theme.nom || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${escaper(theme.nom)}">
  <rect width="64" height="64" rx="16" fill="${palette.primaire}"/>
  <text x="32" y="33" fill="${palette["sur-primaire"]}" font-family="ui-sans-serif, system-ui, sans-serif"
        font-size="38" font-weight="800" text-anchor="middle" dominant-baseline="central">${escaper(initiale)}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Court : un changement de charte doit se voir dans la minute, sans
      // demander au client de vider son cache.
      "cache-control": "public, max-age=60, must-revalidate",
    },
  });
}

/** Le nom d'une enseigne peut contenir & ou < : jamais dans un SVG tel quel. */
function escaper(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
