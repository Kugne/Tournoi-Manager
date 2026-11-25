import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateBuchholz } from '../src/results/buchholz.mjs';

test('somme des points des adversaires rencontrés', () => {
  const scores = calculateBuchholz({ entries: [
    { id: 'a', points: 6, opponents: ['b', 'c'] },
    { id: 'b', points: 3, opponents: ['a'] },
    { id: 'c', points: 0, opponents: ['a', 'inconnu'] },
  ] });
  assert.deepEqual(Object.fromEntries(scores), { a: 3, b: 6, c: 6 });
});

test('adversaire virtuel : moyenne arrondie de la population, bénéficiaire exclu', () => {
  const scores = calculateBuchholz({
    entries: [
      { id: 1, points: 3, opponents: [] },
      { id: 2, points: 1, opponents: [] },
      { id: 3, points: 0, opponents: [] },
      { id: 4, points: 1, opponents: [] },
    ],
    virtualOpponents: [{ beneficiaryId: 1, populationIds: ['1', '2', '3', '4', '4', 'parti'] }],
  });
  assert.equal(scores.get('1'), 0.67);
  assert.equal(scores.get('2'), 0);
});

test('un adversaire virtuel sans population ou sans bénéficiaire connu est ignoré', () => {
  const scores = calculateBuchholz({
    entries: [{ id: 'seul', points: 3, opponents: [] }],
    virtualOpponents: [
      { beneficiaryId: 'seul', populationIds: ['seul'] },
      { beneficiaryId: 'fantome', populationIds: ['seul'] },
    ],
  });
  assert.deepEqual(Object.fromEntries(scores), { seul: 0 });
});
