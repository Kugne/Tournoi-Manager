# Architecture du solveur Suisse optimal

Date : 2026-09-26
Statut : lot 2 réalisé et testé, avant intégration dans l'application

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

Le solveur fonctionne dans un Web Worker de type module chargé directement depuis son URL :

- l'interface reste réactive ;
- à trois secondes, afficher le calcul anormalement long et proposer l'annulation ;
- à quinze secondes, terminer le Worker et conserver la ronde intacte ;
- associer un identifiant unique à chaque calcul afin qu'une réponse tardive ne soit jamais appliquée ;
- appliquer le résultat uniquement après réception atomique d'un couplage complet vérifié.

Le lancement direct du module est retenu après validation en navigateur : l'enveloppe intermédiaire par URL Blob ne recevait pas les messages dans le Chromium embarqué, alors que le Worker module direct exécute le même protocole correctement. Lors de l'intégration au HTML monofichier, la génération devra donc produire un module Worker adressable sans réintroduire cette enveloppe défaillante.

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

Terminé dans le moteur isolé : l'énumération Lawler/Murty des variantes optimales est implémentée avec une limite sûre d'une variante par appel, des signatures injectives, l'exclusion des variantes persistées et des états distincts pour limite, interruption et épuisement prouvé. Le protocole Worker et son exécuteur couvrent l'alerte à trois secondes, l'annulation, l'arrêt forcé à quinze secondes et le rejet des réponses tardives.

Le 2026-09-27, le banc reproductible `tests/browser-benchmark.html` a été exécuté dans le Chromium disponible (Chrome 154) avec 64 joueurs et jusqu'à 2 016 arêtes : 30 calculs initiaux, médiane 34 ms, 95e centile 37 ms, maximum 57 ms ; puis 10 demandes successives de variante optimale, médiane 306 ms, 95e centile 411 ms, maximum 442 ms. Les 32 paires sont complètes et aucun Worker ne reste en attente. L'objectif inférieur à une seconde est donc satisfait sur ce navigateur. Chrome, Edge et Firefox autonomes n'étaient pas exposés dans l'environnement de validation ; leur contrôle reste inclus au lot 7 avec l'application intégrée.

Le lot 2 reste isolé : aucun de ces sous-lots ne remplace `generatePairings()` dans l'application.

### 3B — Génération initiale dans le HTML autonome

Le Suisse classique appelle désormais le moteur exact pour créer une ronde. Le résultat du Worker est converti au format historique puis appliqué d'un seul bloc, uniquement si le tournoi est encore identique à l'entrée calculée et si l'indice attendu est toujours la prochaine ronde. Un verrou par tournoi et par ronde empêche deux calculs concurrents, désactive le bouton de lancement et une seconde garde avant insertion interdit les doublons. Après trois secondes, l'alerte expose l'action d'annulation du Worker. Toute erreur, infaisabilité, annulation ou limite de quinze secondes laisse la ronde intacte et ne déclenche aucun repli vers le greedy.

Le fichier distribué reste un unique `index.html`. Le script `scripts/embed-swiss-engine.mjs` construit deux paquets déterministes directement depuis les modules versionnés : une façade hôte exposée sous `TMSwiss`, et le code complet du Worker sans import résiduel. Ce dernier est encodé dans le HTML puis chargé depuis une URL Blob au moment du calcul. Il ne s'agit pas de l'enveloppe Blob écartée au lot 2C, qui tentait d'importer un module externe : le nouveau Blob contient tout le graphe du Worker et fonctionne donc sans fichier annexe. Une empreinte des sources et un test de dérive obligent à régénérer le bloc embarqué après toute modification du moteur.

Le parcours applicatif du sous-lot 3B a été validé le 2026-09-27 dans Chromium avec quatre joueurs actifs : deux tables complètes ont été créées par le Worker et le bouton de relance était alors resté désactivé jusqu'au raccordement 3C décrit ci-dessous. Le même fichier monolithique a été servi sans ressource JavaScript annexe. Le protocole de l'outil de navigation utilisé pour ce contrôle n'autorise pas les URL `file://` ; l'ouverture directe du fichier restera donc à rejouer hors de cet outil ainsi que les contrôles multi-navigateurs du lot 7.

### 3C — Variantes optimales persistantes

Le reroll du Suisse classique utilise l'opération Worker `next-variant`. Le runner reconstruit la signature non orientée de la combinaison courante, l'ajoute aux signatures déjà persistées dans `round.swissPairingSignatures`, puis demande une seule solution inédite de coût métier strictement égal à l'optimum. Le bye est retiré avant le solveur et son bénéficiaire courant reste fixé tant qu'il est éligible ; la signature applicative conservée dans `round.pairingMeta` inclut explicitement cet identifiant.

La ronde n'est remplacée qu'après réception d'une variante complète et après comparaison d'une empreinte comprenant participants, critères, historique, exclusions et contenu courant de la ronde. Une erreur, une annulation, le délai de quinze secondes, une modification concurrente ou l'épuisement mathématiquement prouvé laissent les matchs et résultats intacts. L'historique des variantes est sauvegardé dans le JSON ordinaire, repris après rechargement et supprimé à la validation. Une ronde plus ancienne sans ce champ reste compatible : sa combinaison courante est dérivée à la volée et exclue du premier reroll.

Le parcours navigateur du 2026-09-27 a validé les trois optima d'un tournoi symétrique à quatre joueurs : deux rerolls distincts, dont un après rechargement complet, puis un troisième essai annonçant l'épuisement sans modifier les tables. La validation de la ronde supprime ensuite l'action de reroll et son historique temporaire.

### 3D — Alertes et explications unifiées

`src/swiss/pairing-analysis.mjs` est la source métier unique du Suisse classique pour les alertes, les explications par table, le contrôle avant validation et les messages de résultat du calcul. L'analyse reconstruit le même contexte normalisé que le moteur exact : seules les rondes validées alimentent l'historique, les options désactivées ne produisent aucun message, les blocages restent des interdictions et les byes sont contrôlés séparément.

Chaque table expose désormais « Pourquoi ce match ? » avec les points de tournoi, l'historique de confrontation, les critères actifs, les éventuels compromis visibles, l'exposition aux factions adverses et un rappel qu'une table appartient à un optimum global plutôt qu'à une décision isolée. Les revanches inévitables sont rouges ; une revanche introduite manuellement est orange ; les préférences optionnelles non satisfaites sont jaunes. Une table modifiée manuellement n'est jamais présentée comme une preuve d'inévitabilité.

Les états `timeout`, `stale`, `cancelled`, `interrupted`, `exhausted`, `unavailable` et l'infaisabilité par blocages passent par le même catalogue. Lorsqu'aucun couplage complet n'existe, le message rappelle les blocages actifs à vérifier. La validation relit cette même analyse : une préférence sacrifiée reste autorisée et expliquée, tandis qu'une paire bloquée, un doublon, un auto-match, un joueur inactif ou l'absence d'un joueur actif interdit la validation.

Le 2026-09-27, les contrôles automatisés couvrent les critères actifs et désactivés, les revanches, les blocages, les byes répétés et le catalogue d'états. Le rendu a également été vérifié dans Edge headless à 1 400 px, panneau global et explication détaillée dépliée. L'interface d'édition guidée consommera cette même analyse lors de sa refonte au lot 6 ; son ancien parcours visuel n'est pas refondu dans 3D.

### 3E — Scénarios applicatifs et anciennes sauvegardes

Le test de régression `tests/swiss-application-scenarios.test.mjs` traverse l'adaptateur, le runner et le solveur exact avec les effectifs fonctionnels de 2, 3, 4, 5, 8, 16, 32 et 64 joueurs. Il vérifie pour chaque cas la couverture exhaustive des joueurs, l'unicité du bye sur les effectifs impairs et l'absence de mutation du tournoi fourni au calcul.

Un objet de tournoi sérialisé au schéma V1.9.32, dépourvu de `pairingMeta` et de `swissPairingSignatures`, sert de cas de compatibilité de l'adaptateur et du runner. Ses résultats, scores, scénario, blocages et options sont relus sans réécrire les rondes validées. La ronde suivante utilise leur historique ; une ronde ouverte ancienne peut être relancée en reconstruisant sa signature courante, qui est exclue avant de chercher une variante. Les champs explicites modernes ont priorité sur leurs anciens doublons ; lorsqu'ils sont tous absents, les critères restent neutres sans mutation. Le parcours complet d'import et de restauration reste au lot 7.

Ce sous-lot ne migre volontairement pas les anciens forfaits ou `bye_forced` ambigus. Leur qualification, leurs effets sur le SOS et la conservation de leur calcul historique appartiennent au lot 5, après les derniers arbitrages correspondants. Les traiter ici aurait inventé une information absente de la sauvegarde.

### 4A — Raccordement de la phase Suisse hybride

La fonction applicative `isSwissPairingPhase()` reconnaît désormais deux contextes et seulement deux : le format Suisse classique et le format hybride tant que `hybridPhase === 'swiss'`. Ces deux chemins appellent le même calcul initial, le même énumérateur de variantes optimales, la même analyse métier et la même gestion des métadonnées de ronde. Une modification manuelle d'une ronde hybride Suisse conserve donc également sa signature et sa provenance.

Le routage exclut explicitement le format manuel, le bracket pur et l'hybride après passage à `hybridPhase === 'cut'`. Le Top Cut continue d'utiliser ses fonctions de tableau à élimination directe ; aucun appel au moteur Suisse exact n'est possible depuis cette phase. Le sous-lot 4A ne modifie ni le classement ni la transition de phase : la preuve de parité appartient à 4B et la photographie des départages au Top Cut à 4C.
