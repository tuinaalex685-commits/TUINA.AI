# Règles de Développement pour Tuina.ai

## Règle obligatoire d'intégration Frontend + Backend

Toute fonctionnalité implémentée dans le backend doit obligatoirement être intégrée et visible dans le frontend. Il ne doit pas y avoir de fonctionnalités "invisibles" ou uniquement présentes dans la base de données.

### Chaîne de développement obligatoire
Chaque fonctionnalité doit suivre ce cycle complet :
Base de données → Backend → API / logique métier → Frontend → Interface utilisable

### Règle de validation obligatoire
Une fonctionnalité n'est considérée comme terminée que si :
* elle existe en base de données
* elle fonctionne côté backend
* elle est visible dans le frontend
* elle est utilisable par un utilisateur réel
* le parcours complet a été testé

Si une seule de ces conditions manque, la fonctionnalité n'est pas terminée. L'objectif est que chaque fonctionnalité soit complète, testable et utilisable dans l'interface utilisateur avant de passer à l'étape suivante.

## Règle de Stabilité et Continuité

À partir de maintenant :
* **Interdiction de refondre l'architecture** : Ne pas repartir de zéro. Le socle actuel doit être stabilisé.
* **Schéma Intouchable** : Le schéma général de la base de données ne doit plus être modifié, sauf si c'est absolument indispensable pour corriger un bug bloquant.
* **Travail Module par Module** : Ne jamais passer au développement d'un nouveau module tant que le module en cours n'est pas entièrement fonctionnel et testé de bout en bout.
* **Verrouillage des Modules Validés** : Ne pas modifier les modules déjà terminés et validés, sauf pour appliquer un correctif indispensable.
* **Zéro Régression** : L'application doit pouvoir être utilisée progressivement par un véritable utilisateur. Les nouvelles corrections ou fonctionnalités doivent s'intégrer sans jamais casser l'existant.
