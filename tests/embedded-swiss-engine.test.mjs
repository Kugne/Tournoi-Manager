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
  assert.match(code, /createHybridSwissSnapshot/);
  assert.match(code, /restoreHybridSwissStandings/);
  assert.match(code, /readMatchOutcome/);
  assert.match(code, /writeMatchOutcome/);
  assert.match(code, /MATCH_OUTCOME_VERSION/);
  assert.match(code, /createPairingDraft/);
  assert.match(code, /previewPairingExchange/);
  assert.match(code, /undoPairingExchange/);
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

test('le conteneur persistant versionne le nouveau modèle sans réécrire les anciens matchs', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /const STATE_SCHEMA_VERSION=TMSwiss\.STATE_SCHEMA_VERSION/);
  assert.match(html, /let S=\{schemaVersion:STATE_SCHEMA_VERSION,/);
  assert.match(html, /if\(S\.schemaVersion===undefined\)S\.schemaVersion=STATE_SCHEMA_VERSION/);
  assert.match(html, /TMSwiss\.inspectPersistedState/);
  assert.match(html, /Version générale de sauvegarde non prise en charge/);
  assert.match(html, /if\(loadCompatibilityError\)\{[^}]+return false;\}/);
  assert.match(html, /function save\(\)\{\s*if\(persistenceBlocked\)return;/);
  assert.match(html, /function snapshotSave\(\)\{if\(persistenceBlocked\)return;/);
  assert.match(html, /S = data; persistenceBlocked=false; save\(\); init\(\)/);
  assert.doesNotMatch(html, /forEach\([^)]*match[^)]*=>[^\n]*outcomeVersion/);
});

test('la saisie et l’effacement d’un résultat conservent un tuple explicite valide', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function setResult(');
  const end = html.indexOf('function printTableSheets', start);
  const functions = html.slice(start, end);
  assert.match(functions, /writeMatchOutcome\(m,\{kind:'played',result:result,started:true\}\)/);
  assert.match(functions, /writeMatchOutcome\(m,\{kind:null,result:null,started:null\}\)/);
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
  assert.equal([...html.matchAll(/idx!==t\.roundsData\.length/g)].length, 3);
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

test('le Top Cut crée puis relit une photographie Suisse avant toute mutation de statut', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const standingsStart = html.indexOf('function getStandings(tournament)');
  const standingsEnd = html.indexOf('function getSortedForPairing', standingsStart);
  const standingsFunction = html.slice(standingsStart, standingsEnd);
  assert.match(standingsFunction, /snapshotActive=hasValidSwissSnapshot/);
  assert.match(standingsFunction, /restoreHybridSwissStandings/);
  assert.match(standingsFunction, /calculateSwissStandings/);
  assert.match(standingsFunction, /rounds:tournament\.roundsData\.slice\(0,swissCutoff\)/);
  assert.match(standingsFunction, /if\(!snapshotActive&&swissCutoff===0\)tournament\.roundsData\.forEach/);
  assert.match(standingsFunction, /includeSecondary=isSwissRound\|\|tournament\.pairFormat==='bracket'/);
  assert.match(standingsFunction, /if\(!snapshotActive&&swissCutoff===0\)\{/);

  const confirmStart = html.indexOf('function confirmTopCut()');
  const confirmEnd = html.indexOf('function renderRounds()', confirmStart);
  const confirmFunction = html.slice(confirmStart, confirmEnd);
  const createIndex = confirmFunction.indexOf('TMSwiss.createHybridSwissSnapshot');
  const statusMutationIndex = confirmFunction.indexOf('t.players.forEach');
  assert.ok(createIndex >= 0 && statusMutationIndex > createIndex);
  assert.match(confirmFunction, /t\.swissSnapshot=snapshot/);
  assert.match(confirmFunction, /t\.cutStartIndex=cutBoundary/);

  const duplicateStart = html.indexOf('function duplicateT(id)');
  const duplicateEnd = html.indexOf('function archiveT', duplicateStart);
  const duplicateFunction = html.slice(duplicateStart, duplicateEnd);
  assert.match(duplicateFunction, /statusAtCut=new Map/);
  assert.match(duplicateFunction, /p\.status==='eliminatedcut'/);
  assert.match(duplicateFunction, /copy\.swissSnapshot=null;copy\.cutSeeds=\[\];copy\.cutStartIndex=null/);
  assert.equal([...html.matchAll(/if\(isHybridCutPhase\(t\)\)/g)].length >= 4, true);
  assert.match(html, /Ronde;Phase;Adversaire/);
  assert.match(html, /Points et départages suisses figés au lancement du Top Cut/);
});

test('les nouvelles rondes figent leur population et finalisent leurs valeurs neutres à la validation', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /newRound\.scoringMeta=TMSwiss\.createRoundScoringMeta/);
  assert.match(html, /TMSwiss\.finalizeRoundNeutralScores\(round,/);
  assert.match(html, /if\(!finalizeNeutralScoresForValidation\(t,idx\)\)return/);
  assert.doesNotMatch(html, /calcAvgScenario/);
  assert.match(html, /adversaire:'Victoire administrative'/);
  assert.match(html, /adversaire:'Défaite administrative'/);
  assert.match(html, /outcome\.kind==='double_forfeit'/);
});

test('le parcours administratif distingue absence, abandon commencé, drop et régénération proposée', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="modal-administrative"/);
  assert.match(html, /Attention : un drop est un abandon définitif/);
  assert.match(html, /La partie avait-elle commencé \?/);
  assert.match(html, /secondaryScoresConfirmed:confirmed/);
  assert.match(html, /TMSwiss\.roundHasEnteredResults\(administrativeFlow\.found\.round\)/);
  assert.match(html, /async function regenerateRoundWithoutAdministrativePlayer/);
  assert.match(html, /TMSwiss\.resolveAdministrativeMatch/);
  assert.match(html, /legacy_forced_win_unknown/);
  assert.match(html, /Effacez d’abord le résultat administratif pour modifier les scores/);
  assert.match(html, /const administrativeLocked=\['administrative_no_show','forfeit_after_start','double_forfeit'\]/);
  assert.match(html, /Effacez le résultat administratif pour modifier cette table/);
  assert.match(html, /const droppedNeedsQualification=p\.status==='dropped'/);
  assert.match(html, /admin-target-status'\)\.disabled=p\.status==='dropped'/);
  assert.match(html, /ancien résultat doit être qualifié avant de modifier ses scores/);
  assert.match(html, /vroundKey==='main'&&vwinners\.length===0/);
  assert.match(html, /\.incident-btn\{align-self:flex-start;width:auto;\}/);
  assert.match(html, /\.match-player\.right \.incident-btn\{align-self:flex-end;\}/);
  assert.match(html, /openAdministrativeFlow\('\$\{m\.p1\}',null,\$\{idx\},\$\{mi\}\)/);
  assert.match(html, /openAdministrativeFlow\('\$\{m\.p2\}',null,\$\{idx\},\$\{mi\}\)/);
});

test('les formats manuels et les exports conservent les règles du lot 5D', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /function ensureRoundScoringMeta\(t,idx\)/);
  assert.match(html, /TMSwiss\.analyzeRoundParticipantIntegrity/);
  assert.match(html, /TMSwiss\.describePlayerOutcome/);
  assert.match(html, /Points sportifs/);
  assert.match(html, /Bonus\/Malus/);
  assert.match(html, /Victoire sur abandon après début/);
  assert.match(html, /Victoire forcée ancienne/);
});
