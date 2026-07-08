import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Space_Mono } from "next/font/google";
import "../styles/variables.module.css";
import "./globals.css";
import { Toaster } from 'react-hot-toast';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Tuina.ai | L'Élite des Juristes",
  description: "Plateforme éducative premium pour les étudiants en droit francophones d'Afrique",
};

import NextTopLoader from 'nextjs-toploader';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} ${outfit.variable} ${spaceMono.variable}`}>
      <body>
        <NextTopLoader color="var(--color-accent)" showSpinner={false} shadow="0 0 10px var(--color-accent),0 0 5px var(--color-accent)" height={3} />
        <Toaster position="bottom-right" toastOptions={{ duration: 4000, style: { background: 'var(--color-bg-secondary)', color: 'var(--color-text-main)', border: '1px solid var(--color-border)' } }} />
        {children}
      </body>
    </html>
  );
}
