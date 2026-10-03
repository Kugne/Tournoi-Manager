import { readMatchOutcome } from './match-outcome.mjs';
import { ROUND_SCORING_VERSION } from './swiss-scoring.mjs';
import { HYBRID_SWISS_SNAPSHOT_VERSION } from '../swiss/hybrid-snapshot.mjs';

export const STATE_SCHEMA_VERSION = 1;

const failure = (code, message) => ({ valid: false, code, message });

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
    const hybridSchema = tournament.swissSnapshot?.schemaVersion;
    if (hybridSchema !== undefined
      && hybridSchema !== 1
      && hybridSchema !== HYBRID_SWISS_SNAPSHOT_VERSION) {
      return failure('future-hybrid-schema', 'Version de photographie Suisse non prise en charge');
    }
    for (const round of tournament.roundsData) {
      if (!round || !Array.isArray(round.matches)) {
        return failure('invalid-round', 'Structure de ronde incorrecte');
      }
      if (round.scoringMeta != null
        && round.scoringMeta.scoringVersion !== ROUND_SCORING_VERSION) {
        return failure('future-scoring-schema', 'Version de calcul neutre non prise en charge');
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
