// @ts-nocheck
import { deriveExecutionOutcome } from './artistic-contract.js';
import { effectiveReportLanguage, reportText } from '../report-locales.js';
const LONG_RUNNING_TOOLS = [
  /^photoshop_execute_visual_microplan$/,
  /^photoshop_paint_(?:strokes|dabs|regions)$/,
  /^photoshop_neural_/,
];

function isVisualOperation(operation = {}) {
  return typeof operation.visual === 'boolean' ? operation.visual
    : /(?:paint|fill_layer|undo|visual_microplan|set_layer_opacity|transform|neural|blur|mask)/.test(operation.tool ?? '');
}

function hasLocalFocus(operation = {}) {
  if (operation.preview_args?.focus_region) return true;
  if (operation.tool !== 'photoshop_execute_visual_microplan') return false;
  return Array.isArray(operation.args?.steps)
    && operation.args.steps.some(step => step?.tool === 'photoshop_get_preview' && step?.args?.focus_region);
}

function nextStep(operation = {}, state = 'running', language = 'ru') {
  const copy = key => reportText(language, key);
  if (state === 'not-executed') return copy('nextNotExecuted');
  if (state === 'failed' || state === 'uncertain') return copy('nextFailed');
  if (state === 'before_preview') return copy('nextBefore');
  if (state === 'after_preview') return hasLocalFocus(operation)
    ? copy('nextAfterLocal') : copy('nextAfter');
  if (state === 'completed') {
    if (operation.verdict?.disposition === 'rollback' && operation.rolled_back !== true) return copy('nextRollback');
    if (operation.verdict) return copy('nextVerdict');
    return isVisualOperation(operation)
      ? copy('nextVisual') : copy('nextNonvisual');
  }
  if (hasLocalFocus(operation)) return copy('nextFocus');
  if (isVisualOperation(operation)) return copy('nextPreview');
  if (operation.tool === 'photoshop_get_preview') return copy('nextInspect');
  if (operation.tool === 'photoshop_save_document') return copy('nextSave');
  return copy('nextGeneric');
}

function photoshopState(operation = {}, state = 'running', language = 'ru') {
  const copy = key => reportText(language, key);
  if (state === 'not-executed') return copy('statusNotExecuted');
  if (state === 'queued') return copy('statusQueued');
  if (state === 'starting') return copy('statusStarting');
  if (state === 'before_preview') return copy('statusBefore');
  if (state === 'after_preview') return copy('statusAfter');
  if (state === 'awaiting_preview') return copy('statusAwaiting');
  if (state === 'completed') return isVisualOperation(operation)
    ? operation.preview ? copy('statusVisualConfirmed') : copy('statusVisualUnconfirmed')
    : copy('statusCompleted');
  if (state === 'failed') return copy('statusFailed');
  if (state === 'uncertain') return copy('statusUncertain');
  return copy('statusRunning');
}

export function formatOperationNarrative(narrative, language = narrative.language ?? 'ru') {
  return [
    `${reportText(language, 'now')}: ${narrative.now}`,
    ...(narrative.why && narrative.why !== narrative.now ? [`${reportText(language, 'why')}: ${narrative.why}`] : []),
    `Photoshop: ${narrative.photoshop}`,
    ...(narrative.observed ? [`${reportText(language, 'observed')}: ${narrative.observed}`] : []),
    ...(narrative.unresolved_basis ? [`${reportText(language, 'unresolved')}: ${narrative.unresolved_basis}`] : []),
    `${reportText(language, 'next')}: ${narrative.next}`,
  ].join('\n');
}

export function operationNarrative(operation, state = 'running', presentation = {}) {
  const summary = String(operation?.verdict?.artistic_commentary ?? operation?.artistic_commentary ?? operation?.summary ?? '').trim();
  const language = effectiveReportLanguage(presentation.language, summary);
  const purpose = String(operation?.purpose ?? '').trim();
  const genericPurpose = /^Execute (?:one bounded compact Photoshop operation|the requested bounded Photoshop pass)\.$/.test(purpose);
  const execution = deriveExecutionOutcome(operation ?? {});
  if (state === 'completed' && execution !== 'completed') state = execution;
  const operationId = operation?.id ?? operation?.request_key ?? null;
  const progressId = `photoshop-operation:${String(operationId ?? 'unknown')}`;
  const narrative = {
    progress_id: progressId,
    operation_id: operationId,
    language,
    state,
    now: summary || reportText(language, 'defaultNow'),
    why: genericPurpose ? summary : purpose,
    photoshop: photoshopState(operation, state, language),
    next: nextStep(operation, state, language),
    ...(typeof operation?.verdict?.observed_change === 'string' ? { observed: operation.verdict.observed_change } : {}),
  };
  return {
    ...narrative,
    text: formatOperationNarrative(narrative),
  };
}

function historicalDurationMs(record) {
  if (!record?.created_at || !record?.completed_at) return undefined;
  const started = Date.parse(record.created_at);
  const completed = Date.parse(record.completed_at);
  const duration = completed - started;
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

export function shouldUseAsyncJob(operation, history = []) {
  if (!operation || typeof operation !== 'object') return false;
  const timeout = Number(operation.timeout_ms ?? 60_000);
  if (Number.isFinite(timeout) && timeout <= 10_000) return false;
  const tool = String(operation.tool ?? '');

  // Current work wins over historical timing. A few slow VisualMicroPlans must not
  // permanently push later tiny paint bundles into detached async execution.
  if (tool === 'photoshop_execute_visual_microplan' && Array.isArray(operation.args?.steps)) {
    const mutation = operation.args.steps.find(step => /photoshop_(?:paint_strokes|paint_dabs|paint_regions|fill_layer|undo)/.test(step?.tool ?? ''));
    if (mutation?.tool === 'photoshop_paint_dabs' && Array.isArray(mutation.args?.dabs) && mutation.args.dabs.length <= 24) return false;
    if (mutation?.tool === 'photoshop_paint_strokes' && Array.isArray(mutation.args?.strokes) && mutation.args.strokes.length <= 4) return false;
    if (mutation?.tool === 'photoshop_paint_regions' && Array.isArray(mutation.args?.regions) && mutation.args.regions.length <= 8) return false;
  }

  const sameToolDurations = Array.isArray(history)
    ? history
      .filter(record => record?.tool === operation.tool && record?.phase === 'completed')
      .map(historicalDurationMs)
      .filter(duration => Number.isFinite(duration))
      .slice(-5)
    : [];
  if (sameToolDurations.length) {
    const sorted = [...sameToolDurations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median >= 7_000 || sameToolDurations.at(-1) >= 10_000) return true;
  }
  if (!LONG_RUNNING_TOOLS.some(pattern => pattern.test(tool))) return false;

  // VisualMicroPlan setup-only/small paint bundles often finish quickly. Keep very
  // small explicit bundles synchronous; everything else in this class gets the UX
  // benefit of an immediate job handoff rather than a silent 10-60 second call.
  return true;
}

export function progressPayload(operation, state = 'running', presentation = {}) {
  const narrative = operationNarrative(operation, state, presentation);
  return {
    protocol: 'operation.progress.v1',
    progress_id: narrative.progress_id,
    text: narrative.text,
    state: narrative.state,
    operation_id: narrative.operation_id,
  };
}

// Compatibility surface for COS builds that know how to promote this structured
// result into a native host progress row. Safety does not depend on this alias.
export function hostProgressPayload(operation, state = 'running', presentation = {}) {
  const progress = progressPayload(operation, state, presentation);
  return { ...progress, protocol: 'cos.host_progress.v1' };
}
