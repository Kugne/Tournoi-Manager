const uniqueMessages = (items) => [...new Set(items
  .map((item) => item?.message ?? item?.msg)
  .filter(Boolean))];

/**
 * Classifies one prospective exchange from the same analysis used by the round
 * screen. Only the affected tables participate in the classification, so an
 * unrelated warning elsewhere in the round cannot downgrade every candidate.
 */
export const classifyPairingCandidate = (analysis, affectedMatchIndexes = []) => {
  const affected = new Set(affectedMatchIndexes.map(Number));
  const tables = (analysis?.tables ?? []).filter((table) => affected.has(Number(table.matchIndex)));
  const globalFailures = tables.length < affected.size
    ? (analysis?.forbidden ?? []).filter((item) => item.code === 'analysis-error')
    : [];
  const forbidden = tables.flatMap((table) => table.forbidden ?? []).concat(globalFailures);
  const alerts = tables.flatMap((table) => table.alerts ?? []);

  if (forbidden.length > 0) {
    return {
      status: 'forbidden',
      color: 'red',
      rank: 3,
      allowed: false,
      label: 'Interdit',
      messages: uniqueMessages(forbidden),
    };
  }

  const strongWarnings = alerts.filter((item) => (
    item.code === 'rematch'
    || item.code === 'repeated-bye'
    || item.level === 'orange'
    || item.level === 'red'
  ));
  if (strongWarnings.length > 0) {
    return {
      status: 'warning',
      color: 'orange',
      rank: 2,
      allowed: true,
      label: strongWarnings.some((item) => item.code === 'rematch') ? 'Revanche' : 'À confirmer',
      messages: uniqueMessages(strongWarnings.concat(alerts.filter((item) => item.level === 'yellow'))),
    };
  }

  if (alerts.length > 0) {
    return {
      status: 'caution',
      color: 'yellow',
      rank: 1,
      allowed: true,
      label: 'Déconseillé',
      messages: uniqueMessages(alerts),
    };
  }

  return {
    status: 'valid',
    color: 'green',
    rank: 0,
    allowed: true,
    label: 'Compatible',
    messages: [],
  };
};

export const sortPairingCandidates = (candidates, locale = 'fr') => [...candidates].sort((left, right) => {
  const rankDifference = Number(left?.classification?.rank ?? 99)
    - Number(right?.classification?.rank ?? 99);
  if (rankDifference !== 0) return rankDifference;
  return String(left?.name ?? '').localeCompare(String(right?.name ?? ''), locale, { sensitivity: 'base' });
});
