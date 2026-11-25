import assert from 'node:assert/strict';
import test from 'node:test';

import { writeMatchOutcome } from '../src/results/match-outcome.mjs';
import {
  computeEncounterResult,
  DEFAULT_TEAM_SETTINGS,
  normalizeTeamSettings,
} from '../src/teams/team-encounter.mjs';
import { calculateTeamStandings } from '../src/teams/team-standings.mjs';
import {
  assignEncounterBoards,
  pairTeamRound,
  setEncounterTeamForfeit,
} from '../src/teams/team-swiss.mjs';

const settings = (teamSettings = {}) => normalizeTeamSettings({ teamSettings });

const game = (result, kind = 'played', reason = null) => {
  const base = { p1: 'a', p2: 'b', encounterId: 'E' };
  if (kind === 'double_forfeit') return writeMatchOutcome(base, { kind, result: null, started: false, administrativeReason: 'absence' });
  if (result === null) return writeMatchOutcome(base, { kind: null, result: null, started: null });
  if (kind === 'played') return writeMatchOutcome(base, { kind, result, started: true });
  return writeMatchOutcome(base, { kind, result, started: false, administrativeReason: reason ?? 'absence' });
};
const encounter = { id: 'E', teamA: 'A', teamB: 'B', table: 1 };
const resultOf = (results, options) => computeEncounterResult(encounter, results.map((r) => (Array.isArray(r) ? game(...r) : game(r))), settings(options));

test('le résultat de rencontre se décide au nombre de victoires individuelles', () => {
  const cases = [
    [['p1', 'p1', 'p2'], 'teamA', { teamA: 6, teamB: 3 }],
    [['p1', 'draw', 'draw'], 'teamA', { teamA: 5, teamB: 2 }],
    [['p1', 'draw', 'p2'], 'draw', { teamA: 4, teamB: 4 }],
    [['draw', 'draw', 'draw'], 'draw', { teamA: 3, teamB: 3 }],
    [['p2', 'draw', 'draw'], 'teamB', { teamA: 2, teamB: 5 }],
    [['p2', 'p2', 'p2'], 'teamB', { teamA: 0, teamB: 9 }],
  ];
  for (const [results, winner, individual] of cases) {
    const result = resultOf(results);
    assert.equal(result.status, 'complete');
    assert.equal(result.winner, winner, results.join(','));
    assert.deepEqual({ teamA: result.sides.teamA.individualPts, teamB: result.sides.teamB.individualPts }, individual);
    const expected = winner === 'draw' ? { teamA: 1, teamB: 1 } : winner === 'teamA' ? { teamA: 3, teamB: 0 } : { teamA: 0, teamB: 3 };
    assert.deepEqual(result.matchPts, expected);
  }
});

test('une rencontre reste en attente tant qu’une partie n’est pas saisie', () => {
  assert.equal(resultOf(['p1', 'p1', null]).status, 'pending');
  assert.equal(computeEncounterResult(encounter, [], settings()).status, 'pending');
});

test('le forfait d’un joueur vaut une victoire ordinaire sur sa table (réglage 2A)', () => {
  const result = resultOf([['p1', 'administrative_no_show'], 'p2', 'draw']);
  assert.equal(result.winner, 'draw');
  assert.equal(result.sides.teamA.individualPts, 4);
  assert.equal(result.sides.teamA.forfeitWins, 1);
  const variant = resultOf([['p1', 'administrative_no_show'], 'p2', 'draw'], { playerForfeitPoints: 1 });
  assert.equal(variant.sides.teamA.individualPts, 2);
  assert.equal(variant.winner, 'draw');
});

test('un double forfait sur une table compte une défaite des deux côtés', () => {
  const result = resultOf([[null, 'double_forfeit'], 'p1', 'p2']);
  assert.equal(result.winner, 'draw');
  assert.equal(result.sides.teamA.losses, 2);
  assert.equal(result.sides.teamB.losses, 2);
});

test('bye d’équipe : victoire de rencontre et 6 points individuels par défaut (réglage 1A)', () => {
  const bye = computeEncounterResult({ id: 'X', teamA: 'A', teamB: null }, [], settings());
  assert.equal(bye.kind, 'bye');
  assert.deepEqual(bye.matchPts, { teamA: 3, teamB: 0 });
  assert.equal(bye.sides.teamA.individualPts, 6);
  const draw = computeEncounterResult({ id: 'X', teamA: 'A', teamB: null }, [], settings({ byeMatchResult: 'draw', byeIndividualPoints: 3 }));
  assert.deepEqual(draw.matchPts, { teamA: 1, teamB: 0 });
  assert.equal(draw.winner, 'draw');
});

test('forfait d’une équipe entière : traité comme un bye pour l’adversaire (réglage 3A)', () => {
  const games = [game('p1'), game('p1'), game('p1')];
  const forfeit = computeEncounterResult({ ...encounter, teamForfeit: 'teamA' }, games, settings());
  assert.equal(forfeit.winner, 'teamB');
  assert.deepEqual(forfeit.matchPts, { teamA: 0, teamB: 3 });
  assert.equal(forfeit.sides.teamB.individualPts, 6);
  assert.equal(forfeit.sides.teamA.individualPts, 0);
  const both = computeEncounterResult({ ...encounter, teamForfeit: 'both' }, games, settings());
  assert.deepEqual(both.matchPts, { teamA: 0, teamB: 0 });
  assert.equal(both.winner, null);
});

test('les réglages sont validés et complétés', () => {
  assert.equal(settings().teamSize, DEFAULT_TEAM_SETTINGS.teamSize);
  assert.deepEqual(settings().tiebreaks, ['matchPts', 'individualPts', 'buchholz']);
  assert.deepEqual(settings({ rankingOrder: 'schedule_first' }).tiebreaks, ['matchPts', 'buchholz', 'individualPts']);
  assert.deepEqual(settings({ matchScoring: { win: 2, draw: 1, loss: 0 } }).matchScoring, { win: 2, draw: 1, loss: 0 });
  assert.throws(() => settings({ rankingOrder: 'inconnu' }), /Ordre de classement inconnu/);
  assert.throws(() => settings({ teamSize: 0 }), /taille d’équipe/);
  assert.throws(() => settings({ byeIndividualPoints: 'x' }), /bye/);
});

// --- Tournois complets -------------------------------------------------------

const makeTournament = (teamCount, { teamSize = 3, teamSettings = {} } = {}) => {
  const teams = Array.from({ length: teamCount }, (_, index) => ({ id: `T${index + 1}`, name: `Équipe ${index + 1}`, status: 'active' }));
  const players = teams.flatMap((team) => Array.from({ length: teamSize }, (_, board) => ({
    id: `${team.id}-J${board + 1}`, name: `${team.name} J${board + 1}`, status: 'active', teamId: team.id,
  })));
  return {
    id: 'tournoi', participantMode: 'teams', teams, players, roundsData: [],
    scoring: { win: 3, draw: 1, loss: 0 }, teamSettings: { teamSize, ...teamSettings },
  };
};

/** Saisit les parties d'une rencontre : `results` liste 'p1' / 'p2' / 'draw' par table. */
const recordEncounter = (round, encounterId, results) => {
  const games = round.matches.filter((match) => match.encounterId === encounterId);
  results.forEach((result, index) => {
    const position = round.matches.indexOf(games[index]);
    round.matches[position] = writeMatchOutcome(games[index], { kind: 'played', result, started: true });
  });
};

const playRound = (tournament, resultsFor) => {
  const roundIndex = tournament.roundsData.length;
  const { encounters, matches } = pairTeamRound(tournament, roundIndex);
  const round = { encounters, matches, validated: false };
  for (const item of encounters) {
    if (item.teamB != null) recordEncounter(round, item.id, resultsFor(item, roundIndex));
  }
  round.validated = true;
  tournament.roundsData.push(round);
  return round;
};

const encounterRound = (encounters) => ({
  validated: true,
  encounters: encounters.map(([teamA, teamB, results], index) => ({ id: `E${index}`, teamA, teamB, table: index + 1 })),
  matches: encounters.flatMap(([, teamB, results = []], index) => results.map((result, board) => writeMatchOutcome(
    { p1: 'x', p2: 'y', encounterId: `E${index}`, board: board + 1 },
    { kind: 'played', result, started: true },
  ))),
});

test('classement : l’exemple Rouge / Bleue du comparatif selon l’ordre choisi', () => {
  const base = makeTournament(0);
  base.teams = ['Rouge', 'Bleue', 'X', 'Y', 'Z', 'W'].map((id) => ({ id, name: id, status: 'active' }));
  const win = ['p1', 'p1', 'p1'];
  base.roundsData = [
    encounterRound([['Rouge', 'X', win], ['Bleue', 'Y', ['p1', 'p1', 'p2']]]),
    encounterRound([['Rouge', 'Z', ['p1', 'p2', 'p2']], ['Bleue', 'W', ['p1', 'p1', 'p2']]]),
    encounterRound([['Rouge', 'W', ['p1', 'p2', 'p2']], ['Bleue', 'Z', ['p2', 'p2', 'p2']]]),
  ];
  const byMatches = calculateTeamStandings(base);
  const rouge = byMatches.find((entry) => entry.id === 'Rouge');
  const bleue = byMatches.find((entry) => entry.id === 'Bleue');
  assert.deepEqual([rouge.individualPts, rouge.matchPts, bleue.individualPts, bleue.matchPts], [15, 3, 12, 6]);
  assert.ok(byMatches.indexOf(bleue) < byMatches.indexOf(rouge));
  const byIndividual = calculateTeamStandings({ ...base, teamSettings: { rankingOrder: 'individual_first' } });
  assert.ok(byIndividual.findIndex((entry) => entry.id === 'Rouge') < byIndividual.findIndex((entry) => entry.id === 'Bleue'));
});

test('classement : Buchholz, adversaire virtuel du bye, pénalités et ex æquo', () => {
  const tournament = makeTournament(0);
  tournament.teams = ['A', 'B', 'C'].map((id) => ({ id, name: id, status: 'active' }));
  tournament.roundsData = [encounterRound([['A', 'B', ['p1', 'p1', 'p2']], ['C', null]])];
  const standings = calculateTeamStandings(tournament);
  const byId = Object.fromEntries(standings.map((entry) => [entry.id, entry]));
  assert.equal(byId.A.matchPts, 3);
  assert.equal(byId.C.matchPts, 3);
  assert.equal(byId.C.individualPts, 6);
  assert.equal(byId.C.byes, 1);
  assert.equal(byId.A.buchholz, 0);
  assert.equal(byId.B.buchholz, 3);
  assert.equal(byId.C.buchholz, 1.5);
  // A et C : 3 points de rencontre et 6 individuels ; le Buchholz place C devant.
  assert.deepEqual(standings.map((entry) => [entry.id, entry.rank]), [['C', 1], ['A', 2], ['B', 3]]);
  const tied = calculateTeamStandings({ ...tournament, roundsData: [encounterRound([['A', 'B', ['draw', 'draw', 'draw']]])] });
  assert.deepEqual(tied.map((entry) => entry.rank), [1, 1, 3]);

  tournament.teams[0].penalties = [{ points: -1, reason: 'retard' }];
  const penalised = calculateTeamStandings(tournament);
  const a = penalised.find((entry) => entry.id === 'A');
  assert.equal(a.matchPts, 2);
  assert.equal(penalised.find((entry) => entry.id === 'B').buchholz, 3, 'le Buchholz utilise les points sportifs');
  assert.equal(penalised[0].id, 'C');
});

test('classement : seules les rondes validées et les rencontres complètes comptent', () => {
  const tournament = makeTournament(0);
  tournament.teams = ['A', 'B'].map((id) => ({ id, name: id, status: 'active' }));
  const pending = encounterRound([['A', 'B', ['p1', 'p1']]]);
  pending.matches.push(writeMatchOutcome({ p1: 'x', p2: 'y', encounterId: 'E0', board: 3 }, { kind: null, result: null, started: null }));
  const unvalidated = { ...encounterRound([['A', 'B', ['p1', 'p1', 'p1']]]), validated: false };
  tournament.roundsData = [pending, unvalidated];
  assert.ok(calculateTeamStandings(tournament).every((entry) => entry.matchPts === 0 && entry.individualPts === 0));
});

test('appariement : première ronde de 8 équipes de 3 joueurs', () => {
  const tournament = makeTournament(8);
  const { encounters, matches, byeTeamId } = pairTeamRound(tournament, 0);
  assert.equal(byeTeamId, null);
  assert.equal(encounters.length, 4);
  assert.equal(matches.length, 12);
  assert.deepEqual(new Set(encounters.flatMap((item) => [item.teamA, item.teamB])).size, 8);
  for (const item of encounters) {
    const games = matches.filter((match) => match.encounterId === item.id);
    assert.deepEqual(games.map((match) => match.board), [1, 2, 3]);
    assert.ok(games.every((match) => match.p1.startsWith(`${item.teamA}-`) && match.p2.startsWith(`${item.teamB}-`)));
  }
  assert.deepEqual(matches.map((match) => match.table), Array.from({ length: 12 }, (_, index) => index + 1));
});

test('appariement : cinq rondes sans revanche, groupées par points de rencontre', () => {
  const tournament = makeTournament(8);
  const strength = (teamId) => Number(teamId.slice(1));
  for (let round = 0; round < 5; round += 1) {
    const standingsBefore = calculateTeamStandings(tournament);
    const played = playRound(tournament, (item) => (strength(item.teamA) < strength(item.teamB)
      ? ['p1', 'p1', 'p2'] : ['p2', 'draw', 'p2']));
    if (round === 1) {
      const pts = Object.fromEntries(standingsBefore.map((entry) => [entry.id, entry.matchPts]));
      for (const item of played.encounters) assert.equal(pts[item.teamA], pts[item.teamB], 'ronde 2 : groupes de même score');
    }
  }
  const seen = new Set();
  for (const round of tournament.roundsData) {
    for (const item of round.encounters) {
      const key = [item.teamA, item.teamB].sort().join('|');
      assert.ok(!seen.has(key), `revanche ${key}`);
      seen.add(key);
    }
  }
  const standings = calculateTeamStandings(tournament);
  assert.equal(standings[0].id, 'T1');
  assert.equal(standings[0].matchPts, 15);
  assert.equal(standings[0].individualPts, 30);
});

test('appariement : bye à l’équipe la moins bien classée, jamais deux fois', () => {
  const tournament = makeTournament(5);
  const byes = [];
  for (let round = 0; round < 4; round += 1) {
    const played = playRound(tournament, () => ['p1', 'p1', 'p2']);
    const bye = played.encounters.find((item) => item.teamB == null);
    assert.ok(bye);
    assert.equal(played.matches.filter((match) => match.encounterId === bye.id).length, 0);
    byes.push(bye.teamA);
  }
  assert.equal(new Set(byes).size, 4);
  const firstBye = byes[0];
  assert.equal(firstBye, 'T5');
  const standings = calculateTeamStandings(tournament);
  assert.equal(standings.find((entry) => entry.id === firstBye).byes, 1);
});

test('appariement : une rencontre perdue par forfait d’équipe autorise une nouvelle confrontation', () => {
  const tournament = makeTournament(2);
  const first = pairTeamRound(tournament, 0);
  let round = { ...first, validated: true };
  round = setEncounterTeamForfeit(round, first.encounters[0].id, 'teamB');
  tournament.roundsData.push(round);
  const standings = calculateTeamStandings(tournament);
  assert.equal(standings[0].matchPts, 3);
  assert.equal(standings[0].individualPts, 6);
  const second = pairTeamRound(tournament, 1);
  assert.equal(second.encounters.length, 1);
  assert.equal(setEncounterTeamForfeit(round, first.encounters[0].id, null).encounters[0].teamForfeit, undefined);
  assert.throws(() => setEncounterTeamForfeit(round, first.encounters[0].id, 'personne'), /Forfait/);
});

test('appariement : refuse une équipe incomplète', () => {
  const tournament = makeTournament(4);
  tournament.players[0].status = 'dropped';
  assert.throws(() => pairTeamRound(tournament, 0), /Équipe 1 compte 2 joueur/);
});

test('composition des tables d’une rencontre', () => {
  const tournament = makeTournament(2);
  const paired = pairTeamRound(tournament, 0);
  const round = { ...paired, validated: false };
  const [item] = round.encounters;
  const rosterA = ['1', '2', '3'].map((n) => `${item.teamA}-J${n}`);
  const rosterB = ['1', '2', '3'].map((n) => `${item.teamB}-J${n}`);
  const next = assignEncounterBoards(tournament, round, item.id, [
    { p1: rosterA[0], p2: rosterB[2] }, { p1: rosterA[1], p2: rosterB[0] }, { p1: rosterA[2], p2: rosterB[1] },
  ]);
  const games = next.matches.filter((match) => match.encounterId === item.id);
  assert.deepEqual(games.map((match) => [match.board, match.p1, match.p2, match.table]), [
    [1, rosterA[0], rosterB[2], 1], [2, rosterA[1], rosterB[0], 2], [3, rosterA[2], rosterB[1], 3],
  ]);
  assert.throws(() => assignEncounterBoards(tournament, round, item.id, [
    { p1: rosterA[0], p2: rosterB[0] }, { p1: rosterA[0], p2: rosterB[1] }, { p1: rosterA[2], p2: rosterB[2] },
  ]), /exactement une table/);
});
