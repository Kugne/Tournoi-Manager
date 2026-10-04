import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeApplicationSwissRound,
  swissOperationFeedback,
} from '../src/swiss/pairing-analysis.mjs';
import { writeMatchOutcome } from '../src/results/match-outcome.mjs';

const makePlayers = (count = 4) => Array.from({ length: count }, (_, index) => ({
  id: `P${index}`,
  name: `Joueur ${index}`,
  status: 'active',
  faction: index < 2 ? 'Faction A' : 'Faction B',
  compo: index % 3,
  note: index < 2 ? 'Club' : '',
}));

const makeStandings = (count = 4) => Array.from({ length: count }, (_, index) => ({
  id: `P${index}`,
  pts: index < 2 ? 6 : 3,
}));

const analyze = (tournament, roundIndex) => analyzeApplicationSwissRound({
  tournament,
  roundIndex,
  standings: makeStandings(tournament.players.length),
  allegianceForFaction: (faction) => faction === 'Faction A' ? 'Ordre' : 'Chaos',
});

test('une seule analyse produit les alertes et explications des critères actifs', () => {
  const tournament = {
    pairFormat: 'swiss',
    players: makePlayers(),
    blocks: [],
    compoPairing: true,
    noteMatchCriteria: 'separer',
    secondaryCriteria: { mirror: true, allegiance: true },
    roundsData: [
      {
        validated: true,
        matches: [{ p1: 'P0', p2: 'P1' }, { p1: 'P2', p2: 'P3' }],
      },
      {
        validated: false,
        pairingMeta: { manuallyEdited: false },
        matches: [
          { p1: 'P0', p2: 'P1', table: 1 },
          { p1: 'P2', p2: 'P3', table: 2 },
        ],
      },
    ],
  };

  const result = analyze(tournament, 1);
  const first = result.tables[0];
  assert.equal(result.valid, true);
  assert.deepEqual(first.alerts.map((item) => item.code), [
    'rematch', 'mirror', 'compo-gap', 'free-note',
  ]);
  assert.match(first.alerts[0].message, /inévitable dans l’optimum global/);
  assert.match(first.explanation.join(' '), /Critères actifs : points de tournoi, miroirs, allégeances, compo, note libre, diversité des factions/);
  assert.match(first.explanation.join(' '), /déjà affronté 1 fois la faction/);
  assert.equal(first.compromiseLevel, 'Revanches');
});

test('un critère désactivé ne produit ni alerte ni explication active', () => {
  const tournament = {
    pairFormat: 'swiss',
    players: makePlayers(),
    blocks: [],
    compoPairing: false,
    noteMatchCriteria: 'none',
    secondaryCriteria: {},
    roundsData: [{
      validated: false,
      pairingMeta: { manuallyEdited: false },
      matches: [{ p1: 'P0', p2: 'P1', table: 1 }, { p1: 'P2', p2: 'P3', table: 2 }],
    }],
  };

  const result = analyze(tournament, 0);
  assert.deepEqual(result.alerts, []);
  assert.doesNotMatch(result.tables[0].explanation.join(' '), /miroirs|allégeances|compo|note libre/);
  assert.match(result.summary, /sans alerte/);
});

test('une ronde conserve les critères de sa génération après changement des options', () => {
  const tournament = {
    pairFormat: 'swiss',
    players: makePlayers(),
    blocks: [],
    compoPairing: true,
    noteMatchCriteria: 'separate',
    secondaryCriteria: { mirror: true, allegiance: true },
    roundsData: [{
      validated: false,
      pairingMeta: {
        manuallyEdited: false,
        criteria: {
          avoidMirrors: false,
          avoidAlliances: false,
          useCompo: false,
          noteMode: 'none',
        },
      },
      matches: [{ p1: 'P0', p2: 'P1', table: 1 }, { p1: 'P2', p2: 'P3', table: 2 }],
    }],
  };

  const result = analyze(tournament, 0);
  assert.equal(result.exactEngineResult, true);
  assert.equal(result.criteriaChangedSinceGeneration, true);
  assert.deepEqual(result.criteria, tournament.roundsData[0].pairingMeta.criteria);
  assert.deepEqual(result.alerts, []);
  assert.doesNotMatch(result.tables[0].explanation.join(' '), /miroir|allégeance|compo|note libre/i);
});

test('une ronde modifiée manuellement sans alerte n’est pas qualifiée d’optimale', () => {
  const tournament = {
    pairFormat: 'swiss', players: makePlayers(), blocks: [], compoPairing: false,
    noteMatchCriteria: 'none', secondaryCriteria: {},
    roundsData: [{
      validated: false,
      pairingMeta: { manuallyEdited: true },
      matches: [{ p1: 'P0', p2: 'P2', table: 1 }, { p1: 'P1', p2: 'P3', table: 2 }],
    }],
  };
  const result = analyze(tournament, 0);
  assert.equal(result.summary, 'Appariement sans alerte');
});

test('un blocage manuel est une interdiction et non une simple alerte', () => {
  const tournament = {
    pairFormat: 'swiss',
    players: makePlayers(),
    blocks: [{ p1: 'P0', p2: 'P1' }],
    compoPairing: false,
    noteMatchCriteria: 'none',
    secondaryCriteria: {},
    roundsData: [{
      validated: false,
      pairingMeta: { manuallyEdited: true },
      matches: [{ p1: 'P0', p2: 'P1', table: 1 }, { p1: 'P2', p2: 'P3', table: 2 }],
    }],
  };

  const result = analyze(tournament, 0);
  assert.equal(result.valid, false);
  assert.equal(result.forbidden[0].code, 'manual-block');
  assert.equal(result.alerts.some((item) => item.code === 'manual-block'), false);
});

test('refuse doublons, joueurs inactifs, auto-matchs et joueurs actifs manquants', () => {
  const players = makePlayers();
  players[2].status = 'absent';
  const tournament = {
    pairFormat: 'swiss',
    players,
    blocks: [],
    compoPairing: false,
    noteMatchCriteria: 'none',
    secondaryCriteria: {},
    roundsData: [{
      validated: false,
      pairingMeta: { manuallyEdited: true },
      matches: [{ p1: 'P0', p2: 'P1', table: 1 }, { p1: 'P0', p2: 'P2', table: 2 }],
    }],
  };
  const result = analyze(tournament, 0);
  const codes = new Set(result.forbidden.map((item) => item.code));
  assert.equal(result.valid, false);
  assert.ok(codes.has('duplicate-player'));
  assert.ok(codes.has('inactive-player'));
  assert.ok(codes.has('missing-player'));

  tournament.players[2].status = 'active';
  tournament.roundsData[0].matches = [
    { p1: 'P0', p2: 'P0', table: 1 },
    { p1: 'P1', p2: 'P2', table: 2 },
  ];
  const selfMatch = analyze(tournament, 0);
  assert.ok(selfMatch.forbidden.some((item) => item.code === 'self-match'));
});

test('accepte un joueur devenu inactif quand sa table possède un résultat administratif explicite', () => {
  const players = makePlayers();
  players[1].status = 'absent';
  const tournament = {
    pairFormat: 'swiss', players, blocks: [], compoPairing: false,
    noteMatchCriteria: 'none', secondaryCriteria: {},
    roundsData: [{
      validated: false,
      pairingMeta: { manuallyEdited: false },
      matches: [
        writeMatchOutcome({ p1: 'P0', p2: 'P1', table: 1 }, {
          kind: 'administrative_no_show', result: 'p1', started: false, administrativeReason: 'absence',
        }),
        { p1: 'P2', p2: 'P3', table: 2 },
      ],
    }],
  };
  const result = analyze(tournament, 0);
  assert.equal(result.valid, true);
  assert.equal(result.forbidden.some((item) => item.code === 'inactive-player'), false);
});

test('accepte une table résolue puis un statut futur inactif, même s’il ne reste qu’un actif', () => {
  const players = makePlayers(2);
  players[1].status = 'dropped';
  const tournament = {
    pairFormat: 'swiss', players, blocks: [], compoPairing: false,
    noteMatchCriteria: 'none', secondaryCriteria: {},
    roundsData: [{
      validated: false,
      pairingMeta: { manuallyEdited: false },
      matches: [writeMatchOutcome({ p1: 'P0', p2: 'P1', table: 1 }, {
        kind: 'played', result: 'p1', started: true,
      })],
    }],
  };
  const result = analyze(tournament, 0);
  assert.equal(result.valid, true);
  assert.equal(result.forbidden.some((item) => item.code === 'inactive-player'), false);
});

test('une revanche créée manuellement est orange et non présentée comme inévitable', () => {
  const tournament = {
    pairFormat: 'swiss',
    players: makePlayers(),
    blocks: [],
    compoPairing: false,
    noteMatchCriteria: 'none',
    secondaryCriteria: {},
    roundsData: [
      { validated: true, matches: [{ p1: 'P0', p2: 'P1' }, { p1: 'P2', p2: 'P3' }] },
      {
        validated: false,
        pairingMeta: { manuallyEdited: true },
        matches: [{ p1: 'P0', p2: 'P1' }, { p1: 'P2', p2: 'P3' }],
      },
    ],
  };
  const result = analyze(tournament, 1);
  assert.equal(result.alerts[0].level, 'orange');
  assert.equal(result.alerts[0].unavoidable, false);
  assert.match(result.summary, /orange/);
});

test('une note vide est expliquée comme neutre en mode Regrouper', () => {
  const players = makePlayers();
  players[0].note = 'Rookie';
  players[1].note = '';
  const tournament = {
    pairFormat: 'swiss',
    players,
    blocks: [],
    compoPairing: false,
    noteMatchCriteria: 'regrouper',
    secondaryCriteria: { free: true },
    roundsData: [{
      validated: false,
      pairingMeta: { manuallyEdited: false },
      matches: [{ p1: 'P0', p2: 'P1' }, { p1: 'P2', p2: 'P3' }],
    }],
  };
  const result = analyze(tournament, 0);
  assert.match(result.tables[0].explanation.join(' '), /note est vide.*neutre/);
  assert.equal(result.tables[0].alerts.some((item) => item.code === 'free-note'), false);
});

test('un bye répété est expliqué comme inévitable quand tous les joueurs en ont déjà reçu un', () => {
  const players = makePlayers(5);
  const roundsData = players.map((player, index) => ({
    validated: true,
    matches: [
      { p1: player.id, p2: null, bye: true },
      { p1: `P${(index + 1) % 5}`, p2: `P${(index + 2) % 5}` },
    ],
  }));
  roundsData.push({
    validated: false,
    pairingMeta: { manuallyEdited: false },
    matches: [
      { p1: 'P1', p2: 'P2', table: 1 },
      { p1: 'P3', p2: 'P4', table: 2 },
      { p1: 'P0', p2: null, bye: true, table: 3 },
    ],
  });
  const tournament = {
    pairFormat: 'swiss',
    players,
    blocks: [],
    compoPairing: false,
    noteMatchCriteria: 'none',
    secondaryCriteria: {},
    roundsData,
  };

  const result = analyze(tournament, roundsData.length - 1);
  const bye = result.tables.find((table) => table.kind === 'bye');
  assert.equal(bye.alerts[0].code, 'repeated-bye');
  assert.equal(bye.alerts[0].unavoidable, true);
  assert.match(bye.alerts[0].message, /tous les joueurs éligibles/);
});

test('les messages de calcul partagent un catalogue et distinguent les blocages', () => {
  assert.deepEqual(swissOperationFeedback('variant', { status: 'exhausted' }), {
    type: 'info',
    duration: 7000,
    text: 'Toutes les variantes optimales disponibles ont déjà été proposées.',
  });
  const blocked = swissOperationFeedback('initial', {
    status: 'error',
    error: { code: 'NO_PERFECT_MATCHING' },
  }, {
    blockedPairs: [{ p1: 'P0', p2: 'P1' }, { p1: 'P0', p2: 'P2' }],
    playerNames: { P0: 'Alice', P1: 'Bob', P2: 'Absent' },
    activePlayerIds: ['P0', 'P1'],
  });
  assert.equal(blocked.type, 'error');
  assert.match(blocked.text, /blocages actifs/);
  assert.match(blocked.text, /Alice ↔ Bob/);
  assert.doesNotMatch(blocked.text, /Absent/);
});
