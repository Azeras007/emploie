import Link from "next/link";
import { BASE_PATH } from "@/lib/basePath";

/**
 * Le logotype Valeur Ajoutée.
 *
 * Servi par une balise <img> ordinaire, pas par next/image : sous `basePath`,
 * l'optimiseur d'images reçoit une URL source non préfixée et répond 400
 * (« isn't a valid image »). Le fichier est donc pré-dimensionné à 900 px de
 * large — 69 Ko — ce qui rend l'optimiseur inutile ici.
 *
 * Seule la version texte est employée : le fichier du monogramme
 * (logos/logo-icon.png) porte un fond crème qui dessinerait un rectangle beige
 * sur nos fonds blancs.
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
  // Ratio du fichier source : 5810×1981.
  const width = Math.round(height * (5810 / 1981));

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${BASE_PATH}/logos/wordmark.png`}
      width={width}
      height={height}
      alt="Valeur Ajoutée"
      style={{ width, height, objectFit: "contain" }}
      loading={priority ? "eager" : "lazy"}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(priority ? ({ fetchPriority: "high" } as any) : {})}
    />
  );

  if (!href) return <span className={`inline-flex items-center ${className}`}>{image}</span>;

  return (
    <Link href={href} className={`inline-flex shrink-0 items-center ${className}`}>
      {image}
    </Link>
  );
}
