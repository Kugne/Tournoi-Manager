import assert from 'node:assert/strict';
import test from 'node:test';

import { runInitialSwissPairing, swissInputFingerprint } from '../src/swiss/application-runner.mjs';
import { solveSwissPairing } from '../src/swiss/solve-swiss.mjs';

const source = () => ({
  players: ['A', 'B', 'C', 'D'].map((id) => ({ id, status: 'active', faction: id, compo: null })),
  roundsData: [],
  blocks: [{ p1: 'A', p2: 'B' }],
  compoPairing: false,
  secondaryCriteria: {},
});
const standings = () => ['A', 'B', 'C', 'D'].map((id, index) => ({ id, pts: 3 - index }));

const successfulExecutor = {
  async run({ participants, context }) {
    return { status: 'success', result: solveSwissPairing(participants, context), durationMs: 1 };
  },
};

test('applique atomiquement un résultat complet au format historique', async () => {
  const tournament = source();
  const before = structuredClone(tournament);
  const result = await runInitialSwissPairing({
    tournament,
    roundIndex: 0,
    standings: standings(),
    executor: successfulExecutor,
  });
  assert.equal(result.status, 'success');
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches.some((match) => new Set([match.p1, match.p2]).has('A')
    && new Set([match.p1, match.p2]).has('B')), false);
  assert.deepEqual(tournament, before);
});

test('un timeout ou une erreur ne produit aucun match dégradé', async () => {
  for (const status of ['timeout', 'error', 'cancelled']) {
    const result = await runInitialSwissPairing({
      tournament: source(),
      roundIndex: 0,
      standings: standings(),
      executor: { run: async () => ({ status, result: null }) },
    });
    assert.equal(result.status, status);
    assert.equal(result.matches, null);
  }
});

test('un tournoi modifié pendant le calcul invalide le résultat', async () => {
  const result = await runInitialSwissPairing({
    tournament: source(),
    roundIndex: 0,
    standings: standings(),
    executor: successfulExecutor,
    isCurrent: () => false,
  });
  assert.equal(result.status, 'stale');
  assert.equal(result.matches, null);
  assert.match(result.error.message, /changé/);
});

test('l’empreinte est stable malgré l’ordre des clés', () => {
  const left = { participants: [{ id: 'A', points: 1 }], context: { options: { useCompo: false } }, byePlayerId: null };
  const right = { byePlayerId: null, context: { options: { useCompo: false } }, participants: [{ points: 1, id: 'A' }] };
  assert.equal(swissInputFingerprint(left), swissInputFingerprint(right));
});

test('expose l’annulation du calcul quand l’exécuteur fournit un handle', async () => {
  let announced;
  const executor = {
    start() {
      return {
        requestId: 'request-1',
        cancel: () => true,
        promise: Promise.resolve({ status: 'cancelled', result: null }),
      };
    },
  };
  const result = await runInitialSwissPairing({
    tournament: source(),
    roundIndex: 0,
    standings: standings(),
    executor,
    onStarted: (task) => { announced = task; },
  });
  assert.equal(announced.requestId, 'request-1');
  assert.equal(announced.cancel(), true);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.matches, null);
});
