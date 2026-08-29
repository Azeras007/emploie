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
}

export interface Invite {
  id: string;
  token: string;
  label: string;
  createdAt: string;
  uses: number;
  active: boolean;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface ScoreResult {
  points: number;
  max: number;
  percent: number;
  disqualified: boolean;
  reasons: { ruleId: string; label: string; hit: boolean; points: number; mode: RuleMode }[];
  pertinent: boolean;
}
