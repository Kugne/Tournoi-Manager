# Préparation du Suisse par équipes — modèle de données et points d'extension

Statut : règles arbitrées le 25 novembre 2026 et mises en œuvre dans
`src/teams/` (voir la dernière section).

## Format de sauvegarde

- `tournament.participantMode` : `'individual'` (valeur implicite si absente) ou `'teams'`.
- `tournament.teams` : `[{ id, name, status }]`, identifiants uniques.
- `player.teamId` : équipe du joueur.
- `round.encounters` : `[{ id, teamA, teamB, table, teamForfeit? }]`, `teamB: null` pour un bye d'équipe ;
  `teamForfeit` vaut `'teamA'`, `'teamB'` ou `'both'` quand une équipe entière est absente.
- `tournament.teamSettings` : `{ teamSize, rankingOrder, matchScoring, byeMatchResult,
  byeIndividualPoints, playerForfeitPoints, teamForfeitIndividualPoints }`, complété par
  `normalizeTeamSettings` (valeurs par défaut : 3 joueurs, rencontres d'abord, 3/1/0, bye
  et forfait d'équipe = victoire de rencontre + une partie gagnée par joueur, forfait d'un joueur =
  victoire ordinaire). `byeIndividualPoints` et `teamForfeitIndividualPoints` ne servent plus qu'aux
  rondes enregistrées avant le 26 novembre 2026, sans parties pour le bye ou le forfait.
- Bye d'équipe : chaque joueur actif de l'équipe exempte reçoit une partie bye
  `{ p1, p2: null, seatSide: 'teamA', teamBye: true, encounterId }` rattachée à la rencontre de bye.
- Forfait d'équipe : les parties enregistrées ne sont pas modifiées ; `teamIndividualRounds` les lit
  comme des victoires administratives (ou doubles forfaits), pour le classement individuel comme pour
  celui des équipes.
- `team.status` : `'active'` ou `'dropped'` (équipe retirée des prochaines rondes) ;
  `team.penalties` facultatif, appliqué aux points de rencontre.
- Les parties individuelles restent dans `round.matches`, au format actuel
  (résultats explicites, forfaits, scores), avec en plus `encounterId` et `board`.
  Saisie des résultats, forfaits et calculs individuels sont donc réutilisés tels quels.

Version de sauvegarde (`src/results/persistence-compatibility.mjs`) :

- une sauvegarde sans tournoi par équipes reste en **version 1**, lisible par la V2 publiée ;
- dès qu'un tournoi par équipes existe, `requiredStateSchemaVersion` donne la **version 2**,
  que la V2 publiée refuse proprement au lieu de l'ouvrir comme un tournoi individuel ;
- `inspectPersistedState(data, { supportsTeams: true })` valide la structure équipes.
  L'application passera `supportsTeams: true` (et écrira `requiredStateSchemaVersion(S)`)
  seulement quand l'interface équipes existera.

## Points d'extension déjà en place

| Besoin équipes | Module réutilisable |
| --- | --- |
| Classement : points de rencontre, puis points individuels, puis Buchholz équipe | `rankStandings(lignes, { tiebreaks: ['matchPts', 'individualPts', 'buchholz'], statusPriority: null })` dans `src/results/standings-ranking.mjs` |
| Buchholz équipe, adversaire virtuel du bye compris | `calculateBuchholz({ entries, virtualOpponents })` dans `src/results/buchholz.mjs` |
| Appariement des équipes (bye, historique, blocages, solveur exact) | `buildSwissEngineInput({ ..., view })` avec une vue `{ participants: équipes, rounds: rencontres, blocks, options }` dans `src/swiss/application-adapter.mjs` |
| Non-régression du classement individuel | `tests/standings-characterization.test.mjs` (références capturées sur la V2) |

Une vue par équipes expose chaque rencontre d'une ronde comme un « match »
`{ p1: teamA, p2: teamB }` (ou `{ p1: teamA, p2: null, bye: true }`), et fixe
`options` à faux pour les critères propres aux joueurs (miroirs, allégeances, compo, note).

## Règles mises en œuvre (25 novembre 2026)

| Situation | Rencontre | Points individuels | Buchholz |
| --- | --- | --- | --- |
| Rencontre jouée | Plus de parties gagnées que l'adversaire = victoire, autant = nul | Somme du barème individuel de chaque partie | Points de rencontre sportifs de l'adversaire |
| Forfait d'un joueur (`administrative_no_show`) | La table compte comme une victoire de l'adversaire | Victoire ordinaire (`playerForfeitPoints`) | Inchangé |
| Bye d'équipe | Victoire (`byeMatchResult`) | 6 (`byeIndividualPoints`) | Adversaire virtuel : moyenne des équipes de la ronde |
| Forfait d'une équipe entière | Victoire pour l'adversaire, défaite pour l'équipe forfait | 6 pour l'adversaire, 0 pour l'équipe forfait | Adversaire virtuel pour le bénéficiaire ; la rencontre ne compte pas comme confrontation |
| Double forfait d'équipe | Défaite pour les deux | 0 | Aucun adversaire |

Ordres de classement (`rankingOrder`) : `matches_first` (défaut), `schedule_first`,
`individual_first`. Le premier critère sert aussi de score de groupe pour l'appariement.

Modules : `team-encounter.mjs` (réglages et résultat de rencontre), `team-standings.mjs`
(classement), `team-swiss.mjs` (vue Suisse des équipes, appariement par le solveur exact,
composition des tables, forfait d'équipe).
