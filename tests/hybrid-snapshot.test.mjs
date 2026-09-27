import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHybridSwissSnapshot,
  HYBRID_SWISS_SNAPSHOT_VERSION,
  isValidHybridSwissSnapshot,
  restoreHybridSwissStandings,
} from '../src/swiss/hybrid-snapshot.mjs';

const standings = () => [
  { id: 'A', name: 'Alice', status: 'active', pts: 7.5, scenario: 31, free: 2, sos: 12, wins: 2, draws: 1, losses: 0, bonusMalus: 0.5 },
  { id: 'B', name: 'Bob', status: 'active', pts: 6, scenario: 28, free: 1, sos: 15, wins: 2, draws: 0, losses: 1, bonusMalus: 0 },
  { id: 'C', name: 'Chloé', status: 'active', pts: 3, scenario: 22, free: 0, sos: 18, wins: 1, draws: 0, losses: 2, bonusMalus: -1 },
];

test('fige exactement le classement Suisse, les qualifiés et les seeds sans mutation', () => {
  const source = standings();
  const before = structuredClone(source);
  const snapshot = createHybridSwissSnapshot({
    standings: source,
    cutStartIndex: 3,
    eligiblePlayerIds: ['A', 'B', 'C'],
    qualifiedPlayerIds: ['B', 'A'],
    capturedAt: '2026-09-27T12:00:00.000Z',
  });

  assert.equal(snapshot.schemaVersion, HYBRID_SWISS_SNAPSHOT_VERSION);
  assert.equal(snapshot.standings[0].pts, 7.5);
  assert.equal(snapshot.standings[0].swissRank, 1);
  assert.equal(snapshot.standings[0].seed, 2);
  assert.equal(snapshot.standings[1].seed, 1);
  assert.equal(snapshot.standings[2].qualifiedAtCut, false);
  assert.deepEqual(source, before);
  assert.equal(isValidHybridSwissSnapshot(snapshot, 3), true);
  assert.equal(isValidHybridSwissSnapshot(snapshot, 4), false);
});

test('restaure les valeurs figées avec les métadonnées et statuts vivants', () => {
  const snapshot = createHybridSwissSnapshot({
    standings: standings(),
    cutStartIndex: 3,
    eligiblePlayerIds: ['A', 'B', 'C'],
    qualifiedPlayerIds: ['A', 'B'],
  });
  const players = [
    { id: 'A', name: 'Alice renommée', faction: 'Rouge', status: 'active', compo: 2, penalties: [{ points: 99 }] },
    { id: 'B', name: 'Bob', faction: 'Bleu', status: 'eliminatedcut', compo: null },
    { id: 'C', name: 'Chloé', faction: 'Vert', status: 'eliminatedcut', compo: 1 },
  ];
  const restored = restoreHybridSwissStandings({ players, snapshot, normalizeStatus: (value) => value });

  assert.equal(restored[0].name, 'Alice renommée');
  assert.equal(restored[0].pts, 7.5);
  assert.equal(restored[0].bonusMalus, 0.5);
  assert.equal(restored[1].status, 'eliminatedcut');
  assert.equal(restored[1].cutSeed, 2);
  assert.equal(restored[2].qualifiedAtCut, false);
});

test('refuse versions, nombres, identifiants et qualifiés invalides', () => {
  assert.throws(() => createHybridSwissSnapshot({ standings: [], cutStartIndex: 0 }), /non vide/);
  assert.throws(() => createHybridSwissSnapshot({
    standings: [{ id: 'A', pts: Number.NaN }, { id: 'A', pts: 0 }],
    cutStartIndex: 0,
  }), /dupliqués/);
  assert.throws(() => createHybridSwissSnapshot({
    standings: standings(), cutStartIndex: 3, qualifiedPlayerIds: ['inconnu'],
  }), /absent/);
  assert.throws(() => createHybridSwissSnapshot({
    standings: standings(), cutStartIndex: 3, eligiblePlayerIds: ['A'], qualifiedPlayerIds: ['B'],
  }), /non éligible/);
  const snapshot = createHybridSwissSnapshot({ standings: standings(), cutStartIndex: 3 });
  snapshot.schemaVersion = 999;
  assert.equal(isValidHybridSwissSnapshot(snapshot), false);
  assert.throws(() => restoreHybridSwissStandings({ players: [], snapshot }), /invalide/);
});

test('refuse une photographie qui omet un joueur ou contient un joueur orphelin', () => {
  const snapshot = createHybridSwissSnapshot({ standings: standings(), cutStartIndex: 3 });
  const players = standings().map((standing) => ({ id: standing.id }));
  snapshot.standings.pop();
  assert.equal(isValidHybridSwissSnapshot(snapshot, 3, players.map((player) => player.id)), false);
  assert.throws(() => restoreHybridSwissStandings({ players, snapshot }), /incomplète/);

  const orphan = createHybridSwissSnapshot({ standings: standings(), cutStartIndex: 3 });
  orphan.standings[2].playerId = 'inconnu';
  assert.equal(isValidHybridSwissSnapshot(orphan, 3, players.map((player) => player.id)), false);

  const duplicatedPlayers = ['A', 'A', 'C'];
  assert.equal(isValidHybridSwissSnapshot(
    createHybridSwissSnapshot({ standings: standings(), cutStartIndex: 3 }),
    3,
    duplicatedPlayers,
  ), false);
});
