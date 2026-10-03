import { MATCH_OUTCOME_KINDS, readMatchOutcome } from '../results/match-outcome.mjs';

export const PAIRING_DRAFT_VERSION = 1;

export class PairingDraftError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PairingDraftError';
    this.code = code;
    this.details = details;
  }
}

const cloneValue = (value) => {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
};

const cloneMatches = (matches) => matches.map((match) => cloneValue(match));
const stableId = (value) => (value == null ? null : String(value));

const fail = (code, message, details) => {
  throw new PairingDraftError(code, message, details);
};

const positionsFor = (matches) => {
  if (!Array.isArray(matches)) fail('INVALID_MATCHES', 'Les appariements doivent être un tableau');
  const positions = [];
  const seen = new Map();
  matches.forEach((match, matchIndex) => {
    if (!match || typeof match !== 'object') {
      fail('INVALID_MATCH', `La table ${matchIndex + 1} est invalide`, { matchIndex });
    }
    const sides = match.bye ? ['p1'] : ['p1', 'p2'];
    if (match.bye && match.p2 != null) {
      fail('INVALID_BYE', 'Un bye ne peut pas contenir de second joueur', { matchIndex });
    }
    sides.forEach((side) => {
      const rawPlayerId = match[side];
      const playerId = stableId(rawPlayerId);
      if (playerId == null || playerId === '') {
        fail('MISSING_PLAYER', `La table ${match.table ?? matchIndex + 1} est incomplète`, {
          matchIndex,
          side,
        });
      }
      if (seen.has(playerId)) {
        fail('DUPLICATE_PLAYER', `Le joueur ${playerId} apparaît plusieurs fois`, {
          playerId,
          positions: [seen.get(playerId), { matchIndex, side }],
        });
      }
      const position = {
        playerId,
        rawPlayerId,
        matchIndex,
        side,
        table: match.table ?? matchIndex + 1,
        bye: Boolean(match.bye),
      };
      seen.set(playerId, position);
      positions.push(position);
    });
  });
  return positions;
};

const assertDraft = (draft) => {
  if (!draft || draft.draftVersion !== PAIRING_DRAFT_VERSION
    || !Array.isArray(draft.originalMatches) || !Array.isArray(draft.matches)
    || !Array.isArray(draft.history)) {
    fail('INVALID_DRAFT', 'Le brouillon d’appariements est invalide');
  }
  if (draft.originalMatches.length !== draft.matches.length) {
    fail('INVALID_DRAFT', 'Le brouillon ne contient plus le même nombre de tables');
  }
  positionsFor(draft.originalMatches);
  positionsFor(draft.matches);
  return draft;
};

const participantsChanged = (before, after) => (
  stableId(before?.p1) !== stableId(after?.p1)
  || stableId(before?.p2) !== stableId(after?.p2)
  || Boolean(before?.bye) !== Boolean(after?.bye)
);

export const matchHasRecordedData = (match) => {
  const outcome = readMatchOutcome(match);
  if (outcome.kind !== null && outcome.kind !== MATCH_OUTCOME_KINDS.BYE) return true;
  if (match?.secondaryScoresConfirmed === true) return true;
  return ['s1', 's2', 'f1', 'f2'].some((field) => {
    const value = match?.[field];
    return value != null && (Number.isNaN(Number(value)) || Number(value) !== 0);
  });
};

export const createPairingDraft = (matches) => {
  positionsFor(matches);
  return {
    draftVersion: PAIRING_DRAFT_VERSION,
    originalMatches: cloneMatches(matches),
    matches: cloneMatches(matches),
    history: [],
  };
};

export const listPairingDraftPositions = (draft) => positionsFor(assertDraft(draft).matches)
  .map((position) => ({ ...position }));

export const getPairingDraftPosition = (draft, playerId) => {
  const wanted = stableId(playerId);
  const position = listPairingDraftPositions(draft).find((item) => item.playerId === wanted);
  if (!position) fail('UNKNOWN_PLAYER', `Le joueur ${wanted ?? 'inconnu'} n’est pas placé`, { playerId });
  return position;
};

export const previewPairingExchange = (draft, firstPlayerId, secondPlayerId) => {
  assertDraft(draft);
  const first = getPairingDraftPosition(draft, firstPlayerId);
  const second = getPairingDraftPosition(draft, secondPlayerId);
  if (first.playerId === second.playerId) {
    fail('SAME_POSITION', 'Un joueur ne peut pas être échangé avec lui-même', {
      playerId: first.playerId,
    });
  }
  const matches = cloneMatches(draft.matches);
  matches[first.matchIndex][first.side] = second.rawPlayerId;
  matches[second.matchIndex][second.side] = first.rawPlayerId;
  positionsFor(matches);
  const affectedMatchIndexes = [...new Set([first.matchIndex, second.matchIndex])].sort((a, b) => a - b);
  return {
    matches,
    exchange: {
      firstPlayerId: first.playerId,
      secondPlayerId: second.playerId,
      firstPosition: first,
      secondPosition: second,
    },
    affectedMatchIndexes,
    affectedTables: affectedMatchIndexes.map((index) => matches[index].table ?? index + 1),
    affectedResultMatchIndexes: affectedMatchIndexes.filter((index) => matchHasRecordedData(draft.matches[index])),
  };
};

export const applyPairingExchange = (draft, firstPlayerId, secondPlayerId) => {
  const preview = previewPairingExchange(draft, firstPlayerId, secondPlayerId);
  return {
    draftVersion: PAIRING_DRAFT_VERSION,
    originalMatches: cloneMatches(draft.originalMatches),
    matches: preview.matches,
    history: draft.history.map(cloneValue).concat([{
      matches: cloneMatches(draft.matches),
      exchange: cloneValue(preview.exchange),
      affectedMatchIndexes: [...preview.affectedMatchIndexes],
      affectedResultMatchIndexes: [...preview.affectedResultMatchIndexes],
    }]),
  };
};

export const undoPairingExchange = (draft) => {
  assertDraft(draft);
  if (draft.history.length === 0) {
    return {
      draftVersion: PAIRING_DRAFT_VERSION,
      originalMatches: cloneMatches(draft.originalMatches),
      matches: cloneMatches(draft.matches),
      history: [],
    };
  }
  const previous = draft.history[draft.history.length - 1];
  return {
    draftVersion: PAIRING_DRAFT_VERSION,
    originalMatches: cloneMatches(draft.originalMatches),
    matches: cloneMatches(previous.matches),
    history: draft.history.slice(0, -1).map(cloneValue),
  };
};

export const resetPairingDraft = (draft) => {
  assertDraft(draft);
  return {
    draftVersion: PAIRING_DRAFT_VERSION,
    originalMatches: cloneMatches(draft.originalMatches),
    matches: cloneMatches(draft.originalMatches),
    history: [],
  };
};

export const summarizePairingDraft = (draft) => {
  assertDraft(draft);
  const modifiedMatchIndexes = draft.matches
    .map((match, index) => (participantsChanged(draft.originalMatches[index], match) ? index : null))
    .filter((index) => index !== null);
  return {
    exchangeCount: draft.history.length,
    modifiedMatchIndexes,
    modifiedTables: modifiedMatchIndexes.map((index) => draft.matches[index].table ?? index + 1),
    affectedResultMatchIndexes: modifiedMatchIndexes
      .filter((index) => matchHasRecordedData(draft.originalMatches[index])),
  };
};

export const pairingDraftMatches = (draft) => cloneMatches(assertDraft(draft).matches);
