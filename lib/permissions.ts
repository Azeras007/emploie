import type { Applicant, Role } from "./types";

/**
 * Qui a le droit de quoi.
 *
 * Un seul endroit décide, et tout le reste — pages, routes, menus — l'y
 * consulte. Une permission oubliée dans un coin de route est la façon la plus
 * courante de laisser fuiter les données d'un client.
 */

export type Permission =
  /** La marque, les envois, les réglages techniques. Le rôle de l'éditeur. */
  | "marque"
  /** Le questionnaire, les règles de tri, l'accueil. */
  | "reglages"
  /** Créer, modifier et supprimer les comptes. */
  | "comptes"
  /** Créer et modifier les magasins. */
  | "magasins"
  /** Les liens d'invitation et leurs QR codes. */
  | "liens"
  /** Voir les candidatures — la portée dépend du rôle, voir `portee`. */
  | "candidatures"
  /** Changer un statut, noter, annoter. */
  | "traiter"
  /** Supprimer un dossier, exporter, purger. */
  | "donnees";

const GRILLE: Record<Role, Permission[]> = {
  proprietaire: [
    "marque",
    "reglages",
    "comptes",
    "magasins",
    "liens",
    "candidatures",
    "traiter",
    "donnees",
  ],
  // L'administrateur d'enseigne règle tout ce qui la concerne, mais ne touche
  // ni à l'habillage du produit ni aux identifiants du serveur d'envoi.
  administrateur: ["reglages", "comptes", "magasins", "liens", "candidatures", "traiter", "donnees"],
  recruteur: ["candidatures", "traiter", "liens"],
  magasin: ["candidatures", "traiter"],
};

export interface Acteur {
  role: Role;
  storeId: string | null;
}

export function peut(acteur: Acteur | null | undefined, permission: Permission): boolean {
  if (!acteur) return false;
  return GRILLE[acteur.role]?.includes(permission) ?? false;
}

/**
 * La portée de lecture : `null` signifie « tous les magasins ».
 *
 * Un responsable sans magasin assigné ne voit rien plutôt que tout. C'est le
 * sens du repli le plus prudent : un compte mal configuré doit gêner son
 * titulaire, jamais exposer les dossiers des autres.
 */
export function portee(acteur: Acteur | null | undefined): string | null | "aucune" {
  if (!acteur) return "aucune";
  if (acteur.role !== "magasin") return null;
  return acteur.storeId ?? "aucune";
}

/** Filtre une liste de candidatures selon la portée de l'acteur. */
export function filtrerParPortee<T extends Pick<Applicant, "storeId">>(
  dossiers: T[],
  acteur: Acteur | null | undefined
): T[] {
  const p = portee(acteur);
  if (p === null) return dossiers;
  if (p === "aucune") return [];
  return dossiers.filter((d) => d.storeId === p);
}

/** Vrai si l'acteur a le droit d'ouvrir ce dossier précis. */
export function voitDossier(
  dossier: Pick<Applicant, "storeId">,
  acteur: Acteur | null | undefined
): boolean {
  if (!peut(acteur, "candidatures")) return false;
  const p = portee(acteur);
  if (p === null) return true;
  if (p === "aucune") return false;
  return dossier.storeId === p;
}
