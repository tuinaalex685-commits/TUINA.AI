import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/viewer';
import { catalogLevelAllows } from '@/lib/access';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ancienne adresse d'un cours du catalogue (liens et favoris existants). L'Étude guidée d'un cours
 * du catalogue est désormais la même que celle d'un cours personnel : on redirige vers elle,
 * après les mêmes contrôles qu'avant (publication active, niveau de l'étudiant).
 */
export default async function EtudeCatalogueRedirect({ params }: { params: Promise<{ catalogId: string }> }) {
  const { catalogId } = await params;
  if (!UUID_RE.test(catalogId)) redirect('/app/catalogue');
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { data: entry } = await supabaseAdmin
    .from('catalog_courses').select('etude_cours_id, niveau').eq('id', catalogId).eq('actif', true).maybeSingle();
  if (!entry) redirect('/app/catalogue');
  if (!(await catalogLevelAllows(supabaseAdmin, user.id, entry.niveau ?? null))) redirect('/app/catalogue');

  const { data: cours } = await supabaseAdmin.from('etude_cours').select('pdf_id').eq('id', entry.etude_cours_id).maybeSingle();
  if (!cours?.pdf_id) redirect('/app/catalogue');
  redirect(`/app/etude/${cours.pdf_id}`);
}
