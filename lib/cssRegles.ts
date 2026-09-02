import "server-only";

/**
 * Un lecteur de CSS, juste assez fin pour savoir à quoi sert une couleur.
 *
 * L'analyse comptait jusqu'ici les couleurs du fichier sans regarder où elles
 * apparaissaient. C'est une méthode qui trouve la couleur la plus *fréquente*,
 * pas la couleur des *boutons* — et une charte reprise de travers se voit
 * immédiatement.
 *
 * Ce module découpe la feuille en règles : les sélecteurs d'un côté, les
 * déclarations de l'autre. On peut alors demander « quelle est la couleur de
 * fond de `.btn` » plutôt que « quelle couleur revient le plus ».
 *
 * Ce n'est pas un analyseur CSS complet, et il n'a pas à l'être : il ne calcule
 * ni spécificité ni cascade. Il rend les règles dans l'ordre du fichier, et
 * l'appelant garde la dernière valeur vue — ce qui est le comportement de la
 * cascade dans le cas courant où les spécificités s'équivalent.
 */

export interface Regle {
  /** Les sélecteurs, séparés et nettoyés. */
  selecteurs: string[];
  /** Les déclarations, propriété en minuscules. */
  declarations: Map<string, string>;
  /** Vrai pour une règle @font-face — une police servie par le site lui-même. */
  fontFace: boolean;
}

/** Les at-règles dont le corps contient d'autres règles. */
const CONTENEURS = /^@(media|supports|layer|container|scope|document)\b/i;

/** Retire les commentaires, seule transformation avant découpage. */
function sansCommentaires(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export function lireRegles(css: string): Regle[] {
  const regles: Regle[] = [];
  parcourir(sansCommentaires(css), regles, 0);
  return regles;
}

/**
 * `profondeur` borne la récursion : une feuille malformée — ou fabriquée pour
 * nuire — ne doit pas pouvoir faire déborder la pile.
 */
function parcourir(css: string, sortie: Regle[], profondeur: number): void {
  if (profondeur > 8) return;

  let i = 0;
  while (i < css.length) {
    const ouvrante = css.indexOf("{", i);
    if (ouvrante === -1) return;

    const prelude = css.slice(i, ouvrante).trim();
    const fermante = trouverFermante(css, ouvrante);
    if (fermante === -1) return;

    const corps = css.slice(ouvrante + 1, fermante);

    if (CONTENEURS.test(prelude)) {
      // @media et compagnie : le corps contient d'autres règles.
      parcourir(corps, sortie, profondeur + 1);
    } else if (/^@font-face\b/i.test(prelude)) {
      sortie.push({ selecteurs: [], declarations: lireDeclarations(corps), fontFace: true });
    } else if (prelude.startsWith("@")) {
      // @keyframes, @property, @page… : rien à en tirer pour une charte.
    } else if (prelude) {
      sortie.push({
        selecteurs: prelude
          .split(",")
          .map((s) => s.replace(/\s+/g, " ").trim())
          .filter(Boolean),
        declarations: lireDeclarations(corps),
        fontFace: false,
      });
    }

    i = fermante + 1;
  }
}

/** L'accolade fermante correspondante, en tenant le compte des imbrications. */
function trouverFermante(css: string, ouvrante: number): number {
  let niveau = 0;
  for (let i = ouvrante; i < css.length; i++) {
    const c = css[i];
    if (c === "{") niveau++;
    else if (c === "}") {
      niveau--;
      if (niveau === 0) return i;
    }
  }
  return -1;
}

/**
 * Les déclarations d'un bloc.
 *
 * Le découpage suit les points-virgules **hors parenthèses** : une URL en
 * base64 (`url(data:image/png;base64,…)`) en contient, et un découpage naïf
 * couperait la déclaration en deux.
 */
export function lireDeclarations(corps: string): Map<string, string> {
  const sortie = new Map<string, string>();
  let parentheses = 0;
  let debut = 0;

  const poser = (morceau: string) => {
    const deuxPoints = morceau.indexOf(":");
    if (deuxPoints === -1) return;
    const propriete = morceau.slice(0, deuxPoints).trim().toLowerCase();
    const valeur = morceau.slice(deuxPoints + 1).replace(/!important\s*$/i, "").trim();
    if (!propriete || !valeur) return;
    // Une propriété redéclarée dans le même bloc : la dernière l'emporte.
    sortie.set(propriete, valeur);
  };

  for (let i = 0; i < corps.length; i++) {
    const c = corps[i];
    if (c === "(") parentheses++;
    else if (c === ")") parentheses = Math.max(0, parentheses - 1);
    else if (c === "{") {
      // Bloc imbriqué (CSS moderne) : on l'ignore, ses déclarations ne
      // s'appliquent pas au sélecteur courant.
      const fin = trouverFermante(corps, i);
      if (fin === -1) break;
      i = fin;
      debut = i + 1;
      continue;
    } else if (c === ";" && parentheses === 0) {
      poser(corps.slice(debut, i));
      debut = i + 1;
    }
  }
  poser(corps.slice(debut));
  return sortie;
}

/* ------------------------------------------------------------------ *
 * Variables CSS
 * ------------------------------------------------------------------ */

/**
 * Toutes les propriétés personnalisées déclarées dans la feuille.
 *
 * Sans elles, la moitié des sites modernes rendrait `var(--color-primary)`
 * comme couleur de bouton — c'est-à-dire rien.
 */
export function lireVariables(regles: Regle[]): Map<string, string> {
  const variables = new Map<string, string>();
  for (const regle of regles) {
    for (const [propriete, valeur] of regle.declarations) {
      if (propriete.startsWith("--")) variables.set(propriete, valeur);
    }
  }
  return variables;
}

/**
 * Remplace les `var(--x)` par leur valeur.
 *
 * La profondeur est bornée : une variable qui se référence elle-même — cas
 * fréquent dans les thèmes engendrés — ferait boucler indéfiniment.
 */
export function resoudre(valeur: string, variables: Map<string, string>, profondeur = 0): string {
  if (profondeur > 6 || !valeur.includes("var(")) return valeur;

  const remplacee = valeur.replace(
    /var\(\s*(--[a-z0-9_-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/gi,
    (entier, nom: string, repli: string | undefined) => {
      const trouvee = variables.get(nom);
      if (trouvee !== undefined) return trouvee;
      return repli !== undefined ? repli.trim() : entier;
    }
  );

  return remplacee === valeur ? valeur : resoudre(remplacee, variables, profondeur + 1);
}
