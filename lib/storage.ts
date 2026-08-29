import "server-only";
import { promises as fs } from "fs";
import path from "path";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
export const FILE_DRIVER: "blob" | "local" = BLOB_TOKEN ? "blob" : "local";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads");

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
