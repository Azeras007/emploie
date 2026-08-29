import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DB_DRIVER, envReport, getSettings, storageStatus } from "@/lib/db";
import { filesProblem } from "@/lib/storage";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/connexion");

  const [, storage] = await Promise.all([getSettings(), storageStatus()]);

  // Une base qui ne répond pas et un stockage de documents absent sont deux pannes
  // distinctes : le recruteur doit savoir laquelle le concerne.
  const uploads = filesProblem();
  const problem = storage.ok ? uploads : storage.problem;
  const seen = problem ? envReport() : undefined;

  return (
    <div className="min-h-dvh">
      <AdminNav
        username={session.username}
        ephemeral={!problem && DB_DRIVER === "file"}
        problem={problem ?? undefined}
        seen={seen}
      />
      <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-8 md:px-8 md:pt-10">{children}</div>
    </div>
  );
}
