import "server-only";
import { promises as fs } from "fs";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** Bleu pétrole et corail Kiabi, en composantes 0-1 pour pdf-lib. */
const NAVY = rgb(0x04 / 255, 0x00 / 255, 0x37 / 255);
const CORAL = rgb(0xff / 255, 0x45 / 255, 0x29 / 255);
const CORAL_DARK = rgb(0xb5 / 255, 0x31 / 255, 0x1d / 255);
const GREY = rgb(0x4c / 255, 0x4c / 255, 0x54 / 255);

/**
 * Correction d'erreur maximale (niveau H) : un QR collé sur une vitrine finit
 * rayé, sali ou partiellement décollé.
 *
 * Les 30 % souvent cités valent pour des altérations dispersées. Mesuré ici sur
 * un masque d'un seul tenant — le cas d'une étiquette qui se décolle — le code
 * reste lisible jusqu'à environ 10 % de sa surface occultée, et cède au-delà.
 * C'est déjà bien plus que le niveau L par défaut, mais ce n'est pas 30 %.
 */
const QR_OPTIONS = {
  errorCorrectionLevel: "H" as const,
  margin: 2,
};

export type PosterFormat = "a4" | "a5";

export interface PosterCopy {
  /** Titre en haut de l'affiche. */
  title: string;
  /** Une ligne d'accroche sous le titre. */
  subtitle: string;
  /** Consigne au-dessus du QR. */
  instruction: string;
}

export const DEFAULT_COPY: PosterCopy = {
  title: "Rejoignez l'équipe",
  subtitle: "Ce magasin recrute. Votre candidature commence ici.",
  instruction: "Scannez ce code avec l'appareil photo de votre téléphone",
};

/** QR vectoriel : le seul format à donner à un imprimeur. */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg", color: { dark: "#000000", light: "#ffffff" } });
}

/**
 * QR vectoriel au bleu de marque, sur fond transparent.
 *
 * C'est le bleu pétrole qui sert ici, et non le corail : un lecteur de QR
 * distingue des modules par leur luminance, et le corail n'en offre pas assez
 * sur blanc pour être lu de loin ou par mauvaise lumière. Le bleu #040037 est
 * à un cheveu du noir — la marque est respectée, le code reste lisible.
 */
export async function qrSvgBrand(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    ...QR_OPTIONS,
    type: "svg",
    color: { dark: "#040037", light: "#0000" },
  });
  return svg;
}

export async function qrPng(url: string, width: number): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width, color: { dark: "#000000", light: "#ffffff" } });
}

/**
 * Le logotype officiel, si quelqu'un l'a déposé dans public/logos/.
 *
 * pdf-lib ne sait embarquer que du PNG et du JPEG — un SVG, lui, ne peut servir
 * qu'à l'écran. On essaie donc les deux extensions, et on renonce sans bruit :
 * une affiche sans logotype reste une affiche utilisable.
 */
async function embedLogo(pdf: PDFDocument) {
  const dir = path.join(process.cwd(), "public", "logos");
  for (const name of ["kiabi.png", "kiabi.jpg", "kiabi.jpeg"]) {
    try {
      const bytes = await fs.readFile(path.join(dir, name));
      return name.endsWith(".png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch {
      // Fichier absent ou illisible : on passe au suivant.
    }
  }
  return null;
}

/** Points PDF (1/72 pouce) des formats ISO. */
const PAGE: Record<PosterFormat, { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  a5: { w: 419.53, h: 595.28 },
};

/**
 * Affiche prête à imprimer : logotype, accroche, QR et adresse en toutes
 * lettres — pour qui n'arrive pas à scanner. Le QR est intégré en PNG haute
 * définition (1800 px), largement au-delà de ce qu'une imprimante restitue.
 */
export async function posterPdf(
  url: string,
  format: PosterFormat,
  copy: PosterCopy = DEFAULT_COPY
): Promise<Uint8Array> {
  const { w, h } = PAGE[format];
  const scale = format === "a4" ? 1 : 0.72;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Candidature — ${url}`);
  pdf.setCreator("Kiabi");
  const page = pdf.addPage([w, h]);

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  const center = (text: string, font: typeof bold, size: number, y: number, color = rgb(0, 0, 0)) => {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (w - width) / 2, y, size, font, color });
  };

  // Logotype officiel s'il a été déposé, sinon le lettrage — le même repli que
  // components/Logo.tsx, pour que l'affiche et l'écran se ressemblent.
  let cursorY = h - 70 * scale;
  const logo = await embedLogo(pdf);
  if (logo) {
    const logoW = 190 * scale;
    const logoH = logoW * (logo.height / logo.width);
    page.drawImage(logo, { x: (w - logoW) / 2, y: cursorY - logoH, width: logoW, height: logoH });
    cursorY -= logoH + 46 * scale;
  } else {
    const markSize = 34 * scale;
    const markWidth = bold.widthOfTextAtSize("KIABI", markSize);
    page.drawText("KIABI", {
      x: (w - markWidth) / 2,
      y: cursorY - markSize,
      size: markSize,
      font: bold,
      color: NAVY,
    });
    cursorY -= markSize + 46 * scale;
  }

  const titleSize = 30 * scale;
  center(copy.title, bold, titleSize, cursorY - titleSize, NAVY);
  cursorY -= titleSize + 20 * scale;

  const subSize = 13 * scale;
  center(copy.subtitle, regular, subSize, cursorY - subSize, GREY);
  cursorY -= subSize + 42 * scale;

  // Le QR, cadré dans un liseré corail.
  const qrSize = (format === "a4" ? 280 : 210);
  const pad = 16 * scale;
  const boxX = (w - qrSize) / 2 - pad;
  const boxY = cursorY - qrSize - pad;
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: qrSize + pad * 2,
    height: qrSize + pad * 2,
    borderColor: CORAL,
    borderWidth: 2,
    color: rgb(1, 1, 1),
  });

  const png = await pdf.embedPng(await qrPng(url, 1800));
  page.drawImage(png, { x: (w - qrSize) / 2, y: cursorY - qrSize, width: qrSize, height: qrSize });
  cursorY -= qrSize + pad * 2 + 34 * scale;

  const instrSize = 11 * scale;
  center(copy.instruction, regular, instrSize, cursorY, GREY);
  cursorY -= instrSize + 22 * scale;

  // L'adresse en clair : le repli quand le scan échoue.
  const urlSize = 12 * scale;
  const pretty = url.replace(/^https?:\/\//, "");
  center(pretty, bold, urlSize, cursorY, CORAL_DARK);

  return pdf.save();
}
