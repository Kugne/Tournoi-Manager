import assert from 'node:assert/strict';
import test from 'node:test';

import { writeMatchOutcome } from '../src/results/match-outcome.mjs';
import {
  calculatePlayedRoundAverages,
  calculateSwissStandings,
  createRoundScoringMeta,
  finalizeRoundNeutralScores,
} from '../src/results/swiss-scoring.mjs';

const outcome = (match, kind, result, started, administrativeReason = null) => writeMatchOutcome(match, {
  kind, result, started, administrativeReason,
});
const players = (...ids) => ids.map((id) => ({ id, name: id, status: 'active' }));

test('calcule les moyennes réelles de la ronde au centième, scores nuls compris', () => {
  const round = { matches: [
    { ...outcome({ p1: 'A', p2: 'B' }, 'played', 'p1', true), s1: 10, s2: 0, f1: 1, f2: 2 },
    { ...outcome({ p1: 'C', p2: 'D' }, 'forfeit_after_start', 'p2', true, 'forfeit'), s1: 2.345, s2: 4, f1: 3, f2: 4 },
    outcome({ p1: 'E', p2: null }, 'bye', null, false),
  ] };
  assert.deepEqual(calculatePlayedRoundAverages(round, { hasFreeScore: true }), {
    scenario: 4.09,
    free: 2.5,
  });
});

test('bloque une compensation sans score réel puis accepte la valeur manuelle', () => {
  const bye = outcome({ p1: 'A', p2: null }, 'bye', null, false);
  const round = { matches: [bye], scoringMeta: createRoundScoringMeta(['A']) };
  assert.equal(finalizeRoundNeutralScores(round).requiresManual, true);
  const finalized = finalizeRoundNeutralScores(round, { manualValues: { scenario: 0, free: 0 } });
  assert.equal(finalized.requiresManual, false);
  assert.equal(finalized.source, 'manual');
  assert.equal(finalized.round.matches[0].byeScenario, 0);
});

test('persiste exactement la moyenne de ronde sur les résultats neutres', () => {
  const round = {
    scoringMeta: createRoundScoringMeta(['A', 'B', 'C']),
    matches: [
      { ...outcome({ p1: 'A', p2: 'B' }, 'played', 'p1', true), s1: 10.01, s2: 5 },
      outcome({ p1: 'C', p2: null }, 'bye', null, false),
    ],
  };
  const finalized = finalizeRoundNeutralScores(round);
  assert.deepEqual(finalized.values, { scenario: 7.51, free: 0 });
  assert.deepEqual(finalized.round.scoringMeta.neutralScores, {
    status: 'round_average', scenario: 7.51, free: 0,
  });
  assert.equal(finalized.round.matches[1].byeScenario, 7.51);
});

test('sépare points sportifs, ajustements et total et exclut les ajustements du SOS', () => {
  const list = players('A', 'B');
  list[1].penalties = [{ points: 5 }];
  const match = { ...outcome({ p1: 'A', p2: 'B' }, 'played', 'p1', true), s1: 10, s2: 5 };
  const standings = calculateSwissStandings({ players: list, rounds: [{ validated: true, matches: [match] }] });
  const a = standings.find((player) => player.id === 'A');
  const b = standings.find((player) => player.id === 'B');
  assert.deepEqual({ sports: a.sportsPts, total: a.pts, sos: a.sos }, { sports: 3, total: 3, sos: 0 });
  assert.deepEqual({ sports: b.sportsPts, total: b.pts, sos: b.sos }, { sports: 0, total: 5, sos: 3 });
});

test('fait évoluer le SOS virtuel sur la population figée sans bonus ni drop rétroactif', () => {
  const list = players('A', 'B', 'C');
  list[1].status = 'dropped';
  list[1].penalties = [{ points: 9 }];
  const first = {
    validated: true,
    scoringMeta: createRoundScoringMeta(['A', 'B', 'C']),
    matches: [outcome({ p1: 'A', p2: null }, 'bye', null, false)],
  };
  const second = {
    validated: true,
    matches: [{ ...outcome({ p1: 'B', p2: 'C' }, 'played', 'p1', true), s1: 1, s2: 0 }],
  };
  const standings = calculateSwissStandings({ players: list, rounds: [first, second] });
  assert.equal(standings.find((player) => player.id === 'A').sos, 1.5);
});

test('applique la matrice administrative sans créer de faux adversaire', () => {
  const noShow = { ...outcome({ p1: 'A', p2: 'B' }, 'administrative_no_show', 'p1', false, 'absence'), neutralScenario: 7 };
  const double = outcome({ p1: 'C', p2: 'D' }, 'double_forfeit', null, false, 'forfeit');
  const started = { ...outcome({ p1: 'E', p2: 'F' }, 'forfeit_after_start', 'p1', true, 'forfeit'), s1: 8, s2: 3 };
  const round = {
    validated: true,
    scoringMeta: createRoundScoringMeta(['A', 'B', 'C', 'D', 'E', 'F']),
    matches: [noShow, double, started],
  };
  const standings = calculateSwissStandings({
    players: players('A', 'B', 'C', 'D', 'E', 'F'),
    rounds: [round],
    scoring: { win: '3', draw: '1', loss: '1' },
  });
  const byId = Object.fromEntries(standings.map((player) => [player.id, player]));
  assert.deepEqual([byId.A.sportsPts, byId.A.scenario, byId.A.opponents.length], [3, 7, 0]);
  assert.deepEqual([byId.B.sportsPts, byId.B.scenario, byId.B.opponents.length], [1, 0, 0]);
  assert.deepEqual([byId.C.losses, byId.D.losses], [1, 1]);
  assert.deepEqual([byId.C.sportsPts, byId.D.sportsPts], [1, 1]);
  assert.deepEqual([byId.E.opponents, byId.F.opponents], [['F'], ['E']]);
  assert.deepEqual([byId.E.scenario, byId.F.scenario], [8, 3]);
});

test('préserve les anciens byes et victoires forcées sans inventer de population', () => {
  const round = { validated: true, matches: [
    { p1: 'A', p2: null, bye: true, result: 'bye', byeScenario: 6 },
    { p1: 'B', p2: 'C', result: 'p1', bye_forced: true, s1: 4, s2: 1 },
  ] };
  const standings = calculateSwissStandings({ players: players('A', 'B', 'C'), rounds: [round] });
  const byId = Object.fromEntries(standings.map((player) => [player.id, player]));
  assert.deepEqual([byId.A.sportsPts, byId.A.scenario, byId.A.sos], [3, 6, 0]);
  assert.deepEqual([byId.B.opponents, byId.C.opponents], [['C'], ['B']]);
});
