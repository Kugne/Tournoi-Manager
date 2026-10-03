import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearMatchRecordedData,
  assertExplicitMatchOutcome,
  consumesSwissBye,
  hasRealOpponent,
  isResolvedMatch,
  MATCH_OUTCOME_KINDS,
  MATCH_OUTCOME_VERSION,
  readMatchOutcome,
  writeMatchOutcome,
} from '../src/results/match-outcome.mjs';

const match = () => ({ p1: 'A', p2: 'B', result: null, s1: 0, s2: 0 });

test('écrit sans mutation chacun des résultats explicites du lot 5', () => {
  const source = match();
  const cases = [
    [{ kind: null, result: null, started: null }, false, false, false],
    [{ kind: 'played', result: 'p1', started: true }, true, true, false],
    [{ kind: 'administrative_no_show', result: 'p2', started: false, administrativeReason: 'absence' }, true, false, false],
    [{ kind: 'forfeit_after_start', result: 'p1', started: true, administrativeReason: 'drop' }, true, true, false],
    [{ kind: 'double_forfeit', result: null, started: false, administrativeReason: 'absence' }, true, false, false],
    [{ kind: 'legacy_forced_win_unknown', result: 'p2', started: null, administrativeReason: 'unknown' }, true, true, false],
  ];
  for (const [outcome, resolved, realOpponent, consumesBye] of cases) {
    const written = writeMatchOutcome(source, outcome);
    assert.equal(written.outcomeVersion, MATCH_OUTCOME_VERSION);
    assert.equal(readMatchOutcome(written).source, 'explicit');
    assert.equal(isResolvedMatch(written), resolved);
    assert.equal(hasRealOpponent(written), realOpponent);
    assert.equal(consumesSwissBye(written), consumesBye);
  }
  assert.deepEqual(source, match());
});

test('représente un bye canonique sans adversaire ni résultat sportif', () => {
  const source = { p1: 'A', p2: null, bye: true, result: 'bye' };
  const written = writeMatchOutcome(source, { kind: 'bye', result: null, started: false });
  assert.equal(written.result, null);
  assert.equal(written.bye, true);
  assert.equal(isResolvedMatch(written), true);
  assert.equal(hasRealOpponent(written), false);
  assert.equal(consumesSwissBye(written), true);
  assert.equal(source.result, 'bye');
});

test('relit les résultats V1.9.32 sans modifier ni inventer started', () => {
  const fixtures = [
    [{ p1: 'A', p2: 'B', result: 'p1' }, 'played', 'p1', null],
    [{ p1: 'A', p2: 'B', result: 'draw' }, 'played', 'draw', null],
    [{ p1: 'A', p2: null, bye: true, result: 'bye' }, 'bye', null, false],
    [{ p1: 'A', p2: 'B', result: 'p2', bye_forced: true }, 'legacy_forced_win_unknown', 'p2', null],
    [{ p1: 'A', p2: 'B', result: null }, null, null, null],
  ];
  for (const [legacy, kind, result, started] of fixtures) {
    const before = structuredClone(legacy);
    assert.deepEqual(readMatchOutcome(legacy), {
      outcomeVersion: 1,
      kind,
      result,
      started,
      administrativeReason: kind === 'legacy_forced_win_unknown' ? 'unknown' : null,
      source: 'legacy',
    });
    assert.deepEqual(legacy, before);
  }
});

test('préserve exactement la politique historique des anciens bye_forced', () => {
  const legacy = { p1: 'A', p2: 'B', result: 'p1', bye_forced: true };
  const outcome = readMatchOutcome(legacy);
  assert.equal(outcome.started, null);
  assert.equal(hasRealOpponent(legacy), true);
  assert.equal(consumesSwissBye(legacy), false);
});

test('le double forfait est résolu sans fabriquer de vainqueur', () => {
  const written = writeMatchOutcome(match(), {
    kind: MATCH_OUTCOME_KINDS.DOUBLE_FORFEIT,
    result: null,
    started: false,
    administrativeReason: 'forfeit',
  });
  assert.equal(written.result, null);
  assert.equal(isResolvedMatch(written), true);
  assert.equal(hasRealOpponent(written), false);
});

test('refuse les combinaisons explicites incohérentes', () => {
  const invalid = [
    [{ kind: 'played', result: null, started: true }, /match joué/],
    [{ kind: 'played', result: 'p1', started: null }, /started=true/],
    [{ kind: 'administrative_no_show', result: 'draw', started: false, administrativeReason: 'absence' }, /victoire administrative/],
    [{ kind: 'administrative_no_show', result: 'p1', started: true, administrativeReason: 'absence' }, /started=false/],
    [{ kind: 'administrative_no_show', result: 'p1', started: false, administrativeReason: 'unknown' }, /motif/],
    [{ kind: 'forfeit_after_start', result: 'p1', started: false, administrativeReason: 'drop' }, /started=true/],
    [{ kind: 'double_forfeit', result: 'p1', started: false, administrativeReason: 'absence' }, /double forfait/],
    [{ kind: 'legacy_forced_win_unknown', result: 'p1', started: false, administrativeReason: 'unknown' }, /started=null/],
    [{ kind: 'inconnu', result: null, started: null }, /inconnu/],
  ];
  for (const [outcome, pattern] of invalid) {
    assert.throws(() => writeMatchOutcome(match(), outcome), pattern);
  }
  assert.throws(() => writeMatchOutcome({ p1: 'A', p2: 'B' }, {
    outcomeVersion: 999, kind: null, result: null, started: null,
  }), /Version/);
  assert.throws(() => writeMatchOutcome({ p1: 'A', p2: 'B' }, {
    outcomeVersion: '1', kind: null, result: null, started: null,
  }), /Version/);
  assert.throws(() => writeMatchOutcome({ p1: 'A', p2: 'B' }, {
    outcomeVersion: true, kind: null, result: null, started: null,
  }), /Version/);
  assert.throws(() => assertExplicitMatchOutcome({ p1: 'A', p2: 'A' }, {
    kind: 'played', result: 'p1', started: true,
  }), /lui-même/);
  assert.throws(() => writeMatchOutcome({ p1: 'A', p2: 'B' }, {
    kind: 'bye', result: null, started: false,
  }), /second participant/);
});

test('supporte un aller-retour JSON sans perdre le type administratif', () => {
  const written = writeMatchOutcome(match(), {
    kind: 'administrative_no_show',
    result: 'p1',
    started: false,
    administrativeReason: 'drop',
  });
  const restored = JSON.parse(JSON.stringify(written));
  assert.deepEqual(readMatchOutcome(restored), {
    outcomeVersion: 1,
    kind: 'administrative_no_show',
    result: 'p1',
    started: false,
    administrativeReason: 'drop',
    source: 'explicit',
  });
});

test('efface complètement les données saisies sans modifier les participants ni la table', () => {
  const source = {
    ...writeMatchOutcome({ ...match(), table: 4, s1: 12, s2: 7, f1: 2, f2: 1 }, {
      kind: 'forfeit_after_start', result: 'p1', started: true, administrativeReason: 'drop',
    }),
    secondaryScoresConfirmed: true,
    neutralScenario: 9,
    neutralFree: 1,
  };
  const cleared = clearMatchRecordedData(source);

  assert.deepEqual([cleared.p1, cleared.p2, cleared.table], ['A', 'B', 4]);
  assert.deepEqual([cleared.s1, cleared.s2, cleared.f1, cleared.f2], [0, 0, 0, 0]);
  assert.deepEqual(readMatchOutcome(cleared), {
    outcomeVersion: MATCH_OUTCOME_VERSION,
    kind: null,
    result: null,
    started: null,
    administrativeReason: null,
    source: 'explicit',
  });
  assert.equal('secondaryScoresConfirmed' in cleared, false);
  assert.equal('neutralScenario' in cleared, false);
  assert.equal('neutralFree' in cleared, false);
  assert.equal(source.result, 'p1');
});

test('réinitialise les scores compensatoires d’un bye en conservant son type', () => {
  const bye = writeMatchOutcome({ p1: 'A', p2: null, table: 2, byeScenario: 8, byeFree: 3 }, {
    kind: 'bye', result: null, started: false,
  });
  const cleared = clearMatchRecordedData(bye);
  assert.equal(readMatchOutcome(cleared).kind, 'bye');
  assert.deepEqual([cleared.byeScenario, cleared.byeFree], [0, 0]);
  assert.equal(cleared.table, 2);
});

test('refuse d’effacer silencieusement une ancienne victoire forcée ambiguë', () => {
  assert.throws(
    () => clearMatchRecordedData({ ...match(), result: 'p1', bye_forced: true }),
    /doit être qualifié/,
  );
});
