export type QuestionType =
  | "text"
  | "textarea"
  | "single"
  | "multi"
  | "scale"
  | "number";

export interface Question {
  id: string;
  label: string;
  hint?: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  unit?: string;
  maxChoices?: number;
}

export type AnswerValue = string | string[] | number | null;

export type FileKind = "cv" | "lettre" | "autre";

export interface StoredFile {
  id: string;
  kind: FileKind;
  name: string;
  mime: string;
  size: number;
  key: string;
  uploadedAt: string;
}

export type Status = "nouveau" | "en_revue" | "entretien" | "retenu" | "refuse";

export const STATUSES: { value: Status; label: string }[] = [
  { value: "nouveau", label: "Nouveau" },
  { value: "en_revue", label: "En revue" },
  { value: "entretien", label: "Entretien" },
  { value: "retenu", label: "Retenu" },
  { value: "refuse", label: "Refusé" },
];

export interface Identity {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
}

export interface Applicant {
  id: string;
  ref: string;
  createdAt: string;
  updatedAt: string;
  identity: Identity;
  answers: Record<string, AnswerValue>;
  files: StoredFile[];
  status: Status;
  rating: number;
  notes: string;
  inviteToken: string | null;
  shareToken: string;
  /** Le magasin visé, quand le lien d'invitation en désignait un. */
  storeId: string | null;
  /** Horodatage du consentement du candidat, s'il a été demandé. */
  consentAt: string | null;
  /**
   * La date à laquelle le dossier doit disparaître.
   *
   * Calculée à l'enregistrement, et non déduite d'un réglage à la lecture : la
   * durée de conservation annoncée au candidat est celle qui valait au moment
   * où il a postulé, même si elle change ensuite.
   */
  purgeAt: string | null;
}

export type Operator =
  | "equals"
  | "not_equals"
  | "includes"
  | "not_includes"
  | "gte"
  | "lte"
  | "contains"
  | "answered"
  | "has_file";

export const OPERATORS: { value: Operator; label: string; needsValue: boolean }[] = [
  { value: "equals", label: "est exactement", needsValue: true },
  { value: "not_equals", label: "n'est pas", needsValue: true },
  { value: "includes", label: "contient le choix", needsValue: true },
  { value: "not_includes", label: "ne contient pas le choix", needsValue: true },
  { value: "gte", label: "est supérieur ou égal à", needsValue: true },
  { value: "lte", label: "est inférieur ou égal à", needsValue: true },
  { value: "contains", label: "contient le texte", needsValue: true },
  { value: "answered", label: "a une réponse", needsValue: false },
  { value: "has_file", label: "a fourni le document", needsValue: true },
];

/** `bonus` adds points, `malus` removes them, `required` disqualifies when unmet,
 *  `exclude` disqualifies when met. */
export type RuleMode = "bonus" | "malus" | "required" | "exclude";

export const RULE_MODES: { value: RuleMode; label: string; help: string }[] = [
  { value: "bonus", label: "Ajoute des points", help: "Le profil gagne des points si la condition est vraie." },
  { value: "malus", label: "Retire des points", help: "Le profil perd des points si la condition est vraie." },
  { value: "required", label: "Critère obligatoire", help: "Le profil est écarté si la condition est fausse." },
  { value: "exclude", label: "Critère éliminatoire", help: "Le profil est écarté si la condition est vraie." },
];

export interface Rule {
  id: string;
  label: string;
  target: string; // question id, "file", or "identity.city"
  operator: Operator;
  value: string;
  points: number;
  mode: RuleMode;
  enabled: boolean;
}

export interface Settings {
  /** The candidate questionnaire, editable from the admin settings. */
  questions: Question[];
  rules: Rule[];
  /** Minimum score, as a percentage, for a profile to be flagged as pertinent. */
  threshold: number;
  /** Hide profiles that fail a required/exclude rule from the default list. */
  hideDisqualified: boolean;
  /** Default sort of the pipeline list. */
  defaultSort: "score" | "recent" | "name";
  jobTitle: string;
  companyName: string;
  intro: string;
  /**
   * Domaine public inscrit dans les QR codes. C'est la seule chose qu'un QR
   * imprimé ne pourra plus jamais changer : il doit désigner un domaine que
   * vous maîtrisez, pas l'URL de l'hébergeur du moment.
   */
  publicBaseUrl: string;

  /* ---- RGPD ---- */

  /**
   * Durée de conservation des dossiers, en mois. 0 désactive la purge.
   *
   * Le référentiel de la CNIL retient deux ans après le dernier contact pour
   * une candidature non retenue ; la valeur reste réglable, une enseigne
   * pouvant avoir sa propre politique.
   */
  retentionMonths: number;
  /** La case à cocher avant l'envoi. Vide : aucun consentement n'est demandé. */
  consentText: string;
  /** Qui contacter pour l'exercice des droits — affiché au candidat. */
  privacyContact: string;

  /* ---- Envoi d'e-mails ---- */

  emails: {
    /** Rien n'est envoyé tant que ceci est faux. */
    enabled: boolean;
    /** L'adresse d'expédition, et celle où arrivent les réponses. */
    from: string;
    replyTo: string;
    /** Accusé de réception au candidat. */
    acknowledge: boolean;
    acknowledgeSubject: string;
    acknowledgeBody: string;
    /** Alerte aux recruteurs à chaque dépôt. */
    notify: boolean;
    notifySubject: string;
    /** Destinataires supplémentaires, en plus des comptes qui ont une adresse. */
    notifyExtra: string;
  };
}

export interface Invite {
  id: string;
  token: string;
  label: string;
  createdAt: string;
  uses: number;
  active: boolean;
  /**
   * Le lien a été imprimé (devanture, flyer, affiche). Son QR code ne peut plus
   * être repris : la suppression du lien est alors bloquée dans les réglages.
   */
  printed?: boolean;
  /**
   * Le magasin auquel ce lien rattache les candidatures.
   *
   * C'est ce qui rend un QR de devanture utile à une enseigne de trente
   * magasins : le code collé sur la vitrine de Lille dépose les dossiers dans
   * la liste de Lille, sans que le candidat ait à choisir.
   */
  storeId?: string | null;
}

/**
 * Les quatre rôles, du plus large au plus étroit.
 *
 * `proprietaire` est celui de l'éditeur du produit : lui seul touche à la
 * marque et aux réglages techniques. `administrateur` est le client — il règle
 * son questionnaire, ses magasins et ses recruteurs, mais ne peut pas
 * défigurer l'application ni lire les identifiants du serveur d'envoi.
 * `magasin` ne voit que les candidatures de son point de vente : c'est ce qui
 * rend le produit vendable à une enseigne de trente magasins.
 */
export type Role = "proprietaire" | "administrateur" | "recruteur" | "magasin";

export const ROLES: { value: Role; label: string; help: string }[] = [
  {
    value: "proprietaire",
    label: "Propriétaire",
    help: "Tout, y compris la marque, les envois d'e-mails et les comptes.",
  },
  {
    value: "administrateur",
    label: "Administrateur",
    help: "Le questionnaire, le tri, les magasins, les comptes recruteurs.",
  },
  {
    value: "recruteur",
    label: "Recruteur",
    help: "Toutes les candidatures, aucun réglage.",
  },
  {
    value: "magasin",
    label: "Responsable de magasin",
    help: "Uniquement les candidatures de son magasin.",
  },
];

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  role: Role;
  /** Le nom affiché dans l'interface et signé au bas des e-mails. */
  displayName: string;
  /** Facultatif : sert aux alertes de nouvelle candidature. */
  email: string;
  /** Renseigné pour le rôle « magasin » — sa portée de lecture. */
  storeId: string | null;
  /** Un compte désactivé ne peut plus se connecter, mais reste dans l'historique. */
  active: boolean;
  lastLoginAt: string | null;
}

export interface Store {
  id: string;
  name: string;
  city: string;
  address: string;
  active: boolean;
  createdAt: string;
}

/** Une trace d'envoi — réussi ou non. */
export interface EmailEntry {
  id: string;
  applicationId: string | null;
  kind: string;
  recipient: string;
  subject: string;
  sentAt: string;
  error: string | null;
}

export interface ScoreResult {
  points: number;
  max: number;
  percent: number;
  disqualified: boolean;
  reasons: { ruleId: string; label: string; hit: boolean; points: number; mode: RuleMode }[];
  pertinent: boolean;
}
