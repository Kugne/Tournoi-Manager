export const MATCH_OUTCOME_VERSION = 1;

export const MATCH_OUTCOME_KINDS = Object.freeze({
  PLAYED: 'played',
  BYE: 'bye',
  ADMINISTRATIVE_NO_SHOW: 'administrative_no_show',
  FORFEIT_AFTER_START: 'forfeit_after_start',
  DOUBLE_FORFEIT: 'double_forfeit',
  LEGACY_FORCED_WIN_UNKNOWN: 'legacy_forced_win_unknown',
});

const SIDE_RESULTS = new Set(['p1', 'p2']);
const PLAYED_RESULTS = new Set(['p1', 'p2', 'draw']);
const ADMINISTRATIVE_REASONS = new Set(['absence', 'forfeit', 'drop']);

const hasId = (value) => value !== null && value !== undefined && String(value) !== '';

const normalizedReason = (reason) => (reason == null ? null : String(reason));

const assertParticipants = (match, { bye = false } = {}) => {
  if (!match || typeof match !== 'object' || !hasId(match.p1)) {
    throw new TypeError('Le premier participant du match est requis');
  }
  if (bye) {
    if (match.p2 != null) throw new TypeError('Un bye ne peut pas avoir de second participant');
    return;
  }
  if (!hasId(match.p2)) throw new TypeError('Le second participant du match est requis');
  if (String(match.p1) === String(match.p2)) throw new TypeError('Un participant ne peut pas s’affronter lui-même');
};

const normalizeExplicitOutcome = (outcome) => ({
  outcomeVersion: outcome?.outcomeVersion ?? MATCH_OUTCOME_VERSION,
  kind: outcome?.kind ?? null,
  result: outcome?.result ?? null,
  started: outcome?.started ?? null,
  administrativeReason: normalizedReason(outcome?.administrativeReason),
});

export const assertExplicitMatchOutcome = (match, outcome = match) => {
  const normalized = normalizeExplicitOutcome(outcome);
  if (normalized.outcomeVersion !== MATCH_OUTCOME_VERSION) {
    throw new TypeError(`Version de résultat de match non prise en charge : ${normalized.outcomeVersion}`);
  }

  const { kind, result, started, administrativeReason } = normalized;
  if (kind === null) {
    assertParticipants(match);
    if (result !== null || started !== null || administrativeReason !== null) {
      throw new TypeError('Un match en attente ne peut pas contenir de résultat explicite');
    }
  } else if (kind === MATCH_OUTCOME_KINDS.PLAYED) {
    assertParticipants(match);
    if (!PLAYED_RESULTS.has(result) || started !== true || administrativeReason !== null) {
      throw new TypeError('Un match joué exige un résultat sportif et started=true');
    }
  } else if (kind === MATCH_OUTCOME_KINDS.BYE) {
    assertParticipants(match, { bye: true });
    if (result !== null || started !== false || administrativeReason !== null) {
      throw new TypeError('Un bye exige result=null et started=false');
    }
  } else if (kind === MATCH_OUTCOME_KINDS.ADMINISTRATIVE_NO_SHOW) {
    assertParticipants(match);
    if (!SIDE_RESULTS.has(result) || started !== false || !ADMINISTRATIVE_REASONS.has(administrativeReason)) {
      throw new TypeError('Une victoire administrative non jouée exige un vainqueur, started=false et un motif');
    }
  } else if (kind === MATCH_OUTCOME_KINDS.FORFEIT_AFTER_START) {
    assertParticipants(match);
    if (!SIDE_RESULTS.has(result) || started !== true || !ADMINISTRATIVE_REASONS.has(administrativeReason)) {
      throw new TypeError('Un abandon après le début exige un vainqueur, started=true et un motif');
    }
  } else if (kind === MATCH_OUTCOME_KINDS.DOUBLE_FORFEIT) {
    assertParticipants(match);
    if (result !== null || started !== false || !ADMINISTRATIVE_REASONS.has(administrativeReason)) {
      throw new TypeError('Un double forfait exige result=null, started=false et un motif');
    }
  } else if (kind === MATCH_OUTCOME_KINDS.LEGACY_FORCED_WIN_UNKNOWN) {
    assertParticipants(match);
    if (!SIDE_RESULTS.has(result) || started !== null || administrativeReason !== 'unknown') {
      throw new TypeError('Une ancienne victoire forcée exige un vainqueur et conserve started=null');
    }
  } else {
    throw new TypeError(`Type de résultat de match inconnu : ${String(kind)}`);
  }
  return normalized;
};

export const writeMatchOutcome = (match, outcome) => {
  const normalized = assertExplicitMatchOutcome(match, outcome);
  const next = { ...match, ...normalized };
  delete next.bye_forced;
  if (normalized.kind === MATCH_OUTCOME_KINDS.BYE) next.bye = true;
  else delete next.bye;
  if (normalized.administrativeReason === null) delete next.administrativeReason;
  return next;
};

const legacyOutcome = (match) => {
  if (match?.bye === true || match?.result === 'bye') {
    return {
      outcomeVersion: MATCH_OUTCOME_VERSION,
      kind: MATCH_OUTCOME_KINDS.BYE,
      result: null,
      started: false,
      administrativeReason: null,
      source: 'legacy',
    };
  }
  if (match?.bye_forced === true) {
    return {
      outcomeVersion: MATCH_OUTCOME_VERSION,
      kind: MATCH_OUTCOME_KINDS.LEGACY_FORCED_WIN_UNKNOWN,
      result: SIDE_RESULTS.has(match.result) ? match.result : null,
      started: null,
      administrativeReason: 'unknown',
      source: 'legacy',
    };
  }
  if (PLAYED_RESULTS.has(match?.result)) {
    return {
      outcomeVersion: MATCH_OUTCOME_VERSION,
      kind: MATCH_OUTCOME_KINDS.PLAYED,
      result: match.result,
      started: null,
      administrativeReason: null,
      source: 'legacy',
    };
  }
  return {
    outcomeVersion: MATCH_OUTCOME_VERSION,
    kind: null,
    result: null,
    started: null,
    administrativeReason: null,
    source: 'legacy',
  };
};

export const readMatchOutcome = (match) => {
  if (!match || typeof match !== 'object') throw new TypeError('Match requis');
  if (match.outcomeVersion == null) return legacyOutcome(match);
  return { ...assertExplicitMatchOutcome(match), source: 'explicit' };
};

export const isResolvedMatch = (match) => {
  const outcome = readMatchOutcome(match);
  return outcome.kind === MATCH_OUTCOME_KINDS.BYE
    || outcome.kind === MATCH_OUTCOME_KINDS.DOUBLE_FORFEIT
    || outcome.result !== null;
};

export const hasRealOpponent = (match) => {
  const { kind } = readMatchOutcome(match);
  return kind === MATCH_OUTCOME_KINDS.PLAYED
    || kind === MATCH_OUTCOME_KINDS.FORFEIT_AFTER_START
    || kind === MATCH_OUTCOME_KINDS.LEGACY_FORCED_WIN_UNKNOWN;
};

export const consumesSwissBye = (match) => readMatchOutcome(match).kind === MATCH_OUTCOME_KINDS.BYE;
