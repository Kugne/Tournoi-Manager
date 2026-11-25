/**
 * Scénarios de classement partagés par les tests de caractérisation.
 * Chaque fabrique reçoit le moteur embarqué (TMSwiss) pour écrire des
 * résultats au format persisté réel de l'application.
 */

const player = (id, extra = {}) => ({ id, name: `Joueur ${id}`, faction: `F${id}`, status: 'active', ...extra });

const played = (engine, p1, p2, result, scores = {}) => engine.writeMatchOutcome({
  p1, p2, s1: scores.s1 ?? 0, s2: scores.s2 ?? 0, f1: scores.f1 ?? 0, f2: scores.f2 ?? 0, table: scores.table ?? 1,
}, { kind: 'played', result, started: true });

const bye = (engine, p1, scenario = 0, free = 0) => engine.writeMatchOutcome({
  p1, p2: null, byeScenario: scenario, byeFree: free, neutralScenario: scenario, neutralFree: free, table: 99,
}, { kind: 'bye', result: null, started: false });

const noShow = (engine, p1, p2, result, neutral = 0) => engine.writeMatchOutcome({
  p1, p2, s1: 0, s2: 0, f1: 0, f2: 0, neutralScenario: neutral, neutralFree: 0, table: 50,
}, { kind: 'administrative_no_show', result, started: false, administrativeReason: 'absence' });

const doubleForfeit = (engine, p1, p2) => engine.writeMatchOutcome({
  p1, p2, s1: 0, s2: 0, f1: 0, f2: 0, table: 60,
}, { kind: 'double_forfeit', result: null, started: false, administrativeReason: 'forfeit' });

const forfeitAfterStart = (engine, p1, p2, result, scores = {}) => engine.writeMatchOutcome({
  p1, p2, s1: scores.s1 ?? 0, s2: scores.s2 ?? 0, f1: 0, f2: 0, table: 70,
}, { kind: 'forfeit_after_start', result, started: true, administrativeReason: 'drop' });

const round = (engine, ids, matches, validated = true) => ({
  matches,
  validated,
  scenarioName: '',
  scenarioDesc: '',
  scoringMeta: engine.createRoundScoringMeta(ids),
});

const base = (extra) => ({
  id: 't', name: 'Test', rounds: 3, scoring: { win: 3, draw: 1, loss: 0 },
  freeScoreName: null, pairFormat: 'swiss', roundsData: [], blocks: [], ...extra,
});

export const standingsScenarios = (engine) => {
  const swissPlayers = [
    player('a'), player('b'), player('c', { penalties: [{ points: -2, reason: 'retard' }] }),
    player('d'), player('e', { status: 'dropped' }), player('f', { status: 'inscrit' }),
    player('g'), player('h', { penalties: [{ points: 1, reason: 'peinture' }] }), player('i'),
  ];
  const ids = swissPlayers.map((p) => p.id);
  const scenarios = {};

  scenarios['suisse-complet'] = base({
    players: swissPlayers,
    freeScoreName: 'Peinture',
    roundsData: [
      round(engine, ids, [
        played(engine, 'a', 'b', 'p1', { s1: 15, s2: 8, f1: 3, f2: 1 }),
        played(engine, 'c', 'd', 'draw', { s1: 10, s2: 10, f1: 2, f2: 2 }),
        noShow(engine, 'g', 'e', 'p1', 11),
        doubleForfeit(engine, 'h', 'i'),
        bye(engine, 'f', 9.5, 1),
      ]),
      round(engine, ids, [
        played(engine, 'a', 'c', 'p2', { s1: 7, s2: 12 }),
        played(engine, 'b', 'g', 'p1', { s1: 14, s2: 13, f1: 2 }),
        forfeitAfterStart(engine, 'd', 'h', 'p1', { s1: 6, s2: 4 }),
        played(engine, 'i', 'f', 'draw', { s1: 9, s2: 9 }),
      ]),
      round(engine, ids, [played(engine, 'a', 'd', 'p1', { s1: 20, s2: 0 })], false),
    ],
  });

  const tied = [player('x'), player('y'), player('z'), player('w')];
  scenarios['suisse-egalites'] = base({
    players: tied,
    freeScoreName: 'Libre',
    roundsData: [round(engine, tied.map((p) => p.id), [
      played(engine, 'x', 'y', 'p1', { s1: 10, s2: 5, f1: 1 }),
      played(engine, 'z', 'w', 'p1', { s1: 10, s2: 5, f1: 2 }),
    ])],
  });

  scenarios['suisse-scoring-2-1-0'] = base({
    players: tied,
    scoring: { win: 2, draw: 1, loss: 0 },
    roundsData: [round(engine, tied.map((p) => p.id), [
      played(engine, 'x', 'y', 'draw', { s1: 3, s2: 3 }),
      played(engine, 'z', 'w', 'p2', { s1: 3, s2: 4 }),
    ])],
  });

  scenarios['suisse-sans-ronde'] = base({ players: [player('m', { status: 'preinscrit' }), player('n')] });

  const bracketPlayers = [player('p'), player('q'), player('r'), player('s'), player('t')];
  scenarios['elimination-directe'] = base({
    pairFormat: 'bracket',
    players: bracketPlayers,
    freeScoreName: 'Libre',
    roundsData: [
      { matches: [
        { p1: 'p', p2: null, bye: true, result: 'bye', byeScenario: 5, byeFree: 1, table: 1 },
        { p1: 'q', p2: 'r', result: 'p2', s1: 4, s2: 9, f1: 1, f2: 0, table: 2 },
        { p1: 's', p2: 't', result: 'p1', s1: 8, s2: 3, f1: 0, f2: 2, table: 3 },
      ], validated: true },
      { matches: [
        { p1: 'p', p2: 's', result: 'p2', s1: 2, s2: 12, table: 1 },
      ], validated: true },
    ],
  });

  const hybridPlayers = [player('h1'), player('h2'), player('h3'), player('h4')];
  const hybridIds = hybridPlayers.map((p) => p.id);
  const hybridSwiss = [
    round(engine, hybridIds, [
      played(engine, 'h1', 'h2', 'p1', { s1: 10, s2: 2 }),
      played(engine, 'h3', 'h4', 'p2', { s1: 1, s2: 11 }),
    ]),
  ];
  const cutRound = { matches: [
    { p1: 'h1', p2: 'h4', result: 'p2', s1: 3, s2: 4, table: 1 },
  ], validated: true, bracketKey: 'main' };
  scenarios['hybride-suisse-sans-instantane'] = base({
    pairFormat: 'hybrid', hybridPhase: 'swiss', players: hybridPlayers, roundsData: [...hybridSwiss],
  });
  scenarios['hybride-top-cut-sans-instantane'] = base({
    pairFormat: 'hybrid', hybridPhase: 'cut', cutStartIndex: 1, players: hybridPlayers,
    roundsData: [...hybridSwiss, cutRound],
  });
  const swissStandings = engine.calculateSwissStandings({ players: hybridPlayers, rounds: hybridSwiss });
  const byId = new Map(swissStandings.map((standing) => [standing.id, standing]));
  const snapshot = engine.createHybridSwissSnapshot({
    standings: ['h1', 'h4', 'h3', 'h2'].map((id) => byId.get(id)),
    cutStartIndex: 1,
    eligiblePlayerIds: ['h1', 'h4', 'h3', 'h2'],
    qualifiedPlayerIds: ['h1', 'h4'],
    capturedAt: '2026-01-01T00:00:00.000Z',
  });
  scenarios['hybride-top-cut-avec-instantane'] = base({
    pairFormat: 'hybrid', hybridPhase: 'cut', cutStartIndex: 1, swissSnapshot: snapshot,
    players: hybridPlayers.map((p) => (['h2', 'h3'].includes(p.id) ? { ...p, status: 'eliminatedcut' } : p)),
    roundsData: [...hybridSwiss, cutRound],
  });
  return scenarios;
};
