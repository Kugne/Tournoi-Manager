import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPairingCandidate,
  sortPairingCandidates,
} from '../src/pairings/pairing-candidate.mjs';

const analysis = (...tables) => ({ tables });
const table = (matchIndex, { alerts = [], forbidden = [] } = {}) => ({
  matchIndex,
  alerts,
  forbidden,
});

test('classe uniquement les tables touchées par l’échange', () => {
  const result = classifyPairingCandidate(analysis(
    table(0),
    table(1, { alerts: [{ level: 'yellow', code: 'mirror', message: 'Miroir' }] }),
    table(2, { forbidden: [{ code: 'manual-block', message: 'Blocage' }] }),
  ), [0, 1]);

  assert.equal(result.status, 'caution');
  assert.equal(result.allowed, true);
  assert.deepEqual(result.messages, ['Miroir']);
});

test('un blocage rend le candidat rouge et non sélectionnable', () => {
  const result = classifyPairingCandidate(analysis(
    table(0, { forbidden: [{ code: 'manual-block', message: 'Rencontre interdite' }] }),
    table(1),
  ), [0, 1]);

  assert.deepEqual(result, {
    status: 'forbidden',
    color: 'red',
    rank: 3,
    allowed: false,
    label: 'Interdit',
    messages: ['Rencontre interdite'],
  });
});

test('une erreur de la source commune interdit la proposition au lieu de la présenter en vert', () => {
  const result = classifyPairingCandidate({
    tables: [],
    forbidden: [{ code: 'analysis-error', message: 'Analyse impossible' }],
  }, [0, 1]);

  assert.equal(result.status, 'forbidden');
  assert.deepEqual(result.messages, ['Analyse impossible']);
});

test('une revanche ou un nouveau bye est une alerte orange mais reste applicable', () => {
  const rematch = classifyPairingCandidate(analysis(table(0, {
    alerts: [{ level: 'red', code: 'rematch', message: 'Déjà rencontrés' }],
  })), [0]);
  const repeatedBye = classifyPairingCandidate(analysis(table(0, {
    alerts: [{ level: 'red', code: 'repeated-bye', message: 'Bye déjà reçu' }],
  })), [0]);

  assert.equal(rematch.color, 'orange');
  assert.equal(rematch.label, 'Revanche');
  assert.equal(rematch.allowed, true);
  assert.equal(repeatedBye.color, 'orange');
  assert.equal(repeatedBye.allowed, true);
});

test('les candidats sont triés par validité puis alphabétiquement', () => {
  const candidates = sortPairingCandidates([
    { name: 'Zoé', classification: { rank: 1 } },
    { name: 'Émile', classification: { rank: 0 } },
    { name: 'Alice', classification: { rank: 0 } },
    { name: 'Bob', classification: { rank: 3 } },
  ]);

  assert.deepEqual(candidates.map((candidate) => candidate.name), ['Alice', 'Émile', 'Zoé', 'Bob']);
});
