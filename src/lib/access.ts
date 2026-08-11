/**
 * AUTORISATION D'ACCÈS À UN DOCUMENT SOURCE — règle unique, partagée.
 *
 * Plusieurs endroits du serveur lisent le texte d'un document avec le SERVICE ROLE
 * (worker IA, composition d'examen, génération de flashcards). Le service role
 * ignore la RLS : c'est donc à l'appelant de prouver que l'utilisateur a le droit
 * de travailler sur ce document. Chaque endroit ayant sa propre version de ce
 * contrôle, c'est exactement comme ça qu'une faille IDOR réapparaît — d'où ce
 * fichier unique.
 *
 * Deux accès légitimes, et deux seulement :
 *   'owner'   — l'utilisateur a importé ce document ;
 *   'catalog' — le cours issu de ce document est publié au catalogue public et actif.
 *
 * 'catalog' n'ouvre PAS les mêmes droits que 'owner' : il autorise à étudier,
 * réviser et passer un examen sur un contenu que SJP met volontairement à
 * disposition, jamais à régénérer ou modifier le cours d'un autre utilisateur.
 * C'est à l'appelant de décider s'il accepte 'catalog' (voir actions/jobs.ts).
 */

export type DocumentAccess = 'owner' | 'catalog' | 'denied';

export async function resolveDocumentAccess(
  db: any,
  userId: string,
  documentId: string,
): Promise<DocumentAccess> {
  if (!documentId || documentId === 'dummy') return 'denied';

  const { data: doc } = await db
    .from('documents').select('id, user_id').eq('id', documentId).maybeSingle();
  if (!doc) return 'denied';
  if (doc.user_id === userId) return 'owner';

  const { data: cours } = await db
    .from('etude_cours').select('id').eq('pdf_id', documentId).maybeSingle();
  if (!cours) return 'denied';

  const { data: entry } = await db
    .from('catalog_courses')
    .select('id').eq('etude_cours_id', cours.id).eq('actif', true).maybeSingle();

  return entry ? 'catalog' : 'denied';
}

/**
 * Documents accessibles via le catalogue public, pour CE que l'utilisateur peut
 * réviser ou passer en examen sans posséder le moindre document (cas du plan Free).
 * Renvoie de quoi afficher une liste : entrée catalogue + document source sous-jacent.
 */
export async function listCatalogDocuments(db: any): Promise<{
  catalogId: string;
  etudeCoursId: string;
  documentId: string;
  titre: string;
  matiere: string | null;
}[]> {
  const { data: entries } = await db
    .from('catalog_courses')
    .select('id, etude_cours_id, titre_affiche, matiere, ordre')
    .eq('actif', true)
    .order('ordre', { ascending: true });
  if (!entries || entries.length === 0) return [];

  // etude_cours.pdf_id n'est pas une vraie clé étrangère PostgREST (cf. actions/catalog.ts) :
  // deux requêtes + fusion en mémoire, jamais de jointure imbriquée.
  const { data: cours } = await db
    .from('etude_cours')
    .select('id, pdf_id')
    .in('id', entries.map((e: any) => e.etude_cours_id));
  const pdfByCours = new Map((cours || []).map((c: any) => [c.id, c.pdf_id]));

  return entries
    .map((e: any) => ({
      catalogId: e.id,
      etudeCoursId: e.etude_cours_id,
      documentId: pdfByCours.get(e.etude_cours_id) as string,
      titre: e.titre_affiche,
      matiere: e.matiere ?? null,
    }))
    .filter((e: any) => !!e.documentId);
}
