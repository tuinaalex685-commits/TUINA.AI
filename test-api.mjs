import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data: docs, error: fetchError } = await supabase.from('documents').select('id').limit(1);
  if (fetchError || !docs || docs.length === 0) {
    console.error("Fetch docs error:", fetchError);
    return;
  }
  const documentId = docs[0].id;
  console.log("Testing with documentId:", documentId);
  
  const { data: newCours, error: insertError } = await supabase
    .from('etude_cours')
    .insert({ pdf_id: documentId, statut_generation: 'en_cours' })
    .select()
    .single();
    
  if (insertError) {
    console.error("INSERT ERROR:", insertError);
  } else {
    console.log("INSERT SUCCESS:", newCours);
  }
}
test();
