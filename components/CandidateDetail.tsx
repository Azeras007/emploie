"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Gauge } from "@/components/ui";
import DocumentViewer from "@/components/DocumentViewer";
import type { PreviewPayload } from "@/lib/preview";
import {
  RULE_MODES,
  STATUSES,
  type AnswerValue,
  type Applicant,
  type ScoreResult,
  type Settings,
  type Status,
} from "@/lib/types";

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CandidateDetail({
  applicant,
  settings,
  score,
  previews,
}: {
  applicant: Applicant;
  settings: Settings;
  score: ScoreResult;
  previews: Record<string, PreviewPayload>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(applicant.status);
  const [notes, setNotes] = useState(applicant.notes);
  const [saved, setSaved] = useState<string | null>(null);
  const [tab, setTab] = useState<"reponses" | "documents">("reponses");
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function patch(body: Record<string, unknown>, flash?: string) {
    const res = await fetch(`/api/admin/candidatures/${applicant.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      if (flash) {
        setSaved(flash);
        window.setTimeout(() => setSaved(null), 1800);
      }
      router.refresh();
    }
  }

  function changeStatus(value: Status) {
    setStatus(value);
    patch({ status: value }, "Statut mis à jour");
  }

  function changeNotes(value: string) {
    setNotes(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => patch({ notes: value }, "Note enregistrée"), 700);
  }

  useEffect(() => () => {
    if (notesTimer.current) clearTimeout(notesTimer.current);
  }, []);

  // L'onglet mobile suit l'ancre : /admin/candidats/<id>#documents ouvre les pièces jointes.
  useEffect(() => {
    if (window.location.hash === "#documents") setTab("documents");
  }, []);

  function selectTab(value: "reponses" | "documents") {
    setTab(value);
    history.replaceState(null, "", value === "documents" ? "#documents" : " ");
  }

  async function remove() {
    if (!window.confirm("Supprimer définitivement ce dossier et ses documents ?")) return;
    const res = await fetch(`/api/admin/candidatures/${applicant.id}`, { method: "DELETE" });
    if (res.ok) {
      router.replace("/admin");
      router.refresh();
    }
  }

  const answered = settings.questions.filter(
    (q) => applicant.answers[q.id] !== undefined && applicant.answers[q.id] !== null
  );
  const orphans = Object.keys(applicant.answers).filter(
    (key) => !settings.questions.some((q) => q.id === key)
  );

  return (
    <div className="pb-10">
      <Link href="/admin" className="btn-quiet">
        ← Tous les dossiers
      </Link>

      {/* Entête du dossier */}
      <header className="mt-5 border-b border-rule pb-7">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-muted">
              {applicant.ref} · reçu le {longDate(applicant.createdAt)}
            </p>
            <h1 className="display mt-2 text-[32px] leading-[1.02] md:text-[46px]">
              {applicant.identity.firstName} {applicant.identity.lastName}
            </h1>
            <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-muted">
              <a className="underline underline-offset-4 hover:text-ink" href={`mailto:${applicant.identity.email}`}>
                {applicant.identity.email}
              </a>
              {applicant.identity.phone && (
                <a className="underline underline-offset-4 hover:text-ink" href={`tel:${applicant.identity.phone}`}>
                  {applicant.identity.phone}
                </a>
              )}
              {applicant.identity.city && <span>{applicant.identity.city}</span>}
            </p>
          </div>

          <div className="shrink-0">
            <p className="eyebrow">Score de pertinence</p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="display text-[40px] tabular-nums leading-none">{score.percent}</span>
              <span className="font-mono text-[12px] text-muted">/ 100</span>
            </div>
            <div className="mt-2.5">
              <Gauge percent={score.disqualified ? 0 : score.percent} />
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              {score.disqualified
                ? "Écarté par un critère"
                : score.pertinent
                  ? `Pertinent (seuil ${settings.threshold})`
                  : `Sous le seuil de ${settings.threshold}`}
            </p>
          </div>
        </div>

        {/* Statut */}
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="eyebrow mr-1">Statut</span>
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => changeStatus(s.value)}
                className={clsx(
                  "border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
                  status === s.value
                    ? "border-ink bg-ink text-paper"
                    : "border-rule text-muted hover:border-ink hover:text-ink"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-4">
            {saved && (
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                {saved}
              </span>
            )}
            <button type="button" onClick={remove} className="btn-quiet">
              Supprimer
            </button>
          </div>
        </div>
      </header>

      {/* Onglets mobile */}
      <div className="sticky top-[57px] z-10 -mx-5 mt-0 border-b border-rule bg-paper px-5 md:hidden">
        <div className="flex">
          {(["reponses", "documents"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => selectTab(key)}
              className={clsx(
                "flex-1 border-b-2 py-3 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                tab === key ? "border-ink text-ink" : "border-transparent text-muted"
              )}
            >
              {key === "reponses" ? "Réponses" : `Documents (${applicant.files.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-10 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
        {/* Réponses */}
        <section className={clsx("min-w-0", tab === "reponses" ? "block" : "hidden", "md:block")}>
          <h2 className="eyebrow">Le questionnaire</h2>

          <dl className="mt-4 border-t border-rule">
            {answered.map((q, i) => (
              <AnswerRow
                key={q.id}
                index={i + 1}
                label={q.label}
                value={applicant.answers[q.id] ?? null}
                long={q.type === "textarea"}
                unit={q.type === "number" ? q.unit : undefined}
              />
            ))}
            {orphans.map((key) => (
              <AnswerRow
                key={key}
                label={`${key} (question supprimée)`}
                value={applicant.answers[key]}
                long
              />
            ))}
          </dl>

          {/* Détail du score */}
          <h2 className="eyebrow mt-12">Pourquoi ce score</h2>
          <ul className="mt-4 border-t border-rule">
            {score.reasons.length === 0 && (
              <li className="border-b border-rule py-4 text-[14px] text-muted">
                Aucun critère actif. Définissez-en dans les réglages.
              </li>
            )}
            {score.reasons.map((reason) => {
              const mode = RULE_MODES.find((m) => m.value === reason.mode);
              const good =
                reason.mode === "exclude" ? !reason.hit : reason.mode === "malus" ? !reason.hit : reason.hit;
              return (
                <li
                  key={reason.ruleId}
                  className="flex items-center gap-3 border-b border-rule py-3 text-[14px]"
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "flex h-4 w-4 shrink-0 items-center justify-center border border-ink text-[10px]",
                      good ? "bg-ink text-paper" : "text-muted opacity-40"
                    )}
                  >
                    {good ? "✓" : "×"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{reason.label}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {mode?.label}
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-[12px] tabular-nums">
                    {reason.mode === "malus" ? "−" : "+"}
                    {reason.points}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Notes */}
          <h2 className="eyebrow mt-12">Vos notes</h2>
          <textarea
            className="box mt-3 min-h-[130px] resize-y leading-relaxed"
            placeholder="Ce que vous retenez de ce profil…"
            value={notes}
            onChange={(e) => changeNotes(e.target.value)}
          />
        </section>

        {/* Documents */}
        <section className={clsx("min-w-0", tab === "documents" ? "block" : "hidden", "md:block")}>
          <div className="min-w-0 lg:sticky lg:top-[84px]">
            <h2 className="eyebrow">Documents</h2>
            <div className="mt-4">
              <DocumentViewer
                files={applicant.files}
                previews={previews}
                baseUrl="/api/fichiers"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function AnswerRow({
  index,
  label,
  value,
  long,
  unit,
}: {
  index?: number;
  label: string;
  value: AnswerValue;
  long?: boolean;
  unit?: string;
}) {
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0);

  return (
    <div className="border-b border-rule py-4">
      <dt className="flex items-baseline gap-2.5">
        {index !== undefined && (
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {String(index).padStart(2, "0")}
          </span>
        )}
        <span className="text-[13px] leading-snug text-muted">{label}</span>
      </dt>
      <dd className={clsx("mt-2", index !== undefined && "pl-[1.9rem]")}>
        {empty ? (
          <span className="text-[15px] text-muted">Sans réponse</span>
        ) : Array.isArray(value) ? (
          <ul className="flex flex-wrap gap-1.5">
            {value.map((v) => (
              <li key={v} className="border border-rule px-2.5 py-1 text-[13px]">
                {v}
              </li>
            ))}
          </ul>
        ) : long ? (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{String(value)}</p>
        ) : typeof value === "number" ? (
          <p className="text-[17px] leading-snug">
            <span className="tabular-nums">{value.toLocaleString("fr-FR")}</span>
            {unit ? <span className="text-muted"> {unit}</span> : null}
          </p>
        ) : (
          <p className="text-[17px] leading-snug">{String(value)}</p>
        )}
      </dd>
    </div>
  );
}
