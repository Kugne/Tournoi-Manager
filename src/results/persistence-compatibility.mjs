import { readMatchOutcome } from './match-outcome.mjs';
import { ROUND_SCORING_VERSION } from './swiss-scoring.mjs';
import {
  HYBRID_SWISS_SNAPSHOT_VERSION,
  isValidHybridSwissSnapshot,
} from '../swiss/hybrid-snapshot.mjs';

export const STATE_SCHEMA_VERSION = 1;
export const BRACKET_PLACEMENTS_VERSION = 1;

const failure = (code, message) => ({ valid: false, code, message });
const isFiniteStoredNumber = (value) => (typeof value === 'number' && Number.isFinite(value))
  || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));

const isValidRoundScoringMeta = (meta) => {
  if (!meta || typeof meta !== 'object'
    || meta.scoringVersion !== ROUND_SCORING_VERSION
    || !Array.isArray(meta.virtualOpponentPopulationIds)
    || !meta.neutralScores || typeof meta.neutralScores !== 'object') return false;
  const ids = meta.virtualOpponentPopulationIds.map(String);
  if (new Set(ids).size !== ids.length) return false;
  const { status, scenario, free } = meta.neutralScores;
  if (!['pending', 'round_average', 'manual'].includes(status)) return false;
  if (status === 'pending') {
    return (scenario == null || isFiniteStoredNumber(scenario))
      && (free == null || isFiniteStoredNumber(free));
  }
  return isFiniteStoredNumber(scenario) && isFiniteStoredNumber(free);
};

const isValidBracketPlacements = (placements, playerIds) => {
  if (!placements || typeof placements !== 'object'
    || placements.schemaVersion !== BRACKET_PLACEMENTS_VERSION) return false;
  const placementLists = [placements.thirdIds, placements.fourthIds, placements.runnerUpIds];
  if (placementLists.some((ids) => !Array.isArray(ids))) return false;
  const knownPlayerIds = new Set(playerIds.map(String));
  const allIds = placementLists.flat().map(String);
  if (new Set(allIds).size !== allIds.length
    || allIds.some((id) => !knownPlayerIds.has(id))) return false;
  if (placements.noPodium !== undefined && typeof placements.noPodium !== 'boolean') return false;
  if (placements.noThirdPlace !== undefined && typeof placements.noThirdPlace !== 'boolean') return false;
  if (placements.reason !== undefined && typeof placements.reason !== 'string') return false;
  return true;
};

export const inspectPersistedState = (data) => {
  if (!data || typeof data !== 'object') {
    return failure('invalid-state', 'Structure de sauvegarde incorrecte');
  }
  if (data.schemaVersion !== undefined && data.schemaVersion !== STATE_SCHEMA_VERSION) {
    return failure('future-state-schema', 'Version générale de sauvegarde non prise en charge');
  }
  if (!Array.isArray(data.tournaments) || !Array.isArray(data.gameSystems)) {
    return failure('invalid-state', 'Tournois ou systèmes de jeu manquants');
  }

  for (const tournament of data.tournaments) {
    if (!tournament || tournament.id === undefined
      || !Array.isArray(tournament.players) || !Array.isArray(tournament.roundsData)) {
      return failure('invalid-tournament', 'Structure de tournoi incorrecte');
    }
    const bracketPlacementsSchema = tournament.bracketPlacements?.schemaVersion;
    if (bracketPlacementsSchema !== undefined
      && bracketPlacementsSchema !== BRACKET_PLACEMENTS_VERSION) {
      return failure('future-bracket-placements-schema', 'Version des placements du tableau non prise en charge');
    }
    if (tournament.bracketPlacements != null && !isValidBracketPlacements(
      tournament.bracketPlacements,
      tournament.players.map((player) => player?.id),
    )) {
      return failure('invalid-bracket-placements', 'Placements du tableau invalides');
    }
    const hybridSchema = tournament.swissSnapshot?.schemaVersion;
    if (hybridSchema !== undefined
      && hybridSchema !== 1
      && hybridSchema !== HYBRID_SWISS_SNAPSHOT_VERSION) {
      return failure('future-hybrid-schema', 'Version de photographie Suisse non prise en charge');
    }
    if (tournament.swissSnapshot != null && !isValidHybridSwissSnapshot(
      tournament.swissSnapshot,
      tournament.cutStartIndex,
      tournament.players.map((player) => player?.id),
    )) {
      return failure('invalid-hybrid-snapshot', 'Photographie Suisse invalide ou incomplète');
    }
    for (const round of tournament.roundsData) {
      if (!round || !Array.isArray(round.matches)) {
        return failure('invalid-round', 'Structure de ronde incorrecte');
      }
      if (round.scoringMeta != null) {
        if (round.scoringMeta.scoringVersion !== ROUND_SCORING_VERSION) {
          return failure('future-scoring-schema', 'Version de calcul neutre non prise en charge');
        }
        if (!isValidRoundScoringMeta(round.scoringMeta)) {
          return failure('invalid-scoring-meta', 'Métadonnées de calcul neutre invalides');
        }
      }
      for (const match of round.matches) {
        try {
          readMatchOutcome(match);
        } catch (error) {
          return failure('invalid-match-outcome', error?.message || String(error));
        }
      }
    }
  }
  return { valid: true, code: null, message: null };
};
