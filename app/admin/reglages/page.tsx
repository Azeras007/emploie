import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings, getTheme, listApplicants, listInvites, listStores, listUsers } from "@/lib/db";
import { peut } from "@/lib/permissions";
import { smtpConfigure } from "@/lib/courriel";
import SettingsClient, { type PreviewApplicant } from "@/components/settings/SettingsClient";

export const metadata: Metadata = { title: "Réglages" };

/** Les permissions qui ouvrent au moins un onglet de réglages. */
const ONGLETS = ["marque", "reglages", "comptes", "donnees", "liens"] as const;

// Les réglages dépendent de la session et de la base : jamais de rendu statique.
export const dynamic = "force-dynamic";

export default async function ReglagesPage() {
  const session = await getSession();
  // Le layout admin garde déjà la porte ; ceci est une sécurité de second rideau.
  if (!session) redirect("/connexion");

  // Aucun droit de réglage : la page n'a rien à montrer. Sans ce garde, un
  // responsable de magasin y arrivait par l'adresse directe — le menu ne
  // proposait pas le lien, mais la page se rendait tout de même, et elle
  // affichait les jetons d'invitation de tous les magasins.
  const onglets = ONGLETS.filter((permission) => peut(session, permission));
  if (onglets.length === 0) redirect("/admin");

  const [settings, invites, applicants, theme, magasins, utilisateurs] = await Promise.all([
    getSettings(),
    peut(session, "liens") ? listInvites() : Promise.resolve([]),
    listApplicants(),
    getTheme(),
    listStores(),
    // La liste des comptes ne quitte le serveur que pour qui a le droit de la
    // voir. Les hachés de mots de passe, eux, ne la quittent jamais.
    peut(session, "comptes") ? listUsers() : Promise.resolve([]),
  ]);

  // On n'envoie au client que ce qui sert à simuler le score (ni notes, ni statut).
  const preview: PreviewApplicant[] = applicants.map((a) => ({
    id: a.id,
    identity: a.identity,
    answers: a.answers,
    files: a.files,
  }));

  return (
    <SettingsClient
      initialSettings={settings}
      initialInvites={invites}
      initialTheme={theme}
      role={session.role}
      smtpPresent={smtpConfigure()}
      magasins={magasins}
      comptes={utilisateurs.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        role: u.role,
        storeId: u.storeId,
        active: u.active,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      }))}
      username={session.username}
      applicants={preview}
    />
  );
}
