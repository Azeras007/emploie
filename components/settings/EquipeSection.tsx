"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { appPath } from "@/lib/basePath";
import { ROLES, type Role, type Store } from "@/lib/types";
import { ConfirmButton, Field, Notice } from "./controls";

/**
 * Magasins et comptes — ce qui transforme l'outil d'un employeur en outil
 * d'enseigne.
 *
 * Les deux vivent au même endroit parce qu'ils se répondent : un compte
 * « responsable de magasin » n'a de sens qu'une fois le magasin créé, et c'est
 * l'erreur qu'on fait invariablement dans l'autre ordre.
 */

export interface CompteVue {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: Role;
  storeId: string | null;
  active: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const VIDE_MAGASIN: Store = {
  id: "",
  name: "",
  city: "",
  address: "",
  active: true,
  createdAt: "",
};

export default function EquipeSection({
  magasinsInitiaux,
  comptesInitiaux,
  moi,
  monRole,
}: {
  magasinsInitiaux: Store[];
  comptesInitiaux: CompteVue[];
  moi: string;
  monRole: Role;
}) {
  const router = useRouter();
  const [magasins, setMagasins] = useState(magasinsInitiaux);
  const [comptes, setComptes] = useState(comptesInitiaux);
  const [erreur, setErreur] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const [magasinEdite, setMagasinEdite] = useState<Store | null>(null);
  const [compteEdite, setCompteEdite] = useState<(CompteVue & { password?: string }) | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 3200);
    return () => clearTimeout(t);
  }, [note]);

  const appel = useCallback(
    async (url: string, init: RequestInit): Promise<Record<string, unknown> | null> => {
      setOccupe(true);
      setErreur(null);
      try {
        const res = await fetch(appPath(url), init);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Opération impossible.");
        router.refresh();
        return data as Record<string, unknown>;
      } catch (err) {
        setErreur(err instanceof Error ? err.message : "Opération impossible.");
        return null;
      } finally {
        setOccupe(false);
      }
    },
    [router]
  );

  /* ---------------- magasins ---------------- */

  async function enregistrerMagasin(magasin: Store) {
    const data = await appel("/api/admin/magasins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(magasin),
    });
    if (!data) return;
    const enregistre = data.magasin as Store;
    setMagasins((liste) => {
      const suite = liste.some((m) => m.id === enregistre.id)
        ? liste.map((m) => (m.id === enregistre.id ? enregistre : m))
        : [...liste, enregistre];
      return [...suite].sort((a, b) => a.name.localeCompare(b.name, "fr"));
    });
    setMagasinEdite(null);
    setNote("Magasin enregistré.");
  }

  async function supprimerMagasin(id: string) {
    const data = await appel(`/api/admin/magasins?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!data) return;
    setMagasins((liste) => liste.filter((m) => m.id !== id));
    // Les comptes rattachés perdent leur magasin : l'écran doit le refléter
    // sans attendre un rechargement, sinon il affiche un rattachement mort.
    setComptes((liste) =>
      liste.map((c) => (c.storeId === id ? { ...c, storeId: null } : c))
    );
    setNote(String(data.message ?? "Magasin supprimé."));
  }

  /* ---------------- comptes ---------------- */

  async function enregistrerCompte(compte: CompteVue & { password?: string }) {
    const data = await appel("/api/admin/comptes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(compte),
    });
    if (!data) return;
    const enregistre = data.compte as CompteVue;
    setComptes((liste) =>
      liste.some((c) => c.id === enregistre.id)
        ? liste.map((c) => (c.id === enregistre.id ? enregistre : c))
        : [...liste, enregistre]
    );
    setCompteEdite(null);
    setNote("Compte enregistré.");
  }

  async function supprimerCompte(id: string) {
    const data = await appel(`/api/admin/comptes?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!data) return;
    setComptes((liste) => liste.filter((c) => c.id !== id));
    setNote("Compte supprimé.");
  }

  const nomMagasin = (id: string | null) =>
    magasins.find((m) => m.id === id)?.name ?? "—";

  return (
    <div className="max-w-3xl">
      <header>
        <h2 className="display text-[24px] leading-tight md:text-[28px]">Équipe &amp; magasins</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-custom1">
          Un responsable de magasin ne voit que les candidatures de son point de vente. C&apos;est
          cette cloison qui rend l&apos;outil utilisable par une enseigne de trente magasins.
        </p>
      </header>

      {erreur && (
        <div className="mt-5">
          <Notice kind="error">{erreur}</Notice>
        </div>
      )}
      {note && (
        <div className="mt-5">
          <Notice kind="ok">{note}</Notice>
        </div>
      )}

      {/* ---------------- Magasins ---------------- */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <p className="eyebrow">Magasins</p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setMagasinEdite({ ...VIDE_MAGASIN })}
            disabled={occupe}
          >
            Ajouter un magasin
          </button>
        </div>

        {magasins.length === 0 && !magasinEdite ? (
          <p className="mt-3 rounded-carte border border-dashed border-custom3 bg-wash px-4 py-6 text-center text-[13px] text-custom1">
            Aucun magasin. Sans magasin, toutes les candidatures arrivent dans une seule liste —
            ce qui convient parfaitement à un employeur d&apos;un seul site.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-custom3 overflow-hidden rounded-carte border border-custom3">
            {magasins.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">
                    {m.name}
                    {!m.active && (
                      <span className="ml-2 rounded-full bg-wash px-2 py-0.5 text-[11px] font-semibold text-custom2">
                        fermé
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[12px] text-custom1">
                    {[m.city, m.address].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={() => setMagasinEdite(m)}
                  disabled={occupe}
                >
                  Modifier
                </button>
                <ConfirmButton onConfirm={() => supprimerMagasin(m.id)} />
              </li>
            ))}
          </ul>
        )}

        {magasinEdite && (
          <div className="card mt-3 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom du magasin">
                <input
                  className="box"
                  value={magasinEdite.name}
                  onChange={(e) => setMagasinEdite({ ...magasinEdite, name: e.target.value })}
                  placeholder="Lille Grand Place"
                  autoFocus
                />
              </Field>
              <Field label="Ville">
                <input
                  className="box"
                  value={magasinEdite.city}
                  onChange={(e) => setMagasinEdite({ ...magasinEdite, city: e.target.value })}
                  placeholder="Lille"
                />
              </Field>
              <Field label="Adresse" className="sm:col-span-2">
                <input
                  className="box"
                  value={magasinEdite.address}
                  onChange={(e) => setMagasinEdite({ ...magasinEdite, address: e.target.value })}
                  placeholder="12 rue de la Gare"
                />
              </Field>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={magasinEdite.active}
                onChange={(e) => setMagasinEdite({ ...magasinEdite, active: e.target.checked })}
              />
              Magasin ouvert
            </label>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="btn"
                onClick={() => enregistrerMagasin(magasinEdite)}
                disabled={occupe || !magasinEdite.name.trim()}
              >
                Enregistrer
              </button>
              <button type="button" className="btn-quiet" onClick={() => setMagasinEdite(null)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---------------- Comptes ---------------- */}
      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <p className="eyebrow">Comptes</p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              setCompteEdite({
                id: "",
                username: "",
                displayName: "",
                email: "",
                role: "recruteur",
                storeId: null,
                active: true,
                createdAt: "",
                lastLoginAt: null,
                password: "",
              })
            }
            disabled={occupe}
          >
            Ajouter un compte
          </button>
        </div>

        <ul className="mt-3 divide-y divide-custom3 overflow-hidden rounded-carte border border-custom3">
          {comptes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">
                  {c.displayName || c.username}
                  {c.username === moi && (
                    <span className="ml-2 text-[12px] font-medium text-custom2">— vous</span>
                  )}
                  {!c.active && (
                    <span className="ml-2 rounded-full bg-wash px-2 py-0.5 text-[11px] font-semibold text-custom2">
                      désactivé
                    </span>
                  )}
                </span>
                <span className="block truncate text-[12px] text-custom1">
                  {c.username} · {ROLES.find((r) => r.value === c.role)?.label ?? c.role}
                  {c.role === "magasin" ? ` · ${nomMagasin(c.storeId)}` : ""}
                  {c.email ? ` · ${c.email}` : ""}
                </span>
              </span>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => setCompteEdite({ ...c, password: "" })}
                disabled={occupe}
              >
                Modifier
              </button>
              {c.username !== moi && <ConfirmButton onConfirm={() => supprimerCompte(c.id)} />}
            </li>
          ))}
        </ul>

        {compteEdite && (
          <div className="card mt-3 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Identifiant" hint="Lettres, chiffres, point, tiret, souligné.">
                <input
                  className="box"
                  value={compteEdite.username}
                  onChange={(e) => setCompteEdite({ ...compteEdite, username: e.target.value })}
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                />
              </Field>
              <Field label="Nom affiché">
                <input
                  className="box"
                  value={compteEdite.displayName}
                  onChange={(e) => setCompteEdite({ ...compteEdite, displayName: e.target.value })}
                  placeholder="Maud Lefèvre"
                />
              </Field>
              <Field
                label="Adresse e-mail"
                hint="Facultative. Renseignée, elle reçoit les alertes de nouvelle candidature."
              >
                <input
                  className="box"
                  value={compteEdite.email}
                  onChange={(e) => setCompteEdite({ ...compteEdite, email: e.target.value })}
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
              <Field
                label={compteEdite.id ? "Nouveau mot de passe" : "Mot de passe"}
                hint={compteEdite.id ? "Laissez vide pour ne pas le changer." : "8 caractères au moins."}
              >
                <input
                  className="box"
                  type="password"
                  value={compteEdite.password ?? ""}
                  onChange={(e) => setCompteEdite({ ...compteEdite, password: e.target.value })}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Rôle">
                <select
                  className="box"
                  value={compteEdite.role}
                  onChange={(e) =>
                    setCompteEdite({ ...compteEdite, role: e.target.value as Role })
                  }
                >
                  {ROLES.filter(
                    // Un administrateur ne fabrique pas un propriétaire : la
                    // route le refuse, autant ne pas proposer l'option.
                    (r) => r.value !== "proprietaire" || monRole === "proprietaire"
                  ).map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
              {compteEdite.role === "magasin" && (
                <Field label="Magasin" hint="Le seul dont ce compte verra les candidatures.">
                  <select
                    className="box"
                    value={compteEdite.storeId ?? ""}
                    onChange={(e) =>
                      setCompteEdite({ ...compteEdite, storeId: e.target.value || null })
                    }
                  >
                    <option value="">— choisir —</option>
                    {magasins.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-custom1">
              {ROLES.find((r) => r.value === compteEdite.role)?.help}
            </p>

            <label className="mt-3 flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={compteEdite.active}
                onChange={(e) => setCompteEdite({ ...compteEdite, active: e.target.checked })}
              />
              Compte actif
            </label>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                className="btn"
                onClick={() => enregistrerCompte(compteEdite)}
                disabled={
                  occupe ||
                  compteEdite.username.trim().length < 3 ||
                  (!compteEdite.id && (compteEdite.password ?? "").length < 8)
                }
              >
                Enregistrer
              </button>
              <button type="button" className="btn-quiet" onClick={() => setCompteEdite(null)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      <p className={clsx("mt-6 text-[12px] leading-relaxed text-custom2")}>
        Le dernier propriétaire actif ne peut être ni rétrogradé, ni désactivé, ni supprimé :
        l&apos;installation deviendrait impossible à administrer autrement qu&apos;en base.
      </p>
    </div>
  );
}
