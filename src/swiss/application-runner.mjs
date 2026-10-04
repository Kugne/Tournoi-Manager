import {
  buildApplicationMatches,
  buildSwissEngineInput,
} from './application-adapter.mjs';
import { pairingSignature } from './pairing-signature.mjs';

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
};

export const swissInputFingerprint = (input, currentRoundMatches = null) => JSON.stringify(stableValue({
  participants: input.participants,
  context: input.context,
  byePlayerId: input.byePlayerId,
  excludedSignatures: input.excludedSignatures ?? [],
  currentRoundMatches,
}));

export const engineSignatureFromMatches = (matches) => {
  if (!Array.isArray(matches)) throw new TypeError('Matchs de ronde requis');
  const pairs = matches
    .filter((match) => !match.bye)
    .map((match) => {
      if (match?.p1 == null || match?.p2 == null) throw new TypeError('Appariement de ronde incomplet');
      return { a: String(match.p1), b: String(match.p2) };
    });
  return pairingSignature(pairs);
};

export const applicationPairingSignature = (engineSignature, byePlayerId = null) => JSON.stringify({
  pairs: JSON.parse(engineSignature),
  byePlayerId: byePlayerId == null ? null : String(byePlayerId),
});

const startWorkerRequest = async (executor, request, onStarted) => {
  if (typeof executor.start === 'function') {
    const task = executor.start(request);
    onStarted?.({ requestId: task.requestId, cancel: task.cancel });
    return task.promise;
  }
  return executor.run(request);
};

/**
 * Orchestrates one initial application calculation without mutating the
 * tournament. A result is converted only after the Worker returned a complete
 * success and the caller confirmed that the source state is still current.
 */
export const runInitialSwissPairing = async ({
  tournament,
  roundIndex,
  standings,
  allegianceForFaction,
  executor,
  onAlert,
  onStarted,
  isCurrent = () => true,
  byeScenario = 0,
  byeFree = 0,
}) => {
  if (!executor || (typeof executor.run !== 'function' && typeof executor.start !== 'function')) {
    throw new TypeError('Exécuteur Worker requis');
  }
  const input = buildSwissEngineInput({ tournament, roundIndex, standings, allegianceForFaction });
  const fingerprint = swissInputFingerprint(input);
  const request = {
    operation: 'initial',
    participants: input.participants,
    context: input.context,
    onAlert,
  };
  const outcome = await startWorkerRequest(executor, request, onStarted);
  if (outcome.status !== 'success' && outcome.status !== 'alerted') {
    return { ...outcome, matches: null, fingerprint };
  }
  if (!isCurrent(fingerprint)) {
    return {
      ...outcome,
      status: 'stale',
      result: null,
      matches: null,
      error: { name: 'StalePairingInput', message: 'Le tournoi a changé pendant le calcul' },
      fingerprint,
    };
  }
  const engineSignature = pairingSignature(outcome.result.pairs);
  return {
    ...outcome,
    matches: buildApplicationMatches({
      engineResult: outcome.result,
      standings,
      byePlayerId: input.byePlayerId,
      byeScenario,
      byeFree,
    }),
    engineSignature,
    signature: applicationPairingSignature(engineSignature, input.byePlayerId),
    byePlayerId: input.byePlayerId,
    criteria: { ...input.context.options },
    fingerprint,
  };
};

/** Finds one unseen pairing tied with the exact optimum and never mutates the round. */
export const runNextSwissPairingVariant = async ({
  tournament,
  roundIndex,
  standings,
  allegianceForFaction,
  executor,
  onAlert,
  onStarted,
  isCurrent = () => true,
  byeScenario = 0,
  byeFree = 0,
}) => {
  if (!executor || (typeof executor.run !== 'function' && typeof executor.start !== 'function')) {
    throw new TypeError('Exécuteur Worker requis');
  }
  const round = tournament?.roundsData?.[roundIndex];
  if (!round || round.validated === true) throw new Error('Ronde Suisse ouverte requise');
  const input = buildSwissEngineInput({ tournament, roundIndex, standings, allegianceForFaction });
  const currentEngineSignature = engineSignatureFromMatches(round.matches);
  const excludedSignatures = [...new Set([
    ...(input.excludedSignatures ?? []),
    currentEngineSignature,
  ])];
  const fingerprint = swissInputFingerprint(
    { ...input, excludedSignatures },
    round.matches,
  );
  const outcome = await startWorkerRequest(executor, {
    operation: 'next-variant',
    participants: input.participants,
    context: input.context,
    excludedSignatures,
    onAlert,
  }, onStarted);
  if (outcome.status !== 'success' && outcome.status !== 'alerted') {
    return { ...outcome, matches: null, fingerprint, excludedSignatures };
  }
  if (!isCurrent(fingerprint)) {
    return {
      ...outcome,
      status: 'stale',
      result: null,
      matches: null,
      error: { name: 'StalePairingInput', message: 'La ronde a changé pendant le calcul' },
      fingerprint,
      excludedSignatures,
    };
  }
  if (outcome.result.interrupted) {
    return { ...outcome, status: 'interrupted', matches: null, fingerprint, excludedSignatures };
  }
  const variant = outcome.result.variants[0];
  if (!variant) {
    return {
      ...outcome,
      status: outcome.result.exhausted ? 'exhausted' : 'unavailable',
      matches: null,
      fingerprint,
      excludedSignatures,
    };
  }
  const engineSignature = pairingSignature(variant.pairs);
  return {
    ...outcome,
    matches: buildApplicationMatches({
      engineResult: variant,
      standings,
      byePlayerId: input.byePlayerId,
      byeScenario,
      byeFree,
    }),
    engineSignature,
    signature: applicationPairingSignature(engineSignature, input.byePlayerId),
    byePlayerId: input.byePlayerId,
    criteria: { ...input.context.options },
    seenSignatures: [...excludedSignatures, engineSignature],
    fingerprint,
  };
};
