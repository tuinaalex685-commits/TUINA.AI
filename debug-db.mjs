import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: evals } = await supabase.from('evaluations').select('*').order('created_at', { ascending: false }).limit(3);
  console.log("=== EVALUATIONS ===");
  evals.forEach(e => {
    console.log(`ID: ${e.id}`);
    console.log(JSON.stringify(e.questions, null, 2));
  });

  const { data: redactions } = await supabase.from('redactions').select('*').order('date_creation', { ascending: false }).limit(3);
  console.log("=== REDACTIONS ===");
  redactions.forEach(r => {
    console.log(`ID: ${r.id}`);
    console.log(JSON.stringify(r.rapport_analyse, null, 2));
  });
}
run();
