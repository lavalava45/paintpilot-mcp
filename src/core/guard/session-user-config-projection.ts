// @ts-nocheck
// Read-only projection of configured and per-art-run presentation preferences.
// Persistence, Guard admission and state mutation remain in SessionStore.
import { normalizeUserConfig, USER_CONFIG_VERSION } from '../user-config.js';

export const ART_RUN_COMMENTARY_MODES = new Set(['technical', 'artistic', 'mixed']);
export const ART_RUN_COMMENTARY_DETAILS = new Set(['short', 'normal', 'detailed']);
export const ART_RUN_PAINTING_PROFILES = new Set(['nontrivial_painting', 'simple_graphic']);

function textOrUndefined(value) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }

export function resolveSessionUserConfig(state, documentId) {
  const normalized = normalizeUserConfig(state.user_config);
  const effective = {
    language: normalized.config.language,
    commentary_mode: normalized.config.commentary_mode,
    commentary_detail: normalized.config.commentary_detail,
    painting_profile: normalized.config.painting_profile,
  };
  const sources = {
    language: normalized.sources.language === 'stored' ? 'user_config' : 'default',
    commentary_mode: normalized.sources.commentary_mode === 'stored' ? 'user_config' : 'default',
    commentary_detail: normalized.sources.commentary_detail === 'stored' ? 'user_config' : 'default',
    painting_profile: normalized.sources.painting_profile === 'stored' ? 'user_config' : 'default',
  };
  const warnings = [...normalized.warnings];
  const validDocumentId = Number.isSafeInteger(documentId) && documentId > 0 ? documentId : undefined;
  const documentState = validDocumentId ? state.documents?.[String(validDocumentId)] : undefined;
  const activeRunPaintingProfile = documentState?.process_dir && ART_RUN_PAINTING_PROFILES.has(documentState.painting_profile)
    ? documentState.painting_profile : null;
  if (documentState?.commentary_mode !== undefined) {
    const stickyMode = textOrUndefined(documentState.commentary_mode)?.toLowerCase();
    if (stickyMode && ART_RUN_COMMENTARY_MODES.has(stickyMode)) {
      effective.commentary_mode = stickyMode;
      sources.commentary_mode = 'art_run';
    } else {
      warnings.push('invalid sticky commentary_mode ignored; using user config/default');
    }
  }
  if (documentState?.commentary_detail !== undefined) {
    const stickyDetail = textOrUndefined(documentState.commentary_detail)?.toLowerCase();
    if (stickyDetail && ART_RUN_COMMENTARY_DETAILS.has(stickyDetail)) {
      effective.commentary_detail = stickyDetail;
      sources.commentary_detail = 'art_run';
    } else {
      warnings.push('invalid sticky commentary_detail ignored; using user config/default');
    }
  }
  return {
    config_version: USER_CONFIG_VERSION,
    configured: {
      language: normalized.config.language,
      commentary_mode: normalized.config.commentary_mode,
      commentary_detail: normalized.config.commentary_detail,
      painting_profile: normalized.config.painting_profile,
    },
    effective,
    sources,
    warnings,
    active_run_painting_profile: activeRunPaintingProfile,
    painting_profile_applies_to: 'next_art_run',
    document_id: validDocumentId ?? null,
    updated_at: normalized.config.updated_at ?? null,
  };
}
