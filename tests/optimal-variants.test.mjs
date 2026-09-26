import assert from 'node:assert/strict';
import test from 'node:test';

import { NoPerfectMatchingError } from '../src/swiss/blossom-bigint.mjs';
import {
  enumerateOptimalVariants,
  pairingSignature,
} from '../src/swiss/optimal-variants.mjs';
import { solveOptimalPairings } from './oracle-suisse.mjs';

const participants = (count) => Array.from({ length: count }, (_, index) => ({
  id: `P${index}`,
  points: 0,
}));

test('énumère exactement toutes les solutions optimales de l’oracle jusqu’à huit joueurs', () => {
  for (const count of [2, 4, 6, 8]) {
    const entries = participants(count);
    const expected = solveOptimalPairings(entries, {}).optimal.map(pairingSignature).sort();
    const result = enumerateOptimalVariants(entries, {}, { maxVariants: Infinity });
    assert.equal(result.interrupted, false);
    assert.equal(result.exhausted, true);
    assert.deepEqual(
      result.variants.map((variant) => variant.signature).sort(),
      expected,
    );
    assert.equal(new Set(result.variants.map((variant) => variant.signature)).size, expected.length);
    assert.ok(result.variants.every((variant) => variant.cost === result.optimalCost));
  }
});

test('conserve les critères du modèle et ne propose que les optima métier', () => {
  const entries = participants(6).map((participant, index) => ({
    ...participant,
    points: [3, 3, 2, 2, 0, 0][index],
    faction: ['A', 'A', 'B', 'B', 'C', 'C'][index],
    allegiance: ['X', 'Y', 'X', 'Y', 'X', 'Y'][index],
    compo: index % 3,
    note: index % 2 ? 'Rookie' : 'Équipe A',
  }));
  const context = {
    history: [{ a: 'P0', b: 'P1', round: 1 }, { a: 'P2', b: 'P3', round: 2 }],
    options: { avoidMirrors: true, avoidAlliances: true, useCompo: true, noteMode: 'separer' },
  };
  const expected = solveOptimalPairings(entries, context).optimal.map(pairingSignature).sort();
  const actual = enumerateOptimalVariants(entries, context, { maxVariants: Infinity })
    .variants.map((variant) => variant.signature);
  assert.deepEqual([...actual].sort(), expected);
});

test('les signatures persistées sont exclues et l’épuisement reste prouvé', () => {
  const entries = participants(4);
  const all = enumerateOptimalVariants(entries, {}, { maxVariants: Infinity });
  const excluded = all.variants.slice(0, 1).map((variant) => variant.signature);
  const remaining = enumerateOptimalVariants(
    entries,
    { excludedSignatures: excluded },
    { maxVariants: Infinity },
  );
  assert.equal(remaining.exhausted, true);
  assert.equal(remaining.interrupted, false);
  assert.equal(remaining.variants.some((variant) => excluded.includes(variant.signature)), false);
  assert.equal(remaining.variants.length, all.variants.length - excluded.length);

  const none = enumerateOptimalVariants(
    entries,
    { excludedSignatures: all.variants.map((variant) => variant.signature) },
    { maxVariants: Infinity },
  );
  assert.deepEqual(none.variants, []);
  assert.equal(none.exhausted, true);
});

test('les blocages absolus restent une infaisabilité explicite', () => {
  assert.throws(
    () => enumerateOptimalVariants(participants(4), {
      blockedPairs: [['P0', 'P1'], ['P0', 'P2'], ['P0', 'P3']],
    }),
    (error) => error instanceof NoPerfectMatchingError && error.code === 'NO_PERFECT_MATCHING',
  );
});

test('une interruption est distincte de l’épuisement', () => {
  let checks = 0;
  const result = enumerateOptimalVariants(participants(8), {}, {
    shouldInterrupt: () => {
      checks += 1;
      return checks >= 2;
    },
  });
  assert.equal(result.interrupted, true);
  assert.equal(result.exhausted, false);
  assert.equal(result.status, 'interrupted');
  assert.notEqual(result.reason, 'exhausted');

  const deadline = enumerateOptimalVariants(participants(4), {}, { deadline: 0, now: () => 0 });
  assert.equal(deadline.interrupted, true);
  assert.equal(deadline.exhausted, false);
  assert.equal(deadline.reason, 'deadline');
});

test('les signatures ignorent l’orientation et l’ordre des tables', () => {
  assert.equal(
    pairingSignature([{ a: 'B', b: 'A' }, { a: 'D', b: 'C' }]),
    '[["A","B"],["C","D"]]',
  );
});

test('les signatures restent injectives quels que soient les identifiants', () => {
  const entries = ['A', 'B', 'C', 'D', '~', '|', 'A~', '||'].map((id) => ({ id, points: 0 }));
  const expected = solveOptimalPairings(entries, {}).signatures.length;
  const result = enumerateOptimalVariants(entries, {}, { maxVariants: Infinity });
  assert.equal(result.variants.length, expected);
  assert.equal(new Set(result.variants.map((variant) => variant.signature)).size, expected);
});

test('la limite par défaut est sûre et les contrôles invalides sont refusés', () => {
  const defaultResult = enumerateOptimalVariants(participants(8));
  assert.equal(defaultResult.variants.length, 1);
  assert.equal(defaultResult.status, 'limit');
  assert.equal(defaultResult.diagnostics.queuedSubproblems, 0);

  const zero = enumerateOptimalVariants(participants(4), {}, { maxVariants: 0 });
  assert.deepEqual(zero.variants, []);
  assert.equal(zero.status, 'limit');

  assert.throws(
    () => enumerateOptimalVariants(participants(4), {}, { excludedSignatures: 'signature' }),
    /tableau ou un Set/,
  );
  assert.throws(
    () => enumerateOptimalVariants(participants(4), {}, { maxVariants: -1 }),
    /maxVariants/,
  );
});
