-- Patch pour autoriser les évaluations indépendantes (V2)
-- Dans la V1, chaque évaluation devait obligatoirement être liée à un cours.
-- Dans la V2, les évaluations peuvent être générées directement depuis un document (PDF).
-- Il faut donc rendre la colonne cours_id optionnelle (NULL).

ALTER TABLE public.evaluations ALTER COLUMN cours_id DROP NOT NULL;
