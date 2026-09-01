"use client";

import { useEffect, useState } from "react";
import { appPath } from "@/lib/basePath";
import type { Settings } from "@/lib/types";
import { Field, Notice } from "./controls";

/**
 * Conservation des données et envois d'e-mails.
 *
 * Les deux tiennent dans le même écran parce qu'ils répondent à la même
 * question : qu'advient-il d'une candidature une fois déposée ? On la
 * confirme, on prévient quelqu'un, et on l'efface au bout d'un temps annoncé.
 */
export default function ConformiteSection({
  settings,
  onPatch,
  smtpPresent,
  peutEnvoyerTest,
}: {
  settings: Settings;
  onPatch: (changes: Partial<Settings>) => void;
  smtpPresent: boolean;
  peutEnvoyerTest: boolean;
}) {
  const [purge, setPurge] = useState<{ echus: number; total: number; prochaine: string | null } | null>(
    null
  );
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [adresseTest, setAdresseTest] = useState("");

  const emails = settings.emails;
  const patchEmails = (changes: Partial<Settings["emails"]>) =>
    onPatch({ emails: { ...emails, ...changes } });

  /* Combien de dossiers sont à purger — l'information seule vaut le voyage. */
  useEffect(() => {
    let vivant = true;
    fetch(appPath("/api/admin/purge"))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivant && d?.ok) setPurge({ echus: d.echus, total: d.total, prochaine: d.prochaine });
      })
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, []);

  async function purger() {
    setOccupe(true);
    setErreur(null);
    setMessage(null);
    try {
      const res = await fetch(appPath("/api/admin/purge"), { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Purge impossible.");
      setMessage(
        `${data.supprimes} dossier${data.supprimes > 1 ? "s" : ""} supprimé${
          data.supprimes > 1 ? "s" : ""
        }, ${data.fichiers} fichier${data.fichiers > 1 ? "s" : ""} effacé${
          data.fichiers > 1 ? "s" : ""
        }.` + (data.echecs?.length ? ` Échecs : ${data.echecs.join(", ")}` : "")
      );
      setPurge((p) => (p ? { ...p, echus: 0, total: p.total - data.supprimes } : p));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Purge impossible.");
    } finally {
      setOccupe(false);
    }
  }

  async function envoyerTest() {
    setOccupe(true);
    setErreur(null);
    setMessage(null);
    try {
      const res = await fetch(appPath("/api/admin/courriel-test"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: adresseTest }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Envoi impossible.");
      setMessage(`Message d'essai envoyé à ${adresseTest}.`);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <header>
        <h2 className="display text-[24px] leading-tight md:text-[28px]">Données &amp; e-mails</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-custom1">
          Ce qu&apos;il advient d&apos;une candidature une fois déposée : qui est prévenu, et
          combien de temps le dossier est conservé.
        </p>
      </header>

      {erreur && (
        <div className="mt-5">
          <Notice kind="error">{erreur}</Notice>
        </div>
      )}
      {message && (
        <div className="mt-5">
          <Notice kind="ok">{message}</Notice>
        </div>
      )}

      {/* ---------------- Conservation ---------------- */}
      <section className="mt-8">
        <p className="eyebrow">Conservation</p>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <Field
            label="Durée de conservation"
            hint="En mois, comptés depuis le dépôt. 0 désactive la purge. Le référentiel de la CNIL retient deux ans pour une candidature non retenue."
          >
            <input
              className="box"
              type="number"
              min={0}
              max={240}
              value={settings.retentionMonths}
              onChange={(e) => onPatch({ retentionMonths: Number(e.target.value) })}
            />
          </Field>
          <Field
            label="Contact « données personnelles »"
            hint="Affiché au candidat pour l'exercice de ses droits."
          >
            <input
              className="box"
              value={settings.privacyContact}
              onChange={(e) => onPatch({ privacyContact: e.target.value })}
              placeholder="rgpd@enseigne.fr"
            />
          </Field>
          <Field
            label="Texte du consentement"
            hint="Affiché avec une case à cocher avant l'envoi. Vide : aucun consentement n'est demandé."
            className="sm:col-span-2"
          >
            <textarea
              className="box"
              rows={3}
              value={settings.consentText}
              onChange={(e) => onPatch({ consentText: e.target.value })}
            />
          </Field>
        </div>

        <div className="mt-4 rounded-carte border border-custom3 bg-wash p-4">
          <p className="text-[13px] leading-relaxed text-custom1">
            {purge === null ? (
              "Décompte des dossiers…"
            ) : purge.echus > 0 ? (
              <>
                <strong className="text-corail-fonce">
                  {purge.echus} dossier{purge.echus > 1 ? "s" : ""}
                </strong>{" "}
                {purge.echus > 1 ? "ont" : "a"} dépassé la durée de conservation, sur {purge.total}.
              </>
            ) : (
              <>
                Aucun dossier à purger, sur {purge.total}.
                {purge.prochaine
                  ? ` Le prochain arrive à échéance le ${new Date(purge.prochaine).toLocaleDateString("fr-FR")}.`
                  : ""}
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={purger}
              disabled={occupe || !purge || purge.echus === 0}
            >
              Purger maintenant
            </button>
            <a className="btn-ghost" href={appPath("/api/admin/export")}>
              Exporter en CSV
            </a>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-custom2">
            La purge efface le dossier <em>et</em> ses fichiers. Elle ne touche jamais aux dossiers
            déposés avant qu&apos;une durée de conservation n&apos;ait été réglée : ceux-là n&apos;ont
            pas de date d&apos;échéance. Pour l&apos;automatiser, appelez cette même adresse depuis une
            tâche planifiée.
          </p>
        </div>
      </section>

      {/* ---------------- E-mails ---------------- */}
      <section className="mt-10">
        <p className="eyebrow">E-mails</p>

        {!smtpPresent && (
          <div className="mt-3 rounded-carte border border-corail/40 bg-corail-pale p-4">
            <p className="text-[13px] leading-relaxed text-corail-fonce">
              Aucun serveur d&apos;envoi n&apos;est configuré. Renseignez <code>SMTP_URL</code> dans
              le fichier <code>.env</code> de la machine, puis redémarrez :
            </p>
            <p className="mt-2 break-all font-mono text-[12px] text-corail-fonce">
              SMTP_URL=smtp://utilisateur:motdepasse@smtp.exemple.fr:587
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-corail-fonce">
              Les identifiants vivent dans l&apos;environnement, jamais en base : ils ne doivent
              apparaître ni dans cet écran, ni dans un export.
            </p>
          </div>
        )}

        <label className="mt-4 flex items-center gap-2 text-[14px] font-semibold">
          <input
            type="checkbox"
            checked={emails.enabled}
            onChange={(e) => patchEmails({ enabled: e.target.checked })}
          />
          Activer les envois
        </label>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label="Adresse d'expédition" hint="Sans elle, rien ne part.">
            <input
              className="box"
              value={emails.from}
              onChange={(e) => patchEmails({ from: e.target.value })}
              placeholder="recrutement@enseigne.fr"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field label="Répondre à" hint="Facultatif. Où arrivent les réponses des candidats.">
            <input
              className="box"
              value={emails.replyTo}
              onChange={(e) => patchEmails({ replyTo: e.target.value })}
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
        </div>

        <div className="mt-6">
          <label className="flex items-center gap-2 text-[14px] font-semibold">
            <input
              type="checkbox"
              checked={emails.acknowledge}
              onChange={(e) => patchEmails({ acknowledge: e.target.checked })}
            />
            Accuser réception au candidat
          </label>
          {emails.acknowledge && (
            <div className="mt-3 grid gap-5">
              <Field label="Objet">
                <input
                  className="box"
                  value={emails.acknowledgeSubject}
                  onChange={(e) => patchEmails({ acknowledgeSubject: e.target.value })}
                />
              </Field>
              <Field
                label="Message"
                hint="Jetons disponibles : {{prenom}} {{nom}} {{email}} {{ville}} {{reference}} {{poste}} {{enseigne}} {{score}}"
              >
                <textarea
                  className="box font-mono text-[13px]"
                  rows={8}
                  value={emails.acknowledgeBody}
                  onChange={(e) => patchEmails({ acknowledgeBody: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="mt-6">
          <label className="flex items-center gap-2 text-[14px] font-semibold">
            <input
              type="checkbox"
              checked={emails.notify}
              onChange={(e) => patchEmails({ notify: e.target.checked })}
            />
            Prévenir les recruteurs à chaque dépôt
          </label>
          {emails.notify && (
            <div className="mt-3 grid gap-5">
              <Field label="Objet de l'alerte">
                <input
                  className="box"
                  value={emails.notifySubject}
                  onChange={(e) => patchEmails({ notifySubject: e.target.value })}
                />
              </Field>
              <Field
                label="Destinataires supplémentaires"
                hint="En plus des comptes qui ont une adresse. Séparés par des virgules. Un responsable de magasin n'est prévenu que pour son magasin."
              >
                <input
                  className="box"
                  value={emails.notifyExtra}
                  onChange={(e) => patchEmails({ notifyExtra: e.target.value })}
                  placeholder="drh@enseigne.fr, direction@enseigne.fr"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
            </div>
          )}
        </div>

        {peutEnvoyerTest && (
          <div className="mt-6 rounded-carte border border-custom3 bg-wash p-4">
            <p className="eyebrow">Essai</p>
            <p className="mt-2 text-[13px] leading-relaxed text-custom1">
              Vérifiez la configuration avant qu&apos;une vraie candidature ne s&apos;en charge.
              L&apos;essai part avec les réglages <strong>déjà enregistrés</strong>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className="box max-w-xs"
                value={adresseTest}
                onChange={(e) => setAdresseTest(e.target.value)}
                placeholder="vous@exemple.fr"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={envoyerTest}
                disabled={occupe || !adresseTest.includes("@")}
              >
                Envoyer un essai
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
