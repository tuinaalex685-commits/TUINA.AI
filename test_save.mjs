import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSave() {
  const { data: users } = await supabase.auth.admin.listUsers();
  if (!users.users || users.users.length === 0) return;
  const user = users.users[0];

  const { data: docs } = await supabase.from('documents').select('id').eq('user_id', user.id).limit(1);
  const docId = docs && docs.length > 0 ? docs[0].id : null;

  const { error, data } = await supabase.from('evaluations').insert([{
    type: 'qcm',
    meta_type: 'qcm',
    titre: 'Évaluation test',
    questions: [{ id: 1, question: "Test", options: ["A"], correctAnswer: 0, explication: "Test" }],
    score: null,
    user_id: user.id,
    document_id: docId
  }]).select().single();

  if (error) {
    console.log("DB ERROR:", error);
  } else {
    console.log("SUCCESS");
  }
}

testSave();
