import { writeFileSync } from 'node:fs';
import { loadApplication } from '../tests/helpers/load-app.mjs';
import { standingsScenarios } from '../tests/standings-scenarios.mjs';

const app = loadApplication();
const out = {};
for (const [name, t] of Object.entries(standingsScenarios(app.TMSwiss))) {
  out[name] = JSON.parse(JSON.stringify(app.getStandings(structuredClone(t))));
}
writeFileSync(new URL('../tests/fixtures/standings-golden.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(Object.keys(out).map((k) => `${k}: ${out[k].map((p) => p.id).join(' ')}`).join('\n'));
