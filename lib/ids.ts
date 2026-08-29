import { randomBytes, randomUUID } from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function uid(): string {
  return randomUUID();
}

export function token(length = 24): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

/** Human-readable file reference, e.g. C-2608-4F7K */
export function makeRef(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const bytes = randomBytes(4);
  let tail = "";
  for (let i = 0; i < 4; i++) tail += ALPHABET[bytes[i] % ALPHABET.length];
  return `C-${dd}${mm}-${tail}`;
}
