import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Stockage des documents sur le disque de la machine.
 *
 * Les CV et lettres vivent hors du dépôt : le déploiement recopie l'application
 * et effacerait un dossier situé à l'intérieur. UPLOAD_DIR doit donc désigner un
 * emplacement durable, inclus dans vos sauvegardes.
 */

const APP_DIR = process.cwd();

export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(APP_DIR, ".data", "uploads");

/** Le dossier est-il à l'intérieur de l'application, donc menacé par un déploiement ? */
function isInsideApp(dir: string): boolean {
  const rel = path.relative(APP_DIR, dir);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export class StorageWriteError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "StorageWriteError";
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function putFile(key: string, data: Buffer): Promise<{ key: string }> {
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

export async function readFile(key: string): Promise<Buffer> {
  return fs.readFile(path.join(UPLOAD_DIR, key));
}

export async function deleteFile(key: string): Promise<void> {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, key));
  } catch {
    /* déjà supprimé */
  }
}

/**
 * Le dépôt de documents est-il possible ? Vérifié avant de faire répondre un
 * candidat à dix questions pour échouer à la dernière étape.
 */
export async function filesProblem(): Promise<string | null> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const probe = path.join(UPLOAD_DIR, ".ecriture-test");
    await fs.writeFile(probe, "ok", "utf8");
    await fs.unlink(probe);
  } catch (err) {
    return (
      `Les documents ne peuvent pas être enregistrés : ${UPLOAD_DIR} n'est pas ` +
      `inscriptible (${describe(err)}). Vérifiez les droits sur ce dossier, ou ` +
      `définissez UPLOAD_DIR sur un emplacement accessible.`
    );
  }

  // Un dossier situé dans l'application disparaît au déploiement suivant :
  // les CV déjà reçus seraient perdus sans le moindre message.
  if (process.env.NODE_ENV === "production" && isInsideApp(UPLOAD_DIR)) {
    return (
      `Les documents sont écrits dans ${UPLOAD_DIR}, à l'intérieur de l'application : ` +
      `le prochain déploiement les effacera. Définissez UPLOAD_DIR sur un dossier ` +
      `extérieur au dépôt et inclus dans vos sauvegardes.`
    );
  }

  return null;
}

export function filesReport(): string {
  const risque =
    process.env.NODE_ENV === "production" && isInsideApp(UPLOAD_DIR)
      ? " — dans l'application, effacé au prochain déploiement"
      : "";
  return `Documents : ${UPLOAD_DIR}${risque}`;
}
