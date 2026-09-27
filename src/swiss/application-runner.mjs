import {
  buildApplicationMatches,
  buildSwissEngineInput,
} from './application-adapter.mjs';

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
};

export const swissInputFingerprint = (input) => JSON.stringify(stableValue({
  participants: input.participants,
  context: input.context,
  byePlayerId: input.byePlayerId,
}));

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
  let outcome;
  if (typeof executor.start === 'function') {
    const task = executor.start(request);
    onStarted?.({ requestId: task.requestId, cancel: task.cancel });
    outcome = await task.promise;
  } else {
    outcome = await executor.run(request);
  }
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
  return {
    ...outcome,
    matches: buildApplicationMatches({
      engineResult: outcome.result,
      standings,
      byePlayerId: input.byePlayerId,
      byeScenario,
      byeFree,
    }),
    fingerprint,
  };
};
