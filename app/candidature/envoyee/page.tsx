import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[900px] flex-col justify-center px-5 py-16 md:px-8">
      <div className="rise max-w-measure">
        <p className="eyebrow">Candidature reçue</p>
        <h1 className="display mt-5 text-[38px] leading-[1.02] md:text-[58px]">
          C'est envoyé.
        </h1>
        <p className="mt-6 text-[16px] leading-relaxed text-muted md:text-[18px]">
          Votre dossier est arrivé chez nous. Nous le lisons et revenons vers vous par e-mail.
          Gardez cette référence, elle identifie votre candidature.
        </p>

        {ref && (
          <div className="mt-10 inline-flex items-center gap-4 border border-ink px-5 py-4">
            <span className="eyebrow">Référence</span>
            <span className="font-mono text-[18px] tracking-[0.08em]">{ref}</span>
          </div>
        )}

        <p className="mt-12">
          <Link href="/" className="btn-quiet">
            ← Retour à l'accueil
          </Link>
        </p>
      </div>
    </main>
  );
}
