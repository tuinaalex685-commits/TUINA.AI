import type { Metadata } from 'next';
import Accueil from '@/components/accueil/Accueil';
import { FREE_LIMITS, FREE_MAX_DOCUMENTS } from '@/lib/quota';

const DESCRIPTION =
  'SJP accompagne les étudiants en droit : bibliothèque de cours, examens tirés de tes PDF, rédaction juridique corrigée, révisions et suivi de progression. Pour la L1 et la L2, au Burkina Faso et en Afrique francophone.';

export const metadata: Metadata = {
  title: 'SJP · Le droit se comprend, se pratique et se maîtrise',
  description: DESCRIPTION,
  openGraph: {
    title: 'SJP · Sciences juridiques et politiques',
    description: DESCRIPTION,
    url: 'https://tuina-ai.vercel.app',
    siteName: 'SJP',
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'SJP · Sciences juridiques et politiques', description: DESCRIPTION },
};

const WHATSAPP_NUMBER = '22657138126';
const PRIX_PREMIUM = '2 500';
const WHATSAPP_MESSAGE = `Bonjour, je souhaite passer à SJP Premium (${PRIX_PREMIUM} FCFA pour 30 jours). Comment payer par Mobile Money ?`;

/**
 * Page d'accueil publique. Composant serveur : les limites de l'offre gratuite viennent du
 * code des quotas (lib/quota.ts), jamais d'un texte recopié qui finirait par diverger.
 */
export default function Home() {
  return (
    <Accueil
      limits={{ examen: FREE_LIMITS.examen, revision: FREE_LIMITS.revision, redaction: FREE_LIMITS.redaction, pdf: FREE_MAX_DOCUMENTS }}
      whatsappUrl={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
      prixPremium={PRIX_PREMIUM}
    />
  );
}
