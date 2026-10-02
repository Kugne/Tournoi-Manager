import {
  MATCH_OUTCOME_KINDS,
  readMatchOutcome,
  writeMatchOutcome,
} from './match-outcome.mjs';

export const ADMINISTRATIVE_FLOW_VERSION = 1;
export const ADMINISTRATIVE_REASONS = Object.freeze(['absence', 'forfeit', 'drop']);

const assertReason = (reason) => {
  if (!ADMINISTRATIVE_REASONS.includes(reason)) {
    throw new TypeError(`Motif administratif inconnu : ${String(reason)}`);
  }
};

export const matchContainsPlayer = (match, playerId) => (
  String(match?.p1) === String(playerId) || String(match?.p2) === String(playerId)
);

export const findOpenRoundMatch = (rounds, playerId) => {
  for (let roundIndex = (rounds?.length ?? 0) - 1; roundIndex >= 0; roundIndex -= 1) {
    const round = rounds[roundIndex];
    if (!round || round.validated) continue;
    const matchIndex = (round.matches ?? []).findIndex((match) => matchContainsPlayer(match, playerId));
    if (matchIndex >= 0) return { round, roundIndex, match: round.matches[matchIndex], matchIndex };
  }
  return null;
};

export const roundHasEnteredResults = (round) => (round?.matches ?? []).some((match) => {
  const outcome = readMatchOutcome(match);
  if (outcome.kind !== null && outcome.kind !== MATCH_OUTCOME_KINDS.BYE) return true;
  return ['s1', 's2', 'f1', 'f2'].some((field) => Number(match[field] ?? 0) !== 0);
});

export const resolveAdministrativeMatch = (match, {
  unavailablePlayerId,
  reason,
  started,
  otherUnavailable = false,
  secondaryScoresConfirmed = false,
} = {}) => {
  if (!match || typeof match !== 'object') throw new TypeError('Match requis');
  if (!matchContainsPlayer(match, unavailablePlayerId)) {
    throw new TypeError('Le joueur indisponible ne participe pas à ce match');
  }
  if (readMatchOutcome(match).kind === MATCH_OUTCOME_KINDS.BYE) {
    throw new TypeError('Un bye doit être retiré ou recalculé, pas converti en forfait');
  }
  assertReason(reason);
  if (typeof started !== 'boolean') throw new TypeError('Le début de partie doit être confirmé');

  if (otherUnavailable) {
    if (started) throw new TypeError('Un double abandon après le début nécessite une décision d’arbitrage');
    return writeMatchOutcome(match, {
      kind: MATCH_OUTCOME_KINDS.DOUBLE_FORFEIT,
      result: null,
      started: false,
      administrativeReason: reason,
    });
  }

  const unavailableIsP1 = String(match.p1) === String(unavailablePlayerId);
  const result = unavailableIsP1 ? 'p2' : 'p1';
  if (!started) {
    return writeMatchOutcome(match, {
      kind: MATCH_OUTCOME_KINDS.ADMINISTRATIVE_NO_SHOW,
      result,
      started: false,
      administrativeReason: reason,
    });
  }
  if (!secondaryScoresConfirmed) {
    throw new TypeError('Les scores secondaires doivent être confirmés après le début de la partie');
  }
  return {
    ...writeMatchOutcome(match, {
      kind: MATCH_OUTCOME_KINDS.FORFEIT_AFTER_START,
      result,
      started: true,
      administrativeReason: reason,
    }),
    secondaryScoresConfirmed: true,
  };
};
