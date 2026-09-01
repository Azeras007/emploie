"use client";

import { createContext, useContext } from "react";
import { THEME_PAR_DEFAUT } from "@/lib/theme";

/**
 * L'identité de l'enseigne, mise à disposition de toute l'application.
 *
 * Les couleurs voyagent en variables CSS ; le nom et le logotype, eux, sont du
 * contenu — il leur faut un chemin en React. Un contexte évite de faire
 * descendre ces valeurs à travers chaque page, chaque formulaire et chaque
 * en-tête, alors qu'elles ne changent jamais d'un rendu à l'autre.
 *
 * L'adresse du logotype est résolue en amont, côté serveur : le composant
 * d'affichage n'a pas à savoir s'il s'agit d'un fichier déposé ou d'un import
 * rangé en base.
 */
export interface Marque {
  nom: string;
  logoUrl: string | null;
  mot: string;
  capitales: boolean;
}

const MarqueContext = createContext<Marque>({
  nom: THEME_PAR_DEFAUT.nom,
  logoUrl: null,
  mot: THEME_PAR_DEFAUT.logo.mot,
  capitales: false,
});

export function MarqueProvider({
  marque,
  children,
}: {
  marque: Marque;
  children: React.ReactNode;
}) {
  return <MarqueContext.Provider value={marque}>{children}</MarqueContext.Provider>;
}

export function useMarque(): Marque {
  return useContext(MarqueContext);
}
