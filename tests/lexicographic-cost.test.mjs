import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLexicographicCostModel } from '../src/swiss/lexicographic-cost.mjs';
import {
  compareObjective,
  enumeratePairings,
  objectiveForPairing,
} from './oracle-suisse.mjs';

const sign = (value) => value === 0 ? 0 : value < 0 ? -1 : 1;

const verifyContext = (participants, context = {}) => {
  const pairings = enumeratePairings(participants, context);
  const model = buildLexicographicCostModel(participants, context);
  for (let left = 0; left < pairings.length; left += 1) {
    const leftObjective = objectiveForPairing(participants, pairings[left], context);
    for (let right = 0; right < pairings.length; right += 1) {
      const rightObjective = objectiveForPairing(participants, pairings[right], context);
      assert.equal(
        sign(model.comparePairings(pairings[left], pairings[right])),
        sign(compareObjective(leftObjective, rightObjective)),
        `${pairings[left].signature} comparé à ${pairings[right].signature}`,
      );
    }
  }
};

const makePlayers = (count, random) => Array.from({ length: count }, (_, index) => ({
  id: `P${index}`,
  points: Math.round(random() * 12) / 2,
  faction: random() < 0.15 ? '' : `F${Math.floor(random() * 3)}`,
  allegiance: random() < 0.2 ? '' : `A${Math.floor(random() * 2)}`,
  compo: Math.floor(random() * 3),
  note: random() < 0.35 ? '' : ['Rookie', 'Équipe A', 'Club'][Math.floor(random() * 3)],
}));

const generator = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

test('l’encodage BigInt reproduit les arbitrages déterministes de l’oracle', () => {
  const participants = [
    { id: 'A', points: 3, faction: 'F1', allegiance: 'X', compo: 0, note: 'Rookie' },
    { id: 'B', points: 2, faction: 'F1', allegiance: 'Y', compo: 1, note: ' rookie ' },
    { id: 'C', points: 2, faction: 'F2', allegiance: 'X', compo: 1, note: 'Club' },
    { id: 'D', points: 1, faction: 'F3', allegiance: 'Y', compo: 2, note: '' },
    { id: 'E', points: 1, faction: 'F2', allegiance: 'X', compo: 0, note: 'Équipe A' },
    { id: 'F', points: 1, faction: 'F3', allegiance: 'Y', compo: 2, note: 'Equipe A' },
  ];
  verifyContext(participants, {
    history: [
      { a: 'A', b: 'C', round: 1 },
      { a: 'A', b: 'C', round: 2 },
      { a: 'B', b: 'D', round: 2 },
      { a: 'E', b: 'F', round: 1 },
    ],
    options: { avoidMirrors: true, avoidAlliances: true, useCompo: true, noteMode: 'separer' },
  });
});

test('les modes de note et les options désactivées conservent le même ordre que l’oracle', () => {
  const random = generator(20260927);
  const participants = makePlayers(6, random);
  verifyContext(participants, { options: { noteMode: 'regrouper' } });
  verifyContext(participants, { options: { noteMode: 'separer' } });
  verifyContext(participants, { options: { avoidMirrors: false, avoidAlliances: false, useCompo: false } });
});

test('200 petits contextes pseudo-aléatoires sont exactement équivalents à l’oracle', () => {
  const random = generator(424242);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const count = random() < 0.8 ? 6 : 8;
    const participants = makePlayers(count, random);
    const history = [];
    for (let round = 1; round <= 4; round += 1) {
      for (let index = 0; index < count; index += 2) {
        if (random() < 0.55) {
          const left = Math.floor(random() * count);
          let right = Math.floor(random() * (count - 1));
          if (right >= left) right += 1;
          history.push({ a: `P${left}`, b: `P${right}`, round });
        }
      }
    }
    const modes = [null, 'separer', 'regrouper'];
    const context = {
      history,
      options: {
        avoidMirrors: random() < 0.5,
        avoidAlliances: random() < 0.5,
        useCompo: random() < 0.5,
        noteMode: modes[Math.floor(random() * modes.length)],
      },
    };
    verifyContext(participants, context);
  }
});

test('les données numériques non finies sont refusées', () => {
  const base = [{ id: 'A', points: 0 }, { id: 'B', points: 0 }];
  assert.throws(
    () => buildLexicographicCostModel([{ ...base[0], points: Number.NaN }, base[1]]),
    /nombre fini/,
  );
  assert.throws(
    () => buildLexicographicCostModel([{ ...base[0], compo: Infinity }, base[1]], { options: { useCompo: true } }),
    /nombre fini/,
  );
  assert.throws(
    () => buildLexicographicCostModel(
      [{ ...base[0], points: Infinity }, base[1]],
      { blockedPairs: [['A', 'B']] },
    ),
    /nombre fini/,
  );
  assert.throws(
    () => buildLexicographicCostModel(base, { history: [{ a: 'A', b: 'B', round: -1 }] }),
    /entier positif ou nul/,
  );
  assert.throws(
    () => buildLexicographicCostModel(base, { history: [{ a: 'A', b: 'B', round: 1.5 }] }),
    /entier positif ou nul/,
  );
  assert.throws(() => buildLexicographicCostModel([{ id: '' }, { id: 'B' }]), /identifiant non vide/);
  assert.throws(() => buildLexicographicCostModel([{ id: null }, { id: 'B' }]), /identifiant non vide/);
  assert.throws(() => buildLexicographicCostModel([{ id: 'A\u0000B' }, { id: 'C' }]), /caractère NUL/);
});

test('une compo absente reste neutre au lieu d’être réinterprétée comme zéro', () => {
  const participants = [
    { id: 'A', points: 0, compo: null },
    { id: 'B', points: 0, compo: 0 },
    { id: 'C', points: 0, compo: 2 },
    { id: 'D', points: 0, compo: 2 },
  ];
  const model = buildLexicographicCostModel(participants, { options: { useCompo: true } });
  const missingAgainstTwo = model.edges.find((edge) => edge.a === 'A' && edge.b === 'C');
  const zeroAgainstTwo = model.edges.find((edge) => edge.a === 'B' && edge.b === 'C');
  assert.equal(missingAgainstTwo.features.compoGap, 0);
  assert.equal(zeroAgainstTwo.features.compoGap, 2);
  verifyContext(participants, { options: { useCompo: true } });
});

test('les blocages retirent les arêtes sans fabriquer de couplage', () => {
  const participants = ['A', 'B', 'C', 'D'].map((id) => ({ id, points: 0 }));
  const model = buildLexicographicCostModel(participants, {
    blockedPairs: [['A', 'B'], ['A', 'C'], ['A', 'D']],
  });
  assert.equal(model.edges.some((edge) => edge.a === 'A' || edge.b === 'A'), false);
  assert.throws(
    () => model.costOfPairing([{ a: 'A', b: 'B' }, { a: 'C', b: 'D' }]),
    /Paire interdite/,
  );
});

test('costOfPairing refuse les appariements incomplets ou dupliqués', () => {
  const participants = ['A', 'B', 'C', 'D'].map((id) => ({ id, points: 0 }));
  const model = buildLexicographicCostModel(participants);
  assert.throws(() => model.costOfPairing([{ a: 'A', b: 'B' }]), /doit contenir 2 matchs/);
  assert.throws(
    () => model.costOfPairing([{ a: 'A', b: 'B' }, { a: 'A', b: 'C' }]),
    /dupliqué/,
  );
});

test('les coûts restent des BigInt au-delà de la précision sûre des Number', () => {
  const random = generator(7);
  const participants = makePlayers(16, random);
  const model = buildLexicographicCostModel(participants, {
    options: { avoidMirrors: true, avoidAlliances: true, useCompo: true, noteMode: 'separer' },
  });
  assert.ok(model.edges.every((edge) => typeof edge.cost === 'bigint' && typeof edge.weight === 'bigint'));
  assert.ok(model.costRange > BigInt(Number.MAX_SAFE_INTEGER));
  assert.ok(model.maximumEdgeCost > BigInt(Number.MAX_SAFE_INTEGER));
});
