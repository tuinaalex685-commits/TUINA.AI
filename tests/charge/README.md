# Tests de charge SJP (k6)

Objectif : trouver le palier où SJP **ralentit**, puis celui où il **casse**, scénario par scénario, avant les vrais étudiants.
Paliers : 10 → 25 → 50 → 100 → 250 → 500 → 1 000 utilisateurs simultanés. On s'arrête au premier seuil franchi, on corrige, on reprend.

**Jamais sur la production.** `lib.js` refuse les adresses de production (seule exception : `PROD_LEGER=1`, 50 utilisateurs au plus).

## Environnement de test (une fois)

1. Projet Supabase **de test** (gratuit), même région que la production (`eu-central-1`) ; y appliquer le schéma et les migrations.
2. Dans ce projet : *Authentication → Sign In* : désactiver « Confirm email » (les adresses `@sjp-test.invalid` ne reçoivent rien). Garder les limites de débit par défaut pour le scénario `inscription`/`connexion`, puis les relever pour les autres scénarios (sinon on ne mesure que la limite).
3. Déploiement Vercel **de préversion** branché sur ce projet, avec :
   - `AI_MOCK_ENABLED=1`, `AI_MOCK_ALL=1`, `AI_MOCK_DELAY_MS=15000` (Gemini simulé, durée réaliste, 0 $) ;
   - `APP_URL=<adresse de la préversion>`, `CRON_SECRET`, `GEMINI_MAX_INFLIGHT=12`.
4. Données : `TEST_SUPABASE_URL=… TEST_SUPABASE_SERVICE_KEY=… node tests/charge/seed.mjs`
5. Identifiants d'actions : `BASE_URL=… SUPABASE_URL=… SUPABASE_ANON_KEY=… node tests/charge/action-ids.mjs`

## Lancer un palier

```
k6 run -e SCENARIO=mixte -e VUS=10 -e BASE_URL=… -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=… tests/charge/scenarios.js
```

Scénarios : `inscription`, `connexion`, `code_distinct`, `code_meme`, `expiration`, `etude_distinct`, `etude_meme`, `redaction`, `mixte`, `endurance` (`-e DUREE=6h`).

## Lire le résultat

| Mesure | « Ça tient » si | Ce qu'elle révèle |
|---|---|---|
| `http_req_failed` | < 1 % | erreurs serveur (Vercel, base) |
| `sjp_page_ms` p95 | < 2,5 s | pages lentes |
| `sjp_erreurs_metier` | < 2 % | actions refusées à l'étudiant |
| `sjp_refus_affluence` | 0 | limites d'authentification Supabase |
| `sjp_attente_ia_ms` | à suivre par palier | file IA (plafond `GEMINI_MAX_INFLIGHT`) |
| `sjp_jobs_echoues` | 0 | traitements perdus |

À la fin : `node tests/charge/seed.mjs --nettoyer`.
