/**
 * OFFRE PREMIUM — constantes commerciales partagées (serveur et interface).
 * La durée vient de PREMIUM_DURATION_DAYS (src/lib/plan.ts), unique source de la règle.
 */

/** Prix de l'abonnement mensuel, en FCFA (XOF). Les frais SasPay s'ajoutent (réglage du compte). */
export const PREMIUM_PRICE_XOF = 2500;
export const PREMIUM_CURRENCY = 'XOF';

/** Numéro WhatsApp de l'administrateur (déjà utilisé par la page d'accueil). */
export const ADMIN_WHATSAPP = '22657138126';

export function whatsappUrl(message: string): string {
  return `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

export const PREMIUM_PRICE_LABEL = '2 500 FCFA';
