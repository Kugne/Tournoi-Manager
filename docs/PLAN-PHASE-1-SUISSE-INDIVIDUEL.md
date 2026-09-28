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
- [x] Sous-lot 2C : variantes optimales, délais, annulation et mesures de performance.
  - [x] Énumération bornée des variantes optimales inédites et preuve d'épuisement.
  - [x] Exécution en Worker, alerte à trois secondes et arrêt sécurisé à quinze secondes.
  - [x] Mesure dans le navigateur Chromium disponible (Chrome 154 embarqué) ; contrôles multi-navigateurs reportés à la validation finale du lot 7.
- [x] Implémenter une fonction pure recevant un contexte d'appariement sans bye et retournant appariements, coût et diagnostics.
- [x] Comparer systématiquement ses résultats à l'oracle sur les petits effectifs.
- [x] Mesurer 64 joueurs : en Chromium, 30 calculs initiaux donnent 34 ms de médiane et 37 ms au 95e centile ; 10 recherches successives de variante donnent 306 ms de médiane et 411 ms au 95e centile.
- Appliquer les seuils validés : objectif inférieur à une seconde, alerte à trois secondes, arrêt sécurisé à quinze secondes.

Critère de sortie : moteur exact testé, mesuré et encore non activé dans l'application.

### Lot 3 — Intégration Suisse individuel

- [x] Sous-lot 3A : adaptateur pur entre le format historique de l'application et le moteur exact.
  - [x] Transmettre les points de tournoi calculés par l'application, bonus/malus compris, sans transmettre le SOS.
  - [x] Traduire historique validé, blocages, allégeances et critères optionnels sans muter les sauvegardes.
  - [x] Sélectionner ou conserver le bye avant le solveur et restituer les matchs au format historique.
  - [x] Conserver une compo absente comme valeur neutre et ignorer réellement toute option désactivée.
- [x] Sous-lot 3B : intégrer le calcul initial dans le Suisse classique.
  - [x] Embarquer de façon déterministe le moteur hôte et le Worker complet dans le fichier HTML autonome.
  - [x] Appliquer le résultat seulement s'il est complet et si les données du tournoi n'ont pas changé pendant le calcul.
  - [x] Conserver la ronde intacte en cas d'erreur, d'impossibilité ou de dépassement des quinze secondes, sans retour au greedy.
  - [x] Désactiver le lancement pendant le calcul, refuser tout indice de ronde devenu obsolète et proposer l'annulation après l'alerte à trois secondes.
  - [x] Désactiver temporairement la relance du Suisse classique jusqu'au sous-lot 3C plutôt que d'utiliser l'ancien moteur.
  - [x] Valider dans Chromium le parcours réel de création d'une ronde de quatre joueurs et le contrôle de dérive du moteur embarqué.
- [x] Sous-lot 3C : implémenter le reroll parmi toutes les variantes optimales inédites et sa persistance.
  - [x] Exclure la combinaison courante et toutes les signatures déjà proposées, y compris après rechargement.
  - [x] Conserver le bénéficiaire du bye et refuser toute variante qui dégraderait l'optimum exact.
  - [x] Conserver la ronde actuelle lors d'une erreur, d'une annulation, d'un résultat obsolète ou de l'épuisement prouvé.
  - [x] Effacer l'historique temporaire à la validation tout en conservant la signature finale dans les métadonnées de la ronde.
  - [x] Reprendre sans migration destructive une ronde créée avant 3C en reconstruisant sa signature courante.
- [x] Sous-lot 3D : produire des explications et alertes issues d'une source unique.
  - [x] Analyser les rondes depuis le même contexte normalisé que le moteur, sans relire d'anciens champs d'alerte UI.
  - [x] Afficher par table les points, revanches, critères actifs, compromis visibles et exposition historique aux factions.
  - [x] Centraliser les messages de calcul, d'annulation, de délai, d'épuisement et d'infaisabilité par blocages.
  - [x] Réutiliser cette analyse dans le panneau de ronde, la validation et les notifications de génération ou de relance.
  - [x] Refuser blocage, doublon, auto-match, joueur inactif ou actif manquant, et garder les critères désactivés entièrement silencieux.
- [x] Sous-lot 3E : valider les scénarios Suisse et les anciennes sauvegardes sans réinterprétation silencieuse.
  - [x] Exécuter le parcours applicatif exact sur 2, 3, 4, 5, 8, 16, 32 et 64 joueurs, avec couverture des effectifs pairs et impairs.
  - [x] Relire dans l'adaptateur un tournoi sérialisé au schéma V1.9.32, sans métadonnées du nouveau moteur, et générer la ronde suivante sans modifier les rondes validées ; l'import/restauration complet reste au lot 7.
  - [x] Reprendre une ronde ouverte antérieure à 3C : reconstruire sa signature, exclure sa combinaison courante et ne pas lui inventer de métadonnées pendant le calcul.
  - [x] Verrouiller la précédence des anciens et nouveaux champs de critères, avec des valeurs neutres lorsque l'information manque.
  - [x] Conserver les migrations ambiguës de bye, forfait et victoire administrative dans le lot 5, sans les qualifier implicitement dans le lot 3.

Critère de sortie : scénarios Suisse et tests de régression réussis.

### Lot 4 — Intégration hybride

- [x] Sous-lot 4A : raccorder le moteur exact à la phase Suisse du format hybride.
  - [x] Utiliser le même calcul initial, le même reroll optimal, les mêmes métadonnées et les mêmes explications que le Suisse classique.
  - [x] Centraliser la reconnaissance d'une phase Suisse et exclure explicitement le Top Cut, le bracket pur et le manuel du moteur exact.
  - [x] Conserver le chemin historique du bracket après la bascule en phase `cut`.
- [x] Sous-lot 4B : prouver que le Suisse classique et la phase Suisse hybride produisent les mêmes appariements pour un contexte identique.
  - [x] Comparer la génération initiale sur des effectifs pairs et impairs avec historique, blocages et critères optionnels identiques.
  - [x] Comparer le premier reroll optimal, les signatures persistées et la conservation du bye.
  - [x] Comparer intégralement les alertes, explications et interdictions produites pour la ronde.
  - [x] Vérifier que ni le tournoi Suisse ni le tournoi hybride ne sont mutés pendant les calculs purs.
- [x] Sous-lot 4C : figer une photographie des points et départages au passage au Top Cut, puis empêcher la phase éliminatoire de modifier les valeurs suisses.
  - [x] Persister avant toute mutation de statut les points, scénario, score libre, SOS, bilan V/N/D, bonus/malus, rang Suisse, éligibilité, qualification et seed.
  - [x] Relire exclusivement cette photographie après la coupure tout en conservant les statuts et la progression du bracket vivants.
  - [x] Exclure les scores secondaires du Top Cut du calcul de secours des anciennes sauvegardes dépourvues de photographie, sans leur inventer de migration.
  - [x] Verrouiller bonus/malus et réouverture du tournoi après la coupure, et nettoyer tout état de cut lors d'une duplication.
  - [x] Afficher le score libre dans la confirmation du cut et distinguer les phases dans les exports individuels.

Critère de sortie : mêmes appariements en Suisse classique et en phase Suisse hybride pour un contexte identique ; transitions Top Cut validées.

### Lot 5 — Byes, forfaits, drops et SOS

- [x] Sous-lot 5A : implémenter les types de résultats administratifs explicites et leur lecture compatible V1.9.32.
  - [x] Distinguer match joué, bye, victoire administrative non jouée, abandon après le début, double forfait et ancien résultat forcé ambigu.
  - [x] Versionner le résultat au niveau du match et le conteneur persistant sans réécrire les anciennes rondes.
  - [x] Préserver sans mutation l'interprétation historique des anciens `bye_forced`, sans inventer `started`.
  - [x] Produire des résultats explicites pour les nouvelles rondes issues du moteur Suisse exact.
- [x] Finaliser les cas fonctionnels ouverts avant leur sous-partie.
- [ ] Sous-lot 5B : appliquer les moyennes de ronde, le SOS sportif et les adversaires virtuels.
- [ ] Sous-lot 5C : intégrer les parcours absence, forfait et drop dans l'interface.
- [ ] Sous-lot 5D : valider compatibilité, exports, restauration et cohérence entre formats.
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
