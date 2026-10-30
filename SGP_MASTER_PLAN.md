# SGP — MASTER PLAN

> Document de référence du projet SGP / SJP (dépôt `TUINA.AI`). À mettre à jour après chaque intervention significative.
>
> **Version 1.3 — 2026-10-17** — ajout de la refonte proposée des Études guidées (sections 40 à 46).
>
> **Version 1.2 — 2026-10-16** — Audit (phase A), correctifs de sécurité et de latence (phase B, en production), refonte du design, **directive générale de développement** (sections 26 à 33) et **règles pédagogiques validées** : étude commencée, notes, six examens, points et bonus BD (sections 34 à 39).
>
> Organisation : sections 1 à 7 = constats techniques ; 8 à 24 = **exigences pédagogiques** (prompts 1 à 4) ; 25 = journal ; 26 à 33 = **méthode, design, accès et capacité** (directive générale) ; 34 à 39 = **règles pédagogiques validées** (elles priment sur les propositions des § 13 et 15). Les exigences pédagogiques restent la référence produit : la directive les complète, elle ne les remplace pas.
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
26 à 33. Directive générale (méthode, design, accès, capacité)
34. Q-01 — Étude guidée « commencée »
35. Q-03 — Note retenue quand un examen est repassé
36. Q-05 / Q-06 — Les six examens de maîtrise et l'après-échec
37. Q-12 — Points de progression et bonus BD
38. Conséquences sur les sections précédentes
39. Décisions encore attendues
40 à 46. Refonte des Études guidées (proposition, prompt directeur pédagogique)

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

### C-17 — Fonctions SQL `SECURITY DEFINER` appelables par tout le monde — **ÉLEVÉE — CONFIRMÉ (SQL)**

- `claim_ai_job`, `examen_save_answer`, `consume_free_quota` et `refund_free_quota` s'exécutent avec les droits du propriétaire de la base. Supabase accorde par défaut `EXECUTE` aux rôles `anon` et `authenticated` : le `REVOKE ... FROM PUBLIC` présent dans le dépôt ne suffit pas.
- **Scénarios** :
  - `claim_ai_job` renvoie la ligne complète d'un job, y compris d'un autre utilisateur (`payload`, `result` : corrections de rédaction). Il permet aussi de voler la file d'attente.
  - `refund_free_quota` permet à un étudiant de se rembourser son quota sans fin.
  - `examen_save_answer` permet d'enregistrer des réponses après la fin du chrono, car l'échéance n'est vérifiée que dans le code de l'application.
- **Correction** : `database/migrations/20261016_01_phase_b_securite.sql`.

### C-18 — Le cron chaque minute bloque tout nouveau déploiement sur l'offre Hobby — **CRITIQUE (exploitation) — CONFIRMÉ (déploiement)**

- Le déploiement d'aperçu du commit `becb209` a échoué. Le lien d'erreur de Vercel renvoie vers « Cron jobs : usage et tarifs » : l'offre Hobby n'autorise qu'un passage par jour.
- Le dernier déploiement de production avait pourtant réussi avec ce réglage. L'offre a donc probablement changé depuis (fin d'un essai Pro ?).
- **Correction** : cron quotidien (`fb5a327`). Le worker reste relancé à chaque création de job, par l'observation de l'avancement et par son propre chaînage.

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

> ⚠️ **Mis à jour le 2026-10-16 : les règles validées sont au § 36**, qui remplace ce tableau sur l'accès à l'examen 1, le passage de groupe, l'échec et les nouvelles tentatives.
>
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

> ⚠️ **Remplacé par le barème du § 37.3** (2026-10-16), qui tient compte des réponses à Q-12.

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
| ~~Q-01~~ | ✅ Résolue le 2026-10-16 → § 34 | — |
| ~~Q-03~~ | ✅ Résolue le 2026-10-16 → § 35 | — |
| ~~Q-05 / Q-06~~ | ✅ Résolues le 2026-10-16 → § 36 (restent D-03 et D-04 au § 39) | — |
| ~~Q-12~~ | ✅ Résolue le 2026-10-16 → § 37 (barème à valider : D-06 à D-10 au § 39) | — |
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
| 2026-10-16 | Décision | Abonnement Premium = **30 jours** à partir de l'activation du code ; retour automatique en Free ; réactivation manuelle par l'admin (nouveau mois). |
| 2026-10-16 | Décision | L'assistant est autorisé à pousser sur GitHub et à appliquer les migrations Supabase. |
| 2026-10-16 | Changement | Commit `becb209` (branche `fix/phase-b-securite-latence`) : C-01 à C-10, C-13, C-15, C-16 corrigés dans le code ; nouvelle page `/app/compte` (activer un code, changer de mot de passe) ; `middleware.ts` renommé `proxy.ts` (Next 16, V-04 confirmé) ; bug Matières corrigé (la page d'un cours montrait les documents de toute la matière). |
| 2026-10-16 | Changement | Commit `fb5a327` : cron quotidien (C-18). |
| 2026-10-16 | Production | `bdd877f` puis `e80f96e` en production (phase B et correctifs de sécurité : filtre du proxy, liens signés limités au propriétaire, garde admin). |
| 2026-10-16 | Design | Refonte « le Code annoté » : fondations (`0547530`) ; connexion, inscription, accueil et guide (`ee0d936`) ; Mes documents, lecteur PDF intégré et import (`48505bf`, en production). Tests Playwright : import d'un PDF de 6 pages, lecture sur mobile (« Page 5 sur 6 »), aucun débordement. |
| 2026-10-16 | Décision | Directive générale reçue, puis précision du responsable : **l'assistant décide seul des modifications qui restent dans la vision de SGP, les commente et les met en ligne sur Vercel ; il ne sollicite le responsable que pour ce qui est obligatoire ou important** (dépenses, données réelles, opérations irréversibles, règles métier). |
| 2026-10-16 | Revue | Relecture indépendante (agent code-reviewer) : sécurité validée. Deux défauts trouvés et corrigés dans `8631c3c` : documents d'un cours invisibles après import, et repli `PGRST204` manquant avant la migration. Ajouts : crédit rendu si le job échoue définitivement, déclenchement du worker par `after()`, fichier de taille inconnue refusé. |
| 2026-10-16 | État réel (lecture seule) | Production : `ai_jobs_insert_own` actif ; policy `ALL` sur documents (insertion et modification par le navigateur) ; les 5 fonctions SECURITY DEFINER exécutables par **anon** (sans compte !) → C-17 passe en **critique** ; bucket `documents` public ; 5 codes (4 actifs), tous rattachés ; Realtime limité à `etude_cours`. |
| 2026-10-16 | Constat C-19 | Base Supabase à Francfort (`eu-central-1`), fonctions Vercel aux États-Unis (`iad1`) : environ 100 ms par requête. Correction : `regions: ["fra1"]` (commit `4e6b9d8`). |
| 2026-10-16 | Constat | « Confirm email » **désactivé** dans Supabase. Risque faible avec le nouveau fonctionnement des codes (rattachés au compte connecté). L'activer imposerait un SMTP personnalisé : l'envoi d'emails gratuit de Supabase est limité à quelques messages par heure. **Décision à prendre plus tard.** |
| 2026-10-16 | Tests E2E (Playwright, copie locale + vraie base, comptes `claude-test-*`) | ✅ Ancien étudiant : connexion avec le code → choix d'un mot de passe → reconnexion → Premium conservé → l'ancien code ne sert plus de mot de passe. ✅ Tentative de prise de contrôle (email d'un autre compte + code vierge) **refusée**, et le mot de passe de la victime reste intact. ✅ Compte gratuit → activation d'un code → « Tu es en Premium ». ✅ Import d'un PDF dans le cours A : visible dans A, absent de B, lien signé, présent en Bibliothèque. Bugs trouvés et corrigés par ces tests : mot de passe actuel exigé par Supabase ; erreur d'hydratation React #418 (dates). |
| 2026-10-16 | À vérifier | `CRON_SECRET` défini en Production et en Preview (sinon le worker refuse tout appel) ; « Confirm email » activé dans Supabase Auth (sinon une inscription avec l'email d'un abonné hériterait de son Premium). |
| 2026-10-16 | Tests | `tsc` OK ; `next build` OK (37 routes) ; ESLint : aucune erreur nouvelle (les 19 erreurs existantes sont antérieures, dont `useJob.ts`). Aucun test fonctionnel : pas d'environnement de test. |
| 2026-10-16 | Décision (Q-01, Q-03, Q-05, Q-06, Q-12) | Réponses du responsable intégrées aux § 34 à 37 : étude commencée au clic enregistré par le serveur ; historique complet des tentatives, meilleure note = référence ; six examens en deux groupes, seuil 10/20 et moyenne ≥ 15/20 ; deux compteurs (progression et bonus BD). Barème et décisions restantes : § 37.3 et § 39. **Implémentation en attente d'autorisation.** |
| 2026-10-16 | Design | Navigation : une couleur par section (contraste AA vérifié), pastille glissante et allumage au clic, sur ordinateur, tablette et mobile (`ca3c5ee`, en production). Bandeau « Ton Premium a expiré le … » sur le tableau de bord (`e4c0bd5`, en production). |
| 2026-10-17 | Rédaction | Refonte livrée : 3 compartiments (cas pratiques, dissertations, commentaires d'arrêt), source « un de mes cours » ou « sujet de mon enseignant », 3 sujets proposés depuis un cours (job `redaction_sujets`, cache par contenu, 10 séries par jour), copie double avec sauvegarde automatique, méthode affichée, correction v2 (erreurs droit, raisonnement, méthode, formulation avec citation de la copie, 3 priorités, comparaison avec la version précédente, appui sur le cours, limites), retravail par versions. Pas d'arrêt inventé par l'IA. Revue de sécurité orientée test d'intrusion : 3 failles élevées corrigées (crédits rendus après suppression d'une copie en correction, appel direct de la mise en file, écriture directe de la copie en base) plus 4 moyennes. Migration 05 : anti-triche (le navigateur ne modifie que le texte de sa copie), contraintes et index. |
| 2026-10-17 | Admin | Purge définitive corrigée : le compte restait actif (tables bloquantes non vidées, erreur de suppression ignorée). |
| 2026-10-16 | Migrations | Écrites dans `database/migrations/` (00 lecture seule, 01 sécurité, 02 bucket privé) ; **non appliquées** pour l'instant. Ordre : déployer le code en production → 00 → 01 → vérifier → 02. |


---

# PARTIE II — DIRECTIVE GÉNÉRALE DE DÉVELOPPEMENT (reçue le 2026-10-16)

> Cette partie décrit la **méthode** et les **nouvelles exigences produit** (design, parcours d'accueil, niveaux L1/L2, abonnements, capacité). Elle ne remplace pas les exigences pédagogiques des sections 8 à 24.

## 26. Méthode de travail

| Phase | Contenu | Preuve attendue |
|---|---|---|
| A. Compréhension | Besoin, comportement actuel, dépendances | Lecture du code et de l'état réel de la base (lecture seule) |
| B. Ressources | Skills et outils réellement utiles (§ 27) | Tout outil cité a été réellement exécuté |
| C. Conception | Solution, risques, migrations, critères de réussite | Validation du responsable **seulement** si la décision est métier, coûteuse ou irréversible |
| D. Réalisation | Code cohérent avec l'architecture, sécurité par défaut | Commits commentés |
| E. Contrôle | Revue de code, tests, Playwright (mobile, tablette, ordinateur), sécurité | Résultats réels, avec captures |
| F. Correction | Traitement des problèmes, nouveaux tests | Nouveau passage des tests |
| G. Compte rendu | Fait, testé, restant | Distinction entre « mesuré », « estimé » et « non vérifié » |

**Toujours soumis au responsable** : dépenses, nouvelles installations ou permissions, écriture sur les données réelles et migrations destructives, opérations irréversibles, règles métier (prix, durées, niveaux, seuils d'examen). **Jamais** : inventer un outil, un résultat ou une fonctionnalité, ni annoncer une capacité sans mesure.

## 27. Ressources disponibles (vérifiées le 2026-10-16)

| Domaine | Ressources réellement disponibles | Usage |
|---|---|---|
| Front-end et design | Skills `frontend-senior`, `senior-frontend`, plugin `frontend-design`, `visual-review`, `design:design-critique`, `design:design-system`, `design:ux-copy`, `design:accessibility-review` | Conception, cohérence, textes, accessibilité |
| Back-end et données | `backend-senior`, `senior-backend`, `database-senior`, `engineering:system-design`, `engineering:architecture` | API, schéma, migrations, capacité |
| Sécurité | `security-senior`, `security-audit`, `security-review`, analyse automatique des commits (plugin security-guidance), `npm audit` | Revue de chaque changement sensible |
| Revue de code | `code-review`, agent `feature-dev:code-reviewer`, `engineering:code-review` | Relecture indépendante avant la mise en ligne |
| Tests | Playwright (navigateur piloté), `engineering:testing-strategy` | Parcours réels, captures sur 3 tailles d'écran |
| Recherche | Firecrawl, Context7 | Recherche concurrentielle, documentation à jour |
| Plateformes | CLI Vercel (connectée, équipe `tuina`, offre Hobby), connecteurs Vercel et Supabase, jeton Supabase (API de gestion) | Déploiements, journaux, état de la base, conseillers de sécurité |
| Next.js 16 | `node_modules/next/dist/docs` (exigé par `AGENTS.md`) | Toute modification Next.js |

**Outils manquants** :

| Outil | Pour quoi | Statut | Coût et risques |
|---|---|---|---|
| **k6** (open source) | Tests de charge (§ 32) | **Indispensable** avant toute affirmation de capacité | Gratuit (`winget install k6`) ; ne jamais frapper la production avec des appels Gemini |
| **@playwright/test** (dépendance de développement) | Suite de non-régression rejouable | **Indispensable** | Gratuit, non embarqué dans le site |
| **Projet Supabase de test** (offre Free) | Migrations et tests de charge sans les vraies données | Fortement recommandé | Gratuit ; reproduire le schéma |
| `gitleaks` | Secrets dans l'historique git | Utile | Gratuit |
| Supabase CLI | Migrations versionnées, types générés | Utile | Gratuit ; instance locale = Docker (absent) |
| Suivi des erreurs (Sentry, offre gratuite) | Erreurs réelles de production | Utile plus tard | Données personnelles à filtrer |

## 28. Point de sécurité prioritaire

**C-20 — Next.js 16.2.9 vulnérable — CRITIQUE — CONFIRMÉ (`npm audit`)** : 7 avis, dont une exécution de code à distance (optimisation d'images AVIF, `next/og`), un **contournement du proxy dans l'App Router avec Turbopack** (notre configuration ; la garde admin du layout limite le risque), des SSRF et des empoisonnements de cache. Correctif : **16.4.2** (même version majeure). Autres : `nanoid`, `postcss` (élevé), `baseline-browser-mapping`, `protobufjs` (modéré).

## 29. Design et expérience utilisateur

**Fait** : système « le Code annoté » (bleu et blanc, Source Serif 4 et Source Sans 3) ; navigation mobile, tablette et ordinateur ; composants de base ; connexion, inscription, accueil, guide, Mes documents et lecteur PDF.

**Reste** : Études guidées, Révisions, Examens, Rédaction, Matières, Progression, Objectifs, Catalogue, Mon compte, administration, landing page.

**Landing page (objectif 17/20, note actuelle 8/20)** :
- **Critères vérifiables** :
  - on comprend en moins de 10 secondes ce que fait SJP et pour qui ;
  - chaque fonctionnalité citée existe ;
  - offres gratuite et Premium expliquées avec leurs limites réelles ;
  - une action principale par écran ;
  - performance mobile mesurée (Lighthouse) ;
  - accessibilité AA ;
  - aucun témoignage ni chiffre inventé.

## 30. Parcours d'accueil et niveaux d'études

- **Parcours** : découverte de SJP, niveau (L1, L2, extensible), accueil personnalisé, offres, choix. Retour et « passer » à chaque étape. Profil unique par compte, questions jamais reposées.
- **Forme retenue** : suite d'écrans **juste après l'inscription** (les réponses ne s'enregistrent qu'avec un compte). La landing page reste rapide et sans questionnaire.
- **Données** : `profiles` (user_id unique, `niveau_id`, `source_decouverte`, `onboarding_termine_at`) et table de référence `niveaux`.
- **Catalogue par niveau (livré)** : `catalog_courses.niveau` (migration 03), séparé du statut d'accès, filtré côté serveur sur tous les chemins de l'application (liste, ouverture directe, révisions, examens, jobs IA). Les cours sans niveau restent visibles de tous. **Nature du filtre** : c'est un outil de **pertinence**, pas une barrière de sécurité. L'étudiant peut changer d'année librement (par exemple pour passer de L1 à L2), et tous les cours du catalogue sont gratuits. Les policies RLS de lecture du contenu d'étude ne tiennent donc pas compte du niveau, et c'est assumé.
- **Prévu** : message de rentrée (« Tu passes en L2 ? ») ; vidéo de présentation en motion design (Remotion) dans la section des années de la landing page, à la fin du projet (emplacement `videoByLevel` déjà prévu dans `LevelChooser.tsx`).

## 31. Abonnements, codes et limites gratuites

**En place** :
- le mois démarre quand l'étudiant connecté active le code ;
- l'expiration est calculée côté serveur à chaque requête (aucun minuteur, reprise sans effet) ;
- la réactivation par l'admin redonne un mois ;
- l'activation est atomique, avec 10 tentatives par jour ;
- les quotas gratuits sont appliqués côté serveur.

**Définition d'un mois** : **30 jours exacts (30 × 24 h)** depuis l'activation, déjà en place. Cette règle est simple et sans ambiguïté sur les fins de mois ou les fuseaux horaires. L'alternative serait le mois calendaire à Ouagadougou (UTC+0), qui demande une règle spéciale pour les 29, 30 et 31.

**À construire** :
- états explicites d'un code (disponible, attribué, activé, expiré, révoqué) ;
- message d'expiration à la reconnexion, avec renouvellement ;
- journal des activations ;
- limites gratuites contextualisées.

## 32. Capacité : 10 000 puis 25 000 utilisateurs

**Hypothèses (à confirmer)** :
- 10 000 comptes ;
- environ 15 % d'actifs par jour (1 500) ;
- un pic d'examens à environ 150 sessions simultanées, soit 20 à 40 requêtes par seconde ;
- × 2,5 pour 25 000 comptes.

**Mesure** : k6 sur un environnement de test, jobs IA simulés, paliers de 10, 50, 150 et 400 utilisateurs virtuels. On relève la médiane et le 95e centile, les erreurs, le débit et les connexions à la base. Résultats consignés ici, en séparant « mesuré » et « estimé ».

## 33. Stratégie ordonnée

| # | Étape | Dépend de | Critère de validation |
|---|---|---|---|
| 0 | Migrations 01 et 02 (appliquées par le responsable dans Supabase, l'outil refusant l'écriture en production) | — | Fichier 00 relancé ; test de l'expiration |
| 1 | Next.js 16.4.2 et `npm audit fix` (C-20) | — | Build, Playwright, plus aucune alerte critique |
| 2 | Fin de la refonte des écrans existants | 1 | Captures sur 3 tailles, accessibilité AA, aucune régression |
| 3 | Landing page | 2 | Critères du § 29 |
| 4 | Outillage : `@playwright/test`, projet Supabase de test, k6 | Accord d'installation | Suite verte |
| 5 | Profil, parcours d'accueil, niveaux et catalogue par niveau | 4 | Règles vérifiées côté serveur |
| 6 | Abonnements (états, expiration, journal), limites contextualisées | 0 | Scénarios d'abonnement testés |
| 7 | Capacité : index, requêtes, cache, mesures k6 | 4 | Rapport de mesures |
| 8 | Pédagogie (sections 8 à 24) | 2, 5, réponses du § 24 | Critères des sections 13 à 23 |

---

# PARTIE III — RÈGLES PÉDAGOGIQUES VALIDÉES (réponses du 2026-10-16)

> Réponses du responsable aux questions Q-01, Q-03, Q-05, Q-06 et Q-12. **Elles remplacent les propositions des § 13 et 15 sur les points traités.** Chaque règle est classée :
> - ✅ **VALIDÉE** : décidée par le responsable, à appliquer telle quelle ;
> - 🔧 **FORMALISATION** : déduite des règles validées par l'assistant, pour rendre le parcours cohérent ; **à confirmer** ;
> - ⚙️ **PARAMÈTRE TECHNIQUE** : détail de réalisation choisi par l'assistant, sans effet sur la règle pédagogique ;
> - ❓ **DÉCISION ATTENDUE** : le responsable doit trancher (liste complète au § 39).
>
> **Aucune de ces règles n'est encore développée.** L'implémentation attend l'autorisation explicite du responsable.

## 34. Q-01 — Étude guidée « commencée »

| # | Règle | Statut |
|---|---|---|
| R-01 | Une étude est **commencée** quand l'étudiant clique sur « Commencer l'étude » **et** que le serveur enregistre le démarrage. Consulter la page d'un cours ne compte pas. | ✅ |
| R-02 | Trois états : **non commencée** (aucun démarrage), **en cours** (démarrée, pas terminée), **terminée** (conditions de complétion remplies). | ✅ |
| R-03 | L'état est conservé **en base** : il survit à la fermeture de la page, à la déconnexion et au changement d'appareil. | ✅ |
| R-04 | L'étude **reprend là où l'étudiant s'était arrêté**. | ✅ |
| R-05 | Examens de maîtrise : il suffit que l'étude du cours soit **commencée** (en cours ou terminée). Il n'est pas nécessaire de la terminer. | ✅ |
| R-06 | « Terminée » = toutes les séquences du parcours terminées (chaque thème validé sur le fond). | 🔧 |
| R-07 | Le démarrage est **idempotent** : un double clic ou un second appareil ne crée pas deux parcours ; la date du premier démarrage ne change jamais. | ⚙️ |
| R-08 | Stockage : on réutilise `etude_progression_cours` (déjà unique par étudiant et par cours, statut `en_cours` / `termine`), en ajoutant `started_at` (premier démarrage) et `derniere_position` (séquence et thème en cours). L'absence de ligne signifie « non commencée ». Écriture **uniquement par une action serveur**, jamais par le navigateur. | ⚙️ |

## 35. Q-03 — Note retenue quand un examen est repassé

| # | Règle | Statut |
|---|---|---|
| R-10 | **Chaque tentative** est conservée avec sa date et sa note. Aucune tentative n'est effacée ni remplacée. | ✅ |
| R-11 | La **meilleure note** d'un examen est la **note de référence** pour la progression et les déblocages. | ✅ |
| R-12 | La **dernière note** est affichée à part (« Dernière tentative : 12/20 le 14/11 »), pour montrer le résultat le plus récent. | ✅ |
| R-13 | Une tentative interrompue par une **erreur technique** ne compte ni comme une tentative ni comme un échec ; le quota est rendu (mécanisme déjà en place). | 🔧 |
| R-14 | Les notes de référence sont **recalculées par le serveur** à partir des tentatives. Aucun champ « meilleure note » envoyé par le navigateur n'est accepté. | ⚙️ |

Conséquence : une note de référence ne peut que monter. **Un déblocage obtenu n'est donc jamais retiré.**

## 36. Q-05 / Q-06 — Les six examens de maîtrise et l'après-échec

### 36.1 Structure

| # | Règle | Statut |
|---|---|---|
| R-20 | Au maximum **six examens distincts par cours** : groupe 1 = examens 1, 2, 3 ; groupe 2 = examens 4, 5, 6. | ✅ |
| R-21 | Repasser un examen **n'en crée pas un nouveau** : c'est une nouvelle tentative du même examen. | ✅ |
| R-22 | Une nouvelle tentative propose **une autre variante** (autres questions sur les mêmes notions), pour qu'on progresse en comprenant plutôt qu'en mémorisant les réponses. | 🔧 |

### 36.2 Règles de déblocage complètes

| Examen | Condition d'accès | Statut |
|---|---|---|
| **Examen 1** | Étude guidée du cours **commencée** (R-05) | ✅ |
| **Examen 2** | Meilleure note à l'examen 1 **≥ 10/20** | ✅ |
| **Examen 3** | Meilleure note à l'examen 2 **≥ 10/20** | 🔧 (même seuil que l'examen 1, appliqué en chaîne) |
| **Groupe 1 validé** | Les 3 examens passés **et** moyenne des meilleures notes **(n1 + n2 + n3) ÷ 3 ≥ 15/20** | ✅ |
| | … **et** chacun des 3 examens ≥ 10/20 | 🔧 ❓ D-01 |
| **Examen 4** | Groupe 1 validé | ✅ |
| **Examen 5** | Meilleure note à l'examen 4 **≥ 10/20** | 🔧 |
| **Examen 6** | Meilleure note à l'examen 5 **≥ 10/20** | 🔧 |
| **Groupe 2 validé = cours maîtrisé** | Les 3 examens passés, chacun ≥ 10/20, **et** moyenne des meilleures notes (n4 + n5 + n6) ÷ 3 ≥ 15/20 | 🔧 ❓ D-02 |

**Pourquoi exiger aussi ≥ 10/20 sur chaque examen du groupe (D-01)** : avec 19, 19 et 8, la moyenne est de 15,33/20, mais l'examen 3 est raté. Sans cette condition, un examen manqué pourrait être « compensé ». En pratique, la chaîne l'impose déjà pour les examens 1 et 2 ; la condition ne change le résultat que pour le dernier examen du groupe.

**Exemple validé** : 16, 17 et 19 → (16 + 17 + 19) ÷ 3 = 52 ÷ 3 = **17,33/20** → groupe 2 débloqué.

### 36.3 Après un échec

| Situation | Ce que fait le système | Statut |
|---|---|---|
| **Note < 10/20 sur un examen** (n'importe lequel des 6) | L'examen suivant reste verrouillé. L'étudiant reçoit une **correction pédagogique** : ce qui était juste ou faux et pourquoi, les **notions mal comprises**, et un lien vers les passages du cours et les cartes de révision correspondantes. Il est invité à réviser, puis à repasser l'examen (nouvelle variante). | ✅ examen 1 · 🔧 examens 2 à 6 |
| La révision avant la nouvelle tentative est-elle **obligatoire** ou seulement **recommandée** ? | Ta réponse dit « recommander ». Proposition : **recommandée** et mise en avant, sans blocage. | ❓ D-03 |
| **Moyenne du groupe 1 < 15/20** (les 3 examens passés) | Les examens 4 à 6 restent verrouillés. Le système affiche : la **moyenne** (ex. 13,67/20) ; **les points manquants** (ex. « il te manque 4 points au total sur les 3 examens ») ; les **notions à renforcer** ; et **les examens à repasser en priorité** (ceux qui ont la plus petite meilleure note, donc la plus grande marge de progrès). | ✅ |
| | L'étudiant repasse **seulement les examens qu'il choisit**. Ceux qui sont déjà bons n'ont pas à être refaits. La moyenne est recalculée avec la meilleure note de chaque examen. | ✅ |
| **Note < 10/20 dans le groupe 2** (ex. examen 4) | Même règle qu'au groupe 1 : l'examen 5 reste verrouillé, correction, notions à revoir, nouvelle tentative de l'examen 4. **Le groupe 1 reste validé** : un échec au groupe 2 ne fait jamais perdre un déblocage acquis. | 🔧 |
| **Moyenne du groupe 2 < 15/20** (les examens 4, 5 et 6 passés) | Le cours n'est pas encore **maîtrisé**. Statut affiché : « Parcours de maîtrise achevé, à consolider » avec la moyenne, les points manquants et les examens à repasser en priorité (parmi 4, 5 et 6). L'étudiant peut retenter ces examens pour obtenir la maîtrise. | 🔧 ❓ D-02 |
| **Limite de tentatives** | Proposition anti-abus : **3 tentatives par examen et par jour**. Au-delà : « Tu as fait 3 tentatives aujourd'hui sur cet examen. Reviens demain, après avoir revu les notions signalées. » | ❓ D-04 |

### 36.4 Fin du parcours

| # | Règle | Statut |
|---|---|---|
| R-30 | Après les six examens, l'étudiant consulte ses résultats, ses corrections et son historique, puis il est encouragé à passer à un autre cours. | ✅ |
| R-31 | Un cours **maîtrisé** reçoit un repère visible (« Cours maîtrisé · moyenne 16,4/20 ») dans Progression et dans le catalogue. | 🔧 |
| R-32 | Après la maîtrise, les examens peuvent encore être repassés **pour s'entraîner** (historique complet), sans rapporter de points de déblocage. | ❓ D-05 |

### 36.5 Paramètres techniques

- ⚙️ Nouvelle table `examen_tentatives` (une ligne par tentative : étudiant, cours, numéro d'examen 1 à 6, variante, note, date, statut). Les tentatives existent déjà dans `examen_sessions` : on y ajoute le cours et le numéro d'examen plutôt que de dupliquer.
- ⚙️ Une **vue serveur** calcule pour chaque cours : la meilleure et la dernière note de chaque examen, la moyenne de chaque groupe et l'état (verrouillé, ouvert, réussi, validé). L'interface lit cette vue ; elle ne calcule rien elle-même.
- ⚙️ La correction et les **notions mal comprises** s'appuient sur le champ `theme` / `notion` de chaque question de la banque, déjà présent.
- ⚙️ Arrondi : la moyenne est calculée sans arrondi intermédiaire et comparée à 15 exactement (14,99 ne suffit pas) ; elle est **affichée** avec deux décimales.

## 37. Q-12 — Points de progression et bonus BD

### 37.1 Deux compteurs distincts

| | **Points de progression** | **Compteur du bonus BD** |
|---|---|---|
| Ce qu'ils mesurent | Tout le travail pédagogique réel depuis l'inscription | Les points admissibles gagnés **depuis l'activation** du bonus |
| Remise à zéro | Jamais | À chaque BD livrée (nouveau cycle) |
| Affichage | « 342 points de progression » | « Bonus BD : 124 / 200 » |
| Dépensés par la BD ? | **Non**, jamais | Oui, le cycle se termine à la livraison |

Ces deux compteurs viennent d'un **même registre** de points (`points_ledger`) : le compteur BD est la somme des lignes admissibles gagnées après la date d'activation. Il n'y a qu'une seule source de vérité.

### 37.2 Règles validées

| # | Règle | Statut |
|---|---|---|
| R-40 | Les points récompensent le **travail pédagogique réel**, la **qualité** et la **progression**, pas les clics ni le volume. | ✅ |
| R-41 | Activités admissibles : Études guidées, Examens, Rédaction, Révision. | ✅ |
| R-42 | Points attribués selon des règles explicites, **vérifiées côté serveur**. | ✅ |
| R-43 | Ouvrir une page, cliquer plusieurs fois ou répéter un exercice facile ne rapporte rien. | ✅ |
| R-44 | Une même activité validée ne rapporte **pas plusieurs fois** de manière abusive. | ✅ |
| R-45 | Cycle BD : conditions minimales atteintes → notification au tableau de bord → l'étudiant **active** son bonus → le compteur BD part de 0 → à **200 points**, il choisit un cours → BD pédagogique en PDF. | ✅ |
| R-46 | Le cours choisi peut être un cours déjà étudié, un cours de sa bibliothèque ou un cours ajouté plus tard, si le fichier est **accessible** pour lui et **exploitable** (texte lisible). | ✅ |
| R-47 | **Une activation = une seule BD.** Une nouvelle BD suppose un nouveau cycle, sans double attribution. | ✅ |
| R-48 | La BD reste fidèle au cours, explique avec des situations concrètes et un langage accessible, préserve la précision juridique, dans un PDF de qualité. | ✅ |

### 37.3 Barème proposé — ❓ D-06 (à valider avant tout développement)

**Principe** : on paie la **compréhension démontrée** (une réponse jugée correcte, un seuil de note franchi, un progrès mesuré), jamais la simple présence. Chaque gain est **unique** (contrainte d'unicité étudiant + règle + objet) et **plafonné**.

**Études guidées**

| Activité | Condition de qualité | Points | Limite |
|---|---|---|---|
| Thème validé | Cas pratique « fond » jugé **correct** par le serveur, **au premier essai** | **+3** | 1 fois par thème |
| Thème validé après correction | Correct après une ou plusieurs remédiations | **+2** | 1 fois par thème |
| Séquence terminée | Tous ses thèmes validés | **+5** | 1 fois par séquence |
| Parcours terminé | Toutes les séquences terminées (R-06) | **+15** | 1 fois par cours |
| Ouvrir, lire, cliquer « Suivant » | — | **0** | — |

**Examens** (calculés sur la **meilleure** note, R-11)

| Activité | Condition | Points | Limite |
|---|---|---|---|
| Seuil de réussite franchi | Meilleure note qui passe **≥ 10/20** | **+8** | 1 fois par examen |
| Seuil « bien » franchi | Meilleure note qui passe **≥ 14/20** | **+4** | 1 fois par examen |
| Seuil « excellent » franchi | Meilleure note qui passe **≥ 17/20** | **+4** | 1 fois par examen |
| Groupe 1 validé | Règles du § 36.2 | **+15** | 1 fois par cours |
| Cours maîtrisé | Groupe 2 validé | **+25** | 1 fois par cours |
| Nouvelle tentative sans nouveau seuil | — | **0** | — |

→ **Le progrès est récompensé naturellement** : passer de 9 à 12 rapporte +8 ; de 12 à 15, +4 ; refaire 15 ne rapporte rien. Un examen rapporte au maximum 16 points, quel que soit le nombre de tentatives.

→ **Niveau de difficulté** (proposition) : facile = 50 % des points, moyen = 100 %, difficile = 125 %. Les seuils sont acquis une seule fois, au niveau où ils sont franchis. ❓ D-07

**Rédaction juridique**

| Activité | Condition | Points | Limite |
|---|---|---|---|
| Copie corrigée | Longueur minimale de l'exercice atteinte (ex. 300 mots pour une dissertation) | **+3** | 2 copies par jour |
| Méthodologie respectée | La correction valide la structure attendue (problématique, plan, annonce) | **+3** | 1 fois par copie |
| Note ≥ 10/20 | Note indicative de la correction | **+5** | 1 fois par copie |
| Note ≥ 14/20 | | **+3** | 1 fois par copie |
| Amélioration après correction | Nouvelle version de la **même** copie qui gagne **au moins 2 points** | **+5** | 1 fois par copie |

**Révision**

| Activité | Condition | Points | Limite |
|---|---|---|---|
| Session de révision complète | Au moins 10 cartes **dues** (cartes déjà maîtrisées exclues), **≥ 70 %** de bonnes réponses | **+2** | 2 sessions par jour |
| Carte difficile maîtrisée | Une carte ratée au moins 2 fois qui atteint l'intervalle « maîtrisée » | **+1** | 5 par jour |

**Protections communes**

| Protection | Valeur proposée |
|---|---|
| Plafond quotidien global | **40 points par jour**. Au-delà, l'activité est enregistrée (elle compte pour la progression pédagogique), mais elle ne rapporte plus de points ce jour-là. |
| Réponses trop rapides | Un examen rendu en moins de **4 secondes par question en moyenne** est noté normalement, mais il **ne rapporte aucun point**. |
| Source des faits | Uniquement des faits établis par le serveur : session notée, correction enregistrée, réponse évaluée. Jamais un compteur envoyé par le navigateur. |
| Unicité | Index unique `(user_id, regle, objet_id)` dans `points_ledger` : la même récompense ne peut pas être inscrite deux fois, même en cas de double requête. |
| Historique lisible | Chaque ligne a un motif : « +8 · Examen 2 réussi (12/20) · Droit des obligations ». |

**Ordre de grandeur** (estimation, à confirmer sur de vrais cours) : un cours de 4 séquences et 16 thèmes, étudié sérieusement, rapporte environ 50 à 85 points en Étude, plus 60 à 135 points en Examens (avec la maîtrise). Soit **environ 110 à 220 points pour un cours travaillé à fond**. Avec le plafond de 40 points par jour, il faut **au moins 5 jours** d'activité réelle pour atteindre 200 points : la BD récompense la régularité, pas un marathon d'un soir.

### 37.4 Éligibilité initiale au bonus — ❓ D-08

Proposition : la notification « Ton bonus BD est disponible » apparaît quand, sur les 30 derniers jours, l'étudiant a :
1. au moins **5 jours actifs** distincts (un jour actif = au moins un point gagné) ;
2. au moins **60 points de progression** ;
3. **et** soit un examen avec une meilleure note ≥ 14/20, soit un parcours d'Étude terminé.

### 37.5 Compteur de 200 points

| # | Règle proposée | Statut |
|---|---|---|
| R-50 | Le compteur démarre à **0 à l'activation**. Seuls les points gagnés **après** l'activation comptent, avec les mêmes plafonds. | ✅ (R-45) |
| R-51 | Un seul cycle actif à la fois par étudiant (contrainte en base). | ⚙️ |
| R-52 | À 200 points : « Choisis le cours à transformer en BD ». Le compteur s'arrête en attendant le choix. | 🔧 |
| R-53 | Les points gagnés au-delà de 200 **ne sont pas reportés** sur le cycle suivant (ils restent dans les points de progression). | ❓ D-09 |
| R-54 | Après la livraison d'une BD, un nouveau cycle est possible quand les conditions d'éligibilité sont de nouveau remplies, **sur une période qui commence après la livraison**, avec au minimum **14 jours** entre deux BD. | ❓ D-10 |

### 37.6 Génération de la BD et erreurs techniques

| Cas | Traitement proposé |
|---|---|
| Cours choisi **inaccessible** (pas les droits) ou **inexploitable** (PDF scanné sans texte, texte trop court) | Refusé **avant** le lancement, avec la raison et la possibilité de choisir un autre cours. Le bonus reste intact. |
| Panne passagère (IA indisponible, délai dépassé) | Jusqu'à **3 nouveaux essais automatiques** espacés. L'étudiant voit « BD en préparation ». |
| Échec définitif | Le bonus **n'est pas consommé**. Message : « La BD n'a pas pu être créée. Ton bonus est intact : relance-la ou choisis un autre cours. » L'administrateur voit l'échec dans le tableau de bord. |
| Budget IA du mois atteint | La demande est **mise en file d'attente** (pas refusée) et l'étudiant est prévenu de la date probable. |
| Succès | BD consultable en ligne + PDF téléchargeable ; le cycle est clos. |
| Même cours déjà transformé pour un autre étudiant | La BD existante est réutilisée (pas de nouvelle génération). Le cycle de l'étudiant est tout de même clos. |
| Double clic, deux onglets | Transitions d'état atomiques en base : une seule génération par cycle. |

Production : option A du § 15.4 (scénario JSON généré par l'IA, rendu en pages HTML/SVG avec des personnages réutilisables, puis export PDF). Coût : 1 à 2 appels texte par BD.

## 38. Conséquences sur les sections précédentes

- **§ 13.1** : les lignes « Accès à l'examen 1 », « Palier 1 → palier 2 », « Échec » et « Nouvelle tentative » sont remplacées par le § 36. La règle Q-01 « au moins une séquence terminée » est **abandonnée** : il suffit que l'étude soit commencée (R-05).
- **§ 15.2** : le barème est remplacé par celui du § 37.3 (encore à valider). Le multiplicateur « difficile ×1,5 » devient ×1,25.
- **§ 15.3** : la question Q-12 est tranchée : le compteur BD part de 0 à l'activation (R-50).
- **§ 24** : Q-01, Q-03, Q-05, Q-06 et Q-12 sont résolues ; les nouvelles décisions sont au § 39.

## 39. Décisions encore attendues

| ID | Question | Proposition de l'assistant |
|---|---|---|
| **D-01** | Pour valider le groupe 1, faut-il **aussi** ≥ 10/20 à chacun des 3 examens, en plus de la moyenne ≥ 15/20 ? | **Oui** (évite qu'un examen raté soit compensé) |
| **D-02** | Le groupe 2 suit-il exactement les mêmes règles (chaîne à 10/20 + moyenne ≥ 15/20) pour que le cours soit « maîtrisé » ? Si la moyenne reste < 15, statut « achevé, à consolider » ? | **Oui** aux deux |
| **D-03** | Après un échec, la révision des notions signalées est-elle **obligatoire** avant de repasser, ou seulement **recommandée** ? | **Recommandée** |
| **D-04** | Limite de tentatives par examen | **3 par jour** |
| **D-05** | Repasser les examens après la maîtrise, pour s'entraîner, sans points | **Autorisé** |
| **D-06** | Barème du § 37.3 (valeurs et limites) | Tel que proposé |
| **D-07** | Effet de la difficulté sur les points | facile 50 %, moyen 100 %, difficile 125 % |
| **D-08** | Conditions d'éligibilité initiale au bonus | 5 jours actifs, 60 points, et un examen ≥ 14 ou un parcours terminé |
| **D-09** | Points au-delà de 200 reportés sur le cycle suivant ? | **Non** |
| **D-10** | Délai minimal entre deux BD | **14 jours**, avec l'éligibilité recalculée après la livraison |

---

# PARTIE IV — REFONTE DES ÉTUDES GUIDÉES (prompt directeur pédagogique, reçu le 2026-10-17)

> **Statut : PROPOSITION. Aucune ligne de code des Études guidées n'est modifiée avant l'autorisation du responsable.**
>
> **Source manquante, signalée** : le prompt directeur fait référence à un « prompt maître d'analyse des cours » transmis auparavant. Ce document n'a jamais été reçu dans cette session (vérifié dans l'historique et dans le dépôt). Le responsable a indiqué ne plus l'avoir et a demandé de faire sans. Les principes ci-dessous sont donc **reconstruits** à partir du prompt directeur (§ 2 à 9) et des prompts 2 à 4 (§ 8 à 24) : ils ne prétendent pas reproduire ce document.

## 40. Diagnostic : pourquoi la version actuelle vaut 8/20

Analyse en lecture seule du code (agent d'exploration, 2026-10-17). Chaque point est prouvé par le code.

### 40.1 Parcours actuel, du clic à la fin

1. Liste des cours (`/app/etude`) → « Commencer » ouvre `/app/etude/[pdfId]`.
2. **L'ouverture de la page lance immédiatement la génération** (`EtudeEngine.tsx:140`), sans confirmation.
3. `POST /api/etude/generate` → job `etude` → worker `processEtude` : extraction du texte (`pdf-parse`), **un seul appel Gemini** avec le prompt `pedagogicalEngine.ts` sur les **50 000 premiers caractères** (`worker/ai/route.ts:889`).
4. Le JSON produit 3 à 5 sections × 2 à 4 thèmes. Il est écrit dans `etude_sections` / `etude_themes`, puis la page se recharge.
5. Par thème : explication (environ 120 mots) → QCM « forme » → cas pratique « fond » corrigé par l'IA → questions de clôture de section → fin.
6. Fin de cours : « Bravo », liens vers Révisions et Évaluations.

### 40.2 Les 11 insuffisances

| # | Insuffisance | Preuve |
|---|---|---|
| I-1 | Seuls les **50 000 premiers caractères** sont lus, **sans avertissement**. L'écran final affirme pourtant « l'intégralité du document ». | `route.ts:889`, `EtudeEngine.tsx:732` |
| I-2 | Taille **figée** : 3 à 5 sections, 2 à 4 thèmes, quelle que soit la longueur du cours. Explications d'environ 120 mots. | `pedagogicalEngine.ts:154,169` |
| I-3 | **Un seul passage IA** pour tout (analyse, explications, QCM, cas, remédiations), sans relecture ni contrôle de fidélité. | `route.ts:887-893` |
| I-4 | **Aucune synthèse réelle** : 2 à 3 phrases par section, affichées 2 fois à l'identique, sans export PDF. L'analyse riche (articles, pièges, questions d'examen) est stockée mais **jamais montrée**. | `EtudeEngine.tsx:361,718` |
| I-5 | **Activités décoratives** : l'amorce a 2 boutons qui font la même chose, le texte à trous n'est pas noté, les étapes « Qualifier » et « Règle » ne vérifient rien. | `EtudeEngine.tsx:393-396, 454, 533-566` |
| I-6 | **QCM corrigé par égalité de chaînes** sans vérifier que la bonne réponse figure parmi les choix. Une reformulation de l'IA rend le QCM impossible à réussir. | `EtudeEngine.tsx:296`, `route.ts:935` |
| I-7 | **Progression non contraignante** : boutons « Passer » et « Continuer » toujours disponibles, pas de retour en arrière, réponses jamais conservées, pas de bilan. | `EtudeEngine.tsx:514,606,630` |
| I-8 | **Progression falsifiable** : l'API accepte n'importe quel état envoyé par le navigateur. Le statut « terminé » n'est jamais enregistré (codé en dur `en_cours`). | `progress/route.ts:22, 30-72` |
| I-9 | **Erreurs mal gérées** : sauvegarde de progression silencieuse en cas d'échec, une panne technique présentée comme une « mauvaise réponse », PDF scanné sans issue, thèmes vides possibles. | `EtudeEngine.tsx:201,240,477,525` |
| I-10 | Catalogue : l'analyse pédagogique est **toujours vide** (mauvaise lecture de la requête). | `catalogue/[catalogId]/page.tsx:142` |
| I-11 | La correction du cas pratique **fait confiance au navigateur** (situation, réponse attendue envoyées par le client), sans limite de longueur, sans Premium. | `evaluate/route.ts:37` |

## 41. Principes pédagogiques retenus (reconstruits, à valider)

Ils remplacent le prompt unique actuel par une **chaîne d'analyse**. Chaque étape a sa propre consigne et sa propre sortie structurée (JSON validé par le code).

1. **Comprendre avant de résumer** : lecture de tout le texte accessible, section par section. Le système sait quelles pages ont été lues et le dit.
2. **Représentation interne du cours** (« carte des connaissances ») : concepts, définitions, règles, conditions, exceptions, distinctions, mécanismes, exemples du cours, liens. Chaque élément porte un **niveau** (indispensable, important, subtil, complémentaire) et une **référence de page**.
3. **Regard d'examinateur** : ce qu'un examinateur exigeant vérifierait, et les erreurs d'un étudiant qui aurait seulement appris par cœur. **Usage interne** : cela décide de ce que la synthèse doit expliquer ; cela n'en fait jamais un QCM.
4. **Explication choisie, pas mécanique** : pour chaque notion, seulement les rubriques utiles (définition, reformulation, mécanisme, conditions, exceptions, distinction, exemple, contre-exemple, schéma, erreur fréquente).
5. **Style** : un professeur qui tutoie. Situation concrète → intuition → terme exact → définition rigoureuse → mécanisme → limites → lien avec le reste du cours. L'analogie aide, elle ne remplace jamais la règle.
6. **Fidélité** : chaque bloc est marqué *issu du cours*, *explication pédagogique* ou *complément*. Aucune règle, disposition ou référence inventée. Une absence ou une ambiguïté est signalée.
7. **Adapté à la discipline** : le droit appelle des arbres de conditions et des tableaux de distinctions, l'histoire des frises, la comptabilité des exemples chiffrés.

## 42. Nouveau parcours proposé

```
[Commencer l'étude] ──▶ démarrage ENREGISTRÉ (Q-01 validée)
        │
        ▼
  A. Analyse du PDF (job asynchrone, progression réelle affichée)
     1. Extraction page par page ─ couverture : « 46 pages lues sur 48 (2 pages scannées illisibles) »
     2. Découpage en segments selon le plan détecté (environ 10 à 12 000 caractères)
     3. Analyse de chaque segment → carte des connaissances partielle (en parallèle, borné)
     4. Consolidation → carte globale + regard d'examinateur + rapport de couverture
        │
        ▼
  B. SYNTHÈSE PÉDAGOGIQUE (avant toute séquence)
     lire en ligne · sommaire cliquable · schémas et tableaux · télécharger en PDF · conservée dans le cours
        │  « Commencer le parcours »
        ▼
  C. PARCOURS EN SÉQUENCES (suivant le plan réel du cours, pas un nombre fixe)
     pour chaque séquence : objectif → explication guidée → visuel (si utile)
       → mise en relation → vérification → retour (juste / partiel / à revoir) → validation
     la séquence N+1 est préparée en arrière-plan pendant la séquence N
        │
        ▼
  D. Fin : carte mentale (consultable, téléchargeable) + bilan des notions solides et à revoir
     → Révision libre · Examens de maîtrise (règles § 36)
```

### 42.1 La synthèse

- **Production** : à partir de la carte globale (étape A.4) et de courts extraits ciblés du cours. On ne renvoie jamais tout le PDF.
- **Format** : une liste de blocs typés (titre, paragraphe, définition, tableau comparatif, schéma, exemple, piège, fiche mémo, « à approfondir »), chacun avec sa source et ses pages. Le schéma est une **donnée** (arbre de décision, processus, comparaison, frise) dessinée en SVG par l'application : il est lisible sur téléphone, cliquable et exact, contrairement à une image générée.
- **Contenu** : les 12 rubriques du prompt directeur, seulement celles qui ont un sens pour ce cours. **Aucun QCM ni exercice.** Un exemple résolu reste possible s'il est présenté comme une explication.
- **Affichage** : page dédiée `/app/etude/[id]/synthese`, sommaire collant, progression de lecture.
- **PDF** : version imprimable mise en page (CSS d'impression) et bouton « Télécharger en PDF » (impression du navigateur, qui fonctionne sur Android Chrome). Aucune dépendance ni aucun coût. Une génération côté serveur reste possible plus tard (décision E-02).
- **Conservation** : stockée une fois par contenu (empreinte du texte + version du moteur), réutilisée pour tout document identique. Jamais de données personnelles dans ce cache.

### 42.2 Les séquences

- **Nombre et découpage** : déterminés par le plan réel et la densité (par exemple 4 séquences pour un cours court, 9 pour un polycopié).
- **Vérifications** : de vraies activités, chacune avec ses critères de réussite écrits à la génération :
  - reformulation libre ;
  - question ouverte ;
  - choix raisonné (QCM **avec justification**) ;
  - identifier la bonne distinction ;
  - appliquer à un mini-cas.
- **Correction des réponses ouvertes** : côté serveur, à partir du contenu **lu en base** (et non envoyé par le navigateur), selon une grille (attendus, erreurs typiques). Résultat : *juste*, *partiel* (ce qui manque) ou *à revoir* (la confusion expliquée, puis une autre explication ou un autre exemple). Jamais le même texte répété.
- **Validation d'une séquence** (proposition, E-04) : toutes les vérifications réussies, ou réussies après remédiation. Après 3 essais, la notion est marquée « à revoir » et l'étudiant peut avancer : on ne le bloque pas indéfiniment.
- **Réponses conservées** : elles alimentent les notions solides et à revoir, et les recommandations de révision.

### 42.3 Navigation, retour arrière, reprise

| État d'une séquence | Signification | Accès |
|---|---|---|
| Verrouillée | Pas encore atteinte | Refusé **par le serveur** (URL ou API comprises) |
| Actuelle | La prochaine étape autorisée | « Continuer » y mène |
| À valider | Commencée, vérifications incomplètes | Ouverte |
| Validée | Objectifs atteints | Ouverte en relecture |

- **Retour arrière libre** sur tout ce qui est déjà débloqué : explications, schémas, réponses et retours.
- **Reprise exacte** : séquence, étape et réponses. L'état est enregistré en base à chaque étape, par une API qui **vérifie l'ordre** (on ne valide pas une séquence future).
- **Historique** : chronologie des séquences validées et des notions renforcées.

## 43. Modifications techniques proposées

| Couche | Modification |
|---|---|
| **Extraction** | Texte **page par page** (pdfjs, déjà présent dans le projet) stocké avec les numéros de page, et rapport de couverture. PDF scanné : message clair, et option de lecture par Gemini du PDF lui-même (E-03, coût à valider). |
| **Moteur IA** | Nouveau job à étapes `etude_v3` : segments → analyse par segment (parallèle borné) → consolidation → synthèse → séquence 1, puis les suivantes à la demande. Chaque étape est un prompt court, versionné, avec schéma JSON **validé par le code** (bonne réponse présente dans les choix, champs non vides). L'avancement est enregistré : une reprise après panne repart de la dernière étape réussie. |
| **Prompts** | `src/lib/prompts/etude/` : `analyse-segment`, `consolidation`, `synthese`, `sequence`, `correction-reponse`. Ce sont les principes du § 41, **réellement envoyés** au modèle et versionnés (le cache dépend de la version). |
| **Base** (migration à valider) | `etude_analyses` (empreinte, version du moteur, carte globale, couverture), `etude_syntheses` (empreinte, version, blocs), `etude_sequences` (cours, ordre, contenu, vérifications), `etude_parcours` (étudiant, cours, `started_at`, séquence actuelle, plus haute séquence débloquée, statut), `etude_reponses` (étudiant, vérification, réponse, verdict, date). RLS : contenus partagés en lecture selon l'accès au document ; parcours et réponses **strictement personnels**. |
| **API** | `start` (démarrage idempotent), `sequence/[n]` (refuse au-delà de la séquence débloquée), `answer` (correction côté serveur à partir du contenu en base, quota), `advance` (vérifie les conditions). L'actuelle `progress/route.ts`, falsifiable, est retirée. |
| **Interface** | Pages *Synthèse* et *Parcours* avec sommaire des séquences et leurs états, composants de schémas SVG (arbre, processus, comparaison, frise) animés sobrement, retours juste / partiel / à revoir, bilan, carte mentale. Mobile d'abord. |
| **Coûts** | Analyse et synthèse : **une fois par contenu**, partagées entre étudiants (catalogue compris). Séquences : générées **à la demande**, donc rien n'est payé pour un parcours abandonné. Corrections ouvertes : un appel court, quota quotidien. Ordre de grandeur pour un polycopié de 100 pages : environ 20 à 25 appels « Flash » pour l'analyse et la synthèse, à **mesurer sur 3 cours réels avant tout déploiement**. |
| **Existant** | Les cours déjà générés restent lisibles (ancien moteur), avec un bouton « Passer à la nouvelle version ». Rien n'est supprimé. |

### 43.1 Correctifs immédiats proposés (indépendants de la refonte, à autoriser)

- I-8 : enregistrer réellement « terminé », démarrer le parcours au clic, refuser les états incohérents.
- I-10 : analyse pédagogique vide sur le catalogue.
- I-11 : correction du cas pratique à partir du thème lu en base, limite de longueur, délimiteurs anti-injection.
- I-6 : refuser à l'écriture un QCM dont la bonne réponse n'est pas parmi les choix.
- I-1 : avertir l'étudiant quand le document a été tronqué.

## 44. Skills et outils par étape

| Étape | Skills et outils |
|---|---|
| Conception pédagogique des prompts et des activités | Principes du § 41, prompts 2 à 4, revue par un enseignant (§ 45) |
| Moteur, API, base | skill **backend-senior**, Context7 (documentation Next.js et Supabase), agent de revue de code |
| Écrans, schémas, animations | skills **frontend-senior** et **frontend-design**, **dataviz** pour les schémas, framer-motion (déjà installé) |
| Sécurité | agent de revue orienté test d'intrusion ; `/security-review` à lancer depuis une session ouverte dans le dépôt |
| PDF | pdfjs (déjà présent) pour l'extraction ; CSS d'impression pour l'export |
| Tests | Playwright (parcours réels, 3 tailles d'écran, reprise après déconnexion, séquences futures refusées), k6 (charge, après accord) |

**Ressource manquante** : un environnement Supabase de test, pour tester les migrations et la charge sans toucher à la production (déjà signalé, Q-16).

## 45. Contrôle qualité et évaluation pédagogique

- **Contrôles automatiques** (à chaque génération) : couverture des pages, blocs non vides, références de pages valides, absence de QCM dans la synthèse, bonnes réponses présentes, longueurs bornées.
- **Grille d'évaluation** pour un professeur (sur 20) : exactitude (5), couverture (4), clarté (3), exemples et schémas (3), progression (3), utilité pour l'examen (2).
- **Protocole** :
  - 3 cours réels de matières différentes ;
  - pour chacun, la version actuelle et la nouvelle, présentées sans indiquer laquelle est laquelle ;
  - évaluées par un professeur et par 5 étudiants volontaires ;
  - mesure : questionnaire de compréhension avant et après.
  - L'objectif de 17/20 se constate, il ne se décrète pas.

## 46. Décisions attendues pour les Études guidées

| ID | Question | Proposition |
|---|---|---|
| E-01 | Séquences générées à la demande (moins cher) ou toutes d'un coup (attente plus longue au départ) ? | **À la demande** |
| E-02 | PDF de la synthèse : impression du navigateur (gratuit, immédiat) ou génération côté serveur (nouvelle dépendance) ? | **Impression du navigateur** d'abord |
| E-03 | PDF scannés : lecture par Gemini du PDF lui-même (coût plus élevé, à mesurer) ou message « PDF illisible » ? | Message clair d'abord, lecture IA en option Premium après mesure du coût |
| E-04 | Validation d'une séquence : bloquer jusqu'à réussite, ou avancer après 3 essais avec la notion marquée « à revoir » ? | **Avancer après 3 essais** |
| E-05 | Cours déjà générés : les régénérer automatiquement, ou à la demande de l'étudiant ? | **À la demande** (bouton) |
| E-06 | Autoriser les **correctifs immédiats** du § 43.1 avant la refonte ? | Oui |

---

# PARTIE V — ÉTUDES GUIDÉES v4 : UN VRAI MOTEUR PÉDAGOGIQUE (2026-10-29)

Sources : précis de DJP (447 pages), échanges du responsable avec un tuteur IA (la méthode à reproduire), mission « Transformation du moteur pédagogique », exigence pédagogique prioritaire, complément illustrations et cartes mentales (dessins de l'application, pas d'images IA : choix du responsable).

## 47. Ce qui a changé

| Avant (v3) | Maintenant (v4) |
|---|---|
| 30 segments au plus : un précis de 447 pages n'était lu qu'à **22 %** | Plan réel de l'auteur détecté par le code (parties, titres, chapitres, sections), **100 %** du contenu en 40 modules au plus |
| Une consolidation unique de tout le cours | Un appel de compréhension par module (notions : sens, problème, mécanisme, prérequis, confusions, pages), puis la synthèse |
| Synthèse ≈ 70 % du cours reformulé | **Introduction pédagogique** : ce que tu vas apprendre, pourquoi, grandes questions, carte générale, branches expliquées « comme au tableau » |
| 3 à 12 séquences, mur de texte + 2 à 4 activités | Jusqu'à 60 **leçons, une notion chacune**, découvertes étape par étape : situation → comprendre → mots du droit → mécanisme pas à pas → exemples et dessin → ne pas confondre → à retenir → 4 vérifications de difficulté croissante → annonce de la suite |
| Même « autre explication » à chaque erreur | Remédiation graduée : autre angle, puis décomposition plus simple et prérequis, puis raisonnement attendu (« À revoir ») |
| Carte mentale SVG figée en fin de parcours | **Carte interactive** (vue d'ensemble + une par module), dépliable, notion → explication → leçons ; dès la découverte du cours et pendant tout le parcours |
| Pas d'illustration | **Dessins pédagogiques** produits par l'application (personnages, rôles, actions numérotées, comparaisons), seulement quand ils aident ; un au plus par leçon |
| Ancienne version v2 encore accessible | Supprimée (moteur, routes /api/etude/*, /api/worker/process, job « etude ») ; les données restent en base |

## 48. Robustesse et coûts
- Contenus communs mutualisés par (empreinte du texte, version) + verrou single-flight + reprise étape par étape.
- Lectures légères : migration 11 (4 colonnes nullables) pour ne jamais relire le JSON lourd des analyses sur une page ; cache mémoire des contenus prêts (immuables).
- Leçon suivante préparée en arrière-plan ; leçons générées à la demande.
- Plafonds : 6 analyses/heure et 4/jour par étudiant ; 40 modules, 60 leçons par cours. Coût estimé d'un précis de 450 pages : ≈ 1 à 1,5 $ une fois pour tous les étudiants, plus ≈ 0,015 $ par leçon générée. **Attention : GEMINI_DAILY_BUDGET_USD vaut 5 $ par défaut.**
- Sécurité : accès revérifié à chaque action qui peut lancer l'IA ; aucun HTML injecté ; balises neutralisées dans les textes envoyés à l'IA.

## 49. Reste à faire / à décider
- **Appliquer la migration 11** (puis 08 à 10 si ce n'est pas fait) avant la mise en production.
- Test pédagogique comparatif réel : `tests/pedagogie/comparer.mts` (3 appels Gemini par passage) — nécessite une clé Gemini locale.
- Le **catalogue** s'appuie encore sur `etude_cours` (ancienne génération) pour publier un cours : à faire migrer vers un rattachement direct au document (migration à valider).
- La page **Progression** (lib/etude/mastery.ts) lit encore l'ancienne progression v2.
