import { documentArtisticDebt } from './document-artistic-debt.js';
import fs from 'node:fs';
import { artisticEvaluationFingerprint, type ArtisticEvaluator, type ArtisticEvaluation } from './artistic-evaluator.js';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ToolResult, ToolRegistry } from '../tool-registry.js';
import { createValueCheckTools } from '../../tools/value-check-tools.js';
import { ExecutionLease } from '../execution-lease.js';
import { guardResumeSubset } from './response-budget.js';
import { currentToolExecutionContext, withToolExecutionContext } from '../execution-context.js';
import { DOCUMENT_ID_SCHEMA_EXCLUDES } from '../document-target.js';
import {
  cancelUxpStableCommandIfQueued,
  getUxpBridgeReadiness,
  invokeUxpGetState,
  invokeUxpProbeMediaBrush,
  probeUxpStableCommandReceipt,
} from '../../platform/uxp-bridge-client.js';
import { readBrushPackRecord, resolveBrushPackRecordDirectory } from '../brush-pack.js';
import { writeBrushProbeReceipt } from '../brush-pack-profile.js';
import {
  BOOTSTRAP_EXACT_OUTCOME_PROTOCOL,
  SessionStore,
  alive,
  isRead as isGuardReadTool,
  isVisual as isGuardVisualTool,
  parseTexts,
  previewOf,
} from './session-store.js';
import { compactClosedPrevious, cycleEnvelope, executeLogicalOperation, preflightRejectionEnvelope } from './cycle.js';
import {
  compileGuardCycle,
  type GuardCycleCompilerOptions,
  type GuardCompilerRepairAudit,
  type GuardCompilerTelemetry,
} from './cycle-compiler.js';
import { observedLayerBoundsIssue, type ExecutableGeometryProvenance } from '../executable-geometry-validation.js';
import { guardCapabilities } from './guard-capabilities.js';
import type { GuardProjectionContext } from './projection-context.js';
import {
  collectOperationContractViolations,
} from './operation-contract.js';
import { guardExecutionPolicyError } from './execution-policy.js';
import {
  createJob,
  JOB_HEARTBEAT_INTERVAL_MS,
  readJob,
  updateJob,
  writeJobCompleted,
  writeJobHeartbeat,
  writeJobResult,
  writeJobStarted,
} from './async-job.js';
import { operationNarrative, shouldUseAsyncJob } from './operation-narrative.js';
import { paintingMethodCapabilities } from '../painting-method-palette.js';
import { prepareProcessVideoCapture, stopProcessVideoCapture } from '../process-video-trace.js';
import {
  COMPACT_GUARD_PROTOCOL_VERSION,
  RUNTIME_STATE_VERSION,
  UXP_BRIDGE_REVISION,
} from './protocol-version.js';

type GuardEnvelope = Record<string, unknown> & {
  preflight_rejection?: unknown;
  finalization_rejection?: unknown;
  cycle_latency?: unknown;
};

type GuardExecutionRun = {
  record?: Record<string, unknown> & { id?: string; visual?: boolean };
  replay?: boolean;
  timing?: {
    photoshop_dispatch_wall_ms?: number | null;
    recorder_prepare_ms?: number | null;
    recorder_finalize_ms?: number | null;
    recorder_settle_ms?: number | null;
    recorder_stop_ms?: number | null;
    recorder_postprocess_ms?: number | null;
    preview_capture_materialization_ms?: number | null;
  };
};

function semanticActionsFromRecord(record: Record<string, unknown> | undefined): number {
  if (!record || record.execution === 'not-executed') return 0;
  if (record.tool === 'photoshop_execute_visual_microplan') {
    for (const body of parseTexts(record.result as ToolResult | undefined)) {
      const passExecution = body?.pass_execution;
      const actions = Array.isArray(passExecution?.actions) ? passExecution.actions : [];
      const dispatched = actions.filter((action: any) =>
        action?.kind === 'visual-mutation' && action?.state !== 'not-started'
      ).length;
      if (dispatched > 0) return dispatched;
      const count = Number(body?.mutation_count);
      if (Number.isSafeInteger(count) && count > 0) return count;
    }
  }
  return record.visual ? 1 : 0;
}

function cycleInputDocumentId(store: SessionStore, input: Record<string, unknown>): number | undefined {
  const paintingIntent = input.painting_intent && typeof input.painting_intent === 'object' && !Array.isArray(input.painting_intent)
    ? input.painting_intent as Record<string, unknown>
    : undefined;
  const intentDocumentId = Number(paintingIntent?.document_id);
  if (Number.isSafeInteger(intentDocumentId) && intentDocumentId > 0) return intentDocumentId;
  const nextPass = input.next_pass && typeof input.next_pass === 'object' && !Array.isArray(input.next_pass)
    ? input.next_pass as Record<string, unknown>
    : undefined;
  const nextDocumentId = Number(nextPass?.document_id);
  if (Number.isSafeInteger(nextDocumentId) && nextDocumentId > 0) return nextDocumentId;
  const previousOperationId = typeof input.previous_operation_id === 'string' ? input.previous_operation_id : undefined;
  const previousRecord = previousOperationId ? store.read(previousOperationId) : undefined;
  const previousDocumentId = Number(previousRecord?.args?.document_id);
  return Number.isSafeInteger(previousDocumentId) && previousDocumentId > 0 ? previousDocumentId : undefined;
}

const buildPreflightRejectionEnvelope = preflightRejectionEnvelope as unknown as (
  input: Record<string, unknown>,
  result: ToolResult,
  options?: { closed_previous?: Record<string, unknown> }
) => GuardEnvelope;

const buildCycleEnvelope = cycleEnvelope as unknown as (
  store: SessionStore,
  record: Record<string, unknown>,
  options?: { replay?: boolean; closed_previous?: Record<string, unknown>; projectionContext?: GuardProjectionContext }
) => GuardEnvelope;

const runLogicalOperation = executeLogicalOperation as unknown as (input: {
  store: SessionStore;
  input: Record<string, unknown>;
  invoke: (name: string, args: Record<string, unknown>, timeout: number) => Promise<ToolResult>;
  materializeArguments: (tool: string, args: Record<string, unknown>, id: string) => Record<string, unknown>;
  onProgress?: ((state: string) => Promise<void> | void) | undefined;
  projectionContext?: GuardProjectionContext;
  compilerDeferredFromOperationId?: string;
  mutationLifecycle?: {
    beforeMutation?: (record: Record<string, unknown>) => Promise<unknown> | unknown;
    afterMutation?: (record: Record<string, unknown>, token: unknown, error?: unknown) => Promise<Record<string, number | null> | void> | void;
  };
}) => Promise<GuardExecutionRun>;

const shouldRunAsyncJob = shouldUseAsyncJob as unknown as (
  operation: Record<string, unknown>,
  history: Array<Record<string, unknown>>
) => boolean;

export const EMBEDDED_GUARD_MODE = process.env.PHOTOSHOP_GUARD_MODE?.trim().toLowerCase() || 'compatible';
export const EMBEDDED_GUARD_REQUIRED = EMBEDDED_GUARD_MODE === 'required';

export { isGenerativeToolName } from './operation-contract.js';

class GuardContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GuardContractError';
    this.code = code;
  }
}

function assertOperationContract(operation: Record<string, unknown>): void {
  const [violation] = collectOperationContractViolations(operation);
  if (violation) {
    throw new GuardContractError(
      violation.code,
      violation.message
    );
  }
}

export function guardRuntimeErrorCode(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.trim()) return code;
  }
  return fallback;
}

export function shouldBlockRawTool(toolName: string, mode = EMBEDDED_GUARD_MODE): boolean {
  return mode === 'required' && !toolName.startsWith('photoshop_guard_') && !isGuardReadTool(toolName);
}

export function describeToolForGuardMode(
  toolName: string,
  description: string | undefined,
  mode = EMBEDDED_GUARD_MODE
): string | undefined {
  if (!shouldBlockRawTool(toolName, mode)) return description;

  const guardNotice = 'Guard-only mutation; dispatch via photoshop_guard_cycle_auto.';
  const compactDescription = description
    ?.replace(/\s+/g, ' ')
    .trim()
    .match(/^.*?(?:[.!?](?=\s|$)|$)/)?.[0]
    .trim();

  return compactDescription ? `${guardNotice} ${compactDescription}` : guardNotice;
}

export interface EmbeddedGuardRuntimeOptions {
  artisticEvaluator?: ArtisticEvaluator | false;
  runtimeDirectory?: string;
  previewBarrierDirectory?: string;
  executionLeaseFile?: string;
  workspaceRoot?: string;
  processVideoTraceEnabled?: boolean;
  uxpReadinessProbe?: typeof getUxpBridgeReadiness;
  uxpStateProbe?: typeof invokeUxpGetState;
  uxpCommandReceiptProbe?: typeof probeUxpStableCommandReceipt;
  uxpQueuedCommandCancel?: typeof cancelUxpStableCommandIfQueued;
}

function positiveDocumentId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function toolAcceptsDocumentId(registry: ToolRegistry, name: string): boolean {
  if (DOCUMENT_ID_SCHEMA_EXCLUDES.has(name)) return false;
  const definition = registry.get(name);
  const schema = definition?.tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
  return !!schema?.properties && Object.prototype.hasOwnProperty.call(schema.properties, 'document_id');
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstResultBody(result: ToolResult): Record<string, unknown> {
  const body = parseTexts(result).find((item: unknown) => item && typeof item === 'object' && !Array.isArray(item));
  if (!body || result.isError === true || body.ok === false) {
    throw new Error(`anchor_restore_state_read_failed: ${JSON.stringify(body ?? {})}`);
  }
  return body as Record<string, unknown>;
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function compactLayerState(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const layer = raw as Record<string, unknown>;
  return {
    ...(typeof layer.id === 'number' ? { id: layer.id } : {}),
    ...(typeof layer.name === 'string' ? { name: layer.name } : {}),
    ...(typeof layer.path === 'string' ? { path: layer.path } : {}),
    ...(typeof layer.depth === 'number' ? { depth: layer.depth } : {}),
    ...(typeof layer.kind === 'string' ? { kind: layer.kind } : {}),
    ...(typeof layer.typename === 'string' ? { typename: layer.typename } : {}),
    ...(typeof layer.visible === 'boolean' ? { visible: layer.visible } : {}),
    ...(typeof layer.opacity === 'number' ? { opacity: layer.opacity } : {}),
    ...(typeof layer.blendMode === 'string' ? { blend_mode: layer.blendMode } : {}),
  };
}

function compactActiveLayerState(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const layer = raw as Record<string, unknown>;
  return {
    ...(typeof layer.id === 'number' ? { id: layer.id } : {}),
    ...(typeof layer.name === 'string' ? { name: layer.name } : {}),
    ...(typeof layer.kind === 'string' ? { kind: layer.kind } : {}),
    ...(typeof layer.visible === 'boolean' ? { visible: layer.visible } : {}),
    ...(typeof layer.opacity === 'number' ? { opacity: layer.opacity } : {}),
    ...(typeof layer.blendMode === 'string' ? { blend_mode: layer.blendMode } : {}),
    ...(typeof layer.locked === 'boolean' ? { locked: layer.locked } : {}),
    ...(typeof layer.isBackground === 'boolean' ? { is_background: layer.isBackground } : {}),
  };
}

function normalizedAnchorRestoreSnapshot(
  documentId: number,
  stateResult: ToolResult,
  layersResult: ToolResult,
  selectionResult: ToolResult
): Record<string, unknown> {
  const stateBody = firstResultBody(stateResult);
  const layersBody = firstResultBody(layersResult);
  const selectionBody = firstResultBody(selectionResult);
  const state = recordOrEmpty(stateBody.details ?? stateBody);
  const document = recordOrEmpty(state.document);
  const layersDetails = recordOrEmpty(layersBody.details ?? layersBody);
  const layersContext = recordOrEmpty(layersDetails.context);
  const layersDocument = recordOrEmpty(layersContext.document);
  const selectionDetails = recordOrEmpty(selectionBody.details ?? selectionBody);
  const selectionContext = recordOrEmpty(selectionDetails.context);
  const selectionDocument = recordOrEmpty(selectionContext.document);
  const observedIds = [document.id, layersDocument.id, selectionDocument.id]
    .filter(value => value !== undefined);
  if (observedIds.some(value => value !== documentId)) {
    throw new Error(`anchor_restore_state_document_mismatch: expected ${documentId}, observed ${observedIds.join(',')}`);
  }
  const layers = Array.isArray(layersDetails.layers)
    ? layersDetails.layers.map(compactLayerState).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const selectionBounds = recordOrEmpty(selectionDetails.bounds);
  const hasSelection = selectionDetails.has_selection === true;
  const witness = document.instanceWitness && typeof document.instanceWitness === 'object' && !Array.isArray(document.instanceWitness)
    ? structuredClone(document.instanceWitness)
    : undefined;
  return {
    protocol: 'photoshop.guard.anchor_restore_snapshot.v1',
    document_id: documentId,
    captured_at: new Date().toISOString(),
    ...(witness ? { document_instance_witness: witness } : {}),
    layer_count: typeof layersDetails.layerCount === 'number' ? layersDetails.layerCount : layers.length,
    layers,
    active_layer: compactActiveLayerState(state.activeLayer),
    selection: {
      has_selection: hasSelection,
      ...(hasSelection && Object.keys(selectionBounds).length ? { bounds: selectionBounds } : {}),
    },
  };
}

function anchorRestoreVerification(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>
): Record<string, unknown> {
  const expectedComparable = {
    layer_count: expected.layer_count,
    layers: expected.layers,
    active_layer: expected.active_layer,
    selection: expected.selection,
  };
  const actualComparable = {
    layer_count: actual.layer_count,
    layers: actual.layers,
    active_layer: actual.active_layer,
    selection: actual.selection,
  };
  const expectedJson = JSON.stringify(expectedComparable);
  const actualJson = JSON.stringify(actualComparable);
  return {
    protocol: 'photoshop.guard.anchor_restore_verification.v1',
    document_id: expected.document_id,
    matches: expectedJson === actualJson,
    expected_sha256: createHash('sha256').update(expectedJson).digest('hex'),
    actual_sha256: createHash('sha256').update(actualJson).digest('hex'),
    layer_state_matches: JSON.stringify(expected.layers) === JSON.stringify(actual.layers)
      && expected.layer_count === actual.layer_count,
    active_layer_matches: JSON.stringify(expected.active_layer) === JSON.stringify(actual.active_layer),
    selection_matches: JSON.stringify(expected.selection) === JSON.stringify(actual.selection),
    verified_at: new Date().toISOString(),
  };
}

function jsonError(code: string, message: string): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ ok: false, code, message }, null, 2) }],
  };
}

export class EmbeddedGuardRuntime {
  readonly runtimeDirectory: string;
  readonly previewBarrierDirectory: string;
  readonly executionLeaseFile: string;
  readonly store: SessionStore;
  private readonly executionLease: ExecutionLease;
  private readonly uxpReadinessProbe: typeof getUxpBridgeReadiness;
  private readonly uxpStateProbe: typeof invokeUxpGetState;
  private readonly uxpCommandReceiptProbe: typeof probeUxpStableCommandReceipt;
  private readonly uxpQueuedCommandCancel: typeof cancelUxpStableCommandIfQueued;
  private readonly processVideoTraceEnabled: boolean | undefined;
  private readonly artisticEvaluator: ArtisticEvaluator | false;
  private readonly capabilitySnapshotCache = new Map<number, {
    dependencyKey: string;
    snapshot: Record<string, unknown>;
  }>();

  constructor(
    private readonly registry: ToolRegistry,
    options: EmbeddedGuardRuntimeOptions = {}
  ) {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    this.runtimeDirectory = options.runtimeDirectory
      ?? process.env.PHOTOSHOP_CONTROLLER_RUNTIME_DIR?.trim()
      ?? path.join(root, '.photoshop-runtime', 'controller');
    this.previewBarrierDirectory = options.previewBarrierDirectory
      ?? process.env.PHOTOSHOP_PREVIEW_BARRIER_DIR?.trim()
      ?? path.join(root, '.photoshop-runtime', 'preview-barriers');
    this.executionLeaseFile = options.executionLeaseFile
      ?? path.join(root, '.photoshop-runtime', 'execution.lock');
    this.store = new SessionStore(this.runtimeDirectory, {
      visualBarrierDirectory: this.previewBarrierDirectory,
      workspaceRoot: options.workspaceRoot ?? root,
    });
    this.executionLease = new ExecutionLease(this.executionLeaseFile);
    this.uxpReadinessProbe = options.uxpReadinessProbe ?? getUxpBridgeReadiness;
    this.uxpStateProbe = options.uxpStateProbe ?? invokeUxpGetState;
    this.uxpCommandReceiptProbe = options.uxpCommandReceiptProbe ?? probeUxpStableCommandReceipt;
    this.uxpQueuedCommandCancel = options.uxpQueuedCommandCancel ?? cancelUxpStableCommandIfQueued;
    this.processVideoTraceEnabled = options.processVideoTraceEnabled;
    this.artisticEvaluator = options.artisticEvaluator ?? false;
    // One existing public tool, now bound to durable Guard frame/evidence state.
    // Standalone catalog fixtures retain their preview-only implementation.
    for (const definition of createValueCheckTools(this.registry, {
      currentFrame: documentId => {
        this.store.assertDocumentIdentityVerified(documentId);
        const frame = this.store.artRunState(documentId, undefined)?.current_frame;
        if (!frame?.path || !frame.sha256) throw new Error('current_frame_required: complete one meaningful pass and use its exact delivered frame before value analysis');
        const bytes = fs.readFileSync(frame.path);
        if (createHash('sha256').update(bytes).digest('hex') !== frame.sha256) throw new Error('current_frame_file_changed');
        return { bytes, sha256: frame.sha256, sourcePath: frame.path, materializePath: path.join(this.runtimeDirectory, 'value-evidence', `${randomUUID()}.gray.jpg`) };
      },
      registerEvidence: async (documentId, sourceSha, result) => {
        const nestedId = currentToolExecutionContext()?.guardOperationId;
        if (nestedId) return nestedId; // enclosing Guard cycle journals the result
        const release = this.store.lock();
        try {
          this.store.assertDocumentIdentityVerified(documentId);
          const frame = this.store.artRunState(documentId, undefined)?.current_frame;
          if (frame?.sha256 !== sourceSha || !frame.path || createHash('sha256').update(fs.readFileSync(frame.path)).digest('hex') !== sourceSha) throw new Error('value_evidence_frame_changed');
          if (this.store.activeJobs(undefined).length) throw new Error('value_evidence_job_active: poll the running Guard job first');
          const record = this.store.begin({ id: `value-evidence-${randomUUID()}`,
            tool: 'photoshop_analyze_value_structure', args: { document_id: documentId },
            summary: 'Analyze the exact delivered frame in grayscale',
            purpose: 'Register materialized tonal evidence without recapturing Photoshop or declaring artistic success',
          }, { cachedValueEvidenceFor: sourceSha }).record;
          this.store.markDispatched(record);
          this.store.complete(record, { ...result, content: result.content.filter(item => item.type === 'text') });
          const closure = await compileGuardCycle({ previous_operation_id: record.id }, this.store, this.registry);
          if (closure.violations.length) throw new Error(closure.violations.map(item => item.message).join('\n'));
          this.store.closePreviousCycle(closure.input);
          return record.id;
        } finally { release(); }
      },
    })) this.registry.register(definition.tool.name, definition);
  }

  /** Isolated vision review at the existing pass boundary, never under the execution lease. */
  // Explicit developer experiment only; painting/review routes never invoke a provider.
  async evaluateArtisticOperation(operationId: string): Promise<ArtisticEvaluation | null> {
    const record = this.store.read(operationId);
    if (!this.artisticEvaluator || !record?.visual || record.phase !== 'completed'
      || record.failed || !record.preview?.materialized_path || !record.preview?.sha256) return null;
    const documentId = Number(record.args?.document_id);
    const state = this.store.artRunState(documentId, undefined);
    const contract = state?.art_director?.artistic_evaluation_contract;
    const taskId = record.args?.planner_task_id ?? record.planner_task_id;
    const task = state?.art_director?.tasks?.find((row: Record<string, unknown>) => row.task_id === taskId);
    const plannerTask = task ? { task_id: String(task.task_id), summary: String(task.summary) } : undefined;
    const before = record.before_preview ?? record.baseline_preview;
    const request = {
      operationId, documentId,
      documentInstance: JSON.stringify(state?.document_instance ?? null),
      stage: record.stage ?? record.args?.stage ?? 'GLOBAL_BLOCK_IN',
      goal: record.summary ?? record.args?.summary ?? 'Inspect the current pass',
      originalBrief: state?.original_brief,
      plannerTask,
      contract,
      language: this.store.presentationContext(documentId)?.language,
      frame: { path: record.preview.materialized_path, sha256: record.preview.sha256 },
      ...(before?.document_id === documentId && before?.materialized_path && before?.sha256
        ? { beforeFrame: { path: before.materialized_path, sha256: before.sha256 } } : {}),
      ...(record.preview.focus?.materialized_path && record.preview.focus?.sha256 && record.preview.focus?.region
        ? { focusFrame: { path: record.preview.focus.materialized_path,
          sha256: record.preview.focus.sha256, region: record.preview.focus.region } } : {}),
    };
    const key = artisticEvaluationFingerprint(request);
    if (record.artistic_evaluation?.status === 'completed'
      && record.artistic_evaluation.request_fingerprint === key
      && createHash('sha256').update(fs.readFileSync(request.frame.path)).digest('hex') === request.frame.sha256
      && (!request.beforeFrame || createHash('sha256').update(fs.readFileSync(request.beforeFrame.path)).digest('hex') === request.beforeFrame.sha256)
      && (!request.focusFrame || createHash('sha256').update(fs.readFileSync(request.focusFrame.path)).digest('hex') === request.focusFrame.sha256)) return record.artistic_evaluation;
    this.store.write({ ...record, artistic_evaluation_required: true });
    const result = await this.artisticEvaluator.evaluate(request);
    const latest = this.store.read(operationId);
    const currentState = this.store.artRunState(documentId, undefined);
    if (!latest || latest.preview?.sha256 !== request.frame.sha256
      || result.operation_id !== operationId || result.document_id !== documentId
      || result.frame_sha256 !== request.frame.sha256 || result.stage !== request.stage
      || result.request_fingerprint !== key
      || JSON.stringify(currentState?.document_instance ?? null) !== request.documentInstance
      || currentState?.original_brief !== request.originalBrief
      || JSON.stringify(currentState?.art_director?.artistic_evaluation_contract) !== JSON.stringify(contract)) return null;
    this.store.write({ ...latest, artistic_evaluation: result, artistic_evaluation_brief: request.originalBrief,
      artistic_evaluation_instance: request.documentInstance,
      artistic_evaluation_contract: JSON.stringify(contract), artistic_evaluation_task: plannerTask });
    this.store.updatePaintingState(documentId, (current: Record<string, unknown>) => ({ ...current,
      independent_artistic_evaluation: result,
    }));
    return result;
  }

  capabilities(): Record<string, unknown> {
    return {
      ...guardCapabilities(),
      embedded: true,
      mode: EMBEDDED_GUARD_MODE,
      raw_mutation_bypass_blocked: EMBEDDED_GUARD_REQUIRED,
      runtime_directory: this.runtimeDirectory,
      command_sets: Object.fromEntries(Object.entries({
        construct: ['photoshop_create_layer','photoshop_paint_regions','photoshop_paint_strokes'],
        pose: ['photoshop_move_layer','photoshop_rotate_layer','photoshop_scale_layer'],
        save: ['photoshop_save_document','photoshop_save_document_as'],
        inspect: ['photoshop_get_state','photoshop_get_layers','photoshop_get_preview'],
      }).map(([group, names]) => [group, names.filter(name => this.registry.get(name))])),
      command_contract_batch: 'photoshop_guard_capabilities(tool_names=[up to 8 exact names]); use command_sets, never guess aliases',
      compact_guard_protocol_version: COMPACT_GUARD_PROTOCOL_VERSION,
      runtime_state_version: RUNTIME_STATE_VERSION,
      expected_uxp_bridge_revision: UXP_BRIDGE_REVISION,
    };
  }

  toolContract(toolName: string): Record<string, unknown> {
    const definition = this.registry.get(toolName);
    if (!definition || !toolName.startsWith('photoshop_') || toolName.startsWith('photoshop_guard_')) {
      if (/^photoshop_(?:reorder_layer(?:s)?|rearrange_layers|set_layer_order|layer_move|move_layer_relative)$/.test(toolName)) {
        const create = this.registry.get('photoshop_create_layer');
        return { ok: false, code: 'guard_tool_contract_unknown', tool_name: toolName, execution: 'not-executed',
          unsupported_capability: 'reorder-existing-layers',
          supported_alternatives: create ? ['photoshop_create_layer'] : [],
          ...(create ? { new_layer_placement: { tool_name: 'photoshop_create_layer',
            fields: ['above_layer_id', 'below_layer_id'], inputSchema: structuredClone(create.tool.inputSchema) } } : {}),
          next: 'Existing-layer stacking order has no public command. photoshop_move_layer changes pixel position, not stacking. For a NEW planned component use create_layer above_layer_id/below_layer_id with the pinned existing owner id. Do not recreate/delete existing artwork or guess further aliases to change stacking; report this capability gap if existing-layer reorder is required.' };
      }
      const stem = toolName.replace('photoshop_', '').split('_')[0];
      const sets = this.capabilities().command_sets as Record<string, string[]>;
      const supported = [...new Set(Object.values(sets).flat())];
      return { ok: false, code: 'guard_tool_contract_unknown', tool_name: toolName, execution: 'not-executed',
        supported_alternatives: supported.filter(name => name.includes(stem)), command_sets: sets,
        next: 'Use exact command_sets names or request one batch with tool_names. Never investigate source or test guessed aliases.' };
    }
    return { ok: true, tool_name: toolName, execution: 'not-executed',
      inputSchema: structuredClone(definition.tool.inputSchema),
      dispatch: isGuardReadTool(toolName) ? 'read-only tool or Guard operation' : 'photoshop_guard_cycle_auto next_pass.actions',
      raw_mutation_bypass_permitted: false };
  }

  async paintReadiness(documentId?: number): Promise<Record<string, unknown>> {
    const readiness = await this.uxpReadinessProbe({});
    const activeDocumentId = positiveDocumentId(readiness.active_document?.id)
      ? readiness.active_document!.id
      : null;
    const targetDocumentId = positiveDocumentId(documentId) ? documentId : activeDocumentId;
    const documentStatus = !readiness.ready || !readiness.revision_match
      ? 'unavailable'
      : !targetDocumentId
        ? 'missing'
        : activeDocumentId === targetDocumentId
          ? 'ready'
          : 'mismatch';
    const artRun = targetDocumentId
      ? this.store.artRunState(targetDocumentId, undefined)
      : undefined;
    const artRunBound = typeof artRun?.process_dir === 'string' && artRun.process_dir.length > 0;
    const paintingProfile = typeof artRun?.painting_profile === 'string'
      ? artRun.painting_profile
      : artRunBound ? 'nontrivial_painting' : null;
    const brushPreflightComplete = artRun?.brush_preflight?.completed === true;
    const brushRoleContractActive = paintingProfile === 'nontrivial_painting';
    const identityPending = !!artRun?.document_instance?.identity_pending;
    const documentReady = documentStatus === 'ready' && !identityPending;
    const canSubmitBrushIndependentVisualPass = documentReady && artRunBound;
    const canSubmitBrushDependentVisualPass = documentReady
      && artRunBound
      && (!brushRoleContractActive || brushPreflightComplete);

    let nextRequiredAction = 'photoshop_guard_cycle_auto';
    if (identityPending) {
      nextRequiredAction = 'photoshop_guard_resume with document_id and same_document_confirmed=true after user confirmation';
    } else if (documentStatus === 'missing') {
      nextRequiredAction = 'photoshop_guard_cycle_auto setup pass with photoshop_create_document or photoshop_open_image';
    } else if (documentStatus === 'unavailable') {
      nextRequiredAction = 'restore matching UXP bridge readiness before any Photoshop mutation';
    } else if (documentStatus === 'mismatch') {
      nextRequiredAction = 'restore the pinned document as the active Photoshop document before mutation';
    } else if (!artRunBound) {
      nextRequiredAction = 'photoshop_guard_set_art_run';
    } else if (brushRoleContractActive && !brushPreflightComplete) {
      nextRequiredAction = 'submit a brush-independent visual pass if that matches the artistic need, or complete brush_preflight before photoshop_paint_strokes/photoshop_paint_dabs';
    }

    return {
      document: documentStatus,
      document_id: targetDocumentId,
      active_document_id: activeDocumentId,
      art_run: artRunBound ? 'ready' : 'missing',
      brush_preflight: brushRoleContractActive
        ? brushPreflightComplete ? 'ready' : 'missing'
        : artRunBound ? 'not_required' : 'missing',
      painting_profile: paintingProfile,
      ...(artRunBound && paintingProfile === 'nontrivial_painting'
        && this.store.compactPassContext(targetDocumentId).has_visual_frame !== true ? {
          first_construction: {
            goal_source: 'original_brief',
            director_required: false,
            blank_value_analysis_required: false,
            next_required_action: 'Put the requested main subject and recognition cues in the first meaningful pass, then establish its setting/path/large masses through bounded editable-owner passes. Do not start an independent fog/gradient task. No source/schema/shell inspection is allowed during painting or recovery.',
          },
        } : {}),
      can_submit_visual_pass: canSubmitBrushIndependentVisualPass,
      can_submit_brush_independent_visual_pass: canSubmitBrushIndependentVisualPass,
      can_submit_brush_dependent_visual_pass: canSubmitBrushDependentVisualPass,
      brush_preflight_dependency: {
        photoshop_paint_dabs: 'required',
        photoshop_paint_strokes: 'required_when_stroke_mechanism_is_BRUSH',
        non_brush_stroke_mechanisms: ['PENCIL', 'SMUDGE', 'ERASER'],
        stroke_mechanism_contract: {
          BRUSH: {
            settings_source: 'brush_preflight_or_explicit_brush_settings',
            per_stroke_size_opacity_flow: true,
            per_stroke_dynamics: true,
            color_override: true,
          },
          PENCIL: {
            settings_source: 'current_photoshop_tool_settings',
            per_stroke_size_opacity_flow: false,
            per_stroke_dynamics: false,
            color_override: true,
            live_acceptance: 'pending',
          },
          SMUDGE: {
            settings_source: 'current_photoshop_tool_settings',
            per_stroke_size_opacity_flow: false,
            per_stroke_dynamics: false,
            color_override: false,
            live_acceptance: 'pending',
          },
          ERASER: {
            settings_source: 'current_photoshop_tool_settings',
            per_stroke_size_opacity_flow: false,
            per_stroke_dynamics: false,
            color_override: false,
            live_acceptance: 'pending',
          },
        },
      },
      next_required_action: nextRequiredAction,
    };
  }

  private capabilitySnapshotDependencyKey(input: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }

  private async capabilitySnapshot(documentId: number): Promise<Record<string, unknown>> {
    const artRun = this.store.artRunState(documentId, undefined) ?? {};
    const readiness = await this.uxpReadinessProbe({});
    const stateProbe: Awaited<ReturnType<typeof invokeUxpGetState>> = readiness.ready
      ? await this.uxpStateProbe().catch((error) => ({ ok: false, error: safeError(error) }))
      : { ok: false, error: readiness.reason ?? 'uxp_bridge_not_ready' };
    const stateData = stateProbe.ok && stateProbe.data && typeof stateProbe.data === 'object'
      ? stateProbe.data as Record<string, unknown>
      : {};
    const stateDocument = stateData.document && typeof stateData.document === 'object' && !Array.isArray(stateData.document)
      ? stateData.document as Record<string, unknown>
      : {};
    const stateLayer = stateData.activeLayer && typeof stateData.activeLayer === 'object' && !Array.isArray(stateData.activeLayer)
      ? stateData.activeLayer as Record<string, unknown>
      : {};
    const activeDocumentId = positiveDocumentId(stateDocument.id)
      ? stateDocument.id
      : positiveDocumentId(readiness.active_document?.id)
        ? readiness.active_document!.id
        : null;
    const activeLayerId = positiveDocumentId(stateLayer.id) ? stateLayer.id : null;
    const documentMatches = activeDocumentId === documentId;
    const brushPreflight = artRun.brush_preflight && typeof artRun.brush_preflight === 'object'
      ? artRun.brush_preflight as Record<string, unknown>
      : undefined;
    const profile = typeof artRun.painting_profile === 'string' ? artRun.painting_profile : null;
    const brushRoles = Array.isArray(brushPreflight?.roles)
      ? brushPreflight.roles.map((role) => {
          const row = role && typeof role === 'object' && !Array.isArray(role)
            ? role as Record<string, unknown>
            : {};
          return {
            role_id: row.role_id ?? null,
            purpose: row.purpose ?? null,
            material_roles: Array.isArray(row.material_roles) ? [...row.material_roles] : [],
            visual_intents: Array.isArray(row.visual_intents) ? [...row.visual_intents] : [],
            preferred_preset: row.preferred_preset ?? null,
            alternative_presets: Array.isArray(row.alternative_presets) ? [...row.alternative_presets] : [],
            candidate_evidence: Array.isArray(row.candidate_evidence) ? structuredClone(row.candidate_evidence) : [],
            effective_settings: row.effective_settings && typeof row.effective_settings === 'object'
              ? structuredClone(row.effective_settings)
              : null,
            working_scale: row.working_scale ?? null,
            pressure_policy: row.pressure_policy ?? null,
            probe_status: row.probe_status ?? null,
            caveat: row.caveat ?? null,
          };
        })
      : [];
    const methodCapabilities = paintingMethodCapabilities(this.registry);
    const bridgeBlocked = !readiness.ready || !readiness.revision_match || !documentMatches;
    const methodRow = (capability: ReturnType<typeof paintingMethodCapabilities>[number]) => ({
      id: capability.id,
      label: capability.label,
      method_class: capability.methodClass,
      visual_intents: [...capability.visualIntents],
      impact_classes: [...capability.impactClasses],
      primary_tool: capability.primaryTool ?? null,
      execution_tools: [...(capability.executionTools ?? [])],
      preparation_tools: [...(capability.preparationTools ?? [])],
    });
    const supportedMethods = bridgeBlocked
      ? []
      : methodCapabilities
          .filter(capability => capability.availability !== 'unavailable')
          .map(capability => ({
            ...methodRow(capability),
            availability: capability.availability,
            reason: capability.availabilityReason,
          }));
    const unavailableMethods = methodCapabilities
      .filter(capability => capability.availability === 'unavailable')
      .map(capability => ({ ...methodRow(capability), reason: capability.availabilityReason }));
    if (bridgeBlocked) {
      const reason = !readiness.ready
        ? readiness.reason ?? 'uxp_bridge_not_ready'
        : !readiness.revision_match
          ? 'uxp_bridge_revision_mismatch'
          : `active_document_mismatch:${String(activeDocumentId ?? 'none')}!=${documentId}`;
      for (const capability of methodCapabilities.filter(capability => capability.availability !== 'unavailable')) {
        unavailableMethods.push({ ...methodRow(capability), reason });
      }
    }
    const dependencyFacts = {
      compact_guard_protocol_version: COMPACT_GUARD_PROTOCOL_VERSION,
      runtime_state_version: RUNTIME_STATE_VERSION,
      expected_uxp_bridge_revision: UXP_BRIDGE_REVISION,
      actual_uxp_bridge_revision: readiness.bridge_revision,
      uxp_ready: readiness.ready,
      uxp_revision_match: readiness.revision_match,
      document_id: documentId,
      active_document_id: activeDocumentId,
      active_layer_id: activeLayerId,
      active_layer_name: typeof stateLayer.name === 'string' ? stateLayer.name : null,
      painting_profile: profile,
      brush_preflight: brushPreflight ?? null,
      brush_pack_policy: artRun.brush_pack_policy ?? null,
      profile_transition: artRun.profile_transition ?? null,
    };
    const dependencyKey = this.capabilitySnapshotDependencyKey(dependencyFacts);
    const cached = this.capabilitySnapshotCache.get(documentId);
    if (cached?.dependencyKey === dependencyKey) {
      return {
        ...structuredClone(cached.snapshot),
        cache: { reused: true, dependency_key: dependencyKey },
      };
    }
    const snapshot = {
      protocol: 'photoshop.guard.capability_snapshot.v1',
      snapshot_revision: `sha256:${dependencyKey}`,
      generated_at: new Date().toISOString(),
      compact_guard_protocol_version: COMPACT_GUARD_PROTOCOL_VERSION,
      runtime_state_version: RUNTIME_STATE_VERSION,
      uxp_bridge: {
        ready: readiness.ready,
        revision_match: readiness.revision_match,
        actual_revision: readiness.bridge_revision,
        expected_revision: readiness.expected_bridge_revision,
        reason: readiness.reason,
      },
      pinned_targets: {
        document_id: documentId,
        active_document_id: activeDocumentId,
        document_matches: documentMatches,
        active_layer_id: activeLayerId,
        active_layer_name: typeof stateLayer.name === 'string' ? stateLayer.name : null,
        layer_target_status: activeLayerId ? 'pinned' : 'unavailable',
        layer_target_reason: activeLayerId ? null : stateProbe.error ?? 'active_layer_identity_unavailable',
      },
      painting_profile: profile,
      supported_semantic_methods: supportedMethods,
      unavailable_methods: unavailableMethods,
      brush_roles: brushRoles,
      brush_pack_policy: artRun.brush_pack_policy ?? null,
      preparation_facts: {
        art_run_bound: typeof artRun.process_dir === 'string' && artRun.process_dir.length > 0,
        brush_preflight_completed: brushPreflight?.completed === true,
        brush_inventory_observed: brushPreflight?.inventory_observed === true,
        brush_inventory_total: typeof brushPreflight?.inventory_total === 'number' ? brushPreflight.inventory_total : null,
        profile_transition: artRun.profile_transition ?? null,
        uxp_state_readback_ok: stateProbe.ok === true,
        active_document_matches: documentMatches,
      },
      cache: { reused: false, dependency_key: dependencyKey },
    };
    this.capabilitySnapshotCache.set(documentId, { dependencyKey, snapshot: structuredClone(snapshot) });
    return snapshot;
  }

  async statusWithCapabilitySnapshots(): Promise<Record<string, unknown>> {
    let projection = this.store.captureProjectionContext({ capturedAt: Date.now() });
    const abandoned = await this.autoAbandonMissingDocuments('guard_status_fallback', projection);
    // Abandonment mutates durable document/operation state. Re-capture only in
    // that exceptional branch; the ordinary status hot path keeps the single
    // request-local journal/state/jobs snapshot captured above.
    if (abandoned.length) {
      projection = this.store.captureProjectionContext({ capturedAt: Date.now() });
    }
    const status = {
      ...this.store.statusCompact(projection),
      guard_capabilities: this.capabilities(),
      public_mutation_mode: EMBEDDED_GUARD_MODE,
    };
    const documents = status.documents && typeof status.documents === 'object' && !Array.isArray(status.documents)
      ? status.documents as Record<string, unknown>
      : {};
    const snapshots: Record<string, unknown> = {};
    for (const key of Object.keys(documents)) {
      const documentId = Number(key);
      if (Number.isSafeInteger(documentId) && documentId > 0) {
        snapshots[key] = await this.capabilitySnapshot(documentId);
        const documentStatus = documents[key];
        const snapshot = snapshots[key];
        if (documentStatus && typeof documentStatus === 'object' && !Array.isArray(documentStatus)
          && snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
          const usage = (documentStatus as Record<string, unknown>).method_usage;
          const supported = (snapshot as Record<string, unknown>).supported_semantic_methods;
          if (usage && typeof usage === 'object' && !Array.isArray(usage) && Array.isArray(supported)) {
            const used = new Set(Object.keys(
              ((usage as Record<string, unknown>).method_id_usage
                && typeof (usage as Record<string, unknown>).method_id_usage === 'object'
                && !Array.isArray((usage as Record<string, unknown>).method_id_usage))
                ? (usage as Record<string, unknown>).method_id_usage as Record<string, unknown>
                : {}
            ));
            const available = supported
              .map(row => row && typeof row === 'object' && !Array.isArray(row)
                ? String((row as Record<string, unknown>).id ?? '').trim()
                : '')
              .filter(Boolean);
            Object.assign(usage as Record<string, unknown>, {
              available_method_ids: available,
              unused_available_method_ids: available.filter(id => !used.has(id)),
              distinct_available_methods: available.length,
              distinct_unused_available_methods: available.filter(id => !used.has(id)).length,
            });
          }
        }
      }
    }
    return {
      ...status,
      paint_readiness: await this.paintReadiness(),
      capability_snapshots: snapshots,
    };
  }

  async artRunWithCapabilitySnapshot(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const documentId = Number(input.document_id);
    let runtimeInstanceWitness: string | undefined;
    if (positiveDocumentId(documentId)) {
      const readiness = await this.uxpReadinessProbe({ forceRefresh: true });
      if (readiness.ready && readiness.revision_match && readiness.plugin_connected) {
        runtimeInstanceWitness = typeof readiness.runtime_instance_witness === 'string'
          ? readiness.runtime_instance_witness
          : undefined;
        const stateProbe = await this.uxpStateProbe().catch(() => undefined);
        const document = stateProbe?.ok === true && stateProbe.data?.document
          && typeof stateProbe.data.document === 'object' && !Array.isArray(stateProbe.data.document)
          ? stateProbe.data.document as Record<string, unknown>
          : undefined;
        if (document && Number(document.id) === documentId) {
          this.store.observeDocumentInstance(
            documentId,
            document.instanceWitness,
            { observed_at: new Date().toISOString(), tool: 'photoshop_guard_set_art_run' }
          );
        }
      }
    }
    // Bind the live document witness before writing the art run. If Photoshop has
    // recycled the numeric id, observeDocumentInstance first clears stale
    // document-scoped state; the new art run is then written onto the exact live
    // incarnation rather than being immediately invalidated by first-pass preflight.
    const brushPreflight = input.brush_preflight && typeof input.brush_preflight === 'object' && !Array.isArray(input.brush_preflight)
      ? {
          ...(input.brush_preflight as Record<string, unknown>),
          ...(runtimeInstanceWitness ? { runtime_instance_witness: runtimeInstanceWitness } : {}),
        }
      : input.brush_preflight;
    const response = this.artRun({
      ...input,
      ...(brushPreflight ? { brush_preflight: brushPreflight } : {}),
    });
    return {
      ...response,
      paint_readiness: await this.paintReadiness(documentId),
      capability_snapshot: await this.capabilitySnapshot(documentId),
    };
  }

  status(): Record<string, unknown> {
    return {
      ...this.store.statusCompact(),
      guard_capabilities: this.capabilities(),
      public_mutation_mode: EMBEDDED_GUARD_MODE,
    };
  }

  private identityRecoveryNextCall(blockers: Array<Record<string, unknown>>): Record<string, unknown> | null {
    const first = blockers[0];
    if (!first) return null;
    return first.kind === 'job'
      ? { tool: 'photoshop_guard_job_poll', args: { job_id: first.job_id } }
      : { tool: 'photoshop_guard_reconcile', args: { id: first.operation_id, capture_evidence: true } };
  }

  resume(documentId?: number): Record<string, unknown> {
    const pendingDocument = Object.values(this.store.paintingState().documents ?? {})
      .find((document: any) => document.document_instance?.identity_pending) as { document_id?: number } | undefined;
    const pendingId = documentId ?? pendingDocument?.document_id;
    if (pendingId && this.store.artRunState(pendingId, undefined)?.document_instance?.identity_pending) {
      const state = this.store.resume(pendingId);
      const blockers = state.identity_recovery_blockers as Array<Record<string, unknown>>;
      const next = blockers.length ? this.identityRecoveryNextCall(blockers)
        : { tool: 'photoshop_guard_resume', args: { document_id: pendingId, same_document_confirmed: true } };
      const action = blockers.length
        ? 'Poll/reconcile the identified unresolved work through next_public_call, then confirm identity. Do not replay or inspect source.'
        : 'After user confirmation of the same open document, call photoshop_guard_resume with same_document_confirmed=true; fresh pixel/owner evidence is collected internally. Do not replay, reset the art run, or inspect sources.';
      return { ...state, resume_mode: 'identity_unverified',
        ...(state.document && typeof state.document === 'object'
          ? { document: { ...state.document as Record<string, unknown>, next_required_action: action, mutation_allowed: false } } : {}),
        identity_recovery_blockers: blockers, canonical_next_tool: next?.tool,
        mutation_allowed: false, next_required_action: action, next_public_call: next,
      };
    }
    if (documentId === undefined) {
      const checkpoint = this.store.loadAndVerifyContinuationCheckpoint();
      if (checkpoint.ok) {
        const exact = checkpoint as Record<string, unknown>;
        const checkpointDocumentId = Number(
          exact.document && typeof exact.document === 'object' && !Array.isArray(exact.document)
            ? (exact.document as Record<string, unknown>).id
            : undefined
        );
        return {
          ...exact,
          presentation_context: Number.isSafeInteger(checkpointDocumentId) && checkpointDocumentId > 0
            ? this.store.presentationContext(checkpointDocumentId)
            : this.store.presentationContext(undefined),
          resume_mode: 'exact_checkpoint',
          inspect_delivered_frame: exact.visual_verdict_pending === true,
          continuation_contract: exact.visual_verdict_pending === true
            ? 'inspect delivered_preview, then call photoshop_guard_cycle_auto with previous_operation_id + previous_observation and optional next_pass'
            : 'continue with canonical_next_command; do not replay current_operation_id',
          guard_capabilities: this.capabilities(),
          canonical_next_tool: exact.canonical_next_command ?? 'photoshop_guard_cycle_auto',
        };
      }
      if (checkpoint.reason !== 'continuation_checkpoint_missing') {
        return {
          ...checkpoint,
          resume_mode: 'checkpoint_rejected',
          exact_resume_required: true,
          guard_capabilities: this.capabilities(),
          canonical_next_tool: 'photoshop_guard_status',
          next_required_action: 'Checkpoint disagrees with durable Guard state. Run one bounded Guard status/recovery verification; do not replay the prior mutation.',
        };
      }
    }
    const result = {
      ...this.store.resume(documentId),
      resume_mode: documentId === undefined ? 'durable_state_fallback' : 'explicit_document',
      guard_capabilities: this.capabilities(),
      canonical_next_tool: 'photoshop_guard_cycle_auto',
    };
    return result;
  }

  async resumeWithRecovery(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const documentId = Number(input.document_id);
    if (input.projection !== undefined) {
      if (!positiveDocumentId(documentId) || input.same_document_confirmed === true || input.director_fields !== undefined) {
        throw new Error('Public projection requires document_id and a separate identity/Director recovery call');
      }
      return guardResumeSubset(this.resume(documentId), String(input.projection), typeof input.owner_id === 'string' ? input.owner_id : undefined);
    }
    if (Array.isArray(input.director_fields)) {
      if (!positiveDocumentId(documentId) || input.same_document_confirmed === true) throw new Error('director_fields requires document_id and a separate recovery call');
      const fields = ['style_contract', 'prompt_conflict_preflight', 'strategy_validation_after_microplans', 'strategy_validation', 'assessment', 'perceptual_hierarchy', 'value_check', 'refinement_check', 'artistic_evaluation_contract', 'composition_freedom', 'composition_exploration', 'tasks'];
      if (!input.director_fields.length || input.director_fields.length > 5 || input.director_fields.some(field => typeof field !== 'string' || !fields.includes(field))) throw new Error('invalid director_fields');
      const state = this.store.artRunState(documentId, undefined);
      if (!state) throw new Error('Unknown document_id');
      const director = state.art_director;
      return { ok: true, document_id: documentId, resume_mode: 'director_fields',
        document_identity: state.document_instance?.identity_pending ? 'unverified' : 'verified',
        art_director: director ? { directive_id: director.directive_id, revision: director.revision, status: director.status,
          ...Object.fromEntries(input.director_fields.map(field => [String(field), director[String(field)] ?? null])) } : null,
        next: 'Reuse these exact saved fields in a Director update; request fewer director_fields if the response is too large. Never import SessionStore or inspect source.',
      };
    }
    if (input.same_document_confirmed !== true) return this.resume(positiveDocumentId(documentId) ? documentId : undefined);
    if (!positiveDocumentId(documentId)) throw new Error('same_document_confirmed requires document_id');
    const release = this.executionLease.acquire('photoshop_guard_resume');
    let unlock: (() => void) | undefined;
    try {
      unlock = this.store.lock();
      const blockers = this.store.identityRecoveryBlockers();
      if (blockers.length) {
        const next = this.identityRecoveryNextCall(blockers);
        throw Object.assign(new GuardContractError('document_identity_recovery_busy',
          'document_identity_recovery_busy: poll/reconcile the identified unresolved work before rebinding; never replay'), {
          identity_recovery_blockers: blockers, next_public_call: next,
        });
      }
      const state = await this.uxpStateProbe();
      const document = state.ok === true ? state.data?.document as Record<string, any> | undefined : undefined;
      if (Number(document?.id) !== documentId) throw new Error('document_identity_target_mismatch');
      const observation = this.store.observeDocumentInstance(documentId, document?.instanceWitness);
      if (observation.status !== 'identity_unverified') {
        if (observation.status === 'match' || observation.status === 'bound') return this.resume(documentId);
        throw new Error('document_identity_recovery_rejected: the live document was replaced or its witness is missing');
      }
      const saved = this.store.artRunState(documentId, undefined);
      const frame = saved?.current_frame;
      // A UXP restart can happen before the first visual pass, when no Guard frame
      // exists to compare. Permit a narrowly proven *pristine* bootstrap only:
      // the user confirmed the same document, Guard recorded no visual work or
      // semantic owners, and Photoshop still reports its untouched new-document
      // history and sole Background layer. Any missing/ambiguous evidence fails
      // closed; painted documents still require their exact saved-frame SHA.
      if (!frame && !saved?.accepted_frame && !saved?.confirmed_goal_frame) {
        const records = this.store.records().filter(record => Number(record.args?.document_id) === documentId);
        const hasVisualHistory = records.some(record => record.visual === true
          || (isGuardVisualTool(String(record.tool)) && record.execution !== 'not-executed'));
        const owners = this.store.semanticLayerOwners(documentId);
        if (!hasVisualHistory && owners.length === 0) {
          const getHistory = async () => {
            const result = await this.invoke('photoshop_get_history', { document_id: documentId }, 5_000);
            if (result.isError) return null;
            const item = result.content.find(item => item.type === 'text' && item.text.startsWith('History States:\n'));
            if (!item || item.type !== 'text') return null;
            try { return JSON.parse(item.text.slice('History States:\n'.length)) as Record<string, any>; }
            catch { return null; }
          };
          const history = await getHistory();
          const layersResult = await this.invoke('photoshop_get_layers', { document_id: documentId }, 5_000);
          const layerBodies = parseTexts(layersResult).map((body: any) => recordOrEmpty(body.details ?? body.data ?? body));
          const layerBody = layerBodies.length === 1 ? layerBodies[0] : undefined;
          const liveLayers = Array.isArray(layerBody?.layers) ? layerBody.layers : [];
          const soleLayer = recordOrEmpty(liveLayers[0]);
          const layerContext = recordOrEmpty(layerBody?.context);
          const activeLayer = recordOrEmpty(layerContext.activeLayer);
          const historyPristine = history && Number.isInteger(history.totalStates)
            && history.totalStates >= 1 && history.totalStates <= 2
            && history.currentIndex === history.totalStates - 1
            && history.currentState === 'New'
            && Array.isArray(history.states) && history.states.length === history.totalStates
            && history.states.every((row: any) => row?.name === 'New' || row?.name === document?.name);
          const layerPristine = !layersResult.isError && layerBodies.length === 1
            && liveLayers.length === 1 && soleLayer.name === 'Background'
            && Number.isSafeInteger(soleLayer.id) && Number(soleLayer.id) > 0
            && activeLayer.isBackground === true
            && recordOrEmpty(layerContext.document).id === documentId;
          if (historyPristine && layerPristine) {
            const after = await this.uxpStateProbe();
            const historyAfter = await getHistory();
            if (after.ok === true && Number((after.data?.document as any)?.id) === documentId
              && JSON.stringify((after.data?.document as any)?.instanceWitness) === JSON.stringify(document?.instanceWitness)
              && JSON.stringify(historyAfter) === JSON.stringify(history)) {
              // confirmDocumentSession also checks the pending witness and that
              // current_frame remains absent while holding the Guard state lock.
              this.store.confirmDocumentSession(documentId, document?.instanceWitness, undefined);
              this.capabilitySnapshotCache.delete(documentId);
              return { ...this.resume(documentId), identity_recovery: {
                status: 'confirmed', state_preserved: true, recovery_mode: 'pristine_bootstrap', frame_sha256: null,
              } };
            }
          }
        }
      }
      if (!frame?.path || !frame.sha256 || createHash('sha256').update(fs.readFileSync(frame.path)).digest('hex') !== frame.sha256) {
        throw new Error('document_identity_saved_frame_unavailable: no verified frame to compare; state remains preserved');
      }
      const record = this.store.read(frame.operation_id);
      const steps = Array.isArray(record?.args?.steps) ? record.args.steps : [];
      const capture = [...steps].reverse().find((step: any) => step.tool === 'photoshop_get_preview');
      const previewArgs = { ...(capture?.args ?? record?.preview_args ?? {}), document_id: documentId, include_image: true };
      delete previewArgs.focus_region;
      delete previewArgs.materialize_path; // Never overwrite the saved comparison frame.
      const preview = await this.invoke('photoshop_get_preview', previewArgs, 10_000);
      const image = preview.content.find(item => item.type === 'image');
      if (preview.isError || image?.type !== 'image' || createHash('sha256').update(Buffer.from(image.data, 'base64')).digest('hex') !== frame.sha256) {
        throw new Error('document_identity_frame_mismatch: fresh pixels do not exactly match the saved frame; work is preserved, recovery is not accepted');
      }
      const layersResult = await this.invoke('photoshop_get_layers', { document_id: documentId }, 5_000);
      const bodies: Record<string, unknown>[] = parseTexts(layersResult);
      const layerBodies = bodies.map(body => recordOrEmpty(body.details ?? body.data ?? body));
      const layers = layerBodies.flatMap(body => Array.isArray(body.layers) ? body.layers : []);
      const ids = new Set<number>();
      let invalidLayerIdentity = false;
      const visit = (rows: unknown[]) => rows.forEach(value => {
        const row = recordOrEmpty(value);
        const id = row.id ?? row.layer_id;
        if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ids.add(id);
        else invalidLayerIdentity = true;
        if (Array.isArray(row.children)) visit(row.children);
        if (Array.isArray(row.layers)) visit(row.layers);
      });
      visit(layers);
      const owners = this.store.semanticLayerOwners(documentId);
      const missingOwners = owners.filter(owner => !Number.isSafeInteger(owner.layer_id) || !ids.has(owner.layer_id));
      const observedDocumentIds = layerBodies.map(body => recordOrEmpty(recordOrEmpty(body.context).document).id)
        .filter(id => id !== undefined);
      if (layersResult.isError || bodies.some(body => body.ok === false) || !ids.size || invalidLayerIdentity
        || observedDocumentIds.some(id => id !== documentId) || missingOwners.length) {
        throw Object.assign(new GuardContractError('document_identity_owner_mismatch',
          'document_identity_owner_mismatch: retained physical owners are not proven in the live document; report the returned comparison, do not rebind or replay'), {
          owner_identity_comparison: { document_id: documentId, observed_document_ids: observedDocumentIds,
            observed_layer_ids: [...ids], missing_owners: missingOwners.map(owner => ({
              owner_id: owner.hypothesis_id, layer_id: owner.layer_id,
            })), invalid_layer_identity: invalidLayerIdentity, layer_read_failed: !!layersResult.isError || bodies.some(body => body.ok === false) },
        });
      }
      const after = await this.uxpStateProbe();
      if (after.ok !== true || Number((after.data?.document as any)?.id) !== documentId
        || JSON.stringify((after.data?.document as any)?.instanceWitness) !== JSON.stringify(document?.instanceWitness)) {
        throw new Error('document_identity_probe_changed');
      }
      this.store.confirmDocumentSession(documentId, document?.instanceWitness, frame.sha256);
      this.capabilitySnapshotCache.delete(documentId);
      return { ...this.resume(documentId), identity_recovery: { status: 'confirmed', state_preserved: true, frame_sha256: frame.sha256 } };
    } finally { unlock?.(); release(); }
  }

  async handleUxpBridgeEvent(event: {
    event?: unknown;
    document_id?: unknown;
    controlled?: unknown;
    observed_at?: unknown;
    command_id?: unknown;
    document_instance_witness?: unknown;
  }): Promise<Record<string, unknown>> {
    if (event.event !== 'document_closed') return { handled: false, reason: 'unsupported_event' };
    const documentId = Number(event.document_id);
    if (!positiveDocumentId(documentId)) return { handled: false, reason: 'invalid_document_id' };
    if (event.controlled === true) {
      return { handled: true, ignored: true, reason: 'guard_controlled_close', document_id: documentId };
    }
    return this.store.abandonClosedDocument(documentId, {
      evidence_mode: 'uxp_document_close_notification',
      source: 'photoshop_uxp_notification',
      observed_at: event.observed_at,
      command_id: event.command_id,
      document_instance_witness: event.document_instance_witness,
    });
  }

  private async autoAbandonMissingDocuments(
    source: string,
    projectionContext?: GuardProjectionContext
  ): Promise<Array<Record<string, unknown>>> {
    const records = projectionContext?.records ?? this.store.records();
    const state = projectionContext?.paintingState ?? this.store.paintingState();
    const candidateIds = new Set<number>();
    for (const record of records) {
      const documentId = Number(record.args?.document_id);
      if (!positiveDocumentId(documentId) || isGuardReadTool(String(record.tool ?? ''))) continue;
      if (record.resolved?.outcome === 'abandoned' || record.execution === 'not-executed') continue;
      if (record.tool === 'photoshop_close_document' && record.phase === 'completed' && record.failed === false) continue;
      const hasClosureDebt = record.phase !== 'completed'
        || !record.report
        || (record.operation_receipt && !record.operation_ack)
        || (record.visual && !record.verdict);
      if (hasClosureDebt) candidateIds.add(documentId);
    }
    for (const [key, documentState] of Object.entries(state.documents ?? {})) {
      const documentId = Number(key);
      if (!positiveDocumentId(documentId)) continue;
      const doc = documentState as Record<string, unknown>;
      const lifecycle = doc.workflow_lifecycle as Record<string, unknown> | undefined;
      if (lifecycle?.status === 'active' || doc.pending_rollback) candidateIds.add(documentId);
    }
    if (!candidateIds.size) return [];
    const readiness = await this.uxpReadinessProbe({ forceRefresh: true });
    if (!(readiness.ready && readiness.revision_match && readiness.plugin_connected)) return [];
    const activeDocumentId = Number(readiness.active_document?.id);
    if (positiveDocumentId(activeDocumentId)) candidateIds.delete(activeDocumentId);
    if (!candidateIds.size) return [];
    if (readiness.document_count === 0) {
      return [...candidateIds].map(documentId => this.store.abandonClosedDocument(documentId, {
        evidence_mode: 'bridge_registration_document_count_zero',
        source,
        observed_at: new Date().toISOString(),
      }));
    }
    let result: ToolResult;
    try { result = await this.invoke('photoshop_list_documents', {}, 5_000); }
    catch { return []; }
    const body = parseTexts(result).find((item: any) =>
      Array.isArray(item?.documents)
      || Array.isArray((item?.details as Record<string, unknown> | undefined)?.documents)
    ) as Record<string, unknown> | undefined;
    if (!body || result.isError === true || body.ok === false) return [];
    const details = body.details && typeof body.details === 'object' && !Array.isArray(body.details)
      ? body.details as Record<string, unknown>
      : undefined;
    const documents = Array.isArray(body.documents)
      ? body.documents
      : Array.isArray(details?.documents) ? details.documents : [];
    const openIds = new Set(documents.map((document: any) => Number(document?.id ?? document?.document_id))
      .filter((id: number) => positiveDocumentId(id)));
    const abandoned = [];
    for (const documentId of candidateIds) {
      if (openIds.has(documentId)) continue;
      abandoned.push(this.store.abandonClosedDocument(documentId, {
        evidence_mode: 'fresh_documents_absence',
        source,
        observed_at: new Date().toISOString(),
      }));
    }
    return abandoned;
  }

  async lintNextPass(nextPass: Record<string, unknown>, closure: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    const releaseController = this.store.lock();
    try {
      const projection = this.store.captureProjectionContext({
        activeJobs: this.store.activeJobs(undefined),
        capturedAt: Date.now(),
      });
      const compilerOptions: GuardCycleCompilerOptions = {
        collectDynamicOperationViolations: (operation) => this.collectDynamicOperationViolations(
          operation,
          (bounds) => { compilerOptions.visualMicroPlanDocumentBounds = bounds; },
          projection
        ),
        projectionContext: projection,
      };
      const compiled = await compileGuardCycle(
        { previous_operation_id: closure.previous_operation_id, previous_observation: closure.previous_observation, next_pass: nextPass },
        this.store,
        this.registry,
        compilerOptions
      );
      const rejectionText = compiled.rejection?.content?.find((item) => item.type === 'text');
      let rejection: Record<string, unknown> | null = null;
      if (rejectionText?.type === 'text') {
        try { rejection = JSON.parse(String(rejectionText.text)) as Record<string, unknown>; }
        catch { rejection = { message: String(rejectionText.text) }; }
      }
      return {
        ok: compiled.violations.length === 0,
        protocol: 'photoshop.guard.next_pass_lint.v1',
        execution: 'not-executed',
        visual_mutation_started: false,
        lint_ms: Date.now() - startedAt,
        violations: compiled.violations,
        error_codes: [...new Set(compiled.violations.map(item => item.code))],
        normalizations: compiled.normalizations,
        continuation: 'Lint is optional and never closes the previous operation. Reuse this SAME previous_operation_id + previous_observation + next_pass in cycle_auto once. Do not add a close-only call or repeat lint after success.',
        compiled_operation: compiled.nextOperation ?? null,
        rejection,
      };
    } finally {
      releaseController();
    }
  }

  priorities(input: Record<string, unknown>): Record<string, unknown> {
    return {
      ok: true,
      document: this.store.setPriorityState(input),
      next: 'Use photoshop_guard_status or photoshop_guard_resume; stage priority remains fail-closed.',
    };
  }

  artRun(input: Record<string, unknown>): Record<string, unknown> {
    const artRun = this.store.setArtRunState(input);
    return {
      ok: true,
      art_run: artRun,
      next: 'Use the returned project directory for frames/checkpoints/final. Artistic commentary is optional presentation metadata and does not authorize or block visual execution.',
    };
  }

  private async captureAnchorRestoreSnapshot(documentId: number): Promise<Record<string, unknown>> {
    const stateResult = await this.invoke('photoshop_get_state', { document_id: documentId }, 30_000);
    const layersResult = await this.invoke('photoshop_get_layers', { document_id: documentId }, 30_000);
    const selectionResult = await this.invoke('photoshop_get_selection_bounds', { document_id: documentId }, 30_000);
    return normalizedAnchorRestoreSnapshot(documentId, stateResult, layersResult, selectionResult);
  }

  async brushPackIngest(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    let releaseExecution: (() => void) | undefined;
    try {
      releaseExecution = this.executionLease.acquire('photoshop_guard_brush_pack_ingest');
      const result = await this.invoke('photoshop_ingest_brush_pack', input, 120_000);
      const body = parseTexts(result).find((item: unknown) => item && typeof item === 'object' && !Array.isArray(item));
      if (!body) throw new Error('brush_pack_ingestion_invalid_result: no structured result body');
      return body as Record<string, unknown>;
    } finally {
      releaseExecution?.();
    }
  }

  async brushPackProbe(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const brushPackId = typeof input.brush_pack_id === 'string' ? input.brush_pack_id.trim() : '';
    const presetName = typeof input.preset_name === 'string' ? input.preset_name.trim() : '';
    const occurrenceIndex = Number(input.occurrence_index);
    if (!brushPackId || !presetName || !Number.isSafeInteger(occurrenceIndex) || occurrenceIndex < 0) {
      throw new Error('brush_pack_probe requires brush_pack_id, preset_name and non-negative occurrence_index');
    }
    const recordDirectory = resolveBrushPackRecordDirectory();
    const pack = readBrushPackRecord(recordDirectory, brushPackId);
    if (!pack || pack.ingestion_status !== 'imported') throw new Error('brush_pack_probe_requires_imported_pack');
    const attributed = (pack.attributed_presets ?? []).some(row =>
      row.name === presetName && row.occurrence_index === occurrenceIndex
    );
    if (!attributed) throw new Error(`brush_pack_probe_preset_not_attributed: ${presetName}#${occurrenceIndex}`);

    let releaseExecution: (() => void) | undefined;
    try {
      releaseExecution = this.executionLease.acquire('photoshop_guard_brush_pack_profile');
      const commandId = `brush-probe:${createHash('sha256').update(JSON.stringify({
        brush_pack_id: brushPackId,
        preset_name: presetName,
        occurrence_index: occurrenceIndex,
        bridge_revision: UXP_BRIDGE_REVISION,
      })).digest('hex')}`;
      const result = await invokeUxpProbeMediaBrush({ preset_name: presetName }, commandId);
      if (!result.ok || !result.data) {
        throw new Error(result.error ?? `brush_pack_probe_failed:${commandId}`);
      }
      const preview = recordOrEmpty(result.data.preview);
      const whole = recordOrEmpty(preview.whole);
      const base64 = typeof whole.base64 === 'string' ? whole.base64 : '';
      if (!base64) throw new Error(`brush_pack_probe_preview_missing:${commandId}`);
      const bytes = Buffer.from(base64, 'base64');
      const sha = createHash('sha256').update(bytes).digest('hex');
      const evidenceDir = path.join(recordDirectory, 'probes', brushPackId.replace(/[^a-zA-Z0-9._-]+/g, '_'));
      fs.mkdirSync(evidenceDir, { recursive: true });
      const evidencePath = path.join(evidenceDir, `${sha}.jpg`);
      if (!fs.existsSync(evidencePath)) fs.writeFileSync(evidencePath, bytes);
      const evidence = {
        preview_path: evidencePath,
        preview_sha256: sha,
        operation_id: commandId,
      };
      writeBrushProbeReceipt({
        protocol: 'photoshop.brush_pack.probe_receipt.v1',
        brush_pack_id: brushPackId,
        probe_operation_id: commandId,
        preset_name: presetName,
        occurrence_index: occurrenceIndex,
        effective_settings: recordOrEmpty(result.data.effective_settings),
        backend: 'uxp',
        runtime_revision: RUNTIME_STATE_VERSION,
        bridge_revision: UXP_BRIDGE_REVISION,
        evidence,
        layout: recordOrEmpty(result.data.layout),
        recorded_at: new Date().toISOString(),
      }, { recordDirectory });
      return {
        ok: true,
        brush_pack_id: brushPackId,
        preset_name: presetName,
        occurrence_index: occurrenceIndex,
        effective_settings: result.data.effective_settings ?? {},
        layout: result.data.layout ?? {},
        evidence,
        stable_command_id: commandId,
        receipt_state: result.receipt?.state ?? null,
      };
    } finally {
      releaseExecution?.();
    }
  }

  collectArtDirectorReviewErrors(input: Record<string, unknown>): string[] {
    return this.store.collectArtDirectorReviewErrors(input);
  }

  async artDirector(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const document = this.store.setArtDirectorState(input);
    const documentId = Number(input.document_id);
    const anchorDecision = input.anchor_decision && typeof input.anchor_decision === 'object' && !Array.isArray(input.anchor_decision)
      ? input.anchor_decision as Record<string, unknown>
      : undefined;
    let anchorRestoreSnapshot: Record<string, unknown> | undefined;
    if (anchorDecision?.capture_restore_state === true) {
      const action = typeof anchorDecision.action === 'string' ? anchorDecision.action : '';
      if (action !== 'promote_primary' && action !== 'preserve_alternative') {
        throw new Error('capture_restore_state is allowed only with promote_primary or preserve_alternative');
      }
      const operationId = typeof anchorDecision.operation_id === 'string' && anchorDecision.operation_id.trim()
        ? anchorDecision.operation_id.trim()
        : typeof (document as Record<string, any>)?.last_anchor_decision?.operation_id === 'string'
          ? String((document as Record<string, any>).last_anchor_decision.operation_id)
          : undefined;
      if (!operationId) throw new Error('capture_restore_state requires an explicit or resolved anchor operation_id');
      anchorRestoreSnapshot = await this.captureAnchorRestoreSnapshot(documentId);
      this.store.attachAnchorRestoreSnapshot(documentId, operationId, anchorRestoreSnapshot);
    }
    const saved = this.store.artRunState(documentId, undefined) ?? document;
    const director = saved.art_director;
    return {
      ok: true,
      document: { document_id: documentId, process_dir: saved.process_dir, current_stage: saved.current_stage,
        art_director: director ? { directive_id: director.directive_id, revision: director.revision, status: director.status,
          current_task_id: director.current_task_id, review_due: director.review_due, review_reason: director.review_reason,
          value_check: director.value_check, refinement_check: director.refinement_check } : null },
      ...(anchorRestoreSnapshot ? {
        anchor_restore_snapshot: {
          registered: true,
          protocol: anchorRestoreSnapshot.protocol,
          document_id: documentId,
          layer_count: anchorRestoreSnapshot.layer_count,
          selection: anchorRestoreSnapshot.selection,
        },
      } : {}),
      next: 'Use photoshop_guard_resume with document_id and director_fields to retrieve exact saved style/strategy/assessment fields. No source or SessionStore inspection is needed. Painter work remains bound to the active directive/task.',
    };
  }

  report(input: Record<string, unknown>): Record<string, unknown> {
    return this.store.report(input);
  }

  ackOperation(input: Record<string, unknown>): Record<string, unknown> {
    return this.store.ackOperation(input);
  }

  verdict(input: Record<string, unknown>): Record<string, unknown> {
    return this.store.verdict(input);
  }

  async captureRecoveryEvidence(id: string): Promise<{ body: Record<string, unknown>; images: ToolResult['content'] }> {
    const record = this.store.read(id);
    const documentId = Number(record?.args?.document_id);
    if (!record || !positiveDocumentId(documentId) || (record.phase === 'completed' && record.execution !== 'uncertain' && record.execution !== 'partial')) {
      throw new Error('Capture requires an interrupted pinned operation; no recovery mutation or replay is permitted');
    }
    const releaseExecution = this.executionLease.acquire('photoshop_guard_reconcile');
    let unlock: (() => void) | undefined;
    try {
      unlock = this.store.lock();
      if (this.store.activeJobs(undefined).length) throw new Error('Poll the active job before collecting recovery evidence');
      const collected: Array<{ record: { id: string; preview?: { sha256?: string; materialized_path?: string } }; result: ToolResult }> = [];
      for (const tool of ['photoshop_get_state', 'photoshop_get_preview']) {
        const evidenceId = `recovery-evidence-${randomUUID()}`;
        const args = this.materializeArguments(tool, { document_id: documentId, ...(tool === 'photoshop_get_preview' ? { max_dimension_px: 1400, quality: 8 } : {}) }, evidenceId);
        if (tool === 'photoshop_get_preview') args.include_image = true;
        const evidence = this.store.begin({ id: evidenceId, tool, args,
          summary: 'Capture fresh same-document recovery evidence', purpose: `Read-only recovery for ${id}; never replay mutation` }).record;
        this.store.markDispatched(evidence);
        let result: ToolResult;
        try { result = await this.invoke(tool, args, 10000); }
        catch (error) { result = { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, message: safeError(error) }) }] }; }
        this.store.complete(evidence, result);
        if (result.isError || this.store.read(evidence.id)?.failed) throw new Error(`Fresh ${tool} failed; original outcome remains uncertain`);
        const closure = await compileGuardCycle({ previous_operation_id: evidence.id }, this.store, this.registry);
        if (closure.violations.length) throw new Error(closure.violations.map(item => item.message).join('\n'));
        this.store.closePreviousCycle(closure.input);
        if (tool === 'photoshop_get_state') {
          const snapshot = parseTexts(result).find((body: { document?: Record<string, unknown>; data?: { document?: Record<string, unknown> } }) => body?.document || body?.data?.document);
          const document = snapshot?.document ?? snapshot?.data?.document;
          if (Number(document?.id) !== documentId) throw new Error('Fresh state targets a different/no document; keep the original operation uncertain and select the pinned document before recovery');
          const observation = this.store.observeDocumentInstance(documentId, document.instanceWitness);
          if (observation.status !== 'match' && observation.status !== 'bound') throw new Error('Fresh document instance is unverified/replaced; use public identity recovery before reconciliation');
        }
        collected.push({ record: this.store.read(evidence.id), result });
      }
      const preview = collected[1].record.preview;
      const images = collected[1].result.content.filter(item => item.type === 'image');
      if (!preview?.sha256 || !images.length || images.some(item => item.type !== 'image' || createHash('sha256').update(Buffer.from(item.data, 'base64')).digest('hex') !== preview.sha256)) throw new Error('Fresh materialized inline preview required; original outcome remains uncertain');
      return { body: { ok: true, operation_id: id, document_id: documentId,
        state_id: collected[0].record.id, preview_id: collected[1].record.id,
        sha256: preview.sha256, materialized_path: preview.materialized_path,
        state: collected[0].result.content.filter(item => item.type === 'text'),
        execution_classified: false, mutation_replayed: false,
        next_required_action: 'Inspect fresh state and inline exact image, then call photoshop_guard_reconcile with id, state_id, preview_id, outcome=completed|partial and evidence-based reason. not-executed requires original durable proof. Capture alone does not clear the barrier or prove completion.' }, images };
    } finally { unlock?.(); releaseExecution(); }
  }

  async reconcile(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    const id = typeof input.id === 'string' ? input.id : undefined;
    const finish = (result: Record<string, unknown>) => {
      if (id) {
        this.store.recordLatency(id, {
          recovery_reconciliation_ms: Date.now() - startedAt,
          unknown_components: [
            'recovery_reconciliation_ms includes durable UXP receipt inspection/reconstruction but excludes prior external host/model time',
          ],
        });
        const recoveryRecord = this.store.read(id);
        const documentId = Number(recoveryRecord?.args?.document_id);
        if (Number.isSafeInteger(documentId) && documentId > 0) {
          this.store.recordArtisticThroughputEvent(documentId, {
            kind: 'recovery',
            model_visible: true,
            semantic_actions: 0,
            operation_id: id,
          });
        }
      }
      return result;
    };

    const record = id ? this.store.read(id) : undefined;
    const bootstrap = record
      && (record.tool === 'photoshop_create_document' || record.tool === 'photoshop_open_image')
      && record.phase !== 'completed';
    if (!bootstrap || !id) {
      // Public reads do not create Guard evidence ids. Collect and close this
      // read internally so the host never needs SessionStore or shell access.
      if (record && input.outcome === 'abandoned' && input.document_closed_confirmed === true
        && input.documents_id === undefined && input.state_id === undefined && input.preview_id === undefined) {
        const release = this.store.lock();
        try {
          if (this.store.activeJobs(undefined).length) {
            throw new Error('Poll the active Guard job before closed-document recovery; do not abandon running work');
          }
          const evidence = this.store.begin({
            id: `closed-document-evidence-${randomUUID()}`,
            tool: 'photoshop_list_documents', args: {},
            summary: 'Read current open documents for closed-document recovery',
            purpose: 'Verify the interrupted pinned document is absent without replaying its mutation',
          }, { closedDocumentRecoveryFor: record.id }).record;
          this.store.markDispatched(evidence);
          let documentsResult: ToolResult;
          try {
            documentsResult = await this.invoke('photoshop_list_documents', {}, 5_000);
          } catch (error) {
            documentsResult = { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, message: safeError(error) }) }] };
          }
          this.store.complete(evidence, documentsResult);
          const closure = await compileGuardCycle({ previous_operation_id: evidence.id }, this.store, this.registry);
          if (closure.violations.length) throw new Error(closure.violations.map(item => item.message).join('\n'));
          this.store.closePreviousCycle(closure.input);
          const result = this.store.reconcile({ ...input, documents_id: evidence.id });
          const documentRecovery = this.store.abandonClosedDocument(Number(record.args?.document_id), {
            evidence_mode: 'fresh_documents_absence', source: 'guard_reconcile',
          });
          return finish({
            ...result, recovery: 'abandoned', evidence_collected_internally: true,
            document_recovery: documentRecovery,
            next_required_action: 'The closed document workflow is abandoned and remains non-replayable. Continue with a new guarded create/open request; no source, journal or schema inspection is needed.',
          });
        } finally { release(); }
      }
      return finish(this.store.reconcile(input));
    }

    const probe = await this.uxpCommandReceiptProbe(id);
    let receipt = probe.status === 'receipt' ? probe.receipt : null;
    if (receipt?.state === 'queued') {
      // A durable queued command has not been claimed by Photoshop. Cancelling
      // that queue entry is not a replay or a mutation; it creates terminal
      // not-claimed proof so a later bootstrap may start cleanly.
      receipt = await this.uxpQueuedCommandCancel(id) ?? receipt;
    }

    if (receipt?.state === 'completed' && receipt.terminal === true) {
      // Re-enter the public tool only after the durable receipt proves completion.
      // Stable-command dispatch returns the stored result; it cannot execute the
      // Photoshop mutation a second time.
      const recoveredResult = await this.invoke(
        record.tool,
        this.materializeArguments(record.tool, record.args, id),
        5_000
      );
      const recovered = this.store.recoverDocumentBootstrap(id, receipt, recoveredResult);
      const documentId = recovered.bootstrap_outcome?.document_id;
      return finish({
        ok: true,
        recovery: 'completed',
        operation_id: id,
        command_id: id,
        document_id: documentId ?? null,
        operation_receipt: recovered.operation_receipt ?? null,
        next_required_action: Number.isSafeInteger(documentId) && documentId > 0
          ? `Continue with the next guarded operation pinned to document_id=${documentId}. If Guard asks for closure, close this recovered operation in the same cycle; do not create another document.`
          : 'Recovered completion lacks a usable document_id; stop and inspect the recovered public result without replaying create/open.',
      });
    }

    if (receipt?.state === 'failed' && receipt.terminal === true) {
      const recovered = this.store.recoverDocumentBootstrap(id, receipt, undefined);
      return finish({
        ok: false,
        recovery: 'failed',
        operation_id: id,
        command_id: id,
        terminal: true,
        execution: recovered.execution,
        next_required_action: 'The original bootstrap is terminal and non-replayable. Correct the cause, confirm UXP readiness, then submit a new guarded bootstrap operation.',
      });
    }

    if (receipt?.state === 'not-claimed' && receipt.terminal === true) {
      const recovered = this.store.recoverDocumentBootstrap(id, receipt, undefined);
      return finish({
        ok: true,
        recovery: 'not-executed',
        operation_id: id,
        command_id: id,
        terminal: true,
        execution: recovered.execution,
        next_required_action: 'Durable proof shows Photoshop never claimed this command. A new guarded bootstrap operation is allowed after UXP readiness is confirmed.',
      });
    }

    if (receipt?.state === 'claimed') {
      return finish({
        ok: true,
        recovery: 'running',
        operation_id: id,
        command_id: id,
        terminal: false,
        receipt,
        blind_replay_allowed: false,
        next_required_action: `Call photoshop_guard_reconcile once more with id="${id}" after the companion has had a chance to redeliver its durable result. Do not create/open another document and do not change operation_id.`,
      });
    }

    if (
      (probe.status === 'absent' || probe.status === 'corrupt')
      && input.outcome === 'abandoned'
      && input.document_closed_confirmed === true
    ) {
      const exactOutcomeProtocol =
        (record.bootstrap_exact_outcome as Record<string, unknown> | undefined)?.protocol
          === BOOTSTRAP_EXACT_OUTCOME_PROTOCOL;
      if (exactOutcomeProtocol) {
        return finish({
          ok: false,
          recovery: 'abandonment-rejected',
          operation_id: id,
          command_id: id,
          terminal: false,
          blind_replay_allowed: false,
          next_required_action:
            'This bootstrap used the exact-outcome UXP protocol. A missing or corrupt durable receipt can conceal a previously claimed command, so count=0 is not enough to make abandonment safe. Preserve the operation as uncertain and restore/reconcile the same command identity; do not create/open another document.',
        });
      }
      const originalPid = record.pid;
      const historicalOwnerDead =
        Number.isSafeInteger(originalPid)
        && Number(originalPid) > 0
        && !alive(Number(originalPid));
      if (!historicalOwnerDead) {
        return finish({
          ok: false,
          recovery: 'abandonment-rejected',
          operation_id: id,
          command_id: id,
          terminal: false,
          blind_replay_allowed: false,
          next_required_action:
            'Historical bootstrap abandonment is allowed only after its original MCP owner process is confirmed dead. A live or unverifiable owner could still dispatch late work, so keep this operation uncertain.',
        });
      }
      const documentsResult = await this.invoke('photoshop_list_documents', {}, 5_000);
      const documentsBody = parseTexts(documentsResult).find((body: Record<string, unknown>) =>
        typeof body?.count === 'number' || typeof (body?.details as Record<string, unknown> | undefined)?.count === 'number'
      ) as Record<string, unknown> | undefined;
      const details = documentsBody?.details && typeof documentsBody.details === 'object' && !Array.isArray(documentsBody.details)
        ? documentsBody.details as Record<string, unknown>
        : undefined;
      const count = typeof details?.count === 'number'
        ? details.count
        : typeof documentsBody?.count === 'number' ? documentsBody.count : undefined;
      if (count !== 0) {
        return finish({
          ok: false,
          recovery: 'abandonment-rejected',
          operation_id: id,
          command_id: id,
          terminal: false,
          blind_replay_allowed: false,
          next_required_action:
            'Bootstrap abandonment requires a fresh current documents read with count=0 plus explicit operator confirmation. A document is currently open, so do not start a replacement bootstrap.',
        });
      }
      const abandoned = this.store.abandonDocumentBootstrap(id, {
        current_document_absence_observed: true,
      });
      return finish({
        ok: true,
        recovery: 'abandoned',
        operation_id: id,
        command_id: id,
        terminal: true,
        execution: abandoned.execution,
        current_document_count: 0,
        original_execution_proven_not_executed: false,
        next_required_action:
          'The unknowable bootstrap is closed as abandoned, not as not-executed. A new guarded bootstrap operation may now be started; do not reuse the abandoned operation id.',
      });
    }

    return finish({
      ok: false,
      recovery: probe.status === 'corrupt' ? 'receipt-corrupt' : 'unknown',
      operation_id: id,
      command_id: id,
      terminal: false,
      blind_replay_allowed: false,
      next_required_action:
        probe.status === 'corrupt'
          ? 'A durable receipt file exists but is unreadable. Do not replay create/open. Preserve the receipt file and resolve the operation explicitly; a new command id is not safe.'
          : 'No durable receipt is currently available, which is not sufficient proof that the command never executed. Do not replay create/open. Restore the same MCP/UXP transport once and re-run reconciliation with this same operation id; if no receipt becomes available, leave this operation uncertain for explicit operator resolution.',
    });
  }

  recoverLocks(): Record<string, unknown> {
    const stalledJobs = this.store.activeJobs(undefined).filter((job: { state?: string }) => job.state === 'stalled');
    if (stalledJobs.length) {
      return {
        controller: {
          recovered: false,
          blocked: true,
          code: 'embedded_guard_job_stalled',
        },
        execution: {
          recovered: false,
          blocked: true,
          code: 'embedded_guard_job_stalled',
        },
        stalled_jobs: stalledJobs,
        warning: 'The Node process is alive but the Guard job lease is stalled. Do not clear live locks or replay the mutation.',
        next: 'Restart only the Photoshop MCP child process, then call photoshop_guard_recover_locks and reconcile the uncertain operation from fresh state/preview evidence.',
      };
    }
    return {
      controller: this.store.recoverLock(),
      execution: this.store.recoverLock(this.executionLeaseFile),
    };
  }

  private materializeArguments(tool: string, args: Record<string, unknown> | undefined, id: string): Record<string, unknown> {
    const result = structuredClone(args ?? {});
    if (tool === 'photoshop_create_document' || tool === 'photoshop_open_image') {
      // Internal-only idempotency key. The public tool schema intentionally does
      // not expose this field; Guard injects it only after deterministic schema
      // validation so UXP bootstrap commands can be recovered without ever
      // issuing a second create/open under a new identity.
      result._guard_operation_id = id;
    }
    if (tool === 'photoshop_get_preview') {
      result.materialize_path ??= path.join(this.runtimeDirectory, 'previews', `${id}.jpg`);
      result.include_image = false;
      result.max_dimension_px ??= 1000;
    }
    if (tool === 'photoshop_execute_visual_microplan' && Array.isArray(result.steps)) {
      result.steps = result.steps.map((step: unknown) => {
        if (!step || typeof step !== 'object' || Array.isArray(step)) return step;
        const row = step as Record<string, unknown>;
        return row.tool === 'photoshop_get_preview'
          ? {
              ...row,
              args: this.materializeArguments(
                'photoshop_get_preview',
                row.args as Record<string, unknown> | undefined,
                `${id}-${String(row.id ?? 'preview')}`
              ),
            }
          : step;
      });
    }
    return result;
  }

  private async invoke(
    name: string,
    args: Record<string, unknown>,
    timeoutMs: number,
    context: { guardOperationId?: string } = {}
  ): Promise<ToolResult> {
    const executionPolicyError = guardExecutionPolicyError(name);
    if (executionPolicyError) {
      throw new Error(`${executionPolicyError.code}: ${executionPolicyError.message}`);
    }
    const definition = this.registry.get(name);
    if (!definition) throw new Error(`Tool ${name} missing from the project catalog`);
    if (name !== 'photoshop_get_state' && toolAcceptsDocumentId(this.registry, name) && !positiveDocumentId(args.document_id)) {
      throw new Error(`Pass a positive pinned document_id for ${name}; obtain it from photoshop_get_state/photoshop_list_documents first`);
    }
    const deadlineAt = Date.now() + timeoutMs;
    return withToolExecutionContext({ deadlineAt, ...context }, () => this.registry.execute(name, args));
  }

  private async collectDynamicOperationViolations(
    operation: Record<string, unknown>,
    onDocumentBounds?: (bounds: { documentId: number; width: number; height: number }) => void,
    projectionContext?: GuardProjectionContext
  ) {
    const tool = String(operation.tool ?? '');
    if (tool === 'photoshop_create_document' || tool === 'photoshop_open_image') {
      const readiness = await this.uxpReadinessProbe({ forceRefresh: true });
      if (readiness.ready && readiness.revision_match && readiness.plugin_connected) return [];
      return [{
        scope: 'next_operation' as const,
        code: 'uxp_bootstrap_not_ready',
        message:
          `${tool} requires a ready matching UXP companion before dispatch ` +
          `(connected=${readiness.plugin_connected}, ready=${readiness.ready}, revision_match=${readiness.revision_match}, ` +
          `bridge_revision=${readiness.bridge_revision ?? 'unknown'}, expected=${readiness.expected_bridge_revision}, ` +
          `reason=${readiness.reason ?? 'unknown'}). No document creation command was dispatched.`,
      }];
    }

    if (isGuardReadTool(tool)) return [];
    const args = operation.args && typeof operation.args === 'object' && !Array.isArray(operation.args)
      ? operation.args as Record<string, unknown>
      : {};
    const documentId = Number(args.document_id);
    if (!positiveDocumentId(documentId)) return [];
    const sceneGeometryModel = operation.scene_geometry_model
      && typeof operation.scene_geometry_model === 'object'
      && !Array.isArray(operation.scene_geometry_model)
      ? operation.scene_geometry_model as Record<string, unknown>
      : undefined;

    if (tool === 'photoshop_execute_visual_microplan') {
      const problemId = typeof operation.problem_id === 'string'
        ? operation.problem_id
        : typeof args.problem_id === 'string' ? args.problem_id : undefined;
      if (problemId) {
        const recovery = this.store.artisticRecoveryForProblem(
          documentId,
          problemId,
          operation,
          projectionContext?.records,
          projectionContext
        ) as Record<string, unknown> | null;
        const exhaustedMethodClasses = Array.isArray(recovery?.exhausted_method_classes)
          ? recovery!.exhausted_method_classes.map(String)
          : [];
        const currentMethodClass = typeof args.method_class === 'string' ? args.method_class : undefined;
        if (currentMethodClass && exhaustedMethodClasses.includes(currentMethodClass)) {
          const alternatives = paintingMethodCapabilities(this.registry)
            .filter(capability => capability.availability !== 'unavailable')
            .filter(capability => !exhaustedMethodClasses.includes(capability.methodClass))
            .map(capability => ({
              method_id: capability.id,
              method_class: capability.methodClass,
              primary_tool: capability.primaryTool ?? null,
              execution_tools: capability.executionTools ?? [],
              visual_intents: capability.visualIntents,
              impact_classes: capability.impactClasses,
            }));
          const distinctClasses = [...new Set(alternatives.map(item => item.method_class))];
          if (alternatives.length) {
            return [{
              scope: 'next_operation' as const,
              code: 'artistic_strategy_change_required',
              message: `Problem ${problemId} has exhausted method_class=${currentMethodClass}; choose one currently available causally distinct method class: ${distinctClasses.join('|')}. No Photoshop mutation was dispatched.`,
              details: {
                problem_id: problemId,
                exhausted_method_classes: exhaustedMethodClasses,
                available_causal_alternatives: alternatives,
                dispatch_performed: false,
              },
            }];
          }
          return [{
            scope: 'next_operation' as const,
            code: 'artistic_strategy_exhausted_no_alternative',
            message: `Problem ${problemId} has exhausted its currently available causal method classes; return to Art Director/human review. No Photoshop mutation was dispatched.`,
            details: {
              problem_id: problemId,
              exhausted_method_classes: exhaustedMethodClasses,
              available_causal_alternatives: [],
              next_owner: 'art-director-or-human',
              dispatch_performed: false,
            },
          }];
        }
      }
    }

    // The host-instance proof is available only on the matching UXP bridge.
    // Preserve the existing bounded COM fallback when UXP is not the selected
    // ready route, but never dispatch through a ready UXP route without proving
    // that the pinned numeric id still denotes the same live document object.
    let readiness = await this.uxpReadinessProbe({ forceRefresh: true });
    let warmedStateProbe: Awaited<ReturnType<typeof invokeUxpGetState>> | undefined;
    // The companion uses a long-poll transport, so its health endpoint can briefly
    // report disconnected while the exact read route is still healthy. Do one
    // bounded read-only wake/probe before treating that transient health sample as
    // authoritative. This does not relax the revision/readiness gate: readiness
    // must still become fully ready before any mutation can proceed.
    if (!(readiness.ready && readiness.revision_match && readiness.plugin_connected)) {
      warmedStateProbe = await this.uxpStateProbe().catch(() => undefined);
      if (warmedStateProbe?.ok === true) {
        readiness = await this.uxpReadinessProbe({ forceRefresh: true });
      }
    }
    if (!(readiness.ready && readiness.revision_match && readiness.plugin_connected)) {
      if (sceneGeometryModel) {
        return [{
          scope: 'next_operation' as const,
          code: 'scene_geometry_model_incarnation_unverified',
          message:
            `Cannot bind scene_geometry_model to the exact live document incarnation for document_id=${documentId}: ` +
            `the matching UXP witness route is not ready (connected=${readiness.plugin_connected}, ready=${readiness.ready}, revision_match=${readiness.revision_match}). ` +
            'No mutation was dispatched.',
        }];
      }
      return [];
    }

    const stateProbe = warmedStateProbe?.ok === true ? warmedStateProbe : await this.uxpStateProbe();
    if (stateProbe.ok !== true) {
      return [{
        scope: 'next_operation' as const,
        code: 'document_instance_probe_failed',
        message: `Cannot prove live document incarnation for document_id=${documentId} before ${tool}; UXP state read failed. No mutation was dispatched.`,
      }];
    }
    const document = stateProbe.data?.document as Record<string, unknown> | undefined;
    const activeLayer = stateProbe.data?.activeLayer;
    const activeDocumentId = Number(document?.id);
    if (!positiveDocumentId(activeDocumentId) || activeDocumentId !== documentId) {
      return [{
        scope: 'next_operation' as const,
        code: 'document_instance_target_mismatch',
        message: `Pinned document_id=${documentId} is not the active UXP document (active=${String(document?.id ?? 'none')}). No mutation was dispatched.`,
      }];
    }
    const documentWidth = Number(document?.width);
    const documentHeight = Number(document?.height);
    if (Number.isFinite(documentWidth) && documentWidth > 0
      && Number.isFinite(documentHeight) && documentHeight > 0) {
      onDocumentBounds?.({ documentId, width: documentWidth, height: documentHeight });
    }
    const observation = this.store.observeDocumentInstance(
      documentId,
      document?.instanceWitness,
      { observed_at: new Date().toISOString(), tool }
    ) as Record<string, unknown>;
    if (observation.status === 'witness_missing') {
      return [{
        scope: 'next_operation' as const,
        code: 'document_instance_witness_missing',
        message:
          `The ready UXP bridge did not provide the required live document-instance witness for document_id=${documentId}. ` +
          'Reload the matching companion build before mutation; stale document state was not trusted.',
      }];
    }
    if (observation.status === 'identity_unverified') {
      return [{ scope: 'next_operation' as const, code: 'document_identity_unverified',
        message: `UXP session changed for document_id=${documentId}; existing work was preserved. After user confirms the same open document, call photoshop_guard_resume with document_id and same_document_confirmed=true. Recovery collects its own pixel/owner evidence; do not inspect sources.` }];
    }
    if (observation.status === 'reincarnated') {
      this.capabilitySnapshotCache.delete(documentId);
      return [{
        scope: 'next_operation' as const,
        code: 'document_reincarnated',
        message:
          `Photoshop recycled document_id=${documentId} for a different live document instance. Guard reset stale document-scoped state and blocked ${tool} before dispatch. ` +
          'Bind a new art run/current evidence for this document instance before continuing.',
      }];
    }
    if (sceneGeometryModel) {
      const sourceFrame = sceneGeometryModel.source_frame
        && typeof sceneGeometryModel.source_frame === 'object'
        && !Array.isArray(sceneGeometryModel.source_frame)
        ? sceneGeometryModel.source_frame as Record<string, unknown>
        : {};
      const suppliedIncarnation = typeof sourceFrame.document_incarnation === 'string'
        ? sourceFrame.document_incarnation.trim()
        : '';
      const observedWitness = observation.host_witness
        && typeof observation.host_witness === 'object'
        && !Array.isArray(observation.host_witness)
        ? observation.host_witness as Record<string, unknown>
        : {};
      const observedIncarnation = typeof observedWitness.token === 'string'
        ? observedWitness.token.trim()
        : '';
      if (!observedIncarnation || suppliedIncarnation !== observedIncarnation) {
        return [{
          scope: 'next_operation' as const,
          code: 'scene_geometry_model_incarnation_mismatch',
          message:
            `scene_geometry_model_incarnation_mismatch: source_frame.document_incarnation=${suppliedIncarnation || 'missing'} ` +
            `must match the exact freshly observed UXP document incarnation=${observedIncarnation || 'missing'}. No mutation was dispatched.`,
        }];
      }
    }
    const geometryPreflight = operation.geometry_preflight
      && typeof operation.geometry_preflight === 'object'
      && !Array.isArray(operation.geometry_preflight)
      ? operation.geometry_preflight as Record<string, unknown>
      : undefined;
    const executableGeometry = geometryPreflight?.executable_geometry
      && typeof geometryPreflight.executable_geometry === 'object'
      && !Array.isArray(geometryPreflight.executable_geometry)
      ? geometryPreflight.executable_geometry as unknown as ExecutableGeometryProvenance
      : undefined;
    const operationArgs = operation.args && typeof operation.args === 'object' && !Array.isArray(operation.args)
      ? operation.args as Record<string, unknown> : {};
    const logicalLayer = operationArgs.logical_layer && typeof operationArgs.logical_layer === 'object'
      && !Array.isArray(operationArgs.logical_layer)
      ? operationArgs.logical_layer as Record<string, unknown> : {};
    const layerBoundsIssue = observedLayerBoundsIssue(executableGeometry, activeLayer, logicalLayer.layer_id);
    if (layerBoundsIssue) {
      return [{
        scope: 'next_operation' as const,
        code: layerBoundsIssue.code,
        message: `${layerBoundsIssue.message}. No mutation was dispatched.`,
      }];
    }
    return [];
  }

  private async ensureAutomaticCheckpointBeforeVisualMutation(
    operation: Record<string, unknown>,
    projectionContext?: GuardProjectionContext
  ): Promise<Record<string, unknown> | null> {
    if (!isGuardVisualTool(String(operation.tool ?? ''))) return null;
    const args = operation.args && typeof operation.args === 'object' && !Array.isArray(operation.args)
      ? operation.args as Record<string, unknown>
      : {};
    const documentId = Number(args.document_id);
    if (!positiveDocumentId(documentId)) return null;
    const checkpoint = this.store.checkpointState(documentId, projectionContext?.records, projectionContext);
    if (!checkpoint.due) return null;
    const checkpointStartedAt = Date.now();
    const projectDirectory = this.store.projectDirectory(documentId);
    if (!projectDirectory) {
      throw new Error('automatic_checkpoint_unavailable: checkpoint debt is due but the immutable art-run directory is not bound');
    }
    const source = (projectionContext?.records ?? this.store.records()).filter((record: any) =>
      Number(record?.args?.document_id) === documentId && record?.visual
    ).at(-1);
    if (!source?.id) {
      throw new Error('automatic_checkpoint_unavailable: checkpoint debt is due but no source visual operation can be identified');
    }
    const sourceKey = createHash('sha256').update(String(source.id)).digest('hex').slice(0, 10);
    const checkpointId = `auto-checkpoint-${documentId}-${sourceKey}`;
    const checkpointPath = path.join(projectDirectory, 'checkpoints', `auto-${source.sequence ?? 'frame'}-${sourceKey}.psd`);
    const run = await runLogicalOperation({
      store: this.store,
      input: {
        id: checkpointId,
        tool: 'photoshop_save_document',
        args: { document_id: documentId, path: checkpointPath, format: 'PSD' },
        summary: 'Persist the due layered PSD checkpoint internally before the next visual pass',
        purpose: 'Satisfy Guard checkpoint debt without consuming a model-facing protocol turn',
      },
      invoke: (name, invokeArgs, timeout) => this.invoke(name, invokeArgs, timeout, { guardOperationId: checkpointId }),
      materializeArguments: (tool, invokeArgs, id) => this.materializeArguments(tool, invokeArgs, id),
    });
    const saved = run.record?.id ? this.store.read(run.record.id) : run.record;
    const recordCheckpointLatency = () => this.store.recordLatency(checkpointId, {
      automatic_checkpoint_wall_ms: Date.now() - checkpointStartedAt,
      checkpoint_measurement_boundary: 'before_latency_persistence',
      photoshop_dispatch_wall_ms: run.timing?.photoshop_dispatch_wall_ms ?? null,
    });
    if (!saved || saved.failed === true || saved.phase !== 'completed' || !saved.checkpoint) {
      if (saved?.id) recordCheckpointLatency();
      throw new Error(
        `automatic_checkpoint_failed: layered PSD was not durably verified at ${checkpointPath}; operation ${checkpointId} remains authoritative and must be reconciled before visual work`
      );
    }
    if (!saved.report) {
      this.store.report({
        id: checkpointId,
        did: 'Saved the due layered PSD checkpoint internally.',
        why: 'Checkpoint debt reached its mutation-risk limit before the next visual pass.',
        result: `Verified a non-empty PSD at ${checkpointPath}.`,
      });
    }
    const acknowledged = this.store.read(checkpointId);
    if (acknowledged?.operation_receipt && !acknowledged.operation_ack) {
      this.store.ackOperation({ id: checkpointId, token: acknowledged.operation_receipt.token });
    }
    const latency = recordCheckpointLatency();
    return {
      protocol: 'photoshop.guard.automatic_checkpoint.v1',
      timing: {
        wall_ms: latency?.automatic_checkpoint_wall_ms ?? null,
        photoshop_dispatch_wall_ms: latency?.photoshop_dispatch_wall_ms ?? null,
        photoshop_reported_execution_ms: latency?.photoshop_reported_execution_ms ?? null,
        measurement_boundary: 'before_latency_persistence',
      },
      operation_id: checkpointId,
      path: checkpointPath,
      source_operation_id: source.id,
      debt_points: checkpoint.debt_points,
      debt_limit: checkpoint.debt_limit,
      verified: true,
    };
  }
  async cycle(
    input: Record<string, unknown>,
    owningJobId?: string,
    options: {
      dispatchMode?: 'sync' | 'auto' | 'async';
      prepared?: {
        operation: Record<string, unknown>;
        guardPreflightMs: number;
        cycleReceivedAt: string;
        cycleStartedAt: number;
        requestJsonBytes: number;
        closedPrevious?: Record<string, unknown>;
        compilerTelemetry?: GuardCompilerTelemetry;
        compilerRepairAudit?: GuardCompilerRepairAudit;
        compilerDeferredFromOperationId?: string;
        automaticCheckpoint?: Record<string, unknown>;
      };
    } = {}
  ): Promise<Record<string, unknown>> {
    const cycleReceivedAt = options.prepared?.cycleReceivedAt ?? new Date().toISOString();
    const cycleStartedAt = options.prepared?.cycleStartedAt ?? Date.now();
    const requestJsonBytes = options.prepared?.requestJsonBytes
      ?? Buffer.byteLength(JSON.stringify(input), 'utf8');
    let cycleInput = structuredClone(input) as Record<string, unknown>;
    let nextOperation = options.prepared?.operation;
    let guardPreflightMs = options.prepared?.guardPreflightMs ?? 0;
    let compilerNormalizations: Array<{ code: string; message: string }> = [];
    let compilerTelemetry = options.prepared?.compilerTelemetry;
    let compilerRepairAudit = options.prepared?.compilerRepairAudit;
    let compilerDeferredFromOperationId = options.prepared?.compilerDeferredFromOperationId;

    const releaseController = this.store.lock();
    let releaseExecution: (() => void) | undefined;
    try {
      // The active-job check belongs inside the same cross-process controller
      // lock used by startJob(). Otherwise a synchronous cycle can observe no
      // jobs, lose the race to an async reservation, and still execute later.
      const projectionCapturedAt = Date.now();
      const activeJobSnapshotStartedAt = Date.now();
      let cycleProjection = this.store.captureProjectionContext({
        capturedAt: projectionCapturedAt,
      });
      let activeJobSnapshot = cycleProjection.activeJobs;
      let activeJobSnapshotMs = Date.now() - activeJobSnapshotStartedAt;
      const abandoned = await this.autoAbandonMissingDocuments('guard_cycle_fallback', cycleProjection);
      if (abandoned.length) {
        const refreshedAt = Date.now();
        const refreshStartedAt = Date.now();
        cycleProjection = this.store.captureProjectionContext({ capturedAt: refreshedAt });
        activeJobSnapshot = cycleProjection.activeJobs;
        activeJobSnapshotMs += Date.now() - refreshStartedAt;
      }
      const activeJobs = activeJobSnapshot.filter((job: { job_id?: string }) => job.job_id !== owningJobId);
      if (activeJobs.length) {
        throw new Error(`Guard job ${activeJobs.at(-1)?.job_id ?? 'unknown'} is already active; poll it instead of starting replacement work`);
      }
      let closedPrevious: Record<string, unknown> = options.prepared?.closedPrevious ?? { closed: false };
      let closureGuardMs = 0;
      if (!options.prepared) {
        const preflightStartedAt = Date.now();
        const compilerOptions: GuardCycleCompilerOptions = {
          collectDynamicOperationViolations: (operation) => this.collectDynamicOperationViolations(
            operation,
            (bounds) => { compilerOptions.visualMicroPlanDocumentBounds = bounds; },
            cycleProjection
          ),
          projectionContext: cycleProjection,
        };
        const compiledCycle = await compileGuardCycle(cycleInput, this.store, this.registry, compilerOptions);
        guardPreflightMs = Date.now() - preflightStartedAt;
        cycleInput = compiledCycle.input;
        nextOperation = compiledCycle.nextOperation;
        compilerNormalizations = compiledCycle.normalizations;
        compilerTelemetry = compiledCycle.compilerTelemetry;
        compilerRepairAudit = compiledCycle.repairAudit;
        compilerDeferredFromOperationId = compiledCycle.compilerDeferredFromOperationId;

        if (compiledCycle.rejection) {
          // E.7a: closure and continuation are independent transactions. A
          // deterministic next-operation rejection must not keep an otherwise
          // valid delivered observation pending merely because both arrived in
          // the compact combined call.
          let rejectedCycleClosedPrevious: Record<string, unknown> = { closed: false };
          const rejectedPreviousOperationId = typeof cycleInput.previous_operation_id === 'string'
            ? cycleInput.previous_operation_id
            : undefined;
          const rejectedPreviousRecord = rejectedPreviousOperationId
            ? this.store.read(rejectedPreviousOperationId)
            : undefined;
          const rejectedDeliveryDebt = rejectedPreviousRecord?.visual && !rejectedPreviousRecord?.verdict
            ? this.store.visualDeliveryDebt(rejectedPreviousRecord)
            : null;
          if (rejectedPreviousOperationId) {
            if (rejectedPreviousRecord && !rejectedDeliveryDebt) {
              const rejectedClosureSnapshot = this.store.snapshotClosureState(rejectedPreviousOperationId);
              try {
                rejectedCycleClosedPrevious = this.store.closePreviousCycle(cycleInput);
              } catch {
                // The rejection response remains about the deterministic
                // compiler errors. Invalid closure evidence must not be
                // partially persisted or replace those errors here; a valid
                // closure is the only side effect admitted on this path.
                this.store.restoreClosureState(rejectedClosureSnapshot);
                rejectedCycleClosedPrevious = { closed: false };
              }
            }
          }
          const envelope: GuardEnvelope = nextOperation
            ? buildPreflightRejectionEnvelope(nextOperation, compiledCycle.rejection, {
                closed_previous: compactClosedPrevious(rejectedCycleClosedPrevious),
              })
            : {
                mode: 'photoshop-mcp-cycle',
                closed_previous: compactClosedPrevious(rejectedCycleClosedPrevious),
                execution: null,
                preflight_rejection: (() => {
                  const textItem = compiledCycle.rejection?.content?.find((item) => item.type === 'text');
                  const text = textItem?.type === 'text' ? textItem.text : undefined;
                  try { return text ? JSON.parse(String(text)) : {}; } catch { return { message: String(text ?? '') }; }
                })(),
                preview: null,
                significance: undefined,
                operation_receipt: null,
                required_user_report: null,
                required_operation_ack: null,
                next_state: 'terminal_not_executed',
                next_required_action: 'Correct all listed deterministic cycle errors together and retry the same semantic Guard cycle.',
              };
          if (compiledCycle.violations.some((item) => item.scope === 'finalization')) {
            envelope.finalization_rejection = envelope.preflight_rejection;
          }
          // Compilation can reject closure before the ordinary delivery-recovery
          // branch. Keep every violation, but make the required read actionable.
          if (rejectedDeliveryDebt && rejectedPreviousOperationId) {
            envelope.delivery_recovery = {
              ...rejectedDeliveryDebt,
              read_only: true,
              mutation_replayed: false,
              next_mutation_dispatched: false,
              action: 'call_photoshop_guard_review_image',
              review_tool: 'photoshop_guard_review_image',
              review_operation_id: rejectedPreviousOperationId,
              review_arguments: { operation_id: rejectedPreviousOperationId },
            };
            envelope.next_required_action = `Call photoshop_guard_review_image with operation_id=${rejectedPreviousOperationId} and inspect all required exact review images. Then resubmit previous_operation_id=${rejectedPreviousOperationId} + previous_observation and the intended next_pass, correcting any other listed errors. Omit next_pass for close-only finalization. Do not replay the previous mutation or substitute photoshop_get_preview.`;
          }
          envelope.cycle_latency = {
            protocol: 'photoshop.guard.cycle_latency.v1',
            inter_call_unattributed_gap_ms: null,
            decision_model_gap_ms: null,
            guard_preflight_ms: guardPreflightMs,
            photoshop_dispatch_wall_ms: null,
            photoshop_reported_execution_ms: null,
            preview_capture_materialization_ms: null,
            visual_evaluation_verdict_gap_ms: null,
            report_ack_closure_ms: null,
            recovery_reconciliation_ms: null,
            guard_cycle_total_ms: Date.now() - cycleStartedAt,
            semantic_cycle_wall_ms: null,
            request_json_bytes: requestJsonBytes,
            closure_request_json_bytes: null,
            guard_invocation_count_observed: 1,
            model_call_count: null,
            ...(compilerTelemetry ?? {}),
            unknown_components: [
              'decision/model/host time before this Guard invocation is not observable for a rejected cycle',
            ],
          };
          return {
            ...envelope,
            ...(compilerNormalizations.length ? { compiler_normalizations: compilerNormalizations } : {}),
            ...(compilerRepairAudit ? { compiler_repair_audit: compilerRepairAudit } : {}),
            guard_transport: 'embedded_mcp',
          };
        }

        const previousOperationId = typeof cycleInput.previous_operation_id === 'string'
          ? cycleInput.previous_operation_id
          : undefined;
        const previousRecordBeforeClosure = previousOperationId
          ? this.store.read(previousOperationId)
          : undefined;
        const deliveryDebt = previousRecordBeforeClosure?.visual
          && !previousRecordBeforeClosure?.verdict
          ? this.store.visualDeliveryDebt(previousRecordBeforeClosure)
          : null;
        if (deliveryDebt && previousOperationId) {
          const envelope = buildCycleEnvelope(this.store, previousRecordBeforeClosure, {
            replay: false,
            closed_previous: { closed: false },
          });
          return {
            ...envelope,
            delivery_recovery: {
              ...deliveryDebt,
              read_only: true,
              mutation_replayed: false,
              next_mutation_dispatched: false,
              action: 'call_photoshop_guard_review_image',
              review_tool: 'photoshop_guard_review_image',
              review_operation_id: previousOperationId,
              review_arguments: { operation_id: previousOperationId },
            },
            guard_transport: 'embedded_mcp',
          };
        }
        const reviewFindings: unknown[] = cycleInput.previous_visual_verdict
          && typeof cycleInput.previous_visual_verdict === 'object'
          && !Array.isArray(cycleInput.previous_visual_verdict)
          && Array.isArray((cycleInput.previous_visual_verdict as Record<string, unknown>).review_findings)
          ? (cycleInput.previous_visual_verdict as Record<string, unknown>).review_findings as unknown[]
          : [];
        const previousVisualVerdict = cycleInput.previous_visual_verdict
          && typeof cycleInput.previous_visual_verdict === 'object'
          && !Array.isArray(cycleInput.previous_visual_verdict)
          ? cycleInput.previous_visual_verdict as Record<string, unknown>
          : undefined;
        const escalationOptions = {
          persist: false,
          uncertainty_review: previousVisualVerdict?.uncertainty_review,
          target_resolved: previousVisualVerdict?.target_resolved,
        };
        const reviewEscalation: any = previousOperationId
          && previousRecordBeforeClosure?.visual
          && !previousRecordBeforeClosure?.verdict
          ? (this.store.planReviewEscalation as any)(previousOperationId, reviewFindings, escalationOptions)
          : null;
        if (reviewEscalation?.required && previousOperationId) {
          const persistedPlan: any = (this.store.planReviewEscalation as any)(previousOperationId, reviewFindings, {
            ...escalationOptions,
            persist: true,
          });
          const wholeLongEdge = Math.max(
            Number(previousRecordBeforeClosure?.preview?.width) || 0,
            Number(previousRecordBeforeClosure?.preview?.height) || 0
          ) || Number(previousRecordBeforeClosure?.visual_review_profile?.whole_max_dimension_px) || 1600;
          for (const capture of persistedPlan.captures) {
            if (typeof capture.capture_id !== 'string' || !capture.capture_id) {
              throw new Error('Review escalation capture is missing immutable capture_id');
            }
            const previewArgs = this.materializeArguments(
              'photoshop_get_preview',
              {
                document_id: persistedPlan.document_id,
                max_dimension_px: wholeLongEdge,
                quality: 8,
                focus_region: capture.effective_region,
                focus_max_dimension_px: capture.focus_max_dimension_px,
              },
              `${previousOperationId}-review-${capture.capture_id}`
            );
            const result = await this.invoke('photoshop_get_preview', previewArgs, 60_000, {
              guardOperationId: previousOperationId,
            });
            const rawPreview = previewOf(result);
            if (!rawPreview) throw new Error('Read-only review escalation did not return materialized preview evidence');
            this.store.attachReviewEvidence(previousOperationId, capture, {
              ...rawPreview,
              document_id: persistedPlan.document_id,
            });
          }
          const refreshed = this.store.read(previousOperationId);
          const envelope = buildCycleEnvelope(this.store, refreshed, {
            replay: false,
            closed_previous: { closed: false },
          });
          return {
            ...envelope,
            review_escalation: {
              protocol: 'photoshop.guard.review_escalation.v1',
              operation_id: previousOperationId,
              read_only: true,
              mutation_replayed: false,
              next_mutation_dispatched: false,
              captured_roles: persistedPlan.captures.map((capture: { role: string }) => capture.role),
              remaining_after_round: persistedPlan.remaining_after_round,
              bound_whole_sha256: persistedPlan.bound_whole_sha256,
            },
            guard_transport: 'embedded_mcp',
          };
        }
        const closureSnapshot = previousOperationId
          ? this.store.snapshotClosureState(previousOperationId)
          : undefined;
        const closureStartedAt = Date.now();
        try {
          closedPrevious = this.store.closePreviousCycle(cycleInput);
          if (!nextOperation && closedPrevious.closed && !isGuardReadTool(previousRecordBeforeClosure?.tool)) {
            const documentId = previousRecordBeforeClosure?.args?.document_id;
            if (Number.isSafeInteger(documentId) && documentId > 0) {
              const closedRecord = previousOperationId ? this.store.read(previousOperationId) : undefined;
              const documentState = this.store.paintingState().documents?.[String(documentId)];
              const artisticDebtRemains = documentArtisticDebt(documentState, closedRecord).length > 0
                || this.store.constructionBindings(documentId).some(binding => !binding.constructed || binding.needs_rebuild);
              this.store.setWorkflowLifecycle(
                documentId,
                artisticDebtRemains ? 'active' : 'stopped',
                artisticDebtRemains
                  ? 'close_only_artistic_debt_remains'
                  : 'close_only_finalization',
                previousOperationId
              );
            }
          }
        } catch (error) {
          if (closureSnapshot) this.store.restoreClosureState(closureSnapshot);
          throw error;
        }
        closureGuardMs = Date.now() - closureStartedAt;

        if (nextOperation && closedPrevious.closed && closureSnapshot) {
          const refreshedPrevious = previousOperationId ? this.store.read(previousOperationId) : undefined;
          const restoredSource = refreshedPrevious?.verdict?.recovery?.semantic_state_restored && refreshedPrevious.undo_source_operation_id
            ? this.store.read(refreshedPrevious.undo_source_operation_id) : undefined;
          const refreshedRecords = refreshedPrevious
            ? cycleProjection.records.map((record) => record.id === previousOperationId ? refreshedPrevious
              : record.id === restoredSource?.id ? restoredSource : record)
            : cycleProjection.records;
          cycleProjection = this.store.captureProjectionContext({
            records: refreshedRecords as GuardProjectionContext['records'],
            activeJobs: cycleProjection.activeJobs,
            capturedAt: Date.now(),
          });
          const postClosureStartedAt = Date.now();
          const postClosureCheck = await compileGuardCycle(
            { next_operation: nextOperation },
            this.store,
            this.registry,
            {
              projectionContext: cycleProjection,
              nextOperationValidation: 'state-only',
              ...(compilerDeferredFromOperationId ? { compilerDeferredFromOperationId } : {}),
            }
          );
          guardPreflightMs += Date.now() - postClosureStartedAt;
          if (postClosureCheck.rejection) {
            this.store.restoreClosureState(closureSnapshot);
            const envelope = buildPreflightRejectionEnvelope(
              postClosureCheck.nextOperation ?? nextOperation,
              postClosureCheck.rejection,
              { closed_previous: { closed: false } }
            );
            const body = envelope.preflight_rejection;
            envelope.preflight_rejection = body && typeof body === 'object'
              ? { ...body as Record<string, unknown>, post_closure_semantic_revalidation: true }
              : body;
            envelope.cycle_latency = {
              protocol: 'photoshop.guard.cycle_latency.v1',
              inter_call_unattributed_gap_ms: null,
              decision_model_gap_ms: null,
              guard_preflight_ms: guardPreflightMs,
              photoshop_dispatch_wall_ms: null,
              photoshop_reported_execution_ms: null,
              preview_capture_materialization_ms: null,
              visual_evaluation_verdict_gap_ms: null,
              report_ack_closure_ms: null,
              recovery_reconciliation_ms: null,
              guard_cycle_total_ms: Date.now() - cycleStartedAt,
              semantic_cycle_wall_ms: null,
              request_json_bytes: requestJsonBytes,
              closure_request_json_bytes: null,
              guard_invocation_count_observed: 1,
              model_call_count: null,
              unknown_components: [],
            };
            return { ...envelope, guard_transport: 'embedded_mcp' };
          }
          nextOperation = postClosureCheck.nextOperation ?? nextOperation;
        }

        if (!nextOperation) {
          try {
            if (closedPrevious.closed && previousOperationId) {
              this.store.closeLatency(previousOperationId, cycleReceivedAt, closureGuardMs, requestJsonBytes);
            }
            const closureWriteMs = Date.now() - closureStartedAt;
            const responseConstructionStartedAt = Date.now();
            const previousRecord = previousOperationId ? this.store.read(previousOperationId) : undefined;
            const restoredSource = previousRecord?.verdict?.recovery?.semantic_state_restored && previousRecord.undo_source_operation_id
              ? this.store.read(previousRecord.undo_source_operation_id) : undefined;
            const documentId = previousRecordBeforeClosure?.args?.document_id;
            const finalizationProjection = this.store.captureProjectionContext({
              records: previousRecord
                ? cycleProjection.records.map(record => record.id === previousOperationId ? previousRecord
                  : record.id === restoredSource?.id ? restoredSource : record)
                : cycleProjection.records,
              activeJobs: cycleProjection.activeJobs,
              capturedAt: Date.now(),
            });
            const nextRequiredAction = this.store.closeOnlyNextRequiredAction(documentId, finalizationProjection);
            const response = {
              mode: 'photoshop-mcp-cycle-finalization',
              closed_previous: compactClosedPrevious(closedPrevious),
              cycle_latency: previousRecord?.latency ?? null,
              next_state: nextRequiredAction === 'ready' ? 'closed' : 'continue_required',
              next_required_action: nextRequiredAction,
              guard_transport: 'embedded_mcp',
              ...(compilerNormalizations.length ? { compiler_normalizations: compilerNormalizations } : {}),
            };
            const responseConstructionMs = Date.now() - responseConstructionStartedAt;
            const finalizationTotalMs = Date.now() - cycleStartedAt;
            return {
              ...response,
              finalization_latency: {
                protocol: 'photoshop.guard.finalization_latency.v1',
                guard_preflight_ms: guardPreflightMs,
                active_job_snapshot_ms: activeJobSnapshotMs,
                closure_write_ms: closureWriteMs,
                status_projection_ms: 0,
                response_construction_ms: responseConstructionMs,
                finalization_total_ms: finalizationTotalMs,
              },
            };
          } catch (error) {
            if (closureSnapshot) this.store.restoreClosureState(closureSnapshot);
            throw error;
          }
        }
        if (closedPrevious.closed && previousOperationId) {
          this.store.closeLatency(previousOperationId, cycleReceivedAt, closureGuardMs, requestJsonBytes);
        }
      } else {
        cycleInput = { next_operation: options.prepared.operation };
      }

      if (!nextOperation) {
        throw new Error('Guard compiler invariant violated: executable cycle has no next operation');
      }

      const newAutomaticCheckpoint = await this.ensureAutomaticCheckpointBeforeVisualMutation(nextOperation, cycleProjection);
      const automaticCheckpoint = newAutomaticCheckpoint ?? options.prepared?.automaticCheckpoint;
      if (newAutomaticCheckpoint) {
        cycleProjection = this.store.captureProjectionContext({
          activeJobs: activeJobSnapshot,
          capturedAt: Date.now(),
        });
      }

      const dispatchMode = options.dispatchMode ?? 'sync';
      const useAsyncJob = !options.prepared && (
        dispatchMode === 'async'
        || (dispatchMode === 'auto' && shouldRunAsyncJob(nextOperation, cycleProjection.records))
      );
      if (useAsyncJob) {
        const preparedInput = { next_operation: nextOperation };
        return this.reservePreparedJob(preparedInput, nextOperation, {
          operation: nextOperation,
          guardPreflightMs,
          cycleReceivedAt,
          cycleStartedAt,
          requestJsonBytes,
          closedPrevious,
          ...(automaticCheckpoint ? { automaticCheckpoint } : {}),
          ...(compilerTelemetry ? { compilerTelemetry } : {}),
          ...(compilerRepairAudit ? { compilerRepairAudit } : {}),
          ...(compilerDeferredFromOperationId ? { compilerDeferredFromOperationId } : {}),
        }, this.store.presentationContext(Number((nextOperation.args as Record<string, unknown> | undefined)?.document_id), cycleProjection.paintingState));
      }

      releaseExecution = this.executionLease.acquire('photoshop_guard_cycle_auto');
      const executionOperation = nextOperation;
      const dispatchStartedAt = new Date().toISOString();
      const traceDocumentId = Number((executionOperation?.args as Record<string, unknown> | undefined)?.document_id);
      const traceProjectDirectory = Number.isSafeInteger(traceDocumentId) && traceDocumentId > 0
        ? this.store.projectDirectory(traceDocumentId)
        : undefined;

      const run = await runLogicalOperation({
        store: this.store,
        input: executionOperation,
        invoke: (name: string, args: Record<string, unknown>, timeout: number) => this.invoke(name, args, timeout, {
          guardOperationId: typeof executionOperation.id === 'string' ? executionOperation.id : undefined,
        }),
        materializeArguments: (tool: string, args: Record<string, unknown>, id: string) => this.materializeArguments(tool, args, id),
        onProgress: undefined,
        projectionContext: cycleProjection,
        ...(compilerDeferredFromOperationId ? { compilerDeferredFromOperationId } : {}),
        mutationLifecycle: traceProjectDirectory ? {
          beforeMutation: async (record) => {
            if (!record.visual) return undefined;
            const exportSequence = this.store.reserveExportSequence(traceDocumentId, String(record.id));
            const validExportSequence = Number.isSafeInteger(exportSequence) && Number(exportSequence) > 0
              ? Number(exportSequence)
              : undefined;
            return (await prepareProcessVideoCapture(traceProjectDirectory, String(record.id), {
              ...(validExportSequence !== undefined ? { sequence: validExportSequence } : {}),
              ...(this.processVideoTraceEnabled === undefined
                ? {}
                : { enabled: this.processVideoTraceEnabled }),
            })).capture;
          },
          afterMutation: async (record, token) => {
            if (token) return (await stopProcessVideoCapture(traceProjectDirectory, token as any, record, { kind: 'attempt' })).timing;
            return undefined;
          },
        } : undefined,
      });
      if (run.record?.id) {
        const previewTimingUnknown = run.record?.visual && run.timing?.preview_capture_materialization_ms == null
          ? ['preview capture/materialization is embedded inside the dispatched operation and cannot be separated from photoshop_dispatch_wall_ms']
          : [];
        this.store.recordLatency(run.record.id, {
          cycle_received_at: cycleReceivedAt,
          guard_preflight_ms: guardPreflightMs,
          ...(compilerTelemetry ?? {}),
          dispatch_started_at: dispatchStartedAt,
          ...(compilerRepairAudit ? { compiler_repair_audit: compilerRepairAudit } : {}),
          photoshop_dispatch_wall_ms: run.timing?.photoshop_dispatch_wall_ms ?? null,
          recorder_prepare_ms: run.timing?.recorder_prepare_ms ?? null,
          recorder_finalize_ms: run.timing?.recorder_finalize_ms ?? null,
          recorder_settle_ms: run.timing?.recorder_settle_ms ?? null,
          recorder_stop_ms: run.timing?.recorder_stop_ms ?? null,
          recorder_postprocess_ms: run.timing?.recorder_postprocess_ms ?? null,
          preview_capture_materialization_ms: run.timing?.preview_capture_materialization_ms ?? null,
          ...(automaticCheckpoint ? { automatic_checkpoint_operation_id: automaticCheckpoint.operation_id } : {}),
          request_json_bytes: requestJsonBytes,
          guard_invocation_count_observed: 1,
          model_call_count: null,
          unknown_components: previewTimingUnknown,
        });
        if (owningJobId) {
          const asyncRecord = this.store.read(run.record.id);
          const asyncDocumentId = Number(asyncRecord?.args?.document_id);
          if (Number.isSafeInteger(asyncDocumentId) && asyncDocumentId > 0) {
            this.store.recordArtisticThroughputEvent(asyncDocumentId, {
              kind: 'async-execution',
              model_visible: false,
              semantic_actions: semanticActionsFromRecord(asyncRecord),
              operation_id: run.record.id,
              job_id: owningJobId,
            });
          }
        }
      }
      let refreshedRecord = run.record?.id ? this.store.read(run.record.id) : run.record;
      if (
        refreshedRecord?.id
        && refreshedRecord.visual
        && refreshedRecord.preview
        && refreshedRecord.execution !== 'not-executed'
        && refreshedRecord.failed !== true
        && refreshedRecord.visual_review_profile?.level === 'micro'
        && refreshedRecord.args?.object_context_region_bounds
      ) {
        const contextPlan: any = (this.store.planReviewEscalation as any)(refreshedRecord.id, [], {
          persist: true,
          context_only: true,
          context_review_region: refreshedRecord.args.object_context_region_bounds,
        });
        if (contextPlan.required) {
          const wholeLongEdge = Math.max(
            Number(refreshedRecord.preview.width) || 0,
            Number(refreshedRecord.preview.height) || 0
          ) || Number(refreshedRecord.visual_review_profile?.whole_max_dimension_px) || 1600;
          for (const capture of contextPlan.captures) {
            const previewArgs = this.materializeArguments(
              'photoshop_get_preview',
              {
                document_id: contextPlan.document_id,
                max_dimension_px: wholeLongEdge,
                quality: 8,
                focus_region: capture.effective_region,
                focus_max_dimension_px: capture.focus_max_dimension_px,
              },
              `${refreshedRecord.id}-context-${capture.capture_id}`
            );
            const result = await this.invoke('photoshop_get_preview', previewArgs, 60_000, {
              guardOperationId: refreshedRecord.id,
            });
            const rawPreview = previewOf(result);
            if (!rawPreview) throw new Error('Direct MICRO object-context capture did not return materialized preview evidence');
            this.store.attachReviewEvidence(refreshedRecord.id, capture, {
              ...rawPreview,
              document_id: contextPlan.document_id,
            });
          }
          refreshedRecord = this.store.read(refreshedRecord.id);
        }
      }
      let acceptedAnchorRestoreResult: Record<string, unknown> | undefined;
      if (
        refreshedRecord?.id
        && refreshedRecord.accepted_anchor_restore
        && refreshedRecord.execution !== 'not-executed'
        && refreshedRecord.failed !== true
      ) {
        const restoreContract = refreshedRecord.accepted_anchor_restore as Record<string, unknown>;
        const documentId = Number(refreshedRecord.args?.document_id);
        const anchorOperationId = typeof restoreContract.anchor_operation_id === 'string'
          ? restoreContract.anchor_operation_id
          : '';
        const expectedSnapshot = this.store.acceptedAnchorRestoreSnapshot(documentId, anchorOperationId);
        if (!expectedSnapshot) {
          throw new Error('accepted_anchor_restore_snapshot_missing_after_dispatch: durable anchor snapshot disappeared before verification');
        }
        const actualSnapshot = await this.captureAnchorRestoreSnapshot(documentId);
        const verification = anchorRestoreVerification(expectedSnapshot, actualSnapshot);
        refreshedRecord = this.store.finalizeAcceptedAnchorRestore(refreshedRecord.id, verification);
        acceptedAnchorRestoreResult = {
          protocol: 'photoshop.guard.accepted_anchor_restore.v1',
          completed: true,
          operation_id: refreshedRecord.id,
          anchor_operation_id: anchorOperationId,
          anchor_sha256: restoreContract.anchor_sha256,
          exact_preview_sha_restored: refreshedRecord.preview?.sha256 === restoreContract.anchor_sha256,
          state_verification: verification,
          semantic_state_restored: refreshedRecord.verdict.recovery.semantic_state_restored,
          semantic_restore_scope: refreshedRecord.verdict.recovery.semantic_restore_scope,
          director_restore_scope: refreshedRecord.verdict.recovery.director_restore_scope,
          mutation_replayed: false,
          model_supplied_undo_steps: false,
        };
      }
      const envelope = buildCycleEnvelope(this.store, refreshedRecord, {
        replay: run.replay,
        closed_previous: closedPrevious,
        projectionContext: cycleProjection,
      });
      if (run.record?.id) {
        const responseReadyAt = new Date().toISOString();
        const latency = this.store.recordLatency(run.record.id, {
          response_ready_at: responseReadyAt,
          guard_cycle_total_ms: Date.now() - cycleStartedAt,
        });
        envelope.cycle_latency = latency ?? envelope.cycle_latency ?? null;
      }
      return {
        ...envelope,
        ...(automaticCheckpoint ? { automatic_checkpoint: automaticCheckpoint } : {}),
        ...(acceptedAnchorRestoreResult ? { accepted_anchor_restore: acceptedAnchorRestoreResult } : {}),
        ...(compilerNormalizations.length ? { compiler_normalizations: compilerNormalizations } : {}),
        ...(compilerRepairAudit ? { compiler_repair_audit: compilerRepairAudit } : {}),
        guard_transport: 'embedded_mcp',
      };
    } finally {
      releaseExecution?.();
      releaseController();
    }
  }

  async cycleAuto(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const documentId = cycleInputDocumentId(this.store, input);
    const hasNextPass = !!(input.next_pass && typeof input.next_pass === 'object' && !Array.isArray(input.next_pass));
    const hasPaintingIntent = !!(input.painting_intent && typeof input.painting_intent === 'object' && !Array.isArray(input.painting_intent));
    const hasSemanticRequest = hasNextPass || hasPaintingIntent;
    const hasPreviousOperation = typeof input.previous_operation_id === 'string'
      && input.previous_operation_id.trim().length > 0;
    const requestKey = hasPaintingIntent
      ? (input.painting_intent as Record<string, unknown>).request_key
      : hasNextPass
        ? (input.next_pass as Record<string, unknown>).request_key
        : undefined;
    if (
      documentId
      && hasSemanticRequest
      && !hasPreviousOperation
      && !(typeof requestKey === 'string' && requestKey.trim() && this.store.read(requestKey))
    ) {
      try {
        const resumable = this.resume(documentId);
        const pendingVisual = resumable.pending_visual_verdict;
        const continuationWatch = resumable.continuation_watch;
        if (
          pendingVisual
          && typeof pendingVisual === 'object'
          && !Array.isArray(pendingVisual)
          && continuationWatch
          && typeof continuationWatch === 'object'
          && !Array.isArray(continuationWatch)
          && (continuationWatch as Record<string, unknown>).silent_stall === true
        ) {
          // This early redirect is a model-visible rejected/deferred round trip,
          // even though it never reaches the ordinary cycle result accounting.
          // The pending visual operation belongs to the *previous* request;
          // attributing this new attempt to that operation would contaminate
          // concurrent run counters. Keep the event deliberately unkeyed.
          try {
            this.store.recordArtisticThroughputEvent(documentId, {
              kind: 'rejected',
              model_visible: true,
              semantic_actions: 0,
            });
          } catch {
            // A failed diagnostic write must not bypass the pending-visual
            // safety redirect and dispatch the stale next pass.
          }
          return {
            ...resumable,
            ok: true,
            mode: 'photoshop-guard-continuation-required',
            next_pass_deferred: true,
            next_mutation_dispatched: false,
            next_required_action:
              'Inspect the pending delivered frame, then call photoshop_guard_cycle_auto with previous_operation_id + previous_observation and include the intended next_pass in that same call.',
          };
        }
      } catch {
        // A not-yet-established document state must proceed through ordinary compiler/preflight.
      }
    }
    let result: Record<string, unknown>;
    try {
      result = await this.cycle(input, undefined, { dispatchMode: 'auto' });
    } catch (error) {
      if (documentId) {
        try {
          this.store.recordArtisticThroughputEvent(documentId, {
            kind: 'rejected',
            model_visible: true,
            semantic_actions: 0,
          });
        } catch {
          // A diagnostic write failure must never replace the original Guard
          // exception or imply that a rejected operation was dispatched.
        }
      }
      throw error;
    }
    // The Guard result is already decided. Keep diagnostic persistence outside
    // the execution catch: a failed counter/audit write must not turn a valid
    // result into a second, fictitious rejected model-visible round trip.
    const telemetryFailures: string[] = [];
    if (documentId) {
      const execution = result.execution && typeof result.execution === 'object' && !Array.isArray(result.execution)
        ? result.execution as Record<string, unknown>
        : undefined;
      const operationId = typeof execution?.operation_id === 'string'
        ? execution.operation_id
        : typeof result.operation_id === 'string' ? result.operation_id : undefined;
      let record: ReturnType<typeof this.store.read> | undefined;
      let recordReadFailed = false;
      if (operationId) {
        try {
          record = this.store.read(operationId);
        } catch {
          recordReadFailed = true;
          telemetryFailures.push('throughput_record_read_failed');
        }
      }
      const rejected = !!result.preflight_rejection || execution?.execution === 'not-executed';
      const asyncStarting = result.mode === 'photoshop-guard-async'
        && (result.state === 'starting' || result.state === 'running');
      const cycleLatency = result.cycle_latency && typeof result.cycle_latency === 'object' && !Array.isArray(result.cycle_latency)
        ? result.cycle_latency as Record<string, unknown>
        : {};
      if (!recordReadFailed) {
        try {
          this.store.recordArtisticThroughputEvent(documentId, {
            kind: rejected ? 'rejected' : hasSemanticRequest ? 'semantic-dispatch' : 'bookkeeping',
            model_visible: true,
            semantic_actions: asyncStarting ? 0 : semanticActionsFromRecord(record),
            auto_repair_count: cycleLatency.auto_repair_count,
            auto_split_count: cycleLatency.auto_split_count,
            model_semantic_ambiguity_count: cycleLatency.model_semantic_ambiguity_count,
            preflight_rejection_exposed_to_model_count: cycleLatency.preflight_rejection_exposed_to_model_count,
            deterministic_violations_encountered_count: cycleLatency.deterministic_violations_encountered_count,
            deterministic_violations_repaired_count: cycleLatency.deterministic_violations_repaired_count,
            deterministic_violations_unresolved_count: cycleLatency.deterministic_violations_unresolved_count,
            violation_accounting: cycleLatency.violation_accounting,
            ...(operationId ? { operation_id: operationId } : {}),
            ...(typeof result.job_id === 'string' ? { job_id: result.job_id } : {}),
          });
        } catch {
          telemetryFailures.push('artistic_throughput_event_write_failed');
        }
      }
      if (hasSemanticRequest) {
        const semanticInput = hasPaintingIntent
          ? input.painting_intent as Record<string, unknown>
          : input.next_pass as Record<string, unknown>;
        const rejection = result.preflight_rejection && typeof result.preflight_rejection === 'object'
          && !Array.isArray(result.preflight_rejection)
          ? result.preflight_rejection as Record<string, unknown>
          : undefined;
        try {
          this.store.recordCompilerAttemptAudit(documentId, {
            outcome: rejected ? 'rejected' : asyncStarting ? 'accepted' : 'dispatched',
            request_key: semanticInput.request_key,
            problem_id: semanticInput.problem_id,
            ...(operationId ? { operation_id: operationId } : {}),
            cycle_fingerprint: rejection?.cycle_fingerprint,
            rejection_fingerprint: rejection?.rejection_fingerprint,
            error_codes: rejection?.error_codes,
            repair_recipe: rejection?.compact_correction_recipe,
            compiler_repair_audit: result.compiler_repair_audit,
          });
        } catch {
          telemetryFailures.push('compiler_attempt_audit_write_failed');
        }
      }
    }
    return telemetryFailures.length
      ? { ...result, throughput_accounting_integrity: { status: 'unverified', reasons: telemetryFailures } }
      : result;
  }

  private reservePreparedJob(
    input: Record<string, unknown>,
    operation: Record<string, unknown>,
    prepared?: {
      operation: Record<string, unknown>;
      guardPreflightMs: number;
      cycleReceivedAt: string;
      cycleStartedAt: number;
      requestJsonBytes: number;
      closedPrevious?: Record<string, unknown>;
      compilerTelemetry?: GuardCompilerTelemetry;
      compilerRepairAudit?: GuardCompilerRepairAudit;
      compilerDeferredFromOperationId?: string;
      automaticCheckpoint?: Record<string, unknown>;
    },
    presentationContext?: Record<string, unknown>
  ): Record<string, unknown> {
    const narrative = operationNarrative(operation, 'starting', presentationContext
      ?? this.store.presentationContext(Number((operation.args as Record<string, unknown> | undefined)?.document_id)));
    const created = createJob(this.runtimeDirectory, input, narrative);
    updateJob(created.dir, {
      state: 'starting',
      pid: process.pid,
      embedded_guard: true,
      progress_state: 'starting',
      // Persist the reservation's exact operation identity before the first poll.
      // A job_id alone cannot attribute model-visible telemetry to a run.
      ...(typeof operation.id === 'string' && operation.id.trim()
        ? { operation_id: operation.id } : {}),
    });

    setTimeout(() => {
      void (async () => {
        writeJobStarted(created.dir, {
          command: 'embedded_guard_cycle',
          operation_id: operation.id ?? null,
          progress_state: 'running',
          embedded_guard: true,
        });
        const heartbeatTimer = setInterval(() => {
          try {
            writeJobHeartbeat(created.dir, { progress_state: 'running' });
          } catch {
            // Heartbeat failure must not interrupt the Photoshop operation itself.
          }
        }, JOB_HEARTBEAT_INTERVAL_MS);
        heartbeatTimer.unref?.();
        try {
          const result = await this.cycle(input, created.jobId, prepared ? { dispatchMode: 'sync', prepared } : {});
          writeJobResult(created.dir, result);
          writeJobCompleted(created.dir, 0, { embedded_guard: true, has_result: true });
        } catch (error) {
          const result = {
            ok: false,
            code: 'embedded_guard_job_failed',
            message: safeError(error),
            next: 'Inspect photoshop_guard_status/resume and reconcile any uncertain dispatched operation; never replay blindly.',
          };
          writeJobResult(created.dir, result);
          writeJobCompleted(created.dir, 1, { embedded_guard: true, has_result: true });
        } finally {
          clearInterval(heartbeatTimer);
        }
      })();
    }, 0);

    return {
      ok: true,
      mode: 'photoshop-guard-async',
      job_id: created.jobId,
      operation_id: operation.id ?? null,
      state: 'starting',
      narrative,
      ...(prepared ? {
        cycle_latency: {
          protocol: 'photoshop.guard.cycle_latency.v1',
          inter_call_unattributed_gap_ms: null,
          decision_model_gap_ms: null,
          guard_preflight_ms: prepared.guardPreflightMs,
          photoshop_dispatch_wall_ms: null,
          photoshop_reported_execution_ms: null,
          preview_capture_materialization_ms: null,
          visual_evaluation_verdict_gap_ms: null,
          report_ack_closure_ms: null,
          recovery_reconciliation_ms: null,
          guard_cycle_total_ms: null,
          semantic_cycle_wall_ms: null,
          request_json_bytes: prepared.requestJsonBytes,
          closure_request_json_bytes: null,
          guard_invocation_count_observed: 1,
          model_call_count: null,
          ...(prepared.compilerTelemetry ?? {}),
          note: 'Execution continues in the durable job; total cycle latency is finalized with the job result.',
        },
      } : {}),
      next: `Poll with photoshop_guard_job_poll(job_id="${created.jobId}")`,
    };
  }

  startJob(input: Record<string, unknown>): Record<string, unknown> {
    const operation = (input as { next_operation?: Record<string, unknown> }).next_operation;
    if (!operation) throw new Error('runtime.startJob requires internal next_operation');
    assertOperationContract(operation);
    const releaseController = this.store.lock();
    try {
      // Reserve the singleton async-job slot atomically across MCP/Node
      // processes. Without this lock, two callers can both observe [] and both
      // return { state: "starting" } for jobs that immediately compete/fail.
      const activeJobs = this.store.activeJobs(undefined);
      if (activeJobs.length) {
        throw new Error(`Guard job ${activeJobs.at(-1)?.job_id ?? 'unknown'} is already active; poll it instead of starting replacement work`);
      }
      const cycleStartedAt = Date.now();
      return this.reservePreparedJob(input, operation, {
        operation,
        guardPreflightMs: 0,
        cycleReceivedAt: new Date().toISOString(),
        cycleStartedAt,
        requestJsonBytes: Buffer.byteLength(JSON.stringify(input), 'utf8'),
        closedPrevious: { closed: false },
      });
    } finally {
      // cycle() acquires the same controller lock, so release immediately after
      // the durable reservation is visible and before scheduling execution.
      releaseController();
    }
  }

  pollJob(jobId: string): Record<string, unknown> {
    const job = readJob(this.runtimeDirectory, jobId);
    const result = job.result as Record<string, unknown> | undefined;
    try {
      const input = JSON.parse(fs.readFileSync(job.files.input, 'utf8')) as Record<string, unknown>;
      const documentId = cycleInputDocumentId(this.store, input);
      if (documentId) {
        // A poll is its own model-visible round trip, but belongs to the
        // operation reserved by this job. Do not attribute it to the previous
        // operation in a continuation request, or when persisted ids disagree.
        const reservedId = typeof job.meta?.operation_id === 'string' && job.meta.operation_id.trim()
          ? job.meta.operation_id : undefined;
        const startedId = typeof job.started?.operation_id === 'string' && job.started.operation_id.trim()
          ? job.started.operation_id : undefined;
        const operationId = reservedId && startedId && reservedId !== startedId
          ? undefined : reservedId ?? startedId;
        this.store.recordArtisticThroughputEvent(documentId, {
          kind: 'bookkeeping',
          model_visible: true,
          semantic_actions: 0,
          job_id: jobId,
          ...(operationId ? { operation_id: operationId } : {}),
        });
      }
    } catch {
      // Telemetry must never make a valid durable job unreadable.
    }
    const execution = result?.execution && typeof result.execution === 'object' ? result.execution as Record<string, unknown> : undefined;
    const uncertainResult = execution?.execution === 'uncertain' || execution?.execution === 'partial'
      || result?.next_state === 'blocked_recovery' || result?.next_state === 'awaiting_reconcile' || result?.next_state === 'awaiting_preview_recovery';
    return {
      ok: !uncertainResult && job.state !== 'failed' && job.state !== 'stalled',
      process_state: job.state,
      mode: 'photoshop-guard-async',
      job_id: job.meta?.job_id ?? jobId,
      state: job.state === 'completed' && uncertainResult ? 'uncertain' : job.state,
      pid: job.pid ?? null,
      started_at: job.started?.at ?? job.meta?.started_at ?? null,
      completed_at: job.completed?.at ?? null,
      heartbeat_age_ms: job.heartbeat_age_ms ?? null,
      deadline_at: job.deadline_at ?? null,
      stall_reason: job.stall_reason ?? null,
      ...(result ? { result } : {}),
      next: uncertainResult ? 'The process finished but the operation is partial/uncertain. Use public resume projection=recovery and reconcile capture_evidence=true; inspect fresh pixels, never replay.'
        : job.state === 'running' || job.state === 'starting'
        ? 'Poll this job again; do not launch replacement mutation work.'
        : job.state === 'stalled'
          ? 'The job lease is stalled. Do not clear live locks or replay. Restart only the Photoshop MCP child process, then recover locks and reconcile from fresh evidence.'
          : job.state === 'failed' && !job.started
            ? 'This job never entered execution and no longer holds the async-job slot. Start replacement guarded work normally.'
        : job.state === 'completed'
          ? 'Inspect the completed result, then continue through photoshop_guard_cycle_auto with previous_operation_id + previous_observation and optional next_pass.'
          : 'Inspect photoshop_guard_status/resume and reconcile uncertain execution before any retry.',
    };
  }

  rawMutationBlocked(toolName: string): ToolResult {
    return jsonError(
      'guard_required',
      `${toolName} is a mutating Photoshop tool and PHOTOSHOP_GUARD_MODE=required. Use photoshop_guard_cycle_auto so intent, receipt/ack, recovery and preview/verdict barriers remain durable.`
    );
  }

  ensureRuntimeDirectories(): void {
    fs.mkdirSync(this.runtimeDirectory, { recursive: true });
    fs.mkdirSync(this.previewBarrierDirectory, { recursive: true });
  }
}
