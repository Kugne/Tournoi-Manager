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
  assert.match(html, /function save\(\)\{\s*if\(persistenceBlocked\)return false;/);
  assert.match(html, /function snapshotSave\(\)\{if\(persistenceBlocked\)return;/);
  assert.match(html, /if\(!replaceStateAndPersist\(data\)\)/);
  assert.doesNotMatch(html, /forEach\([^)]*match[^)]*=>[^\n]*outcomeVersion/);
});

test('la saisie et l’effacement d’un résultat conservent un tuple explicite valide', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function setResult(');
  const end = html.indexOf('function printTableSheets', start);
  const functions = html.slice(start, end);
  assert.match(functions, /writeMatchOutcome\(m,\{kind:'played',result:result,started:true\}\)/);
  assert.match(functions, /clearMatchRecordedData\(m\)/);
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

test('le lot 6B utilise un échange guidé analysé avant application', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function initializePairingEditorDraft(roundIdx)');
  const end = html.indexOf('// PENALTIES', start);
  const editor = html.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(editor, /TMSwiss\.createPairingDraft\(r\.matches\)/);
  assert.match(editor, /TMSwiss\.previewPairingExchange/);
  assert.match(editor, /getPairingAnalysisForMatches/);
  assert.match(editor, /TMSwiss\.classifyPairingCandidate/);
  assert.match(editor, /affectedMatchIndexes\.map/);
  assert.match(editor, /TMSwiss\.applyPairingExchange/);
  assert.match(editor, /TMSwiss\.sortPairingCandidates/);
  assert.match(editor, /pairing-editor-search/);
  assert.match(editor, /Résultat verrouillé/);
  assert.match(editor, /matchMedia\('\(max-width:768px\)'\)/);
  assert.match(editor, /selectedCard\.insertAdjacentElement\('afterend',mobilePane\)/);
  assert.match(editor, /classification\.status==='warning'/);
  assert.match(editor, /Confirmer la revanche/);
  assert.match(html, /t\.pairFormat==='manual'\?TMSwiss\.analyzeManualRoundBlocks/);
  assert.doesNotMatch(editor, /pair-edit-select|highlightPairingDupes/);
});

test('le lot 6C protège les résultats et sépare la réorganisation physique', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function initializePairingEditorDraft(roundIdx)');
  const end = html.indexOf('// PENALTIES', start);
  const editor = html.slice(start, end);

  assert.match(html, /Échanger des joueurs/);
  assert.match(html, /Réorganiser les tables/);
  assert.match(html, /class="pairing-editor-footer"/);
  assert.match(editor, /function unlockPairingEditorResult/);
  assert.match(editor, /Modification autorisée/);
  assert.match(editor, /ne sera effacé que si cette table est réellement modifiée/);
  assert.match(editor, /TMSwiss\.applyTableNumberExchange/);
  assert.match(editor, /Résultat conservé/);
  assert.match(editor, /Effacer les résultats modifiés \?/);
  assert.match(editor, /summary\.affectedResultMatchIndexes\.forEach/);
  assert.match(editor, /TMSwiss\.clearMatchRecordedData/);
  assert.match(editor, /prospectiveSummary\.affectedResultMatchIndexes\.forEach/);
  assert.match(editor, /getPairingAnalysisForMatches\(t,editPairingRoundIdx,analysisMatches\)/);
  assert.match(editor, /var tablesChanged=summary\.reorderedMatchIndexes\.length>0/);
  assert.match(editor, /isSwissPairingPhase\(t\)&&!r\.validated&&pairingChanged/);
  const saveBlock = editor.slice(editor.indexOf('function savePairingEdits()'), editor.indexOf('function persistPairingEdits'));
  const persistBlock = editor.slice(editor.indexOf('function persistPairingEdits'));
  assert.ok(saveBlock.indexOf('clearMatchRecordedData') < saveBlock.indexOf('getPairingAnalysisForMatches'));
  assert.ok(persistBlock.indexOf('clearMatchRecordedData') < persistBlock.indexOf('getPairingAnalysisForMatches'));
  assert.ok(persistBlock.indexOf('getPairingAnalysisForMatches') < persistBlock.indexOf('r.matches=newMatches'));
});

test('le lot 6D partage le même éditeur avec la préparation manuelle multi-rondes', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const prepStart = html.indexOf('function openManualPrepScreen(tId)');
  const prepEnd = html.indexOf('function duplicateT', prepStart);
  const editorStart = html.indexOf('function initializePairingEditorDraft(roundIdx)');
  const editorEnd = html.indexOf('// PENALTIES', editorStart);
  const prep = html.slice(prepStart, prepEnd);
  const editor = html.slice(editorStart, editorEnd);

  assert.ok(prepStart >= 0 && prepEnd > prepStart);
  assert.match(prep, /pairingEditorManualPrepActive=true/);
  assert.match(prep, /openEditPairings\(0,true\)/);
  assert.match(prep, /saveCurrentManualPrepDraft/);
  assert.match(editor, /pairing-editor-round-nav/);
  assert.match(editor, /manualPrepGoTo/);
  assert.match(editor, /Enregistrer cette ronde/);
  assert.match(html, /Terminer la préparation/);
  assert.doesNotMatch(html, /modal-manual-prep|manual-prep-content|pair-edit-select|highlightManualPrepDupes/);
  assert.match(html, /const manual=t\.pairFormat==='manual'/);
  assert.match(html, /criteria\.mirror===true/);
  assert.match(html, /criteria\.allegiance===true/);
  assert.match(html, /const mirror=\(!manual\|\|criteria\.mirror===true\)&&sameFaction/);
  assert.match(html, /normalize\('NFD'\).*replace\(\/\[\\u0300-\\u036f\]\//s);
  assert.match(html, /code:'compo-gap'/);
  assert.match(html, /code:'free-note'/);
});

test('les alertes manuelles 6D normalisent les notes et respectent les critères actifs', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('function getLegacyPairingAlerts(t,roundIdx)');
  const end = html.indexOf('function getPairingAnalysis(t,roundIdx)', start);
  const source = html.slice(start, end);
  const getLegacyPairingAlerts = Function(
    'getGS',
    'getAllegiance',
    `${source}; return getLegacyPairingAlerts;`,
  )(() => ({}), () => 'Alliance commune');
  const tournament = {
    pairFormat: 'manual',
    gameSystemId: 'test',
    compoPairing: false,
    noteMatchCriteria: 'separate',
    secondaryCriteria: { mirror: false, allegiance: true, compo: false, free: 'separate' },
    players: [
      { id: 'a', name: 'Alpha', faction: 'Faction A', note: 'Équipe  A' },
      { id: 'b', name: 'Bravo', faction: 'Faction A', note: 'Equipe A' },
    ],
    roundsData: [{ matches: [{ table: 1, p1: 'a', p2: 'b', bye: false }] }],
  };

  const alerts = getLegacyPairingAlerts(tournament, 0)[0];
  assert.deepEqual(alerts.map(({ code }) => code), ['allegiance', 'free-note']);
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

test('le lot 7A ouvre la première ronde manuelle préparée et rafraîchit les résumés joueurs', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const helperStart = html.indexOf('function getDefaultRoundDisplayIndex(tournament)');
  const helperEnd = html.indexOf('function renderRounds()', helperStart);
  const helperSource = html.slice(helperStart, helperEnd);
  const getDefaultRoundDisplayIndex = Function(`${helperSource}; return getDefaultRoundDisplayIndex;`)();

  assert.equal(getDefaultRoundDisplayIndex({
    pairFormat: 'manual',
    prepAllRoundsOption: true,
    roundsData: [{ validated: false }, { validated: false }, { validated: false }],
  }), 0);
  assert.equal(getDefaultRoundDisplayIndex({
    pairFormat: 'manual',
    prepAllRoundsOption: true,
    roundsData: [{ validated: true }, { validated: false }, { validated: false }],
  }), 1);
  assert.equal(getDefaultRoundDisplayIndex({
    pairFormat: 'manual',
    prepAllRoundsOption: true,
    roundsData: [{ validated: true }, { validated: true }],
  }), 1);
  assert.equal(getDefaultRoundDisplayIndex({
    pairFormat: 'bracket',
    roundsData: [{ validated: false }, { validated: false }],
  }), 1);
  assert.match(html, /renderRoundContent\(getDefaultRoundDisplayIndex\(t\),content\)/);

  const addPlayer = html.slice(html.indexOf('function addPlayer()'), html.indexOf('function openEditPlayer'));
  const deletePlayer = html.slice(html.indexOf('function deletePlayer('), html.indexOf('function openImportGSCSV'));
  const importCsv = html.slice(html.indexOf('function importCSV()'), html.indexOf('// STANDINGS'));
  const checkin = html.slice(html.indexOf('function checkinAllPlayers()'), html.indexOf('function setPlayerStatus'));
  const administrativeFinish = html.slice(html.indexOf('function finishAdministrativeFlow('), html.indexOf('function applyAdministrativeFlow'));
  assert.match(addPlayer, /renderPlayers\(\);renderSidebar\(\);renderTopbar\(\)/);
  assert.match(deletePlayer, /renderPlayers\(\);renderSidebar\(\);renderTopbar\(\)/);
  assert.match(importCsv, /renderPlayers\(\);renderSidebar\(\);renderTopbar\(\)/);
  assert.match(checkin, /renderPlayers\(\);renderTopbar\(\)/);
  assert.match(administrativeFinish, /renderPlayers\(\);renderTopbar\(\);renderRounds\(\)/);
});

test('le lot 7B remplace les données de façon transactionnelle et conserve les vrais numéros de ronde', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const saveStart = html.indexOf('function save()');
  const saveEnd = html.indexOf('function load()', saveStart);
  const persistence = html.slice(saveStart, saveEnd);
  const restoreStart = html.indexOf('function snapshotRestore(');
  const restoreEnd = html.indexOf('function snapshotExport(', restoreStart);
  const restore = html.slice(restoreStart, restoreEnd);
  const importStart = html.indexOf('function importJSON()');
  const importEnd = html.indexOf('function exportJSON()', importStart);
  const jsonImport = html.slice(importStart, importEnd);
  const detailStart = html.indexOf('function buildPlayerDetailData(');
  const detailEnd = html.indexOf('function exportPlayerCSV(', detailStart);
  const detail = html.slice(detailStart, detailEnd);
  const playerImportStart = html.indexOf('function importCSV()');
  const playerImportEnd = html.indexOf('// STANDINGS', playerImportStart);
  const playerImport = html.slice(playerImportStart, playerImportEnd);
  const snapshotsStart = html.indexOf("const SNAP_KEY='tm4_snapshots'");
  const snapshotsEnd = html.indexOf('function toggleTheme()', snapshotsStart);
  const snapshots = html.slice(snapshotsStart, snapshotsEnd);

  assert.match(persistence, /if\(persistenceBlocked\)return false/);
  assert.match(persistence, /function replaceStateAndPersist\(candidate\)/);
  assert.match(persistence, /previousState=S.*previousUndo=undoStack\.slice\(\)/s);
  assert.match(persistence, /if\(save\(\)\)return true/);
  assert.match(persistence, /S=previousState.*undoStack=previousUndo/s);
  assert.match(restore, /if\(!replaceStateAndPersist\(snap\.data\)\)/);
  assert.match(jsonImport, /if\(!replaceStateAndPersist\(data\)\)/);
  assert.match(detail, /t\.roundsData\.forEach\(\(r,ri\)=>\{\s*if\(!r\.validated\)return;/);
  assert.doesNotMatch(detail, /roundsData\.filter\(r=>r\.validated\)/);
  assert.match(playerImport, /replace\(\/\^\\uFEFF\/,'\'\)/);
  assert.match(playerImport, /Number\.isInteger\(compoValue\)/);
  assert.match(playerImport, /replaceStateAndPersist\(candidate\)/);
  assert.match(snapshots, /function readSnapshots\(notifyError\)/);
  assert.match(snapshots, /if\(!Array\.isArray\(snaps\)\)throw/);
  assert.match(snapshots, /if\(snaps===null\)/);

  const messages=[];
  const readSnapshots = Function('localStorage', 'toast', `${snapshots}; return readSnapshots;`)(
    {getItem:()=>'{cassé'},
    (message)=>messages.push(message),
  );
  assert.equal(readSnapshots(true), null);
  assert.equal(messages.length, 1);

  const invalidEntryMessages=[];
  const readInvalidEntry = Function('localStorage', 'toast', 'escapeHtml', `${snapshots}; return readSnapshots;`)(
    {getItem:()=>'[null]'},
    (message)=>invalidEntryMessages.push(message),
    (value)=>String(value),
  );
  assert.equal(readInvalidEntry(true), null);
  assert.equal(invalidEntryMessages.length, 1);
});

test('le remplacement 7B revient réellement à l’état précédent si localStorage refuse l’écriture', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const source = html.slice(html.indexOf('function save()'), html.indexOf('function load()'));
  const makeHarness = (setItem) => Function('document', 'localStorage', 'toast', `
    let S={value:'avant'},persistenceBlocked=false,lastSnapshot=JSON.stringify(S),undoStack=[],saveFailureActive=false,suppressPositiveSaveToast=false;
    const UNDO_LIMIT=20;
    function updateUndoButton(){}
    ${source}
    return {replaceStateAndPersist,getState:()=>S,getUndo:()=>undoStack.slice(),getLast:()=>lastSnapshot};
  `)({getElementById:()=>null},{setItem},()=>{});

  const failing = makeHarness(() => { throw new Error('quota'); });
  assert.equal(failing.replaceStateAndPersist({value:'après'}), false);
  assert.deepEqual(failing.getState(), {value:'avant'});
  assert.deepEqual(failing.getUndo(), []);
  assert.equal(failing.getLast(), JSON.stringify({value:'avant'}));

  const saved=[];
  const working = makeHarness((key,value) => saved.push([key,value]));
  assert.equal(working.replaceStateAndPersist({value:'après'}), true);
  assert.deepEqual(working.getState(), {value:'après'});
  assert.equal(JSON.parse(saved.at(-1)[1]).value, 'après');
});

test('l’annulation 7B ne dépile rien si sa réécriture locale échoue', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const source = html.slice(html.indexOf('function undoLastAction()'), html.indexOf('setInterval(save', html.indexOf('function undoLastAction()')));
  const makeHarness = (setItem) => Function('document', 'localStorage', 'toast', `
    let S={value:'après'},lastSnapshot=JSON.stringify(S),undoStack=[JSON.stringify({value:'avant'})],saveFailureActive=false;
    function updateUndoButton(){} function renderSidebar(){} function renderTopbar(){} function switchTab(){} function showView(){}
    let activeTab='rounds';
    ${source}
    return {undoLastAction,getState:()=>S,getUndo:()=>undoStack.slice(),getLast:()=>lastSnapshot};
  `)({getElementById:()=>null},{setItem},()=>{});

  const failing=makeHarness(()=>{throw new Error('quota');});
  failing.undoLastAction();
  assert.deepEqual(failing.getState(),{value:'après'});
  assert.equal(failing.getUndo().length,1);
  assert.equal(JSON.parse(failing.getLast()).value,'après');

  const working=makeHarness(()=>{});
  working.undoLastAction();
  assert.deepEqual(working.getState(),{value:'avant'});
  assert.equal(working.getUndo().length,0);
  assert.equal(JSON.parse(working.getLast()).value,'avant');
});

test('les CSV détaillés du lot 7B protègent tous les champs textuels dynamiques', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const playerStart = html.indexOf('function exportPlayerCSV(');
  const playerEnd = html.indexOf('function buildPlayerSectionHTML(', playerStart);
  const playerCsv = html.slice(playerStart, playerEnd);
  const sectionStart = html.indexOf('function buildPlayerSectionCSV(');
  const sectionEnd = html.indexOf('function exportPlayerPDF(', sectionStart);
  const sectionCsv = html.slice(sectionStart, sectionEnd);
  const statsStart = html.indexOf('function exportStatsCSV()');
  const statsEnd = html.indexOf('function exportStatsPDF()', statsStart);
  const statsCsv = html.slice(statsStart, statsEnd);

  assert.match(playerCsv, /csvEscape\(`FICHE JOUEUR/);
  assert.match(playerCsv, /\.map\(csvEscape\)\.join\('; '\)|\.map\(csvEscape\)\.join\(';\'\)/);
  assert.match(sectionCsv, /csvEscape\(awards\.join/);
  assert.match(sectionCsv, /\.map\(csvEscape\)\.join\(';\'\)/);
  assert.match(statsCsv, /\[f\.name,f\.players/);
  assert.match(statsCsv, /\[i\+1,p\.name,p\.faction/);
  assert.equal((statsCsv.match(/\.map\(csvEscape\)\.join\(';\'\)/g)||[]).length >= 2, true);

  const escapeStart = html.indexOf('function csvEscape(');
  const escapeEnd = html.indexOf('function sanitizeFilename(', escapeStart);
  const csvEscape = Function(`${html.slice(escapeStart, escapeEnd)}; return csvEscape;`)();
  assert.equal(csvEscape('Nom;Club'), '"Nom;Club"');
  assert.equal(csvEscape('Nom "A"'), '"Nom ""A"""');
  assert.equal(csvEscape('Deux\nlignes'), '"Deux\nlignes"');
});

test('les impressions PDF du lot 7B échappent les libellés organisateur', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const classement = html.slice(html.indexOf('function exportPDF()'), html.indexOf('function exportStatsCSV()'));
  const playerSection = html.slice(html.indexOf('function buildPlayerSectionHTML('), html.indexOf('function buildPlayerSectionCSV('));
  const playerPdf = html.slice(html.indexOf('function exportPlayerPDF('), html.indexOf('function renderPlayerProgressionChartForPrint('));
  const statsPdf = html.slice(html.indexOf('function exportStatsPDF()'), html.indexOf('function init()'));
  const recapPdf = html.slice(html.indexOf('function printAllRoundsRecap()'), html.indexOf('function resetTournamentToWaiting()'));
  assert.match(classement, /escapeHtml\(p\.name\)/);
  assert.match(classement, /safeName=escapeHtml\(t\.name\)/);
  assert.match(playerSection, /escapeHtml\(r\.adversaire\)/);
  assert.match(playerSection, /escapeHtml\(awards\.join/);
  assert.match(playerPdf, /escapeHtml\(d\.p\.name\)/);
  assert.match(statsPdf, /escapeHtml\(f\.name\)/);
  assert.match(statsPdf, /escapeHtml\(awards\|\|'—'\)/);
  assert.match(recapPdf, /escapeHtml\(p1\?\.name\)/);
  assert.match(recapPdf, /escapeHtml\(p2\?\.faction\)/);
  assert.match(recapPdf, /escapeHtml\(r\.scenarioName\)/);
  assert.match(recapPdf, /escapeHtml\(t\.name\)/);
});
