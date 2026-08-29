import { getSettings, listApplicants } from "@/lib/db";
import { scoreAll } from "@/lib/scoring";
import PipelineClient from "@/components/PipelineClient";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [applicants, settings] = await Promise.all([listApplicants(), getSettings()]);
  const scored = scoreAll(applicants, settings);
  return <PipelineClient applicants={scored} settings={settings} />;
}
