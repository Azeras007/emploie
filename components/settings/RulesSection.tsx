"use client";

import { OPERATORS, RULE_MODES } from "@/lib/types";
import type { Operator, Question, Rule, RuleMode, Settings } from "@/lib/types";
import { Check, ConfirmButton, Field } from "./controls";

/** Cibles hors questionnaire : documents et fiche d'identité. */
const IDENTITY_TARGETS: { value: string; label: string }[] = [
  { value: "identity.city", label: "Ville" },
  { value: "identity.email", label: "E-mail" },
  { value: "identity.phone", label: "Téléphone" },
  { value: "identity.firstName", label: "Prénom" },
  { value: "identity.lastName", label: "Nom" },
];

const FILE_KINDS: { value: string; label: string }[] = [
  { value: "cv", label: "CV" },
  { value: "lettre", label: "Lettre de motivation" },
  { value: "autre", label: "Autre document" },
];

const SORT_LABELS: { value: Settings["defaultSort"]; label: string }[] = [
  { value: "score", label: "Pertinence" },
  { value: "recent", label: "Plus récentes" },
  { value: "name", label: "Nom" },
];

/** Identifiant local, suffisant côté client (l'API en régénère un si besoin). */
function localId(): string {
  return `r-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export interface RulesPreview {
  total: number;
  pertinents: number;
  ecartes: number;
}

export default function RulesSection({
  settings,
  onPatch,
  preview,
}: {
  settings: Settings;
  onPatch: (changes: Partial<Settings>) => void;
  preview: RulesPreview | null;
}) {
  const { rules, questions } = settings;

  function patchRule(index: number, changes: Partial<Rule>) {
    onPatch({ rules: rules.map((r, i) => (i === index ? { ...r, ...changes } : r)) });
  }

  function removeRule(index: number) {
    onPatch({ rules: rules.filter((_, i) => i !== index) });
  }

  function duplicateRule(index: number) {
    const copy: Rule = { ...rules[index], id: localId(), label: `${rules[index].label} (copie)` };
    const next = [...rules];
    next.splice(index + 1, 0, copy);
    onPatch({ rules: next });
  }

  function addRule() {
    const first = questions[0];
    onPatch({
      rules: [
        ...rules,
        {
          id: localId(),
          label: "Nouvelle règle",
          target: first ? first.id : "file",
          operator: first ? "answered" : "has_file",
          value: first ? "" : "cv",
          points: 10,
          mode: "bonus",
          enabled: true,
        },
      ],
    });
  }

  function questionFor(target: string): Question | undefined {
    return questions.find((q) => q.id === target);
  }

  const knownTargets = new Set<string>([
    ...questions.map((q) => q.id),
    "file",
    ...IDENTITY_TARGETS.map((t) => t.value),
  ]);

  return (
    <div>
      <header className="max-w-measure">
        <h2 className="display text-[24px] leading-tight md:text-[28px]">Tri &amp; pertinence</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-custom1">
          Chaque règle regarde une réponse et ajoute, retire ou écarte. Le score est un pourcentage des
          points possibles ; au-dessus du seuil, la candidature est signalée comme pertinente.
        </p>
      </header>

      {/* Rappel des quatre modes, en une phrase chacun. */}
      <dl className="mt-6 border-t border-custom3">
        {RULE_MODES.map((m) => (
          <div key={m.value} className="flex flex-col gap-0.5 border-b border-custom32 py-2.5 md:flex-row md:gap-6">
            <dt className="text-[13px] font-semibold md:w-52 md:shrink-0">
              {m.label}
            </dt>
            <dd className="text-[13px] leading-snug text-custom1">{m.help}</dd>
          </div>
        ))}
      </dl>

      {/* ---------- Seuil, masquage, tri par défaut ---------- */}
      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <span className="eyebrow block">Seuil de pertinence</span>
          <div className="mt-3 flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={settings.threshold}
              onChange={(e) => onPatch({ threshold: Number(e.target.value) })}
              aria-label="Seuil de pertinence"
              className="h-11 w-full min-w-0 accent-ink"
            />
            <span className="flex shrink-0 items-baseline gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={settings.threshold}
                onChange={(e) =>
                  onPatch({ threshold: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                }
                aria-label="Seuil de pertinence, en pourcentage"
                className="box w-[74px] px-2 text-center tabular-nums"
              />
              <span className="text-[12px] text-custom1">%</span>
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-custom1">
            Une candidature au-dessus de {settings.threshold} % est marquée pertinente.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Tri par défaut de la liste">
            <select
              className="box"
              value={settings.defaultSort}
              onChange={(e) => onPatch({ defaultSort: e.target.value as Settings["defaultSort"] })}
            >
              {SORT_LABELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Check
            checked={settings.hideDisqualified}
            onChange={(v) => onPatch({ hideDisqualified: v })}
            label="Masquer les profils écartés"
            hint="Les profils recalés par un critère obligatoire ou éliminatoire sortent de la liste par défaut."
          />
        </div>
      </section>

      {preview ? (
        <p className="mt-8 border-y border-custom3 py-3 text-[13px] font-semibold tabular-nums">
          Sur {preview.total} candidature{preview.total > 1 ? "s" : ""} : {preview.pertinents} pertinente
          {preview.pertinents > 1 ? "s" : ""} · {preview.ecartes} écartée{preview.ecartes > 1 ? "s" : ""}
          <span className="ml-2 normal-case tracking-normal text-custom1">
            (simulation avec les réglages en cours)
          </span>
        </p>
      ) : null}

      {/* ---------- Les règles ---------- */}
      <div className="mt-10 flex items-baseline justify-between gap-4">
        <h3 className="display text-[18px]">Règles</h3>
        <span className="text-[11px] tabular-nums text-custom1">
          {rules.filter((r) => r.enabled).length}/{rules.length} actives
        </span>
      </div>

      <div className="mt-4 space-y-4">
        {rules.map((rule, i) => {
          const question = questionFor(rule.target);
          const operator = OPERATORS.find((o) => o.value === rule.operator);
          const needsValue = operator ? operator.needsValue : true;
          const options = question?.options?.filter((o) => o.trim() !== "") ?? [];
          const isFileTarget = rule.target === "file" || rule.operator === "has_file";
          const orphan = !knownTargets.has(rule.target);

          return (
            <article key={rule.id || i} className="card p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-custom32 pb-3">
                <Check
                  checked={rule.enabled}
                  onChange={(v) => patchRule(i, { enabled: v })}
                  label={rule.enabled ? "Active" : "Inactive"}
                />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => duplicateRule(i)}
                    className="btn-quiet min-h-[44px] px-2"
                  >
                    Dupliquer
                  </button>
                  <ConfirmButton onConfirm={() => removeRule(i)} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-12">
                <Field label="Libellé de la règle" className="md:col-span-6">
                  <input
                    className="box"
                    value={rule.label}
                    onChange={(e) => patchRule(i, { label: e.target.value })}
                    placeholder="Disponible rapidement"
                  />
                </Field>

                <Field
                  label="Sur quoi porte la règle"
                  className="md:col-span-6"
                  warning={
                    orphan
                      ? `Cible « ${rule.target} » introuvable — cette règle ne s'appliquera jamais.`
                      : undefined
                  }
                >
                  <select
                    className="box"
                    value={rule.target}
                    onChange={(e) => patchRule(i, { target: e.target.value, value: "" })}
                  >
                    {orphan ? <option value={rule.target}>⚠ {rule.target} (introuvable)</option> : null}
                    <optgroup label="Questions">
                      {questions.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.label.length > 60 ? `${q.label.slice(0, 60)}…` : q.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Dossier">
                      <option value="file">Documents</option>
                    </optgroup>
                    <optgroup label="Identité">
                      {IDENTITY_TARGETS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </Field>

                <Field label="Condition" className="md:col-span-3">
                  <select
                    className="box"
                    value={rule.operator}
                    onChange={(e) => patchRule(i, { operator: e.target.value as Operator })}
                  >
                    {OPERATORS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Valeur" className="md:col-span-3">
                  {!needsValue ? (
                    <span className="flex h-[42px] items-center border border-custom32 px-3 text-[13px] font-semibold text-custom1">
                      Sans valeur
                    </span>
                  ) : isFileTarget ? (
                    <select
                      className="box"
                      value={rule.value}
                      onChange={(e) => patchRule(i, { value: e.target.value })}
                    >
                      <option value="">— choisir —</option>
                      {FILE_KINDS.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  ) : options.length > 0 ? (
                    <select
                      className="box"
                      value={rule.value}
                      onChange={(e) => patchRule(i, { value: e.target.value })}
                    >
                      <option value="">— choisir —</option>
                      {/* Une valeur saisie autrefois mais absente des options reste sélectionnable. */}
                      {rule.value && !options.includes(rule.value) ? (
                        <option value={rule.value}>⚠ {rule.value} (hors options)</option>
                      ) : null}
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="box"
                      value={rule.value}
                      onChange={(e) => patchRule(i, { value: e.target.value })}
                      placeholder={question?.type === "number" ? "45000" : "Texte à repérer"}
                    />
                  )}
                </Field>

                <Field
                  label="Points"
                  className="md:col-span-2"
                  hint={rule.mode === "exclude" ? "Sans effet ici." : undefined}
                >
                  <input
                    className="box tabular-nums"
                    type="number"
                    inputMode="numeric"
                    value={rule.points}
                    disabled={rule.mode === "exclude"}
                    onChange={(e) => patchRule(i, { points: Number(e.target.value) || 0 })}
                  />
                </Field>

                <Field label="Effet" className="md:col-span-4">
                  <select
                    className="box"
                    value={rule.mode}
                    onChange={(e) => patchRule(i, { mode: e.target.value as RuleMode })}
                  >
                    {RULE_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6">
        <button type="button" className="btn-ghost min-h-[44px]" onClick={addRule}>
          Ajouter une règle
        </button>
      </div>
    </div>
  );
}
