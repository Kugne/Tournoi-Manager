/**
 * Wire protocol shared by the browser Worker and its host.
 *
 * JSON itself cannot represent BigInt (and silently loses non-finite numbers),
 * so values are encoded as a small tagged tree before crossing the boundary.
 * The representation is deliberately structural: user strings and object keys
 * can never be mistaken for a protocol tag.
 */

export const WORKER_PROTOCOL_VERSION = 1;

const TAG = '@tournoi-manager/swiss-wire';

const encode = (value) => {
  if (typeof value === 'bigint') return [TAG, 'bigint', value.toString()];
  if (value === undefined) return [TAG, 'undefined'];
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return [TAG, 'number', Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity'];
  }
  if (Array.isArray(value)) return [TAG, 'array', value.map(encode)];
  if (value !== null && typeof value === 'object') {
    return [TAG, 'object', Object.entries(value).map(([key, entry]) => [key, encode(entry)])];
  }
  return value;
};

const decode = (value) => {
  if (!Array.isArray(value) || value[0] !== TAG) {
    if (Array.isArray(value)) return value.map(decode);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry)]));
    }
    return value;
  }
  switch (value[1]) {
    case 'bigint':
      if (value.length !== 3 || !/^-?(?:0|[1-9]\d*)$/.test(value[2])) {
        throw new TypeError('BigInt sérialisé invalide');
      }
      return BigInt(value[2]);
    case 'undefined':
      if (value.length !== 2) throw new TypeError('Valeur undefined sérialisée invalide');
      return undefined;
    case 'number':
      if (value[2] === 'NaN') return Number.NaN;
      if (value[2] === 'Infinity') return Number.POSITIVE_INFINITY;
      if (value[2] === '-Infinity') return Number.NEGATIVE_INFINITY;
      throw new TypeError('Nombre non fini sérialisé invalide');
    case 'array':
      if (value.length !== 3 || !Array.isArray(value[2])) {
        throw new TypeError('Tableau sérialisé invalide');
      }
      return value[2].map(decode);
    case 'object':
      if (value.length !== 3 || !Array.isArray(value[2])) {
        throw new TypeError('Objet sérialisé invalide');
      }
      return Object.fromEntries(value[2].map((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
          throw new TypeError('Entrée d’objet sérialisé invalide');
        }
        return [entry[0], decode(entry[1])];
      }));
    default:
      throw new TypeError('Tag de protocole inconnu');
  }
};

export const serializeWorkerMessage = (message) => JSON.stringify(encode(message));

export const deserializeWorkerMessage = (serialized) => {
  if (typeof serialized !== 'string') {
    throw new TypeError('Un message Worker doit être une chaîne sérialisée');
  }
  return decode(JSON.parse(serialized));
};

export const createWorkerRequest = ({
  requestId,
  operation = 'initial',
  participants,
  context = {},
  excludedSignatures = [],
}) => ({
  protocolVersion: WORKER_PROTOCOL_VERSION,
  type: 'request',
  requestId: String(requestId),
  operation,
  participants,
  context,
  excludedSignatures,
});

export const createWorkerCancel = (requestId) => ({
  protocolVersion: WORKER_PROTOCOL_VERSION,
  type: 'cancel',
  requestId: String(requestId),
});

export const createWorkerResult = (requestId, result) => ({
  protocolVersion: WORKER_PROTOCOL_VERSION,
  type: 'result',
  requestId: String(requestId),
  result,
});

export const createWorkerError = (requestId, error) => ({
  protocolVersion: WORKER_PROTOCOL_VERSION,
  type: 'error',
  requestId: String(requestId),
  error: {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    ...(error?.code == null ? {} : { code: error.code }),
  },
});

export const assertWorkerEnvelope = (message) => {
  if (!message || message.protocolVersion !== WORKER_PROTOCOL_VERSION
    || typeof message.type !== 'string' || typeof message.requestId !== 'string') {
    throw new TypeError('Enveloppe Worker invalide');
  }
  return message;
};

export { encode as encodeWorkerValue, decode as decodeWorkerValue };
