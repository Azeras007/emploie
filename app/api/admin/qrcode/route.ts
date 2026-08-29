import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getInviteByToken, getSettings } from "@/lib/db";
import { candidatureUrl } from "@/lib/links";
import { DEFAULT_COPY, posterPdf, qrPng, qrSvg, qrSvgBrand } from "@/lib/qr";

export const runtime = "nodejs";

const querySchema = z.object({
  /** Jeton d'invitation ; absent, le QR pointe vers le questionnaire général. */
  token: z.string().optional(),
  format: z.enum(["svg", "svg-orange", "png", "pdf"]).default("svg"),
  size: z.coerce.number().int().min(128).max(4096).optional(),
  page: z.enum(["a4", "a5"]).default("a4"),
  /** Aperçu à l'écran plutôt que téléchargement. */
  inline: z.coerce.boolean().optional(),
});

/** Nom de fichier explicite : ces exports partent chez un imprimeur. */
function filename(label: string, format: string, size?: number, page?: string): string {
  const slug =
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "candidature";

  if (format === "pdf") return `qr-${slug}-affiche-${page}.pdf`;
  if (format === "png") return `qr-${slug}-${size}px.png`;
  if (format === "svg-orange") return `qr-${slug}-orange.svg`;
  return `qr-${slug}.svg`;
}

export async function GET(req: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Paramètres de QR code invalides." }, { status: 400 });
  }
  const { token, format, page, inline } = parsed.data;
  const size = parsed.data.size ?? 1024;

  const settings = await getSettings();
  const invite = token ? await getInviteByToken(token) : null;
  const url = candidatureUrl(settings.publicBaseUrl, token);
  const label = invite?.label ?? "questionnaire";

  const disposition = inline ? "inline" : "attachment";
  const name = filename(label, format, size, page);
  const headers: Record<string, string> = {
    "Content-Disposition": `${disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "private, no-store",
  };

  try {
    if (format === "pdf") {
      const bytes = await posterPdf(url, page, {
        ...DEFAULT_COPY,
        subtitle: settings.jobTitle
          ? `${settings.jobTitle} — votre candidature commence ici.`
          : DEFAULT_COPY.subtitle,
      });
      return new NextResponse(Buffer.from(bytes), {
        headers: { ...headers, "Content-Type": "application/pdf" },
      });
    }

    if (format === "png") {
      const buffer = await qrPng(url, size);
      return new NextResponse(new Uint8Array(buffer), {
        headers: { ...headers, "Content-Type": "image/png" },
      });
    }

    const svg = format === "svg-orange" ? await qrSvgBrand(url) : await qrSvg(url);
    return new NextResponse(svg, {
      headers: { ...headers, "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  } catch (err) {
    console.error("Génération du QR code impossible", err);
    return NextResponse.json(
      { error: `Le QR code n'a pas pu être produit : ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
