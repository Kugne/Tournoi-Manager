import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareObjective,
  enumeratePairings,
  objectiveForPairing,
  pairingSignature,
  solveOptimalPairings,
} from './oracle-suisse.mjs';

const players = (ids, extra = {}) => ids.map((id, index) => ({
  id,
  points: 0,
  faction: `Faction-${index}`,
  allegiance: `Alliance-${index}`,
  compo: 0,
  note: '',
  ...extra[id],
}));

test('interdictions absolues : aucun blocage manuel ne peut être violé', () => {
  const participants = players(['A', 'B', 'C', 'D']);
  const result = solveOptimalPairings(participants, { blockedPairs: [['A', 'B']] });
  assert.equal(result.candidates.length, 2);
  assert.ok(result.optimal.every((pairing) => !pairing.signature.includes('A~B')));
});

test('bye fixé : il apparaît dans la signature et le couplage reste exhaustif', () => {
  const participants = players(['A', 'B', 'C', 'D', 'E']);
  const result = solveOptimalPairings(participants, { byeId: 'E' });
  assert.equal(result.candidates.length, 3);
  assert.ok(result.signatures.every((signature) => signature.includes('BYE:E')));
  assert.equal(new Set(result.signatures).size, result.signatures.length);
  assert.throws(() => enumeratePairings(participants), /nombre pair/);
});

test('une ronde composée uniquement d’un joueur avec bye est refusée', () => {
  const participant = players(['A']);
  assert.throws(
    () => solveOptimalPairings(participant, { byeId: 'A' }),
    /Au moins deux participants/,
  );
});

test('les revanches sont minimisées avant tout critère sportif secondaire', () => {
  const participants = players(['A', 'B', 'C', 'D']);
  const result = solveOptimalPairings(participants, {
    history: [{ a: 'A', b: 'B', round: 1 }],
  });
  assert.ok(result.optimal.every((pairing) => !pairing.signature.includes('A~B')));
  assert.equal(result.bestObjective.details.rematches.count, 0);
});

test('une revanche devient nécessaire quand elle est la seule solution', () => {
  const participants = players(['A', 'B']);
  const result = solveOptimalPairings(participants, {
    history: [{ a: 'A', b: 'B', round: 1 }],
  });
  assert.equal(result.optimal.length, 1);
  assert.equal(result.bestObjective.details.rematches.count, 1);
  assert.deepEqual(result.bestObjective.details.rematches.profiles, [1]);
});

test('les revanches inévitables évitent d’abord les adversaires rencontrés plusieurs fois', () => {
  const participants = players(['A', 'B', 'C', 'D']);
  const result = solveOptimalPairings(participants, {
    history: [
      { a: 'A', b: 'B', round: 1 }, { a: 'A', b: 'B', round: 2 },
      { a: 'C', b: 'D', round: 1 },
      { a: 'A', b: 'C', round: 2 }, { a: 'B', b: 'D', round: 2 },
      { a: 'A', b: 'D', round: 3 }, { a: 'B', b: 'C', round: 3 },
    ],
  });
  assert.ok(result.optimal.every((pairing) => !pairing.signature.includes('A~B')));
  assert.deepEqual(result.bestObjective.details.rematches.profiles, [1, 1]);
});

test('à profil de revanches égal, la confrontation la plus récente est minimisée en premier', () => {
  const participants = players(['A', 'B', 'C', 'D']);
  const result = solveOptimalPairings(participants, {
    history: [
      { a: 'A', b: 'B', round: 6 }, { a: 'C', b: 'D', round: 1 },
      { a: 'A', b: 'C', round: 4 }, { a: 'B', b: 'D', round: 4 },
      { a: 'A', b: 'D', round: 2 }, { a: 'B', b: 'C', round: 3 },
    ],
  });
  assert.deepEqual(result.signatures, ['A~D|B~C']);
  assert.deepEqual(result.bestObjective.details.rematches.recency, [3, 2]);
});

test('les écarts de points sont comparés du pire au meilleur', () => {
  const participants = players(['A', 'B', 'C', 'D', 'E', 'F'], {
    A: { points: 3 }, B: { points: 2 }, C: { points: 2 },
    D: { points: 1 }, E: { points: 1 }, F: { points: 1 },
  });
  const result = solveOptimalPairings(participants);
  assert.deepEqual(result.bestObjective.details.pointGaps, [1, 1, 0]);
  assert.ok(result.optimal.every((pairing) => pairing.objective.details.pointGaps[0] === 1));
});

test('la compo reprend le même principe, après les critères supérieurs', () => {
  const participants = players(['A', 'B', 'C', 'D'], {
    A: { compo: 0 }, B: { compo: 1 }, C: { compo: 1 }, D: { compo: 2 },
  });
  const good = [{ a: 'A', b: 'B' }, { a: 'C', b: 'D' }];
  const bad = [{ a: 'A', b: 'D' }, { a: 'B', b: 'C' }];
  const goodObjective = objectiveForPairing(participants, { pairs: good }, { options: { useCompo: true } });
  const badObjective = objectiveForPairing(participants, { pairs: bad }, { options: { useCompo: true } });
  assert.deepEqual(goodObjective.details.compoGaps, [1, 1]);
  assert.deepEqual(badObjective.details.compoGaps, [2, 0]);
  assert.equal(compareObjective(goodObjective, badObjective), -1);
  assert.equal(goodObjective.details.pointGaps[0], badObjective.details.pointGaps[0]);
});

test('la hiérarchie miroir puis allégeance précède la compo et les notes', () => {
  const participants = players(['A', 'B', 'C', 'D'], {
    A: { faction: 'F1', allegiance: 'X', compo: 0, note: 'Club' },
    B: { faction: 'F1', allegiance: 'Y', compo: 0, note: 'Club' },
    C: { faction: 'F2', allegiance: 'X', compo: 2, note: 'Autre' },
    D: { faction: 'F3', allegiance: 'Y', compo: 2, note: 'Autre' },
  });
  const result = solveOptimalPairings(participants, {
    options: {
      avoidMirrors: true,
      avoidAlliances: true,
      useCompo: true,
      noteMode: 'regrouper',
    },
  });
  assert.deepEqual(result.signatures, ['A~D|B~C']);
  assert.equal(result.bestObjective.details.mirrorCount, 0);
  assert.equal(result.bestObjective.details.allegianceCount, 0);
});

test('les options désactivées et les valeurs vides restent strictement neutres', () => {
  const participants = players(['A', 'B', 'C', 'D'], {
    A: { faction: '', allegiance: '', compo: 0, note: 'Équipe A' },
    B: { faction: '', allegiance: '', compo: 2, note: 'equipe   a' },
    C: { faction: 'F1', allegiance: 'X', compo: 0, note: '' },
    D: { faction: 'F2', allegiance: 'Y', compo: 2, note: '' },
  });
  const neutral = solveOptimalPairings(participants, {
    history: [{ a: 'A', b: 'B', round: 1 }],
    options: { avoidMirrors: true, avoidAlliances: true, useCompo: false },
  });
  assert.deepEqual(neutral.signatures, ['A~C|B~D', 'A~D|B~C']);
  assert.equal(neutral.bestObjective.details.mirrorCount, 0);
  assert.equal(neutral.bestObjective.details.allegianceCount, 0);
  assert.deepEqual(neutral.bestObjective.details.compoGaps, []);
  assert.deepEqual(neutral.bestObjective.details.factionProfile, [0, 0, 0, 0]);
  const normalizedNotes = solveOptimalPairings(participants, {
    options: { noteMode: 'regrouper' },
  });
  assert.ok(normalizedNotes.optimal.some((pairing) => pairing.signature.includes('A~B')));
});

test('les notes libres Regrouper et Séparer restent sociales', () => {
  const participants = players(['A', 'B', 'C', 'D'], {
    A: { note: 'Rookies' }, B: { note: ' rookies ' },
    C: { note: 'Vétérans' }, D: { note: 'Autres' },
  });
  const separate = solveOptimalPairings(participants, { options: { noteMode: 'separer' } });
  const regroup = solveOptimalPairings(participants, { options: { noteMode: 'regrouper' } });
  assert.equal(separate.bestObjective.details.noteMatches, 0);
  assert.equal(regroup.bestObjective.details.noteMatches, 1);
  assert.ok(regroup.optimal.some((pairing) => pairing.signature.includes('A~B')));
});

test('la diversité des factions réduit les expositions historiques évitables', () => {
  const participants = players(['A', 'B', 'C', 'D'], {
    A: { faction: 'Rouge' }, B: { faction: 'Bleu' },
    C: { faction: 'Bleu' }, D: { faction: 'Jaune' },
  });
  const result = solveOptimalPairings(participants, {
    blockedPairs: [['A', 'C']],
    history: [{ a: 'A', b: 'C', round: 1 }, { a: 'A', b: 'C', round: 2 }],
  });
  assert.deepEqual(result.bestObjective.details.factionProfile, [0, 0, 0, 0]);
  assert.ok(result.optimal.every((pairing) => pairing.signature.includes('A~D')));
});

test('la signature est stable, non orientée, et les variantes équivalentes sont conservées', () => {
  assert.equal(pairingSignature({ pairs: [{ a: 'B', b: 'A' }, { a: 'D', b: 'C' }] }), 'A~B|C~D');
  const participants = players(['A', 'B', 'C', 'D']);
  const result = solveOptimalPairings(participants);
  assert.equal(result.signatures.length, 3);
  assert.deepEqual(result.signatures, [...result.signatures].sort());
  assert.equal(new Set(result.signatures).size, 3);
});
