import assert from 'node:assert/strict';
import test from 'node:test';

import {
  engineSignatureFromMatches,
  runInitialSwissPairing,
  runNextSwissPairingVariant,
  swissInputFingerprint,
} from '../src/swiss/application-runner.mjs';
import { enumerateOptimalVariants } from '../src/swiss/optimal-variants.mjs';
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
  assert.equal(result.engineSignature, engineSignatureFromMatches(result.matches));
  assert.match(result.signature, /"byePlayerId":null/);
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

const rerollTournament = () => ({
  players: ['A', 'B', 'C', 'D'].map((id) => ({ id, status: 'active', faction: id, compo: null })),
  roundsData: [{
    validated: false,
    matches: [
      { p1: 'A', p2: 'B', result: null, table: 1 },
      { p1: 'C', p2: 'D', result: null, table: 2 },
    ],
  }],
  blocks: [],
  compoPairing: false,
  secondaryCriteria: {},
});
const tiedStandings = (ids = ['A', 'B', 'C', 'D']) => ids.map((id) => ({ id, pts: 0 }));
const variantExecutor = {
  async run({ participants, context, excludedSignatures }) {
    return {
      status: 'success',
      result: enumerateOptimalVariants(participants, context, { excludedSignatures, maxVariants: 1 }),
    };
  },
};

test('le reroll propose chaque optimum une seule fois puis prouve l’épuisement', async () => {
  const tournament = rerollTournament();
  const first = await runNextSwissPairingVariant({
    tournament,
    roundIndex: 0,
    standings: tiedStandings(),
    executor: variantExecutor,
  });
  assert.equal(first.status, 'success');
  assert.equal(first.matches.length, 2);
  assert.notEqual(first.engineSignature, engineSignatureFromMatches(tournament.roundsData[0].matches));
  assert.equal(first.seenSignatures.length, 2);

  tournament.roundsData[0].matches = first.matches;
  tournament.roundsData[0].swissPairingSignatures = first.seenSignatures;
  const second = await runNextSwissPairingVariant({
    tournament,
    roundIndex: 0,
    standings: tiedStandings(),
    executor: variantExecutor,
  });
  assert.equal(second.status, 'success');
  assert.equal(second.seenSignatures.length, 3);

  tournament.roundsData[0].matches = second.matches;
  tournament.roundsData[0].swissPairingSignatures = second.seenSignatures;
  const exhausted = await runNextSwissPairingVariant({
    tournament,
    roundIndex: 0,
    standings: tiedStandings(),
    executor: variantExecutor,
  });
  assert.equal(exhausted.status, 'exhausted');
  assert.equal(exhausted.matches, null);
});

test('le reroll conserve le bye et rejette un résultat devenu obsolète', async () => {
  const tournament = rerollTournament();
  tournament.players.push({ id: 'E', status: 'active', faction: 'E', compo: null });
  tournament.roundsData[0].matches.push({ p1: 'E', p2: null, bye: true, result: 'bye', table: 3 });
  const preserved = await runNextSwissPairingVariant({
    tournament,
    roundIndex: 0,
    standings: tiedStandings(['A', 'B', 'C', 'D', 'E']),
    executor: variantExecutor,
  });
  assert.equal(preserved.byePlayerId, 'E');
  assert.equal(preserved.matches.at(-1).p1, 'E');
  assert.equal(preserved.matches.at(-1).bye, true);

  const stale = await runNextSwissPairingVariant({
    tournament,
    roundIndex: 0,
    standings: tiedStandings(['A', 'B', 'C', 'D', 'E']),
    executor: variantExecutor,
    isCurrent: () => false,
  });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.matches, null);
});
