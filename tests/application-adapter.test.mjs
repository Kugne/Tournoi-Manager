import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildApplicationMatches,
  buildSwissEngineInput,
  selectSwissBye,
} from '../src/swiss/application-adapter.mjs';
import { solveSwissPairing } from '../src/swiss/solve-swiss.mjs';

const players = (count = 4) => Array.from({ length: count }, (_, index) => ({
  id: `P${index}`,
  name: `Joueur ${index}`,
  status: 'active',
  faction: `F${index % 2}`,
  compo: index % 3,
  note: index < 2 ? 'Club A' : '',
}));

const standings = (count = 4) => Array.from({ length: count }, (_, index) => ({
  id: `P${index}`,
  pts: count - index,
  sos: index * 10,
}));

const tournament = (count = 4) => ({
  players: players(count),
  roundsData: [],
  blocks: [],
  compoPairing: true,
  noteMatchCriteria: 'separate',
  secondaryCriteria: { mirror: true, allegiance: true, compo: true },
});

test('traduit uniquement les données métier nécessaires au moteur exact', () => {
  const source = tournament();
  source.blocks.push({ id: 'B1', p1: 'P0', p2: 'P3' });
  source.roundsData.push({
    validated: true,
    matches: [{ p1: 'P0', p2: 'P2', result: 'p1' }, { p1: 'P1', p2: 'P3', result: 'p2' }],
  });
  const ranking = standings();
  ranking[0].pts = 4.5; // inclut déjà les bonus/malus de l'application
  const input = buildSwissEngineInput({
    tournament: source,
    roundIndex: 1,
    standings: ranking,
    allegianceForFaction: (faction) => faction === 'F0' ? 'Ordre' : 'Chaos',
  });

  assert.equal(input.byePlayerId, null);
  assert.deepEqual(input.participants[0], {
    id: 'P0', points: 4.5, faction: 'F0', allegiance: 'Ordre', compo: 0, note: 'Club A',
  });
  assert.deepEqual(input.context.history, [
    { a: 'P0', b: 'P2', round: 1 },
    { a: 'P1', b: 'P3', round: 1 },
  ]);
  assert.deepEqual(input.context.blockedPairs, [{ a: 'P0', b: 'P3' }]);
  assert.deepEqual(input.context.options, {
    avoidMirrors: true,
    avoidAlliances: true,
    useCompo: true,
    noteMode: 'separate',
  });
  assert.equal(input.participants[0].points, ranking[0].pts);
  assert.equal('sos' in input.participants[0], false);
});

test('exclut la ronde rerollée de l’historique et des comptes de bye', () => {
  const source = tournament(5);
  source.roundsData = [
    { validated: true, matches: [{ p1: 'P0', p2: 'P1' }, { p1: 'P4', bye: true }] },
    { matches: [{ p1: 'P0', p2: 'P2' }, { p1: 'P3', bye: true }] },
  ];
  const input = buildSwissEngineInput({ tournament: source, roundIndex: 1, standings: standings(5) });
  assert.equal(input.byePlayerId, 'P3');
  assert.deepEqual(input.context.history, [{ a: 'P0', b: 'P1', round: 1 }]);
});

test('un reroll conserve son bye tant que le joueur reste actif', () => {
  const source = tournament(5);
  source.roundsData = [{ matches: [{ p1: 'P1', bye: true }] }];
  assert.equal(selectSwissBye({ tournament: source, roundIndex: 0, standings: standings(5) }), 'P1');
});

test('le bye va au moins bien classé parmi ceux qui en ont reçu le moins', () => {
  const source = tournament(5);
  source.roundsData = [{ validated: true, matches: [{ p1: 'P4', bye: true }] }];
  assert.equal(selectSwissBye({ tournament: source, roundIndex: 1, standings: standings(5) }), 'P3');
});

test('les options désactivées sont absentes du calcul applicatif', () => {
  const source = tournament();
  source.compoPairing = false;
  source.players[0].compo = 'valeur historique invalide mais inactive';
  source.noteMatchCriteria = 'none';
  source.secondaryCriteria = { compo: true }; // ancien drapeau devenu obsolète
  const input = buildSwissEngineInput({ tournament: source, roundIndex: 0, standings: standings() });
  assert.deepEqual(input.context.options, {
    avoidMirrors: false,
    avoidAlliances: false,
    useCompo: false,
    noteMode: 'none',
  });
  assert.equal(input.participants[0].compo, 'valeur historique invalide mais inactive');
});

test('ignore les rondes non validées dans l’historique et le compte des byes', () => {
  const source = tournament(5);
  source.roundsData = [{
    validated: false,
    matches: [{ p1: 'P0', p2: 'P1' }, { p1: 'P4', bye: true }],
  }];
  const input = buildSwissEngineInput({ tournament: source, roundIndex: 1, standings: standings(5) });
  assert.deepEqual(input.context.history, []);
  assert.equal(input.byePlayerId, 'P4');
});

test('ne calcule pas les allégeances quand leur option est désactivée', () => {
  const source = tournament();
  source.secondaryCriteria.allegiance = false;
  assert.doesNotThrow(() => buildSwissEngineInput({
    tournament: source,
    roundIndex: 0,
    standings: standings(),
    allegianceForFaction: () => { throw new Error('ne doit pas être appelée'); },
  }));
});

test('convertit atomiquement le résultat et numérote les meilleures tables en premier', () => {
  const matches = buildApplicationMatches({
    engineResult: { pairs: [{ a: 'P2', b: 'P3' }, { a: 'P0', b: 'P1' }] },
    standings: standings(5),
    byePlayerId: 'P4',
    byeScenario: 12.5,
    byeFree: 3,
  });
  assert.deepEqual(matches.map((match) => [match.p1, match.p2, match.table]), [
    ['P0', 'P1', 1],
    ['P2', 'P3', 2],
    ['P4', null, 3],
  ]);
  assert.equal(matches[0].result, null);
  assert.equal(matches[0].outcomeVersion, 1);
  assert.equal(matches[0].kind, null);
  assert.equal(matches[2].result, null);
  assert.equal(matches[2].kind, 'bye');
  assert.equal(matches[2].started, false);
  assert.equal(matches[2].byeScenario, 12.5);
});

test('refuse les contextes incomplets sans muter le tournoi', () => {
  const source = tournament(1);
  const before = structuredClone(source);
  assert.throws(
    () => buildSwissEngineInput({ tournament: source, roundIndex: 0, standings: standings(1) }),
    /au moins deux joueurs actifs/,
  );
  assert.deepEqual(source, before);
});

test('refuse un classement incomplet même pour une seule table', () => {
  assert.throws(
    () => buildApplicationMatches({
      engineResult: { pairs: [{ a: 'P0', b: 'P1' }] },
      standings: [{ id: 'P0', pts: 1 }],
    }),
    /Classement incomplet/,
  );
});

test('alimente réellement le solveur puis restitue le format de ronde historique', () => {
  const source = tournament();
  source.compoPairing = false;
  source.secondaryCriteria = {};
  source.blocks = [{ p1: 'P0', p2: 'P1' }];
  const ranking = standings();
  const input = buildSwissEngineInput({ tournament: source, roundIndex: 0, standings: ranking });
  const result = solveSwissPairing(input.participants, input.context);
  const matches = buildApplicationMatches({ engineResult: result, standings: ranking });
  assert.equal(matches.length, 2);
  assert.equal(matches.some((match) => new Set([match.p1, match.p2]).has('P0')
    && new Set([match.p1, match.p2]).has('P1')), false);
  assert.deepEqual(new Set(matches.flatMap((match) => [match.p1, match.p2])), new Set(['P0', 'P1', 'P2', 'P3']));
});
