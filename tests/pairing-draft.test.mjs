import assert from 'node:assert/strict';
import test from 'node:test';

import { writeMatchOutcome } from '../src/results/match-outcome.mjs';
import {
  PairingDraftError,
  applyPairingExchange,
  createPairingDraft,
  getPairingDraftPosition,
  pairingDraftMatches,
  previewPairingExchange,
  resetPairingDraft,
  summarizePairingDraft,
  undoPairingExchange,
} from '../src/pairings/pairing-draft.mjs';

const round = () => [
  { table: 1, p1: 'A', p2: 'B', result: null, s1: 0, s2: 0, meta: { label: 'one' } },
  { table: 2, p1: 'C', p2: 'D', result: null, s1: 0, s2: 0 },
  { table: 3, p1: 'E', p2: null, bye: true, result: 'p1', bye_forced: true },
];

test('échange atomiquement deux joueurs sans muter la ronde ni créer de doublon', () => {
  const matches = round();
  const serialized = JSON.stringify(matches);
  const draft = createPairingDraft(matches);
  const next = applyPairingExchange(draft, 'A', 'D');

  assert.equal(JSON.stringify(matches), serialized);
  assert.deepEqual(pairingDraftMatches(draft), matches);
  assert.deepEqual(pairingDraftMatches(next).map((match) => [match.p1, match.p2]), [
    ['D', 'B'], ['C', 'A'], ['E', null],
  ]);
  assert.equal(new Set(pairingDraftMatches(next).flatMap((match) => (
    match.bye ? [match.p1] : [match.p1, match.p2]
  ))).size, 5);
  assert.deepEqual(summarizePairingDraft(next), {
    exchangeCount: 1,
    modifiedMatchIndexes: [0, 1],
    modifiedTables: [1, 2],
    affectedResultMatchIndexes: [],
  });
});

test('un échange avec le bye déplace uniquement son bénéficiaire', () => {
  const next = applyPairingExchange(createPairingDraft(round()), 'B', 'E');
  const matches = pairingDraftMatches(next);
  assert.deepEqual([matches[0].p1, matches[0].p2], ['A', 'E']);
  assert.equal(matches[2].p1, 'B');
  assert.equal(matches[2].bye, true);
  assert.equal(getPairingDraftPosition(next, 'B').bye, true);
  assert.deepEqual(summarizePairingDraft(next).modifiedTables, [1, 3]);
});

test('échange aussi deux positions de la même table sans perdre leur identité', () => {
  const next = applyPairingExchange(createPairingDraft(round()), 'A', 'B');
  assert.deepEqual(pairingDraftMatches(next).slice(0, 1).map((match) => [match.p1, match.p2]), [
    ['B', 'A'],
  ]);
  assert.deepEqual(summarizePairingDraft(next).modifiedTables, [1]);
});

test('la prévisualisation identifie les seules tables et données de résultat touchées', () => {
  const matches = round();
  matches[0] = writeMatchOutcome(matches[0], { kind: 'played', result: 'p1', started: true });
  matches[1].s1 = 4;
  const preview = previewPairingExchange(createPairingDraft(matches), 'A', 'D');
  assert.deepEqual(preview.affectedMatchIndexes, [0, 1]);
  assert.deepEqual(preview.affectedTables, [1, 2]);
  assert.deepEqual(preview.affectedResultMatchIndexes, [0, 1]);
  assert.equal(matches[0].p1, 'A');
  assert.equal(matches[1].p2, 'D');
});

test('annule le dernier échange, puis remet tout le brouillon à zéro', () => {
  const original = createPairingDraft(round());
  const first = applyPairingExchange(original, 'A', 'C');
  const second = applyPairingExchange(first, 'B', 'D');
  assert.equal(summarizePairingDraft(second).exchangeCount, 2);

  const undone = undoPairingExchange(second);
  assert.deepEqual(pairingDraftMatches(undone), pairingDraftMatches(first));
  assert.equal(summarizePairingDraft(undone).exchangeCount, 1);

  const reset = resetPairingDraft(second);
  assert.deepEqual(pairingDraftMatches(reset), pairingDraftMatches(original));
  assert.deepEqual(summarizePairingDraft(reset).modifiedTables, []);
  assert.equal(summarizePairingDraft(reset).exchangeCount, 0);
});

test('un échange inverse revient à un diff vide sans effacer son historique', () => {
  const original = createPairingDraft(round());
  const changed = applyPairingExchange(original, 'A', 'C');
  const restored = applyPairingExchange(changed, 'A', 'C');
  assert.deepEqual(pairingDraftMatches(restored), pairingDraftMatches(original));
  assert.deepEqual(summarizePairingDraft(restored).modifiedTables, []);
  assert.equal(summarizePairingDraft(restored).exchangeCount, 2);
});

test('préserve les données supplémentaires et supporte un aller-retour JSON', () => {
  const draft = JSON.parse(JSON.stringify(createPairingDraft(round())));
  const next = applyPairingExchange(draft, 'A', 'C');
  assert.deepEqual(pairingDraftMatches(next)[0].meta, { label: 'one' });
  assert.equal(pairingDraftMatches(next)[0].result, null);
});

test('refuse les joueurs absents, dupliqués ou une même position', () => {
  assert.throws(
    () => previewPairingExchange(createPairingDraft(round()), 'A', 'Z'),
    (error) => error instanceof PairingDraftError && error.code === 'UNKNOWN_PLAYER',
  );
  assert.throws(
    () => previewPairingExchange(createPairingDraft(round()), 'A', 'A'),
    (error) => error instanceof PairingDraftError && error.code === 'SAME_POSITION',
  );
  const duplicate = round();
  duplicate[1].p1 = 'A';
  assert.throws(
    () => createPairingDraft(duplicate),
    (error) => error instanceof PairingDraftError && error.code === 'DUPLICATE_PLAYER',
  );

  const ambiguousIds = round();
  ambiguousIds[0].p1 = 1;
  ambiguousIds[1].p1 = '1';
  assert.throws(
    () => createPairingDraft(ambiguousIds),
    (error) => error instanceof PairingDraftError && error.code === 'DUPLICATE_PLAYER',
  );
});
