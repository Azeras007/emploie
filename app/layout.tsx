import type { Metadata, Viewport } from "next";
import { MarqueProvider } from "@/components/Marque";
import { BASE_PATH } from "@/lib/basePath";
import { getTheme } from "@/lib/db";
import { derivePalette, googleFontsUrl, logoUrl, themeCss } from "@/lib/theme";
import "./globals.css";

/**
 * Le thème est lu en base et injecté ici, à chaque rendu.
 *
 * C'est ce qui rend le produit vendable : habiller une nouvelle enseigne ne
 * demande ni recompilation ni redéploiement, juste un enregistrement. Les
 * polices suivent le même chemin — d'où l'absence de `next/font/google`, qui
 * exige de connaître les familles à la compilation.
 */

export async function generateMetadata(): Promise<Metadata> {
  const theme = await getTheme();
  return {
    title: {
      default: `Recrutement — ${theme.nom}`,
      template: `%s — ${theme.nom}`,
    },
    description: `Déposez votre candidature chez ${theme.nom} : questionnaire, CV et lettre.`,
    applicationName: theme.nom,
    icons: {
      icon: `${BASE_PATH}/api/marque/favicon`,
      apple: `${BASE_PATH}/apple-touch-icon.png`,
    },
    // Un espace de candidature n'a rien à faire dans un index de recherche :
    // les CV qui y transitent sont des données personnelles.
    robots: { index: false, follow: false },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  return {
    themeColor: derivePalette(theme).primaire,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();
  const polices = googleFontsUrl(theme);

  return (
    <html lang="fr">
      <head>
        {polices && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link rel="stylesheet" href={polices} />
          </>
        )}
        {/* Écrase les valeurs de repli d'app/globals.css. */}
        <style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
      </head>
      <body className="min-h-dvh antialiased">
        <MarqueProvider
          marque={{
            nom: theme.nom,
            logoUrl: logoUrl(theme),
            mot: theme.logo.mot,
            capitales: theme.logo.capitales,
          }}
        >
          {children}
        </MarqueProvider>
      </body>
    </html>
  );
}
