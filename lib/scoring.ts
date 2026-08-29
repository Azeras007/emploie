import type { Applicant, AnswerValue, Rule, ScoreResult, Settings } from "./types";

function normalize(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toArray(v: AnswerValue): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v === null || v === undefined || v === "") return [];
  return [String(v)];
}

function targetValue(applicant: Applicant, target: string): AnswerValue {
  if (target.startsWith("identity.")) {
    const key = target.slice("identity.".length) as keyof Applicant["identity"];
    return applicant.identity[key] ?? "";
  }
  if (target === "file") return applicant.files.map((f) => f.kind);
  return applicant.answers[target] ?? null;
}

export function ruleMatches(applicant: Applicant, rule: Rule): boolean {
  const raw = targetValue(applicant, rule.target);
  const list = toArray(raw);
  const needle = normalize(rule.value);

  switch (rule.operator) {
    case "answered":
      return list.length > 0 && list.some((v) => v.trim() !== "");
    case "has_file":
      return applicant.files.some(
        (f) => normalize(f.kind) === needle || normalize(f.name).endsWith(needle)
      );
    case "equals":
      return list.length === 1 && normalize(list[0]) === needle;
    case "not_equals":
      return !(list.length === 1 && normalize(list[0]) === needle);
    case "includes":
      return list.some((v) => normalize(v) === needle);
    case "not_includes":
      return !list.some((v) => normalize(v) === needle);
    case "contains":
      return list.some((v) => normalize(v).includes(needle));
    case "gte": {
      const n = Number(String(raw).replace(/[^0-9.,-]/g, "").replace(",", "."));
      return Number.isFinite(n) && n >= Number(rule.value);
    }
    case "lte": {
      const n = Number(String(raw).replace(/[^0-9.,-]/g, "").replace(",", "."));
      return Number.isFinite(n) && n <= Number(rule.value);
    }
    default:
      return false;
  }
}

export function scoreApplicant(applicant: Applicant, settings: Settings): ScoreResult {
  const rules = settings.rules.filter((r) => r.enabled);
  let points = 0;
  let max = 0;
  let disqualified = false;
  const reasons: ScoreResult["reasons"] = [];

  for (const rule of rules) {
    const hit = ruleMatches(applicant, rule);
    const pts = Number(rule.points) || 0;

    if (rule.mode === "bonus" || rule.mode === "required") max += Math.max(pts, 0);
    if (rule.mode === "bonus" && hit) points += pts;
    if (rule.mode === "malus" && hit) points -= pts;
    if (rule.mode === "required") {
      if (hit) points += pts;
      else disqualified = true;
    }
    if (rule.mode === "exclude" && hit) disqualified = true;

    reasons.push({ ruleId: rule.id, label: rule.label, hit, points: pts, mode: rule.mode });
  }

  const percent = max > 0 ? Math.max(0, Math.min(100, Math.round((points / max) * 100))) : 0;

  return {
    points,
    max,
    percent,
    disqualified,
    reasons,
    pertinent: !disqualified && percent >= (settings.threshold ?? 0),
  };
}

export type ScoredApplicant = Applicant & { score: ScoreResult };

export function scoreAll(applicants: Applicant[], settings: Settings): ScoredApplicant[] {
  return applicants.map((a) => ({ ...a, score: scoreApplicant(a, settings) }));
}
