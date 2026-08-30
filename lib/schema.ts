import "server-only";

/**
 * Le schéma relationnel des candidatures.
 *
 * L'application est seule maîtresse de sa base : aucun autre outil ne gère ces
 * tables, elle les crée donc elle-même au démarrage. `SCHEMA_SQL` est écrit
 * pour être rejoué sans dommage — que la base soit vide ou déjà remplie.
 *
 * `TABLES` reste la liste de référence : au démarrage, les colonnes réellement
 * présentes lui sont comparées. Si le schéma dérive — une colonne ajoutée à la
 * main, une table renommée — on veut un message net plutôt qu'une erreur SQL
 * opaque à la première candidature.
 */
export const TABLES: Record<string, string[]> = {
  JobApplication: [
    "id",
    "reference",
    "createdAt",
    "updatedAt",
    "firstName",
    "lastName",
    "email",
    "phone",
    "city",
    "status",
    "rating",
    "notes",
    "inviteToken",
    "shareToken",
  ],
  JobApplicationAnswer: [
    "id",
    "applicationId",
    "questionId",
    "questionLabel",
    "position",
    "valueText",
    "valueNumber",
    "valueList",
  ],
  JobApplicationDocument: [
    "id",
    "applicationId",
    "kind",
    "filename",
    "mimeType",
    "sizeBytes",
    "storageKey",
    "uploadedAt",
  ],
  JobInviteLink: ["id", "token", "label", "createdAt", "uses", "active", "printed"],
  Recruiter: ["id", "username", "passwordHash", "createdAt"],
  RecruitmentSetting: ["id", "data", "updatedAt"],
};

/**
 * Création du schéma, idempotente.
 *
 * Aucune instruction ne détruit ni ne modifie de données existantes : pas de
 * DROP, pas d'ALTER destructeur. Rejouer ce script sur une base en production
 * ne fait rien.
 *
 * Les réponses sont éclatées en lignes plutôt que rangées en JSON : elles
 * deviennent interrogeables depuis la base (« combien de candidats disponibles
 * le samedi ? ») sans passer par l'application.
 */
export const SCHEMA_SQL = `
create table if not exists "JobApplication" (
  "id"          text primary key,
  "reference"   text not null unique,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now(),
  "firstName"   text not null default '',
  "lastName"    text not null default '',
  "email"       text not null default '',
  "phone"       text,
  "city"        text,
  "status"      text not null default 'nouveau',
  "rating"      integer not null default 0,
  "notes"       text,
  "inviteToken" text,
  "shareToken"  text not null unique
);

create index if not exists "JobApplication_createdAt_idx"
  on "JobApplication" ("createdAt" desc);

create table if not exists "JobApplicationAnswer" (
  "id"            text primary key,
  "applicationId" text not null references "JobApplication"("id") on delete cascade,
  "questionId"    text not null,
  "questionLabel" text not null default '',
  "position"      integer not null default 0,
  "valueText"     text,
  -- double precision, et non numeric : le pilote pg rendrait un numeric sous
  -- forme de chaîne, et les comparaisons de score porteraient sur du texte.
  "valueNumber"   double precision,
  "valueList"     text[]
);

create index if not exists "JobApplicationAnswer_applicationId_idx"
  on "JobApplicationAnswer" ("applicationId");

create table if not exists "JobApplicationDocument" (
  "id"            text primary key,
  "applicationId" text not null references "JobApplication"("id") on delete cascade,
  "kind"          text not null default 'autre',
  "filename"      text not null default '',
  "mimeType"      text not null default '',
  "sizeBytes"     integer not null default 0,
  "storageKey"    text not null,
  "uploadedAt"    timestamptz not null default now()
);

create index if not exists "JobApplicationDocument_applicationId_idx"
  on "JobApplicationDocument" ("applicationId");

create table if not exists "JobInviteLink" (
  "id"        text primary key,
  "token"     text not null unique,
  "label"     text not null default '',
  "createdAt" timestamptz not null default now(),
  "uses"      integer not null default 0,
  "active"    boolean not null default true,
  -- Un lien imprimé — sur la devanture, sur une affiche — ne peut plus être
  -- supprimé : le QR, lui, est déjà dans la rue.
  "printed"   boolean not null default false
);

create table if not exists "Recruiter" (
  "id"           text primary key,
  "username"     text not null,
  "passwordHash" text not null,
  "createdAt"    timestamptz not null default now()
);

-- L'identifiant est insensible à la casse : « Maud » et « maud » sont le même
-- compte, comme le suppose findUser().
create unique index if not exists "Recruiter_username_key"
  on "Recruiter" (lower("username"));

create table if not exists "RecruitmentSetting" (
  "id"        text primary key,
  "data"      jsonb not null,
  "updatedAt" timestamptz not null default now()
);
`;

export const MIGRATION_HINT =
  "Le schéma n'a pas pu être créé automatiquement. Vérifiez que le compte " +
  "indiqué dans DATABASE_URL a le droit de créer des tables dans cette base, " +
  "puis redémarrez l'application.";
