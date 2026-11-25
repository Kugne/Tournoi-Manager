/**
 * Buchholz (SOS) générique : somme des points des adversaires rencontrés,
 * plus un adversaire virtuel pour chaque victoire non jouée (bye, absence).
 *
 * Le module ne connaît que des identifiants et des points : il sert aussi bien
 * au classement individuel (points de tournoi des adversaires) qu'au futur
 * classement par équipes (points de rencontre des équipes adverses).
 */

const roundToHundredth = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * - entries : [{ id, points, opponents: [id adverse, ...] }]
 * - virtualOpponents : [{ beneficiaryId, populationIds }] ; le bénéficiaire
 *   reçoit la moyenne (arrondie au centième) des points de la population de
 *   la ronde, lui-même et les inconnus exclus.
 * Renvoie une Map id (chaîne) → Buchholz.
 */
export const calculateBuchholz = ({ entries = [], virtualOpponents = [] } = {}) => {
  const pointsById = new Map(entries.map((entry) => [String(entry.id), entry.points]));
  const scores = new Map();
  for (const entry of entries) {
    scores.set(String(entry.id), (entry.opponents ?? [])
      .reduce((sum, opponentId) => sum + (pointsById.get(String(opponentId)) ?? 0), 0));
  }
  for (const virtual of virtualOpponents) {
    const beneficiaryId = String(virtual.beneficiaryId);
    const population = [...new Set((virtual.populationIds ?? []).map(String))]
      .filter((id) => id !== beneficiaryId && pointsById.has(id));
    if (!population.length || !scores.has(beneficiaryId)) continue;
    const average = population.reduce((sum, id) => sum + pointsById.get(id), 0) / population.length;
    scores.set(beneficiaryId, scores.get(beneficiaryId) + roundToHundredth(average));
  }
  return scores;
};
