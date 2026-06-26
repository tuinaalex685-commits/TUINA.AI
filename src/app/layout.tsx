import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tuina.ai | Plateforme Éducative Juridique",
  description: "Plateforme éducative pour les étudiants en droit francophones d'Afrique",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
