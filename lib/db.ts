import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SETTINGS } from "./defaults";
import * as pg from "./pgStore";
import { MIGRATION_HINT } from "./schema";
import { normaliserTheme, THEME_PAR_DEFAUT, type Theme } from "./theme";
import { filesReport } from "./storage";
import type { Applicant, EmailEntry, Invite, Settings, Store, User } from "./types";

/** Forme du fichier JSON de développement. */
interface Shape {
  applicants: Record<string, Applicant>;
  invites: Record<string, Invite>;
  users: Record<string, User>;
  stores: Record<string, Store>;
  emails: EmailEntry[];
  meta: Record<string, unknown>;
}

const EMPTY: Shape = { applicants: {}, invites: {}, users: {}, stores: {}, emails: [], meta: {} };

/**
 * Certains hébergeurs préfixent les variables d'une intégration
 * (STORAGE_DATABASE_URL plutôt que DATABASE_URL). Plutôt que de deviner les
 * noms, on reconnaît les suffixes, quel que soit le préfixe.
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

/** Plateformes sans disque inscriptible durable (Vercel, Lambda…). */
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
      const schemaProblem = schemaError ?? (await pg.checkSchema(pool));
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
        `La variable ${PG_BLANK_NAMES.join(" et ")} existe mais est vide, donc aucune base ` +
        "n'est reliée. Renseignez-la avec l'adresse de la base des candidatures, puis " +
        "redémarrez l'application.",
    };
  }

  if (IS_SERVERLESS) {
    return {
      ok: false,
      driver: "file",
      seen: envReport(),
      problem:
        "Aucune base de données n'est reliée, et le disque de cette plateforme est éphémère : " +
        "ni les comptes ni les candidatures ne seraient conservés. Renseignez DATABASE_URL avec " +
        "l'adresse d'une base Postgres.",
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

/** Renseigné si la création du schéma a échoué — affiché dans l'état du stockage. */
let schemaError: string | null = null;

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
      // L'application est seule maîtresse de sa base : elle crée ses tables
      // au premier démarrage, une bonne fois. Le script est rejouable, donc
      // les démarrages suivants ne coûtent qu'un aller-retour.
      //
      // Un échec ici n'empêche pas d'ouvrir le pool : c'est presque toujours
      // un manque de droits, et le message a plus de valeur affiché dans
      // l'écran d'état du back-office qu'en trace de démarrage.
      try {
        await pg.ensureSchema(pool);
      } catch (err) {
        schemaError = `${MIGRATION_HINT} Erreur : ${err instanceof Error ? err.message : String(err)}`;
      }
      return pool;
    })();
  }
  return poolPromise;
}

/* ------------------------------------------------------------------ *
 * API unifiée
 *
 * Deux implémentations derrière la même surface : les tables relationnelles de
 * Postgres en production, un fichier JSON en développement.
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

export async function getUser(id: string): Promise<User | null> {
  if (DB_DRIVER === "postgres") return pg.getUser(await getPool(), id);
  const db = await readFileDb();
  return db.users[id] ?? null;
}

export async function deleteUser(id: string): Promise<void> {
  if (DB_DRIVER === "postgres") return pg.deleteUser(await getPool(), id);
  await mutateFileDb((db) => {
    delete db.users[id];
  });
}

export async function saveUser(user: User): Promise<User> {
  if (DB_DRIVER === "postgres") return pg.saveUser(await getPool(), user);
  await mutateFileDb((db) => {
    db.users[user.id] = user;
  });
  return user;
}

/* ---- magasins ---- */

export async function listStores(): Promise<Store[]> {
  if (DB_DRIVER === "postgres") return pg.listStores(await getPool());
  const db = await readFileDb();
  return Object.values(db.stores ?? {}).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function saveStore(store: Store): Promise<Store> {
  if (DB_DRIVER === "postgres") return pg.saveStore(await getPool(), store);
  await mutateFileDb((db) => {
    db.stores = db.stores ?? {};
    db.stores[store.id] = store;
  });
  return store;
}

export async function deleteStore(id: string): Promise<void> {
  if (DB_DRIVER === "postgres") return pg.deleteStore(await getPool(), id);
  await mutateFileDb((db) => {
    delete db.stores?.[id];
    // Le pilote fichier n'a pas de clé étrangère : on détache à la main, pour
    // que les deux implémentations se comportent pareil.
    for (const candidature of Object.values(db.applicants)) {
      if (candidature.storeId === id) candidature.storeId = null;
    }
    for (const lien of Object.values(db.invites)) {
      if (lien.storeId === id) lien.storeId = null;
    }
  });
}

/* ---- journal des envois ---- */

export async function logEmail(entree: EmailEntry): Promise<void> {
  if (DB_DRIVER === "postgres") return pg.logEmail(await getPool(), entree);
  await mutateFileDb((db) => {
    db.emails = db.emails ?? [];
    db.emails.unshift(entree);
    // En développement, le journal n'a pas vocation à croître sans fin.
    db.emails = db.emails.slice(0, 500);
  });
}

export async function listEmails(limite = 200): Promise<EmailEntry[]> {
  if (DB_DRIVER === "postgres") return pg.listEmails(await getPool(), limite);
  const db = await readFileDb();
  return (db.emails ?? []).slice(0, limite);
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

/* ---- thème ---- */

/**
 * Le thème est lu à chaque rendu de page. Un aller-retour en base par requête
 * serait du gaspillage pour un document qui change une fois par trimestre : on
 * le garde en mémoire trente secondes, et la sauvegarde vide le cache
 * elle-même pour que l'aperçu soit immédiat.
 *
 * Trente secondes, et non « pour toujours » : plusieurs processus PM2 peuvent
 * servir la même application, et seul celui qui a enregistré connaît le
 * changement. Le délai borne l'écart.
 */
let themeCache: { valeur: Theme; expire: number } | null = null;
const THEME_TTL = 30_000;

export function oublierTheme(): void {
  themeCache = null;
}

export async function getTheme(): Promise<Theme> {
  if (themeCache && themeCache.expire > Date.now()) return themeCache.valeur;

  let brut: unknown = null;
  try {
    if (DB_DRIVER === "postgres") {
      brut = await pg.getTheme(await getPool());
    } else {
      const db = await readFileDb();
      brut = db.meta.theme ?? null;
    }
  } catch (err) {
    // Un thème illisible ne doit jamais empêcher une page de s'afficher :
    // l'application reprend ses couleurs par défaut et continue.
    console.error("Lecture du thème impossible, thème par défaut utilisé", err);
    return structuredClone(THEME_PAR_DEFAUT);
  }

  const theme = normaliserTheme(brut as Partial<Theme> | null);
  themeCache = { valeur: theme, expire: Date.now() + THEME_TTL };
  return theme;
}

export async function saveTheme(theme: Theme): Promise<Theme> {
  const propre = normaliserTheme(theme);
  if (DB_DRIVER === "postgres") {
    await pg.saveTheme(await getPool(), propre);
  } else {
    await mutateFileDb((db) => {
      db.meta.theme = propre;
    });
  }
  themeCache = { valeur: propre, expire: Date.now() + THEME_TTL };
  return propre;
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
