import { calculateBuchholz } from '../results/buchholz.mjs';
import { compareByTiebreaks, rankStandings } from '../results/standings-ranking.mjs';
import {
  computeEncounterResult,
  ENCOUNTER_KINDS,
  encounterGames,
  normalizeTeamSettings,
} from './team-encounter.mjs';

const numberOrZero = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const emptyEntry = (team) => ({
  id: String(team.id),
  name: team.name ?? String(team.id),
  status: team.status ?? 'active',
  pts: 0,
  matchPts: 0,
  sportsMatchPts: 0,
  individualPts: 0,
  buchholz: 0,
  encounterWins: 0,
  encounterDraws: 0,
  encounterLosses: 0,
  gameWins: 0,
  gameDraws: 0,
  gameLosses: 0,
  byes: 0,
  opponents: [],
  bonusMalus: 0,
});

const addEncounterOutcome = (entry, side, result) => {
  entry.sportsMatchPts += result.matchPts[side];
  entry.individualPts += result.sides[side].individualPts;
  entry.gameWins += result.sides[side].wins;
  entry.gameDraws += result.sides[side].draws;
  entry.gameLosses += result.sides[side].losses;
  if (result.winner === side) entry.encounterWins += 1;
  else if (result.winner === 'draw') entry.encounterDraws += 1;
  else entry.encounterLosses += 1;
};

/**
 * Classement Suisse par équipes.
 *
 * - points de rencontre (barème de rencontre, pénalités d'équipe comprises) ;
 * - points individuels : somme des points de partie des joueurs de l'équipe ;
 * - Buchholz : somme des points de rencontre sportifs des équipes affrontées,
 *   plus un adversaire virtuel moyen pour un bye ou un forfait d'équipe adverse.
 * Seules les rondes validées et les rencontres complètes comptent.
 * `pts` reprend le premier critère du classement : c'est la valeur que le
 * moteur Suisse utilise pour grouper les équipes.
 * Chaque ligne reçoit `rank` (1 = premier), identique pour les ex æquo parfaits.
 */
export const calculateTeamStandings = (tournament, { rounds = null } = {}) => {
  const settings = normalizeTeamSettings({ teamSettings: tournament?.teamSettings, scoring: tournament?.scoring });
  const teams = tournament?.teams ?? [];
  const entries = teams.map(emptyEntry);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const virtualOpponents = [];

  for (const round of rounds ?? tournament?.roundsData ?? []) {
    if (!round?.validated) continue;
    const encounters = round.encounters ?? [];
    const population = [...new Set(encounters.flatMap((encounter) => [encounter.teamA, encounter.teamB])
      .filter((id) => id != null).map(String))];
    for (const encounter of encounters) {
      const result = computeEncounterResult(encounter, encounterGames(round, encounter.id), settings);
      if (result.status !== 'complete') continue;
      const teamA = byId.get(String(encounter.teamA));
      const teamB = encounter.teamB == null ? null : byId.get(String(encounter.teamB));
      if (teamA) addEncounterOutcome(teamA, 'teamA', result);
      if (teamB) addEncounterOutcome(teamB, 'teamB', result);
      if (result.kind === ENCOUNTER_KINDS.BYE && teamA) teamA.byes += 1;
      if (result.kind === ENCOUNTER_KINDS.PLAYED && teamA && teamB) {
        teamA.opponents.push(teamB.id);
        teamB.opponents.push(teamA.id);
      }
      if (result.beneficiary) {
        virtualOpponents.push({
          beneficiaryId: String(encounter[result.beneficiary]),
          populationIds: population,
        });
      }
    }
  }

  const buchholz = calculateBuchholz({
    entries: entries.map((entry) => ({ id: entry.id, points: entry.sportsMatchPts, opponents: entry.opponents })),
    virtualOpponents,
  });
  for (const entry of entries) {
    const team = teams.find((candidate) => String(candidate.id) === entry.id);
    entry.bonusMalus = (team?.penalties ?? []).reduce((sum, item) => sum + numberOrZero(item.points), 0);
    entry.matchPts = entry.sportsMatchPts + entry.bonusMalus;
    entry.buchholz = buchholz.get(entry.id) ?? 0;
    entry.pts = entry[settings.tiebreaks[0]];
  }

  const ranked = rankStandings(entries, { tiebreaks: settings.tiebreaks, statusPriority: null });
  const compare = compareByTiebreaks(settings.tiebreaks);
  ranked.forEach((entry, index) => {
    entry.rank = index > 0 && compare(ranked[index - 1], entry) === 0 ? ranked[index - 1].rank : index + 1;
  });
  return ranked;
};
