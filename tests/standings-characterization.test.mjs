import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { loadApplication } from './helpers/load-app.mjs';
import { standingsScenarios } from './standings-scenarios.mjs';

/*
 * Caractérisation du classement de l'application (getStandings de index.html).
 * Les valeurs de référence ont été capturées sur la V2 publiée (commit 88f06da)
 * avant tout refactoring : elles figent le comportement individuel actuel.
 * Ne les régénérer (scripts/capture-standings-golden.mjs) que pour un
 * changement de règle volontaire et validé.
 */
const golden = JSON.parse(readFileSync(new URL('./fixtures/standings-golden.json', import.meta.url), 'utf8'));
const app = loadApplication();
const scenarios = standingsScenarios(app.TMSwiss);

test('les scénarios de caractérisation couvrent toutes les références', () => {
  assert.deepEqual(Object.keys(scenarios).sort(), Object.keys(golden).sort());
});

for (const [name, tournament] of Object.entries(scenarios)) {
  test(`classement inchangé : ${name}`, () => {
    const actual = JSON.parse(JSON.stringify(app.getStandings(structuredClone(tournament))));
    assert.deepEqual(actual, golden[name]);
  });
}

test('getStandings ne modifie pas le tournoi reçu', () => {
  for (const tournament of Object.values(scenarios)) {
    const before = JSON.stringify(tournament);
    app.getStandings(tournament);
    assert.equal(JSON.stringify(tournament), before);
  }
});

test('ordre Suisse lisible : points, scénario, score libre puis SOS', () => {
  const ids = Array.from(app.getStandings(structuredClone(scenarios['suisse-egalites'])), (p) => p.id);
  // x et z : même points et scénario, z a plus de score libre ; y et w idem, à égalité stricte.
  assert.deepEqual(ids, ['z', 'x', 'y', 'w']);
});
