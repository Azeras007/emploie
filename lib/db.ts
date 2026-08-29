import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SETTINGS } from "./defaults";
import type { Applicant, Invite, Settings, User } from "./types";

type Collection = "applicants" | "invites" | "users" | "meta";

interface Shape {
  applicants: Record<string, Applicant>;
  invites: Record<string, Invite>;
  users: Record<string, User>;
  meta: Record<string, unknown>;
}

const EMPTY: Shape = { applicants: {}, invites: {}, users: {}, meta: {} };

/** Noms de variables utilisés par Vercel, Neon et Supabase, par ordre de préférence. */
const PG_ENV_NAMES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "STORAGE_URL",
  "NEON_DATABASE_URL",
] as const;

function findPgUrl(): { url: string; blankNames: string[] } {
  const blankNames: string[] = [];
  for (const name of PG_ENV_NAMES) {
    const raw = process.env[name];
    if (raw === undefined) continue;
    const value = raw.trim();
    // Une variable présente mais vide est un piège : elle empêche Vercel d'en créer
    // une bonne, sans pour autant relier quoi que ce soit.
    if (value === "") blankNames.push(name);
    else return { url: value, blankNames };
  }
  return { url: "", blankNames };
}

const { url: PG_URL, blankNames: PG_BLANK_NAMES } = findPgUrl();

export const DB_DRIVER: "postgres" | "file" = PG_URL ? "postgres" : "file";

/** Vercel, et les plateformes du même genre, servent un disque en lecture seule. */
export const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/** Erreur de stockage dont le message est destiné à être lu par un humain. */
export class StorageError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "StorageError";
  }
}

export interface StorageStatus {
  ok: boolean;
  driver: "postgres" | "file";
  problem?: string;
  /** Ce que le serveur voit vraiment — noms de variables uniquement, jamais de valeurs. */
  seen?: string[];
}

/** Inventaire des variables de configuration, sans jamais divulguer leur contenu. */
export function envReport(): string[] {
  const lines: string[] = [];
  const set = PG_ENV_NAMES.filter((n) => (process.env[n] ?? "").trim() !== "");
  if (set.length > 0) lines.push(`Base de données : ${set.join(", ")} présente`);
  else if (PG_BLANK_NAMES.length > 0) lines.push(`Base de données : ${PG_BLANK_NAMES.join(", ")} présente mais vide`);
  else lines.push("Base de données : aucune variable reçue (ni DATABASE_URL, ni POSTGRES_URL, ni STORAGE_URL)");

  lines.push(
    (process.env.BLOB_READ_WRITE_TOKEN ?? "").trim() !== ""
      ? "Documents : BLOB_READ_WRITE_TOKEN présent"
      : "Documents : BLOB_READ_WRITE_TOKEN absent"
  );
  lines.push(
    (process.env.AUTH_SECRET ?? "").trim() !== ""
      ? "Sessions : AUTH_SECRET présent"
      : "Sessions : AUTH_SECRET absent"
  );
  return lines;
}

/** Vérifie que les données peuvent réellement être écrites, sans rien enregistrer. */
export async function storageStatus(): Promise<StorageStatus> {
  if (DB_DRIVER === "postgres") {
    try {
      const pool = await getPool();
      await pool.query("select 1");
      return { ok: true, driver: "postgres" };
    } catch (err) {
      return {
        ok: false,
        driver: "postgres",
        seen: envReport(),
        problem:
          "La base de données ne répond pas : " +
          (err instanceof Error ? err.message : String(err)) +
          ". Vérifiez DATABASE_URL.",
      };
    }
  }

  if (PG_BLANK_NAMES.length > 0) {
    return {
      ok: false,
      driver: "file",
      seen: envReport(),
      problem:
        `La variable ${PG_BLANK_NAMES.join(" et ")} existe mais est vide, donc aucune base n'est ` +
        "reliée. Supprimez-la dans Settings → Environment Variables, puis reliez la base " +
        "(Storage → Neon → Connect Project) : Vercel la recréera avec la bonne valeur.",
    };
  }

  if (IS_SERVERLESS) {
    return {
      ok: false,
      driver: "file",
      seen: envReport(),
      problem:
        "Aucune base de données n'est reliée. Ici le disque est en lecture seule : ni les comptes " +
        "ni les candidatures ne peuvent être enregistrés. Dans Vercel, ouvrez Storage → " +
        "Marketplace Database Providers → Neon, créez une base Postgres et reliez-la au projet, " +
        "puis redéployez.",
    };
  }

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const probe = path.join(DATA_DIR, ".ecriture-test");
    await fs.writeFile(probe, "ok", "utf8");
    await fs.unlink(probe);
    return { ok: true, driver: "file" };
  } catch {
    return {
      ok: false,
      driver: "file",
      seen: envReport(),
      problem: `Impossible d'écrire dans ${DATA_DIR}. Vérifiez les droits sur ce dossier.`,
    };
  }
}

/* ------------------------------------------------------------------ *
 * File driver — zero-config local development.
 * ------------------------------------------------------------------ */

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let writeChain: Promise<unknown> = Promise.resolve();

async function readFileDb(): Promise<Shape> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return { ...EMPTY, ...(JSON.parse(raw) as Shape) };
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeFileDb(next: Shape): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(tmp, DB_FILE);
  } catch (cause) {
    throw new StorageError(
      IS_SERVERLESS
        ? "Aucune base de données n'est reliée et le disque est en lecture seule : rien ne peut être enregistré. Reliez un stockage Postgres au projet, puis redéployez."
        : `Impossible d'écrire dans ${DATA_DIR}. Vérifiez les droits sur ce dossier.`,
      cause
    );
  }
}

function mutateFileDb<T>(fn: (db: Shape) => T | Promise<T>): Promise<T> {
  const run = writeChain.then(async () => {
    const db = await readFileDb();
    const result = await fn(db);
    await writeFileDb(db);
    return result;
  });
  writeChain = run.catch(() => undefined);
  return run;
}

/* ------------------------------------------------------------------ *
 * Postgres driver — a single jsonb document table, no migrations.
 * ------------------------------------------------------------------ */

type PgPool = import("pg").Pool;
let poolPromise: Promise<PgPool> | null = null;

async function getPool(): Promise<PgPool> {
  if (!poolPromise) {
    poolPromise = (async () => {
      const { Pool } = await import("pg");
      const local = /localhost|127\.0\.0\.1/.test(PG_URL);
      const pool = new Pool({
        connectionString: PG_URL,
        // Neon et Supabase présentent des certificats valides : on les vérifie.
        // PGSSL_NO_VERIFY=1 relâche la vérification pour un serveur auto-signé.
        ssl: local
          ? undefined
          : { rejectUnauthorized: process.env.PGSSL_NO_VERIFY !== "1" },
        max: 3,
      });
      await pool.query(
        `create table if not exists documents (
           collection text not null,
           id text not null,
           doc jsonb not null,
           primary key (collection, id)
         )`
      );
      return pool;
    })();
  }
  return poolPromise;
}

async function pgAll<T>(collection: Collection): Promise<T[]> {
  const pool = await getPool();
  const { rows } = await pool.query<{ doc: T }>(
    "select doc from documents where collection = $1",
    [collection]
  );
  return rows.map((r) => r.doc);
}

async function pgGet<T>(collection: Collection, id: string): Promise<T | null> {
  const pool = await getPool();
  const { rows } = await pool.query<{ doc: T }>(
    "select doc from documents where collection = $1 and id = $2",
    [collection, id]
  );
  return rows[0]?.doc ?? null;
}

async function pgPut<T>(collection: Collection, id: string, doc: T): Promise<T> {
  const pool = await getPool();
  await pool.query(
    `insert into documents (collection, id, doc) values ($1, $2, $3)
     on conflict (collection, id) do update set doc = excluded.doc`,
    [collection, id, JSON.stringify(doc)]
  );
  return doc;
}

async function pgDelete(collection: Collection, id: string): Promise<void> {
  const pool = await getPool();
  await pool.query("delete from documents where collection = $1 and id = $2", [collection, id]);
}

/* ------------------------------------------------------------------ *
 * Unified API
 * ------------------------------------------------------------------ */

async function all<K extends Exclude<Collection, "meta">>(
  collection: K
): Promise<Shape[K][string][]> {
  if (DB_DRIVER === "postgres") return pgAll(collection);
  const db = await readFileDb();
  return Object.values(db[collection]) as Shape[K][string][];
}

async function get<K extends Exclude<Collection, "meta">>(
  collection: K,
  id: string
): Promise<Shape[K][string] | null> {
  if (DB_DRIVER === "postgres") return pgGet(collection, id);
  const db = await readFileDb();
  return (db[collection][id] as Shape[K][string]) ?? null;
}

async function put<K extends Exclude<Collection, "meta">>(
  collection: K,
  id: string,
  doc: Shape[K][string]
): Promise<Shape[K][string]> {
  if (DB_DRIVER === "postgres") return pgPut(collection, id, doc);
  await mutateFileDb((db) => {
    (db[collection] as Record<string, unknown>)[id] = doc;
  });
  return doc;
}

async function remove(collection: Exclude<Collection, "meta">, id: string): Promise<void> {
  if (DB_DRIVER === "postgres") return pgDelete(collection, id);
  await mutateFileDb((db) => {
    delete (db[collection] as Record<string, unknown>)[id];
  });
}

/* ---- applicants ---- */

export async function listApplicants(): Promise<Applicant[]> {
  const rows = await all("applicants");
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getApplicant(id: string): Promise<Applicant | null> {
  return get("applicants", id);
}

export async function findApplicantByShareToken(token: string): Promise<Applicant | null> {
  const rows = await listApplicants();
  return rows.find((a) => a.shareToken === token) ?? null;
}

export async function saveApplicant(applicant: Applicant): Promise<Applicant> {
  return put("applicants", applicant.id, applicant);
}

export async function deleteApplicant(id: string): Promise<void> {
  return remove("applicants", id);
}

/* ---- invites ---- */

export async function listInvites(): Promise<Invite[]> {
  const rows = await all("invites");
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getInviteByToken(token: string): Promise<Invite | null> {
  const rows = await all("invites");
  return rows.find((i) => i.token === token) ?? null;
}

export async function saveInvite(invite: Invite): Promise<Invite> {
  return put("invites", invite.id, invite);
}

export async function deleteInvite(id: string): Promise<void> {
  return remove("invites", id);
}

/* ---- users ---- */

export async function listUsers(): Promise<User[]> {
  return all("users");
}

export async function findUser(username: string): Promise<User | null> {
  const rows = await all("users");
  const needle = username.trim().toLowerCase();
  return rows.find((u) => u.username.toLowerCase() === needle) ?? null;
}

export async function saveUser(user: User): Promise<User> {
  return put("users", user.id, user);
}

/* ---- settings ---- */

export async function getSettings(): Promise<Settings> {
  let stored: Settings | null = null;
  try {
    if (DB_DRIVER === "postgres") {
      stored = await pgGet<Settings>("meta", "settings");
    } else {
      const db = await readFileDb();
      stored = (db.meta.settings as Settings) ?? null;
    }
  } catch (err) {
    console.error("Lecture des réglages impossible, valeurs par défaut utilisées", err);
    return structuredClone(DEFAULT_SETTINGS);
  }
  if (!stored) return structuredClone(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    questions: stored.questions?.length ? stored.questions : DEFAULT_SETTINGS.questions,
    rules: stored.rules ?? DEFAULT_SETTINGS.rules,
  };
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  if (DB_DRIVER === "postgres") {
    await pgPut("meta", "settings", settings);
  } else {
    await mutateFileDb((db) => {
      db.meta.settings = settings;
    });
  }
  return settings;
}
