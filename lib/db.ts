import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SETTINGS } from "./defaults";
import * as pg from "./pgStore";
import { filesReport } from "./storage";
import type { Applicant, Invite, Settings, User } from "./types";

/** Forme du fichier JSON de développement. */
interface Shape {
  applicants: Record<string, Applicant>;
  invites: Record<string, Invite>;
  users: Record<string, User>;
  meta: Record<string, unknown>;
}

const EMPTY: Shape = { applicants: {}, invites: {}, users: {}, meta: {} };

/**
 * Vercel laisse préfixer les variables d'une intégration : Neon produit alors
 * STORAGE_DATABASE_URL plutôt que DATABASE_URL. Plutôt que de deviner les noms,
 * on reconnaît les suffixes, quel que soit le préfixe choisi.
 */
const PG_URL_SUFFIXES = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

function isPostgresUrl(value: string): boolean {
  return /^postgres(ql)?:\/\//i.test(value);
}

function findPgUrl(): { url: string; name: string; blankNames: string[] } {
  const blankNames: string[] = [];
  const entries = Object.entries(process.env);

  const value = (name: string): string => (process.env[name] ?? "").trim();

  for (const suffix of PG_URL_SUFFIXES) {
    // Le nom exact d'abord, puis n'importe quel préfixe : STORAGE_DATABASE_URL, etc.
    const candidates = [
      suffix,
      ...entries
        .map(([name]) => name)
        .filter((name) => name !== suffix && name.endsWith(`_${suffix}`))
        .sort(),
    ];

    for (const name of candidates) {
      // NO_SSL désactiverait le chiffrement de la connexion : jamais.
      if (name.includes("NO_SSL")) continue;
      const raw = process.env[name];
      if (raw === undefined) continue;
      const trimmed = value(name);
      if (trimmed === "") {
        if (!blankNames.includes(name)) blankNames.push(name);
      } else if (isPostgresUrl(trimmed)) {
        return { url: trimmed, name, blankNames };
      }
    }
  }

  return { url: "", name: "", blankNames };
}

const { url: PG_URL, name: PG_URL_NAME, blankNames: PG_BLANK_NAMES } = findPgUrl();

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
  if (PG_URL_NAME) lines.push(`Base de données : ${PG_URL_NAME} utilisée`);
  else if (PG_BLANK_NAMES.length > 0)
    lines.push(`Base de données : ${PG_BLANK_NAMES.join(", ")} présente mais vide`);
  else
    lines.push(
      "Base de données : aucune variable reçue (aucun nom finissant par DATABASE_URL ou POSTGRES_URL)"
    );

  lines.push(filesReport());
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
      const schemaProblem = await pg.checkSchema(pool);
      if (schemaProblem) {
        return { ok: false, driver: "postgres", seen: envReport(), problem: schemaProblem };
      }
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
      // Aucune table n'est créée ici : le schéma appartient au dépôt Valeur
      // Ajoutée et vit dans sa migration `20260829180000_add_recruitment`.
      // Une application qui crée ses tables toute seule finit par diverger du
      // schéma que Prisma croit gérer.
      return pool;
    })();
  }
  return poolPromise;
}

/* ------------------------------------------------------------------ *
 * API unifiée
 *
 * Deux implémentations derrière la même surface : les tables relationnelles de
 * la base Valeur Ajoutée en production, un fichier JSON en développement.
 * ------------------------------------------------------------------ */

/** Position et libellé des questions, recopiés avec chaque réponse. */
async function questionMeta(): Promise<Map<string, { label: string; position: number }>> {
  const settings = await getSettings();
  return new Map(
    settings.questions.map((q, i) => [q.id, { label: q.label, position: i + 1 }])
  );
}

/* ---- candidatures ---- */

export async function listApplicants(): Promise<Applicant[]> {
  if (DB_DRIVER === "postgres") return pg.listApplicants(await getPool());
  const db = await readFileDb();
  return Object.values(db.applicants).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getApplicant(id: string): Promise<Applicant | null> {
  if (DB_DRIVER === "postgres") return pg.getApplicant(await getPool(), id);
  const db = await readFileDb();
  return db.applicants[id] ?? null;
}

export async function findApplicantByShareToken(token: string): Promise<Applicant | null> {
  if (DB_DRIVER === "postgres") return pg.findApplicantByShareToken(await getPool(), token);
  const rows = await listApplicants();
  return rows.find((a) => a.shareToken === token) ?? null;
}

export async function saveApplicant(applicant: Applicant): Promise<Applicant> {
  if (DB_DRIVER === "postgres") {
    return pg.saveApplicant(await getPool(), applicant, await questionMeta());
  }
  await mutateFileDb((db) => {
    db.applicants[applicant.id] = applicant;
  });
  return applicant;
}

export async function deleteApplicant(id: string): Promise<void> {
  if (DB_DRIVER === "postgres") return pg.deleteApplicant(await getPool(), id);
  await mutateFileDb((db) => {
    delete db.applicants[id];
  });
}

/* ---- liens d'invitation ---- */

export async function listInvites(): Promise<Invite[]> {
  if (DB_DRIVER === "postgres") return pg.listInvites(await getPool());
  const db = await readFileDb();
  return Object.values(db.invites).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getInviteByToken(token: string): Promise<Invite | null> {
  if (DB_DRIVER === "postgres") return pg.getInviteByToken(await getPool(), token);
  const rows = await listInvites();
  return rows.find((i) => i.token === token) ?? null;
}

export async function saveInvite(invite: Invite): Promise<Invite> {
  if (DB_DRIVER === "postgres") return pg.saveInvite(await getPool(), invite);
  await mutateFileDb((db) => {
    db.invites[invite.id] = invite;
  });
  return invite;
}

export async function deleteInvite(id: string): Promise<void> {
  if (DB_DRIVER === "postgres") return pg.deleteInvite(await getPool(), id);
  await mutateFileDb((db) => {
    delete db.invites[id];
  });
}

/* ---- comptes ---- */

export async function listUsers(): Promise<User[]> {
  if (DB_DRIVER === "postgres") return pg.listUsers(await getPool());
  const db = await readFileDb();
  return Object.values(db.users);
}

export async function findUser(username: string): Promise<User | null> {
  if (DB_DRIVER === "postgres") return pg.findUser(await getPool(), username);
  const rows = await listUsers();
  const needle = username.trim().toLowerCase();
  return rows.find((u) => u.username.toLowerCase() === needle) ?? null;
}

export async function saveUser(user: User): Promise<User> {
  if (DB_DRIVER === "postgres") return pg.saveUser(await getPool(), user);
  await mutateFileDb((db) => {
    db.users[user.id] = user;
  });
  return user;
}

/* ---- réglages ---- */

export async function getSettings(): Promise<Settings> {
  let stored: Settings | null = null;
  try {
    if (DB_DRIVER === "postgres") {
      stored = await pg.getSettings(await getPool());
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
    await pg.saveSettings(await getPool(), settings);
  } else {
    await mutateFileDb((db) => {
      db.meta.settings = settings;
    });
  }
  return settings;
}
