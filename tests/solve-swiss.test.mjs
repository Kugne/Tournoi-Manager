import assert from 'node:assert/strict';
import test from 'node:test';

import { NoPerfectMatchingError } from '../src/swiss/blossom-bigint.mjs';
import { solveSwissPairing } from '../src/swiss/solve-swiss.mjs';
import { pairingSignature, solveOptimalPairings } from './oracle-suisse.mjs';

const generator = (initialSeed) => {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
};

const makeContext = (random, count) => {
  const participants = Array.from({ length: count }, (_, index) => ({
    id: `P${index}`,
    points: Number(random() % 13) / 2,
    faction: random() % 5 === 0 ? '' : `F${random() % 4}`,
    allegiance: random() % 4 === 0 ? '' : `A${random() % 3}`,
    compo: Number(random() % 3),
    note: random() % 3 === 0 ? '' : ['Rookie', 'Club', 'Équipe A'][random() % 3],
  }));
  const history = [];
  for (let round = 1; round <= 4; round += 1) {
    for (let index = 0; index < count / 2; index += 1) {
      if (random() % 100 >= 60) continue;
      const left = random() % count;
      let right = random() % (count - 1);
      if (right >= left) right += 1;
      history.push({ a: `P${left}`, b: `P${right}`, round });
    }
  }
  const noteModes = [null, 'separer', 'regrouper'];
  return {
    participants,
    context: {
      history,
      options: {
        avoidMirrors: (random() & 1) === 0,
        avoidAlliances: (random() & 1) === 0,
        useCompo: (random() & 1) === 0,
        noteMode: noteModes[random() % noteModes.length],
      },
    },
  };
};

test('l’assemblage 2A + 2B retrouve toujours un optimum de l’oracle Suisse', () => {
  const random = generator(0x51a55e);
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const count = random() % 4 === 0 ? 8 : 6;
    const { participants, context } = makeContext(random, count);
    const oracle = solveOptimalPairings(participants, context);
    const result = solveSwissPairing(participants, context);
    assert.ok(oracle.signatures.includes(pairingSignature(result)));
  }
});

test('les blocages absolus sont transmis au graphe et l’infaisabilité est explicite', () => {
  const participants = ['A', 'B', 'C', 'D'].map((id) => ({ id, points: 0 }));
  assert.throws(
    () => solveSwissPairing(participants, {
      blockedPairs: [['A', 'B'], ['A', 'C'], ['A', 'D']],
    }),
    (error) => error instanceof NoPerfectMatchingError && error.code === 'NO_PERFECT_MATCHING',
  );
});

test('le résultat expose uniquement des diagnostics exacts sans modifier les entrées', () => {
  const participants = [
    { id: 'A', points: 3, faction: 'F1' },
    { id: 'B', points: 3, faction: 'F2' },
    { id: 'C', points: 0, faction: 'F1' },
    { id: 'D', points: 0, faction: 'F2' },
  ];
  const context = { options: { avoidMirrors: true }, history: [] };
  const participantSnapshot = structuredClone(participants);
  const contextSnapshot = structuredClone(context);
  const result = solveSwissPairing(participants, context);
  assert.deepEqual(participants, participantSnapshot);
  assert.deepEqual(context, contextSnapshot);
  assert.equal(result.pairs.length, 2);
  assert.equal(typeof result.cost, 'bigint');
  assert.equal(typeof result.totalWeight, 'bigint');
  assert.equal(result.diagnostics.matchCount, 2);
  assert.equal(result.diagnostics.edgeCount, 6);
});
