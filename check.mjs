import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase
    .from('etude_cours')
    .select('id, pdf_id, statut_generation, last_error, updated_at, next_retry, heartbeat')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error(error);
  } else {
    console.table(data);
  }
}

main();
