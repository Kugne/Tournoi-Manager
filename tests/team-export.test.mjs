import assert from 'node:assert/strict';
import test from 'node:test';

import { writeMatchOutcome } from '../src/results/match-outcome.mjs';
import { teamStandingsExportTable } from '../src/teams/team-export.mjs';

const played = (encounterId, board, result) => writeMatchOutcome(
  { p1: 'x', p2: 'y', encounterId, board },
  { kind: 'played', result, started: true },
);

const tournament = (teamSettings = {}) => ({
  participantMode: 'teams',
  scoring: { win: 3, draw: 1, loss: 0 },
  teamSettings,
  teams: [
    { id: 'A', name: 'Rouge', status: 'active', penalties: [{ points: -1 }] },
    { id: 'B', name: 'Bleue', status: 'active' },
    { id: 'C', name: 'Verte', status: 'dropped' },
  ],
  players: [
    { id: 'a1', name: 'Alice', teamId: 'A' }, { id: 'a2', name: 'Arno', teamId: 'A' },
    { id: 'b1', name: 'Bob', teamId: 'B' }, { id: 'n', name: 'Sans équipe' },
  ],
  roundsData: [{
    validated: true,
    encounters: [{ id: 'E1', teamA: 'A', teamB: 'B', table: 1 }, { id: 'E2', teamA: 'C', teamB: null, table: 2 }],
    matches: [played('E1', 1, 'p1'), played('E1', 2, 'p1'), played('E1', 3, 'p2')],
  }],
});

test('l’export suit l’ordre de classement et donne les données brutes', () => {
  const table = teamStandingsExportTable(tournament());
  assert.deepEqual(table.columns, [
    'Rang', 'Équipe', 'Joueurs', 'Points de rencontre', 'Points individuels', 'Buchholz', 'Bonus/Malus',
    'Rencontres gagnées', 'Rencontres nulles', 'Rencontres perdues',
    'Parties gagnées', 'Parties nulles', 'Parties perdues', 'Byes', 'Statut',
  ]);
  assert.deepEqual(table.rows.map((row) => row.cells), [
    [1, 'Verte', '', 3, 6, 1.5, 0, 1, 0, 0, 0, 0, 0, 1, 'Retirée'],
    [2, 'Rouge', 'Alice, Arno', 2, 6, 0, -1, 1, 0, 0, 2, 0, 1, 0, 'Engagée'],
    [3, 'Bleue', 'Bob', 0, 3, 3, 0, 0, 0, 1, 1, 0, 2, 0, 'Engagée'],
  ]);
});

test('l’export place les colonnes dans l’ordre du mode choisi', () => {
  const columns = (rankingOrder) => teamStandingsExportTable(tournament({ rankingOrder })).columns.slice(3, 6);
  assert.deepEqual(columns('schedule_first'), ['Points de rencontre', 'Buchholz', 'Points individuels']);
  assert.deepEqual(columns('individual_first'), ['Points individuels', 'Points de rencontre', 'Buchholz']);
});

test('le Buchholz exporté est arrondi au centième', () => {
  const t = tournament();
  t.teams.push({ id: 'D', name: 'Jaune', status: 'active' });
  t.roundsData[0].encounters[1] = { id: 'E2', teamA: 'C', teamB: null, table: 2 };
  t.roundsData.push({ validated: true, encounters: [{ id: 'E3', teamA: 'D', teamB: null, table: 1 }], matches: [] });
  for (const row of teamStandingsExportTable(t).rows) {
    const value = row.cells[5];
    assert.equal(Math.round(value * 100) / 100, value);
  }
});
