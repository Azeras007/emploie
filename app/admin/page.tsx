import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings, listApplicants, listStores } from "@/lib/db";
import { filtrerParPortee } from "@/lib/permissions";
import { scoreAll } from "@/lib/scoring";
import PipelineClient from "@/components/PipelineClient";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const session = await getSession();
  if (!session) redirect("/connexion");

  const [applicants, settings, stores] = await Promise.all([
    listApplicants(),
    getSettings(),
    listStores(),
  ]);

  // Le filtrage a lieu ici, sur le serveur, avant même le calcul des scores :
  // un dossier hors portée ne doit pas transiter par le navigateur, fût-ce
  // pour être masqué à l'affichage.
  const visibles = filtrerParPortee(applicants, session);

  return (
    <PipelineClient
      applicants={scoreAll(visibles, settings)}
      settings={settings}
      stores={stores}
      role={session.role}
    />
  );
}
