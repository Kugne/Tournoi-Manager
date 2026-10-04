import assert from 'node:assert/strict';
import test from 'node:test';

import { writeMatchOutcome } from '../src/results/match-outcome.mjs';
import {
  analyzeManualRoundBlocks,
  analyzeRoundParticipantIntegrity,
  findOpenRoundMatch,
  resolveAdministrativeMatch,
  roundHasEnteredResults,
} from '../src/results/administrative-flow.mjs';

const pending = (p1 = 'A', p2 = 'B') => writeMatchOutcome({ p1, p2, s1: 0, s2: 0, f1: 0, f2: 0 }, {
  kind: null, result: null, started: null,
});

test('une partie non commencée devient une victoire administrative sans effacer les scores', () => {
  const match = { ...pending(), s1: 4, s2: 2 };
  const result = resolveAdministrativeMatch(match, {
    unavailablePlayerId: 'B', reason: 'absence', started: false,
  });
  assert.deepEqual(
    [result.kind, result.result, result.started, result.administrativeReason, result.s1, result.s2],
    ['administrative_no_show', 'p1', false, 'absence', 4, 2],
  );
});

test('un abandon après début conserve un adversaire réel et exige la confirmation des scores', () => {
  assert.throws(() => resolveAdministrativeMatch(pending(), {
    unavailablePlayerId: 'A', reason: 'drop', started: true,
  }), /scores secondaires/);
  const result = resolveAdministrativeMatch({ ...pending(), s1: 8, s2: 3 }, {
    unavailablePlayerId: 'A', reason: 'drop', started: true, secondaryScoresConfirmed: true,
  });
  assert.deepEqual([result.kind, result.result, result.started, result.secondaryScoresConfirmed], [
    'forfeit_after_start', 'p2', true, true,
  ]);
});

test('deux indisponibles produisent deux défaites sans vainqueur avant le début', () => {
  const result = resolveAdministrativeMatch(pending(), {
    unavailablePlayerId: 'A', reason: 'forfeit', started: false, otherUnavailable: true,
  });
  assert.deepEqual([result.kind, result.result, result.started], ['double_forfeit', null, false]);
  assert.throws(() => resolveAdministrativeMatch(pending(), {
    unavailablePlayerId: 'A', reason: 'forfeit', started: true, otherUnavailable: true,
  }), /décision d’arbitrage/);
});

test('refuse de transformer un bye en forfait', () => {
  const bye = writeMatchOutcome({ p1: 'A', p2: null }, { kind: 'bye', result: null, started: false });
  assert.throws(() => resolveAdministrativeMatch(bye, {
    unavailablePlayerId: 'A', reason: 'absence', started: false,
  }), /bye doit être retiré/);
});

test('retrouve seulement la ronde ouverte et détecte les données déjà saisies', () => {
  const closed = { validated: true, matches: [pending()] };
  const open = { validated: false, matches: [pending('C', 'D')] };
  assert.deepEqual(findOpenRoundMatch([closed, open], 'D').roundIndex, 1);
  assert.equal(findOpenRoundMatch([closed, open], 'A'), null);
  assert.equal(roundHasEnteredResults(open), false);
  open.matches[0].s1 = 1;
  assert.equal(roundHasEnteredResults(open), true);
});

test('cible la première ronde ouverte quand plusieurs rondes manuelles sont préparées', () => {
  const rounds = [
    { validated: false, matches: [pending('A', 'B')] },
    { validated: false, matches: [pending('A', 'C')] },
  ];
  assert.equal(findOpenRoundMatch(rounds, 'A').roundIndex, 0);
});

test('bloque un joueur inactif non résolu dans tous les formats', () => {
  const players = [
    { id: 'A', status: 'active' },
    { id: 'B', status: 'dropped' },
  ];
  const round = { matches: [pending()] };
  assert.ok(analyzeRoundParticipantIntegrity(round, players)
    .some((item) => item.code === 'inactive-player' && item.players.includes('B')));

  round.matches[0] = resolveAdministrativeMatch(round.matches[0], {
    unavailablePlayerId: 'B', reason: 'drop', started: false,
  });
  assert.equal(analyzeRoundParticipantIntegrity(round, players).length, 0);
});

test('une ronde de classement parallèle peut limiter son contrôle à ses participants', () => {
  const players = [
    { id: 'A', status: 'active' },
    { id: 'B', status: 'active' },
    { id: 'C', status: 'active' },
    { id: 'D', status: 'eliminatedcut' },
  ];
  const round = { matches: [pending('A', 'D')] };
  assert.equal(analyzeRoundParticipantIntegrity(round, players, {
    requireAllActive: false,
    allowedInactivePlayerIds: ['D'],
  }).length, 0);
});

test('détecte les blocages d’une ronde composée manuellement sans affecter les byes', () => {
  const players = [
    { id: 'A', name: 'Alice' },
    { id: 'B', name: 'Bob' },
    { id: 'C', name: 'Chloé' },
  ];
  const round = { matches: [pending('A', 'B'), { table: 2, p1: 'C', p2: null, bye: true }] };
  const violations = analyzeManualRoundBlocks(round, [
    { p1: 'B', p2: 'A' },
    { p1: 'C', p2: 'A' },
  ], players);

  assert.deepEqual(violations, [{
    table: 1,
    code: 'manual-block',
    players: ['A', 'B'],
    message: 'Alice et Bob sont bloqués : cette rencontre est interdite.',
  }]);
});
