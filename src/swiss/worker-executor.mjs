import {
  createWorkerCancel,
  createWorkerRequest,
  deserializeWorkerMessage,
  serializeWorkerMessage,
} from './worker-protocol.mjs';
import { pairingSignature } from './pairing-signature.mjs';

const FINAL_STATES = new Set(['success', 'alerted', 'cancelled', 'timeout', 'error']);

let requestSequence = 0;
const defaultRequestId = () => {
  requestSequence += 1;
  const random = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `swiss-${random}-${requestSequence}`;
};

const defaultClock = { now: () => Date.now() };
const defaultTimers = {
  setTimeout: (...args) => globalThis.setTimeout(...args),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

const addMessageListener = (worker, handler) => {
  if (typeof worker.addEventListener === 'function') {
    worker.addEventListener('message', handler);
    return () => worker.removeEventListener?.('message', handler);
  }
  worker.onmessage = handler;
  return () => {
    if (worker.onmessage === handler) worker.onmessage = null;
  };
};

const addErrorListener = (worker, handler) => {
  if (typeof worker.addEventListener === 'function') {
    worker.addEventListener('error', handler);
    return () => worker.removeEventListener?.('error', handler);
  }
  worker.onerror = handler;
  return () => {
    if (worker.onerror === handler) worker.onerror = null;
  };
};

const normalizeError = (error) => ({
  name: error?.name ?? 'Error',
  message: error?.message ?? String(error),
  ...(error?.code == null ? {} : { code: error.code }),
});

const isCompletePairing = (pairs, participantIds) => {
  if (!Array.isArray(pairs) || pairs.length * 2 !== participantIds.length) return false;
  const expected = new Set(participantIds);
  const seen = new Set();
  for (const pair of pairs) {
    if (!pair || pair.a == null || pair.b == null || pair.a === pair.b) return false;
    const a = String(pair.a);
    const b = String(pair.b);
    if (!expected.has(a) || !expected.has(b) || seen.has(a) || seen.has(b)) return false;
    seen.add(a);
    seen.add(b);
  }
  return seen.size === expected.size;
};

const isCompleteResult = (operation, result, participantIds) => {
  if (!result || typeof result !== 'object') return false;
  if (operation === 'initial') {
    return isCompletePairing(result.pairs, participantIds)
      && typeof result.cost === 'bigint'
      && typeof result.totalWeight === 'bigint';
  }
  return Array.isArray(result.variants)
    && result.variants.length <= 1
    && typeof result.optimalCost === 'bigint'
    && result.variants.every((variant) => (
      variant && typeof variant.signature === 'string' && typeof variant.cost === 'bigint'
      && isCompletePairing(variant.pairs, participantIds)
      && variant.signature === pairingSignature(variant.pairs)
      && variant.cost === result.optimalCost
    ))
    && typeof result.exhausted === 'boolean'
    && typeof result.interrupted === 'boolean';
};

/**
 * Runs one pure Swiss calculation outside the UI thread.
 * `workerFactory`, `clock`, `timers` and `requestIdFactory` are injectable so
 * all races and thresholds can be tested without a browser.
 */
export class SwissWorkerExecutor {
  #workerFactory;
  #clock;
  #timers;
  #requestIdFactory;
  #alertMs;
  #timeoutMs;
  #pending = new Map();

  constructor({
    workerFactory,
    clock = defaultClock,
    timers = defaultTimers,
    requestIdFactory = defaultRequestId,
    alertMs = 3000,
    timeoutMs = 15000,
  } = {}) {
    if (typeof workerFactory !== 'function') throw new TypeError('workerFactory est obligatoire');
    if (!clock || typeof clock.now !== 'function') throw new TypeError('clock.now est obligatoire');
    if (!timers || typeof timers.setTimeout !== 'function' || typeof timers.clearTimeout !== 'function') {
      throw new TypeError('timers.setTimeout/clearTimeout sont obligatoires');
    }
    if (!Number.isFinite(alertMs) || alertMs < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= alertMs) {
      throw new RangeError('Les seuils temporels sont invalides');
    }
    this.#workerFactory = workerFactory;
    this.#clock = clock;
    this.#timers = timers;
    this.#requestIdFactory = requestIdFactory;
    this.#alertMs = alertMs;
    this.#timeoutMs = timeoutMs;
  }

  get pendingCount() {
    return this.#pending.size;
  }

  start({
    operation = 'initial',
    participants,
    context = {},
    excludedSignatures = [],
    onAlert,
  }) {
    if (operation !== 'initial' && operation !== 'next-variant' && operation !== 'nextVariant') {
      throw new RangeError(`Opération inconnue : ${operation}`);
    }
    const requestId = String(this.#requestIdFactory());
    if (!requestId || this.#pending.has(requestId)) throw new Error('requestId absent ou déjà utilisé');
    const startedAt = this.#clock.now();
    let resolvePromise;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    const worker = this.#workerFactory();
    const entry = {
      requestId,
      operation,
      worker,
      startedAt,
      participantIds: (participants ?? []).map((participant) => String(participant.id)),
      state: 'running',
      alerted: false,
      resolve: resolvePromise,
      alertTimer: null,
      timeoutTimer: null,
      removeMessage: null,
      removeError: null,
      onAlert: typeof onAlert === 'function' ? onAlert : null,
    };
    this.#pending.set(requestId, entry);

    const finish = (status, details = {}) => {
      if (!this.#pending.has(requestId)) return false;
      this.#pending.delete(requestId);
      entry.state = status;
      this.#timers.clearTimeout(entry.alertTimer);
      this.#timers.clearTimeout(entry.timeoutTimer);
      entry.removeMessage?.();
      entry.removeError?.();
      const result = {
        requestId,
        status,
        operation,
        alerted: entry.alerted,
        durationMs: Math.max(0, this.#clock.now() - startedAt),
        result: details.result ?? null,
        error: details.error ?? null,
      };
      try { worker.terminate?.(); } finally { entry.resolve(result); }
      return true;
    };
    entry.finish = finish;

    const alert = () => {
      if (!this.#pending.has(requestId) || entry.state !== 'running') return;
      entry.alerted = true;
      entry.state = 'alerted';
      entry.onAlert?.({ requestId, operation, elapsedMs: this.#clock.now() - startedAt });
    };
    const timeout = () => finish('timeout');
    entry.alertTimer = this.#timers.setTimeout(alert, this.#alertMs);
    entry.timeoutTimer = this.#timers.setTimeout(timeout, this.#timeoutMs);

    entry.removeMessage = addMessageListener(worker, (event) => {
      if (!this.#pending.has(requestId)) return; // late response after cancel/timeout
      let message;
      try {
        message = deserializeWorkerMessage(event?.data);
      } catch (error) {
        finish('error', { error: normalizeError(error) });
        return;
      }
      if (message?.requestId !== requestId) return;
      if (message.type === 'result') {
        if (!isCompleteResult(operation, message.result, entry.participantIds)) {
          finish('error', { error: { name: 'ProtocolError', message: 'Résultat Worker incomplet' } });
          return;
        }
        finish(entry.alerted ? 'alerted' : 'success', { result: message.result });
      } else if (message.type === 'error') {
        finish('error', { error: normalizeError(message.error) });
      }
    });
    entry.removeError = addErrorListener(worker, (event) => {
      finish('error', { error: normalizeError(event?.error ?? event) });
    });

    try {
      worker.postMessage(serializeWorkerMessage(createWorkerRequest({
        requestId,
        operation,
        participants,
        context,
        excludedSignatures,
      })));
    } catch (error) {
      finish('error', { error: normalizeError(error) });
    }

    return {
      requestId,
      promise,
      get state() { return entry.state; },
      cancel: () => this.cancel(requestId),
    };
  }

  run(options) {
    return this.start(options).promise;
  }

  cancel(requestId) {
    const entry = this.#pending.get(String(requestId));
    if (!entry) return false;
    try {
      entry.worker.postMessage(serializeWorkerMessage(createWorkerCancel(entry.requestId)));
    } catch {
      // Termination below is authoritative even if the transport is gone.
    }
    return entry.finish('cancelled');
  }

  cancelAll() {
    return [...this.#pending.keys()].map((requestId) => this.cancel(requestId));
  }
}

export const createSwissWorkerExecutor = (options) => new SwissWorkerExecutor(options);

export const createBrowserWorkerFactory = ({
  workerModuleUrl,
  WorkerCtor = globalThis.Worker,
} = {}) => {
  if (!workerModuleUrl) throw new TypeError('workerModuleUrl est obligatoire');
  if (typeof WorkerCtor !== 'function') throw new TypeError('Worker est nécessaire');
  const moduleUrl = String(workerModuleUrl);
  return () => new WorkerCtor(moduleUrl, { type: 'module' });
};

export { FINAL_STATES };
