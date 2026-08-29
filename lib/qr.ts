import "server-only";
import { promises as fs } from "fs";
import path from "path";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** Orange et vert de marque, en composantes 0-1 pour pdf-lib. */
const ORANGE = rgb(0xf4 / 255, 0x6f / 255, 0x40 / 255);
const GREEN = rgb(0x23 / 255, 0x47 / 255, 0x37 / 255);
const GREY = rgb(0x5b / 255, 0x5b / 255, 0x5b / 255);

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
  title: "Rejoignez-nous",
  subtitle: "Nous recrutons. Votre candidature commence ici.",
  instruction: "Scannez ce code avec l'appareil photo de votre téléphone",
};

/** QR vectoriel : le seul format à donner à un imprimeur. */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg", color: { dark: "#000000", light: "#ffffff" } });
}

/** QR vectoriel dans l'orange de marque, sur fond transparent. */
export async function qrSvgBrand(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    ...QR_OPTIONS,
    type: "svg",
    color: { dark: "#f46f40", light: "#0000" },
  });
  return svg;
}

export async function qrPng(url: string, width: number): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width, color: { dark: "#000000", light: "#ffffff" } });
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
  pdf.setCreator("Valeur Ajoutée");
  const page = pdf.addPage([w, h]);

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  // Logotype, s'il est présent dans public/.
  let cursorY = h - 70 * scale;
  try {
    const logoBytes = await fs.readFile(
      path.join(process.cwd(), "public", "logos", "LOGO-TEXTE.jpg")
    );
    const logo = await pdf.embedJpg(logoBytes);
    const logoW = 190 * scale;
    const logoH = logoW * (1981 / 5810);
    page.drawImage(logo, { x: (w - logoW) / 2, y: cursorY - logoH, width: logoW, height: logoH });
    cursorY -= logoH + 46 * scale;
  } catch {
    cursorY -= 10 * scale;
  }

  const center = (text: string, font: typeof bold, size: number, y: number, color = rgb(0, 0, 0)) => {
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (w - width) / 2, y, size, font, color });
  };

  const titleSize = 30 * scale;
  center(copy.title, bold, titleSize, cursorY - titleSize, GREEN);
  cursorY -= titleSize + 20 * scale;

  const subSize = 13 * scale;
  center(copy.subtitle, regular, subSize, cursorY - subSize, GREY);
  cursorY -= subSize + 42 * scale;

  // Le QR, cadré dans un liseré orange.
  const qrSize = (format === "a4" ? 280 : 210);
  const pad = 16 * scale;
  const boxX = (w - qrSize) / 2 - pad;
  const boxY = cursorY - qrSize - pad;
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: qrSize + pad * 2,
    height: qrSize + pad * 2,
    borderColor: ORANGE,
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
  center(pretty, bold, urlSize, cursorY, ORANGE);

  return pdf.save();
}
