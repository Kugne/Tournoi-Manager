import { enumerateOptimalVariants } from './optimal-variants.mjs';
import { solveSwissPairing } from './solve-swiss.mjs';
import {
  assertWorkerEnvelope,
  createWorkerError,
  createWorkerResult,
  deserializeWorkerMessage,
  serializeWorkerMessage,
} from './worker-protocol.mjs';

const cancelledRequests = new Set();

export const solveWorkerRequest = (request) => {
  if (request.operation === 'initial') {
    return solveSwissPairing(request.participants, request.context);
  }
  if (request.operation === 'next-variant' || request.operation === 'nextVariant') {
    return enumerateOptimalVariants(
      request.participants,
      request.context,
      { excludedSignatures: request.excludedSignatures, maxVariants: 1 },
    );
  }
  throw new RangeError(`Opération Worker inconnue : ${request.operation}`);
};

const dispatch = (serialized, postMessage) => {
  let message;
  try {
    message = assertWorkerEnvelope(deserializeWorkerMessage(serialized));
  } catch (error) {
    postMessage(serializeWorkerMessage(createWorkerError('', error)));
    return;
  }

  if (message.type === 'cancel') {
    cancelledRequests.add(message.requestId);
    return;
  }
  if (message.type !== 'request') {
    postMessage(serializeWorkerMessage(createWorkerError(message.requestId, new TypeError(
      `Type de message Worker inconnu : ${message.type}`,
    ))));
    return;
  }
  if (cancelledRequests.has(message.requestId)) return;

  try {
    const result = solveWorkerRequest(message);
    if (cancelledRequests.has(message.requestId)) return;
    postMessage(serializeWorkerMessage(createWorkerResult(message.requestId, result)));
  } catch (error) {
    if (cancelledRequests.has(message.requestId)) return;
    postMessage(serializeWorkerMessage(createWorkerError(message.requestId, error)));
  }
};

export const installSwissWorker = (scope = globalThis) => {
  scope.onmessage = (event) => dispatch(event.data, (message) => scope.postMessage(message));
  return scope;
};

// Importing this module in Node is safe; only an actual Worker global installs
// the listener. The host can therefore test solveWorkerRequest directly.
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  installSwissWorker(self);
}

export { dispatch as dispatchSwissWorkerMessage };
