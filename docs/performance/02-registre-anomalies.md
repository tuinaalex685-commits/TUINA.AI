# Registre des anomalies et corrections

Chaque ligne : constat → preuve → correction → état. « Mesuré » = constaté en production (lecture seule) ; « Code » = lu dans le code ; « Doc » = documentation fournisseur.
États : **corrigé (branche)** = codé, compilé, testé localement, PAS en production ; **à appliquer** = migration SQL à coller par l'administrateur ; **décision** = choix du propriétaire requis.

## Authentification et codes d'accès (phase 3)

| # | Constat | Preuve | Gravité | Correction | État |
|---|---|---|---|---|---|
| A1 | Comparaison des codes sensible à la casse ; clavier mobile → majuscule en tête → « code non valide » | Mesuré : 5 codes sur 9 contiennent des minuscules ; code `auth.ts` `.eq('code', …)` | Haute | Comparaison sans casse ni espaces (`lib/accessCode.ts`), champ sans majuscule automatique ni correcteur, codes normalisés à la création | Corrigé (branche) + migration 09 à appliquer |
| A2 | Renouvellement impossible : un étudiant dont l'ancien code est expiré/désactivé ne peut pas activer un nouveau code (contrainte « un code par email »), message trompeur « Réessaie » | Mesuré : 3 codes liés inactifs/expirés ; contrainte `access_codes_email_key` | Haute | Fonction atomique `activate_access_code` : ancien code archivé (`access_code_history`) puis bloqué, nouveau code activé, dans une transaction ; message explicite en attendant | Corrigé (branche) + migration 09 à appliquer |
| A3 | Lecture du statut Premium en échec passager → étudiant Premium affiché Free par intermittence | Code `plan.ts` (échec → Free sans nouvel essai) | Moyenne | Une seconde lecture avant de conclure | Corrigé (branche) |
| A4 | Page de connexion : « saisis ce code comme mot de passe » alors que ce chemin n'existe plus pour les nouveaux | Code `login/page.tsx` ; changement du 16/10 | Haute (connexions impossibles) | Texte : créer un compte, puis activer le code dans « Mon compte » | Corrigé (branche) |
| A5 | 10 comptes réels sans ligne `user_roles` (créés juin–août) | Mesuré | Faible à moyenne | Rattrapage dans la migration 09 | À appliquer |
| A6 | 3 comptes réels **bannis** dans Supabase Auth → connexion impossible avec le message générique | Mesuré ; aucun code actuel ne bannit | À qualifier | Aucune action automatique : à vérifier par l'administrateur | **Décision** |
| A7 | Limites d'inscription/connexion par IP partagées (appels depuis Vercel) | Doc Supabase ; code | Haute à l'échelle | IP de l'étudiant transmise (`sb-forwarded-for`) + message « affluence » distinct | Corrigé (branche) ; **réglages** : clé `sb_secret_`, IP Forwarding |
| A9 | Revue de sécurité : après un renouvellement, un ancien compte dont le mot de passe est encore l'ancien code n'est plus invité à le changer (le code est détaché) ; un mot de passe égal à un code en casse différente était accepté | Revue du commit fca70b2 | Faible | Contrôle « mot de passe ≠ code » sans casse ; invitation : reste à étendre à `access_code_history` | Partiellement corrigé |
| A8 | Activation simultanée du même code | Code : mise à jour conditionnelle, puis fonction verrouillée | — | Tests d'intégration (50 comptes / 1 code ; 1 compte / 2 codes ; renouvellement ; code d'autrui) | Tests écrits, à exécuter sur la base de test |

## Sécurité (contrôles côté serveur)

| # | Constat | Correction | État |
|---|---|---|---|
| S1 | Actions Objectifs et Chapitres appelables par un compte Free (verrou d'interface seulement), messages d'erreur internes renvoyés | Garde Premium serveur, validation des entrées, messages neutres ; suppression de ses données toujours permise | Corrigé (branche) |
| S2 | Pages Matière et Cours sans contrôle Premium (URL signées délivrées après expiration) | Même règle que la liste des matières | Corrigé (branche) |
| S3 | `/api/etude/status` lisait n'importe quel cours en service role | Vérification de l'accès au document, réponse identique si inexistant | Corrigé (branche) |
| S4 | Secret du worker envoyé à une adresse dérivée de l'en-tête Host | Adresse configurée unique | Corrigé (branche, commit 54dacd0) |
| S7 | **Joker `*` dans les recherches d'email (PRÉSENT EN PRODUCTION)** : PostgREST traduit `*` en `%` ; une adresse « *@gmail.com » aurait hérité du Premium de n'importe quel compte Gmail, et la purge admin d'un tel compte aurait supprimé les codes de tous les comptes Gmail. 0 compte concerné à ce jour (mesuré) | `*` échappé, adresses avec `*`/`%` refusées à l'inscription, tests | Corrigé (branche) ; **correctif minimal prêt pour la production, en attente d'accord** |
| S8 | Joker `*` dans la recherche de codes (revue automatique du commit 976990c) : le repli d'activation aurait permis de s'approprier un code par motif (« A* ») ; le contrôle du mot de passe servait d'oracle | Plus aucune recherche par motif sur les codes : fonction exacte `find_access_code` (migration 09) ou comparaison littérale `in(...)` | Corrigé (branche, jamais en production) |
| S5 | QCM et jobs flashcards ouverts aux comptes Free (flashcards sans quota) | À trancher : règle métier ou oubli ? | **Décision** |
| S6 | Envoi Storage possible par un compte Free avant le refus de `registerDocument` | Politique Storage à restreindre au Premium | À faire |

## Charge et file IA

| # | Constat | Correction | État |
|---|---|---|---|
| C1 | File IA sans plafond (rafale 429) | `claim_ai_job_v2` plafonnée et équitable | Corrigé (branche) + migration 08 à appliquer |
| C2 | Suivi des jobs renvoyait l'état intermédiaire toutes les 2,5 s | Résultat seulement à la fin, rythme adaptatif, pause onglet caché, délai de 15 s | Corrigé (branche) |
| C3 | Synthèse d'étude ≈ 225 s (p95 275 s) sous une limite de 300 s | Proposition : génération par sections en parallèle (≈ 60–90 s) — touche aux prompts | **Décision** |
| C4 | Realtime du tableau de bord sans filtre | À filtrer par utilisateur / table | À faire |
| C5 | N+1 examen, listes sans limite, comptage des cartes en mémoire | À optimiser | À faire |
| C6 | Garde-fou de budget : agrégation SQL à chaque appel Gemini | Mise en cache courte | À faire |
