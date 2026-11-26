import assert from 'node:assert/strict';
import test from 'node:test';

import { applyTeamImport, planTeamImport } from '../src/teams/team-import.mjs';

const tournament = (extra = {}) => ({
  status: 'waiting',
  participantMode: 'teams',
  teamSettings: { teamSize: 3 },
  teams: [{ id: 'T1', name: 'Les Rouges', status: 'active' }],
  players: [{ id: 'p0', name: 'Ancien', faction: '', compo: null, status: 'inscrit', teamId: 'T1' }],
  ...extra,
});

test('l’aperçu regroupe les joueurs par équipe sans rien modifier', () => {
  const t = tournament();
  const before = JSON.stringify(t);
  const plan = planTeamImport(t, '﻿Alice;Orks;1850;les rouges\nBob;Eldars;;Bleus\nChloé;;;Bleus\nDavid\n\n');
  assert.equal(JSON.stringify(t), before);
  assert.deepEqual(plan.newTeams, ['Bleus']);
  assert.deepEqual(plan.withoutTeam, ['David']);
  assert.deepEqual(plan.rosters.map((r) => [r.teamName, r.isNew, r.existing, r.added, r.total, r.expected]), [
    ['Les Rouges', false, ['Ancien'], ['Alice'], 2, 3],
    ['Bleus', true, [], ['Bob', 'Chloé'], 2, 3],
  ]);
  assert.equal(plan.rows[0].compo, 1850);
});

test('les lignes invalides ou en double sont listées avec leur raison', () => {
  const plan = planTeamImport(tournament(), ';Orks\nEve;;abc;Bleus\nancien;;;Bleus\nFred;;;Bleus\nfred;;;Verts');
  assert.deepEqual(plan.skipped.map((s) => [s.line, s.reason]), [
    [1, 'pseudo manquant'],
    [2, 'compo non entière'],
    [3, 'pseudo déjà inscrit'],
    [5, 'pseudo en double dans l’import'],
  ]);
  assert.deepEqual(plan.rows.map((r) => r.name), ['Fred']);
  assert.deepEqual(plan.newTeams, ['Bleus']);
});

test('l’import crée les équipes et rattache les joueurs', () => {
  const t = tournament();
  let n = 0;
  const result = applyTeamImport(t, planTeamImport(t, 'Alice;;;Les Rouges\nBob;;;Bleus\nDavid'), () => 'id' + (++n));
  assert.deepEqual(result, { added: 3, teamsCreated: 1, skipped: 0 });
  assert.deepEqual(t.teams.map((team) => [team.id, team.name]), [['T1', 'Les Rouges'], ['id1', 'Bleus']]);
  assert.deepEqual(t.players.slice(1).map((p) => [p.name, p.teamId ?? null, p.status]), [
    ['Alice', 'T1', 'inscrit'],
    ['Bob', 'id1', 'inscrit'],
    ['David', null, 'inscrit'],
  ]);
});

test('une fois le tournoi lancé, la colonne Équipe est ignorée', () => {
  const plan = planTeamImport(tournament({ status: 'active' }), 'Alice;;;Bleus');
  assert.equal(plan.compositionLocked, true);
  assert.deepEqual(plan.newTeams, []);
  assert.deepEqual(plan.withoutTeam, ['Alice']);
});
