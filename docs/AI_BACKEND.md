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

## Preuve (tests de charge réels contre la prod)

Voir `_loadtest.mjs` (non commité). Résultats : voir la section mise à jour après le run final.

| Scénario | Attendu | Résultat |
|---|---|---|
| Reprise job mort (bail expiré) | repris + completed | PASS |
| Erreur permanente (PDF illisible) | failed, ≤2 tentatives, pas de boucle | PASS |
| Navigateur fermé (cron seul) | completed sans poke client | PASS |
| 20 PDF différents | 20 completed, Gemini=20 | _run final_ |
| 100 concurrents, PDF identique | 100 completed, Gemini=1, 0 bloqué | _run final_ |
| 300 concurrents, PDF identique | 300 completed, Gemini=1, 0 bloqué | _run final_ |
| Intégrité | chaque cours = même nb de sections, aucun doublon | _run final_ |

## Migration requise

`database/ai_jobs_canonical.sql` (appliquée en prod) : colonnes `progress/phase/next_attempt_at/
last_error/result_ref`, vocabulaire de statut canonique, index de file/lease, table `ai_content_locks`.
Le code reste fonctionnel avant/après la migration (dégradation gracieuse).
