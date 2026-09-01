import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getApplicant, getSettings, listStores } from "@/lib/db";
import { voitDossier } from "@/lib/permissions";
import { scoreApplicant } from "@/lib/scoring";
import { renderPreview, type PreviewPayload } from "@/lib/preview";
import CandidateDetail from "@/components/CandidateDetail";

export const dynamic = "force-dynamic";

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/connexion");

  const { id } = await params;
  const applicant = await getApplicant(id);
  if (!applicant) notFound();
  // Hors de la portée du compte : une 404, pas une page d'interdiction. Un
  // responsable de magasin n'a pas à apprendre qu'un dossier existe ailleurs.
  if (!voitDossier(applicant, session)) notFound();

  const [settings, stores] = await Promise.all([getSettings(), listStores()]);
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
      stores={stores}
      role={session.role}
    />
  );
}
