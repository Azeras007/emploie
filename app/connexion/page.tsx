import { redirect } from "next/navigation";
import { getSession, hasAdmin } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function ConnexionPage() {
  if (await getSession()) redirect("/admin");
  const setup = !(await hasAdmin());

  return (
    <main className="mx-auto flex min-h-dvh max-w-[900px] flex-col justify-center px-5 py-16 md:px-8">
      <LoginForm setup={setup} />
    </main>
  );
}
