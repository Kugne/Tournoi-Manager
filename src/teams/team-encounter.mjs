import { MATCH_OUTCOME_KINDS, readMatchOutcome } from '../results/match-outcome.mjs';

/**
 * Résultat d'une rencontre d'équipes.
 *
 * Une rencontre (`round.encounters`) vaut `{ id, teamA, teamB, table }`, avec
 * `teamB: null` pour un bye d'équipe et, en cas d'équipe entière absente,
 * `teamForfeit: 'teamA' | 'teamB' | 'both'` (l'équipe ou les équipes forfait).
 * Ses parties individuelles restent dans `round.matches`, rattachées par
 * `encounterId`, `p1` appartenant à teamA et `p2` à teamB.
 *
 * Table vide (équipe incomplète) : la partie est enregistrée comme un bye
 * individuel du joueur présent (`p1`, `p2: null`) avec `seatSide` = côté de
 * ce joueur ('teamA' ou 'teamB'). Elle vaut une victoire par forfait pour ce
 * côté, comme le forfait d'un joueur.
 */

export const ENCOUNTER_KINDS = Object.freeze({
  PLAYED: 'played',
  BYE: 'bye',
  TEAM_FORFEIT: 'team_forfeit',
  DOUBLE_TEAM_FORFEIT: 'double_team_forfeit',
});

export const TEAM_FORFEIT_SIDES = Object.freeze(['teamA', 'teamB', 'both']);

/** Ordres de classement du comparatif du 21 septembre 2026. */
export const TEAM_RANKING_ORDERS = Object.freeze({
  matches_first: Object.freeze(['matchPts', 'individualPts', 'buchholz']),
  schedule_first: Object.freeze(['matchPts', 'buchholz', 'individualPts']),
  individual_first: Object.freeze(['individualPts', 'matchPts', 'buchholz']),
});

/**
 * Réglages par défaut, arbitrés le 25 novembre 2026 :
 * - bye d'équipe : victoire de rencontre et 6 points individuels (2V+1D) ;
 * - forfait d'un joueur : la table vaut une victoire individuelle ordinaire
 *   (`playerForfeitPoints: null` = barème individuel de victoire) ;
 * - forfait d'une équipe entière : traité comme un bye pour l'adversaire.
 * Les points individuels des parties suivent `tournament.scoring`.
 */
export const DEFAULT_TEAM_SETTINGS = Object.freeze({
  teamSize: 3,
  matchScoring: Object.freeze({ win: 3, draw: 1, loss: 0 }),
  rankingOrder: 'matches_first',
  byeMatchResult: 'win',
  byeIndividualPoints: 6,
  playerForfeitPoints: null,
  teamForfeitIndividualPoints: 6,
});

const BYE_RESULTS = new Set(['win', 'draw', 'loss']);

const finite = (value, label) => {
  const number = Number(value);
  if (value === null || value === '' || !Number.isFinite(number)) {
    throw new TypeError(`${label} doit être un nombre fini`);
  }
  return Object.is(number, -0) ? 0 : number;
};

const scoringTable = (scoring, label) => ({
  win: finite(scoring?.win, `${label} (victoire)`),
  draw: finite(scoring?.draw, `${label} (nul)`),
  loss: finite(scoring?.loss, `${label} (défaite)`),
});

/** Complète et valide les réglages d'équipe d'un tournoi. */
export const normalizeTeamSettings = ({ teamSettings = {}, scoring = { win: 3, draw: 1, loss: 0 } } = {}) => {
  const base = DEFAULT_TEAM_SETTINGS;
  const pick = (key) => (teamSettings?.[key] === undefined ? base[key] : teamSettings[key]);
  const teamSize = pick('teamSize');
  if (!Number.isInteger(teamSize) || teamSize < 1) throw new TypeError('La taille d’équipe doit être un entier positif');
  const rankingOrder = pick('rankingOrder');
  if (!TEAM_RANKING_ORDERS[rankingOrder]) throw new TypeError(`Ordre de classement inconnu : ${String(rankingOrder)}`);
  const byeMatchResult = pick('byeMatchResult');
  if (!BYE_RESULTS.has(byeMatchResult)) throw new TypeError(`Résultat de bye inconnu : ${String(byeMatchResult)}`);
  const gameScoring = scoringTable(scoring, 'Barème individuel');
  const playerForfeitPoints = pick('playerForfeitPoints');
  return {
    teamSize,
    matchScoring: scoringTable(pick('matchScoring'), 'Barème de rencontre'),
    gameScoring,
    rankingOrder,
    tiebreaks: [...TEAM_RANKING_ORDERS[rankingOrder]],
    byeMatchResult,
    byeIndividualPoints: finite(pick('byeIndividualPoints'), 'Points individuels du bye'),
    playerForfeitPoints: playerForfeitPoints == null
      ? gameScoring.win
      : finite(playerForfeitPoints, 'Points individuels d’un forfait de joueur'),
    teamForfeitIndividualPoints: finite(pick('teamForfeitIndividualPoints'), 'Points individuels d’un forfait d’équipe'),
  };
};

const emptySide = () => ({ wins: 0, draws: 0, losses: 0, individualPts: 0, forfeitWins: 0 });

const isPendingGame = (outcome) => outcome.kind === null
  || (outcome.kind !== MATCH_OUTCOME_KINDS.DOUBLE_FORFEIT && outcome.result === null);

const other = (side) => (side === 'teamA' ? 'teamB' : 'teamA');

/** Parties individuelles d'une rencontre, triées par table. */
export const encounterGames = (round, encounterId) => (round?.matches ?? [])
  .filter((match) => match?.encounterId != null && String(match.encounterId) === String(encounterId))
  .sort((left, right) => (left.board ?? 0) - (right.board ?? 0));

/**
 * Calcule une rencontre. `settings` doit venir de normalizeTeamSettings.
 * Renvoie { status: 'pending' | 'complete', kind, winner ('teamA' | 'teamB' |
 * 'draw' | null), sides: { teamA, teamB }, matchPts, beneficiary }.
 * La victoire d'équipe revient à l'équipe qui gagne le plus de parties.
 */
export const computeEncounterResult = (encounter, games, settings) => {
  if (!encounter || encounter.teamA == null) throw new TypeError('Rencontre d’équipes invalide');
  if (!settings?.tiebreaks) throw new TypeError('Réglages d’équipe normalisés requis');
  const { matchScoring, gameScoring } = settings;
  const sides = { teamA: emptySide(), teamB: emptySide() };

  if (encounter.teamB == null) {
    const result = settings.byeMatchResult;
    sides.teamA.individualPts = settings.byeIndividualPoints;
    return {
      status: 'complete',
      kind: ENCOUNTER_KINDS.BYE,
      winner: result === 'win' ? 'teamA' : result === 'draw' ? 'draw' : 'teamB',
      sides,
      matchPts: { teamA: matchScoring[result], teamB: 0 },
      beneficiary: 'teamA',
    };
  }

  if (encounter.teamForfeit != null) {
    if (!TEAM_FORFEIT_SIDES.includes(encounter.teamForfeit)) throw new TypeError('Forfait d’équipe inconnu');
    if (encounter.teamForfeit === 'both') {
      return {
        status: 'complete', kind: ENCOUNTER_KINDS.DOUBLE_TEAM_FORFEIT, winner: null, sides,
        matchPts: { teamA: matchScoring.loss, teamB: matchScoring.loss }, beneficiary: null,
      };
    }
    const winner = other(encounter.teamForfeit);
    sides[winner].individualPts = settings.teamForfeitIndividualPoints;
    return {
      status: 'complete', kind: ENCOUNTER_KINDS.TEAM_FORFEIT, winner, sides,
      matchPts: { [winner]: matchScoring.win, [encounter.teamForfeit]: matchScoring.loss },
      beneficiary: winner,
    };
  }

  let pending = games.length === 0;
  for (const game of games) {
    const outcome = readMatchOutcome(game);
    if (outcome.kind === MATCH_OUTCOME_KINDS.BYE) {
      if (game.seatSide !== 'teamA' && game.seatSide !== 'teamB') {
        throw new TypeError('Une partie de rencontre ne peut pas être un bye');
      }
      const present = sides[game.seatSide];
      const empty = sides[other(game.seatSide)];
      present.wins += 1;
      present.individualPts += settings.playerForfeitPoints;
      present.forfeitWins += 1;
      empty.losses += 1;
      empty.individualPts += gameScoring.loss;
      continue;
    }
    if (isPendingGame(outcome)) { pending = true; continue; }
    if (outcome.kind === MATCH_OUTCOME_KINDS.DOUBLE_FORFEIT) {
      for (const side of [sides.teamA, sides.teamB]) { side.losses += 1; side.individualPts += gameScoring.loss; }
      continue;
    }
    if (outcome.result === 'draw') {
      for (const side of [sides.teamA, sides.teamB]) { side.draws += 1; side.individualPts += gameScoring.draw; }
      continue;
    }
    const winner = outcome.result === 'p1' ? sides.teamA : sides.teamB;
    const loser = outcome.result === 'p1' ? sides.teamB : sides.teamA;
    const noShow = outcome.kind === MATCH_OUTCOME_KINDS.ADMINISTRATIVE_NO_SHOW;
    winner.wins += 1;
    winner.individualPts += noShow ? settings.playerForfeitPoints : gameScoring.win;
    if (noShow) winner.forfeitWins += 1;
    loser.losses += 1;
    loser.individualPts += gameScoring.loss;
  }
  if (pending) {
    return { status: 'pending', kind: ENCOUNTER_KINDS.PLAYED, winner: null, sides, matchPts: null, beneficiary: null };
  }
  const difference = sides.teamA.wins - sides.teamB.wins;
  const winner = difference > 0 ? 'teamA' : difference < 0 ? 'teamB' : 'draw';
  const matchPts = winner === 'draw'
    ? { teamA: matchScoring.draw, teamB: matchScoring.draw }
    : { [winner]: matchScoring.win, [other(winner)]: matchScoring.loss };
  return { status: 'complete', kind: ENCOUNTER_KINDS.PLAYED, winner, sides, matchPts, beneficiary: null };
};
