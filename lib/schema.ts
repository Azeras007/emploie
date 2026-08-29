import "server-only";

/**
 * Le schéma relationnel de la base Valeur Ajoutée, tel que le crée la migration
 * `20260829180000_add_recruitment` du dépôt du site principal.
 *
 * Cette application n'utilise pas Prisma : les colonnes sont donc listées ici,
 * et vérifiées au démarrage. Si la migration n'a pas été appliquée, ou si le
 * schéma dérive, on veut un message net plutôt qu'une erreur SQL opaque à la
 * première candidature.
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
    "storageAccess",
    "uploadedAt",
  ],
  JobInviteLink: ["id", "token", "label", "createdAt", "uses", "active", "printed"],
  Recruiter: ["id", "username", "passwordHash", "createdAt"],
  RecruitmentSetting: ["id", "data", "updatedAt"],
};

export const MIGRATION_HINT =
  "La base ne contient pas les tables de recrutement. Appliquez la migration " +
  "`prisma/migrations/20260829180000_add_recruitment/migration.sql` du dépôt " +
  "Valeur Ajoutée, puis redéployez.";
