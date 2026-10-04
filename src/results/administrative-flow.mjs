import {
  isResolvedMatch,
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
  for (let roundIndex = 0; roundIndex < (rounds?.length ?? 0); roundIndex += 1) {
    const round = rounds[roundIndex];
    if (!round || round.validated) continue;
    const matchIndex = (round.matches ?? []).findIndex((match) => matchContainsPlayer(match, playerId));
    if (matchIndex >= 0) return { round, roundIndex, match: round.matches[matchIndex], matchIndex };
  }
  return null;
};

export const analyzeRoundParticipantIntegrity = (round, players = [], {
  requireAllActive = true,
  allowedInactivePlayerIds = [],
} = {}) => {
  const byId = new Map(players.map((player) => [String(player.id), player]));
  const allowedInactive = new Set(allowedInactivePlayerIds.map(String));
  const seen = new Map();
  const forbidden = [];
  for (const [matchIndex, match] of (round?.matches ?? []).entries()) {
    const table = match.table ?? matchIndex + 1;
    const ids = match.p2 == null ? [match.p1] : [match.p1, match.p2];
    if (match.p2 != null && String(match.p1) === String(match.p2)) {
      forbidden.push({ table, code: 'self-match', players: [String(match.p1)] });
    }
    for (const rawId of ids) {
      if (rawId == null) continue;
      const id = String(rawId);
      const player = byId.get(id);
      if (!player) {
        forbidden.push({ table, code: 'unknown-player', players: [id] });
        continue;
      }
      if (seen.has(id)) {
        forbidden.push({ table, code: 'duplicate-player', players: [id] });
      } else {
        seen.set(id, table);
      }
      if (player.status !== 'active' && !allowedInactive.has(id) && !isResolvedMatch(match)) {
        forbidden.push({ table, code: 'inactive-player', players: [id] });
      }
    }
  }
  if (requireAllActive) {
    for (const player of players) {
      const id = String(player.id);
      if (player.status === 'active' && !seen.has(id)) {
        forbidden.push({ table: '—', code: 'missing-player', players: [id] });
      }
    }
  }
  return forbidden;
};

export const analyzeManualRoundBlocks = (round, blocks = [], players = []) => {
  const byId = new Map(players.map((player) => [String(player.id), player]));
  const pairKey = (left, right) => [String(left), String(right)].sort().join('\u0000');
  const blocked = new Set(blocks
    .filter((entry) => (entry?.p1 ?? entry?.a) != null && (entry?.p2 ?? entry?.b) != null)
    .map((entry) => pairKey(entry.p1 ?? entry.a, entry.p2 ?? entry.b)));
  const violations = [];
  for (const [matchIndex, match] of (round?.matches ?? []).entries()) {
    if (match?.bye || match?.p1 == null || match?.p2 == null) continue;
    if (!blocked.has(pairKey(match.p1, match.p2))) continue;
    const leftId = String(match.p1);
    const rightId = String(match.p2);
    violations.push({
      table: match.table ?? matchIndex + 1,
      code: 'manual-block',
      players: [leftId, rightId],
      message: `${byId.get(leftId)?.name ?? leftId} et ${byId.get(rightId)?.name ?? rightId} sont bloqués : cette rencontre est interdite.`,
    });
  }
  return violations;
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
