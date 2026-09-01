import { getTheme } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Sert le logotype importé, tel qu'il est rangé dans le thème.
 *
 * L'en-tête `Content-Security-Policy` n'est pas une précaution de principe :
 * un SVG est un document, et un SVG hostile déposé ici s'exécuterait dans
 * l'origine de l'application si quelqu'un ouvrait cette adresse directement.
 * Référencé par un <img>, il ne peut rien faire ; visité, il le pourrait. La
 * politique le prive de tout — scripts compris.
 */
export async function GET(): Promise<Response> {
  const theme = await getTheme();
  if (!theme.logo.donnees) {
    return new Response("Aucun logotype n'a été importé.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let octets: Buffer;
  try {
    octets = Buffer.from(theme.logo.donnees, "base64");
  } catch {
    return new Response("Logotype illisible.", { status: 500 });
  }

  return new Response(new Uint8Array(octets), {
    headers: {
      "content-type": theme.logo.type || "application/octet-stream",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
      // L'adresse porte un numéro de version : le contenu peut donc être mis
      // en cache longtemps sans jamais montrer l'ancien logotype.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
