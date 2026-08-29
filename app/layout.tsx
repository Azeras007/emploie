import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { BASE_PATH } from "@/lib/basePath";
import "./globals.css";

// Mêmes familles que le site Valeur Ajoutée.
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Recrutement — Valeur Ajoutée",
    template: "%s — Valeur Ajoutée",
  },
  description: "Questionnaire de candidature et suivi des dossiers.",
  applicationName: "Valeur Ajoutée",
  icons: {
    icon: `${BASE_PATH}/logo-192.png`,
    apple: `${BASE_PATH}/apple-touch-icon.png`,
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
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
