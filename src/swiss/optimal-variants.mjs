import {
  maximumWeightPerfectMatching,
  NoPerfectMatchingError,
} from './blossom-bigint.mjs';
import { buildLexicographicCostModel, pairKey } from './lexicographic-cost.mjs';

// Identifiers are compared by code point: they are stable identifiers, not
// user-facing labels. This also makes signatures independent of locale.
const compareIds = (left, right) => {
  const a = String(left);
  const b = String(right);
  return a === b ? 0 : a < b ? -1 : 1;
};

const signatureOf = (pairing) => JSON.stringify((pairing?.pairs ?? pairing)
  .map((pair) => [String(pair.a), String(pair.b)].sort(compareIds))
  .sort((left, right) => compareIds(JSON.stringify(left), JSON.stringify(right))));

const asSignatureSet = (values) => {
  if (values == null) return new Set();
  if (!Array.isArray(values) && !(values instanceof Set)) {
    throw new TypeError('Les signatures exclues doivent être fournies dans un tableau ou un Set');
  }
  const result = new Set(values);
  if ([...result].some((value) => typeof value !== 'string')) {
    throw new TypeError('Chaque signature exclue doit être une chaîne');
  }
  return result;
};

const sortedKeys = (keys) => [...keys].sort(compareIds);

/** A small min-heap used to avoid scanning all pending sub-problems. */
class MinHeap {
  #items = [];

  get size() {
    return this.#items.length;
  }

  push(item) {
    this.#items.push(item);
    let index = this.#items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareNodes(this.#items[parent], item) <= 0) break;
      this.#items[index] = this.#items[parent];
      index = parent;
    }
    this.#items[index] = item;
  }

  pop() {
    if (this.#items.length === 0) return undefined;
    const first = this.#items[0];
    const last = this.#items.pop();
    if (this.#items.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.#items.length) break;
      const right = left + 1;
      let child = left;
      if (right < this.#items.length && compareNodes(this.#items[right], this.#items[left]) < 0) {
        child = right;
      }
      if (compareNodes(this.#items[child], last) >= 0) break;
      this.#items[index] = this.#items[child];
      index = child;
    }
    this.#items[index] = last;
    return first;
  }
}

const compareNodes = (left, right) => {
  if (left.cost !== right.cost) return left.cost < right.cost ? -1 : 1;
  return left.serial - right.serial;
};

const edgeKeysFromPairs = (pairs) => pairs.map((pair) => pairKey(pair.a, pair.b));

const constraintKey = (forced, banned) => JSON.stringify([
  sortedKeys(forced),
  sortedKeys(banned),
]);

const resolveControls = (context, controls) => {
  const embedded = context?.variantOptions ?? context?.enumerationOptions ?? {};
  const source = { ...embedded, ...controls };
  const excluded = source.excludedSignatures
    ?? source.seenSignatures
    ?? source.excludeSignatures
    ?? context?.excludedSignatures
    ?? context?.seenSignatures
    ?? context?.excludeSignatures
    ?? [];
  const now = typeof source.now === 'function' ? source.now : Date.now;
  const startedAt = now();
  if (source.deadlineMs != null
    && (!Number.isFinite(source.deadlineMs) || Number(source.deadlineMs) < 0)) {
    throw new RangeError('deadlineMs doit être un nombre fini positif ou nul');
  }
  let deadline = source.deadline;
  if (deadline != null && !Number.isFinite(deadline)) {
    throw new RangeError('deadline doit être un horodatage fini');
  }
  if (deadline == null && source.deadlineMs != null) deadline = startedAt + Number(source.deadlineMs);
  const requestedLimit = source.maxVariants ?? source.limit ?? 1;
  if (requestedLimit !== Infinity
    && (!Number.isInteger(requestedLimit) || requestedLimit < 0)) {
    throw new RangeError('maxVariants doit être un entier positif ou nul, ou Infinity');
  }
  return {
    excludedSignatures: asSignatureSet(excluded),
    shouldInterrupt: typeof source.shouldInterrupt === 'function'
      ? source.shouldInterrupt
      : typeof source.shouldStop === 'function'
        ? source.shouldStop
      : typeof source.isCancelled === 'function'
        ? source.isCancelled
        : null,
    signal: source.signal,
    now,
    deadline: Number.isFinite(deadline) ? Number(deadline) : null,
    maxVariants: requestedLimit,
    onProgress: typeof source.onProgress === 'function' ? source.onProgress : null,
  };
};

const interruptionReason = (controls, state) => {
  if (controls.signal?.aborted) return 'cancelled';
  if (controls.deadline != null && controls.now() >= controls.deadline) return 'deadline';
  if (controls.shouldInterrupt?.(state)) return 'callback';
  return null;
};

/**
 * Solve a Lawler/Murty sub-problem using the same exact Blossom model.
 * `forced` and `banned` contain normalized, non-oriented model edge keys.
 */
const solveSubproblem = (model, forced, banned) => {
  const edgeByKey = new Map(model.edges.map((edge) => [edge.key, edge]));
  const forcedEdges = [];
  const used = new Set();
  for (const key of forced) {
    const edge = edgeByKey.get(key);
    if (!edge || banned.has(key) || used.has(edge.a) || used.has(edge.b)) return null;
    used.add(edge.a);
    used.add(edge.b);
    forcedEdges.push(edge);
  }

  const remainingIds = model.participants
    .map((participant) => participant.id)
    .filter((id) => !used.has(id));
  const remainingEdges = model.edges.filter((edge) => (
    !banned.has(edge.key) && !used.has(edge.a) && !used.has(edge.b)
  ));
  let matchingPairs = [];
  if (remainingIds.length > 0) {
    if (remainingIds.length % 2 !== 0) return null;
    const indexById = new Map(remainingIds.map((id, index) => [id, index]));
    const solverEdges = remainingEdges.map((edge) => [
      indexById.get(edge.a),
      indexById.get(edge.b),
      edge.weight,
    ]);
    let matching;
    try {
      matching = maximumWeightPerfectMatching(remainingIds.length, solverEdges);
    } catch (error) {
      if (error instanceof NoPerfectMatchingError || error?.code === 'NO_PERFECT_MATCHING') return null;
      throw error;
    }
    const edgeByPair = new Map(remainingEdges.map((edge) => [edge.key, edge]));
    matchingPairs = matching.pairs.map(({ u, v }) => {
      const key = pairKey(remainingIds[u], remainingIds[v]);
      const edge = edgeByPair.get(key);
      if (!edge) throw new Error('Invariant interne violé : arête de sous-problème introuvable');
      return { a: edge.a, b: edge.b };
    });
  }

  const pairs = forcedEdges.map((edge) => ({ a: edge.a, b: edge.b })).concat(matchingPairs);
  const cost = model.costOfPairing(pairs);
  return { pairs, cost };
};

const makeResult = (variants, optimalCost, exhausted, interrupted, reason, state) => ({
  variants,
  optimalCost,
  exhausted,
  interrupted,
  status: interrupted ? 'interrupted' : exhausted ? 'exhausted' : 'limit',
  reason,
  diagnostics: {
    exploredSubproblems: state.explored,
    queuedSubproblems: state.queueSize,
    excludedSignatures: state.excluded.size,
  },
});

/**
 * Enumerate, on demand, previously unseen perfect pairings tied with the
 * exact optimum of the Swiss cost model.
 *
 * The optional third argument accepts `excludedSignatures`/`seenSignatures`
 * (also `excludeSignatures`), `maxVariants` (also `limit`),
 * `deadline` (an absolute timestamp), `deadlineMs`, `now`,
 * `shouldInterrupt`/`isCancelled`, `signal`, and `onProgress`. An equivalent
 * `variantOptions` object may be placed in the model context. Bye handling is
 * deliberately outside this module: participants must already be even.
 */
export const enumerateOptimalVariants = (participants, context = {}, controls = {}) => {
  const options = resolveControls(context, controls);
  const state = { explored: 0, queueSize: 0, excluded: options.excludedSignatures };
  const initialReason = interruptionReason(options, state);
  if (initialReason) return makeResult([], null, false, true, initialReason, state);

  const model = buildLexicographicCostModel(participants, context);
  const root = solveSubproblem(model, new Set(), new Set());
  state.explored += 1;
  if (!root) {
    throw new NoPerfectMatchingError();
  }
  const optimalCost = root.cost;
  if (options.maxVariants === 0) {
    return makeResult([], optimalCost, false, false, 'limit', state);
  }
  const queue = new MinHeap();
  let serial = 0;
  queue.push({ ...root, forced: new Set(), banned: new Set(), serial: serial += 1 });
  const queuedConstraints = new Set([constraintKey(new Set(), new Set())]);
  const variants = [];
  const returnedSignatures = new Set();

  while (queue.size > 0) {
    state.queueSize = queue.size;
    const reason = interruptionReason(options, state);
    if (reason) return makeResult(variants, optimalCost, false, true, reason, state);
    const node = queue.pop();
    state.queueSize = queue.size;
    if (node.cost > optimalCost) {
      return makeResult(variants, optimalCost, true, false, 'exhausted', state);
    }

    const signature = signatureOf(node.pairs);
    if (!returnedSignatures.has(signature)) {
      returnedSignatures.add(signature);
      if (!options.excludedSignatures.has(signature)) {
        variants.push({
          pairs: node.pairs.map((pair) => ({ ...pair })),
          signature,
          cost: node.cost,
        });
        options.onProgress?.({ type: 'variant', signature, cost: node.cost, count: variants.length });
        if (variants.length >= options.maxVariants) {
          return makeResult(variants, optimalCost, false, false, 'limit', state);
        }
      }
    }

    // Partition this node into disjoint children. Edges already forced by the
    // parent are omitted from the branch sequence; all remaining solution
    // edges are ordered canonically for reproducible enumeration.
    const variableKeys = edgeKeysFromPairs(node.pairs)
      .filter((key) => !node.forced.has(key))
      .sort(compareIds);
    for (let index = 0; index < variableKeys.length; index += 1) {
      state.queueSize = queue.size;
      const childReason = interruptionReason(options, state);
      if (childReason) return makeResult(variants, optimalCost, false, true, childReason, state);
      const childForced = new Set(node.forced);
      for (let prefix = 0; prefix < index; prefix += 1) childForced.add(variableKeys[prefix]);
      const childBanned = new Set(node.banned);
      childBanned.add(variableKeys[index]);
      const key = constraintKey(childForced, childBanned);
      if (queuedConstraints.has(key)) continue;
      queuedConstraints.add(key);
      const child = solveSubproblem(model, childForced, childBanned);
      state.explored += 1;
      if (!child) continue;
      queue.push({
        ...child,
        forced: childForced,
        banned: childBanned,
        serial: serial += 1,
      });
      state.queueSize = queue.size;
      options.onProgress?.({ type: 'subproblem', cost: child.cost, explored: state.explored });
    }
  }

  state.queueSize = 0;
  // Empty queue proves that no unvisited optimum remains, including when all
  // optimal signatures were supplied as persisted exclusions.
  return makeResult(variants, optimalCost, true, false, 'exhausted', state);
};

// Descriptive aliases keep the primitive convenient for callers that use the
// solver vocabulary rather than the UI vocabulary.
export const enumerateOptimalPairings = enumerateOptimalVariants;
export const findOptimalVariants = enumerateOptimalVariants;

export { signatureOf as pairingSignature };
