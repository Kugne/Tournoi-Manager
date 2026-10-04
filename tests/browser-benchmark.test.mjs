import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('./browser-benchmark.html', import.meta.url), 'utf8');
const cdpRunner = readFileSync(new URL('../scripts/run-cdp-benchmark.mjs', import.meta.url), 'utf8');
const firefoxRunner = readFileSync(new URL('../scripts/run-firefox-benchmark.mjs', import.meta.url), 'utf8');

test('le banc 7C utilise le Worker réellement embarqué et impose les seuils', () => {
  assert.match(html, /fetch\('\.\.\/index\.html'/);
  assert.match(html, /SWISS_WORKER_BUNDLE_BASE64/);
  assert.match(html, /new Blob\(\[embedded\.bytes\]/);
  assert.match(html, /initialMs\.p95 < 1000/);
  assert.match(html, /variantMs\.p95 < 1000/);
  assert.match(html, /Math\.ceil\(sorted\.length \* 0\.95\) - 1/);
  assert.match(html, /outcome\.status === 'success'/);
});

test('le banc 7C couvre effectif impair, réactivité, annulation et timeout', () => {
  assert.match(html, /makeParticipants\(63\)/);
  assert.match(html, /match\.bye\)\.length === 1/);
  assert.match(html, /heartbeatDuringCalculations > 0/);
  assert.match(html, /heartbeatDuringPendingWorker > 0/);
  assert.match(html, /cancelled\.status === 'cancelled'/);
  assert.match(html, /timedOut\.status === 'timeout'/);
  assert.match(html, /pendingCount === 0/g);
});

test('les lanceurs 7C isolent les profils et relisent le résultat dans Edge et Firefox', () => {
  assert.match(cdpRunner, /mkdtempSync/);
  assert.match(cdpRunner, /childExited/);
  assert.match(cdpRunner, /Runtime\.evaluate/);
  assert.match(cdpRunner, /mode === 'smoke'/);
  assert.match(firefoxRunner, /MOZ_DISABLE_CONTENT_SANDBOX/);
  assert.match(firefoxRunner, /childExited/);
  assert.match(firefoxRunner, /\/session/);
  assert.match(firefoxRunner, /session\.new/);
  assert.match(firefoxRunner, /mode === 'smoke'/);
});
