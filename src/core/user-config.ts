export const USER_CONFIG_VERSION = 1 as const;

export const USER_CONFIG_DEFAULTS = {
  language: 'auto',
  commentary_mode: 'mixed',
  commentary_detail: 'normal',
} as const;

export type UserConfigLanguage = 'auto' | 'ru' | 'en';
export type UserConfigCommentaryMode = 'technical' | 'artistic' | 'mixed';
export type UserConfigCommentaryDetail = 'short' | 'normal' | 'detailed';

export type UserConfigValues = {
  language: UserConfigLanguage;
  commentary_mode: UserConfigCommentaryMode;
  commentary_detail: UserConfigCommentaryDetail;
};

export type StoredUserConfig = UserConfigValues & {
  config_version: typeof USER_CONFIG_VERSION;
  updated_at?: string;
};

export type UserConfigField = keyof UserConfigValues;
export type UserConfigSource = 'stored' | 'default';

export type NormalizedUserConfig = {
  config: StoredUserConfig;
  sources: Record<UserConfigField, UserConfigSource>;
  warnings: string[];
};

const ALLOWED = {
  language: new Set<UserConfigLanguage>(['auto', 'ru', 'en']),
  commentary_mode: new Set<UserConfigCommentaryMode>(['technical', 'artistic', 'mixed']),
  commentary_detail: new Set<UserConfigCommentaryDetail>(['short', 'normal', 'detailed']),
};

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined;
}

function validStoredTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

export function normalizeUserConfig(value: unknown): NormalizedUserConfig {
  const raw = recordOrNull(value);
  const warnings: string[] = [];
  const sources: Record<UserConfigField, UserConfigSource> = {
    language: 'default',
    commentary_mode: 'default',
    commentary_detail: 'default',
  };

  if (raw && raw.config_version !== undefined && raw.config_version !== USER_CONFIG_VERSION) {
    warnings.push(`unsupported config_version ${String(raw.config_version)}; using v${USER_CONFIG_VERSION} semantics`);
  }

  const languageCandidate = normalizedString(raw?.language);
  const language = languageCandidate && ALLOWED.language.has(languageCandidate as UserConfigLanguage)
    ? languageCandidate as UserConfigLanguage
    : USER_CONFIG_DEFAULTS.language;
  if (languageCandidate && languageCandidate !== language) warnings.push(`invalid language ${languageCandidate}; using auto`);
  else if (languageCandidate) sources.language = 'stored';

  const modeCandidate = normalizedString(raw?.commentary_mode);
  const commentaryMode = modeCandidate && ALLOWED.commentary_mode.has(modeCandidate as UserConfigCommentaryMode)
    ? modeCandidate as UserConfigCommentaryMode
    : USER_CONFIG_DEFAULTS.commentary_mode;
  if (modeCandidate && modeCandidate !== commentaryMode) warnings.push(`invalid commentary_mode ${modeCandidate}; using mixed`);
  else if (modeCandidate) sources.commentary_mode = 'stored';

  const detailCandidate = normalizedString(raw?.commentary_detail);
  const commentaryDetail = detailCandidate && ALLOWED.commentary_detail.has(detailCandidate as UserConfigCommentaryDetail)
    ? detailCandidate as UserConfigCommentaryDetail
    : USER_CONFIG_DEFAULTS.commentary_detail;
  if (detailCandidate && detailCandidate !== commentaryDetail) warnings.push(`invalid commentary_detail ${detailCandidate}; using normal`);
  else if (detailCandidate) sources.commentary_detail = 'stored';

  const updatedAt = validStoredTimestamp(raw?.updated_at);
  return {
    config: {
      config_version: USER_CONFIG_VERSION,
      language,
      commentary_mode: commentaryMode,
      commentary_detail: commentaryDetail,
      ...(updatedAt ? { updated_at: updatedAt } : {}),
    },
    sources,
    warnings,
  };
}

export class UserConfigValidationError extends Error {
  readonly code = 'invalid_user_config';

  constructor(message: string) {
    super(message);
    this.name = 'UserConfigValidationError';
  }
}

export function parseUserConfigPatch(value: unknown): Partial<UserConfigValues> {
  const raw = recordOrNull(value);
  if (!raw) throw new UserConfigValidationError('user config patch must be an object');

  const patch: Partial<UserConfigValues> = {};
  const allowedKeys = new Set<UserConfigField>(['language', 'commentary_mode', 'commentary_detail']);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key as UserConfigField)) {
      throw new UserConfigValidationError(`unsupported user config field: ${key}`);
    }
  }

  if (raw.language !== undefined) {
    const candidate = normalizedString(raw.language);
    if (!candidate || !ALLOWED.language.has(candidate as UserConfigLanguage)) {
      throw new UserConfigValidationError('language must be auto|ru|en');
    }
    patch.language = candidate as UserConfigLanguage;
  }

  if (raw.commentary_mode !== undefined) {
    const candidate = normalizedString(raw.commentary_mode);
    if (!candidate || !ALLOWED.commentary_mode.has(candidate as UserConfigCommentaryMode)) {
      throw new UserConfigValidationError('commentary_mode must be technical|artistic|mixed');
    }
    patch.commentary_mode = candidate as UserConfigCommentaryMode;
  }

  if (raw.commentary_detail !== undefined) {
    const candidate = normalizedString(raw.commentary_detail);
    if (!candidate || !ALLOWED.commentary_detail.has(candidate as UserConfigCommentaryDetail)) {
      throw new UserConfigValidationError('commentary_detail must be short|normal|detailed');
    }
    patch.commentary_detail = candidate as UserConfigCommentaryDetail;
  }

  if (Object.keys(patch).length === 0) {
    throw new UserConfigValidationError('at least one user config field is required');
  }
  return patch;
}
