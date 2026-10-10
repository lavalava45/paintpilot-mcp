// @ts-nocheck
import { deriveExecutionOutcome } from './artistic-contract.js';
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
  const copy = (ru, en) => language === 'ru' ? ru : en;
  if (state === 'not-executed') return copy('исправить отклонённый запрос; операция в Photoshop не выполнялась', 'correct the rejected request; Photoshop did not execute the operation');
  if (state === 'failed' || state === 'uncertain') return copy('восстановить подтверждённое состояние без повторного запуска действия', 'reconcile confirmed state without replaying the mutation');
  if (state === 'before_preview') return copy('после фиксации исходной области выполнить запланированное действие', 'execute the planned mutation after recording the starting frame');
  if (state === 'after_preview') return hasLocalFocus(operation)
    ? copy('сравнить исходный и итоговый кадры области и оценить результат', 'compare the local before/after frames and assess the result')
    : copy('проверить итоговый кадр и оценить результат', 'inspect the final frame and assess the result');
  if (state === 'completed') {
    if (operation.verdict?.disposition === 'rollback' && operation.rolled_back !== true) return copy('завершить ограниченный откат отвергнутого прохода', 'complete bounded rollback of the rejected pass');
    if (operation.verdict) return copy('продолжить по записанному наблюдению и оставшимся недостаткам', 'continue from the recorded observation and remaining defects');
    return isVisualOperation(operation)
      ? copy('оценить изображение и решить: принять, скорректировать или откатить', 'assess the image and decide whether to accept, correct or roll back')
      : copy('использовать результат для следующего решения по задаче', 'use the result for the next task decision');
  }
  if (hasLocalFocus(operation)) return copy('сравнить исходный и итоговый кадры именно этой области', 'compare the local before/after frames');
  if (isVisualOperation(operation)) return copy('получить итоговый кадр и оценить его перед следующим действием', 'obtain and assess the final frame before the next mutation');
  if (operation.tool === 'photoshop_get_preview') return copy('визуально проверить полученный кадр', 'inspect the delivered frame');
  if (operation.tool === 'photoshop_save_document') return copy('подтвердить сохранение и продолжить с сохранённого состояния', 'confirm the checkpoint and continue from saved state');
  return copy('оценить результат и выбрать следующий осмысленный шаг', 'assess the result and select the next useful step');
}

function photoshopState(operation = {}, state = 'running', language = 'ru') {
  const copy = (ru, en) => language === 'ru' ? ru : en;
  if (state === 'not-executed') return copy('операция не выполнялась', 'operation was not executed');
  if (state === 'queued') return copy('операция поставлена в очередь', 'operation is queued');
  if (state === 'starting') return copy('операция запускается', 'operation is starting');
  if (state === 'before_preview') return copy('снимается исходный кадр', 'capturing the starting frame');
  if (state === 'after_preview') return copy('снимается итоговый кадр', 'capturing the final frame');
  if (state === 'awaiting_preview') return copy('выполнение завершено; итоговый кадр ещё нужен', 'execution completed; the final frame is still required');
  if (state === 'completed') return isVisualOperation(operation)
    ? operation.preview
      ? copy('выполнение завершено; итоговый кадр записан', 'execution completed; final frame recorded')
      : copy('выполнение завершено; итоговый кадр не подтверждён', 'execution completed; final frame is unconfirmed')
    : copy('операция завершена', 'operation completed');
  if (state === 'failed') return copy('операция завершилась ошибкой', 'operation failed');
  if (state === 'uncertain') return copy('результат выполнения не подтверждён', 'execution outcome is unconfirmed');
  return copy('операция выполняется', 'operation is running');
}

export function formatOperationNarrative(narrative, language = narrative.language ?? 'ru') {
  const ru = language === 'ru';
  return [
    `${ru ? 'Сейчас' : 'Now'}: ${narrative.now}`,
    ...(narrative.why && narrative.why !== narrative.now ? [`${ru ? 'Зачем' : 'Why'}: ${narrative.why}`] : []),
    `Photoshop: ${narrative.photoshop}`,
    ...(narrative.observed ? [`${ru ? 'Наблюдение' : 'Observed'}: ${narrative.observed}`] : []),
    ...(narrative.unresolved_basis ? [`${ru ? 'Нерешённое визуальное основание' : 'Unresolved visual basis'}: ${narrative.unresolved_basis}`] : []),
    `${ru ? 'Следом' : 'Next'}: ${narrative.next}`,
  ].join('\n');
}

export function operationNarrative(operation, state = 'running', presentation = {}) {
  const summary = String(operation?.verdict?.artistic_commentary ?? operation?.artistic_commentary ?? operation?.summary ?? '').trim();
  const language = ['ru', 'en'].includes(presentation.language) ? presentation.language
    : presentation.language === 'auto' ? /[А-Яа-яЁё]/.test(summary) ? 'ru' : 'en' : 'ru';
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
    now: summary || (language === 'ru' ? 'выполняю следующий шаг в Photoshop' : 'performing the next Photoshop step'),
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
