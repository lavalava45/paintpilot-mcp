// @ts-nocheck
import { commentaryLanguageNotice, isVisual, parseTexts, reviewEvidenceRole } from './session-store.js';
import { hostProgressPayload, operationNarrative, progressPayload } from './operation-narrative.js';
import { guardCapabilities } from './guard-capabilities.js';
import { compileVisualMicroPlan } from '../visual-microplan-compiler.js';

function compactResult(result, limit = 1800) {
  return JSON.stringify(parseTexts(result)).slice(0, limit);
}

function resultSummary(result, limit = 700) {
  const bodies = parseTexts(result);
  const summaries = bodies
    .map(body => typeof body?.summary === 'string' ? body.summary.trim() : '')
    .filter(Boolean);
  if (summaries.length) return summaries.join(' | ').slice(0, limit);
  return JSON.stringify(bodies).slice(0, limit);
}

export function confirmedPaintTargets(result) {
  const targets = new Map();
  const collect = payload => {
    if (!payload || typeof payload !== 'object') return;
    if (Array.isArray(payload.content)) {
      for (const body of parseTexts(payload)) collect(body);
      return;
    }
    const details = payload.details ?? payload;
    const add = target => {
      if (!Number.isSafeInteger(target?.layer_id) || target.layer_id <= 0) return;
      // Execution facts, never an assertion of pixel coverage or opacity_role.
      targets.set(target.layer_id, {
        layer_id: target.layer_id,
        ...(Number.isFinite(target.opacity) ? { opacity: target.opacity } : {}),
        ...(Number.isFinite(target.fill_opacity) ? { fill_opacity: target.fill_opacity } : {}),
        ...(typeof target.blend_mode === 'string' ? { blend_mode: target.blend_mode } : {}),
        ...(Array.isArray(target.parent_groups) ? { parent_groups: structuredClone(target.parent_groups) } : {}),
      });
    };
    add(details.paint_target);
    if (Array.isArray(details.painted_regions)) {
      for (const region of details.painted_regions) add(region?.paint_target);
    }
    collect(payload.mutation_result);
    if (payload.mutation_results && typeof payload.mutation_results === 'object') {
      for (const mutation of Object.values(payload.mutation_results)) collect(mutation);
    }
  };
  collect(result);
  return [...targets.values()];
}

function confirmedTargets(record) {
  const layerIds = new Set();
  const paintTargets = confirmedPaintTargets(record?.result);
  for (const target of paintTargets) layerIds.add(target.layer_id);
  const logicalLayers = [];
  let documentId = Number.isSafeInteger(record?.args?.document_id) ? record.args.document_id : undefined;
  if (!documentId && Number.isSafeInteger(record?.bootstrap_outcome?.document_id)) {
    documentId = record.bootstrap_outcome.document_id;
  }
  for (const body of parseTexts(record?.result)) {
    if (!documentId && Number.isSafeInteger(body?.document_target?.id)) {
      documentId = body.document_target.id;
    }
    const details = body?.details;
    if (!documentId && Number.isSafeInteger(details?.document?.id)) {
      documentId = details.document.id;
    }
    if (!documentId && Number.isSafeInteger(body?.document?.id)) {
      documentId = body.document.id;
    }
    const createdDocument = details?.document ?? body?.document;
    if (!documentId && Number.isSafeInteger(createdDocument?.id) && createdDocument.id > 0) {
      documentId = createdDocument.id;
    }
    for (const candidate of [details?.layerId, details?.layer_id, body?.layerId, body?.layer_id]) {
      if (Number.isSafeInteger(candidate) && candidate > 0) layerIds.add(candidate);
    }
    if (Array.isArray(details?.painted_regions)) {
      for (const region of details.painted_regions) {
        if (Number.isSafeInteger(region?.layer_id) && region.layer_id > 0) layerIds.add(region.layer_id);
      }
    }
    if (Array.isArray(body?.continuation_layers)) {
      for (const layer of body.continuation_layers) {
        if (Number.isSafeInteger(layer?.layer_id) && layer.layer_id > 0) {
          layerIds.add(layer.layer_id);
          if (typeof layer?.hypothesis_id === 'string' && layer.hypothesis_id) {
            logicalLayers.push({
              layer_id: layer.layer_id,
              ...(typeof layer.layer_name === 'string' && layer.layer_name ? { layer_name: layer.layer_name } : {}),
              hypothesis_id: layer.hypothesis_id,
              ...(typeof layer.hypothesis === 'string' && layer.hypothesis ? { hypothesis: layer.hypothesis } : {}),
              ...(typeof layer.rollback_value === 'string' ? { rollback_value: layer.rollback_value } : {}),
              ...(typeof layer.temporary === 'boolean' ? { temporary: layer.temporary } : {}),
              ...(typeof layer.decision === 'string' ? { decision: layer.decision } : {}),
              ...(typeof layer.physical_role === 'string' ? { physical_role: layer.physical_role } : {}),
              ...(typeof layer.opacity_role === 'string' ? { opacity_role: layer.opacity_role } : {}),
              ...(typeof layer.construction_tier === 'string' ? { construction_tier: layer.construction_tier } : {}),
              ...(typeof layer.parent_hypothesis_id === 'string' ? { parent_hypothesis_id: layer.parent_hypothesis_id } : {}),
              ...(typeof layer.parent_construction_revision === 'string' ? { parent_construction_revision: layer.parent_construction_revision } : {}),
              ...(layer.geometry_binding && typeof layer.geometry_binding === 'object' ? { geometry_binding: structuredClone(layer.geometry_binding) } : {}),
              ...(layer.camera_binding && typeof layer.camera_binding === 'object' ? { camera_binding: structuredClone(layer.camera_binding) } : {}),
              ...(layer.attention_binding && typeof layer.attention_binding === 'object' ? { attention_binding: structuredClone(layer.attention_binding) } : {}),
              ...(layer.negative_space && typeof layer.negative_space === 'object' ? { negative_space: structuredClone(layer.negative_space) } : {}),
              ...(layer.causal_effect && typeof layer.causal_effect === 'object' ? { causal_effect: structuredClone(layer.causal_effect) } : {}),
              ...(layer.surface_frame && typeof layer.surface_frame === 'object' ? { surface_frame: structuredClone(layer.surface_frame) } : {}),
              ...(Array.isArray(layer.depth_relations) ? {
                depth_relations: structuredClone(layer.depth_relations),
              } : {}),
            });
          }
        }
      }
    }
    if (Array.isArray(body?.mutation_result?.details?.painted_regions)) {
      for (const region of body.mutation_result.details.painted_regions) {
        if (Number.isSafeInteger(region?.layer_id) && region.layer_id > 0) layerIds.add(region.layer_id);
      }
    }
  }
  return {
    ...(documentId ? { document_id: documentId } : {}),
    ...(layerIds.size ? { layer_ids: [...layerIds] } : {}),
    ...(logicalLayers.length ? { logical_layers: logicalLayers } : {}),
    ...(paintTargets.length ? { paint_targets: paintTargets } : {}),
  };
}

export function compactClosedPrevious(value) {
  if (!value?.closed) return value?.closed === false ? { closed: false } : undefined;
  return {
    closed: true,
    operation_id: value.operation_id,
    operation_acknowledged: !!value.operation_ack,
    report_delivery: value.report_delivery,
    verdict_recorded: !!value.verdict_recorded,
    ...(value.execution_claim_correction ? { execution_claim_correction: value.execution_claim_correction } : {}),
  };
}

function nextState(record) {
  if (record.execution === 'not-executed') return 'terminal_not_executed';
  if ((record.tool === 'photoshop_create_document' || record.tool === 'photoshop_open_image')
    && record.phase === 'completed' && record.failed) return 'terminal_bootstrap_failed';
  if (record.phase !== 'completed') return 'awaiting_reconcile';
  if (record.visual && !record.preview) return 'awaiting_preview_recovery';
  if (record.visual && record.preview && !record.verdict) return 'awaiting_visual_review';
  return 'awaiting_report_and_operation_ack';
}

function microplanHasExplicitBeforePreview(input) {
  if (input?.tool !== 'photoshop_execute_visual_microplan') return false;
  const steps = input?.args?.steps;
  if (!Array.isArray(steps) || steps.length < 3) return false;
  const mutationIndex = steps.findIndex(step => /photoshop_(?:paint_strokes|paint_dabs|paint_regions|fill_layer|undo)$/.test(step?.tool ?? ''));
  if (mutationIndex <= 0) return false;
  return steps.slice(0, mutationIndex).some(step => step?.tool === 'photoshop_get_preview');
}

function finitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function previewReviewFrame(preview, role, sourceOperationId) {
  if (!preview?.sha256 || !preview?.materialized_path) return null;
  const canvasWidth = finitePositive(preview.canvas_width);
  const canvasHeight = finitePositive(preview.canvas_height);
  const focus = preview.focus;
  const region = focus?.region;
  const focusWidth = finitePositive(focus?.width);
  const focusHeight = finitePositive(focus?.height);
  const cropWidth = region ? finitePositive(Number(region.right) - Number(region.left)) : undefined;
  const cropHeight = region ? finitePositive(Number(region.bottom) - Number(region.top)) : undefined;
  return {
    role,
    source_operation_id: sourceOperationId ?? null,
    document_id: Number.isSafeInteger(preview.document_id) ? preview.document_id : null,
    sha256: preview.sha256,
    mime_type: preview.mime_type ?? 'image/jpeg',
    width: finitePositive(preview.width) ?? null,
    height: finitePositive(preview.height) ?? null,
    materialized_path: preview.materialized_path,
    canvas: {
      width: canvasWidth ?? null,
      height: canvasHeight ?? null,
      provenance: canvasWidth && canvasHeight ? 'capture_metadata' : 'unknown_legacy_preview',
    },
    scale: {
      x: finitePositive(preview.scale_x) ?? (canvasWidth ? preview.width / canvasWidth : null),
      y: finitePositive(preview.scale_y) ?? (canvasHeight ? preview.height / canvasHeight : null),
    },
    ...(focus?.sha256 && focus?.materialized_path && region ? {
      crop: {
        region,
        sha256: focus.sha256,
        mime_type: focus.mime_type ?? 'image/jpeg',
        width: focusWidth ?? null,
        height: focusHeight ?? null,
        materialized_path: focus.materialized_path,
        scale: {
          x: finitePositive(focus.scale_x) ?? (focusWidth && cropWidth ? focusWidth / cropWidth : null),
          y: finitePositive(focus.scale_y) ?? (focusHeight && cropHeight ? focusHeight / cropHeight : null),
        },
      },
    } : {}),
  };
}

/**
 * Compact provenance package for the exact pixels the critic is expected to inspect.
 * It deliberately says nothing about what the image depicts; that belongs to the verdict.
 */
export function visualReviewPackage(record, significance) {
  if (!record?.visual || !record?.preview) return null;
  const documentId = Number.isSafeInteger(record.args?.document_id) ? record.args.document_id : null;
  const beforePreview = record.before_preview ?? record.baseline_preview;
  const beforeSource = record.before_preview
    ? record.id
    : (record.baseline_preview_source_operation_id ?? null);
  const after = previewReviewFrame(record.preview, 'after', record.id);
  const before = previewReviewFrame(beforePreview, 'before', beforeSource);
  const initialRequestedRegion = record.args?.region_bounds ?? record.preview_args?.focus_region;
  if (after?.crop && initialRequestedRegion) {
    after.crop.requested_region = initialRequestedRegion;
    after.crop.effective_region = after.crop.region;
  }
  if (before?.crop && initialRequestedRegion) {
    before.crop.requested_region = initialRequestedRegion;
    before.crop.effective_region = before.crop.region;
  }
  const reviewEvidence = Array.isArray(record.review_evidence)
    ? record.review_evidence
        .filter(frame => frame?.bound_whole_sha256 === record.preview.sha256)
        .map(frame => ({ ...frame, role: reviewEvidenceRole(frame) }))
    : [];
  const beforeDocumentMatched = !!before && documentId !== null && before.document_id === documentId;
  const afterDocumentMatched = !!after && documentId !== null && after.document_id === documentId;
  const wholeComparable = beforeDocumentMatched && afterDocumentMatched && !!significance?.global;
  const focusComparable = beforeDocumentMatched && afterDocumentMatched && !!significance?.local;
  return {
    protocol: 'photoshop.guard.visual_review.v1',
    operation_id: record.id,
    document_id: documentId,
    execution_observed: record.phase === 'completed' && !record.failed,
    visual_observation: record.verdict ? 'recorded' : 'required',
    goal_confirmation: record.verdict?.goal_assessment?.status ?? (record.verdict ? 'legacy_or_unknown' : 'pending_verdict'),
    review_profile: record.visual_review_profile ?? null,
    review_state: record.pending_review ?? null,
    review_evidence: reviewEvidence,
    after,
    before,
    comparison: {
      specification: record.comparison_specification ?? null,
      metric: record.verdict?.comparison_metric ?? null,
      whole_frame_comparable: wholeComparable,
      focus_comparable: focusComparable,
      before_document_matched: beforeDocumentMatched,
      after_document_matched: afterDocumentMatched,
      status: wholeComparable || focusComparable ? 'comparable' : 'unconfirmed',
      reason: !before
        ? 'No before preview is available.'
        : !beforeDocumentMatched || !afterDocumentMatched
          ? 'Before/after document provenance is missing or does not match the pinned operation document.'
          : (significance?.reason ?? 'Preview pair exists but decoded comparability was not established.'),
    },
    delivery_policy: {
      preferred_content_order: [
        'after',
        ...reviewEvidence.map(frame => frame.role),
        ...(after?.crop ? ['after_crop'] : []),
        ...(record.before_preview && before?.crop && focusComparable ? ['before_crop'] : []),
        ...(record.before_preview && before && wholeComparable ? ['before'] : []),
      ],
      before_delivery: record.before_preview
        ? 'fresh_for_current_operation'
        : before
          ? 'metadata_only_prior_frame_already_available'
          : 'unavailable',
      note: 'Guard cycle responses are reference-only. Exact review bytes must be requested explicitly with photoshop_guard_review_image before visual verdict closure.',
    },
  };
}

export function cycleEnvelope(store, record, { replay = false, closed_previous, projectionContext } = {}) {
  const presentationDocumentId = Number(record?.args?.document_id);
  const presentationContext = typeof store?.presentationContext === 'function'
    ? store.presentationContext(
        Number.isSafeInteger(presentationDocumentId) && presentationDocumentId > 0
          ? presentationDocumentId
          : undefined,
        projectionContext?.paintingState
      )
    : undefined;
  const narrativeState = record.phase === 'completed' ? 'completed' : 'uncertain';
  const healthyCompletion = record.phase === 'completed' && !record.failed && !record.error;
  const state = nextState(record);
  const terminalNotExecuted = state === 'terminal_not_executed';
  const terminalBootstrapFailure = state === 'terminal_bootstrap_failed';
  const bootstrap = record.tool === 'photoshop_create_document' || record.tool === 'photoshop_open_image';
  const resultBody = parseTexts(record.result).find(body => body?.execution === 'not-executed');
  const pendingReview = record.pending_review;
  const nextRequiredAction = terminalNotExecuted
    ? (typeof resultBody?.next_required_action === 'string'
        ? resultBody.next_required_action
        : 'The operation was not executed. Submit a corrected or different operation; no preview, report, acknowledgement, verdict, rollback, or reconciliation is required.')
    : terminalBootstrapFailure
      ? 'The document-bootstrap command has a terminal exact failure. No preview, report, acknowledgement, or visual verdict is required. Do not blindly replay the identical request; correct the concrete failure before starting a new guarded bootstrap operation.'
    : state === 'awaiting_reconcile'
    ? (bootstrap
        ? `Call photoshop_guard_reconcile once with id="${record.id}". It must consult the durable UXP command receipt; do not create another document, read source code, or substitute list_documents as proof.`
        : `Reconcile uncertain operation ${record.id} from fresh same-document state/preview evidence before any retry or new mutation.`)
    : state === 'awaiting_preview_recovery'
      ? `Obtain and attach a recovery preview for operation ${record.id}, then inspect/classify it before any new visual mutation.`
    : state === 'awaiting_visual_review'
        ? pendingReview
          ? `Call photoshop_guard_review_image for operation ${record.id} and inspect the escalated crop evidence, then call photoshop_guard_cycle_auto again with previous_operation_id=${record.id} + previous_observation. This is the same artistic operation; do not replay its mutation. Include next_pass only when resubmitting the reviewed observation.`
          : `Call photoshop_guard_review_image with operation_id=${record.id}, inspect the exact delivered review image(s), then call photoshop_guard_cycle_auto once with previous_operation_id + previous_observation. Include next_pass to continue, or omit it to finalize the last pass. Guard derives the technical report and exact durable receipt acknowledgement internally.`
        : `Continue through photoshop_guard_cycle_auto with the next_pass or painting_intent. Guard inherits the one outstanding confirmed nonvisual operation and closes its technical report/receipt internally. For explicit closure use previous_operation_id=${record.id}, without previous_observation. Do not switch to standalone report/ack/verdict tools or a next_operation payload.`;
  const significance = store.visualSignificance(record.id);
  const visualReview = visualReviewPackage(record, significance);
  const problemId = record.problem_id ?? record.args?.problem_id
    ?? projectionContext?.paintingState?.documents?.[String(presentationDocumentId)]?.active_problem?.problem_id;
  const recovery = healthyCompletion && record.visual && record.tool !== 'photoshop_undo'
    && record.args?.action_class !== 'ROLLBACK' && projectionContext && problemId
    ? store.artisticRecoveryForProblem(presentationDocumentId, problemId, record, projectionContext.records, projectionContext)
    : null;
  const commentaryNotice = commentaryLanguageNotice(record, presentationContext);
  const envelope = {
    mode: 'photoshop-mcp-cycle',
    ...(presentationContext ? { presentation_context: presentationContext } : {}),
    ...(commentaryNotice ? { commentary_notice: commentaryNotice } : {}),
    ...(replay ? { replayed_from_disk: true } : {}),
    ...(closed_previous !== undefined ? { closed_previous: compactClosedPrevious(closed_previous) } : {}),
    execution: {
      operation_id: record.id,
      tool: record.tool,
      phase: record.phase,
      failed: !!record.failed,
      execution: record.execution,
    },
    confirmed_targets: confirmedTargets(record),
    preview: record.preview,
    significance,
    ...(visualReview ? { visual_review: visualReview } : {}),
    ...(recovery ? { continuation_recovery: {
      problem_id: problemId,
      decision: recovery.decision,
      attempt_count: recovery.attempt_count,
      strategy_feedback: recovery.strategy_feedback,
      strongest_known_frame: recovery.strongest_known_frame,
    } } : {}),
    operation_receipt: terminalNotExecuted || terminalBootstrapFailure ? null : (record.operation_receipt ?? null),
    required_user_report: terminalNotExecuted || terminalBootstrapFailure || (bootstrap && state === 'awaiting_reconcile') ? null : {
      operation_id: record.id,
      compatibility_only: true,
      required_for_compact_model_path: false,
      format: 'Localized Did / Why / Result headings according to presentation_context.language',
      did_hint: record.summary,
      why_hint: record.purpose,
      result_hint: resultSummary(record.result),
      result_scope: record.visual
        ? 'Report execution and the observation you actually made from visual_review; do not restate planned/expected visual change as an observed result.'
        : 'Report the completed operation result.',
      must_be_visible_before_next_host_call: true,
      must_be_ordinary_user_visible_assistant_message: true,
      internal_commentary_thought_progress_or_tool_cards_do_not_count: true,
      ...(record.preview?.commentary_path
        ? { project_commentary_sidecar_path: record.preview.commentary_path }
        : {}),
    },
    required_operation_ack: !terminalNotExecuted && !terminalBootstrapFailure && !(bootstrap && state === 'awaiting_reconcile') && record.operation_receipt ? {
      protocol: 'photoshop.guard.operation_ack.v1',
      operation_id: record.id,
      receipt_token: record.operation_receipt.token,
      compatibility_only: true,
      required_for_compact_model_path: false,
    } : null,
    cycle_latency: record.latency ?? null,
    next_state: state,
    next_required_action: nextRequiredAction,
    journal_record_path: store.file(record.id),
  };
  if (!healthyCompletion) {
    const failedBody = parseTexts(record.result).find(body => body?.ok === false);
    const step = failedBody?.failed_mutation_step;
    const mutationFailure = step ? failedBody?.mutation_results?.[step] : failedBody;
    envelope.execution_failure = {
      mutation: mutationFailure ? { code: mutationFailure.code, message: mutationFailure.message, step } : null,
      followup_error: record.error ?? null, mutation_replay_permitted: false,
    };
    envelope.blocking_issue = mutationFailure?.message ?? record.error ?? (record.failed ? 'operation failed or requires reconciliation' : 'operation outcome is uncertain');
    if (!bootstrap && ['awaiting_reconcile', 'awaiting_preview_recovery'].includes(state)) envelope.delivery_recovery = {
      tool: 'photoshop_guard_reconcile', args: { id: record.id, capture_evidence: true },
      next: 'Inspect fresh inline state/image, then reconcile with returned evidence ids and an honest outcome. Capture alone does not classify execution; never replay.',
    };
    envelope.diagnostics = {
      route: 'MCP host -> embedded Photoshop Guard -> project dist/index.js -> Photoshop',
      summary: record.summary,
      purpose: record.purpose,
      error: record.error,
      result: compactResult(record.result),
      narrative: operationNarrative(record, narrativeState, presentationContext),
      progress: progressPayload(record, narrativeState, presentationContext),
      host_progress: hostProgressPayload(record, narrativeState, presentationContext),
      guard_capabilities: guardCapabilities(),
    };
  }
  return envelope;
}

export function preflightRejectionEnvelope(input, result, { closed_previous } = {}) {
  const body = parseTexts(result)[0] ?? {};
  return {
    mode: 'photoshop-mcp-cycle',
    ...(closed_previous !== undefined ? { closed_previous: compactClosedPrevious(closed_previous) } : {}),
    execution: {
      operation_id: input.id,
      tool: input.tool,
      phase: 'completed',
      failed: true,
      execution: 'not-executed',
    },
    preflight_rejection: body,
    preview: null,
    significance: undefined,
    operation_receipt: null,
    required_user_report: null,
    required_operation_ack: null,
    next_state: 'terminal_not_executed',
    next_required_action:
      body.next_required_action
      ?? 'Correct the rejected request and submit it as a new operation. No recovery or visual review is required.',
  };
}

export async function executeLogicalOperation({
  store,
  input,
  invoke,
  materializeArguments,
  onProgress,
  preflight,
  projectionContext,
  compilerDeferredFromOperationId,
  mutationLifecycle,
}) {
  const timing = {
    before_preview_ms: null,
    photoshop_dispatch_wall_ms: null,
    recorder_prepare_ms: null,
    recorder_finalize_ms: null,
    recorder_settle_ms: null,
    recorder_stop_ms: null,
    recorder_postprocess_ms: null,
    after_preview_ms: null,
    preview_capture_materialization_ms: null,
  };
  if (input.tool === 'photoshop_execute_visual_microplan') {
    const args = compileVisualMicroPlan(input.args ?? {});
    input = { ...input, args, ...(typeof input.stage === 'string' && /^block[ _-]?in$/i.test(input.stage.trim())
      ? { stage: 'GLOBAL_BLOCK_IN' } : {}) };
  }
  const rejection = await preflight?.(input);
  if (rejection) return { preflightRejection: rejection, replay: false, timing };
  const { record, replay } = store.begin(input, {
    projectionContext,
    ...(compilerDeferredFromOperationId ? { compilerDeferredFromOperationId } : {}),
  });
  if (replay) return { record, replay: true, timing };
  let activeRecord = record;

  try {
    const timeout = Number(input.timeout_ms ?? 60_000);
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 180_000) {
      throw new Error('timeout_ms must be 1000..180000; split longer work');
    }
    const deadlineAt = Date.now() + timeout;
    const remainingTimeout = () => {
      const remaining = Math.floor(deadlineAt - Date.now() - 500);
      if (remaining < 1000) {
        throw new Error('Logical cycle deadline exhausted before the next MCP dispatch; operation not sent.');
      }
      return remaining;
    };

    const visualOperation = isVisual(input.tool);
    const standaloneVisual = visualOperation && input.tool !== 'photoshop_execute_visual_microplan';
    const documentId = input.args?.document_id;

    const existingComparisonPreview = activeRecord.before_preview ?? activeRecord.baseline_preview;
    const comparisonPreviewPinnedToDocument = !!existingComparisonPreview
      && Number.isSafeInteger(documentId)
      && documentId > 0
      && existingComparisonPreview.document_id === documentId;
    const needsInitialBaseline = visualOperation && !comparisonPreviewPinnedToDocument;
    const needsFreshSubtleBaseline = standaloneVisual
      && (input.significance_mode === 'subtle_local' || input.visual_review_profile?.require_before_after === true);
    const controllerShouldCaptureBefore =
      !microplanHasExplicitBeforePreview(input) && (needsInitialBaseline || needsFreshSubtleBaseline);

    if (controllerShouldCaptureBefore) {
      await onProgress?.('before_preview');
      const beforeArgs = materializeArguments(
        'photoshop_get_preview',
        { ...(input.preview_args ?? {}), document_id: documentId },
        `${input.id}-before`
      );
      const beforeStartedAt = Date.now();
      const beforeResult = await invoke('photoshop_get_preview', beforeArgs, remainingTimeout());
      timing.before_preview_ms = Date.now() - beforeStartedAt;
      timing.preview_capture_materialization_ms = (timing.preview_capture_materialization_ms ?? 0) + timing.before_preview_ms;
      store.attachBeforePreview(record.id, beforeResult);
      activeRecord = store.read(record.id);
    }

    // Everything that can fail deterministically before dispatch must happen
    // before we persist the dispatch/barrier marker. Otherwise a local deadline
    // or argument-materialization rejection is misclassified as an uncertain
    // Photoshop mutation even though no tool call left the Guard.
    const mutationArgs = materializeArguments(input.tool, input.args, input.id);
    const mutationTimeout = remainingTimeout();
    store.markDispatched(activeRecord);
    await onProgress?.('mutation');
    let mutationTraceToken;
    const recorderPrepareStartedAt = Date.now();
    try {
      mutationTraceToken = await mutationLifecycle?.beforeMutation?.(activeRecord);
    } catch {
      // Recorder/observability failure must never alter canonical mutation semantics.
    } finally {
      if (mutationLifecycle?.beforeMutation) timing.recorder_prepare_ms = Date.now() - recorderPrepareStartedAt;
    }
    const mutationStartedAt = Date.now();
    let result;
    let mutationError;
    try {
      result = await invoke(input.tool, mutationArgs, mutationTimeout);
    } catch (error) {
      mutationError = error;
      throw error;
    } finally {
      // End the dispatch clock before any recorder wait, including failed dispatches.
      timing.photoshop_dispatch_wall_ms = Date.now() - mutationStartedAt;
      const recorderFinalizeStartedAt = Date.now();
      try {
        const traceTiming = await mutationLifecycle?.afterMutation?.(activeRecord, mutationTraceToken, mutationError);
        for (const field of ['recorder_settle_ms', 'recorder_stop_ms', 'recorder_postprocess_ms']) {
          const value = traceTiming?.[field];
          if (typeof value === 'number' && Number.isFinite(value) && value >= 0) timing[field] = value;
        }
      } catch {
        // Trace finalization is best-effort and cannot make a dispatched mutation replayable.
      } finally {
        if (mutationLifecycle?.afterMutation) timing.recorder_finalize_ms = Date.now() - recorderFinalizeStartedAt;
      }
    }
    let completed = store.complete(activeRecord, result);
    activeRecord = completed;

    if (completed.visual && !completed.preview && completed.execution !== 'not-executed') {
      await onProgress?.('after_preview');
      const afterArgs = materializeArguments(
        'photoshop_get_preview',
        { ...(input.preview_args ?? {}), document_id: documentId },
        `${input.id}-after`
      );
      const afterStartedAt = Date.now();
      const afterResult = await invoke('photoshop_get_preview', afterArgs, remainingTimeout());
      timing.after_preview_ms = Date.now() - afterStartedAt;
      timing.preview_capture_materialization_ms = (timing.preview_capture_materialization_ms ?? 0) + timing.after_preview_ms;
      store.attachPreview(completed.id, afterResult);
      completed = store.read(completed.id);
    }

    return { record: completed, replay: false, timing };
  } catch (error) {
    return { record: store.fail(activeRecord, error), replay: false, timing };
  }
}
