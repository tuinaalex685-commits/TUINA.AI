# État initial de l'infrastructure SJP (28 octobre 2026)

Sources : base de production lue en **lecture seule** (requêtes `pg_settings`, `pg_stat_*`, `saas_metrics`), documentation officielle Vercel / Supabase consultée le 28/10/2026.
Légende de fiabilité : **[mesuré]** = lu sur la production ; **[doc]** = documentation officielle du fournisseur ; **[à confirmer]** = non vérifiable par nous, à lire dans la console du fournisseur.

## 1. Production aujourd'hui

| Élément | Valeur | Source |
|---|---|---|
| Comptes | 288, dont ~260 comptes de test → **~28 comptes réels** | [mesuré] |
| Activité | 0 inscription en 10 jours, 1 connexion en 7 jours : **lancement pas encore effectif** | [mesuré] |
| Confirmation d'e-mail | Tous les comptes confirmés instantanément → confirmation probablement **désactivée** | [mesuré, à confirmer dans Auth → Sign In] |
| Codes d'accès | 9 codes, 5 Premium actifs, 1 vierge | [mesuré] |
| Base | PostgreSQL 17.6, **30 Mo** | [mesuré] |
| Stockage | 57 fichiers, **66 Mo** | [mesuré] |
| Requêtes SQL de l'application | moyenne < 3 ms, réclamation de job 1,9 ms (13 600 appels) | [mesuré, pg_stat_statements] |

## 2. Limites des offres actuelles et conséquences

### Vercel — offre Hobby [doc]

| Limite | Hobby | Pro | Conséquence pour SJP |
|---|---|---|---|
| Usage commercial | **Interdit** (usage personnel, non commercial) | Autorisé | SJP vend un Premium : Pro requis dès le lancement payant |
| CPU actif inclus | **4 h / mois** | à l'usage | Rendu serveur de chaque page, actions, extraction PDF. Limite la plus probable à atteindre en premier ; ordre de grandeur à **mesurer** (ms CPU par requête) |
| Mémoire provisionnée | 360 Go-h / mois | à l'usage | Les attentes IA longues (worker jusqu'à 300 s) la consomment |
| Invocations de fonctions | 1 000 000 / mois | à l'usage | Pages dynamiques + interrogation des jobs + actions |
| Requêtes CDN | 1 000 000 / mois | à l'usage | Toutes les requêtes, statiques comprises |
| Transfert rapide | 100 Go / mois | à l'usage | Large pour SJP |
| Durée max d'une fonction | **300 s** | 300 s par défaut, jusqu'à 800 s | La synthèse d'étude dure **225 s en médiane, 275 s au p95** (voir §4) : marge très faible |
| Dépassement | **Fonctionnalité suspendue jusqu'à 30 jours** | facturation, plafond de dépense réglable | En Hobby, un dépassement = **site en panne** |
| Cron | quotidien (constaté : `0 4 * * *`) | fréquence fine | Le filet de sécurité de la file IA ne passe qu'une fois par jour |
| Journaux | 1 h | 1 jour | Diagnostic d'incident quasi impossible en Hobby |

### Supabase — offre Free, instance Nano [doc + mesuré]

| Limite | Free (Nano) | Pro (Micro inclus, 25 $) | Conséquence pour SJP |
|---|---|---|---|
| Mémoire | jusqu'à 0,5 Go (shared_buffers mesuré : 280 Mo) | 1 Go (Micro), 2 Go (Small ~15 $) | Suffisant pour 30 Mo de données |
| Connexions directes max | **60** [mesuré] | 60 (Micro), 90 (Small) | L'application passe par l'API REST (PostgREST), qui mutualise ; à surveiller sous charge |
| Clients du pooler | 200 | 200 (Micro), 400 (Small) | — |
| Transfert sortant | **5 Go / mois** | 250 Go | Téléchargements de PDF + réponses API ; à surveiller |
| Stockage fichiers | **1 Go** | 100 Go | ~1,2 Mo / PDF mesuré → environ **800 PDF** avant saturation |
| Taille max d'un fichier | 50 Mo | 500 Go | SJP limite déjà à 25 Mo |
| Base | 500 Mo | 8 Go | Large |
| Mise en pause | **après 1 semaine d'inactivité** | jamais | Risque réel avant le lancement |
| Sauvegardes | **aucune** | quotidiennes, 7 jours | Aucune restauration possible aujourd'hui |
| Projets gratuits | 2 actifs (**limite atteinte**) | — | Bloque la création d'un environnement de test gratuit |
| Limites d'authentification (par IP) | inscription 30 / 5 min ; connexion 150 / 5 min | réglables | Appels faits depuis les IP de Vercel → limite **partagée par tous les étudiants** (corrigé côté code, à activer : clé secrète + IP Forwarding) |

### Gemini [mesuré + à confirmer]

| Élément | Valeur | Source |
|---|---|---|
| Modèle | `gemini-2.5-flash` | code |
| Quotas (requêtes et tokens par minute, par jour) | **à lire dans Google AI Studio** (Google ne les publie plus que par compte) | [à confirmer] |
| Plafond SJP de jobs IA simultanés | `GEMINI_MAX_INFLIGHT`, 12 par défaut (migration 08) | code |
| Plafond de dépense SJP | plafond journalier + crédit saisi dans l'admin | code |

## 3. Coût et durée réels des appels IA [mesuré, `saas_metrics`]

| Opération | Appels mesurés | Tokens entrée / sortie (moy.) | Coût moyen | Durée médiane | Durée p95 |
|---|---:|---|---:|---:|---:|
| Étude — segment de cours | 59 | 4 577 / 3 929 | 0,0112 $ | 19,3 s | 44,6 s |
| Étude — consolidation | 7 | 19 610 / 8 847 | 0,0280 $ | 44,6 s | 58,1 s |
| Étude — synthèse | 3 | 14 395 / 11 271 | 0,0325 $ | **225,4 s** | **274,8 s** |
| Étude — séquence | 6 | 5 728 / 5 899 | 0,0165 $ | 33,7 s | 47,2 s |
| Étude — correction d'activité | 9 | 1 087 / 148 | 0,0007 $ | 3,5 s | 3,9 s |
| Rédaction — correction | 1 | 10 925 / 2 231 | 0,0089 $ | 35,3 s | — |
| Rédaction — sujets proposés | 2 | 7 613 / 1 317 | 0,0056 $ | 27,1 s | 30,5 s |
| Examen — banque de questions | 19 | 14 157 / 5 742 | 0,0186 $ | 70,0 s | 130,5 s |
| Flashcards | 10 | 13 475 / 864 | 0,0062 $ | 14,5 s | 167,9 s |

Échantillons faibles (lancement non effectué) : ordres de grandeur, pas des garanties.
**Première analyse d'un cours ≈ 0,15 à 0,25 $** (8 à 16 segments + consolidation + synthèse), payée **une seule fois par contenu** grâce à la mutualisation ; ensuite chaque étudiant ne coûte que ses séquences et corrections.

## 4. Risques identifiés à ce stade (à confirmer par les tests)

1. **Vercel Hobby** : CPU actif (4 h/mois) et suspension de 30 jours en cas de dépassement ; usage commercial interdit.
2. **Synthèse d'étude proche de la limite de 300 s** : une coupure = appel repayé et étudiant qui attend.
3. **Authentification** : limites Supabase par IP partagées entre tous les étudiants (correctif prêt, réglages à faire).
4. **File IA** : sans plafond, rafale d'appels Gemini (corrigé, migration 08 à appliquer) ; débit réel borné par le quota Gemini du compte (à confirmer).
5. **Supabase Free** : pas de sauvegarde, pause après 7 jours d'inactivité, 1 Go de fichiers.
