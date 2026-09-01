import "server-only";
import type { Pool } from "pg";
import { uid } from "./ids";
import { MIGRATION_HINT, SCHEMA_SQL, TABLES } from "./schema";
import type {
  Applicant,
  AnswerValue,
  EmailEntry,
  Invite,
  Settings,
  Store,
  StoredFile,
  User,
} from "./types";

/**
 * Accès aux tables de recrutement.
 *
 * Les réponses sont éclatées en lignes plutôt que rangées en JSON : elles
 * deviennent interrogeables depuis la base (« combien de candidats disponibles
 * le samedi ? ») sans passer par l'application. Le libellé de la question est
 * recopié à l'enregistrement, pour qu'une candidature reste lisible telle
 * qu'elle a été remplie même si le questionnaire change ensuite.
 */

/* ------------------------------------------------------------------ *
 * Schéma
 * ------------------------------------------------------------------ */

/**
 * Crée les tables si elles manquent. Rejouable sans dommage : voir SCHEMA_SQL.
 *
 * Appelé une fois, à l'ouverture du pool. `pool.query` accepte un script à
 * plusieurs instructions tant qu'aucun paramètre n'est passé.
 */
export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}

export async function checkSchema(pool: Pool): Promise<string | null> {
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = current_schema()
        and table_name = any($1)`,
    [Object.keys(TABLES)]
  );

  const found = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!found.has(row.table_name)) found.set(row.table_name, new Set());
    found.get(row.table_name)!.add(row.column_name);
  }

  const missingTables = Object.keys(TABLES).filter((t) => !found.has(t));
  if (missingTables.length === Object.keys(TABLES).length) return MIGRATION_HINT;
  if (missingTables.length > 0) {
    return `Tables de recrutement manquantes : ${missingTables.join(", ")}. ${MIGRATION_HINT}`;
  }

  for (const [table, columns] of Object.entries(TABLES)) {
    const missing = columns.filter((c) => !found.get(table)!.has(c));
    if (missing.length > 0) {
      return `La table ${table} n'a pas les colonnes attendues (${missing.join(", ")}). ${MIGRATION_HINT}`;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Conversions
 * ------------------------------------------------------------------ */

interface ApplicationRow {
  id: string;
  reference: string;
  createdAt: Date;
  updatedAt: Date;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  city: string | null;
  status: string;
  rating: number;
  notes: string | null;
  inviteToken: string | null;
  shareToken: string;
  storeId: string | null;
  consentAt: Date | null;
  purgeAt: Date | null;
}

interface AnswerRow {
  applicationId: string;
  questionId: string;
  valueText: string | null;
  valueNumber: number | null;
  valueList: string[] | null;
}

interface DocumentRow {
  id: string;
  applicationId: string;
  kind: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedAt: Date;
}

/** Une réponse tient dans une seule des trois colonnes, selon son type. */
function answerToColumns(value: AnswerValue): {
  text: string | null;
  number: number | null;
  list: string[] | null;
} {
  if (Array.isArray(value)) return { text: null, number: null, list: value.map(String) };
  if (typeof value === "number") return { text: null, number: value, list: null };
  if (value === null || value === undefined) return { text: null, number: null, list: null };
  return { text: String(value), number: null, list: null };
}

function columnsToAnswer(row: AnswerRow): AnswerValue {
  if (row.valueList && row.valueList.length > 0) return row.valueList;
  if (row.valueNumber !== null) return row.valueNumber;
  return row.valueText;
}

function rowsToApplicant(
  app: ApplicationRow,
  answers: AnswerRow[],
  documents: DocumentRow[]
): Applicant {
  const map: Record<string, AnswerValue> = {};
  for (const row of answers) map[row.questionId] = columnsToAnswer(row);

  return {
    id: app.id,
    ref: app.reference,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    identity: {
      firstName: app.firstName,
      lastName: app.lastName,
      email: app.email,
      phone: app.phone ?? "",
      city: app.city ?? "",
    },
    answers: map,
    files: documents.map((d) => ({
      id: d.id,
      kind: d.kind as StoredFile["kind"],
      name: d.filename,
      mime: d.mimeType,
      size: d.sizeBytes,
      key: d.storageKey,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    status: app.status as Applicant["status"],
    rating: app.rating,
    notes: app.notes ?? "",
    inviteToken: app.inviteToken,
    shareToken: app.shareToken,
    storeId: app.storeId ?? null,
    consentAt: app.consentAt ? app.consentAt.toISOString() : null,
    purgeAt: app.purgeAt ? app.purgeAt.toISOString() : null,
  };
}

/* ------------------------------------------------------------------ *
 * Candidatures
 * ------------------------------------------------------------------ */

async function hydrate(pool: Pool, apps: ApplicationRow[]): Promise<Applicant[]> {
  if (apps.length === 0) return [];
  const ids = apps.map((a) => a.id);

  const [answers, documents] = await Promise.all([
    pool.query<AnswerRow>(
      `select "applicationId", "questionId", "valueText", "valueNumber", "valueList"
         from "JobApplicationAnswer" where "applicationId" = any($1) order by "position"`,
      [ids]
    ),
    pool.query<DocumentRow>(
      `select * from "JobApplicationDocument" where "applicationId" = any($1) order by "uploadedAt"`,
      [ids]
    ),
  ]);

  const byApp = <T extends { applicationId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      if (!map.has(row.applicationId)) map.set(row.applicationId, []);
      map.get(row.applicationId)!.push(row);
    }
    return map;
  };

  const answersByApp = byApp(answers.rows);
  const documentsByApp = byApp(documents.rows);

  return apps.map((a) =>
    rowsToApplicant(a, answersByApp.get(a.id) ?? [], documentsByApp.get(a.id) ?? [])
  );
}

export async function listApplicants(pool: Pool): Promise<Applicant[]> {
  const { rows } = await pool.query<ApplicationRow>(
    `select * from "JobApplication" order by "createdAt" desc`
  );
  return hydrate(pool, rows);
}

export async function getApplicant(pool: Pool, id: string): Promise<Applicant | null> {
  const { rows } = await pool.query<ApplicationRow>(
    `select * from "JobApplication" where id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  return (await hydrate(pool, rows))[0] ?? null;
}

export async function findApplicantByShareToken(
  pool: Pool,
  token: string
): Promise<Applicant | null> {
  const { rows } = await pool.query<ApplicationRow>(
    `select * from "JobApplication" where "shareToken" = $1`,
    [token]
  );
  if (rows.length === 0) return null;
  return (await hydrate(pool, rows))[0] ?? null;
}

/**
 * Écriture complète d'une candidature, en une transaction : réponses et
 * documents sont remplacés d'un bloc plutôt que rapprochés ligne à ligne.
 * Le volume par candidature se compte en dizaines de lignes.
 */
export async function saveApplicant(
  pool: Pool,
  applicant: Applicant,
  questionLabels: Map<string, { label: string; position: number }>
): Promise<Applicant> {
  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `insert into "JobApplication"
         (id, reference, "createdAt", "updatedAt", "firstName", "lastName", email, phone, city,
          status, rating, notes, "inviteToken", "shareToken", "storeId", "consentAt", "purgeAt")
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (id) do update set
         "updatedAt" = excluded."updatedAt",
         "firstName" = excluded."firstName",
         "lastName"  = excluded."lastName",
         email       = excluded.email,
         phone       = excluded.phone,
         city        = excluded.city,
         status      = excluded.status,
         rating      = excluded.rating,
         notes       = excluded.notes,
         "storeId"   = excluded."storeId"`,
      [
        applicant.id,
        applicant.ref,
        applicant.createdAt,
        applicant.updatedAt,
        applicant.identity.firstName,
        applicant.identity.lastName,
        applicant.identity.email,
        applicant.identity.phone || null,
        applicant.identity.city || null,
        applicant.status,
        applicant.rating,
        applicant.notes || null,
        applicant.inviteToken,
        applicant.shareToken,
        applicant.storeId,
        applicant.consentAt,
        applicant.purgeAt,
      ]
    );

    await client.query(`delete from "JobApplicationAnswer" where "applicationId" = $1`, [
      applicant.id,
    ]);
    for (const [questionId, value] of Object.entries(applicant.answers)) {
      const meta = questionLabels.get(questionId);
      const { text, number, list } = answerToColumns(value);
      await client.query(
        `insert into "JobApplicationAnswer"
           (id, "applicationId", "questionId", "questionLabel", position, "valueText", "valueNumber", "valueList")
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          uid(),
          applicant.id,
          questionId.slice(0, 80),
          (meta?.label ?? questionId).slice(0, 500),
          meta?.position ?? 999,
          text,
          number,
          list,
        ]
      );
    }

    await client.query(`delete from "JobApplicationDocument" where "applicationId" = $1`, [
      applicant.id,
    ]);
    for (const file of applicant.files) {
      await client.query(
        `insert into "JobApplicationDocument"
           (id, "applicationId", kind, filename, "mimeType", "sizeBytes", "storageKey", "uploadedAt")
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          file.id,
          applicant.id,
          file.kind,
          file.name.slice(0, 255),
          file.mime.slice(0, 160),
          file.size,
          file.key.slice(0, 500),
          file.uploadedAt,
        ]
      );
    }

    await client.query("commit");
    return applicant;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteApplicant(pool: Pool, id: string): Promise<void> {
  // Réponses et documents partent en cascade (contrainte de clé étrangère).
  await pool.query(`delete from "JobApplication" where id = $1`, [id]);
}

/* ------------------------------------------------------------------ *
 * Liens d'invitation
 * ------------------------------------------------------------------ */

interface InviteRow {
  id: string;
  token: string;
  label: string;
  createdAt: Date;
  uses: number;
  active: boolean;
  printed: boolean;
  storeId: string | null;
}

const toInvite = (r: InviteRow): Invite => ({
  id: r.id,
  token: r.token,
  label: r.label,
  createdAt: r.createdAt.toISOString(),
  uses: r.uses,
  active: r.active,
  printed: r.printed,
  storeId: r.storeId ?? null,
});

export async function listInvites(pool: Pool): Promise<Invite[]> {
  const { rows } = await pool.query<InviteRow>(
    `select * from "JobInviteLink" order by "createdAt" desc`
  );
  return rows.map(toInvite);
}

export async function getInviteByToken(pool: Pool, token: string): Promise<Invite | null> {
  const { rows } = await pool.query<InviteRow>(`select * from "JobInviteLink" where token = $1`, [
    token,
  ]);
  return rows[0] ? toInvite(rows[0]) : null;
}

export async function saveInvite(pool: Pool, invite: Invite): Promise<Invite> {
  await pool.query(
    `insert into "JobInviteLink" (id, token, label, "createdAt", uses, active, printed, "storeId")
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (id) do update set
       label = excluded.label, uses = excluded.uses,
       active = excluded.active, printed = excluded.printed,
       "storeId" = excluded."storeId"`,
    [
      invite.id,
      invite.token,
      invite.label.slice(0, 160),
      invite.createdAt,
      invite.uses,
      invite.active,
      Boolean(invite.printed),
      invite.storeId ?? null,
    ]
  );
  return invite;
}

export async function deleteInvite(pool: Pool, id: string): Promise<void> {
  await pool.query(`delete from "JobInviteLink" where id = $1`, [id]);
}

/* ------------------------------------------------------------------ *
 * Comptes et réglages
 * ------------------------------------------------------------------ */

interface RecruiterRow {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
  role: string;
  displayName: string;
  email: string;
  storeId: string | null;
  active: boolean;
  lastLoginAt: Date | null;
}

const toUser = (r: RecruiterRow): User => ({
  id: r.id,
  username: r.username,
  passwordHash: r.passwordHash,
  createdAt: r.createdAt.toISOString(),
  role: (r.role as User["role"]) ?? "recruteur",
  displayName: r.displayName || r.username,
  email: r.email ?? "",
  storeId: r.storeId ?? null,
  active: r.active !== false,
  lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
});

export async function listUsers(pool: Pool): Promise<User[]> {
  const { rows } = await pool.query<RecruiterRow>(`select * from "Recruiter" order by "createdAt"`);
  return rows.map(toUser);
}

export async function getUser(pool: Pool, id: string): Promise<User | null> {
  const { rows } = await pool.query<RecruiterRow>(`select * from "Recruiter" where id = $1`, [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function deleteUser(pool: Pool, id: string): Promise<void> {
  await pool.query(`delete from "Recruiter" where id = $1`, [id]);
}

export async function findUser(pool: Pool, username: string): Promise<User | null> {
  const { rows } = await pool.query<RecruiterRow>(
    `select * from "Recruiter" where lower(username) = lower($1)`,
    [username.trim()]
  );
  return rows[0] ? toUser(rows[0]) : null;
}

export async function saveUser(pool: Pool, user: User): Promise<User> {
  await pool.query(
    `insert into "Recruiter"
       (id, username, "passwordHash", "createdAt", role, "displayName", email, "storeId", active, "lastLoginAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (id) do update set
       username       = excluded.username,
       "passwordHash" = excluded."passwordHash",
       role           = excluded.role,
       "displayName"  = excluded."displayName",
       email          = excluded.email,
       "storeId"      = excluded."storeId",
       active         = excluded.active,
       "lastLoginAt"  = excluded."lastLoginAt"`,
    [
      user.id,
      user.username.slice(0, 40),
      user.passwordHash,
      user.createdAt,
      user.role,
      user.displayName.slice(0, 80),
      user.email.slice(0, 160),
      user.storeId,
      user.active,
      user.lastLoginAt,
    ]
  );
  return user;
}

/* ------------------------------------------------------------------ *
 * Magasins
 * ------------------------------------------------------------------ */

interface StoreRow {
  id: string;
  name: string;
  city: string;
  address: string;
  active: boolean;
  createdAt: Date;
}

const toStore = (r: StoreRow): Store => ({
  id: r.id,
  name: r.name,
  city: r.city ?? "",
  address: r.address ?? "",
  active: r.active !== false,
  createdAt: r.createdAt.toISOString(),
});

export async function listStores(pool: Pool): Promise<Store[]> {
  const { rows } = await pool.query<StoreRow>(`select * from "Store" order by name`);
  return rows.map(toStore);
}

export async function saveStore(pool: Pool, store: Store): Promise<Store> {
  await pool.query(
    `insert into "Store" (id, name, city, address, active, "createdAt")
     values ($1,$2,$3,$4,$5,$6)
     on conflict (id) do update set
       name = excluded.name, city = excluded.city,
       address = excluded.address, active = excluded.active`,
    [
      store.id,
      store.name.slice(0, 120),
      store.city.slice(0, 80),
      store.address.slice(0, 240),
      store.active,
      store.createdAt,
    ]
  );
  return store;
}

/**
 * Supprime un magasin. Les candidatures et les liens qui le visaient ne
 * disparaissent pas : leur `storeId` passe à null (contrainte `on delete set
 * null`). Fermer un magasin ne doit pas effacer les dossiers qu'il a reçus.
 */
export async function deleteStore(pool: Pool, id: string): Promise<void> {
  await pool.query(`delete from "Store" where id = $1`, [id]);
}

/* ------------------------------------------------------------------ *
 * Journal des envois
 * ------------------------------------------------------------------ */

interface EmailRow {
  id: string;
  applicationId: string | null;
  kind: string;
  recipient: string;
  subject: string;
  sentAt: Date;
  error: string | null;
}

export async function logEmail(pool: Pool, entree: EmailEntry): Promise<void> {
  await pool.query(
    `insert into "EmailLog" (id, "applicationId", kind, recipient, subject, "sentAt", error)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      entree.id,
      entree.applicationId,
      entree.kind.slice(0, 40),
      entree.recipient.slice(0, 240),
      entree.subject.slice(0, 240),
      entree.sentAt,
      entree.error ? entree.error.slice(0, 800) : null,
    ]
  );
}

export async function listEmails(pool: Pool, limite = 200): Promise<EmailEntry[]> {
  const { rows } = await pool.query<EmailRow>(
    `select * from "EmailLog" order by "sentAt" desc limit $1`,
    [limite]
  );
  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    kind: r.kind,
    recipient: r.recipient,
    subject: r.subject,
    sentAt: r.sentAt.toISOString(),
    error: r.error,
  }));
}

export async function getSettings(pool: Pool): Promise<Settings | null> {
  const { rows } = await pool.query<{ data: Settings }>(
    `select data from "RecruitmentSetting" where id = 'default'`
  );
  return rows[0]?.data ?? null;
}

/**
 * Le thème de l'enseigne, rangé dans la même table que les réglages sous une
 * autre clé. Une table de plus pour un unique document JSON n'aurait rien
 * apporté — et celle-ci existe déjà, avec sa date de modification.
 */
export async function getTheme(pool: Pool): Promise<unknown | null> {
  const { rows } = await pool.query<{ data: unknown }>(
    `select data from "RecruitmentSetting" where id = 'theme'`
  );
  return rows[0]?.data ?? null;
}

export async function saveTheme(pool: Pool, theme: unknown): Promise<void> {
  await pool.query(
    `insert into "RecruitmentSetting" (id, data, "updatedAt")
     values ('theme', $1, now())
     on conflict (id) do update set data = excluded.data, "updatedAt" = now()`,
    [JSON.stringify(theme)]
  );
}

export async function saveSettings(pool: Pool, settings: Settings): Promise<Settings> {
  await pool.query(
    `insert into "RecruitmentSetting" (id, data, "updatedAt")
     values ('default', $1, now())
     on conflict (id) do update set data = excluded.data, "updatedAt" = now()`,
    [JSON.stringify(settings)]
  );
  return settings;
}
