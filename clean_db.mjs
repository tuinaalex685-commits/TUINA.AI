import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanPoisonedCache() {
  console.log("Recherche des cours corrompus (pret mais 0 sections)...");
  
  // 1. Get all courses that are 'pret'
  const { data: courses } = await supabase
    .from('etude_cours')
    .select('id')
    .eq('statut_generation', 'pret');
    
  if (!courses) return;

  let corruptedCount = 0;

  for (const c of courses) {
    const { count } = await supabase
      .from('etude_sections')
      .select('id', { count: 'exact', head: true })
      .eq('cours_id', c.id);
      
    if (count === 0) {
      console.log(`Cours corrompu trouvé : ${c.id}`);
      // On le remet en erreur pour qu'il soit ignoré par le cache et regénérable
      await supabase.from('etude_cours').update({ statut_generation: 'erreur', last_error: 'Cours corrompu (0 section) invalidé' }).eq('id', c.id);
      corruptedCount++;
    }
  }
  
  console.log(`Terminé. ${corruptedCount} cours corrompus ont été réparés (mis en erreur).`);
}

cleanPoisonedCache();
