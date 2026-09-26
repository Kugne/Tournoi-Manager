/*
 * Maximum-weight perfect matching in a general graph, with exact BigInt weights.
 *
 * This is a strict ESM/BigInt port of Matt Krick's MIT-licensed JavaScript port
 * of Joris van Rantwijk's implementation of Edmonds' blossom algorithm. See
 * THIRD_PARTY_BLOSSOM.md next to this file for the exact upstream revision,
 * license notice and the list of adaptations.
 */

const NO_EDGE = -1;

const filledArray = (length, value) => Array.from({ length }, () => value);
const nestedArrays = (length) => Array.from({ length }, () => []);
const cyclicIndex = (array, index) => array[index < 0 ? array.length + index : index];

const minimumBigInt = (array, start, end) => {
  let minimum = null;
  for (let index = start; index <= end; index += 1) {
    const value = array[index];
    if (minimum === null || value < minimum) minimum = value;
  }
  if (minimum === null) throw new Error('Minimum BigInt indéfini');
  return minimum;
};

const edgeKey = (left, right) => left < right ? `${left}:${right}` : `${right}:${left}`;

export class NoPerfectMatchingError extends Error {
  constructor(message = 'Aucun couplage parfait n’existe pour ce graphe') {
    super(message);
    this.name = 'NoPerfectMatchingError';
    this.code = 'NO_PERFECT_MATCHING';
  }
}

const normalizeEdges = (vertexCount, edges) => {
  if (!Array.isArray(edges)) throw new TypeError('Les arêtes doivent être fournies dans un tableau');
  const seen = new Set();
  return edges.map((edge, index) => {
    const arrayForm = Array.isArray(edge);
    const u = arrayForm ? edge[0] : edge?.u;
    const v = arrayForm ? edge[1] : edge?.v;
    const weight = arrayForm ? edge[2] : edge?.weight;
    if (!Number.isInteger(u) || !Number.isInteger(v) || u < 0 || v < 0
      || u >= vertexCount || v >= vertexCount) {
      throw new RangeError(`Arête ${index} : les sommets doivent être des entiers entre 0 et ${vertexCount - 1}`);
    }
    if (u === v) throw new Error(`Arête ${index} : les boucles ne sont pas acceptées`);
    if (typeof weight !== 'bigint') {
      throw new TypeError(`Arête ${index} : le poids doit être un BigInt`);
    }
    const key = edgeKey(u, v);
    if (seen.has(key)) throw new Error(`Arête parallèle interdite entre ${u} et ${v}`);
    seen.add(key);
    return [u, v, weight];
  });
};

class EdmondsBigInt {
  constructor(edges, vertexCount) {
    this.edges = edges;
    this.vertexCount = vertexCount;
    this.edgeCount = edges.length;
    this.initialize();
  }

  maximumCardinalityMaximumWeightMatching() {
    for (let stage = 0; stage < this.vertexCount; stage += 1) {
      this.label = filledArray(2 * this.vertexCount, 0);
      this.bestEdge = filledArray(2 * this.vertexCount, NO_EDGE);
      this.blossomBestEdges = nestedArrays(2 * this.vertexCount);
      this.allowedEdge = filledArray(this.edgeCount, false);
      this.queue = [];

      for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
        if (this.mate[vertex] === NO_EDGE && this.label[this.inBlossom[vertex]] === 0) {
          this.assignLabel(vertex, 1, NO_EDGE);
        }
      }

      let augmented = false;
      while (true) {
        while (this.queue.length > 0 && !augmented) {
          const vertex = this.queue.pop();
          for (const endpointIndex of this.neighborEndpoints[vertex]) {
            const edgeIndex = Math.floor(endpointIndex / 2);
            const neighbor = this.endpoint[endpointIndex];
            if (this.inBlossom[vertex] === this.inBlossom[neighbor]) continue;

            let edgeSlack = null;
            if (!this.allowedEdge[edgeIndex]) {
              edgeSlack = this.slack(edgeIndex);
              if (edgeSlack <= 0n) this.allowedEdge[edgeIndex] = true;
            }

            if (this.allowedEdge[edgeIndex]) {
              if (this.label[this.inBlossom[neighbor]] === 0) {
                this.assignLabel(neighbor, 2, endpointIndex ^ 1);
              } else if (this.label[this.inBlossom[neighbor]] === 1) {
                const base = this.scanBlossom(vertex, neighbor);
                if (base >= 0) {
                  this.addBlossom(base, edgeIndex);
                } else {
                  this.augmentMatching(edgeIndex);
                  augmented = true;
                  break;
                }
              } else if (this.label[neighbor] === 0) {
                this.label[neighbor] = 2;
                this.labelEnd[neighbor] = endpointIndex ^ 1;
              }
            } else if (this.label[this.inBlossom[neighbor]] === 1) {
              const blossom = this.inBlossom[vertex];
              if (this.bestEdge[blossom] === NO_EDGE
                || edgeSlack < this.slack(this.bestEdge[blossom])) {
                this.bestEdge[blossom] = edgeIndex;
              }
            } else if (this.label[neighbor] === 0
              && (this.bestEdge[neighbor] === NO_EDGE
                || edgeSlack < this.slack(this.bestEdge[neighbor]))) {
              this.bestEdge[neighbor] = edgeIndex;
            }
          }
        }

        if (augmented) break;

        let deltaType = -1;
        let delta = null;
        let deltaEdge = NO_EDGE;
        let deltaBlossom = NO_EDGE;

        for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
          if (this.label[this.inBlossom[vertex]] === 0 && this.bestEdge[vertex] !== NO_EDGE) {
            const candidate = this.slack(this.bestEdge[vertex]);
            if (deltaType === -1 || candidate < delta) {
              delta = candidate;
              deltaType = 2;
              deltaEdge = this.bestEdge[vertex];
            }
          }
        }

        for (let blossom = 0; blossom < 2 * this.vertexCount; blossom += 1) {
          if (this.blossomParent[blossom] === NO_EDGE && this.label[blossom] === 1
            && this.bestEdge[blossom] !== NO_EDGE) {
            const candidate = this.slack(this.bestEdge[blossom]) / 2n;
            if (deltaType === -1 || candidate < delta) {
              delta = candidate;
              deltaType = 3;
              deltaEdge = this.bestEdge[blossom];
            }
          }
        }

        for (let blossom = this.vertexCount; blossom < 2 * this.vertexCount; blossom += 1) {
          if (this.blossomBase[blossom] >= 0 && this.blossomParent[blossom] === NO_EDGE
            && this.label[blossom] === 2
            && (deltaType === -1 || this.dualVariable[blossom] < delta)) {
            delta = this.dualVariable[blossom];
            deltaType = 4;
            deltaBlossom = blossom;
          }
        }

        if (deltaType === -1) {
          deltaType = 1;
          const minimum = minimumBigInt(this.dualVariable, 0, this.vertexCount - 1);
          delta = minimum > 0n ? minimum : 0n;
        }

        for (let vertex = 0; vertex < this.vertexCount; vertex += 1) {
          const currentLabel = this.label[this.inBlossom[vertex]];
          if (currentLabel === 1) this.dualVariable[vertex] -= delta;
          else if (currentLabel === 2) this.dualVariable[vertex] += delta;
        }
        for (let blossom = this.vertexCount; blossom < 2 * this.vertexCount; blossom += 1) {
          if (this.blossomBase[blossom] >= 0 && this.blossomParent[blossom] === NO_EDGE) {
            if (this.label[blossom] === 1) this.dualVariable[blossom] += delta;
            else if (this.label[blossom] === 2) this.dualVariable[blossom] -= delta;
          }
        }

        if (deltaType === 1) {
          break;
        }
        if (deltaType === 2 || deltaType === 3) {
          this.allowedEdge[deltaEdge] = true;
          let [left, right] = this.edges[deltaEdge];
          if (deltaType === 2 && this.label[this.inBlossom[left]] === 0) {
            [left, right] = [right, left];
          }
          this.queue.push(left);
        } else {
          this.expandBlossom(deltaBlossom, false);
        }
      }

      if (!augmented) break;
      for (let blossom = this.vertexCount; blossom < 2 * this.vertexCount; blossom += 1) {
        if (this.blossomParent[blossom] === NO_EDGE && this.blossomBase[blossom] >= 0
          && this.label[blossom] === 1 && this.dualVariable[blossom] === 0n) {
          this.expandBlossom(blossom, true);
        }
      }
    }

    return this.mate.map((endpointIndex) => endpointIndex < 0
      ? NO_EDGE
      : this.endpoint[endpointIndex]);
  }

  slack(edgeIndex) {
    const [left, right, weight] = this.edges[edgeIndex];
    return this.dualVariable[left] + this.dualVariable[right] - 2n * weight;
  }

  blossomLeaves(blossom) {
    if (blossom < this.vertexCount) return [blossom];
    const leaves = [];
    for (const child of this.blossomChildren[blossom]) {
      if (child < this.vertexCount) leaves.push(child);
      else leaves.push(...this.blossomLeaves(child));
    }
    return leaves;
  }

  assignLabel(vertex, type, endpointIndex) {
    const blossom = this.inBlossom[vertex];
    this.label[vertex] = type;
    this.label[blossom] = type;
    this.labelEnd[vertex] = endpointIndex;
    this.labelEnd[blossom] = endpointIndex;
    this.bestEdge[vertex] = NO_EDGE;
    this.bestEdge[blossom] = NO_EDGE;
    if (type === 1) {
      this.queue.push(...this.blossomLeaves(blossom));
    } else {
      const base = this.blossomBase[blossom];
      this.assignLabel(this.endpoint[this.mate[base]], 1, this.mate[base] ^ 1);
    }
  }

  scanBlossom(initialLeft, initialRight) {
    let left = initialLeft;
    let right = initialRight;
    const path = [];
    let base = NO_EDGE;
    while (left !== NO_EDGE || right !== NO_EDGE) {
      let blossom = this.inBlossom[left];
      if ((this.label[blossom] & 4) !== 0) {
        base = this.blossomBase[blossom];
        break;
      }
      path.push(blossom);
      this.label[blossom] = 5;
      if (this.labelEnd[blossom] === NO_EDGE) {
        left = NO_EDGE;
      } else {
        left = this.endpoint[this.labelEnd[blossom]];
        blossom = this.inBlossom[left];
        left = this.endpoint[this.labelEnd[blossom]];
      }
      if (right !== NO_EDGE) [left, right] = [right, left];
    }
    for (const blossom of path) this.label[blossom] = 1;
    return base;
  }

  addBlossom(base, edgeIndex) {
    let [left, right] = this.edges[edgeIndex];
    const baseBlossom = this.inBlossom[base];
    let leftBlossom = this.inBlossom[left];
    let rightBlossom = this.inBlossom[right];
    const blossom = this.unusedBlossoms.pop();
    this.blossomBase[blossom] = base;
    this.blossomParent[blossom] = NO_EDGE;
    this.blossomParent[baseBlossom] = blossom;
    const path = [];
    this.blossomChildren[blossom] = path;
    const endpointIndices = [];
    this.blossomEndpoints[blossom] = endpointIndices;

    while (leftBlossom !== baseBlossom) {
      this.blossomParent[leftBlossom] = blossom;
      path.push(leftBlossom);
      endpointIndices.push(this.labelEnd[leftBlossom]);
      left = this.endpoint[this.labelEnd[leftBlossom]];
      leftBlossom = this.inBlossom[left];
    }
    path.push(baseBlossom);
    path.reverse();
    endpointIndices.reverse();
    endpointIndices.push(2 * edgeIndex);
    while (rightBlossom !== baseBlossom) {
      this.blossomParent[rightBlossom] = blossom;
      path.push(rightBlossom);
      endpointIndices.push(this.labelEnd[rightBlossom] ^ 1);
      right = this.endpoint[this.labelEnd[rightBlossom]];
      rightBlossom = this.inBlossom[right];
    }

    this.label[blossom] = 1;
    this.labelEnd[blossom] = this.labelEnd[baseBlossom];
    this.dualVariable[blossom] = 0n;
    for (const vertex of this.blossomLeaves(blossom)) {
      if (this.label[this.inBlossom[vertex]] === 2) this.queue.push(vertex);
      this.inBlossom[vertex] = blossom;
    }

    const bestEdgeTo = filledArray(2 * this.vertexCount, NO_EDGE);
    for (const child of path) {
      let neighborLists;
      if (this.blossomBestEdges[child].length === 0) {
        neighborLists = this.blossomLeaves(child).map((vertex) =>
          this.neighborEndpoints[vertex].map((endpointIndex) => Math.floor(endpointIndex / 2)));
      } else {
        neighborLists = [this.blossomBestEdges[child]];
      }
      for (const neighborList of neighborLists) {
        for (const candidateEdge of neighborList) {
          let [candidateLeft, candidateRight] = this.edges[candidateEdge];
          if (this.inBlossom[candidateRight] === blossom) {
            [candidateLeft, candidateRight] = [candidateRight, candidateLeft];
          }
          const targetBlossom = this.inBlossom[candidateRight];
          if (targetBlossom !== blossom && this.label[targetBlossom] === 1
            && (bestEdgeTo[targetBlossom] === NO_EDGE
              || this.slack(candidateEdge) < this.slack(bestEdgeTo[targetBlossom]))) {
            bestEdgeTo[targetBlossom] = candidateEdge;
          }
        }
      }
      this.blossomBestEdges[child] = [];
      this.bestEdge[child] = NO_EDGE;
    }

    this.blossomBestEdges[blossom] = bestEdgeTo.filter((value) => value !== NO_EDGE);
    this.bestEdge[blossom] = NO_EDGE;
    for (const candidateEdge of this.blossomBestEdges[blossom]) {
      if (this.bestEdge[blossom] === NO_EDGE
        || this.slack(candidateEdge) < this.slack(this.bestEdge[blossom])) {
        this.bestEdge[blossom] = candidateEdge;
      }
    }
  }

  expandBlossom(blossom, endStage) {
    for (const child of this.blossomChildren[blossom]) {
      this.blossomParent[child] = NO_EDGE;
      if (child < this.vertexCount) {
        this.inBlossom[child] = child;
      } else if (endStage && this.dualVariable[child] === 0n) {
        this.expandBlossom(child, endStage);
      } else {
        for (const vertex of this.blossomLeaves(child)) this.inBlossom[vertex] = child;
      }
    }

    if (!endStage && this.label[blossom] === 2) {
      const entryChild = this.inBlossom[this.endpoint[this.labelEnd[blossom] ^ 1]];
      let childIndex = this.blossomChildren[blossom].indexOf(entryChild);
      let step;
      let endpointTrick;
      if ((childIndex & 1) !== 0) {
        childIndex -= this.blossomChildren[blossom].length;
        step = 1;
        endpointTrick = 0;
      } else {
        step = -1;
        endpointTrick = 1;
      }
      let endpointIndex = this.labelEnd[blossom];
      while (childIndex !== 0) {
        this.label[this.endpoint[endpointIndex ^ 1]] = 0;
        const indexedEndpoint = cyclicIndex(
          this.blossomEndpoints[blossom],
          childIndex - endpointTrick,
        ) ^ endpointTrick;
        this.label[this.endpoint[indexedEndpoint ^ 1]] = 0;
        this.assignLabel(this.endpoint[endpointIndex ^ 1], 2, endpointIndex);
        this.allowedEdge[Math.floor(indexedEndpoint / 2)] = true;
        childIndex += step;
        endpointIndex = cyclicIndex(
          this.blossomEndpoints[blossom],
          childIndex - endpointTrick,
        ) ^ endpointTrick;
        this.allowedEdge[Math.floor(endpointIndex / 2)] = true;
        childIndex += step;
      }

      let child = cyclicIndex(this.blossomChildren[blossom], childIndex);
      this.label[this.endpoint[endpointIndex ^ 1]] = 2;
      this.label[child] = 2;
      this.labelEnd[this.endpoint[endpointIndex ^ 1]] = endpointIndex;
      this.labelEnd[child] = endpointIndex;
      this.bestEdge[child] = NO_EDGE;
      childIndex += step;
      while (cyclicIndex(this.blossomChildren[blossom], childIndex) !== entryChild) {
        child = cyclicIndex(this.blossomChildren[blossom], childIndex);
        if (this.label[child] === 1) {
          childIndex += step;
          continue;
        }
        const leaves = this.blossomLeaves(child);
        const labeledVertex = leaves.find((vertex) => this.label[vertex] !== 0);
        if (labeledVertex !== undefined) {
          this.label[labeledVertex] = 0;
          this.label[this.endpoint[this.mate[this.blossomBase[child]]]] = 0;
          this.assignLabel(labeledVertex, 2, this.labelEnd[labeledVertex]);
        }
        childIndex += step;
      }
    }

    this.label[blossom] = NO_EDGE;
    this.labelEnd[blossom] = NO_EDGE;
    this.blossomEndpoints[blossom] = [];
    this.blossomChildren[blossom] = [];
    this.blossomBase[blossom] = NO_EDGE;
    this.blossomBestEdges[blossom] = [];
    this.bestEdge[blossom] = NO_EDGE;
    this.unusedBlossoms.push(blossom);
  }

  augmentBlossom(blossom, vertex) {
    let child = vertex;
    while (this.blossomParent[child] !== blossom) child = this.blossomParent[child];
    if (child >= this.vertexCount) this.augmentBlossom(child, vertex);
    let startIndex = this.blossomChildren[blossom].indexOf(child);
    let childIndex = startIndex;
    let step;
    let endpointTrick;
    if ((startIndex & 1) !== 0) {
      childIndex -= this.blossomChildren[blossom].length;
      step = 1;
      endpointTrick = 0;
    } else {
      step = -1;
      endpointTrick = 1;
    }
    while (childIndex !== 0) {
      childIndex += step;
      child = cyclicIndex(this.blossomChildren[blossom], childIndex);
      const endpointIndex = cyclicIndex(
        this.blossomEndpoints[blossom],
        childIndex - endpointTrick,
      ) ^ endpointTrick;
      if (child >= this.vertexCount) this.augmentBlossom(child, this.endpoint[endpointIndex]);
      childIndex += step;
      child = cyclicIndex(this.blossomChildren[blossom], childIndex);
      if (child >= this.vertexCount) this.augmentBlossom(child, this.endpoint[endpointIndex ^ 1]);
      this.mate[this.endpoint[endpointIndex]] = endpointIndex ^ 1;
      this.mate[this.endpoint[endpointIndex ^ 1]] = endpointIndex;
    }
    this.blossomChildren[blossom] = this.blossomChildren[blossom]
      .slice(startIndex).concat(this.blossomChildren[blossom].slice(0, startIndex));
    this.blossomEndpoints[blossom] = this.blossomEndpoints[blossom]
      .slice(startIndex).concat(this.blossomEndpoints[blossom].slice(0, startIndex));
    this.blossomBase[blossom] = this.blossomBase[this.blossomChildren[blossom][0]];
  }

  augmentMatching(edgeIndex) {
    const [left, right] = this.edges[edgeIndex];
    for (let side = 0; side < 2; side += 1) {
      let vertex = side === 0 ? left : right;
      let endpointIndex = side === 0 ? 2 * edgeIndex + 1 : 2 * edgeIndex;
      while (true) {
        const vertexBlossom = this.inBlossom[vertex];
        if (vertexBlossom >= this.vertexCount) this.augmentBlossom(vertexBlossom, vertex);
        this.mate[vertex] = endpointIndex;
        if (this.labelEnd[vertexBlossom] === NO_EDGE) break;
        const target = this.endpoint[this.labelEnd[vertexBlossom]];
        const targetBlossom = this.inBlossom[target];
        vertex = this.endpoint[this.labelEnd[targetBlossom]];
        const targetMate = this.endpoint[this.labelEnd[targetBlossom] ^ 1];
        if (targetBlossom >= this.vertexCount) this.augmentBlossom(targetBlossom, targetMate);
        this.mate[targetMate] = this.labelEnd[targetBlossom];
        endpointIndex = this.labelEnd[targetBlossom] ^ 1;
      }
    }
  }

  initialize() {
    this.endpoint = [];
    this.neighborEndpoints = nestedArrays(this.vertexCount);
    let maximumWeight = 0n;
    for (let edgeIndex = 0; edgeIndex < this.edgeCount; edgeIndex += 1) {
      const [left, right, weight] = this.edges[edgeIndex];
      this.endpoint.push(left, right);
      this.neighborEndpoints[left].push(2 * edgeIndex + 1);
      this.neighborEndpoints[right].push(2 * edgeIndex);
      if (weight > maximumWeight) maximumWeight = weight;
    }
    this.mate = filledArray(this.vertexCount, NO_EDGE);
    this.label = filledArray(2 * this.vertexCount, 0);
    this.labelEnd = filledArray(2 * this.vertexCount, NO_EDGE);
    this.inBlossom = Array.from({ length: this.vertexCount }, (_, index) => index);
    this.blossomParent = filledArray(2 * this.vertexCount, NO_EDGE);
    this.blossomChildren = nestedArrays(2 * this.vertexCount);
    this.blossomBase = [
      ...Array.from({ length: this.vertexCount }, (_, index) => index),
      ...filledArray(this.vertexCount, NO_EDGE),
    ];
    this.blossomEndpoints = nestedArrays(2 * this.vertexCount);
    this.bestEdge = filledArray(2 * this.vertexCount, NO_EDGE);
    this.blossomBestEdges = nestedArrays(2 * this.vertexCount);
    this.unusedBlossoms = Array.from(
      { length: this.vertexCount },
      (_, index) => this.vertexCount + index,
    );
    this.dualVariable = [
      ...filledArray(this.vertexCount, maximumWeight),
      ...filledArray(this.vertexCount, 0n),
    ];
    this.allowedEdge = filledArray(this.edgeCount, false);
    this.queue = [];
  }
}

/**
 * Return an exact maximum-weight perfect matching.
 *
 * Vertices are the integers 0..vertexCount-1. Edges are either
 * `{ u, v, weight }` records or `[u, v, weight]` tuples, and every weight must
 * already be a BigInt. A graph without a perfect matching throws the typed
 * `NoPerfectMatchingError`; it never returns a partial result.
 */
export const maximumWeightPerfectMatching = (vertexCount, edges) => {
  if (!Number.isInteger(vertexCount) || vertexCount < 0 || vertexCount > 64) {
    throw new RangeError('Le nombre de sommets doit être un entier entre 0 et 64');
  }
  const normalizedEdges = normalizeEdges(vertexCount, edges);
  if ((vertexCount & 1) !== 0) {
    throw new NoPerfectMatchingError('Un graphe avec un nombre impair de sommets n’a pas de couplage parfait');
  }
  if (vertexCount === 0) return { mate: [], pairs: [], totalWeight: 0n };
  if (normalizedEdges.length === 0) throw new NoPerfectMatchingError();

  const mate = new EdmondsBigInt(normalizedEdges, vertexCount)
    .maximumCardinalityMaximumWeightMatching();
  if (mate.some((neighbor) => neighbor === NO_EDGE)) throw new NoPerfectMatchingError();
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (mate[vertex] < 0 || mate[vertex] >= vertexCount || mate[mate[vertex]] !== vertex) {
      throw new Error('Invariant interne violé : couplage asymétrique');
    }
  }

  const edgeByVertices = new Map(normalizedEdges.map((edge, index) => [
    edgeKey(edge[0], edge[1]),
    { edge, index },
  ]));
  const pairs = [];
  let totalWeight = 0n;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const neighbor = mate[vertex];
    if (vertex > neighbor) continue;
    const selected = edgeByVertices.get(edgeKey(vertex, neighbor));
    if (!selected) throw new Error('Invariant interne violé : arête appariée introuvable');
    const [u, v, weight] = selected.edge;
    pairs.push({ u: Math.min(u, v), v: Math.max(u, v), weight, edgeIndex: selected.index });
    totalWeight += weight;
  }
  pairs.sort((left, right) => left.u - right.u || left.v - right.v);
  return { mate, pairs, totalWeight };
};
