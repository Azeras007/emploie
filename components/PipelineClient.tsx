"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Empty, Score, StatusDot, StatusPill } from "@/components/ui";
import { STATUSES, type Settings, type Status } from "@/lib/types";
import type { ScoredApplicant } from "@/lib/scoring";

type SortKey = "score" | "recent" | "name";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "score", label: "Score" },
  { value: "recent", label: "Plus récents" },
  { value: "name", label: "Nom" },
];

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function statusLabel(status: Status): string {
  return STATUSES.find((s) => s.value === status)?.label ?? status;
}

function haystack(a: ScoredApplicant): string {
  return [
    a.ref,
    a.identity.firstName,
    a.identity.lastName,
    a.identity.email,
    a.identity.city,
    a.notes,
    ...Object.values(a.answers).map((v) => (Array.isArray(v) ? v.join(" ") : String(v ?? ""))),
  ]
    .join(" ")
    .toLowerCase();
}

export default function PipelineClient({
  applicants,
  settings,
}: {
  applicants: ScoredApplicant[];
  settings: Settings;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status | "tous">("tous");
  const [onlyPertinent, setOnlyPertinent] = useState(false);
  const [hideOut, setHideOut] = useState(settings.hideDisqualified);
  const [sort, setSort] = useState<SortKey>(settings.defaultSort);

  const summaryQuestion = settings.questions.find((q) => q.type === "single");

  const stats = useMemo(
    () => ({
      total: applicants.length,
      nouveaux: applicants.filter((a) => a.status === "nouveau").length,
      pertinents: applicants.filter((a) => a.score.pertinent).length,
      ecartes: applicants.filter((a) => a.score.disqualified).length,
    }),
    [applicants]
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = applicants.filter((a) => {
      if (status !== "tous" && a.status !== status) return false;
      if (onlyPertinent && !a.score.pertinent) return false;
      if (hideOut && a.score.disqualified) return false;
      if (needle && !haystack(a).includes(needle)) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "score") return b.score.percent - a.score.percent;
      if (sort === "name")
        return `${a.identity.lastName} ${a.identity.firstName}`.localeCompare(
          `${b.identity.lastName} ${b.identity.firstName}`,
          "fr"
        );
      return a.createdAt < b.createdAt ? 1 : -1;
    });

    return list;
  }, [applicants, query, status, onlyPertinent, hideOut, sort]);

  return (
    <div>
      {/* Entête */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">{settings.jobTitle}</p>
          <h1 className="display mt-2 text-[32px] leading-[1.05] md:text-[42px]">Dossiers</h1>
        </div>

        <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:w-auto sm:flex-wrap sm:items-end sm:gap-x-8 sm:gap-y-3">
          <Stat label="Reçus" value={stats.total} />
          <Stat label="Nouveaux" value={stats.nouveaux} />
          <Stat label={`Pertinents (≥ ${settings.threshold})`} value={stats.pertinents} />
          <Stat label="Écartés" value={stats.ecartes} />
        </dl>
      </div>

      {/* Filtres */}
      <div className="mt-8 rounded-2xl border border-custom3 bg-wash p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <input
            className="field max-w-full lg:max-w-[22rem]"
            placeholder="Rechercher un nom, une réf, une réponse…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Chip active={status === "tous"} onClick={() => setStatus("tous")}>
              Tous
            </Chip>
            {STATUSES.map((s) => (
              <Chip key={s.value} active={status === s.value} onClick={() => setStatus(s.value)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Toggle checked={onlyPertinent} onChange={setOnlyPertinent}>
            Profils pertinents seulement
          </Toggle>
          <Toggle checked={hideOut} onChange={setHideOut}>
            Masquer les écartés
          </Toggle>

          <label className="ml-auto flex items-center gap-2">
            <span className="eyebrow">Trier par</span>
            <select
              className="rounded-full border border-custom3 bg-white px-3 py-1.5 text-[13px] font-semibold outline-none transition-colors focus:border-primaire"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Liste */}
      {rows.length === 0 ? (
        <div className="mt-10">
          <Empty
            title={applicants.length === 0 ? "Aucune candidature pour l'instant" : "Rien ne correspond"}
            body={
              applicants.length === 0
                ? "Créez un lien d'invitation dans les réglages, ou partagez l'adresse du questionnaire."
                : "Élargissez la recherche ou désactivez un filtre."
            }
          />
        </div>
      ) : (
        <>
          <p className="mt-6 text-[13px] font-medium text-custom1">
            {rows.length} dossier{rows.length > 1 ? "s" : ""}
          </p>

          {/* Desktop */}
          <div className="mt-3 hidden overflow-hidden rounded-2xl border border-custom3 md:block">
            <div className="grid grid-cols-[1.25rem_6.5rem_minmax(0,1fr)_9rem_6.5rem_4.5rem] items-center gap-4 border-b border-custom3 bg-wash px-5 py-3">
              <span />
              <span className="eyebrow">Réf</span>
              <span className="eyebrow">Candidat</span>
              <span className="eyebrow hidden truncate lg:block" title={summaryQuestion?.label}>
                {summaryQuestion?.label ?? "Réponse"}
              </span>
              <span className="eyebrow">Score</span>
              <span className="eyebrow text-right">Reçu</span>
            </div>

            {rows.map((a) => (
              <Link
                key={a.id}
                href={`/admin/candidats/${a.id}`}
                className="group grid grid-cols-[1.25rem_6.5rem_minmax(0,1fr)_9rem_6.5rem_4.5rem] items-center gap-4 border-b border-custom3 px-5 py-4 transition-colors last:border-b-0 hover:bg-primaire/5"
              >
                <StatusDot status={a.status} />
                <span className="text-[12px] font-semibold tracking-[0.02em] text-custom2">{a.ref}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold">
                    {a.identity.firstName} {a.identity.lastName}
                    {a.score.disqualified && (
                      <span className="ml-2 rounded-full bg-wash px-2 py-0.5 text-[11px] font-semibold text-custom2">
                        écarté
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[13px] text-custom1">
                    {a.identity.email}
                    {a.identity.city ? ` · ${a.identity.city}` : ""}
                  </span>
                </span>
                <span className="hidden truncate text-[13px] text-custom1 lg:block">
                  {summaryQuestion ? String(a.answers[summaryQuestion.id] ?? "—") : statusLabel(a.status)}
                </span>
                <Score percent={a.score.percent} disqualified={a.score.disqualified} />
                <span className="text-right text-[12px] tabular-nums text-custom2">
                  {shortDate(a.createdAt)}
                </span>
              </Link>
            ))}
          </div>

          {/* Mobile */}
          <ul className="mt-3 space-y-3 md:hidden">
            {rows.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/candidats/${a.id}`}
                  className="block rounded-2xl border border-custom3 bg-white p-4 shadow-soft transition-colors active:bg-primaire/5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold tracking-[0.02em] text-custom2">{a.ref}</span>
                    <span className="text-[11px] tabular-nums text-custom2">
                      {shortDate(a.createdAt)}
                    </span>
                  </div>

                  <p className="mt-2 flex items-center gap-2 text-[17px] font-semibold leading-tight">
                    <StatusDot status={a.status} />
                    <span className="min-w-0 truncate">
                      {a.identity.firstName} {a.identity.lastName}
                    </span>
                  </p>

                  <p className="mt-1 truncate text-[13px] text-custom1">
                    {summaryQuestion ? String(a.answers[summaryQuestion.id] ?? a.identity.email) : a.identity.email}
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Score percent={a.score.percent} disqualified={a.score.disqualified} />
                    {a.score.disqualified ? (
                      <span className="pill border-custom3 bg-wash text-[12px] text-custom2">Écarté</span>
                    ) : (
                      <StatusPill status={a.status} />
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="display mt-1 text-[28px] tabular-nums leading-none text-primaire">{value}</dd>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors",
        active
          ? "border-primaire bg-primaire text-white"
          : "border-custom3 bg-white text-custom1 hover:border-primaire hover:text-primaire"
      )}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className={clsx(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          checked ? "border-primaire bg-primaire" : "border-custom3 bg-white"
        )}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
            <path d="M2 6.2 4.6 8.8 10 3.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-[13px] font-medium">{children}</span>
    </label>
  );
}
