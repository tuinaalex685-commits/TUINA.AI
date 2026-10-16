import type { Metadata } from 'next';
import Landing from '@/components/landing/Landing';
import { FREE_LIMITS } from '@/lib/quota';

export const metadata: Metadata = {
  title: 'SJP · Réviser le droit, enfin clairement',
  description:
    'Étude guidée, cartes de révision et examens corrigés à partir de ton cours de droit. Pour les étudiants de L1 et L2 en Afrique francophone.',
};

const WHATSAPP_NUMBER = '22657138126';
const WHATSAPP_MESSAGE = 'Bonjour, je souhaite passer à SJP Premium (2 500 FCFA pour 30 jours). Comment payer par Mobile Money ?';

/**
 * Page d'accueil publique. Composant serveur : les limites de l'offre gratuite viennent du
 * code des quotas (lib/quota.ts), jamais d'un texte recopié qui finirait par diverger.
 */
export default function Home() {
  return (
    <Landing
      limits={{ examen: FREE_LIMITS.examen, revision: FREE_LIMITS.revision, cas_pratique: FREE_LIMITS.cas_pratique }}
      whatsappUrl={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
    />
  );
}
