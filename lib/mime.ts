export interface FormatInfo {
  ext: string;
  mime: string;
  label: string;
  /** How the admin viewer should render it. */
  render: "pdf" | "image" | "text" | "docx" | "none";
}

/** Every format the upload field accepts, and how each one previews. */
export const FORMATS: FormatInfo[] = [
  { ext: "pdf", mime: "application/pdf", label: "PDF", render: "pdf" },
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word", render: "docx" },
  { ext: "doc", mime: "application/msword", label: "Word 97", render: "none" },
  { ext: "odt", mime: "application/vnd.oasis.opendocument.text", label: "OpenDocument", render: "none" },
  { ext: "rtf", mime: "application/rtf", label: "RTF", render: "text" },
  { ext: "txt", mime: "text/plain", label: "Texte", render: "text" },
  { ext: "md", mime: "text/markdown", label: "Markdown", render: "text" },
  { ext: "csv", mime: "text/csv", label: "CSV", render: "text" },
  { ext: "html", mime: "text/html", label: "HTML", render: "text" },
  { ext: "png", mime: "image/png", label: "Image PNG", render: "image" },
  { ext: "jpg", mime: "image/jpeg", label: "Image JPEG", render: "image" },
  { ext: "jpeg", mime: "image/jpeg", label: "Image JPEG", render: "image" },
  { ext: "webp", mime: "image/webp", label: "Image WebP", render: "image" },
  { ext: "gif", mime: "image/gif", label: "Image GIF", render: "image" },
  { ext: "avif", mime: "image/avif", label: "Image AVIF", render: "image" },
  { ext: "heic", mime: "image/heic", label: "Image HEIC", render: "none" },
  { ext: "heif", mime: "image/heif", label: "Image HEIF", render: "none" },
  { ext: "tif", mime: "image/tiff", label: "Image TIFF", render: "none" },
  { ext: "tiff", mime: "image/tiff", label: "Image TIFF", render: "none" },
  { ext: "pages", mime: "application/x-iwork-pages-sffpages", label: "Pages", render: "none" },
  { ext: "odp", mime: "application/vnd.oasis.opendocument.presentation", label: "Présentation", render: "none" },
  { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint", render: "none" },
  { ext: "zip", mime: "application/zip", label: "Archive ZIP", render: "none" },
];

export const ACCEPT_ATTRIBUTE = [
  ...new Set(FORMATS.flatMap((f) => [`.${f.ext}`, f.mime])),
].join(",");

export function extOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
}

export function formatFor(filename: string, mime?: string): FormatInfo {
  const ext = extOf(filename);
  const byExt = FORMATS.find((f) => f.ext === ext);
  if (byExt) return byExt;
  if (mime) {
    const byMime = FORMATS.find((f) => f.mime === mime);
    if (byMime) return byMime;
    if (mime.startsWith("image/")) return { ext, mime, label: "Image", render: "image" };
    if (mime.startsWith("text/")) return { ext, mime, label: "Texte", render: "text" };
  }
  return { ext: ext || "bin", mime: mime || "application/octet-stream", label: ext ? ext.toUpperCase() : "Fichier", render: "none" };
}

export function isAccepted(filename: string, mime?: string): boolean {
  const ext = extOf(filename);
  if (FORMATS.some((f) => f.ext === ext)) return true;
  if (mime && FORMATS.some((f) => f.mime === mime)) return true;
  return false;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
