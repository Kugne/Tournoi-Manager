import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareBracketDepth,
  compareByTiebreaks,
  individualTiebreakOrder,
  rankStandings,
} from '../src/results/standings-ranking.mjs';

const ids = (rows) => rows.map((row) => row.id);

test('ordre individuel : points, scénario, score libre optionnel, SOS', () => {
  assert.deepEqual(individualTiebreakOrder(), ['pts', 'scenario', 'sos']);
  assert.deepEqual(individualTiebreakOrder({ hasFreeScore: true }), ['pts', 'scenario', 'free', 'sos']);
});

test('chaque départage ne sert qu’en cas d’égalité sur les précédents', () => {
  const rows = [
    { id: 'a', status: 'active', pts: 3, scenario: 10, sos: 9 },
    { id: 'b', status: 'active', pts: 6, scenario: 0, sos: 0 },
    { id: 'c', status: 'active', pts: 3, scenario: 12, sos: 0 },
    { id: 'd', status: 'active', pts: 3, scenario: 10, sos: 10 },
  ];
  assert.deepEqual(ids(rankStandings(rows, { tiebreaks: ['pts', 'scenario', 'sos'] })), ['b', 'c', 'd', 'a']);
});

test('le tri ne modifie pas le tableau reçu et reste stable sur les égalités parfaites', () => {
  const rows = [{ id: 'x', pts: 1 }, { id: 'y', pts: 1 }, { id: 'z', pts: 2 }];
  const ranked = rankStandings(rows, { tiebreaks: ['pts'] });
  assert.deepEqual(ids(ranked), ['z', 'x', 'y']);
  assert.deepEqual(ids(rows), ['x', 'y', 'z']);
});

test('la priorité de statut passe avant les points, et peut être désactivée', () => {
  const rows = [
    { id: 'inscrit', status: 'inscrit', pts: 9 },
    { id: 'cut', status: 'eliminatedcut', pts: 12 },
    { id: 'actif', status: 'active', pts: 0 },
  ];
  assert.deepEqual(ids(rankStandings(rows, { tiebreaks: ['pts'] })), ['actif', 'inscrit', 'cut']);
  assert.deepEqual(ids(rankStandings(rows, { tiebreaks: ['pts'], statusPriority: null })), ['cut', 'inscrit', 'actif']);
});

test('la profondeur du tableau prime, puis le rang Suisse figé départage', () => {
  const rows = [
    { id: 'a', status: 'eliminatedcut', pts: 9, swissRank: 2 },
    { id: 'b', status: 'eliminatedcut', pts: 9, swissRank: 1 },
    { id: 'c', status: 'active', pts: 0, swissRank: 3 },
  ];
  const bracketDepth = { c: { champion: true } };
  assert.deepEqual(ids(rankStandings(rows, { tiebreaks: ['pts'], bracketDepth, fallbackField: 'swissRank' })), ['c', 'b', 'a']);
});

test('comparaison de profondeur : finaliste, troisième, victoires puis élimination', () => {
  assert.ok(compareBracketDepth({ runnerUp: true }, { thirdPlaceWin: true }) < 0);
  assert.ok(compareBracketDepth({ wins: 2, eliminatedAt: 1 }, { wins: 1, eliminatedAt: 3 }) < 0);
  assert.ok(compareBracketDepth({ wins: 1, eliminatedAt: 2 }, { wins: 1, eliminatedAt: 1 }) < 0);
  assert.ok(compareBracketDepth({ wins: 1, eliminatedAt: 2, thirdPlaceLoss: true }, { wins: 1, eliminatedAt: 2 }) > 0);
  assert.equal(compareBracketDepth(undefined, undefined), 0);
});

test('un classement par équipes n’est qu’une autre liste de départages', () => {
  const teams = [
    { id: 'rouge', matchPts: 3, individualPts: 15, buchholz: 9 },
    { id: 'bleue', matchPts: 6, individualPts: 12, buchholz: 3 },
    { id: 'verte', matchPts: 6, individualPts: 12, buchholz: 6 },
  ];
  const order = ['matchPts', 'individualPts', 'buchholz'];
  assert.deepEqual(ids(rankStandings(teams, { tiebreaks: order, statusPriority: null })), ['verte', 'bleue', 'rouge']);
  assert.equal(compareByTiebreaks(order)(teams[1], teams[2]), 3);
});
