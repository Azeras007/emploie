import { notFound } from "next/navigation";
import Questionnaire from "@/components/Questionnaire";
import { getInviteByToken, getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InvitedCandidaturePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInviteByToken(token);
  if (!invite || !invite.active) notFound();

  const settings = await getSettings();
  return <Questionnaire settings={settings} inviteToken={invite.token} inviteLabel={invite.label} />;
}
