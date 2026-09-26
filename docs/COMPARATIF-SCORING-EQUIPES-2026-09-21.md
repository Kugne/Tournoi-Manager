# Comparatif des méthodes de classement en ronde suisse par équipes

Date : 21 septembre 2026  
Format étudié : 8 équipes de 3 joueurs, 5 rondes suisses, 3 parties par rencontre.  
Barème individuel envisagé : victoire 3, nul 1, défaite 0.

## Conclusion proposée

Pour un tournoi présenté comme une compétition **par équipes**, la méthode la plus cohérente est :

1. **points de rencontre d’équipe** : 3 pour une victoire, 1 pour un nul, 0 pour une défaite ;
2. **points individuels cumulés** : somme des scores 3/1/0 des trois joueurs ;
3. **Buchholz équipe** : somme des points de rencontre finaux des adversaires rencontrés ;
4. **score de scénario cumulé**, uniquement si ce score est réellement comparable d’une table, d’une mission et d’une ronde à l’autre ;
5. ultime départage annoncé à l’avance : confrontation directe lorsqu’elle est applicable, barrage ou tirage au sort selon le règlement.

La méthode A reste donc conservée dans son intégralité, mais devient le premier départage de la méthode B. Cette combinaison récompense d’abord les équipes qui gagnent leurs rencontres, tout en gardant chaque partie individuelle utile.

Le choix entre points individuels puis Buchholz, ou Buchholz puis points individuels, exprime deux philosophies différentes. Placer les points individuels en premier récompense la qualité globale des trois joueurs et convient bien à ce format. Placer le Buchholz en premier protège davantage une équipe ayant affronté un calendrier difficile. L’application gagnerait à proposer les deux ordres, avec **points individuels en premier par défaut**.

## Les deux méthodes comparées

### Méthode A — cumul des points individuels

Chaque partie rapporte 3/1/0 au joueur et tous les points sont additionnés. Une équipe peut atteindre 45 points après 15 parties.

**Avantages**

- Chaque table et chaque point restent utiles jusqu’à la fin.
- Une victoire 3–0 est mieux récompensée qu’une victoire 2–1.
- Le classement comporte moins d’égalités et demande moins souvent des départages.
- Le calcul est simple et donne une image précise de la performance totale des trois joueurs.

**Inconvénients**

- Une équipe peut devenir championne en ayant gagné moins de rencontres que sa rivale.
- Une très large victoire contre une équipe faible peut compenser plusieurs défaites serrées.
- Le résultat collectif de la rencontre perd de son importance.
- Le système favorise les profils capables de produire quelques scores très larges et peut accroître l’effet d’une « table forte ».
- Si les appariements suisses sont faits sur les points de rencontre mais le classement sur les points individuels, les groupes d’appariement et le classement ne racontent pas la même compétition.

### Méthode B — points de rencontre d’équipe

Une rencontre rapporte 3/1/0 à l’équipe. Avec trois parties, davantage de victoires individuelles que l’adversaire donne la victoire d’équipe. Les cas `3V`, `2V+1D` et `1V+2N` gagnent ; `1V+1N+1D` et `3N` donnent un nul.

Comparer le nombre de victoires individuelles ou comparer la somme 3/1/0 des trois tables donne ici le même résultat de rencontre : les points des tables nulles sont identiques des deux côtés et la différence vient uniquement des victoires décisives.

**Avantages**

- Le champion est d’abord l’équipe qui obtient les meilleurs résultats collectifs.
- Une seule victoire très large ne gomme pas plusieurs rencontres perdues.
- Le score principal utilisé pour les appariements suisses peut être le même que celui du classement.
- La règle est facile à expliquer : gagner une rencontre constitue l’objectif central.
- Le modèle correspond à la tendance observée dans plusieurs règlements officiels d’épreuves par équipes.

**Inconvénients**

- Une victoire 3–0 vaut autant qu’une victoire 2–1 au premier critère.
- Une fois deux tables gagnées, la troisième ne change plus le résultat principal de la rencontre.
- Les égalités au classement sont plus nombreuses ; un vrai ordre de départage est indispensable.
- Le passage entre nul et victoire crée un seuil brutal : un seul résultat individuel peut faire gagner deux points de rencontre supplémentaires.

Le premier départage par points individuels corrige les deux premiers défauts sans retirer la priorité au résultat collectif.

### Choisir 3/1/0 ou 2/1/0 pour les rencontres

Ce choix change la valeur relative des nuls :

- avec **3/1/0**, une victoire et une défaite rapportent 3 points, contre 2 pour deux nuls ; le système encourage davantage la recherche de la victoire ;
- avec **2/1/0**, une victoire et une défaite valent deux nuls ; le bilan brut victoire/nul/défaite est plus linéaire ;
- un barème **3/2/1** donne exactement le même ordre que 2/1/0 lorsque toutes les équipes jouent le même nombre de rondes : il ajoute simplement un point constant par ronde à chaque équipe.

Pour rester cohérent avec le barème déjà envisagé dans Tournoi Manager et avec l’objectif de récompenser la victoire, **3/1/0 est le réglage recommandé**, tout en laissant 2/1/0 configurable.

## Cas concrets révélateurs

### Une large victoire contre deux victoires régulières

Sur trois rondes sans nuls :

| Équipe | Résultats | Points individuels | Points de rencontre |
|---|---:|---:|---:|
| Rouge | 3–0, 1–2, 1–2 | 15 | 3 |
| Bleue | 2–1, 2–1, 0–3 | 12 | 6 |

La méthode A place Rouge devant. La méthode B place Bleue devant. Le choix revient à décider si deux rencontres gagnées doivent compter davantage qu’une seule victoire, même très large. Pour une compétition par équipes, la réponse recommandée est oui.

### Même bilan d’équipe, ampleur différente

Deux équipes terminent avec 6 points de rencontre. X totalise 15 points individuels et Y en totalise 12. La méthode B seule les laisse à égalité ; **B puis A** classe X devant et récompense les parties jouées après l’acquisition de la victoire d’équipe.

### Performance brute contre difficulté du calendrier

Deux équipes ont 9 points de rencontre. X possède 25 points individuels et un Buchholz de 7 ; Y possède 24 points individuels et un Buchholz de 11.

- Points individuels avant Buchholz : X passe devant.
- Buchholz avant points individuels : Y passe devant.

Il n’existe pas de réponse purement mathématique : X a davantage dominé ses tables, Y a affronté de meilleurs adversaires. Sur seulement cinq rondes, le Buchholz peut encore beaucoup dépendre d’un résultat tardif d’un adversaire. C’est pourquoi il est proposé en second départage, avec une option de règlement permettant de l’inverser.

## Essais statistiques

Un programme reproductible a simulé **30 000 tournois** : 5 modèles de forces × 6 000 essais. Chaque tournoi comprend 8 équipes, 3 joueurs et 5 rondes sans revanche. Après la première ronde, les équipes sont appariées selon les points de rencontre puis les points individuels. La graine aléatoire est `0x51c0ffee`.

Trois classements ont été comparés :

- **A** : points individuels, puis points de rencontre et Buchholz ;
- **B-individuel** : points de rencontre, puis points individuels et Buchholz ;
- **B-Buchholz** : points de rencontre, puis Buchholz et points individuels.

| Modèle simulé | Nuls individuels | Vainqueur différent A / B-individuel | Top 3 différent A / B-individuel | Le champion A a moins de victoires que le champion B | Premier de B à égalité avant départage |
|---|---:|---:|---:|---:|---:|
| Forces homogènes | 17,93 % | 19,27 % | 35,57 % | 12,00 % | 22,30 % |
| Équipe avec superstar | 6,24 % | 13,37 % | 27,32 % | 9,53 % | 24,88 % |
| Équipes régulières | 5,33 % | 10,22 % | 21,55 % | 7,42 % | 21,48 % |
| Forte fréquence de nuls | 34,15 % | 19,57 % | 32,57 % | 12,58 % | 19,68 % |
| Écarts très marqués | 1,34 % | 4,22 % | 7,73 % | 3,55 % | 12,80 % |

En synthèse :

- le choix A ou B change le champion dans **4,22 % à 19,57 %** des essais ;
- il change la composition du top 3 dans **7,73 % à 35,57 %** des essais ;
- avec A, le champion possède le plus grand nombre de rencontres gagnées dans **86,88 % à 96,45 %** des essais seulement ;
- avec B, le leader est à égalité sur le score principal avant départage dans **12,80 % à 24,88 %** des essais ;
- choisir les points individuels ou le Buchholz comme premier départage de B change le champion dans **3,32 % à 8,02 %** des essais.

Les divergences sont les plus fréquentes lorsque les équipes sont proches ou que les parties nulles sont nombreuses. Elles sont plus rares lorsque les écarts de force sont très nets, car les équipes dominantes gagnent à la fois leurs rencontres et beaucoup de tables.

Ces essais ne prédisent pas un tournoi réel. Ils mesurent la sensibilité des méthodes sur des modèles synthétiques. Les joueurs sont associés par position, la composition tactique et les forfaits ne sont pas simulés, et l’appariement suisse utilisé est une approximation déterministe. Les résultats suffisent toutefois à montrer que le choix du score principal n’est pas cosmétique.

Fichiers reproductibles :

- [`work/team-scoring-simulation.mjs`](../work/team-scoring-simulation.mjs)
- [`work/team-scoring-results.json`](../work/team-scoring-results.json)

## Cas difficiles à prévoir dans le règlement et dans l’application

### Partie encore en cours après que la rencontre est gagnée

La partie doit continuer et être enregistrée normalement : elle reste décisive pour le premier départage. Une concession ou un arrêt anticipé doit suivre les mêmes règles qu’une partie ordinaire.

### Nuls individuels

Les résultats `1V+2N` contre `1D+2N` donnent une victoire d’équipe. `1V+1N+1D` et `3N` donnent un nul. L’interface doit afficher à la fois le détail des trois tables, le total individuel et le résultat d’équipe pour éviter toute ambiguïté.

### Forfait d’un joueur

Il faut décider si la table vaut 3–0, si un score de scénario minimal est attribué et si elle compte comme une victoire ordinaire au départage. Une règle trop généreuse peut avantager artificiellement l’équipe bénéficiaire au cumul individuel.

Recommandation : victoire individuelle 3–0, aucun bonus maximal de scénario, et marqueur explicite de forfait. Le résultat d’équipe est ensuite calculé avec les deux autres tables.

### Forfait complet ou abandon d’une équipe

Il faut définir le score de rencontre, les points individuels accordés et le traitement des résultats déjà joués. Recommandation : conserver les résultats antérieurs, attribuer la victoire de rencontre à l’adversaire, mais seulement un total individuel neutre ou minimal annoncé. Le logiciel doit empêcher qu’un forfait complet devienne la meilleure source de points individuels du tournoi.

### Bye

Le format normal compte huit équipes, donc aucun bye. Le cas doit tout de même être prévu pour une équipe absente ou un changement de dernière minute. Un bye ne devrait pas attribuer automatiquement le maximum de 9 points individuels, car cela fausserait le premier départage. Une valeur équivalente à une rencontre gagnée de façon minimale, ou à un nul selon la politique choisie, est plus prudente.

### Partie interrompue, résultat litigieux ou correction tardive

Le résultat d’équipe doit être recalculé automatiquement à partir des trois tables. Une correction doit ensuite recalculer classement, départages, Buchholz et, si la ronde suivante n’a pas commencé, les appariements proposés. Après le début de la ronde suivante, le logiciel doit avertir l’organisateur avant toute régénération.

### Égalités multiples

La confrontation directe fonctionne bien entre deux équipes qui se sont rencontrées. Elle devient ambiguë entre trois équipes dont toutes les confrontations n’ont pas eu lieu. Le moteur doit appliquer le même ordre de départage à tout le groupe et ne pas inventer un mini-classement incomplet.

### Scores de scénario

Ils ne doivent servir de départage que si les missions offrent des échelles et des opportunités comparables. Sinon, ils récompensent autant le scénario tiré ou le type d’adversaire que la performance.

### Appariements et classement

Avec la recommandation B, les appariements suisses doivent grouper d’abord les équipes par points de rencontre. Les points individuels, puis éventuellement le Buchholz, servent à ordonner les équipes dans un même groupe. Il faut éviter les revanches et définir la méthode de flottement lorsqu’un groupe contient un nombre impair d’équipes.

## Ce qui est utilisé dans les règlements officiels étudiés

Il n’existe pas de recensement mondial fiable donnant la part de chaque méthode. La conclusion ci-dessous décrit donc un **échantillon de règlements officiels**, et non une statistique de tous les tournois locaux.

### Échecs par équipes

Le [système suisse par équipes FIDE en vigueur depuis février 2026](https://handbook.fide.com/chapter/SwissTeamPairingSystem202602) prévoit par défaut les **points de rencontre comme score principal** et les points de parties comme score secondaire. L’[Olympiade 2024](https://handbook.fide.com/files/handbook/Olympiad2024.pdf) et le [Mondial rapide par équipes 2025](https://handbook.fide.com/files/handbook/WRTC2025Regulations.pdf) utilisent 2/1/0 pour la rencontre, puis des départages mêlant résultats individuels et force des adversaires.

### Magic: The Gathering par équipes de trois

Les [Magic Tournament Rules du 10 novembre 2025](https://media.wizards.com/ContentResources/WPN/MTG_MTR_2025_Nov10_EN.pdf) utilisent trois confrontations individuelles : deux matchs individuels gagnés donnent la rencontre. Le classement attribue **3/1/0 à la rencontre**, avec la force des adversaires parmi les départages. C’est la forme la plus proche de la méthode B étudiée ici.

### Warhammer 40,000 par équipes

Le [Games Workshop 40,000 Teams Event Companion](https://assets.warhammer-community.com/eng_12-06_warhammer40000_teams_event_companion-3pq1qxo6kv-96smptwn3u.pdf) emploie un modèle hybride. L’écart de points de chaque table est converti en Battle Points complémentaires, les Battle Points des joueurs sont additionnés, puis un seuil détermine victoire, nul ou défaite d’équipe. Le classement principal repose ensuite sur des points de rencontre. Son 3/2/1 est équivalent au 2/1/0 quand toutes les équipes jouent le même nombre de rondes, car chaque équipe reçoit simplement un point constant de plus par ronde.

Le WTC 40K 2025 suit la même famille : les scores individuels convertis déterminent le résultat collectif, puis les points de rencontre classent les équipes et les Game Points les départagent. Ce n’est ni un cumul individuel pur ni une simple majorité de tables : l’ampleur des scores individuels détermine d’abord la rencontre.

### Bridge suisse par équipes

Le [règlement Swiss Teams de l’ACBL](https://web2.acbl.org/coc/SwissGeneral.pdf) représente l’exception nette de l’échantillon. L’écart d’IMP d’une rencontre est converti en Victory Points continus ; une large victoire rapporte donc davantage qu’une victoire serrée dans le score principal. Ce modèle ressemble davantage à A, tout en plafonnant et en convertissant l’écart pour limiter les effets excessifs.

### Tendance observée

Trois familles sur quatre dans cet échantillon — FIDE, Magic et Warhammer/WTC — placent un **résultat de rencontre** au premier rang. Les performances individuelles servent à produire ce résultat, à départager les équipes, ou aux deux. Le bridge conserve l’ampleur de la rencontre dans le score principal.

La pratique observée soutient donc la recommandation **B comme score principal, A comme départage**. Une variante hybride de type Warhammer devient intéressante si le jeu possède déjà un score de scénario continu, comparable et suffisamment encadré.

## Recommandation fonctionnelle pour Tournoi Manager

Prévoir trois modes explicites :

1. **Rencontres d’abord — recommandé** : points de rencontre, points individuels, Buchholz équipe, score de scénario.
2. **Force du calendrier d’abord** : points de rencontre, Buchholz équipe, points individuels, score de scénario.
3. **Cumul individuel** : points individuels comme critère principal, pour les disciplines ou règlements qui l’imposent.

Pour chaque tournoi, enregistrer séparément :

- les trois résultats individuels ;
- les points individuels de chaque équipe ;
- le résultat et les points de la rencontre ;
- les adversaires rencontrés ;
- les valeurs de chaque départage ;
- le motif spécial éventuel : bye, forfait, correction ou décision arbitrale.

L’écran de classement devrait afficher les colonnes dans l’ordre exact du règlement et proposer une explication du départage. Les exports doivent conserver les données brutes afin qu’un changement de règle ou une correction puisse recalculer le classement sans ressaisie.

## Décision encore à prendre

La présente étude recommande **B puis A puis Buchholz**, mais ne transforme pas cette recommandation en règle définitive du logiciel. Avant l’implémentation, il reste à valider :

- le barème de rencontre 3/1/0 ou 2/1/0 ;
- l’ordre entre points individuels et Buchholz ;
- le traitement exact des forfaits, byes et parties non terminées ;
- l’existence éventuelle d’un mode hybride fondé sur les scores de scénario.

