import { normalizeTeamSettings } from './team-encounter.mjs';
import { calculateTeamStandings } from './team-standings.mjs';

const CRITERION_LABELS = Object.freeze({
  matchPts: 'Points de rencontre',
  individualPts: 'Points individuels',
  buchholz: 'Buchholz',
});

const roundToHundredth = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Tableau d'export du classement des équipes, colonnes dans l'ordre du
 * règlement choisi. Renvoie { columns: [libellé], rows: [{ rank, cells }] }
 * où cells suit columns ; les valeurs restent brutes (le formatage CSV ou
 * HTML appartient à l'appelant).
 */
export const teamStandingsExportTable = (tournament) => {
  const settings = normalizeTeamSettings({ teamSettings: tournament?.teamSettings, scoring: tournament?.scoring });
  const standings = calculateTeamStandings(tournament);
  const members = (teamId) => (tournament?.players ?? [])
    .filter((player) => player?.teamId != null && String(player.teamId) === String(teamId))
    .map((player) => player.name)
    .join(', ');
  const columns = [
    'Rang', 'Équipe', 'Joueurs',
    ...settings.tiebreaks.map((field) => CRITERION_LABELS[field]),
    'Bonus/Malus',
    'Rencontres gagnées', 'Rencontres nulles', 'Rencontres perdues',
    'Parties gagnées', 'Parties nulles', 'Parties perdues',
    'Byes', 'Statut',
  ];
  const rows = standings.map((entry) => ({
    rank: entry.rank,
    cells: [
      entry.rank, entry.name, members(entry.id),
      ...settings.tiebreaks.map((field) => (field === 'buchholz' ? roundToHundredth(entry[field]) : entry[field])),
      entry.bonusMalus,
      entry.encounterWins, entry.encounterDraws, entry.encounterLosses,
      entry.gameWins, entry.gameDraws, entry.gameLosses,
      entry.byes, entry.status === 'dropped' ? 'Retirée' : 'Engagée',
    ],
  }));
  return { columns, rows };
};
