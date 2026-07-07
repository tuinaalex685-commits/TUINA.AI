import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 300; // Vercel Pro (5 minutes max)
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type, Schema } from '@google/genai';
// @ts-ignore
import pdfParse from 'pdf-parse';
import crypto from 'crypto';

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function runWorker(workerUrlStr?: string) {
  try {
    // Limite stricte pour éviter le Rate Limit Google
    const { count, error: countError } = await supabaseAdmin
      .from('etude_cours')
      .select('id', { count: 'exact', head: true })
      .eq('statut_generation', 'en_cours');
      
    if (countError) throw new Error("Erreur de comptage");
    if ((count || 0) >= 5) {
      console.log("[Worker] Trop de jobs en cours. Retourne.");
      return { message: "File pleine" };
    }

    // Récupérer le plus ancien job en attente
    const { data: job, error: fetchError } = await supabaseAdmin
      .from('etude_cours')
      .select('id, pdf_id')
      .eq('statut_generation', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !job) {
      return { message: "Aucun job en attente" };
    }

    // Lock atomique du job
    const { data: updatedJob, error: lockError } = await supabaseAdmin
      .from('etude_cours')
      .update({ statut_generation: 'en_cours' })
      .eq('id', job.id)
      .eq('statut_generation', 'pending')
      .select()
      .single();

    if (lockError || !updatedJob) {
      console.log("[Worker] Job déjà pris par un autre processus.");
      return { message: "Job déjà pris" };
    }

    try {
      // 1. Récupérer le document
      const { data: document, error: docError } = await supabaseAdmin
        .from('documents')
        .select('url_fichier')
        .eq('id', job.pdf_id)
        .single();

      if (docError || !document) throw new Error("Document introuvable");

      // 3. Télécharger le PDF
      const response = await fetch(document.url_fichier);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      await supabaseAdmin.from('etude_cours').update({ generation_hash: hash }).eq('id', job.id);

      // 4. Parser le PDF
      const pdfData = await pdfParse(buffer);
      if (pdfData.numpages > 100) throw new Error("PDF trop long");

      const text = pdfData.text;

      // 5. Phase Unique : Single-Pass Master Generation
      const { PEDAGOGICAL_MASTER_SCHEMA, getPedagogicalMasterPrompt } = await import('@/lib/prompts/pedagogicalEngine');
      
      let generatedData: any = null;
      let retryCount = 0;
      let lastGenError: any = null;
      
      while (retryCount < 2 && !generatedData) {
        try {
          const aiResponse = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: getPedagogicalMasterPrompt(text.substring(0, 80000)),
            config: {
              responseMimeType: 'application/json',
              responseSchema: PEDAGOGICAL_MASTER_SCHEMA,
              temperature: 0.2
            }
          });
          generatedData = JSON.parse(aiResponse.text || "{}");
        } catch (genError: any) {
          console.error("Gemini Single-Pass Generation Error (Retry):", genError);
          lastGenError = genError;
          retryCount++;
        }
      }

      if (!generatedData || !generatedData.intelligence_pedagogique || !generatedData.sections) {
        throw new Error("Impossible de générer un JSON valide pour le cours. Erreur: " + lastGenError?.message);
      }

      // 6. Sauvegarde de la super-intelligence
      const fullIntelligence = {
        ...generatedData.intelligence_pedagogique,
        strategie_pedagogique_sur_mesure: generatedData.strategie_pedagogique_sur_mesure
      };

      await supabaseAdmin
        .from('documents')
        .update({ intelligence_pedagogique: fullIntelligence })
        .eq('id', job.pdf_id);

      // 7. Sauvegarder les sections en DB
      for (const section of generatedData.sections) {
        const { data: sectionData, error: secError } = await supabaseAdmin
          .from('etude_sections')
          .insert({
            cours_id: job.id,
            ordre: section.ordre,
            titre: section.titre,
            synthese: section.synthese,
            questions_cloture: section.questions_cloture_section
          })
          .select()
          .single();

        if (secError) throw new Error(`Erreur insertion section: ${secError.message}`);

        for (const theme of section.themes) {
          const { error: themeError } = await supabaseAdmin
            .from('etude_themes')
            .insert({
              section_id: sectionData.id,
              ordre: theme.ordre,
              titre: theme.titre,
              explication: theme.explication,
              question_forme: theme.question_forme,
              cas_pratique_fond: theme.cas_pratique_fond,
              remediation_forme: theme.branches_remediation_forme,
              remediation_fond: theme.branches_remediation_fond
            });

          if (themeError) throw new Error(`Erreur insertion thème: ${themeError.message}`);
        }
      }

      // Tout s'est bien passé
      await supabaseAdmin.from('etude_cours').update({ statut_generation: 'pret' }).eq('id', job.id);

      // Relancer un appel HTTP pour le job suivant (évite le timeout récursif de Vercel)
      if (workerUrlStr) {
        fetch(workerUrlStr, { method: 'POST' }).catch(() => {});
      }

      return { success: true, processedJob: job.id };

    } catch (processError: any) {
      console.error("Worker Error:", processError);
      await supabaseAdmin.from('etude_cours').update({ statut_generation: 'erreur' }).eq('id', job.id);
      
      if (workerUrlStr) {
        fetch(workerUrlStr, { method: 'POST' }).catch(() => {});
      }
      return { error: processError.message };
    }

  } catch (error: any) {
    console.error("Worker Global Error:", error);
    return { error: error.message };
  }
}

export async function POST(req: NextRequest) {
  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('host') || 'localhost:3000';
  const workerUrl = `${protocol}://${host}/api/worker/process`;

  const result = await runWorker(workerUrl);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
