import Questionnaire from "@/components/Questionnaire";
import { getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CandidaturePage() {
  const settings = await getSettings();
  return <Questionnaire settings={settings} inviteToken={null} />;
}
