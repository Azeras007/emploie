import "server-only";
import { promises as fs } from "fs";
import path from "path";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
export const FILE_DRIVER: "blob" | "local" = BLOB_TOKEN ? "blob" : "local";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads");

/**
 * Les CV sont déposés en accès privé : ils ne sont lisibles qu'à travers
 * /api/fichiers, qui vérifie la session ou le jeton de partage. Une URL publique,
 * même imprévisible, resterait ouverte à quiconque la récupère.
 */
export async function putFile(key: string, data: Buffer, mime: string): Promise<string> {
  if (FILE_DRIVER === "blob") {
    const { put } = await import("@vercel/blob");
    const res = await put(key, data, {
      access: "private",
      contentType: mime,
      token: BLOB_TOKEN,
      addRandomSuffix: false,
    });
    return res.pathname;
  }
  const dest = path.join(UPLOAD_DIR, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, data);
  return key;
}

export async function readFile(key: string): Promise<Buffer> {
  if (FILE_DRIVER === "blob") {
    const { get } = await import("@vercel/blob");
    const res = await get(key, { access: "private", token: BLOB_TOKEN });
    if (!res?.stream) throw new Error("Document introuvable dans le stockage.");
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }

  // Documents déposés avant le passage au stockage privé.
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
