import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DB_DRIVER, getSettings } from "@/lib/db";
import AdminNav from "@/components/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/connexion");

  const settings = await getSettings();

  return (
    <div className="min-h-dvh">
      <AdminNav username={session.username} brand={settings.companyName} ephemeral={DB_DRIVER === "file"} />
      <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-8 md:px-8 md:pt-10">{children}</div>
    </div>
  );
}
