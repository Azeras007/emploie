import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { saveSettings } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { uid } from "@/lib/ids";
import { OPERATORS, RULE_MODES } from "@/lib/types";
import type { Operator, Question, Rule, RuleMode, Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ *
 * Validation — les listes d'opérateurs et de modes viennent de lib/types
 * pour rester d'un seul tenant avec le moteur de scoring.
 * ------------------------------------------------------------------ */

const operatorEnum = z.enum(
  OPERATORS.map((o) => o.value) as [Operator, ...Operator[]]
);
const modeEnum = z.enum(RULE_MODES.map((m) => m.value) as [RuleMode, ...RuleMode[]]);

const questionSchema = z.object({
  id: z.string().max(64, "Identifiant trop long (64 caractères maximum).").optional(),
  label: z.string(),
  hint: z.string().nullish(),
  type: z.enum(["text", "textarea", "single", "multi", "scale", "number"]),
  options: z.array(z.string()).nullish(),
  required: z.boolean().nullish(),
  placeholder: z.string().nullish(),
  min: z.coerce.number().nullish(),
  max: z.coerce.number().nullish(),
  unit: z.string().nullish(),
  maxChoices: z.coerce.number().nullish(),
});

const ruleSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  target: z.string(),
  operator: operatorEnum,
  value: z.string().nullish(),
  points: z.coerce.number().nullish(),
  mode: modeEnum,
  enabled: z.boolean().nullish(),
});

const settingsSchema = z.object({
  questions: z.array(questionSchema).min(1, "Le questionnaire doit compter au moins une question."),
  rules: z.array(ruleSchema),
  threshold: z.coerce.number(),
  hideDisqualified: z.boolean(),
  defaultSort: z.enum(["score", "recent", "name"]),
  jobTitle: z.string(),
  companyName: z.string(),
  intro: z.string(),
  publicBaseUrl: z.string().optional(),
});

/* ------------------------------------------------------------------ *
 * Nettoyage
 * ------------------------------------------------------------------ */

/** « Années d'expérience » -> « annees-d-experience ». */
function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function finite(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

class ValidationError extends Error {}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête illisible." }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const chemin = issue.path.join(".");
    return NextResponse.json(
      { error: `Réglages invalides${chemin ? ` (${chemin})` : ""} : ${issue.message}` },
      { status: 400 }
    );
  }

  try {
    const settings = clean(parsed.data);
    await saveSettings(settings);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
}

function clean(input: z.infer<typeof settingsSchema>): Settings {
  const used = new Set<string>();
  /** Ancien identifiant -> nouvel identifiant, pour recâbler les règles. */
  const renamed = new Map<string, string>();

  const questions: Question[] = input.questions.map((raw, index) => {
    const label = raw.label.trim();
    if (!label) {
      throw new ValidationError(`La question n° ${index + 1} n'a pas de libellé.`);
    }

    const previous = (raw.id ?? "").trim();
    // Identifiant vide -> engendré depuis le libellé ; sinon normalisé en kebab-case.
    let id = slugify(previous || label) || `question-${index + 1}`;
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    used.add(id);
    if (previous && previous !== id) renamed.set(previous, id);

    const question: Question = { id, label, type: raw.type };

    const hint = (raw.hint ?? "").trim();
    if (hint) question.hint = hint;

    const placeholder = (raw.placeholder ?? "").trim();
    if (placeholder) question.placeholder = placeholder;

    if (raw.required) question.required = true;

    if (raw.type === "single" || raw.type === "multi") {
      const options = (raw.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) {
        throw new ValidationError(
          `La question « ${label} » attend des choix : ajoutez au moins une option.`
        );
      }
      question.options = options;
      if (raw.type === "multi") {
        const maxChoices = finite(raw.maxChoices);
        if (maxChoices !== undefined && maxChoices > 0) {
          question.maxChoices = Math.round(maxChoices);
        }
      }
    }

    if (raw.type === "number" || raw.type === "scale") {
      const min = finite(raw.min);
      const max = finite(raw.max);
      if (min !== undefined) question.min = min;
      if (max !== undefined) question.max = max;
      if (min !== undefined && max !== undefined && min > max) {
        throw new ValidationError(`La question « ${label} » a un minimum supérieur à son maximum.`);
      }
      const unit = (raw.unit ?? "").trim();
      if (raw.type === "number" && unit) question.unit = unit;
    }

    return question;
  });

  const ruleIds = new Set<string>();

  const rules: Rule[] = input.rules.map((raw) => {
    let id = (raw.id ?? "").trim();
    if (!id || ruleIds.has(id)) id = uid();
    ruleIds.add(id);

    const target = (raw.target ?? "").trim();
    const needsValue = OPERATORS.find((o) => o.value === raw.operator)?.needsValue ?? true;
    const points = Math.round(finite(raw.points) ?? 0);

    return {
      id,
      label: raw.label.trim() || "Règle sans titre",
      // Si l'identifiant de la question visée a été normalisé, la règle suit.
      target: renamed.get(target) ?? target,
      operator: raw.operator,
      value: needsValue ? (raw.value ?? "").trim() : "",
      points: Math.max(-1000, Math.min(1000, points)),
      mode: raw.mode,
      enabled: raw.enabled !== false,
    };
  });

  return {
    questions,
    rules,
    threshold: Math.max(0, Math.min(100, Math.round(input.threshold || 0))),
    hideDisqualified: Boolean(input.hideDisqualified),
    defaultSort: input.defaultSort,
    jobTitle: input.jobTitle.trim(),
    companyName: input.companyName.trim(),
    intro: input.intro.trim(),
    publicBaseUrl: normalizeBaseUrl(input.publicBaseUrl),
  };
}

/**
 * Le domaine des QR codes. Une adresse imprimée ne se corrige plus : on refuse
 * donc tout ce qui n'est pas une URL http(s) exploitable, et on retire la barre
 * finale pour que la concaténation reste prévisible.
 */
function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_SETTINGS.publicBaseUrl;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new ValidationError(
      `« ${value} » n'est pas une adresse valide. Attendu : https://votre-domaine.fr`
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("L'adresse des QR codes doit commencer par https://");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
