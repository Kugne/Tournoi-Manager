import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSwissEngineInput } from '../src/swiss/application-adapter.mjs';
import {
  engineSignatureFromMatches,
  runInitialSwissPairing,
  runNextSwissPairingVariant,
} from '../src/swiss/application-runner.mjs';
import { enumerateOptimalVariants } from '../src/swiss/optimal-variants.mjs';
import { solveSwissPairing } from '../src/swiss/solve-swiss.mjs';

const makePlayers = (count) => Array.from({ length: count }, (_, index) => ({
  id: `P${index + 1}`,
  name: `Joueur ${index + 1}`,
  status: 'active',
  faction: `Faction ${index % 4}`,
  compo: index % 3,
  note: index < 3 ? 'Rookies' : '',
}));

const makeStandings = (players, points = () => 0) => players.map((player, index) => ({
  id: player.id,
  pts: points(index),
}));

const exactExecutor = {
  async run({ participants, context }) {
    return { status: 'success', result: solveSwissPairing(participants, context) };
  },
};

const variantExecutor = {
  async run({ participants, context, excludedSignatures }) {
    return {
      status: 'success',
      result: enumerateOptimalVariants(participants, context, {
        excludedSignatures,
        maxVariants: 1,
      }),
    };
  },
};

test('le parcours applicatif couvre les huit effectifs Suisse de référence', async () => {
  for (const count of [2, 3, 4, 5, 8, 16, 32, 64]) {
    const players = makePlayers(count);
    const tournament = {
      id: `T${count}`,
      pairFormat: 'swiss',
      players,
      roundsData: [],
      blocks: [],
      compoPairing: true,
      noteMatchCriteria: 'separate',
      secondaryCriteria: { mirror: true, allegiance: false, compo: true, free: 'separate' },
    };
    const before = structuredClone(tournament);
    const outcome = await runInitialSwissPairing({
      tournament,
      roundIndex: 0,
      standings: makeStandings(players, (index) => Math.floor((count - index - 1) / 4)),
      executor: exactExecutor,
    });

    assert.equal(outcome.status, 'success', `${count} joueurs`);
    assert.equal(outcome.matches.length, Math.ceil(count / 2), `${count} joueurs`);
    assert.equal(outcome.matches.filter((match) => match.bye).length, count % 2, `${count} joueurs`);
    assert.equal(
      new Set(outcome.matches.flatMap((match) => match.bye ? [match.p1] : [match.p1, match.p2])).size,
      count,
      `${count} joueurs`,
    );
    assert.deepEqual(tournament, before, `${count} joueurs : la source ne doit pas être migrée en place`);
  }
});

test('un tournoi V1.9.32 sérialisé sans métadonnées produit la ronde suivante sans réécrire le passé', async () => {
  const players = makePlayers(5);
  const legacyTournament = JSON.parse(JSON.stringify({
    id: 'legacy-v1.9.32',
    name: 'Ancienne sauvegarde',
    pairFormat: 'swiss',
    scoring: { win: 3, draw: 1, loss: 0 },
    players,
    blocks: [{ id: 'B1', p1: 'P1', p2: 'P3' }],
    compoPairing: true,
    noteMatchCriteria: 'group',
    secondaryCriteria: { compo: true, free: 'group', allegiance: false, mirror: true },
    roundsData: [{
      validated: true,
      scenarioName: 'Scénario historique',
      scenarioDesc: 'Texte conservé',
      matches: [
        { p1: 'P1', p2: 'P2', result: 'p1', s1: 17, s2: 11, f1: 1, f2: 0, table: 1 },
        { p1: 'P3', p2: 'P4', result: 'draw', s1: 14, s2: 14, f1: 0, f2: 0, table: 2 },
        { p1: 'P5', p2: null, bye: true, result: 'bye', byeScenario: 14, byeFree: 0, table: 3 },
      ],
    }],
  }));
  const before = structuredClone(legacyTournament);
  const ranking = makeStandings(players, (index) => [3, 0, 1, 1, 3][index]);
  const input = buildSwissEngineInput({ tournament: legacyTournament, roundIndex: 1, standings: ranking });

  assert.deepEqual(input.context.history, [
    { a: 'P1', b: 'P2', round: 1 },
    { a: 'P3', b: 'P4', round: 1 },
  ]);
  assert.deepEqual(input.context.blockedPairs, [{ a: 'P1', b: 'P3' }]);
  assert.deepEqual(input.context.options, {
    avoidMirrors: true,
    avoidAlliances: false,
    useCompo: true,
    noteMode: 'group',
  });
  assert.deepEqual(input.excludedSignatures, []);

  const outcome = await runInitialSwissPairing({
    tournament: legacyTournament,
    roundIndex: 1,
    standings: ranking,
    executor: exactExecutor,
  });
  assert.equal(outcome.status, 'success');
  assert.equal(outcome.byePlayerId, 'P4');
  assert.equal(outcome.matches.some((match) => !match.bye
    && new Set([match.p1, match.p2]).has('P1')
    && new Set([match.p1, match.p2]).has('P3')), false);
  assert.deepEqual(legacyTournament, before);
});

test('le premier reroll d’une ronde ancienne exclut sa combinaison sans inventer de métadonnées', async () => {
  const players = makePlayers(4).map((player) => ({ ...player, faction: '', compo: null, note: '' }));
  const legacyTournament = {
    id: 'legacy-open-round',
    pairFormat: 'swiss',
    players,
    roundsData: [{
      validated: false,
      scenarioName: 'Ronde ouverte historique',
      matches: [
        { p1: 'P1', p2: 'P2', result: null, s1: 0, s2: 0, f1: 0, f2: 0, table: 1 },
        { p1: 'P3', p2: 'P4', result: null, s1: 0, s2: 0, f1: 0, f2: 0, table: 2 },
      ],
    }],
    blocks: [],
    compoPairing: false,
    noteMatchCriteria: 'none',
    secondaryCriteria: { compo: false, free: 'none', allegiance: false, mirror: false },
  };
  const before = structuredClone(legacyTournament);
  const currentSignature = engineSignatureFromMatches(legacyTournament.roundsData[0].matches);
  const outcome = await runNextSwissPairingVariant({
    tournament: legacyTournament,
    roundIndex: 0,
    standings: makeStandings(players),
    executor: variantExecutor,
  });

  assert.equal(outcome.status, 'success');
  assert.notEqual(outcome.engineSignature, currentSignature);
  assert.deepEqual(outcome.seenSignatures, [currentSignature, outcome.engineSignature]);
  assert.equal('pairingMeta' in legacyTournament.roundsData[0], false);
  assert.equal('swissPairingSignatures' in legacyTournament.roundsData[0], false);
  assert.deepEqual(legacyTournament, before);
});

test('les champs historiques et modernes suivent une précédence explicite sans mutation', () => {
  const players = makePlayers(4);
  const ranking = makeStandings(players);
  const modern = {
    players,
    roundsData: [],
    blocks: [],
    compoPairing: false,
    noteMatchCriteria: 'none',
    secondaryCriteria: { compo: true, free: 'group', allegiance: false, mirror: false },
  };
  const legacy = {
    players,
    roundsData: [],
    blocks: [],
    secondaryCriteria: { compo: true, free: 'separate', allegiance: false, mirror: false },
  };
  const withoutCriteria = {
    players,
    roundsData: [],
    blocks: [],
  };
  const modernBefore = structuredClone(modern);
  const legacyBefore = structuredClone(legacy);
  const withoutCriteriaBefore = structuredClone(withoutCriteria);

  const modernInput = buildSwissEngineInput({ tournament: modern, roundIndex: 0, standings: ranking });
  const legacyInput = buildSwissEngineInput({ tournament: legacy, roundIndex: 0, standings: ranking });
  const neutralInput = buildSwissEngineInput({
    tournament: withoutCriteria,
    roundIndex: 0,
    standings: ranking,
  });

  assert.equal(modernInput.context.options.useCompo, false);
  assert.equal(modernInput.context.options.noteMode, 'none');
  assert.equal(legacyInput.context.options.useCompo, true);
  assert.equal(legacyInput.context.options.noteMode, 'separate');
  assert.deepEqual(neutralInput.context.options, {
    avoidMirrors: false,
    avoidAlliances: false,
    useCompo: false,
    noteMode: 'none',
  });
  assert.deepEqual(modern, modernBefore);
  assert.deepEqual(legacy, legacyBefore);
  assert.deepEqual(withoutCriteria, withoutCriteriaBefore);
});
