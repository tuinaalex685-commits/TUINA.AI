# SGP — MASTER PLAN

> Document de référence du projet SGP / SJP (dépôt `TUINA.AI`). À mettre à jour après chaque intervention significative.
>
> **Version 1.0 — 2026-10-16** — Audit initial (phase A) et conception produit. **Aucune modification de code, de base de données ou de production n'a été faite.**
>
> Légende des statuts de constat :
> - **CONFIRMÉ (code)** : prouvé par la lecture du code ; reste à reproduire par un test.
> - **CONFIRMÉ (test)** : reproduit par un test.
> - **À VÉRIFIER** : hypothèse sérieuse qui demande un test, ou l'accès à la base de production.
> - **RECOMMANDATION** : pas un défaut, une amélioration.

---

## Sommaire

1. Résumé du projet et architecture réelle
2. Fonctionnalités existantes et niveaux d'accès
3. Constats confirmés (bugs et failles) avec étapes de reproduction
4. Problèmes à vérifier
5. Les 5 priorités
6. Registre des tâches (critique, élevée, moyenne, faible)
7. Audit de sécurité : état des vérifications
8. Vision produit (synthèse des 4 prompts)
9. Cartographie actuelle et écarts avec la vision
10. Parcours étudiant cible : du PDF à l'évaluation
11. Pédagogie attendue : synthèses, Études guidées, schémas, carte mentale
12. Rédaction et documents de méthodologie
13. Examens : progression par paliers (tableau à valider)
14. Collecte et analyse des résultats
15. Système de points et bonus BD
16. Réutilisation des analyses, quotas et coûts
17. Navigation cible
18. Impacts : base de données, API, quotas, sécurité, interface
19. Plan de tests Playwright
20. Plan de tests de charge k6
21. Validation pédagogique
22. Risques, dépendances et coûts
23. Plan de développement par étapes
24. Questions à trancher
25. Journal des décisions, changements et tests

---

## 1. Résumé du projet et architecture réelle

SGP (marque affichée : « SJP ») est une plateforme d'apprentissage pour étudiants en sciences juridiques et politiques, en Afrique francophone (le fuseau de référence dans le code est le Burkina Faso). Elle propose un accès gratuit (Free) et un accès Premium.

| Élément | Constat réel (lu dans le dépôt) |
|---|---|
| Framework | **Next.js 16.2.9** (App Router), **React 19.2.4**, TypeScript. `AGENTS.md` : cette version de Next.js a des changements incompatibles, lire `node_modules/next/dist/docs/` avant de coder. |
| Styles | **CSS Modules et styles en ligne**. Tailwind n'est **pas** installé, contrairement à la stack annoncée. |
| Auth et BDD | Supabase (`@supabase/ssr`, `@supabase/supabase-js`). Trois clients : navigateur (`lib/supabase/client.ts`), serveur avec cookies (`server.ts`), **service role** (`admin.ts`). |
| IA | `@google/genai`, modèle **gemini-2.5-flash** (`lib/gemini.ts`). Nouvelles tentatives et délai maximal (timeout) en cas d'échec, suivi des coûts dans `saas_metrics`, **coupe-circuit budgétaire** global (5 $/jour et 50 $/mois par défaut). |
| Tâches IA | Un moteur de jobs unifié : table `ai_jobs` et worker `/api/worker/ai`. Les jobs sont réclamés de façon atomique (`claim_ai_job`). Un seul job génère un contenu donné à la fois (`ai_content_locks`). Les contenus identiques sont partagés entre utilisateurs (`source_hash`). Documenté dans `docs/AI_BACKEND.md`. |
| Ancien pipeline | `/api/worker/process` (génération d'Étude pilotée par `etude_cours.statut_generation`), **toujours planifié** (voir C-07). |
| Cron Vercel | `vercel.json` : `/api/worker/ai` et `/api/worker/process` **chaque minute**. `maxDuration` 300 s, ce qui suppose l'offre Vercel Pro. |
| PDF | Extraction par `pdf-parse` (texte seulement : un PDF scanné est refusé). **`puppeteer` est installé mais n'est utilisé nulle part dans `src/`.** Aucun export PDF n'existe. |
| Fichiers | Bucket Supabase Storage `documents`, déclaré **public** (`phase0_infrastructure.sql`) et lu par `getPublicUrl`. |
| Base de données | 35 fichiers `.sql` dans `database/`, **sans outil de migration ni ordre d'application**. L'état réel de la production n'est pas connaissable depuis le dépôt (voir V-01). |
| Tests | **Aucun test automatisé** : pas de Playwright, pas de k6, pas de script `test` dans `package.json`. Une vingtaine de scripts de diagnostic sont à la racine (`verify-prod.mjs`, `clean_db.mjs`, `test-gemini.mjs`…), dont certains touchent la vraie base. |
| Taille | Environ 14 500 lignes TS/TSX ; les plus gros fichiers sont `worker/ai/route.ts` (1 071 lignes) et `EtudeEngine.tsx` (751 lignes). |
| Middleware | `src/middleware.ts` vérifie la session et redirige les non-admins hors de `/admin`. Il lit `user_roles` **à chaque requête** (voir P-03). |

### Flux principal actuel

```
PDF (navigateur) ──upload──▶ Storage public + ligne `documents` (insérée par le navigateur)
        │
        ▼
POST /api/etude/generate ──▶ ai_jobs(type=etude) ──▶ worker /api/worker/ai
        │                                   ├─ pdf-parse → extracted_text (tronqué à 50 000 caractères)
        │                                   ├─ hash du texte → clone si un cours identique est prêt
        │                                   └─ sinon 1 appel Gemini (« prompt maître ») → sections/thèmes
        ▼
Étude guidée (EtudeEngine) ─▶ QCM « forme » + cas pratique « fond » (/api/etude/evaluate, Gemini)
        │
        ├─▶ Révisions (flashcards, Leitner)        ├─▶ Évaluations (QCM, ouvertes…)
        └─▶ Examen (banque de 27 questions par contenu, correction déterministe)
Rédaction (Premium) ─▶ ai_jobs(type=redaction) ─▶ correction Gemini de la copie
```

---

## 2. Fonctionnalités existantes et niveaux d'accès

| Section (route) | Free | Premium | Coût IA | Remarques |
|---|---|---|---|---|
| Tableau de bord `/app/dashboard` | oui | oui | non | |
| Catalogue `/app/catalogue` | oui (vitrine) | caché | non | Cours publiés par l'admin (`catalog_courses`). |
| Étude guidée `/app/etude` | **caché dans le menu** ; accessible via le catalogue (`/app/etude/catalogue/[id]`) | oui | génération : 1 appel par contenu ; correction de cas pratique : 1 appel par réponse | Import personnel réservé au Premium (`/api/etude/generate`). |
| Correction de cas pratique (Étude) | 15/jour | illimité | 1 appel par réponse | `/api/etude/evaluate`. |
| Révisions `/app/revisions` | 5 sessions/jour | illimité | flashcards partagées par `source_hash` | Répétition espacée (Leitner). |
| Examen `/app/examen` | 10/jour, mode standard | illimité, plus le mode adaptatif | génération d'une banque par contenu, puis 0 | Correction déterministe ; le corrigé reste côté serveur. |
| Évaluations `/app/evaluations` | **absent du menu** | **absent du menu** | 1 appel par contenu, type et nombre de questions | Accessible seulement depuis la fin d'une Étude (`EtudeEngine.tsx:738`). |
| Rédaction `/app/redaction` | verrouillé | 3 corrections/jour | 1 appel par copie | Types Dissertation, Cas pratique, Commentaire d'arrêt. Sujet libre seulement. La correction **ne lit pas le cours**. |
| Objectifs, Matières, Bibliothèque | verrouillé | oui | non | |
| Progression `/app/progression` | oui | oui | non | Maîtrise par thème (`lib/etude/mastery.ts`, `lib/examen/analytics.ts`). |
| Admin `/admin/dashboard` | non | non (rôle admin) | non | Codes d'accès, catalogue, métriques, coûts Gemini. |

**Règle Premium actuelle** (`lib/plan.ts`) : Premium si un code `access_codes` **actif** est lié à l'email (comparaison `ilike`), ou si le compte est admin. Le statut est recalculé à chaque requête, jamais stocké.

**Création de compte** :
1. **Free** : `signUpFree` (inscription Supabase publique, confirmation par email). Un trigger `handle_new_user` crée la ligne `user_roles`.
2. **Code d'accès** : `loginWithAccessCode`. **Le code sert de mot de passe.** Un code « vierge » (sans email) est rattaché au premier email qui le saisit.

---

## 3. Constats confirmés (bugs et failles)

### C-01 — Prise de contrôle de n'importe quel compte, administrateur compris, avec un code d'accès vierge — **CRITIQUE — CONFIRMÉ (code)**

- **Emplacement** : `src/app/actions/auth.ts`, lignes 98 à 213 (cas B) et 141 à 171.
- **Mécanisme** :
  1. L'admin crée les codes **sans email** (`createAccessCode`, avec `email: null`).
  2. Une personne qui détient un code vierge (n'importe quel étudiant qui a payé, ou quelqu'un à qui le code a été transmis) saisit **l'email d'une victime** et ce code.
  3. La victime n'a pas encore de code : l'email lui est donc attribué, puis `user_roles` est trouvé par email et `supabaseAdmin.auth.admin.updateUserById(victime, { password: code })` **remplace le mot de passe de la victime par le code**.
  4. La connexion finale ouvre une session **sur le compte de la victime**.
- **Cibles** : tout compte sans code (tous les comptes Free) et **l'administrateur**, qui n'a en général pas de code. Ses droits admin viennent de `user_roles`, donc l'attaquant obtient l'accès à `/admin`.
- **Effet secondaire** : le même chemin **lève tout bannissement** (`ban_duration: "none"`).
- **Reproduction (locale ou staging uniquement)** : créer un compte A (Free) et un code vierge C. Se connecter avec (email de A, C). Résultat attendu aujourd'hui : on est connecté en tant que A et le mot de passe de A a changé.
- **Correction proposée** : ne jamais modifier le mot de passe d'un compte existant depuis ce flux. Pour un compte existant, exiger une connexion avec son vrai mot de passe, puis une action « activer mon code » **une fois connecté**. Rattacher un code à `auth.uid()`, pas à un email saisi. Ajouter une limite de tentatives (rate limiting).

### C-02 — Toute personne connectée peut insérer directement des jobs IA (contournement du Premium, des quotas et du contrôle d'appartenance) — **ÉLEVÉE — CONFIRMÉ (code + SQL), état en production À VÉRIFIER**

- **Emplacement** : `database/ai_jobs.sql:33` (`ai_jobs_insert_own WITH CHECK (auth.uid() = user_id)`) et `worker/ai/route.ts`. Les fonctions `processEtude`, `processFlashcards` et `processRedaction` **ne revérifient pas** que le document ou la rédaction appartient à `job.user_id`.
- **Scénario** : avec la clé publique (anon) et son propre jeton, un utilisateur insère `ai_jobs {type:'flashcards', payload:{documentId: <document d'autrui>}}`. Le worker lit le texte privé avec le service role et crée des flashcards **pour l'attaquant** : le contenu privé fuit. Même schéma avec `redaction` et `etude`.
- **Correction** : supprimer la politique INSERT sur `ai_jobs` (création uniquement via le serveur) **et** revérifier l'appartenance dans le worker (défense en profondeur).

### C-03 — Le mode de test (`mock`) est contrôlé par le client et empoisonne les caches partagés — **ÉLEVÉE — CONFIRMÉ (code)**

- **Emplacement** : `worker/ai/route.ts:89` (`isMockJob` lit `payload.mock`), `enqueueAiJob` qui accepte n'importe quel `payload`, et `processEvaluation` / `processFlashcards`. Contrairement à l'Étude et à la banque d'examen, ces deux traitements écrivent les données factices **sous le vrai `source_hash`** (`evaluation_cache`, `flashcards`).
- **Scénario** : un compte Free appelle `enqueueAiJob('flashcards', {documentId: <cours du catalogue>, mock: true})` avant toute génération réelle. Tous les étudiants qui révisent ensuite ce cours reçoivent « Carte 1 / Réponse 1 ».
- **Correction** : n'accepter `mock` que si une variable d'environnement de test est active et que l'environnement n'est pas la production. Filtrer `payload` sur une liste de champs autorisés. Préfixer `mock:` toutes les clés de cache.

### C-04 — Contournement du Premium et des quotas via `enqueueAiJob` — **ÉLEVÉE — CONFIRMÉ (code)**

- **Emplacement** : `src/app/actions/jobs.ts`.
- **Constat** :
  - `type:'etude'` **ne vérifie pas le Premium** ni la limite de 5 par heure, qui n'existent que dans `/api/etude/generate`.
  - `type:'evaluation'` n'a **aucun quota**.
  - Le quota Rédaction (3/jour) compte les rédactions **créées aujourd'hui** au statut `analyse`. Une rédaction créée la veille peut donc être corrigée sans limite, et deux requêtes simultanées passent toutes les deux (vérification non atomique).
  - `payload.redactionId` **n'est pas contrôlé** : un job peut cibler la rédaction d'un autre utilisateur, réécrire son `rapport_analyse` et exposer la correction dans `ai_jobs.result` de l'attaquant (identifiant UUID à connaître).
- **Impact** : des coûts Gemini non bornés par utilisateur. Seul le coupe-circuit global (5 $/jour) protège, et **son épuisement bloque toute la plateforme** pour la journée (déni de service par coût).

### C-05 — Les PDF des étudiants sont publics — **ÉLEVÉE (confidentialité) — CONFIRMÉ (code + SQL), réglage du bucket en production À VÉRIFIER**

- Le bucket `documents` est créé avec `public = true` et l'application utilise `getPublicUrl`. Les politiques RLS de Storage ne protègent **pas** les URL publiques : quiconque obtient l'URL (partage, historique, journaux) lit le PDF, sans authentification.
- **Correction** : bucket privé, URL signées à courte durée générées côté serveur, migration des URL existantes.

### C-06 — Le navigateur fixe librement `url_fichier` et le serveur va chercher cette URL (SSRF) — **MOYENNE — CONFIRMÉ (code)**

- `DocumentUploader.tsx` insère la ligne `documents` **depuis le navigateur**, avec `url_fichier` choisi par le client. La politique RLS d'insertion ne contrôle que `user_id`. Le worker exécute ensuite `fetch(doc.url_fichier)` (`worker/ai/route.ts:182`, `worker/process/route.ts:121`).
- **Risques** : le serveur appelle des URL arbitraires (SSRF), et un texte arbitraire peut être injecté dans les caches partagés. Le navigateur peut aussi fournir `extracted_text` directement si la colonne est modifiable (à vérifier).
- **Correction** : créer la ligne `documents` côté serveur, à partir du chemin Storage seulement, avec téléchargement via le SDK Storage et jamais via une URL libre.

### C-07 — Deux pipelines d'Étude concurrents : double génération Gemini possible — **ÉLEVÉE (coût) — CONFIRMÉ (code), à reproduire**

- Le nouveau worker crée `etude_cours` au statut `en_cours` **sans `heartbeat`** (`worker/ai/route.ts:777`). L'ancien worker (`/api/worker/process`, cron chaque minute) considère tout `en_cours` dont `heartbeat` est nul comme « zombie », le repasse en `pending`, puis **le génère à nouveau avec son propre appel Gemini** (`worker/process/route.ts:15-60, 276`).
- **Correction** : retirer `/api/worker/process` du cron après vérification qu'aucun cours n'en dépend encore. Garder le code, désactivé, le temps de la transition.

### C-08 — Un code bloqué ou désactivé ouvre quand même une session — **MOYENNE — CONFIRMÉ (code)**

- Dans le cas 1 (`auth.ts:11-49`), `signInWithPassword` **pose déjà le cookie de session** avant le contrôle du statut du code. L'utilisateur voit « accès bloqué » mais il est connecté (en Free).
- **Correction** : contrôler avant la connexion, ou appeler `signOut()` en cas de refus. Utiliser le bannissement Supabase pour un vrai blocage.

### C-09 — Un Free qui reçoit un code perd son mot de passe sans le savoir — **MOYENNE (persistance Premium et ergonomie) — CONFIRMÉ (code)**

- Un compte créé par `signUpFree`, avec un mot de passe personnel, qui saisit son code : son mot de passe est **remplacé par le code**. Il ne peut plus se connecter avec son ancien mot de passe, ce qui génère des tickets de type « je n'arrive plus à me connecter ».
- C'est la même racine que C-01 ; la même correction s'applique.

### C-10 — Comparaisons d'email avec `ilike` : les caractères `_` et `%` servent de jokers — **MOYENNE — CONFIRMÉ (code), exploitabilité À VÉRIFIER**

- `lib/plan.ts` (`hasActiveAccessCode`, `isAdminEmail`) et `auth.ts` (`existingCodes`, `existingRole`) comparent avec `ilike(email)` sans échapper les jokers. Un email qui contient `_` correspond à d'autres caractères, ce qui permet potentiellement d'**hériter du Premium** d'un autre compte du même domaine. Dans `auth.ts`, l'email n'est même pas vérifié (pas de confirmation sur ce chemin).
- **Correction** : normaliser les emails en minuscules au stockage et comparer avec `eq`.

### C-11 — Le prompt maître ne voit que les 50 000 premiers caractères du cours — **MOYENNE (pédagogie) — CONFIRMÉ (code)**

- `getPedagogicalMasterPrompt(text.substring(0, 50000))` : un polycopié long est **tronqué sans le signaler**, alors que la vision exige d'analyser l'ensemble du document. Même chose avec 80 000 caractères pour les évaluations et les flashcards.

### C-12 — Le prompt maître présume les intentions des enseignants — **MOYENNE (pédagogie) — CONFIRMÉ (code)**

- Le schéma demande `erreurs_90_pourcent`, `pieges_enseignants`, `questions_qui_tombent_souvent`, `questions_qui_ne_tombent_jamais`, `notions_secondaires`, `articles_essentiels` et `jurisprudences_importantes` **sans référence au document**. Cela contredit deux règles de la vision : ne jamais affirmer ce que pense le professeur, et ne jamais inventer de références.

### C-13 — Aucun en-tête de sécurité HTTP — **FAIBLE — CONFIRMÉ (code)**

- `next.config.ts` est vide : pas de CSP, pas de `X-Frame-Options` ou `frame-ancestors`, pas de `Referrer-Policy`, pas de HSTS explicite.

### C-14 — Le premier compte créé devient administrateur — **FAIBLE — CONFIRMÉ (code)**

- `auth.ts` (cas A) et le trigger `handle_new_user` donnent le rôle admin si `user_roles` est vide. C'est sans risque tant que la table n'est jamais vidée, mais dangereux sur un nouvel environnement (staging, restauration).

### C-15 — Lenteur : jusqu'à environ 10 allers-retours vers la base, en série, avant d'afficher une page — **ÉLEVÉE (latence) — CONFIRMÉ (code)**

À chaque navigation dans `/app`, les requêtes s'enchaînent **l'une après l'autre** :
1. le middleware (`auth.getUser()` et `user_roles`) ;
2. le layout `app/app/layout.tsx` (`auth.getUser()`, `user_roles`, puis `isPremium()`, qui fait 2 requêtes : `access_codes` puis `user_roles`) ;
3. la page elle-même (`auth.getUser()`, `isPremium()` avec 2 requêtes de plus, puis les données).

Exemple : la page Matières déclenche environ 10 appels séquentiels. La page Étude enchaîne 6 lectures (document, cours, sections, thèmes, progression des sections, progression des thèmes), alors que plusieurs sont indépendantes.

- **Correction** : mettre en cache par requête le contexte utilisateur et le plan (`React.cache`) ; paralléliser les lectures indépendantes (`Promise.all`) ; ne garder qu'une lecture de rôle.

### C-16 — Lenteur : Bibliothèque et Matières chargent le texte intégral de tous les PDF — **ÉLEVÉE (latence) — CONFIRMÉ (code)**

- `bibliotheque/page.tsx:34`, `matieres/[matiereId]/page.tsx` et `matieres/[matiereId]/cours/[coursId]/page.tsx` font `documents.select('*')`. Cela inclut `extracted_text` (le texte complet de chaque PDF, souvent plusieurs centaines de Ko) et `intelligence_pedagogique` (gros JSON). Tout est **envoyé au navigateur** dans les props des composants clients.
- Avec 10 cours, la page peut transporter plusieurs Mo inutiles, ce qui pèse sur des connexions mobiles lentes.
- La page Étude envoie aussi l'intégralité de `intelligence_pedagogique` et toutes les colonnes des thèmes au client.
- **Correction** : sélectionner uniquement les colonnes affichées.

---

## 4. Problèmes à vérifier

| ID | Hypothèse | Comment vérifier |
|---|---|---|
| V-01 | L'état réel des tables et politiques RLS en production diffère des fichiers `database/`. Par exemple, `module_etude.sql` contient `USING (true)` sur `etude_cours`, `etude_sections` et `etude_themes`, remplacé ensuite par `catalog_public.sql`. | Supabase Security Advisor et export des politiques (`pg_policies`), **en lecture seule**, avec ton autorisation. |
| V-02 | Le bucket `documents` est public en production. | Tableau de bord Supabase, onglet Storage, ou une requête anonyme sur une URL de test. |
| V-03 | La colonne `extracted_text` (et d'autres) peut être écrite par le navigateur à l'insertion. | Test local : insertion avec la clé anon. |
| V-04 | Next.js 16 : le fichier `middleware.ts` est déprécié au profit de `proxy.ts`. | Lire `node_modules/next/dist/docs/` après `npm ci`. |
| V-05 | `/api/etude/progress` accepte des progressions déclarées par le client sans preuve. C'est un enjeu pour les points et le déblocage des examens. | Lecture complète de la route et test. |
| V-06 | Le build (`next build`) et le lint passent. | `npm ci` puis `npm run build` et `npm run lint` en local. |
| V-07 | La lecture complète de `saas_metrics` à **chaque** appel Gemini (coupe-circuit) ralentit à l'échelle et laisse passer les appels si la lecture échoue. | Analyse avec `EXPLAIN` et un test k6 sur le worker en mode `mock`. |
| V-08 | L'historique git contient des secrets. Le clone local est superficiel : un seul commit a été vérifié. | `gitleaks` sur un clone complet. |
| V-09 | Le déclenchement du worker utilise l'en-tête `Host` de la requête pour envoyer `CRON_SECRET`, ce qui ferait fuir le secret si l'en-tête était falsifiable. | Test sur une prévisualisation Vercel. Vercel route normalement par `Host`, donc le risque est faible. |
| V-10 | Les parcours Bibliothèque, Matières et Chapitres présentent des dysfonctionnements (associations document ↔ matière). | Parcours Playwright E2E. |

---

## 5. Les 5 priorités

1. **P1 — Sécuriser la connexion par code** (C-01, C-08, C-09, C-10). C'est la seule faille qui donne l'accès administrateur.
2. **P2 — Fermer les chemins de création de jobs IA** (C-02, C-03, C-04). Ils exposent des contenus privés, empoisonnent les caches partagés et laissent filer les coûts. Cela inclut le quota Rédaction atomique et un quota pour Évaluations.
3. **P3 — Rendre les PDF privés et faire créer les documents par le serveur** (C-05, C-06).
4. **P4 — Arrêter le double pipeline d'Étude** (C-07). Cela économise des appels Gemini et supprime les états incohérents.
5. **P5 — Mettre en place un filet de tests** : Playwright sur les parcours d'authentification et Free/Premium, plus des tests d'autorisation négatifs, avant toute refonte pédagogique.

---

## 6. Registre des tâches

Format de chaque tâche : identifiant, description, priorité, preuves, étapes, statut, dépendances, critère d'acceptation.

### Critique

| ID | Description | Preuves | Étapes | Statut | Dépend. | Critère d'acceptation |
|---|---|---|---|---|---|---|
| T-01 | Refonte du flux code d'accès : plus de réinitialisation de mot de passe, code rattaché à `auth.uid()` | C-01, C-09 | 1) test Playwright rouge reproduisant C-01 en local ; 2) séparer « se connecter » et « activer un code » ; 3) parcours de migration pour les étudiants qui se connectent aujourd'hui avec leur code comme mot de passe ; 4) limite de tentatives | À faire, **autorisation requise** | T-20 | Le test C-01 échoue avant la correction et passe après ; un étudiant existant garde son accès ; un admin ne peut être visé par aucun code. |

### Élevée

| ID | Description | Preuves | Étapes | Statut | Dépend. | Critère d'acceptation |
|---|---|---|---|---|---|---|
| T-02 | Supprimer la politique INSERT sur `ai_jobs` et revérifier l'appartenance dans le worker | C-02 | SQL (migration à valider) et contrôles dans `processEtude`, `processFlashcards` et `processRedaction` | À faire, **migration à autoriser** | V-01 | L'insertion directe avec la clé anon est refusée ; un job sur une ressource d'autrui échoue (`denied`). |
| T-03 | `mock` réservé aux tests, liste blanche des champs de `payload` | C-03 | Contrôle par variable d'environnement ; préfixe `mock:` partout | À faire | — | En production, un job `mock:true` est traité comme un vrai job, ou refusé. |
| T-04 | Quotas côté serveur pour `etude` (Premium et limite de 5/h), `evaluation` et `redaction` (atomique) | C-04 | Faire passer tous les chemins par `consumeQuota` ; ajouter les types `evaluation` et `redaction` dans `free_daily_quotas` | À faire | T-02 | 20 requêtes simultanées ne dépassent jamais le quota (test). |
| T-05 | Bucket privé et URL signées | C-05 | Migration Storage ; régénérer les liens à l'affichage | À faire, **autorisation production** | V-02 | Une URL de PDF sans jeton renvoie 400 ou 403. |
| T-06 | Création des documents côté serveur, sans `fetch` d'URL libre | C-06 | Server action `registerDocument(path)` ; le worker lit via `storage.download` | À faire | T-05 | Insérer `url_fichier=http://exemple` est impossible. |
| T-07 | Désactiver le cron `/api/worker/process` | C-07 | Vérifier qu'aucun `etude_cours` ne dépend encore de ce pipeline ; retirer la ligne de `vercel.json` | À faire | V-01 | Aucun cours ne passe `en_cours` → `pending` tout seul ; une seule ligne `worker_master` par contenu dans `saas_metrics`. |
| T-20 | Mettre en place Playwright (local) et les tests de non-régression d'authentification | Absence de tests | `@playwright/test` en dépendance de dev (**nouvelle dépendance, à valider**) ; projet Supabase de test | À faire | Projet Supabase de test | La CI exécute les tests critiques à chaque commit. |

### Moyenne

| ID | Description | Preuves | Statut | Critère d'acceptation |
|---|---|---|---|---|
| T-08 | Corriger le refus « code bloqué » qui laisse une session ouverte | C-08 | À faire | Après le refus, aucun cookie de session n'est présent. |
| T-09 | Emails normalisés et comparés par égalité stricte | C-10 | À faire | Un email avec `_` n'hérite d'aucun droit. |
| T-10 | Analyse de document complète (au-delà de 50 000 caractères) | C-11 | Conception (§ 16) | Un PDF de 200 pages est couvert en entier, et une troncature est signalée si elle reste nécessaire. |
| T-11 | Prompt maître « fidèle au document » | C-12 | Conception (§ 11) | Chaque élément porte une référence (page ou section) ou la mention « hors document ». |
| T-12 | Évaluations visibles dans la navigation | § 17 | Conception | Accès depuis le menu et depuis chaque cours. |
| T-21 | Latence : contexte utilisateur et plan mis en cache par requête, lectures parallèles | C-15 | À faire | Moins de 4 allers-retours séquentiels avant le rendu d'une page `/app` |
| T-22 | Latence : sélection de colonnes ciblée (Bibliothèque, Matières, Cours, Étude) | C-16 | À faire | Aucune page n'envoie `extracted_text` au navigateur |
| T-13 | Coupe-circuit budgétaire : agrégation SQL et budget par utilisateur | V-07, C-04 | À faire | Le budget est calculé par une seule requête agrégée ; un utilisateur ne peut pas épuiser le budget global. |

### Faible

| ID | Description | Statut |
|---|---|---|
| T-14 | En-têtes de sécurité (CSP, `frame-ancestors`, `Referrer-Policy`) | À faire |
| T-15 | Garde-fou « premier compte = admin » désactivé hors initialisation | À faire |
| T-16 | Ranger les scripts de diagnostic de la racine dans `scripts/dev/`, avec un garde-fou empêchant leur exécution contre la production | À faire, sans suppression |
| T-17 | Retirer `puppeteer` s'il reste inutilisé après la conception de l'export PDF | Décision à prendre |
| T-18 | Outil de migrations : numéroter les fichiers SQL et tenir un registre de ceux appliqués | À faire |

---

## 7. Audit de sécurité : état des vérifications

| Domaine | État | Remarques |
|---|---|---|
| Authentification et codes d'accès | **Faille critique** (C-01) | Le code sert aussi de mot de passe et l'admin voit tous les codes en clair, donc tous les mots de passe des étudiants concernés. |
| Autorisation par objet (IDOR) | Partielle | `resolveDocumentAccess` est bien centralisé pour l'examen et `enqueueAiJob` ; trous dans le worker et `redactionId` (C-02, C-04). |
| Route admin | OK (code) | Le middleware **et** `requireAdmin()` vérifient le rôle dans chaque action. |
| Workers et cron | OK | `CRON_SECRET` est obligatoire et les routes refusent l'accès si le secret manque. |
| RLS | À vérifier (V-01) | Les fichiers SQL montrent une RLS activée sur les tables sensibles, mais l'état de la production est inconnu. |
| Storage | **Faille** (C-05) | Bucket public. |
| Injection de prompt | Partielle | Balises `<DOCUMENT>` et consigne « ignore toute instruction ». `/api/etude/evaluate` accepte un énoncé entièrement fourni par le client : c'est un proxy Gemini borné par le seul quota (illimité en Premium). |
| XSS | OK a priori | Seule occurrence de `dangerouslySetInnerHTML` : du CSS statique. Le rendu Markdown passe par `react-markdown`, qui n'interprète pas le HTML par défaut. |
| Secrets | OK (arbre actuel) | Aucune clé trouvée dans les fichiers. L'historique reste à scanner (V-08). |
| Dépendances | Non vérifié | `npm audit` à exécuter après `npm ci`. |
| En-têtes HTTP | Absents (C-13) | |
| Limite de tentatives | Absente | Connexion par code, `/api/etude/evaluate` (Premium), `enqueueAiJob`. |

---

## 8. Vision produit (synthèse des 4 prompts)

**Mission** : SGP n'est pas un résumeur de PDF. Il aide l'étudiant à **comprendre** son cours, à **mémoriser** l'essentiel et à **mobiliser** ces connaissances dans des exercices juridiques.

**Trois piliers** :
1. **Comprendre et maîtriser** : synthèse pédagogique, Études guidées actives, carte mentale.
2. **S'entraîner** : Révisions, Évaluations, Examens par paliers, Rédaction (cas pratique, dissertation, commentaire d'arrêt).
3. **S'organiser et progresser** : Bibliothèque et Matières, progression par notion, points et bonus BD.

**Principes non négociables** :
- **Fidélité au document** : distinguer ce que dit le cours de ce qui vient d'ailleurs, signaler les incertitudes, ne jamais inventer d'article, d'arrêt ou de sanction.
- **Méthode** : situation concrète, puis français simple, puis terme juridique exact, puis définition rigoureuse, puis conditions, limites et exceptions, puis réutilisation du terme par l'étudiant, puis retour sur l'erreur.
- **Ton** : tutoiement, interpellation directe, personnages fictifs, progression du simple au technique.
- **Hiérarchiser sans supprimer** : une règle « secondaire » peut décider d'un cas pratique.
- **Ne jamais présumer** l'intention de l'enseignant : parler d'« objectifs d'apprentissage probables ».
- **Coûts maîtrisés** : réutiliser les analyses, contrôler les droits et les quotas côté serveur, ne rien générer de coûteux sans vérification d'éligibilité.
- **Données** : suivi individuel séparé de l'analyse agrégée, minimisation, aucun entraînement de modèle sans décision explicite.

---

## 9. Cartographie actuelle et écarts avec la vision

| Exigence | Existant | Écart |
|---|---|---|
| Analyse complète du PDF avec références | Prompt maître unique, texte tronqué à 50 000 caractères, sans numéros de page (`pdf-parse` aplatit le texte) | **Important** : pas de références, troncature silencieuse. |
| Hiérarchie sans suppression | `notions_fondamentales` / `notions_secondaires` | Partiel : pas de justification de priorité, ni d'incertitude. |
| Méthode en 7 étapes par notion | `EtudeEngine` : explication, QCM « forme », cas pratique « fond » corrigé par Gemini, remédiation (« explique autrement », exercice à trous) | **Bonne base** : manquent la situation concrète d'entrée, la reformulation libre et l'exercice de vocabulaire exact. |
| Ton direct, tutoiement, personnages | Prompt de « Maître de conférences exigeant » | À réécrire (§ 11). |
| Schémas pédagogiques | Inexistants | À créer. |
| Synthèse téléchargeable avant le parcours | `etude_sections.synthese` : courtes synthèses par section, non téléchargeables | **Absente** en tant que document. |
| Carte mentale en fin de parcours | `intelligence_pedagogique` est décrite comme « carte mentale » mais **jamais affichée sous forme visuelle** | **Absente**. |
| Rappel actif, révision espacée | Flashcards en Leitner, mutualisées | **Existe** ; à relier aux notions mal maîtrisées. |
| Suivi des notions maîtrisées | Maîtrise par thème (Étude) et EMA par thème (Examen) | **Existe** ; à unifier dans une vue « mes lacunes ». |
| Rédaction en 3 compartiments | Un seul formulaire avec un sélecteur de type ; cours optionnel ; **sujet libre seulement** | Pas de sujets générés depuis le cours ; **la correction ignore le cours et la méthodologie** ; pas de catégories d'erreurs (droit / raisonnement / méthode / forme) ; l'historique des versions existe (`saveRedactionVersion`). |
| Documents de méthodologie (RAG) | Inexistant | À concevoir (§ 12). |
| Examen varié avec choix de difficulté | Banque de **27 questions par contenu** ; examen standard de 15 questions tirées au hasard ; difficulté taguée mais **non sélectionnable** ; mode adaptatif (Premium) | Six examens de 15 questions dans une banque de 27 : **répétitions inévitables** ; pas de cas d'application ni de justification ; pas de renvoi aux passages du cours. |
| Prérequis « Étude commencée » | La banque exige que l'Étude du **contenu** soit générée, mais pas que **l'étudiant** l'ait commencée | À ajouter côté serveur. |
| Déblocage par paliers | Inexistant : 10 examens/jour en Free, sans ordre | À concevoir (§ 13). |
| Collecte des résultats | `examen_sessions` (notes, réponses), progression de l'Étude, `saas_metrics` (coûts) | Pas d'agrégation par notion entre étudiants ; pas de politique de conservation. |
| Points et bonus BD | Inexistants | À concevoir (§ 15). |
| Navigation cohérente | Évaluations absentes du menu ; Étude guidée cachée aux Free alors qu'elle est accessible via le catalogue | Voir § 17. |
| Réutilisation des analyses | **Bonne** : hash exact du texte, single-flight, clonage entre utilisateurs, cache des générations, idempotence | Pas de détection des documents proches ; deux pipelines concurrents (C-07). |

---

## 10. Parcours étudiant cible : du PDF à l'évaluation

```
1. Import du PDF (Premium) ou choix d'un cours du catalogue (Free)
   └─ serveur : contrôle des droits, hash, réutilisation de l'analyse si le contenu est identique
2. Analyse (1 fois par contenu) → « Plan de connaissances » : notions, règles, exceptions,
   distinctions, mécanismes, exemples, liens, avec une référence (page/section) pour chaque élément
3. Page du cours (onglets) :  Synthèse | Parcours | Carte mentale | Évaluations | Examens | Rédaction
4. SYNTHÈSE : lecture en ligne + « Télécharger en PDF » → bouton « Commencer mon parcours »
5. PARCOURS (Études guidées), séquence par séquence, pour chaque notion :
   situation concrète → français simple → terme exact → définition → conditions / exceptions
   → schéma (si utile) → « reformule avec tes mots » → exercice de vocabulaire exact
   → retour sur l'erreur (+ autre exemple si échec) → rappel actif en fin de séquence
6. Fin de parcours → CARTE MENTALE (en ligne + téléchargement) + bilan « notions solides / à revoir »
7. RÉVISIONS : flashcards et QCM ciblés sur les notions « à revoir » (révision espacée)
8. EXAMENS par paliers (prérequis : parcours commencé, vérifié côté serveur) → correction expliquée
   avec renvoi aux passages du cours → remédiation si < 10/20
9. RÉDACTION : cas pratique / dissertation / commentaire d'arrêt sur ce cours → correction
   classée par type d'erreur → réécriture
10. PROGRESSION ET POINTS : lacunes, prochaines actions, historique des points, éligibilité à la BD
```

---

## 11. Pédagogie attendue : synthèses, Études guidées, schémas, carte mentale

### 11.1 Étape d'analyse (une seule fois par contenu)

Le prompt maître actuel est remplacé par une analyse en deux temps, compatible avec les documents longs :

1. **Découpage** : le texte est extrait **page par page**. `pdf-parse` permet de récupérer le texte par page via son option de rendu de page. Il est ensuite découpé en blocs de quelques milliers de mots, en suivant les titres du cours.
2. **Extraction par bloc** : notions, définitions, règles, conditions, exceptions, conséquences, distinctions, exemples. **Chaque élément porte une référence** (page, titre de section) et une marque d'origine : `document` (explicite dans le cours) ou `complement` (connaissance générale, à signaler).
3. **Fusion** : un « plan de connaissances » hiérarchisé, avec une **priorité justifiée** (essentiel, important, utile en exercice) et des **incertitudes** signalées. Aucune notion n'est supprimée : les éléments de priorité basse restent visibles.

Le nouveau schéma **retire** les champs qui présument l'enseignant (`pieges_enseignants`, `questions_qui_tombent_souvent`…). Ils sont remplacés par :
- `objectifs_apprentissage_probables`, déduits du contenu ;
- `confusions_frequentes`, avec la justification « ressemblance entre X et Y » ;
- des références juridiques citées **uniquement si elles figurent dans le document**, sinon marquées « à vérifier ».

### 11.2 Ton et méthode (prompts de génération)

Consignes communes à toutes les générations pédagogiques (synthèse, Étude, corrections, retours d'examen) :
- Tutoyer l'étudiant (par défaut, à confirmer en Q-07) et l'interpeller (« Imagine que tu… »).
- Ouvrir chaque notion par **une situation fictive concrète** de la vie courante, avec des personnages et des prénoms locaux.
- Passer **explicitement** du français simple au terme juridique : « Ce que tu viens de décrire, en droit, s'appelle… ».
- Donner ensuite la définition rigoureuse, puis les conditions, limites et exceptions **tirées du cours**.
- Terminer par une **question de reformulation**, puis un **exercice qui exige le terme exact**.
- **Interdits** : créer une règle, une obligation ou une sanction pour enrichir un exemple ; citer un article ou un arrêt absent du document sans la mention « (référence hors cours, à vérifier) » ; affirmer une règle dont le pays ou la date sont incertains sans le signaler.

### 11.3 Synthèse pédagogique téléchargeable

- **Contenu** : notions et définitions ; principes, règles, conditions et exceptions ; distinctions ; mécanismes et raisonnements ; « ce qui sert en cas pratique, dissertation, commentaire, QCM » ; confusions et pièges probables ; liens entre les parties. Chaque bloc renvoie à la page du cours ; les compléments externes sont encadrés et signalés.
- **Production** : générée à partir du plan de connaissances (§ 11.1), **une fois par contenu** et partagée entre utilisateurs qui ont **exactement** le même texte.
- **Affichage** : page dédiée dans le cours, consultable avant, pendant et après le parcours.
- **Export PDF** : **feuille de style d'impression** et bouton « Télécharger en PDF » qui ouvre l'impression du navigateur (« Enregistrer en PDF »). Aucun coût serveur, **aucune dépendance nouvelle**. Un PDF généré côté serveur ne sera envisagé que si ce rendu est jugé insuffisant : sur Vercel, cela exigerait `@sparticuz/chromium`, une dépendance nouvelle qui serait à valider.

### 11.4 Schémas pédagogiques

- L'IA produit des **schémas structurés en JSON** (et non des images) de quatre types : `etapes` (raisonnement), `conditions_consequences`, `distinction` (tableau comparatif), `principe_exceptions`.
- Le rendu est fait par des composants React et SVG maison : coût nul, imprimable, lisible sur mobile.
- Un schéma n'est généré **que si** l'analyse marque la notion comme relationnelle (nombre de conditions ou d'exceptions supérieur ou égal à 2, ou distinction).

### 11.5 Carte mentale de fin de parcours

- Structure : nœud central (le cours), branches (grandes notions), puis feuilles (principes, conditions, exceptions, conséquences), avec des **liens transverses** typés (« s'oppose à », « est une exception de », « conduit à »).
- **Construite à partir du plan de connaissances** déjà calculé : pas d'appel IA supplémentaire, ou un seul petit appel de mise en forme.
- **Rendu** : SVG maison, sur une page qui défile et se zoome sur mobile.
- **Exports** : SVG (vectoriel, gratuit), PNG (via un canvas dans le navigateur) et PDF (impression).
- **Statut « vue / maîtrisée »** affiché par nœud, à partir de la progression de l'étudiant.

---

## 12. Rédaction et documents de méthodologie

### 12.1 Parcours Rédaction cible (on garde l'existant et on l'étend)

1. Choix du compartiment : **Cas pratiques**, **Dissertations** ou **Commentaires d'arrêt** (trois onglets ; le sélecteur actuel devient la navigation).
2. Choix de la source : **un cours SGP** (avec son chapitre) **ou un sujet libre**, saisi ou importé. L'import de PDF du sujet réutilise l'uploader existant.
3. Sujet : **proposé** à partir du plan de connaissances du cours (trois sujets au choix, générés une fois par cours et par type, puis réutilisés), ou saisi.
4. Rédaction dans l'éditeur existant. **Sauvegarde automatique** et versions (`saveRedactionVersion` existe déjà).
5. Soumission, puis correction (job IA).
6. **Correction structurée** :
   - note indicative, avec la mention qu'elle est indicative ;
   - erreurs classées par catégorie : **droit**, **raisonnement**, **méthode**, **formulation** ;
   - chaque erreur cite le passage de la copie et, si possible, **le passage du cours ou de la méthodologie** sur lequel elle s'appuie ;
   - « Ce que tu as bien fait » et « Les 3 priorités pour ta prochaine version ».
7. **Retravailler** : nouvelle version, puis correction comparée (progrès par rapport à la version précédente).

Pour une copie rattachée à un cours, la correction reçoit **les passages pertinents du cours** (recherche ciblée, § 12.2) et la fiche de méthode du type d'exercice.

### 12.2 Documents de référence (méthodologie, ressources)

**Principe** : ne pas entraîner de modèle et ne pas charger tous les documents dans chaque requête. On utilise une **recherche ciblée de passages**.

| Option | Coût | Qualité | Compatibilité |
|---|---|---|---|
| A. Recherche plein texte PostgreSQL (`tsvector`, configuration `french`) + étiquettes (type, matière, exercice) | **nul** | bonne pour les termes juridiques précis | native dans Supabase |
| B. A + vecteurs sémantiques (`pgvector` + embeddings Gemini) | faible (embeddings calculés une fois par passage) | meilleure pour les reformulations | `pgvector` est disponible dans Supabase (à activer : **migration à autoriser**) |
| C. Tout envoyer dans le contexte | élevé à chaque appel | dilue l'attention, coûteux | à proscrire |

**Recommandation** : commencer par **A** (méthodologie : quelques documents très structurés), puis passer à **B** si les tests de pertinence le justifient.

**Modèle** : `reference_documents` (titre, `kind` = methodologie | cours | jurisprudence | autre, matière, pays, version, `visibility` = plateforme | privé) et `reference_chunks` (document, section, page, texte, `tsv`, éventuellement `embedding`).

**Usage** : à chaque correction ou explication, on récupère 3 à 6 passages pertinents et on les place dans le prompt sous la forme `<SOURCE id="M-12" p="4">…`. Le modèle doit citer `[M-12 p.4]` et répondre « non établi par les sources disponibles » s'il ne trouve rien.

---

## 13. Examens : progression par paliers (tableau à valider)

> **Ne pas développer avant ta validation** (prompt 4, § 3). Le prompt 4 remplace la règle « 18/20 » du prompt 3 par une **moyenne de 15/20 sur 3 examens**. L'ancienne ambiguïté sur les 18/20 devient sans objet, sauf si tu souhaites la conserver.

### 13.1 Proposition

| Règle | Proposition par défaut | Points à valider |
|---|---|---|
| Accès à l'examen 1 | Parcours du cours **commencé**, vérifié côté serveur : au moins **une séquence (section) terminée**, enregistrée dans `etude_progression_sections` à partir de réponses réellement soumises | Q-01 : « commencé » = 1 thème, 1 séquence, ou X % ? |
| Seuil de l'examen 1 | **≥ 10/20** débloque l'examen 2 | — |
| Accès à l'examen 3 | **≥ 10/20 à l'examen 2** | Q-02 |
| Palier 1 → palier 2 | Examens 1, 2 et 3 **tous passés**, chacun ≥ 10/20, **et** moyenne du palier = (n1 + n2 + n3) / 3 **≥ 15/20** | Q-03 : quelle note retenir pour un examen repassé (meilleure, dernière, première) ? Proposition : **la meilleure**. |
| Examens 4, 5 et 6 | Mêmes règles en chaîne : ≥ 10/20 débloque le suivant. À la fin du palier 2, moyenne ≥ 15/20 = cours **maîtrisé** | — |
| Après l'examen 6 | Badge « cours maîtrisé » et invitation à étudier un autre cours. Historique, révisions et nouvelles tentatives conservés | Q-04 : les nouvelles tentatives après la maîtrise sont-elles autorisées (sans points) ? |
| Échec (< 10/20) | Une **remédiation ciblée** sur les notions ratées devient obligatoire avant de repasser l'examen : révision des flashcards et explications des thèmes concernés, vérifiée côté serveur | Q-05 : remédiation obligatoire, ou simple délai ? |
| Nouvelle tentative | L'examen N repassé = **une nouvelle variante** (autres questions, mêmes notions). Au maximum 3 tentatives par examen et par jour, avec 6 h d'attente après 2 échecs consécutifs | Q-06 : limites exactes |
| Examen réussi | Peut être repassé pour s'entraîner ; la meilleure note est conservée ; **aucun point supplémentaire** sauf en cas de franchissement d'une nouvelle tranche (§ 15) | — |
| Difficulté | Choix parmi **facile, moyen, difficile** (déjà présents dans la banque). La difficulté **n'est pas** une condition de déblocage, mais un multiplicateur de points (§ 15). | Q-08 : faut-il imposer « moyen » au minimum pour le palier 2 ? |
| Quotas Free/Premium | Free : les examens par paliers restent dans le quota de 10/jour ; Premium : illimité, dans la limite des tentatives anti-abus ci-dessus | — |
| Persistance | Tout est en base (`examen_sessions`, nouvelle table `examen_progression`). L'état est recalculé côté serveur et ne dépend ni de la session ni du navigateur | — |
| Interruption ou erreur | Une session non soumise reprend jusqu'à son échéance (la logique existe déjà). En cas d'erreur technique, la session est `annulee`, **la tentative et le quota sont rendus**, et rien n'est compté comme un échec | — |

### 13.2 Variété réelle et coût

- Aujourd'hui, la banque contient 27 questions et un examen en prend 15 : six examens se répéteraient fortement.
- **Proposition** : une **banque par palier**, générée **seulement quand le palier est débloqué**. On ne paie donc le palier 2 que pour les étudiants qui l'atteignent. La banque du palier 1 est enrichie à environ 45 questions et celle du palier 2 à environ 45 questions, en ajoutant des types de questions plus exigeants.
- **Nouveaux types de questions** : `application` (mini-situation dans laquelle il faut appliquer une règle), `piege` (affirmation qui contient une erreur de raisonnement à repérer) et `justification` (QCM accompagné d'une justification courte, corrigée sans IA par mots-clés attendus, ou par IA seulement pour les Premium : à trancher en Q-09).
- **Anti-répétition** : composition par graine (déjà en place) **en excluant les questions déjà vues** par l'étudiant ; couverture équilibrée des notions entre les examens.
- **Correction** : explication pourquoi c'est juste ou faux (champ `explication` existant) et **référence** à la page ou section du cours (ajout de `ref` dans la banque).

---

## 14. Collecte et analyse des résultats

**Deux usages strictement séparés** :

| | Suivi individuel | Analyse agrégée |
|---|---|---|
| Qui voit | L'étudiant seul (et l'admin en cas de support, avec un journal des accès) | Admin et équipe pédagogique |
| Données | Notes, réponses, notions maîtrisées, erreurs, progression | Taux de réussite par question, notion et cours ; distribution des notes ; difficulté perçue et mesurée |
| Forme | Lignes nominatives (RLS : propriétaire) | **Agrégats seulement**, avec un **seuil minimal de 5 étudiants** par cellule. Aucun export nominatif. |

**Données collectées (minimisation)** :
- examens : note, difficulté choisie, réponse juste ou fausse par question, notion concernée ;
- Étude : thèmes terminés, réponses correctes ou non ;
- Rédaction : note indicative et catégories d'erreurs (pas le texte dans les agrégats) ;
- Révision : réussite des cartes.

**Indicateurs « qualité du parcours »** : taux d'échec par notion ; questions trop faciles (> 95 % de réussite) ou ambiguës (des étudiants forts se trompent) ; écart entre la maîtrise en Étude et la note d'examen. **Aucune conclusion à partir d'un seul indicateur.** Une bonne note ≠ une compréhension : on croise Étude, Examen et Rédaction et on affiche les limites.

**Protections** :
- vues SQL d'agrégation en `security_invoker` ou fonctions réservées à l'admin ;
- conservation : données individuelles **24 mois après la dernière activité** (proposition, Q-10), puis anonymisation ;
- mention dans la politique de confidentialité ;
- **aucun entraînement de modèle** sur ces données : sujet hors périmètre, qui demanderait une proposition distincte.

**Existant réutilisable** : `examen_sessions`, `lib/examen/analytics.ts` (EMA par thème), `etude_progression_*`, `AdminInsights.tsx`, `SaasMetricsDashboard.tsx`.

---

## 15. Système de points et bonus BD

### 15.1 Principes

- **Registre unique côté serveur** (`points_ledger`). Chaque gain est une ligne avec `user_id`, `source` (type et id), `regle`, `points` et `motif` lisible. **Contrainte d'unicité** `(user_id, regle, source_id)` : une même activité ne rapporte jamais deux fois.
- Les points sont **calculés par le serveur** à partir de faits vérifiés : session d'examen notée par le serveur, réponse d'Étude corrigée par le serveur, rédaction corrigée. **Jamais** à partir d'un compteur envoyé par le navigateur.
- **Plafond quotidien** (proposition : 40 points par jour) et **seuils de qualité** par activité.
- **Historique visible** : « +10 : examen 2 du cours X réussi (13/20) ».

### 15.2 Barème proposé (à valider, Q-11)

| Activité | Condition de qualité | Points | Anti-abus |
|---|---|---|---|
| Étude : thème terminé | Cas pratique « fond » jugé correct (premier essai ou après remédiation) | +2 | Une fois par thème et par étudiant |
| Étude : séquence terminée | Tous les thèmes de la séquence terminés | +5 | Une fois |
| Étude : parcours terminé | Toutes les séquences terminées | +15 | Une fois par cours |
| Examen : réussite | Première note ≥ 10/20 sur l'examen N | +10 | Une fois par examen |
| Examen : tranche « bien » | Première note ≥ 15/20 sur l'examen N | +5 | Une fois par examen |
| Examen : tranche « excellent » | Première note ≥ 18/20 sur l'examen N | +5 | Une fois par examen |
| Multiplicateur de difficulté | moyen ×1, difficile ×1,5 (facile ×0,5) | — | S'applique aux lignes « examen » |
| Palier débloqué | Moyenne ≥ 15/20 sur le palier | +15 | Une fois par palier |
| Rédaction corrigée | Copie ≥ 300 mots (seuil par type), correction obtenue | +5 | 1 par jour |
| Rédaction : réussite | Note indicative ≥ 10/20 | +5 | Une fois par copie |
| Rédaction : progrès | Nouvelle version qui gagne au moins 2 points | +5 | Une fois par copie |
| Révision | Session complète avec au moins 70 % de réussite | +1 | 3 par jour au maximum |

**Contre les réponses au hasard** : aucun point pour un examen à moins de 10/20 ; pour l'Étude, il faut une réponse **correcte** au cas pratique (corrigée par le serveur) ; les nouvelles tentatives ne rapportent rien à note égale.

**Ordre de grandeur** : un cours mené jusqu'au bout (parcours, six examens réussis dont certains ≥ 15) rapporte environ 120 à 160 points. **Le seuil de 200 points correspond donc à environ 1,5 cours sérieusement travaillé**, ce qui est cohérent avec un « engagement régulier ».

### 15.3 Cycle du bonus BD

```
            ┌──────────────┐  conditions minimales remplies*      ┌────────────┐
 points ──▶ │ NON ÉLIGIBLE │ ───────────────────────────────────▶ │  ÉLIGIBLE  │──▶ notification au tableau de bord
            └──────────────┘                                      └─────┬──────┘
                                                                        │ l'étudiant réclame (1 réclamation active max)
                                                                        ▼
                                                                 ┌─────────────┐  compteur du bonus = points gagnés
                                                                 │  RÉCLAMÉ    │  APRÈS la réclamation (Q-12)
                                                                 └─────┬───────┘
                                                                       │ compteur ≥ 200
                                                                       ▼
                                                                 ┌─────────────┐  choix du cours (bibliothèque,
                                                                 │ À CHOISIR   │  catalogue, cours étudié ou importé)
                                                                 └─────┬───────┘
                                                                       │ contrôles serveur : droits sur le cours,
                                                                       │ texte exploitable, budget IA disponible
                                                                       ▼
                                                                 ┌─────────────┐  job IA 'bd' (reprise possible)
                                                                 │ EN COURS    │──── échec définitif ──▶ ÉCHEC
                                                                 └─────┬───────┘     (bonus NON consommé,
                                                                       │ succès       nouvel essai proposé)
                                                                       ▼
                                                                 ┌─────────────┐
                                                                 │ LIVRÉ       │  BD consultable + PDF ; bonus consommé
                                                                 └─────────────┘  (compteur remis à 0, nouveau cycle possible)
```

\* **Conditions minimales proposées** (Q-13) : au moins 7 jours actifs sur les 30 derniers jours, au moins un examen ≥ 15/20 et au moins un parcours terminé.

**Contre les réclamations multiples** : un index unique sur `(user_id)` lorsque le statut est `reclame`, `a_choisir` ou `en_cours`. Les transitions passent par une fonction SQL atomique.

### 15.4 Production de la BD

| Option | Pipeline | Coût estimé par BD | Fidélité | Recommandation |
|---|---|---|---|---|
| **A. BD « dessinée » par la mise en page** | 1 appel Gemini → scénario JSON (scènes, cases, dialogues, notions, références au cours) → rendu HTML/SVG avec des personnages stylisés réutilisables → PDF par l'impression du navigateur | **très faible** (1 à 2 appels texte) | élevée (le texte est contrôlé) | **À faire en premier** |
| B. Illustrations générées par IA, case par case | Scénario + 30 à 60 images | nettement plus élevé, à chiffrer **avant tout essai** | personnages incohérents d'une case à l'autre, texte illisible dans les images | Plus tard, après une maquette et une validation du coût |

- **Contraintes** : 8 à 15 scènes ; un fil narratif avec 2 ou 3 personnages récurrents ; chaque scène = une notion, présentée en situation, puis en français simple, puis en terme juridique, puis en règle et exceptions ; une case « Retiens » par scène ; les références au cours sont en annexe.
- **Réutilisation** : la BD est mise en cache par `(source_hash, version_scenario)`. Un deuxième étudiant qui choisit le même contenu obtient la BD **sans nouvelle génération**, et le bonus est tout de même consommé (Q-14).
- **Reprise** : comme pour les autres jobs (`job.result` persisté, nouvelles tentatives bornées).

---

## 16. Réutilisation des analyses, quotas et coûts

| Point | Existant | Proposition |
|---|---|---|
| Fichiers identiques | Hash SHA-256 du **texte extrait**, clonage et single-flight | Garder. Ajouter un hash du **texte normalisé** (espaces, casse, en-têtes et pieds de page retirés) pour reconnaître un même cours réexporté. |
| Documents proches (versions d'un cours) | Aucun mécanisme | Empreinte par passages (MinHash sur des blocs de 5 mots). Si la similarité est ≥ 0,9, on **propose** de réutiliser les blocs inchangés et on **ne réanalyse que les blocs modifiés**. Ce n'est jamais une équivalence automatique : la réutilisation porte sur les blocs dont le hash est identique. |
| Réutilisation sécurisée | Les données partagées sont des contenus générés à partir d'un texte **identique** : pas de fuite, puisque l'utilisateur possède déjà ce texte | Garder la règle « partage seulement si le contenu source est identique ». Les **réponses, notes et copies** ne sont jamais partagées. Corriger C-03 (cache empoisonné). |
| Analyse initiale et usage pendant les séances | Analyse = 1 appel par contenu. En séance : 1 appel par cas pratique corrigé, 1 par copie | Afficher deux compteurs distincts dans l'admin : coût d'**acquisition** d'un contenu et coût d'**usage** par étudiant actif. Quotas Free uniquement sur l'usage. |
| Droits | `resolveDocumentAccess` : propriétaire ou catalogue | Étendre à la synthèse, à la carte mentale, à la BD et aux sujets de Rédaction. |
| Échec et reprise | Nouvelles tentatives bornées, `job.result` persisté, cache avant sauvegarde | Garder. Ajouter un bouton « relancer l'analyse » visible si l'état est `failed`, limité dans le temps. |
| Coupe-circuit | Global de 5 $/jour, laisse passer les appels si la lecture échoue | Agrégation SQL et **budget par utilisateur et par jour** (T-13), pour qu'un seul compte ne puisse pas épuiser la plateforme. |

---

## 17. Navigation cible

| Constat | Catégorie |
|---|---|
| Évaluations : la page existe, mais on n'y accède que par un bouton en fin d'Étude | **Existe, mais mal exposé** |
| Étude guidée cachée aux Free dans le menu, alors qu'elle est accessible depuis le catalogue | **Existe, mais mal exposé** et incohérent |
| Synthèse, carte mentale, points, bonus BD | **Réellement absents** |
| Examen ↔ Rédaction : un lien existe sur la page de résultats | OK |
| Étude → Révisions et Évaluations : des boutons en fin de parcours ; aucun retour vers l'Examen | **Transition manquante** |
| Bibliothèque / Matières / Chapitres : trois écrans pour organiser les documents | **À regrouper** (à confirmer par le test V-10) |

**Proposition** : le cours devient le pivot.

```
Menu : Tableau de bord · Mes cours (Bibliothèque + Matières) · Catalogue (Free) · Révisions · Examens · Rédaction · Progression & points
Page d'un cours : [Synthèse] [Parcours guidé] [Carte mentale] [Évaluations] [Examens] [Rédaction sur ce cours]
```

Les routes actuelles sont **conservées** et les onglets pointent vers elles : aucune fonctionnalité n'est supprimée et la migration est progressive.

---

## 18. Impacts : base de données, API, quotas, sécurité, interface

**Base de données** (toutes les migrations sont **à autoriser**, sur une branche de test Supabase d'abord) :

| Nouvel objet | Rôle |
|---|---|
| `knowledge_plans` (source_hash, version, plan JSON avec références) | Plan de connaissances partagé |
| `course_syntheses` (source_hash, version, contenu) | Synthèse |
| `course_mindmaps` (source_hash, version, graphe) | Carte mentale |
| `document_pages` ou `document_chunks` (document_id, page, texte, hash) | Références par page et détection des documents proches |
| `reference_documents`, `reference_chunks` (+ `tsv`, éventuellement `embedding`) | Méthodologie |
| `examen_progression` (user, cours, palier, examen_n, meilleure_note, tentatives, débloqué_le) | Paliers |
| Colonnes `palier`, `variante`, `difficulte_choisie` dans `examen_sessions` | Paliers |
| `redaction_subjects` (cours, type, sujets) | Sujets proposés |
| Champs structurés dans `redactions.rapport_analyse` | Catégories d'erreurs |
| `points_ledger`, `reward_claims` (statut, compteur, cours_choisi, job_id) | Points et BD |
| `comics` (source_hash, version, scénario JSON) | BD |
| Vues d'agrégation pour l'analyse | Collecte des résultats |

**API et actions** : nouveaux types de jobs `synthese`, `mindmap`, `bd`, `redaction_subjects` (ou intégrés à l'analyse) ; actions `getExamLadder`, `startLadderExam`, `claimReward`, `chooseRewardCourse` ; ajout d'un contrôle d'appartenance **dans le worker** (C-02).

**Quotas** : `free_daily_quotas` étendu avec `evaluation` et `redaction` ; plafond de tentatives d'examen ; plafond quotidien de points.

**Sécurité** : chaque nouvelle table a une RLS « propriétaire » en lecture ; **aucune écriture depuis le client** sur les points, les paliers ou les bonus (fonctions serveur uniquement) ; tests négatifs systématiques.

**Interface** : page de cours à onglets ; page Synthèse imprimable ; composant Carte mentale ; composants Schéma ; écran Examens par paliers ; Rédaction en 3 onglets ; panneau Points et notification de bonus ; lecteur de BD.

---

## 19. Plan de tests Playwright

**Prérequis** : un **projet Supabase de test** distinct de la production, une clé Gemini de test ou le mode `mock` réservé aux tests, et des données de test (un compte admin, deux Free, deux Premium, des codes vierges et assignés).

| Suite | Cas principaux |
|---|---|
| Authentification | Inscription Free ; connexion par mot de passe ; activation de code ; **C-01 : un code vierge ne permet pas de prendre le compte A** ; un code bloqué n'ouvre aucune session ; déconnexion |
| Free et Premium | Menu et cadenas selon le plan ; désactivation d'un code → retour en Free à la requête suivante ; import refusé pour un Free (API **et** `enqueueAiJob`) |
| Autorisations (négatifs) | Document, rédaction, session d'examen et job d'autrui → 403 ou 404 ; insertion directe dans `ai_jobs` refusée ; `mock` refusé |
| Quotas | Le 11e examen Free est refusé ; 20 corrections de cas pratique simultanées ne dépassent pas 15 |
| Étude | Génération en mode `mock`, parcours d'un thème, remédiation, reprise après rechargement |
| Examen | Démarrage, réponses, échéance, soumission idempotente, correction sans fuite du corrigé ; puis paliers (après le développement) |
| Rédaction | Création, sauvegarde, correction en mode `mock`, version 2 |
| Non-régression visuelle | Captures du tableau de bord, de l'Étude, de l'examen et de la rédaction en mobile (360 px) et en ordinateur |

## 20. Plan de tests de charge k6

- **Uniquement sur une prévisualisation Vercel ou un environnement de test**, avec le projet Supabase de test et des jobs `mock` : **0 appel Gemini**.
- **Paliers** : 10, 50, 100, puis 300 utilisateurs virtuels. On ne passe au palier suivant que si le précédent tient le taux d'erreur < 1 % et un p95 < 1,5 s sur les pages.
- **Scénarios** : navigation dans le tableau de bord et le catalogue (lecture) ; démarrage et soumission d'examens (écritures) ; création de jobs `mock` et observation `/api/jobs/[id]` (file d'attente et worker).
- **Mesures** : latence p50/p95, erreurs, connexions Supabase, durée des fonctions Vercel, temps de vidage de la file.
- Le coût éventuel (exécutions Vercel, Supabase) sera estimé **avant** le lancement et **soumis à ta validation**.
- **Aucune affirmation de capacité** (« 1 000 utilisateurs ») sans ces mesures.

## 21. Validation pédagogique

- **Protocole proposé** : 1 enseignant et 5 à 10 étudiants volontaires ; 2 cours réels de matières différentes (par exemple droit civil et droit constitutionnel).
- **L'enseignant relit** la synthèse, un échantillon de 10 thèmes d'Étude, un examen et 3 corrections de rédaction. Grille : exactitude juridique, fidélité au cours, ton, pièges réels, références.
- **Les étudiants** passent un pré-test, utilisent le parcours, puis passent un post-test ; questionnaire de clarté.
- **Critère** : zéro erreur de droit bloquante relevée par l'enseignant ; au moins 80 % des éléments jugés « fidèles au cours ».
- **État** : non commencé, il dépend des étapes 2 et 3 du plan.

## 22. Risques, dépendances et coûts

| Risque | Gravité | Atténuation |
|---|---|---|
| Correction de C-01 qui empêche des étudiants payants de se connecter | Élevée | Parcours de migration, tests, déploiement en prévisualisation, communication aux étudiants |
| Migrations SQL appliquées sans registre | Élevée | Branche de test Supabase, fichiers numérotés, sauvegarde avant chaque migration |
| Hallucinations juridiques | Élevée | Références obligatoires, mention « hors cours », relecture par l'enseignant, règles anti-invention dans les prompts |
| Coûts Gemini (analyse plus fine, banques par palier, BD) | Moyenne | Génération une seule fois par contenu, banque du palier 2 créée à la demande, BD en option A, budget par utilisateur |
| Vercel : cron chaque minute et fonctions de 300 s | Moyenne | Vérifier l'offre et la facturation ; un seul worker après T-07 |
| Next.js 16 (API changeantes) | Moyenne | Lire `node_modules/next/dist/docs` avant chaque développement |
| Absence de tests | Élevée | T-20 avant toute refonte |
| Nouvelles dépendances (`@playwright/test`, k6, éventuellement `pgvector`) | Faible | Outils de test uniquement, et validation au cas par cas |

**Dépendances externes** : Supabase (Auth, BDD, Storage), Vercel (hébergement, cron), Google Gemini, Adsterra (publicités Free).

---

## 23. Plan de développement par étapes

| Étape | Contenu | Dépend de | Critère d'acceptation |
|---|---|---|---|
| **0. Filet de sécurité** | Projet Supabase de test, `npm ci`, build et lint, Playwright, tests rouges reproduisant C-01 à C-04 | Ton accord, et un projet de test | Les tests reproduisent les failles |
| **1. Phase B : correctifs critiques** | T-01 à T-09 | Étape 0 | Tous les tests de sécurité passent ; aucune régression de connexion ; l'admin ne peut plus être visé |
| **2. Fondations pédagogiques** | Extraction par page, plan de connaissances avec références (T-10, T-11), nouveaux prompts au tutoiement | Étape 1 | Sur 2 cours tests, chaque élément porte une référence ; aucune troncature silencieuse |
| **3. Synthèse et carte mentale** | Pages, export par impression, composants de schémas | Étape 2 | Synthèse et carte consultables, téléchargeables et lisibles sur mobile |
| **4. Navigation par cours** | Onglets, Évaluations exposées | Étape 3 | Toutes les fonctions sont accessibles en 2 clics depuis un cours |
| **5. Examens par paliers** | Après ta validation du § 13 : banques par palier, nouveaux types de questions, prérequis serveur | Étapes 2 et 4, réponses Q-01 à Q-09 | Le tableau du § 13 est vérifié par des tests automatisés |
| **6. Rédaction v2** | 3 compartiments, sujets depuis le cours, correction classée et sourcée | Étape 2 (+ 7 pour la méthodologie) | Correction avec catégories et citations ; version 2 comparée |
| **7. Documents de référence** | Option A (plein texte) | Tes documents de méthodologie | Sur 20 questions types, au moins 80 % des passages retrouvés sont jugés pertinents |
| **8. Collecte et analyse** | Vues agrégées, seuil de 5 étudiants, conservation | Étape 5 | Aucune donnée nominative dans les vues admin |
| **9. Points** | Registre, barème, historique | Étapes 5 et 6, réponse Q-11 | Tests anti-abus (double attribution, nouvelles tentatives, appel API direct) |
| **10. Bonus BD (option A)** | Cycle, scénario, rendu, PDF | Étape 9, réponses Q-12 à Q-14 | Une BD relue par l'enseignant ; aucune réclamation double possible |
| **11. Charge k6** | Paliers de 10 à 300 utilisateurs virtuels en `mock` | Étape 1 | Rapport chiffré avant toute affirmation de capacité |
| **12. Validation pédagogique** | Protocole du § 21 | Étapes 3, 5 et 6 | Grille de relecture validée |

---

## 24. Questions à trancher

Voir la réponse de l'assistant associée à ce document : seules les questions bloquantes y sont posées.

| ID | Question | Bloque |
|---|---|---|
| Q-01 | Que signifie « parcours commencé » pour accéder à l'examen 1 ? | Étape 5 |
| Q-03 | Pour un examen repassé, quelle note compte dans la moyenne du palier ? | Étape 5 |
| Q-05 / Q-06 | Après un échec : remédiation obligatoire, délai, ou les deux ? Combien de tentatives ? | Étape 5 |
| Q-12 | Compteur du bonus : points gagnés **après** la réclamation, ou solde déjà accumulé ? | Étape 10 |
| Q-15 | Correction de C-01 : faut-il garder la connexion « email + code », ou passer à « email + mot de passe », le code ne servant qu'à activer le Premium ? | Étape 1 |
| Q-16 | Disposes-tu d'un projet Supabase de test, ou en crée-t-on un (offre gratuite) pour éviter de toucher la production ? | Étape 0 |
| Q-02, Q-04, Q-07 à Q-11, Q-13, Q-14 | Les valeurs par défaut proposées aux § 13 et 15 s'appliquent sauf avis contraire | — |

---

## 25. Journal des décisions, changements et tests

| Date | Type | Contenu |
|---|---|---|
| 2026-10-16 | Audit | Phase A réalisée en lecture seule : 14 constats confirmés par le code (C-01 à C-14) et 10 points à vérifier (V-01 à V-10). |
| 2026-10-16 | Document | Création de ce plan, qui intègre les 4 prompts de cadrage (audit, vision produit, complément, finalisation). |
| 2026-10-16 | Décision | La règle de passage de palier du prompt 4 (moyenne ≥ 15/20 sur 3 examens) remplace celle du prompt 3 (18/20). |
| 2026-10-16 | Tests | Aucun test exécuté : pas d'environnement de test disponible et pas de dépendances installées. Seule vérification faite : le site de production répond (code 200). |
| 2026-10-16 | Décision (Q-15) | Connexion **email + mot de passe personnel** ; le code ne sert plus qu'à **activer le Premium** une fois connecté. Les étudiants actuels peuvent encore se connecter avec email + code, puis on leur demande de choisir un mot de passe. |
| 2026-10-16 | Décision (Q-16) | Migrations : l'assistant fournit les fichiers SQL (avec retour arrière) ; **le responsable les relit et les applique lui-même** dans Supabase. Aucune action directe sur la production. |
| 2026-10-16 | Décision | Livraison sur une **branche Git** puis prévisualisation Vercel ; passage en production après validation. |
| 2026-10-16 | Décision | Ordre de travail : 1) corriger tous les bugs ; 2) supprimer, ajouter et modifier des sections (le responsable retravaille la pédagogie) ; 3) nouvelle landing page. |
| — | Changements | Phase A : aucun changement. Phase B en cours sur la branche `fix/phase-b-securite-latence`. |
