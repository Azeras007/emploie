"use client";

import { appPath } from "@/lib/basePath";
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
  type Role,
  type ScoreResult,
  type Settings,
  type Status,
  type Store,
} from "@/lib/types";
import { peut } from "@/lib/permissions";

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
  stores,
  role,
}: {
  applicant: Applicant;
  settings: Settings;
  score: ScoreResult;
  previews: Record<string, PreviewPayload>;
  stores: Store[];
  role: Role;
}) {
  const magasin = stores.find((m) => m.id === applicant.storeId) ?? null;
  const router = useRouter();
  const [status, setStatus] = useState<Status>(applicant.status);
  const [notes, setNotes] = useState(applicant.notes);
  const [saved, setSaved] = useState<string | null>(null);
  const [tab, setTab] = useState<"reponses" | "documents">("reponses");
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function patch(body: Record<string, unknown>, flash?: string) {
    const res = await fetch(appPath(`/api/admin/candidatures/${applicant.id}`), {
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
    const res = await fetch(appPath(`/api/admin/candidatures/${applicant.id}`), { method: "DELETE" });
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
      <header className="mt-5 rounded-carte border border-custom3 bg-paper p-5 shadow-soft md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-custom2">
              {applicant.ref} · reçu le {longDate(applicant.createdAt)}
              {magasin ? ` · ${magasin.name}` : ""}
            </p>
            <h1 className="display mt-2 text-[32px] leading-[1.05] md:text-[44px]">
              {applicant.identity.firstName} {applicant.identity.lastName}
            </h1>
            <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-custom1">
              <a className="font-medium underline underline-offset-4 transition-colors hover:text-primaire" href={`mailto:${applicant.identity.email}`}>
                {applicant.identity.email}
              </a>
              {applicant.identity.phone && (
                <a className="font-medium underline underline-offset-4 transition-colors hover:text-primaire" href={`tel:${applicant.identity.phone}`}>
                  {applicant.identity.phone}
                </a>
              )}
              {applicant.identity.city && <span>{applicant.identity.city}</span>}
            </p>
          </div>

          <div className="shrink-0">
            <p className="eyebrow">Score de pertinence</p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="display text-[44px] tabular-nums leading-none text-primaire">{score.percent}</span>
              <span className="text-[13px] font-semibold text-custom2">/ 100</span>
            </div>
            <div className="mt-2.5">
              <Gauge percent={score.disqualified ? 0 : score.percent} />
            </div>
            <p
              className={clsx(
                "pill mt-3 text-[12px]",
                score.disqualified
                  ? "border-custom3 bg-wash text-custom2"
                  : score.pertinent
                    ? "border-secondaire/30 bg-secondaire/10 text-secondaire"
                    : "border-custom3 bg-wash text-custom1"
              )}
            >
              {score.disqualified
                ? "Écarté par un critère"
                : score.pertinent
                  ? `Pertinent · seuil ${settings.threshold}`
                  : `Sous le seuil de ${settings.threshold}`}
            </p>
          </div>
        </div>

        {/* Statut */}
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-custom3 pt-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="eyebrow mr-1 self-center">Statut</span>
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => changeStatus(s.value)}
                className={clsx(
                  "rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors",
                  status === s.value
                    ? "border-primaire bg-primaire text-sur-primaire"
                    : "border-custom3 bg-paper text-custom1 hover:border-primaire hover:text-primaire"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-4">
            {saved && (
              <span className="text-[12px] font-semibold text-secondaire">{saved}</span>
            )}
            {/* Supprimer relève de « donnees » : un recruteur traite un
                dossier, il ne l'efface pas. La route le vérifie aussi — ceci
                n'est que la politesse de ne pas montrer un bouton qui refusera. */}
            {peut({ role, storeId: null }, "donnees") && (
              <button type="button" onClick={remove} className="btn-quiet">
                Supprimer
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Onglets mobile */}
      <div className="sticky top-[57px] z-10 -mx-5 mt-4 border-b border-custom3 bg-paper px-5 md:hidden">
        <div className="flex">
          {(["reponses", "documents"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => selectTab(key)}
              className={clsx(
                "flex-1 border-b-2 py-3.5 text-[14px] font-semibold transition-colors",
                tab === key ? "border-primaire text-primaire" : "border-transparent text-custom1"
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

          <dl className="mt-4 overflow-hidden rounded-carte border border-custom3 bg-paper">
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
          <h2 className="eyebrow mt-10">Pourquoi ce score</h2>
          <ul className="mt-4 overflow-hidden rounded-carte border border-custom3 bg-paper">
            {score.reasons.length === 0 && (
              <li className="px-4 py-4 text-[14px] text-custom1">
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
                  className="flex items-center gap-3 border-b border-custom3 px-4 py-3 text-[14px] last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      good ? "bg-secondaire text-sur-secondaire" : "bg-wash text-custom2"
                    )}
                  >
                    {good ? "✓" : "×"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{reason.label}</span>
                  <span className="hidden shrink-0 text-[12px] text-custom2 sm:inline">{mode?.label}</span>
                  <span className="w-12 shrink-0 text-right text-[13px] font-semibold tabular-nums">
                    {reason.mode === "malus" ? "−" : "+"}
                    {reason.points}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Notes */}
          <h2 className="eyebrow mt-10">Vos notes</h2>
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
                baseUrl={appPath("/api/fichiers")}
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
    <div className="border-b border-custom3 px-4 py-4 last:border-b-0">
      <dt className="flex items-baseline gap-2.5">
        {index !== undefined && (
          <span className="text-[11px] font-bold tabular-nums text-primaire">
            {String(index).padStart(2, "0")}
          </span>
        )}
        <span className="text-[13px] leading-snug text-custom1">{label}</span>
      </dt>
      <dd className={clsx("mt-2", index !== undefined && "pl-[1.9rem]")}>
        {empty ? (
          <span className="text-[15px] text-custom2">Sans réponse</span>
        ) : Array.isArray(value) ? (
          <ul className="flex flex-wrap gap-1.5">
            {value.map((v) => (
              <li key={v} className="rounded-full border border-primaire/25 bg-primaire/5 px-3 py-1 text-[13px] font-medium text-primaire-hover">
                {v}
              </li>
            ))}
          </ul>
        ) : long ? (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{String(value)}</p>
        ) : typeof value === "number" ? (
          <p className="text-[17px] leading-snug">
            <span className="font-semibold tabular-nums">{value.toLocaleString("fr-FR")}</span>
            {unit ? <span className="text-custom1"> {unit}</span> : null}
          </p>
        ) : (
          <p className="text-[17px] leading-snug">{String(value)}</p>
        )}
      </dd>
    </div>
  );
}
