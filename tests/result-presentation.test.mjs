import assert from 'node:assert/strict';
import test from 'node:test';

import { writeMatchOutcome } from '../src/results/match-outcome.mjs';
import { describePlayerOutcome } from '../src/results/result-presentation.mjs';

const match = (outcome) => writeMatchOutcome({ p1: 'A', p2: 'B' }, outcome);

test('conserve dans les exports la nature précise des résultats administratifs', () => {
  const noShow = match({
    kind: 'administrative_no_show', result: 'p1', started: false, administrativeReason: 'absence',
  });
  assert.equal(describePlayerOutcome(noShow, 'A').label, 'Victoire administrative · non jouée');
  assert.equal(describePlayerOutcome(noShow, 'B').label, 'Défaite administrative · non jouée');

  const started = match({
    kind: 'forfeit_after_start', result: 'p2', started: true, administrativeReason: 'drop',
  });
  assert.equal(describePlayerOutcome(started, 'A').label, 'Défaite par abandon après début');
  assert.equal(describePlayerOutcome(started, 'B').label, 'Victoire sur abandon après début');

  const double = match({
    kind: 'double_forfeit', result: null, started: false, administrativeReason: 'forfeit',
  });
  assert.equal(describePlayerOutcome(double, 'A').label, 'Double forfait');
});

test('signale explicitement l’incertitude des anciennes victoires forcées', () => {
  const legacy = { p1: 'A', p2: 'B', result: 'p1', bye_forced: true };
  assert.equal(describePlayerOutcome(legacy, 'A').label, 'Victoire forcée ancienne · début inconnu');
  assert.equal(describePlayerOutcome(legacy, 'B').label, 'Défaite forcée ancienne · début inconnu');
});
