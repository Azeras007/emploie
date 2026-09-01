import {
  assombrir,
  canaux,
  contrasterSur,
  eclaircir,
  estHex,
  luminance,
  melanger,
  teinter,
  texteSur,
} from "./couleurs";

/**
 * Le moteur de thème — ce qui rend l'application vendable en marque blanche.
 *
 * Une enseigne fournit deux couleurs et deux polices. Tout le reste — survols,
 * fonds pâles, textes d'alerte, gris teintés, couleur du texte sur les boutons —
 * est dérivé, en surveillant les contrastes. Habiller un nouveau client tient
 * donc en quelques champs, et aucune charte ne peut produire un écran illisible.
 *
 * Le thème vit en base et sort en variables CSS : le changer ne demande ni
 * recompilation ni redéploiement.
 */

/** Les jetons de couleur consommés par les feuilles de style. */
export type JetonCouleur =
  | "primaire"
  | "primaire-hover"
  | "primaire-pale"
  | "sur-primaire"
  | "corail"
  | "corail-pale"
  | "corail-fonce"
  | "secondaire"
  | "sur-secondaire"
  | "custom1"
  | "custom2"
  | "custom3"
  | "wash"
  | "ink"
  | "paper"
  | "succes"
  | "danger";

export interface Theme {
  /** Le nom de l'enseigne, affiché et repris dans les titres de page. */
  nom: string;
  couleurs: {
    /** Actions, aplats sombres, structure. */
    primaire: string;
    /** Accents, jauges, alertes. */
    accent: string;
    /** Les profils retenus — la seule couleur « positive ». */
    retenu: string;
    /** Le texte courant. */
    encre: string;
  };
  /**
   * Corrections manuelles, par-dessus les valeurs dérivées.
   *
   * La dérivation vise juste dans l'immense majorité des cas ; quand une
   * enseigne tient à une nuance précise, elle se pose ici sans casser le reste.
   */
  ajustements: Partial<Record<JetonCouleur, string>>;
  polices: {
    /** Famille des titres. Doit exister sur Google Fonts. */
    titre: string;
    /** Famille du texte courant. */
    texte: string;
  };
  rayons: {
    /** Rayon des champs de saisie, en pixels. */
    champ: number;
    /** Rayon des cartes et panneaux, en pixels. */
    carte: number;
  };
  logo: {
    /** Chemin du fichier officiel, servi depuis public/. Vide = lettrage. */
    fichier: string;
    /** Le lettrage de repli, quand aucun fichier n'est fourni. */
    mot: string;
    /** Vrai pour composer le lettrage en capitales. */
    capitales: boolean;
  };
}

export const THEME_PAR_DEFAUT: Theme = {
  nom: "Candidatures",
  couleurs: {
    primaire: "#141b34",
    accent: "#ff5c35",
    retenu: "#0f766e",
    encre: "#12141c",
  },
  ajustements: {},
  polices: { titre: "Figtree", texte: "Inter" },
  rayons: { champ: 12, carte: 16 },
  logo: { fichier: "", mot: "Candidatures", capitales: false },
};

/* ------------------------------------------------------------------ *
 * Dérivation
 * ------------------------------------------------------------------ */

/**
 * Déplie les quatre couleurs de marque en la palette complète.
 *
 * Chaque dérivation répond à une question précise :
 *
 * - **survol** — éclaircir un fond sombre, assombrir un fond clair ; l'inverse
 *   donne un bouton qui « disparaît » au passage de la souris ;
 * - **sur-primaire** — blanc ou encre, celui des deux qui se lit réellement sur
 *   l'aplat. Sans ce calcul, une enseigne au jaune vif obtient des boutons
 *   blancs sur jaune ;
 * - **corail-fonce** — l'accent poussé jusqu'à 4,5:1 sur blanc, pour le texte
 *   des alertes. Les accents de marque plafonnent presque toujours vers 3:1 ;
 * - **gris** — teintés de 3 % de la couleur primaire, ce qui suffit à ce que
 *   l'interface paraisse dessinée pour l'enseigne plutôt que posée dessus.
 */
export function derivePalette(theme: Theme): Record<JetonCouleur, string> {
  const { primaire, accent, retenu, encre } = theme.couleurs;
  const sombre = luminance(primaire) < 0.5;

  const base: Record<JetonCouleur, string> = {
    primaire,
    "primaire-hover": sombre ? eclaircir(primaire, 0.2) : assombrir(primaire, 0.14),
    "primaire-pale": melanger(primaire, "#ffffff", 0.92),
    "sur-primaire": texteSur(primaire, encre),

    corail: accent,
    "corail-pale": melanger(accent, "#ffffff", 0.9),
    "corail-fonce": contrasterSur(accent, "#ffffff", 4.5),

    secondaire: retenu,
    "sur-secondaire": texteSur(retenu, encre),

    custom1: teinter("#4c4c54", primaire),
    custom2: teinter("#87878c", primaire),
    custom3: teinter("#e2e2e4", primaire),
    wash: teinter("#f8f8f8", primaire, 0.02),
    ink: encre,
    paper: "#ffffff",

    succes: "#177d35",
    danger: "#c8102e",
  };

  // Les corrections manuelles passent en dernier, et seulement si elles sont
  // valides : une saisie en cours ne doit pas casser l'aperçu.
  for (const [jeton, valeur] of Object.entries(theme.ajustements ?? {})) {
    if (valeur && estHex(valeur)) base[jeton as JetonCouleur] = valeur;
  }
  return base;
}

/* ------------------------------------------------------------------ *
 * Sortie CSS
 * ------------------------------------------------------------------ */

/**
 * Les variables CSS du thème, à injecter dans le document.
 *
 * Les couleurs sortent en canaux séparés (« 20 27 52 ») et non en hex : c'est
 * la seule forme qui laisse Tailwind composer `bg-primaire/10`. Le jour où l'on
 * écrirait `--primaire: #141b34`, toutes les opacités du projet tomberaient en
 * silence.
 */
export function themeCss(theme: Theme): string {
  const palette = derivePalette(theme);
  const lignes = Object.entries(palette).map(([jeton, hex]) => `  --${jeton}: ${canaux(hex)};`);
  lignes.push(`  --rayon-champ: ${Math.max(0, theme.rayons.champ)}px;`);
  lignes.push(`  --rayon-carte: ${Math.max(0, theme.rayons.carte)}px;`);
  lignes.push(`  --police-titre: ${cssFamille(theme.polices.titre)};`);
  lignes.push(`  --police-texte: ${cssFamille(theme.polices.texte)};`);
  return `:root{\n${lignes.join("\n")}\n}`;
}

/** La pile de repli d'une famille : la police du client, puis celles du système. */
function cssFamille(nom: string): string {
  const propre = (nom || "").trim().replace(/["']/g, "");
  const repli = "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
  return propre ? `"${propre}", ${repli}` : repli;
}

/**
 * L'adresse Google Fonts des deux familles du thème.
 *
 * Les graisses sont fixées à ce dont l'interface se sert réellement : 400 à 800
 * pour les titres, 400 à 700 pour le texte. Demander toute la plage
 * multiplierait le poids téléchargé sans que rien ne l'utilise.
 */
export function googleFontsUrl(theme: Theme): string | null {
  const familles: string[] = [];
  const ajouter = (nom: string, graisses: string) => {
    const propre = (nom || "").trim();
    if (!propre) return;
    const encode = propre.replace(/\s+/g, "+");
    const entree = `family=${encode}:wght@${graisses}`;
    if (!familles.includes(entree)) familles.push(entree);
  };
  ajouter(theme.polices.titre, "400;600;700;800");
  ajouter(theme.polices.texte, "400;500;600;700");
  if (familles.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${familles.join("&")}&display=swap`;
}

/** Fusionne un thème stocké avec les valeurs par défaut, champ par champ. */
export function normaliserTheme(brut: Partial<Theme> | null | undefined): Theme {
  const d = THEME_PAR_DEFAUT;
  if (!brut) return structuredClone(d);
  const couleur = (v: unknown, repli: string) =>
    typeof v === "string" && estHex(v) ? v : repli;
  return {
    nom: typeof brut.nom === "string" && brut.nom.trim() ? brut.nom.trim() : d.nom,
    couleurs: {
      primaire: couleur(brut.couleurs?.primaire, d.couleurs.primaire),
      accent: couleur(brut.couleurs?.accent, d.couleurs.accent),
      retenu: couleur(brut.couleurs?.retenu, d.couleurs.retenu),
      encre: couleur(brut.couleurs?.encre, d.couleurs.encre),
    },
    ajustements: brut.ajustements ?? {},
    polices: {
      titre: brut.polices?.titre?.trim() || d.polices.titre,
      texte: brut.polices?.texte?.trim() || d.polices.texte,
    },
    rayons: {
      champ: Number.isFinite(brut.rayons?.champ) ? Number(brut.rayons?.champ) : d.rayons.champ,
      carte: Number.isFinite(brut.rayons?.carte) ? Number(brut.rayons?.carte) : d.rayons.carte,
    },
    logo: {
      fichier: brut.logo?.fichier?.trim() || "",
      mot: brut.logo?.mot?.trim() || brut.nom?.trim() || d.logo.mot,
      capitales: Boolean(brut.logo?.capitales),
    },
  };
}
