import assert from 'node:assert/strict';
import test from 'node:test';

import { enumerateOptimalVariants } from '../src/swiss/optimal-variants.mjs';
import { pairingSignature } from '../src/swiss/pairing-signature.mjs';
import { solveSwissPairing } from '../src/swiss/solve-swiss.mjs';
import {
  createWorkerRequest,
  deserializeWorkerMessage,
  serializeWorkerMessage,
} from '../src/swiss/worker-protocol.mjs';
import {
  createBrowserWorkerFactory,
  SwissWorkerExecutor,
} from '../src/swiss/worker-executor.mjs';
import { dispatchSwissWorkerMessage, solveWorkerRequest } from '../src/swiss/swiss-worker.mjs';

const participants = (count = 4) => Array.from({ length: count }, (_, index) => ({
  id: `P${index}`,
  points: 0,
}));

class FakeTimers {
  #next = 1;
  #entries = new Map();

  setTimeout(callback, delay) {
    const id = this.#next;
    this.#next += 1;
    this.#entries.set(id, { callback, delay, active: true });
    return id;
  }

  clearTimeout(id) {
    const entry = this.#entries.get(id);
    if (entry) entry.active = false;
  }

  fire(id) {
    const entry = this.#entries.get(id);
    if (!entry?.active) return;
    entry.active = false;
    entry.callback();
  }

  idsByDelay(delay) {
    return [...this.#entries.entries()]
      .filter(([, entry]) => entry.delay === delay && entry.active)
      .map(([id]) => id);
  }
}

class FakeWorker {
  messages = [];
  posted = [];
  terminated = 0;
  onmessage = null;
  onerror = null;

  postMessage(message) {
    this.posted.push(message);
  }

  respond(message) {
    this.onmessage?.({ data: typeof message === 'string' ? message : serializeWorkerMessage(message) });
  }

  fail(error) {
    this.onerror?.({ error });
  }

  terminate() {
    this.terminated += 1;
  }
}

const setup = () => {
  const worker = new FakeWorker();
  const timers = new FakeTimers();
  const clock = { value: 0, now() { return this.value; } };
  const executor = new SwissWorkerExecutor({
    workerFactory: () => worker,
    timers,
    clock,
    requestIdFactory: (() => {
      let index = 0;
      return () => `test-${++index}`;
    })(),
  });
  return { worker, timers, clock, executor };
};

test('le protocole conserve les BigInt et les valeurs non finies sans JSON naïf', () => {
  const value = {
    cost: 123456789012345678901234567890n,
    values: [undefined, Number.NaN, Number.POSITIVE_INFINITY, '-@tournoi-manager/swiss-wire'],
  };
  const roundTrip = deserializeWorkerMessage(serializeWorkerMessage(value));
  assert.deepEqual(roundTrip, value);
});

test('le Worker exécute le calcul initial et la variante sans muter la ronde', () => {
  const entries = participants();
  const context = { history: [], options: {} };
  const snapshot = structuredClone({ entries, context });
  const initial = solveWorkerRequest(createWorkerRequest({
    requestId: 'initial', participants: entries, context,
  }));
  const variant = solveWorkerRequest(createWorkerRequest({
    requestId: 'variant', operation: 'next-variant', participants: entries, context,
  }));
  assert.equal(typeof initial.cost, 'bigint');
  assert.equal(typeof variant.optimalCost, 'bigint');
  assert.equal(variant.variants.length, 1);
  assert.deepEqual({ entries, context }, snapshot);
});

test('une réponse complète avant trois secondes termine en success', async () => {
  const { worker, executor } = setup();
  const handle = executor.start({ participants: participants() });
  const request = deserializeWorkerMessage(worker.posted[0]);
  const expected = solveSwissPairing(request.participants, request.context);
  worker.respond({ protocolVersion: 1, type: 'result', requestId: request.requestId, result: expected });
  const result = await handle.promise;
  assert.equal(result.status, 'success');
  assert.equal(result.alerted, false);
  assert.deepEqual(result.result.pairs, expected.pairs);
  assert.equal(worker.terminated, 1);
});

test('l’alerte à trois secondes ne stoppe pas le calcul et marque une réussite tardive', async () => {
  const { worker, timers, clock, executor } = setup();
  let alert;
  const handle = executor.start({ participants: participants(), onAlert: (event) => { alert = event; } });
  clock.value = 3000;
  timers.fire(timers.idsByDelay(3000)[0]);
  assert.equal(alert.requestId, handle.requestId);
  assert.equal(worker.terminated, 0);
  assert.equal(worker.posted.length, 1);
  const request = deserializeWorkerMessage(worker.posted[0]);
  worker.respond({
    protocolVersion: 1,
    type: 'result',
    requestId: request.requestId,
    result: solveSwissPairing(request.participants, request.context),
  });
  const result = await handle.promise;
  assert.equal(result.status, 'alerted');
  assert.equal(result.alerted, true);
  assert.equal(worker.terminated, 1);
});

test('le délai forcé à quinze secondes termine et ignore toute réponse tardive', async () => {
  const { worker, timers, clock, executor } = setup();
  const handle = executor.start({ participants: participants() });
  clock.value = 15000;
  timers.fire(timers.idsByDelay(15000)[0]);
  const result = await handle.promise;
  assert.equal(result.status, 'timeout');
  assert.equal(result.result, null);
  assert.equal(worker.terminated, 1);
  worker.respond({ protocolVersion: 1, type: 'result', requestId: handle.requestId, result: {} });
  assert.equal(executor.pendingCount, 0);
});

test('une annulation explicite est distincte du timeout et envoie une interruption', async () => {
  const { worker, executor } = setup();
  const handle = executor.start({ participants: participants() });
  assert.equal(handle.cancel(), true);
  const result = await handle.promise;
  assert.equal(result.status, 'cancelled');
  assert.equal(result.result, null);
  assert.equal(worker.terminated, 1);
  assert.equal(deserializeWorkerMessage(worker.posted[1]).type, 'cancel');
  assert.equal(handle.cancel(), false);
});

test('les identifiants isolent les calculs concurrents et les réponses étrangères', async () => {
  const workers = [];
  const timers = new FakeTimers();
  const clock = { now: () => 0 };
  const executor = new SwissWorkerExecutor({
    workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; },
    timers,
    clock,
    requestIdFactory: (() => { let index = 0; return () => `concurrent-${++index}`; })(),
  });
  const first = executor.start({ participants: participants() });
  const second = executor.start({ participants: participants() });
  workers[0].respond({ protocolVersion: 1, type: 'result', requestId: second.requestId, result: {} });
  assert.equal(executor.pendingCount, 2);
  for (const [index, handle] of [first, second].entries()) {
    const request = deserializeWorkerMessage(workers[index].posted[0]);
    workers[index].respond({
      protocolVersion: 1,
      type: 'result',
      requestId: request.requestId,
      result: solveSwissPairing(request.participants, request.context),
    });
  }
  assert.equal((await first.promise).status, 'success');
  assert.equal((await second.promise).status, 'success');
});

test('un résultat partiel et une erreur Worker ne deviennent jamais un résultat de ronde', async () => {
  const first = setup();
  const incomplete = first.executor.start({ participants: participants() });
  first.worker.respond({ protocolVersion: 1, type: 'result', requestId: incomplete.requestId, result: { pairs: [] } });
  const incompleteResult = await incomplete.promise;
  assert.equal(incompleteResult.status, 'error');
  assert.equal(incompleteResult.result, null);

  const variantSetup = setup();
  const incompleteVariant = variantSetup.executor.start({
    operation: 'next-variant',
    participants: participants(),
  });
  variantSetup.worker.respond({
    protocolVersion: 1,
    type: 'result',
    requestId: incompleteVariant.requestId,
    result: {
      variants: [{ pairs: [], signature: 'incomplète', cost: 0n }],
      optimalCost: 0n,
      exhausted: false,
      interrupted: false,
    },
  });
  assert.equal((await incompleteVariant.promise).status, 'error');

  const validPairs = [{ a: 'P0', b: 'P1' }, { a: 'P2', b: 'P3' }];
  const wrongSignatureSetup = setup();
  const wrongSignature = wrongSignatureSetup.executor.start({
    operation: 'next-variant',
    participants: participants(),
  });
  wrongSignatureSetup.worker.respond({
    protocolVersion: 1,
    type: 'result',
    requestId: wrongSignature.requestId,
    result: {
      variants: [{ pairs: validPairs, signature: 'fausse', cost: 0n }],
      optimalCost: 0n,
      exhausted: false,
      interrupted: false,
    },
  });
  assert.equal((await wrongSignature.promise).status, 'error');

  const wrongCostSetup = setup();
  const wrongCost = wrongCostSetup.executor.start({
    operation: 'next-variant',
    participants: participants(),
  });
  wrongCostSetup.worker.respond({
    protocolVersion: 1,
    type: 'result',
    requestId: wrongCost.requestId,
    result: {
      variants: [{ pairs: validPairs, signature: pairingSignature(validPairs), cost: 1n }],
      optimalCost: 0n,
      exhausted: false,
      interrupted: false,
    },
  });
  assert.equal((await wrongCost.promise).status, 'error');

  const second = setup();
  const failed = second.executor.start({ participants: participants() });
  second.worker.fail(new Error('worker indisponible'));
  const errorResult = await failed.promise;
  assert.equal(errorResult.status, 'error');
  assert.match(errorResult.error.message, /indisponible/);
});

test('le Worker module direct et le dispatch de protocole sont prêts pour le navigateur', async () => {
  class WorkerStub { constructor(url, options) { this.url = url; this.options = options; } }
  const factory = createBrowserWorkerFactory({
    workerModuleUrl: './swiss-worker.mjs',
    WorkerCtor: WorkerStub,
  });
  const worker = factory();
  assert.equal(worker.url, './swiss-worker.mjs');
  assert.equal(worker.options.type, 'module');
  const responses = [];
  await dispatchSwissWorkerMessage(
    serializeWorkerMessage(createWorkerRequest({ requestId: 'dispatch', participants: participants() })),
    (message) => responses.push(deserializeWorkerMessage(message)),
  );
  assert.equal(responses[0].type, 'result');
  assert.equal(typeof responses[0].result.cost, 'bigint');
});

test('une interruption de variante reste distincte de exhausted', () => {
  let checks = 0;
  const result = enumerateOptimalVariants(participants(8), {}, {
    shouldInterrupt: () => ++checks >= 2,
  });
  assert.equal(result.interrupted, true);
  assert.equal(result.exhausted, false);
  assert.notEqual(result.status, 'exhausted');
});
