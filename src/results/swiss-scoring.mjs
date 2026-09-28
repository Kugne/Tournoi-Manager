import {
  hasRealOpponent,
  MATCH_OUTCOME_KINDS,
  readMatchOutcome,
} from './match-outcome.mjs';

export const ROUND_SCORING_VERSION = 1;

const roundToHundredth = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const numberOrZero = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const createRoundScoringMeta = (playerIds) => ({
  scoringVersion: ROUND_SCORING_VERSION,
  virtualOpponentPopulationIds: [...new Set((playerIds ?? []).map(String))],
  neutralScores: { status: 'pending', scenario: null, free: null },
});

export const calculatePlayedRoundAverages = (round, { hasFreeScore = false } = {}) => {
  const values = [];
  for (const match of round?.matches ?? []) {
    const outcome = readMatchOutcome(match);
    if (outcome.kind !== MATCH_OUTCOME_KINDS.PLAYED
      && outcome.kind !== MATCH_OUTCOME_KINDS.FORFEIT_AFTER_START) continue;
    values.push({ scenario: numberOrZero(match.s1), free: numberOrZero(match.f1) });
    values.push({ scenario: numberOrZero(match.s2), free: numberOrZero(match.f2) });
  }
  if (!values.length) return null;
  return {
    scenario: roundToHundredth(values.reduce((sum, value) => sum + value.scenario, 0) / values.length),
    free: hasFreeScore
      ? roundToHundredth(values.reduce((sum, value) => sum + value.free, 0) / values.length)
      : 0,
  };
};

const appliesNeutralScore = (match) => {
  const outcome = readMatchOutcome(match);
  return outcome.kind === MATCH_OUTCOME_KINDS.BYE
    || outcome.kind === MATCH_OUTCOME_KINDS.ADMINISTRATIVE_NO_SHOW;
};

export const finalizeRoundNeutralScores = (round, {
  hasFreeScore = false,
  manualValues = null,
} = {}) => {
  if (!round || typeof round !== 'object') throw new TypeError('Ronde requise');
  const needsNeutralScore = (round.matches ?? []).some(appliesNeutralScore);
  if (!needsNeutralScore) return { round, requiresManual: false, values: null };

  const average = calculatePlayedRoundAverages(round, { hasFreeScore });
  if (!average && !manualValues) return { round, requiresManual: true, values: null };
  const values = average ?? {
    scenario: roundToHundredth(numberOrZero(manualValues.scenario)),
    free: hasFreeScore ? roundToHundredth(numberOrZero(manualValues.free)) : 0,
  };
  const source = average ? 'round_average' : 'manual';
  const nextRound = {
    ...round,
    scoringMeta: {
      ...(round.scoringMeta ?? {}),
      scoringVersion: ROUND_SCORING_VERSION,
      neutralScores: { status: source, ...values },
    },
    matches: (round.matches ?? []).map((match) => {
      if (!appliesNeutralScore(match)) return match;
      const next = { ...match, neutralScenario: values.scenario, neutralFree: values.free };
      if (readMatchOutcome(match).kind === MATCH_OUTCOME_KINDS.BYE) {
        next.byeScenario = values.scenario;
        next.byeFree = values.free;
      }
      return next;
    }),
  };
  return { round: nextRound, requiresManual: false, values, source };
};

const applyResult = (left, right, result, scoring) => {
  if (result === 'p1') {
    left.sportsPts += scoring.win; left.wins += 1;
    right.sportsPts += scoring.loss; right.losses += 1;
  } else if (result === 'p2') {
    right.sportsPts += scoring.win; right.wins += 1;
    left.sportsPts += scoring.loss; left.losses += 1;
  } else if (result === 'draw') {
    left.sportsPts += scoring.draw; left.draws += 1;
    right.sportsPts += scoring.draw; right.draws += 1;
  }
};

const neutralWinnerId = (match, outcome) => {
  if (outcome.kind === MATCH_OUTCOME_KINDS.BYE) return match.p1;
  if (outcome.kind !== MATCH_OUTCOME_KINDS.ADMINISTRATIVE_NO_SHOW) return null;
  return outcome.result === 'p1' ? match.p1 : match.p2;
};

export const calculateSwissStandings = ({
  players = [],
  rounds = [],
  scoring = { win: 3, draw: 1, loss: 0 },
  hasFreeScore = false,
  normalizeStatus = (status) => status,
} = {}) => {
  const scoreValues = {
    win: numberOrZero(scoring.win),
    draw: numberOrZero(scoring.draw),
    loss: numberOrZero(scoring.loss),
  };
  const standings = players.map((player) => ({
    id: player.id,
    name: player.name,
    faction: player.faction,
    status: normalizeStatus(player.status),
    compo: player.compo != null ? Number.parseInt(player.compo, 10) || 0 : null,
    pts: 0,
    sportsPts: 0,
    scenario: 0,
    free: 0,
    sos: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    opponents: [],
    bonusMalus: 0,
  }));
  const byId = Object.fromEntries(standings.map((player) => [String(player.id), player]));
  const virtualOpponents = [];

  for (const round of rounds) {
    if (!round?.validated) continue;
    for (const match of round.matches ?? []) {
      const p1 = byId[String(match.p1)];
      const p2 = match.p2 == null ? null : byId[String(match.p2)];
      if (!p1) continue;
      const outcome = readMatchOutcome(match);

      if (outcome.kind === MATCH_OUTCOME_KINDS.BYE) {
        p1.sportsPts += scoreValues.win; p1.wins += 1;
      } else if (outcome.kind === MATCH_OUTCOME_KINDS.ADMINISTRATIVE_NO_SHOW && p2) {
        applyResult(p1, p2, outcome.result, scoreValues);
      } else if (outcome.kind === MATCH_OUTCOME_KINDS.DOUBLE_FORFEIT && p2) {
        p1.sportsPts += scoreValues.loss; p1.losses += 1;
        p2.sportsPts += scoreValues.loss; p2.losses += 1;
      } else if (p2 && outcome.result && hasRealOpponent(match)) {
        applyResult(p1, p2, outcome.result, scoreValues);
        p1.opponents.push(p2.id); p2.opponents.push(p1.id);
      } else {
        continue;
      }

      if (outcome.kind === MATCH_OUTCOME_KINDS.BYE) {
        p1.scenario += numberOrZero(match.neutralScenario ?? match.byeScenario);
        if (hasFreeScore) p1.free += numberOrZero(match.neutralFree ?? match.byeFree);
      } else if (outcome.kind === MATCH_OUTCOME_KINDS.ADMINISTRATIVE_NO_SHOW) {
        const winner = byId[String(neutralWinnerId(match, outcome))];
        if (winner) {
          winner.scenario += numberOrZero(match.neutralScenario);
          if (hasFreeScore) winner.free += numberOrZero(match.neutralFree);
        }
      } else if (outcome.kind !== MATCH_OUTCOME_KINDS.DOUBLE_FORFEIT && p2) {
        p1.scenario += numberOrZero(match.s1); p2.scenario += numberOrZero(match.s2);
        if (hasFreeScore) {
          p1.free += numberOrZero(match.f1); p2.free += numberOrZero(match.f2);
        }
      }

      const beneficiaryId = neutralWinnerId(match, outcome);
      const population = round.scoringMeta?.scoringVersion === ROUND_SCORING_VERSION
        ? round.scoringMeta.virtualOpponentPopulationIds
        : null;
      if (beneficiaryId != null && Array.isArray(population)) {
        virtualOpponents.push({ beneficiaryId: String(beneficiaryId), populationIds: population.map(String) });
      }
    }
  }

  for (const player of standings) {
    player.sos = player.opponents.reduce((sum, opponentId) => sum + (byId[String(opponentId)]?.sportsPts ?? 0), 0);
  }
  for (const virtual of virtualOpponents) {
    const population = [...new Set(virtual.populationIds)]
      .filter((id) => id !== virtual.beneficiaryId && byId[id]);
    if (!population.length || !byId[virtual.beneficiaryId]) continue;
    const average = population.reduce((sum, id) => sum + byId[id].sportsPts, 0) / population.length;
    byId[virtual.beneficiaryId].sos += roundToHundredth(average);
  }
  for (const player of standings) {
    const source = players.find((candidate) => String(candidate.id) === String(player.id));
    const adjustment = (source?.penalties ?? []).reduce((sum, item) => sum + numberOrZero(item.points), 0);
    player.bonusMalus = adjustment;
    player.pts = player.sportsPts + adjustment;
  }
  return standings;
};
