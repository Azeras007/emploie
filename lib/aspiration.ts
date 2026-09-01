import "server-only";
import { contraste, estHex, hexToRgb, luminance, rgbToHex } from "./couleurs";
import { recupererTexte, UrlRefusee } from "./reseau";

/**
 * Aspiration de charte : lire le site d'une enseigne et en déduire un thème.
 *
 * C'est le geste commercial du produit. Coller une adresse et obtenir en dix
 * secondes une application aux couleurs du prospect vaut mieux que n'importe
 * quelle capture d'écran de démonstration.
 *
 * La méthode suit ce que font réellement les sites modernes : leur charte est
 * déclarée en variables CSS, souvent nommées. À défaut, on compte les couleurs
 * et on garde les plus employées parmi celles qui ne sont ni du gris ni du
 * blanc cassé.
 *
 * Rien n'est appliqué automatiquement : la fonction *propose*, et l'opérateur
 * corrige. Une charte devinée à 80 % puis retouchée reste dix fois plus rapide
 * qu'une charte saisie à la main.
 */

export interface Proposition {
  source: string;
  couleurs: {
    primaire: string | null;
    accent: string | null;
    encre: string | null;
  };
  polices: { titre: string | null; texte: string | null };
  logos: string[];
  /** Les couleurs les plus employées, pour que l'opérateur puisse choisir autrement. */
  palette: { hex: string; poids: number; origine: string }[];
  /** Ce que l'analyse a compris, en clair — l'opérateur doit pouvoir juger. */
  journal: string[];
}

/* ------------------------------------------------------------------ *
 * Couleurs
 * ------------------------------------------------------------------ */

const RE_HEX = /#([0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const RE_RGB = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi;
const RE_VARIABLE = /--([a-z0-9-]+)\s*:\s*([^;}]+)/gi;

/** Noms de variables qui désignent une couleur de marque, tous vocabulaires confondus. */
const NOMS_MARQUE =
  /(^|-)(brand|primary|principal|primaire|main|marque|accent|secondary|secondaire|cta|highlight)(-|$)/i;

/** Les nuances trop proches du blanc, du noir ou du gris ne sont pas des couleurs de marque. */
function saturation(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  if (max === min) return 0;
  const l = (max + min) / 2;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

function teinte(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return (h * 60 + 360) % 360;
}

function ecartTeinte(a: string, b: string): number {
  const d = Math.abs(teinte(a) - teinte(b));
  return d > 180 ? 360 - d : d;
}

function normaliser(hex: string): string {
  const c = hex.replace(/^#/, "");
  const plein =
    c.length === 3
      ? c
          .split("")
          .map((x) => x + x)
          .join("")
      : c;
  return `#${plein.toLowerCase()}`;
}

interface Compte {
  hex: string;
  poids: number;
  origine: string;
}

function recolterCouleurs(css: string): Map<string, Compte> {
  const comptes = new Map<string, Compte>();

  const ajouter = (hex: string, poids: number, origine: string) => {
    if (!estHex(hex)) return;
    const cle = normaliser(hex);
    const existant = comptes.get(cle);
    if (existant) {
      existant.poids += poids;
      // La provenance la plus parlante l'emporte : « variable --brand-primary »
      // aide l'opérateur bien plus que « déclaration ».
      if (origine.startsWith("variable") && !existant.origine.startsWith("variable")) {
        existant.origine = origine;
      }
    } else {
      comptes.set(cle, { hex: cle, poids, origine });
    }
  };

  // Les variables nommées d'abord : ce sont les déclarations d'intention.
  for (const m of css.matchAll(RE_VARIABLE)) {
    const [, nom, valeur] = m;
    const hex = premiereCouleur(valeur);
    if (!hex) continue;
    const nomme = NOMS_MARQUE.test(nom);
    ajouter(hex, nomme ? 60 : 6, `variable --${nom}`);
  }

  for (const m of css.matchAll(RE_HEX)) ajouter(m[0], 1, "déclaration");
  for (const m of css.matchAll(RE_RGB)) {
    ajouter(rgbToHex({ r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }), 1, "déclaration");
  }

  return comptes;
}

function premiereCouleur(valeur: string): string | null {
  const hex = valeur.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hex) return hex[0];
  const rgb = valeur.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return rgbToHex({ r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) });
  return null;
}

/**
 * Choisit la couleur des actions.
 *
 * Un bouton doit porter du texte lisible : on n'accepte donc que des nuances
 * qui atteignent 4,5:1 contre du blanc *ou* contre l'encre. Une enseigne au
 * jaune vif passe par le second chemin, et le moteur de thème posera du texte
 * sombre dessus.
 */
function choisirPrimaire(candidats: Compte[]): string | null {
  const utilisables = candidats.filter(
    (c) => contraste(c.hex, "#ffffff") >= 4.5 || contraste(c.hex, "#131314") >= 4.5
  );
  if (utilisables.length === 0) return null;

  const note = (c: Compte) => {
    const sat = saturation(c.hex);
    const sombre = 1 - luminance(c.hex);
    // Une couleur de marque est employée souvent, elle est franche, et elle est
    // plutôt foncée : c'est le profil d'un fond de bouton.
    return c.poids * (0.4 + sat) * (0.5 + sombre);
  };
  return [...utilisables].sort((a, b) => note(b) - note(a))[0].hex;
}

/** L'accent : la nuance la plus franche qui ne se confond pas avec la primaire. */
function choisirAccent(candidats: Compte[], primaire: string | null): string | null {
  const vifs = candidats.filter((c) => {
    const sat = saturation(c.hex);
    const lum = luminance(c.hex);
    if (sat < 0.35 || lum < 0.08 || lum > 0.82) return false;
    if (primaire && ecartTeinte(c.hex, primaire) < 25 && saturation(primaire) > 0.2) return false;
    return true;
  });
  if (vifs.length === 0) return null;
  const note = (c: Compte) => c.poids * (0.3 + saturation(c.hex));
  return [...vifs].sort((a, b) => note(b) - note(a))[0].hex;
}

/** L'encre : la nuance sombre la plus employée, à défaut le noir du produit. */
function choisirEncre(candidats: Compte[]): string | null {
  const sombres = candidats.filter((c) => luminance(c.hex) < 0.06);
  if (sombres.length === 0) return null;
  return [...sombres].sort((a, b) => b.poids - a.poids)[0].hex;
}

/* ------------------------------------------------------------------ *
 * Polices
 * ------------------------------------------------------------------ */

const GENERIQUES = new Set([
  "inherit", "initial", "unset", "serif", "sans-serif", "monospace", "cursive",
  "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace",
  "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "arial",
  "helvetica", "helvetica neue", "sans", "var", "none",
]);

function recolterPolices(html: string, css: string): { titre: string | null; texte: string | null } {
  const comptes = new Map<string, number>();

  // Les familles chargées depuis Google Fonts sont les plus sûres : le site les
  // a explicitement demandées, et notre thème sait les recharger.
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?([^"'\s>]+)/gi)) {
    for (const f of m[1].matchAll(/family=([^&:]+)/gi)) {
      const nom = decodeURIComponent(f[1]).replace(/\+/g, " ").trim();
      if (nom) comptes.set(nom, (comptes.get(nom) ?? 0) + 40);
    }
  }

  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const premiere = m[1].split(",")[0].trim().replace(/["']/g, "");
    if (!premiere || GENERIQUES.has(premiere.toLowerCase())) continue;
    if (premiere.startsWith("--") || premiere.includes("(")) continue;
    comptes.set(premiere, (comptes.get(premiere) ?? 0) + 1);
  }

  const classe = [...comptes.entries()].sort((a, b) => b[1] - a[1]).map(([nom]) => nom);
  if (classe.length === 0) return { titre: null, texte: null };
  // Deux familles distinctes si le site en emploie deux, sinon la même partout.
  return { titre: classe[0], texte: classe[1] ?? classe[0] };
}

/* ------------------------------------------------------------------ *
 * Logotypes
 * ------------------------------------------------------------------ */

function recolterLogos(html: string, base: string): string[] {
  const trouves: string[] = [];
  const ajouter = (href: string | undefined) => {
    if (!href) return;
    try {
      const absolue = new URL(href, base).href;
      if (!/^https?:/i.test(absolue)) return;
      if (!trouves.includes(absolue)) trouves.push(absolue);
    } catch {
      // Adresse illisible : on l'ignore, ce n'est qu'une suggestion.
    }
  };

  // Une image dont la classe, l'identifiant ou le texte alternatif dit « logo ».
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const balise = m[0];
    if (!/logo|brand|marque/i.test(balise)) continue;
    ajouter(balise.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]);
  }
  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/gi)) {
    ajouter(m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]);
  }
  const og = html.match(
    /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i
  );
  ajouter(og?.[1]);

  return trouves.slice(0, 8);
}

/* ------------------------------------------------------------------ *
 * Analyse
 * ------------------------------------------------------------------ */

const FEUILLES_MAX = 6;

export async function analyserSite(adresse: string): Promise<Proposition> {
  const journal: string[] = [];
  const page = await recupererTexte(adresse);
  journal.push(`Page reçue : ${page.url}`);

  // Une adresse de feuille de style est acceptée telle quelle. C'est la porte
  // de sortie quand un site refuse les robots : l'opérateur ouvre les outils de
  // développement de son navigateur, copie l'adresse du CSS, et l'analyse
  // reprend son cours.
  if (page.typeMime.includes("css") || /\.css(\?|$)/i.test(page.url)) {
    journal.push("Feuille de style analysée directement.");
    return depuisCss(page.url, page.contenu, "", journal);
  }

  const html = page.contenu;
  let css = "";

  // Le CSS en ligne compte : beaucoup de sites y déclarent leurs variables.
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css += `\n${m[1]}`;
  if (css.trim()) journal.push("Styles en ligne lus.");

  const feuilles: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const balise = m[0];
    if (!/rel\s*=\s*["']?stylesheet/i.test(balise)) continue;
    const href = balise.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const absolue = new URL(href, page.url).href;
      if (absolue.includes("fonts.googleapis.com")) continue; // pas de couleurs à y prendre
      if (!feuilles.includes(absolue)) feuilles.push(absolue);
    } catch {
      // Adresse de feuille illisible : ignorée.
    }
  }

  for (const feuille of feuilles.slice(0, FEUILLES_MAX)) {
    try {
      const contenu = await recupererTexte(feuille);
      css += `\n${contenu.contenu}`;
      journal.push(`Feuille lue : ${raccourcir(feuille)}`);
    } catch (err) {
      journal.push(
        `Feuille ignorée (${raccourcir(feuille)}) : ${err instanceof Error ? err.message : "erreur"}`
      );
    }
  }

  return depuisCss(page.url, css, html, journal);
}

/** Le classement proprement dit, une fois le CSS rassemblé. */
function depuisCss(source: string, css: string, html: string, journal: string[]): Proposition {
  const comptes = [...recolterCouleurs(css).values()];
  const candidats = comptes.filter((c) => {
    const lum = luminance(c.hex);
    // Les blancs cassés et les gris de bordure noient le classement.
    if (lum > 0.9) return false;
    return saturation(c.hex) >= 0.12 || lum < 0.12;
  });

  const primaire = choisirPrimaire(candidats);
  const accent = choisirAccent(
    candidats.filter((c) => c.hex !== primaire),
    primaire
  );
  const encre = choisirEncre(candidats);
  const polices = recolterPolices(html, css);
  const logos = html ? recolterLogos(html, source) : [];

  journal.push(`${comptes.length} couleurs relevées, ${candidats.length} retenues.`);
  if (!primaire) journal.push("Aucune couleur d'action convaincante : à saisir à la main.");
  if (!accent) journal.push("Aucun accent franc trouvé : à saisir à la main.");
  if (!polices.titre) journal.push("Aucune police identifiée : à choisir à la main.");
  if (html && logos.length === 0) journal.push("Aucun logotype repéré dans la page.");

  return {
    source,
    couleurs: { primaire, accent, encre },
    polices,
    logos,
    palette: [...candidats].sort((a, b) => b.poids - a.poids).slice(0, 24),
    journal,
  };
}

function raccourcir(url: string): string {
  return url.length > 70 ? `${url.slice(0, 67)}…` : url;
}

export { UrlRefusee };
