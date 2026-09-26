import { maximumWeightPerfectMatching } from './blossom-bigint.mjs';
import { buildLexicographicCostModel } from './lexicographic-cost.mjs';

/**
 * Résout exactement un contexte Suisse dont le bye a déjà été retiré.
 *
 * Cette fonction reste pure et indépendante de l'application. Elle assemble
 * l'encodage métier BigInt et le solveur Blossom sans modifier les participants
 * ni le contexte reçus.
 */
export const solveSwissPairing = (participants, context = {}) => {
  const model = buildLexicographicCostModel(participants, context);
  const indexById = new Map(model.participants.map((participant, index) => [participant.id, index]));
  const solverEdges = model.edges.map((edge) => [
    indexById.get(edge.a),
    indexById.get(edge.b),
    edge.weight,
  ]);
  const matching = maximumWeightPerfectMatching(model.participants.length, solverEdges);
  const pairs = matching.pairs.map(({ u, v }) => ({
    a: model.participants[u].id,
    b: model.participants[v].id,
  }));
  const cost = model.costOfPairing(pairs);
  const expectedCost = BigInt(model.matchCount) * (model.maximumEdgeCost + 1n)
    - matching.totalWeight;
  if (cost !== expectedCost) {
    throw new Error('Invariant interne violé : le coût Suisse et le poids Blossom divergent');
  }
  return {
    pairs,
    cost,
    totalWeight: matching.totalWeight,
    diagnostics: {
      edgeCount: model.edges.length,
      matchCount: model.matchCount,
      dimensions: model.dimensions,
    },
  };
};
