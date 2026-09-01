"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { appPath } from "@/lib/basePath";
import { contraste, estHex } from "@/lib/couleurs";
import {
  derivePalette,
  googleFontsUrl,
  themeVars,
  type JetonCouleur,
  type Theme,
} from "@/lib/theme";
import { Field, Notice } from "./controls";

/**
 * L'écran qui habille l'application aux couleurs d'une enseigne.
 *
 * Deux chemins mènent au même endroit : coller l'adresse du site du client et
 * laisser l'analyse proposer, ou saisir les quatre couleurs à la main. Dans les
 * deux cas l'aperçu est immédiat, et rien n'est enregistré tant qu'on ne le
 * demande pas.
 */

interface Proposition {
  source: string;
  couleurs: { primaire: string | null; accent: string | null; encre: string | null };
  polices: { titre: string | null; texte: string | null };
  logos: string[];
  palette: { hex: string; poids: number; origine: string }[];
  journal: string[];
}

/** Quelques familles courantes, pour éviter la faute de frappe. */
const POLICES = [
  "Figtree", "Inter", "Poppins", "Manrope", "Montserrat", "Roboto", "Open Sans",
  "Lato", "Nunito", "Nunito Sans", "Work Sans", "DM Sans", "Rubik", "Karla",
  "Source Sans 3", "Raleway", "Barlow", "Outfit", "Plus Jakarta Sans", "Fraunces",
  "Playfair Display", "Libre Baskerville", "Bitter", "Recoleta",
];

const JETONS_AJUSTABLES: { jeton: JetonCouleur; label: string }[] = [
  { jeton: "primaire-hover", label: "Survol des boutons" },
  { jeton: "sur-primaire", label: "Texte sur les boutons" },
  { jeton: "corail-fonce", label: "Texte des alertes" },
  { jeton: "corail-pale", label: "Fond des alertes" },
  { jeton: "custom1", label: "Texte secondaire" },
  { jeton: "custom3", label: "Filets et bordures" },
  { jeton: "wash", label: "Fonds neutres" },
  { jeton: "succes", label: "Succès" },
  { jeton: "danger", label: "Erreur" },
];

export default function MarqueSection({ initialTheme }: { initialTheme: Theme }) {
  const router = useRouter();

  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [reference, setReference] = useState(() => JSON.stringify(initialTheme));
  const [adresse, setAdresse] = useState("");
  const [analyse, setAnalyse] = useState(false);
  const [proposition, setProposition] = useState<Proposition | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [apercuGlobal, setApercuGlobal] = useState(false);
  const [avance, setAvance] = useState(false);
  const [importEnCours, setImportEnCours] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(initialTheme.logo.version);

  const modifie = useMemo(() => JSON.stringify(theme) !== reference, [theme, reference]);
  const palette = useMemo(() => derivePalette(theme), [theme]);
  const vars = useMemo(() => themeVars(theme), [theme]);
  const polices = useMemo(() => googleFontsUrl(theme), [theme]);
  /* Le chemin saisi l'emporte, comme côté serveur (voir logoUrl dans lib/theme). */
  const logoActuel = theme.logo.fichier
    ? appPath(theme.logo.fichier)
    : logoVersion
      ? appPath(`/api/marque/logo?v=${encodeURIComponent(logoVersion)}`)
      : null;

  const patch = useCallback((changes: Partial<Theme>) => {
    setTheme((t) => ({ ...t, ...changes }));
  }, []);

  /* Les polices choisies doivent être visibles dans l'aperçu, donc chargées. */
  useEffect(() => {
    if (!polices) return;
    const lien = document.createElement("link");
    lien.rel = "stylesheet";
    lien.href = polices;
    document.head.appendChild(lien);
    return () => {
      lien.remove();
    };
  }, [polices]);

  /**
   * Aperçu sur toute la page : les variables sont posées sur <html>, ce qui
   * rhabille l'application entière sans rien enregistrer. Le nettoyage remet
   * exactement ce qui s'y trouvait — sinon quitter l'onglet laisserait
   * l'interface figée sur un thème jamais validé.
   */
  useEffect(() => {
    if (!apercuGlobal) return;
    const racine = document.documentElement;
    const avant = new Map<string, string>();
    for (const [cle, valeur] of Object.entries(vars)) {
      avant.set(cle, racine.style.getPropertyValue(cle));
      racine.style.setProperty(cle, valeur);
    }
    return () => {
      for (const [cle, valeur] of avant) {
        if (valeur) racine.style.setProperty(cle, valeur);
        else racine.style.removeProperty(cle);
      }
    };
  }, [apercuGlobal, vars]);

  useEffect(() => {
    if (!confirme) return;
    const t = setTimeout(() => setConfirme(false), 2600);
    return () => clearTimeout(t);
  }, [confirme]);

  async function analyser() {
    setAnalyse(true);
    setErreur(null);
    try {
      const res = await fetch(appPath("/api/admin/marque/analyser"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: adresse }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Analyse impossible.");
      const p = data.proposition as Proposition;
      setProposition(p);
      appliquer(p);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Analyse impossible.");
    } finally {
      setAnalyse(false);
    }
  }

  /** Reprend ce que l'analyse a trouvé, sans écraser ce qu'elle n'a pas trouvé. */
  function appliquer(p: Proposition) {
    setTheme((t) => ({
      ...t,
      couleurs: {
        primaire: p.couleurs.primaire ?? t.couleurs.primaire,
        accent: p.couleurs.accent ?? t.couleurs.accent,
        retenu: t.couleurs.retenu,
        encre: p.couleurs.encre ?? t.couleurs.encre,
      },
      polices: {
        titre: p.polices.titre ?? t.polices.titre,
        texte: p.polices.texte ?? t.polices.texte,
      },
    }));
  }

  /** Importe un logotype, d'une adresse ou d'un fichier local. */
  async function importerLogo(source: { url: string } | { fichier: File }) {
    const etiquette = "url" in source ? source.url : source.fichier.name;
    setImportEnCours(etiquette);
    setErreur(null);
    try {
      const requete =
        "url" in source
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: source.url }),
            }
          : (() => {
              const form = new FormData();
              form.append("fichier", source.fichier);
              return { method: "POST", body: form };
            })();

      const res = await fetch(appPath("/api/admin/marque/logo"), requete as RequestInit);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Import impossible.");

      // Le logotype importé prend la main : le champ « chemin » est vidé, comme
      // côté serveur. La référence suit dans le même mouvement — sans quoi
      // l'écran signalerait une modification à enregistrer alors que le serveur
      // vient précisément de l'enregistrer.
      setLogoVersion(data.logo.version as string);
      const suite = { ...theme, logo: { ...theme.logo, fichier: "" } };
      setTheme(suite);
      setReference(JSON.stringify(suite));
      router.refresh();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setImportEnCours(null);
    }
  }

  async function supprimerLogo() {
    setImportEnCours("suppression");
    setErreur(null);
    try {
      const res = await fetch(appPath("/api/admin/marque"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...theme, supprimerLogo: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Suppression impossible.");
      setTheme(data.theme as Theme);
      setReference(JSON.stringify(data.theme));
      setLogoVersion("");
      router.refresh();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setImportEnCours(null);
    }
  }

  async function enregistrer() {
    setEnregistrement(true);
    setErreur(null);
    try {
      const res = await fetch(appPath("/api/admin/marque"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(theme),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Enregistrement impossible.");
      setTheme(data.theme as Theme);
      setReference(JSON.stringify(data.theme));
      setConfirme(true);
      router.refresh();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <header>
        <h2 className="display text-[24px] leading-tight md:text-[28px]">Marque</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-custom1">
          Quatre couleurs suffisent : l&apos;application en déduit toute sa palette, et vérifie
          elle-même que chaque texte reste lisible sur son fond.
        </p>
      </header>

      {/* ---------- Aspiration ---------- */}
      <section className="card mt-8 p-5">
        <p className="eyebrow">Reprendre la charte d&apos;un site</p>
        <p className="mt-2 text-[13px] leading-relaxed text-custom1">
          L&apos;adresse du site de l&apos;enseigne. Les couleurs et les polices en sont extraites,
          puis proposées ici — rien n&apos;est enregistré avant que vous ne le décidiez.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="box flex-1 min-w-[16rem]"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && adresse.trim() && !analyse) analyser();
            }}
            placeholder="https://www.exemple.fr"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn"
            onClick={analyser}
            disabled={analyse || !adresse.trim()}
          >
            {analyse ? "Analyse…" : "Analyser"}
          </button>
        </div>

        {proposition && (
          <div className="mt-4">
            <p className="eyebrow">Couleurs relevées — cliquez pour en choisir une</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {proposition.palette.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={`${c.hex} — ${c.origine}`}
                  onClick={() =>
                    patch({ couleurs: { ...theme.couleurs, primaire: c.hex } })
                  }
                  className="h-8 w-8 rounded-champ border border-custom3 transition-transform hover:scale-110"
                  style={{ background: c.hex }}
                >
                  <span className="sr-only">{c.hex}</span>
                </button>
              ))}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-semibold text-custom1">
                Ce que l&apos;analyse a compris
              </summary>
              <ul className="mt-2 space-y-1">
                {proposition.journal.map((ligne) => (
                  <li key={ligne} className="text-[12px] leading-relaxed text-custom1">
                    {ligne}
                  </li>
                ))}
              </ul>
            </details>
            {proposition.logos.length > 0 && (
              <div className="mt-4">
                <p className="eyebrow">Logotypes repérés — cliquez pour importer</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {proposition.logos.map((url) => (
                    <button
                      key={url}
                      type="button"
                      title={url}
                      disabled={importEnCours !== null}
                      onClick={() => importerLogo({ url })}
                      className="grid h-14 w-24 place-items-center rounded-champ border border-custom3 bg-paper p-1.5 transition-colors hover:border-primaire disabled:opacity-40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
                {importEnCours && importEnCours !== "suppression" && (
                  <p className="mt-2 text-[12px] text-custom1">Import en cours…</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- Les quatre couleurs ---------- */}
      <section className="mt-8">
        <p className="eyebrow">Les couleurs de la marque</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Couleur
            label="Principale"
            aide="Boutons, aplats sombres, titres."
            valeur={theme.couleurs.primaire}
            onChange={(v) => patch({ couleurs: { ...theme.couleurs, primaire: v } })}
          />
          <Couleur
            label="Accent"
            aide="Jauges, alertes, petits repères."
            valeur={theme.couleurs.accent}
            onChange={(v) => patch({ couleurs: { ...theme.couleurs, accent: v } })}
          />
          <Couleur
            label="Profils retenus"
            aide="La seule couleur positive de l'interface."
            valeur={theme.couleurs.retenu}
            onChange={(v) => patch({ couleurs: { ...theme.couleurs, retenu: v } })}
          />
          <Couleur
            label="Encre"
            aide="Le texte courant."
            valeur={theme.couleurs.encre}
            onChange={(v) => patch({ couleurs: { ...theme.couleurs, encre: v } })}
          />
        </div>
      </section>

      {/* ---------- Identité ---------- */}
      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        <Field label="Nom de l'enseigne" hint="Repris dans les titres de page et les e-mails.">
          <input
            className="box"
            value={theme.nom}
            onChange={(e) => patch({ nom: e.target.value })}
            placeholder="Kiabi"
          />
        </Field>
        <div>
          <span className="eyebrow block">Logotype</span>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="grid h-12 w-28 shrink-0 place-items-center rounded-champ border border-custom3 bg-paper p-1.5">
              {logoActuel ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoActuel} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[11px] text-custom2">Lettrage</span>
              )}
            </div>
            <div className="min-w-0">
              <label className="btn-ghost cursor-pointer text-[13px]">
                Choisir un fichier
                <input
                  type="file"
                  accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    const fichier = e.target.files?.[0];
                    if (fichier) importerLogo({ fichier });
                    e.target.value = "";
                  }}
                />
              </label>
              {logoVersion && (
                <button type="button" className="btn-quiet mt-1 block" onClick={supprimerLogo}>
                  Retirer le logotype
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-custom1">
            SVG, PNG, JPEG, WebP ou GIF, 256 Ko au plus. Rangé en base avec le reste du thème :
            une sauvegarde de la base suffit à tout restaurer.
          </p>
        </div>
        <Field label="Lettrage" hint="Utilisé tant qu'aucun fichier n'est fourni.">
          <input
            className="box"
            value={theme.logo.mot}
            onChange={(e) => patch({ logo: { ...theme.logo, mot: e.target.value } })}
            placeholder="Kiabi"
          />
        </Field>
        <label className="flex items-center gap-3 self-end pb-3">
          <input
            type="checkbox"
            checked={theme.logo.capitales}
            onChange={(e) => patch({ logo: { ...theme.logo, capitales: e.target.checked } })}
          />
          <span className="text-[14px]">Lettrage en capitales</span>
        </label>
      </section>

      {/* ---------- Typographie et formes ---------- */}
      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        <Field label="Police des titres" hint="Une famille disponible sur Google Fonts.">
          <input
            className="box"
            list="polices"
            value={theme.polices.titre}
            onChange={(e) => patch({ polices: { ...theme.polices, titre: e.target.value } })}
          />
        </Field>
        <Field label="Police du texte">
          <input
            className="box"
            list="polices"
            value={theme.polices.texte}
            onChange={(e) => patch({ polices: { ...theme.polices, texte: e.target.value } })}
          />
        </Field>
        <datalist id="polices">
          {POLICES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <Curseur
          label="Arrondi des champs"
          valeur={theme.rayons.champ}
          max={40}
          onChange={(v) => patch({ rayons: { ...theme.rayons, champ: v } })}
        />
        <Curseur
          label="Arrondi des cartes"
          valeur={theme.rayons.carte}
          max={48}
          onChange={(v) => patch({ rayons: { ...theme.rayons, carte: v } })}
        />
      </section>

      {/* ---------- Aperçu ---------- */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">Aperçu</p>
          <label className="flex items-center gap-2 text-[13px] font-semibold text-custom1">
            <input
              type="checkbox"
              checked={apercuGlobal}
              onChange={(e) => setApercuGlobal(e.target.checked)}
            />
            Appliquer à toute la page
          </label>
        </div>

        <div
          className="card mt-3 overflow-hidden"
          style={vars as React.CSSProperties}
        >
          <div className="bg-paper p-5">
            <p
              className="font-display text-[26px] font-extrabold leading-tight text-ink"
              style={{ letterSpacing: "-0.02em" }}
            >
              {theme.logo.mot || theme.nom}
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-custom1">
              Dix questions, cinq minutes. Voici à quoi ressemblera le questionnaire.
            </p>
            <div className="progress mt-4 rounded-full">
              <span style={{ width: "45%" }} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" className="btn">
                Continuer
              </button>
              <button type="button" className="btn-ghost">
                Retour
              </button>
              <span className="pill border-secondaire bg-secondaire text-sur-secondaire">
                Retenu
              </span>
              <span className="pill border-corail/40 bg-corail-pale text-corail-fonce">
                En revue
              </span>
            </div>
            <input className="field mt-4" placeholder="Votre adresse e-mail" readOnly />
          </div>
        </div>

        <Contrastes palette={palette} />
      </section>

      {/* ---------- Réglages fins ---------- */}
      <section className="mt-8">
        <button
          type="button"
          className="btn-quiet"
          onClick={() => setAvance((v) => !v)}
          aria-expanded={avance}
        >
          {avance ? "Masquer" : "Afficher"} les couleurs dérivées
        </button>
        {avance && (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-custom1">
              Ces valeurs sont calculées à partir des quatre couleurs ci-dessus. Les corriger n&apos;est
              utile que si une enseigne tient à une nuance précise — et court-circuite alors la
              vérification de contraste.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {JETONS_AJUSTABLES.map(({ jeton, label }) => (
                <Couleur
                  key={jeton}
                  label={label}
                  aide={theme.ajustements?.[jeton] ? "Corrigé à la main" : "Calculé"}
                  valeur={theme.ajustements?.[jeton] ?? palette[jeton]}
                  onChange={(v) =>
                    patch({ ajustements: { ...theme.ajustements, [jeton]: v } })
                  }
                  onEffacer={
                    theme.ajustements?.[jeton]
                      ? () => {
                          const suite = { ...theme.ajustements };
                          delete suite[jeton];
                          patch({ ajustements: suite });
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </>
        )}
      </section>

      {erreur && (
        <div className="mt-6">
          <Notice kind="error">{erreur}</Notice>
        </div>
      )}

      <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 border-t border-custom3 bg-paper/95 py-4 backdrop-blur">
        <button type="button" className="btn" onClick={enregistrer} disabled={enregistrement || !modifie}>
          {enregistrement ? "Enregistrement…" : "Enregistrer la marque"}
        </button>
        {modifie && (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              setTheme(JSON.parse(reference) as Theme);
              setErreur(null);
            }}
          >
            Annuler
          </button>
        )}
        {confirme && <span className="text-[13px] font-semibold text-succes">Enregistré.</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Petits contrôles
 * ------------------------------------------------------------------ */

function Couleur({
  label,
  aide,
  valeur,
  onChange,
  onEffacer,
}: {
  label: string;
  aide?: string;
  valeur: string;
  onChange: (v: string) => void;
  onEffacer?: () => void;
}) {
  const [brouillon, setBrouillon] = useState(valeur);
  useEffect(() => setBrouillon(valeur), [valeur]);

  return (
    <div>
      <span className="eyebrow block">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          value={estHex(valeur) ? valeur : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-champ border border-custom3 bg-paper p-1"
          aria-label={`${label} — sélecteur`}
        />
        <input
          className={clsx("box", !estHex(brouillon) && "border-danger")}
          value={brouillon}
          onChange={(e) => {
            setBrouillon(e.target.value);
            if (estHex(e.target.value)) onChange(e.target.value);
          }}
          spellCheck={false}
          aria-label={label}
        />
        {onEffacer && (
          <button type="button" className="btn-quiet shrink-0" onClick={onEffacer} title="Revenir au calcul">
            ↺
          </button>
        )}
      </div>
      {aide && <p className="mt-1 text-[12px] text-custom2">{aide}</p>}
    </div>
  );
}

function Curseur({
  label,
  valeur,
  max,
  onChange,
}: {
  label: string;
  valeur: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <span className="eyebrow block">
        {label} — {valeur} px
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full"
        aria-label={label}
      />
    </div>
  );
}

/**
 * Le verdict de lisibilité, en clair.
 *
 * C'est ce qui distingue un habillage réussi d'un habillage qu'on découvrira
 * illisible en production : l'opérateur voit, avant d'enregistrer, si la charte
 * du client tient debout.
 */
function Contrastes({ palette }: { palette: Record<JetonCouleur, string> }) {
  const mesures = [
    { label: "Texte sur les boutons", a: palette["sur-primaire"], b: palette.primaire, seuil: 4.5 },
    { label: "Texte courant sur le fond", a: palette.ink, b: palette.paper, seuil: 4.5 },
    { label: "Texte des alertes", a: palette["corail-fonce"], b: palette.paper, seuil: 4.5 },
    { label: "Texte secondaire", a: palette.custom1, b: palette.paper, seuil: 4.5 },
    { label: "Pastille « retenu »", a: palette["sur-secondaire"], b: palette.secondaire, seuil: 4.5 },
  ];

  return (
    <div className="mt-4 rounded-carte border border-custom3 bg-wash p-4">
      <p className="eyebrow">Lisibilité</p>
      <ul className="mt-2 space-y-1.5">
        {mesures.map((m) => {
          const ratio = contraste(m.a, m.b);
          const ok = ratio >= m.seuil;
          return (
            <li key={m.label} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-custom1">{m.label}</span>
              <span className={clsx("font-semibold tabular-nums", ok ? "text-succes" : "text-danger")}>
                {ratio.toFixed(1)}:1 {ok ? "✓" : "— insuffisant"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12px] leading-relaxed text-custom2">
        Le seuil de 4,5:1 est celui du niveau AA des règles d&apos;accessibilité, pour du texte de
        taille courante.
      </p>
    </div>
  );
}
