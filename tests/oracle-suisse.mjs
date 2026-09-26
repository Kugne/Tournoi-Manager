/**
 * Oracle exhaustif minimal pour les appariements suisses individuels.
 *
 * Le module est volontairement indépendant de l'application HTML. Il sert de
 * référence exacte pour les petits effectifs : toutes les couplages parfaits
 * sont énumérés, puis comparés selon la hiérarchie fonctionnelle du cadrage.
 * Il ne choisit pas de variante aléatoire et ne connaît pas les règles d'UI.
 */

// Code-point ordering keeps signatures reproducible independently of the host
// locale (IDs are identifiers, not user-facing text).
const compareIds = (left, right) => {
  const leftText = String(left);
  const rightText = String(right);
  return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
};

const pairKey = (left, right) => {
  const ids = [String(left), String(right)].sort(compareIds);
  return `${ids[0]}\u0000${ids[1]}`;
};

const normalizeNote = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('fr');

const descending = (values) => [...values].sort((left, right) => right - left);

const hasValue = (value) => value != null && String(value).trim() !== '';

const compareSequences = (left = [], right = []) => {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
  }
  return 0;
};

/** Compare two objective vectors. A negative result means `left` is better. */
export const compareObjective = (left, right) => {
  const leftCriteria = left?.criteria ?? left ?? [];
  const rightCriteria = right?.criteria ?? right ?? [];
  const length = Math.max(leftCriteria.length, rightCriteria.length);

  for (let index = 0; index < length; index += 1) {
    const leftCriterion = leftCriteria[index] ?? [];
    const rightCriterion = rightCriteria[index] ?? [];
    const comparison = Array.isArray(leftCriterion) || Array.isArray(rightCriterion)
      ? compareSequences(
        Array.isArray(leftCriterion) ? leftCriterion : [leftCriterion],
        Array.isArray(rightCriterion) ? rightCriterion : [rightCriterion],
      )
      : compareSequences([leftCriterion], [rightCriterion]);
    if (comparison !== 0) return comparison;
  }
  return 0;
};

const historyRecord = (entry) => {
  if (Array.isArray(entry)) return { a: entry[0], b: entry[1], round: entry[2] ?? 0 };
  return {
    a: entry?.a ?? entry?.playerA ?? entry?.p1,
    b: entry?.b ?? entry?.playerB ?? entry?.p2,
    round: Number(entry?.round ?? entry?.roundNumber ?? 0),
  };
};

const getHistory = (context = {}) => (context.history ?? [])
  .map(historyRecord)
  .filter((entry) => entry.a != null && entry.b != null && String(entry.a) !== String(entry.b));

const blockedKeys = (context = {}, participantsById) => {
  const keys = new Set();
  for (const entry of context.blockedPairs ?? []) {
    const [left, right] = Array.isArray(entry)
      ? entry
      : [entry?.a ?? entry?.playerA ?? entry?.p1, entry?.b ?? entry?.playerB ?? entry?.p2];
    if (left != null && right != null) keys.add(pairKey(left, right));
  }
  for (const participant of participantsById.values()) {
    for (const other of participant.blockedWith ?? participant.blockedAgainst ?? []) {
      keys.add(pairKey(participant.id, other));
    }
  }
  return keys;
};

const isBlocked = (left, right, context, participantsById, blocked) => (
  blocked.has(pairKey(left.id, right.id))
  || blocked.has(pairKey(right.id, left.id))
  || Boolean(left.blocked && left.blocked.includes(right.id))
  || Boolean(right.blocked && right.blocked.includes(left.id))
  || Boolean(context.isBlocked?.(left, right))
);

/**
 * Return a stable, non-oriented signature. Pair order and table order do not
 * affect it; a bye is represented explicitly so it cannot collide with a
 * normal pairing.
 */
export const pairingSignature = (pairing) => {
  const pairs = pairing?.pairs ?? pairing ?? [];
  const signatures = pairs.map((entry) => {
    if (entry.bye != null) return `BYE:${String(entry.bye)}`;
    if (entry.a == null || entry.b == null) throw new TypeError('Une paire doit contenir a et b');
    return pairKey(entry.a, entry.b).replace('\u0000', '~');
  });
  if (pairing?.bye != null && !signatures.some((entry) => entry === `BYE:${String(pairing.bye)}`)) {
    signatures.push(`BYE:${String(pairing.bye)}`);
  }
  return signatures.sort(compareIds).join('|');
};

/**
 * Enumerate every valid perfect pairing. `byeId` fixes the bye beneficiary;
 * omitting it means that no bye is present. An odd population without a bye
 * is rejected rather than silently dropping a participant.
 */
export const enumeratePairings = (participants, context = {}) => {
  if (!Array.isArray(participants) || participants.length === 0) return [];
  if (participants.length < 2) {
    throw new Error('Au moins deux participants sont nécessaires pour lancer une ronde Suisse');
  }
  const byId = new Map(participants.map((participant) => [String(participant.id), participant]));
  const byeId = context.byeId == null ? null : String(context.byeId);
  if (byeId != null && !byId.has(byeId)) throw new Error(`Bye inconnu : ${byeId}`);

  const remaining = participants
    .map((participant) => String(participant.id))
    .filter((id) => id !== byeId);
  if (remaining.length % 2 !== 0) {
    throw new Error('Un nombre pair de participants est nécessaire sans bye fixé');
  }

  const blocked = blockedKeys(context, byId);
  const results = [];
  const recurse = (ids, pairs) => {
    if (ids.length === 0) {
      const pairing = { pairs: pairs.map((pair) => ({ ...pair })), bye: byeId };
      pairing.signature = pairingSignature(pairing);
      results.push(pairing);
      return;
    }
    const firstId = ids[0];
    const first = byId.get(firstId);
    for (let index = 1; index < ids.length; index += 1) {
      const secondId = ids[index];
      const second = byId.get(secondId);
      if (isBlocked(first, second, context, byId, blocked)) continue;
      const nextIds = ids.slice(1, index).concat(ids.slice(index + 1));
      recurse(nextIds, pairs.concat({ a: firstId, b: secondId }));
    }
  };
  recurse(remaining, []);
  return results;
};

const resolveOptions = (context) => context.options ?? context;

const participantMap = (participants) => new Map(
  participants.map((participant) => [String(participant.id), participant]),
);

const rematchData = (pairs, history) => {
  const byKey = new Map();
  for (const entry of history) {
    const key = pairKey(entry.a, entry.b);
    const previous = byKey.get(key) ?? { count: 0, rounds: [] };
    previous.count += 1;
    previous.rounds.push(entry.round);
    byKey.set(key, previous);
  }
  const repeats = pairs
    .map((pair) => byKey.get(pairKey(pair.a, pair.b)))
    .filter(Boolean);
  const count = repeats.length;
  const profiles = descending(repeats.map((entry) => entry.count));
  const recency = repeats
    .map((entry) => Math.max(...entry.rounds, 0))
    .sort((left, right) => right - left);
  return { count, profiles, recency };
};

const factionExposureProfile = (pairs, participantsById, history) => {
  const previousByPlayerFaction = new Map();
  for (const entry of history) {
    const left = participantsById.get(String(entry.a));
    const right = participantsById.get(String(entry.b));
    if (!left || !right) continue;
    if (hasValue(right.faction)) {
      const leftKey = `${left.id}\u0000${String(right.faction)}`;
      previousByPlayerFaction.set(leftKey, (previousByPlayerFaction.get(leftKey) ?? 0) + 1);
    }
    if (hasValue(left.faction)) {
      const rightKey = `${right.id}\u0000${String(left.faction)}`;
      previousByPlayerFaction.set(rightKey, (previousByPlayerFaction.get(rightKey) ?? 0) + 1);
    }
  }
  const exposures = [];
  for (const pair of pairs) {
    const left = participantsById.get(String(pair.a));
    const right = participantsById.get(String(pair.b));
    exposures.push(hasValue(right.faction)
      ? previousByPlayerFaction.get(`${left.id}\u0000${String(right.faction)}`) ?? 0
      : 0);
    exposures.push(hasValue(left.faction)
      ? previousByPlayerFaction.get(`${right.id}\u0000${String(left.faction)}`) ?? 0
      : 0);
  }
  return descending(exposures);
};

/**
 * Build the lexicographic objective for one complete pairing.
 * Criteria are nested to prevent a variable-length profile from shifting the
 * following hierarchy level. Lower is always better.
 */
export const objectiveForPairing = (participants, pairing, context = {}) => {
  const byId = participantMap(participants);
  const options = resolveOptions(context);
  const history = getHistory(context);
  const pairs = pairing?.pairs ?? pairing;
  const rematches = rematchData(pairs, history);
  const pointGaps = descending(pairs.map((pair) => Math.abs(
    Number(byId.get(String(pair.a))?.points ?? 0) - Number(byId.get(String(pair.b))?.points ?? 0),
  )));
  const mirrorCount = pairs.filter((pair) => {
    const left = byId.get(String(pair.a));
    const right = byId.get(String(pair.b));
    return options.avoidMirrors
      && hasValue(left?.faction)
      && hasValue(right?.faction)
      && left.faction === right.faction;
  }).length;
  const allegianceCount = pairs.filter((pair) => {
    const left = byId.get(String(pair.a));
    const right = byId.get(String(pair.b));
    return options.avoidAlliances
      && hasValue(left?.allegiance)
      && hasValue(right?.allegiance)
      && left.allegiance === right.allegiance;
  }).length;
  const compoGaps = options.useCompo
    ? descending(pairs.map((pair) => Math.abs(
      Number(byId.get(String(pair.a))?.compo ?? 0) - Number(byId.get(String(pair.b))?.compo ?? 0),
    )))
    : [];
  const noteMatches = pairs.filter((pair) => {
    const left = normalizeNote(byId.get(String(pair.a))?.note);
    const right = normalizeNote(byId.get(String(pair.b))?.note);
    return left !== '' && left === right;
  }).length;
  const noteCriterion = options.noteMode === 'regrouper' || options.noteMode === 'group'
    ? -noteMatches
    : options.noteMode === 'separer' || options.noteMode === 'separate'
      ? noteMatches
      : 0;
  const factionProfile = factionExposureProfile(pairs, byId, history);

  const criteria = [
    [rematches.count, ...rematches.profiles, ...rematches.recency],
    pointGaps,
    [mirrorCount],
    [allegianceCount],
    compoGaps,
    [noteCriterion],
    factionProfile,
  ];
  return {
    criteria,
    vector: criteria,
    details: {
      rematches,
      pointGaps,
      mirrorCount,
      allegianceCount,
      compoGaps,
      noteMatches,
      noteCriterion,
      factionProfile,
    },
  };
};

/** Solve exactly and retain every pairing tied for the best objective. */
export const solveOptimalPairings = (participants, context = {}) => {
  const candidates = enumeratePairings(participants, context);
  let best = null;
  const optimal = [];
  for (const pairing of candidates) {
    const objective = objectiveForPairing(participants, pairing, context);
    if (!best) {
      best = objective;
      optimal.push({ ...pairing, objective });
      continue;
    }
    const comparison = compareObjective(objective, best);
    if (comparison < 0) {
      best = objective;
      optimal.length = 0;
      optimal.push({ ...pairing, objective });
    } else if (comparison === 0) {
      optimal.push({ ...pairing, objective });
    }
  }
  optimal.sort((left, right) => compareIds(left.signature, right.signature));
  return {
    candidates,
    bestObjective: best,
    optimal,
    signatures: optimal.map((pairing) => pairing.signature),
  };
};

export { normalizeNote, pairKey };
