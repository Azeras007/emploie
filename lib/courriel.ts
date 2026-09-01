import "server-only";
import { listUsers, logEmail } from "./db";
import { uid } from "./ids";
import { scoreApplicant } from "./scoring";
import type { Applicant, EmailEntry, Settings } from "./types";

/**
 * Envoi des e-mails.
 *
 * Deux messages, et deux seulement : l'accusé de réception au candidat, et
 * l'alerte au recruteur. C'est le minimum pour qu'une candidature ne
 * disparaisse pas dans le silence — le reproche numéro un fait au recrutement.
 *
 * Les identifiants du serveur d'envoi vivent dans `SMTP_URL`, jamais en base :
 * un administrateur d'enseigne règle les modèles et les destinataires, il n'a
 * pas à pouvoir lire le mot de passe du serveur, ni à l'exposer dans un export.
 *
 *     SMTP_URL=smtp://utilisateur:motdepasse@smtp.exemple.fr:587
 *     SMTP_URL=smtps://utilisateur:motdepasse@smtp.exemple.fr:465
 */

export function smtpConfigure(): boolean {
  return (process.env.SMTP_URL ?? "").trim() !== "";
}

/** Pourquoi rien ne part — en clair, pour l'écran d'état des réglages. */
export function raisonSilence(settings: Settings): string | null {
  if (!settings.emails.enabled) return "Les envois sont désactivés dans les réglages.";
  if (!smtpConfigure()) {
    return "Aucun serveur d'envoi : la variable d'environnement SMTP_URL est absente.";
  }
  if (!settings.emails.from.trim()) return "Aucune adresse d'expédition n'est renseignée.";
  return null;
}

/* ------------------------------------------------------------------ *
 * Modèles
 * ------------------------------------------------------------------ */

/**
 * Remplace les {{jetons}} d'un modèle.
 *
 * Un jeton inconnu est laissé tel quel plutôt que vidé : un recruteur qui voit
 * « {{prenon}} » arriver dans sa boîte comprend sa faute de frappe, alors qu'un
 * blanc ne lui apprend rien.
 */
export function rendre(modele: string, valeurs: Record<string, string>): string {
  return modele.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (entier, cle: string) => {
    const valeur = valeurs[cle.toLowerCase()];
    return valeur === undefined ? entier : valeur;
  });
}

export function jetons(
  applicant: Applicant,
  settings: Settings,
  extra: Record<string, string> = {}
): Record<string, string> {
  const score = scoreApplicant(applicant, settings);
  return {
    prenom: applicant.identity.firstName,
    nom: applicant.identity.lastName,
    email: applicant.identity.email,
    telephone: applicant.identity.phone,
    ville: applicant.identity.city,
    reference: applicant.ref,
    poste: settings.jobTitle,
    enseigne: settings.companyName,
    score: String(score.percent),
    ...extra,
  };
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

type Transport = import("nodemailer").Transporter;
let transportPromise: Promise<Transport> | null = null;

async function transport(): Promise<Transport> {
  if (!transportPromise) {
    transportPromise = (async () => {
      const nodemailer = await import("nodemailer");
      return nodemailer.createTransport(process.env.SMTP_URL as string);
    })();
  }
  return transportPromise;
}

interface Envoi {
  to: string;
  subject: string;
  text: string;
  kind: string;
  applicationId: string | null;
}

/**
 * Envoie un message et le journalise, qu'il parte ou non.
 *
 * L'échec n'est jamais propagé : un serveur d'envoi injoignable ne doit pas
 * faire échouer le dépôt d'une candidature déjà enregistrée. La trace, elle,
 * garde la raison — c'est elle qui permettra de comprendre, une semaine plus
 * tard, pourquoi un candidat n'a rien reçu.
 */
async function envoyer(envoi: Envoi, from: string, replyTo: string): Promise<void> {
  const trace: EmailEntry = {
    id: uid(),
    applicationId: envoi.applicationId,
    kind: envoi.kind,
    recipient: envoi.to,
    subject: envoi.subject,
    sentAt: new Date().toISOString(),
    error: null,
  };

  try {
    const t = await transport();
    await t.sendMail({
      from,
      to: envoi.to,
      replyTo: replyTo || undefined,
      subject: envoi.subject,
      text: envoi.text,
    });
  } catch (err) {
    trace.error = err instanceof Error ? err.message : String(err);
  }

  await logEmail(trace).catch((err: unknown) => {
    console.error("Journalisation de l'envoi impossible", err);
  });
}

/* ------------------------------------------------------------------ *
 * Les deux messages
 * ------------------------------------------------------------------ */

/**
 * Qui doit être prévenu d'un dépôt.
 *
 * Un responsable de magasin ne reçoit que ce qui concerne le sien : c'est la
 * même règle que pour l'affichage des dossiers, et elle doit valoir aussi pour
 * les notifications — sans quoi la cloison ne tient que dans l'interface.
 */
async function destinataires(applicant: Applicant, settings: Settings): Promise<string[]> {
  const adresses = new Set<string>();

  for (const user of await listUsers()) {
    if (!user.active || !user.email.trim()) continue;
    if (user.role === "magasin" && user.storeId !== applicant.storeId) continue;
    adresses.add(user.email.trim().toLowerCase());
  }

  for (const brut of settings.emails.notifyExtra.split(/[,;\s]+/)) {
    const adresse = brut.trim().toLowerCase();
    if (adresse.includes("@")) adresses.add(adresse);
  }

  return [...adresses];
}

export async function envoyerApresDepot(
  applicant: Applicant,
  settings: Settings
): Promise<void> {
  if (raisonSilence(settings)) return;

  const valeurs = jetons(applicant, settings);
  const from = settings.emails.from.trim();
  const replyTo = settings.emails.replyTo.trim();

  if (settings.emails.acknowledge && applicant.identity.email) {
    await envoyer(
      {
        to: applicant.identity.email,
        subject: rendre(settings.emails.acknowledgeSubject, valeurs),
        text: rendre(settings.emails.acknowledgeBody, valeurs),
        kind: "accuse",
        applicationId: applicant.id,
      },
      from,
      replyTo
    );
  }

  if (settings.emails.notify) {
    const liste = await destinataires(applicant, settings);
    const sujet = rendre(settings.emails.notifySubject, valeurs);
    const corps = corpsNotification(applicant, settings, valeurs);
    // En série plutôt qu'en parallèle : la plupart des serveurs SMTP limitent
    // le nombre de connexions simultanées, et une alerte n'a aucune urgence.
    for (const adresse of liste) {
      await envoyer(
        { to: adresse, subject: sujet, text: corps, kind: "alerte", applicationId: applicant.id },
        from,
        replyTo
      );
    }
  }
}

function corpsNotification(
  applicant: Applicant,
  settings: Settings,
  valeurs: Record<string, string>
): string {
  const lignes = [
    `Nouvelle candidature — ${valeurs.prenom} ${valeurs.nom}`,
    "",
    `Référence   : ${applicant.ref}`,
    `Score       : ${valeurs.score} %`,
    `E-mail      : ${applicant.identity.email}`,
    applicant.identity.phone ? `Téléphone   : ${applicant.identity.phone}` : null,
    applicant.identity.city ? `Ville       : ${applicant.identity.city}` : null,
    `Documents   : ${applicant.files.length}`,
    "",
  ].filter(Boolean) as string[];

  // Les réponses, dans l'ordre du questionnaire : de quoi juger sans ouvrir
  // l'application, ce qui est tout l'intérêt d'une alerte.
  for (const question of settings.questions) {
    const valeur = applicant.answers[question.id];
    if (valeur === null || valeur === undefined || valeur === "") continue;
    const texte = Array.isArray(valeur) ? valeur.join(", ") : String(valeur);
    lignes.push(`${question.label}`, `  ${texte}`);
  }

  if (settings.publicBaseUrl) {
    lignes.push("", `Le dossier : ${settings.publicBaseUrl}/candidature/admin/candidats/${applicant.id}`);
  }
  return lignes.join("\n");
}
