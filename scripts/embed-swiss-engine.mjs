import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(root, 'index.html');
const START = '/* SWISS_ENGINE_EMBED_START */';
const END = '/* SWISS_ENGINE_EMBED_END */';
const IMPORT_PATTERN = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?\s*/g;

const normalizeId = (value) => value.replaceAll('\\', '/');
const resolveModuleId = (fromId, specifier) => normalizeId(posix.normalize(posix.join(posix.dirname(fromId), specifier)));
const readModule = (id) => readFileSync(resolve(root, id), 'utf8').replaceAll('\r\n', '\n');

const importedModules = (source, moduleId) => [...source.matchAll(IMPORT_PATTERN)]
  .map((match) => resolveModuleId(moduleId, match[2]));

const exportBinding = (entry) => {
  const [local, exported = local] = entry.trim().split(/\s+as\s+/);
  return { local, exported };
};

const importBinding = (entry) => {
  const [imported, local = imported] = entry.trim().split(/\s+as\s+/);
  return imported === local ? imported : `${imported}: ${local}`;
};

const transformModule = (source, moduleId) => {
  const exports = [];
  let transformed = source.replace(IMPORT_PATTERN, (_statement, bindings, specifier) => {
    const dependency = resolveModuleId(moduleId, specifier);
    const names = bindings.split(',').map((entry) => entry.trim()).filter(Boolean).map(importBinding);
    return `const { ${names.join(', ')} } = __require(${JSON.stringify(dependency)});\n`;
  });
  transformed = transformed.replace(/export\s+(const|class|function)\s+([A-Za-z_$][\w$]*)/g,
    (_statement, declaration, name) => {
      exports.push({ local: name, exported: name });
      return `${declaration} ${name}`;
    });
  transformed = transformed.replace(/export\s*\{([^}]+)\};?/g, (_statement, bindings) => {
    exports.push(...bindings.split(',').map((entry) => entry.trim()).filter(Boolean).map(exportBinding));
    return '';
  });
  const unique = [...new Map(exports.map((entry) => [entry.exported, entry])).values()];
  const assignments = unique.map(({ local, exported }) => `${JSON.stringify(exported)}: ${local}`);
  return `${transformed}\nObject.assign(exports, { ${assignments.join(', ')} });`;
};

export const bundleModuleGraph = (entryId, { globalName = null } = {}) => {
  const normalizedEntry = normalizeId(entryId);
  const sources = new Map();
  const visit = (id) => {
    if (sources.has(id)) return;
    const source = readModule(id);
    sources.set(id, source);
    importedModules(source, id).forEach(visit);
  };
  visit(normalizedEntry);
  const factories = [...sources.entries()].map(([id, source]) => (
    `${JSON.stringify(id)}: (exports, __require) => {\n${transformModule(source, id)}\n}`
  ));
  const code = [
    '(function () {',
    `const __modules = {\n${factories.join(',\n')}\n};`,
    'const __cache = new Map();',
    'const __require = (id) => {',
    '  if (__cache.has(id)) return __cache.get(id);',
    '  const factory = __modules[id];',
    "  if (!factory) throw new Error('Module embarqué introuvable : ' + id);",
    '  const exports = {};',
    '  __cache.set(id, exports);',
    '  factory(exports, __require);',
    '  return exports;',
    '};',
    `const __entry = __require(${JSON.stringify(normalizedEntry)});`,
    ...(globalName ? [`globalThis[${JSON.stringify(globalName)}] = Object.freeze(__entry);`] : []),
    '})();',
  ].join('\n');
  return { code, sources };
};

export const buildEmbeddedBlock = () => {
  const host = bundleModuleGraph('src/swiss/application-runtime.mjs', { globalName: 'TMSwiss' });
  const worker = bundleModuleGraph('src/swiss/swiss-worker.mjs');
  const allSources = new Map([...host.sources, ...worker.sources]);
  const hashInput = [...allSources.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([id, source]) => `${id}\0${source}`).join('\0');
  const sourceHash = createHash('sha256').update(hashInput).digest('hex');
  const workerBase64 = Buffer.from(worker.code, 'utf8').toString('base64');
  return [
    START,
    `const SWISS_ENGINE_SOURCE_HASH = ${JSON.stringify(sourceHash)};`,
    `const SWISS_WORKER_BUNDLE_BASE64 = ${JSON.stringify(workerBase64)};`,
    host.code,
    END,
  ].join('\n');
};

export const replaceEmbeddedBlock = (html) => {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start) throw new Error('Marqueurs du moteur Suisse embarqué introuvables');
  return `${html.slice(0, start)}${buildEmbeddedBlock()}${html.slice(end + END.length)}`;
};

const main = () => {
  const current = readFileSync(indexPath, 'utf8');
  const expected = replaceEmbeddedBlock(current);
  if (process.argv.includes('--write')) {
    if (current !== expected) writeFileSync(indexPath, expected, 'utf8');
    return;
  }
  if (current !== expected) {
    console.error('Le moteur Suisse embarqué dans index.html doit être régénéré.');
    process.exitCode = 1;
  }
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
