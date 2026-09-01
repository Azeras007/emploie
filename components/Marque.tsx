"use client";

import { createContext, useContext } from "react";
import { THEME_PAR_DEFAUT, type Theme } from "@/lib/theme";

/**
 * L'identité de l'enseigne, mise à disposition de toute l'application.
 *
 * Les couleurs voyagent en variables CSS ; le nom et le logotype, eux, sont du
 * contenu — il leur faut un chemin en React. Un contexte évite de faire
 * descendre ces deux valeurs à travers chaque page, chaque formulaire et chaque
 * en-tête, alors qu'elles ne changent jamais d'un rendu à l'autre.
 */
export interface Marque {
  nom: string;
  logo: Theme["logo"];
}

const MarqueContext = createContext<Marque>({
  nom: THEME_PAR_DEFAUT.nom,
  logo: THEME_PAR_DEFAUT.logo,
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
