import Image from "next/image";
import Link from "next/link";

/**
 * Le logotype Valeur Ajoutée.
 *
 * Seule la version texte est employée : le fichier du monogramme
 * (logos/logo-icon.png) porte un fond crème qui dessinerait un rectangle beige
 * sur nos fonds blancs. Le logotype, lui, est détouré.
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
  const src = "/logos/LOGO-TEXTE.jpg";
  // Ratio du fichier source : 5810×1981.
  const width = Math.round(height * (5810 / 1981));

  const image = (
    <Image
      src={src}
      width={width}
      height={height}
      alt="Valeur Ajoutée"
      style={{ width, height, objectFit: "contain" }}
      priority={priority}
    />
  );

  if (!href) return <span className={`inline-flex items-center ${className}`}>{image}</span>;

  return (
    <Link href={href} className={`inline-flex shrink-0 items-center ${className}`}>
      {image}
    </Link>
  );
}
