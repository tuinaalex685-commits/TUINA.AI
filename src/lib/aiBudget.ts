// Serveur uniquement (service role).
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Budget et crédit Gemini.
 *
 * L'administrateur saisit le crédit qu'il vient de charger sur Google AI Studio et la date de
 * la recharge ; SJP estime la consommation depuis cette date à partir des tokens mesurés à
 * chaque appel (saas_metrics). C'est une ESTIMATION : le solde réel affiché par Google fait foi.
 *
 * Coupe-circuits (pour ne jamais échouer en silence chez les étudiants) :
 *  - plafond journalier réglable (0 = aucun plafond) ;
 *  - crédit épuisé : quand l'estimation atteint le crédit chargé, les générations s'arrêtent avec
 *    un message clair, au lieu d'erreurs Gemini incompréhensibles.
 */

export interface GeminiSettings {
  credit_usd: number | null;   // crédit chargé lors de la dernière recharge
  recharge_at: string | null;  // date de cette recharge
  daily_usd: number;           // plafond journalier (0 = aucun)
  alert_pct: number;           // seuil d'alerte (% du crédit)
}

const DEFAULTS: GeminiSettings = {
  credit_usd: null,
  recharge_at: null,
  daily_usd: Number(process.env.GEMINI_DAILY_BUDGET_USD || '5'),
  alert_pct: 80,
};

const TTL_MS = 30_000;
let cache: { at: number; value: GeminiSettings } | null = null;

export async function getGeminiSettings(fresh = false): Promise<GeminiSettings> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const { data, error } = await supabaseAdmin.from('admin_settings').select('value').eq('key', 'gemini').maybeSingle();
  const v = (!error && data?.value) || {};
  const value: GeminiSettings = {
    credit_usd: Number.isFinite(Number(v.credit_usd)) && Number(v.credit_usd) > 0 ? Number(v.credit_usd) : DEFAULTS.credit_usd,
    recharge_at: typeof v.recharge_at === 'string' ? v.recharge_at : DEFAULTS.recharge_at,
    daily_usd: Number.isFinite(Number(v.daily_usd)) && Number(v.daily_usd) >= 0 ? Number(v.daily_usd) : DEFAULTS.daily_usd,
    alert_pct: Number.isFinite(Number(v.alert_pct)) ? Math.min(99, Math.max(10, Number(v.alert_pct))) : DEFAULTS.alert_pct,
  };
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateGeminiSettings() { cache = null; }

/** Dépense IA estimée depuis une date (somme calculée par la base ; repli si la fonction manque). */
export async function spendSince(since: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('ai_spend_since', { p_since: since });
  if (!error) return Number(data) || 0;
  const { data: rows } = await supabaseAdmin.from('saas_metrics').select('cost_usd').gte('created_at', since).limit(50000);
  return (rows || []).reduce((s, r: { cost_usd: unknown }) => s + (Number(r.cost_usd) || 0), 0);
}

export interface CreditStatus {
  settings: GeminiSettings;
  consomme: number | null;       // depuis la recharge
  restant: number | null;
  pct: number | null;
  parJour7: number;              // moyenne des 7 derniers jours
  joursRestants: number | null;  // au rythme actuel
  aujourdHui: number;
}

export async function creditStatus(): Promise<CreditStatus> {
  const settings = await getGeminiSettings(true);
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const since7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const [aujourdHui, sur7, consomme] = await Promise.all([
    spendSince(startOfDay),
    spendSince(since7),
    settings.credit_usd && settings.recharge_at ? spendSince(settings.recharge_at) : Promise.resolve(null),
  ]);
  const parJour7 = sur7 / 7;
  const restant = settings.credit_usd !== null && consomme !== null ? Math.max(0, settings.credit_usd - consomme) : null;
  const pct = settings.credit_usd && consomme !== null ? Math.min(100, (consomme / settings.credit_usd) * 100) : null;
  return {
    settings, consomme, restant, pct, parJour7, aujourdHui,
    joursRestants: restant !== null && parJour7 > 0 ? restant / parJour7 : null,
  };
}

/** Vérification avant chaque appel Gemini (réglages mis en cache 30 s : coût négligeable). */
export async function assertGeminiBudget(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const s = await getGeminiSettings();
    const now = new Date();
    if (s.daily_usd > 0) {
      const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      if ((await spendSince(startOfDay)) >= s.daily_usd) {
        return { ok: false, message: 'Le service d’IA a atteint sa limite du jour. Réessaie demain : ton travail est conservé.' };
      }
    }
    if (s.credit_usd && s.recharge_at && (await spendSince(s.recharge_at)) >= s.credit_usd) {
      return { ok: false, message: 'Le service d’IA est momentanément suspendu (crédit à recharger). Réessaie un peu plus tard : ton travail est conservé.' };
    }
    return { ok: true };
  } catch (err) {
    // Une erreur de lecture ne doit jamais bloquer toute la plateforme.
    console.error('[GEMINI_BUDGET] vérification impossible, appel autorisé:', err instanceof Error ? err.message : err);
    return { ok: true };
  }
}
