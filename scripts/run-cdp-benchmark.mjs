import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [browserPath, targetUrl, mode = 'benchmark'] = process.argv.slice(2);
if (!browserPath || !targetUrl) {
  throw new Error('Usage : node scripts/run-cdp-benchmark.mjs <navigateur> <url>');
}

const port = 9300 + (process.pid % 500);
const profile = mkdtempSync(join(tmpdir(), 'tm-browser-7c-'));
const browserArguments = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--disable-extensions',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  targetUrl,
];
const child = spawn(browserPath, browserArguments, { stdio: 'ignore', windowsHide: true });
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

const findPage = async () => {
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === 'page' && target.url === targetUrl);
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Le navigateur peut ne pas encore avoir ouvert son port de débogage.
    }
    await delay(100);
  }
  throw new Error('Page de benchmark introuvable dans le navigateur');
};

let socket;
try {
  const page = await findPage();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    sequence += 1;
    pending.set(sequence, { resolve, reject });
    socket.send(JSON.stringify({ id: sequence, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Évaluation navigateur impossible');
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
    if (status !== 'done' && status !== 'error') throw new Error('Délai du benchmark navigateur dépassé');
    const reportText = await evaluate('document.querySelector("#result").textContent');
    if (status === 'error') throw new Error(reportText || 'Benchmark navigateur en échec');
    const report = JSON.parse(reportText);
    if (report.ok !== true) throw new Error('Rapport navigateur incomplet');
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
} finally {
  try { socket?.close(); } catch {}
  if (child.exitCode === null && child.signalCode === null) child.kill();
  const exited = await waitForChildExit(5_000);
  if (!exited) throw new Error('Le navigateur de test ne s’est pas arrêté ; profil temporaire conservé');
  rmSync(profile, { recursive: true, force: true });
}
