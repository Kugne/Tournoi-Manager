import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [browserPath, targetUrl, mode = 'benchmark'] = process.argv.slice(2);
if (!browserPath || !targetUrl) {
  throw new Error('Usage : node scripts/run-firefox-benchmark.mjs <firefox> <url>');
}

const port = 9800 + (process.pid % 100);
const profile = mkdtempSync(join(tmpdir(), 'tm-firefox-7c-'));
const child = spawn(browserPath, [
  '--headless',
  '--no-remote',
  '--new-instance',
  '--remote-debugging-port', String(port),
  '--profile', profile,
  targetUrl,
], {
  env: { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1', MOZ_HEADLESS: '1' },
  stdio: 'ignore',
  windowsHide: true,
});
const childExited = new Promise((resolve) => {
  if (child.exitCode !== null || child.signalCode !== null) resolve();
  else child.once('exit', resolve);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const waitForChildExit = (milliseconds) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), milliseconds);
  childExited.then(() => {
    clearTimeout(timer);
    resolve(true);
  });
});
const deadline = Date.now() + 60_000;
const openSocket = async () => {
  while (Date.now() < deadline) {
    for (const path of ['/session', '']) {
      try {
        const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
        await new Promise((resolve, reject) => {
          socket.addEventListener('open', resolve, { once: true });
          socket.addEventListener('error', reject, { once: true });
        });
        return socket;
      } catch {
        // Firefox ouvre le port avant que l'endpoint de session soit prêt.
      }
    }
    await delay(100);
  }
  throw new Error('WebDriver BiDi Firefox indisponible');
};

let socket;
try {
  socket = await openSocket();
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.type === 'error') entry.reject(new Error(message.message || message.error));
    else entry.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    sequence += 1;
    pending.set(sequence, { resolve, reject });
    socket.send(JSON.stringify({ id: sequence, method, params }));
  });
  await call('session.new', { capabilities: { alwaysMatch: {} } });
  const tree = await call('browsingContext.getTree');
  const contexts = [];
  const collect = (nodes) => nodes.forEach((node) => {
    contexts.push(node);
    collect(node.children ?? []);
  });
  collect(tree.contexts ?? []);
  let page = contexts.find((context) => context.url === targetUrl) ?? contexts[0];
  if (!page) throw new Error('Aucun contexte Firefox disponible');
  if (page.url !== targetUrl) {
    await call('browsingContext.navigate', { context: page.context, url: targetUrl, wait: 'complete' });
  }
  const evaluate = async (expression) => {
    const result = await call('script.evaluate', {
      expression,
      target: { context: page.context },
      awaitPromise: true,
      resultOwnership: 'none',
    });
    if (result.type === 'exception') throw new Error(result.exceptionDetails?.text || 'Évaluation Firefox impossible');
    return result.result?.value;
  };

  if (mode === 'smoke') {
    const smoke = await evaluate('JSON.stringify({title:document.title,engine:typeof TMSwiss,version:document.querySelector("#info-panel-apropos strong")?.textContent||null})');
    const report = JSON.parse(smoke);
    if (report.engine !== 'object' || !report.title || !report.version) throw new Error('Application autonome non initialisée');
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    let status = '';
    while (Date.now() < deadline) {
      status = await evaluate('document.body.dataset.status || ""');
      if (status === 'done' || status === 'error') break;
      await delay(100);
    }
    if (status !== 'done' && status !== 'error') throw new Error('Délai du benchmark Firefox dépassé');
    const reportText = await evaluate('document.querySelector("#result").textContent');
    if (status === 'error') throw new Error(reportText || 'Benchmark Firefox en échec');
    const report = JSON.parse(reportText);
    if (report.ok !== true) throw new Error('Rapport Firefox incomplet');
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
  await call('session.end');
} finally {
  try { socket?.close(); } catch {}
  if (child.exitCode === null && child.signalCode === null) child.kill();
  const exited = await waitForChildExit(5_000);
  if (!exited) throw new Error('Firefox de test ne s’est pas arrêté ; profil temporaire conservé');
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    process.stderr.write(`Profil Firefox temporaire non supprimé (${error.code ?? 'erreur inconnue'}) : ${profile}\n`);
  }
}
