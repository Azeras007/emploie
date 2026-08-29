import { redirect } from "next/navigation";
import { getSession, hasAdmin } from "@/lib/auth";
import { storageStatus } from "@/lib/db";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function ConnexionPage() {
  if (await getSession()) redirect("/admin");

  // Le stockage est vérifié avant d'inviter à saisir quoi que ce soit : s'il ne peut rien
  // enregistrer, autant le dire tout de suite plutôt qu'après un échec.
  const storage = await storageStatus();
  const setup = storage.ok ? !(await hasAdmin()) : true;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[900px] flex-col justify-center px-5 py-16 md:px-8">
      <LoginForm
        setup={setup}
        storageProblem={storage.ok ? undefined : storage.problem}
        storageSeen={storage.ok ? undefined : storage.seen}
      />
    </main>
  );
}
