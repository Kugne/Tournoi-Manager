import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSwissEngineInput,
  individualSwissView,
  selectSwissBye,
} from '../src/swiss/application-adapter.mjs';
import { analyzeApplicationSwissRound } from '../src/swiss/pairing-analysis.mjs';
import { solveSwissPairing } from '../src/swiss/solve-swiss.mjs';

const player = (id, status = 'active') => ({ id, name: id, status, faction: 'Orks' });

test('la vue individuelle par défaut reprend joueurs, rondes et blocages du tournoi', () => {
  const tournament = { players: [player('a')], roundsData: [{ matches: [] }], blocks: [{ p1: 'a', p2: 'b' }] };
  const view = individualSwissView(tournament);
  assert.equal(view.participants, tournament.players);
  assert.equal(view.rounds, tournament.roundsData);
  assert.equal(view.blocks, tournament.blocks);
  assert.equal(view.options, null);
});

test('une vue par équipes est appariée par le même moteur sans toucher aux joueurs', () => {
  // Le tournoi contient des joueurs (miroirs activés), mais la vue n'expose que les équipes.
  const tournament = {
    players: [player('j1'), player('j2')],
    roundsData: [],
    secondaryCriteria: { mirror: true },
  };
  const teams = ['rouge', 'bleue', 'verte', 'jaune', 'noire'].map((id) => ({ id, status: 'active' }));
  const view = {
    participants: teams,
    rounds: [
      { validated: true, matches: [
        { p1: 'rouge', p2: 'bleue' },
        { p1: 'verte', p2: 'jaune' },
        { p1: 'noire', p2: null, bye: true },
      ] },
      { validated: false, matches: [] },
    ],
    blocks: [{ p1: 'rouge', p2: 'verte' }],
    options: { avoidMirrors: false, avoidAlliances: false, useCompo: false, noteMode: 'none' },
  };
  const standings = [
    { id: 'rouge', pts: 3 }, { id: 'verte', pts: 3 }, { id: 'noire', pts: 3 },
    { id: 'bleue', pts: 0 }, { id: 'jaune', pts: 0 },
  ];

  assert.equal(selectSwissBye({ tournament, roundIndex: 1, standings, view }), 'jaune');
  const input = buildSwissEngineInput({ tournament, roundIndex: 1, standings, view });
  assert.equal(input.byePlayerId, 'jaune');
  assert.deepEqual(input.participants.map((team) => team.id).sort(), ['bleue', 'noire', 'rouge', 'verte']);
  assert.deepEqual(input.context.history.map(({ a, b }) => [a, b]), [['rouge', 'bleue'], ['verte', 'jaune']]);
  assert.deepEqual(input.context.blockedPairs, [{ a: 'rouge', b: 'verte' }]);
  assert.equal(input.context.options.avoidMirrors, false);

  const { pairs } = solveSwissPairing(input.participants, input.context);
  const keys = pairs.map(({ a, b }) => [a, b].sort().join('-')).sort();
  // rouge/verte bloqués et rouge/bleue déjà joué : rouge affronte noire, verte affronte bleue.
  assert.deepEqual(keys, ['bleue-verte', 'noire-rouge']);
});

test('l’analyse d’une ronde lit la même vue que le moteur', () => {
  const teams = ['A', 'B'].map((id) => ({ id, name: `Équipe ${id}`, status: 'active' }));
  const view = {
    participants: teams,
    rounds: [{ validated: false, matches: [{ p1: 'A', p2: 'B', table: 1 }] }],
    blocks: [],
    options: { avoidMirrors: false, avoidAlliances: false, useCompo: false, noteMode: 'none' },
  };
  const analysis = analyzeApplicationSwissRound({
    tournament: { players: [], roundsData: [] },
    roundIndex: 0,
    standings: [{ id: 'A', pts: 0 }, { id: 'B', pts: 0 }],
    view,
  });
  assert.equal(analysis.tables.length, 1);
  assert.equal(analysis.tables[0].forbidden.length, 0);
});
