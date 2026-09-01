"use client";

import { appPath } from "@/lib/basePath";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Invite, Store } from "@/lib/types";
import { ConfirmButton, Field, Notice } from "./controls";
import QrPanel from "./QrPanel";
import { candidatureUrl } from "@/lib/links";

export default function AccountSection({
  username,
  initialInvites,
  publicBaseUrl,
  magasins,
}: {
  username: string;
  initialInvites: Invite[];
  publicBaseUrl: string;
  magasins: Store[];
}) {
  const router = useRouter();

  /* ---------- Liens d'invitation ---------- */
  const [invites, setInvites] = useState<Invite[]>(initialInvites);
  const [label, setLabel] = useState("");
  const [storeId, setStoreId] = useState("");
  const [creating, setCreating] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  function linkFor(invite: Invite): string {
    return candidatureUrl(publicBaseUrl, invite.token);
  }

  async function setPrinted(invite: Invite, printed: boolean) {
    setInvites((prev) => prev.map((i) => (i.id === invite.id ? { ...i, printed } : i)));
    const res = await fetch(appPath("/api/admin/invitations"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: invite.id, printed }),
    });
    if (!res.ok) {
      setInvites((prev) => prev.map((i) => (i.id === invite.id ? { ...i, printed: !printed } : i)));
    }
    router.refresh();
  }

  async function createInvite() {
    setCreating(true);
    setInviteError(null);
    try {
      const res = await fetch(appPath("/api/admin/invitations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, storeId: storeId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Création impossible.");
      setInvites((list) => [data.invite as Invite, ...list]);
      setLabel("");
      // Le magasin, lui, ne se remet pas à zéro : on crée en général plusieurs
      // liens pour le même point de vente à la suite.
      router.refresh();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setCreating(false);
    }
  }

  async function removeInvite(id: string) {
    setInviteError(null);
    const before = invites;
    setInvites((list) => list.filter((i) => i.id !== id));
    try {
      const res = await fetch(appPath(`/api/admin/invitations?id=${encodeURIComponent(id)}`), {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Suppression impossible.");
      }
      router.refresh();
    } catch (err) {
      setInvites(before);
      setInviteError(err instanceof Error ? err.message : "Suppression impossible.");
    }
  }

  async function copy(invite: Invite) {
    const url = linkFor(invite);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(invite.id);
    } catch {
      setInviteError("Copie refusée par le navigateur. Sélectionnez le lien à la main.");
    }
  }

  /* ---------- Mot de passe ---------- */
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdOk, setPwdOk] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);
    setPwdOk(false);

    if (next.length < 8) {
      setPwdError("Le nouveau mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (next !== confirm) {
      setPwdError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }

    setPwdBusy(true);
    try {
      const res = await fetch(appPath("/api/admin/motdepasse"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Changement impossible.");
      setCurrent("");
      setNext("");
      setConfirm("");
      setPwdOk(true);
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : "Changement impossible.");
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <div>
      <header className="max-w-measure">
        <h2 className="display text-[24px] leading-tight md:text-[28px]">Compte &amp; liens</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-custom1">
          Connecté en tant que <span className="text-[13px] text-ink">{username}</span>.
        </p>
      </header>

      {/* ---------- Liens d'invitation ---------- */}
      <section className="mt-10">
        <h3 className="display text-[18px]">Liens de candidature</h3>
        <p className="mt-1.5 max-w-measure text-[13px] leading-relaxed text-custom1">
          Un lien par canal de diffusion : vous saurez d&apos;où viennent les candidatures.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Libellé du lien" className="min-w-0 flex-1">
            <input
              className="box"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Annonce LinkedIn"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createInvite();
                }
              }}
            />
          </Field>

          {/* Le sélecteur n'apparaît qu'une fois des magasins créés : sans eux,
              il n'offrirait qu'un choix vide. */}
          {magasins.length > 0 && (
            <Field label="Magasin" className="sm:w-56">
              <select
                className="box"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                <option value="">Aucun</option>
                {magasins
                  .filter((m) => m.active)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <button
            type="button"
            className="btn min-h-[44px] shrink-0"
            onClick={() => void createInvite()}
            disabled={creating}
          >
            {creating ? "Création…" : "Créer le lien"}
          </button>
        </div>

        {inviteError ? (
          <div className="mt-3">
            <Notice kind="error">{inviteError}</Notice>
          </div>
        ) : null}

        <div className="mt-6 rounded-carte border border-custom3 bg-wash p-4 md:p-5">
          <p className="text-[15px] font-semibold">Questionnaire général</p>
          <p className="mt-1 break-all text-[11px] leading-snug text-custom1">
            {candidatureUrl(publicBaseUrl)}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-custom1">
            L'adresse sans suivi de provenance. La plus courte, et celle qui ne dépend d'aucun
            lien : elle répondra toujours.
          </p>
          <QrPanel url={candidatureUrl(publicBaseUrl)} />
        </div>

        <ul className="mt-6 border-t border-custom3">
          {invites.length === 0 ? (
            <li className="py-6 text-[13px] text-custom1">Aucun lien pour le moment.</li>
          ) : null}

          {invites.map((invite) => (
            <li key={invite.id} className="border-b border-custom3 py-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{invite.label}</p>
                  <p className="mt-1 break-all text-[11px] leading-snug text-custom1">
                    {linkFor(invite)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <span className="text-[13px] font-semibold tabular-nums text-custom1">
                    {invite.uses} utilisation{invite.uses > 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost min-h-[44px]"
                    onClick={() => void copy(invite)}
                  >
                    {copied === invite.id ? "Copié" : "Copier le lien"}
                  </button>
                  {!invite.printed && (
                    <ConfirmButton onConfirm={() => void removeInvite(invite.id)} />
                  )}
                </div>
              </div>

              <QrPanel
                url={linkFor(invite)}
                token={invite.token}
                printed={invite.printed}
                onTogglePrinted={(next) => void setPrinted(invite, next)}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Mot de passe ---------- */}
      <section className="mt-12 max-w-measure">
        <h3 className="display text-[18px]">Mot de passe</h3>
        <form className="mt-5 flex flex-col gap-4" onSubmit={changePassword}>
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={username}
            readOnly
            hidden
          />
          <Field label="Mot de passe actuel">
            <input
              className="box"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label="Nouveau mot de passe" hint="Au moins 8 caractères.">
            <input
              className="box"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Confirmation">
            <input
              className="box"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>

          {pwdError ? <Notice kind="error">{pwdError}</Notice> : null}
          {pwdOk ? <Notice kind="ok">Mot de passe modifié</Notice> : null}

          <div>
            <button
              type="submit"
              className="btn min-h-[44px]"
              disabled={pwdBusy || !current || !next || !confirm}
            >
              {pwdBusy ? "Enregistrement…" : "Changer le mot de passe"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
