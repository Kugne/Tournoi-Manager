/**
 * Lignes de classement d'un tournoi sans phase Suisse (élimination directe).
 *
 * Sans phase Suisse, aucun point de tournoi n'est attribué par les matchs :
 * l'ordre provient de la profondeur atteinte dans le tableau. Seuls les scores
 * secondaires (scénario, score libre) et les bonus/malus alimentent les lignes.
 */

export const emptyStandingRow = (player, normalizeStatus = (status) => status) => ({
  id: player.id,
  name: player.name,
  faction: player.faction,
  status: normalizeStatus(player.status),
  compo: player.compo != null ? Number.parseInt(player.compo, 10) || 0 : null,
  pts: 0,
  sportsPts: 0,
  scenario: 0,
  free: 0,
  sos: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  opponents: [],
  bonusMalus: 0,
});

/**
 * - includeSecondaryScores : cumule scénario et score libre des matchs validés
 *   (vrai pour l'élimination directe pure).
 * Les bonus/malus sont ajoutés aux points, comme dans la V2.
 */
export const calculateBracketPhaseStandings = ({
  players = [],
  rounds = [],
  hasFreeScore = false,
  includeSecondaryScores = true,
  normalizeStatus = (status) => status,
} = {}) => {
  const standings = players.map((player) => emptyStandingRow(player, normalizeStatus));
  const byId = Object.fromEntries(standings.map((row) => [row.id, row]));
  if (includeSecondaryScores) {
    for (const round of rounds) {
      if (!round?.validated) continue;
      for (const match of round.matches ?? []) {
        if (match.bye) {
          const row = byId[match.p1];
          if (row) {
            row.scenario += match.byeScenario || 0;
            if (hasFreeScore) row.free += match.byeFree || 0;
          }
          continue;
        }
        const left = byId[match.p1];
        const right = byId[match.p2];
        if (!match.result || !left || !right) continue;
        left.scenario += match.s1 || 0;
        right.scenario += match.s2 || 0;
        if (hasFreeScore) {
          left.free += match.f1 || 0;
          right.free += match.f2 || 0;
        }
      }
    }
  }
  for (const player of players) {
    if (!player.penalties || !player.penalties.length || !byId[player.id]) continue;
    const adjustment = player.penalties.reduce((sum, penalty) => sum + penalty.points, 0);
    byId[player.id].pts += adjustment;
    byId[player.id].bonusMalus = adjustment;
  }
  return standings;
};
