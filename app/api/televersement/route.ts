import { NextResponse } from "next/server";
import { putFile } from "@/lib/storage";
import { extOf, isAccepted, formatFor } from "@/lib/mime";
import { uid } from "@/lib/ids";
import { signFile } from "@/lib/signing";
import type { FileKind, StoredFile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Vercel caps a request body at 4.5 Mo, so files are sent one at a time. */
const MAX_BYTES = 4 * 1024 * 1024;

const KINDS: FileKind[] = ["cv", "lettre", "autre"];

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Fichier trop volumineux ou illisible." }, { status: 413 });
  }

  const blob = form.get("file");
  const kindRaw = String(form.get("kind") || "autre") as FileKind;
  const kind: FileKind = KINDS.includes(kindRaw) ? kindRaw : "autre";

  if (!(blob instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (blob.size === 0) {
    return NextResponse.json({ error: "Ce fichier est vide." }, { status: 400 });
  }
  if (blob.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Fichier trop lourd : 4 Mo maximum. Compressez-le ou envoyez un PDF." },
      { status: 413 }
    );
  }
  if (!isAccepted(blob.name, blob.type)) {
    return NextResponse.json(
      { error: `Format non accepté (.${extOf(blob.name) || "?"}). Envoyez un PDF, un Word ou une image.` },
      { status: 415 }
    );
  }

  const id = uid();
  const ext = extOf(blob.name) || "bin";
  const now = new Date();
  const key = `candidatures/${now.getFullYear()}/${now.getMonth() + 1}/${id}.${ext}`;
  const buffer = Buffer.from(await blob.arrayBuffer());

  let storedKey: string;
  try {
    storedKey = await putFile(key, buffer, formatFor(blob.name, blob.type).mime);
  } catch (err) {
    console.error("Échec du stockage du fichier", err);
    return NextResponse.json({ error: "L'envoi a échoué. Réessayez." }, { status: 500 });
  }

  const file: StoredFile = {
    id,
    kind,
    name: blob.name.slice(0, 180),
    mime: formatFor(blob.name, blob.type).mime,
    size: blob.size,
    key: storedKey,
    uploadedAt: now.toISOString(),
  };

  return NextResponse.json({ file, signature: signFile(file) });
}
