/**
 * Photoshop MCP UXP Bridge — keeps a localhost long-poll open for commands and
 * runs them inside Photoshop. Load via Adobe UXP Developer Tools.
 */
const { entrypoints, host } = require('uxp');
const photoshop = require('photoshop');
const { action, core, app, constants } = photoshop;
const { localFileSystem, types } = require('uxp').storage;
const { tryHandleP1DocumentOperation } = require('./p1-document-ops');
const { tryHandleP1SelectionOperation } = require('./p1-selection-ops');
const { tryHandleP1LayerOperation } = require('./p1-layer-ops');
const { tryHandleP2AdjustmentOperation } = require('./p2-adjustment-ops');
const { tryHandleP2FilterOperation } = require('./p2-filter-ops');
const { tryHandleP2TextExportOperation } = require('./p2-text-export-ops');
const { tryHandleP3UtilityOperation } = require('./p3-utility-ops');
const { tryHandleP3DocumentDataOperation } = require('./p3-document-data-ops');
const { tryHandleP3LayerAdvancedOperation } = require('./p3-layer-advanced-ops');

const BRIDGE_PORT = 38452;
const BRIDGE_BASE = `http://127.0.0.1:${BRIDGE_PORT}`;
const BRIDGE_REVISION = 'compact-v2-20261009-component-rebuild';
const REGISTRATION_PROTOCOL = 'photoshop.uxp.registration.v1';
const COMMAND_PROTOCOL = 'photoshop.uxp.command.v1';
const RESULT_PROTOCOL = 'photoshop.uxp.command_result.v1';
const EVENT_PROTOCOL = 'photoshop.uxp.event.v1';
const RUNTIME_INSTANCE_WITNESS = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function panelLanguageFromLocale(locale) {
  return /^ru(?:[_-]|$)/i.test(String(locale ?? '').trim()) ? 'ru' : 'en';
}

const PANEL_LANGUAGE = panelLanguageFromLocale(host?.uiLocale);
const UI_COPY = {
  en: {
    videoLabel: 'Enable video recording',
    videoLoading: 'Loading recording state…',
    configTitle: 'Configuration',
    languageLabel: 'Report language',
    languageAuto: 'auto',
    languageRu: 'Russian',
    languageEn: 'English',
    commentaryLabel: 'Commentary',
    commentaryTechnical: 'technical',
    commentaryArtistic: 'artistic',
    commentaryMixed: 'mixed',
    detailLabel: 'Detail',
    detailShort: 'short',
    detailNormal: 'normal',
    detailDetailed: 'detailed',
    configLoading: 'Loading configuration…',
    connected: 'PaintPilot: connected',
    disconnected: 'PaintPilot: disconnected',
    ffmpegChecking: 'FFmpeg: checking…',
    ffmpegReady: 'FFmpeg: ready',
    ffmpegNotFound: 'FFmpeg: not found',
    ffmpegLaunchError: 'FFmpeg: launch error',
    ffmpegCheckUnavailable: 'FFmpeg: check unavailable',
    ffmpegPathDetecting: 'FFmpeg path: detecting…',
    ffmpegPath: 'FFmpeg path: {value}',
    ffmpegPathUnavailable: 'FFmpeg path: check unavailable',
    photoshopWindowChecking: 'Photoshop window: checking…',
    photoshopWindowReady: 'Photoshop window: found',
    photoshopWindowNotFound: 'Photoshop window: not found',
    photoshopWindowCheckError: 'Photoshop window: check failed',
    photoshopWindowCheckUnavailable: 'Photoshop window: check unavailable',
    unknown: 'unknown',
    notFound: 'not found',
    sourceRuntime: 'saved in PaintPilot',
    sourceEnvironment: 'from environment',
    sourceDefault: 'default',
    recordingOn: 'Recording enabled',
    recordingOff: 'Recording disabled',
    photoshopWindowAutomatic: 'Photoshop window is detected automatically',
    recordingUnavailable: 'Recording setting unavailable: {error}',
    recordingEnabling: 'Enabling recording…',
    recordingDisabling: 'Disabling recording…',
    recordingChangeFailed: 'Could not change setting: {error}',
    configWarning: 'Warning: {warning}',
    configSaved: 'Saved',
    configLoaded: 'Configuration loaded',
    activeRunApplied: ' · applied to active run',
    configUnavailable: 'Configuration unavailable: {error}',
    configSaving: 'Saving…',
    configSaveFailed: 'Could not save: {error} · previous value restored',
  },
  ru: {
    videoLabel: 'Включить видеозапись',
    videoLoading: 'Состояние записи загружается…',
    configTitle: 'Конфигурация',
    languageLabel: 'Язык отчётов',
    languageAuto: 'авто',
    languageRu: 'русский',
    languageEn: 'английский',
    commentaryLabel: 'Комментарий',
    commentaryTechnical: 'технический',
    commentaryArtistic: 'художественный',
    commentaryMixed: 'смешанный',
    detailLabel: 'Детализация',
    detailShort: 'коротко',
    detailNormal: 'обычно',
    detailDetailed: 'подробно',
    configLoading: 'Конфигурация загружается…',
    connected: 'PaintPilot: подключен',
    disconnected: 'PaintPilot: отключен',
    ffmpegChecking: 'FFmpeg: проверка…',
    ffmpegReady: 'FFmpeg: готов',
    ffmpegNotFound: 'FFmpeg: не найден',
    ffmpegLaunchError: 'FFmpeg: ошибка запуска',
    ffmpegCheckUnavailable: 'FFmpeg: проверка недоступна',
    ffmpegPathDetecting: 'Путь FFmpeg: определение…',
    ffmpegPath: 'Путь FFmpeg: {value}',
    ffmpegPathUnavailable: 'Путь FFmpeg: проверка недоступна',
    photoshopWindowChecking: 'Окно Photoshop: проверка…',
    photoshopWindowReady: 'Окно Photoshop: найдено',
    photoshopWindowNotFound: 'Окно Photoshop: не найдено',
    photoshopWindowCheckError: 'Окно Photoshop: ошибка проверки',
    photoshopWindowCheckUnavailable: 'Окно Photoshop: проверка недоступна',
    unknown: 'неизвестен',
    notFound: 'не найден',
    sourceRuntime: 'сохранено в PaintPilot',
    sourceEnvironment: 'из environment',
    sourceDefault: 'по умолчанию',
    recordingOn: 'Запись включена',
    recordingOff: 'Запись выключена',
    photoshopWindowAutomatic: 'окно Photoshop определяется автоматически',
    recordingUnavailable: 'Настройка записи недоступна: {error}',
    recordingEnabling: 'Включаю запись…',
    recordingDisabling: 'Выключаю запись…',
    recordingChangeFailed: 'Не удалось изменить настройку: {error}',
    configWarning: 'Предупреждение: {warning}',
    configSaved: 'Сохранено',
    configLoaded: 'Конфигурация загружена',
    activeRunApplied: ' · применено к активному run',
    configUnavailable: 'Настройки конфигурации недоступны: {error}',
    configSaving: 'Сохраняю…',
    configSaveFailed: 'Не удалось сохранить: {error} · прежнее значение восстановлено',
  },
};

function uiText(key, values = {}) {
  const table = UI_COPY[PANEL_LANGUAGE] ?? UI_COPY.en;
  let text = table[key] ?? UI_COPY.en[key] ?? key;
  for (const [name, value] of Object.entries(values)) {
    text = text.split('{' + name + '}').join(String(value));
  }
  return text;
}

function applyPanelLocale() {
  const dom = typeof document !== 'undefined' ? document : null;
  if (!dom) return;
  if (dom.documentElement) dom.documentElement.lang = PANEL_LANGUAGE;
  const labels = {
    videoTraceLabel: 'videoLabel',
    videoTraceStatus: 'videoLoading',
    userConfigTitle: 'configTitle',
    userConfigLanguageLabel: 'languageLabel',
    userConfigLanguageAuto: 'languageAuto',
    userConfigLanguageRu: 'languageRu',
    userConfigLanguageEn: 'languageEn',
    userConfigCommentaryModeLabel: 'commentaryLabel',
    userConfigCommentaryTechnical: 'commentaryTechnical',
    userConfigCommentaryArtistic: 'commentaryArtistic',
    userConfigCommentaryMixed: 'commentaryMixed',
    userConfigCommentaryDetailLabel: 'detailLabel',
    userConfigDetailShort: 'detailShort',
    userConfigDetailNormal: 'detailNormal',
    userConfigDetailDetailed: 'detailDetailed',
    userConfigStatus: 'configLoading',
    ffmpegStatus: 'ffmpegChecking',
    ffmpegPath: 'ffmpegPathDetecting',
    photoshopWindowStatus: 'photoshopWindowChecking',
  };
  for (const [id, key] of Object.entries(labels)) {
    const element = dom.getElementById(id);
    if (element) element.textContent = uiText(key);
  }
}

let polling = false;
let bridgeUiConnected = false;
let videoTraceUiBound = false;
let videoTraceUpdateInFlight = false;
let userConfigUiBound = false;
let userConfigUpdateInFlight = false;
let lastUserConfigDocumentId = null;
let lastUserConfigEffective = {
  language: 'auto',
  commentary_mode: 'mixed',
  commentary_detail: 'normal',
};
let closeNotificationBound = false;
const pendingResultDeliveries = new Map();
const recentDocumentWitnesses = new Map();
const controlledCloseCommands = new Map();
const RESULT_DELIVERY_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_RESULT_DELIVERIES = 128;
const CONTROLLED_CLOSE_TTL_MS = 10_000;

function bridgeUiElements() {
  // Unit/vm harnesses load the bridge transport code without a UXP DOM. The
  // panel is optional presentation, so absence of document must be a clean
  // no-op rather than preventing transport/geometry/bootstrap helpers from
  // loading.
  const dom = typeof document !== 'undefined' ? document : null;
  return {
    dot: dom?.getElementById('bridgeStatusDot') ?? null,
    text: dom?.getElementById('bridgeStatusText') ?? null,
    checkbox: dom?.getElementById('videoTraceEnabled') ?? null,
    status: dom?.getElementById('videoTraceStatus') ?? null,
    ffmpegStatus: dom?.getElementById('ffmpegStatus') ?? null,
    ffmpegPath: dom?.getElementById('ffmpegPath') ?? null,
    photoshopWindowStatus: dom?.getElementById('photoshopWindowStatus') ?? null,
    userConfigLanguage: dom?.getElementById('userConfigLanguage') ?? null,
    userConfigCommentaryMode: dom?.getElementById('userConfigCommentaryMode') ?? null,
    userConfigCommentaryDetail: dom?.getElementById('userConfigCommentaryDetail') ?? null,
    userConfigStatus: dom?.getElementById('userConfigStatus') ?? null,
  };
}

function setReadinessText(element, text, ok) {
  if (!element) return;
  element.textContent = text;
  element.className = ok ? 'ready' : 'error';
}

async function refreshVideoTraceReadiness() {
  const { ffmpegStatus, ffmpegPath, photoshopWindowStatus } = bridgeUiElements();
  if (!ffmpegStatus || !photoshopWindowStatus) return;
  ffmpegStatus.textContent = uiText('ffmpegChecking');
  ffmpegStatus.className = '';
  if (ffmpegPath) {
    ffmpegPath.textContent = uiText('ffmpegPathDetecting');
    ffmpegPath.className = '';
  }
  photoshopWindowStatus.textContent = uiText('photoshopWindowChecking');
  photoshopWindowStatus.className = '';
  try {
    const response = await fetch(`${BRIDGE_BASE}/settings/process-video-trace/readiness`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    const ffmpegState = state?.ffmpeg?.status;
    if (ffmpegState === 'ready') {
      setReadinessText(ffmpegStatus, uiText('ffmpegReady'), true);
      if (ffmpegPath) {
        ffmpegPath.textContent = uiText('ffmpegPath', { value: state?.ffmpeg?.executable ?? uiText('unknown') });
        ffmpegPath.className = 'ready';
      }
    } else if (ffmpegState === 'not-found') {
      setReadinessText(ffmpegStatus, uiText('ffmpegNotFound'), false);
      if (ffmpegPath) setReadinessText(ffmpegPath, uiText('ffmpegPath', { value: state?.ffmpeg?.executable ?? uiText('notFound') }), false);
    } else {
      setReadinessText(ffmpegStatus, uiText('ffmpegLaunchError'), false);
      if (ffmpegPath) setReadinessText(ffmpegPath, uiText('ffmpegPath', { value: state?.ffmpeg?.executable ?? uiText('unknown') }), false);
    }
    const windowState = state?.photoshop_window?.status;
    if (windowState === 'ready') {
      setReadinessText(photoshopWindowStatus, uiText('photoshopWindowReady'), true);
    } else if (windowState === 'not-found') {
      setReadinessText(photoshopWindowStatus, uiText('photoshopWindowNotFound'), false);
    } else {
      setReadinessText(photoshopWindowStatus, uiText('photoshopWindowCheckError'), false);
    }
  } catch (error) {
    setReadinessText(ffmpegStatus, uiText('ffmpegCheckUnavailable'), false);
    if (ffmpegPath) setReadinessText(ffmpegPath, uiText('ffmpegPathUnavailable'), false);
    setReadinessText(photoshopWindowStatus, uiText('photoshopWindowCheckUnavailable'), false);
  }
}

function setBridgeUiConnected(connected) {
  bridgeUiConnected = connected;
  const {
    dot,
    text,
    checkbox,
    userConfigLanguage,
    userConfigCommentaryMode,
    userConfigCommentaryDetail,
  } = bridgeUiElements();
  if (dot) dot.className = connected ? 'dot connected' : 'dot';
  if (text) text.textContent = connected ? uiText('connected') : uiText('disconnected');
  if (checkbox && !videoTraceUpdateInFlight) checkbox.disabled = !connected;
  if (!userConfigUpdateInFlight) {
    for (const select of [userConfigLanguage, userConfigCommentaryMode, userConfigCommentaryDetail]) {
      if (select) select.disabled = !connected;
    }
  }
}

function videoTraceSourceLabel(source) {
  if (source === 'runtime') return uiText('sourceRuntime');
  if (source === 'environment') return uiText('sourceEnvironment');
  return uiText('sourceDefault');
}

async function refreshVideoTraceSetting() {
  const { checkbox, status } = bridgeUiElements();
  if (!checkbox || !status) return;
  try {
    const response = await fetch(`${BRIDGE_BASE}/settings/process-video-trace`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    checkbox.checked = state?.enabled === true;
    checkbox.disabled = false;
    const mode = checkbox.checked ? uiText('recordingOn') : uiText('recordingOff');
    status.textContent = `${mode} · ${videoTraceSourceLabel(state?.source)} · ${uiText('photoshopWindowAutomatic')}`;
  } catch (error) {
    checkbox.disabled = true;
    status.textContent = uiText('recordingUnavailable', { error: error?.message ?? String(error) });
  }
}

async function updateVideoTraceSetting(enabled) {
  const { checkbox, status } = bridgeUiElements();
  if (!checkbox || !status || videoTraceUpdateInFlight) return;
  videoTraceUpdateInFlight = true;
  checkbox.disabled = true;
  status.textContent = enabled ? uiText('recordingEnabling') : uiText('recordingDisabling');
  try {
    const response = await fetch(`${BRIDGE_BASE}/settings/process-video-trace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    checkbox.checked = state?.enabled === true;
    status.textContent = `${checkbox.checked ? uiText('recordingOn') : uiText('recordingOff')} · ${uiText('sourceRuntime')} · ${uiText('photoshopWindowAutomatic')}`;
    await refreshVideoTraceReadiness();
  } catch (error) {
    status.textContent = uiText('recordingChangeFailed', { error: error?.message ?? String(error) });
    await refreshVideoTraceSetting();
  } finally {
    videoTraceUpdateInFlight = false;
    checkbox.disabled = !bridgeUiConnected;
  }
}

function setUserConfigControlsDisabled(disabled) {
  const {
    userConfigLanguage,
    userConfigCommentaryMode,
    userConfigCommentaryDetail,
  } = bridgeUiElements();
  for (const select of [userConfigLanguage, userConfigCommentaryMode, userConfigCommentaryDetail]) {
    if (select) select.disabled = disabled;
  }
}

function applyUserConfigState(state, saved = false) {
  const {
    userConfigLanguage,
    userConfigCommentaryMode,
    userConfigCommentaryDetail,
    userConfigStatus,
  } = bridgeUiElements();
  const effective = state?.effective ?? {};
  if (userConfigLanguage && ['auto', 'ru', 'en'].includes(effective.language)) {
    userConfigLanguage.value = effective.language;
  }
  if (userConfigCommentaryMode && ['technical', 'artistic', 'mixed'].includes(effective.commentary_mode)) {
    userConfigCommentaryMode.value = effective.commentary_mode;
  }
  if (userConfigCommentaryDetail && ['short', 'normal', 'detailed'].includes(effective.commentary_detail)) {
    userConfigCommentaryDetail.value = effective.commentary_detail;
  }
  lastUserConfigEffective = {
    language: userConfigLanguage?.value ?? lastUserConfigEffective.language,
    commentary_mode: userConfigCommentaryMode?.value ?? lastUserConfigEffective.commentary_mode,
    commentary_detail: userConfigCommentaryDetail?.value ?? lastUserConfigEffective.commentary_detail,
  };
  if (!userConfigStatus) return;
  const warnings = Array.isArray(state?.warnings) ? state.warnings.filter(Boolean) : [];
  if (warnings.length) {
    userConfigStatus.textContent = uiText('configWarning', { warning: warnings.join('; ') });
    userConfigStatus.className = 'detail config-status error';
    return;
  }
  const sources = state?.sources ?? {};
  const sticky = sources.commentary_mode === 'art_run' || sources.commentary_detail === 'art_run';
  userConfigStatus.textContent = (saved ? uiText('configSaved') : uiText('configLoaded')) + (sticky ? uiText('activeRunApplied') : '');
  userConfigStatus.className = 'detail config-status';
}

async function readUserConfigResponse(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error ?? ('HTTP ' + response.status));
  }
  return payload;
}

async function refreshUserConfig() {
  const { userConfigStatus } = bridgeUiElements();
  try {
    const response = await fetch(BRIDGE_BASE + '/settings/user-config');
    const state = await readUserConfigResponse(response);
    applyUserConfigState(state);
    setUserConfigControlsDisabled(!bridgeUiConnected);
  } catch (error) {
    setUserConfigControlsDisabled(true);
    if (userConfigStatus) {
      userConfigStatus.textContent = uiText('configUnavailable', { error: error?.message ?? String(error) });
      userConfigStatus.className = 'detail config-status error';
    }
  }
}

async function updateUserConfigSetting(field, value) {
  if (userConfigUpdateInFlight) return;
  const elements = bridgeUiElements();
  const selectByField = {
    language: elements.userConfigLanguage,
    commentary_mode: elements.userConfigCommentaryMode,
    commentary_detail: elements.userConfigCommentaryDetail,
  };
  const select = selectByField[field];
  if (!select) return;
  const previous = lastUserConfigEffective[field];
  userConfigUpdateInFlight = true;
  setUserConfigControlsDisabled(true);
  if (elements.userConfigStatus) {
    elements.userConfigStatus.textContent = uiText('configSaving');
    elements.userConfigStatus.className = 'detail config-status';
  }
  try {
    const response = await fetch(BRIDGE_BASE + '/settings/user-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    const state = await readUserConfigResponse(response);
    applyUserConfigState(state, true);
  } catch (error) {
    select.value = previous;
    if (elements.userConfigStatus) {
      elements.userConfigStatus.textContent = uiText('configSaveFailed', { error: error?.message ?? String(error) });
      elements.userConfigStatus.className = 'detail config-status error';
    }
  } finally {
    userConfigUpdateInFlight = false;
    setUserConfigControlsDisabled(!bridgeUiConnected);
  }
}

function setupBridgePanelUi() {
  applyPanelLocale();
  const {
    checkbox,
    userConfigLanguage,
    userConfigCommentaryMode,
    userConfigCommentaryDetail,
  } = bridgeUiElements();
  if (!checkbox && !userConfigLanguage && !userConfigCommentaryMode && !userConfigCommentaryDetail) return;
  if (checkbox && !videoTraceUiBound) {
    checkbox.addEventListener('change', () => updateVideoTraceSetting(checkbox.checked));
    videoTraceUiBound = true;
  }
  if (!userConfigUiBound && userConfigLanguage && userConfigCommentaryMode && userConfigCommentaryDetail) {
    userConfigLanguage.addEventListener('change', () => updateUserConfigSetting('language', userConfigLanguage.value));
    userConfigCommentaryMode.addEventListener('change', () => updateUserConfigSetting('commentary_mode', userConfigCommentaryMode.value));
    userConfigCommentaryDetail.addEventListener('change', () => updateUserConfigSetting('commentary_detail', userConfigCommentaryDetail.value));
    userConfigUiBound = true;
  }
  setBridgeUiConnected(bridgeUiConnected);
  if (checkbox) {
    refreshVideoTraceSetting();
    refreshVideoTraceReadiness();
  }
  refreshUserConfig();
}

// A Document DOM object represents one live open-document instance. Keep an
// opaque per-object witness inside the long-lived UXP plugin process so a
// recycled numeric documentID cannot inherit Guard state from a closed document.
// The session id deliberately changes on plugin reload; Guard treats that loss
// of continuity fail-closed rather than assuming two same-numbered documents
// are identical.
const DOCUMENT_WITNESS_SESSION_ID =
  `uxp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const documentInstanceWitnesses = new WeakMap();
let documentInstanceWitnessSequence = 0;

function documentInstanceWitness(documentId) {
  if (!Number.isSafeInteger(documentId) || documentId <= 0) return null;
  let target = null;
  try {
    for (const candidate of app.documents) {
      if (Number(candidate?.id) === documentId) {
        target = candidate;
        break;
      }
    }
  } catch {
    return null;
  }
  if (!target || (typeof target !== 'object' && typeof target !== 'function')) return null;
  let token = documentInstanceWitnesses.get(target);
  if (!token) {
    documentInstanceWitnessSequence += 1;
    token = `${DOCUMENT_WITNESS_SESSION_ID}:${documentInstanceWitnessSequence}`;
    documentInstanceWitnesses.set(target, token);
  }
  const witness = {
    protocol: 'photoshop.uxp.document_instance_witness.v1',
    session_id: DOCUMENT_WITNESS_SESSION_ID,
    token,
  };
  recentDocumentWitnesses.set(documentId, witness);
  return witness;
}

function cleanupControlledCloseCommands(now = Date.now()) {
  for (const [documentId, value] of controlledCloseCommands) {
    if (!value || value.expires_at <= now) controlledCloseCommands.delete(documentId);
  }
}

function markControlledClose(documentId, commandId) {
  if (!Number.isSafeInteger(documentId) || documentId <= 0) return;
  cleanupControlledCloseCommands();
  controlledCloseCommands.set(documentId, {
    command_id: commandId,
    expires_at: Date.now() + CONTROLLED_CLOSE_TTL_MS,
  });
}

function takeControlledClose(documentId) {
  cleanupControlledCloseCommands();
  const value = controlledCloseCommands.get(documentId) ?? null;
  if (value) controlledCloseCommands.delete(documentId);
  return value;
}

function closeEventDocumentId(descriptor) {
  const candidates = [
    descriptor?.documentID,
    descriptor?.documentId,
    descriptor?.ID,
    descriptor?._target?.[0]?._id,
  ];
  for (const value of candidates) {
    const id = numericValue(value);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return null;
}

async function postBridgeEvent(payload) {
  try {
    await fetch(`${BRIDGE_BASE}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // The Guard also has a fresh list_documents fallback on its next status/cycle.
  }
}

async function onPhotoshopNotification(eventName, descriptor) {
  const normalizedEvent = typeof eventName === 'string'
    ? eventName
    : String(eventName?.event ?? eventName?.name ?? '');
  if (normalizedEvent === 'imageSize') {
    const documentId = closeEventDocumentId(descriptor);
    if (!documentId) return;
    await postBridgeEvent({
      protocol: EVENT_PROTOCOL,
      event: 'document_geometry_changed',
      document_id: documentId,
      observed_at: new Date().toISOString(),
    });
    return;
  }
  if (normalizedEvent !== 'close') return;
  const documentId = closeEventDocumentId(descriptor);
  if (!documentId) return;
  const controlled = takeControlledClose(documentId);
  const witness = recentDocumentWitnesses.get(documentId) ?? null;
  await postBridgeEvent({
    protocol: EVENT_PROTOCOL,
    event: 'document_closed',
    document_id: documentId,
    observed_at: new Date().toISOString(),
    controlled: !!controlled,
    ...(controlled?.command_id ? { command_id: controlled.command_id } : {}),
    ...(witness ? { document_instance_witness: witness } : {}),
  });
  recentDocumentWitnesses.delete(documentId);
}

function setupPhotoshopNotifications() {
  if (closeNotificationBound) return;
  try {
    const pending = action.addNotificationListener(['close', 'imageSize'], onPhotoshopNotification);
    closeNotificationBound = true;
    if (pending && typeof pending.catch === 'function') {
      pending.catch(() => { closeNotificationBound = false; });
    }
  } catch {
    closeNotificationBound = false;
  }
}

function fileUrlFromNativePath(nativePath, operation = 'save_document') {
  if (typeof nativePath !== 'string' || nativePath.trim().length === 0) {
    throw new Error(`${operation} requires a non-empty absolute path`);
  }
  let normalized = nativePath.trim().replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalized)) normalized = `/${normalized}`;
  if (!normalized.startsWith('/')) {
    throw new Error(`${operation} requires an absolute path: ${nativePath}`);
  }
  return `file:${encodeURI(normalized)}`;
}

function normalizedBounds(bounds) {
  if (!bounds) return null;
  return {
    left: numericValue(bounds.left),
    top: numericValue(bounds.top),
    right: numericValue(bounds.right),
    bottom: numericValue(bounds.bottom),
  };
}

function numericValue(value) {
  if (typeof value === 'number') return value;
  if (value && typeof value._value === 'number') return value._value;
  if (value && typeof value.value === 'number') return value.value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

// Action Manager document dimensions may be points even when callers use pixels.
// Never apply this conversion to unitless ids, opacity, or Imaging API sizes.
function documentPixelDimension(value, resolution) {
  const number = numericValue(value);
  if (number == null) return undefined;
  const unit = value && typeof value === 'object' ? value._unit : undefined;
  if (!unit || unit === 'pixelsUnit') return number;
  const dpi = numericValue(resolution);
  if (!(dpi > 0)) throw new Error('document dimension requires a positive resolution');
  // Photoshop uses distanceUnit for document lengths in some descriptors. Its
  // base value is points (72 per inch), just like an explicit pointsUnit.
  if (unit === 'pointsUnit' || unit === 'distanceUnit') return number * dpi / 72;
  if (unit === 'inchesUnit') return number * dpi;
  if (unit === 'centimetersUnit') return number * dpi / 2.54;
  if (unit === 'millimetersUnit') return number * dpi / 25.4;
  throw new Error(`Unsupported document dimension unit: ${unit}`);
}

function descriptorValue(value) {
  if (value && typeof value === 'object' && '_value' in value) {
    return value._value;
  }
  return value;
}

function legacyEnum(prefix, value) {
  if (value == null) return undefined;
  const raw = String(descriptorValue(value));
  if (prefix === 'LayerKind' && raw.toUpperCase() === 'LAYERKIND.PIXEL') {
    return 'LayerKind.NORMAL';
  }
  if (raw.startsWith(`${prefix}.`)) return raw;
  if (prefix === 'LayerKind' && raw.toLowerCase() === 'pixel') {
    return 'LayerKind.NORMAL';
  }
  const token = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1$2')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  return token ? `${prefix}.${token}` : undefined;
}

function legacyDocumentMode(value) {
  const raw = String(value ?? '');
  if (raw.startsWith('DocumentMode.')) return raw;
  const key = raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const aliases = {
    rgb: 'RGB',
    rgbcolor: 'RGB',
    rgbcolormode: 'RGB',
    cmyk: 'CMYK',
    cmykcolor: 'CMYK',
    cmykcolormode: 'CMYK',
    grayscale: 'GRAYSCALE',
    grayscalemode: 'GRAYSCALE',
    bitmap: 'BITMAP',
    bitmapmode: 'BITMAP',
    lab: 'LAB',
    labcolormode: 'LAB',
    indexedcolor: 'INDEXEDCOLOR',
    indexedcolormode: 'INDEXEDCOLOR',
    duotone: 'DUOTONE',
    duotonemode: 'DUOTONE',
    multichannel: 'MULTICHANNEL',
    multichannelmode: 'MULTICHANNEL',
  };
  const token = aliases[key] || key.toUpperCase();
  return token ? `DocumentMode.${token}` : undefined;
}

function legacyOpacity(value) {
  if (value && typeof value === 'object' && value._unit === 'percentUnit') {
    return numericValue(value);
  }
  const numeric = numericValue(value);
  if (numeric == null) return undefined;
  if (numeric > 100 && numeric <= 255) return (numeric * 100) / 255;
  return numeric;
}

function adjustmentObjectName(adjustment) {
  const queue = Array.isArray(adjustment) ? [...adjustment] : [adjustment];
  while (queue.length > 0) {
    const value = queue.shift();
    if (!value || typeof value !== 'object') continue;
    if (typeof value._obj === 'string') return value._obj;
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === 'object') queue.push(nested);
    }
  }
  return null;
}

function legacyLayerKind(layerDescriptor) {
  const rawKind = descriptorValue(layerDescriptor?.layerKind ?? layerDescriptor?.kind);
  const numericKind = numericValue(rawKind);
  const adjustmentKinds = {
    brightnessContrast: 'BRIGHTNESSCONTRAST',
    levels: 'LEVELS',
    curves: 'CURVES',
    exposure: 'EXPOSURE',
    vibrance: 'VIBRANCE',
    hueSaturation: 'HUESATURATION',
    colorBalance: 'COLORBALANCE',
    blackAndWhite: 'BLACKANDWHITE',
    photoFilter: 'PHOTOFILTER',
    channelMixer: 'CHANNELMIXER',
    colorLookup: 'COLORLOOKUP',
    invert: 'INVERSION',
    inversion: 'INVERSION',
    posterization: 'POSTERIZE',
    posterize: 'POSTERIZE',
    thresholdClassEvent: 'THRESHOLD',
    threshold: 'THRESHOLD',
    selectiveColor: 'SELECTIVECOLOR',
    gradientMapClass: 'GRADIENTMAP',
    gradientMap: 'GRADIENTMAP',
  };

  if (numericKind === 2) {
    const adjustmentName = adjustmentObjectName(layerDescriptor?.adjustment);
    const token = adjustmentName ? adjustmentKinds[adjustmentName] : undefined;
    return token ? `LayerKind.${token}` : undefined;
  }

  const numericMap = {
    1: 'NORMAL',
    3: 'TEXT',
    4: 'SOLIDFILL',
    5: 'SMARTOBJECT',
    6: 'VIDEO',
    8: 'LAYER3D',
    9: 'GRADIENTFILL',
    10: 'PATTERNFILL',
    11: 'SOLIDFILL',
    12: 'NORMAL',
  };
  if (numericKind != null && numericMap[numericKind]) {
    return `LayerKind.${numericMap[numericKind]}`;
  }

  if (typeof rawKind === 'string') {
    const stringMap = {
      pixel: 'NORMAL',
      text: 'TEXT',
      vector: 'SOLIDFILL',
      smartObject: 'SMARTOBJECT',
      video: 'VIDEO',
      threeD: 'LAYER3D',
      gradient: 'GRADIENTFILL',
      pattern: 'PATTERNFILL',
      solidColor: 'SOLIDFILL',
      background: 'NORMAL',
    };
    const token = stringMap[rawKind];
    if (token) return `LayerKind.${token}`;
  }

  // Action Manager kinds 7/13 are layer-set boundaries. ExtendScript's
  // getContextInfo() falls through to activeLayer=null for LayerSet because
  // LayerSet has no ArtLayer.kind property, so preserve that legacy behavior.
  return undefined;
}

const READ_BATCHPLAY_OPTIONS = {
  synchronousExecution: true,
  modalBehavior: 'fail',
};

function getNumberOfDocumentsDescriptor() {
  return {
    _obj: 'get',
    _target: [
      { _property: 'numberOfDocuments' },
      { _ref: 'application', _enum: 'ordinal', _value: 'targetEnum' },
    ],
    _options: { dialogOptions: 'dontDisplay' },
  };
}

function stateMultiGetDescriptors() {
  return [
    {
      _obj: 'multiGet',
      _target: {
        _ref: [{ _ref: 'document', _enum: 'ordinal', _value: 'targetEnum' }],
      },
      extendedReference: [[
        'documentID',
        'title',
        'width',
        'height',
        'resolution',
        'mode',
        'numberOfLayers',
        'hasBackgroundLayer',
        'selection',
      ]],
      options: { failOnMissingProperty: false, failOnMissingElement: false },
      _options: { dialogOptions: 'dontDisplay' },
    },
    {
      _obj: 'multiGet',
      _target: {
        _ref: [
          { _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' },
          { _ref: 'document', _enum: 'ordinal', _value: 'targetEnum' },
        ],
      },
      extendedReference: [[
        'name',
        'layerKind',
        'adjustment',
        'opacity',
        'mode',
        'visible',
        'layerLocking',
        'background',
        'bounds',
      ]],
      options: { failOnMissingProperty: false, failOnMissingElement: false },
      _options: { dialogOptions: 'dontDisplay' },
    },
  ];
}

async function readSessionDescriptors(batchOptions = READ_BATCHPLAY_OPTIONS) {
  const countResult = await action.batchPlay(
    [getNumberOfDocumentsDescriptor()],
    batchOptions
  );
  const countDescriptor = countResult?.[0] ?? {};
  const documentCount = numericValue(countDescriptor.numberOfDocuments) ?? 0;
  if (documentCount <= 0) {
    return { documentCount: 0, countDescriptor, documentDescriptor: null, layerDescriptor: null };
  }

  const stateResult = await action.batchPlay(
    stateMultiGetDescriptors(),
    batchOptions
  );
  return {
    documentCount,
    countDescriptor,
    documentDescriptor: stateResult?.[0] ?? null,
    layerDescriptor: stateResult?.[1] ?? null,
  };
}

function normalizeSessionState(descriptors) {
  const context = {
    hasDocument: descriptors.documentCount > 0,
  };

  if (!context.hasDocument) return context;

  const docDescriptor = descriptors.documentDescriptor ?? {};
  const document = {};
  const documentId = numericValue(docDescriptor.documentID);
  if (documentId != null) {
    document.id = documentId;
    const instanceWitness = documentInstanceWitness(documentId);
    if (instanceWitness) document.instanceWitness = instanceWitness;
  }
  if (typeof docDescriptor.title === 'string') document.name = docDescriptor.title;
  const width = documentPixelDimension(docDescriptor.width, docDescriptor.resolution);
  if (width != null) document.width = width;
  const height = documentPixelDimension(docDescriptor.height, docDescriptor.resolution);
  if (height != null) document.height = height;
  const resolution = numericValue(docDescriptor.resolution);
  if (resolution != null) document.resolution = resolution;
  const colorMode = legacyDocumentMode(descriptorValue(docDescriptor.mode));
  if (colorMode) document.colorMode = colorMode;
  const actionManagerLayerCount = numericValue(docDescriptor.numberOfLayers);
  if (actionManagerLayerCount != null) {
    // Action Manager's numberOfLayers excludes the background layer while
    // ExtendScript's doc.layers.length includes it. Preserve the public
    // photoshop_get_state legacy contract.
    document.layerCount =
      actionManagerLayerCount + (docDescriptor.hasBackgroundLayer === true ? 1 : 0);
  }
  document.hasSelection =
    Object.prototype.hasOwnProperty.call(docDescriptor, 'selection') &&
    docDescriptor.selection != null;
  context.document = document;

  const layerDescriptor = descriptors.layerDescriptor;
  const kind = legacyLayerKind(layerDescriptor);
  if (!layerDescriptor || !kind) {
    context.activeLayer = null;
    return context;
  }

  const activeLayer = {};
  const activeLayerId = numericValue(layerDescriptor.layerID);
  if (activeLayerId != null) activeLayer.id = activeLayerId;
  if (typeof layerDescriptor.name === 'string') activeLayer.name = layerDescriptor.name;
  activeLayer.kind = kind;
  const opacity = legacyOpacity(layerDescriptor.opacity);
  if (opacity != null) activeLayer.opacity = opacity;
  const blendMode = legacyEnum('BlendMode', layerDescriptor.mode);
  if (blendMode) activeLayer.blendMode = blendMode;
  if (typeof layerDescriptor.visible === 'boolean') activeLayer.visible = layerDescriptor.visible;
  const locking = layerDescriptor.layerLocking;
  activeLayer.locked = Boolean(
    locking && typeof locking === 'object'
      ? locking.protectAll ?? locking.allLocked
      : layerDescriptor.allLocked ?? layerDescriptor.locked
  );
  activeLayer.isBackground = Boolean(layerDescriptor.background);
  const bounds = normalizedBounds(layerDescriptor.bounds);
  if (bounds && Object.values(bounds).every((value) => value != null)) {
    activeLayer.bounds = bounds;
  }
  context.activeLayer = activeLayer;
  return context;
}

async function snapshotSessionState() {
  return normalizeSessionState(await readSessionDescriptors());
}

function documentInfoDescriptor(index) {
  return {
    _obj: 'multiGet',
    _target: {
      _ref: [{ _ref: 'document', _index: index }],
    },
    extendedReference: [[
      'documentID',
      'title',
      'width',
      'height',
      'resolution',
    ]],
    options: { failOnMissingProperty: false, failOnMissingElement: false },
    _options: { dialogOptions: 'dontDisplay' },
  };
}

async function snapshotDocumentList() {
  const sessionDescriptors = await readSessionDescriptors();
  const context = normalizeSessionState(sessionDescriptors);
  const documentCount = sessionDescriptors.documentCount;
  if (documentCount <= 0) {
    return {
      ok: true,
      count: 0,
      documents: [],
      active_document_id: null,
      context,
    };
  }

  const activeDocumentId = numericValue(sessionDescriptors.documentDescriptor?.documentID) ?? null;
  const descriptors = await action.batchPlay(
    Array.from({ length: documentCount }, (_, index) => documentInfoDescriptor(index + 1)),
    READ_BATCHPLAY_OPTIONS
  );
  const documents = descriptors.map((descriptor) => {
    const entry = {
      is_active: false,
    };
    const id = numericValue(descriptor?.documentID);
    if (id != null) entry.id = id;
    if (typeof descriptor?.title === 'string') entry.name = descriptor.title;
    const width = documentPixelDimension(descriptor?.width, descriptor?.resolution);
    if (width != null) entry.width = width;
    const height = documentPixelDimension(descriptor?.height, descriptor?.resolution);
    if (height != null) entry.height = height;
    const resolution = numericValue(descriptor?.resolution);
    if (resolution != null) entry.resolution = resolution;
    entry.is_active = id != null && activeDocumentId != null && id === activeDocumentId;
    return entry;
  });

  return {
    ok: true,
    count: documents.length,
    documents,
    active_document_id: activeDocumentId,
    context,
  };
}

function normalizeSelectionBounds(selection) {
  if (!selection || typeof selection !== 'object') return null;
  const bounds = {
    left: numericValue(selection.left),
    top: numericValue(selection.top),
    right: numericValue(selection.right),
    bottom: numericValue(selection.bottom),
  };
  return Object.values(bounds).every((value) => value != null) ? bounds : null;
}

async function snapshotSelectionBounds(batchOptions = READ_BATCHPLAY_OPTIONS) {
  const descriptors = await readSessionDescriptors(batchOptions);
  if (descriptors.documentCount <= 0) {
    return { ok: false, code: 'no_document', message: 'No active document' };
  }

  const context = normalizeSessionState(descriptors);
  const selection = descriptors.documentDescriptor?.selection;
  if (selection == null) {
    return {
      ok: true,
      has_selection: false,
      context,
    };
  }

  const bounds = normalizeSelectionBounds(selection);
  if (!bounds) {
    return {
      ok: false,
      code: 'selection_bounds_error',
      message: 'Failed to read selection bounds',
    };
  }

  return {
    ok: true,
    has_selection: true,
    bounds,
    context,
  };
}

function layerByIndexDescriptor(index) {
  return {
    _obj: 'get',
    _target: [
      { _ref: 'layer', _index: index },
      { _ref: 'document', _enum: 'ordinal', _value: 'targetEnum' },
    ],
    _options: { dialogOptions: 'dontDisplay' },
  };
}

function layerSectionValue(descriptor) {
  return String(descriptorValue(descriptor?.layerSection) ?? '');
}

function normalizeListedLayer(descriptor, depth, pathParts, isGroup) {
  const entry = {};
  const name = typeof descriptor?.name === 'string' ? descriptor.name : '';
  entry.name = name;
  entry.typename = isGroup ? 'LayerSet' : 'ArtLayer';
  entry.depth = depth;
  entry.path = [...pathParts, name].join('/');
  if (typeof descriptor?.visible === 'boolean') entry.visible = descriptor.visible;
  const opacity = legacyOpacity(descriptor?.opacity);
  if (opacity != null) entry.opacity = opacity;
  const blendMode = legacyEnum('BlendMode', descriptor?.mode);
  if (blendMode) entry.blendMode = blendMode;
  const id = numericValue(descriptor?.layerID ?? descriptor?.layerId);
  if (id != null) entry.id = id;
  if (isGroup) {
    entry.kind = 'LayerSet';
  } else {
    const kind = legacyLayerKind(descriptor);
    entry.kind = kind ?? 'ArtLayer';
  }
  return entry;
}

async function snapshotLayerList() {
  const sessionDescriptors = await readSessionDescriptors();
  if (sessionDescriptors.documentCount <= 0) {
    throw new Error('No active document');
  }

  const docDescriptor = sessionDescriptors.documentDescriptor ?? {};
  const actionManagerLayerCount = numericValue(docDescriptor.numberOfLayers) ?? 0;
  const hasBackground = docDescriptor.hasBackgroundLayer === true;
  const firstIndex = hasBackground ? 0 : 1;
  const lastIndex = Math.max(firstIndex - 1, actionManagerLayerCount);
  const indices = [];
  for (let index = firstIndex; index <= lastIndex; index++) indices.push(index);

  const rawDescriptors = indices.length > 0
    ? await action.batchPlay(indices.map(layerByIndexDescriptor), READ_BATCHPLAY_OPTIONS)
    : [];

  // Action Manager indexes run bottom-to-top. ExtendScript's container.layers
  // iteration is top-to-bottom and recursively enters LayerSet children, so
  // reverse the AM sequence and use layerSection start/end markers as the
  // hierarchy stack. Section-end pseudo-layers are never part of the public
  // legacy result.
  const layers = [];
  const pathParts = [];
  for (const descriptor of [...rawDescriptors].reverse()) {
    if (!descriptor || descriptor._obj === 'error') continue;
    const section = layerSectionValue(descriptor);
    if (section === 'layerSectionEnd') {
      if (pathParts.length > 0) pathParts.pop();
      continue;
    }
    const isGroup = section === 'layerSectionStart';
    const depth = pathParts.length;
    const entry = normalizeListedLayer(descriptor, depth, pathParts, isGroup);
    layers.push(entry);
    if (isGroup) pathParts.push(entry.name);
  }

  return {
    layerCount: layers.length,
    layers,
    context: normalizeSessionState(sessionDescriptors),
  };
}

async function snapshotBrushPresets(params = {}) {
  const query = String(params.query ?? '').toLowerCase();
  const requestedLimit = Number(params.limit ?? 200);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(10000, Math.round(requestedLimit)))
    : 200;
  const [descriptor] = await action.batchPlay(
    [{
      _obj: 'get',
      _target: [
        { _property: 'presetManager' },
        { _ref: 'application', _enum: 'ordinal', _value: 'targetEnum' },
      ],
      _options: { dialogOptions: 'dontDisplay' },
    }],
    READ_BATCHPLAY_OPTIONS
  );

  const managers = Array.isArray(descriptor?.presetManager)
    ? descriptor.presetManager
    : [];
  let names = [];
  for (const manager of managers) {
    const managerType = String(manager?._obj ?? manager?._class ?? '');
    if (managerType !== 'brush') continue;
    if (Array.isArray(manager.name)) {
      names = manager.name.map((value) => String(descriptorValue(value)));
    }
    break;
  }

  const filtered = query
    ? names.filter((name) => name.toLowerCase().includes(query))
    : names;
  const visible = filtered.slice(0, limit);
  return {
    ok: true,
    total: names.length,
    matched: filtered.length,
    truncated: filtered.length > visible.length,
    presets: visible,
  };
}

function currentToolOptionsDescriptor() {
  return {
    _obj: 'get',
    _target: [
      { _property: 'currentToolOptions' },
      { _ref: 'application', _enum: 'ordinal', _value: 'targetEnum' },
    ],
    _options: { dialogOptions: 'dontDisplay' },
  };
}

function normalizeBrushSettingsDescriptor(descriptor) {
  const opts = descriptor?.currentToolOptions;
  const brush = opts?.brush;
  if (!opts || typeof opts !== 'object' || !brush || typeof brush !== 'object') {
    throw new Error('brush_settings_unavailable_for_current_tool');
  }

  function valueOr(value, fallback) {
    const numeric = numericValue(value);
    return numeric == null ? fallback : numeric;
  }

  const presetName = [
    brush.name,
    brush._name,
    opts.presetName,
    opts.brushPreset,
    opts.brushName,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);

  return {
    ok: true,
    ...(presetName ? { preset: presetName.trim() } : {}),
    settings: {
      size: valueOr(brush.diameter, 1),
      hardness: valueOr(brush.hardness, 100),
      angle: valueOr(brush.angle, 0),
      roundness: valueOr(brush.roundness, 100),
      spacing: valueOr(brush.spacing, 25),
      opacity: valueOr(opts.opacity, 100),
      flow: valueOr(opts.flow, 100),
      flip_x: typeof brush.flipX === 'boolean' ? brush.flipX : false,
      flip_y: typeof brush.flipY === 'boolean' ? brush.flipY : false,
      use_pressure_size:
        typeof opts.usePressureOverridesSize === 'boolean'
          ? opts.usePressureOverridesSize
          : false,
      use_pressure_opacity:
        typeof opts.usePressureOverridesOpacity === 'boolean'
          ? opts.usePressureOverridesOpacity
          : false,
      airbrush: typeof opts.repeat === 'boolean' ? opts.repeat : false,
      smoothing_enabled: typeof opts.smoothing === 'boolean' ? opts.smoothing : false,
      smoothing: valueOr(opts.smooth, 10),
    },
  };
}

async function snapshotBrushSettings(batchOptions = READ_BATCHPLAY_OPTIONS) {
  const [descriptor] = await action.batchPlay(
    [currentToolOptionsDescriptor()],
    batchOptions
  );
  return normalizeBrushSettingsDescriptor(descriptor);
}

async function snapshotBrushOptionsRaw() {
  const [descriptor] = await action.batchPlay(
    [currentToolOptionsDescriptor()],
    READ_BATCHPLAY_OPTIONS
  );
  return { currentToolOptions: descriptor?.currentToolOptions ?? null };
}

function selectPaintbrushToolDescriptor() {
  return {
    _obj: 'select',
    _target: [{ _ref: 'paintbrushTool' }],
    _options: { dialogOptions: 'silent' },
  };
}

const STROKE_TOOL_REFS = Object.freeze({
  BRUSH: 'paintbrushTool',
  PENCIL: 'pencilTool',
  SMUDGE: 'smudgeTool',
  ERASER: 'eraserTool',
});

function selectStrokeToolDescriptor(toolName) {
  const ref = STROKE_TOOL_REFS[String(toolName ?? '').toUpperCase()];
  if (!ref) throw new Error(`paint_tool_not_ready:${String(toolName)}: unsupported stroke mechanism`);
  return {
    _obj: 'select',
    _target: [{ _ref: ref }],
    _options: { dialogOptions: 'silent' },
  };
}

async function preflightStrokeToolsModal(strokes) {
  const names = [...new Set(
    strokes.map((stroke) => String(stroke?.tool ?? 'BRUSH').toUpperCase())
  )];
  const readiness = [];
  for (const name of names) {
    await action.batchPlay(
      [selectStrokeToolDescriptor(name)],
      { synchronousExecution: true }
    );
    const [descriptor] = await action.batchPlay(
      [currentToolOptionsDescriptor()],
      { synchronousExecution: true }
    );
    const options = descriptor?.currentToolOptions;
    if (!options || typeof options !== 'object') {
      throw new Error(`paint_tool_not_ready:${name}: currentToolOptions unavailable after explicit tool activation`);
    }
    if (name === 'BRUSH' && (!options.brush || typeof options.brush !== 'object')) {
      throw new Error(`paint_tool_not_ready:BRUSH: brush descriptor unavailable after explicit tool activation`);
    }
    readiness.push({
      tool: name,
      current_tool_options: true,
      brush_descriptor: Boolean(options.brush && typeof options.brush === 'object'),
    });
  }
  return readiness;
}

async function applyBrushSettingsModal(settings = {}) {
  await action.batchPlay([selectPaintbrushToolDescriptor()], { synchronousExecution: true });
  const [descriptor] = await action.batchPlay(
    [currentToolOptionsDescriptor()],
    { synchronousExecution: true }
  );
  const toolOptions = descriptor?.currentToolOptions
    ? JSON.parse(JSON.stringify(descriptor.currentToolOptions))
    : null;
  const brush = toolOptions?.brush;
  if (!toolOptions || typeof toolOptions !== 'object' || !brush || typeof brush !== 'object') {
    throw new Error('brush_settings_unavailable_for_write');
  }

  if (settings.size !== undefined) {
    brush.diameter = { _unit: 'pixelsUnit', _value: Number(settings.size) };
  }
  if (settings.hardness !== undefined) {
    // Photoshop's currentToolOptions brush descriptor exposes hardness as a
    // plain numeric value (the legacy Action Manager path also writes it as a
    // double, not a percentUnit). Supplying a unit object is accepted by
    // batchPlay but silently leaves the effective hardness unchanged.
    brush.hardness = Number(settings.hardness);
  }
  if (settings.angle !== undefined) {
    brush.angle = { _unit: 'angleUnit', _value: Number(settings.angle) };
  }
  if (settings.roundness !== undefined) {
    // Same representation rule as hardness: roundness is a plain numeric
    // value in currentToolOptions.
    brush.roundness = Number(settings.roundness);
  }
  if (settings.spacing !== undefined) {
    brush.spacing = { _unit: 'percentUnit', _value: Number(settings.spacing) };
  }
  if (settings.flip_x !== undefined) brush.flipX = Boolean(settings.flip_x);
  if (settings.flip_y !== undefined) brush.flipY = Boolean(settings.flip_y);

  if (settings.opacity !== undefined) toolOptions.opacity = Math.round(Number(settings.opacity));
  if (settings.flow !== undefined) toolOptions.flow = Math.round(Number(settings.flow));
  if (settings.use_pressure_size !== undefined) {
    toolOptions.usePressureOverridesSize = Boolean(settings.use_pressure_size);
  }
  if (settings.use_pressure_opacity !== undefined) {
    toolOptions.usePressureOverridesOpacity = Boolean(settings.use_pressure_opacity);
  }
  if (settings.airbrush !== undefined) toolOptions.repeat = Boolean(settings.airbrush);
  if (settings.smoothing_enabled !== undefined) {
    toolOptions.smoothing = Boolean(settings.smoothing_enabled);
  }
  if (settings.smoothing !== undefined) {
    const smoothing = Number(settings.smoothing);
    toolOptions.smooth = Math.round(smoothing);
    toolOptions.smoothingValue = smoothing;
  }

  await action.batchPlay(
    [{
      _obj: 'set',
      _target: [{ _ref: 'paintbrushTool' }],
      to: toolOptions,
      _options: { dialogOptions: 'silent' },
    }],
    { synchronousExecution: true }
  );
  return snapshotBrushSettings({ synchronousExecution: true });
}

async function writeBrushSettings(params = {}) {
  const settings = params.settings && typeof params.settings === 'object'
    ? params.settings
    : {};
  return core.executeAsModal(
    async () => applyBrushSettingsModal(settings),
    { commandName: 'MCP Set Brush' }
  );
}

async function selectBrushPreset(params = {}) {
  const name = String(params.name ?? '').trim();
  if (!name) throw new Error('name is required');
  return core.executeAsModal(
    async () => {
      await action.batchPlay(
        [
          {
            _obj: 'select',
            _target: [{ _ref: 'brush', _name: name }],
            _options: { dialogOptions: 'silent' },
          },
          selectPaintbrushToolDescriptor(),
        ],
        { synchronousExecution: true }
      );
      const current = await snapshotBrushSettings({ synchronousExecution: true });
      return { ok: true, preset: name, settings: current.settings };
    },
    { commandName: 'MCP Select Brush Preset' }
  );
}

async function writeForegroundColor(params = {}) {
  const red = Number(params.red);
  const green = Number(params.green);
  const blue = Number(params.blue);
  if (![red, green, blue].every(Number.isFinite)) {
    throw new Error('red, green and blue are required');
  }
  return core.executeAsModal(
    async () => {
      setForegroundColorModal({ red, green, blue });
      return { ok: true, red, green, blue };
    },
    { commandName: 'MCP Set Foreground Color' }
  );
}

function setForegroundColorModal(colorValue) {
  const color = new app.SolidColor();
  color.rgb.red = Number(colorValue.red);
  color.rgb.green = Number(colorValue.green);
  color.rgb.blue = Number(colorValue.blue);
  app.foregroundColor = color;
}

async function snapshotForegroundColor() {
  const [descriptor] = await action.batchPlay(
    [{
      _obj: 'get',
      _target: [
        { _property: 'foregroundColor' },
        { _ref: 'application', _enum: 'ordinal', _value: 'targetEnum' },
      ],
      _options: { dialogOptions: 'dontDisplay' },
    }],
    READ_BATCHPLAY_OPTIONS
  );
  const color = descriptor?.foregroundColor;
  if (!color || typeof color !== 'object') throw new Error('foreground_color_unavailable');
  return {
    red: Number(color.red),
    green: Number(color.grain ?? color.green),
    blue: Number(color.blue),
  };
}

function layerByIdDescriptor(layerId) {
  return {
    _obj: 'get',
    _target: [
      { _ref: 'layer', _id: layerId },
      { _ref: 'document', _enum: 'ordinal', _value: 'targetEnum' },
    ],
    _options: { dialogOptions: 'dontDisplay' },
  };
}

function selectLayerByIdDescriptor(layerId) {
  return {
    _obj: 'select',
    _target: [{ _ref: 'layer', _id: layerId }],
    makeVisible: false,
    _options: { dialogOptions: 'silent' },
  };
}

async function selectLayerByNameMutation(params = {}) {
  const name = typeof params.name === 'string' ? params.name.trim() : '';
  if (!name) throw new Error('name is required');
  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'select_layer_by_name');
      const layer = findLayerByNameDom(prepared.doc, name);
      if (!layer) throw new Error(`Layer not found: ${name}`);
      await action.batchPlay([selectLayerByIdDescriptor(layer.id)], { synchronousExecution: true });
      const context = normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true }));
      const result = {
        selected: true,
        layerName: layer.name,
        layerId: layer.id,
        path: layerPathDom(layer),
        typename: layer.kind === constants.LayerKind.GROUP ? 'LayerSet' : 'ArtLayer',
        kind: layer.kind === constants.LayerKind.GROUP ? 'LayerSet' : String(layer.kind),
        context,
      };
      try {
        const bounds = layer.bounds;
        if (bounds) {
          const left = Number(bounds.left ?? bounds._left ?? 0);
          const top = Number(bounds.top ?? bounds._top ?? 0);
          const right = Number(bounds.right ?? bounds._right ?? 0);
          const bottom = Number(bounds.bottom ?? bounds._bottom ?? 0);
          if ([left, top, right, bottom].every(Number.isFinite)) {
            result.bounds = {
              left,
              top,
              right,
              bottom,
              width: right - left,
              height: bottom - top,
            };
          }
        }
      } catch {}
      return result;
    },
    { commandName: 'MCP Select Layer By Name' }
  );
}

async function undoMutation(params = {}) {
  const steps = Number.isInteger(params.steps) && params.steps > 0 ? params.steps : 1;
  return core.executeAsModal(
    async () => {
      await prepareLayerMutation(params, 'undo');
      for (let i = 0; i < steps; i++) {
        await action.batchPlay(
          [{
            _obj: 'select',
            _target: [{ _ref: 'historyState', _offset: -1 }],
            _options: { dialogOptions: 'silent' },
          }],
          { synchronousExecution: true }
        );
      }
      return {
        undone: true,
        steps,
        context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
      };
    },
    { commandName: 'MCP Undo' }
  );
}

async function activeLayerHasUserMask(batchOptions = READ_BATCHPLAY_OPTIONS) {
  try {
    const [descriptor] = await action.batchPlay(
      [{
        _obj: 'get',
        _target: [
          { _property: 'userMaskEnabled' },
          { _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' },
        ],
        _options: { dialogOptions: 'dontDisplay' },
      }],
      batchOptions
    );
    return descriptor?.userMaskEnabled !== undefined;
  } catch {
    return false;
  }
}

async function createLayerMaskInCurrentModal() {
  const modalReadOptions = { synchronousExecution: true };
  if (await activeLayerHasUserMask(modalReadOptions)) {
    return {
      maskCreated: false,
      fromSelection: false,
      message: 'Layer already has a mask',
    };
  }
  const selection = await snapshotSelectionBounds(modalReadOptions);
  const hasSelection = selection?.has_selection === true;
  await action.batchPlay(
    [{
      _obj: 'make',
      new: { _class: 'channel' },
      at: { _ref: 'channel', _enum: 'channel', _value: 'mask' },
      using: {
        _enum: 'userMaskEnabled',
        _value: hasSelection ? 'revealSelection' : 'revealAll',
      },
      _options: { dialogOptions: 'silent' },
    }],
    { synchronousExecution: true }
  );
  return { maskCreated: true, fromSelection: hasSelection };
}

async function createLayerMaskMutation(params = {}) {
  return core.executeAsModal(
    async () => {
      await prepareLayerMutation(params, 'create_layer_mask');
      return createLayerMaskInCurrentModal();
    },
    { commandName: 'MCP Create Layer Mask' }
  );
}

function gradientMaskEndpoints(direction, startPct, endPct) {
  if (direction === 'top_to_bottom') return { fromH: 50, fromV: startPct, toH: 50, toV: endPct };
  if (direction === 'left_to_right') return { fromH: startPct, fromV: 50, toH: endPct, toV: 50 };
  if (direction === 'right_to_left') return { fromH: endPct, fromV: 50, toH: startPct, toV: 50 };
  return { fromH: 50, fromV: endPct, toH: 50, toV: startPct };
}

async function applyGradientMaskMutation(params = {}) {
  if (params.layer_id !== undefined && (!Number.isInteger(params.layer_id) || params.layer_id <= 0)) {
    throw new Error('mask_layer_id_invalid');
  }
  const direction = ['top_to_bottom', 'bottom_to_top', 'left_to_right', 'right_to_left'].includes(params.direction)
    ? params.direction
    : 'bottom_to_top';
  const startPct = Number.isFinite(Number(params.start_pct)) ? Number(params.start_pct) : 0;
  const endPct = Number.isFinite(Number(params.end_pct)) ? Number(params.end_pct) : 100;
  const angle = Number.isFinite(Number(params.angle_deg))
    ? Number(params.angle_deg)
    : direction === 'left_to_right' || direction === 'right_to_left' ? 0 : 90;
  return core.executeAsModal(
    async (executionContext) => {
      const prepared = await preparePaintTarget({ ...params, paint_target: 'layer-mask' }, 'apply_gradient_mask');
      const { doc, targetLayerId } = prepared;
      const originalChannels = Array.from(doc.activeChannels ?? []);
      if (!originalChannels.length) throw new Error('mask_channel_restore_unavailable');
      const suspensionId = await executionContext.hostControl.suspendHistory({ documentID: doc.id, name: 'MCP Apply Gradient Mask' });
      let committed = false;
      try {
        const maskDetails = await selectStrokeMaskModal(doc, targetLayerId);
        const width = Number(doc.width);
        const height = Number(doc.height);
        const endpoints = gradientMaskEndpoints(direction, startPct, endPct);
        const fromX = width * endpoints.fromH / 100;
        const fromY = height * endpoints.fromV / 100;
        const toX = width * endpoints.toH / 100;
        const toY = height * endpoints.toV / 100;
        const result = await action.batchPlay(
          [{
            _obj: 'gradientClassEvent',
            from: { _obj: 'paint', horizontal: { _unit: 'pixelsUnit', _value: fromX }, vertical: { _unit: 'pixelsUnit', _value: fromY } },
            to: { _obj: 'paint', horizontal: { _unit: 'pixelsUnit', _value: toX }, vertical: { _unit: 'pixelsUnit', _value: toY } },
            type: { _enum: 'gradientType', _value: 'linear' },
            dither: true,
            useMask: true,
            reverse: false,
            gradient: {
              _obj: 'gradientClassEvent',
              name: 'Black, White',
              gradientForm: { _enum: 'gradientForm', _value: 'customStops' },
              interfaceIconFrameDimmed: 4096,
              colors: [
                { _obj: 'colorStop', color: { _obj: 'grayscale', gray: { _unit: 'percentUnit', _value: 100 } }, type: { _enum: 'colorStopType', _value: 'userStop' }, location: 0, midpoint: 50 },
                { _obj: 'colorStop', color: { _obj: 'grayscale', gray: { _unit: 'percentUnit', _value: 0 } }, type: { _enum: 'colorStopType', _value: 'userStop' }, location: 4096, midpoint: 50 },
              ],
              transparency: [
                { _obj: 'transferSpec', opacity: { _unit: 'percentUnit', _value: 100 }, location: 0, midpoint: 50 },
                { _obj: 'transferSpec', opacity: { _unit: 'percentUnit', _value: 100 }, location: 4096, midpoint: 50 },
              ],
            },
            _options: { dialogOptions: 'silent' },
          }],
          { synchronousExecution: true }
        );
        if (!result[0] || result[0]._obj === 'error') throw new Error('mask_gradient_application_failed');
        doc.activeChannels = originalChannels;
        await executionContext.hostControl.resumeHistory(suspensionId, true);
        committed = true;
        return { applied: true, direction, angle, ...maskDetails, layer_id: targetLayerId,
          original_preserved: true, paint_channel: 'layer-mask', mask_polarity: 'black-hide-to-white-reveal' };
      } finally {
        if (!committed) {
          try { doc.activeChannels = originalChannels; } catch {}
          await executionContext.hostControl.resumeHistory(suspensionId, false);
        }
      }
    },
    { commandName: 'MCP Apply Gradient Mask' }
  );
}

async function selectShapeMutation(params = {}, shape = 'rectangle') {
  const left = Number(params.left);
  const top = Number(params.top);
  const right = Number(params.right);
  const bottom = Number(params.bottom);
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    throw new Error(`Invalid ${shape} bounds`);
  }
  return core.executeAsModal(
    async () => {
      await prepareLayerMutation(params, `select_${shape}`);
      await action.batchPlay(
        [{
          _obj: 'set',
          _target: [{ _ref: 'channel', _property: 'selection' }],
          to: {
            _obj: shape,
            top: { _unit: 'pixelsUnit', _value: top },
            left: { _unit: 'pixelsUnit', _value: left },
            bottom: { _unit: 'pixelsUnit', _value: bottom },
            right: { _unit: 'pixelsUnit', _value: right },
          },
          feather: { _unit: 'pixelsUnit', _value: 0 },
          antiAlias: true,
          _options: { dialogOptions: 'silent' },
        }],
        { synchronousExecution: true }
      );
      const selection = await snapshotSelectionBounds({ synchronousExecution: true });
      return {
        shape,
        bounds: selection?.bounds ?? { left, top, right, bottom },
        context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
      };
    },
    { commandName: shape === 'ellipse' ? 'MCP Select Ellipse' : 'MCP Select Rectangle' }
  );
}

async function featherSelectionMutation(params = {}) {
  const pixels = Number(params.pixels);
  if (!Number.isFinite(pixels) || pixels < 1) throw new Error('pixels must be a finite number >= 1');
  return core.executeAsModal(
    async () => {
      await prepareLayerMutation(params, 'feather_selection');
      await action.batchPlay(
        [{
          _obj: 'feather',
          radius: { _unit: 'pixelsUnit', _value: pixels },
          _options: { dialogOptions: 'silent' },
        }],
        { synchronousExecution: true }
      );
      const selection = await snapshotSelectionBounds({ synchronousExecution: true });
      return {
        pixels,
        ...(selection?.bounds ? { bounds: selection.bounds } : {}),
        context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
      };
    },
    { commandName: 'MCP Feather Selection' }
  );
}

async function selectSubjectMutation(params = {}) {
  return core.executeAsModal(
    async () => {
      await prepareLayerMutation(params, 'select_subject');
      await action.batchPlay(
        [{
          _obj: 'autoCutout',
          sampleAllLayers: params.sample_all_layers === true,
          _options: { dialogOptions: 'silent' },
        }],
        { synchronousExecution: true }
      );
      const selection = await snapshotSelectionBounds({ synchronousExecution: true });
      return {
        method: 'selectSubject',
        sample_all_layers: params.sample_all_layers === true,
        ...(selection?.bounds ? { bounds: selection.bounds } : {}),
        context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
      };
    },
    { commandName: 'MCP Select Subject' }
  );
}

async function prepareLayerMutation(params = {}, operationName = 'layer mutation') {
  const requestedDocumentId =
    Number.isInteger(params.document_id) && params.document_id > 0
      ? params.document_id
      : null;
  const sessionDescriptors = await readSessionDescriptors({ synchronousExecution: true });
  if (sessionDescriptors.documentCount <= 0) throw new Error('No active document');
  const activeDocumentId = numericValue(sessionDescriptors.documentDescriptor?.documentID);
  if (requestedDocumentId != null && activeDocumentId !== requestedDocumentId) {
    const openIds = Array.from(app.documents ?? []).map((doc) => doc.id);
    if (!openIds.includes(requestedDocumentId)) {
      throw new Error(`document_not_found: no open document with id ${requestedDocumentId}`);
    }
    throw new Error(
      `document_not_active: pinned document ${requestedDocumentId} is open but not active; active document was not changed`
    );
  }
  const doc = app.activeDocument;
  const originalActiveLayer = Array.from(doc.activeLayers ?? [])[0] ?? null;
  return {
    doc,
    sessionDescriptors,
    activeDocumentId,
    originalActiveLayer,
    originalActiveLayerId: originalActiveLayer?.id ?? null,
    operationName,
  };
}

function findLayerByIdDom(container, layerId) {
  const layers = Array.from(container?.layers ?? []);
  for (const layer of layers) {
    if (layer?.id === layerId) return layer;
    const nested = findLayerByIdDom(layer, layerId);
    if (nested) return nested;
  }
  return null;
}

function findLayerByNameDom(container, layerName) {
  const layers = Array.from(container?.layers ?? []);
  for (const layer of layers) {
    if (layer?.name === layerName) return layer;
    const nested = findLayerByNameDom(layer, layerName);
    if (nested) return nested;
  }
  return null;
}

function layerPathDom(layer) {
  if (!layer) return '';
  const parts = [String(layer.name ?? '')];
  let parent = layer.parent ?? null;
  while (parent) {
    parts.unshift(String(parent.name ?? ''));
    parent = parent.parent ?? null;
  }
  return parts.filter(Boolean).join('/');
}

function parentLayerStack(doc, layer) {
  return Array.from(layer?.parent?.layers ?? doc.layers ?? []);
}

function parentLayerName(layer) {
  return layer?.parent?.kind === constants.LayerKind.GROUP ? layer.parent.name : null;
}

function requireActiveLayerTarget(prepared, operationName) {
  const layerId = prepared.originalActiveLayerId;
  if (!Number.isInteger(layerId) || layerId <= 0) {
    throw new Error(`${operationName}: No active layer`);
  }
  const layer = findLayerByIdDom(prepared.doc, layerId);
  if (!layer) throw new Error(`${operationName}: active layer ${layerId} not found`);
  return layer;
}

async function createLayerMutation(params = {}) {
  const aboveLayerId = Number.isInteger(params.above_layer_id) && params.above_layer_id > 0
    ? params.above_layer_id
    : null;
  const belowLayerId = Number.isInteger(params.below_layer_id) && params.below_layer_id > 0
    ? params.below_layer_id
    : null;
  if (aboveLayerId != null && belowLayerId != null) {
    throw new Error('Provide only one of above_layer_id or below_layer_id');
  }
  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'create_layer');
      const { doc, originalActiveLayerId } = prepared;
      const explicitTargetId = aboveLayerId ?? belowLayerId;
      const targetId = explicitTargetId ?? originalActiveLayerId;
      const targetLayer = targetId != null ? findLayerByIdDom(doc, targetId) : null;
      if (explicitTargetId != null && !targetLayer) {
        throw new Error(`Layer not found: id=${explicitTargetId}`);
      }
      const requestedPlacement = aboveLayerId != null
        ? 'ABOVE'
        : belowLayerId != null
          ? 'BELOW'
          : targetLayer
            ? 'ABOVE_ACTIVE'
            : null;
      const relativeToId = targetLayer?.id ?? null;
      const relativeToPath = targetLayer ? layerPathDom(targetLayer) : null;
      const options = typeof params.name === 'string' ? { name: params.name } : {};
      const layer = await doc.createLayer(constants.LayerKind.NORMAL, options);
      if (targetLayer && targetLayer.id !== layer.id) {
        layer.move(
          targetLayer,
          requestedPlacement === 'BELOW'
            ? constants.ElementPlacement.PLACEAFTER
            : constants.ElementPlacement.PLACEBEFORE
        );
      }
      await action.batchPlay(
        [selectLayerByIdDescriptor(layer.id)],
        { synchronousExecution: true }
      );
      const stack = parentLayerStack(doc, layer);
      const actualIndex = stack.findIndex((entry) => entry?.id === layer.id);
      const aboveNeighbor = actualIndex > 0 ? stack[actualIndex - 1] : null;
      const belowNeighbor = actualIndex >= 0 && actualIndex < stack.length - 1
        ? stack[actualIndex + 1]
        : null;
      const context = normalizeSessionState(
        await readSessionDescriptors({ synchronousExecution: true })
      );
      const result = {
        created: true,
        layerName: layer.name,
        path: layerPathDom(layer),
        requestedPlacement,
        actualIndex,
        aboveLayerId: aboveNeighbor?.id ?? null,
        belowLayerId: belowNeighbor?.id ?? null,
        context,
        layerId: layer.id,
      };
      if (layer.parent) result.parentPath = layerPathDom(layer.parent);
      else result.parentPath = '';
      if (targetLayer) {
        result.relativeToId = relativeToId;
        result.relativeToPath = relativeToPath;
      }
      return result;
    },
    { commandName: 'MCP Create Layer' }
  );
}

async function deleteLayerMutation(params = {}) {
  const requestedLayerId =
    Number.isInteger(params.layer_id) && params.layer_id > 0 ? params.layer_id : null;
  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'delete_layer');
      const { doc, originalActiveLayerId } = prepared;
      const targetLayerId = requestedLayerId ?? originalActiveLayerId;
      if (!Number.isInteger(targetLayerId) || targetLayerId <= 0) throw new Error('No active layer');
      const layer = findLayerByIdDom(doc, targetLayerId);
      if (!layer) {
        throw new Error(
          requestedLayerId != null
            ? `Target layer id not found: ${requestedLayerId}`
            : 'No active layer'
        );
      }
      const deletedName = layer.name;
      const deletedId = layer.id;
      const deletedPath = layerPathDom(layer);
      const deletingOriginalActive = originalActiveLayerId === targetLayerId;
      await action.batchPlay(
        [{
          _obj: 'delete',
          _target: [{ _ref: 'layer', _id: targetLayerId }],
          _options: { dialogOptions: 'silent' },
        }],
        { synchronousExecution: true }
      );
      if (!deletingOriginalActive && originalActiveLayerId != null) {
        const originalStillExists = findLayerByIdDom(doc, originalActiveLayerId);
        if (originalStillExists) {
          await action.batchPlay(
            [selectLayerByIdDescriptor(originalActiveLayerId)],
            { synchronousExecution: true }
          );
        }
      }
      const context = normalizeSessionState(
        await readSessionDescriptors({ synchronousExecution: true })
      );
      return {
        deleted: true,
        layerName: deletedName,
        layerId: deletedId,
        path: deletedPath,
        requestedLayerId,
        originalActiveLayerId,
        activeLayerRestored: !deletingOriginalActive,
        context,
      };
    },
    { commandName: 'MCP Delete Layer' }
  );
}

async function setLayerOpacityMutation(params = {}) {
  const opacity = Number(params.opacity);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) throw new Error('Invalid opacity');
  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'set_layer_opacity');
      const layer = requireActiveLayerTarget(prepared, 'set_layer_opacity');
      layer.opacity = opacity;
      return {
        updated: true,
        property: 'opacity',
        value: layer.opacity,
        layerName: layer.name,
        context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
      };
    },
    { commandName: 'MCP Set Layer Opacity' }
  );
}

async function setLayerBlendModeMutation(params = {}) {
  const requested = String(params.blendMode ?? '').trim().toUpperCase();
  const blendMode = constants.BlendMode?.[requested];
  if (blendMode == null) throw new Error(`Invalid enumeration value: BlendMode.${requested}`);
  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'set_layer_blend_mode');
      const layer = requireActiveLayerTarget(prepared, 'set_layer_blend_mode');
      layer.blendMode = blendMode;
      return {
        updated: true,
        property: 'blendMode',
        value: String(layer.blendMode),
        layerName: layer.name,
        context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
      };
    },
    { commandName: 'MCP Set Layer Blend Mode' }
  );
}

async function setLayerVisibilityMutation(params = {}) {
  if (typeof params.visible !== 'boolean') throw new Error('visible must be boolean');
  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'set_layer_visibility');
      const layer = requireActiveLayerTarget(prepared, 'set_layer_visibility');
      layer.visible = params.visible;
      return { visible: layer.visible, name: layer.name };
    },
    { commandName: 'MCP Set Layer Visibility' }
  );
}

async function setLayerLockedMutation(params = {}) {
  if (typeof params.locked !== 'boolean') throw new Error('locked must be boolean');
  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'set_layer_locked');
      const layer = requireActiveLayerTarget(prepared, 'set_layer_locked');
      layer.allLocked = params.locked;
      return { locked: layer.allLocked, name: layer.name };
    },
    { commandName: 'MCP Set Layer Locked' }
  );
}

async function renameLayerMutation(params = {}) {
  if (typeof params.name !== 'string') throw new Error('name is required');
  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'rename_layer');
      const layer = requireActiveLayerTarget(prepared, 'rename_layer');
      const oldName = layer.name;
      layer.name = params.name;
      return { oldName, newName: layer.name };
    },
    { commandName: 'MCP Rename Layer' }
  );
}

async function duplicateLayerMutation(params = {}) {
  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'duplicate_layer');
      const layer = requireActiveLayerTarget(prepared, 'duplicate_layer');
      const originalName = layer.name;
      const duplicated = await layer.duplicate();
      if (typeof params.newName === 'string') duplicated.name = params.newName;
      await action.batchPlay(
        [selectLayerByIdDescriptor(duplicated.id)],
        { synchronousExecution: true }
      );
      return {
        originalName,
        newName: duplicated.name,
        activated: true,
        newLayerId: duplicated.id,
      };
    },
    { commandName: 'MCP Duplicate Layer' }
  );
}

async function moveLayerMutation(params = {}) {
  const requestedPosition = String(params.position ?? '').trim().toUpperCase();
  if (!['ABOVE', 'BELOW', 'TOP', 'BOTTOM', 'UP', 'DOWN'].includes(requestedPosition)) {
    throw new Error('Invalid position. Use: ABOVE, BELOW, TOP, BOTTOM, UP, or DOWN');
  }
  const requestedTargetId =
    Number.isInteger(params.targetLayerId) ? params.targetLayerId : null;
  const requestedTargetName =
    typeof params.targetLayerName === 'string' && params.targetLayerName.trim()
      ? params.targetLayerName.trim()
      : null;
  if ((requestedPosition === 'ABOVE' || requestedPosition === 'BELOW') &&
      requestedTargetId == null && requestedTargetName == null) {
    throw new Error('Invalid arguments: ABOVE/BELOW requires targetLayerId or targetLayerName');
  }

  return core.executeAsModal(
    async () => {
      const prepared = await prepareLayerMutation(params, 'move_layer');
      const { doc } = prepared;
      const layer = requireActiveLayerTarget(prepared, 'move_layer');
      const stack = parentLayerStack(doc, layer);
      const currentIndex = stack.findIndex((entry) => entry?.id === layer.id);
      let targetLayer = null;

      if (requestedPosition === 'TOP') {
        if (currentIndex > 0) layer.move(stack[0], constants.ElementPlacement.PLACEBEFORE);
        return {
          moved: true,
          layerName: layer.name,
          layerId: layer.id,
          parentName: parentLayerName(layer),
          position: 'top',
          context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
        };
      }

      if (requestedPosition === 'BOTTOM') {
        if (layer.isBackgroundLayer) throw new Error('Cannot move background layer');
        if (currentIndex >= 0 && currentIndex < stack.length - 1) {
          const bottomLayer = stack[stack.length - 1];
          layer.move(
            bottomLayer,
            bottomLayer?.isBackgroundLayer
              ? constants.ElementPlacement.PLACEBEFORE
              : constants.ElementPlacement.PLACEAFTER
          );
        }
        return {
          moved: true,
          layerName: layer.name,
          layerId: layer.id,
          parentName: parentLayerName(layer),
          position: 'bottom',
          context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
        };
      }

      if (requestedPosition === 'UP') {
        if (currentIndex <= 0) {
          return {
            moved: false,
            message: 'Layer is already at the top',
            context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
          };
        }
        layer.move(stack[currentIndex - 1], constants.ElementPlacement.PLACEBEFORE);
        return {
          moved: true,
          layerName: layer.name,
          parentName: parentLayerName(layer),
          direction: 'up',
          context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
        };
      }

      if (requestedPosition === 'DOWN') {
        if (currentIndex < 0 || currentIndex >= stack.length - 1) {
          return {
            moved: false,
            message: 'Layer is already at the bottom',
            context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
          };
        }
        const below = stack[currentIndex + 1];
        layer.move(below, constants.ElementPlacement.PLACEAFTER);
        return {
          moved: true,
          layerName: layer.name,
          parentName: parentLayerName(layer),
          direction: 'down',
          context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
        };
      }

      targetLayer = requestedTargetId != null
        ? findLayerByIdDom(doc, requestedTargetId)
        : findLayerByNameDom(doc, requestedTargetName);
      if (!targetLayer) {
        throw new Error(
          'Layer not found: ' +
          (requestedTargetId != null ? `id=${requestedTargetId}` : requestedTargetName)
        );
      }
      if (targetLayer.id === layer.id) {
        throw new Error('Invalid arguments: active layer cannot be moved relative to itself');
      }
      layer.move(
        targetLayer,
        requestedPosition === 'ABOVE'
          ? constants.ElementPlacement.PLACEBEFORE
          : constants.ElementPlacement.PLACEAFTER
      );
      return {
        moved: true,
        layerName: layer.name,
        layerId: layer.id,
        position: requestedPosition,
        context: normalizeSessionState(await readSessionDescriptors({ synchronousExecution: true })),
        relativeTo: targetLayer.name,
        relativeToId: targetLayer.id,
        relativeToPath: layerPathDom(targetLayer),
      };
    },
    { commandName: 'MCP Move Layer' }
  );
}

function fillLayerLockState(descriptor) {
  const locking = descriptor?.layerLocking;
  return Boolean(
    locking && typeof locking === 'object'
      ? locking.protectAll ?? locking.allLocked
      : descriptor?.allLocked ?? descriptor?.locked
  );
}

async function fillLayer(params = {}) {
  const red = Number(params.red);
  const green = Number(params.green);
  const blue = Number(params.blue);
  if (![red, green, blue].every(Number.isFinite)) {
    throw new Error('red, green and blue are required');
  }

  const requestedDocumentId =
    Number.isInteger(params.document_id) && params.document_id > 0
      ? params.document_id
      : null;
  const requestedLayerId =
    Number.isInteger(params.layer_id) && params.layer_id > 0
      ? params.layer_id
      : null;

  const sessionDescriptors = await readSessionDescriptors();
  if (sessionDescriptors.documentCount <= 0) throw new Error('No active document');
  const activeDocumentId = numericValue(sessionDescriptors.documentDescriptor?.documentID);
  if (requestedDocumentId != null && activeDocumentId !== requestedDocumentId) {
    const openIds = Array.from(app.documents ?? []).map((doc) => doc.id);
    if (!openIds.includes(requestedDocumentId)) {
      throw new Error(`document_not_found: no open document with id ${requestedDocumentId}`);
    }
    throw new Error(
      `document_not_active: pinned document ${requestedDocumentId} is open but not active; active document was not changed`
    );
  }

  const doc = app.activeDocument;
  const originalActiveLayer = Array.from(doc.activeLayers ?? [])[0] ?? null;
  const originalActiveLayerId = originalActiveLayer?.id ?? null;
  const targetLayerId = requestedLayerId ?? originalActiveLayerId;
  if (!Number.isInteger(targetLayerId) || targetLayerId <= 0) {
    throw new Error('No active layer');
  }

  const [targetDescriptor] = await action.batchPlay(
    [layerByIdDescriptor(targetLayerId)],
    READ_BATCHPLAY_OPTIONS
  );
  if (!targetDescriptor || targetDescriptor._obj === 'error') {
    throw new Error(`Fill target layer not found: ${targetLayerId}`);
  }
  if (layerSectionValue(targetDescriptor) === 'layerSectionStart') {
    throw new Error('Cannot fill a LayerSet; target must be an ArtLayer');
  }
  if (fillLayerLockState(targetDescriptor)) {
    throw new Error(
      `Cannot fill a fully locked layer: ${String(targetDescriptor.name ?? targetLayerId)}`
    );
  }
  if (legacyLayerKind(targetDescriptor) === 'LayerKind.TEXT') {
    throw new Error('Cannot fill a text layer. Rasterize it first.');
  }

  const hadSelection =
    Object.prototype.hasOwnProperty.call(sessionDescriptors.documentDescriptor ?? {}, 'selection') &&
    sessionDescriptors.documentDescriptor?.selection != null;

  return core.executeAsModal(
    async () => {
      let selectedAll = false;
      try {
        if (originalActiveLayerId !== targetLayerId) {
          await action.batchPlay(
            [selectLayerByIdDescriptor(targetLayerId)],
            { synchronousExecution: true }
          );
        }
        if (!hadSelection) {
          await doc.selection.selectAll();
          selectedAll = true;
        }
        await action.batchPlay(
          [{
            _obj: 'fill',
            using: { _enum: 'fillContents', _value: 'color' },
            color: { _obj: 'RGBColor', red, green, blue },
            opacity: { _unit: 'percentUnit', _value: 100 },
            mode: { _enum: 'blendMode', _value: 'normal' },
            _options: { dialogOptions: 'silent' },
          }],
          { synchronousExecution: true }
        );
        if (selectedAll) {
          await doc.selection.deselect();
          selectedAll = false;
        }
        const context = normalizeSessionState(
          await readSessionDescriptors({ synchronousExecution: true })
        );
        return {
          filled: true,
          layerName: String(targetDescriptor.name ?? ''),
          layerId: targetLayerId,
          color: { red, green, blue },
          context,
        };
      } finally {
        if (selectedAll) {
          try { await doc.selection.deselect(); } catch {}
        }
        if (
          originalActiveLayerId != null &&
          originalActiveLayerId !== targetLayerId
        ) {
          try {
            await action.batchPlay(
              [selectLayerByIdDescriptor(originalActiveLayerId)],
              { synchronousExecution: true }
            );
          } catch {}
        }
      }
    },
    { commandName: 'MCP Fill Layer' }
  );
}

// Cubic extent math mirrors src/core/bezier-geometry.ts; covered by the shared regression.
function scalarValue(values, t) {
    const u = 1 - t;
    return u * u * u * values[0] + 3 * u * u * t * values[1] + 3 * u * t * t * values[2] + t * t * t * values[3];
}
function scalarParameters(values, crossings) {
    const [p0, p1, p2, p3] = values;
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b = 2 * (p0 - 2 * p1 + p2);
    const c = p1 - p0;
    if (![a, b, c].every(Number.isFinite))
        throw new Error('Non-finite Bezier polynomial');
    const ts = [0, 1];
    const add = (t) => { if (Number.isFinite(t) && t > 0 && t < 1)
        ts.push(t); };
    if (Math.abs(a) < 1e-12) {
        if (Math.abs(b) > 1e-12)
            add(-c / b);
    }
    else {
        const discriminant = b * b - 4 * a * c;
        if (!Number.isFinite(discriminant))
            throw new Error('Non-finite Bezier discriminant');
        if (discriminant >= 0) {
            const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
            add(q / a);
            if (q !== 0)
                add(c / q);
        }
    }
    if (crossings) {
        const knots = [...ts].sort((a, b) => a - b);
        for (let i = 1; i < knots.length; i++) {
            let lo = knots[i - 1], hi = knots[i];
            const start = scalarValue(values, lo), end = scalarValue(values, hi);
            if (Math.abs(start) < 1e-10)
                add(lo);
            if (Math.abs(end) < 1e-10)
                add(hi);
            if (Math.sign(start) === Math.sign(end))
                continue;
            for (let j = 0; j < 48; j++) {
                const mid = (lo + hi) / 2;
                if (Math.sign(scalarValue(values, mid)) === Math.sign(start))
                    lo = mid;
                else
                    hi = mid;
            }
            add((lo + hi) / 2);
        }
    }
    return ts;
}
/** Actual cubic extrema; handles are finite control positions, not visible endpoints. */
function bezierCriticalPoints(rawPoints, closed = false, projections = []) {
    const points = rawPoints.map((value, index) => {
        const p = value;
        if (!p || ![p.x, p.y].every(v => typeof v === 'number' && Number.isFinite(v))) {
            throw new Error(`points[${index}] has a non-finite anchor`);
        }
        for (const key of ['left', 'right']) {
            const handle = p[key];
            if (handle !== undefined && (!Array.isArray(handle) || handle.length !== 2
                || !handle.every(v => typeof v === 'number' && Number.isFinite(v)))) {
                throw new Error(`points[${index}].${key} has a non-finite Bezier handle`);
            }
        }
        return p;
    });
    const result = points.map(p => ({ x: p.x, y: p.y }));
    const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }, ...projections];
    for (let i = 0; i < (closed ? points.length : points.length - 1); i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const controls = [[a.x, a.y], a.right ?? [a.x, a.y], b.left ?? [b.x, b.y], [b.x, b.y]];
        for (const axis of axes) {
            const values = controls.map(p => axis.x * p[0] + axis.y * p[1] + (axis.offset ?? 0));
            for (const t of scalarParameters(values, Boolean(axis.crossings))) {
                if (t === 0 || t === 1)
                    continue;
                const point = { x: scalarValue(controls.map(p => p[0]), t), y: scalarValue(controls.map(p => p[1]), t) };
                if (![point.x, point.y].every(Number.isFinite))
                    throw new Error('Non-finite Bezier extent');
                result.push(point);
            }
        }
    }
    return result;
}

function assertCanvasPoint(point, label, width, height, clipBounds) {
  const checks = [
    ['anchor', Number(point.x), Number(point.y)],
    ...(Array.isArray(point.left) ? [['left', Number(point.left[0]), Number(point.left[1])]] : []),
    ...(Array.isArray(point.right) ? [['right', Number(point.right[0]), Number(point.right[1])]] : []),
  ];
  for (const [suffix, x, y] of checks) {
    if (![x, y].every(Number.isFinite)) {
      throw new Error(`${label}.${suffix} has non-finite coordinates`);
    }
    if (suffix !== 'anchor') continue;
    if (x < -1e-7 || x > width + 1e-7 || y < -1e-7 || y > height + 1e-7) {
      throw new Error(`${label}.${suffix} lies outside document canvas`);
    }
    if (
      clipBounds &&
      (x < clipBounds.left - 1e-7 || x > clipBounds.right + 1e-7 || y < clipBounds.top - 1e-7 || y > clipBounds.bottom + 1e-7)
    ) {
      throw new Error(`${label}.${suffix} lies outside clip_bounds`);
    }
  }
}

function makeUxpPathPoint(point) {
  const pathPoint = new app.PathPointInfo();
  pathPoint.kind = point.smooth
    ? constants.PointKind.SMOOTHPOINT
    : constants.PointKind.CORNERPOINT;
  pathPoint.anchor = [Number(point.x), Number(point.y)];
  // Photoshop's PathPointInfo add() consumes these DOM directions in reverse
  // segment order (live asymmetric-curve probe, 2026-10-05). Public left is
  // incoming and right is outgoing, matching the CPU dynamic-stroke sampler.
  pathPoint.leftDirection = Array.isArray(point.right)
    ? [Number(point.right[0]), Number(point.right[1])]
    : [Number(point.x), Number(point.y)];
  pathPoint.rightDirection = Array.isArray(point.left)
    ? [Number(point.left[0]), Number(point.left[1])]
    : [Number(point.x), Number(point.y)];
  return pathPoint;
}

function makeUxpRegionSubPath(contour) {
  const subPath = new app.SubPathInfo();
  subPath.closed = true;
  subPath.operation =
    contour.operation === 'SUBTRACT'
      ? constants.ShapeOperation.SHAPESUBTRACT
      : constants.ShapeOperation.SHAPEADD;
  subPath.entireSubPath = contour.points.map(makeUxpPathPoint);
  return subPath;
}

function validatePaintTargetDescriptor(descriptor, toolName, maskPainting = false) {
  if (!descriptor || descriptor._obj === 'error') {
    throw new Error(`${toolName} target layer not found`);
  }
  if (layerSectionValue(descriptor) === 'layerSectionStart') {
    throw new Error(`${toolName} target must be an ArtLayer, not a LayerSet`);
  }
  const kind = legacyLayerKind(descriptor);
  if (kind !== 'LayerKind.NORMAL' && !(maskPainting && kind === 'LayerKind.SMARTOBJECT')) {
    throw new Error(
      `${toolName} target must be a normal raster ArtLayer: ${String(descriptor.name ?? '')}`
    );
  }
  if (fillLayerLockState(descriptor)) {
    throw new Error(`${toolName} target layer is locked: ${String(descriptor.name ?? '')}`);
  }
}

async function preparePaintTarget(params, toolName) {
  const requestedDocumentId =
    Number.isInteger(params.document_id) && params.document_id > 0
      ? params.document_id
      : null;
  const requestedLayerId =
    Number.isInteger(params.layer_id) && params.layer_id > 0
      ? params.layer_id
      : null;
  const descriptors = await readSessionDescriptors();
  if (descriptors.documentCount <= 0) throw new Error('No active document');
  const activeDocumentId = numericValue(descriptors.documentDescriptor?.documentID);
  if (requestedDocumentId != null && activeDocumentId !== requestedDocumentId) {
    const openIds = Array.from(app.documents ?? []).map((doc) => doc.id);
    if (!openIds.includes(requestedDocumentId)) {
      throw new Error(`document_not_found: no open document with id ${requestedDocumentId}`);
    }
    throw new Error(
      `document_not_active: pinned document ${requestedDocumentId} is open but not active; active document was not changed`
    );
  }
  const doc = app.activeDocument;
  const originalLayers = Array.from(doc.activeLayers ?? []);
  if (params.paint_target === 'layer-mask' && originalLayers.length !== 1) throw new Error('mask_single_active_layer_required');
  const originalLayer = originalLayers[0] ?? null;
  const originalLayerId = originalLayer?.id ?? null;
  const targetLayerId = requestedLayerId ?? originalLayerId;
  if (!Number.isInteger(targetLayerId) || targetLayerId <= 0) {
    throw new Error(`${toolName} requires an active layer`);
  }
  const [targetDescriptor] = await action.batchPlay(
    [layerByIdDescriptor(targetLayerId)],
    READ_BATCHPLAY_OPTIONS
  );
  if (!targetDescriptor || targetDescriptor._obj === 'error') {
    throw new Error(`${toolName} target layer not found: ${targetLayerId}`);
  }
  validatePaintTargetDescriptor(targetDescriptor, toolName, params.paint_target === 'layer-mask');
  return {
    doc,
    targetLayerId,
    targetDescriptor,
    originalLayerId,
    resolution: numericValue(descriptors.documentDescriptor?.resolution) ?? 72,
    width: documentPixelDimension(descriptors.documentDescriptor?.width, descriptors.documentDescriptor?.resolution),
    height: documentPixelDimension(descriptors.documentDescriptor?.height, descriptors.documentDescriptor?.resolution),
  };
}

function samePaintColor(a, b) {
  return Boolean(
    a && b &&
    Number(a.red) === Number(b.red) &&
    Number(a.green) === Number(b.green) &&
    Number(a.blue) === Number(b.blue)
  );
}

function currentForegroundRgb() {
  const rgb = app.foregroundColor?.rgb;
  return {
    red: Number(rgb?.red ?? 0),
    green: Number(rgb?.green ?? 0),
    blue: Number(rgb?.blue ?? 0),
  };
}

function makeUxpStrokeSubPath(stroke) {
  const points = (Array.isArray(stroke.points) ? stroke.points : []).map(makeUxpPathPoint);
  if (points.length === 1) {
    const src = stroke.points[0];
    const duplicate = new app.PathPointInfo();
    duplicate.kind = constants.PointKind.CORNERPOINT;
    duplicate.anchor = [Number(src.x), Number(src.y)];
    duplicate.leftDirection = [Number(src.x), Number(src.y)];
    duplicate.rightDirection = [Number(src.x), Number(src.y)];
    points.push(duplicate);
  }
  const subPath = new app.SubPathInfo();
  subPath.closed = Boolean(stroke.closed);
  subPath.operation = constants.ShapeOperation.SHAPEADD;
  subPath.entireSubPath = points;
  return subPath;
}

function makeUxpDabSubPath(point) {
  const makePoint = () => {
    const pathPoint = new app.PathPointInfo();
    pathPoint.kind = constants.PointKind.CORNERPOINT;
    pathPoint.anchor = [Number(point.x), Number(point.y)];
    pathPoint.leftDirection = [Number(point.x), Number(point.y)];
    pathPoint.rightDirection = [Number(point.x), Number(point.y)];
    return pathPoint;
  };
  const subPath = new app.SubPathInfo();
  subPath.closed = false;
  subPath.operation = constants.ShapeOperation.SHAPEADD;
  subPath.entireSubPath = [makePoint(), makePoint()];
  return subPath;
}

async function deleteNamedPathModal(pathName) {
  try {
    await action.batchPlay(
      [{
        _obj: 'delete',
        _target: [{ _ref: 'path', _name: pathName }],
        _options: { dialogOptions: 'silent' },
      }],
      { synchronousExecution: true }
    );
  } catch {}
}

async function strokeNamedPathModal(doc, pathName, tool, simulatePressure) {
  const pathItem = doc.pathItems.getByName(pathName);
  if (!pathItem || typeof pathItem.strokePath !== 'function') {
    throw new Error('uxp_path_stroke_method_unavailable');
  }
  await pathItem.strokePath(tool, Boolean(simulatePressure));
}

function paintTargetCompositing(doc, layerId) {
  const layer = findLayerByIdDom(doc, layerId);
  const properties = (item) => ({
    layer_id: item.id,
    ...(Number.isFinite(item.opacity) ? { opacity: item.opacity } : {}),
    ...(Number.isFinite(item.fillOpacity) ? { fill_opacity: item.fillOpacity } : {}),
    ...(item.blendMode != null ? { blend_mode: String(item.blendMode) } : {}),
  });
  if (!layer) return { layer_id: layerId };
  const parentGroups = [];
  let parent = layer.parent;
  while (parent && parent !== doc && parent.kind === constants.LayerKind.GROUP) {
    parentGroups.push(properties(parent));
    parent = parent.parent;
  }
  return { ...properties(layer), ...(parentGroups.length ? { parent_groups: parentGroups } : {}) };
}

function batchBrushStyle(baseline, override) {
  return Object.fromEntries(['size', 'opacity', 'flow'].map(
    key => [key, Number(override[key] === undefined ? baseline[key] : override[key])]
  ));
}

function sameCoreBrushStyle(a, b) {
  return ['size', 'opacity', 'flow'].every(key => Number(a[key]) === Number(b[key]));
}

async function restoreBatchBrushStyle(baseline, current, dirty = false) {
  if (!baseline || (!dirty && sameCoreBrushStyle(baseline, current))) return;
  await action.batchPlay([selectPaintbrushToolDescriptor()], { synchronousExecution: true });
  await applyBrushSettingsModal(batchBrushStyle(baseline, {}));
}

// Mask edits use the established BRUSH renderer, never ERASER or an RGB fallback.
async function selectStrokeMaskModal(doc, targetLayerId) {
  if (doc.activeLayers?.length !== 1 || doc.activeLayers[0].id !== targetLayerId) throw new Error('mask_layer_target_mismatch');
  const [layer] = await action.batchPlay([layerByIdDescriptor(targetLayerId)], { synchronousExecution: true });
  if (!layer || layer._obj === 'error') throw new Error('mask_target_unavailable');
  if (layer.hasUserMask === true && layer.userMaskEnabled !== true) throw new Error('mask_target_disabled_or_unconfirmed');
  const created = layer.hasUserMask !== true;
  if (created) {
    const result = await action.batchPlay([{ _obj: 'make', new: { _class: 'channel' },
      at: { _ref: 'channel', _enum: 'channel', _value: 'mask' },
      using: { _enum: 'userMaskEnabled', _value: 'revealAll' },
      _options: { dialogOptions: 'silent' } }], { synchronousExecution: true });
    if (!result[0] || result[0]._obj === 'error') throw new Error('mask_creation_failed');
  }
  const [confirmed] = await action.batchPlay([layerByIdDescriptor(targetLayerId)], { synchronousExecution: true });
  if (confirmed?.hasUserMask !== true || confirmed.userMaskEnabled !== true) throw new Error('mask_creation_unconfirmed');
  await selectStrokeMaskChannelModal(doc, targetLayerId);
  return { mask_auto_created: created };
}

async function selectStrokeMaskChannelModal(doc, targetLayerId) {
  if (doc.activeLayers?.length !== 1 || doc.activeLayers[0].id !== targetLayerId) throw new Error('mask_layer_target_mismatch');
  const result = await action.batchPlay([{ _obj: 'select',
    _target: [{ _ref: 'channel', _enum: 'channel', _value: 'mask' }], makeVisible: false,
    _options: { dialogOptions: 'silent' } }], { synchronousExecution: true });
  if (!result[0] || result[0]._obj === 'error') throw new Error('mask_channel_selection_failed');
}

async function paintStrokesBatch(params = {}) {
  const strokes = Array.isArray(params.strokes) ? params.strokes : [];
  if (strokes.length < 1) throw new Error('strokes must be a non-empty array');
  const maskPainting = params.paint_target === 'layer-mask';
  if (maskPainting && (!Number.isInteger(params.document_id) || params.document_id <= 0
    || !Number.isInteger(params.layer_id) || params.layer_id <= 0
    || strokes.some(stroke => String(stroke.tool ?? 'BRUSH').toUpperCase() !== 'BRUSH'
      || !stroke.color || stroke.color.red !== stroke.color.green || stroke.color.red !== stroke.color.blue))) {
    throw new Error('mask_paint_contract_invalid');
  }
  const target = await preparePaintTarget(params, 'paint_strokes');
  const { doc, targetLayerId, targetDescriptor, originalLayerId, resolution } = target;
  if (target.width == null || target.height == null) throw new Error('paint_strokes document geometry unavailable');
  for (const [index, stroke] of strokes.entries()) {
    for (const point of bezierCriticalPoints(stroke.points ?? [], Boolean(stroke.closed))) {
      assertCanvasPoint(point, `strokes[${index}].curve`, target.width, target.height);
    }
  }
  return core.executeAsModal(
    async (executionContext) => {
      // Validate every requested Photoshop stroke mechanism before history is
      // suspended and before stroke #1 can alter pixels. This prevents a mixed
      // batch from discovering that a later mechanism is not ready only after
      // earlier strokes have already rendered.
      const strokeToolReadiness = await preflightStrokeToolsModal(strokes);
      const originalColor = maskPainting ? currentForegroundRgb() : null;
      const originalChannels = maskPainting ? Array.from(doc.activeChannels ?? []) : null;
      const suspensionId = await executionContext.hostControl.suspendHistory({
        documentID: doc.id,
        name: 'MCP Digital Painting',
      });
      let committed = false;
      let brushBaseline = null;
      let brushState = null;
      let brushStateDirty = false;
      let maskDetails;
      try {
        if (maskPainting && !originalChannels.length) throw new Error('mask_channel_restore_unavailable');
        if (targetLayerId !== originalLayerId) {
          await action.batchPlay(
            [selectLayerByIdDescriptor(targetLayerId)],
            { synchronousExecution: true }
          );
        }
        if (maskPainting) maskDetails = await selectStrokeMaskModal(doc, targetLayerId);
        const hasBrushStroke = strokes.some(
          (stroke) => String(stroke?.tool ?? 'BRUSH').toUpperCase() === 'BRUSH'
        );
        if (hasBrushStroke) {
          // currentToolOptions describes the active Photoshop tool. Region/fill
          // work or user interaction may leave another tool active between
          // passes, so BRUSH rendering must establish the Brush Tool before
          // reading/updating brush settings instead of assuming prior tool state.
          await action.batchPlay(
            [selectPaintbrushToolDescriptor()],
            { synchronousExecution: true }
          );
          const initialBrush = await snapshotBrushSettings({ synchronousExecution: true });
          brushBaseline = { ...initialBrush.settings };
          brushState = { ...brushBaseline };
        }
        let cachedColor = currentForegroundRgb();

        for (let index = 0; index < strokes.length; index++) {
          const stroke = strokes[index];
          const strokeToolName = String(stroke.tool ?? 'BRUSH').toUpperCase();
          const usesBrushSettings = strokeToolName === 'BRUSH';
          let brushChanged = false;
          if (usesBrushSettings) {
            const desiredStyle = batchBrushStyle(brushBaseline, stroke);
            brushChanged = !sameCoreBrushStyle(desiredStyle, brushState);
            brushState = { ...brushState, ...desiredStyle };
          }
          const colorChanged = Boolean(stroke.color && !samePaintColor(cachedColor, stroke.color));
          if (colorChanged) {
            if (hasBrushStroke) brushStateDirty = true;
            setForegroundColorModal(stroke.color);
            cachedColor = {
              red: Number(stroke.color.red),
              green: Number(stroke.color.green),
              blue: Number(stroke.color.blue),
            };
          }
          // In this UXP host, assigning app.foregroundColor inside the same
          // painting modal can restore the pre-assignment brush opacity/flow.
          // Re-apply the desired core brush state after a color write so
          // per-stroke style semantics match the legacy PathItem route.
          if (usesBrushSettings && (brushChanged || brushStateDirty)) {
            const updated = await applyBrushSettingsModal({
              size: Number(brushState.size),
              opacity: Number(brushState.opacity),
              flow: Number(brushState.flow),
            });
            brushState = { ...updated.settings };
            brushStateDirty = false;
          }

          const pathName = `__MCP_PAINT_${Date.now()}_${index}`;
          await doc.pathItems.add(pathName, [makeUxpStrokeSubPath(stroke)]);
          try {
            const tool = constants.ToolType[strokeToolName];
            if (!tool) throw new Error(`unsupported UXP stroke tool: ${String(stroke.tool)}`);
            // Tool/color writes may affect channel targeting. Pin the mask immediately before every draw.
            if (maskPainting) await selectStrokeMaskChannelModal(doc, targetLayerId);
            await strokeNamedPathModal(doc, pathName, tool, stroke.simulatePressure);
          } finally {
            await deleteNamedPathModal(pathName);
          }
        }
        if (maskPainting) { setForegroundColorModal(originalColor); brushStateDirty = true; }
        // Local overrides must not become the baseline of a later AUTO chunk
        // or painting call. Persistent configuration belongs to set_brush.
        await restoreBatchBrushStyle(brushBaseline, brushState, brushStateDirty);
        brushState = brushBaseline;
        brushStateDirty = false;
        if (originalLayerId != null && originalLayerId !== targetLayerId) {
          await action.batchPlay(
            [selectLayerByIdDescriptor(originalLayerId)],
            { synchronousExecution: true }
          );
        }
        if (maskPainting) doc.activeChannels = originalChannels;
        const paintTarget = paintTargetCompositing(doc, targetLayerId);
        await executionContext.hostControl.resumeHistory(suspensionId, true);
        committed = true;
        return {
          ok: true,
          stroke_count: strokes.length,
          layer_id: targetLayerId,
          layer_name: String(targetDescriptor.name ?? ''),
          paint_target: paintTarget,
          coordinate_space: 'canvas_pixels',
          document_resolution_dpi: resolution,
          path_coordinate_scale: 1,
          stroke_tool_readiness: strokeToolReadiness,
          ...(maskPainting ? { ...maskDetails, original_preserved: true, paint_channel: 'layer-mask' } : {}),
        };
      } catch (error) {
        if (!committed) {
          try { await executionContext.hostControl.resumeHistory(suspensionId, false); } catch {}
        }
        throw error;
      } finally {
        if (!committed) {
          if (maskPainting) { try { setForegroundColorModal(originalColor); brushStateDirty = true; } catch {} }
          try { await restoreBatchBrushStyle(brushBaseline, brushState, brushStateDirty); } catch {}
        }
        if (originalLayerId != null && originalLayerId !== targetLayerId) {
          try {
            await action.batchPlay(
              [selectLayerByIdDescriptor(originalLayerId)],
              { synchronousExecution: true }
            );
          } catch {}
        }
        if (!committed && maskPainting && originalChannels.length) {
          try { doc.activeChannels = originalChannels; } catch {}
        }
      }
    },
    { commandName: 'MCP Digital Painting' }
  );
}

async function paintDabsBatch(params = {}) {
  const groups = Array.isArray(params.groups) ? params.groups : [];
  if (groups.length < 1) throw new Error('groups must be a non-empty array');
  const target = await preparePaintTarget(params, 'paint_dabs');
  const { doc, targetLayerId, targetDescriptor, originalLayerId, resolution } = target;
  return core.executeAsModal(
    async (executionContext) => {
      const suspensionId = await executionContext.hostControl.suspendHistory({
        documentID: doc.id,
        name: 'MCP Paint Dabs',
      });
      let committed = false;
      let brushBaseline = null;
      let brushState = null;
      let brushStateDirty = false;
      try {
        if (targetLayerId !== originalLayerId) {
          await action.batchPlay(
            [selectLayerByIdDescriptor(targetLayerId)],
            { synchronousExecution: true }
          );
        }
        await action.batchPlay([selectPaintbrushToolDescriptor()], { synchronousExecution: true });
        const initialBrush = await snapshotBrushSettings({ synchronousExecution: true });
        brushBaseline = { ...initialBrush.settings };
        brushState = { ...brushBaseline };

        for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
          const group = groups[groupIndex];
          const desiredStyle = batchBrushStyle(brushBaseline, group);
          const brushChanged = !sameCoreBrushStyle(desiredStyle, brushState);
          brushState = { ...brushState, ...desiredStyle };
          const colorWritten = Boolean(group.color);
          if (colorWritten) {
            brushStateDirty = true;
            setForegroundColorModal(group.color);
          }
          // Foreground-color assignment can restore stale brush opacity/flow
          // inside the same modal. Restore the desired style after every color
          // write, including color-only groups that use the batch baseline.
          if (brushChanged || colorWritten) {
            const updated = await applyBrushSettingsModal({
              size: Number(brushState.size),
              opacity: Number(brushState.opacity),
              flow: Number(brushState.flow),
            });
            brushState = { ...updated.settings };
            brushStateDirty = false;
          }
          const points = Array.isArray(group.points) ? group.points : [];
          const pathName = `__MCP_DABS_${Date.now()}_${groupIndex}`;
          await doc.pathItems.add(pathName, points.map(makeUxpDabSubPath));
          try {
            await strokeNamedPathModal(doc, pathName, constants.ToolType.BRUSH, false);
          } finally {
            await deleteNamedPathModal(pathName);
          }
        }
        await restoreBatchBrushStyle(brushBaseline, brushState, brushStateDirty);
        brushState = brushBaseline;
        brushStateDirty = false;
        if (originalLayerId != null && originalLayerId !== targetLayerId) {
          await action.batchPlay(
            [selectLayerByIdDescriptor(originalLayerId)],
            { synchronousExecution: true }
          );
        }
        const paintTarget = paintTargetCompositing(doc, targetLayerId);
        await executionContext.hostControl.resumeHistory(suspensionId, true);
        committed = true;
        return {
          ok: true,
          group_count: groups.length,
          layer_id: targetLayerId,
          layer_name: String(targetDescriptor.name ?? ''),
          paint_target: paintTarget,
          coordinate_space: 'canvas_pixels',
          document_resolution_dpi: resolution,
          path_coordinate_scale: 1,
        };
      } catch (error) {
        if (!committed) {
          try { await executionContext.hostControl.resumeHistory(suspensionId, false); } catch {}
        }
        throw error;
      } finally {
        if (!committed) {
          try { await restoreBatchBrushStyle(brushBaseline, brushState, brushStateDirty); } catch {}
        }
        if (originalLayerId != null && originalLayerId !== targetLayerId) {
          try {
            await action.batchPlay(
              [selectLayerByIdDescriptor(originalLayerId)],
              { synchronousExecution: true }
            );
          } catch {}
        }
      }
    },
    { commandName: 'MCP Paint Dabs' }
  );
}

async function paintRegions(params = {}) {
  const regions = Array.isArray(params.regions) ? params.regions : [];
  if (regions.length < 1) throw new Error('regions must be a non-empty array');
  const clipBounds =
    params.clip_bounds && typeof params.clip_bounds === 'object'
      ? params.clip_bounds
      : null;
  const requestedDocumentId =
    Number.isInteger(params.document_id) && params.document_id > 0
      ? params.document_id
      : null;

  const descriptors = await readSessionDescriptors();
  if (descriptors.documentCount <= 0) throw new Error('No active document');
  const activeDocumentId = numericValue(descriptors.documentDescriptor?.documentID);
  if (requestedDocumentId != null && activeDocumentId !== requestedDocumentId) {
    const openIds = Array.from(app.documents ?? []).map((doc) => doc.id);
    if (!openIds.includes(requestedDocumentId)) {
      throw new Error(`document_not_found: no open document with id ${requestedDocumentId}`);
    }
    throw new Error(
      `document_not_active: pinned document ${requestedDocumentId} is open but not active; active document was not changed`
    );
  }

  const width = documentPixelDimension(descriptors.documentDescriptor?.width, descriptors.documentDescriptor?.resolution);
  const height = documentPixelDimension(descriptors.documentDescriptor?.height, descriptors.documentDescriptor?.resolution);
  const resolution = numericValue(descriptors.documentDescriptor?.resolution) ?? 72;
  if (width == null || height == null) throw new Error('paint_regions document geometry unavailable');

  const doc = app.activeDocument;
  const originalLayer = Array.from(doc.activeLayers ?? [])[0] ?? null;
  const originalLayerId = originalLayer?.id ?? null;
  if (!Number.isInteger(originalLayerId) || originalLayerId <= 0) {
    throw new Error('paint_regions requires an active layer');
  }

  const targets = [];
  for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
    const region = regions[regionIndex];
    const targetId =
      Number.isInteger(region?.layerId) && region.layerId > 0
        ? region.layerId
        : originalLayerId;
    const [targetDescriptor] = await action.batchPlay(
      [layerByIdDescriptor(targetId)],
      READ_BATCHPLAY_OPTIONS
    );
    if (!targetDescriptor || targetDescriptor._obj === 'error') {
      throw new Error(`Target layer not found for region ${region?.id || regionIndex}`);
    }
    validatePaintTargetDescriptor(targetDescriptor, 'paint_regions');
    const contours = Array.isArray(region?.contours) ? region.contours : [];
    for (let contourIndex = 0; contourIndex < contours.length; contourIndex++) {
      const points = Array.isArray(contours[contourIndex]?.points)
        ? contours[contourIndex].points
        : [];
      const criticalPoints = bezierCriticalPoints(points, true);
      for (let pointIndex = 0; pointIndex < criticalPoints.length; pointIndex++) {
        assertCanvasPoint(
          criticalPoints[pointIndex],
          `regions[${regionIndex}].contours[${contourIndex}].curve[${pointIndex}]`,
          width,
          height,
          clipBounds
        );
      }
    }
    targets.push({ id: targetId, descriptor: targetDescriptor });
  }

  if (params.replace_contents === true && (!requestedDocumentId || targets.some((target, i) =>
    !Number.isInteger(regions[i]?.layerId) || regions[i].layerId <= 0 || target.id !== targets[0].id)
    || targets[0].descriptor.background === true)) {
    throw new Error('region_rebuild_requires_one_pinned_nonbackground_raster_layer');
  }
  return core.executeAsModal(
    async (executionContext) => {
      const suspensionId = await executionContext.hostControl.suspendHistory({
        documentID: doc.id,
        name: 'MCP Paint Regions',
      });
      const painted = [];
      let committed = false;
      try {
        if (params.replace_contents === true) {
          const selected = await action.batchPlay([selectLayerByIdDescriptor(targets[0].id), {
            _obj: 'select', _target: [{ _ref: 'channel', _enum: 'channel', _value: 'RGB' }],
            _options: { dialogOptions: 'silent' },
          }], { synchronousExecution: true });
          if (selected.some(result => result?._obj === 'error')) throw new Error('component_rebuild_pixel_target_failed');
          await doc.selection.selectAll();
          const cleared = await action.batchPlay([{ _obj: 'delete', _options: { dialogOptions: 'silent' } }], { synchronousExecution: true });
          if (cleared.some(result => result?._obj === 'error')) throw new Error('component_rebuild_clear_failed');
          await doc.selection.deselect();
        }
        for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
          const region = regions[regionIndex];
          const target = targets[regionIndex];
          if (target.id !== originalLayerId || regionIndex > 0) {
            await action.batchPlay(
              [selectLayerByIdDescriptor(target.id)],
              { synchronousExecution: true }
            );
          }
          const subpaths = region.contours.map(makeUxpRegionSubPath);
          const pathName = `__MCP_REGION_${Date.now()}_${regionIndex}`;
          await doc.pathItems.add(pathName, subpaths);
          try {
            await action.batchPlay(
              [{
                _obj: 'set',
                _target: [{ _property: 'selection', _ref: 'channel' }],
                to: { _ref: 'path', _name: pathName },
                version: 1,
                vectorMaskParams: true,
                _options: { dialogOptions: 'silent' },
              }],
              { synchronousExecution: true }
            );
            await action.batchPlay(
              [{
                _obj: 'fill',
                using: { _enum: 'fillContents', _value: 'color' },
                color: {
                  _obj: 'RGBColor',
                  red: Number(region.color.red),
                  green: Number(region.color.green),
                  blue: Number(region.color.blue),
                },
                opacity: { _unit: 'percentUnit', _value: Number(region.opacity) },
                mode: { _enum: 'blendMode', _value: 'normal' },
                _options: { dialogOptions: 'silent' },
              }],
              { synchronousExecution: true }
            );
            await doc.selection.deselect();
          } finally {
            try { await doc.selection.deselect(); } catch {}
            try {
              await action.batchPlay(
                [{
                  _obj: 'delete',
                  _target: [{ _ref: 'path', _name: pathName }],
                  _options: { dialogOptions: 'silent' },
                }],
                { synchronousExecution: true }
              );
            } catch {}
          }
          painted.push({
            id: region.id || String(regionIndex),
            layer_id: target.id,
            layer_name: String(target.descriptor.name ?? ''),
            paint_target: paintTargetCompositing(doc, target.id),
            contour_count: region.contours.length,
            opacity: Number(region.opacity),
          });
        }
        if (originalLayerId != null) {
          await action.batchPlay(
            [selectLayerByIdDescriptor(originalLayerId)],
            { synchronousExecution: true }
          );
        }
        await executionContext.hostControl.resumeHistory(suspensionId, true);
        committed = true;
        return {
          ok: true,
          region_count: regions.length,
          painted_regions: painted,
          coordinate_space: 'canvas_pixels',
          document_resolution_dpi: resolution,
          path_coordinate_scale: 1,
          clip_bounds: clipBounds,
        };
      } catch (error) {
        if (!committed) {
          try { await executionContext.hostControl.resumeHistory(suspensionId, false); } catch {}
        }
        throw error;
      } finally {
        if (originalLayerId != null) {
          try {
            await action.batchPlay(
              [selectLayerByIdDescriptor(originalLayerId)],
              { synchronousExecution: true }
            );
          } catch {}
        }
      }
    },
    { commandName: 'MCP Paint Regions' }
  );
}

function previewDocumentDescriptor(documentId) {
  const target = Number.isInteger(documentId) && documentId > 0
    ? { _ref: [{ _ref: 'document', _id: documentId }] }
    : { _ref: [{ _ref: 'document', _enum: 'ordinal', _value: 'targetEnum' }] };
  return {
    _obj: 'multiGet',
    _target: target,
    extendedReference: [[
      'documentID',
      'title',
      'width',
      'height',
      'resolution',
    ]],
    options: { failOnMissingProperty: false, failOnMissingElement: false },
    _options: { dialogOptions: 'dontDisplay' },
  };
}

async function readPreviewDocumentDescriptor(documentId) {
  const [descriptor] = await action.batchPlay(
    [previewDocumentDescriptor(documentId)],
    READ_BATCHPLAY_OPTIONS
  );
  if (!descriptor || descriptor._obj === 'error') {
    throw new Error(
      Number.isInteger(documentId) && documentId > 0
        ? `document_not_found: no open document with id ${documentId}`
        : 'No active document'
    );
  }
  // `multiGet` may return width/height as distanceUnit while omitting
  // `resolution` even though the DOM document has a valid positive DPI.
  // Fall back to the matching DOM document so preview geometry can still be
  // converted to pixels instead of failing before capture.
  const domDocument = Number.isInteger(documentId) && documentId > 0
    ? Array.from(app.documents ?? []).find((doc) => doc.id === documentId)
    : app.activeDocument;
  const resolution =
    numericValue(descriptor.resolution) ?? numericValue(domDocument?.resolution) ?? 72;
  const width = documentPixelDimension(descriptor.width, resolution);
  const height = documentPixelDimension(descriptor.height, resolution);
  if (width == null || height == null || width <= 0 || height <= 0) {
    throw new Error('preview_document_geometry_unavailable');
  }
  return {
    id: numericValue(descriptor.documentID),
    name: typeof descriptor.title === 'string' ? descriptor.title : undefined,
    width,
    height,
  };
}

function previewTargetDimensions(width, height, maxDimension) {
  const safeMax = Math.max(64, Math.min(4096, Number(maxDimension) || 1024));
  const scale = Math.max(width, height) > safeMax
    ? safeMax / Math.max(width, height)
    : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function clampPreviewRegion(region, width, height) {
  if (!region || typeof region !== 'object') return null;
  const left = Math.max(0, Math.min(width, Number(region.left)));
  const top = Math.max(0, Math.min(height, Number(region.top)));
  const right = Math.max(0, Math.min(width, Number(region.right)));
  const bottom = Math.max(0, Math.min(height, Number(region.bottom)));
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
    throw new Error('Preview focus region is empty after clamping');
  }
  return { left, top, right, bottom };
}

async function encodePreviewPixels(documentId, sourceBounds, targetSize) {
  const imagingApi = photoshop.imaging;
  let sourceImageData = null;
  let canvasImageData = null;
  try {
    const pixelResult = await imagingApi.getPixels({
      documentID: documentId,
      sourceBounds,
      targetSize,
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: true,
    });
    sourceImageData = pixelResult?.imageData ?? null;
    if (!sourceImageData) throw new Error('preview_pixels_unavailable');

    let imageDataForEncoding = sourceImageData;
    const sourceWidth = numericValue(sourceImageData.width);
    const sourceHeight = numericValue(sourceImageData.height);
    if (sourceWidth == null || sourceHeight == null) {
      throw new Error('preview_pixels_geometry_unavailable');
    }

    const levelScale = Math.pow(2, Math.max(0, numericValue(pixelResult.level) ?? 0));
    const actualBounds = pixelResult.sourceBounds;
    const actualFull = actualBounds
      ? {
          left: numericValue(actualBounds.left) * levelScale,
          top: numericValue(actualBounds.top) * levelScale,
          right: numericValue(actualBounds.right) * levelScale,
          bottom: numericValue(actualBounds.bottom) * levelScale,
        }
      : sourceBounds;

    const requestedWidth = sourceBounds.right - sourceBounds.left;
    const requestedHeight = sourceBounds.bottom - sourceBounds.top;
    const offsetX = Math.max(
      0,
      Math.round(((actualFull.left - sourceBounds.left) / requestedWidth) * targetSize.width)
    );
    const offsetY = Math.max(
      0,
      Math.round(((actualFull.top - sourceBounds.top) / requestedHeight) * targetSize.height)
    );

    if (
      sourceWidth !== targetSize.width ||
      sourceHeight !== targetSize.height ||
      offsetX !== 0 ||
      offsetY !== 0
    ) {
      const sourcePixels = await sourceImageData.getData({ chunky: true });
      const components = numericValue(sourceImageData.components) ?? 3;
      if (components !== 3) throw new Error('preview_pixels_expected_rgb');
      const canvas = new Uint8Array(targetSize.width * targetSize.height * 3);
      canvas.fill(255);
      const copyWidth = Math.max(0, Math.min(sourceWidth, targetSize.width - offsetX));
      const copyHeight = Math.max(0, Math.min(sourceHeight, targetSize.height - offsetY));
      for (let y = 0; y < copyHeight; y++) {
        const srcStart = y * sourceWidth * 3;
        const srcEnd = srcStart + copyWidth * 3;
        const dstStart = ((y + offsetY) * targetSize.width + offsetX) * 3;
        canvas.set(sourcePixels.slice(srcStart, srcEnd), dstStart);
      }
      canvasImageData = await imagingApi.createImageDataFromBuffer(canvas, {
        width: targetSize.width,
        height: targetSize.height,
        components: 3,
        chunky: true,
        colorSpace: 'RGB',
        colorProfile: sourceImageData.colorProfile || '',
      });
      imageDataForEncoding = canvasImageData;
    }

    const base64 = await imagingApi.encodeImageData({
      imageData: imageDataForEncoding,
      base64: true,
    });
    if (typeof base64 !== 'string' || base64.length === 0) {
      throw new Error('preview_encode_failed');
    }
    return {
      base64,
      width: targetSize.width,
      height: targetSize.height,
      mimeType: 'image/jpeg',
    };
  } finally {
    if (canvasImageData && typeof canvasImageData.dispose === 'function') canvasImageData.dispose();
    if (sourceImageData && typeof sourceImageData.dispose === 'function') sourceImageData.dispose();
  }
}

async function capturePreview(params = {}) {
  const requestedId = Number.isInteger(params.document_id) && params.document_id > 0
    ? params.document_id
    : undefined;
  const documentInfo = await readPreviewDocumentDescriptor(requestedId);
  const documentId = documentInfo.id;
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new Error('preview_document_id_unavailable');
  }

  const wholeBounds = {
    left: 0,
    top: 0,
    right: documentInfo.width,
    bottom: documentInfo.height,
  };
  const wholeTarget = previewTargetDimensions(
    documentInfo.width,
    documentInfo.height,
    params.max_dimension_px
  );
  const focusRegion = params.focus_region
    ? clampPreviewRegion(params.focus_region, documentInfo.width, documentInfo.height)
    : null;
  const focusTarget = focusRegion
    ? previewTargetDimensions(
        focusRegion.right - focusRegion.left,
        focusRegion.bottom - focusRegion.top,
        params.focus_max_dimension_px ?? 1200
      )
    : null;

  return core.executeAsModal(
    async () => {
      const whole = await encodePreviewPixels(documentId, wholeBounds, wholeTarget);
      const focus = focusRegion && focusTarget
        ? {
            ...(await encodePreviewPixels(documentId, focusRegion, focusTarget)),
            region: focusRegion,
            canvasWidth: documentInfo.width,
            canvasHeight: documentInfo.height,
          }
        : undefined;
      return {
        transport: 'uxp',
        whole: {
          ...whole,
          canvasWidth: documentInfo.width,
          canvasHeight: documentInfo.height,
        },
        ...(focus ? { focus } : {}),
      };
    },
    { commandName: 'MCP Read Preview' }
  );
}

function colorHex(red, green, blue) {
  const hex2 = (value) => {
    const hex = Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .toUpperCase();
    return hex.length < 2 ? `0${hex}` : hex;
  };
  return `#${hex2(red)}${hex2(green)}${hex2(blue)}`;
}

async function sampleCompositeRegion(documentId, bounds) {
  const imagingApi = photoshop.imaging;
  let imageData = null;
  try {
    const pixelResult = await imagingApi.getPixels({
      documentID: documentId,
      sourceBounds: bounds,
      colorSpace: 'RGB',
      componentSize: 8,
      applyAlpha: true,
    });
    imageData = pixelResult?.imageData ?? null;
    if (!imageData) {
      return { red: 255, green: 255, blue: 255 };
    }

    const pixels = await imageData.getData({ chunky: true });
    const components = numericValue(imageData.components) ?? 3;
    if (components < 3) throw new Error('sample_color_expected_rgb');

    const requestedPixelCount =
      Math.max(0, Math.round(bounds.right - bounds.left)) *
      Math.max(0, Math.round(bounds.bottom - bounds.top));
    if (requestedPixelCount <= 0) throw new Error('sample_color_empty_bounds');

    let red = 0;
    let green = 0;
    let blue = 0;
    const returnedPixelCount = Math.floor(pixels.length / components);
    for (let index = 0; index < returnedPixelCount; index++) {
      const offset = index * components;
      red += pixels[offset] ?? 255;
      green += pixels[offset + 1] ?? 255;
      blue += pixels[offset + 2] ?? 255;
    }

    // Imaging may trim fully transparent pixels from the requested bounds.
    // The legacy merged-duplicate sampler observes the whole requested square;
    // account for trimmed pixels as white so bounds semantics remain stable.
    const missing = Math.max(0, requestedPixelCount - returnedPixelCount);
    red += missing * 255;
    green += missing * 255;
    blue += missing * 255;

    return {
      red: red / requestedPixelCount,
      green: green / requestedPixelCount,
      blue: blue / requestedPixelCount,
    };
  } finally {
    if (imageData && typeof imageData.dispose === 'function') imageData.dispose();
  }
}

function normalizeSampleRgb(rgb) {
  const rgb8 = {
    red: Math.max(0, Math.min(255, Math.round(rgb.red))),
    green: Math.max(0, Math.min(255, Math.round(rgb.green))),
    blue: Math.max(0, Math.min(255, Math.round(rgb.blue))),
  };
  return {
    rgb,
    rgb_8bit: rgb8,
    hex: colorHex(rgb8.red, rgb8.green, rgb8.blue),
  };
}

async function sampleColor(params = {}) {
  const x = Number(params.x);
  const y = Number(params.y);
  const radius = Number(params.radius ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('sample_color requires finite x/y');
  }
  if (!Number.isInteger(radius) || radius < 0 || radius > 100) {
    throw new Error('radius must be an integer between 0 and 100');
  }

  const requestedId = Number.isInteger(params.document_id) && params.document_id > 0
    ? params.document_id
    : undefined;
  const documentInfo = await readPreviewDocumentDescriptor(requestedId);
  const documentId = documentInfo.id;
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new Error('sample_color_document_id_unavailable');
  }
  if (x < 0 || y < 0 || x >= documentInfo.width || y >= documentInfo.height) {
    throw new Error(
      `sample_out_of_bounds: point (${x}, ${y}) is outside ${documentInfo.width}x${documentInfo.height}`
    );
  }

  const bounds = radius > 0
    ? {
        left: Math.max(0, x - radius),
        top: Math.max(0, y - radius),
        right: Math.min(documentInfo.width, x + radius + 1),
        bottom: Math.min(documentInfo.height, y + radius + 1),
      }
    : { left: x, top: y, right: x + 1, bottom: y + 1 };

  const rgb = await core.executeAsModal(
    () => sampleCompositeRegion(documentId, bounds),
    { commandName: 'MCP Sample Color' }
  );
  const normalized = normalizeSampleRgb(rgb);
  return {
    ok: true,
    document: {
      id: documentId,
      name: documentInfo.name,
      width: documentInfo.width,
      height: documentInfo.height,
    },
    point: { x, y },
    mode: radius > 0 ? 'AVERAGE' : 'POINT',
    radius,
    bounds: radius > 0
      ? {
          ...bounds,
          width: bounds.right - bounds.left,
          height: bounds.bottom - bounds.top,
        }
      : null,
    ...normalized,
  };
}

async function sampleColors(params = {}) {
  const points = Array.isArray(params.points) ? params.points : [];
  if (points.length < 1 || points.length > 1024) {
    throw new Error('points must contain between 1 and 1024 entries');
  }
  const requestedId = Number.isInteger(params.document_id) && params.document_id > 0
    ? params.document_id
    : undefined;
  const documentInfo = await readPreviewDocumentDescriptor(requestedId);
  const documentId = documentInfo.id;
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new Error('sample_colors_document_id_unavailable');
  }

  const normalizedPoints = points.map((point, index) => {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`points[${index}] requires finite x/y`);
    }
    if (x < 0 || y < 0 || x >= documentInfo.width || y >= documentInfo.height) {
      throw new Error(
        `sample_out_of_bounds: point (${x}, ${y}) is outside ${documentInfo.width}x${documentInfo.height}`
      );
    }
    return {
      id: point?.id === undefined ? null : String(point.id),
      x,
      y,
    };
  });

  const samples = await core.executeAsModal(
    async () => {
      const values = [];
      for (const point of normalizedPoints) {
        const rgb = await sampleCompositeRegion(documentId, {
          left: point.x,
          top: point.y,
          right: point.x + 1,
          bottom: point.y + 1,
        });
        values.push({
          id: point.id,
          point: { x: point.x, y: point.y },
          ...normalizeSampleRgb(rgb),
        });
      }
      return values;
    },
    { commandName: 'MCP Sample Colors' }
  );

  return {
    ok: true,
    document: {
      id: documentId,
      name: documentInfo.name,
      width: documentInfo.width,
      height: documentInfo.height,
    },
    mode: 'POINT_BATCH',
    count: samples.length,
    samples,
  };
}

function historyStateDescriptor(indexOrTarget) {
  return {
    _obj: 'get',
    _target: [
      indexOrTarget === 'target'
        ? { _ref: 'historyState', _enum: 'ordinal', _value: 'targetEnum' }
        : { _ref: 'historyState', _index: indexOrTarget },
    ],
    _options: { dialogOptions: 'dontDisplay' },
  };
}

async function snapshotHistory() {
  const sessionDescriptors = await readSessionDescriptors();
  if ((sessionDescriptors.documentCount ?? 0) < 1) {
    throw new Error('No active document');
  }
  const [current] = await action.batchPlay(
    [historyStateDescriptor('target')],
    READ_BATCHPLAY_OPTIONS
  );
  if (!current || current._obj === 'error') {
    throw new Error('history_state_unavailable');
  }
  const count = Math.max(0, Math.round(numericValue(current.count) ?? 0));
  const descriptors = count > 0
    ? await action.batchPlay(
        Array.from({ length: count }, (_, index) => historyStateDescriptor(index + 1)),
        READ_BATCHPLAY_OPTIONS
      )
    : [];
  const states = descriptors.map((descriptor) => ({
    name: typeof descriptor?.name === 'string' ? descriptor.name : 'Unknown',
    snapshot: descriptor?.auto === false,
  }));
  const itemIndex = Math.round(numericValue(current.itemIndex) ?? 0);
  const currentIndex = itemIndex > 0 ? itemIndex - 1 : -1;
  return {
    totalStates: states.length,
    currentIndex,
    currentState:
      currentIndex >= 0 && currentIndex < states.length
        ? states[currentIndex].name
        : (typeof current.name === 'string' ? current.name : 'Unknown'),
    canUndo: currentIndex > 0,
    canRedo: currentIndex >= 0 && currentIndex < states.length - 1,
    states,
    context: normalizeSessionState(sessionDescriptors),
  };
}

function structuredDocumentResult(document, extra = {}) {
  const documentId = numericValue(document?.id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new Error('uxp_document_id_unavailable');
  }
  const activeDocumentId = numericValue(app.activeDocument?.id) ?? null;
  return {
    transport: 'uxp',
    ...extra,
    document: {
      id: documentId,
      name: typeof document?.name === 'string' ? document.name : '',
      width: numericValue(document?.width),
      height: numericValue(document?.height),
      resolution: numericValue(document?.resolution),
    },
    active_document_id: activeDocumentId,
  };
}

async function createDocumentMutation(params = {}) {
  const width = Number(params.width);
  const height = Number(params.height);
  const resolution = Number(params.resolution ?? 72);
  const colorMode = String(params.colorMode ?? 'RGB');
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('create_document requires positive finite width and height');
  }
  if (!Number.isFinite(resolution) || resolution <= 0) {
    throw new Error('create_document requires a positive finite resolution');
  }
  const colorModes = {
    RGB: constants.NewDocumentMode?.RGB ?? 'RGBColorMode',
    CMYK: constants.NewDocumentMode?.CMYK ?? 'CMYKColorMode',
    Grayscale: constants.NewDocumentMode?.GRAYSCALE ?? 'GrayscaleMode',
  };
  if (!Object.prototype.hasOwnProperty.call(colorModes, colorMode)) {
    throw new Error(`unsupported create_document color mode: ${colorMode}`);
  }

  const beforeIds = new Set(Array.from(app.documents).map(document => Number(document.id)));
  let createdResult;
  return core.executeAsModal(async () => {
    const document = await app.documents.add({
      width,
      height,
      resolution,
      mode: colorModes[colorMode],
      fill: constants.DocumentFill?.WHITE ?? 'white',
    });
    // Capture identity while the modal scope still owns creation. Some UXP
    // executeAsModal implementations don't propagate the callback return value.
    // A fallback is admissible only for the uniquely new document, never simply
    // whatever document happens to be active after the modal scope has ended.
    const newDocuments = Array.from(app.documents).filter(candidate => !beforeIds.has(Number(candidate.id)));
    const created = Number.isInteger(Number(document?.id)) && Number(document.id) > 0 && !beforeIds.has(Number(document.id))
      ? document : newDocuments.length === 1 ? newDocuments[0] : null;
    const result = structuredDocumentResult(created, {
      operation: 'create_document', requested: { width, height, resolution, colorMode },
    });
    createdResult = result;
  }, { commandName: 'MCP Create Document' }).then(() => createdResult);
}

async function openImageMutation(params = {}) {
  const filePath = typeof params.filePath === 'string' ? params.filePath.trim() : '';
  if (!filePath) throw new Error('open_image requires a non-empty filePath');
  const entry = await localFileSystem.getEntryWithUrl(fileUrlFromNativePath(filePath, 'open_image'));
  if (entry?.isFile === false) throw new Error(`open_image path is not a file: ${filePath}`);
  const document = await core.executeAsModal(
    () => app.open(entry),
    { commandName: 'MCP Open Image' }
  );
  return structuredDocumentResult(document, {
    operation: 'open_image',
    path: filePath,
  });
}

async function paintColorGradient(params = {}) {
  const requestedLayerId = Number(params.layer_id);
  const from = params.from || {}, to = params.to || {};
  const stops = Array.isArray(params.stops) ? params.stops : [];
  if (!Number.isInteger(requestedLayerId) || requestedLayerId <= 0) throw new Error('color_gradient requires layer_id');
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite) || (from.x === to.x && from.y === to.y)) throw new Error('color_gradient requires distinct finite from/to points');
  if (stops.length < 2 || stops.length > 4) throw new Error('color_gradient requires 2-4 stops');
  const normalizedStops = stops.map((stop, index) => {
    const position = Number(stop?.position), red = Number(stop?.red), green = Number(stop?.green), blue = Number(stop?.blue);
    if (![position, red, green, blue].every(Number.isFinite) || position < 0 || position > 1 || [red, green, blue].some(v => v < 0 || v > 255)) throw new Error(`Invalid color_gradient stop ${index}`);
    return { position, red, green, blue };
  });
  if (normalizedStops[0].position !== 0 || normalizedStops[normalizedStops.length - 1].position !== 1 || normalizedStops.some((s, i) => i > 0 && s.position <= normalizedStops[i - 1].position)) throw new Error('color_gradient stops must be strictly ordered from 0 to 1');
  return core.executeAsModal(async () => {
    const prepared = await prepareLayerMutation(params, 'color_gradient');
    const targetLayerId = requestedLayerId;
    const [targetDescriptor] = await action.batchPlay([layerByIdDescriptor(targetLayerId)], { synchronousExecution: true });
    if (!targetDescriptor || targetDescriptor._obj === 'error') throw new Error(`Color gradient target layer not found: ${targetLayerId}`);
    if (layerSectionValue(targetDescriptor) === 'layerSectionStart') throw new Error('Cannot paint a color gradient on a LayerSet');
    if (fillLayerLockState(targetDescriptor)) throw new Error('Cannot paint a color gradient on a fully locked layer');
    if (legacyLayerKind(targetDescriptor) === 'LayerKind.TEXT') throw new Error('Cannot paint a color gradient on a text layer. Rasterize it first.');
    const originalLayerId = prepared.originalActiveLayerId;
    if (originalLayerId !== targetLayerId) await action.batchPlay([selectLayerByIdDescriptor(targetLayerId)], { synchronousExecution: true });
    await action.batchPlay([{
      _obj: 'gradientClassEvent',
      from: { _obj: 'paint', horizontal: { _unit: 'pixelsUnit', _value: from.x }, vertical: { _unit: 'pixelsUnit', _value: from.y } },
      to: { _obj: 'paint', horizontal: { _unit: 'pixelsUnit', _value: to.x }, vertical: { _unit: 'pixelsUnit', _value: to.y } },
      type: { _enum: 'gradientType', _value: 'linear' }, dither: true, useMask: false, reverse: false,
      gradient: { _obj: 'gradientClassEvent', name: 'MCP Continuous Color Field', gradientForm: { _enum: 'gradientForm', _value: 'customStops' }, interfaceIconFrameDimmed: 4096,
        colors: normalizedStops.map(s => ({ _obj: 'colorStop', color: { _obj: 'RGBColor', red: s.red, green: s.green, blue: s.blue }, type: { _enum: 'colorStopType', _value: 'userStop' }, location: Math.round(s.position * 4096), midpoint: 50 })),
        transparency: [{ _obj: 'transferSpec', opacity: { _unit: 'percentUnit', _value: 100 }, location: 0, midpoint: 50 }, { _obj: 'transferSpec', opacity: { _unit: 'percentUnit', _value: 100 }, location: 4096, midpoint: 50 }] },
      _options: { dialogOptions: 'silent' },
    }], { synchronousExecution: true });
    if (originalLayerId != null && originalLayerId !== targetLayerId) await action.batchPlay([selectLayerByIdDescriptor(originalLayerId)], { synchronousExecution: true });
    return { applied: true, layer_id: targetLayerId, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, stops: normalizedStops, gradient_kind: 'raster-color-linear' };
  }, { commandName: 'MCP Continuous Color Field' });
}

function stampPlacementBounds(instance) {
  const size = Math.max(1, Number(instance.size) || 1);
  const half = size / 2;
  return {
    left: Number(instance.x) - half,
    top: Number(instance.y) - half,
    right: Number(instance.x) + half,
    bottom: Number(instance.y) + half,
  };
}

async function paintStampInstancesBatch(params = {}) {
  const instances = Array.isArray(params.instances) ? params.instances : [];
  if (instances.length < 1) throw new Error('instances must be a non-empty array');
  if (instances.length > 64) throw new Error('instances may contain at most 64 entries per semantic placement pass');
  const target = await preparePaintTarget(params, 'paint_stamp_instances');
  const { doc, targetLayerId, targetDescriptor, originalLayerId, resolution } = target;
  return core.executeAsModal(
    async (executionContext) => {
      const suspensionId = await executionContext.hostControl.suspendHistory({
        documentID: doc.id,
        name: 'MCP Stamp Placement',
      });
      const initialBrush = await snapshotBrushSettings({ synchronousExecution: true });
      let brushState = { ...initialBrush.settings };
      const initialColor = currentForegroundRgb();
      let cachedColor = { ...initialColor };
      const completed = [];
      let failed = null;
      let historyResumed = false;
      try {
        if (targetLayerId !== originalLayerId) {
          await action.batchPlay([selectLayerByIdDescriptor(targetLayerId)], { synchronousExecution: true });
        }
        for (let index = 0; index < instances.length; index++) {
          const instance = instances[index] ?? {};
          const instanceId = String(instance.instance_id ?? '').trim();
          try {
            let brushChanged = false;
            const desired = {
              size: Number(instance.size),
              opacity: instance.opacity === undefined ? Number(brushState.opacity) : Number(instance.opacity),
              flow: Number(brushState.flow),
              angle: instance.angle === undefined ? 0 : Number(instance.angle),
              flip_x: Boolean(instance.flip_x),
              flip_y: Boolean(instance.flip_y),
            };
            for (const [key, value] of Object.entries(desired)) {
              if (brushState[key] !== value) {
                brushState[key] = value;
                brushChanged = true;
              }
            }
            const colorChanged = Boolean(instance.color && !samePaintColor(cachedColor, instance.color));
            if (colorChanged) {
              setForegroundColorModal(instance.color);
              cachedColor = {
                red: Number(instance.color.red),
                green: Number(instance.color.green),
                blue: Number(instance.color.blue),
              };
            }
            if (brushChanged || colorChanged) {
              const updated = await applyBrushSettingsModal(desired);
              brushState = { ...updated.settings };
            }
            const pathName = `__MCP_STAMP_${Date.now()}_${index}`;
            await doc.pathItems.add(pathName, [makeUxpDabSubPath({ x: Number(instance.x), y: Number(instance.y) })]);
            try {
              await strokeNamedPathModal(doc, pathName, constants.ToolType.BRUSH, false);
            } finally {
              await deleteNamedPathModal(pathName);
            }
            completed.push({
              instance_id: instanceId,
              instance_index: index,
              source_bounds: stampPlacementBounds(instance),
              x: Number(instance.x),
              y: Number(instance.y),
              size: Number(instance.size),
              angle: desired.angle,
              flip_x: desired.flip_x,
              flip_y: desired.flip_y,
            });
          } catch (error) {
            failed = {
              instance_id: instanceId,
              instance_index: index,
              state: 'failed-or-uncertain',
              error: error?.message ?? String(error),
            };
            break;
          }
        }

        // Once any instance has been dispatched, commit the history suspension even
        // when a later instance fails. The durable stable-command receipt prevents
        // replay; the caller reconciles from fresh preview evidence.
        await executionContext.hostControl.resumeHistory(suspensionId, true);
        historyResumed = true;
        return {
          placement_status: failed ? 'partial' : 'complete',
          layer_id: targetLayerId,
          layer_name: String(targetDescriptor.name ?? ''),
          coordinate_space: 'canvas_pixels',
          document_resolution_dpi: resolution,
          completed_instances: completed,
          failed_or_uncertain_instance: failed,
          not_started_instances: failed
            ? instances.slice(Number(failed.instance_index) + 1).map((instance, offset) => ({
                instance_id: String(instance?.instance_id ?? '').trim(),
                instance_index: Number(failed.instance_index) + 1 + offset,
              }))
            : [],
        };
      } finally {
        if (!historyResumed) {
          try {
            await executionContext.hostControl.resumeHistory(suspensionId, completed.length > 0 || Boolean(failed));
          } catch (resumeError) {
            void resumeError;
          }
        }
        try {
          if (!samePaintColor(cachedColor, initialColor)) setForegroundColorModal(initialColor);
          await applyBrushSettingsModal(initialBrush.settings);
        } catch (restoreBrushError) {
          void restoreBrushError;
        }
        if (originalLayerId != null && originalLayerId !== targetLayerId) {
          try {
            await action.batchPlay([selectLayerByIdDescriptor(originalLayerId)], { synchronousExecution: true });
          } catch (restoreLayerError) {
            void restoreLayerError;
          }
        }
      }
    },
    { commandName: 'MCP Stamp Placement' }
  );
}

async function importBrushPackAsset(params = {}) {
  const filePath = typeof params.filePath === 'string' ? params.filePath.trim() : '';
  if (!filePath) throw new Error('brush_pack_import_unavailable: missing filePath');
  if (!filePath.toLowerCase().endsWith('.abr')) {
    throw new Error(`brush_pack_import_unavailable: unsupported brush-pack format for ${filePath}`);
  }
  let entry;
  try {
    entry = await localFileSystem.getEntryWithUrl(fileUrlFromNativePath(filePath, 'brush_pack_import'));
  } catch (error) {
    throw new Error(`brush_pack_import_unavailable: localFileSystem.getEntryWithUrl failed: ${error?.message ?? String(error)}`);
  }
  if (entry?.isFile === false) throw new Error(`brush_pack_import_unavailable: path is not a file: ${filePath}`);
  try {
    await core.executeAsModal(
      () => app.open(entry),
      { commandName: 'MCP Import Brush Pack' }
    );
  } catch (error) {
    throw new Error(`brush_pack_import_unavailable: Photoshop UXP app.open could not load this ABR: ${error?.message ?? String(error)}`);
  }
  return {
    imported: true,
    operation: 'import_brush_pack_asset',
    path: filePath,
    host_capability: 'uxp.localFileSystem+photoshop.app.open',
  };
}

async function probeMediaBrush(params = {}) {
  const presetName = typeof params.preset_name === 'string' ? params.preset_name.trim() : '';
  if (!presetName) throw new Error('brush_probe_requires_preset_name');
  let documentId = null;
  try {
    const created = await createDocumentMutation({ width: 960, height: 820, resolution: 72, colorMode: 'RGB' });
    documentId = Number(created?.document?.id);
    if (!Number.isInteger(documentId) || documentId <= 0) throw new Error('brush_probe_document_id_unavailable');
    const layer = await createLayerMutation({ document_id: documentId, name: '__MCP_BRUSH_PROBE__' });
    const layerId = Number(layer?.layer?.id ?? layer?.layerId ?? layer?.layer_id);
    if (!Number.isInteger(layerId) || layerId <= 0) throw new Error('brush_probe_layer_id_unavailable');
    const selected = await selectBrushPreset({ name: presetName });
    const baseSize = Math.max(24, Math.min(120, Number(selected?.settings?.size) || 64));
    const small = Math.max(12, Math.round(baseSize * 0.45));
    const medium = Math.max(24, Math.round(baseSize));
    const large = Math.max(48, Math.min(220, Math.round(baseSize * 1.8)));

    await paintDabsBatch({
      document_id: documentId,
      layer_id: layerId,
      groups: [
        { size: small, opacity: 100, flow: 100, color: { red: 35, green: 35, blue: 35 }, points: [{ x: 120, y: 120 }] },
        { size: medium, opacity: 100, flow: 100, color: { red: 35, green: 35, blue: 35 }, points: [{ x: 300, y: 120 }] },
        { size: large, opacity: 100, flow: 100, color: { red: 35, green: 35, blue: 35 }, points: [{ x: 540, y: 120 }] },
        { size: medium, opacity: 35, flow: 35, color: { red: 35, green: 35, blue: 35 }, points: [{ x: 760, y: 120 }, { x: 760, y: 120 }, { x: 760, y: 120 }] },
      ],
    });
    const makeStroke = (x1, y1, x2, y2, size, simulatePressure = false) => ({
      points: [{ x: x1, y: y1 }, { x: x2, y: y2 }],
      size,
      opacity: 100,
      flow: 100,
      color: { red: 35, green: 35, blue: 35 },
      tool: 'BRUSH',
      simulatePressure,
    });
    await paintStrokesBatch({
      document_id: documentId,
      layer_id: layerId,
      strokes: [
        makeStroke(90, 300, 300, 300, medium, false),
        makeStroke(90, 430, 870, 430, medium, false),
        makeStroke(90, 585, 420, 700, medium, false),
        makeStroke(540, 585, 870, 700, medium, true),
      ],
    });
    const preview = await capturePreview({ document_id: documentId, max_dimension_px: 1200 });
    return {
      operation: 'probe_media_brush',
      preset_name: presetName,
      effective_settings: selected?.settings ?? {},
      probe_document: { width: 960, height: 820 },
      layout: mediaBrushProbeLayout(),
      preview,
    };
  } finally {
    if (Number.isInteger(documentId) && documentId > 0) {
      try {
        await core.executeAsModal(
          () => action.batchPlay([{
            _obj: 'close',
            _target: [{ _ref: 'document', _id: documentId }],
            saving: { _enum: 'yesNo', _value: 'no' },
            _options: { dialogOptions: 'silent' },
          }], { synchronousExecution: true }),
          { commandName: 'MCP Close Brush Probe' }
        );
      } catch {}
    }
  }
}

function probeRect(left, top, right, bottom) {
  return { left, top, right, bottom };
}

function mediaBrushProbeLayout() {
  return {
    isolated_dabs: probeRect(40, 40, 650, 220),
    buildup: probeRect(675, 40, 900, 220),
    short_stroke: probeRect(40, 240, 350, 360),
    long_stroke: probeRect(40, 370, 920, 500),
    directional: probeRect(40, 520, 480, 770),
    pressure_response: probeRect(500, 520, 920, 770),
  };
}

function readSelectionFingerprint(targetDocument) {
  try {
    return {
      observed: true,
      bounds: normalizedBounds(targetDocument.selection?.bounds ?? null),
    };
  } catch {
    return { observed: false, bounds: null };
  }
}

function snapshotPersistenceState(targetDocument) {
  const selection = readSelectionFingerprint(targetDocument);
  const activeLayerIds = Array.from(targetDocument.activeLayers ?? [], (layer) => layer.id);
  return {
    target_document_id: targetDocument.id,
    active_document_id: app.activeDocument?.id ?? null,
    target_document_path: targetDocument.path ?? '',
    target_document_saved: Boolean(targetDocument.saved),
    active_layer_ids: activeLayerIds,
    active_tool_id: app.currentTool?.id ?? null,
    selection_observed: selection.observed,
    selection_bounds: selection.bounds,
  };
}

function sameSerializedValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function persistenceInvariants(before, after) {
  const selectionStable = before.selection_observed && after.selection_observed
    ? sameSerializedValue(before.selection_bounds, after.selection_bounds)
    : undefined;
  const checks = [
    ['active_document_unchanged', before.active_document_id === after.active_document_id],
    ['working_path_unchanged', before.target_document_path === after.target_document_path],
    ['active_layers_unchanged', sameSerializedValue(before.active_layer_ids, after.active_layer_ids)],
    ['active_tool_unchanged', before.active_tool_id === after.active_tool_id],
    ['selection_unchanged', selectionStable],
  ];
  const invariants = Object.fromEntries(checks);
  return {
    invariants,
    invariants_ok: checks.every(([, value]) => value === undefined || value === true),
  };
}

async function saveDocumentCopy(params) {
  const requestedId = Number.isInteger(params.document_id) ? params.document_id : null;
  const targetDocument = requestedId == null
    ? app.activeDocument
    : Array.from(app.documents).find((doc) => doc.id === requestedId);
  if (!targetDocument) {
    throw new Error(
      requestedId == null
        ? 'save_document requires an open document'
        : `document_not_found: no open document with id ${requestedId}`
    );
  }

  const format = String(params.format ?? 'PSD').toUpperCase();
  if (!['PSD', 'JPEG', 'PNG'].includes(format)) {
    throw new Error(`unsupported save_document format: ${format}`);
  }

  const before = snapshotPersistenceState(targetDocument);
  const entry = await localFileSystem.createEntryWithUrl(fileUrlFromNativePath(params.path), {
    type: types.file,
    overwrite: true,
  });

  await core.executeAsModal(
    async () => {
      if (format === 'PSD') {
        await targetDocument.saveAs.psd(entry, { embedColorProfile: true, layers: true }, true);
      } else if (format === 'JPEG') {
        const quality = Math.max(1, Math.min(12, Number(params.quality ?? 8)));
        await targetDocument.saveAs.jpg(entry, { quality, embedColorProfile: true }, true);
      } else {
        await targetDocument.saveAs.png(entry, {}, true);
      }
    },
    { commandName: 'MCP Save Copy' }
  );

  const after = snapshotPersistenceState(targetDocument);
  const probe = persistenceInvariants(before, after);
  if (!probe.invariants_ok) {
    const failed = Object.entries(probe.invariants)
      .filter(([, value]) => value === false)
      .map(([name]) => name)
      .join(', ');
    throw new Error(`persistence_invariant_violation:${failed}`);
  }

  return {
    transport: 'uxp',
    path: params.path,
    format,
    as_copy: true,
    before,
    after,
    ...probe,
  };
}

async function tryPostResult(payload) {
  try {
    const response = await fetch(`${BRIDGE_BASE}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function rememberPendingResult(payload) {
  const now = Date.now();
  for (const [id, pending] of pendingResultDeliveries) {
    if (now - pending.createdAt > RESULT_DELIVERY_TTL_MS) pendingResultDeliveries.delete(id);
  }
  pendingResultDeliveries.set(payload.id, { payload, createdAt: now });
  while (pendingResultDeliveries.size > MAX_PENDING_RESULT_DELIVERIES) {
    const oldestId = pendingResultDeliveries.keys().next().value;
    if (oldestId == null) break;
    pendingResultDeliveries.delete(oldestId);
  }
}

async function postResult(payload) {
  const currentPayload = {
    protocol: RESULT_PROTOCOL,
    ...payload,
  };
  if (await tryPostResult(currentPayload)) {
    pendingResultDeliveries.delete(currentPayload.id);
    return true;
  }
  // Result transport failure must never be converted into a Photoshop action
  // failure after the mutation already ran. Retain and redeliver the exact
  // payload while the companion remains alive.
  rememberPendingResult(currentPayload);
  return false;
}

async function flushPendingResults() {
  const now = Date.now();
  for (const [id, pending] of Array.from(pendingResultDeliveries.entries())) {
    if (now - pending.createdAt > RESULT_DELIVERY_TTL_MS) {
      pendingResultDeliveries.delete(id);
      continue;
    }
    if (await tryPostResult(pending.payload)) pendingResultDeliveries.delete(id);
  }
}

async function claimCommandForExecution(commandId) {
  try {
    const response = await fetch(`${BRIDGE_BASE}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: commandId }),
    });
    if (!response.ok) return { execute: false };
    return await response.json();
  } catch {
    return { execute: false };
  }
}

const NEURAL_FILTER_OBJECTS = Object.freeze({
  harmonize: 'harmonization',
  depth_blur: 'depthBlur',
  super_zoom: 'superZoom',
  colorize: 'colorize',
});

function neuralDescriptors(filter, params = {}) {
  if (filter === 'skin_smoothing') {
    return [{
      _obj: 'neuralGalleryFilters',
      neuralGalleryFilters: {
        _obj: 'skinSmoothing',
        smoothness: params.smoothness ?? 50,
        blur: params.blur ?? 50,
      },
    }];
  }
  const neuralObject = NEURAL_FILTER_OBJECTS[filter];
  if (!neuralObject) throw new Error(`Unknown neural filter: ${filter}`);
  return [{
    _obj: 'neuralGalleryFilters',
    neuralGalleryFilters: { _obj: neuralObject },
  }];
}

function pinnedDocumentSelectDescriptor(documentId) {
  return {
    _obj: 'select',
    _target: [{ _ref: 'document', _id: documentId }],
    _options: { dialogOptions: 'dontDisplay' },
  };
}

async function runNeuralFilter(params = {}) {
  const descriptors = neuralDescriptors(params.filter, params);
  const documentId = Number(params.document_id);
  if (Number.isInteger(documentId) && documentId > 0) {
    descriptors.unshift(pinnedDocumentSelectDescriptor(documentId));
  }
  return action.batchPlay(descriptors, {
    synchronousExecution: true,
    modalBehavior: 'execute',
  });
}

async function assertPinnedActiveDocument(actionName, params = {}) {
  if (actionName === 'set_active_document') return;

  const requestedDocumentId =
    Number.isInteger(params.document_id) && params.document_id > 0
      ? params.document_id
      : null;
  if (requestedDocumentId == null) return;

  const sessionDescriptors = await readSessionDescriptors({ synchronousExecution: true });
  const activeDocumentId = numericValue(sessionDescriptors.documentDescriptor?.documentID);
  if (activeDocumentId === requestedDocumentId) return;

  const documents = await snapshotDocumentList();
  const requestedDocumentIsOpen =
    Array.isArray(documents?.documents) &&
    documents.documents.some((document) => numericValue(document?.id) === requestedDocumentId);
  if (!requestedDocumentIsOpen) {
    throw new Error(
      `document_not_found: no open document with id ${requestedDocumentId}`
    );
  }
  throw new Error(
    `document_not_active: pinned document ${requestedDocumentId} is open but not active; active document was not changed`
  );
}

function constructorMethodNames(value) {
  return typeof value === 'function' ? Object.getOwnPropertyNames(value.prototype) : [];
}

function objectPrototypeMethodNames(value) {
  return value ? Object.getOwnPropertyNames(Object.getPrototypeOf(value)) : [];
}

function inspectPathApi(activeDocument) {
  const pathItems = activeDocument?.pathItems;
  return {
    appPathPointInfo: typeof app.PathPointInfo,
    modulePathPointInfo: typeof photoshop.PathPointInfo,
    appSubPathInfo: typeof app.SubPathInfo,
    moduleSubPathInfo: typeof photoshop.SubPathInfo,
    appPathItem: typeof app.PathItem,
    appPathItems: typeof app.PathItems,
    pathItemMethods: constructorMethodNames(app.PathItem),
    pathItemsMethods: constructorMethodNames(app.PathItems),
    activePathItemsObjectMethods: objectPrototypeMethodNames(pathItems),
    activePathItemsDynamic: pathItems
      ? { add: typeof pathItems.add, getByName: typeof pathItems.getByName }
      : null,
    pointKind: typeof photoshop.constants?.PointKind,
    shapeOperation: typeof photoshop.constants?.ShapeOperation,
    toolType: typeof photoshop.constants?.ToolType,
    colorBlendMode: typeof photoshop.constants?.ColorBlendMode,
  };
}

async function handleCommand(cmd) {
  const { id, action: cmdAction, params = {} } = cmd;

  try {
    await assertPinnedActiveDocument(cmdAction, params);
    if (cmdAction === 'close_document') {
      const requestedId = Number(params.document_id ?? app.activeDocument?.id);
      if (Number.isSafeInteger(requestedId) && requestedId > 0) {
        documentInstanceWitness(requestedId);
        markControlledClose(requestedId, id);
      }
    }
    const p1Document = await tryHandleP1DocumentOperation(cmdAction, params);
    if (p1Document?.handled) {
      await postResult({ id, ok: true, data: p1Document.data ?? {} });
      return;
    }
    const p1Selection = await tryHandleP1SelectionOperation(cmdAction, params);
    if (p1Selection?.handled) {
      await postResult({ id, ok: true, data: p1Selection.data ?? {} });
      return;
    }
    const p1Layer = await tryHandleP1LayerOperation(cmdAction, params);
    if (p1Layer?.handled) {
      await postResult({ id, ok: true, data: p1Layer.data ?? {} });
      return;
    }
    const p2Adjustment = await tryHandleP2AdjustmentOperation(cmdAction, params);
    if (p2Adjustment?.handled) {
      await postResult({ id, ok: true, data: p2Adjustment.data ?? {} });
      return;
    }
    const p2Filter = await tryHandleP2FilterOperation(cmdAction, params);
    if (p2Filter?.handled) {
      await postResult({ id, ok: true, data: p2Filter.data ?? {} });
      return;
    }
    const p2TextExport = await tryHandleP2TextExportOperation(cmdAction, params);
    if (p2TextExport?.handled) {
      await postResult({ id, ok: true, data: p2TextExport.data ?? {} });
      return;
    }
    const p3Utility = await tryHandleP3UtilityOperation(cmdAction, params);
    if (p3Utility?.handled) {
      await postResult({ id, ok: true, data: p3Utility.data ?? {} });
      return;
    }
    const p3DocumentData = await tryHandleP3DocumentDataOperation(cmdAction, params);
    if (p3DocumentData?.handled) {
      await postResult({ id, ok: true, data: p3DocumentData.data ?? {} });
      return;
    }
    const p3LayerAdvanced = await tryHandleP3LayerAdvancedOperation(cmdAction, params);
    if (p3LayerAdvanced?.handled) {
      await postResult({ id, ok: true, data: p3LayerAdvanced.data ?? {} });
      return;
    }

    if (cmdAction === 'create_document') {
      await postResult({ id, ok: true, data: await createDocumentMutation(params) });
      return;
    }

    if (cmdAction === 'open_image') {
      await postResult({ id, ok: true, data: await openImageMutation(params) });
      return;
    }

    if (cmdAction === 'import_brush_pack_asset') {
      await postResult({ id, ok: true, data: await importBrushPackAsset(params) });
      return;
    }

    if (cmdAction === 'probe_media_brush') {
      await postResult({ id, ok: true, data: await probeMediaBrush(params) });
      return;
    }

    if (cmdAction === 'diagnostic_ping') {
      const activeDocument = photoshop.app.activeDocument;
      await postResult({
        id,
        ok: true,
        data: {
          transport: 'uxp',
          bridgeRevision: BRIDGE_REVISION,
          photoshopVersion: photoshop.app.version,
          documentCount: photoshop.app.documents.length,
          activeDocument: activeDocument
            ? { id: activeDocument.id, name: activeDocument.name }
            : null,
          pathApi: inspectPathApi(activeDocument),
          pluginTimestampMs: Date.now(),
        },
      });
      return;
    }

    if (cmdAction === 'diagnostic_batchplay') {
      const started = Date.now();
      const descriptors = await readSessionDescriptors();
      await postResult({
        id,
        ok: true,
        data: {
          transport: 'uxp',
          operation: 'batchPlay:get:numberOfDocuments',
          photoshopActionMs: Date.now() - started,
          descriptor: descriptors.countDescriptor,
          stateDescriptors: {
            document: descriptors.documentDescriptor,
            layer: descriptors.layerDescriptor,
          },
          pluginTimestampMs: Date.now(),
        },
      });
      return;
    }

    if (cmdAction === 'get_state') {
      await postResult({ id, ok: true, data: await snapshotSessionState() });
      return;
    }

    if (cmdAction === 'list_documents') {
      await postResult({ id, ok: true, data: await snapshotDocumentList() });
      return;
    }

    if (cmdAction === 'get_selection_bounds') {
      await postResult({ id, ok: true, data: await snapshotSelectionBounds() });
      return;
    }

    if (cmdAction === 'list_layers') {
      await postResult({ id, ok: true, data: await snapshotLayerList() });
      return;
    }

    if (cmdAction === 'create_layer') {
      await postResult({ id, ok: true, data: await createLayerMutation(params) });
      return;
    }

    if (cmdAction === 'delete_layer') {
      await postResult({ id, ok: true, data: await deleteLayerMutation(params) });
      return;
    }

    if (cmdAction === 'select_layer_by_name') {
      await postResult({ id, ok: true, data: await selectLayerByNameMutation(params) });
      return;
    }

    if (cmdAction === 'undo') {
      await postResult({ id, ok: true, data: await undoMutation(params) });
      return;
    }

    if (cmdAction === 'create_layer_mask') {
      await postResult({ id, ok: true, data: await createLayerMaskMutation(params) });
      return;
    }

    if (cmdAction === 'apply_gradient_mask') {
      await postResult({ id, ok: true, data: await applyGradientMaskMutation(params) });
      return;
    }

    if (cmdAction === 'select_rectangle') {
      await postResult({ id, ok: true, data: await selectShapeMutation(params, 'rectangle') });
      return;
    }

    if (cmdAction === 'select_ellipse') {
      await postResult({ id, ok: true, data: await selectShapeMutation(params, 'ellipse') });
      return;
    }

    if (cmdAction === 'feather_selection') {
      await postResult({ id, ok: true, data: await featherSelectionMutation(params) });
      return;
    }

    if (cmdAction === 'select_subject') {
      await postResult({ id, ok: true, data: await selectSubjectMutation(params) });
      return;
    }

    if (cmdAction === 'set_layer_opacity') {
      await postResult({ id, ok: true, data: await setLayerOpacityMutation(params) });
      return;
    }

    if (cmdAction === 'set_layer_blend_mode') {
      await postResult({ id, ok: true, data: await setLayerBlendModeMutation(params) });
      return;
    }

    if (cmdAction === 'set_layer_visibility') {
      await postResult({ id, ok: true, data: await setLayerVisibilityMutation(params) });
      return;
    }

    if (cmdAction === 'set_layer_locked') {
      await postResult({ id, ok: true, data: await setLayerLockedMutation(params) });
      return;
    }

    if (cmdAction === 'rename_layer') {
      await postResult({ id, ok: true, data: await renameLayerMutation(params) });
      return;
    }

    if (cmdAction === 'duplicate_layer') {
      await postResult({ id, ok: true, data: await duplicateLayerMutation(params) });
      return;
    }

    if (cmdAction === 'move_layer') {
      await postResult({ id, ok: true, data: await moveLayerMutation(params) });
      return;
    }

    if (cmdAction === 'list_brush_presets') {
      await postResult({ id, ok: true, data: await snapshotBrushPresets(params) });
      return;
    }

    if (cmdAction === 'get_brush_settings') {
      await postResult({ id, ok: true, data: await snapshotBrushSettings() });
      return;
    }

    if (cmdAction === 'get_brush_options_raw') {
      await postResult({ id, ok: true, data: await snapshotBrushOptionsRaw() });
      return;
    }

    if (cmdAction === 'set_brush') {
      await postResult({ id, ok: true, data: await writeBrushSettings(params) });
      return;
    }

    if (cmdAction === 'select_brush_preset') {
      await postResult({ id, ok: true, data: await selectBrushPreset(params) });
      return;
    }

    if (cmdAction === 'set_foreground_color') {
      await postResult({ id, ok: true, data: await writeForegroundColor(params) });
      return;
    }

    if (cmdAction === 'get_foreground_color') {
      await postResult({ id, ok: true, data: await snapshotForegroundColor() });
      return;
    }

    if (cmdAction === 'fill_layer') {
      await postResult({ id, ok: true, data: await fillLayer(params) });
      return;
    }

    if (cmdAction === 'paint_regions') {
      await postResult({ id, ok: true, data: await paintRegions(params) });
      return;
    }

    if (cmdAction === 'paint_mask_strokes') {
      await postResult({ id, ok: true, data: await paintStrokesBatch({ ...params, paint_target: 'layer-mask' }) });
      return;
    }

    if (cmdAction === 'paint_strokes') {
      await postResult({ id, ok: true, data: await paintStrokesBatch(params) });
      return;
    }

    if (cmdAction === 'paint_dabs') {
      await postResult({ id, ok: true, data: await paintDabsBatch(params) });
      return;
    }
    if (cmdAction === 'color_gradient') {
      await postResult({ id, ok: true, data: await paintColorGradient(params) });
      return;
    }
    if (cmdAction === 'paint_stamp_instances') {
      await postResult({ id, ok: true, data: await paintStampInstancesBatch(params) });
      return;
    }

    if (cmdAction === 'capture_preview') {
      await postResult({ id, ok: true, data: await capturePreview(params) });
      return;
    }

    if (cmdAction === 'sample_color') {
      await postResult({ id, ok: true, data: await sampleColor(params) });
      return;
    }

    if (cmdAction === 'sample_colors') {
      await postResult({ id, ok: true, data: await sampleColors(params) });
      return;
    }

    if (cmdAction === 'get_history') {
      await postResult({ id, ok: true, data: await snapshotHistory() });
      return;
    }

    if (cmdAction === 'save_document') {
      const data = await saveDocumentCopy(params);
      await postResult({ id, ok: true, data });
      return;
    }

    if (cmdAction === 'neural_filter') {
      await postResult({ id, ok: true, data: await runNeuralFilter(params) });
      return;
    }

    await postResult(commandErrorResult(id, `unknown_action:${cmdAction}`));
  } catch (error) {
    if (cmdAction === 'close_document') {
      const requestedId = Number(params.document_id);
      if (Number.isSafeInteger(requestedId) && requestedId > 0) controlledCloseCommands.delete(requestedId);
    }
    await postResult(commandErrorResult(id, error));
  }
}

function commandErrorResult(id, error) {
  const message = typeof error === 'string' ? error : (error?.message ?? String(error));
  return { id, ok: false, error: message };
}

async function pollOnce() {
  try {
    await flushPendingResults();
    const activeDocument = app.activeDocument;
    const activeDocumentWitness = activeDocument && Number.isSafeInteger(Number(activeDocument.id))
      ? documentInstanceWitness(Number(activeDocument.id))
      : null;
    const query = [
      `protocol=${encodeURIComponent(REGISTRATION_PROTOCOL)}`,
      `revision=${encodeURIComponent(BRIDGE_REVISION)}`,
      `runtimeInstanceWitness=${encodeURIComponent(RUNTIME_INSTANCE_WITNESS)}`,
      `photoshopVersion=${encodeURIComponent(String(app.version || ''))}`,
      `documentCount=${encodeURIComponent(String(app.documents?.length ?? 0))}`,
      `activeDocumentId=${encodeURIComponent(activeDocument ? String(activeDocument.id) : '')}`,
      `activeDocumentName=${encodeURIComponent(activeDocument ? String(activeDocument.name) : '')}`,
      `activeDocumentInstanceWitness=${encodeURIComponent(activeDocumentWitness?.token || '')}`,
    ].join('&');
    const res = await fetch(`${BRIDGE_BASE}/poll?${query}`);
    if (res.status === 204) return true;
    if (!res.ok) return false;
    const cmd = await res.json();
    if (cmd?.protocol !== COMMAND_PROTOCOL) return false;
    if (cmd?.id) {
      const claim = await claimCommandForExecution(cmd.id);
      if (claim?.execute === true) await handleCommand(cmd);
    }
    return true;
  } catch {
    // MCP server may not be running yet
    return false;
  }
}

async function pollLoop() {
  if (polling) return;
  polling = true;
  while (polling) {
    const connected = await pollOnce();
    const wasConnected = bridgeUiConnected;
    const activeDocumentId = numericValue(app.activeDocument?.id) ?? null;
    const activeDocumentChanged = activeDocumentId !== lastUserConfigDocumentId;
    setBridgeUiConnected(connected);
    if (connected && (!wasConnected || activeDocumentChanged)) {
      lastUserConfigDocumentId = activeDocumentId;
      refreshVideoTraceSetting();
      refreshVideoTraceReadiness();
      refreshUserConfig();
    }
    // A healthy long-poll immediately opens the next request. Back off only when
    // the localhost server is unavailable so a stopped MCP process cannot cause
    // a tight retry loop inside Photoshop.
    if (!connected) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

entrypoints.setup({
  plugin: {
    create() {
      setupBridgePanelUi();
      setupPhotoshopNotifications();
      pollLoop();
    },
    destroy() {
      polling = false;
    },
  },
  panels: {
    bridgePanel: {
      create() {
        setupBridgePanelUi();
        setupPhotoshopNotifications();
        pollLoop();
      },
      show() {
        setupBridgePanelUi();
        setupPhotoshopNotifications();
        pollLoop();
      },
      // Keep the bridge alive when the panel is hidden. Persistence is a
      // plugin-level service; panel visibility must not control transport.
      hide() {},
    },
  },
});

setupBridgePanelUi();
setupPhotoshopNotifications();
pollLoop();
