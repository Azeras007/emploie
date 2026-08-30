import Link from "next/link";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[900px] flex-col justify-center px-5 md:px-8">
      <Logo height={32} className="mb-8" />
      <p className="eyebrow text-corail">Erreur 404</p>
      <h1 className="display mt-4 text-[36px] leading-[1.02] md:text-[56px]">
        Cette page n'existe pas.
      </h1>
      <p className="mt-5 max-w-measure text-[16px] leading-relaxed text-custom1">
        Le lien est peut-être expiré, ou l'invitation a été désactivée. Demandez-en un nouveau à
        votre contact.
      </p>
      <p className="mt-10">
        <Link href="/" className="btn-quiet">
          ← Aller au questionnaire
        </Link>
      </p>
    </main>
  );
}
