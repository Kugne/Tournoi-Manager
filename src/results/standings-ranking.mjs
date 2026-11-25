/**
 * Tri d'un classement selon une liste ordonnée de départages.
 *
 * Module pur et générique : il ne connaît ni les joueurs ni les équipes, il
 * compare des lignes de classement portant des champs numériques. Le
 * classement individuel et le futur classement par équipes ne diffèrent que
 * par la liste de départages passée en paramètre.
 */

/** Priorité d'affichage par statut : les inscrits non engagés et les éliminés du cut passent après. */
export const STANDING_STATUS_PRIORITY = Object.freeze({
  active: 0,
  absent: 0,
  dropped: 0,
  eliminatedcut: 2,
  inscrit: 1,
  preinscrit: 1,
});

/** Champs de départage connus du classement individuel, du plus fort au plus faible. */
export const INDIVIDUAL_TIEBREAKS = Object.freeze({
  POINTS: 'pts',
  SCENARIO: 'scenario',
  FREE: 'free',
  SOS: 'sos',
});

/**
 * Ordre de départage du classement Suisse individuel : points de tournoi,
 * points de scénario, score libre (s'il existe) puis SOS.
 */
export const individualTiebreakOrder = ({ hasFreeScore = false } = {}) => [
  INDIVIDUAL_TIEBREAKS.POINTS,
  INDIVIDUAL_TIEBREAKS.SCENARIO,
  ...(hasFreeScore ? [INDIVIDUAL_TIEBREAKS.FREE] : []),
  INDIVIDUAL_TIEBREAKS.SOS,
];

/** Compare deux lignes sur une liste de champs, chaque champ trié du plus grand au plus petit. */
export const compareByTiebreaks = (tiebreaks) => {
  const fields = [...tiebreaks];
  return (left, right) => {
    for (const field of fields) {
      if (right[field] !== left[field]) return right[field] - left[field];
    }
    return 0;
  };
};

const EMPTY_BRACKET_DEPTH = Object.freeze({
  wins: 0,
  eliminatedAt: -1,
  champion: false,
  runnerUp: false,
  thirdPlaceWin: false,
  thirdPlaceLoss: false,
});

/** Ordre du tableau final : champion, finaliste, vainqueur de petite finale, puis profondeur atteinte. */
export const compareBracketDepth = (leftDepth, rightDepth) => {
  const left = leftDepth || EMPTY_BRACKET_DEPTH;
  const right = rightDepth || EMPTY_BRACKET_DEPTH;
  if (left.champion !== right.champion) return left.champion ? -1 : 1;
  if (left.runnerUp !== right.runnerUp) return left.runnerUp ? -1 : 1;
  if (left.thirdPlaceWin !== right.thirdPlaceWin) return left.thirdPlaceWin ? -1 : 1;
  if (left.wins !== right.wins) return right.wins - left.wins;
  if (left.eliminatedAt !== right.eliminatedAt) return right.eliminatedAt - left.eliminatedAt;
  if (left.thirdPlaceLoss !== right.thirdPlaceLoss) return left.thirdPlaceLoss ? 1 : -1;
  return 0;
};

/**
 * Trie un classement et renvoie un nouveau tableau (les lignes ne sont pas copiées).
 *
 * - bracketDepth : profondeur atteinte dans le tableau final par identifiant ;
 *   lorsqu'elle est fournie, elle prime sur tout le reste.
 * - statusPriority : rang d'affichage par statut ; null pour l'ignorer.
 * - fallbackField : dernier critère croissant (rang Suisse figé d'un instantané).
 * Le tri est stable : les égalités parfaites conservent l'ordre reçu.
 */
export const rankStandings = (standings, {
  tiebreaks,
  bracketDepth = null,
  statusPriority = STANDING_STATUS_PRIORITY,
  fallbackField = null,
} = {}) => {
  if (!Array.isArray(standings)) throw new TypeError('Classement à trier requis');
  if (!Array.isArray(tiebreaks)) throw new TypeError('Liste de départages requise');
  const compareScores = compareByTiebreaks(tiebreaks);
  return [...standings].sort((left, right) => {
    if (bracketDepth) {
      const depthOrder = compareBracketDepth(bracketDepth[left.id], bracketDepth[right.id]);
      if (depthOrder !== 0) return depthOrder;
    }
    if (statusPriority) {
      const leftPriority = statusPriority[left.status] ?? 0;
      const rightPriority = statusPriority[right.status] ?? 0;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    }
    const scoreOrder = compareScores(left, right);
    if (scoreOrder !== 0) return scoreOrder;
    return fallbackField ? left[fallbackField] - right[fallbackField] : 0;
  });
};
