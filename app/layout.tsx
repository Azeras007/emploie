import type { Metadata, Viewport } from "next";
import { Figtree, Inter } from "next/font/google";
import { BASE_PATH } from "@/lib/basePath";
import "./globals.css";

// Les deux familles de kiabi.com : Figtree pour les titres, Inter pour le texte.
const display = Figtree({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Recrutement — Kiabi",
    template: "%s — Kiabi",
  },
  description: "Déposez votre candidature en magasin Kiabi : questionnaire, CV et lettre.",
  applicationName: "Kiabi Recrutement",
  icons: {
    icon: `${BASE_PATH}/icone.svg`,
    apple: `${BASE_PATH}/apple-touch-icon.png`,
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#040037",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
