import { createHmac, timingSafeEqual } from "crypto";
import type { StoredFile } from "./types";

function key(): string {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AUTH_SECRET est absent : impossible de signer les documents téléversés. " +
          "Ajoutez une variable d'environnement AUTH_SECRET et redéployez."
      );
    }
    return "developpement-local-uniquement";
  }
  return value;
}

/** Files are uploaded before the form is submitted, so the descriptor that comes
 *  back with the submission is signed to prove the server issued it. */
export function signFile(file: StoredFile): string {
  const payload = [file.id, file.key, file.mime, file.size, file.name].join("|");
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function verifyFile(file: StoredFile, signature: string): boolean {
  const expected = Buffer.from(signFile(file));
  const given = Buffer.from(String(signature || ""));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
