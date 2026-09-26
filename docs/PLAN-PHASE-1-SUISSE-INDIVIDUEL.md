# Plan de réalisation — phase 1 Suisse individuel

Date de cadrage : 2026-09-26  
Base vérifiée : `v1.9.32`, commit `f517742`

Ce plan rend le chantier interrompable et reprenable sans laisser l'application stable dans un état cassé. Les décisions fonctionnelles détaillées sont conservées dans [la spécification Suisse individuel](SPECIFICATIONS-SUISSE-INDIVIDUEL-2026-09-26.md) et dans le [carnet de décisions](../IDEES.md).

## Règles de conduite

- Travailler sur une branche dédiée ; conserver `main` et la release V1.9.32 intacts jusqu'à validation complète.
- Terminer et vérifier chaque lot avant de commencer le suivant.
- Ne jamais activer un moteur incomplet dans l'application stable.
- Après toute correction, rejouer les validations concernées.
- Ne pas augmenter la version pour de la documentation ou un prototype non intégré.
- N'augmenter la version qu'une fois un ensemble fonctionnel intégré, testé et destiné à une nouvelle release.
- Ne jamais remplacer silencieusement l'optimum par l'ancien greedy en cas d'échec ou de dépassement du temps de calcul.

## Lots autonomes

### Lot 0 — Cadrage et état de référence

- Vérifier le dépôt, la branche, le tag et la version.
- Conserver dans le dépôt la spécification, les décisions et ce plan.
- Vérifier que le HTML de release reste inchangé.

Critère de sortie : le chantier possède un point de départ Git identifié et une mémoire fonctionnelle versionnable.

### Lot 1 — Socle de tests et oracle

- Extraire les fonctions et données minimales nécessaires à des tests reproductibles sans modifier le comportement de l'application.
- Construire un oracle exhaustif pour les petits effectifs.
- Ajouter les scénarios couvrant blocages, revanches, écarts de points, options, bye et variantes équivalentes.
- Reproduire les cas historiques conservés dans les audits.

Critère de sortie : les tests caractérisent l'existant et peuvent prouver l'optimalité d'une solution sur de petits effectifs. L'application reste fonctionnellement inchangée.

### Lot 2 — Moteur optimal isolé

- [x] Sous-lot 2A : encodage exact des objectifs lexicographiques en coûts additifs `BigInt`.
- [x] Sous-lot 2B : solveur de couplage parfait pondéré Blossom audité et compatible `BigInt`.
- [ ] Sous-lot 2C : variantes optimales, délais, annulation et mesures de performance.
  - [x] Énumération bornée des variantes optimales inédites et preuve d'épuisement.
  - [x] Exécution en Worker, alerte à trois secondes et arrêt sécurisé à quinze secondes.
  - [ ] Mesures dans les navigateurs ciblés.
- [x] Implémenter une fonction pure recevant un contexte d'appariement sans bye et retournant appariements, coût et diagnostics.
- [x] Comparer systématiquement ses résultats à l'oracle sur les petits effectifs.
- [ ] Compléter les mesures de performance à 64 joueurs dans les navigateurs ciblés ; la mesure Node locale est déjà couverte.
- Appliquer les seuils validés : objectif inférieur à une seconde, alerte à trois secondes, arrêt sécurisé à quinze secondes.

Critère de sortie : moteur exact testé, mesuré et encore non activé dans l'application.

### Lot 3 — Intégration Suisse individuel

- Intégrer le moteur dans le Suisse classique.
- Implémenter le reroll parmi toutes les variantes optimales inédites.
- Produire des explications et alertes issues d'une source unique.
- Conserver les données de l'ancien format sans réinterprétation silencieuse.

Critère de sortie : scénarios Suisse et tests de régression réussis.

### Lot 4 — Intégration hybride

- Réutiliser exactement le même moteur pendant la phase Suisse.
- Figer une photographie des points et départages lors du passage au Top Cut.
- Empêcher la phase éliminatoire de modifier les valeurs suisses.

Critère de sortie : mêmes appariements en Suisse classique et en phase Suisse hybride pour un contexte identique ; transitions Top Cut validées.

### Lot 5 — Byes, forfaits, drops et SOS

- Implémenter les types de résultats administratifs explicites.
- Finaliser les cas fonctionnels encore ouverts avant leur sous-partie.
- Migrer les anciennes sauvegardes sans inventer d'information absente.

Critère de sortie : classement, historique, SOS, exports et restauration cohérents pour tous les statuts.

### Lot 6 — Éditeur d'appariements

- Remplacer les listes indépendantes par l'échange guidé validé.
- Partager le composant avec la préparation du mode manuel.
- Protéger les résultats saisis et séparer échange de joueurs et réorganisation des tables.

Critère de sortie : parcours bureau et petits écrans validés, contrôles identiques aux alertes du moteur.

### Lot 7 — Validation et version

- Tester Suisse, hybride, bracket et manuel.
- Vérifier imports, exports, sauvegardes, restauration et navigateurs ciblés.
- Examiner les modifications finales et corriger les régressions.
- Rejouer toutes les validations après la dernière correction.
- Incrémenter la version selon le système existant seulement à ce stade.

Critère de sortie : application fonctionnelle, validations finales réussies et limites restantes documentées.

## Hors périmètre de cette phase

- Suisse par équipes ; l'architecture doit seulement éviter de le rendre impossible.
- Refonte générale du bracket.
- Migration vers un framework ou un service en ligne.
- Publication, push ou release sans demande explicite.
