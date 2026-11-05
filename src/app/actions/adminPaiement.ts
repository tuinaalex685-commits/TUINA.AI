"use server";

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PREMIUM_DURATION_DAYS } from '@/lib/plan';
import { verifyPayment } from '@/lib/saspay';
import { decidePayment, parseAmount } from '@/lib/saspayCore';
import { getOrder, logOrderEvent, syncOpenOrders, syncOrder, type PremiumOrder } from '@/lib/premiumPayment';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Utilisateur non authentifié');
  const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', user.id).single();
  if (role?.role !== 'admin') throw new Error('Accès administrateur refusé');
  return user;
}

export interface AdminOrderRow extends PremiumOrder { code: string | null }

/** Paiements et renouvellements, du plus récent au plus ancien. */
export async function listPremiumOrders(): Promise<{ orders?: AdminOrderRow[]; error?: string }> {
  try {
    await requireAdmin();
    const { data, error } = await supabaseAdmin.from('premium_orders').select('*')
      .order('created_at', { ascending: false }).limit(200);
    if (error) return { error: error.message };
    const orders = (data as PremiumOrder[]) ?? [];
    const ids = [...new Set(orders.map((o) => o.code_id).filter(Boolean))] as string[];
    const { data: codes } = ids.length
      ? await supabaseAdmin.from('access_codes').select('id, code').in('id', ids)
      : { data: [] as { id: string; code: string }[] };
    const byId = new Map((codes ?? []).map((c) => [c.id, c.code]));
    return { orders: orders.map((o) => ({ ...o, code: o.code_id ? byId.get(o.code_id) ?? null : null })) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Revérifie une commande auprès de SasPay. Pour une commande en intervention (ex. aucun code
 * disponible au moment du paiement), relance l'attribution après une NOUVELLE vérification du
 * paiement : utile quand l'administrateur vient de créer des codes.
 */
export async function recheckPremiumOrder(id: string): Promise<{ success?: boolean; status?: string; error?: string }> {
  try {
    const admin = await requireAdmin();
    const order = await getOrder(id);
    if (!order) return { error: 'Commande introuvable' };

    if (order.status === 'needs_review' && order.transaction_id) {
      const payment = await verifyPayment(order.transaction_id);
      const decision = decidePayment(payment, { amount: Number(order.amount), currency: order.currency });
      if (decision !== 'success') return { error: `Paiement non conforme chez SasPay (${decision}) : traite-le à la main.` };
      const { data, error } = await supabaseAdmin.rpc('fulfill_premium_order', {
        p_order_id: order.id,
        p_transaction_id: payment.id,
        p_transaction_reference: payment.reference ?? order.transaction_reference,
        p_paid_amount: parseAmount(payment.requested_amount),
        p_paid_currency: payment.currency ?? '',
        p_days: PREMIUM_DURATION_DAYS,
      });
      if (error) return { error: error.message };
      await logOrderEvent(order.id, 'relance_admin', { admin: admin.id, resultat: (data as any)?.status ?? null });
    } else {
      await syncOrder(order);
    }
    revalidatePath('/admin/dashboard/paiements');
    return { success: true, status: (await getOrder(id))?.status };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Revérifie toutes les commandes ouvertes des dernières 48 h. */
export async function recheckOpenPremiumOrders(): Promise<{ count?: number; error?: string }> {
  try {
    await requireAdmin();
    const count = await syncOpenOrders(100);
    revalidatePath('/admin/dashboard/paiements');
    return { count };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Clôture à la main une commande en intervention (après avoir réglé le cas avec les outils de codes
 * existants : réactivation manuelle, nouveau code…). N'accorde rien par elle-même.
 */
export async function resolvePremiumOrder(id: string, note: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();
    const clean = String(note || '').trim().slice(0, 300);
    if (!clean) return { error: 'Indique ce qui a été fait.' };
    const { data, error } = await supabaseAdmin.from('premium_orders')
      .update({ status: 'resolved', review_reason: clean, updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'needs_review').select('id').maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Seule une commande en intervention peut être clôturée.' };
    await logOrderEvent(id, 'cloture_admin', { admin: admin.id, note: clean });
    revalidatePath('/admin/dashboard/paiements');
    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
