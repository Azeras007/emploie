import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings, listApplicants, listInvites } from "@/lib/db";
import SettingsClient, { type PreviewApplicant } from "@/components/settings/SettingsClient";

export const metadata: Metadata = { title: "Réglages" };

// Les réglages dépendent de la session et de la base : jamais de rendu statique.
export const dynamic = "force-dynamic";

export default async function ReglagesPage() {
  const session = await getSession();
  // Le layout admin garde déjà la porte ; ceci est une sécurité de second rideau.
  if (!session) redirect("/connexion");

  const [settings, invites, applicants] = await Promise.all([
    getSettings(),
    listInvites(),
    listApplicants(),
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
      username={session.username}
      applicants={preview}
    />
  );
}
