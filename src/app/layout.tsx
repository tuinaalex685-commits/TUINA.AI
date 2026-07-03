import type { Metadata, Viewport } from "next";
import { Inter, Outfit, Space_Mono } from "next/font/google";
import "../styles/variables.module.css";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} ${outfit.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
