# Plan de montée en charge et budget prévisionnel

> **Statut : PROJECTION, non mesurée.** Les tests de charge n'ont pas encore pu tourner (pas d'environnement de test : limite de 2 projets Supabase gratuits atteinte). Chaque chiffre ci-dessous est soit un **coût mesuré en production** (`saas_metrics`), soit une **hypothèse explicite** à remplacer par les mesures k6. Aucune capacité n'est affirmée comme testée.

## 1. Vocabulaire (à ne pas confondre)

| Terme | Définition | Ordre de grandeur usuel (hypothèse SaaS éducatif) |
|---|---|---|
| Inscrits | comptes créés | 100 % |
| Actifs quotidiens (DAU) | au moins une visite dans la journée | 20 à 40 % des inscrits |
| Simultanés | sessions ouvertes au même instant (pic) | 10 à 20 % des DAU, plus en veille d'examen |
| Sur une fonction précise | ex. en Rédaction au même instant | fraction des simultanés |
| **IA simultanée** | appels Gemini en cours au même instant | **borné par `GEMINI_MAX_INFLIGHT`** (12 par défaut) |

Exemple : 500 inscrits → 100 à 200 actifs/jour → 20 à 40 simultanés en temps normal, 100+ en pic (lien WhatsApp, veille d'examen).

## 2. Coût IA par étudiant (à partir des coûts MESURÉS)

| Action | Coût mesuré |
|---|---:|
| Première analyse d'un cours (payée **une fois par contenu**, mutualisée) | 0,15 à 0,25 $ |
| Séquence d'étude | 0,016 $ |
| Correction d'une activité | 0,0007 $ |
| Correction de rédaction | 0,009 $ |
| Banque de questions d'examen (par cours, mutualisée) | 0,019 $ |

**Hypothèse d'usage d'un Premium actif un jour donné** : 2 séquences, 10 corrections d'activité, 1 correction de rédaction ≈ **0,05 $/jour**, + part des nouveaux cours (1 nouveau PDF pour 10 étudiants/jour ≈ 0,02 $) → **≈ 0,07 $ par Premium actif et par jour**.
Free : corrections d'activité (≤ 15/jour) ≈ 0,01 $ au maximum.

| Inscrits Premium | Actifs/jour (30 %) | Coût Gemini / jour | Coût Gemini / mois |
|---:|---:|---:|---:|
| 200 | 60 | ≈ 4 $ | ≈ 125 $ |
| 500 | 150 | ≈ 10 $ | ≈ 315 $ |
| 1 000 | 300 | ≈ 21 $ | ≈ 630 $ |
| 5 000 | 1 500 | ≈ 105 $ | ≈ 3 150 $ |

À recouper avec le prix de l'abonnement Premium : c'est le poste qui dominera tous les autres. Le panneau « Crédit Gemini » de l'admin suit la consommation réelle.

## 3. Infrastructure par palier (projection)

| Palier | Vercel | Supabase | Pourquoi |
|---|---|---|---|
| Tests internes (< 50) | Hobby possible | Free | Mais Hobby interdit l'usage commercial |
| **Lancement payant (200–500)** | **Pro (20 $/mois/membre)** | **Pro (25 $/mois, Micro inclus)** | Hobby : usage commercial interdit, 4 h CPU/mois, **suspension 30 jours** si dépassement. Supabase Free : aucune sauvegarde, pause après 7 jours d'inactivité, 1 Go de fichiers (~800 PDF) |
| 1 000 | Pro | Pro, **Small** (~15 $, 90 connexions, 2 Go) si les mesures montrent la base saturée | à décider sur mesures (CPU base, connexions) |
| 2 000–5 000 | Pro + plafond de dépense | Small → Medium (~60 $) selon mesures | file IA et quota Gemini deviennent le goulot |
| 10 000+ | Pro (ou Enterprise) | Medium/Large ; réplique de lecture éventuelle | file IA dédiée, cache des contenus partagés |

**Budget infrastructure hors IA** (projection) : lancement ≈ **45 $/mois** (Vercel Pro 20 $ + Supabase Pro 25 $), + consommation au-delà des quotas inclus, à confirmer par les mesures de CPU par requête.

## 4. Ordre des goulots attendus (hypothèses à vérifier par k6)

1. **Quota Gemini du compte** (requêtes et tokens par minute, à lire dans AI Studio) → limite le débit des études et corrections, quelle que soit l'infrastructure.
2. **Vercel Hobby** (CPU actif, invocations) → panne de 30 jours en cas de dépassement.
3. **Authentification Supabase par IP** (corrigé dans le code, réglages à faire).
4. **Base Nano** : 60 connexions, CPU partagé : à mesurer sous charge mixte.

## 5. Ce qui fera passer chaque palier (priorités)

| Priorité | Action | Coût | Palier visé |
|---|---|---|---|
| P0 | Appliquer migrations 08 et 09, clé `sb_secret_` + IP Forwarding | 0 $ | lancement |
| P0 | Vercel Pro + Supabase Pro | ≈ 45 $/mois | lancement payant |
| P0 | Synthèse d'étude sous la limite de 300 s (génération par sections) | 0 $ | lancement |
| P1 | Realtime du tableau de bord filtré ; interrogations espacées en Rédaction | 0 $ | 500 → 1 000 |
| P1 | N+1 examen, listes paginées, garde-fou budget mis en cache | 0 $ | 1 000 |
| P2 | Monter le niveau de quota Gemini ; ajuster `GEMINI_MAX_INFLIGHT` | selon dépense | 1 000 → 5 000 |
| P2 | Supabase Small/Medium selon mesures | 15 à 60 $/mois | 2 000 → 5 000 |
| P3 | Cache des contenus partagés (catalogue), file IA dédiée | à étudier | 10 000 |
