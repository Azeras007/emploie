import Link from "next/link";
import Logo from "@/components/Logo";
import { getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const settings = await getSettings();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[900px] flex-col px-5 py-10 md:px-8 md:py-14">
      <Logo height={38} priority />

      <div className="flex flex-1 flex-col justify-center py-16">
        <h1 className="display max-w-[16ch] text-[40px] leading-[0.98] md:text-[76px]">
          {settings.jobTitle}
        </h1>
        <p className="mt-6 max-w-measure text-[16px] leading-relaxed text-custom1 md:text-[18px]">
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

      <footer className="border-t border-custom3 pt-5 text-[13px] text-custom2">
        Vos réponses ne sont lues que par l'équipe de recrutement.
      </footer>
    </main>
  );
}
