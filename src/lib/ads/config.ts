/**
 * CONFIGURATION PUBLICITAIRE — point de réglage unique.
 *
 * Aucun identifiant n'est écrit en dur : tout vient des variables d'environnement.
 * Tant qu'elles ne sont pas renseignées, `isAdsConfigured()` renvoie false et
 * l'application se comporte exactement comme s'il n'y avait pas de publicité —
 * pas de script chargé, pas de bloc vide, pas d'erreur console.
 *
 * MIGRATION FUTURE (Adsterra → AdSense) : seuls ce fichier et le composant
 * d'unité concerné changent. Les emplacements posés dans les pages (<AdSlot />)
 * et toute la logique Free/Premium restent identiques.
 *
 * AUCUNE URL de site n'apparaît ici : l'intégration est indépendante du domaine,
 * le passage du sous-domaine Vercel à un domaine personnalisé ne demandera
 * aucune modification de code.
 */

export type AdProvider = 'adsterra' | 'none';

/** Emplacements existants. Ajouter une valeur ici suffit à créer un emplacement. */
export type AdPlacement = 'dashboard' | 'catalogue';

const env = (name: string): string => (process.env[name] ?? '').trim();

/**
 * Clé d'unité publicitaire par emplacement.
 *
 * Ces valeurs se récupèrent dans ton panneau Adsterra, sur chaque unité créée.
 * Elles restent vides tant que tu ne me les as pas fournies — je n'invente aucun
 * identifiant, un faux ID ferait échouer les appels et pourrait faire signaler le compte.
 */
const PLACEMENT_ENV: Record<AdPlacement, string> = {
  dashboard: 'NEXT_PUBLIC_ADSTERRA_KEY_DASHBOARD',
  catalogue: 'NEXT_PUBLIC_ADSTERRA_KEY_CATALOGUE',
};

export interface AdUnitConfig {
  provider: AdProvider;
  /** Identifiant de l'unité, fourni par la régie. */
  key: string;
  /** URL du script d'invocation, fournie par la régie avec l'unité. */
  scriptUrl: string;
  width: number;
  height: number;
}

/**
 * Le format bannière d'Adsterra fournit, par unité, une clé ET l'URL du script
 * d'invocation associée. On lit les deux depuis l'environnement plutôt que de
 * coder l'URL en dur : si la régie change de domaine de diffusion, ou si tu
 * passes à un autre format, il n'y a rien à recompiler.
 */
export function getAdUnit(placement: AdPlacement): AdUnitConfig | null {
  if (env('NEXT_PUBLIC_ADSTERRA_ENABLED') !== 'true') return null;

  const key = env(PLACEMENT_ENV[placement]);
  const scriptUrl = env('NEXT_PUBLIC_ADSTERRA_SCRIPT_URL');
  if (!key || !scriptUrl) return null;

  const width = Number(env('NEXT_PUBLIC_ADSTERRA_WIDTH')) || 300;
  const height = Number(env('NEXT_PUBLIC_ADSTERRA_HEIGHT')) || 250;

  return { provider: 'adsterra', key, scriptUrl, width, height };
}

/** true seulement si la régie est réellement utilisable pour cet emplacement. */
export function isAdsConfigured(placement: AdPlacement): boolean {
  return getAdUnit(placement) !== null;
}
