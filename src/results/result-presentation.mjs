import { MATCH_OUTCOME_KINDS, readMatchOutcome } from './match-outcome.mjs';

const sideResult = (match, playerId, outcome) => {
  const isP1 = String(match.p1) === String(playerId);
  const won = (outcome.result === 'p1') === isP1;
  return { isP1, won };
};

export const describePlayerOutcome = (match, playerId) => {
  const outcome = readMatchOutcome(match);
  if (outcome.kind === MATCH_OUTCOME_KINDS.BYE) {
    return { result: 'bye', label: 'BYE', opponentIsReal: false };
  }
  if (String(match.p1) !== String(playerId) && String(match.p2) !== String(playerId)) {
    throw new TypeError('Le joueur ne participe pas à ce match');
  }
  if (outcome.kind === MATCH_OUTCOME_KINDS.DOUBLE_FORFEIT) {
    return { result: 'loss', label: 'Double forfait', opponentIsReal: false };
  }
  if (outcome.kind === MATCH_OUTCOME_KINDS.ADMINISTRATIVE_NO_SHOW) {
    const { won } = sideResult(match, playerId, outcome);
    return {
      result: won ? 'win' : 'loss',
      label: won ? 'Victoire administrative · non jouée' : 'Défaite administrative · non jouée',
      opponentIsReal: false,
    };
  }
  if (outcome.kind === MATCH_OUTCOME_KINDS.FORFEIT_AFTER_START) {
    const { won } = sideResult(match, playerId, outcome);
    return {
      result: won ? 'win' : 'loss',
      label: won ? 'Victoire sur abandon après début' : 'Défaite par abandon après début',
      opponentIsReal: true,
    };
  }
  if (outcome.kind === MATCH_OUTCOME_KINDS.LEGACY_FORCED_WIN_UNKNOWN) {
    const { won } = sideResult(match, playerId, outcome);
    return {
      result: won ? 'win' : 'loss',
      label: won
        ? 'Victoire forcée ancienne · début inconnu'
        : 'Défaite forcée ancienne · début inconnu',
      opponentIsReal: true,
    };
  }
  if (outcome.kind === MATCH_OUTCOME_KINDS.PLAYED) {
    const { won } = sideResult(match, playerId, outcome);
    if (outcome.result === 'draw') return { result: 'draw', label: 'Nul', opponentIsReal: true };
    return { result: won ? 'win' : 'loss', label: won ? 'Victoire' : 'Défaite', opponentIsReal: true };
  }
  return { result: null, label: 'En attente', opponentIsReal: true };
};
