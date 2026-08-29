import { notFound } from "next/navigation";
import { getApplicant, getSettings } from "@/lib/db";
import { scoreApplicant } from "@/lib/scoring";
import { renderPreview, type PreviewPayload } from "@/lib/preview";
import CandidateDetail from "@/components/CandidateDetail";

export const dynamic = "force-dynamic";

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const applicant = await getApplicant(id);
  if (!applicant) notFound();

  const settings = await getSettings();
  const score = scoreApplicant(applicant, settings);

  const previews: Record<string, PreviewPayload> = {};
  await Promise.all(
    applicant.files.map(async (file) => {
      previews[file.id] = await renderPreview(file);
    })
  );

  return (
    <CandidateDetail
      applicant={applicant}
      settings={settings}
      score={score}
      previews={previews}
    />
  );
}
