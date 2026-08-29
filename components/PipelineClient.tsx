"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Empty, Score, StatusDot } from "@/components/ui";
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
          <h1 className="display mt-2 text-[30px] leading-[1.05] md:text-[40px]">Dossiers</h1>
        </div>

        <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:w-auto sm:flex-wrap sm:items-end sm:gap-x-8 sm:gap-y-3">
          <Stat label="Reçus" value={stats.total} />
          <Stat label="Nouveaux" value={stats.nouveaux} />
          <Stat label={`Pertinents (≥ ${settings.threshold})`} value={stats.pertinents} />
          <Stat label="Écartés" value={stats.ecartes} />
        </dl>
      </div>

      {/* Filtres */}
      <div className="mt-9 border-y border-rule py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <input
            className="field max-w-full py-2 text-[15px] lg:max-w-[22rem]"
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
              className="border-b border-rule bg-transparent py-1 font-mono text-[11px] uppercase tracking-[0.14em] outline-none focus:border-ink"
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
                ? "Créez un lien d'invitation dans les réglages, ou partagez l'adresse /candidature."
                : "Élargissez la recherche ou désactivez un filtre."
            }
          />
        </div>
      ) : (
        <>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            {rows.length} dossier{rows.length > 1 ? "s" : ""}
          </p>

          {/* Desktop */}
          <div className="mt-3 hidden border-t border-rule md:block">
            <div className="grid grid-cols-[1.25rem_6.5rem_minmax(0,1fr)_9rem_6.5rem_4.5rem] items-center gap-4 border-b border-rule py-2">
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
                className="group grid grid-cols-[1.25rem_6.5rem_minmax(0,1fr)_9rem_6.5rem_4.5rem] items-center gap-4 border-b border-rule py-3.5 transition-colors hover:bg-wash"
              >
                <StatusDot status={a.status} />
                <span className="font-mono text-[12px] tracking-[0.04em] text-muted">{a.ref}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">
                    {a.identity.firstName} {a.identity.lastName}
                    {a.score.disqualified && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                        écarté
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[13px] text-muted">
                    {a.identity.email}
                    {a.identity.city ? ` · ${a.identity.city}` : ""}
                  </span>
                </span>
                <span className="hidden truncate text-[13px] text-muted lg:block">
                  {summaryQuestion ? String(a.answers[summaryQuestion.id] ?? "—") : statusLabel(a.status)}
                </span>
                <Score percent={a.score.percent} disqualified={a.score.disqualified} />
                <span className="text-right font-mono text-[12px] tabular-nums text-muted">
                  {shortDate(a.createdAt)}
                </span>
              </Link>
            ))}
          </div>

          {/* Mobile */}
          <ul className="mt-3 border-t border-rule md:hidden">
            {rows.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/candidats/${a.id}`}
                  className="block border-b border-rule py-4 transition-colors active:bg-wash"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] tracking-[0.04em] text-muted">{a.ref}</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted">
                      {shortDate(a.createdAt)}
                    </span>
                  </div>

                  <p className="mt-1.5 flex items-center gap-2 text-[17px] leading-tight">
                    <StatusDot status={a.status} />
                    <span className="min-w-0 truncate">
                      {a.identity.firstName} {a.identity.lastName}
                    </span>
                  </p>

                  <p className="mt-1 truncate text-[13px] text-muted">
                    {summaryQuestion ? String(a.answers[summaryQuestion.id] ?? a.identity.email) : a.identity.email}
                  </p>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Score percent={a.score.percent} disqualified={a.score.disqualified} />
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                      {a.score.disqualified ? "Écarté" : statusLabel(a.status)}
                    </span>
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
      <dd className="display mt-0.5 text-[26px] tabular-nums leading-none">{value}</dd>
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
        "border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
        active ? "border-ink bg-ink text-paper" : "border-rule text-muted hover:border-ink hover:text-ink"
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
          "flex h-4 w-4 shrink-0 items-center justify-center border transition-colors",
          checked ? "border-ink bg-ink" : "border-rule"
        )}
      >
        {checked && <span className="h-1.5 w-1.5 bg-paper" />}
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.14em]">{children}</span>
    </label>
  );
}
