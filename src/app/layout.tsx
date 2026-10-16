import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import "../styles/variables.module.css";
import "./globals.css";
import { Toaster } from 'react-hot-toast';

// Deux polices d'une même famille (Adobe Source) : serif pour les titres et la lecture des cours,
// sans-serif pour l'interface. Polices variables : une seule requête chacune, sous-ensemble latin.
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pas de maximumScale : l'étudiant doit pouvoir zoomer sur un texte de loi (accessibilité).
  themeColor: "#FFFFFF",
};

export const metadata: Metadata = {
  title: "SJP | L'Élite des Juristes",
  description: "Plateforme éducative premium pour les étudiants en droit francophones d'Afrique",
};

import NextTopLoader from 'nextjs-toploader';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${sourceSans.variable} ${sourceSerif.variable}`}>
      <body>
        <NextTopLoader color="#2350D6" showSpinner={false} shadow={false} height={2} />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--ink)',
              color: '#FFFFFF',
              borderRadius: '10px',
              fontSize: '15px',
              padding: '10px 14px',
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
