import Link from "next/link";
import { BASE_PATH } from "@/lib/basePath";

/**
 * Le logotype Kiabi.
 *
 * Par défaut, le logotype est composé typographiquement : « KIABI » en Figtree
 * très gras, au bleu pétrole de la marque. Aucun fichier n'est donc nécessaire
 * pour que l'application soit présentable — et rien d'approximatif n'est
 * embarqué dans le dépôt à la place de la marque.
 *
 * Dès que le fichier officiel est disponible, déposez-le dans `public/logos/`
 * et renseignez son chemin :
 *
 *     NEXT_PUBLIC_LOGO_FILE=/logos/kiabi.svg
 *
 * Il remplace alors le lettrage partout, sans toucher au code.
 *
 * Servi par une balise <img> ordinaire, pas par next/image : sous `basePath`,
 * l'optimiseur d'images reçoit une URL source non préfixée et répond 400
 * (« isn't a valid image »).
 */
const OFFICIAL_LOGO = process.env.NEXT_PUBLIC_LOGO_FILE ?? "";

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
  const mark = OFFICIAL_LOGO ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${BASE_PATH}${OFFICIAL_LOGO}`}
      alt="Kiabi"
      style={{ height, width: "auto", objectFit: "contain" }}
      loading={priority ? "eager" : "lazy"}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(priority ? ({ fetchPriority: "high" } as any) : {})}
    />
  ) : (
    <span
      className="font-display font-extrabold uppercase text-primaire"
      // Le lettrage occupe exactement `height` pixels de haut, quel que soit
      // l'endroit où il est posé : les appels raisonnent en pixels, comme avec
      // une image.
      style={{ fontSize: height * 0.86, lineHeight: 1, letterSpacing: "-0.005em" }}
    >
      Kiabi
    </span>
  );

  if (!href) return <span className={`inline-flex items-center ${className}`}>{mark}</span>;

  return (
    <Link href={href} className={`inline-flex shrink-0 items-center ${className}`}>
      {mark}
    </Link>
  );
}
