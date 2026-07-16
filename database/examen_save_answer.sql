-- ==============================================================================
-- SECTION EXAMEN — EX.2b : SAUVEGARDE ATOMIQUE D'UNE RÉPONSE (anti lost-update)
-- L'auto-save faisait un read-modify-write de `answers` côté serveur : deux
-- sauvegardes quasi simultanées pouvaient s'écraser (une réponse perdue).
-- Cette RPC fusionne UNE réponse EN UNE SEULE instruction atomique : le `||`
-- lit la valeur courante de la ligne verrouillée pendant l'UPDATE → jamais de
-- perte, même sous saves concurrents. Idempotente par position (dernière valeur
-- gagne pour une même position, ce qui est le comportement voulu).
--
-- N'écrit QUE si la session est encore 'in_progress' ET appartient à l'user →
-- une réponse tardive/après soumission est refusée (RETURNING vide → NULL).
-- SECURITY DEFINER : appelée par le serveur (service role) ; user_id passé
-- explicitement. Rejouable (CREATE OR REPLACE).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.examen_save_answer(
  p_session_id UUID,
  p_user_id UUID,
  p_position TEXT,
  p_answer JSONB
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.examen_sessions
     SET answers = COALESCE(answers, '{}'::jsonb) || jsonb_build_object(p_position, p_answer),
         updated_at = NOW()
   WHERE id = p_session_id
     AND user_id = p_user_id
     AND status = 'in_progress'
  RETURNING TRUE;
$$;
