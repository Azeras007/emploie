import "server-only";
import { contraste, estHex, hexToRgb, luminance, rgbToHex } from "./couleurs";
import { lireRegles, lireVariables, resoudre, type Regle } from "./cssRegles";
import { recupererTexte, UrlRefusee } from "./reseau";

/**
 * Aspiration de charte : lire le site d'une enseigne et en déduire un thème.
 *
 * C'est le geste commercial du produit. Coller une adresse et obtenir en dix
 * secondes une application aux couleurs du prospect vaut mieux que n'importe
 * quelle capture d'écran de démonstration.
 *
 * La méthode va du plus sûr au moins sûr, et s'arrête au premier résultat :
 *
 *   1. **Le rôle.** La couleur de fond des boutons du site est la couleur des
 *      boutons — pas besoin de la deviner. De même la couleur du texte du
 *      corps, celle des liens, la police des titres.
 *   2. **La variable nommée.** `--brand-primary`, `--color-accent` : une
 *      déclaration d'intention, qui vaut mieux qu'un comptage.
 *   3. **La fréquence.** En dernier recours, la nuance franche la plus
 *      employée.
 *
 * Chaque valeur retenue sait d'où elle vient, et le dit à l'opérateur : une
 * proposition qu'on ne peut pas juger ne sert à rien.
 *
 * Rien n'est appliqué automatiquement. Une charte devinée à 80 % puis retouchée
 * reste dix fois plus rapide qu'une charte saisie à la main.
 */

export interface Trouvaille {
  valeur: string;
  origine: string;
}

export interface Proposition {
  source: string;
  couleurs: {
    primaire: Trouvaille | null;
    accent: Trouvaille | null;
    retenu: Trouvaille | null;
    encre: Trouvaille | null;
  };
  polices: {
    titre: Trouvaille | null;
    texte: Trouvaille | null;
    /** Familles absentes de Google Fonts : le site les héberge lui-même. */
    hebergees: string[];
  };
  rayons: { champ: number | null; carte: number | null };
  logos: { url: string; origine: string }[];
  /** Les couleurs les plus employées, pour que l'opérateur puisse choisir autrement. */
  palette: { hex: string; poids: number; origine: string }[];
  /** Ce que l'analyse a compris, en clair. */
  journal: string[];
}

/* ------------------------------------------------------------------ *
 * Couleurs : mesures élémentaires
 * ------------------------------------------------------------------ */

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

/** La première couleur d'une valeur CSS, quelle que soit sa notation. */
function couleurDe(valeur: string): string | null {
  const brut = valeur.trim();
  // Un dégradé porte plusieurs couleurs : la première est la dominante.
  const hex = brut.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hex) return normaliser(hex[0]);
  const rgb = brut.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) {
    // Un fond entièrement transparent ne dit rien de la charte.
    const alpha = brut.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/i);
    if (alpha && Number(alpha[1]) < 0.3) return null;
    return rgbToHex({ r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) });
  }
  const nomme = COULEURS_NOMMEES[brut.toLowerCase()];
  return nomme ?? null;
}

/** Les seuls noms CSS qu'on rencontre vraiment dans une charte. */
const COULEURS_NOMMEES: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  navy: "#000080",
  gray: "#808080",
  grey: "#808080",
};

/* ------------------------------------------------------------------ *
 * Sélecteurs : à quoi sert une règle
 * ------------------------------------------------------------------ */

/**
 * Les états écartés.
 *
 * Une règle `.btn:hover` déclare la couleur du survol. La retenir donnerait
 * des boutons de la couleur qu'ils prennent sous la souris — c'est le genre
 * de décalage d'un ton qui fait dire « ça ne ressemble pas tout à fait ».
 */
/**
 * Les bibliothèques et widgets tiers.
 *
 * Un bandeau cookies, un chat, un lecteur de cartes : leurs feuilles de style
 * sont chargées par le site sans être sa charte. Le vert relevé au premier
 * essai sur jules.com — #004538 — venait du bouton « Tout accepter » de
 * Didomi, pas de la marque, alors que ses vrais boutons sont noirs. Leurs
 * sélecteurs et leurs domaines sont donc écartés.
 */
const TIERS =
  /(didomi|onetrust|ot-sdk|axeptio|tarteaucitron|klaro|usercentrics|trustarc|cookiebot|cookie-?consent|iubenda|quantcast|sourcepoint|zendesk|intercom|drift|crisp|hotjar|trustpilot|paypal|klarna|actito|recaptcha|algolia|swiper|slick|fancybox|mapbox|leaflet|mailchimp|hubspot)/i;

const ETAT = /:(hover|focus|active|visited|disabled|checked|target|focus-within|focus-visible)\b/i;

/** Les variantes de boutons : secondaire, fantôme, danger… ne sont pas la marque. */
const VARIANTE =
  /(secondary|secondaire|outline|ghost|link|danger|error|warning|success|light|white|clear|text|tertiary|inverse|disabled)/i;

const dernierSimple = (selecteur: string): string => {
  const morceaux = selecteur.split(/[\s>+~]+/).filter(Boolean);
  return (morceaux[morceaux.length - 1] ?? "").toLowerCase();
};

function estCorps(selecteur: string): boolean {
  const s = selecteur.trim().toLowerCase();
  return s === "html" || s === "body" || s === ":root" || /^body[.#\[]/.test(s);
}

function estTitre(selecteur: string): boolean {
  const dernier = dernierSimple(selecteur);
  if (/^h[1-3]$/.test(dernier)) return true;
  return /(^|[.#-])(title|titre|heading|headline)([-_a-z0-9]*)?$/i.test(dernier);
}

function estBouton(selecteur: string): boolean {
  const dernier = dernierSimple(selecteur);
  if (VARIANTE.test(dernier)) return false;
  if (dernier === "button" || dernier === 'input[type="submit"]') return true;
  return /^\.(btn|button|cta|bouton)([-_][a-z0-9]*)?$/i.test(dernier);
}

function estLien(selecteur: string): boolean {
  return dernierSimple(selecteur) === "a";
}

function estChamp(selecteur: string): boolean {
  const dernier = dernierSimple(selecteur);
  if (["input", "textarea", "select"].includes(dernier)) return true;
  return /^\.(input|field|champ|form-control|form-input)([-_][a-z0-9]*)?$/i.test(dernier);
}

function estCarte(selecteur: string): boolean {
  return /^\.(card|carte|panel|panneau|tile|box)([-_][a-z0-9]*)?$/i.test(dernierSimple(selecteur));
}

/* ------------------------------------------------------------------ *
 * Lecture par rôle
 * ------------------------------------------------------------------ */

/**
 * Un candidat pour un rôle, avec ce qui le recommande.
 *
 * Garder simplement la dernière règle rencontrée — le comportement de la
 * cascade quand les spécificités s'équivalent — donnait la couleur du dernier
 * widget chargé. On collecte donc tous les candidats et on choisit le mieux
 * placé : `.btn-primary` l'emporte sur `.btn`, et tout l'emporte sur un
 * sélecteur de bibliothèque tierce.
 */
interface Candidat<T> {
  valeur: T;
  poids: number;
  origine: string;
}

function meilleur<T>(candidats: Candidat<T>[]): Candidat<T> | null {
  if (candidats.length === 0) return null;
  return [...candidats].sort((a, b) => b.poids - a.poids)[0];
}

/** Ce qui recommande un sélecteur pour désigner l'action principale. */
function poidsSelecteur(selecteur: string, rang: number): number {
  let poids = 10;
  if (TIERS.test(selecteur)) poids -= 60;
  if (/(primary|primaire|principal|main|cta)/i.test(selecteur)) poids += 30;
  const simples = selecteur.split(/[\s>+~]+/).filter(Boolean).length;
  if (simples === 1) poids += 10;
  else if (simples > 3) poids -= 15;
  // Départage : à mérite égal, la règle la plus tardive l'emporte, comme la
  // cascade le ferait.
  return poids + rang / 100000;
}

interface Roles {
  boutonFond: Candidat<string> | null;
  boutonTexte: Candidat<string> | null;
  boutonRayon: number | null;
  corpsTexte: Candidat<string> | null;
  corpsFond: string | null;
  corpsPolice: Candidat<string> | null;
  titrePolice: Candidat<string> | null;
  lienCouleur: Candidat<string> | null;
  champRayon: number | null;
  carteRayon: number | null;
  policesHebergees: Set<string>;
}

function lireRoles(regles: Regle[], variables: Map<string, string>): Roles {
  const boutonFond: Candidat<string>[] = [];
  const boutonTexte: Candidat<string>[] = [];
  const corpsTexte: Candidat<string>[] = [];
  const corpsPolice: Candidat<string>[] = [];
  const titrePolice: Candidat<string>[] = [];
  const lienCouleur: Candidat<string>[] = [];
  const policesHebergees = new Set<string>();
  let corpsFond: string | null = null;
  let boutonRayon: number | null = null;
  let champRayon: number | null = null;
  let carteRayon: number | null = null;

  const valeur = (regle: Regle, propriete: string): string | null => {
    const brute = regle.declarations.get(propriete);
    return brute === undefined ? null : resoudre(brute, variables);
  };

  regles.forEach((regle, rang) => {
    if (regle.fontFace) {
      const famille = premiereFamille(regle.declarations.get("font-family") ?? "");
      if (famille) policesHebergees.add(famille);
      return;
    }

    for (const selecteur of regle.selecteurs) {
      if (ETAT.test(selecteur)) continue;
      const poids = poidsSelecteur(selecteur, rang);
      // Un sélecteur de bibliothèque tierce ne dit rien de la charte.
      if (poids < 0) continue;
      const court = raccourcir(selecteur, 40);

      if (estBouton(selecteur)) {
        const fond = valeur(regle, "background-color") ?? valeur(regle, "background") ?? null;
        const couleurFond = fond ? couleurDe(fond) : null;
        // Un bouton blanc ou transparent est une variante déguisée, pas la
        // couleur d'action de la marque.
        if (couleurFond && luminance(couleurFond) < 0.9) {
          boutonFond.push({ valeur: couleurFond, poids, origine: `fond de « ${court} »` });
        }
        const texte = valeur(regle, "color");
        const couleurTexte = texte ? couleurDe(texte) : null;
        if (couleurTexte) boutonTexte.push({ valeur: couleurTexte, poids, origine: court });
        const rayon = enPixels(valeur(regle, "border-radius"));
        if (rayon !== null) boutonRayon = rayon;
      }

      if (estCorps(selecteur)) {
        const texte = valeur(regle, "color");
        const couleur = texte ? couleurDe(texte) : null;
        if (couleur) corpsTexte.push({ valeur: couleur, poids, origine: court });
        const fond = valeur(regle, "background-color") ?? valeur(regle, "background");
        if (fond) corpsFond = couleurDe(fond) ?? corpsFond;
        const police = premiereFamille(valeur(regle, "font-family") ?? "");
        if (police) corpsPolice.push({ valeur: police, poids, origine: court });
      }

      if (estTitre(selecteur)) {
        const police = premiereFamille(valeur(regle, "font-family") ?? "");
        if (police) {
          // Un h1 nu vaut mieux qu'une classe qui contient « title » : la
          // seconde peut désigner n'importe quel encart.
          const bonus = /^h[1-3]$/.test(dernierSimple(selecteur)) ? 15 : 0;
          titrePolice.push({ valeur: police, poids: poids + bonus, origine: court });
        }
      }

      if (estLien(selecteur)) {
        const couleur = valeur(regle, "color");
        const hex = couleur ? couleurDe(couleur) : null;
        if (hex) lienCouleur.push({ valeur: hex, poids, origine: court });
      }

      if (estChamp(selecteur)) {
        const rayon = enPixels(valeur(regle, "border-radius"));
        if (rayon !== null) champRayon = rayon;
      }

      if (estCarte(selecteur)) {
        const rayon = enPixels(valeur(regle, "border-radius"));
        if (rayon !== null) carteRayon = rayon;
      }
    }
  });

  return {
    boutonFond: meilleur(boutonFond),
    boutonTexte: meilleur(boutonTexte),
    boutonRayon,
    corpsTexte: meilleur(corpsTexte),
    corpsFond,
    corpsPolice: meilleur(corpsPolice),
    titrePolice: meilleur(titrePolice),
    lienCouleur: meilleur(lienCouleur),
    champRayon,
    carteRayon,
    policesHebergees,
  };
}

/** « 0.75rem 0.75rem 0 0 » → 12. Les formes en pilule sont ramenées au maximum. */
function enPixels(valeur: string | null): number | null {
  if (!valeur) return null;
  const premier = valeur.trim().split(/[\s/]+/)[0];
  const m = premier.match(/^([\d.]+)(px|rem|em|%)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unite = (m[2] ?? "px").toLowerCase();
  if (unite === "%") return n >= 50 ? 48 : null;
  const px = unite === "rem" || unite === "em" ? n * 16 : n;
  if (px < 0) return null;
  return Math.min(48, Math.round(px));
}

/* ------------------------------------------------------------------ *
 * Les boutons tels qu'ils sont réellement peints
 * ------------------------------------------------------------------ */

/**
 * Valeurs par défaut des cadriciels, qui ne sont jamais une marque.
 *
 * Armand Thiéry sert du Bootstrap 3 : son `.btn-primary` vaut #337ab7, le bleu
 * livré avec le cadriciel — et la règle n'est jamais employée, leurs vrais
 * boutons étant noirs. Lire la feuille sans regarder la page donne donc une
 * charte qui n'existe nulle part.
 */
const DEFAUTS_CADRICIEL = new Set([
  "#337ab7", "#007bff", "#0d6efd", "#0b5ed7", // Bootstrap 3, 4, 5
  "#5cb85c", "#28a745", "#198754",
  "#d9534f", "#dc3545", "#bb2d3b",
  "#f0ad4e", "#ffc107",
  "#5bc0de", "#17a2b8", "#0dcaf0",
  "#3490dc", "#3b82f6", "#6366f1", // Tailwind et Laravel, versions par défaut
]);

/**
 * La couleur de fond des boutons tels que la page les peint.
 *
 * Plutôt que de lire les règles isolément, on refait ce que fait le
 * navigateur : on relève les classes que portent réellement les boutons du
 * document, on résout leur fond selon l'ordre des règles — la dernière
 * l'emporte — et on compte. La couleur qui habille le plus de boutons est la
 * couleur des boutons.
 *
 * C'est la seule méthode qui trouve le noir d'Armand Thiéry, posé par une
 * classe utilitaire nommée « background-color4 » : aucun classement fondé sur
 * le nom des sélecteurs ne pouvait la deviner.
 */
function boutonsDeLaPage(
  html: string,
  regles: Regle[],
  variables: Map<string, string>
): Candidat<string> | null {
  if (!html) return null;

  // Index : classe ou élément -> dernière couleur de fond déclarée, et son rang.
  const fonds = new Map<string, { hex: string; rang: number }>();

  regles.forEach((regle, rang) => {
    if (regle.fontFace) return;
    const brute =
      regle.declarations.get("background-color") ?? regle.declarations.get("background");
    if (!brute) return;
    const hex = couleurDe(resoudre(brute, variables));
    if (!hex) return;

    for (const selecteur of regle.selecteurs) {
      if (ETAT.test(selecteur) || TIERS.test(selecteur)) continue;
      // Sélecteurs simples uniquement : « .btn », « button ». Une règle
      // contextuelle (« .panier .btn ») ne s'applique pas partout, et la
      // prendre pour générale fausserait le compte.
      const m = selecteur.trim().match(/^(\.[a-z0-9_-]+|[a-z]+)$/i);
      if (!m) continue;
      fonds.set(m[1].toLowerCase(), { hex, rang });
    }
  });

  if (fonds.size === 0) return null;

  const comptes = new Map<string, number>();
  let boutonsVus = 0;

  for (const m of html.matchAll(/<(a|button)\b[^>]*>/gi)) {
    const balise = m[0];
    if (TIERS.test(balise)) continue;
    const classes = (balise.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] ?? "")
      .split(/\s+/)
      .filter(Boolean);
    const element = m[1].toLowerCase();
    // Seulement ce qui se présente comme un bouton : un lien de menu n'a pas
    // de fond de marque.
    const estUnBouton =
      element === "button" || classes.some((c) => /^(btn|button|cta|bouton)/i.test(c));
    if (!estUnBouton) continue;
    if (classes.some((c) => VARIANTE.test(c))) continue;

    let gagnante: { hex: string; rang: number } | null = null;
    for (const cle of [element, ...classes.map((c) => `.${c.toLowerCase()}`)]) {
      const trouvee = fonds.get(cle);
      if (trouvee && (!gagnante || trouvee.rang > gagnante.rang)) gagnante = trouvee;
    }
    if (!gagnante) continue;
    if (luminance(gagnante.hex) > 0.9) continue;

    boutonsVus += 1;
    comptes.set(gagnante.hex, (comptes.get(gagnante.hex) ?? 0) + 1);
  }

  if (boutonsVus === 0) return null;
  const [hex, n] = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    valeur: hex,
    poids: 100,
    origine: `fond de ${n} bouton${n > 1 ? "s" : ""} de la page`,
  };
}

/* ------------------------------------------------------------------ *
 * Polices
 * ------------------------------------------------------------------ */

const GENERIQUES = new Set([
  "inherit", "initial", "unset", "revert", "serif", "sans-serif", "monospace",
  "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace",
  "ui-rounded", "-apple-system", "blinkmacsystemfont", "segoe ui", "arial",
  "helvetica", "helvetica neue", "sans", "none", "emoji", "math", "fangsong",
]);

function premiereFamille(valeur: string): string | null {
  const premiere = valeur.split(",")[0]?.trim().replace(/["']/g, "");
  if (!premiere) return null;
  if (premiere.startsWith("--") || premiere.includes("(")) return null;
  if (GENERIQUES.has(premiere.toLowerCase())) return null;
  if (premiere.length > 48) return null;
  return premiere;
}

/**
 * Une famille est-elle servie par Google Fonts ?
 *
 * L'application charge ses polices depuis Google. Proposer « Kiabi Sans »,
 * qui n'y est pas, produirait une requête en échec et un rendu dans la police
 * système — sans que personne comprenne pourquoi le résultat ne ressemble pas
 * au site. Mieux vaut le savoir et le dire.
 *
 * Google répond 400 pour une famille inconnue, 200 sinon.
 */
async function surGoogleFonts(famille: string): Promise<boolean> {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(famille).replace(
    /%20/g,
    "+"
  )}:wght@400`;
  try {
    await recupererTexte(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Une famille de remplacement, quand celle du site n'est pas distribuable.
 *
 * La table est courte et assumée : ce sont les polices propriétaires qu'on
 * rencontre réellement dans le commerce de détail. Hors table, on ne devine
 * pas — on laisse le nom en place et on prévient.
 */
const EQUIVALENCES: Record<string, string> = {
  helvetica: "Inter",
  "helvetica neue": "Inter",
  "neue haas": "Inter",
  arial: "Inter",
  graphik: "Inter",
  "sf pro": "Inter",
  circular: "Poppins",
  gotham: "Montserrat",
  "gotham rounded": "Nunito",
  futura: "Jost",
  "century gothic": "Didact Gothic",
  "gill sans": "Lato",
  avenir: "Nunito Sans",
  "avenir next": "Nunito Sans",
  frutiger: "Source Sans 3",
  univers: "Roboto Condensed",
  "proxima nova": "Montserrat",
  "sofia pro": "Poppins",
  brandon: "Josefin Sans",
  "brandon grotesque": "Josefin Sans",
  recoleta: "Fraunces",
  "founders grotesk": "Space Grotesk",
  national: "Archivo",
  apercu: "Work Sans",
  "gt walsheim": "Poppins",
  din: "Barlow",
  "din next": "Barlow",
  "trade gothic": "Oswald",
  interstate: "Archivo",
  "museo sans": "Museo Moderno",
  "akzidenz grotesk": "Inter",
  benton: "Archivo",
  knockout: "Oswald",
  "sackers gothic": "Oswald",
};

/**
 * Ramène un nom de police à sa famille.
 *
 * Les fontes achetées portent leur graisse et leur code de fonderie dans le
 * nom du fichier : « FuturaBTW05-Book », « CenturyGothicW01-Bold ». Chercher
 * ces chaînes telles quelles dans une table d'équivalences ne trouve rien —
 * c'est ce qui arrivait sur gemo.fr, dont toute la charte est en Futura.
 */
export function normaliserFamille(famille: string): string {
  return (
    famille
      .replace(/[_-]+/g, " ")
      // La césure des capitales vient en premier : sans elle, « FuturaBTW05 »
      // n'offre aucune frontière de mot où accrocher les motifs suivants.
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      // Codes de fonderie et de version : W01, W05, BTW05…
      .replace(/\b(bt|itc|ff|lt|mt|ps|url)?w\d{2}\b/gi, " ")
      .replace(/\b(pro|std|com|lt|mt|ot|bt|itc|next|new|neue)\b/gi, " ")
      // Graisses et styles.
      .replace(
        /\b(thin|extralight|ultralight|light|book|regular|roman|normal|text|medium|semibold|demibold|demi|bold|extrabold|ultrabold|black|heavy|italic|oblique|condensed|extended)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

export function equivalenceGoogle(famille: string): string | null {
  const exact = EQUIVALENCES[famille.trim().toLowerCase()];
  if (exact) return exact;
  const normalisee = normaliserFamille(famille);
  if (EQUIVALENCES[normalisee]) return EQUIVALENCES[normalisee];
  // Dernier essai : le premier mot. « Futura Book » et « FuturaBTW05 » mènent
  // tous deux à « futura ».
  const premier = normalisee.split(" ")[0];
  return premier && premier !== normalisee ? (EQUIVALENCES[premier] ?? null) : null;
}

/* ------------------------------------------------------------------ *
 * Comptage — le dernier recours
 * ------------------------------------------------------------------ */

const NOMS_MARQUE =
  /(^|-)(brand|primary|principal|primaire|main|marque|accent|secondary|secondaire|cta|highlight)(-|$)/i;
const NOMS_SUCCES = /(^|-)(success|succes|valid|positive|green|vert)(-|$)/i;

interface Compte {
  hex: string;
  poids: number;
  origine: string;
}

function recolterCouleurs(regles: Regle[], variables: Map<string, string>): Map<string, Compte> {
  const comptes = new Map<string, Compte>();

  const ajouter = (hex: string | null, poids: number, origine: string) => {
    if (!hex || !estHex(hex)) return;
    const cle = normaliser(hex);
    const existant = comptes.get(cle);
    if (existant) {
      existant.poids += poids;
      if (origine.startsWith("variable") && !existant.origine.startsWith("variable")) {
        existant.origine = origine;
      }
    } else {
      comptes.set(cle, { hex: cle, poids, origine });
    }
  };

  // Les variables nommées d'abord : ce sont les déclarations d'intention.
  for (const [nom, brute] of variables) {
    const hex = couleurDe(resoudre(brute, variables));
    if (!hex) continue;
    ajouter(hex, NOMS_MARQUE.test(nom) ? 60 : 6, `variable ${nom}`);
  }

  for (const regle of regles) {
    if (regle.fontFace) continue;
    for (const [propriete, brute] of regle.declarations) {
      if (propriete.startsWith("--")) continue;
      if (!/color|background|border|fill|stroke|shadow|outline/.test(propriete)) continue;
      ajouter(couleurDe(resoudre(brute, variables)), 1, "déclaration");
    }
  }

  return comptes;
}

function choisirParFrequence(candidats: Compte[]): string | null {
  const utilisables = candidats.filter(
    (c) => contraste(c.hex, "#ffffff") >= 4.5 || contraste(c.hex, "#131314") >= 4.5
  );
  if (utilisables.length === 0) return null;
  const note = (c: Compte) => c.poids * (0.4 + saturation(c.hex)) * (0.5 + (1 - luminance(c.hex)));
  return [...utilisables].sort((a, b) => note(b) - note(a))[0].hex;
}

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

/* ------------------------------------------------------------------ *
 * Logotypes
 * ------------------------------------------------------------------ */

/**
 * Les logotypes repérés, du plus probable au moins probable.
 *
 * L'ordre compte : l'opérateur clique presque toujours le premier. Une image
 * d'en-tête dont la classe dit « logo » l'emporte sur une icône d'onglet de
 * 32 pixels, et un SVG l'emporte sur un PNG — il s'imprimera sur une affiche.
 */
function recolterLogos(html: string, base: string): { url: string; origine: string }[] {
  const trouves: { url: string; origine: string; note: number }[] = [];

  const ajouter = (href: string | undefined, origine: string, note: number) => {
    if (!href) return;
    try {
      const absolue = new URL(href, base).href;
      if (!/^https?:/i.test(absolue)) return;
      if (trouves.some((t) => t.url === absolue)) return;
      const bonus = /\.svg(\?|$)/i.test(absolue) ? 20 : 0;
      trouves.push({ url: absolue, origine, note: note + bonus });
    } catch {
      // Adresse illisible : ce n'était qu'une suggestion.
    }
  };

  // L'en-tête d'abord : c'est là qu'un logotype se trouve.
  const entete = html.match(/<header\b[\s\S]{0,20000}?<\/header>/i)?.[0] ?? "";
  for (const zone of [entete, html]) {
    if (!zone) continue;
    const dansEntete = zone === entete;
    for (const m of zone.matchAll(/<img\b[^>]*>/gi)) {
      const balise = m[0];
      if (!/logo|brand|marque/i.test(balise)) continue;
      ajouter(
        balise.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1],
        dansEntete ? "en-tête du site" : "page",
        dansEntete ? 100 : 60
      );
    }
  }

  const og = html.match(
    /<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i
  );
  ajouter(og?.[1], "image de partage", 40);

  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*icon[^"']*["'][^>]*>/gi)) {
    ajouter(m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1], "icône d'onglet", 10);
  }

  return trouves
    .sort((a, b) => b.note - a.note)
    .slice(0, 8)
    .map(({ url, origine }) => ({ url, origine }));
}

/* ------------------------------------------------------------------ *
 * Analyse
 * ------------------------------------------------------------------ */

const FEUILLES_MAX = 8;

export async function analyserSite(adresse: string): Promise<Proposition> {
  const journal: string[] = [];
  const page = await recupererTexte(adresse);
  journal.push(`Page reçue : ${page.url}`);

  if (page.typeMime.includes("css") || /\.css(\?|$)/i.test(page.url)) {
    journal.push("Feuille de style analysée directement.");
    return depuisCss(page.url, page.contenu, "", journal);
  }

  const html = page.contenu;
  let css = "";

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
      if (absolue.includes("fonts.googleapis.com")) continue;
      // Bandeau cookies, chat, carte : chargés par le site sans être sa charte.
      // Les lire coûterait deux requêtes pour polluer le classement.
      if (TIERS.test(absolue)) {
        journal.push(`Feuille tierce ignorée : ${raccourcir(absolue)}`);
        continue;
      }
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

async function depuisCss(
  source: string,
  css: string,
  html: string,
  journal: string[]
): Promise<Proposition> {
  const regles = lireRegles(css);
  const variables = lireVariables(regles);
  const roles = lireRoles(regles, variables);
  journal.push(`${regles.length} règles lues, ${variables.size} variables CSS.`);

  const comptes = [...recolterCouleurs(regles, variables).values()];
  const candidats = comptes.filter((c) => {
    const lum = luminance(c.hex);
    if (lum > 0.9) return false;
    return saturation(c.hex) >= 0.12 || lum < 0.12;
  });

  /* ---- couleurs ---- */

  const variableNommee = (test: RegExp): Trouvaille | null => {
    for (const [nom, brute] of variables) {
      if (!test.test(nom)) continue;
      const hex = couleurDe(resoudre(brute, variables));
      if (hex) return { valeur: hex, origine: `variable ${nom}` };
    }
    return null;
  };

  const peints = boutonsDeLaPage(html, regles, variables);
  const parRegle =
    roles.boutonFond && !DEFAUTS_CADRICIEL.has(roles.boutonFond.valeur)
      ? roles.boutonFond
      : null;

  if (roles.boutonFond && !parRegle) {
    journal.push(
      `« ${roles.boutonFond.valeur} » écarté : c'est une valeur par défaut de cadriciel, pas une couleur de marque.`
    );
  }

  let primaire: Trouvaille | null = null;
  if (peints) {
    primaire = { valeur: peints.valeur, origine: peints.origine };
  } else if (parRegle) {
    primaire = { valeur: parRegle.valeur, origine: parRegle.origine };
  } else {
    primaire = variableNommee(NOMS_MARQUE);
    if (!primaire) {
      const parFrequence = choisirParFrequence(candidats);
      if (parFrequence) primaire = { valeur: parFrequence, origine: "couleur la plus employée" };
    }
  }

  let accent: Trouvaille | null = null;
  const primaireHex = primaire?.valeur ?? null;
  const lien = roles.lienCouleur?.valeur ?? null;
  if (lien && saturation(lien) >= 0.3 && (!primaireHex || ecartTeinte(lien, primaireHex) >= 25)) {
    accent = { valeur: lien, origine: "couleur des liens du site" };
  } else {
    const parFrequence = choisirAccent(
      candidats.filter((c) => c.hex !== primaireHex),
      primaireHex
    );
    if (parFrequence) accent = { valeur: parFrequence, origine: "nuance vive la plus employée" };
  }

  const encre: Trouvaille | null = roles.corpsTexte
    ? { valeur: roles.corpsTexte.valeur, origine: "couleur du texte du site" }
    : (() => {
        const sombres = candidats.filter((c) => luminance(c.hex) < 0.06);
        if (sombres.length === 0) return null;
        const gagnante = [...sombres].sort((a, b) => b.poids - a.poids)[0].hex;
        return { valeur: gagnante, origine: "nuance sombre la plus employée" };
      })();

  const retenu = variableNommee(NOMS_SUCCES);

  /* ---- polices ---- */

  const titreBrut = roles.titrePolice?.valeur ?? roles.corpsPolice?.valeur ?? null;
  const texteBrut = roles.corpsPolice?.valeur ?? roles.titrePolice?.valeur ?? null;

  const [titreDispo, texteDispo] = await Promise.all([
    titreBrut ? surGoogleFonts(titreBrut) : Promise.resolve(false),
    texteBrut && texteBrut !== titreBrut ? surGoogleFonts(texteBrut) : Promise.resolve(false),
  ]);

  const hebergees: string[] = [];
  const police = (
    famille: string | null,
    disponible: boolean,
    role: string
  ): Trouvaille | null => {
    if (!famille) return null;
    if (disponible) return { valeur: famille, origine: `${role} du site` };

    const equivalent = equivalenceGoogle(famille);
    if (equivalent) {
      // Une famille de remplacement a été trouvée : le thème ne portera plus le
      // nom d'origine, il n'a donc rien à faire dans la liste des familles
      // qu'on renonce à réclamer.
      journal.push(
        `« ${famille} » n'est pas sur Google Fonts : « ${equivalent} », très proche, est proposée à la place.`
      );
      return { valeur: equivalent, origine: `approchant de « ${famille} »` };
    }

    if (!hebergees.includes(famille)) hebergees.push(famille);
    journal.push(
      `« ${famille} » n'est pas sur Google Fonts : le site l'héberge lui-même. Le nom est conservé — il servira si la police est installée — mais elle ne sera pas réclamée.`
    );
    return { valeur: famille, origine: `${role} du site — non distribuée` };
  };

  const memeFamille = titreBrut === texteBrut;
  const policeTitre = police(titreBrut, titreDispo, "police des titres");
  const policeTexte = memeFamille
    ? policeTitre
      ? { ...policeTitre, origine: "même famille que les titres" }
      : null
    : police(texteBrut, texteDispo, "police du texte");

  /* ---- journal ---- */

  if (primaire) journal.push(`Couleur principale : ${primaire.valeur} (${primaire.origine}).`);
  else journal.push("Aucune couleur d'action convaincante : à saisir à la main.");
  if (accent) journal.push(`Accent : ${accent.valeur} (${accent.origine}).`);
  else journal.push("Aucun accent franc trouvé : à saisir à la main.");
  if (roles.corpsFond && luminance(roles.corpsFond) < 0.85) {
    journal.push(
      `Le site a un fond sombre (${roles.corpsFond}). L'application reste sur fond clair : ` +
        "ses contrastes sont calculés pour cela."
    );
  }
  if (!policeTitre) journal.push("Aucune police identifiée : à choisir à la main.");

  const logos = html ? recolterLogos(html, source) : [];
  if (html && logos.length === 0) journal.push("Aucun logotype repéré dans la page.");

  return {
    source,
    couleurs: { primaire, accent, retenu, encre },
    polices: { titre: policeTitre, texte: policeTexte, hebergees },
    rayons: {
      champ: roles.champRayon ?? roles.boutonRayon,
      carte: roles.carteRayon,
    },
    logos,
    palette: [...candidats].sort((a, b) => b.poids - a.poids).slice(0, 24),
    journal,
  };
}

function raccourcir(texte: string, longueur = 70): string {
  return texte.length > longueur ? `${texte.slice(0, longueur - 3)}…` : texte;
}

export { UrlRefusee };
