"use client";

import { appPath } from "@/lib/basePath";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import Logo from "@/components/Logo";
import { ACCEPT_ATTRIBUTE, humanSize } from "@/lib/mime";
import type { AnswerValue, FileKind, Identity, Question, Settings, StoredFile } from "@/lib/types";

interface Upload {
  localId: string;
  kind: FileKind;
  name: string;
  size: number;
  state: "envoi" | "ok" | "erreur";
  error?: string;
  payload?: { file: StoredFile; signature: string };
}

const EMPTY_IDENTITY: Identity = { firstName: "", lastName: "", email: "", phone: "", city: "" };

const KIND_LABEL: Record<FileKind, string> = {
  cv: "CV",
  lettre: "Lettre de motivation",
  autre: "Document",
};

function isEmpty(value: AnswerValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export default function Questionnaire({
  settings,
  inviteToken,
  inviteLabel,
  uploadsProblem,
}: {
  settings: Settings;
  inviteToken: string | null;
  inviteLabel?: string | null;
  uploadsProblem?: string | null;
}) {
  const router = useRouter();
  const questions = settings.questions;

  const [step, setStep] = useState(0);
  const [identity, setIdentity] = useState<Identity>(EMPTY_IDENTITY);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  // Le passage automatique à la question suivante se déclenche après un court délai :
  // la validation doit donc lire l'état à jour, pas celui capturé à la sélection.
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // 0 = identité, 1..N = questions, N+1 = documents, N+2 = relecture
  const identityStep = 0;
  const docsStep = questions.length + 1;
  const reviewStep = questions.length + 2;
  const lastStep = reviewStep;

  const progress = Math.round((step / lastStep) * 100);
  const currentQuestion: Question | null =
    step >= 1 && step <= questions.length ? questions[step - 1] : null;

  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    window.scrollTo({ top: 0 });
  }, [step]);

  const setAnswer = useCallback((id: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setError(null);
  }, []);

  const cvUpload = uploads.find((u) => u.kind === "cv");

  const validate = useCallback((): string | null => {
    if (step === identityStep) {
      if (!identity.firstName.trim()) return "Indiquez votre prénom.";
      if (!identity.lastName.trim()) return "Indiquez votre nom.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identity.email.trim()))
        return "Indiquez une adresse e-mail valide.";
      return null;
    }
    if (currentQuestion) {
      if (currentQuestion.required && isEmpty(answersRef.current[currentQuestion.id] ?? null))
        return "Cette question attend une réponse.";
      return null;
    }
    if (step === docsStep) {
      if (!cvUpload) return "Ajoutez votre CV pour continuer.";
      if (cvUpload.state === "envoi") return "Votre CV est encore en cours d'envoi.";
      if (cvUpload.state === "erreur") return "Votre CV n'a pas pu être envoyé.";
      return null;
    }
    return null;
  }, [step, identity, currentQuestion, docsStep, cvUpload, identityStep]);

  const next = useCallback(() => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, lastStep));
  }, [validate, lastStep]);

  const back = useCallback(() => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  /* ---------------- téléversement ---------------- */

  const startUpload = useCallback(async (file: File, kind: FileKind) => {
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setUploads((prev) => {
      const next = prev.filter((u) => !(kind !== "autre" && u.kind === kind));
      return [...next, { localId, kind, name: file.name, size: file.size, state: "envoi" }];
    });

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      const res = await fetch(appPath("/api/televersement"), { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "L'envoi a échoué.");
      setUploads((prev) =>
        prev.map((u) => (u.localId === localId ? { ...u, state: "ok", payload: data } : u))
      );
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "L'envoi a échoué.";
      setUploads((prev) =>
        prev.map((u) => (u.localId === localId ? { ...u, state: "erreur", error: message } : u))
      );
    }
  }, []);

  const removeUpload = useCallback((localId: string) => {
    setUploads((prev) => prev.filter((u) => u.localId !== localId));
  }, []);

  /* ---------------- envoi final ---------------- */

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(appPath("/api/candidature"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identity,
          answers,
          files: uploads.filter((u) => u.state === "ok" && u.payload).map((u) => u.payload),
          inviteToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "L'envoi a échoué.");
      router.push(`/envoyee?ref=${encodeURIComponent(data.ref)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'envoi a échoué.");
      setSubmitting(false);
    }
  }, [identity, answers, uploads, inviteToken, router]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement;
      if (target.tagName === "TEXTAREA") return;
      if (step === lastStep) return;
      event.preventDefault();
      next();
    },
    [next, step, lastStep]
  );

  const stepLabel = useMemo(() => {
    if (step === identityStep) return "Vos coordonnées";
    if (currentQuestion) return `Question ${pad(step)} sur ${pad(questions.length)}`;
    if (step === docsStep) return "Vos documents";
    return "Relecture";
  }, [step, currentQuestion, questions.length, docsStep, identityStep]);

  return (
    <div className="flex min-h-dvh flex-col" onKeyDown={onKeyDown}>
      <div ref={topRef} />

      {/* Entête */}
      <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur">
        <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.max(progress, 2)}%` }} />
        </div>
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-5 py-3.5 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Logo height={24} className="sm:hidden" priority />
            <Logo height={28} className="hidden sm:inline-flex" priority />
            <span className="hidden h-6 w-px bg-custom3 sm:block" />
            <p className="hidden truncate text-[13px] text-custom1 sm:block">{settings.jobTitle}</p>
          </div>
          <p className="shrink-0 text-[12px] font-semibold text-custom2">{stepLabel}</p>
        </div>
        <div className="border-b border-custom3" />
      </header>

      {/* Contenu */}
      <main className="mx-auto w-full max-w-[900px] flex-1 px-5 pb-40 pt-10 md:px-8 md:pb-32 md:pt-16">
        <div key={step} className="rise">
          {step === identityStep && (
            <IdentityStep
              identity={identity}
              setIdentity={(patch) => {
                setIdentity((prev) => ({ ...prev, ...patch }));
                setError(null);
              }}
              intro={settings.intro}
              jobTitle={settings.jobTitle}
              inviteLabel={inviteLabel}
              questionCount={questions.length}
              uploadsProblem={uploadsProblem}
            />
          )}

          {currentQuestion && (
            <QuestionStep
              index={step}
              total={questions.length}
              question={currentQuestion}
              value={answers[currentQuestion.id] ?? null}
              onChange={(value) => setAnswer(currentQuestion.id, value)}
              onAdvance={next}
            />
          )}

          {step === docsStep && (
            <DocumentsStep uploads={uploads} onPick={startUpload} onRemove={removeUpload} />
          )}

          {step === reviewStep && (
            <ReviewStep
              identity={identity}
              questions={questions}
              answers={answers}
              uploads={uploads}
              onJump={(target) => setStep(target)}
            />
          )}
        </div>
      </main>

      {/* Barre d'action */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-custom3 bg-paper">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-3 px-5 py-3.5 md:px-8">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="btn-quiet disabled:pointer-events-none disabled:opacity-25"
          >
            ← Retour
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            {error && (
              <p role="alert" className="truncate text-right text-[13px] font-medium text-corail-fonce">
                {error}
              </p>
            )}
            {step === lastStep ? (
              <button type="button" onClick={submit} disabled={submitting} className="btn shrink-0">
                {submitting ? "Envoi…" : "Envoyer ma candidature"}
              </button>
            ) : (
              <button type="button" onClick={next} className="btn shrink-0">
                Continuer
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BigNumber({ value }: { value: string }) {
  return (
    <span className="block text-[13px] font-bold tabular-nums text-corail md:absolute md:-left-24 md:top-2 md:text-[15px]">
      {value}
    </span>
  );
}

function IdentityStep({
  identity,
  setIdentity,
  intro,
  jobTitle,
  inviteLabel,
  questionCount,
  uploadsProblem,
}: {
  identity: Identity;
  setIdentity: (patch: Partial<Identity>) => void;
  intro: string;
  jobTitle: string;
  inviteLabel?: string | null;
  questionCount: number;
  uploadsProblem?: string | null;
}) {
  return (
    <div className="max-w-measure">
      <p className="eyebrow">{inviteLabel ? `Invitation — ${inviteLabel}` : "Candidature"}</p>
      <h1 className="display mt-4 text-[34px] leading-[1.05] md:text-[52px]">{jobTitle}</h1>
      <p className="mt-5 text-[16px] leading-relaxed text-muted md:text-[17px]">{intro}</p>
      <p className="mt-4 inline-flex rounded-full bg-primaire/10 px-3.5 py-1.5 text-[12px] font-semibold text-primaire-hover">
        {pad(questionCount)} questions · puis vos documents
      </p>

      {uploadsProblem && (
        <div className="mt-8 rounded-carte border border-corail/40 bg-corail-pale p-4">
          <p className="eyebrow text-corail-fonce">Dépôt de documents indisponible</p>
          <p className="mt-2 text-[14px] leading-relaxed">
            Le CV ne peut pas être reçu pour le moment. Prévenez votre contact plutôt que de
            remplir le questionnaire : il serait perdu à la dernière étape.
          </p>
        </div>
      )}

      <div className="mt-12 grid gap-x-8 gap-y-7 sm:grid-cols-2">
        <Field label="Prénom" required>
          <input
            className="field"
            value={identity.firstName}
            autoComplete="given-name"
            onChange={(e) => setIdentity({ firstName: e.target.value })}
            placeholder="Camille"
          />
        </Field>
        <Field label="Nom" required>
          <input
            className="field"
            value={identity.lastName}
            autoComplete="family-name"
            onChange={(e) => setIdentity({ lastName: e.target.value })}
            placeholder="Berger"
          />
        </Field>
        <Field label="E-mail" required>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={identity.email}
            onChange={(e) => setIdentity({ email: e.target.value })}
            placeholder="camille@exemple.fr"
          />
        </Field>
        <Field label="Téléphone">
          <input
            className="field"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={identity.phone}
            onChange={(e) => setIdentity({ phone: e.target.value })}
            placeholder="06 12 34 56 78"
          />
        </Field>
        <Field label="Ville">
          <input
            className="field"
            autoComplete="address-level2"
            value={identity.city}
            onChange={(e) => setIdentity({ city: e.target.value })}
            placeholder="Bordeaux"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow block">
        {label}
        {required ? "\u00a0*" : ""}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function QuestionStep({
  index,
  total,
  question,
  value,
  onChange,
  onAdvance,
}: {
  index: number;
  total: number;
  question: Question;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  onAdvance: () => void;
}) {
  return (
    <div className="relative max-w-measure">
      <BigNumber value={`${pad(index)}/${pad(total)}`} />
      <h2 className="display mt-3 text-[26px] leading-[1.15] md:mt-0 md:text-[34px]">
        {question.label}
        {question.required ? <span className="text-corail">&nbsp;*</span> : null}
      </h2>
      {question.hint && (
        <p className="mt-3 text-[15px] leading-relaxed text-custom1">{question.hint}</p>
      )}

      <div className="mt-8">
        <AnswerInput question={question} value={value} onChange={onChange} onAdvance={onAdvance} />
      </div>
    </div>
  );
}

function AnswerInput({
  question,
  value,
  onChange,
  onAdvance,
}: {
  question: Question;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  onAdvance: () => void;
}) {
  const options = question.options ?? [];

  if (question.type === "single") {
    return (
      <ul className="space-y-2.5">
        {options.map((option) => {
          const selected = value === option;
          return (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  onChange(option);
                  window.setTimeout(onAdvance, 180);
                }}
                aria-pressed={selected}
                className={clsx(
                  "flex w-full items-center gap-3.5 rounded-champ border px-4 py-3.5 text-left text-[16px] transition-colors",
                  selected
                    ? "border-primaire bg-primaire/10 font-semibold text-primaire-hover"
                    : "border-custom3 bg-paper hover:border-primaire/50 hover:bg-primaire/5"
                )}
              >
                <span
                  className={clsx(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    selected ? "border-primaire" : "border-custom3"
                  )}
                >
                  {selected && <span className="h-2.5 w-2.5 rounded-full bg-primaire" />}
                </span>
                <span>{option}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (question.type === "multi") {
    const list = Array.isArray(value) ? value : [];
    return (
      <>
        <ul className="space-y-2.5">
          {options.map((option) => {
            const selected = list.includes(option);
            return (
              <li key={option}>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      selected ? list.filter((v) => v !== option) : [...list, option]
                    )
                  }
                  aria-pressed={selected}
                  className={clsx(
                    "flex w-full items-center gap-3.5 rounded-champ border px-4 py-3.5 text-left text-[16px] transition-colors",
                    selected
                      ? "border-primaire bg-primaire/10 font-semibold text-primaire-hover"
                      : "border-custom3 bg-paper hover:border-primaire/50 hover:bg-primaire/5"
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      selected ? "border-primaire bg-primaire" : "border-custom3"
                    )}
                  >
                    {selected && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                        <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span>{option}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[13px] font-medium text-custom1">
          {list.length} sélectionné{list.length > 1 ? "s" : ""}
        </p>
      </>
    );
  }

  if (question.type === "scale") {
    const min = question.min ?? 1;
    const max = question.max ?? 10;
    const items = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              onChange(n);
              window.setTimeout(onAdvance, 180);
            }}
            className={clsx(
              "h-12 w-12 rounded-full border text-[15px] font-semibold tabular-nums transition-colors",
              value === n
                ? "border-primaire bg-primaire text-sur-primaire"
                : "border-custom3 bg-paper hover:border-primaire hover:text-primaire"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "number") {
    return (
      <div className="flex items-baseline gap-3">
        <input
          className="field max-w-[220px] text-[24px] font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          type="number"
          inputMode="numeric"
          min={question.min}
          max={question.max}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={question.placeholder}
          autoFocus
        />
        {question.unit && <span className="text-[14px] font-medium text-custom1">{question.unit}</span>}
      </div>
    );
  }

  if (question.type === "textarea") {
    const text = typeof value === "string" ? value : "";
    return (
      <>
        <textarea
          className="box min-h-[180px] resize-y leading-relaxed"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder}
          maxLength={4000}
        />
        <p className="mt-2 text-right text-[12px] tabular-nums text-custom2">
          {text.length} / 4000
        </p>
      </>
    );
  }

  return (
    <input
      className="field text-[19px]"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={question.placeholder}
      autoFocus
    />
  );
}

function DocumentsStep({
  uploads,
  onPick,
  onRemove,
}: {
  uploads: Upload[];
  onPick: (file: File, kind: FileKind) => void;
  onRemove: (localId: string) => void;
}) {
  return (
    <div className="max-w-measure">
      <p className="eyebrow">Dernière étape</p>
      <h2 className="display mt-4 text-[26px] leading-[1.15] md:text-[34px]">Vos documents</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-custom1">
        PDF, Word, OpenDocument ou image — 4 Mo par fichier. Le CV est obligatoire.
      </p>

      <div className="mt-10 space-y-8">
        <Dropzone
          kind="cv"
          label="CV"
          required
          hint="Le document qu'on lira en premier."
          uploads={uploads}
          onPick={onPick}
          onRemove={onRemove}
        />
        <Dropzone
          kind="lettre"
          label="Lettre de motivation"
          hint="Facultative si vous avez déjà tout dit plus haut."
          uploads={uploads}
          onPick={onPick}
          onRemove={onRemove}
        />
        <Dropzone
          kind="autre"
          label="Autres documents"
          hint="Portfolio, certifications, recommandations…"
          multiple
          uploads={uploads}
          onPick={onPick}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}

function Dropzone({
  kind,
  label,
  hint,
  required,
  multiple,
  uploads,
  onPick,
  onRemove,
}: {
  kind: FileKind;
  label: string;
  hint: string;
  required?: boolean;
  multiple?: boolean;
  uploads: Upload[];
  onPick: (file: File, kind: FileKind) => void;
  onRemove: (localId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const mine = uploads.filter((u) => u.kind === kind);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list);
    (multiple ? files : files.slice(0, 1)).forEach((f) => onPick(f, kind));
  };

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">
          {label}
          {required ? "\u00a0*" : ""}
        </p>
        <p className="text-[12px] text-custom2">{hint}</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={clsx(
          "mt-2 rounded-carte border-2 border-dashed transition-colors",
          over ? "border-primaire bg-primaire/5" : "border-custom3 bg-wash"
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 px-4 py-8 text-[14px] text-custom1 transition-colors hover:text-primaire"
        >
          <span className="text-[14px] font-semibold">
            {mine.length && !multiple ? "Remplacer le fichier" : "Choisir un fichier"}
          </span>
          <span className="hidden sm:inline text-custom2">ou glissez-le ici</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={ACCEPT_ATTRIBUTE}
          multiple={multiple}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {mine.length > 0 && (
        <ul className="mt-3 space-y-2">
          {mine.map((u) => (
            <li
              key={u.localId}
              className="flex items-center gap-3 rounded-champ border border-custom3 bg-paper px-4 py-3 text-[14px]"
            >
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span
                className={clsx(
                  "shrink-0 text-[12px] font-medium tabular-nums",
                  u.state === "erreur" ? "text-corail-fonce" : "text-custom2"
                )}
              >
                {u.state === "envoi"
                  ? "envoi…"
                  : u.state === "erreur"
                    ? "échec"
                    : humanSize(u.size)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(u.localId)}
                className="shrink-0 text-[13px] font-semibold text-custom1 transition-colors hover:text-primaire"
                aria-label={`Retirer ${u.name}`}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {mine.some((u) => u.state === "erreur") && (
        <p className="mt-2 rounded-champ bg-corail-pale px-3 py-2 text-[13px] text-corail-fonce">
          {mine.find((u) => u.state === "erreur")?.error}
        </p>
      )}
    </section>
  );
}

function ReviewStep({
  identity,
  questions,
  answers,
  uploads,
  onJump,
}: {
  identity: Identity;
  questions: Question[];
  answers: Record<string, AnswerValue>;
  uploads: Upload[];
  onJump: (step: number) => void;
}) {
  const render = (value: AnswerValue) => {
    if (isEmpty(value)) return "—";
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  };

  return (
    <div className="max-w-measure">
      <p className="eyebrow">Avant l'envoi</p>
      <h2 className="display mt-4 text-[26px] leading-[1.15] md:text-[34px]">Relisez-vous</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-custom1">
        Tout est modifiable : touchez une ligne pour y revenir.
      </p>

      <dl className="mt-8 overflow-hidden rounded-carte border border-custom3 bg-paper">
        <ReviewRow label="Vous" onClick={() => onJump(0)}>
          {identity.firstName} {identity.lastName}
          <br />
          <span className="text-custom1">
            {identity.email}
            {identity.phone ? ` · ${identity.phone}` : ""}
            {identity.city ? ` · ${identity.city}` : ""}
          </span>
        </ReviewRow>

        {questions.map((q, i) => (
          <ReviewRow key={q.id} label={q.label} onClick={() => onJump(i + 1)}>
            {render(answers[q.id] ?? null)}
          </ReviewRow>
        ))}

        <ReviewRow label="Documents" onClick={() => onJump(questions.length + 1)}>
          {uploads.length === 0
            ? "—"
            : uploads.map((u) => `${KIND_LABEL[u.kind]} — ${u.name}`).join(" · ")}
        </ReviewRow>
      </dl>
    </div>
  );
}

function ReviewRow({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="border-b border-custom3 last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className="group grid w-full grid-cols-1 gap-1 px-4 py-4 text-left transition-colors hover:bg-primaire/5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-6"
      >
        <dt className="eyebrow pt-0.5">{label}</dt>
        <dd className="flex items-start justify-between gap-4 text-[15px] leading-relaxed">
          <span className="min-w-0 whitespace-pre-wrap break-words">{children}</span>
          <span className="mt-0.5 shrink-0 text-[12px] font-semibold text-primaire opacity-0 transition-opacity group-hover:opacity-100">
            Modifier
          </span>
        </dd>
      </button>
    </div>
  );
}
