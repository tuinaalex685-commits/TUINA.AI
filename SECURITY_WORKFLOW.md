# Méthode de travail obligatoire — Skills et sécurité (SJP)

Directive permanente du responsable (2026-10-31). Elle s'applique à toute intervention sur SJP, en particulier aux 7 tâches en cours. Le choix du Skill adapté est une obligation, pas une recommandation.

## Cycle de chaque tâche

1. Inspection avec le Skill adapté (aucune modification pendant l'inspection).
2. Analyse technique et cause racine.
3. Chargement du Skill correspondant à la modification.
4. Implémentation.
5. Vérification avec le Skill adapté.
6. Tests et validation (résultats réels uniquement).
7. Non-régression.
8. Compte rendu : Skills chargés, fichiers inspectés et modifiés, corrections, tests, résultats, problèmes restants.

Une tâche n'est jamais terminée parce que le code a changé : il faut une preuve. Ne jamais prétendre avoir utilisé un Skill ou fait une vérification qui n'a pas eu lieu. Signaler un Skill indisponible et utiliser une alternative.

## Matrice des Skills

| Travail | Skills à charger |
|---|---|
| Inspection, compréhension, origine d'un bug | `tob-audit-context-building` (Trail of Bits). « View Code » n'existe pas dans cette installation : signalé, remplacé par celui-ci. |
| Modification backend (actions serveur, routes API, workers, SQL) | `security-senior` (obligatoire) + `backend-senior` ; `database-senior` / `supabase-postgres-best-practices` si la base est touchée. Re-contrôle avec `security-senior` après la correction. |
| Modification frontend | `frontend-senior` (ou `senior-frontend` pour React/Next). Pas de Skill backend pour une retouche visuelle. |
| Sécurité — code | `tri-auditing-code-for-vulnerabilities`, `bri-owasp-audit` |
| Sécurité — API, autorisations, IDOR | `bri-api-audit` |
| Sécurité — authentification, sessions, réinitialisation | `pt-auth-session-testing`, `tri-attacking-jwt`, `tri-attacking-oauth-oidc` (Google) |
| Sécurité — logique métier, concurrence (codes, quotas) | `bri-business-logic-testing` |
| Sécurité — secrets | `bri-secrets-audit` |
| Sécurité — dépendances, chaîne d'approvisionnement | `bri-dependency-audit`, `tri-auditing-supply-chain` |
| Sécurité — Gemini, injection de consigne | `tri-securing-ai-systems` |
| Sécurité — modèle de menaces, revue d'architecture | `sio-threat-model`, `sio-security-arch-review`, `bri-threat-modeling` |
| Sécurité — scan SAST / secrets / SCA | `sio-security-scan` (semgrep, gitleaks/trufflehog, trivy), Herozion CLI quand il est autorisé |
| Test dynamique d'une application en ligne | `bri-web-pentest`, `pt-vuln-hunting` (préversion ou environnement de test uniquement) |
| Rédaction des constats et contre-vérification d'un correctif | `pt-finding-writeup` (mode retest), `pt-vuln-chaining` |
| Tests de charge | `k6` |
| Tests navigateur | `playwright-best-practices` |
| Revue visuelle finale | `visual-review` |

Les Skills `tob-*`, `bri-*`, `tri-*`, `sio-*`, `pt-*` viennent de trailofbits/skills, briiirussell/cybersecurity-skills, trilwu/secskills, secureIO-GmbH/security-skills et ahmdobeidat/pentest-skills (installés dans `~/.claude/skills`, contenu vérifié avant installation).

## Règles d'exécution (rappel)

- Environnement de test d'abord. Aucune modification de la production, aucun déploiement sur `main` sans « déploie » explicite.
- Aucune donnée détruite, aucune protection désactivée, aucun appel IA payant pendant les tests de charge (Gemini simulé).
- Avant chaque push : tsc + lint + tests unitaires et d'intégration + Playwright des parcours touchés.
