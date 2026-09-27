import { buildSwissEngineInput } from './application-adapter.mjs';
import { normalizeNote, pairKey } from './lexicographic-cost.mjs';

const hasValue = (value) => value != null && String(value).trim() !== '';

const finiteNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const formatNumber = (value) => new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 3,
}).format(finiteNumber(value));

const operationLabels = {
  initial: {
    timeout: ['error', 7000, 'Calcul interrompu après 15 secondes : la ronde n’a pas été créée.'],
    stale: ['warning', 7000, 'Le tournoi a changé pendant le calcul : relance la création de la ronde.'],
    cancelled: ['warning', 6000, 'Calcul des appariements annulé : la ronde n’a pas été créée.'],
    default: ['error', 8000, 'Impossible de calculer une ronde complète'],
  },
  variant: {
    exhausted: ['info', 7000, 'Toutes les variantes optimales disponibles ont déjà été proposées.'],
    timeout: ['error', 7000, 'Recherche interrompue après 15 secondes : les appariements actuels sont conservés.'],
    stale: ['warning', 7000, 'La ronde a changé pendant le calcul : les appariements actuels sont conservés.'],
    cancelled: ['warning', 6000, 'Recherche annulée : les appariements actuels sont conservés.'],
    interrupted: ['warning', 6000, 'Recherche annulée : les appariements actuels sont conservés.'],
    unavailable: ['warning', 6000, 'Aucune nouvelle variante optimale n’a pu être proposée.'],
    default: ['error', 8000, 'Impossible de rechercher une nouvelle variante'],
  },
};

/** Returns the single user-facing feedback definition for a Worker outcome. */
export const swissOperationFeedback = (operation, outcome = {}, context = {}) => {
  const labels = operationLabels[operation];
  if (!labels) throw new RangeError(`Opération Suisse inconnue : ${operation}`);
  if (outcome.error?.code === 'NO_PERFECT_MATCHING') {
    const playerNames = context.playerNames ?? {};
    const activePlayerIds = new Set((context.activePlayerIds ?? []).map(String));
    const activeBlocks = (context.blockedPairs ?? []).filter((entry) => {
      if (activePlayerIds.size === 0) return true;
      return activePlayerIds.has(String(entry.a ?? entry.p1))
        && activePlayerIds.has(String(entry.b ?? entry.p2));
    }).map((entry) => {
      const left = String(entry.a ?? entry.p1 ?? '?');
      const right = String(entry.b ?? entry.p2 ?? '?');
      return `${playerNames[left] ?? left} ↔ ${playerNames[right] ?? right}`;
    });
    const blockDetail = activeBlocks.length
      ? ` Blocages actifs à vérifier : ${activeBlocks.join(', ')}.`
      : '';
    return {
      type: 'error',
      duration: 9000,
      text: operation === 'initial'
        ? `Aucun appariement complet ne respecte tous les blocages actifs. Retire ou modifie un blocage, puis relance la ronde.${blockDetail}`
        : `Aucune nouvelle variante complète ne respecte tous les blocages actifs. Les appariements actuels sont conservés.${blockDetail}`,
    };
  }
  const [type, duration, baseText] = labels[outcome.status] ?? labels.default;
  const detail = labels[outcome.status] == null && outcome.error?.message
    ? ` : ${outcome.error.message}`
    : '';
  return { type, duration, text: `${baseText}${detail}` };
};

const historyIndexes = (history) => {
  const opponents = new Map();
  const factionExposures = new Map();
  for (const entry of history ?? []) {
    const key = pairKey(entry.a, entry.b);
    const previous = opponents.get(key) ?? { count: 0, rounds: [] };
    previous.count += 1;
    previous.rounds.push(finiteNumber(entry.round));
    opponents.set(key, previous);
  }
  return { opponents, factionExposures };
};

const populateFactionExposures = (indexes, history, playersById) => {
  for (const entry of history ?? []) {
    const left = playersById.get(String(entry.a));
    const right = playersById.get(String(entry.b));
    if (!left || !right) continue;
    if (hasValue(right.faction)) {
      const key = `${left.id}\u0000${String(right.faction)}`;
      indexes.factionExposures.set(key, (indexes.factionExposures.get(key) ?? 0) + 1);
    }
    if (hasValue(left.faction)) {
      const key = `${right.id}\u0000${String(left.faction)}`;
      indexes.factionExposures.set(key, (indexes.factionExposures.get(key) ?? 0) + 1);
    }
  }
};

const priorByeCounts = (tournament, roundIndex) => {
  const counts = new Map();
  for (const [index, round] of (tournament.roundsData ?? []).entries()) {
    if (index === roundIndex || round.validated !== true) continue;
    for (const match of round.matches ?? []) {
      if (!match.bye || match.p1 == null) continue;
      const id = String(match.p1);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
};

const alert = (level, code, message, players, unavoidable) => ({
  level, code, message, players, unavoidable,
});

const firstCompromise = (facts) => {
  if (facts.rematchCount > 0) return 'Revanches';
  if (facts.pointGap > 0) return 'Points de tournoi';
  if (facts.mirror) return 'Miroirs de faction';
  if (facts.sameAllegiance) return 'Allégeances';
  if (facts.compoGap > 0) return 'Compo';
  if (facts.noteConflict) return 'Note libre';
  if (Math.max(...facts.factionExposures) > 0) return 'Diversité des factions';
  return 'Aucun compromis visible';
};

const activeCriteriaText = (options) => {
  const criteria = ['points de tournoi'];
  if (options.avoidMirrors) criteria.push('miroirs');
  if (options.avoidAlliances) criteria.push('allégeances');
  if (options.useCompo) criteria.push('compo');
  if (['separer', 'separate', 'regrouper', 'group'].includes(options.noteMode)) criteria.push('note libre');
  criteria.push('diversité des factions');
  return criteria.join(', ');
};

/**
 * Analyzes one persisted Swiss round from the same normalized input consumed by
 * the exact engine. No UI field or legacy alert cache participates in the result.
 */
export const analyzeApplicationSwissRound = ({
  tournament,
  roundIndex,
  standings,
  allegianceForFaction = () => null,
}) => {
  const round = tournament?.roundsData?.[roundIndex];
  if (!round || !Array.isArray(round.matches)) throw new Error('Ronde Suisse à analyser introuvable');
  const input = buildSwissEngineInput({ tournament, roundIndex, standings, allegianceForFaction });
  const standingsById = new Map(standings.map((entry) => [String(entry.id), entry]));
  const playersById = new Map((tournament.players ?? []).map((player) => {
    const id = String(player.id);
    const standing = standingsById.get(id);
    return [id, {
      ...player,
      id,
      name: player.name || id,
      points: finiteNumber(standing?.pts),
      allegiance: input.context.options.avoidAlliances
        ? allegianceForFaction(player.faction) ?? ''
        : '',
    }];
  }));
  const indexes = historyIndexes(input.context.history);
  populateFactionExposures(indexes, input.context.history, playersById);
  const blocked = new Set(input.context.blockedPairs.map((entry) => pairKey(entry.a, entry.b)));
  const byeCounts = priorByeCounts(tournament, roundIndex);
  const eligibleByeCounts = [...playersById.values()]
    .filter((player) => player.status === 'active')
    .map((player) => byeCounts.get(player.id) ?? 0);
  const minimumByeCount = eligibleByeCounts.length ? Math.min(...eligibleByeCounts) : 0;
  const exactEngineResult = round.pairingMeta?.manuallyEdited === false;
  const options = input.context.options;
  const activePlayerIds = new Set([...playersById.values()]
    .filter((player) => player.status === 'active')
    .map((player) => player.id));
  const seenPlayerTables = new Map();

  const registerPlayer = (player, rawId, table, forbidden) => {
    if (rawId == null) return;
    const id = String(rawId);
    if (!player) return;
    if (player.status !== 'active') {
      forbidden.push({
        code: 'inactive-player',
        message: `${player.name} n’est plus actif mais apparaît encore à cette table.`,
        players: [id],
      });
    }
    if (seenPlayerTables.has(id)) {
      forbidden.push({
        code: 'duplicate-player',
        message: `${player.name} apparaît déjà à la table #${seenPlayerTables.get(id)}.`,
        players: [id],
      });
    } else {
      seenPlayerTables.set(id, table);
    }
  };

  const tables = round.matches.map((match, matchIndex) => {
    const table = finiteNumber(match.table) || matchIndex + 1;
    const p1 = match.p1 == null ? null : playersById.get(String(match.p1));
    const p2 = match.p2 == null ? null : playersById.get(String(match.p2));
    const alerts = [];
    const forbidden = [];
    const samePlayer = match.p1 != null && match.p2 != null && String(match.p1) === String(match.p2);
    registerPlayer(p1, match.p1, table, forbidden);
    if (!samePlayer) registerPlayer(p2, match.p2, table, forbidden);
    if (samePlayer) {
      forbidden.push({
        code: 'self-match',
        message: `${p1?.name ?? String(match.p1)} ne peut pas jouer contre lui-même.`,
        players: p1 ? [p1.id] : [],
      });
    }

    if (match.bye) {
      const previousByes = p1 ? byeCounts.get(p1.id) ?? 0 : 0;
      const repeatedIsUnavoidable = exactEngineResult && minimumByeCount > 0;
      if (!p1) {
        forbidden.push({ code: 'unknown-player', message: 'Le bénéficiaire du bye est introuvable.' });
      } else if (match.p2 != null) {
        forbidden.push({ code: 'invalid-bye', message: 'Un bye ne peut pas contenir un second joueur.' });
      } else if (previousByes > 0) {
        alerts.push(alert(
          'red',
          'repeated-bye',
          repeatedIsUnavoidable
            ? `${p1.name} reçoit un nouveau bye : tous les joueurs éligibles en avaient déjà reçu au moins un.`
            : `${p1.name} a déjà reçu ${previousByes} bye${previousByes > 1 ? 's' : ''} : attribution à vérifier.`,
          [p1.id],
          repeatedIsUnavoidable,
        ));
      }
      return {
        table,
        matchIndex,
        kind: 'bye',
        players: p1 ? [p1.id] : [],
        alerts,
        forbidden,
        compromiseLevel: previousByes > 0 ? 'Rotation des byes' : 'Bye',
        explanation: [
          p1 ? `${p1.name} est le bénéficiaire du bye.` : 'Bénéficiaire inconnu.',
          `${previousByes} bye antérieur${previousByes > 1 ? 's' : ''}.`,
          exactEngineResult
            ? 'Le bénéficiaire a été choisi avant le solveur : moins de byes, puis classement le plus bas.'
            : 'Cette attribution a été modifiée manuellement ou provient d’une ancienne ronde.',
        ],
      };
    }

    if (!p1 || !p2) {
      forbidden.push({ code: 'unknown-player', message: 'Cette table contient un joueur introuvable.' });
      return {
        table,
        matchIndex,
        kind: 'match',
        players: [p1?.id, p2?.id].filter(Boolean),
        alerts,
        forbidden,
        compromiseLevel: 'Donnée incohérente',
        explanation: ['Impossible d’expliquer cette table : un joueur est absent des données du tournoi.'],
      };
    }

    const key = pairKey(p1.id, p2.id);
    if (blocked.has(key)) {
      forbidden.push({
        code: 'manual-block',
        message: `${p1.name} et ${p2.name} sont bloqués : cette rencontre est interdite.`,
        players: [p1.id, p2.id],
      });
    }
    const previous = indexes.opponents.get(key);
    const rematchCount = previous?.count ?? 0;
    const lastRound = previous ? Math.max(...previous.rounds) : null;
    const pointGap = Math.abs(p1.points - p2.points);
    const mirror = options.avoidMirrors && hasValue(p1.faction)
      && p1.faction === p2.faction;
    const sameAllegiance = options.avoidAlliances && hasValue(p1.allegiance)
      && p1.allegiance === p2.allegiance;
    const compoGap = options.useCompo && hasValue(p1.compo) && hasValue(p2.compo)
      ? Math.abs(finiteNumber(p1.compo) - finiteNumber(p2.compo))
      : 0;
    const noteMode = options.noteMode;
    const note1 = normalizeNote(p1.note);
    const note2 = normalizeNote(p2.note);
    const bothNotes = note1 !== '' && note2 !== '';
    const noteConflict = ['separer', 'separate'].includes(noteMode)
      ? bothNotes && note1 === note2
      : ['regrouper', 'group'].includes(noteMode)
        ? bothNotes && note1 !== note2
        : false;
    const factionExposures = [
      hasValue(p2.faction) ? indexes.factionExposures.get(`${p1.id}\u0000${String(p2.faction)}`) ?? 0 : 0,
      hasValue(p1.faction) ? indexes.factionExposures.get(`${p2.id}\u0000${String(p1.faction)}`) ?? 0 : 0,
    ];
    const unavoidable = exactEngineResult;

    if (rematchCount > 0) {
      alerts.push(alert(
        exactEngineResult ? 'red' : 'orange',
        'rematch',
        exactEngineResult
          ? `Revanche inévitable dans l’optimum global : ${p1.name} et ${p2.name} se sont déjà affrontés ${rematchCount} fois.`
          : `Revanche après modification manuelle : ${p1.name} et ${p2.name} se sont déjà affrontés ${rematchCount} fois.`,
        [p1.id, p2.id],
        unavoidable,
      ));
    }
    if (mirror) {
      alerts.push(alert('yellow', 'mirror', `Miroir de faction : ${p1.faction}.`, [p1.id, p2.id], unavoidable));
    }
    if (sameAllegiance && !mirror) {
      alerts.push(alert('yellow', 'allegiance', `Même allégeance : ${p1.allegiance}.`, [p1.id, p2.id], unavoidable));
    }
    if (compoGap > 0) {
      alerts.push(alert('yellow', 'compo-gap', `Écart de compo : ${formatNumber(compoGap)}.`, [p1.id, p2.id], unavoidable));
    }
    if (noteConflict) {
      const action = ['separer', 'separate'].includes(noteMode) ? 'séparer' : 'regrouper';
      alerts.push(alert('yellow', 'free-note', `Préférence de note libre « ${action} » non respectée.`, [p1.id, p2.id], unavoidable));
    }

    const facts = {
      rematchCount,
      pointGap,
      mirror,
      sameAllegiance,
      compoGap,
      noteConflict,
      factionExposures,
    };
    const explanation = [
      `${p1.name} : ${formatNumber(p1.points)} pt · ${p2.name} : ${formatNumber(p2.points)} pt · écart ${formatNumber(pointGap)}.`,
      rematchCount > 0
        ? `Revanche : ${rematchCount} rencontre${rematchCount > 1 ? 's' : ''} antérieure${rematchCount > 1 ? 's' : ''}${lastRound == null ? '' : `, la dernière en ronde ${lastRound}`}.`
        : 'Aucune rencontre antérieure entre ces joueurs.',
      `Critères actifs : ${activeCriteriaText(options)}.`,
    ];
    if (options.avoidMirrors) explanation.push(mirror ? `Un miroir ${p1.faction} subsiste.` : 'Pas de miroir de faction.');
    if (options.avoidAlliances) explanation.push(sameAllegiance ? `Même allégeance ${p1.allegiance}.` : 'Allégeances distinctes ou non renseignées.');
    if (options.useCompo) explanation.push(`Écart de compo : ${formatNumber(compoGap)}.`);
    if (['separer', 'separate', 'regrouper', 'group'].includes(noteMode)) {
      if (['regrouper', 'group'].includes(noteMode) && (!bothNotes)) {
        explanation.push('Au moins une note est vide : cette rencontre est neutre pour le regroupement.');
      } else {
        explanation.push(noteConflict ? 'La préférence de note libre n’est pas satisfaite.' : 'La préférence de note libre est satisfaite.');
      }
    }
    explanation.push(
      `${p1.name} a déjà affronté ${factionExposures[0]} fois la faction ${p2.faction || 'non renseignée'} ; ${p2.name}, ${factionExposures[1]} fois la faction ${p1.faction || 'non renseignée'}.`,
      exactEngineResult
        ? 'Cette table appartient à l’optimum global : elle ne peut pas être évaluée indépendamment des autres tables.'
        : 'Cette table a été modifiée manuellement ou provient d’une ronde sans métadonnées du moteur exact.',
    );

    return {
      table,
      matchIndex,
      kind: 'match',
      players: [p1.id, p2.id],
      alerts,
      forbidden,
      compromiseLevel: firstCompromise(facts),
      explanation,
      facts,
    };
  });

  const missingPlayers = [...activePlayerIds]
    .filter((id) => !seenPlayerTables.has(id))
    .map((id) => ({
      table: '—',
      code: 'missing-player',
      message: `${playersById.get(id)?.name ?? id} est actif mais n’apparaît dans aucune table ni aucun bye.`,
      players: [id],
    }));
  const alerts = tables.flatMap((table) => table.alerts.map((item) => ({ ...item, table: table.table })));
  const forbidden = tables.flatMap((table) => table.forbidden.map((item) => ({ ...item, table: table.table })))
    .concat(missingPlayers);
  const redCount = alerts.filter((item) => item.level === 'red').length;
  const orangeCount = alerts.filter((item) => item.level === 'orange').length;
  const yellowCount = alerts.filter((item) => item.level === 'yellow').length;
  const alertSummary = [
    redCount ? `${redCount} rouge${redCount > 1 ? 's' : ''}` : '',
    orangeCount ? `${orangeCount} orange${orangeCount > 1 ? 's' : ''}` : '',
    yellowCount ? `${yellowCount} jaune${yellowCount > 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ');
  const summary = forbidden.length > 0
    ? `${forbidden.length} appariement${forbidden.length > 1 ? 's' : ''} interdit${forbidden.length > 1 ? 's' : ''}`
    : alerts.length === 0
      ? 'Appariement optimal sans alerte'
      : `Alertes : ${alertSummary}`;

  return {
    valid: forbidden.length === 0,
    exactEngineResult,
    tables,
    alerts,
    forbidden,
    summary,
  };
};
