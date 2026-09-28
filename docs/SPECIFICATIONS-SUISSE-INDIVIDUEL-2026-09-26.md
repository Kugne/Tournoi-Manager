# Spécifications — Fiabilisation du Suisse individuel

Statut : **spécification fonctionnelle validée, y compris les cas limites du lot 5**

Date : 26 septembre 2026

Produit de référence : Tournoi Manager V1.9.32

Source des décisions : `IDEES.md`, section « Décisions et suivi »

## 1. Objectif

Fiabiliser le moteur Suisse individuel sans modifier la vocation du produit : une application autonome, locale, hors ligne et simple à distribuer.

Le nouveau moteur doit produire un appariement **globalement optimal** selon une hiérarchie métier explicite. Il ne doit plus dépendre d'une somme de poids pouvant permettre à un critère secondaire de compenser un critère prioritaire.

La phase 1 couvre :

- le Suisse individuel classique ;
- la phase suisse du format hybride ;
- les alertes et l'édition manuelle liées aux appariements ;
- les règles communes de bye, absence, forfait et drop nécessaires au Suisse.

La phase 2 « Suisse par équipes » est hors périmètre. Ses décisions déjà acquises restent conservées séparément.

## 2. Principes non négociables

### SP-001 — Le score Suisse

La qualité sportive d'un appariement dépend uniquement des **points de tournoi**, bonus et malus compris.

Les éléments suivants ne créent aucun sous-groupe sportif à l'intérieur d'un même total de points :

- points de scénario ;
- score libre ;
- SOS ;
- faction ou allégeance ;
- compo ;
- note libre ;
- historique des factions affrontées.

### SP-002 — Optimisation globale

Le moteur doit retourner une solution globalement optimale selon la hiérarchie de la section 3. Un optimum local obtenu par greedy ou échanges 2-opt ne suffit pas.

La validation de l'algorithme doit inclure :

- une comparaison à un oracle exhaustif sur les petits effectifs ;
- des tests de performance jusqu'à au moins 64 joueurs ;
- les mêmes entrées et règles en Suisse classique et dans la phase suisse hybride.

Pour 64 joueurs sur les navigateurs de bureau ciblés :

- viser un calcul inférieur à une seconde ;
- à partir de trois secondes, afficher « Calcul plus long que prévu… » et permettre l'annulation sans bloquer l'interface ;
- poursuivre néanmoins la recherche optimale jusqu'à une limite de sécurité de quinze secondes ;
- à quinze secondes, arrêter proprement sans modifier la ronde et sans retourner silencieusement au moteur greedy ou à une solution dégradée ;
- conserver la ronde précédente intacte et proposer de relancer le calcul ou de passer par l'édition manuelle.

### SP-003 — Critères optionnels

Un critère optionnel décoché est entièrement absent :

- du calcul ;
- du tri ;
- des alertes ;
- des explications de l'appariement.

Les données joueurs correspondantes sont conservées pour une réactivation ultérieure.

## 3. Hiérarchie lexicographique des appariements

Chaque niveau est optimisé sans jamais dégrader un niveau précédent.

### Niveau 1 — Blocages manuels

- Une arête entre deux joueurs bloqués est interdite.
- Le moteur ne peut jamais ignorer automatiquement un blocage.
- Si les blocages empêchent tout appariement complet, la génération s'arrête.
- L'interface doit identifier les blocages responsables et demander une intervention de l'organisateur.

### Niveau 2 — Revanches

- Une revanche est interdite tant qu'un appariement complet sans revanche existe.
- Si toute solution complète impose au moins une revanche, minimiser le nombre de revanches.
- À nombre minimal de revanches égal, comparer pour chaque revanche le nombre de rencontres antérieures entre les deux joueurs, trié du plus grand au plus petit ; éviter d'abord une troisième rencontre ou davantage.
- Si ce profil est encore identique, préférer globalement les revanches dont la dernière rencontre est la plus ancienne ; rejouer immédiatement la ronde précédente est le dernier choix.
- Chaque revanche inévitable est signalée en rouge avec les joueurs et la table concernés.
- Un blocage manuel n'est jamais sacrifié pour éviter une revanche.

### Niveau 3 — Écarts de points de tournoi

- Calculer l'écart absolu de points de tournoi de chaque rencontre, puis trier tous ces écarts du plus grand au plus petit.
- Comparer les solutions lexicographiquement sur cette liste : minimiser d'abord le pire écart, puis le deuxième pire, et ainsi de suite jusqu'à départager les solutions.
- Cette règle répartit les flottements lorsqu'elle évite de sacrifier fortement un joueur. Par exemple, les écarts `[1, 1, 0]` sont préférés à `[2, 0, 0]`.
- À pire écart identique, elle réduit successivement les autres écarts et favorise donc aussi le moins de rencontres intergroupes nécessaire sans introduire une somme pondérée ambiguë.
- Les bonus et malus font partie du total utilisé pour l'appariement.
- Les départages de classement ne participent pas à ce niveau.

### Niveau 4 — Miroirs, optionnel

- Si « Pas de miroir » est activé, minimiser le nombre de rencontres entre deux factions identiques.
- Un miroir est une préférence forte, pas une interdiction absolue.
- Il n'est retenu qu'en dernier recours parmi les solutions ayant la même qualité aux niveaux 1 à 3.

### Niveau 5 — Allégeances, optionnel

- Si l'option est activée, minimiser les rencontres entre factions appartenant à la même allégeance.
- Une même faction reste plus prioritaire qu'une simple même allégeance.
- Ce critère ne doit pas être évalué lorsque l'option est désactivée.

### Niveau 6 — Compo, optionnel

- Les valeurs usuelles sont comprises entre 0 et 2.
- Calculer les écarts absolus de compo, les trier du plus grand au plus petit et comparer les solutions lexicographiquement, comme pour les points de tournoi.
- Minimiser donc d'abord le pire écart de compo, puis le deuxième pire, et ainsi de suite. Plusieurs petits écarts sont préférés à un écart plus important lorsqu'aucun critère supérieur ne les départage.
- La compo ne peut jamais compenser un point de tournoi, même si ce point provient d'un bonus ou d'un malus.
- Si l'option est désactivée, les valeurs de compo sont conservées mais ignorées.

### Niveau 7 — Note libre, optionnel

- La note libre a un rôle social, jamais sportif.
- Elle ne départage que des solutions équivalentes jusqu'au niveau compo inclus.
- Une note vide est neutre.
- Les notes sont comparées après normalisation de la casse, des accents et des espaces superflus ; le texte original reste affiché.

Mode « Séparer » :

- éviter les rencontres entre joueurs partageant une même note non vide ;
- toutes les rencontres entre groupes différents ou avec une note vide restent ouvertes ;
- parmi les solutions égales sur tous les niveaux supérieurs, minimiser globalement le nombre de rencontres entre joueurs partageant une même note non vide ;
- si la séparation ne peut être respectée sans dégrader un niveau précédent, l'autoriser en dernier recours et l'expliquer.

Mode « Regrouper » :

- favoriser les rencontres entre joueurs partageant une même note non vide, par exemple des rookies ;
- les notes différentes et vides n'interdisent jamais une rencontre ;
- parmi les solutions égales sur tous les niveaux supérieurs, maximiser globalement le nombre de rencontres entre joueurs partageant une même note non vide ;
- ne jamais créer un écart de points ou de compo supplémentaire pour regrouper.

### Niveau 8 — Diversité historique des factions

- Ce critère est automatique et constitue l'ultime départage.
- Pour chaque joueur, compter les factions adverses rencontrées pendant tout le tournoi.
- Pour chaque rencontre proposée, relever pour chacun des deux joueurs le nombre de fois où il a déjà affronté la faction de son nouvel adversaire.
- Trier tous ces nombres du plus grand au plus petit et comparer les solutions lexicographiquement : minimiser d'abord la répétition la plus forte subie par un joueur, puis la suivante, et ainsi de suite.
- Une solution créant deux secondes expositions est donc préférée à une solution créant une troisième exposition évitable pour un seul joueur.
- Cette diversité ne modifie jamais les points, le classement, les départages, le SOS ou un niveau précédent de l'appariement.
- Une répétition reste autorisée lorsque les factions disponibles ne permettent pas de varier.

### Niveau 9 — Variante équivalente de reroll

- Après optimisation des huit niveaux métier, départager aléatoirement les solutions strictement équivalentes.
- Conserver les signatures de toutes les solutions optimales déjà proposées pour la ronde, y compris après fermeture ou rechargement de l'application.
- Chaque reroll exclut toutes ces signatures et propose une variante optimale encore jamais affichée lorsqu'elle existe.
- Si une seule solution optimale existe, la reproduire et l'indiquer à l'organisateur.
- Si toutes les variantes optimales ont déjà été proposées, conserver la combinaison actuelle et afficher « Toutes les variantes optimales disponibles ont déjà été proposées. »
- Effacer cet historique lorsque la ronde est validée ou annulée.

## 4. Bye

Une ronde Suisse exige au moins deux joueurs actifs. Avec un seul joueur actif, l'application refuse le lancement et explique qu'il faut réactiver un participant, terminer le tournoi ou annuler l'opération ; elle ne crée jamais une ronde composée uniquement d'un bye.

### BYE-001 — Attribution automatique

1. Ne considérer que les joueurs actifs et disponibles pour la ronde.
2. Choisir ceux ayant reçu le moins de byes joués.
3. Parmi eux, choisir le joueur le moins bien classé avant la ronde.
4. Un bye d'une ronde annulée ou jamais jouée ne compte pas.

### BYE-002 — Reroll et modification manuelle

- Un reroll conserve le bénéficiaire du bye tant qu'il reste éligible.
- Un changement manuel reste possible.
- L'interface avertit dès que le nouveau bénéficiaire a déjà reçu un bye et signale en plus toute différence défavorable avec le nombre de byes des autres joueurs éligibles.
- Si le bénéficiaire devient absent, forfait ou est retiré avant le début, recalculer le bye selon BYE-001.

### BYE-003 — Points attribués

- Points de tournoi : valeur d'une victoire selon le barème configuré.
- Scénario : moyenne des scores de scénario réellement enregistrés pendant la ronde en cours, hors bye.
- Score libre activé : moyenne des scores libres réellement enregistrés pendant la ronde en cours, hors bye.
- Les moyennes sont calculées au moment de la validation, arrondies une seule fois au centième, affichées sans zéros inutiles et utilisées telles quelles dans le classement.
- Avant validation, afficher la valeur comme provisoire ou « calculée à la validation ».

### BYE-004 — SOS

- Un bye représente un adversaire virtuel neutre.
- Sa contribution correspond à la moyenne des points sportifs des autres participants retenus pour le SOS.
- La valeur évolue avec le classement et utilise les valeurs finales dans le classement final.
- Les bonus et malus extrasportifs sont exclus de ce calcul.

## 5. Classement et SOS

### CLS-001 — Ordre individuel

1. points de tournoi, bonus et malus compris ;
2. points de scénario ;
3. score libre, s'il est activé ;
4. SOS.

### CLS-002 — Définition du SOS

- Pour une rencontre jouée, ajouter les points sportifs de l'adversaire.
- Les bonus et malus modifient le classement et les groupes futurs, mais pas la valeur SOS donnée aux adversaires.
- Pour un bye ou une victoire administrative neutre, appliquer la contribution virtuelle définie dans BYE-004.
- Les phases éliminatoires du format hybride ne doivent pas contaminer le SOS de la phase suisse.

## 6. Absence, forfait et drop

### STA-001 — Absence avant le début de la ronde

- Si aucun résultat n'est saisi et que la ronde n'a pas commencé, proposer de régénérer toute la ronde sans le joueur absent.
- La régénération exige une confirmation ; elle n'est jamais automatique.
- Si l'organisateur refuse de régénérer, traiter l'adversaire privé de partie comme une victoire administrative neutre.

### STA-002 — Partie jamais commencée

- L'adversaire disponible reçoit les points d'une victoire.
- Aucun adversaire réel n'est ajouté à son historique.
- Scénario, score libre et SOS suivent les règles neutres du bye.
- L'événement reste libellé « victoire administrative — partie non jouée », pas « match joué ».

### STA-003 — Abandon après le début de la partie

- Le match et l'adversaire restent dans l'historique.
- Le joueur disponible reçoit la victoire.
- Les deux joueurs contribuent normalement au SOS.
- Les scores secondaires sont saisis ou confirmés explicitement par l'organisateur.

### STA-004 — Drop

- Un drop signifie un abandon définitif du tournoi et exclut le joueur des rondes suivantes.
- Il ne décide pas automatiquement du résultat de la ronde en cours.
- Lors du drop, afficher une confirmation explicite : « Attention : un drop est un abandon définitif ».
- Demander ensuite si la partie n'a jamais commencé ou a été abandonnée après son début, puis appliquer STA-002 ou STA-003.

## 7. Reroll

### RR-001 — Garanties

- Le bye reste stable, sauf inéligibilité ou modification volontaire.
- Aucun niveau de la hiérarchie ne peut être dégradé.
- Une nouvelle solution globalement optimale est recherchée.
- Les rondes précédentes restent dans les historiques ; la ronde régénérée en est exclue pour les adversaires, byes et statistiques.

### RR-002 — Retour utilisateur

- Si une variante optimale différente existe, l'afficher.
- Sinon, conserver la même solution et indiquer qu'aucune autre solution optimale n'existe.
- Ne pas présenter un changement aléatoire dégradé comme un reroll valide.
- La signature d'une combinaison est l'ensemble trié des paires non orientées `min(id1,id2)|max(id1,id2)`, complété par l'identifiant du bye ; elle ignore l'ordre p1/p2 et les numéros de table.
- Les signatures de toutes les variantes proposées sont persistées jusqu'à la validation ou l'annulation de la ronde.

## 8. Numérotation des tables

Après calcul des paires :

1. classer les rencontres par somme des points de tournoi décroissante ;
2. à égalité, utiliser le meilleur rang actuel puis le second ;
3. placer le bye en dernier ;
4. permettre une réaffectation manuelle des numéros sans changer les adversaires.

La numérotation ne participe jamais à l'optimisation des paires.

## 9. Alertes et explications

### UI-ALT-001 — Source unique

Les notifications de génération, le panneau jaune/rouge, l'éditeur manuel et la validation doivent consommer la même fonction d'analyse des contraintes.

### UI-ALT-002 — Niveaux

- Rouge : revanche inévitable, bye répété anormal, donnée incohérente ou autre anomalie forte.
- Jaune : préférence optionnelle activée mais non respectée.
- Aucun message pour un critère désactivé.
- Un blocage manuel n'est pas une alerte : il interdit la solution.

Chaque alerte indique la table, les joueurs, la règle concernée et le caractère inévitable ou manuel de la situation.

### UI-ALT-003 — Explicabilité

Pour chaque table, permettre d'afficher « Pourquoi ce match ? » avec :

- total de points des joueurs ;
- absence ou présence de revanche ;
- critères optionnels actifs ;
- compromis éventuels ;
- niveau auquel cette paire a été départagée.

L'explication ne doit pas exposer un ancien score pondéré devenu sans rapport avec la hiérarchie.

## 10. Édition manuelle

### UI-MAN-001 — Contraintes d'enregistrement

- Refuser un joueur présent deux fois, bye compris.
- Refuser un auto-match.
- Refuser une paire soumise à un blocage manuel ; le blocage doit être retiré séparément.
- Exiger une confirmation forte pour une revanche.
- Afficher un avertissement simple pour miroir, allégeance, compo ou note libre activés.
- Ne jamais modifier silencieusement une autre table.

### UI-MAN-002 — Lisibilité

Pour chaque emplacement, présenter les adversaires avec un état visible :

- interdit ;
- déconseillé ;
- recommandé ou neutre.

Afficher la raison, trier par pertinence et désactiver les choix impossibles. Avant enregistrement, montrer un récapitulatif des conséquences.

### UI-MAN-003 — Échange guidé entre joueurs

L'éditeur ne doit plus demander à l'organisateur de remplacer indépendamment les joueurs dans toutes les listes déroulantes. La modification normale consiste à sélectionner un joueur, puis un second joueur déjà placé : l'application propose et réalise leur **échange de positions** en une seule opération.

- Aucun doublon temporaire ne doit être créé pendant un échange.
- Le joueur sélectionné, sa table et son adversaire actuel restent visibles pendant le choix du second joueur.
- Chaque candidat indique sa table et son adversaire actuels, ainsi que les contraintes ou avertissements applicables au résultat de l'échange.
- Les deux tables affectées sont prévisualisées ensemble avant confirmation ; aucune autre table n'est modifiée.
- L'organisateur peut annuler le dernier échange ou abandonner toutes les modifications avant l'enregistrement final.
- Un échange impliquant le bye déplace explicitement le bénéficiaire du bye et applique les contrôles propres au bye.
- Sur un écran étroit, les deux joueurs d'une table peuvent être présentés verticalement afin de conserver les noms et informations lisibles.

Code couleur attendu dans cet éditeur :

- bleu : joueur ou emplacement actuellement sélectionné ;
- vert : échange valide sans réserve ;
- jaune : échange autorisé avec préférence optionnelle non respectée ;
- orange : revanche exigeant la confirmation forte prévue par `UI-MAN-001` ;
- rouge : opération interdite ou donnée incohérente, jamais un simple état transitoire normal.

L'échange automatique constitue une modification explicite des deux tables montrées dans la prévisualisation ; il ne contrevient donc pas à l'interdiction de modifier silencieusement une autre table.

### UI-MAN-004 — Sélecteur de joueur adaptatif

Après la sélection du premier joueur, les candidats à l'échange sont présentés dans un panneau dédié et recherchable, sans faire perdre de vue la table d'origine.

Cette présentation est propre aux tâches de composition et d'édition des appariements. Elle ne remplace ni l'affichage normal des rondes, ni les fiches joueurs, ni le classement. Le même composant doit toutefois être réutilisé pour la préparation initiale des rondes du mode manuel afin d'éviter deux interfaces différentes pour la même opération.

- Sur un écran large, le panneau s'affiche à côté de la liste des tables.
- Sur un écran étroit, il s'affiche immédiatement sous la table sélectionnée.
- Une recherche filtre les candidats par nom et par faction ; elle ne modifie aucun appariement tant qu'un candidat n'est pas confirmé.
- Le panneau peut être refermé sans modifier la ronde.
- La table et le joueur d'origine restent visuellement sélectionnés pendant la recherche.
- Après un échange, les deux tables concernées restent mises en évidence et visibles dans le récapitulatif des modifications.

### UI-MAN-005 — Contenu des candidats

Chaque candidat à l'échange utilise une présentation compacte affichant immédiatement :

- son nom ;
- sa faction ;
- sa table actuelle, ou le fait qu'il bénéficie du bye ;
- son adversaire actuel ;
- uniquement les avertissements applicables au résultat de l'échange, sous forme de badges courts.

Les informations complémentaires restent accessibles en dépliant le candidat. Un critère facultatif désactivé ne produit ni badge ni détail d'avertissement. La présentation compacte doit permettre de comparer plusieurs candidats sans multiplier les blocs de texte.

### UI-MAN-006 — Ordre des candidats

Le sélecteur classe les candidats selon l'effet complet de l'échange proposé sur les deux tables :

1. échanges valides sans avertissement ;
2. échanges autorisés avec avertissement, par gravité décroissante ;
3. échanges interdits, conservés visibles mais désactivés avec leur raison.

À l'intérieur d'un même groupe et d'un même niveau d'avertissement, les joueurs sont classés par ordre alphabétique. La recherche reste disponible quel que soit le groupe. Cet ordre facilite l'opération manuelle mais ne modifie pas les règles sportives ni les appariements tant que l'organisateur n'a pas confirmé son choix.

### UI-MAN-007 — Brouillon et confirmation

La fenêtre travaille sur un brouillon indépendant de la ronde enregistrée.

- Sélectionner un candidat valide sans avertissement applique immédiatement l'échange au brouillon.
- Les deux tables modifiées sont mises en évidence et une action « Annuler cet échange » est proposée.
- Un échange autorisé avec avertissement demande une confirmation spécifique avant d'être appliqué au brouillon.
- Une opération interdite ne peut pas être appliquée.
- Le bouton final « Enregistrer » applique l'ensemble du brouillon à la ronde ; fermer ou annuler la fenêtre abandonne toutes les modifications non enregistrées.
- Une table possédant déjà un résultat est visuellement verrouillée par défaut dans l'éditeur.
- L'organisateur peut choisir « Modifier quand même » ; une confirmation indique alors précisément les tables et résultats que l'échange invalidera.
- Après confirmation, seuls les résultats des tables réellement touchées par l'échange sont remis à l'état non renseigné. Les autres tables et leurs résultats restent strictement inchangés.
- Aucun résultat déjà saisi n'est jamais effacé silencieusement.

### UI-MAN-008 — Récapitulatif fixe

Un bandeau reste visible en bas de la fenêtre pendant le défilement. Il récapitule au minimum :

- le nombre d'échanges réalisés dans le brouillon ;
- le nombre de tables modifiées ;
- le nombre d'avertissements encore présents.

Il contient les actions « Annuler le dernier échange », « Tout réinitialiser » et « Enregistrer les modifications ». Les deux premières agissent uniquement sur le brouillon. « Enregistrer les modifications » reste l'unique action appliquant le brouillon à la ronde.

### UI-MAN-009 — Réorganisation des numéros de table

La même fenêtre propose deux modes distincts et explicitement nommés :

- « Échanger des joueurs » pour modifier les adversaires selon `UI-MAN-003` à `UI-MAN-008` ;
- « Réorganiser les tables » pour changer uniquement les numéros ou positions physiques des rencontres.

Changer de mode ne doit pas confondre les opérations. Une réorganisation de tables conserve exactement les mêmes paires, résultats et alertes ; elle ne participe jamais au calcul Suisse. Son brouillon et ses changements apparaissent dans le récapitulatif avant l'enregistrement final.

## 11. Activation en cours de tournoi

- Compo et note libre peuvent être activées ou désactivées à tout moment.
- La modification affecte les prochaines générations et les rerolls demandés après le changement.
- Elle ne modifie jamais automatiquement une ronde déjà générée ou validée.
- Les données joueurs restent stockées.
- Les mêmes principes s'appliquent aux options miroir et allégeance.

## 12. Modèle de données cible

La forme retenue au sous-lot 5A distingue explicitement :

```text
state.schemaVersion = 1
match.outcomeVersion = 1
match.kind = null | played | bye | administrative_no_show | forfeit_after_start | double_forfeit | legacy_forced_win_unknown
match.result = p1 | p2 | draw | null
match.started = true | false | null
match.administrativeReason = absence | forfeit | drop | unknown | null
round.pairingMeta = {
  engineVersion,
  seed,
  objectiveVector,
  signature,
  byePlayerId
}
```

`kind=null` représente un match encore en attente. Un `double_forfeit` est au contraire résolu avec `result=null` : aucun vainqueur n'est inventé et les deux côtés reçoivent une défaite administrative selon le barème. Le lecteur des données historiques expose une provenance `legacy` sans l'écrire dans la sauvegarde.

Exigences :

- ne plus détourner un simple booléen `bye_forced` pour plusieurs réalités ;
- conserver séparément points sportifs et points ajustés par bonus/malus ;
- calculer les alertes depuis les données métier, pas depuis des champs UI morts ;
- versionner le schéma persistant ;
- migrer les anciennes données sans recalculer silencieusement les rondes validées.

Les anciens matchs ambigus doivent conserver leur interprétation historique lors de la migration. Ne pas transformer rétroactivement un ancien `bye_forced` sans information suffisante.

Un ancien `bye_forced` impossible à qualifier devient `legacy_forced_win_unknown` et conserve exactement son calcul historique de points, adversaire et SOS. Il n'est pas présenté comme la preuve que la partie a commencé ou non. L'organisateur peut le consulter, mais aucune migration ne lui invente un fait absent des données.

## 13. Compatibilité entre formats

| Fonction | Suisse | Phase suisse hybride | Bracket | Manuel |
| --- | --- | --- | --- | --- |
| Nouveau moteur optimal | Oui | Oui | Non | Non |
| Création d'une ronde | Moteur Suisse | Même moteur Suisse | Moteur de tableau distinct | Composition libre distincte |
| Classement | Classement Suisse | Classement Suisse figé à la coupure | Progression de tableau distincte | Politique explicite à conserver séparée |
| Bye Suisse et SOS virtuel | Oui | Oui avant le cut | Bye de tableau distinct | Bye manuel contrôlé, sans moteur Suisse |
| Alertes unifiées | Oui | Oui | Alertes propres au bracket | Oui |
| Blocages/revanches | Automatiques | Automatiques | Sans effet sur le tableau | Contrôles manuels |
| Drop/forfait | Règles STA | Règles STA avant le cut, règles bracket après | Règles de progression propres | Règles administratives communes sans réappariement automatique |
| Reroll optimal | Oui | Oui avant le cut | Non | Non automatique |
| Éditeur d'appariements | Échange guidé | Échange guidé avant le cut | Restrictions propres au tableau | Même composant d'échange et de préparation |
| Sauvegarde et exports | Données communes typées | Séparation explicite Suisse/cut | Données de tableau | Données manuelles |

Toute modification d'une fonction partagée doit être testée dans les quatre formats. Le passage de l'hybride du Suisse au Top Cut doit figer les résultats et départages suisses.

L'audit du code V1.9.32 établit les dépendances suivantes :

- `generatePairings()` est actuellement partagé directement par le Suisse classique et la phase Suisse hybride ; le nouveau moteur doit conserver ce partage intentionnel ;
- le bracket et le mode manuel ne doivent jamais appeler le moteur Suisse ;
- `getStandings()`, `roundsData`, les statuts, la validation, la sauvegarde et les exports sont transversaux et doivent recevoir des politiques explicites par format ;
- le code actuel exclut les points de tournoi du cut du classement Suisse, mais continue à parcourir certains scores secondaires du cut : la photographie de coupure doit supprimer ce couplage ;
- le simple `cutStartIndex` actuel ne constitue pas une photographie suffisante des points et départages suisses.

Architecture cible minimale :

1. entités communes `Tournament`, `Entrant`, `Round`, `Match`, `Result` et événements de statut ;
2. politique de classement propre à chaque format ;
3. moteurs d'appariement séparés Suisse, bracket et manuel ;
4. orchestrateur de flux propre à chaque format, l'hybride composant une phase Suisse puis une phase bracket ;
5. moteur Suisse recevant des `Entrant` plutôt que dépendant directement de l'interface ou du stockage.

L'abstraction `Entrant` prépare le futur mode équipes sans l'implémenter : un entrant individuel référence un joueur ; un futur entrant collectif référencera une équipe et ses membres. Les règles 3/1/0, points individuels puis Buchholz équipe resteront une politique de classement distincte. Les rencontres internes entre membres d'équipes ne font pas partie de cette phase.

## 14. Critères d'acceptation

### Appariements

- Chaque joueur éligible apparaît exactement une fois, bye compris.
- Aucun joueur inactif n'apparaît.
- Aucun auto-match ni identifiant inconnu.
- Un blocage manuel n'est jamais violé.
- Une revanche n'apparaît que si l'oracle confirme qu'aucune solution complète sans revanche n'existe.
- L'objectif mathématique retenu après l'arbitrage de la section 15 est minimal parmi les solutions respectant les niveaux précédents.
- Lorsqu'un critère optionnel est désactivé, modifier uniquement ses données ne change ni l'appariement, ni les alertes, ni les explications.
- Le résultat du moteur égale l'oracle sur tous les petits jeux exhaustifs.

### Bye et statuts

- Reroller une ronde ne déplace pas son bye.
- Une ronde annulée ne consomme pas de bye.
- Scénario et score libre du bye égalent la moyenne affichée de la ronde au centième.
- Le SOS virtuel du bye est visible et reproductible.
- Un no-show ne crée pas un faux adversaire ; un abandon après début conserve l'adversaire.
- Un drop exige une confirmation et ne résout pas silencieusement le match.

### Interface

- Les alertes correspondent uniquement aux options actives.
- Le panneau, l'éditeur et la validation donnent la même analyse.
- Le bouton de validation reste indisponible tant que chaque table n'a pas un résultat ou un statut explicite.
- L'éditeur manuel empêche les doublons incluant le bye.
- Les tables sont numérotées sportivement et réaffectables manuellement.

### Hybride et Top Cut

- Au passage au Top Cut, figer une photographie des points, scénario, score libre et SOS issus de la phase suisse.
- Après chaque match du cut, ces quatre valeurs suisses restent identiques ; seule la progression dans le bracket change.
- Les exports doivent distinguer les résultats de phase suisse des résultats éliminatoires.

### Performance et stabilité

- Cas fonctionnels : 2, 3, 4, 5, 8, 16, 32 et 64 joueurs.
- Comparaison exhaustive ou par programmation dynamique sur les tailles compatibles.
- Tests déterministes avec graine imposée et tests de reroll avec plusieurs optima.
- Aucun changement des résultats validés lors d'une migration.
- Fonctionnement hors ligne et distribution autonome préservés.

## 15. Arbitrages complémentaires du lot 5

Ces six cas limites ont été validés le 27 septembre 2026 :

1. **Moyenne impossible :** si aucune partie réellement jouée ne fournit de valeur calculable, demander à l'organisateur une valeur neutre à confirmer, avec `0` proposé par défaut. Bloquer la validation jusque-là et ne jamais reprendre une moyenne des rondes précédentes.
2. **Population du SOS virtuel :** figer pour chaque ronde les autres joueurs encore participants au début de cette ronde, hors bénéficiaire et hors joueurs déjà absents ou droppés. Conserver dans cette population ceux qui droppent plus tard. Faire évoluer sa valeur avec leurs points sportifs ultérieurs, sans bonus ni malus.
3. **Rotation après victoire administrative :** une victoire administrative sans partie jouée ne compte pas comme un bye reçu et ne réduit pas la priorité à un futur bye.
4. **Abandon après début :** conserver les scores secondaires déjà saisis ; toute valeur requise manquante doit être saisie ou confirmée explicitement. Ne proposer aucune moyenne ou valeur automatique et bloquer la validation tant que nécessaire.
5. **Début observable d'une partie :** ne pas ajouter d'action permanente « Partie commencée ». Lors d'un forfait, d'une absence ou d'un drop, demander obligatoirement si la partie avait commencé. Préserver `started=null` sur les anciennes données sans l'interpréter ; imposer un choix explicite si le résultat est ensuite modifié.
6. **Côté absent d'une victoire administrative :** le présent reçoit les points de victoire et les compensations neutres ; l'absent reçoit les points de défaite configurés, même non nuls, sans score secondaire ni SOS. Aucun adversaire réel n'est ajouté. Si les deux joueurs sont absents, chacun reçoit une défaite administrative et les points de défaite configurés, sans victoire, adversaire ni score secondaire.

## 16. Hors périmètre

- Implémentation du Suisse par équipes.
- Changement de l'ordre de classement individuel validé.
- Refonte générale du bracket ou du mode manuel au-delà des contrôles partagés.
- Migration vers un framework, un serveur ou un stockage en ligne.
- Modification rétroactive des résultats déjà validés.

## 17. Séquence d'implémentation recommandée

1. Synchroniser et vérifier le dépôt officiel, la branche et V1.9.32.
2. Ajouter les fixtures et l'oracle de petits effectifs avant de modifier le moteur.
3. Extraire une interface pure pour classement, contexte d'appariement et validation.
4. Prototyper l'algorithme exact adapté à 64 joueurs et mesurer ses performances.
5. Implémenter la hiérarchie niveaux 1 à 9.
6. Implémenter les règles de bye et le calcul différé des moyennes.
7. Séparer les types de résultats administratifs et migrer les données.
8. Unifier les alertes et améliorer l'éditeur manuel.
9. Tester Suisse, hybride, bracket et manuel, puis les parcours navigateur.
10. Incrémenter la version selon le système existant uniquement lorsque le code fonctionnel est prêt, validé et destiné à une nouvelle publication.
