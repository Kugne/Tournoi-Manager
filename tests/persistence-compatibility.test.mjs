import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectPersistedState } from '../src/results/persistence-compatibility.mjs';
import { createHybridSwissSnapshot } from '../src/swiss/hybrid-snapshot.mjs';
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

test('refuse les photographies hybrides et métadonnées neutres corrompues malgré une version connue', () => {
  const brokenSnapshot = state({ p1: 'A', p2: 'B', result: 'p1' });
  brokenSnapshot.tournaments[0].cutStartIndex = 1;
  brokenSnapshot.tournaments[0].swissSnapshot = {
    schemaVersion: 2,
    cutStartIndex: 1,
    standings: [{ playerId: 'A', swissRank: 1 }],
  };
  assert.equal(inspectPersistedState(brokenSnapshot).code, 'invalid-hybrid-snapshot');

  const validSnapshot = state({ p1: 'A', p2: 'B', result: 'p1' });
  validSnapshot.tournaments[0].cutStartIndex = 1;
  validSnapshot.tournaments[0].swissSnapshot = createHybridSwissSnapshot({
    cutStartIndex: 1,
    standings: [
      { id: 'A', pts: 3, sportsPts: 3 },
      { id: 'B', pts: 0, sportsPts: 0 },
    ],
    eligiblePlayerIds: ['A', 'B'],
    qualifiedPlayerIds: ['A'],
  });
  assert.equal(inspectPersistedState(validSnapshot).valid, true);

  const brokenScoring = state({ p1: 'A', p2: null, bye: true }, {
    scoringMeta: {
      scoringVersion: 1,
      virtualOpponentPopulationIds: ['A', 'A'],
      neutralScores: { status: 'manual', scenario: 'invalide', free: 0 },
    },
  });
  assert.equal(inspectPersistedState(brokenScoring).code, 'invalid-scoring-meta');

  validSnapshot.tournaments[0].swissSnapshot.standings[0].pts = null;
  assert.equal(inspectPersistedState(validSnapshot).code, 'invalid-hybrid-snapshot');

  brokenScoring.tournaments[0].roundsData[0].scoringMeta.virtualOpponentPopulationIds = ['A', 'B'];
  brokenScoring.tournaments[0].roundsData[0].scoringMeta.neutralScores = {
    status: 'manual', scenario: null, free: '   ',
  };
  assert.equal(inspectPersistedState(brokenScoring).code, 'invalid-scoring-meta');
});

test('valide strictement les placements persistés du tableau', () => {
  const valid = state({ p1: 'A', p2: 'B', result: 'p1' });
  valid.tournaments[0].bracketPlacements = {
    schemaVersion: 1,
    thirdIds: ['A'],
    fourthIds: ['B'],
    runnerUpIds: [],
    noPodium: false,
    noThirdPlace: false,
    reason: 'opponent_unavailable',
  };
  assert.equal(inspectPersistedState(valid).valid, true);

  const future = structuredClone(valid);
  future.tournaments[0].bracketPlacements.schemaVersion = 2;
  assert.equal(inspectPersistedState(future).code, 'future-bracket-placements-schema');

  const malformed = structuredClone(valid);
  malformed.tournaments[0].bracketPlacements.thirdIds = 'A';
  assert.equal(inspectPersistedState(malformed).code, 'invalid-bracket-placements');

  const unknownPlayer = structuredClone(valid);
  unknownPlayer.tournaments[0].bracketPlacements.thirdIds = ['C'];
  assert.equal(inspectPersistedState(unknownPlayer).code, 'invalid-bracket-placements');

  const overlapping = structuredClone(valid);
  overlapping.tournaments[0].bracketPlacements.runnerUpIds = ['A'];
  assert.equal(inspectPersistedState(overlapping).code, 'invalid-bracket-placements');

  const invalidFlags = structuredClone(valid);
  invalidFlags.tournaments[0].bracketPlacements.noPodium = 'false';
  assert.equal(inspectPersistedState(invalidFlags).code, 'invalid-bracket-placements');

  const invalidReason = structuredClone(valid);
  invalidReason.tournaments[0].bracketPlacements.reason = 3;
  assert.equal(inspectPersistedState(invalidReason).code, 'invalid-bracket-placements');
});
test('refuse une structure incomplète au lieu de la charger partiellement', () => {
  assert.equal(inspectPersistedState({ schemaVersion: 1 }).code, 'invalid-state');
  assert.equal(inspectPersistedState({ schemaVersion: 2, tournaments: [], gameSystems: [] }).code, 'future-state-schema');
});
