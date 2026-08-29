import Link from "next/link";
import { getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const settings = await getSettings();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[900px] flex-col px-5 py-10 md:px-8 md:py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em]">{settings.companyName}</p>

      <div className="flex flex-1 flex-col justify-center py-16">
        <h1 className="display max-w-[16ch] text-[40px] leading-[0.98] md:text-[76px]">
          {settings.jobTitle}
        </h1>
        <p className="mt-6 max-w-measure text-[16px] leading-relaxed text-muted md:text-[18px]">
          {settings.intro}
        </p>

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Link href="/candidature" className="btn">
            Répondre au questionnaire
          </Link>
          <Link href="/admin" className="btn-quiet">
            Espace recrutement
          </Link>
        </div>
      </div>

      <footer className="border-t border-rule pt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        Vos réponses ne sont lues que par l'équipe de recrutement.
      </footer>
    </main>
  );
}
