"use client";

import { useState } from "react";
import { appPath } from "@/lib/basePath";

/**
 * Les exports d'un QR code, et l'avertissement qui va avec.
 *
 * Un QR posé sur une devanture ne se corrige plus. Le panneau insiste donc sur
 * ce qui est figé (l'adresse) et ce qui reste librement modifiable ensuite
 * (les questions, le tri, le libellé du lien).
 */
export default function QrPanel({
  url,
  token,
  printed,
  onTogglePrinted,
}: {
  url: string;
  token?: string;
  printed?: boolean;
  onTogglePrinted?: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  const api = (params: Record<string, string>) => {
    const search = new URLSearchParams(params);
    if (token) search.set("token", token);
    return appPath(`/api/admin/qrcode?${search.toString()}`);
  };

  const previewUrl = api({ format: "svg", inline: "1" });

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-quiet"
        aria-expanded={open}
      >
        {open ? "Masquer le QR code" : "QR code et impression"}
      </button>

      {open && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-custom3">
          <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-start md:p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={`QR code vers ${url}`}
              width={148}
              height={148}
              className="h-[148px] w-[148px] shrink-0 rounded-xl border border-custom3 bg-white p-2"
            />

            <div className="min-w-0 flex-1">
              <p className="eyebrow">Adresse encodée</p>
              <p className="mt-1 break-all text-[13px] font-semibold text-primaire-hover">{url}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-custom1">
                Cette adresse est gravée dans le code une fois imprimé. Tout le reste — les
                questions, les règles de tri, le libellé de ce lien — reste modifiable sans jamais
                le casser. Même supprimé, le lien continuera d'ouvrir le questionnaire.
              </p>

              {onTogglePrinted && (
                <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={Boolean(printed)}
                    onChange={(e) => onTogglePrinted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="text-[13px] leading-snug">
                    <span className="font-semibold">Ce QR code est imprimé</span>
                    <span className="block text-custom1">
                      Verrouille la suppression du lien : son code circule sur un support qu'on ne
                      peut plus reprendre.
                    </span>
                  </span>
                </label>
              )}
            </div>
          </div>

          <div className="border-t border-custom3 bg-wash p-4 md:p-5">
            <p className="eyebrow">À imprimer</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <a className="btn-ghost" href={api({ format: "pdf", page: "a4" })}>
                Affiche A4 (PDF)
              </a>
              <a className="btn-ghost" href={api({ format: "pdf", page: "a5" })}>
                Affiche A5 (PDF)
              </a>
              <a className="btn-ghost" href={api({ format: "svg" })}>
                SVG vectoriel
              </a>
              <a className="btn-ghost" href={api({ format: "svg-orange" })}>
                SVG orange
              </a>
            </div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-custom1">
              Pour une devanture, donnez le SVG à votre imprimeur : il s'agrandit sans perte, à
              n'importe quelle taille.
            </p>

            <p className="eyebrow mt-5">Pour un écran</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {[512, 1024, 2048].map((size) => (
                <a key={size} className="btn-ghost" href={api({ format: "png", size: String(size) })}>
                  PNG {size} px
                </a>
              ))}
            </div>

            <p className="mt-4 text-[12px] leading-relaxed text-custom1">
              Le code est produit avec la correction d'erreur maximale. Mesuré sur un masque d'un
              seul tenant — une étiquette qui se décolle — il reste lisible jusqu'à environ 10 % de
              sa surface occultée. Prévoyez tout de même 6 cm de côté au minimum sur une vitrine.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
