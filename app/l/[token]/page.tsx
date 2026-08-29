import Questionnaire from "@/components/Questionnaire";
import { getInviteByToken, getSettings } from "@/lib/db";
import { filesProblem } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Lien de candidature traçable — l'adresse qu'encodent les QR codes.
 *
 * Un jeton inconnu, désactivé ou supprimé n'est JAMAIS une erreur : ces
 * adresses finissent imprimées sur une devanture, où elles ne peuvent plus être
 * corrigées. On sert alors le questionnaire ordinaire, sans rattachement. Seul
 * le suivi de provenance est perdu, jamais la candidature.
 */
export default async function InvitedCandidaturePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invite, settings] = await Promise.all([getInviteByToken(token), getSettings()]);
  const usable = invite?.active ? invite : null;

  return (
    <Questionnaire
      settings={settings}
      inviteToken={usable ? usable.token : null}
      inviteLabel={usable ? usable.label : null}
      uploadsProblem={filesProblem()}
    />
  );
}
