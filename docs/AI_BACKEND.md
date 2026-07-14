# Backend IA unifié — architecture & garanties

Tous les modules IA passent par **un seul moteur de jobs asynchrones** (`ai_jobs` + worker
`/api/worker/ai`). Le frontend n'attend jamais Gemini : il **enqueue** un job puis **observe** son
état réel (`useJob`). Le backend est la **source de vérité unique**.

## Modules

| Module | Type de job | Gemini | Résultat durable |
|---|---|---|---|
| Étude Guidée | `etude` | oui | `etude_cours` / `etude_sections` / `etude_themes` |
| Évaluations | `evaluation` | oui | `evaluations` (+ `evaluation_cache`) |
| Flashcards | `flashcards` | oui | `flashcards` (dédup `source_hash`) |
| Rédaction | `redaction` | oui | `redactions.rapport_analyse` |
| Révision | — | non | répétition espacée (Leitner) sur `flashcards` |

## Cycle de vie canonique

```
pending → processing → generating → saving → completed
                                   ↘ (échec transitoire) → pending (backoff) → …
                                   ↘ (échec permanent / tentatives épuisées) → failed
```

- **pending** : en file (ou en attente d'un retry via `next_attempt_at`).
- **processing / generating / saving** : le worker travaille ; `progress` (0-100) et `phase` reflètent
  l'étape RÉELLE → l'UI n'affiche jamais de barre factice figée à 95 %.
- **completed / failed** : terminal. `useJob` déclenche `onDone` / `onError`.

## Garanties & mécanismes

1. **Lease atomique** : un seul worker passe un job `pending`/expiré → `processing` (UPDATE conditionnel).
   Un job in-flight au bail expiré (worker mort) est **repris automatiquement**.
2. **Heartbeat de bail + de verrou** : pendant l'appel Gemini (qui peut enchaîner des retries 503 sur
   plusieurs minutes), `lease_until` ET le verrou single-flight sont renouvelés toutes les 60 s → pas de
   double-lease, pas de 2ᵉ leader.
3. **Idempotence** : le JSON Gemini est persisté (`job.result.generated`) avant toute étape faillible ;
   un retry ré-exécute uniquement la sauvegarde (delete+insert), jamais Gemini.
4. **Single-flight par contenu** (`ai_content_locks`, clé = hash du texte) : un seul leader génère ; les
   autres attendent puis **clonent** le résultat. **Double-checked** : re-vérification après acquisition
   du verrou → aucune régénération même si le verrou est libéré/repris en pleine course.
5. **Dédup cross-utilisateur** : PDF identiques → **un seul appel Gemini**, tous les autres clonent.
   `etude_cours.generation_hash` a une contrainte UNIQUE ⇒ seul le cours générateur porte le hash, les
   clones sont finalisés sans hash (le générateur reste la source canonique).
6. **PDF différents** : hashes distincts → traités **en parallèle**, sans se bloquer.
7. **Backoff** : erreur transitoire (503/429/réseau) → `pending` + délai court croissant (auto-guérison,
   l'UI ne montre jamais d'erreur) ; erreur permanente (PDF illisible, JSON invalide) → `failed` après
   ≤ 2 tentatives. **Retries bornés → jamais de boucle infinie.**
8. **Timeout Gemini** : chaque tentative est bornée (timeout natif SDK + AbortController) → un appel
   bloqué ne gèle jamais le worker.
9. **Traitement garanti serveur** : déclenchement immédiat best-effort à l'enqueue + **Vercel Cron**
   (chaque minute) comme filet. Fermer le navigateur n'interrompt rien.
10. **Observation** : `/api/jobs/[id]` (RLS) renvoie `status/progress/phase` ; sur `pending` il relance
    le worker (auto-guérison même sans cron).

## Preuve (audit mocké — Fake Gemini Provider, 0 $ / 0 appel réel)

Les audits d'architecture/charge utilisent un **Fake Gemini Provider** (`payload.mock=true`) : réponses
déterministes, aucun appel Gemini. Toute la logique de concurrence est identique ; seule la génération IA
est simulée. Les appels Gemini RÉELS sont réservés à quelques scénarios de validation finale (1 PDF, 2
identiques, 2 différents) — jamais des centaines de générations de test.

| Scénario | Attendu | Résultat |
|---|---|---|
| 1 job | completed, gen=1, cours prêt | PASS ✅ |
| 2 PDF identiques | gen=1 (dédup), 2 cours prêts | PASS ✅ |
| 2 PDF différents | gen=2, 2 cours prêts | PASS ✅ |
| Retry transitoire ×2 | completed, gen=1 (idempotent), prêt | PASS ✅ (4/4 runs) |
| Erreur permanente | failed, ≤2 tentatives, stable (pas de boucle) | PASS ✅ |
| Reprise job mort (bail expiré) | repris + completed | PASS ✅ |
| Navigateur fermé (cron seul) | completed sans poke client | PASS ✅ |
| **100 concurrents, PDF identique** | 100 completed, gen=1, 0 bloqué, 100/100 prêts | PASS ✅ |
| **300 concurrents, PDF identique** | 300 completed, gen=1, 0 bloqué, 300/300 prêts | PASS ✅ |
| **500 concurrents, PDF identique** | 500 completed, gen=1, 0 bloqué | PASS ✅ |
| 50 PDF différents | 50 completed, gen=50 (aucun double) | PASS ✅ |
| Intégrité (sections) | chaque cours = 3 sections, aucun doublon | PASS ✅ (`[3]` partout) |

Robustesse anti double-génération (3 mécanismes) : idempotence (`job.result.generated` persisté de façon
fiable), heartbeat de bail + de verrou pendant la génération, double-checked locking + verrou single-flight.
Écritures idempotentes (UPSERT par position + contraintes UNIQUE) → un double-traitement rare reste
INOFFENSIF pour les données. Le coût réel est journalisé fidèlement dans `saas_metrics` (tarif 2.5 Flash).

## Migration requise

`database/ai_jobs_canonical.sql` (appliquée en prod) : colonnes `progress/phase/next_attempt_at/
last_error/result_ref`, vocabulaire de statut canonique, index de file/lease, table `ai_content_locks`.
Le code reste fonctionnel avant/après la migration (dégradation gracieuse).
