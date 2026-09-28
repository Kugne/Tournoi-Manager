import { writeMatchOutcome } from '../results/match-outcome.mjs';

const finiteNumber = (value, label) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new TypeError(`${label} doit être un nombre fini`);
  return Object.is(number, -0) ? 0 : number;
};

const activePlayers = (tournament) => (tournament.players ?? [])
  .filter((player) => player.status === 'active');

const standingsIndex = (standings) => new Map(
  standings.map((standing, index) => [String(standing.id), { ...standing, rank: index }]),
);

const roundMatches = (tournament, roundIndex) => (tournament.roundsData ?? [])
  .flatMap((round, index) => index === roundIndex || round.validated !== true
    ? []
    : (round.matches ?? []).map((match) => ({ match, round: index + 1 })));

const byeCounts = (tournament, roundIndex) => {
  const counts = new Map();
  for (const { match } of roundMatches(tournament, roundIndex)) {
    if (match.bye && match.p1 != null) {
      const id = String(match.p1);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
};

const currentBye = (tournament, roundIndex, eligibleIds) => {
  const round = tournament.roundsData?.[roundIndex];
  const match = round?.matches?.find((candidate) => candidate.bye && candidate.p1 != null);
  const id = match == null ? null : String(match.p1);
  return id != null && eligibleIds.has(id) ? id : null;
};

/**
 * Selects the bye before the exact matching is built.
 * A reroll keeps its eligible beneficiary. Otherwise the fewest prior byes
 * wins, with the lowest-ranked eligible player as the tiebreaker.
 */
export const selectSwissBye = ({ tournament, roundIndex, standings }) => {
  const active = activePlayers(tournament);
  if (active.length % 2 === 0) return null;
  const eligibleIds = new Set(active.map((player) => String(player.id)));
  const preserved = currentBye(tournament, roundIndex, eligibleIds);
  if (preserved != null) return preserved;

  const byId = standingsIndex(standings);
  const counts = byeCounts(tournament, roundIndex);
  const ranked = active.map((player) => {
    const id = String(player.id);
    const standing = byId.get(id);
    if (!standing) throw new Error(`Classement absent pour le joueur actif ${id}`);
    return { id, rank: standing.rank, count: counts.get(id) ?? 0 };
  });
  const minimum = Math.min(...ranked.map((entry) => entry.count));
  return ranked
    .filter((entry) => entry.count === minimum)
    .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))[0].id;
};

/** Maps the monolithic application's persisted tournament to the pure engine. */
export const buildSwissEngineInput = ({
  tournament,
  roundIndex,
  standings,
  allegianceForFaction = () => null,
}) => {
  if (!tournament || !Number.isInteger(roundIndex) || roundIndex < 0) {
    throw new TypeError('Tournoi et index de ronde valides requis');
  }
  if (!Array.isArray(standings)) throw new TypeError('Le classement courant est requis');
  const active = activePlayers(tournament);
  if (active.length < 2) throw new Error('Une ronde Suisse exige au moins deux joueurs actifs');
  const standingById = standingsIndex(standings);
  const byePlayerId = selectSwissBye({ tournament, roundIndex, standings });
  const useCompo = tournament.compoPairing == null
    ? tournament.secondaryCriteria?.compo === true
    : tournament.compoPairing === true;
  const avoidAlliances = tournament.secondaryCriteria?.allegiance === true;

  const participants = active
    .filter((player) => String(player.id) !== byePlayerId)
    .map((player) => {
      const id = String(player.id);
      const standing = standingById.get(id);
      if (!standing) throw new Error(`Classement absent pour le joueur actif ${id}`);
      return {
        id,
        points: finiteNumber(standing.pts, `Points de ${id}`),
        faction: player.faction ?? '',
        allegiance: avoidAlliances ? allegianceForFaction(player.faction) ?? '' : '',
        compo: player.compo ?? null,
        note: player.note ?? '',
      };
    });

  const history = roundMatches(tournament, roundIndex)
    .filter(({ match }) => !match.bye && match.p1 != null && match.p2 != null)
    .map(({ match, round }) => ({ a: String(match.p1), b: String(match.p2), round }));
  const blockedPairs = (tournament.blocks ?? [])
    .filter((block) => block.p1 != null && block.p2 != null)
    .map((block) => ({ a: String(block.p1), b: String(block.p2) }));
  const noteMode = tournament.noteMatchCriteria ?? tournament.secondaryCriteria?.free ?? 'none';

  return {
    participants,
    context: {
      history,
      blockedPairs,
      options: {
        avoidMirrors: tournament.secondaryCriteria?.mirror === true,
        avoidAlliances,
        useCompo,
        noteMode,
      },
    },
    byePlayerId,
    excludedSignatures: [...(tournament.roundsData?.[roundIndex]?.swissPairingSignatures ?? [])],
  };
};

const canonicalPair = (pair) => ({
  p1: String(pair.a ?? pair.p1),
  p2: String(pair.b ?? pair.p2),
});

/** Converts an atomic engine result to the application's persisted match shape. */
export const buildApplicationMatches = ({
  engineResult,
  standings,
  byePlayerId = null,
  byeScenario = 0,
  byeFree = 0,
}) => {
  if (!Array.isArray(engineResult?.pairs)) throw new TypeError('Résultat moteur incomplet');
  if (!Array.isArray(standings)) throw new TypeError('Le classement courant est requis');
  const byId = standingsIndex(standings);
  for (const pair of engineResult.pairs.map(canonicalPair)) {
    if (!byId.has(pair.p1) || !byId.has(pair.p2)) {
      throw new Error('Classement incomplet pour numéroter les tables');
    }
  }
  const pairs = engineResult.pairs.map(canonicalPair);
  pairs.sort((left, right) => {
    const leftA = byId.get(left.p1);
    const leftB = byId.get(left.p2);
    const rightA = byId.get(right.p1);
    const rightB = byId.get(right.p2);
    const leftTotal = finiteNumber(leftA.pts, `Points de ${left.p1}`)
      + finiteNumber(leftB.pts, `Points de ${left.p2}`);
    const rightTotal = finiteNumber(rightA.pts, `Points de ${right.p1}`)
      + finiteNumber(rightB.pts, `Points de ${right.p2}`);
    const pointDifference = rightTotal - leftTotal;
    if (pointDifference !== 0) return pointDifference;
    const rankDifference = Math.min(leftA.rank, leftB.rank) - Math.min(rightA.rank, rightB.rank);
    if (rankDifference !== 0) return rankDifference;
    return `${left.p1}\u0000${left.p2}`.localeCompare(`${right.p1}\u0000${right.p2}`);
  });

  const matches = pairs.map((pair, index) => writeMatchOutcome({
    ...pair,
    s1: 0,
    s2: 0,
    f1: 0,
    f2: 0,
    table: index + 1,
  }, { kind: null, result: null, started: null }));
  if (byePlayerId != null) {
    matches.push(writeMatchOutcome({
      p1: String(byePlayerId),
      p2: null,
      byeScenario: finiteNumber(byeScenario, 'Score scénario du bye'),
      byeFree: finiteNumber(byeFree, 'Score libre du bye'),
      table: matches.length + 1,
    }, { kind: 'bye', result: null, started: false }));
  }
  return matches;
};
