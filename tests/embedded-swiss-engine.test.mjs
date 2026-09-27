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
  assert.match(code, /analyzeApplicationSwissRound/);
  assert.match(code, /swissOperationFeedback/);
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

test('les notifications affichent les messages comme du texte non interprété', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const toastStart = html.indexOf('function toast(msg');
  const toastEnd = html.indexOf('function toastAction', toastStart);
  const toastFunction = html.slice(toastStart, toastEnd);
  assert.ok(toastStart >= 0 && toastEnd > toastStart);
  assert.match(toastFunction, /text\.textContent=msg/);
  assert.doesNotMatch(toastFunction, /innerHTML/);
});

test('les phases Suisses classique et hybride appellent exclusivement le moteur exact', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const exactStart = html.indexOf('async function generateExactSwissPairings');
  const exactEnd = html.indexOf('let undoStack', exactStart);
  assert.ok(exactStart >= 0 && exactEnd > exactStart);
  const exactFunction = html.slice(exactStart, exactEnd);
  assert.doesNotMatch(exactFunction, /generateLegacyPairings/);
  assert.equal([...exactFunction.matchAll(/if\(!isSwissPairingPhase\(tournament\)\)/g)].length, 2);
  assert.match(exactFunction, /current\.roundsData\.length!==roundIndex/);
  assert.match(exactFunction, /onStarted:function\(task\)/);
  assert.match(exactFunction, /toastAction\([^;]+Annuler/);
  assert.match(html, /function isSwissPairingPhase\(t\)\{ return t\?\.pairFormat==='swiss' \|\| \(t\?\.pairFormat==='hybrid' && t\?\.hybridPhase==='swiss'\); \}/);
  assert.match(html, /else if\(isSwissPairingPhase\(t\)\)\{\s*pairingOutcome=await generateExactSwissPairings\(t,idx\)/);
  assert.match(html, /isSwissPairingPhase\(t\)\?\(rerollRunning\?/);
  assert.match(html, /onclick="rerollSwissPairings\('\+idx\+'\)"/);
  assert.match(html, /runNextSwissPairingVariant/);
  assert.match(html, /Toutes les variantes optimales disponibles ont déjà été proposées/);
  assert.match(html, /swissPairingSignatures=outcome\.seenSignatures/);
  assert.match(html, /delete t\.roundsData\[idx\]\.swissPairingSignatures/);
  assert.equal([...html.matchAll(/idx!==t\.roundsData\.length/g)].length, 2);
  assert.match(html, /disabled>⏳ Calcul de la ronde/);
  assert.match(html, /Pourquoi ce match \?/);
  assert.match(html, /TMSwiss\.analyzeApplicationSwissRound/);
  assert.match(html, /Validation refusée : un appariement interdit doit être corrigé/);
  assert.match(html, /showSwissFeedback\('initial',outcome,tournament\)/);
  assert.match(html, /function getPairingAnalysis\(t,roundIdx\)\{\s*if\(isSwissPairingPhase\(t\)\)/);
  assert.doesNotMatch(html, /function getRoundAlerts\(/);
  const editStart = html.indexOf('function savePairingEdits()');
  const editEnd = html.indexOf('// PENALTIES', editStart);
  const editFunction = html.slice(editStart, editEnd);
  assert.ok(editStart >= 0 && editEnd > editStart);
  assert.match(editFunction, /var pairingChanged=newMatches\.some/);
  assert.match(editFunction, /isSwissPairingPhase\(t\)&&!r\.validated&&pairingChanged/);
  assert.doesNotMatch(html, /else if\(t\.pairFormat==='swiss'\)\{\s*pairingOutcome=/);
});

test('le routage exact exclut toujours le Top Cut et les formats non Suisses', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function isSwissPairingPhase');
  const end = html.indexOf('\n', start);
  assert.ok(start >= 0 && end > start);
  const sandbox = {};
  vm.runInNewContext(`${html.slice(start, end)}; result = [
    isSwissPairingPhase({ pairFormat: 'swiss' }),
    isSwissPairingPhase({ pairFormat: 'hybrid', hybridPhase: 'swiss' }),
    isSwissPairingPhase({ pairFormat: 'hybrid', hybridPhase: 'cut' }),
    isSwissPairingPhase({ pairFormat: 'bracket' }),
    isSwissPairingPhase({ pairFormat: 'manual' }),
    isSwissPairingPhase(null),
  ];`, sandbox);
  assert.deepEqual(Array.from(sandbox.result), [true, true, false, false, false, false]);
});
