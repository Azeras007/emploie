"use client";

import { appPath } from "@/lib/basePath";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { scoreApplicant } from "@/lib/scoring";
import type { Applicant, Invite, Question, Settings } from "@/lib/types";
import AccountSection from "./AccountSection";
import QuestionsSection from "./QuestionsSection";
import RulesSection, { type RulesPreview } from "./RulesSection";
import { Field, Notice } from "./controls";

/** Projection minimale d'une candidature : de quoi simuler le score, rien de plus. */
export type PreviewApplicant = Pick<Applicant, "id" | "identity" | "answers" | "files">;

type TabId = "poste" | "questionnaire" | "tri" | "compte";

const TABS: { id: TabId; label: string }[] = [
  { id: "poste", label: "Poste & accueil" },
  { id: "questionnaire", label: "Questionnaire" },
  { id: "tri", label: "Tri & pertinence" },
  { id: "compte", label: "Compte & liens" },
];

export default function SettingsClient({
  initialSettings,
  initialInvites,
  username,
  applicants,
}: {
  initialSettings: Settings;
  initialInvites: Invite[];
  username: string;
  applicants: PreviewApplicant[];
}) {
  const router = useRouter();

  const [tab, setTab] = useState<TabId>("poste");
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(initialSettings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const dirty = useMemo(() => JSON.stringify(settings) !== baseline, [settings, baseline]);

  const patch = useCallback((changes: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...changes }));
  }, []);

  const setQuestions = useCallback(
    (questions: Question[]) => setSettings((s) => ({ ...s, questions })),
    []
  );

  /* Simulation : ce que donneraient les réglages en cours sur les candidatures reçues. */
  const preview: RulesPreview | null = useMemo(() => {
    if (applicants.length === 0) return null;
    let pertinents = 0;
    let ecartes = 0;
    for (const a of applicants) {
      const score = scoreApplicant(a as Applicant, settings);
      if (score.disqualified) ecartes += 1;
      else if (score.pertinent) pertinents += 1;
    }
    return { total: applicants.length, pertinents, ecartes };
  }, [applicants, settings]);

  /* Confirmation « Enregistré » qui s'efface d'elle-même. */
  useEffect(() => {
    if (!savedFlash) return;
    const t = setTimeout(() => setSavedFlash(false), 2600);
    return () => clearTimeout(t);
  }, [savedFlash]);

  /* Garde-fou : on prévient avant de quitter avec des modifications non enregistrées. */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(appPath("/api/admin/reglages"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Enregistrement impossible.");
      // L'API renvoie les réglages nettoyés : on se recale dessus.
      setSettings(data.settings as Settings);
      setBaseline(JSON.stringify(data.settings));
      setSavedFlash(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setSettings(JSON.parse(baseline) as Settings);
    setError(null);
  }

  return (
    <div className="pb-10">
      <header className="pt-8 md:pt-12">
        <p className="eyebrow">Administration</p>
        <h1 className="display mt-2 text-[34px] leading-[1.02] md:text-[46px]">Réglages</h1>
        <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-custom1">
          Le questionnaire, les règles qui trient les candidatures, et vos accès. Tout est modifiable
          et prend effet dès l&apos;enregistrement.
        </p>
      </header>

      {/* ---------- Onglets ---------- */}
      <div className="mt-8 border-b border-custom3">
        <div role="tablist" aria-label="Sections des réglages" className="-mb-px flex gap-6 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panneau-${t.id}`}
              id={`onglet-${t.id}`}
              onClick={() => setTab(t.id)}
              className={clsx(
                "min-h-[44px] shrink-0 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[13px] font-semibold transition-colors",
                tab === t.id ? "border-primaire text-ink" : "border-transparent text-custom1 hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`panneau-${tab}`}
        aria-labelledby={`onglet-${tab}`}
        className="pt-10"
      >
        {/* ---------- 1. Poste & accueil ---------- */}
        {tab === "poste" ? (
          <div>
            <header className="max-w-measure">
              <h2 className="display text-[24px] leading-tight md:text-[28px]">Poste &amp; accueil</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-custom1">
                L&apos;en-tête du questionnaire : ce que le candidat lit avant de commencer.
              </p>
            </header>

            <div className="mt-8 grid max-w-2xl gap-6 md:grid-cols-2">
              <Field label="Intitulé du poste">
                <input
                  className="box"
                  value={settings.jobTitle}
                  onChange={(e) => patch({ jobTitle: e.target.value })}
                  placeholder="Conseiller·ère de vente"
                />
              </Field>
              <Field label="Nom de la structure">
                <input
                  className="box"
                  value={settings.companyName}
                  onChange={(e) => patch({ companyName: e.target.value })}
                  placeholder="Kiabi"
                />
              </Field>
              <Field
                label="Domaine public"
                hint="L'adresse inscrite dans les QR codes. Une fois un code imprimé, elle ne peut plus changer : indiquez un domaine que vous maîtrisez, jamais celui de l'hébergeur."
                className="md:col-span-2"
              >
                <input
                  className="box"
                  value={settings.publicBaseUrl}
                  onChange={(e) => patch({ publicBaseUrl: e.target.value })}
                  placeholder="https://recrutement.kiabi.com"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field
                label="Texte d'accueil"
                hint="Deux ou trois phrases. Le ton donné ici donne le ton des réponses."
                className="md:col-span-2"
              >
                <textarea
                  className="box"
                  rows={5}
                  value={settings.intro}
                  onChange={(e) => patch({ intro: e.target.value })}
                />
              </Field>
            </div>

            {/* Aperçu de l'en-tête tel que le candidat le verra. */}
            <div className="mt-10 max-w-2xl">
              <p className="eyebrow">Aperçu</p>
              <div className="card mt-2 px-5 py-7 md:px-8 md:py-10">
                <p className="eyebrow">{settings.companyName || "—"}</p>
                <p className="display mt-2 text-[26px] leading-[1.05] md:text-[32px]">
                  {settings.jobTitle || "Intitulé du poste"}
                </p>
                <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-custom1">
                  {settings.intro || "Texte d'accueil…"}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* ---------- 2. Questionnaire ---------- */}
        {tab === "questionnaire" ? (
          <QuestionsSection
            questions={settings.questions}
            rules={settings.rules}
            onChange={setQuestions}
          />
        ) : null}

        {/* ---------- 3. Tri & pertinence ---------- */}
        {tab === "tri" ? (
          <RulesSection settings={settings} onPatch={patch} preview={preview} />
        ) : null}

        {/* ---------- 4. Compte & liens ---------- */}
        {tab === "compte" ? (
          <AccountSection
            username={username}
            initialInvites={initialInvites}
            publicBaseUrl={settings.publicBaseUrl}
          />
        ) : null}
      </div>

      {/* ---------- Barre d'enregistrement collante ---------- */}
      {dirty || savedFlash || error ? (
        <div className="sticky bottom-0 z-20 -mx-5 mt-12 border-t border-custom3 bg-paper/95 px-5 py-3.5 backdrop-blur md:-mx-8 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              {error ? (
                <Notice kind="error">{error}</Notice>
              ) : savedFlash && !dirty ? (
                <p className="text-[13px] font-semibold">Enregistré</p>
              ) : (
                <p className="text-[13px] font-semibold text-custom1">
                  Modifications non enregistrées
                </p>
              )}
            </div>
            {dirty ? (
              <div className="flex shrink-0 items-center gap-3">
                <button type="button" className="btn-quiet min-h-[44px]" onClick={reset} disabled={saving}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn min-h-[44px]"
                  onClick={() => void save()}
                  disabled={saving}
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
