import { NextResponse } from "next/server";
import { sessionAvec } from "@/lib/auth";
import { getTheme, oublierTheme, saveTheme } from "@/lib/db";
import { uid } from "@/lib/ids";
import { recupererOctets, UrlRefusee } from "@/lib/reseau";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Import du logotype : depuis une adresse repérée par l'analyse, ou depuis un
 * fichier choisi sur le poste.
 *
 * Deux chemins, une seule validation : le type doit figurer dans la liste
 * blanche, et le poids rester sous 256 Ko. Le tout est rangé en base64 dans le
 * thème — voir lib/theme.ts pour la raison.
 */

const TYPES = new Map<string, string>([
  ["image/svg+xml", "svg"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const TAILLE_MAX = 256 * 1024;

export async function POST(request: Request) {
  const session = await sessionAvec("marque");
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";

  try {
    const { octets, type } =
      contentType.includes("multipart/form-data")
        ? await depuisFormulaire(request)
        : await depuisAdresse(request);

    if (octets.byteLength === 0) {
      return NextResponse.json({ error: "Le fichier reçu est vide." }, { status: 400 });
    }
    if (octets.byteLength > TAILLE_MAX) {
      return NextResponse.json(
        {
          error: `Logotype trop lourd (${Math.round(octets.byteLength / 1024)} Ko). Maximum : 256 Ko.`,
        },
        { status: 413 }
      );
    }

    const theme = await getTheme();
    const enregistre = await saveTheme({
      ...theme,
      logo: {
        ...theme.logo,
        // Un fichier importé prend la main sur un chemin saisi à la main :
        // sans quoi l'import serait sans effet visible, ce qui déroute.
        fichier: "",
        donnees: Buffer.from(octets).toString("base64"),
        type,
        version: uid().slice(0, 8),
      },
    });
    oublierTheme();

    return NextResponse.json({
      ok: true,
      logo: {
        type,
        version: enregistre.logo.version,
        taille: octets.byteLength,
      },
    });
  } catch (err) {
    if (err instanceof UrlRefusee || err instanceof RefusImport) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: `Import impossible : ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}

class RefusImport extends Error {}

async function depuisFormulaire(request: Request): Promise<{ octets: ArrayBuffer; type: string }> {
  const form = await request.formData();
  const fichier = form.get("fichier");
  if (!(fichier instanceof File)) {
    throw new RefusImport("Aucun fichier reçu.");
  }
  const type = fichier.type.split(";")[0].trim().toLowerCase();
  if (!TYPES.has(type)) {
    throw new RefusImport(`Format refusé (${type || "inconnu"}). Attendu : SVG, PNG, JPEG, WebP ou GIF.`);
  }
  return { octets: await fichier.arrayBuffer(), type };
}

async function depuisAdresse(request: Request): Promise<{ octets: ArrayBuffer; type: string }> {
  let corps: { url?: unknown };
  try {
    corps = (await request.json()) as { url?: unknown };
  } catch {
    throw new RefusImport("Corps de requête illisible.");
  }
  const brut = typeof corps.url === "string" ? corps.url.trim() : "";
  if (!brut) throw new RefusImport("Indiquez l'adresse du logotype.");

  // Le même garde-fou que l'analyse — une adresse saisie ne doit jamais pouvoir
  // viser le réseau interne — et la même lecture bornée : `Content-Length` peut
  // mentir ou manquer, seuls les octets réellement reçus font foi.
  const adresse = /^https?:\/\//i.test(brut) ? brut : `https://${brut}`;
  const { octets, typeMime, tronque, url } = await recupererOctets(adresse, TAILLE_MAX);

  if (tronque) {
    throw new RefusImport("Logotype trop lourd : la lecture s'est arrêtée à 256 Ko.");
  }

  // Certains serveurs rendent un SVG en text/plain ou en octet-stream :
  // l'extension tranche quand l'en-tête ne dit rien d'utile.
  const type = TYPES.has(typeMime)
    ? typeMime
    : /\.svg(\?|$)/i.test(new URL(url).pathname)
      ? "image/svg+xml"
      : "";
  if (!type) {
    throw new RefusImport(
      `Format refusé (${typeMime || "inconnu"}). Attendu : SVG, PNG, JPEG, WebP ou GIF.`
    );
  }
  return { octets: octets.buffer.slice(0, octets.byteLength) as ArrayBuffer, type };
}
