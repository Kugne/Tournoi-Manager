import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import {
  buildEmbeddedBlock,
  bundleModuleGraph,
  replaceEmbeddedBlock,
} from '../scripts/embed-swiss-engine.mjs';

test('le bundle hôte expose l’adaptateur et l’exécuteur sans import résiduel', () => {
  const { code } = bundleModuleGraph('src/swiss/application-runtime.mjs', { globalName: 'TMSwiss' });
  assert.doesNotMatch(code, /\bimport\s*\{/);
  assert.match(code, /buildSwissEngineInput/);
  assert.match(code, /SwissWorkerExecutor/);
  assert.match(code, /globalThis\["TMSwiss"\]/);
  assert.doesNotThrow(() => new vm.Script(code));
});

test('le bundle Worker contient le solveur complet sans import résiduel', () => {
  const { code } = bundleModuleGraph('src/swiss/swiss-worker.mjs');
  assert.doesNotMatch(code, /\bimport\s*\{/);
  assert.doesNotMatch(code, /import\s*\(/);
  assert.match(code, /maximumWeightPerfectMatching/);
  assert.match(code, /installSwissWorker/);
  assert.doesNotThrow(() => new vm.Script(code));
});

test('le moteur embarqué est une génération déterministe exacte des sources', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(replaceEmbeddedBlock(html), html);
  assert.match(buildEmbeddedBlock(), /SWISS_ENGINE_SOURCE_HASH/);
});

test('le script complet du HTML monofichier reste syntaxiquement valide', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0][1], { filename: 'index.html' }));
});

test('le Suisse classique appelle exclusivement le moteur exact dans le parcours initial', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const exactStart = html.indexOf('async function generateExactSwissPairings');
  const exactEnd = html.indexOf('let undoStack', exactStart);
  assert.ok(exactStart >= 0 && exactEnd > exactStart);
  const exactFunction = html.slice(exactStart, exactEnd);
  assert.doesNotMatch(exactFunction, /generateLegacyPairings/);
  assert.match(exactFunction, /current\.roundsData\.length!==roundIndex/);
  assert.match(exactFunction, /onStarted:function\(task\)/);
  assert.match(exactFunction, /toastAction\([^;]+Annuler/);
  assert.match(html, /else if\(t\.pairFormat==='swiss'\)matches=await generateExactSwissPairings\(t,idx\)/);
  assert.match(html, /t\.pairFormat==='swiss'\?'<button[^']+disabled[^']+Relancer/);
  assert.equal([...html.matchAll(/idx!==t\.roundsData\.length/g)].length, 2);
  assert.match(html, /disabled>⏳ Calcul de la ronde/);
});
