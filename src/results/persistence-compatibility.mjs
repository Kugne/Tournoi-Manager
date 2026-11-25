import { readMatchOutcome } from './match-outcome.mjs';
import { ROUND_SCORING_VERSION } from './swiss-scoring.mjs';
import {
  HYBRID_SWISS_SNAPSHOT_VERSION,
  isValidHybridSwissSnapshot,
} from '../swiss/hybrid-snapshot.mjs';

export const STATE_SCHEMA_VERSION = 1;
/**
 * Version réservée aux sauvegardes contenant au moins un tournoi par équipes.
 * Une sauvegarde purement individuelle reste en version 1 et donc lisible par
 * la V2 publiée ; une sauvegarde par équipes passe en version 2, que la V2
 * refuse proprement (« future-state-schema ») au lieu de la mal interpréter.
 */
export const TEAM_STATE_SCHEMA_VERSION = 2;
export const PARTICIPANT_MODES = Object.freeze({ INDIVIDUAL: 'individual', TEAMS: 'teams' });

const isTeamTournament = (tournament) => tournament?.participantMode === PARTICIPANT_MODES.TEAMS;

/** Version de sauvegarde à écrire pour cet état. */
export const requiredStateSchemaVersion = (state) => (
  (state?.tournaments ?? []).some(isTeamTournament) ? TEAM_STATE_SCHEMA_VERSION : STATE_SCHEMA_VERSION
);
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

const hasId = (value) => value !== null && value !== undefined && String(value) !== '';

/**
 * Structure minimale d'un tournoi par équipes :
 * - teams : [{ id, name, status }] aux identifiants uniques ;
 * - player.teamId : équipe existante (ou absent pour un joueur non affecté) ;
 * - round.encounters (facultatif) : [{ id, teamA, teamB, table }] où teamB est
 *   null pour un bye ; chaque match individuel peut porter encounterId.
 */
const inspectTeamTournament = (tournament) => {
  if (!Array.isArray(tournament.teams)) return failure('invalid-teams', 'Liste des équipes manquante');
  const teamIds = tournament.teams.map((team) => (hasId(team?.id) ? String(team.id) : null));
  if (teamIds.some((id) => id === null) || new Set(teamIds).size !== teamIds.length) {
    return failure('invalid-teams', 'Identifiants d’équipe manquants ou dupliqués');
  }
  const knownTeams = new Set(teamIds);
  if (tournament.players.some((player) => player?.teamId != null && !knownTeams.has(String(player.teamId)))) {
    return failure('invalid-teams', 'Joueur rattaché à une équipe inconnue');
  }
  for (const round of tournament.roundsData) {
    if (round?.encounters == null) continue;
    if (!Array.isArray(round.encounters)) return failure('invalid-encounters', 'Rencontres d’équipes invalides');
    const encounterIds = new Set();
    for (const encounter of round.encounters) {
      if (!hasId(encounter?.id) || encounterIds.has(String(encounter.id))
        || !knownTeams.has(String(encounter.teamA))
        || (encounter.teamB != null && !knownTeams.has(String(encounter.teamB)))
        || String(encounter.teamA) === String(encounter.teamB)) {
        return failure('invalid-encounters', 'Rencontre d’équipes incohérente');
      }
      encounterIds.add(String(encounter.id));
    }
    if (round.matches.some((match) => match?.encounterId != null && !encounterIds.has(String(match.encounterId)))) {
      return failure('invalid-encounters', 'Partie rattachée à une rencontre inconnue');
    }
  }
  return null;
};

/**
 * Vérifie une sauvegarde avant de l'ouvrir.
 * supportsTeams reste faux tant que l'interface ne gère pas les équipes :
 * une sauvegarde version 2 est alors refusée comme aujourd'hui.
 */
export const inspectPersistedState = (data, { supportsTeams = false } = {}) => {
  if (!data || typeof data !== 'object') {
    return failure('invalid-state', 'Structure de sauvegarde incorrecte');
  }
  const supportedVersions = supportsTeams
    ? [STATE_SCHEMA_VERSION, TEAM_STATE_SCHEMA_VERSION]
    : [STATE_SCHEMA_VERSION];
  if (data.schemaVersion !== undefined && !supportedVersions.includes(data.schemaVersion)) {
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
    if (tournament.participantMode !== undefined
      && !Object.values(PARTICIPANT_MODES).includes(tournament.participantMode)) {
      return failure('invalid-tournament', 'Mode de participants inconnu');
    }
    if (isTeamTournament(tournament)) {
      if (!supportsTeams) {
        return failure('future-state-schema', 'Version générale de sauvegarde non prise en charge');
      }
      if (data.schemaVersion !== TEAM_STATE_SCHEMA_VERSION) {
        return failure('invalid-state', 'Un tournoi par équipes exige une sauvegarde en version 2');
      }
      const teamFailure = inspectTeamTournament(tournament);
      if (teamFailure) return teamFailure;
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
