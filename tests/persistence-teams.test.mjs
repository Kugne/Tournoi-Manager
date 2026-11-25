import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inspectPersistedState,
  requiredStateSchemaVersion,
  STATE_SCHEMA_VERSION,
  TEAM_STATE_SCHEMA_VERSION,
} from '../src/results/persistence-compatibility.mjs';

const individual = () => ({ id: 'i', players: [{ id: 'a' }], roundsData: [] });

const teamTournament = (extra = {}) => ({
  id: 't',
  participantMode: 'teams',
  teams: [{ id: 'rouge', name: 'Rouge', status: 'active' }, { id: 'bleue', name: 'Bleue', status: 'active' }],
  players: [{ id: 'r1', teamId: 'rouge' }, { id: 'b1', teamId: 'bleue' }],
  roundsData: [{
    validated: false,
    encounters: [{ id: 'e1', teamA: 'rouge', teamB: 'bleue', table: 1 }],
    matches: [{ p1: 'r1', p2: 'b1', encounterId: 'e1', board: 1 }],
  }],
  ...extra,
});

const state = (schemaVersion, tournaments) => ({ schemaVersion, tournaments, gameSystems: [] });

test('une sauvegarde individuelle reste en version 1, une sauvegarde par équipes passe en version 2', () => {
  assert.equal(requiredStateSchemaVersion(state(1, [individual()])), STATE_SCHEMA_VERSION);
  assert.equal(requiredStateSchemaVersion(state(1, [individual(), teamTournament()])), TEAM_STATE_SCHEMA_VERSION);
  assert.equal(requiredStateSchemaVersion({}), STATE_SCHEMA_VERSION);
});

test('sans prise en charge des équipes, la version 2 est refusée comme par la V2 publiée', () => {
  assert.equal(inspectPersistedState(state(2, [teamTournament()])).code, 'future-state-schema');
  assert.equal(inspectPersistedState(state(1, [teamTournament()])).code, 'future-state-schema');
  assert.equal(inspectPersistedState(state(1, [individual()])).valid, true);
});

test('avec prise en charge des équipes, une sauvegarde cohérente est acceptée', () => {
  assert.equal(inspectPersistedState(state(2, [individual(), teamTournament()]), { supportsTeams: true }).valid, true);
  assert.equal(inspectPersistedState(state(1, [individual()]), { supportsTeams: true }).valid, true);
});

test('un tournoi par équipes exige la version 2 et une structure cohérente', () => {
  const inspect = (tournament, version = 2) => inspectPersistedState(state(version, [tournament]), { supportsTeams: true }).code;
  assert.equal(inspect(teamTournament(), 1), 'invalid-state');
  assert.equal(inspect(teamTournament({ teams: undefined })), 'invalid-teams');
  assert.equal(inspect(teamTournament({ teams: [{ id: 'x' }, { id: 'x' }] })), 'invalid-teams');
  assert.equal(inspect(teamTournament({ players: [{ id: 'p', teamId: 'inconnue' }] })), 'invalid-teams');
  const round = (encounters, matches = []) => ({ roundsData: [{ encounters, matches }] });
  assert.equal(inspect(teamTournament(round([{ id: 'e', teamA: 'rouge', teamB: 'rouge' }]))), 'invalid-encounters');
  assert.equal(inspect(teamTournament(round([{ id: 'e', teamA: 'rouge', teamB: 'verte' }]))), 'invalid-encounters');
  assert.equal(inspect(teamTournament(round([{ id: 'e', teamA: 'rouge', teamB: 'bleue', teamForfeit: 'personne' }]))), 'invalid-encounters');
  assert.equal(inspect(teamTournament(round([{ id: 'e', teamA: 'rouge', teamB: null, teamForfeit: 'teamA' }]))), 'invalid-encounters');
  assert.equal(inspect(teamTournament(round([{ id: 'e', teamA: 'rouge', teamB: null }]))), null);
  assert.equal(inspect(teamTournament(round([{ id: 'e', teamA: 'rouge', teamB: 'bleue', teamForfeit: 'teamB' }]))), null);
  assert.equal(inspect(teamTournament(round(
    [{ id: 'e', teamA: 'rouge', teamB: 'bleue' }],
    [{ p1: 'r1', p2: 'b1', encounterId: 'autre' }],
  ))), 'invalid-encounters');
});

test('un mode de participants inconnu est refusé', () => {
  const tournament = { ...individual(), participantMode: 'mystere' };
  assert.equal(inspectPersistedState(state(1, [tournament])).code, 'invalid-tournament');
  assert.equal(inspectPersistedState(state(1, [{ ...individual(), participantMode: 'individual' }])).valid, true);
});
