import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectPersistedState } from '../src/results/persistence-compatibility.mjs';
import { writeMatchOutcome } from '../src/results/match-outcome.mjs';

const state = (match, extraRound = {}) => ({
  schemaVersion: 1,
  gameSystems: [],
  tournaments: [{
    id: 'T',
    players: [{ id: 'A' }, { id: 'B' }],
    roundsData: [{ matches: [match], ...extraRound }],
  }],
});

test('accepte sans mutation les résultats historiques V1.9.32 et les résultats explicites courants', () => {
  const legacy = state({ p1: 'A', p2: 'B', result: 'p1', bye_forced: true });
  const serialized = JSON.stringify(legacy);
  assert.equal(inspectPersistedState(legacy).valid, true);
  assert.equal(JSON.stringify(legacy), serialized);

  const current = state(writeMatchOutcome({ p1: 'A', p2: 'B' }, {
    kind: 'forfeit_after_start', result: 'p1', started: true, administrativeReason: 'drop',
  }), {
    scoringMeta: {
      scoringVersion: 1,
      virtualOpponentPopulationIds: ['A', 'B'],
      neutralScores: { status: 'pending', scenario: null, free: null },
    },
  });
  assert.equal(inspectPersistedState(current).valid, true);
});

test('refuse les versions futures imbriquées avant import ou restauration', () => {
  const futureOutcome = state({
    p1: 'A', p2: 'B', outcomeVersion: 9, kind: null, result: null, started: null,
  });
  assert.equal(inspectPersistedState(futureOutcome).code, 'invalid-match-outcome');

  const futureScoring = state({ p1: 'A', p2: null, bye: true }, {
    scoringMeta: { scoringVersion: 9 },
  });
  assert.equal(inspectPersistedState(futureScoring).code, 'future-scoring-schema');

  const futureSnapshot = state({ p1: 'A', p2: 'B', result: 'p1' });
  futureSnapshot.tournaments[0].swissSnapshot = { schemaVersion: 99 };
  assert.equal(inspectPersistedState(futureSnapshot).code, 'future-hybrid-schema');
});

test('refuse une structure incomplète au lieu de la charger partiellement', () => {
  assert.equal(inspectPersistedState({ schemaVersion: 1 }).code, 'invalid-state');
  assert.equal(inspectPersistedState({ schemaVersion: 2, tournaments: [], gameSystems: [] }).code, 'future-state-schema');
});
