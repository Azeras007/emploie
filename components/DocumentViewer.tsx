"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { formatFor, humanSize } from "@/lib/mime";
import type { PreviewPayload } from "@/lib/preview";
import type { FileKind, StoredFile } from "@/lib/types";

/**
 * Visionneuse de documents : onglets, aperçu intégré, téléchargement et partage.
 * Les aperçus sont calculés côté serveur (`renderPreview`) et transmis tels quels.
 */

export interface DocumentViewerProps {
  files: StoredFile[];
  /** Aperçu de chaque fichier, indexé par `file.id`. */
  previews: Record<string, PreviewPayload>;
  /** Racine de la route de service des octets, soit `/api/fichiers`. */
  baseUrl: string;
  /** Jeton de partage public : ajouté à chaque URL quand il est fourni. */
  shareToken?: string;
}

const KIND_LABELS: Record<FileKind, string> = {
  cv: "CV",
  lettre: "Lettre de motivation",
  autre: "Document",
};

const FALLBACK: PreviewPayload = {
  mode: "unsupported",
  warning:
    "Aucun aperçu n'a été généré pour ce document. Téléchargez-le pour le consulter.",
};

/** Hauteur de la zone d'aperçu : confortable sur mobile, généreuse sur grand écran. */
const FRAME = "h-[62vh] md:h-[min(78vh,900px)]";

export default function DocumentViewer({
  files,
  previews,
  baseUrl,
  shareToken,
}: DocumentViewerProps) {
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const root = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
  const viewUrl = useCallback(
    (file: StoredFile) => `${baseUrl}/${file.id}${root}`,
    [baseUrl, root]
  );
  const downloadUrl = useCallback(
    (file: StoredFile) => `${viewUrl(file)}${shareToken ? "&" : "?"}d=1`,
    [viewUrl, shareToken]
  );

  const share = useCallback(
    async (file: StoredFile) => {
      // L'URL absolue n'est calculable qu'au clic : rien à faire côté serveur.
      const absolute = new URL(viewUrl(file), window.location.origin).toString();
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title: file.name, url: absolute });
          return;
        } catch {
          // Partage refusé ou annulé : on retombe sur le presse-papiers.
        }
      }
      try {
        await navigator.clipboard.writeText(absolute);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        // Presse-papiers indisponible : le bouton « Ouvrir dans un onglet » reste là.
      }
    },
    [viewUrl]
  );

  if (files.length === 0) {
    return (
      <section className="card">
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <p className="eyebrow">Documents</p>
          <p className="display mt-3 text-[20px]">Aucun document</p>
          <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-custom1">
            Cette candidature ne contient ni CV ni lettre de motivation.
          </p>
        </div>
      </section>
    );
  }

  const index = Math.min(selected, files.length - 1);
  const file = files[index];
  const preview = previews[file.id] ?? FALLBACK;
  const format = formatFor(file.name, file.mime);
  const url = viewUrl(file);
  const dl = downloadUrl(file);

  return (
    <section className="card overflow-hidden shadow-soft">
      {files.length > 1 ? (
        <div
          role="tablist"
          aria-label="Documents de la candidature"
          className="flex overflow-x-auto border-b border-custom3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setSelected(i)}
              className={clsx(
                "-mb-px flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4",
                "text-[13px] font-semibold transition-colors duration-150",
                i === index
                  ? "border-primaire text-black"
                  : "border-transparent text-custom1 hover:text-black"
              )}
            >
              {KIND_LABELS[f.kind]}
              <span className="tracking-normal opacity-50">{humanSize(f.size)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <header className="flex items-baseline gap-3 border-b border-custom3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{KIND_LABELS[file.kind]}</p>
          <p className="mt-1 truncate text-[15px] leading-snug" title={file.name}>
            {file.name}
          </p>
        </div>
        <span className="shrink-0 text-[13px] font-semibold text-custom1">
          {format.label}
        </span>
      </header>

      <div className={clsx("w-full overflow-hidden border-b border-custom3 bg-wash", FRAME)}>
        {preview.mode === "pdf" ? (
          <object
            data={url}
            type="application/pdf"
            aria-label={`Aperçu de ${file.name}`}
            className="h-full w-full"
          >
            {/* Repli 1 : certaines plateformes n'affichent les PDF que via une iframe. */}
            <div className="flex h-full w-full flex-col">
              <iframe
                src={url}
                title={file.name}
                className="min-h-0 w-full flex-1 border-0 bg-white"
              />
              {/* Repli 2 : ni objet ni iframe — il ne reste que le téléchargement. */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-custom3 bg-white px-4 py-3">
                <p className="text-[13px] leading-snug text-custom1">
                  Ce navigateur n&apos;affiche pas les PDF en ligne.
                </p>
                <a href={dl} className="btn min-h-[44px]">
                  Télécharger
                </a>
              </div>
            </div>
          </object>
        ) : null}

        {preview.mode === "image" ? (
          <div className="flex h-full w-full items-center justify-center bg-wash p-3 sm:p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={file.name}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ) : null}

        {preview.mode === "html" ? (
          <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-white px-5 py-6 sm:px-8 sm:py-8">
            <div
              className="doc-render mx-auto max-w-measure break-words"
              dangerouslySetInnerHTML={{ __html: preview.html ?? "" }}
            />
          </div>
        ) : null}

        {preview.mode === "text" ? (
          <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-white px-5 py-6 sm:px-8 sm:py-8">
            <pre className="mx-auto max-w-measure whitespace-pre-wrap break-words text-[12.5px] leading-[1.7]">
              {preview.text}
            </pre>
          </div>
        ) : null}

        {preview.mode === "unsupported" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-wash px-6 py-10 text-center">
            <span className="border border-custom3 bg-white px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-custom1">
              {format.ext || "fichier"}
            </span>
            <p className="display text-[18px]">Aperçu indisponible</p>
            <p className="max-w-sm text-[14px] leading-relaxed text-custom1">
              {preview.warning ?? FALLBACK.warning}
            </p>
            <a href={dl} className="btn min-h-[44px]">
              Télécharger
            </a>
          </div>
        ) : null}
      </div>

      {preview.mode !== "unsupported" && preview.warning ? (
        <p className="border-b border-rule2 bg-wash px-4 py-2.5 text-[12px] leading-snug text-custom1 sm:px-5">
          {preview.warning}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <a href={dl} download={file.name} className="btn min-h-[44px]">
          Télécharger
        </a>
        <button
          type="button"
          onClick={() => share(file)}
          aria-live="polite"
          className="btn-ghost min-h-[44px]"
        >
          {copied ? "Lien copié" : "Partager"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost min-h-[44px]"
        >
          Ouvrir dans un onglet
        </a>
        <span className="ml-auto text-[11px] tabular-nums text-custom1">
          {humanSize(file.size)}
        </span>
      </div>
    </section>
  );
}
