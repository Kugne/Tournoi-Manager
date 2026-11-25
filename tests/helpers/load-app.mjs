import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Objet factice universel : toute propriété, tout appel et toute construction
 * renvoient le même objet. Il suffit à exécuter le code d'amorçage de
 * l'interface sans navigateur, afin d'atteindre les fonctions de calcul.
 */
const createInertStub = () => {
  const target = function inert() {};
  const stub = new Proxy(target, {
    get: (_target, key) => {
      if (key === Symbol.toPrimitive) return () => '';
      if (key === Symbol.iterator) return function* empty() {};
      if (key === 'then') return undefined;
      if (key === 'length') return 0;
      return stub;
    },
    set: () => true,
    apply: () => stub,
    construct: () => stub,
    has: () => true,
  });
  return stub;
};

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
  };
};

/**
 * Charge le script principal de index.html dans un contexte isolé et renvoie
 * ce contexte, dont les fonctions globales (getStandings, etc.) sont appelables.
 */
export const loadApplication = () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  const start = html.lastIndexOf('<script>');
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0) throw new Error('Script principal introuvable dans index.html');
  const source = html.slice(start + '<script>'.length, end);
  const inert = createInertStub();
  const context = {
    console,
    document: inert,
    navigator: inert,
    location: inert,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: () => 0,
    URL,
    Blob: class {},
    Worker: class {},
    atob,
    btoa,
    structuredClone,
    crypto: globalThis.crypto,
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => inert,
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'index.html' });
  return context;
};
