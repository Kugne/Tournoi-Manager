/**
 * Encodage exact de l'objectif Suisse lexicographique en coûts BigInt additifs.
 *
 * Les profils triés de la spécification sont représentés par des histogrammes
 * ordonnés du pire au meilleur. Pour un nombre fixe de matchs, comparer ces
 * histogrammes revient exactement à comparer les profils triés décroissants.
 */

const compareIds = (left, right) => {
  const a = String(left);
  const b = String(right);
  return a === b ? 0 : a < b ? -1 : 1;
};

const pairKey = (left, right) => [String(left), String(right)]
  .sort(compareIds)
  .join('\u0000');

const hasValue = (value) => value != null && String(value).trim() !== '';

const normalizeNote = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('fr');

const finiteNumber = (value, label) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new TypeError(`${label} doit être un nombre fini`);
  return Object.is(number, -0) ? 0 : number;
};

const roundNumber = (value) => {
  const number = finiteNumber(value, 'Le numéro de ronde');
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError('Le numéro de ronde doit être un entier positif ou nul');
  }
  return number;
};

const historyRecord = (entry) => {
  if (Array.isArray(entry)) return { a: entry[0], b: entry[1], round: entry[2] ?? 0 };
  return {
    a: entry?.a ?? entry?.playerA ?? entry?.p1,
    b: entry?.b ?? entry?.playerB ?? entry?.p2,
    round: entry?.round ?? entry?.roundNumber ?? 0,
  };
};

const normalizedHistory = (context) => (context.history ?? [])
  .map(historyRecord)
  .filter((entry) => entry.a != null && entry.b != null && String(entry.a) !== String(entry.b))
  .map((entry) => ({
    a: String(entry.a),
    b: String(entry.b),
    round: roundNumber(entry.round),
  }));

const blockedKeys = (participants, context) => {
  const blocked = new Set();
  for (const entry of context.blockedPairs ?? []) {
    const [left, right] = Array.isArray(entry)
      ? entry
      : [entry?.a ?? entry?.playerA ?? entry?.p1, entry?.b ?? entry?.playerB ?? entry?.p2];
    if (left != null && right != null) blocked.add(pairKey(left, right));
  }
  for (const participant of participants) {
    const others = participant.blockedWith ?? participant.blockedAgainst ?? participant.blocked ?? [];
    if (!Array.isArray(others)) continue;
    for (const other of others) blocked.add(pairKey(participant.id, other));
  }
  return blocked;
};

const distinctDescending = (values) => [...new Set(values)].sort((left, right) => right - left);

const addHistogramDimensions = (dimensions, name, values, bound, contribution) => {
  for (const value of distinctDescending(values)) {
    dimensions.push({
      name: `${name}:${String(value)}`,
      bound,
      contribution: (edge) => contribution(edge, value),
    });
  }
};

const makeHistoryIndexes = (participantsById, history) => {
  const opponents = new Map();
  const factionExposures = new Map();
  for (const entry of history) {
    const key = pairKey(entry.a, entry.b);
    const record = opponents.get(key) ?? { count: 0, rounds: [] };
    record.count += 1;
    record.rounds.push(entry.round);
    opponents.set(key, record);

    const left = participantsById.get(entry.a);
    const right = participantsById.get(entry.b);
    if (!left || !right) continue;
    if (hasValue(right.faction)) {
      const exposureKey = `${left.id}\u0000${String(right.faction)}`;
      factionExposures.set(exposureKey, (factionExposures.get(exposureKey) ?? 0) + 1);
    }
    if (hasValue(left.faction)) {
      const exposureKey = `${right.id}\u0000${String(left.faction)}`;
      factionExposures.set(exposureKey, (factionExposures.get(exposureKey) ?? 0) + 1);
    }
  }
  return { opponents, factionExposures };
};

const edgeFeatures = (left, right, indexes, options) => {
  const previous = indexes.opponents.get(pairKey(left.id, right.id));
  const rematch = previous ? 1 : 0;
  const previousCount = previous?.count ?? 0;
  const lastRound = previous ? Math.max(...previous.rounds, 0) : 0;
  const pointGap = Math.abs(
    finiteNumber(left.points, `Points de ${left.id}`) - finiteNumber(right.points, `Points de ${right.id}`),
  );
  const mirror = options.avoidMirrors
    && hasValue(left.faction)
    && hasValue(right.faction)
    && left.faction === right.faction ? 1 : 0;
  const allegiance = options.avoidAlliances
    && hasValue(left.allegiance)
    && hasValue(right.allegiance)
    && left.allegiance === right.allegiance ? 1 : 0;
  const compoGap = options.useCompo && hasValue(left.compo) && hasValue(right.compo)
    ? Math.abs(
      finiteNumber(left.compo, `Compo de ${left.id}`) - finiteNumber(right.compo, `Compo de ${right.id}`),
    )
    : 0;
  const noteEnabled = options.noteMode === 'separer' || options.noteMode === 'separate'
    || options.noteMode === 'regrouper' || options.noteMode === 'group';
  const leftNote = noteEnabled ? normalizeNote(left.note) : '';
  const rightNote = noteEnabled ? normalizeNote(right.note) : '';
  const sameNonEmptyNote = leftNote !== '' && leftNote === rightNote;
  const noteCost = options.noteMode === 'separer' || options.noteMode === 'separate'
    ? Number(sameNonEmptyNote)
    : options.noteMode === 'regrouper' || options.noteMode === 'group'
      ? Number(!sameNonEmptyNote)
      : 0;
  const leftFactionExposure = hasValue(right.faction)
    ? indexes.factionExposures.get(`${left.id}\u0000${String(right.faction)}`) ?? 0
    : 0;
  const rightFactionExposure = hasValue(left.faction)
    ? indexes.factionExposures.get(`${right.id}\u0000${String(left.faction)}`) ?? 0
    : 0;

  return {
    rematch,
    previousCount,
    lastRound,
    pointGap,
    mirror,
    allegiance,
    compoGap,
    noteCost,
    factionExposures: [leftFactionExposure, rightFactionExposure],
  };
};

const buildDimensions = (edges, matchCount, options) => {
  const dimensions = [{ name: 'rematches', bound: matchCount, contribution: (edge) => edge.features.rematch }];
  const rematchEdges = edges.filter((edge) => edge.features.rematch);
  addHistogramDimensions(
    dimensions,
    'previous-meetings',
    rematchEdges.map((edge) => edge.features.previousCount),
    matchCount,
    (edge, value) => Number(edge.features.rematch && edge.features.previousCount === value),
  );
  addHistogramDimensions(
    dimensions,
    'rematch-recency',
    rematchEdges.map((edge) => edge.features.lastRound),
    matchCount,
    (edge, value) => Number(edge.features.rematch && edge.features.lastRound === value),
  );
  addHistogramDimensions(
    dimensions,
    'point-gap',
    edges.map((edge) => edge.features.pointGap),
    matchCount,
    (edge, value) => Number(edge.features.pointGap === value),
  );
  if (options.avoidMirrors) {
    dimensions.push({ name: 'mirrors', bound: matchCount, contribution: (edge) => edge.features.mirror });
  }
  if (options.avoidAlliances) {
    dimensions.push({ name: 'alliances', bound: matchCount, contribution: (edge) => edge.features.allegiance });
  }
  if (options.useCompo) {
    addHistogramDimensions(
      dimensions,
      'compo-gap',
      edges.map((edge) => edge.features.compoGap),
      matchCount,
      (edge, value) => Number(edge.features.compoGap === value),
    );
  }
  if (options.noteMode === 'separer' || options.noteMode === 'separate'
    || options.noteMode === 'regrouper' || options.noteMode === 'group') {
    dimensions.push({ name: 'notes', bound: matchCount, contribution: (edge) => edge.features.noteCost });
  }
  addHistogramDimensions(
    dimensions,
    'faction-exposure',
    edges.flatMap((edge) => edge.features.factionExposures),
    matchCount * 2,
    (edge, value) => edge.features.factionExposures.filter((item) => item === value).length,
  );
  return dimensions;
};

const attachMultipliers = (dimensions) => {
  let multiplier = 1n;
  for (let index = dimensions.length - 1; index >= 0; index -= 1) {
    const dimension = dimensions[index];
    dimension.multiplier = multiplier;
    multiplier *= BigInt(dimension.bound + 1);
  }
  return multiplier;
};

/** Build an exact additive cost model for one pairing context. */
export const buildLexicographicCostModel = (participants, context = {}) => {
  if (!Array.isArray(participants) || participants.length < 2 || participants.length % 2 !== 0) {
    throw new Error('Le modèle exige un nombre pair d’au moins deux participants, bye déjà retiré');
  }
  if (participants.some((participant) => participant?.id == null || String(participant.id).trim() === '')) {
    throw new Error('Chaque participant doit avoir un identifiant non vide');
  }
  if (participants.some((participant) => String(participant.id).includes('\u0000'))) {
    throw new Error('Les identifiants ne peuvent pas contenir le caractère NUL');
  }
  const ids = participants.map((participant) => String(participant.id));
  if (new Set(ids).size !== ids.length) throw new Error('Les identifiants des participants doivent être uniques');
  const normalizedParticipants = participants.map((participant) => ({ ...participant, id: String(participant.id) }));
  const byId = new Map(normalizedParticipants.map((participant) => [participant.id, participant]));
  const options = context.options ?? context;
  for (const participant of normalizedParticipants) {
    finiteNumber(participant.points, `Points de ${participant.id}`);
    if (options.useCompo) finiteNumber(participant.compo, `Compo de ${participant.id}`);
  }
  const history = normalizedHistory(context);
  const indexes = makeHistoryIndexes(byId, history);
  const blocked = blockedKeys(normalizedParticipants, context);
  const edges = [];

  for (let leftIndex = 0; leftIndex < normalizedParticipants.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedParticipants.length; rightIndex += 1) {
      const left = normalizedParticipants[leftIndex];
      const right = normalizedParticipants[rightIndex];
      if (blocked.has(pairKey(left.id, right.id)) || context.isBlocked?.(left, right)) continue;
      edges.push({
        a: left.id,
        b: right.id,
        key: pairKey(left.id, right.id),
        features: edgeFeatures(left, right, indexes, options),
      });
    }
  }

  const matchCount = normalizedParticipants.length / 2;
  const dimensions = buildDimensions(edges, matchCount, options);
  const costRange = attachMultipliers(dimensions);
  const edgeByKey = new Map();
  for (const edge of edges) {
    edge.digits = dimensions.map((dimension) => dimension.contribution(edge));
    edge.cost = edge.digits.reduce(
      (total, digit, index) => total + BigInt(digit) * dimensions[index].multiplier,
      0n,
    );
    edgeByKey.set(edge.key, edge);
  }
  const maximumEdgeCost = edges.reduce((maximum, edge) => edge.cost > maximum ? edge.cost : maximum, 0n);
  for (const edge of edges) edge.weight = maximumEdgeCost - edge.cost + 1n;

  const costOfPairing = (pairing) => {
    const pairs = pairing?.pairs ?? pairing;
    if (!Array.isArray(pairs) || pairs.length !== matchCount) {
      throw new Error(`Un appariement complet doit contenir ${matchCount} matchs`);
    }
    const used = new Set();
    let total = 0n;
    for (const pair of pairs) {
      const a = String(pair.a ?? pair.p1);
      const b = String(pair.b ?? pair.p2);
      if (a === b || used.has(a) || used.has(b) || !byId.has(a) || !byId.has(b)) {
        throw new Error('Appariement incomplet, dupliqué ou invalide');
      }
      const edge = edgeByKey.get(pairKey(a, b));
      if (!edge) throw new Error(`Paire interdite ou inconnue : ${a} / ${b}`);
      used.add(a);
      used.add(b);
      total += edge.cost;
    }
    if (used.size !== normalizedParticipants.length) throw new Error('Tous les participants doivent être appariés');
    return total;
  };

  return {
    participants: normalizedParticipants,
    edges,
    dimensions: dimensions.map(({ contribution, ...dimension }) => dimension),
    matchCount,
    costRange,
    maximumEdgeCost,
    costOfPairing,
    comparePairings(left, right) {
      const leftCost = costOfPairing(left);
      const rightCost = costOfPairing(right);
      return leftCost === rightCost ? 0 : leftCost < rightCost ? -1 : 1;
    },
  };
};

export { normalizeNote, pairKey };
