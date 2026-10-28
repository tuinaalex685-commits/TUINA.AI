# Cartographie de SJP pour la montée en charge (28 octobre 2026)

Inspection du code de la branche `fix/phase-b-securite-latence` (lecture complète des routes, actions serveur, proxy, layouts).
Stack : Next.js 16 (App Router, actions serveur, `proxy.ts`), Supabase (PostgreSQL 17, Auth, Storage, RLS), Gemini 2.5 Flash, Vercel (fra1).

## 1. Coût fixe de chaque requête

| Étape | Coût |
|---|---|
| `proxy.ts` → `lib/supabase/middleware.ts` | 1 appel Supabase Auth (`getUser`) sur **toute** requête non statique, `/api/*` compris ; + lecture `user_roles` sur `/admin*` et `/login` |
| Layout `/app/*` | 2ᵉ appel Auth (mis en cache pour le rendu) + `user_roles` + `isPremium` (2 lectures `access_codes` / `user_roles`) |
| **Socle d'une page `/app/*`** | **2 appels Auth + 3 requêtes SQL**, avant le contenu de la page |
| Action serveur / route API | `getUser` du proxy + celui du gestionnaire (2 appels Auth) ; `isPremium` non mis en cache hors rendu |
| Pages statiques (`/`, `/login`, `/inscription`) | **Servies par le CDN** (`X-Vercel-Cache: HIT`, 36 Ko) : aucune fonction, aucun CPU |

## 2. Parcours et fonctionnalités

### Public
| URL | Charge |
|---|---|
| `/` | Statique (CDN) |
| `/login` → action `login` | `signInWithPassword` (limite Supabase 150 / 5 min **par IP**) + `user_roles` + `access_codes` |
| `/inscription` → action `signUpFree` | `auth.signUp` (limite 30 / 5 min **par IP**) + `profiles` |

### Free (tout compte connecté)
| Fonction | Contrôle d'accès | Requêtes / IA | Interrogation périodique |
|---|---|---|---|
| Dashboard | connexion | ~10 requêtes parallèles + 3 service role | **Realtime sans filtre sur tout le schéma public** + `router.refresh()` 5 s après chaque changement |
| Catalogue | les Premium sont redirigés | 3 requêtes | — |
| Étude guidée (catalogue) | serveur (`accesEtude`) | 8 à 10 requêtes ; analyse en file IA (mutualisée) ; **correction d'activité Gemini en direct** (15 / jour) | `useJob` |
| Révision | connexion | `cours` et `documents` **sans limite** ; quota 5 séances / jour ; job flashcards **sans quota** | `useJob` |
| Examen | connexion (adaptatif Premium, serveur) | **N+1** dans le tableau de bord d'examen ; texte intégral du PDF relu à chaque démarrage ; `select *` + écriture à chaque réponse ; quota 10 / jour | `useJob`, chrono local |
| Progression | connexion | 4 comptages + ~6 requêtes de maîtrise | — |
| QCM (`/app/evaluations`) | connexion (quota 3 / jour) | listes sans limite | `useJob` |
| Compte / code | connexion | `access_codes` ; 10 tentatives / jour | — |

### Premium
| Fonction | Contrôle d'accès | Requêtes / IA |
|---|---|---|
| Objectifs | page : serveur ; **actions : interface seulement → corrigé** | `objectifs` sans limite |
| Matières (liste) | serveur | 1 requête avec comptages |
| Matière, cours (pages) | **aucun contrôle Premium → corrigé** | 3 à 4 requêtes + URL signées |
| Chapitres (actions) | **aucun contrôle Premium → corrigé** | RLS |
| Bibliothèque | serveur | `documents` sans limite + URL signées en lot |
| Import PDF | serveur (`registerDocument`) ; envoi Storage par le navigateur **avant** le contrôle | 25 Mo max |
| Rédaction | serveur (`requirePremium`) | 3 corrections / jour ; 10 séries de sujets / jour ; 300 copies ; **`router.refresh()` toutes les 5 s** pendant une correction |
| Étude d'un PDF personnel | serveur | file IA ; 5 à 6 analyses / heure |

### Admin
Tableau de bord : lectures **sans limite** de `saas_metrics`, `profiles`, `access_codes` (PostgREST tronque à 1 000 lignes : statistiques fausses au-delà) ; `reorderCatalog` = un UPDATE par ligne.

### File IA
`ai_jobs` → `claim_ai_job(_v2)` → worker `/api/worker/ai` (`maxDuration` 300 s) ; relais entre workers + relance par la route de suivi ; **cron une seule fois par jour** (Hobby). Garde-fou de budget : 1 à 2 agrégations SQL **par appel Gemini**.

### Stockage
Bucket privé `documents`, envoi direct du navigateur dans `{userId}/…`, URL signées valables 1 h, worker en service role.

## 3. Points de charge à risque (par ordre de gravité estimée, à confirmer par les mesures)

1. **CPU actif Vercel Hobby (4 h / mois)** et suspension de 30 jours en cas de dépassement.
2. **Synthèse d'étude ≈ 225 s** (p95 275 s) dans une fonction limitée à 300 s.
3. **Limites d'authentification Supabase par IP**, partagées par tous les étudiants (correctif codé, réglages à faire).
4. **Realtime sans filtre** sur le tableau de bord : chaque écriture du worker est diffusée à tous les tableaux de bord ouverts, puis déclenche un rendu complet.
5. **Interrogations périodiques** (`/api/jobs`, `router.refresh()` 5 s en Rédaction) : principale source d'invocations.
6. **Gemini en direct dans la requête** (corrections d'activité, `/api/etude/evaluate`) : hors plafond de la file IA.
7. **2 à 3 appels Auth par page** et 2 par action.
8. **N+1 et listes sans limite** (examen, révision, bibliothèque, admin).
9. **Garde-fou de budget** recalculé par appel Gemini.
10. **Cron quotidien** : la file IA dépend des relais.
