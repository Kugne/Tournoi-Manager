import { normalizeTeamSettings } from './team-encounter.mjs';

/**
 * Import CSV des joueurs d'un tournoi par équipes.
 *
 * Format d'une ligne : Pseudo;Faction;Compo;Équipe. Seul le pseudo est
 * obligatoire. Les trois premières colonnes gardent exactement le sens de
 * l'import individuel ; la quatrième rattache le joueur à une équipe
 * existante (nom insensible à la casse) ou à une équipe créée par l'import.
 *
 * planTeamImport ne modifie rien : il décrit ce que l'import fera, pour que
 * l'organisateur valide un aperçu. applyTeamImport applique ce plan.
 */

const clean = (value) => String(value ?? '').trim();
const key = (value) => clean(value).toLowerCase();

export function planTeamImport(tournament, text) {
  const teamSize = normalizeTeamSettings({ teamSettings: tournament.teamSettings, scoring: tournament.scoring }).teamSize;
  const compositionLocked = tournament.status != null && tournament.status !== 'waiting';
  const knownPlayers = new Set((tournament.players ?? []).map((player) => key(player.name)));
  const importedPlayers = new Set();
  const teamsByKey = new Map((tournament.teams ?? []).map((team) => [key(team.name), team]));
  const rows = [];
  const skipped = [];
  const newTeams = [];
  const newTeamKeys = new Set();

  String(text ?? '').replace(/^﻿/, '').split('\n').forEach((line, index) => {
    if (!line.trim()) return;
    const parts = line.split(';');
    const name = clean(parts[0]);
    const faction = clean(parts[1]);
    const compo = clean(parts[2]);
    let teamName = clean(parts[3]);
    const compoValue = compo === '' ? null : Number(compo);
    const lineNumber = index + 1;
    if (!name) { skipped.push({ line: lineNumber, text: line.trim(), reason: 'pseudo manquant' }); return; }
    if (compo !== '' && !Number.isInteger(compoValue)) { skipped.push({ line: lineNumber, text: line.trim(), reason: 'compo non entière' }); return; }
    if (knownPlayers.has(key(name))) { skipped.push({ line: lineNumber, text: line.trim(), reason: 'pseudo déjà inscrit' }); return; }
    if (importedPlayers.has(key(name))) { skipped.push({ line: lineNumber, text: line.trim(), reason: 'pseudo en double dans l’import' }); return; }
    importedPlayers.add(key(name));
    if (compositionLocked) teamName = '';
    const existing = teamName ? teamsByKey.get(key(teamName)) : null;
    if (teamName && !existing && !newTeamKeys.has(key(teamName))) {
      newTeamKeys.add(key(teamName));
      newTeams.push(teamName);
    }
    rows.push({ name, faction, compo: compoValue, teamName: existing ? existing.name : teamName, teamId: existing ? String(existing.id) : null });
  });

  const rosters = [];
  const rosterByKey = new Map();
  const rosterOf = (teamName, team) => {
    const k = key(teamName);
    if (!rosterByKey.has(k)) {
      const current = team ? (tournament.players ?? []).filter((player) => player.teamId != null && String(player.teamId) === String(team.id)).map((player) => player.name) : [];
      const roster = { teamName, isNew: !team, existing: current, added: [], total: current.length, expected: teamSize };
      rosterByKey.set(k, roster);
      rosters.push(roster);
    }
    return rosterByKey.get(k);
  };
  rows.forEach((row) => {
    if (!row.teamName) return;
    const roster = rosterOf(row.teamName, teamsByKey.get(key(row.teamName)) ?? null);
    roster.added.push(row.name);
    roster.total += 1;
  });

  return {
    teamSize,
    compositionLocked,
    rows,
    skipped,
    newTeams,
    rosters,
    withoutTeam: rows.filter((row) => !row.teamName).map((row) => row.name),
  };
}

export function applyTeamImport(tournament, plan, makeId) {
  tournament.teams = tournament.teams ?? [];
  const teamIds = new Map(tournament.teams.map((team) => [key(team.name), String(team.id)]));
  plan.newTeams.forEach((name) => {
    if (teamIds.has(key(name))) return;
    const id = makeId();
    tournament.teams.push({ id, name, status: 'active' });
    teamIds.set(key(name), String(id));
  });
  plan.rows.forEach((row) => {
    const player = { id: makeId(), name: row.name, faction: row.faction, compo: row.compo, status: 'inscrit', note: '', extras: {} };
    if (row.teamName) player.teamId = teamIds.get(key(row.teamName));
    tournament.players.push(player);
  });
  return { added: plan.rows.length, teamsCreated: plan.newTeams.length, skipped: plan.skipped.length };
}
