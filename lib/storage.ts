import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Comme pour la base, Vercel autorise un préfixe sur les variables d'une
 * intégration : le jeton peut arriver sous STORAGE_BLOB_READ_WRITE_TOKEN.
 * On reconnaît donc le suffixe, quel que soit le préfixe.
 */
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads");

const BLOB_TOKEN_SUFFIX = "BLOB_READ_WRITE_TOKEN";

function findBlobToken(): { token: string; name: string } {
  const exact = (process.env[BLOB_TOKEN_SUFFIX] ?? "").trim();
  if (exact !== "") return { token: exact, name: BLOB_TOKEN_SUFFIX };

  for (const name of Object.keys(process.env).sort()) {
    if (!name.endsWith(`_${BLOB_TOKEN_SUFFIX}`)) continue;
    const value = (process.env[name] ?? "").trim();
    if (value !== "") return { token: value, name };
  }
  return { token: "", name: "" };
}

const { token: BLOB_TOKEN, name: BLOB_TOKEN_NAME } = findBlobToken();

export const FILE_DRIVER: "blob" | "local" = BLOB_TOKEN ? "blob" : "local";
export const BLOB_TOKEN_VAR = BLOB_TOKEN_NAME;

/** Plateformes dont le disque est en lecture seule. */
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/**
 * Le dépôt de documents est-il possible ? Vérifié avant de faire répondre un
 * candidat à dix questions pour échouer à la dernière étape.
 */
export function filesProblem(): string | null {
  if (FILE_DRIVER === "blob") return null;
  if (IS_SERVERLESS) {
    return (
      "Aucun stockage de documents n'est relié : le disque est en lecture seule, les CV ne " +
      "peuvent pas être reçus. Dans Vercel, ouvrez Storage → Blob et reliez le magasin au " +
      "projet, puis redéployez."
    );
  }
  return null;
}

export function filesReport(): string {
  if (FILE_DRIVER === "blob") return `Documents : ${BLOB_TOKEN_NAME} utilisé`;
  if (IS_SERVERLESS)
    return "Documents : aucun jeton reçu (aucun nom finissant par BLOB_READ_WRITE_TOKEN)";
  return `Documents : disque local (${UPLOAD_DIR})`;
}

export type BlobAccess = "public" | "private";

export interface StoredLocation {
  key: string;
  access?: BlobAccess;
}

/** Remonte le message de l'API Blob plutôt qu'un « échec » anonyme. */
export class StorageWriteError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "StorageWriteError";
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Les CV partent en accès privé : ils ne sont alors lisibles qu'à travers
 * /api/fichiers, qui vérifie la session ou le jeton de partage.
 * Si le magasin refuse le mode privé, on bascule en public — l'URL reste
 * imprévisible et n'est jamais exposée au navigateur — et le mode retenu est
 * enregistré avec le document pour que la relecture utilise le bon.
 */
export async function putFile(
  key: string,
  data: Buffer,
  mime: string
): Promise<StoredLocation> {
  if (FILE_DRIVER === "blob") {
    const { put } = await import("@vercel/blob");
    const attempt = async (access: BlobAccess) =>
      put(key, data, {
        access,
        contentType: mime,
        token: BLOB_TOKEN,
        addRandomSuffix: false,
      });

    try {
      const res = await attempt("private");
      return { key: res.pathname, access: "private" };
    } catch (privateErr) {
      console.warn("Dépôt privé refusé, tentative en public", privateErr);
      try {
        const res = await attempt("public");
        return { key: res.pathname, access: "public" };
      } catch (publicErr) {
        throw new StorageWriteError(
          `Le stockage a refusé le document : ${describe(publicErr)} ` +
            `(mode privé également refusé : ${describe(privateErr)})`,
          publicErr
        );
      }
    }
  }

  try {
    const dest = path.join(UPLOAD_DIR, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
    return { key };
  } catch (err) {
    throw new StorageWriteError(
      `Impossible d'écrire dans ${UPLOAD_DIR} : ${describe(err)}`,
      err
    );
  }
}

export async function readFile(key: string, access?: BlobAccess): Promise<Buffer> {
  if (FILE_DRIVER === "blob" && !/^https?:\/\//.test(key)) {
    const { get } = await import("@vercel/blob");
    const res = await get(key, { access: access ?? "private", token: BLOB_TOKEN });
    if (!res?.stream) throw new Error("Document introuvable dans le stockage.");
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }

  // Documents déposés avant le passage au stockage par chemin.
  if (/^https?:\/\//.test(key)) {
    const res = await fetch(key, { cache: "no-store" });
    if (!res.ok) throw new Error(`Document inaccessible (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }

  return fs.readFile(path.join(UPLOAD_DIR, key));
}

export async function deleteFile(key: string): Promise<void> {
  try {
    if (FILE_DRIVER === "blob") {
      const { del } = await import("@vercel/blob");
      await del(key, { token: BLOB_TOKEN });
      return;
    }
    if (/^https?:\/\//.test(key)) return;
    await fs.unlink(path.join(UPLOAD_DIR, key));
  } catch {
    /* déjà supprimé */
  }
}
