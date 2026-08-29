import { getSession } from "@/lib/auth";
import { findApplicantByShareToken, listApplicants } from "@/lib/db";
import { formatFor } from "@/lib/mime";
import { readFile } from "@/lib/storage";
import type { StoredFile } from "@/lib/types";

/**
 * Sert les octets d'un document candidat.
 *
 *   GET /api/fichiers/<fileId>                 → affichage en ligne (admin connecté)
 *   GET /api/fichiers/<fileId>?d=1             → téléchargement forcé
 *   GET /api/fichiers/<fileId>?share=<token>   → accès public via le lien de partage
 *
 * Toute demande non autorisée reçoit un 404 : un 403 confirmerait l'existence
 * de l'identifiant et faciliterait l'énumération des fichiers.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Formats qu'on ne laisse jamais s'afficher en ligne (risque d'exécution dans l'origine). */
const NEVER_INLINE = /^(text\/html|application\/xhtml|image\/svg|text\/xml|application\/xml)/i;

function notFound(): Response {
  return new Response("Fichier introuvable", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Retrouve le fichier et vérifie le droit d'accès.
 * Renvoie `null` dès que l'un des deux échoue — l'appelant ne fait pas la différence.
 */
async function locate(fileId: string, shareToken: string | null): Promise<StoredFile | null> {
  if (!fileId) return null;

  // (b) Accès public : le jeton doit désigner la candidature qui contient ce fichier.
  if (shareToken) {
    const applicant = await findApplicantByShareToken(shareToken);
    const shared = applicant?.files.find((f) => f.id === fileId);
    if (shared) return shared;
  }

  // (a) Accès administrateur : n'importe quel fichier de n'importe quelle candidature.
  const session = await getSession();
  if (!session) return null;

  for (const applicant of await listApplicants()) {
    const found = applicant.files.find((f) => f.id === fileId);
    if (found) return found;
  }
  return null;
}

/** Content-Disposition compatible partout : nom ASCII + variante RFC 5987 accentuée. */
function disposition(file: StoredFile, download: boolean): string {
  const name = file.name.replace(/[\r\n"\\]/g, "_").trim() || "document";
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const kind = download ? "attachment" : "inline";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function headersFor(file: StoredFile, length: number, download: boolean): Headers {
  const mime = file.mime || formatFor(file.name, file.mime).mime;
  // On ne rend jamais en ligne un contenu potentiellement exécutable dans notre origine.
  const forced = download || NEVER_INLINE.test(mime);
  return new Headers({
    "Content-Type": mime,
    "Content-Length": String(length),
    "Content-Disposition": disposition(file, forced),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
}

function readQuery(req: Request): { download: boolean; share: string | null } {
  const url = new URL(req.url);
  return {
    download: url.searchParams.get("d") === "1",
    share: url.searchParams.get("share"),
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const { download, share } = readQuery(req);

  const file = await locate(fileId, share);
  if (!file) return notFound();

  let bytes: Buffer;
  try {
    bytes = await readFile(file.key);
  } catch {
    // Entrée en base sans octets derrière : on reste sur un 404 discret.
    return notFound();
  }

  // `Buffer` est une vue sur un tampon partagé : on recopie pour obtenir un BodyInit valide.
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new Response(body, { status: 200, headers: headersFor(file, bytes.byteLength, download) });
}

/** Mêmes règles que GET, sans corps de réponse. */
export async function HEAD(req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params;
  const { download, share } = readQuery(req);

  const file = await locate(fileId, share);
  if (!file) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });

  return new Response(null, { status: 200, headers: headersFor(file, file.size, download) });
}
