"use client";

import Link from "next/link";
import { BASE_PATH } from "@/lib/basePath";
import { useMarque } from "./Marque";

/**
 * Le logotype de l'enseigne.
 *
 * Deux cas, et un seul appelant : soit un fichier officiel a été déposé et il
 * est servi tel quel, soit le nom est composé typographiquement dans la police
 * de titre du thème. Le second cas n'est pas un pis-aller — c'est ce qui permet
 * de montrer une démonstration aux couleurs d'un prospect avant même d'avoir
 * obtenu ses fichiers.
 *
 * Servi par une balise <img> ordinaire, pas par next/image : sous `basePath`,
 * l'optimiseur d'images reçoit une URL source non préfixée et répond 400.
 */
export default function Logo({
  height = 34,
  href,
  className = "",
  priority = false,
}: {
  height?: number;
  href?: string;
  className?: string;
  priority?: boolean;
}) {
  const { nom, logo } = useMarque();
  const texte = logo.mot || nom;

  const marque = logo.fichier ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${BASE_PATH}${logo.fichier}`}
      alt={nom}
      style={{ height, width: "auto", objectFit: "contain" }}
      loading={priority ? "eager" : "lazy"}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(priority ? ({ fetchPriority: "high" } as any) : {})}
    />
  ) : (
    <span
      className={`font-display font-extrabold text-primaire ${logo.capitales ? "uppercase" : ""}`}
      // Le lettrage occupe `height` pixels de haut, quel que soit l'endroit où
      // il est posé : les appels raisonnent en pixels, comme avec une image.
      style={{ fontSize: height * 0.86, lineHeight: 1, letterSpacing: "-0.005em" }}
    >
      {texte}
    </span>
  );

  if (!href) return <span className={`inline-flex items-center ${className}`}>{marque}</span>;

  return (
    <Link href={href} className={`inline-flex shrink-0 items-center ${className}`}>
      {marque}
    </Link>
  );
}
