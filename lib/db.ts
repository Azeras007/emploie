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

const PG_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

export const DB_DRIVER: "postgres" | "file" = PG_URL ? "postgres" : "file";

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
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
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
      const pool = new Pool({
        connectionString: PG_URL,
        ssl: /localhost|127\.0\.0\.1/.test(PG_URL) ? undefined : { rejectUnauthorized: false },
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
  if (DB_DRIVER === "postgres") {
    stored = await pgGet<Settings>("meta", "settings");
  } else {
    const db = await readFileDb();
    stored = (db.meta.settings as Settings) ?? null;
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
