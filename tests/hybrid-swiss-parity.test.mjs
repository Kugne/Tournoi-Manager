import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeApplicationSwissRound } from '../src/swiss/pairing-analysis.mjs';
import {
  runInitialSwissPairing,
  runNextSwissPairingVariant,
} from '../src/swiss/application-runner.mjs';
import { enumerateOptimalVariants } from '../src/swiss/optimal-variants.mjs';
import { solveSwissPairing } from '../src/swiss/solve-swiss.mjs';

const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const players = (count) => ids.slice(0, count).map((id, index) => ({
  id,
  name: `Joueur ${id}`,
  status: 'active',
  faction: ['Rouge', 'Bleu', 'Vert'][index % 3],
  compo: index % 3,
  note: index < 2 ? 'Rookies' : index < 4 ? 'Club' : '',
}));

const standings = (count, tied = false) => ids.slice(0, count).map((id, index) => ({
  id,
  pts: tied ? 0 : [6, 3, 3, 1, 1, 0, 0][index],
}));

const validatedRound = (count) => {
  const matches = [
    { p1: 'A', p2: 'B', result: 'p1', s1: 12, s2: 8, table: 1 },
    { p1: 'C', p2: 'D', result: 'draw', s1: 10, s2: 10, table: 2 },
    { p1: 'E', p2: 'F', result: 'p2', s1: 7, s2: 13, table: 3 },
  ];
  if (count % 2 === 1) {
    matches.push({ p1: 'G', p2: null, bye: true, result: 'bye', byeScenario: 10, table: 4 });
  }
  return { validated: true, matches };
};

const tournament = (count, format) => ({
  id: 'parity-tournament',
  pairFormat: format,
  hybridPhase: format === 'hybrid' ? 'swiss' : null,
  players: players(count),
  roundsData: [],
  blocks: [{ p1: 'A', p2: 'C' }],
  compoPairing: true,
  noteMatchCriteria: 'separate',
  secondaryCriteria: {
    mirror: true,
    allegiance: true,
    compo: true,
    free: 'separate',
  },
});

const exactExecutor = {
  async run({ participants, context }) {
    return { status: 'success', result: solveSwissPairing(participants, context) };
  },
};

const variantExecutor = {
  async run({ participants, context, excludedSignatures }) {
    return {
      status: 'success',
      result: enumerateOptimalVariants(participants, context, {
        excludedSignatures,
        maxVariants: 1,
      }),
    };
  },
};

const allegianceForFaction = (faction) => faction === 'Rouge' ? 'Ordre' : 'Chaos';

const comparableOutcome = (outcome) => ({
  status: outcome.status,
  matches: outcome.matches,
  engineSignature: outcome.engineSignature,
  signature: outcome.signature,
  byePlayerId: outcome.byePlayerId,
  seenSignatures: outcome.seenSignatures,
  fingerprint: outcome.fingerprint,
});

test('la génération initiale est identique en Suisse classique et hybride, avec ou sans bye', async () => {
  for (const count of [6, 7]) {
    const classic = tournament(count, 'swiss');
    const hybrid = tournament(count, 'hybrid');
    classic.roundsData.push(validatedRound(count));
    hybrid.roundsData.push(validatedRound(count));
    const classicBefore = structuredClone(classic);
    const hybridBefore = structuredClone(hybrid);
    const ranking = standings(count);

    const [classicOutcome, hybridOutcome] = await Promise.all([
      runInitialSwissPairing({
        tournament: classic,
        roundIndex: 1,
        standings: ranking,
        allegianceForFaction,
        executor: exactExecutor,
      }),
      runInitialSwissPairing({
        tournament: hybrid,
        roundIndex: 1,
        standings: ranking,
        allegianceForFaction,
        executor: exactExecutor,
      }),
    ]);

    assert.deepEqual(comparableOutcome(hybridOutcome), comparableOutcome(classicOutcome));
    assert.equal(classicOutcome.matches.filter((match) => match.bye).length, count % 2);
    const previousPairs = new Set(['A\u0000B', 'C\u0000D', 'E\u0000F']);
    assert.equal(classicOutcome.matches.some((match) => !match.bye
      && previousPairs.has([match.p1, match.p2].sort().join('\u0000'))), false);
    if (count % 2 === 1) {
      assert.notEqual(classicOutcome.byePlayerId, 'G');
    }
    assert.deepEqual(classic, classicBefore);
    assert.deepEqual(hybrid, hybridBefore);
  }
});

test('le reroll parcourt la même variante optimale et conserve le même bye dans les deux formats', async () => {
  const count = 5;
  const classic = tournament(count, 'swiss');
  const hybrid = tournament(count, 'hybrid');
  classic.blocks = [];
  hybrid.blocks = [];
  classic.compoPairing = false;
  hybrid.compoPairing = false;
  classic.noteMatchCriteria = 'none';
  hybrid.noteMatchCriteria = 'none';
  classic.secondaryCriteria = {};
  hybrid.secondaryCriteria = {};
  const ranking = standings(count, true);

  const initial = await runInitialSwissPairing({
    tournament: classic,
    roundIndex: 0,
    standings: ranking,
    executor: exactExecutor,
  });
  const openRound = {
    validated: false,
    matches: initial.matches,
    swissPairingSignatures: [initial.engineSignature],
    pairingMeta: {
      signature: initial.signature,
      byePlayerId: initial.byePlayerId,
      manuallyEdited: false,
    },
  };
  classic.roundsData.push(structuredClone(openRound));
  hybrid.roundsData.push(structuredClone(openRound));
  const classicBefore = structuredClone(classic);
  const hybridBefore = structuredClone(hybrid);

  const [classicOutcome, hybridOutcome] = await Promise.all([
    runNextSwissPairingVariant({
      tournament: classic,
      roundIndex: 0,
      standings: ranking,
      executor: variantExecutor,
    }),
    runNextSwissPairingVariant({
      tournament: hybrid,
      roundIndex: 0,
      standings: ranking,
      executor: variantExecutor,
    }),
  ]);

  assert.deepEqual(comparableOutcome(hybridOutcome), comparableOutcome(classicOutcome));
  assert.equal(classicOutcome.status, 'success');
  assert.equal(classicOutcome.byePlayerId, initial.byePlayerId);
  assert.notEqual(classicOutcome.engineSignature, initial.engineSignature);
  assert.deepEqual(classic, classicBefore);
  assert.deepEqual(hybrid, hybridBefore);
});

test('les explications et interdictions sont identiques dans les deux phases Suisses', async () => {
  const count = 6;
  const classic = tournament(count, 'swiss');
  const hybrid = tournament(count, 'hybrid');
  const ranking = standings(count);
  const initial = await runInitialSwissPairing({
    tournament: classic,
    roundIndex: 0,
    standings: ranking,
    allegianceForFaction,
    executor: exactExecutor,
  });
  const openRound = {
    validated: false,
    matches: initial.matches,
    pairingMeta: { manuallyEdited: false },
  };
  classic.roundsData.push(structuredClone(openRound));
  hybrid.roundsData.push(structuredClone(openRound));
  const blockedMatch = initial.matches.find((match) => !match.bye);
  classic.blocks = [{ p1: blockedMatch.p1, p2: blockedMatch.p2 }];
  hybrid.blocks = [{ p1: blockedMatch.p1, p2: blockedMatch.p2 }];
  const classicBefore = structuredClone(classic);
  const hybridBefore = structuredClone(hybrid);

  const classicAnalysis = analyzeApplicationSwissRound({
    tournament: classic,
    roundIndex: 0,
    standings: ranking,
    allegianceForFaction,
  });
  const hybridAnalysis = analyzeApplicationSwissRound({
    tournament: hybrid,
    roundIndex: 0,
    standings: ranking,
    allegianceForFaction,
  });

  assert.deepEqual(hybridAnalysis, classicAnalysis);
  assert.equal(classicAnalysis.valid, false);
  assert.equal(classicAnalysis.exactEngineResult, true);
  assert.ok(classicAnalysis.forbidden.some((item) => item.code === 'manual-block'));
  assert.deepEqual(classic, classicBefore);
  assert.deepEqual(hybrid, hybridBefore);
});
