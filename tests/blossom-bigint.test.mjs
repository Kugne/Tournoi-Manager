import assert from 'node:assert/strict';
import test from 'node:test';

import {
  maximumWeightPerfectMatching,
  NoPerfectMatchingError,
} from '../src/swiss/blossom-bigint.mjs';

const key = (u, v) => u < v ? `${u}:${v}` : `${v}:${u}`;

const exhaustivePerfectMatching = (vertexCount, edges) => {
  if ((vertexCount & 1) !== 0) return null;
  const byVertex = Array.from({ length: vertexCount }, () => []);
  edges.forEach((edge, index) => {
    const [u, v, weight] = edge;
    byVertex[u].push({ u, v, weight, index });
    byVertex[v].push({ u, v, weight, index });
  });
  let best = null;
  const search = (remaining, pairs, totalWeight) => {
    if (remaining.size === 0) {
      if (best === null || totalWeight > best.totalWeight) {
        best = { pairs: [...pairs], totalWeight };
      }
      return;
    }
    const u = remaining.values().next().value;
    remaining.delete(u);
    for (const edge of byVertex[u]) {
      const v = edge.u === u ? edge.v : edge.u;
      if (!remaining.has(v)) continue;
      remaining.delete(v);
      pairs.push({ u: Math.min(u, v), v: Math.max(u, v), weight: edge.weight });
      search(remaining, pairs, totalWeight + edge.weight);
      pairs.pop();
      remaining.add(v);
    }
    remaining.add(u);
  };
  search(new Set(Array.from({ length: vertexCount }, (_, index) => index)), [], 0n);
  return best;
};

const assertSameAsOracle = (vertexCount, edges) => {
  const oracle = exhaustivePerfectMatching(vertexCount, edges);
  if (oracle === null) {
    assert.throws(
      () => maximumWeightPerfectMatching(vertexCount, edges),
      (error) => error instanceof NoPerfectMatchingError && error.code === 'NO_PERFECT_MATCHING',
    );
    return;
  }
  const result = maximumWeightPerfectMatching(vertexCount, edges);
  assert.equal(result.totalWeight, oracle.totalWeight);
  assert.equal(result.pairs.length, vertexCount / 2);
  assert.equal(new Set(result.pairs.flatMap(({ u, v }) => [u, v])).size, vertexCount);
  const available = new Set(edges.map(([u, v]) => key(u, v)));
  assert.ok(result.pairs.every(({ u, v }) => available.has(key(u, v))));
};

const generator = (initialSeed) => {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
};

test('toutes les topologies simples à quatre sommets concordent avec l’énumération exhaustive', () => {
  const possible = [];
  for (let u = 0; u < 4; u += 1) {
    for (let v = u + 1; v < 4; v += 1) possible.push([u, v]);
  }
  for (let mask = 0; mask < 2 ** possible.length; mask += 1) {
    const edges = possible
      .filter((_, index) => (mask & (1 << index)) !== 0)
      .map(([u, v], index) => [u, v, BigInt(((mask + 3) * (index + 5)) % 17 - 8)]);
    assertSameAsOracle(4, edges);
  }
});

test('les 32 768 topologies simples non pondérées à six sommets concordent avec l’oracle', () => {
  const possible = [];
  for (let u = 0; u < 6; u += 1) {
    for (let v = u + 1; v < 6; v += 1) possible.push([u, v, 1n]);
  }
  for (let mask = 0; mask < 2 ** possible.length; mask += 1) {
    const edges = possible.filter((_, index) => (mask & (1 << index)) !== 0);
    assertSameAsOracle(6, edges);
  }
});

test('les petits graphes pondérés pseudo-aléatoires concordent systématiquement avec l’oracle', () => {
  const random = generator(0x5eedb105);
  for (let iteration = 0; iteration < 600; iteration += 1) {
    const vertexCount = [2, 4, 6, 8, 10][random() % 5];
    const edges = [];
    for (let u = 0; u < vertexCount; u += 1) {
      for (let v = u + 1; v < vertexCount; v += 1) {
        if ((random() % 100) < 58) {
          const weight = BigInt(Number(random() % 81) - 40);
          edges.push([u, v, weight]);
        }
      }
    }
    assertSameAsOracle(vertexCount, edges);
  }
});

test('un blossom impair est contracté sans sacrifier l’optimum parfait', () => {
  const edges = [
    [0, 1, 8n],
    [0, 2, 9n],
    [1, 2, 10n],
    [2, 3, 7n],
  ];
  const result = maximumWeightPerfectMatching(4, edges);
  assert.equal(result.totalWeight, 15n);
  assert.deepEqual(result.pairs.map(({ u, v }) => [u, v]), [[0, 1], [2, 3]]);
});

test('des blossoms impairs reliés entre eux concordent avec l’oracle', () => {
  const edges = [
    [0, 1, 8n], [0, 2, 9n], [1, 2, 10n],
    [0, 3, 7n], [1, 4, 7n], [2, 5, 7n],
    [3, 4, 5n], [4, 5, 6n], [5, 3, 5n],
  ];
  assertSameAsOracle(6, edges);
});

test('les poids supérieurs à MAX_SAFE_INTEGER restent exacts', () => {
  const huge = 2n ** 100n;
  const edges = [
    [0, 1, huge + 1n],
    [2, 3, huge + 1n],
    [0, 2, huge + 2n],
    [1, 3, huge + 2n],
    [0, 3, 1n],
    [1, 2, 1n],
  ];
  const result = maximumWeightPerfectMatching(4, edges);
  assert.equal(result.totalWeight, 2n * huge + 4n);
  assert.deepEqual(result.pairs.map(({ u, v }) => [u, v]), [[0, 2], [1, 3]]);
  assert.equal(typeof result.totalWeight, 'bigint');
  assert.ok(result.totalWeight > BigInt(Number.MAX_SAFE_INTEGER));
});

test('la cardinalité parfaite reste prioritaire même avec des poids négatifs', () => {
  const edges = [[0, 1, -5n], [2, 3, -7n], [0, 2, -100n]];
  const result = maximumWeightPerfectMatching(4, edges);
  assert.equal(result.totalWeight, -12n);
  assert.deepEqual(result.pairs.map(({ u, v }) => [u, v]), [[0, 1], [2, 3]]);
});

test('les graphes impairs et les graphes pairs infaisables sont signalés sans résultat partiel', () => {
  assert.throws(
    () => maximumWeightPerfectMatching(3, [[0, 1, 1n], [1, 2, 1n]]),
    (error) => error instanceof NoPerfectMatchingError && error.code === 'NO_PERFECT_MATCHING',
  );
  assert.throws(
    () => maximumWeightPerfectMatching(4, [[0, 1, 1n], [1, 2, 2n], [2, 0, 3n]]),
    (error) => error instanceof NoPerfectMatchingError && error.code === 'NO_PERFECT_MATCHING',
  );
  assert.throws(
    () => maximumWeightPerfectMatching(6, [[0, 1, 1n], [2, 3, 1n]]),
    (error) => error instanceof NoPerfectMatchingError && error.code === 'NO_PERFECT_MATCHING',
  );
});

test('le cas vide et les graphes clairsemé ou dense à 64 sommets sont pris en charge', () => {
  assert.deepEqual(maximumWeightPerfectMatching(0, []), { mate: [], pairs: [], totalWeight: 0n });
  const edges = Array.from({ length: 32 }, (_, index) => [
    2 * index,
    2 * index + 1,
    (2n ** 80n) + BigInt(index),
  ]);
  const result = maximumWeightPerfectMatching(64, edges);
  assert.equal(result.pairs.length, 32);
  assert.equal(
    result.totalWeight,
    32n * (2n ** 80n) + Array.from({ length: 32 }, (_, index) => BigInt(index))
      .reduce((sum, value) => sum + value, 0n),
  );
  const denseEdges = [];
  for (let u = 0; u < 64; u += 1) {
    for (let v = u + 1; v < 64; v += 1) {
      denseEdges.push([u, v, (2n ** 90n) + BigInt((u * 67 + v * 31) % 1009)]);
    }
  }
  const denseResult = maximumWeightPerfectMatching(64, denseEdges);
  assert.equal(denseResult.pairs.length, 32);
  assert.equal(new Set(denseResult.pairs.flatMap(({ u, v }) => [u, v])).size, 64);
});

test('l’API refuse toute ambiguïté numérique ou structurelle', () => {
  assert.throws(() => maximumWeightPerfectMatching(3, null), /tableau/);
  assert.throws(() => maximumWeightPerfectMatching(4, [[0, 1, 5]]), /BigInt/);
  assert.throws(() => maximumWeightPerfectMatching(4, [[0, 0, 5n]]), /boucles/);
  assert.throws(
    () => maximumWeightPerfectMatching(4, [[0, 1, 5n], [1, 0, 6n]]),
    /parallèle/,
  );
  assert.throws(() => maximumWeightPerfectMatching(66, []), /entre 0 et 64/);
  assert.throws(() => maximumWeightPerfectMatching(4, [[0, 4, 1n]]), /entre 0 et 3/);
});
