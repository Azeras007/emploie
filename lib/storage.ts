import "server-only";
import { promises as fs } from "fs";
import path from "path";

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
export const FILE_DRIVER: "blob" | "local" = BLOB_TOKEN ? "blob" : "local";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads");

/** Maps a stored key to its bytes, wherever they live. */
export async function putFile(key: string, data: Buffer, mime: string): Promise<string> {
  if (FILE_DRIVER === "blob") {
    const { put } = await import("@vercel/blob");
    const res = await put(key, data, {
      access: "public",
      contentType: mime,
      token: BLOB_TOKEN,
      addRandomSuffix: false,
    });
    return res.url;
  }
  const dest = path.join(UPLOAD_DIR, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, data);
  return key;
}

export async function readFile(keyOrUrl: string): Promise<Buffer> {
  if (/^https?:\/\//.test(keyOrUrl)) {
    const res = await fetch(keyOrUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fichier introuvable (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFile(path.join(UPLOAD_DIR, keyOrUrl));
}

export async function deleteFile(keyOrUrl: string): Promise<void> {
  try {
    if (/^https?:\/\//.test(keyOrUrl)) {
      const { del } = await import("@vercel/blob");
      await del(keyOrUrl, { token: BLOB_TOKEN });
      return;
    }
    await fs.unlink(path.join(UPLOAD_DIR, keyOrUrl));
  } catch {
    /* already gone */
  }
}
