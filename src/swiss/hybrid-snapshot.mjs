const finiteNumber = (value, label) => {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new TypeError(`${label} doit être un nombre fini`);
  return Object.is(number, -0) ? 0 : number;
};

const integer = (value, label, minimum = 0) => {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number < minimum) throw new TypeError(`${label} est invalide`);
  return number;
};

const SNAPSHOT_VERSION = 1;
const SCORE_FIELDS = ['pts', 'scenario', 'free', 'sos', 'wins', 'draws', 'losses', 'bonusMalus'];

export const createHybridSwissSnapshot = ({
  standings,
  cutStartIndex,
  eligiblePlayerIds = [],
  qualifiedPlayerIds = [],
  capturedAt = new Date().toISOString(),
}) => {
  if (!Array.isArray(standings) || standings.length === 0) {
    throw new TypeError('Classement Suisse non vide requis');
  }
  const eligible = new Set(eligiblePlayerIds.map(String));
  const qualified = qualifiedPlayerIds.map(String);
  if (new Set(qualified).size !== qualified.length) throw new TypeError('Qualifiés du Top Cut dupliqués');
  const qualifiedSet = new Set(qualified);
  const ids = standings.map((standing) => String(standing?.id ?? ''));
  if (ids.some((id) => id === '') || new Set(ids).size !== ids.length) {
    throw new TypeError('Identifiants du classement Suisse invalides ou dupliqués');
  }
  if (qualified.some((id) => !ids.includes(id))) throw new TypeError('Qualifié absent du classement Suisse');
  if (qualified.some((id) => !eligible.has(id))) throw new TypeError('Qualifié non éligible au Top Cut');

  return {
    schemaVersion: SNAPSHOT_VERSION,
    source: 'top-cut-confirmed',
    capturedAt: String(capturedAt),
    cutStartIndex: integer(cutStartIndex, 'Frontière du Top Cut'),
    standings: standings.map((standing, index) => {
      const id = String(standing.id);
      return {
        playerId: id,
        swissRank: index + 1,
        eligibleAtCut: eligible.has(id),
        qualifiedAtCut: qualifiedSet.has(id),
        seed: qualifiedSet.has(id) ? qualified.indexOf(id) + 1 : null,
        statusAtCut: standing.status ?? null,
        ...Object.fromEntries(SCORE_FIELDS.map((field) => [
          field,
          finiteNumber(standing[field], `${field} de ${id}`),
        ])),
      };
    }),
  };
};

export const isValidHybridSwissSnapshot = (snapshot, cutStartIndex = null, playerIds = null) => {
  if (!snapshot || snapshot.schemaVersion !== SNAPSHOT_VERSION || !Array.isArray(snapshot.standings)) return false;
  if (!Number.isInteger(snapshot.cutStartIndex) || snapshot.cutStartIndex < 0) return false;
  if (cutStartIndex != null && snapshot.cutStartIndex !== cutStartIndex) return false;
  const ids = snapshot.standings.map((row) => String(row?.playerId ?? ''));
  if (ids.some((id) => id === '') || new Set(ids).size !== ids.length) return false;
  if (playerIds != null) {
    const expected = playerIds.map(String);
    if (new Set(expected).size !== expected.length
      || expected.length !== ids.length
      || expected.some((id) => !ids.includes(id))) return false;
  }
  const qualifiedRows = snapshot.standings.filter((row) => row.qualifiedAtCut === true);
  const seeds = qualifiedRows.map((row) => row.seed).sort((left, right) => left - right);
  if (seeds.some((seed, index) => seed !== index + 1)) return false;
  return snapshot.standings.every((row, index) => row.swissRank === index + 1
    && typeof row.eligibleAtCut === 'boolean'
    && typeof row.qualifiedAtCut === 'boolean'
    && (!row.qualifiedAtCut ? row.seed == null : row.eligibleAtCut)
    && SCORE_FIELDS.every((field) => Number.isFinite(Number(row[field]))));
};

export const restoreHybridSwissStandings = ({ players, snapshot, normalizeStatus = (status) => status }) => {
  if (!Array.isArray(players)) throw new TypeError('Joueurs requis');
  if (!isValidHybridSwissSnapshot(snapshot, null, players.map((player) => player.id))) {
    throw new TypeError('Photographie Suisse invalide ou incomplète');
  }
  const byId = new Map(snapshot.standings.map((row) => [String(row.playerId), row]));
  return players.map((player) => {
    const row = byId.get(String(player.id));
    return {
      id: player.id,
      name: player.name,
      faction: player.faction,
      status: normalizeStatus(player.status),
      compo: player.compo != null ? Number.parseInt(player.compo, 10) || 0 : null,
      pts: row?.pts ?? 0,
      scenario: row?.scenario ?? 0,
      free: row?.free ?? 0,
      sos: row?.sos ?? 0,
      wins: row?.wins ?? 0,
      draws: row?.draws ?? 0,
      losses: row?.losses ?? 0,
      opponents: [],
      bonusMalus: row?.bonusMalus ?? 0,
      swissRank: row?.swissRank ?? Number.MAX_SAFE_INTEGER,
      eligibleAtCut: row?.eligibleAtCut ?? false,
      qualifiedAtCut: row?.qualifiedAtCut ?? false,
      cutSeed: row?.seed ?? null,
    };
  });
};

export { SNAPSHOT_VERSION as HYBRID_SWISS_SNAPSHOT_VERSION };
