import "server-only";
import { formatFor } from "./mime";
import { readFile } from "./storage";
import type { StoredFile } from "./types";

/**
 * Prévisualisation serveur des documents candidats.
 *
 * Le principe : ce module ne renvoie JAMAIS d'exception. Tout ce qui échoue
 * retombe sur le mode « unsupported » accompagné d'un message en français,
 * pour que l'écran d'administration reste utilisable quoi qu'il arrive.
 */

export type PreviewMode = "pdf" | "image" | "html" | "text" | "unsupported";

export interface PreviewPayload {
  mode: PreviewMode;
  /** HTML déjà assaini, prêt pour `dangerouslySetInnerHTML`. */
  html?: string;
  /** Texte brut, à afficher dans un `<pre>`. */
  text?: string;
  /** Explication en français quand la prévisualisation est partielle ou impossible. */
  warning?: string;
}

/** Au-delà de cette taille on refuse toute conversion serveur (docx, texte, RTF). */
export const PREVIEW_MAX_BYTES = 25 * 1024 * 1024;

/** Garde-fou sur le volume de texte renvoyé au navigateur. */
const MAX_TEXT_CHARS = 200_000;

/* ------------------------------------------------------------------ *
 * Assainisseur HTML — allowlist stricte, sans dépendance externe.
 * ------------------------------------------------------------------ */

const ALLOWED_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4",
  "ul", "ol", "li",
  "strong", "em", "br", "a",
  "table", "thead", "tbody", "tr", "td", "th",
  "blockquote", "hr", "img",
]);

/** Balises orphelines : jamais de balise fermante. */
const VOID_TAGS = new Set(["br", "hr", "img"]);

/** Blocs supprimés avec leur contenu (le texte lui-même n'a rien à faire à l'écran). */
const CONTENT_BLOCKS =
  /<(script|style|head|title|noscript|template|iframe|object|embed|svg|math|form|select|textarea)\b[\s\S]*?<\/\1\s*>/gi;

/** Commentaires HTML, y compris les commentaires conditionnels de Word. */
const COMMENTS = /<!--[\s\S]*?-->/g;

/** Repère n'importe quelle construction `<...>`, bien ou mal formée. */
const ANY_TAG = /<[^>]*>/g;

/** Ne reconnaît qu'une balise parfaitement formée (nom + attributs quotés). */
const STRICT_TAG =
  /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;

/** Extrait les paires attribut = valeur d'une chaîne d'attributs. */
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function escapeText(value: string): string {
  // On préserve les entités déjà présentes (&eacute;, &#233;…) et on neutralise le reste.
  return value
    .replace(/&(?!#?[a-zA-Z0-9]{1,8};)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Nettoie une URL de ses espaces et caractères de contrôle avant de la tester. */
function cleanUrl(value: string): string {
  // Les caractères de contrôle servent à masquer « javascript: » ; on les retire.
  return value.replace(/[\u0000-\u0020\u007f\s]/g, "").toLowerCase();
}

function tagNameOf(chunk: string): string | null {
  const m = /^<\s*\/?\s*([a-zA-Z][a-zA-Z0-9:-]*)/.exec(chunk);
  return m ? m[1].toLowerCase() : null;
}

/** Reconstruit une balise autorisée avec, au plus, ses attributs sûrs. */
function rebuildTag(closing: string, name: string, rawAttrs: string): string {
  if (closing) return VOID_TAGS.has(name) ? "" : `</${name}>`;

  let attrs = "";
  if (name === "a" || name === "img") {
    ATTR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ATTR.exec(rawAttrs)) !== null) {
      const key = m[1].toLowerCase();
      const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();
      if (name === "a" && key === "href") {
        // Seuls les liens web et courriel survivent : ni javascript:, ni data:.
        if (/^(https?:\/\/|mailto:)/.test(cleanUrl(value))) {
          attrs += ` href="${escapeAttr(value)}" target="_blank" rel="noopener noreferrer nofollow"`;
        }
      } else if (name === "img" && key === "src") {
        // Les images doivent être embarquées : mammoth les convertit en data URI.
        if (/^data:image\//.test(cleanUrl(value))) {
          attrs += ` src="${escapeAttr(value)}"`;
        }
      } else if (name === "img" && key === "alt") {
        attrs += ` alt="${escapeAttr(value)}"`;
      }
    }
    // Une image sans source embarquée n'a aucun intérêt.
    if (name === "img" && !attrs.includes("src=")) return "";
  }

  return VOID_TAGS.has(name) ? `<${name}${attrs} />` : `<${name}${attrs}>`;
}

/**
 * Assainit du HTML arbitraire : allowlist de balises, aucun attribut hormis
 * `href` (http/https/mailto) et `src` (data:image/ uniquement). Tout ce qui
 * n'est pas une balise parfaitement formée et autorisée finit échappé.
 */
export function sanitizeHtml(input: string): string {
  // 1. On évacue les blocs entiers dont même le texte est indésirable.
  let html = input.replace(COMMENTS, " ").replace(CONTENT_BLOCKS, " ");

  // 2. On retire les balises non autorisées en conservant leur contenu textuel.
  html = html.replace(ANY_TAG, (chunk) => {
    const name = tagNameOf(chunk);
    if (name) return ALLOWED_TAGS.has(name) ? chunk : "";
    // Déclaration ou fermeture bancale : à la poubelle.
    if (/^<[!?/]/.test(chunk)) return "";
    // Sinon ce n'est pas du balisage mais du texte (« 5 < 7 ») : on le conserve.
    return chunk;
  });

  // 3. Passe stricte : on reconstruit chaque balise, on échappe tout le reste.
  let out = "";
  let cursor = 0;
  STRICT_TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STRICT_TAG.exec(html)) !== null) {
    out += escapeText(html.slice(cursor, match.index));
    const name = match[2].toLowerCase();
    out += ALLOWED_TAGS.has(name)
      ? rebuildTag(match[1], name, match[3] ?? "")
      : escapeText(match[0]);
    cursor = match.index + match[0].length;
  }
  out += escapeText(html.slice(cursor));

  // 4. Un peu d'hygiène : on évite les cascades de blancs.
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------------------ *
 * Décodage texte
 * ------------------------------------------------------------------ */

/** UTF-8 par défaut, repli latin1 dès qu'apparaissent des caractères de remplacement. */
export function decodeText(buffer: Buffer): string {
  let text = buffer.toString("utf8");
  if (text.includes("\uFFFD")) text = buffer.toString("latin1");
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_CHARS), truncated: true };
}

/* ------------------------------------------------------------------ *
 * RTF — dépouillage grossier des groupes de contrôle.
 * ------------------------------------------------------------------ */

/** Destinations RTF dont le contenu n'est pas du texte lisible. */
const RTF_SKIPPED =
  /^\\(?:\*|(?:fonttbl|colortbl|stylesheet|info|pict|object|objdata|themedata|colorschememapping|latentstyles|datastore|generator|listtable|listoverridetable|rsidtbl|xmlnstbl|filetbl|revtbl|header[lrf]?|footer[lrf]?|footnote|nonshppict|shppict|mmath)\b)/;

/** Mots de contrôle qui produisent une rupture de ligne. */
const RTF_BREAKS = new Set(["par", "line", "sect", "page", "row", "cell", "nestcell", "nestrow"]);

/**
 * Convertit du RTF en texte approximatif : on suit la profondeur des accolades
 * pour ignorer les destinations techniques, et on traduit les échappements
 * usuels (\'hh, \uNNNN, \tab, \par…).
 */
export function rtfToText(rtf: string): string {
  let out = "";
  let i = 0;
  let ignore = false;
  const stack: boolean[] = [];

  while (i < rtf.length) {
    const c = rtf[i];

    if (c === "{") {
      stack.push(ignore);
      if (!ignore && RTF_SKIPPED.test(rtf.slice(i + 1, i + 40))) ignore = true;
      i += 1;
      continue;
    }

    if (c === "}") {
      ignore = stack.pop() ?? false;
      i += 1;
      continue;
    }

    if (c === "\\") {
      const rest = rtf.slice(i, i + 40);

      // Échappements littéraux : \\ \{ \} et le tiret conditionnel.
      const literal = /^\\([\\{}])/.exec(rest);
      if (literal) {
        if (!ignore) out += literal[1];
        i += 2;
        continue;
      }

      // Octet brut : \'hh
      const hex = /^\\'([0-9a-fA-F]{2})/.exec(rest);
      if (hex) {
        if (!ignore) out += String.fromCharCode(parseInt(hex[1], 16));
        i += 4;
        continue;
      }

      // Mot de contrôle : \word[-]nnn suivi d'un espace optionnel.
      const word = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rest);
      if (word) {
        const name = word[1];
        i += word[0].length;
        if (ignore) continue;
        if (name === "u") {
          const code = Number(word[2]);
          if (Number.isFinite(code)) out += String.fromCodePoint(code < 0 ? code + 65536 : code);
          // Le caractère de repli qui suit (\ucN vaut 1 par défaut) est sauté.
          if (rtf[i] === "?") i += 1;
        } else if (RTF_BREAKS.has(name)) {
          out += "\n";
        } else if (name === "tab") {
          out += "\t";
        } else if (name === "emdash") {
          out += "—";
        } else if (name === "endash") {
          out += "–";
        } else if (name === "lquote" || name === "rquote") {
          out += "'";
        } else if (name === "ldblquote") {
          out += "«";
        } else if (name === "rdblquote") {
          out += "»";
        } else if (name === "bullet") {
          out += "•";
        }
        continue;
      }

      // Antislash isolé : on l'ignore.
      i += 1;
      continue;
    }

    if (c === "\n" || c === "\r") {
      i += 1;
      continue;
    }

    if (!ignore) out += c;
    i += 1;
  }

  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------------------ *
 * Point d'entrée
 * ------------------------------------------------------------------ */

function unsupported(warning: string): PreviewPayload {
  return { mode: "unsupported", warning };
}

const TOO_BIG =
  "Ce document dépasse 25 Mo : il est trop volumineux pour être prévisualisé. Téléchargez-le pour le consulter.";

/** Interface minimale de mammoth, chargé à la volée (module CommonJS). */
interface MammothLike {
  convertToHtml(input: { buffer: Buffer }): Promise<{ value: string }>;
}

async function loadMammoth(): Promise<MammothLike> {
  const imported = await import("mammoth");
  const mod = imported as unknown as { default?: MammothLike } & MammothLike;
  // Selon l'interop CJS/ESM, le module est soit direct, soit sous `default`.
  return typeof mod.convertToHtml === "function" ? mod : (mod.default as MammothLike);
}

/**
 * Décrit comment afficher un fichier stocké. Ne lit les octets que lorsqu'une
 * conversion est nécessaire : les PDF et les images sont servis tels quels par
 * la route `/api/fichiers/[fileId]`.
 */
export async function renderPreview(file: StoredFile): Promise<PreviewPayload> {
  const format = formatFor(file.name, file.mime);

  try {
    // Aucun travail serveur : le navigateur sait faire.
    if (format.render === "pdf") return { mode: "pdf" };
    if (format.render === "image") return { mode: "image" };

    if (format.render !== "docx" && format.render !== "text") {
      return unsupported(
        `Le format ${format.label} ne se prévisualise pas dans le navigateur. Téléchargez le fichier pour l'ouvrir avec l'application adaptée.`
      );
    }

    if (file.size > PREVIEW_MAX_BYTES) return unsupported(TOO_BIG);

    const buffer = await readFile(file.key, file.access);
    if (buffer.byteLength > PREVIEW_MAX_BYTES) return unsupported(TOO_BIG);

    /* ---- Word (.docx) ---- */
    if (format.render === "docx") {
      const mammoth = await loadMammoth();
      const result = await mammoth.convertToHtml({ buffer });
      const html = sanitizeHtml(result.value ?? "");
      if (!html) {
        return unsupported(
          "Ce document Word semble vide ou illisible. Téléchargez-le pour le consulter dans Word."
        );
      }
      return {
        mode: "html",
        html,
        warning:
          "Rendu approximatif : la mise en page d'origine (polices, colonnes, en-têtes) n'est pas reproduite.",
      };
    }

    /* ---- Texte, Markdown, CSV, HTML, RTF ---- */
    const raw = decodeText(buffer);

    if (format.ext === "html") {
      const html = sanitizeHtml(raw);
      if (!html) {
        return unsupported(
          "Ce fichier HTML ne contient aucun contenu affichable. Téléchargez-le pour l'inspecter."
        );
      }
      return {
        mode: "html",
        html,
        warning: "Les styles et scripts du fichier ont été retirés pour des raisons de sécurité.",
      };
    }

    if (format.ext === "rtf") {
      const converted = truncate(rtfToText(raw));
      if (!converted.text.trim()) {
        return unsupported(
          "Le contenu de ce fichier RTF n'a pas pu être extrait. Téléchargez-le pour le consulter."
        );
      }
      return {
        mode: "text",
        text: converted.text,
        warning: converted.truncated
          ? "Document tronqué à l'affichage. Téléchargez-le pour le lire en entier."
          : "Rendu texte seul : la mise en forme du RTF n'est pas reproduite.",
      };
    }

    const plain = truncate(raw);
    if (!plain.text.trim()) {
      return unsupported("Ce fichier est vide.");
    }
    return {
      mode: "text",
      text: plain.text,
      warning: plain.truncated
        ? "Document tronqué à l'affichage. Téléchargez-le pour le lire en entier."
        : undefined,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return unsupported(
      `La prévisualisation a échoué (${detail}). Téléchargez le fichier pour le consulter.`
    );
  }
}
