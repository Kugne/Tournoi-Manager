# Préparation du Suisse par équipes — modèle de données et points d'extension

Statut : préparation technique, sans changement de comportement. Les règles
sportives encore ouvertes (bye d'équipe, forfait d'un joueur, forfait d'une
équipe entière, montants exacts) restent à arbitrer avec l'organisateur.

## Format de sauvegarde

- `tournament.participantMode` : `'individual'` (valeur implicite si absente) ou `'teams'`.
- `tournament.teams` : `[{ id, name, status }]`, identifiants uniques.
- `player.teamId` : équipe du joueur.
- `round.encounters` : `[{ id, teamA, teamB, table }]`, `teamB: null` pour un bye d'équipe.
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
