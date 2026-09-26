# Architecture du solveur Suisse optimal

Date : 2026-09-26
Statut : sous-lots 2A et 2B réalisés et testés, avant intégration dans l'application

## Décision

Utiliser un algorithme de couplage parfait pondéré de type **Blossom**, avec des coûts lexicographiques encodés exactement en `BigInt`.

Cette architecture est retenue parce qu'elle combine :

- une optimalité démontrable sur un graphe général ;
- une complexité polynomiale adaptée à 64 entrants ;
- des blocages représentés par l'absence d'arête ;
- un coût additif compatible avec un couplage pondéré ;
- l'absence d'erreur d'arrondi ou de dépassement de `Number.MAX_SAFE_INTEGER`.

L'oracle exhaustif reste la référence de vérité pour les petits effectifs. Il n'est pas destiné aux 64 joueurs.

## Construction du problème

1. Choisir le bénéficiaire du bye en amont et le retirer du graphe.
2. Créer un sommet par entrant restant.
3. Créer une arête pour chaque paire autorisée ; ne créer aucune arête pour un blocage manuel.
4. Associer à chaque arête ses contributions aux niveaux de la hiérarchie.
5. Transformer les profils triés en histogrammes de taille fixe, du cas le plus mauvais au meilleur.
6. Scalariser ces coordonnées par bases mixtes dont chaque borne est démontrée.
7. Additionner les coûts d'arêtes avec des `BigInt` uniquement.
8. Chercher le couplage parfait de coût minimal, ou signaler qu'aucun couplage complet n'existe.

Pour un nombre fixe de matchs, comparer les histogrammes des écarts ou répétitions du pire au meilleur est strictement équivalent à comparer les listes triées décroissantes de la spécification.

## Coordonnées de l'objectif

Dans l'ordre :

1. nombre de revanches ;
2. histogramme décroissant du nombre de rencontres antérieures entre adversaires ;
3. histogramme décroissant de la récence des dernières rencontres ;
4. histogramme décroissant des écarts de points de tournoi ;
5. nombre de miroirs si l'option est active ;
6. nombre de mêmes allégeances si l'option est active ;
7. histogramme décroissant des écarts de compo si l'option est active ;
8. coût de note libre selon le mode actif ;
9. histogramme décroissant des expositions historiques aux factions adverses.

Les critères désactivés n'ajoutent aucune coordonnée. La diversité des factions est automatique. Une faction, allégeance ou note vide reste neutre selon la spécification.

## Sécurité numérique

- Ne jamais scalariser avec `Number` : le nombre de niveaux peut dépasser la précision entière sûre.
- Ne jamais convertir un poids `BigInt` en `Number` pendant le calcul.
- Déterminer pour chaque coordonnée une borne d'agrégation : nombre de matchs ou nombre d'entrants selon le critère.
- Choisir chaque base strictement supérieure à la borne de la coordonnée moins prioritaire.
- Tester automatiquement que le signe de la comparaison des coûts égale celui de `compareObjective` pour tous les petits couplages exhaustifs.
- Refuser les données `NaN`, `Infinity` ou non normalisables avant la construction du graphe.

## Solveur Blossom

Le port effectivement retenu est `mattkrick/EdmondsBlossom`, commit **`fab7ca8505e1577b009696c038dc804cf0acbea2`**, sous licence MIT. Il dérive de l'implémentation de Joris van Rantwijk utilisée historiquement par NetworkX. La notice complète, la licence et les adaptations sont conservées dans `src/swiss/THIRD_PARTY_BLOSSOM.md`.

NetworkX 3.4.2, commit signé **`2acf159`**, reste la seconde base d'audit algorithmique. Sa documentation indique une complexité `O(n³)` et recommande les poids entiers pour éviter les erreurs de précision.

Références :

- [documentation NetworkX de `max_weight_matching`](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.matching.max_weight_matching.html) ;
- [source NetworkX 3.4.2 du module matching](https://github.com/networkx/networkx/blob/2acf159/networkx/algorithms/matching.py) ;
- [licence BSD-3-Clause de NetworkX](https://github.com/networkx/networkx/blob/main/LICENSE.txt) ;
- [description de l'algorithme maximum-weight matching de Joris van Rantwijk](https://git.jorisvr.nl/joris/maximum-weight-matching/src/branch/main/doc/Algorithm.md).

Avant intégration, conserver dans le dépôt :

- le commit amont exact du port (`fab7ca8505e1577b009696c038dc804cf0acbea2`) ;
- le copyright et la licence ;
- la liste des adaptations Python vers JavaScript et entier vers `BigInt` ;
- les tests amont pertinents portés ou reproduits ;
- une revue ciblée de toutes les divisions, parités, sentinelles et comparaisons.

## Worker et délais

Le solveur fonctionnera dans un Web Worker créé depuis un Blob embarqué dans le HTML final :

- l'interface reste réactive ;
- à trois secondes, afficher le calcul anormalement long et proposer l'annulation ;
- à quinze secondes, terminer le Worker et conserver la ronde intacte ;
- associer un identifiant unique à chaque calcul afin qu'une réponse tardive ne soit jamais appliquée ;
- appliquer le résultat uniquement après réception atomique d'un couplage complet vérifié.

La source du Worker restera également sous forme de module testable dans le dépôt. Une génération déterministe l'intégrera au HTML et un test vérifiera l'identité de la source embarquée.

## Variantes optimales

Il est impossible de matérialiser toutes les variantes d'un grand graphe symétrique. Les rerolls utiliseront une énumération par sous-problèmes à arêtes forcées/interdites :

- chaque sous-problème est résolu par le même Blossom ;
- seules les solutions de coût métier égal à l'optimum initial sont proposées ;
- les signatures persistées sont exclues ;
- l'épuisement n'est annoncé que lorsqu'il est prouvé que le meilleur sous-problème restant dépasse l'optimum ;
- une interruption à quinze secondes est annoncée comme telle, jamais comme un épuisement des variantes.

## Sous-lots

### 2A — Encodage BigInt

Terminé : l'équivalence exacte entre l'objectif de l'oracle et la somme des coûts encodés est couverte par les tests exhaustifs et pseudo-aléatoires.

### 2B — Blossom BigInt

Terminé : le solveur est porté en ESM strict et `BigInt`, audité indépendamment, comparé à l'oracle sur tous les graphes simples à six sommets et sur des graphes pondérés aléatoires. L'assemblage 2A + 2B est également comparé à l'oracle Suisse.

### 2C — Variantes et performances

En cours : l'énumération Lawler/Murty des variantes optimales est implémentée avec une limite sûre d'une variante par appel, des signatures injectives, l'exclusion des variantes persistées et des états distincts pour limite, interruption et épuisement prouvé. Le protocole Worker et son exécuteur couvrent l'alerte à trois secondes, l'annulation, l'arrêt forcé à quinze secondes et le rejet des réponses tardives. Restent les mesures dans les navigateurs ciblés et l'intégration applicative ultérieure.

Le lot 2 reste isolé : aucun de ces sous-lots ne remplace `generatePairings()` dans l'application.
