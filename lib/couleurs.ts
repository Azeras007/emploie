/**
 * Arithmétique des couleurs — la base du moteur de thème.
 *
 * Une enseigne donne une couleur, parfois deux. Il en faut une douzaine pour
 * habiller une application. Tout le reste est donc calculé ici, et calculé en
 * surveillant les contrastes : la charte d'un client ne doit jamais pouvoir
 * produire un écran illisible.
 *
 * Les luminances suivent WCAG 2.1 — c'est la mesure qui décide si un texte
 * blanc tient sur un bouton, et elle ne se devine pas à l'œil : #ffda00 et
 * #2ab3ab se ressemblent en « vivacité » et se comportent à l'opposé.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp = (n: number, min = 0, max = 255) => Math.min(max, Math.max(min, n));

export function hexToRgb(hex: string): Rgb {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) => clamp(Math.round(n)).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Les trois canaux séparés par des espaces — la forme attendue par `rgb(var(--x) / 50%)`. */
export function canaux(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

/** Vrai si la chaîne est un hex à 3 ou 6 chiffres. */
export function estHex(value: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

/** Luminance relative WCAG : 0 pour le noir, 1 pour le blanc. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Rapport de contraste WCAG entre deux couleurs : de 1 (identiques) à 21. */
export function contraste(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [clair, sombre] = la >= lb ? [la, lb] : [lb, la];
  return (clair + 0.05) / (sombre + 0.05);
}

/** Mélange linéaire : `ratio` = 0 rend `a`, 1 rend `b`. */
export function melanger(a: string, b: string, ratio: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const t = Math.min(1, Math.max(0, ratio));
  return rgbToHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
  });
}

export const eclaircir = (hex: string, ratio: number) => melanger(hex, "#ffffff", ratio);
export const assombrir = (hex: string, ratio: number) => melanger(hex, "#000000", ratio);

/**
 * Le texte à poser sur un aplat : blanc ou encre, celui des deux qui se lit.
 *
 * C'est ce petit calcul qui évite l'accident classique de la marque blanche —
 * un client au jaune vif, des boutons blancs sur jaune, illisibles.
 */
export function texteSur(fond: string, encre = "#131314"): string {
  return contraste(fond, "#ffffff") >= contraste(fond, encre) ? "#ffffff" : encre;
}

/**
 * Assombrit (ou éclaircit) une couleur jusqu'à ce qu'elle se détache assez du
 * fond. Sert aux textes d'accent : le corail d'une marque plafonne souvent à
 * 3:1 sur blanc, insuffisant pour du texte de 13 px.
 *
 * On avance par pas de 4 %, au plus 25 fois : au-delà on a atteint le noir ou
 * le blanc, et le mieux disponible est rendu tel quel.
 */
export function contrasterSur(couleur: string, fond: string, cible = 4.5): string {
  if (contraste(couleur, fond) >= cible) return couleur;
  const versLeSombre = luminance(fond) > 0.5;
  let sortie = couleur;
  for (let i = 1; i <= 25; i++) {
    sortie = versLeSombre ? assombrir(couleur, i * 0.04) : eclaircir(couleur, i * 0.04);
    if (contraste(sortie, fond) >= cible) return sortie;
  }
  return sortie;
}

/**
 * Teinte un gris neutre d'un soupçon de la couleur de marque.
 *
 * Trois pour cent suffisent : c'est invisible isolément, et c'est ce qui fait
 * qu'une interface paraît dessinée pour l'enseigne plutôt que posée dessus.
 */
export function teinter(gris: string, marque: string, ratio = 0.03): string {
  return melanger(gris, marque, ratio);
}
