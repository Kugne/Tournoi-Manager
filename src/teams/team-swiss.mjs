import { writeMatchOutcome } from '../results/match-outcome.mjs';
import { buildSwissEngineInput } from '../swiss/application-adapter.mjs';
import { solveSwissPairing } from '../swiss/solve-swiss.mjs';
import { normalizeTeamSettings, TEAM_FORFEIT_SIDES } from './team-encounter.mjs';
import { calculateTeamStandings } from './team-standings.mjs';

/** Critères propres aux joueurs, sans objet entre équipes. */
const TEAM_PAIRING_OPTIONS = Object.freeze({
  avoidMirrors: false,
  avoidAlliances: false,
  useCompo: false,
  noteMode: 'none',
});

/**
 * Vue Suisse par équipes : chaque rencontre devient un « match » entre
 * équipes. Une rencontre perdue par forfait d'équipe ne compte pas comme une
 * confrontation (les équipes pourront encore se rencontrer), comme une
 * absence en individuel.
 */
export const teamSwissView = (tournament) => ({
  participants: tournament?.teams ?? [],
  rounds: (tournament?.roundsData ?? []).map((round) => ({
    validated: round?.validated === true,
    swissPairingSignatures: round?.teamPairingSignatures ?? [],
    matches: (round?.encounters ?? []).flatMap((encounter) => {
      if (encounter.teamB == null) return [{ p1: String(encounter.teamA), p2: null, bye: true }];
      if (encounter.teamForfeit != null) return [];
      return [{ p1: String(encounter.teamA), p2: String(encounter.teamB) }];
    }),
  })),
  blocks: tournament?.teamBlocks ?? [],
  options: TEAM_PAIRING_OPTIONS,
});

/** Joueurs actifs d'une équipe, dans l'ordre d'inscription. */
export const activeTeamRoster = (tournament, teamId) => (tournament?.players ?? [])
  .filter((player) => player?.teamId != null && String(player.teamId) === String(teamId) && player.status === 'active');

const pendingGame = (fields) => writeMatchOutcome({ s1: 0, s2: 0, f1: 0, f2: 0, ...fields }, {
  kind: null, result: null, started: null,
});

/** Table vide : bye individuel du joueur présent, côté `seatSide`. */
const emptySeatGame = ({ playerId, seatSide, table, encounterId, board }) => writeMatchOutcome({
  p1: String(playerId), p2: null, s1: 0, s2: 0, f1: 0, f2: 0, byeScenario: 0, byeFree: 0,
  table, encounterId, board, seatSide,
}, { kind: 'bye', result: null, started: false });

/** Partie d'une table : normale, table vide d'un côté, ou rien si les deux côtés sont vides. */
const boardGame = ({ playerA, playerB, table, encounterId, board }) => {
  if (playerA != null && playerB != null) {
    return pendingGame({ p1: String(playerA), p2: String(playerB), table, encounterId, board });
  }
  if (playerA != null) return emptySeatGame({ playerId: playerA, seatSide: 'teamA', table, encounterId, board });
  if (playerB != null) return emptySeatGame({ playerId: playerB, seatSide: 'teamB', table, encounterId, board });
  return null;
};

/**
 * Équipes actives dont l'effectif diffère de la taille prévue :
 * [{ teamId, name, active, expected }]. Une équipe incomplète peut jouer
 * (ses tables vides sont perdues par forfait) ; une équipe vide ou en
 * surnombre bloque l'appariement.
 */
export const teamRosterIssues = (tournament) => {
  const { teamSize } = normalizeTeamSettings({ teamSettings: tournament?.teamSettings, scoring: tournament?.scoring });
  return (tournament?.teams ?? [])
    .filter((team) => team.status === 'active')
    .map((team) => ({
      teamId: String(team.id), name: team.name ?? String(team.id),
      active: activeTeamRoster(tournament, team.id).length, expected: teamSize,
    }))
    .filter((issue) => issue.active !== issue.expected);
};

const encounterIdFor = (roundIndex, table) => `R${roundIndex + 1}-E${table}`;

/**
 * Calcule la ronde Suisse par équipes `roundIndex` sans modifier le tournoi.
 * Les équipes sont groupées sur le premier critère du classement (points de
 * rencontre par défaut), les revanches évitées par le solveur exact, et les
 * tables de chaque rencontre opposent les joueurs actifs dans l'ordre
 * d'inscription (modifiable ensuite par assignEncounterBoards).
 * Renvoie { encounters, matches, byeTeamId, standings }.
 */
export const pairTeamRound = (tournament, roundIndex) => {
  const settings = normalizeTeamSettings({ teamSettings: tournament?.teamSettings, scoring: tournament?.scoring });
  const standings = calculateTeamStandings(tournament);
  const view = teamSwissView(tournament);
  const input = buildSwissEngineInput({ tournament, roundIndex, standings, view });
  if (input.participants.length < 2 && input.byePlayerId == null) {
    throw new Error('Une ronde Suisse par équipes exige au moins deux équipes actives');
  }
  for (const issue of teamRosterIssues(tournament)) {
    if (issue.active === 0) {
      throw new Error(`L’équipe ${issue.name} n’a aucun joueur actif : retirez-la ou activez ses joueurs`);
    }
    if (issue.active > issue.expected) {
      throw new Error(`L’équipe ${issue.name} compte ${issue.active} joueurs actifs pour ${issue.expected} places : passez les remplaçants en statut Inscrit`);
    }
  }

  const solved = input.participants.length ? solveSwissPairing(input.participants, input.context) : { pairs: [] };
  const rankById = new Map(standings.map((entry, index) => [entry.id, { pts: entry.pts, index }]));
  const pairs = solved.pairs
    .map((pair) => {
      const [a, b] = [String(pair.a), String(pair.b)];
      return rankById.get(a).index <= rankById.get(b).index ? { teamA: a, teamB: b } : { teamA: b, teamB: a };
    })
    .sort((left, right) => {
      const total = (pair) => rankById.get(pair.teamA).pts + rankById.get(pair.teamB).pts;
      return total(right) - total(left) || rankById.get(left.teamA).index - rankById.get(right.teamA).index;
    });

  const encounters = [];
  const matches = [];
  pairs.forEach((pair, index) => {
    const table = index + 1;
    const id = encounterIdFor(roundIndex, table);
    encounters.push({ id, teamA: pair.teamA, teamB: pair.teamB, table });
    const rosterA = activeTeamRoster(tournament, pair.teamA);
    const rosterB = activeTeamRoster(tournament, pair.teamB);
    for (let board = 0; board < settings.teamSize; board += 1) {
      const game = boardGame({
        playerA: rosterA[board]?.id ?? null,
        playerB: rosterB[board]?.id ?? null,
        table: index * settings.teamSize + board + 1,
        encounterId: id,
        board: board + 1,
      });
      if (game) matches.push(game);
    }
  });
  if (input.byePlayerId != null) {
    const table = encounters.length + 1;
    encounters.push({ id: encounterIdFor(roundIndex, table), teamA: String(input.byePlayerId), teamB: null, table });
  }
  return { encounters, matches, byeTeamId: input.byePlayerId, standings };
};

const replaceEncounter = (round, encounterId, update) => {
  const encounters = round?.encounters ?? [];
  const index = encounters.findIndex((encounter) => String(encounter.id) === String(encounterId));
  if (index < 0) throw new Error(`Rencontre inconnue : ${encounterId}`);
  const next = [...encounters];
  next[index] = update(encounters[index]);
  return { ...round, encounters: next };
};

/**
 * Recompose les tables d'une rencontre. `pairs` = [{ p1, p2 }] où chaque
 * joueur actif de teamA (p1) et de teamB (p2) figure exactement une fois.
 * Les résultats déjà saisis de cette rencontre sont effacés.
 */
export const assignEncounterBoards = (tournament, round, encounterId, pairs) => {
  const encounter = (round?.encounters ?? []).find((item) => String(item.id) === String(encounterId));
  if (!encounter) throw new Error(`Rencontre inconnue : ${encounterId}`);
  if (encounter.teamB == null) throw new Error('Un bye d’équipe n’a pas de tables');
  const rosterA = activeTeamRoster(tournament, encounter.teamA).map((player) => String(player.id));
  const rosterB = activeTeamRoster(tournament, encounter.teamB).map((player) => String(player.id));
  const present = (value) => value != null && value !== '';
  const left = (pairs ?? []).map((pair) => pair?.p1).filter(present).map(String);
  const right = (pairs ?? []).map((pair) => pair?.p2).filter(present).map(String);
  const sameSet = (values, roster) => values.length === roster.length
    && new Set(values).size === values.length && values.every((id) => roster.includes(id));
  if (!sameSet(left, rosterA) || !sameSet(right, rosterB)) {
    throw new Error('Chaque joueur actif des deux équipes doit occuper exactement une table');
  }
  if ((pairs ?? []).some((pair) => !present(pair?.p1) && !present(pair?.p2))) {
    throw new Error('Une table ne peut pas être vide des deux côtés');
  }
  const existing = (round.matches ?? []).filter((match) => String(match.encounterId) === String(encounterId));
  const tables = existing.map((match) => match.table).sort((a, b) => a - b);
  const firstTable = tables[0] ?? 1;
  const lastTable = tables.length ? tables[tables.length - 1] : firstTable - 1;
  const games = pairs.map((pair, board) => boardGame({
    playerA: present(pair.p1) ? pair.p1 : null,
    playerB: present(pair.p2) ? pair.p2 : null,
    table: tables[board] ?? lastTable + 1 + (board - tables.length),
    encounterId: String(encounterId), board: board + 1,
  }));
  const all = round.matches ?? [];
  const insertAt = all.findIndex((match) => String(match.encounterId) === String(encounterId));
  const others = all.filter((match) => String(match.encounterId) !== String(encounterId));
  const position = insertAt < 0 ? others.length
    : all.slice(0, insertAt).filter((match) => String(match.encounterId) !== String(encounterId)).length;
  return { ...round, matches: [...others.slice(0, position), ...games, ...others.slice(position)] };
};

/**
 * Déclare (side = 'teamA' | 'teamB' | 'both') ou annule (side = null) le
 * forfait d'une équipe entière sur une rencontre. Les parties restent
 * enregistrées mais ne comptent plus tant que le forfait est déclaré.
 */
export const setEncounterTeamForfeit = (round, encounterId, side) => {
  if (side != null && !TEAM_FORFEIT_SIDES.includes(side)) throw new TypeError('Forfait d’équipe inconnu');
  return replaceEncounter(round, encounterId, (encounter) => {
    if (encounter.teamB == null) throw new Error('Un bye d’équipe ne peut pas être déclaré forfait');
    const next = { ...encounter };
    if (side == null) delete next.teamForfeit;
    else next.teamForfeit = side;
    return next;
  });
};
