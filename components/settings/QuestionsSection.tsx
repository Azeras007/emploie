"use client";

import type { Question, QuestionType, Rule } from "@/lib/types";
import { Check, ConfirmButton, Field, SquareBtn, numOrUndef } from "./controls";

const TYPE_LABELS: { value: QuestionType; label: string }[] = [
  { value: "text", label: "Texte court" },
  { value: "textarea", label: "Texte long" },
  { value: "single", label: "Choix unique" },
  { value: "multi", label: "Choix multiple" },
  { value: "scale", label: "Échelle" },
  { value: "number", label: "Nombre" },
];

export default function QuestionsSection({
  questions,
  rules,
  onChange,
}: {
  questions: Question[];
  rules: Rule[];
  onChange: (next: Question[]) => void;
}) {
  /** Remplace la question à l'index donné. */
  function patch(index: number, changes: Partial<Question>) {
    onChange(questions.map((q, i) => (i === index ? { ...q, ...changes } : q)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  }

  function remove(index: number) {
    onChange(questions.filter((_, i) => i !== index));
  }

  function add() {
    onChange([
      ...questions,
      { id: "", label: "Nouvelle question", type: "text", required: false },
    ]);
  }

  /** Nombre de règles de tri qui visent cet identifiant de question. */
  function rulesTargeting(id: string): number {
    if (!id.trim()) return 0;
    return rules.filter((r) => r.target === id).length;
  }

  return (
    <div>
      <header className="max-w-measure">
        <h2 className="display text-[24px] leading-tight md:text-[28px]">Questionnaire</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-custom1">
          Les questions posées au candidat, dans l&apos;ordre d&apos;affichage. Chaque question porte un
          identifiant : c&apos;est lui que visent les règles de tri.
        </p>
      </header>

      <div className="mt-8 space-y-4">
        {questions.map((q, i) => {
          const targeted = rulesTargeting(q.id);
          const hasOptions = q.type === "single" || q.type === "multi";

          return (
            <article key={i} className="card p-4 md:p-5">
              <div className="flex items-center justify-between gap-2 border-b border-rule2 pb-3">
                <span className="text-[11px] tabular-nums text-custom1">
                  {String(i + 1).padStart(2, "0")}
                  <span className="ml-3 normal-case text-black">{q.id || "identifiant à générer"}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <SquareBtn title="Monter" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </SquareBtn>
                  <SquareBtn
                    title="Descendre"
                    onClick={() => move(i, 1)}
                    disabled={i === questions.length - 1}
                  >
                    ↓
                  </SquareBtn>
                  <ConfirmButton onConfirm={() => remove(i)} />
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Libellé" className="md:col-span-2">
                  <input
                    className="box"
                    value={q.label}
                    onChange={(e) => patch(i, { label: e.target.value })}
                    placeholder="Quel poste visez-vous ?"
                  />
                </Field>

                <Field label="Texte d'aide" className="md:col-span-2">
                  <input
                    className="box"
                    value={q.hint ?? ""}
                    onChange={(e) => patch(i, { hint: e.target.value || undefined })}
                    placeholder="Facultatif — une précision sous la question."
                  />
                </Field>

                <Field
                  label="Identifiant"
                  hint="Minuscules et tirets. Laissez vide pour le générer depuis le libellé."
                  warning={
                    targeted > 0
                      ? `${targeted} règle${targeted > 1 ? "s" : ""} de tri vise${
                          targeted > 1 ? "nt" : ""
                        } cet identifiant — le changer les cassera.`
                      : undefined
                  }
                >
                  <input
                    className="box text-[13px]"
                    value={q.id}
                    onChange={(e) => patch(i, { id: e.target.value })}
                    placeholder="experience"
                    spellCheck={false}
                  />
                </Field>

                <Field label="Type de réponse">
                  <select
                    className="box"
                    value={q.type}
                    onChange={(e) => {
                      const type = e.target.value as QuestionType;
                      // On conserve les options existantes uniquement pour les types à choix.
                      patch(i, {
                        type,
                        options: type === "single" || type === "multi" ? q.options ?? [] : undefined,
                        maxChoices: type === "multi" ? q.maxChoices : undefined,
                      });
                    }}
                  >
                    {TYPE_LABELS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>

                {hasOptions ? (
                  <Field
                    label="Options"
                    hint="Une option par ligne."
                    className="md:col-span-2"
                  >
                    <textarea
                      className="box text-[13px]"
                      rows={Math.min(12, Math.max(4, (q.options ?? []).length + 1))}
                      value={(q.options ?? []).join("\n")}
                      onChange={(e) => patch(i, { options: e.target.value.split("\n") })}
                      placeholder={"Immédiatement\nSous 1 mois\nPlus tard"}
                    />
                  </Field>
                ) : null}

                {q.type === "multi" ? (
                  <Field label="Choix maximum" hint="Vide = pas de limite.">
                    <input
                      className="box"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={q.maxChoices ?? ""}
                      onChange={(e) => patch(i, { maxChoices: numOrUndef(e.target.value) })}
                    />
                  </Field>
                ) : null}

                {q.type === "number" || q.type === "scale" ? (
                  <>
                    <Field label="Minimum">
                      <input
                        className="box"
                        type="number"
                        inputMode="numeric"
                        value={q.min ?? ""}
                        onChange={(e) => patch(i, { min: numOrUndef(e.target.value) })}
                      />
                    </Field>
                    <Field label="Maximum">
                      <input
                        className="box"
                        type="number"
                        inputMode="numeric"
                        value={q.max ?? ""}
                        onChange={(e) => patch(i, { max: numOrUndef(e.target.value) })}
                      />
                    </Field>
                  </>
                ) : null}

                {q.type === "number" ? (
                  <Field label="Unité">
                    <input
                      className="box"
                      value={q.unit ?? ""}
                      onChange={(e) => patch(i, { unit: e.target.value || undefined })}
                      placeholder="€ brut / an"
                    />
                  </Field>
                ) : null}

                {q.type === "text" || q.type === "textarea" || q.type === "number" ? (
                  <Field label="Exemple affiché" className={q.type === "number" ? undefined : "md:col-span-2"}>
                    <input
                      className="box"
                      value={q.placeholder ?? ""}
                      onChange={(e) => patch(i, { placeholder: e.target.value || undefined })}
                      placeholder="Texte grisé dans le champ vide."
                    />
                  </Field>
                ) : null}
              </div>

              <div className="mt-2 border-t border-rule2 pt-1">
                <Check
                  checked={Boolean(q.required)}
                  onChange={(v) => patch(i, { required: v })}
                  label="Réponse obligatoire"
                />
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6">
        <button type="button" className="btn-ghost min-h-[44px]" onClick={add}>
          Ajouter une question
        </button>
      </div>
    </div>
  );
}
