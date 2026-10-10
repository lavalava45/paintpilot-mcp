import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import {
  EmbeddedGuardRuntime,
  describeToolForGuardMode,
  guardRuntimeErrorCode,
  isGenerativeToolName,
  shouldBlockRawTool,
} from '../src/core/guard/runtime.js';
import {
  createJob,
  readJob,
  updateJob,
  writeJobCompleted,
  writeJobResult,
  writeJobStarted,
} from '../src/core/guard/async-job.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { createVisualMicroPlanTools } from '../src/tools/visual-microplan-tools.js';
import { withToolExecutionContext } from '../src/core/execution-context.js';
import { UXP_BRIDGE_REVISION } from '../src/core/guard/protocol-version.js';
import { compactToolForPublishedCatalog } from '../src/core/server-protocol.js';
import { comparePreviewFiles } from '../src/core/guard/visual-significance.js';

const dirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function jpegMeta(dir: string, name: string, value: number) {
  const width = 48;
  const height = 48;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const bytes = jpeg.encode({ data, width, height }, 100).data;
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    materialized_path: file,
    width,
    height,
    mime_type: 'image/jpeg',
  };
}

function jpegMetaSinglePixelDelta(dir: string, name: string, baseValue: number) {
  const width = 48;
  const height = 48;
  const data = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = baseValue;
    data[offset + 1] = baseValue;
    data[offset + 2] = baseValue;
    data[offset + 3] = 255;
  }
  data[0] = baseValue + 10;
  const bytes = jpeg.encode({ data, width, height }, 100).data;
  const file = path.join(dir, name);
  writeFileSync(file, bytes);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    materialized_path: file,
    width,
    height,
    mime_type: 'image/jpeg',
  };
}

function fakeRegistry(dir: string, options: { afterValue?: number; singlePixelDelta?: boolean } = {}) {
  const registry = new ToolRegistry();
  const before = jpegMeta(dir, 'before.jpg', 40);
  const after = options.singlePixelDelta
    ? jpegMetaSinglePixelDelta(dir, 'after.jpg', 40)
    : jpegMeta(dir, 'after.jpg', options.afterValue ?? 190);
  let previews = 0;

  registry.register('photoshop_get_preview', {
    tool: {
      name: 'photoshop_get_preview',
      description: 'test preview',
      inputSchema: {
        type: 'object',
        properties: {
          document_id: { type: 'number' },
          materialize_path: { type: 'string' },
          include_image: { type: 'boolean' },
        },
      },
    },
    handler: async () => ({
      content: [{ type: 'text', text: JSON.stringify(previews++ === 0 ? before : after) }],
    }),
  });

  registry.register('photoshop_set_layer_opacity', {
    tool: {
      name: 'photoshop_set_layer_opacity',
      description: 'test mutation',
      inputSchema: {
        type: 'object',
        properties: {
          document_id: { type: 'number' },
          opacity: { type: 'number' },
        },
        required: ['opacity'],
      },
    },
    handler: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'opacity changed', execution_duration_ms: 7 }) }],
    }),
  });

  registry.register('photoshop_paint_dabs', {
    tool: {
      name: 'photoshop_paint_dabs',
      description: 'test paint mutation',
      inputSchema: {
        type: 'object',
        properties: {
          document_id: { type: 'number' },
          dabs: { type: 'array' },
        },
      },
    },
    handler: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'paint dabs applied' }) }],
    }),
  });

  registry.register('photoshop_save_document', {
    tool: {
      name: 'photoshop_save_document',
      description: 'test document save',
      inputSchema: {
        type: 'object',
        properties: {
          document_id: { type: 'number' },
          path: { type: 'string' },
          format: { type: 'string' },
        },
      },
    },
    handler: async (args) => {
      writeFileSync(String(args.path), 'test-psd');
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'document saved' }) }],
      };
    },
  });

  registry.register('photoshop_get_state', {
    tool: {
      name: 'photoshop_get_state',
      description: 'test read',
      inputSchema: { type: 'object', properties: { document_id: { type: 'number' } } },
    },
    handler: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ ok: true, document: { id: 42 } }) }],
    }),
  });

  return { registry, before, after };
}

function runtimeFor(registry: ToolRegistry, dir: string) {
  if (!registry.get('photoshop_execute_visual_microplan')) {
    const microplan = createVisualMicroPlanTools(registry)[0]!;
    registry.register(microplan.tool.name, microplan);
  }
  return new EmbeddedGuardRuntime(registry, {
    runtimeDirectory: path.join(dir, 'controller'),
    previewBarrierDirectory: path.join(dir, 'barriers'),
    executionLeaseFile: path.join(dir, 'execution.lock'),
    workspaceRoot: dir,
    processVideoTraceEnabled: false,
    uxpReadinessProbe: async () => ({
      ready: true,
      transport: 'uxp',
      bridge_transport: 'long-poll',
      bridge_revision: UXP_BRIDGE_REVISION,
      runtime_instance_witness: 'runtime-snapshot-a',
      expected_bridge_revision: UXP_BRIDGE_REVISION,
      revision_match: true,
      photoshop_version: '27.8',
      document_count: 1,
      active_document: { id: 42, name: 'EmbeddedGuardFixture.psd' },
      plugin_connected: true,
      reason: null,
      checked_at: '2026-09-26T00:00:00.000Z',
      cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
    }),
    uxpStateProbe: async () => ({
      ok: true,
      data: {
        document: {
          id: 42,
          instanceWitness: {
            protocol: 'photoshop.uxp.document_instance_witness.v1',
            session_id: 'embedded-guard-fixture',
            token: 'embedded-guard-fixture:42',
          },
        },
        activeLayer: { id: 7, name: 'Paint' },
      },
    }),
  });
}

describe('E.8b automatic exact resume', () => {
  it('uses a verified continuation checkpoint before broad durable-state discovery', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'guard-exact-resume-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const fallback = vi.spyOn(runtime.store, 'resume');
    vi.spyOn(runtime.store, 'loadAndVerifyContinuationCheckpoint').mockReturnValue({
      ok: true,
      protocol: 'photoshop.guard.continuation-verification.v1',
      document: { id: 42, incarnation: 'uxp:42:inc-a' },
      operation_id: 'op-pending',
      delivered_preview: { operation_id: 'op-pending', sha256: 'a'.repeat(64), materialized_path: 'frame.jpg' },
      visual_verdict_pending: true,
      next_required_action: 'inspect pending frame',
      canonical_next_command: 'photoshop_guard_cycle_auto',
    } as any);

    expect(runtime.resume()).toMatchObject({
      ok: true,
      resume_mode: 'exact_checkpoint',
      operation_id: 'op-pending',
      inspect_delivered_frame: true,
      canonical_next_tool: 'photoshop_guard_cycle_auto',
    });
    expect(fallback).not.toHaveBeenCalled();
  });

  it('fails closed on a stale checkpoint instead of falling back or replaying work', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'guard-stale-resume-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const fallback = vi.spyOn(runtime.store, 'resume');
    vi.spyOn(runtime.store, 'loadAndVerifyContinuationCheckpoint').mockReturnValue({
      ok: false,
      reason: 'continuation_checkpoint_stale',
      mismatch: { field: 'current_operation_id', expected: 'op-old', actual: 'op-new' },
    } as any);

    expect(runtime.resume()).toMatchObject({
      ok: false,
      resume_mode: 'checkpoint_rejected',
      exact_resume_required: true,
      canonical_next_tool: 'photoshop_guard_status',
    });
    expect(fallback).not.toHaveBeenCalled();
  });
});

function critic() {
  return {
    verdict: 'improvement',
    disposition: 'accept',
    observations: [{ region: 'whole frame', visible: 'The rendered test layer differs visibly from the captured before frame.' }],
    primary_mismatch: 'No blocking mismatch is visible in this synthetic test fixture.',
    observed_change: 'The test layer is visibly different from the captured before frame',
    target_resolved: 'yes',
    regressions: [],
    uncertainty: 'none observed',
    global_readability: 'improved',
    primitive_footprint: 'none',
    trend_signals: [],
  };
}

function compactPassFromOperation(operation: Record<string, any>) {
  const args = { ...(operation.args ?? {}) };
  const documentId = args.document_id;
  delete args.document_id;
  const bootstrap = operation.tool === 'photoshop_create_document' || operation.tool === 'photoshop_open_image';
  return {
    request_key: String(operation.id ?? operation.request_key),
    ...(!bootstrap && Number.isSafeInteger(documentId) ? { document_id: documentId } : {}),
    goal: String(operation.goal ?? operation.summary ?? operation.purpose ?? operation.id ?? 'bounded compact pass'),
    ...(operation.problem_id ? { problem_id: operation.problem_id } : {}),
    ...(operation.addresses_problem_id ? { addresses_problem_id: operation.addresses_problem_id } : {}),
    ...(operation.region ? { region: operation.region } : {}),
    ...(operation.stage ? { stage: operation.stage } : {}),
    ...(operation.scale ? { scale: operation.scale } : {}),
    ...(operation.significance_mode ? { significance_mode: operation.significance_mode } : {}),
    ...(operation.strategy_family ? { strategy_family: operation.strategy_family } : {}),
    ...(operation.causal_strategy_id ? { causal_strategy_id: operation.causal_strategy_id } : {}),
    ...(Number.isInteger(operation.causal_escalation_level) ? { causal_escalation_level: operation.causal_escalation_level } : {}),
    actions: [{
      id: `${String(operation.id ?? operation.request_key)}-action`,
      tool: operation.tool,
      args,
    }],
  };
}

function compactObservationFromVerdict(verdict: Record<string, any>) {
  return {
    ...verdict,
    observed: verdict.observed_change,
    target: verdict.target_resolved === 'yes'
      ? 'resolved'
      : verdict.target_resolved === 'no'
        ? 'unresolved'
        : 'uncertain',
    ...(verdict.regressions?.length ? { regression: verdict.regressions.join('; ') } : {}),
    action: verdict.disposition,
  };
}

function bootstrapReceipt(
  commandId: string,
  state: 'queued' | 'claimed' | 'completed' | 'failed' | 'not-claimed',
  result?: { id: string; ok: boolean; data?: unknown; error?: string }
) {
  const at = '2026-09-20T12:00:00.000Z';
  return {
    protocol: 'photoshop.uxp.command_receipt.v1' as const,
    command_id: commandId,
    action: 'create_document',
    state,
    terminal: state === 'completed' || state === 'failed' || state === 'not-claimed',
    created_at: at,
    updated_at: at,
    ...(state !== 'queued' ? { claimed_at: at } : {}),
    ...(state === 'completed' ? { completed_at: at } : {}),
    ...(state === 'failed' ? { failed_at: at } : {}),
    ...(state === 'not-claimed' ? { not_claimed_at: at } : {}),
    ...(result ? { result } : {}),
  };
}

describe('embedded Photoshop Guard', () => {
  it('rejects create_document before dispatch when the UXP bootstrap companion is not exactly ready', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-create-readiness-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let dispatches = 0;
    registry.register('photoshop_create_document', {
      tool: {
        name: 'photoshop_create_document',
        description: 'test UXP bootstrap create',
        inputSchema: {
          type: 'object',
          properties: {
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 },
            colorMode: { type: 'string', enum: ['RGB', 'CMYK', 'Grayscale'] },
          },
          required: ['width', 'height'],
        },
      },
      handler: async () => {
        dispatches += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
      },
    });
    {
      const microplan = createVisualMicroPlanTools(registry)[0]!;
      registry.register(microplan.tool.name, microplan);
    }
    const runtime = new EmbeddedGuardRuntime(registry, {
      runtimeDirectory: path.join(dir, 'controller'),
      previewBarrierDirectory: path.join(dir, 'barriers'),
      executionLeaseFile: path.join(dir, 'execution.lock'),
      workspaceRoot: dir,
      uxpReadinessProbe: async () => ({
        ready: false,
        transport: 'uxp',
        bridge_transport: 'long-poll',
        bridge_revision: 'stale-revision',
        expected_bridge_revision: 'expected-revision',
        revision_match: false,
        photoshop_version: '27.0.0',
        document_count: 0,
        active_document: null,
        plugin_connected: true,
        reason: 'uxp_bridge_revision_mismatch',
        checked_at: new Date().toISOString(),
        cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
      }),
    });

    const rejected = await runtime.cycleAuto({
      next_pass: {
        request_key: 'create-readiness-rejected',
        goal: 'Create a disposable document and verify UXP readiness plus schema validation before dispatch.',
        actions: [{
          id: 'create-document',
          tool: 'photoshop_create_document',
          args: { height: 700, colorMode: 'RGB' },
        }],
      },
    }) as any;

    expect(rejected.execution).toMatchObject({
      operation_id: 'create-readiness-rejected',
      tool: 'photoshop_create_document',
      phase: 'completed',
      failed: true,
      execution: 'not-executed',
    });
    expect(rejected.preflight_rejection.error_codes).toEqual(expect.arrayContaining([
      'tool_schema_invalid',
      'uxp_bootstrap_not_ready',
    ]));
    expect(rejected.preflight_rejection.errors.join('\n')).toMatch(/args\.width is required/);
    expect(rejected.preflight_rejection.errors.join('\n')).toMatch(/requires a ready matching UXP companion/);
    expect(dispatches).toBe(0);
    expect(runtime.store.read('create-readiness-rejected')).toBeUndefined();
  });

  it('completes a ready UXP create_document with a confirmed document id and no visual-review debt', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-create-ready-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let dispatches = 0;
    registry.register('photoshop_create_document', {
      tool: {
        name: 'photoshop_create_document',
        description: 'test ready UXP bootstrap create',
        inputSchema: {
          type: 'object',
          properties: {
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 },
            resolution: { type: 'number' },
            colorMode: { type: 'string', enum: ['RGB', 'CMYK', 'Grayscale'] },
          },
          required: ['width', 'height'],
        },
      },
      handler: async (args) => {
        dispatches += 1;
        expect(args._guard_operation_id).toBe('create-ready-success');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              summary: 'Document created via UXP',
              details: {
                transport: 'uxp',
                command_id: 'create-ready-success',
                document: { id: 732, name: 'Untitled-1', width: 1000, height: 700, resolution: 72, colorMode: 'RGB' },
              },
            }),
          }],
        };
      },
    });
    {
      const microplan = createVisualMicroPlanTools(registry)[0]!;
      registry.register(microplan.tool.name, microplan);
    }
    const runtime = new EmbeddedGuardRuntime(registry, {
      runtimeDirectory: path.join(dir, 'controller'),
      previewBarrierDirectory: path.join(dir, 'barriers'),
      executionLeaseFile: path.join(dir, 'execution.lock'),
      workspaceRoot: dir,
      uxpReadinessProbe: async () => ({
        ready: true,
        transport: 'uxp',
        bridge_transport: 'long-poll',
        bridge_revision: 'expected-revision',
        expected_bridge_revision: 'expected-revision',
        revision_match: true,
        photoshop_version: '27.0.0',
        document_count: 0,
        active_document: null,
        plugin_connected: true,
        reason: null,
        checked_at: new Date().toISOString(),
        cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
      }),
    });
    const result = await runtime.cycleAuto({
      next_pass: {
        request_key: 'create-ready-success',
        goal: 'Create a disposable 1000 by 700 document and expose the real document id.',
        actions: [{
          id: 'create-document',
          tool: 'photoshop_create_document',
          args: { width: 1000, height: 700, resolution: 72, colorMode: 'RGB' },
        }],
      },
    }) as any;

    expect(dispatches).toBe(1);
    expect(result.execution).toMatchObject({ phase: 'completed', failed: false, execution: undefined });
    expect(result.confirmed_targets.document_id).toBe(732);
    expect(result.preview).toBeUndefined();
    expect(result.next_state).toBe('awaiting_report_and_operation_ack');
    expect(result.required_user_report).not.toBeNull();
    expect(result.required_operation_ack).not.toBeNull();
    expect(runtime.store.read('create-ready-success')?.bootstrap_outcome?.document_id).toBe(732);
    expect(runtime.store.status().pending_visual_verdicts).not.toContain('create-ready-success');
  });

  it('starts a fresh document incarnation when Photoshop reuses a prior document id', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-recycled-document-id-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    registry.register('photoshop_create_document', {
      tool: {
        name: 'photoshop_create_document',
        description: 'test recycled Photoshop document id',
        inputSchema: {
          type: 'object',
          properties: {
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 },
            resolution: { type: 'number' },
            colorMode: { type: 'string', enum: ['RGB', 'CMYK', 'Grayscale'] },
          },
          required: ['width', 'height'],
        },
      },
      handler: async (args) => ({
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: true,
            summary: 'Document created via UXP',
            details: {
              transport: 'uxp',
              command_id: args._guard_operation_id,
              document: { id: 732, name: 'Untitled-1', width: 800, height: 600, resolution: 72, colorMode: 'RGB' },
            },
          }),
        }],
      }),
    });
    {
      const microplan = createVisualMicroPlanTools(registry)[0]!;
      registry.register(microplan.tool.name, microplan);
    }
    const runtime = new EmbeddedGuardRuntime(registry, {
      runtimeDirectory: path.join(dir, 'controller'),
      previewBarrierDirectory: path.join(dir, 'barriers'),
      executionLeaseFile: path.join(dir, 'execution.lock'),
      workspaceRoot: dir,
      uxpReadinessProbe: async () => ({
        ready: true,
        transport: 'uxp',
        bridge_transport: 'long-poll',
        bridge_revision: 'expected-revision',
        expected_bridge_revision: 'expected-revision',
        revision_match: true,
        photoshop_version: '27.0.0',
        document_count: 0,
        active_document: null,
        plugin_connected: true,
        reason: null,
        checked_at: new Date().toISOString(),
        cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
      }),
    });

    runtime.store.setArtRunState({
      document_id: 732,
      process_dir: 'processes/recycled-old-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    runtime.store.write({
      id: 'recycled-old-operation',
      tool: 'photoshop_get_state',
      args: { document_id: 732 },
      summary: 'Old document operation',
      purpose: 'Seed durable state from a prior Photoshop document instance.',
      hash: 'old-document-operation',
      sequence: 1,
      created_at: '2026-09-20T12:00:00.000Z',
      completed_at: '2026-09-20T12:00:01.000Z',
      phase: 'completed',
      visual: false,
      failed: false,
      report: {
        did: 'Read the old document state.',
        why: 'Seed a fully closed prior document instance.',
        result: 'The old operation completed before Photoshop restarted.',
      },
    });
    runtime.store.setVisualBarrier(732, {
      planId: 'recycled-old-operation',
      operationId: 'recycled-old-operation',
      operationSequence: 1,
      requiresExternalPreview: false,
    });

    const result = await runtime.cycleAuto({
      next_pass: {
        request_key: 'create-recycled-document-id',
        goal: 'Create a fresh disposable document even if Photoshop reuses a historical numeric document id.',
        actions: [{
          id: 'create-document',
          tool: 'photoshop_create_document',
          args: { width: 800, height: 600, resolution: 72, colorMode: 'RGB' },
        }],
      },
    }) as any;

    expect(result.confirmed_targets.document_id).toBe(732);
    expect(runtime.store.visualBarrier(732)).toBeUndefined();
    expect(runtime.store.currentDocumentRecords(732)).toEqual([]);
    expect(runtime.store.artRunState(732)).toMatchObject({
      document_id: 732,
      document_instance: {
        protocol: 'photoshop.guard.document_instance.v1',
        bootstrap_operation_id: 'create-recycled-document-id',
        bootstrap_tool: 'photoshop_create_document',
        bootstrap_sequence: 2,
      },
    });
    expect(runtime.store.artRunState(732)?.process_dir).toBeUndefined();
    expect(runtime.store.read('create-recycled-document-id')?.document_instance_reset).toMatchObject({
      reset_performed: true,
      replaced_existing_state: true,
      superseded_process_dir: 'processes/recycled-old-process/run-01',
    });
    expect(runtime.store.closeOnlyLifecycleOwner('recycled-old-operation')).toMatchObject({
      ok: false,
      document_id: 732,
    });

    const configured = runtime.store.setArtRunState({
      document_id: 732,
      process_dir: 'processes/recycled-new-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    expect(configured.process_dir).toBe('processes/recycled-new-process/run-01');
  });

  it('blocks a mutation and resets stale state when UXP reuses the same numeric id for a different live document object', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-host-reincarnation-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const witnessA = {
      protocol: 'photoshop.uxp.document_instance_witness.v1',
      session_id: 'uxp-session-a',
      token: 'uxp-session-a:1',
    };
    const witnessB = {
      protocol: 'photoshop.uxp.document_instance_witness.v1',
      session_id: 'uxp-session-a',
      token: 'uxp-session-a:2',
    };
    let activeWitness = witnessA;
    const runtimeOptions = {
      runtimeDirectory: path.join(dir, 'controller'),
      previewBarrierDirectory: path.join(dir, 'barriers'),
      executionLeaseFile: path.join(dir, 'execution.lock'),
      workspaceRoot: dir,
      uxpReadinessProbe: async () => ({
        ready: true,
        transport: 'uxp',
        bridge_transport: 'long-poll',
        bridge_revision: UXP_BRIDGE_REVISION,
        expected_bridge_revision: UXP_BRIDGE_REVISION,
        revision_match: true,
        photoshop_version: '27.0.1',
        document_count: 1,
        active_document: { id: 42, name: 'Recycled.psd' },
        plugin_connected: true,
        reason: null,
        checked_at: new Date().toISOString(),
        cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
      }),
      uxpStateProbe: async () => ({
        ok: true,
        data: {
          hasDocument: true,
          document: {
            id: 42,
            name: 'Recycled.psd',
            instanceWitness: structuredClone(activeWitness),
          },
        },
      }),
    };
    const runtime = new EmbeddedGuardRuntime(registry, runtimeOptions);
    runtime.store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/original-live-instance-process/run-01',
      painting_profile: 'simple_graphic',
    });
    runtime.store.write({
      id: 'old-instance-op',
      tool: 'photoshop_get_state',
      args: { document_id: 42 },
      summary: 'Old instance evidence',
      purpose: 'Prove old records are retired after host document reincarnation.',
      hash: 'old-instance-op',
      sequence: 1,
      created_at: '2026-09-25T00:00:00.000Z',
      completed_at: '2026-09-25T00:00:01.000Z',
      phase: 'completed',
      visual: false,
      failed: false,
    });

    const operation = {
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 55 },
    };
    expect(await (runtime as any).collectDynamicOperationViolations(operation)).toEqual([]);
    expect(runtime.store.artRunState(42)).toMatchObject({
      process_dir: 'processes/original-live-instance-process/run-01',
      document_instance: { host_witness: witnessA },
    });

    const restarted = new EmbeddedGuardRuntime(registry, runtimeOptions);
    expect(await (restarted as any).collectDynamicOperationViolations(operation)).toEqual([]);
    expect(restarted.store.artRunState(42)?.process_dir).toBe('processes/original-live-instance-process/run-01');

    restarted.store.setVisualBarrier(42, {
      planId: 'old-instance-op',
      operationId: 'old-instance-op',
      operationSequence: 1,
      requiresExternalPreview: false,
    });
    activeWitness = witnessB;
    const violations = await (restarted as any).collectDynamicOperationViolations(operation);
    expect(violations).toEqual([
      expect.objectContaining({
        code: 'document_reincarnated',
        scope: 'next_operation',
      }),
    ]);
    expect(restarted.store.visualBarrier(42)).toBeUndefined();
    expect(restarted.store.artRunState(42)).toMatchObject({
      document_id: 42,
      document_instance: {
        host_witness: witnessB,
        reincarnation_reason: 'host_instance_witness_changed',
        previous_host_witness: witnessA,
      },
    });
    expect(restarted.store.artRunState(42)?.process_dir).toBeUndefined();
    expect(restarted.store.currentDocumentRecords(42)).toEqual([]);
  });

  it('ignores accidental artistic method metadata on document bootstrap instead of misclassifying it as region block-in', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-create-artistic-metadata-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let dispatches = 0;
    registry.register('photoshop_create_document', {
      tool: {
        name: 'photoshop_create_document',
        description: 'test bootstrap with accidental artistic metadata',
        inputSchema: {
          type: 'object',
          properties: {
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 },
            resolution: { type: 'number' },
            colorMode: { type: 'string', enum: ['RGB', 'CMYK', 'Grayscale'] },
          },
          required: ['width', 'height'],
        },
      },
      handler: async (args) => {
        dispatches += 1;
        expect(args._guard_operation_id).toBe('create-with-artistic-metadata');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              summary: 'Document created via UXP',
              details: {
                transport: 'uxp',
                command_id: 'create-with-artistic-metadata',
                document: { id: 733, name: 'Untitled-2', width: 1400, height: 1000, resolution: 72, colorMode: 'RGB' },
              },
            }),
          }],
        };
      },
    });
    {
      const microplan = createVisualMicroPlanTools(registry)[0]!;
      registry.register(microplan.tool.name, microplan);
    }
    const runtime = new EmbeddedGuardRuntime(registry, {
      runtimeDirectory: path.join(dir, 'controller'),
      previewBarrierDirectory: path.join(dir, 'barriers'),
      executionLeaseFile: path.join(dir, 'execution.lock'),
      workspaceRoot: dir,
      uxpReadinessProbe: async () => ({
        ready: true,
        transport: 'uxp',
        bridge_transport: 'long-poll',
        bridge_revision: 'expected-revision',
        expected_bridge_revision: 'expected-revision',
        revision_match: true,
        photoshop_version: '27.0.0',
        document_count: 0,
        active_document: null,
        plugin_connected: true,
        reason: null,
        checked_at: new Date().toISOString(),
        cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
      }),
    });

    const result = await runtime.cycleAuto({
      next_pass: {
        request_key: 'create-with-artistic-metadata',
        goal: 'Create a 1400 by 1000 painting canvas.',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        visual_intent: 'mass',
        impact_class: 'construct',
        preferred_method_id: 'region-block-in',
        actions: [{
          id: 'create-document',
          tool: 'photoshop_create_document',
          args: { width: 1400, height: 1000, resolution: 72, colorMode: 'RGB' },
        }],
      },
    }) as any;

    expect(result.preflight_rejection).toBeUndefined();
    expect(dispatches).toBe(1);
    expect(result.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(result.confirmed_targets.document_id).toBe(733);
    expect(result.preview).toBeUndefined();
    expect(runtime.store.read('create-with-artistic-metadata')?.bootstrap_outcome?.document_id).toBe(733);
    expect(runtime.store.read('create-with-artistic-metadata')?.artistic_operation).toBeUndefined();
  });

  it('recovers a claimed bootstrap from a completed durable receipt without creating a second document', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-bootstrap-completed-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let publicToolCalls = 0;
    let continuationCalls = 0;
    registry.register('photoshop_create_document', {
      tool: {
        name: 'photoshop_create_document',
        description: 'test exact-outcome create',
        inputSchema: {
          type: 'object',
          properties: {
            width: { type: 'number', minimum: 1 },
            height: { type: 'number', minimum: 1 },
            resolution: { type: 'number' },
            colorMode: { type: 'string', enum: ['RGB', 'CMYK', 'Grayscale'] },
          },
          required: ['width', 'height'],
        },
      },
      handler: async (args) => {
        publicToolCalls += 1;
        expect(args._guard_operation_id).toBe('bootstrap-recover-completed');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              summary: 'Document created via UXP',
              details: {
                transport: 'uxp',
                command_id: 'bootstrap-recover-completed',
                document: {
                  id: 731,
                  name: 'Untitled-1',
                  width: 1000,
                  height: 700,
                  resolution: 72,
                  colorMode: 'RGB',
                },
              },
            }),
          }],
        };
      },
    });
    registry.register('photoshop_create_layer', {
      tool: {
        name: 'photoshop_create_layer',
        description: 'test pinned continuation',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, name: { type: 'string' } },
          required: ['document_id'],
        },
      },
      handler: async (args) => {
        continuationCalls += 1;
        expect(args.document_id).toBe(731);
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'layer created' }) }] };
      },
    });

    const completedReceipt = bootstrapReceipt('bootstrap-recover-completed', 'completed', {
      id: 'bootstrap-recover-completed',
      ok: true,
      data: { document: { id: 731 } },
    });
    const runtime = new EmbeddedGuardRuntime(registry, {
      runtimeDirectory: path.join(dir, 'controller'),
      previewBarrierDirectory: path.join(dir, 'barriers'),
      executionLeaseFile: path.join(dir, 'execution.lock'),
      workspaceRoot: dir,
      uxpCommandReceiptProbe: async () => ({ status: 'receipt', receipt: completedReceipt }),
      uxpQueuedCommandCancel: async () => null,
      uxpReadinessProbe: async () => ({
        ready: true,
        transport: 'uxp',
        bridge_transport: 'long-poll',
        bridge_revision: UXP_BRIDGE_REVISION,
        runtime_instance_witness: 'bootstrap-recovery-runtime',
        expected_bridge_revision: UXP_BRIDGE_REVISION,
        revision_match: true,
        photoshop_version: '27.8',
        document_count: 1,
        active_document: { id: 731, name: 'Untitled-1' },
        plugin_connected: true,
        reason: null,
        checked_at: '2026-09-26T00:00:00.000Z',
        cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
      }),
      uxpStateProbe: async () => ({
        ok: true,
        data: {
          document: {
            id: 731,
            instanceWitness: {
              protocol: 'photoshop.uxp.document_instance_witness.v1',
              session_id: 'bootstrap-recovery-fixture',
              token: 'bootstrap-recovery-fixture:731',
            },
          },
          activeLayer: { id: 7, name: 'Paint' },
        },
      }),
    });
    const record = runtime.store.begin({
      id: 'bootstrap-recover-completed',
      tool: 'photoshop_create_document',
      args: { width: 1000, height: 700, resolution: 72, colorMode: 'RGB' },
      summary: 'Create a disposable document',
      purpose: 'Exercise exact bootstrap recovery',
    }).record;
    runtime.store.markDispatched(record);
    runtime.store.fail(record, new Error('transport disconnected after claim'));

    const recovered = await runtime.reconcile({ id: 'bootstrap-recover-completed' }) as any;
    expect(recovered).toMatchObject({
      ok: true,
      recovery: 'completed',
      document_id: 731,
      command_id: 'bootstrap-recover-completed',
    });
    expect(publicToolCalls).toBe(1);
    const recoveredRecord = runtime.store.read('bootstrap-recover-completed')!;
    expect(recoveredRecord).toMatchObject({
      phase: 'completed',
      execution: 'completed',
      failed: false,
      bootstrap_outcome: { document_id: 731 },
    });

    await runtime.cycleAuto({
      previous_operation_id: 'bootstrap-recover-completed',
      previous_observation: {
        observed: 'The recovered create_document result confirms document 731 exists exactly once and is pinned for continuation.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'bootstrap-first-pinned-mutation',
        document_id: 731,
        goal: 'Create the first pinned layer after exact bootstrap recovery.',
        region: 'whole-canvas',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'medium',
        actions: [{
          id: 'create-first-layer',
          tool: 'photoshop_create_layer',
          args: { name: 'First Paint Layer' },
        }],
      },
    });
    expect(continuationCalls).toBe(1);
  });

  it('terminalizes failed and not-claimed bootstrap receipts without report, acknowledgement, preview, or reconcile debt', async () => {
    for (const state of ['failed', 'not-claimed'] as const) {
      const dir = mkdtempSync(path.join(tmpdir(), `embedded-guard-bootstrap-${state}-`));
      dirs.push(dir);
      const { registry } = fakeRegistry(dir);
      const receipt = bootstrapReceipt(`bootstrap-${state}`, state, {
        id: `bootstrap-${state}`,
        ok: false,
        error: state === 'failed' ? 'photoshop_create_failed' : 'uxp_bridge_not_claimed',
      });
      const runtime = new EmbeddedGuardRuntime(registry, {
        runtimeDirectory: path.join(dir, 'controller'),
        previewBarrierDirectory: path.join(dir, 'barriers'),
        executionLeaseFile: path.join(dir, 'execution.lock'),
        workspaceRoot: dir,
        uxpCommandReceiptProbe: async () => ({ status: 'receipt', receipt }),
        uxpQueuedCommandCancel: async () => null,
      });
      const record = runtime.store.begin({
        id: `bootstrap-${state}`,
        tool: 'photoshop_create_document',
        args: { width: 1000, height: 700 },
        summary: 'Create a disposable document',
        purpose: 'Exercise exact bootstrap terminal recovery',
      }).record;
      runtime.store.markDispatched(record);
      runtime.store.fail(record, new Error('lost result after dispatch'));

      const recovered = await runtime.reconcile({ id: `bootstrap-${state}` }) as any;
      expect(recovered.terminal).toBe(true);
      const final = runtime.store.read(`bootstrap-${state}`)!;
      expect(final.phase).toBe('completed');
      expect(final.visual).toBe(false);
      expect(final.operation_receipt).toBeUndefined();
      expect(final.operation_ack).toBeUndefined();
      expect(final.preview).toBeUndefined();
      const status = runtime.store.status();
      expect(status.pending_reports).not.toContain(`bootstrap-${state}`);
      expect(status.pending_operation_acks).not.toContain(`bootstrap-${state}`);
      expect(status.pending_visual_verdicts).not.toContain(`bootstrap-${state}`);
      expect(status.uncertain).not.toContain(`bootstrap-${state}`);
    }
  });

  it('turns a durable queued bootstrap into not-claimed proof, but never replays a claimed or unknown outcome', async () => {
    const scenarios = [
      { id: 'bootstrap-queued', receipt: bootstrapReceipt('bootstrap-queued', 'queued') },
      { id: 'bootstrap-claimed', receipt: bootstrapReceipt('bootstrap-claimed', 'claimed') },
      { id: 'bootstrap-unknown', receipt: null },
    ] as const;
    for (const scenario of scenarios) {
      const dir = mkdtempSync(path.join(tmpdir(), `${scenario.id}-`));
      dirs.push(dir);
      const { registry } = fakeRegistry(dir);
      let cancelCalls = 0;
      const runtime = new EmbeddedGuardRuntime(registry, {
        runtimeDirectory: path.join(dir, 'controller'),
        previewBarrierDirectory: path.join(dir, 'barriers'),
        executionLeaseFile: path.join(dir, 'execution.lock'),
        workspaceRoot: dir,
        uxpCommandReceiptProbe: async () => scenario.receipt
          ? ({ status: 'receipt', receipt: scenario.receipt } as any)
          : ({ status: 'absent' } as any),
        uxpQueuedCommandCancel: async () => {
          cancelCalls += 1;
          return bootstrapReceipt(scenario.id, 'not-claimed', {
            id: scenario.id,
            ok: false,
            error: 'uxp_bridge_not_claimed',
          }) as any;
        },
      });
      const record = runtime.store.begin({
        id: scenario.id,
        tool: 'photoshop_create_document',
        args: { width: 1000, height: 700 },
        summary: 'Create a disposable document',
        purpose: 'Exercise exact bootstrap non-replay recovery',
      }).record;
      runtime.store.markDispatched(record);
      runtime.store.fail(record, new Error('lost result after dispatch'));

      const recovered = await runtime.reconcile({ id: scenario.id }) as any;
      if (scenario.id === 'bootstrap-queued') {
        expect(cancelCalls).toBe(1);
        expect(recovered).toMatchObject({ recovery: 'not-executed', terminal: true });
        expect(runtime.store.read(scenario.id)?.execution).toBe('not-executed');
      } else {
        expect(cancelCalls).toBe(0);
        expect(recovered).toMatchObject({ terminal: false, blind_replay_allowed: false });
        expect(recovered.recovery).toBe(scenario.id === 'bootstrap-claimed' ? 'running' : 'unknown');
        expect(runtime.store.read(scenario.id)?.phase).toBe('uncertain');
      }
    }
  });

  it('can explicitly abandon an unknowable historical bootstrap after a fresh count=0 read without claiming not-executed', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-bootstrap-abandon-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let listCalls = 0;
    registry.register('photoshop_list_documents', {
      tool: {
        name: 'photoshop_list_documents',
        description: 'fresh current documents read',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async () => {
        listCalls += 1;
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, details: { count: 0, documents: [] } }) }],
        };
      },
    });
    const runtime = new EmbeddedGuardRuntime(registry, {
      runtimeDirectory: path.join(dir, 'controller'),
      previewBarrierDirectory: path.join(dir, 'barriers'),
      executionLeaseFile: path.join(dir, 'execution.lock'),
      workspaceRoot: dir,
      uxpCommandReceiptProbe: async () => ({ status: 'absent' }),
      uxpQueuedCommandCancel: async () => null,
    });
    const record = runtime.store.begin({
      id: 'historical-bootstrap-unknown',
      tool: 'photoshop_create_document',
      args: { width: 1000, height: 700 },
      summary: 'Create a disposable historical test document',
      purpose: 'Exercise explicit abandonment without inventing not-executed proof',
    }).record;
    delete record.bootstrap_exact_outcome;
    record.pid = 2_147_483_647;
    runtime.store.write(record);
    runtime.store.markDispatched(record);
    runtime.store.fail(record, new Error('old transport disconnect'));

    const abandoned = await runtime.reconcile({
      id: 'historical-bootstrap-unknown',
      outcome: 'abandoned',
      document_closed_confirmed: true,
    }) as any;

    expect(listCalls).toBe(1);
    expect(abandoned).toMatchObject({
      ok: true,
      recovery: 'abandoned',
      terminal: true,
      execution: 'abandoned',
      current_document_count: 0,
      original_execution_proven_not_executed: false,
    });
    const final = runtime.store.read('historical-bootstrap-unknown')!;
    expect(final).toMatchObject({
      phase: 'completed',
      execution: 'abandoned',
      resolved: { outcome: 'abandoned' },
    });
    expect(final.execution).not.toBe('not-executed');
    const status = runtime.store.statusCompact();
    expect(status.uncertain).not.toContain('historical-bootstrap-unknown');
    expect(status.pending_reports).not.toContain('historical-bootstrap-unknown');
    expect(status.pending_operation_acks).not.toContain('historical-bootstrap-unknown');
    expect(status.pending_visual_verdicts).not.toContain('historical-bootstrap-unknown');
  });

  it('refuses to abandon an exact-outcome bootstrap when its receipt is absent or corrupt', async () => {
    for (const probeStatus of ['absent', 'corrupt'] as const) {
      const dir = mkdtempSync(path.join(tmpdir(), `embedded-guard-bootstrap-${probeStatus}-`));
      dirs.push(dir);
      const { registry } = fakeRegistry(dir);
      let listCalls = 0;
      registry.register('photoshop_list_documents', {
        tool: {
          name: 'photoshop_list_documents',
          description: 'fresh current documents read',
          inputSchema: { type: 'object', properties: {} },
        },
        handler: async () => {
          listCalls += 1;
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: true, details: { count: 0, documents: [] } }) }],
          };
        },
      });
      const runtime = new EmbeddedGuardRuntime(registry, {
        runtimeDirectory: path.join(dir, 'controller'),
        previewBarrierDirectory: path.join(dir, 'barriers'),
        executionLeaseFile: path.join(dir, 'execution.lock'),
        workspaceRoot: dir,
        uxpCommandReceiptProbe: async () => ({ status: probeStatus } as any),
        uxpQueuedCommandCancel: async () => null,
      });
      const id = `exact-bootstrap-${probeStatus}`;
      const record = runtime.store.begin({
        id,
        tool: 'photoshop_create_document',
        args: { width: 1000, height: 700 },
        summary: 'Create a disposable exact-outcome test document',
        purpose: 'Prove missing/corrupt receipt cannot be converted into safe abandonment',
      }).record;
      runtime.store.markDispatched(record);
      runtime.store.fail(record, new Error('lost exact-outcome receipt'));

      const rejected = await runtime.reconcile({
        id,
        outcome: 'abandoned',
        document_closed_confirmed: true,
      }) as any;

      expect(rejected).toMatchObject({
        ok: false,
        recovery: 'abandonment-rejected',
        terminal: false,
        blind_replay_allowed: false,
      });
      expect(listCalls).toBe(0);
      expect(runtime.store.read(id)?.phase).toBe('uncertain');
    }
  });

  it('publishes one compact public cycle without duplicate or legacy providers', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-schema-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const tools = createGuardTools(runtime);
    const schema = (name: string) => tools.find(definition => definition.tool.name === name)?.tool.inputSchema as any;

    expect(Object.keys(schema('photoshop_guard_cycle_auto').properties)).toEqual([
        'protocol_version',
        'previous_operation_id',
        'previous_observation',
        'painting_intent',
        'next_pass',
    ]);
    expect(schema('photoshop_guard_cycle')).toBeUndefined();
    expect(tools).toHaveLength(15);
    expect(tools.some(definition => definition.tool.name === 'photoshop_guard_cycle_start')).toBe(false);
    expect(schema('photoshop_guard_cycle_auto').properties.next_pass.properties).toMatchObject({
      scene_camera_imaging_model: expect.any(Object),
      imaging_preflight: expect.any(Object),
      change_domains: expect.any(Object),
      distribution_intent: expect.any(Object),
      scene_lighting_color_model: expect.any(Object),
      color_gradient_preflight: expect.any(Object),
      affected_relations: expect.any(Object),
      affected_qualities: expect.any(Object),
      preservation_facts: expect.any(Object),
      independent_region: expect.any(Object),
      addresses_primary_mismatch: expect.any(Object),
      addresses_problem_id: expect.any(Object),
      causal_strategy_id: expect.any(Object),
      strategy_family: expect.any(Object),
      causal_escalation_level: expect.any(Object),
    });
    expect(
      schema('photoshop_guard_cycle_auto').properties.next_pass.properties.scene_camera_imaging_model.required
    ).toEqual(expect.arrayContaining([
      'model_id', 'revision', 'source_frame', 'geometry_model_id', 'geometry_model_revision',
      'camera', 'focus', 'motion', 'optical_response', 'capture_finish',
    ]));
    expect(
      schema('photoshop_guard_cycle_auto').properties.next_pass.properties.imaging_preflight.required
    ).toEqual([
      'scene_camera_model_id', 'scene_camera_revision', 'effect_kind', 'motivation',
      'scope', 'owner_expectations', 'revalidate_edge_detail',
    ]);
    expect(schema('photoshop_guard_cycle_auto').properties.next_pass.properties.change_domains.items.enum)
      .toContain('lighting-structure');
    expect(schema('photoshop_guard_cycle_auto').properties.next_pass.properties.distribution_intent.enum)
      .toEqual(schema('photoshop_guard_cycle_auto').properties.previous_observation.properties.distribution_intent.enum);
    expect(schema('photoshop_guard_cycle_auto').properties.painting_intent.properties.deferred_from_operation_id)
      .toMatchObject({ type: 'string' });
    expect(schema('photoshop_guard_cycle_auto').properties.next_pass.properties.deferred_from_operation_id)
      .toBeUndefined();
    expect(schema('photoshop_guard_lint_next_pass').properties.next_pass.properties.scene_camera_imaging_model)
      .toEqual(schema('photoshop_guard_cycle_auto').properties.next_pass.properties.scene_camera_imaging_model);
    expect(schema('photoshop_guard_lint_next_pass').properties.next_pass.properties.imaging_preflight)
      .toEqual(schema('photoshop_guard_cycle_auto').properties.next_pass.properties.imaging_preflight);
    expect(
      schema('photoshop_guard_cycle_auto').properties.next_pass.properties.scene_lighting_color_model
        .required
    ).toEqual([
      'model_id',
      'revision',
      'source_frame',
      'global_value_structure',
      'emitters',
      'palette_relations',
      'sampled_anchors',
      'intentional_exceptions',
    ]);
    expect(
      schema('photoshop_guard_cycle_auto').properties.next_pass.properties.color_gradient_preflight
        .required
    ).toEqual([
      'scene_model_id',
      'scene_model_revision',
      'field_role',
      'interaction',
      'stops',
    ]);
    expect(schema('photoshop_guard_cycle_auto').properties.next_pass.properties.logical_layer.properties).toMatchObject({
      construction_tier: expect.any(Object),
      parent_hypothesis_id: expect.any(Object),
      parent_construction_revision: expect.any(Object),
      construction_change: expect.any(Object),
      surface_frame: expect.any(Object),
      camera_binding: expect.any(Object),
      attention_binding: expect.any(Object),
      merge_target_layer_id: expect.any(Object),
    });
    expect(schema('photoshop_guard_cycle_auto').properties.previous_observation.properties).toMatchObject({
      affected_relations: expect.any(Object),
      affected_qualities: expect.any(Object),
      preservation_facts: expect.any(Object),
      independent_region: expect.any(Object),
      softness_review: expect.any(Object),
    });
    expect(
      schema('photoshop_guard_cycle_auto')
        .properties.previous_observation.properties.softness_review.properties.criteria.required
    ).toEqual(['edge_hierarchy', 'mass_separation', 'large_form_readability', 'focal_hierarchy', 'primitive_footprint']);
    expect(
      schema('photoshop_guard_cycle_auto')
        .properties.previous_observation.properties.review_findings.items.properties.trend_signals
    ).toMatchObject({ type: 'array' });
    const artSchema = schema('photoshop_guard_art_director');
    expect(artSchema.properties.directive.properties.composition_freedom.enum).toEqual(['fixed', 'constrained', 'free']);
    expect(artSchema.properties.directive.properties.composition_exploration.properties.mode).toBeUndefined();
    expect(artSchema.properties.directive.properties.composition_exploration.properties.hypotheses.maxItems).toBeUndefined();
    expect(artSchema.properties.directive.properties.refinement_check.properties.material_response)
      .toEqual(artSchema.properties.directive.properties.physical_stack_check.properties.material_response);
    expect(schema('photoshop_guard_set_priorities').properties.problems.items.properties.depends_on_problem_ids)
      .toMatchObject({ type: 'array', uniqueItems: true, items: { type: 'string' } });
    expect(schema('photoshop_guard_cycle_auto').properties.next_pass.properties.edges.items.properties.class.enum)
      .toEqual(['hard', 'soft', 'lost', 'firm', 'broken']);
    expect(schema('photoshop_guard_cycle_auto').properties.previous_observation.properties.edge_observations.items.properties.target_met.enum)
      .toEqual(['yes', 'no', 'uncertain']);
    expect(artSchema.properties.directive.properties.artistic_evaluation_contract).toBeTruthy();
    expect(artSchema.properties.global_brief_assessment).toBeTruthy();
    expect(artSchema.properties.pre_final_hostile_review).toBeTruthy();
    expect(artSchema.properties.anchor_decision.properties.action.enum).toEqual([
      'promote_primary',
      'retain_primary',
      'preserve_alternative',
    ]);
    expect(artSchema.properties.incomplete_hypothesis.properties.max_review_horizon.maximum).toBe(8);
    expect(artSchema.properties.incomplete_hypothesis_resolution.enum).toEqual([
      'resolved',
      'accepted',
      'reversed',
    ]);
    expect(artSchema.properties.whole_image_glance.properties.trigger.enum).toEqual([
      'stage_boundary',
      'global_change',
      'final_review',
    ]);
    expect(artSchema.properties.whole_image_glance.properties.frame_sha256).toBeTruthy();
    expect(tools.some(definition => definition.tool.name === 'photoshop_guard_report')).toBe(false);
    expect(tools.some(definition => definition.tool.name === 'photoshop_guard_ack_operation')).toBe(false);
    expect(tools.some(definition => definition.tool.name === 'photoshop_guard_verdict')).toBe(false);
  });

  it('accepts a refinement PASS with the full material response review through the public Art Director handler', async () => {
    const runtime = {
      collectArtDirectorReviewErrors: () => [],
      artDirector: async () => ({ ok: true }),
    } as unknown as EmbeddedGuardRuntime;
    const tool = createGuardTools(runtime).find(definition => definition.tool.name === 'photoshop_guard_art_director')!;
    const resolvedComponent = (name: string) => ({
      status: 'resolved',
      note: `${name} is visibly coherent with the form and material response.`,
    });
    const materialResponse = {
      response_role: 'base-material',
      components: {
        base_response: resolvedComponent('base response'),
        form_light_response: resolvedComponent('form light response'),
        specular_reflection: resolvedComponent('specular reflection'),
        transmission: { status: 'not-applicable', note: 'The reviewed material is opaque with no visible transmission.' },
        surface_condition: { status: 'not-applicable', note: 'No distinct surface-condition treatment is required here.' },
        variation_scale: resolvedComponent('variation scale'),
        edge_contact: resolvedComponent('edge contact'),
      },
      microtexture: {
        status: 'deferred',
        note: 'Microtexture remains subordinate to the established larger material response.',
      },
      texture_only_treatment: false,
    };
    const refinementCriteria = Object.fromEntries([
      'major_form_modelling', 'secondary_forms', 'edge_hierarchy', 'material_light_response', 'selective_detail', 'residual_block_in',
    ].map(key => [key, { status: key === 'selective_detail' ? 'not-applicable' : 'resolved', note: `${key} is resolved in the reviewed frame.` }]));
    const assessment = Object.fromEntries([
      'composition', 'focal_hierarchy', 'large_value_masses', 'lighting', 'silhouette', 'depth', 'likeness_main_shape',
      'overall_detail_level', 'mood', 'color_relationships', 'shape_language', 'edge_hierarchy', 'intentional_omission', 'next_priority',
    ].map(key => [key, `${key} reviewed`]));
    const result = await tool.handler({
      document_id: 42,
      action: 'review',
      directive: {
        directive_id: 'material-review-pass',
        goal: 'Verify the public refinement PASS contract accepts complete material-response evidence.',
        style_contract: {},
        prompt_conflict_preflight: {
          dominant_objective: 'Preserve coherent form and material response.',
          conflicts: [],
          resolution_mode: 'none',
          chosen_rendering_strategy: 'Review the exact current frame without further mutation.',
        },
        artistic_evaluation_contract: {
          contract_id: 'material-review-contract', revision: 1,
          positive_criteria: ['Material response remains coherent.'],
          failure_signals: ['Material response collapses into texture-only treatment.'],
          stage_transition_expectations: ['Advance only after resolved refinement evidence.'],
          final_evidence_requirements: ['Use the exact current frame.'],
          provenance: [{ source: 'test', detail: 'Public schema regression fixture.' }],
        },
        composition_freedom: 'fixed',
        composition_exploration: { hypotheses: [] },
        assessment,
        perceptual_hierarchy: {
          revision: 1, mode: 'ranked',
          zones: [{ id: 'subject', owner_ids: ['subject-owner'], priority: 'primary', contrast_budget: 'high', detail_budget: 'high', edge_certainty: 'high', chroma_accent: 'allowed' }],
          ordering: ['subject'],
        },
        refinement_check: {
          status: 'pass', observed: true,
          preview_sha256: 'a'.repeat(64), evidence_operation_id: 'current-frame',
          representation_change: 'meaningful',
          low_frequency_evidence: {
            status: 'resolved', observed: true, source_preview_sha256: 'a'.repeat(64),
            evidence_operation_id: 'current-frame-low-frequency',
            note: 'Major form survives low-frequency suppression of small texture.',
          },
          criteria: refinementCriteria,
          material_response: materialResponse,
        },
        priorities: ['material response'],
        review_after_microplans: 3,
        tasks: [{ task_id: 'material-review-task', summary: 'Review material response.' }],
      },
    });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse((result.content[0] as { type: 'text'; text: string }).text)).toMatchObject({ ok: true });
  });

  it('publishes compact Guard, runtime-state and UXP revisions without requiring version ceremony', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-protocol-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const tools = createGuardTools(runtime);
    const capabilities = tools.find(definition => definition.tool.name === 'photoshop_guard_capabilities')!;
    const capabilitiesBody = JSON.parse(((await capabilities.handler({})).content[0] as any).text);

    expect(capabilitiesBody.compact_guard_protocol_version).toBe('photoshop.guard.compact.v2');
    expect(capabilitiesBody.runtime_state_version).toBe('photoshop.guard.runtime-state.v2');
    expect(capabilitiesBody.expected_uxp_bridge_revision).toBe(UXP_BRIDGE_REVISION);
    expect(capabilitiesBody.compact_pass_limits).toMatchObject({
      max_visual_mutations: 8,
      max_layer_creations: 1,
      mixed_method_classes_allowed: false,
      single_method_class: true,
      visual_mutations_must_be_contiguous: true,
      preparation_must_precede_visual_transaction: true,
    });
    expect(capabilitiesBody.brush_preflight_dependency).toMatchObject({
      semantic: true,
      photoshop_paint_dabs: 'required',
      photoshop_paint_strokes: 'required_when_stroke_mechanism_is_BRUSH',
      region_painting_requires_brush_preflight: false,
      stroke_mechanism_contract: {
        BRUSH: { per_stroke_size_opacity_flow: true, per_stroke_dynamics: true, color_override: true },
        PENCIL: { per_stroke_size_opacity_flow: false, per_stroke_dynamics: false, color_override: true },
        SMUDGE: { per_stroke_size_opacity_flow: false, per_stroke_dynamics: false, color_override: false },
        ERASER: { per_stroke_size_opacity_flow: false, per_stroke_dynamics: false, color_override: false },
      },
    });

    const cycle = tools.find(definition => definition.tool.name === 'photoshop_guard_cycle_auto')!;
    const cycleSchema = cycle.tool.inputSchema as any;
    const nextPassSchema = cycleSchema.properties.next_pass;
    expect(nextPassSchema.required).not.toContain('pass_type');
    expect(nextPassSchema.properties.pass_type).toBeUndefined();
    expect(nextPassSchema.properties.problem_id).toBeTruthy();
    expect(nextPassSchema.properties.action_class.enum).toEqual(expect.arrayContaining([
      'ADD', 'REFINE', 'REPLACE', 'ERASE', 'ROLLBACK',
    ]));
    expect(cycle.tool.description).toMatch(/not an entire artistic stage/i);
    const stale = JSON.parse(((await cycle.handler({ protocol_version: 'photoshop.guard.compact.v1' })).content[0] as any).text);
    expect(stale.ok).toBe(false);
    expect(stale.message).toMatch(/guard_protocol_version_mismatch.*compact\.v2.*compact\.v1/);

    const missing = JSON.parse(((await cycle.handler({})).content[0] as any).text);
    expect(missing.preflight_rejection?.code).not.toBe('guard_protocol_version_mismatch');
  });

  it.each([
    ['next_operation', { next_operation: { id: 'legacy-op', tool: 'photoshop_get_state', args: {} } }, 'next_pass'],
    ['previous_report', { previous_operation_id: 'legacy-prior', previous_report: { did: 'x', why: 'y', result: 'z' } }, 'previous_observation'],
    ['previous_operation_ack', { previous_operation_id: 'legacy-prior', previous_operation_ack: { token: 'legacy-token' } }, 'previous_operation_id + previous_observation'],
    ['previous_visual_verdict', { previous_operation_id: 'legacy-prior', previous_visual_verdict: critic() }, 'previous_observation'],
    ['previous_report_ack', { previous_operation_id: 'legacy-prior', previous_report_ack: { token: 'legacy-token' } }, 'previous_operation_id + previous_observation'],
  ])('rejects removed legacy cycle field %s before compact expansion', async (field, input, replacement) => {
    const dir = mkdtempSync(path.join(tmpdir(), `embedded-guard-legacy-${field}-`));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const executeSpy = vi.spyOn(registry, 'execute');

    const rejected = await runtime.cycleAuto(input as Record<string, unknown>) as any;

    expect(rejected.preflight_rejection).toMatchObject({
      code: 'legacy_contract_removed',
      execution: 'not-executed',
      error_codes: ['legacy_contract_removed'],
      previous_operation_closed: false,
      next_operation_dispatched: false,
    });
    expect(rejected.preflight_rejection.errors.join('\n')).toContain(String(field));
    expect(rejected.preflight_rejection.errors.join('\n')).toContain(String(replacement));
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('rejects compact next_pass combined with any removed legacy field instead of selecting a path', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-legacy-mixed-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const rejected = await runtime.cycleAuto({
      next_pass: {
        request_key: 'compact-with-legacy',
        document_id: 42,
        goal: 'This compact pass must never be expanded when a removed field is present',
        actions: [{ id: 'read', tool: 'photoshop_get_state', args: { document_id: 42 } }],
      },
      previous_report: { did: 'legacy', why: 'legacy', result: 'legacy' },
    }) as any;

    expect(rejected.preflight_rejection.code).toBe('legacy_contract_removed');
    expect(rejected.preflight_rejection.errors.join('\n')).toMatch(/previous_report.*previous_observation/);
    expect(runtime.store.read('compact-with-legacy')).toBeUndefined();
  });

  it('binds an art run, archives each visual frame beside an exact commentary sidecar, and persists the post-report text', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-art-run-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const projectRel = 'processes/test-scene-process/run-01';
    const projectDir = path.join(dir, 'processes', 'test-scene-process', 'run-01');

    const configured = runtime.artRun({
      document_id: 42,
      process_dir: projectRel,
      commentary_mode: 'artistic',
      commentary_detail: 'normal',
      painting_profile: 'simple_graphic',
    }) as any;
    expect(configured.art_run.process_dir).toBe(projectRel);
    expect(configured.art_run.export_directory).toBe(path.join(projectDir, 'export'));
    expect(configured.art_run.frames_directory).toBe(path.join(projectDir, 'export', 'frames'));
    expect(configured.art_run.videos_directory).toBe(path.join(projectDir, 'export', 'videos'));
    expect(existsSync(path.join(projectDir, 'export', 'frames'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'export', 'videos'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'frames'))).toBe(false);
    expect(existsSync(path.join(projectDir, 'checkpoints'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'final'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'painting-state.json'))).toBe(true);

    const preComment =
      'Сейчас отделяю крупную светлую плоскость, чтобы форма читалась яснее, не разрушая соседний силуэт.';
    const first = await runtime.cycle({
      next_pass: {
        request_key: 'art-frame-one',
        document_id: 42,
        goal: preComment,
        region: 'main-light-plane',
        stage: 'SHAPE',
        scale: 'medium',
        actions: [{
          id: 'refine-main-light-plane',
          tool: 'photoshop_paint_dabs',
          args: { dabs: [{ x: 10, y: 20 }] },
        }],
      },
    }) as any;

    expect(first.preview.project_path).toMatch(/export[\\/]frames[\\/]0001_art-frame-one\.jpg$/);
    expect(first.preview.commentary_path).toMatch(/export[\\/]frames[\\/]0001_art-frame-one\.txt$/);
    expect(existsSync(first.preview.project_path)).toBe(true);
    expect(existsSync(first.preview.commentary_path)).toBe(true);
    expect(readFileSync(first.preview.commentary_path, 'utf8')).toContain(
      'Сейчас отделяю крупную светлую плоскость, чтобы форма читалась яснее, не разрушая соседний силуэт.'
    );

    await runtime.cycle({
      previous_operation_id: 'art-frame-one',
      previous_observation: {
        observed: 'Уточнил светлую плоскость формы и сохранил её связь с общим силуэтом. Светлая плоскость стала яснее, а внешний силуэт остался устойчивым.',
        target: 'resolved',
      },
    });

    const sidecar = readFileSync(first.preview.commentary_path, 'utf8');
    expect(sidecar).toContain('Сейчас отделяю крупную светлую плоскость');
    expect(sidecar).toContain('В Photoshop я использую кисть.');
    expect(sidecar).toContain('Уточнил светлую плоскость формы и сохранил её связь с общим силуэтом.');
    expect(runtime.store.read('art-frame-one')?.report?.why).toBe(preComment);
    expect(sidecar).not.toContain('Продвинуть текущую художественную задачу');
    expect(sidecar).not.toContain('Кадр:');
    expect(sidecar).not.toContain('Операция:');
    expect(sidecar).not.toContain('Этап:');
    expect(sidecar).not.toContain('Область:');
    expect(sidecar).not.toContain('Перед проходом:');
    expect(sidecar).not.toContain('После прохода:');
    expect(sidecar).not.toContain('Что сделал:');
    expect(sidecar).not.toContain('Зачем:');
    expect(sidecar).not.toContain('Результат:');
    expect(sidecar).toContain('Светлая плоскость стала яснее');
  });

  it('preserves source commentary under Russian scaffolding and excludes read-only recovery previews from export', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-export-language-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const projectRel = 'processes/export-language-process/run-01';
    const projectDir = path.join(dir, 'processes', 'export-language-process', 'run-01');
    runtime.artRun({
      document_id: 42,
      process_dir: projectRel,
      commentary_mode: 'artistic',
      commentary_detail: 'normal',
      painting_profile: 'simple_graphic',
    });
    runtime.store.setUserConfig({ language: 'ru' }, 42);

    const sidecarPath = path.join(projectDir, 'export', 'frames', '0001-language-test.txt');
    runtime.store.writeCommentarySidecar({
      id: 'language-test',
      args: { document_id: 42 },
      artistic_commentary: 'Paint the visible architecture with broad warm masses.',
      region: 'central architecture band',
      preview: {
        project_path: path.join(projectDir, 'export', 'frames', '0001-language-test.jpg'),
        commentary_path: sidecarPath,
      },
    });
    const sidecar = readFileSync(sidecarPath, 'utf8');
    expect(sidecar).toContain('Paint the visible architecture with broad warm masses.');
    expect(sidecar).not.toContain('художественный проход');

    const recoveryPreview = jpegMeta(dir, 'recovery-preview.jpg', 90);
    const archived = runtime.store.archiveProjectPreview({
      id: 'read-only-recovery',
      args: { document_id: 42 },
      visual: false,
    }, recoveryPreview) as any;
    expect(archived.project_path).toBeUndefined();
    expect(readdirSync(path.join(projectDir, 'export', 'frames'))).toEqual(['0001-language-test.txt']);
  });

  it('writes artistic sidecars as human process narration with observable Photoshop tools and brush settings', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-artistic-narration-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const projectRel = 'processes/artistic-narration-process/run-01';
    const projectDir = path.join(dir, 'processes', 'artistic-narration-process', 'run-01');
    runtime.artRun({
      document_id: 42,
      process_dir: projectRel,
      commentary_mode: 'artistic',
      commentary_detail: 'detailed',
      painting_profile: 'simple_graphic',
    });
    runtime.store.setUserConfig({ language: 'ru' }, 42);

    const sidecarPath = path.join(projectDir, 'export', 'frames', '0001-watercolor.txt');
    runtime.store.writeCommentarySidecar({
      id: 'watercolor-human-text',
      args: {
        document_id: 42,
        steps: [
          {
            tool: 'photoshop_set_brush',
            args: { size: 150, hardness: 18, opacity: 48, flow: 24 },
          },
          {
            tool: 'photoshop_paint_strokes',
            args: { strokes: [{ tool: 'BRUSH', points: [{ x: 10, y: 10 }, { x: 40, y: 40 }] }] },
          },
        ],
      },
      artistic_commentary: 'Усилить акварель более насыщенными тёплыми проходами.',
      report: {
        did: 'Усилить акварель более насыщенными проходами.',
        why: 'Сделать композицию выразительнее, сохранив прозрачность и свет бумаги.',
        result: 'Акварель стала насыщеннее, а светлые промежутки сохранились.',
      },
      preview: {
        project_path: path.join(projectDir, 'export', 'frames', '0001-watercolor.jpg'),
        commentary_path: sidecarPath,
      },
    });

    const sidecar = readFileSync(sidecarPath, 'utf8');
    expect(sidecar).toContain('Усилить акварель более насыщенными тёплыми проходами.');
    expect(sidecar).toContain('В Photoshop я использую кисть.');
    expect(sidecar).toContain('размер 150 px');
    expect(sidecar).toContain('жёсткость 18%');
    expect(sidecar).toContain('непрозрачность 48%');
    expect(sidecar).toContain('поток 24%');
    expect(sidecar).toContain('Я усилил акварель');
    expect(sidecar).toContain('Для того чтобы сделать композицию выразительнее');
    expect(sidecar).toContain('В результате акварель стала насыщеннее');
    expect(sidecar).not.toMatch(/Кадр:|Операция:|Этап:|Область:|Перед проходом:|После прохода:|Что сделал:|Зачем:|Результат:/);
  });

  it('generates and reuses a revision-bound capability snapshot across a healthy visual pass', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-capability-snapshot-reuse-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let brushInventoryReads = 0;
    let brushSettingsReads = 0;
    registry.register('photoshop_list_brush_presets', {
      tool: { name: 'photoshop_list_brush_presets', description: 'brush inventory counter fixture', inputSchema: { type: 'object', properties: {} } },
      handler: async () => {
        brushInventoryReads += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, presets: [] }) }] };
      },
    });
    registry.register('photoshop_get_brush_settings', {
      tool: { name: 'photoshop_get_brush_settings', description: 'brush settings counter fixture', inputSchema: { type: 'object', properties: {} } },
      handler: async () => {
        brushSettingsReads += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, settings: {} }) }] };
      },
    });
    registry.register('photoshop_paint_regions', {
      tool: {
        name: 'photoshop_paint_regions',
        description: 'capability snapshot region fixture',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, regions: { type: 'array' } },
          required: ['regions'],
          additionalProperties: false,
        },
      },
      handler: async () => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'regions painted' }) }] }),
    });
    const readiness = {
      ready: true,
      transport: 'uxp' as const,
      bridge_transport: 'long-poll',
      bridge_revision: UXP_BRIDGE_REVISION,
      expected_bridge_revision: UXP_BRIDGE_REVISION,
      revision_match: true,
      photoshop_version: '27.0.1',
      document_count: 1,
      active_document: { id: 42, name: 'Snapshot.psd' },
      plugin_connected: true,
      reason: null,
      checked_at: '2026-09-22T00:00:00.000Z',
      runtime_instance_witness: 'runtime-snapshot-a',
      cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
    };
    const runtime = new EmbeddedGuardRuntime(registry, {
      runtimeDirectory: path.join(dir, 'controller'),
      previewBarrierDirectory: path.join(dir, 'barriers'),
      executionLeaseFile: path.join(dir, 'execution.lock'),
      workspaceRoot: dir,
      uxpReadinessProbe: async () => structuredClone(readiness),
      uxpStateProbe: async () => ({
        ok: true,
        data: {
          document: { id: 42, name: 'Snapshot.psd' },
          activeLayer: { id: 7, name: 'Paint', kind: 'LayerKind.NORMAL' },
        },
      }),
    });
    const brushPreflight = {
      completed: true,
      inventory_observed: true,
      inventory_total: 12,
      roles: [{
        role_id: 'broad-form',
        purpose: 'Broad form construction',
        material_roles: ['generic-form'],
        visual_intents: ['painted-mass'],
        preferred_preset: 'Round Form Brush',
        alternative_presets: [],
        effective_settings: {
          size: 120, hardness: 60, roundness: 100, opacity: 80, flow: 60, spacing: 10,
          use_pressure_size: false, use_pressure_opacity: false, airbrush: false,
          smoothing_enabled: true, smoothing: 10,
        },
        working_scale: 'medium',
        pressure_policy: 'none',
        probe_status: 'pass',
      }],
    };

    const publicTools = createGuardTools(runtime);
    const setArtRunTool = publicTools.find(definition => definition.tool.name === 'photoshop_guard_set_art_run')!;
    const statusTool = publicTools.find(definition => definition.tool.name === 'photoshop_guard_status')!;
    const beforeSetup = JSON.parse(((await statusTool.handler({})).content[0] as any).text) as any;
    expect(beforeSetup.paint_readiness).toMatchObject({
      document: 'ready',
      document_id: 42,
      art_run: 'missing',
      brush_preflight: 'missing',
      can_submit_visual_pass: false,
      can_submit_brush_independent_visual_pass: false,
      can_submit_brush_dependent_visual_pass: false,
      next_required_action: 'photoshop_guard_set_art_run',
    });
    const configured = JSON.parse(((await setArtRunTool.handler({
      document_id: 42,
      process_dir: 'processes/capability-snapshot-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: brushPreflight,
    })).content[0] as any).text) as any;
    expect(configured.paint_readiness).toMatchObject({
      document: 'ready',
      document_id: 42,
      art_run: 'ready',
      brush_preflight: 'ready',
      can_submit_visual_pass: true,
      can_submit_brush_independent_visual_pass: true,
      can_submit_brush_dependent_visual_pass: true,
      next_required_action: 'photoshop_guard_cycle_auto',
    });
    expect(runtime.store.artRunState(42)?.brush_preflight).toMatchObject({
      runtime_instance_witness: 'runtime-snapshot-a',
    });
    expect({ brushInventoryReads, brushSettingsReads }).toEqual({ brushInventoryReads: 0, brushSettingsReads: 0 });
    await setArtRunTool.handler({
      document_id: 42,
      process_dir: 'processes/capability-snapshot-process/run-01',
      painting_profile: 'nontrivial_painting',
      brush_preflight: brushPreflight,
    });
    expect({ brushInventoryReads, brushSettingsReads }).toEqual({ brushInventoryReads: 0, brushSettingsReads: 0 });
    const first = configured.capability_snapshot;
    expect(first).toMatchObject({
      protocol: 'photoshop.guard.capability_snapshot.v1',
      compact_guard_protocol_version: 'photoshop.guard.compact.v2',
      runtime_state_version: 'photoshop.guard.runtime-state.v2',
      uxp_bridge: {
        ready: true,
        revision_match: true,
        actual_revision: UXP_BRIDGE_REVISION,
        expected_revision: UXP_BRIDGE_REVISION,
      },
      pinned_targets: {
        document_id: 42,
        active_document_id: 42,
        document_matches: true,
        active_layer_id: 7,
        active_layer_name: 'Paint',
        layer_target_status: 'pinned',
      },
      painting_profile: 'nontrivial_painting',
      preparation_facts: {
        art_run_bound: true,
        brush_preflight_completed: true,
        brush_inventory_observed: true,
        brush_inventory_total: 12,
        uxp_state_readback_ok: true,
        active_document_matches: true,
      },
      cache: { reused: false },
    });
    expect(first.brush_roles[0]).toMatchObject({
      role_id: 'broad-form',
      effective_settings: brushPreflight.roles[0]!.effective_settings,
    });
    expect(first.supported_semantic_methods).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'region-block-in', method_class: 'region' }),
    ]));
    expect(first.unavailable_methods.every((method: any) => typeof method.reason === 'string' && method.reason.length > 0)).toBe(true);

    const pass = await runtime.cycleAuto({
      next_pass: {
        request_key: 'capability-snapshot-healthy-pass',
        document_id: 42,
        goal: 'Add one bounded region while keeping the capability dependencies unchanged',
        region: 'middle-form',
        stage: 'FORM',
        scale: 'medium',
        actions: [{
          id: 'region-pass',
          tool: 'photoshop_paint_regions',
          args: { regions: [{ points: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }] }] },
        }],
      },
    }) as any;
    expect(pass.execution.phase).toBe('completed');
    expect({ brushInventoryReads, brushSettingsReads }).toEqual({ brushInventoryReads: 0, brushSettingsReads: 0 });

    const status = JSON.parse(((await statusTool.handler({})).content[0] as any).text) as any;
    const reused = status.capability_snapshots['42'];
    expect(reused.snapshot_revision).toBe(first.snapshot_revision);
    expect(reused.generated_at).toBe(first.generated_at);
    expect(reused.cache).toMatchObject({ reused: true, dependency_key: first.cache.dependency_key });
    const fullStatus = await runtime.statusWithCapabilitySnapshots() as any;
    const fullUsage = fullStatus.documents['42'].method_usage;
    const available = fullStatus.capability_snapshots['42'].supported_semantic_methods.map((row: any) => row.id);
    expect(fullUsage.available_method_ids).toEqual(available);
    expect(fullUsage.unused_available_method_ids).toEqual(available);
    expect(fullUsage.distinct_unused_available_methods).toBe(available.length);
    if (status.response_budget?.truncated) {
      // Public status may omit diagnostic inventories only with an explicit
      // reference to the full disk-backed projection.
      expect(status.response_budget.omitted.method_usage).toBeGreaterThanOrEqual(1);
      expect(status.response_budget.full_projection_path).toBeTruthy();
      expect(status.documents['42'].method_usage).toBeUndefined();
      expect(JSON.parse(readFileSync(status.response_budget.full_projection_path, 'utf8'))
        .documents['42'].method_usage).toEqual(fullUsage);
    } else {
      expect(status.documents['42'].method_usage).toEqual(fullUsage);
    }
  });

  it('invalidates the capability snapshot when the UXP bridge revision/readiness dependency changes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-capability-snapshot-invalidate-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let readiness = {
      ready: true,
      transport: 'uxp' as const,
      bridge_transport: 'long-poll',
      bridge_revision: UXP_BRIDGE_REVISION as string | null,
      expected_bridge_revision: UXP_BRIDGE_REVISION,
      revision_match: true,
      photoshop_version: '27.0.1',
      document_count: 1,
      active_document: { id: 42, name: 'Snapshot.psd' } as { id?: number; name?: string } | null,
      plugin_connected: true,
      reason: null as string | null,
      checked_at: '2026-09-22T00:00:00.000Z',
      cache: { hit: false, age_ms: 0, ttl_ms: 2000 },
    };
    const runtime = new EmbeddedGuardRuntime(registry, {
      runtimeDirectory: path.join(dir, 'controller'),
      previewBarrierDirectory: path.join(dir, 'barriers'),
      executionLeaseFile: path.join(dir, 'execution.lock'),
      workspaceRoot: dir,
      uxpReadinessProbe: async () => structuredClone(readiness),
      uxpStateProbe: async () => ({
        ok: true,
        data: { document: { id: 42 }, activeLayer: { id: 7, name: 'Paint' } },
      }),
    });

    const configured = await runtime.artRunWithCapabilitySnapshot({
      document_id: 42,
      process_dir: 'processes/capability-invalidation-process/run-01',
      painting_profile: 'simple_graphic',
    }) as any;
    const first = configured.capability_snapshot;

    readiness = {
      ...readiness,
      ready: false,
      bridge_revision: 'stale-bridge-revision',
      revision_match: false,
      plugin_connected: false,
      reason: 'uxp_bridge_revision_mismatch',
      checked_at: '2026-09-22T00:01:00.000Z',
    };
    const status = await runtime.statusWithCapabilitySnapshots() as any;
    const invalidated = status.capability_snapshots['42'];
    expect(invalidated.snapshot_revision).not.toBe(first.snapshot_revision);
    expect(invalidated.cache.reused).toBe(false);
    expect(invalidated.uxp_bridge).toMatchObject({
      ready: false,
      revision_match: false,
      actual_revision: 'stale-bridge-revision',
      reason: 'uxp_bridge_revision_mismatch',
    });
    expect(invalidated.supported_semantic_methods).toEqual([]);
    expect(invalidated.unavailable_methods.length).toBeGreaterThan(0);
  });

  it('captures one request-local projection for compact status instead of rescanning journals inside statusCompact', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-status-projection-reuse-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const originalCapture = runtime.store.captureProjectionContext.bind(runtime.store);
    const originalStatusCompact = runtime.store.statusCompact.bind(runtime.store);
    let captures = 0;
    let projectionSeen = false;
    runtime.store.captureProjectionContext = ((options?: any) => {
      captures += 1;
      return originalCapture(options);
    }) as any;
    runtime.store.statusCompact = ((projection?: any) => {
      projectionSeen = !!projection;
      if (!projection) throw new Error('statusCompact must receive the request-local projection');
      return originalStatusCompact(projection);
    }) as any;

    await runtime.statusWithCapabilitySnapshots();

    expect(captures).toBe(1);
    expect(projectionSeen).toBe(true);
  });

  it('keeps ordinary status journal scans bounded to one even with a large operation history', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-status-large-history-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    for (let index = 0; index < 300; index += 1) {
      runtime.store.write({
        id: `large-history-read-${index}`,
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Large-history read fixture',
        purpose: 'Prove request-local projection scan bounds',
        phase: 'completed',
        failed: false,
        execution: 'completed',
        sequence: index + 1,
        created_at: new Date(1_700_000_000_000 + index).toISOString(),
        report: { delivered: true },
      } as any);
    }
    const recordsSpy = vi.spyOn(runtime.store, 'records');

    await runtime.statusWithCapabilitySnapshots();

    expect(recordsSpy).toHaveBeenCalledTimes(1);
  });

  it('reuses the cycle projection for missing-document recovery before async selection', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-cycle-projection-reuse-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    for (let index = 0; index < 300; index += 1) {
      runtime.store.write({
        id: `cycle-projection-history-${index}`,
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Large-history cycle projection fixture',
        purpose: 'Prove compiler/recovery journal scans stay request-bounded',
        phase: 'completed',
        failed: false,
        execution: 'completed',
        sequence: index + 1,
        created_at: new Date(1_700_000_000_000 + index).toISOString(),
        report: { delivered: true },
      } as any);
    }
    const recordsSpy = vi.spyOn(runtime.store, 'records');
    const originalAutoAbandon = (runtime as any).autoAbandonMissingDocuments.bind(runtime);
    let projectionSeen = false;
    (runtime as any).autoAbandonMissingDocuments = async (source: string, projection?: any) => {
      projectionSeen = !!projection;
      if (!projection) throw new Error('cycle missing-document recovery must receive the request-local projection');
      return originalAutoAbandon(source, projection);
    };

    const rejected = await runtime.cycle({
      next_pass: {
        request_key: 'projection-reuse-preflight-rejection',
        document_id: 42,
        goal: 'Exercise the ordinary cycle preflight without configuring an art run.',
        region: 'whole-canvas',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'global',
        actions: [{
          id: 'projection-reuse-fill',
          tool: 'photoshop_fill_layer',
          args: { color: { red: 20, green: 30, blue: 40 } },
        }],
      },
    }) as any;

    expect(rejected.preflight_rejection).toBeTruthy();
    expect(projectionSeen).toBe(true);
    // The compiler's artistic-recovery check consumes the same request-local
    // projection as missing-document recovery instead of rescanning journals.
    expect(recordsSpy).toHaveBeenCalledTimes(1);
  });

  it('requires art-run configuration before paint entry operations and keeps process_dir immutable', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-art-run-required-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const rejected = await runtime.cycle({
      next_pass: {
        request_key: 'paint-without-project',
        document_id: 42,
        goal: 'Пробую сделать первый мазок только после того, как проект получит собственную папку.',
        region: 'whole-canvas',
        stage: 'FORM',
        scale: 'medium',
        actions: [{
          id: 'paint-without-project-dab',
          tool: 'photoshop_paint_dabs',
          args: { dabs: [{ x: 1, y: 2 }] },
        }],
      },
    }) as any;
    expect(rejected.execution).toMatchObject({
      operation_id: 'paint-without-project',
      execution: 'not-executed',
    });
    expect(rejected.preflight_rejection.errors.join('\n')).toMatch(/Art project folder is not configured/);
    expect(runtime.store.read('paint-without-project')).toBeUndefined();

    runtime.artRun({ document_id: 42, process_dir: 'processes/test-scene-process/run-01' });
    expect(() => runtime.artRun({
      document_id: 42,
      process_dir: 'processes/test-scene-process/run-02',
    })).toThrow(/process_dir is immutable/);
  });

  it('rejects unsafe project paths and art-run saves outside the bound project directory', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-art-run-paths-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    for (const unsafe of [
      '../escape',
      'processes/test-scene-process/../escape',
      'processes/CON-process/run-01',
      'C:/outside/run',
    ]) {
      expect(() => runtime.artRun({ document_id: 42, process_dir: unsafe })).toThrow();
    }

    runtime.artRun({ document_id: 42, process_dir: 'processes/test-scene-process/run-01' });
    const rejected = await runtime.cycle({
      next_pass: {
        request_key: 'save-outside-project',
        document_id: 42,
        goal: 'Attempt a save outside the bound project to verify art-run file confinement.',
        region: 'whole-canvas',
        stage: 'FINAL',
        scale: 'global',
        actions: [{
          id: 'save-outside-project-step',
          tool: 'photoshop_save_document',
          args: { path: path.join(dir, 'outside.psd'), format: 'PSD' },
        }],
      },
    }) as any;
    expect(rejected.execution).toMatchObject({
      operation_id: 'save-outside-project',
      execution: 'not-executed',
    });
    expect(rejected.preflight_rejection.errors.join('\n')).toMatch(/must stay inside/);
    expect(runtime.store.read('save-outside-project')).toBeUndefined();
  });

  it('rejects multiple direct save operations with a compact-pass error instead of miscompiling them as a VisualMicroPlan', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-multi-save-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({ document_id: 42, process_dir: 'processes/test-scene-process/run-01' });
    const outputDir = path.join(dir, 'processes', 'test-scene-process', 'run-01');
    mkdirSync(outputDir, { recursive: true });
    const psdPath = path.join(outputDir, 'final.psd');
    const pngPath = path.join(outputDir, 'final.png');

    const rejected = await runtime.cycle({
      next_pass: {
        request_key: 'save-two-formats-one-pass',
        document_id: 42,
        goal: 'Save both delivery formats while preserving one durable operation per direct Photoshop dispatch.',
        region: 'document-persistence',
        actions: [
          {
            id: 'save-psd',
            tool: 'photoshop_save_document',
            args: { path: psdPath, format: 'PSD' },
          },
          {
            id: 'save-png',
            tool: 'photoshop_save_document',
            args: { path: pngPath, format: 'PNG' },
          },
        ],
      },
    }) as any;

    expect(rejected.execution).toBeNull();
    expect(rejected.preflight_rejection.error_codes).toContain('compact_pass_multiple_direct_operations');
    expect(rejected.preflight_rejection.errors.join('\n')).toMatch(/save PSD and PNG in two sequential passes/);
    expect(rejected.preflight_rejection.error_codes).not.toContain('tool_schema_invalid');
    expect(rejected.preflight_rejection.error_codes).not.toContain('invalid_visual_microplan');
    expect(existsSync(psdPath)).toBe(false);
    expect(existsSync(pngPath)).toBe(false);
    expect(runtime.store.read('save-two-formats-one-pass')).toBeUndefined();
  });

  it('admits an ordered scale then move as one compact VisualMicroPlan instead of rejecting multiple direct operations', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-ordered-transform-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const calls: string[] = [];
    for (const [name, properties] of [
      ['photoshop_scale_layer', { scalePercent: { type: 'number' }, centerAnchor: { type: 'boolean' } }],
      ['photoshop_move_layer', { deltaX: { type: 'number' }, deltaY: { type: 'number' } }],
      ['photoshop_rotate_layer', { degrees: { type: 'number' } }],
    ] as const) {
      registry.register(name, {
        tool: {
          name,
          description: 'test transform mutation',
          inputSchema: {
            type: 'object',
            properties: { document_id: { type: 'number' }, ...properties },
          },
        },
        handler: async () => {
          calls.push(name);
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: `${name} applied` }) }] };
        },
      });
    }
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({ document_id: 42, process_dir: 'processes/test-scene-process/run-01' });

    const result = await runtime.cycle({
      next_pass: {
        request_key: 'ordered-transform-one-pass',
        problem_id: 'ordered-transform',
        document_id: 42,
        goal: 'Scale from top-left, then preserve the required translated placement.',
        visual_intent: 'move-scale-rotate',
        impact_class: 'transform',
        actions: [
          { id: 'scale', tool: 'photoshop_scale_layer', args: { scalePercent: 50, centerAnchor: false } },
          { id: 'move', tool: 'photoshop_move_layer', args: { deltaX: 80, deltaY: 30 } },
          { id: 'preview', tool: 'photoshop_get_preview', args: { max_dimension_px: 800 } },
        ],
      },
    }) as any;

    expect(result.preflight_rejection?.error_codes ?? []).not.toContain('compact_pass_multiple_direct_operations');
    expect(result.preflight_rejection).toBeUndefined();
    expect(result.job_id ?? result.execution?.operation_id).toBeTruthy();
  });

  it('automatically persists and verifies due checkpoint debt before the next visual mutation', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-auto-checkpoint-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let clock = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const saveDefinition = registry.get('photoshop_save_document')!;
    const originalSave = saveDefinition.handler;
    const saveCalls = vi.spyOn(saveDefinition, 'handler').mockImplementation(async args => {
      const result = await originalSave(args);
      clock += 30;
      result.content = [{ type: 'text', text: JSON.stringify({ ok: true, execution_duration_ms: 7 }) }];
      return result;
    });
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({ document_id: 42, process_dir: 'processes/auto-checkpoint-process/run-01' });
    for (let sequence = 1; sequence <= 8; sequence++) {
      runtime.store.write({
        id: `auto-checkpoint-source-${sequence}`,
        tool: 'photoshop_execute_visual_microplan',
        args: { document_id: 42, risk: 'low' },
        summary: 'Completed visual source pass',
        purpose: 'Accumulate checkpoint debt for automatic persistence coverage',
        hash: `auto-checkpoint-source-hash-${sequence}`,
        sequence,
        created_at: new Date(Date.now() + sequence).toISOString(),
        completed_at: new Date(Date.now() + sequence).toISOString(),
        phase: 'completed',
        visual: true,
        failed: false,
        report: { did: 'Completed source pass', why: 'Fixture', result: 'Fixture complete' },
      });
    }
    expect(runtime.store.checkpointState(42, undefined, undefined).due).toBe(true);

    const receipt = await (runtime as any).ensureAutomaticCheckpointBeforeVisualMutation({
      id: 'next-visual-after-checkpoint',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
    });

    expect(receipt).toMatchObject({
      protocol: 'photoshop.guard.automatic_checkpoint.v1',
      source_operation_id: 'auto-checkpoint-source-8',
      verified: true,
    });
    expect(existsSync(receipt.path)).toBe(true);
    expect(saveCalls).toHaveBeenCalledTimes(1);
    expect(receipt.timing).toMatchObject({ wall_ms: 30, photoshop_dispatch_wall_ms: 30,
      photoshop_reported_execution_ms: 7, measurement_boundary: 'before_latency_persistence' });
    expect(runtime.store.read(receipt.operation_id).latency).toMatchObject({
      automatic_checkpoint_wall_ms: 30, photoshop_dispatch_wall_ms: 30, photoshop_reported_execution_ms: 7,
    });
    expect(runtime.store.latencySummary(42).components.automatic_checkpoint_wall_ms).toMatchObject({ samples: 1, median_ms: 30 });
    expect(runtime.store.read(receipt.operation_id)).toMatchObject({
      phase: 'completed',
      checkpoint: receipt.path,
      report: expect.any(Object),
      operation_ack: expect.any(Object),
    });
    expect(runtime.store.checkpointState(42, undefined, undefined).due).toBe(false);
  });

  it('reuses a request-local projection when checking automatic checkpoint debt', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-checkpoint-projection-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const projection = runtime.store.captureProjectionContext();
    const recordsSpy = vi.spyOn(runtime.store, 'records');

    const receipt = await (runtime as any).ensureAutomaticCheckpointBeforeVisualMutation({
      id: 'projection-checkpoint-probe',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
    }, projection);

    expect(receipt).toBeNull();
    expect(recordsSpy).not.toHaveBeenCalled();
    runtime.artRun({ document_id: 42, process_dir: 'processes/prepared-checkpoint-process/run-01' });
    const snapshots = vi.spyOn(runtime.store, 'captureProjectionContext');
    const operation = { id: 'prepared-save', tool: 'photoshop_save_document',
      args: { document_id: 42, path: path.join(dir, 'processes', 'prepared-checkpoint-process', 'run-01', 'checkpoints', 'prepared.psd'), format: 'PSD' },
      summary: 'Save fixture', purpose: 'Verify prepared checkpoint reference' };
    const carried = { operation_id: 'already-saved-checkpoint', verified: true };
    const result = await runtime.cycle({ next_operation: operation }, undefined, { prepared: {
      operation, guardPreflightMs: 0, cycleReceivedAt: new Date().toISOString(), cycleStartedAt: Date.now(),
      requestJsonBytes: 1, automaticCheckpoint: carried,
    } });
    expect(result.automatic_checkpoint).toEqual(carried);
    expect(runtime.store.read('prepared-save').latency.automatic_checkpoint_operation_id).toBe(carried.operation_id);
    expect(snapshots).toHaveBeenCalledTimes(1);
  });

  it('fails closed and preserves recovery state when an automatic checkpoint cannot be verified', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-auto-checkpoint-failure-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    registry.register('photoshop_save_document', {
      tool: {
        name: 'photoshop_save_document',
        description: 'test unverifiable document save',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number' },
            path: { type: 'string' },
            format: { type: 'string' },
          },
        },
      },
      handler: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'save returned without durable file' }) }],
      }),
    });
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({ document_id: 42, process_dir: 'processes/auto-checkpoint-failure-process/run-01' });
    for (let sequence = 1; sequence <= 8; sequence++) {
      runtime.store.write({
        id: `auto-checkpoint-failure-source-${sequence}`,
        tool: 'photoshop_execute_visual_microplan',
        args: { document_id: 42, risk: 'low' },
        summary: 'Completed visual source pass',
        purpose: 'Accumulate checkpoint debt for fail-closed persistence coverage',
        hash: `auto-checkpoint-failure-source-hash-${sequence}`,
        sequence,
        created_at: new Date(Date.now() + sequence).toISOString(),
        completed_at: new Date(Date.now() + sequence).toISOString(),
        phase: 'completed',
        visual: true,
        failed: false,
        report: { did: 'Completed source pass', why: 'Fixture', result: 'Fixture complete' },
      });
    }

    await expect((runtime as any).ensureAutomaticCheckpointBeforeVisualMutation({
      id: 'blocked-next-visual',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
    })).rejects.toThrow(/automatic_checkpoint_failed/);
    const checkpointRecord = runtime.store.records().find((record: any) =>
      record.id.startsWith('auto-checkpoint-42-')
    );
    expect(checkpointRecord).toMatchObject({
      tool: 'photoshop_save_document',
      phase: 'uncertain',
      failed: true,
      checkpoint_error: 'PSD file was not verified on disk',
    });
    expect(runtime.store.checkpointState(42, undefined, undefined).due).toBe(true);
  });

  it('runs one durable guarded visual cycle and closes it on the next cycle', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycle({
      next_pass: {
        request_key: 'guard-one',
        document_id: 42,
        goal: 'Reduce the test layer opacity and verify native Guard execution and preview capture.',
        region: 'whole-canvas',
        stage: 'FORM',
        scale: 'global',
        actions: [{
          id: 'reduce-opacity',
          tool: 'photoshop_set_layer_opacity',
          args: { opacity: 50 },
        }],
      },
    });

    expect((first as any).guard_transport).toBe('embedded_mcp');
    expect((first as any).execution.phase).toBe('completed');
    expect((first as any).preview.sha256).toBe(after.sha256);
    expect((first as any).preview.document_id).toBe(42);
    expect((first as any).operation_receipt.protocol).toBe('photoshop.guard.operation_receipt.v1');
    expect(runtime.store.visualBarrier(42)?.sha256).toBe(after.sha256);

    const second = await runtime.cycle({
      previous_operation_id: 'guard-one',
      previous_observation: {
        observed: 'The guarded opacity mutation completed and produced the expected materialized preview.',
        target: 'resolved',
      },
    });

    expect((second as any).closed_previous.closed).toBe(true);
    expect(runtime.store.visualBarrier(42)).toBeUndefined();
    expect(runtime.store.read('guard-one')?.operation_ack?.receipt_token).toBe((first as any).operation_receipt.token);
    expect(runtime.store.read('guard-one')?.verdict?.target_resolved).toBe('yes');
  });

  it('persists a valid previous closure even when the same cycle has an invalid next operation', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-cycle-atomic-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycle({
      next_pass: {
        request_key: 'atomic-cycle-previous',
        document_id: 42,
        goal: 'Create a previous visual operation for full-cycle atomicity.',
        region: 'whole-canvas',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'atomic-opacity', tool: 'photoshop_set_layer_opacity', args: { opacity: 50 } }],
      },
    }) as any;
    expect(first.preview.sha256).toBe(after.sha256);

    const rejected = await runtime.cycle({
      previous_operation_id: 'atomic-cycle-previous',
      previous_observation: {
        observed: 'The previous visual mutation completed and the rendered frame is available for continuation.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'atomic-cycle-invalid-next',
        document_id: 42,
        goal: 'Submit an invalid continuation operation to prove full-cycle atomicity.',
        region: 'whole-canvas',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'invalid-opacity', tool: 'photoshop_set_layer_opacity', args: {} }],
      },
    }) as any;

    expect(rejected.preflight_rejection.next_operation_errors.join('\n')).toMatch(/args\.opacity is required/);
    expect(rejected.closed_previous).toMatchObject({ closed: true, operation_id: 'atomic-cycle-previous' });
    expect(runtime.store.read('atomic-cycle-previous')?.report).toBeDefined();
    expect(runtime.store.read('atomic-cycle-previous')?.operation_ack).toBeDefined();
    expect(runtime.store.read('atomic-cycle-previous')?.verdict?.target_resolved).toBe('yes');
    expect(runtime.store.visualBarrier(42)).toBeUndefined();
    expect(runtime.store.read('atomic-cycle-invalid-next')).toBeUndefined();

    const repeated = await runtime.cycle({
      previous_operation_id: 'atomic-cycle-previous',
      previous_observation: {
        observed: 'The previous visual mutation completed and the rendered frame is available for continuation.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'atomic-cycle-invalid-next-repeat',
        document_id: 42,
        goal: 'Repeat the invalid continuation without replaying the already-closed previous mutation.',
        region: 'whole-canvas',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'invalid-opacity-repeat', tool: 'photoshop_set_layer_opacity', args: {} }],
      },
    }) as any;
    expect(repeated.preflight_rejection.next_operation_errors.join('\n')).toMatch(/args\.opacity is required/);
    expect(repeated.closed_previous).toMatchObject({ closed: true, operation_id: 'atomic-cycle-previous' });
    expect(runtime.store.read('atomic-cycle-invalid-next-repeat')).toBeUndefined();
  });

  it('restores controller and project-local art-run state when post-closure rollback revalidation rejects next operation', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-post-closure-gate-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const projectRel = 'processes/post-closure-process/run-01';
    const projectStateFile = path.join(dir, 'processes', 'post-closure-process', 'run-01', 'painting-state.json');

    runtime.artRun({
      document_id: 42,
      process_dir: projectRel,
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });

    const first = await runtime.cycle({
      next_pass: {
        request_key: 'post-closure-gate-previous',
        document_id: 42,
        goal: 'Create a visual pass that will be classified for rollback.',
        region: 'whole-canvas',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'rollback-fixture-opacity', tool: 'photoshop_set_layer_opacity', args: { opacity: 45 } }],
      },
    }) as any;
    expect(first.preview.sha256).toBe(after.sha256);
    expect(existsSync(projectStateFile)).toBe(true);
    const controllerStateBefore = readFileSync(runtime.store.paintingStateFile(), 'utf8');
    const projectStateBefore = readFileSync(projectStateFile, 'utf8');
    expect(JSON.parse(controllerStateBefore).documents?.['42']?.pending_rollback).toBeUndefined();
    expect(JSON.parse(projectStateBefore).pending_rollback).toBeUndefined();

    const rejected = await runtime.cycle({
      previous_operation_id: 'post-closure-gate-previous',
      previous_observation: {
        observed: 'The visual change degraded the intended result and should be reverted.',
        target: 'unresolved',
        regression: 'The intended visual relationship became worse.',
        action: 'rollback',
        observations: [{ region: 'whole frame', visible: 'The rendered test relationship is visibly worse than in the before frame.' }],
      },
      next_pass: {
        request_key: 'post-closure-gate-next',
        document_id: 42,
        goal: 'Attempt another visual mutation after a rollback verdict.',
        region: 'whole-canvas',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'blocked-next-opacity', tool: 'photoshop_set_layer_opacity', args: { opacity: 60 } }],
      },
    }) as any;

    expect(rejected.preflight_rejection.errors.join('\n')).toMatch(/rollback_required/);
    expect(rejected.preflight_rejection.post_closure_semantic_revalidation).toBe(true);
    expect(rejected.closed_previous.closed).toBe(false);
    expect(runtime.store.read('post-closure-gate-previous')?.report).toBeUndefined();
    expect(runtime.store.read('post-closure-gate-previous')?.operation_ack).toBeUndefined();
    expect(runtime.store.read('post-closure-gate-previous')?.verdict).toBeUndefined();
    expect(runtime.store.paintingState().documents?.['42']?.pending_rollback).toBeUndefined();
    expect(readFileSync(runtime.store.paintingStateFile(), 'utf8')).toBe(controllerStateBefore);
    expect(readFileSync(projectStateFile, 'utf8')).toBe(projectStateBefore);
    expect(JSON.parse(readFileSync(projectStateFile, 'utf8')).pending_rollback).toBeUndefined();
    expect(runtime.store.visualBarrier(42)?.sha256).toBe(after.sha256);
    expect(runtime.store.read('post-closure-gate-next')).toBeUndefined();
  });

  it('compactly finalizes the last visual pass in one cycle_auto call and records latency components', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-finalize-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycleAuto({
      next_pass: {
        request_key: 'finalize-last-visual',
        document_id: 42,
        goal: 'Run the final bounded visual pass and verify compact close-only finalization.',
        region: 'whole-canvas',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'final-opacity', tool: 'photoshop_set_layer_opacity', args: { opacity: 55 } }],
      },
    }) as any;
    expect(first.preview.sha256).toBe(after.sha256);
    expect(first.cycle_latency.guard_preflight_ms).toEqual(expect.any(Number));
    expect(first.cycle_latency.photoshop_dispatch_wall_ms).toEqual(expect.any(Number));
    expect(first.cycle_latency.photoshop_reported_execution_ms).toBe(7);
    expect(first.cycle_latency.preview_capture_materialization_ms).toEqual(expect.any(Number));
    expect(first.cycle_latency.guard_cycle_total_ms).toEqual(expect.any(Number));
    const pendingStatus = runtime.status() as any;
    expect(pendingStatus.next_required_action).toMatch(/photoshop_guard_cycle_auto once/);
    expect(pendingStatus.next_required_action).toMatch(/previous_operation_id/);
    expect(pendingStatus.next_required_action).toMatch(/previous_observation/);

    const malformedFinalization = await runtime.cycleAuto({
      previous_operation_id: 'finalize-last-visual',
    }) as any;
    expect(malformedFinalization.finalization_rejection.errors.join('\n')).toMatch(/previous_observation is required/);
    expect(runtime.store.read('finalize-last-visual')?.report).toBeUndefined();
    expect(runtime.store.read('finalize-last-visual')?.operation_ack).toBeUndefined();
    expect(runtime.store.read('finalize-last-visual')?.verdict).toBeUndefined();
    expect(runtime.store.visualBarrier(42)?.sha256).toBe(after.sha256);

    const combinedRejection = await runtime.cycleAuto({
      previous_operation_id: 'finalize-last-visual',
      next_pass: compactPassFromOperation({
        id: 'finalize-invalid-next-too',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42 },
        summary: 'Combine invalid finalization and invalid continuation',
        purpose: 'Verify one compiler response covers both halves of the semantic cycle',
        problem_id: 'compact-finalization-combined',
        scale: 'global',
      }),
    }) as any;
    expect(combinedRejection.preflight_rejection.finalization_errors.join('\n')).toMatch(/previous_observation is required/);
    expect(combinedRejection.preflight_rejection.next_operation_errors.join('\n')).toMatch(/args\.opacity is required/);
    expect(runtime.store.read('finalize-last-visual')?.report).toBeUndefined();
    expect(runtime.store.read('finalize-invalid-next-too')).toBeUndefined();

    const finalizationActiveJobsSpy = vi.spyOn(runtime.store, 'activeJobs');
    const finalized = await runtime.cycleAuto({
      previous_operation_id: 'finalize-last-visual',
      previous_observation: compactObservationFromVerdict(critic()),
    }) as any;

    expect(finalized.mode).toBe('photoshop-mcp-cycle-finalization');
    expect(finalized.closed_previous).toMatchObject({
      closed: true,
      operation_id: 'finalize-last-visual',
      operation_acknowledged: true,
      verdict_recorded: true,
    });
    expect(runtime.store.visualBarrier(42)).toBeUndefined();
    expect(runtime.store.read('finalize-last-visual')?.report).toBeTruthy();
    expect(runtime.store.read('finalize-last-visual')?.operation_ack?.receipt_token).toBe(first.operation_receipt.token);
    expect(runtime.store.read('finalize-last-visual')?.verdict?.target_resolved).toBe('yes');
    expect(finalized.cycle_latency.visual_evaluation_verdict_gap_ms).toEqual(expect.any(Number));
    expect(finalized.cycle_latency.decision_model_gap_ms).toBeNull();
    expect(finalized.cycle_latency.report_ack_closure_ms).toEqual(expect.any(Number));
    expect(finalized.cycle_latency.semantic_cycle_wall_ms).toEqual(expect.any(Number));
    expect(finalized.finalization_latency).toMatchObject({
      protocol: 'photoshop.guard.finalization_latency.v1',
      guard_preflight_ms: expect.any(Number),
      active_job_snapshot_ms: expect.any(Number),
      closure_write_ms: expect.any(Number),
      status_projection_ms: expect.any(Number),
      response_construction_ms: expect.any(Number),
      finalization_total_ms: expect.any(Number),
    });
    expect(finalized.finalization_latency.finalization_total_ms)
      .toBeGreaterThanOrEqual(finalized.finalization_latency.status_projection_ms);
    expect(finalizationActiveJobsSpy).toHaveBeenCalledTimes(1);
    finalizationActiveJobsSpy.mockRestore();
    expect(runtime.store.read('finalize-invalid-next-too')).toBeUndefined();
    const closedStatus = runtime.status() as any;
    expect(closedStatus.pending_reports).not.toContain('finalize-last-visual');
    expect(closedStatus.pending_operation_acks).not.toContain('finalize-last-visual');
    expect(closedStatus.pending_visual_verdicts).not.toContain('finalize-last-visual');
    const status = runtime.status() as any;
    expect(status.latency_summary.operation_samples).toBe(1);
    expect(status.latency_summary.visual_operation_samples).toBe(1);
    expect(status.latency_summary.components.photoshop_reported_execution_ms).toMatchObject({
      samples: 1,
      median_ms: 7,
      p95_ms: 7,
    });
    expect(status.documents['42'].artistic_throughput).toMatchObject({
      protocol: 'photoshop.guard.artistic_throughput.v1',
      model_visible_guard_round_trips: 4,
      semantic_dispatch_round_trips: 1,
      bookkeeping_only_round_trips: 1,
      rejected_before_dispatch_round_trips: 2,
      semantic_artistic_actions_dispatched: 1,
      artistic_actions_per_model_visible_guard_round_trip: 0.25,
      diagnostic_only: true,
    });
  });

  it.each(['technical', 'artistic', 'mixed'] as const)('accepts the compact model path with one root goal in %s mode', async (commentaryMode) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-model-compact-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    registry.register('photoshop_list_documents', {
      tool: {
        name: 'photoshop_list_documents',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      handler: async () => ({
        content: [{ type: 'text', text: JSON.stringify({
          ok: true,
          details: { documents: [{ id: 42, width: 1200, height: 800 }] },
        }) }],
      }),
    });
    const microplan = createVisualMicroPlanTools(registry)[0]!;
    registry.register(microplan.tool.name, microplan);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/compact-model-process/run-01',
      commentary_mode: commentaryMode,
      painting_profile: 'simple_graphic',
    });
    const reportDelivery = commentaryMode === 'technical' ? 'technical_execution_record' : `${commentaryMode}_presentation_record`;
    const executeSpy = vi.spyOn(registry, 'execute');

    const request = {
      next_pass: {
        request_key: 'compact-model-pass-1',
        document_id: 42,
        goal: 'Add one bounded visible test mark without changing the document target',
        region: 'test-region',
        stage: 'FORM',
        scale: 'medium',
        actions: [{
          id: 'paint-mark',
          tool: 'photoshop_paint_dabs',
          args: { dabs: [{ x: 12, y: 18 }] },
        }],
      },
    };

    const first = await runtime.cycleAuto(request) as any;
    expect(first.preview.sha256).toBe(after.sha256);
    const stored = runtime.store.read('compact-model-pass-1')!;
    expect(stored.id).toBe('compact-model-pass-1');
    expect(stored.summary).toBe(request.next_pass.goal);
    expect(stored.purpose).toBe('Execute the requested bounded Photoshop pass.');
    expect(stored.problem_id).toBe('compact-model-pass-1');
    expect((stored as any).request_key).toBeUndefined();
    expect((stored as any).goal).toBeUndefined();
    const unobservedReport = runtime.store.compactClosureDefaults(stored.id).previous_report!;
    expect(unobservedReport.result).toContain('visual result is not yet assessed');
    expect(unobservedReport.result).not.toContain(request.next_pass.goal);
    expect(unobservedReport.did).not.toContain(request.next_pass.goal);
    const readSpy = vi.spyOn(runtime.store, 'read').mockReturnValue({ ...stored, phase: 'uncertain' });
    const uncertainReport = runtime.store.compactClosureDefaults(stored.id).previous_report!;
    expect(uncertainReport.did).toContain('unconfirmed');
    readSpy.mockRestore();

    const visualCallsAfterFirst = executeSpy.mock.calls.filter(call => call[0] === 'photoshop_execute_visual_microplan').length;
    const replay = await runtime.cycleAuto(request) as any;
    expect(replay.replayed_from_disk).toBe(true);
    expect(executeSpy.mock.calls.filter(call => call[0] === 'photoshop_execute_visual_microplan').length)
      .toBe(visualCallsAfterFirst);

    const conflicting = await runtime.cycleAuto({
      next_pass: {
        ...request.next_pass,
        goal: 'Use the same key for a different semantic request',
      },
    }) as any;
    expect(conflicting.preflight_rejection.errors.join('\n')).toMatch(/different request/);
    expect(executeSpy.mock.calls.filter(call => call[0] === 'photoshop_execute_visual_microplan').length)
      .toBe(visualCallsAfterFirst);

    const finalized = await runtime.cycleAuto({
      previous_operation_id: 'compact-model-pass-1',
      previous_observation: {
        observed: 'The bounded test mark is visible in the delivered frame.',
        target: 'resolved',
        observations: [{
          region: 'whole frame',
          visible: 'The bounded test mark is visible in the delivered frame.',
        }],
      },
    }) as any;

    expect(finalized.mode).toBe('photoshop-mcp-cycle-finalization');
    expect(finalized.closed_previous).toMatchObject({
      closed: true,
      operation_id: 'compact-model-pass-1',
      operation_acknowledged: true,
      verdict_recorded: true,
      report_delivery: reportDelivery,
    });
    const closed = runtime.store.read('compact-model-pass-1')!;
    expect(closed.report).toMatchObject({
      source: 'guard_compact_closure',
      delivery: reportDelivery,
      result: 'The bounded test mark is visible in the delivered frame.',
    });
    expect(closed.operation_ack?.receipt_token).toBe(first.operation_receipt.token);
    expect(closed.verdict?.observations).toEqual([{
      region: 'whole frame',
      visible: 'The bounded test mark is visible in the delivered frame.',
    }]);
    expect(closed.verdict?.global_readability).toBe('unknown');
    expect(closed.verdict?.primitive_footprint).toBe('unknown');
  });

  it('executes next_pass through the existing compiler and VisualMicroPlan runtime with one root goal', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-next-pass-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    let listDocumentsCalls = 0;
    registry.register('photoshop_list_documents', {
      tool: {
        name: 'photoshop_list_documents',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      handler: async () => {
        listDocumentsCalls += 1;
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            details: { documents: [{ id: 42, width: 1200, height: 800 }] },
          }) }],
        };
      },
    });
    const microplan = createVisualMicroPlanTools(registry)[0]!;
    registry.register(microplan.tool.name, microplan);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/compact-pass-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });

    const result = await runtime.cycleAuto({
      next_pass: {
        request_key: 'compact-next-pass-1',
        document_id: 42,
        goal: 'Build one broader midtone form while preserving the rest of the canvas',
        region: 'middle-form',
        stage: 'FORM',
        scale: 'medium',
        actions: [{
          id: 'paint-form',
          tool: 'photoshop_paint_dabs',
          description: 'Lay in the broad form mass',
          args: { dabs: [{ x: 300, y: 400 }] },
        }],
      },
    }) as any;

    expect(result.execution).toMatchObject({
      operation_id: 'compact-next-pass-1',
      tool: 'photoshop_execute_visual_microplan',
      phase: 'completed',
      failed: false,
    });
    expect(result.preview.sha256).toBe(after.sha256);
    const stored = runtime.store.read('compact-next-pass-1')!;
    expect(stored.summary).toBe('Build one broader midtone form while preserving the rest of the canvas');
    expect(stored.problem_id).toBe('compact-next-pass-1');
    expect(stored.args).toMatchObject({
      plan_id: 'compact-next-pass-1',
      intent: 'Build one broader midtone form while preserving the rest of the canvas',
      summary: 'Build one broader midtone form while preserving the rest of the canvas',
      document_id: 42,
      region: 'middle-form',
      stage: 'FORM',
      scale: 'medium',
      method_class: 'paint',
      risk: 'low',
      action_class: 'ADD',
    });
    expect(stored.args.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'paint-form',
        description: 'Lay in the broad form mass',
      }),
      expect.objectContaining({ tool: 'photoshop_get_preview' }),
    ]));
    expect((stored as any).next_pass).toBeUndefined();
    expect(listDocumentsCalls).toBe(1);

    listDocumentsCalls = 0;
    const continued = await runtime.cycleAuto({
      previous_operation_id: 'compact-next-pass-1',
      previous_observation: {
        observed: 'The broader midtone form is visibly established in the requested region.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'compact-next-pass-2',
        document_id: 42,
        goal: 'Refine the same middle form with one additional bounded paint pass',
        region: 'middle-form',
        stage: 'FORM',
        scale: 'medium',
        actions: [{
          id: 'refine-form',
          tool: 'photoshop_paint_dabs',
          args: { dabs: [{ x: 320, y: 410 }] },
        }],
      },
    }) as any;
    expect(continued.execution.operation_id).toBe('compact-next-pass-2');
    expect(listDocumentsCalls).toBe(1);
  });

  it('rejects compact semantic method drift before Photoshop dispatch', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-method-drift-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let paintDispatches = 0;
    registry.register('photoshop_paint_regions', {
      tool: {
        name: 'photoshop_paint_regions',
        inputSchema: { type: 'object', properties: { regions: { type: 'array' } }, required: ['regions'] },
      },
      handler: async () => {
        paintDispatches += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
      },
    });
    registry.register('photoshop_paint_dabs', {
      tool: {
        name: 'photoshop_paint_dabs',
        inputSchema: { type: 'object', properties: { dabs: { type: 'array' } }, required: ['dabs'] },
      },
      handler: async () => {
        paintDispatches += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
      },
    });
    const microplan = createVisualMicroPlanTools(registry)[0]!;
    registry.register(microplan.tool.name, microplan);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/method-drift-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });

    const rejected = await runtime.cycleAuto({
      next_pass: {
        request_key: 'method-drift-pass',
        document_id: 42,
        goal: 'Lay in one closed structural mass.',
        visual_intent: 'mass',
        impact_class: 'construct',
        preferred_method_id: 'region-block-in',
        actions: [{ id: 'wrong-tool', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 10, y: 10 }] } }],
      },
    }) as any;

    expect(rejected.preflight_rejection?.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'artistic_method_execution_mismatch' }),
    ]));
    expect(paintDispatches).toBe(0);
    expect(runtime.store.read('method-drift-pass')).toBeUndefined();
  });

  it('executes a direct compact artistic method without leaking artistic_operation into the public Guard request', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-direct-artistic-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let blurDispatches = 0;
    registry.register('photoshop_apply_gaussian_blur', {
      tool: {
        name: 'photoshop_apply_gaussian_blur',
        description: 'test direct visual mutation',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number' },
            radius: { type: 'number' },
          },
          required: ['radius'],
        },
      },
      handler: async () => {
        blurDispatches += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'blur applied' }) }] };
      },
    });
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/direct-artistic-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });

    vi.spyOn(runtime.store, 'sceneCameraImagingModel').mockReturnValue({
      model_id: 'direct-camera', revision: 1, source_frame: { document_id: 42, document_incarnation: 'fixture:42' },
      geometry_model_id: 'direct-geometry', geometry_model_revision: 1,
      camera: { framing: 'fixture frame', view_character: 'normal', lens_character: 'normal' },
      focus: { focal_depth_or_plane: 'road', depth_of_field_behavior: 'deep focus', foreground_softness: 'none', background_softness: 'slight' },
      motion: { camera_motion: 'locked', subject_motion: 'none', shutter_character: 'still' },
      optical_response: { base_softness: 'none', bloom: 'none', halation: 'none' },
      capture_finish: { grain: 'none', vignette: 'none', film_or_sensor_character: 'neutral' }, intentional_exceptions: [],
    });
    const result = await runtime.cycleAuto({
      next_pass: {
        request_key: 'direct-artistic-gaussian',
        problem_id: 'direct-artistic-gaussian-problem',
        document_id: 42,
        goal: 'Soften the raster target with one Gaussian blur pass.',
        stage: 'DETAIL',
        scale: 'global',
        visual_intent: 'smooth',
        impact_class: 'transition',
        preferred_method_id: 'gaussian-blur',
        imaging_preflight: { scene_camera_model_id: 'direct-camera', scene_camera_revision: 1,
          effect_kind: 'global-softness', motivation: 'Bounded optical softness preserving target edges', scope: 'global',
          revalidate_edge_detail: true, owner_expectations: [{ owner_id: 'road', depth_role: 'near', expected_focus_role: 'sharp' }] },
        actions: [{
          id: 'blur',
          tool: 'photoshop_apply_gaussian_blur',
          args: { radius: 12, layer_id: 7, document_id: 42 },
        }],
      },
    }) as any;

    expect(result.preflight_rejection).toBeUndefined();
    expect(result.execution).toMatchObject({ phase: 'completed', failed: false });
    expect(blurDispatches).toBe(1);
    expect(runtime.store.read('direct-artistic-gaussian')?.artistic_operation).toBeUndefined();
  });

  it('continues a multi-region block-in after a locally resolved background pass without completing the planner task', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-multi-region-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let visualDispatches = 0;
    let fillDispatches = 0;
    let regionDispatches = 0;

    registry.register('photoshop_list_documents', {
      tool: {
        name: 'photoshop_list_documents',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      handler: async () => ({
        content: [{ type: 'text', text: JSON.stringify({
          ok: true,
          details: { documents: [{ id: 42, width: 1200, height: 800 }] },
        }) }],
      }),
    });
    registry.register('photoshop_fill_layer', {
      tool: {
        name: 'photoshop_fill_layer',
        inputSchema: {
          type: 'object',
          properties: {
            red: { type: 'number' },
            green: { type: 'number' },
            blue: { type: 'number' },
          },
          required: ['red', 'green', 'blue'],
          additionalProperties: false,
        },
      },
      handler: async () => {
        fillDispatches += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'night foundation filled' }) }] };
      },
    });
    registry.register('photoshop_paint_regions', {
      tool: {
        name: 'photoshop_paint_regions',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, regions: { type: 'array' } },
          required: ['regions'],
          additionalProperties: false,
        },
      },
      handler: async () => {
        regionDispatches += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'scene masses painted' }) }] };
      },
    });
    const microplan = createVisualMicroPlanTools(registry)[0]!;
    const originalMicroplanHandler = microplan.handler;
    registry.register(microplan.tool.name, {
      ...microplan,
      handler: async (args) => {
        visualDispatches += 1;
        return originalMicroplanHandler(args);
      },
    });

    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/multi-region-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    runtime.store.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        directive_id: 'multi-region-directive',
        status: 'active',
        current_task_id: 'blockin-01',
        tasks: [{
          task_id: 'blockin-01',
          summary: 'Build a recognizable multi-region composition.',
          status: 'active',
          region: 'whole-canvas',
          allowed_scales: ['medium'],
          allowed_global_changes: [],
        }],
        review_after_microplans: 8,
        completed_microplans: 0,
        review_due: false,
        review_reason: null,
        forbidden_without_review: [],
      },
    }));

    const finishAutoCycle = async (started: any) => {
      if (!started?.job_id) return started;
      let polled: any = {};
      for (let i = 0; i < 100; i++) {
        polled = runtime.pollJob(String(started.job_id));
        if (polled.state === 'completed' || polled.state === 'failed' || polled.state === 'uncertain') break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(polled.state).toBe('completed');
      return polled.result;
    };

    const passA = await finishAutoCycle(await runtime.cycleAuto({
      next_pass: {
        request_key: 'multi-region-background-01',
        document_id: 42,
        goal: 'Replace the white canvas with a uniform dark-blue night foundation.',
        region: 'whole-canvas',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'medium',
        actions: [{
          id: 'night-fill',
          tool: 'photoshop_fill_layer',
          args: { red: 18, green: 27, blue: 48 },
        }],
      },
    }) as any);

    expect(passA.execution.operation_id).toBe('multi-region-background-01');
    expect(runtime.store.paintingState().documents['42'].art_director.tasks[0].status).toBe('active');

    const regions = Array.from({ length: 14 }, (_, index) => {
      const left = 20 + (index % 7) * 150;
      const top = 60 + Math.floor(index / 7) * 280;
      return {
        id: `mass-${index + 1}`,
        color: { red: 35 + index, green: 42 + index, blue: 58 + index },
        opacity: 100,
        contours: [{
          operation: 'ADD',
          points: [
            { x: left, y: top },
            { x: left + 100, y: top },
            { x: left + 100, y: top + 180 },
            { x: left, y: top + 180 },
          ],
        }],
      };
    });
    const passB = await finishAutoCycle(await runtime.cycleAuto({
      previous_operation_id: 'multi-region-background-01',
      previous_observation: {
        observed: 'The white canvas is replaced by a uniform dark-blue night foundation.',
        target: 'resolved',
      },
      next_pass: {
        request_key: 'multi-region-masses-01',
        document_id: 42,
        goal: 'Establish the recognizable composition with primary structures, support region, focal accent, secondary support and reflected-value relation.',
        region: 'whole-canvas',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'medium',
        actions: [{
          id: 'scene-masses',
          tool: 'photoshop_paint_regions',
          args: { regions },
        }],
      },
    }) as any);

    expect(passB.closed_previous).toMatchObject({
      closed: true,
      operation_id: 'multi-region-background-01',
      operation_acknowledged: true,
      verdict_recorded: true,
      report_delivery: 'technical_execution_record',
    });
    expect(passB.execution).toMatchObject({
      operation_id: 'multi-region-masses-01',
      tool: 'photoshop_execute_visual_microplan',
      phase: 'completed',
      failed: false,
    });
    expect(passB.preview).toBeTruthy();
    expect(runtime.store.read('multi-region-background-01')?.verdict?.goal_assessment).toMatchObject({
      scope: 'operation_goal',
      status: 'confirmed_by_visual_verdict',
    });
    expect(runtime.store.read('multi-region-background-01')?.verdict?.planner_task_assessment).toBeUndefined();
    expect(runtime.store.paintingState().documents['42'].art_director.tasks[0].status).toBe('active');
    expect(runtime.store.paintingState().documents['42'].art_director.current_task_id).toBe('blockin-01');
    expect(visualDispatches).toBe(2);
    expect(fillDispatches).toBe(1);
    expect(regionDispatches).toBe(1);
    expect(runtime.store.records().filter(record => record.id.startsWith('multi-region-'))).toHaveLength(2);
  });

  it('keeps close-only workflow active after a locally resolved pass when Art Director work remains unfinished', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-unfinished-directive-close-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const started = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'resolved-local-with-unfinished-directive',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 55 },
        summary: 'Resolve one bounded local operation while a larger directive remains active',
        purpose: 'Verify close-only lifecycle does not stop unfinished artistic work',
        problem_id: 'bounded-local-fix',
        scale: 'global',
      }),
    }) as any;
    expect(started.preview).toBeTruthy();
    runtime.store.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        directive_id: 'unfinished-directive',
        revision: 1,
        status: 'active',
        current_task_id: 'remaining-task',
        review_due: false,
        review_reason: null,
        tasks: [{
          task_id: 'remaining-task',
          summary: 'Continue the remaining scene construction after this local pass.',
          status: 'active',
          allowed_scales: ['global'],
        }],
      },
    }));

    const reviewTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_review_image')!;
    await reviewTool.handler({ operation_id: 'resolved-local-with-unfinished-directive' });
    const finalized = await runtime.cycleAuto({
      previous_operation_id: 'resolved-local-with-unfinished-directive',
      previous_observation: {
        observed: 'The bounded opacity target is visibly resolved in the whole frame.',
        target: 'resolved',
      },
    }) as any;
    expect(finalized.closed_previous).toMatchObject({
      closed: true,
      operation_id: 'resolved-local-with-unfinished-directive',
    });
    expect(runtime.store.paintingState().documents['42'].art_director.tasks[0].status).toBe('active');
    expect(runtime.store.paintingState().documents['42'].workflow_lifecycle).toMatchObject({
      status: 'active',
      reason: 'close_only_artistic_debt_remains',
      operation_id: 'resolved-local-with-unfinished-directive',
    });
    expect(finalized.next_state).toBe('continue_required');
    expect(finalized.next_required_action).toBe(
      'Painter: execute bounded task remaining-task under directive unfinished-directive'
    );
  });

  it('derives a preflighted brush role and inserts preset selection for compact paint passes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-auto-brush-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const selected: string[] = [];
    registry.register('photoshop_list_documents', {
      tool: { name: 'photoshop_list_documents', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
      handler: async () => ({ content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        details: { documents: [{ id: 42, width: 1200, height: 800 }] },
      }) }] }),
    });
    registry.register('photoshop_select_brush_preset', {
      tool: {
        name: 'photoshop_select_brush_preset',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, name: { type: 'string' } },
          required: ['name'],
        },
      },
      handler: async (args) => {
        selected.push(String(args.name));
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, preset: args.name }) }] };
      },
    });
    registry.register('photoshop_list_brush_presets', {
      tool: { name: 'photoshop_list_brush_presets', inputSchema: { type: 'object', properties: {} } },
      handler: async () => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, presets: ['Round Form Brush'] }) }] }),
    });
    registry.register('photoshop_paint_strokes', {
      tool: {
        name: 'photoshop_paint_strokes',
        inputSchema: { type: 'object', properties: { document_id: { type: 'number' }, strokes: { type: 'array' } } },
      },
      handler: async () => ({ content: [{ type: 'text', text: JSON.stringify({ ok: true, strokes: 1 }) }] }),
    });
    registry.register(createVisualMicroPlanTools(registry)[0]!.tool.name, createVisualMicroPlanTools(registry)[0]!);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/auto-brush-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'nontrivial_painting',
      brush_preflight: {
        completed: true,
        inventory_observed: true,
        inventory_total: 10,
        roles: [{
          role_id: 'medium-form',
          purpose: 'Broad form modelling',
          material_roles: ['generic-form'],
          visual_intents: ['directional-mass'],
          preferred_preset: 'Round Form Brush',
          alternative_presets: [],
          effective_settings: {
            size: 120, hardness: 60, roundness: 100, opacity: 80, flow: 60, spacing: 10,
            use_pressure_size: false, use_pressure_opacity: false, airbrush: false,
            smoothing_enabled: true, smoothing: 10,
          },
          working_scale: 'medium',
          pressure_policy: 'none',
          probe_status: 'pass',
        }],
      },
    });

    const result = await runtime.cycleAuto({
      next_pass: {
        request_key: 'auto-brush-pass',
        document_id: 42,
        goal: 'Model one medium-scale form without asking the model to name a Photoshop preset',
        region: 'form',
        stage: 'GLOBAL_BLOCK_IN',
        scale: 'medium',
        material_role: 'generic-form',
        visual_intent: 'directional-mass',
        impact_class: 'construct',
        actions: [{
          id: 'paint',
          tool: 'photoshop_paint_strokes',
          args: {
            strokes: [{
              tool: 'BRUSH',
              points: [{ x: 180, y: 200 }, { x: 220, y: 200 }],
            }],
          },
        }],
      },
    }) as any;

    expect(result.execution.operation_id).toBe('auto-brush-pass');
    expect(result.preflight_rejection).toBeUndefined();
    const stored = runtime.store.read('auto-brush-pass')!;
    expect(stored.args.steps[0]).toMatchObject({
      tool: 'photoshop_select_brush_preset',
      args: { name: 'Round Form Brush' },
    });
    expect(selected).toEqual(['Round Form Brush']);
    expect(stored.args.paint_strategy).toMatchObject({
      brush_role: 'medium-form',
      preset_name: 'Round Form Brush',
      pressure_policy: 'none',
    });
  });

  it('reproduces the 13a.1B setter recovery -> profile upgrade -> one paint -> compact close-only sequence', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-13a1b-sequence-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let setterDeliveries = 0;
    let visualMutations = 0;

    registry.register('photoshop_set_brush', {
      tool: {
        name: 'photoshop_set_brush',
        description: 'synthetic recovered nonvisual brush setter contract',
        inputSchema: {
          type: 'object',
          properties: { hardness: { type: 'number' }, opacity: { type: 'number' } },
          additionalProperties: false,
        },
      },
      handler: async () => {
        setterDeliveries += 1;
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: true,
            summary: 'Brush settings completed but effective readback does not match every requested field',
            details: {
              setter_outcome: 'not-applied',
              requested_settings: { hardness: 70, opacity: 82 },
              effective_settings: { hardness: 100, opacity: 82 },
              mismatches: [{ key: 'hardness', expected: 70, actual: 100 }],
              stable_command_id: '13a1b-recovered-setter',
              setter_recovery: {
                protocol: 'photoshop.uxp.setter_recovery.v1',
                mode: 'authoritative-readback',
                command_id: '13a1b-recovered-setter',
                receipt_state: 'claimed',
                original_error: 'uxp_bridge_claimed_timeout',
              },
            },
          }) }],
        };
      },
    });
    registry.register('photoshop_paint_regions', {
      tool: {
        name: 'photoshop_paint_regions',
        description: 'single visual receiverSurface-pass fixture',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, regions: { type: 'array' } },
          required: ['regions'],
          additionalProperties: false,
        },
      },
      handler: async () => {
        visualMutations += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'receiverSurface region painted' }) }] };
      },
    });
    registry.register('photoshop_list_documents', {
      tool: { name: 'photoshop_list_documents', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
      handler: async () => ({ content: [{ type: 'text', text: JSON.stringify({
        ok: true,
        details: { documents: [{ id: 42, width: 1200, height: 800 }] },
      }) }] }),
    });
    registry.register(createVisualMicroPlanTools(registry)[0]!.tool.name, createVisualMicroPlanTools(registry)[0]!);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/13a1b-sequence-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const reconcileSpy = vi.spyOn(runtime, 'reconcile');

    const setterResult = await withToolExecutionContext(
      { guardOperationId: '13a1b-recovered-setter' },
      () => registry.execute('photoshop_set_brush', { hardness: 70, opacity: 82 })
    );
    const setterPayload = JSON.parse((setterResult.content[0] as { text: string }).text);
    expect(setterPayload.details).toMatchObject({
      setter_outcome: 'not-applied',
      requested_settings: { hardness: 70, opacity: 82 },
      effective_settings: { hardness: 100, opacity: 82 },
      stable_command_id: '13a1b-recovered-setter',
      setter_recovery: {
        protocol: 'photoshop.uxp.setter_recovery.v1',
        mode: 'authoritative-readback',
        command_id: '13a1b-recovered-setter',
        receipt_state: 'claimed',
      },
    });
    expect(setterDeliveries).toBe(1);
    expect(reconcileSpy).not.toHaveBeenCalled();
    expect(runtime.store.records()).toHaveLength(0);

    const brushPreflight = {
      completed: true,
      inventory_observed: true,
      inventory_total: 8,
      roles: [{
        role_id: 'receiverSurface-form',
        purpose: 'Broad receiverSurface structure',
        material_roles: ['receiverSurface'],
        visual_intents: ['painted-mass'],
        preferred_preset: 'Compatible ReceiverSurface Brush',
        alternative_presets: [],
        effective_settings: {
          size: 120, hardness: 100, roundness: 100, opacity: 82, flow: 60, spacing: 10,
          use_pressure_size: false, use_pressure_opacity: false, airbrush: false,
          smoothing_enabled: true, smoothing: 10,
        },
        working_scale: 'medium',
        pressure_policy: 'none',
        probe_status: 'pass',
      }],
    };
    const upgraded = runtime.artRun({
      document_id: 42,
      process_dir: 'processes/13a1b-sequence-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'nontrivial_painting',
      profile_transition_reason: 'The receiverSurface pass now requires the stronger nontrivial painting obligations.',
      brush_preflight: brushPreflight,
    }) as any;
    expect(upgraded.art_run).toMatchObject({
      document_id: 42,
      painting_profile: 'nontrivial_painting',
      profile_transition: {
        from: 'simple_graphic',
        to: 'nontrivial_painting',
      },
    });
    expect(upgraded.art_run.process_dir).toBe('processes/13a1b-sequence-process/run-01');

    const painted = await runtime.cycleAuto({
      next_pass: {
        request_key: '13a1b-receiverSurface-pass',
        document_id: 42,
        goal: 'Add the one bounded receiverSurface mutation after recovering the nonvisual setter outcome.',
        region: 'receiverSurface',
        stage: 'SHAPE',
        scale: 'medium',
        scene_geometry_model: {
          model_id: '13a1b-scene-geometry',
          revision: 1,
          applicability: 'coherent_3d',
          source_frame: {
            document_id: 42,
            document_incarnation: 'embedded-guard-fixture:42',
            width: 1200,
            height: 800,
          },
          projection: { kind: 'custom', vanishing_points: [] },
        },
        construction_role: 'structured-mass',
        material_role: 'bounded receiverSurface structural mass',
        visual_intent: 'mass',
        impact_class: 'construct',
        actions: [{
          id: 'receiverSurface-region',
          tool: 'photoshop_paint_regions',
          args: {
            regions: [{
              id: 'receiverSurface-band',
              color: { red: 30, green: 70, blue: 120 },
              contours: [{
                points: [{ x: 80, y: 300 }, { x: 1120, y: 300 }, { x: 1120, y: 520 }, { x: 80, y: 520 }],
              }],
            }],
          },
        }],
      },
    }) as any;
    expect(painted.execution?.operation_id).toBe('13a1b-receiverSurface-pass');
    expect(painted.execution?.phase).toBe('completed');
    expect(painted.execution?.failed, JSON.stringify(painted, null, 2)).toBe(false);
    expect(visualMutations).toBe(1);
    expect(setterDeliveries).toBe(1);
    expect(reconcileSpy).not.toHaveBeenCalled();

    const finalized = await runtime.cycleAuto({
      previous_operation_id: '13a1b-receiverSurface-pass',
      previous_observation: {
        observed: 'The bounded receiverSurface region is visible in the delivered frame.',
        target: 'resolved',
        observations: [
          { region: 'whole frame', visible: 'The bounded receiverSurface region integrates into the delivered frame without a new global regression.' },
          { region: 'receiverSurface', visible: 'The bounded receiverSurface region is visible in the delivered frame.' },
        ],
      },
    }) as any;
    expect(finalized.mode).toBe('photoshop-mcp-cycle-finalization');
    expect(finalized.closed_previous).toMatchObject({
      closed: true,
      operation_id: '13a1b-receiverSurface-pass',
      operation_acknowledged: true,
      verdict_recorded: true,
    });
    expect(runtime.store.records().filter(record => record.tool === 'photoshop_execute_visual_microplan')).toHaveLength(1);
    expect(visualMutations).toBe(1);
    expect(setterDeliveries).toBe(1);
    expect(reconcileSpy).not.toHaveBeenCalled();
  });

  it('prevalidates compact observation before technical report or receipt acknowledgement writes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-model-compact-invalid-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        request_key: 'compact-invalid-close',
        goal: 'Create one visible test change for compact close validation',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 51 },
        scale: 'global',
      }),
    }) as any;
    expect(first.preview.sha256).toBe(after.sha256);

    const rejected = await runtime.cycleAuto({
      previous_operation_id: 'compact-invalid-close',
      previous_observation: {
        verdict: 'improvement',
        disposition: 'accept',
        observed_change: 'tiny',
        target_resolved: 'yes',
        regressions: [],
        uncertainty: 'none observed',
      },
    }) as any;

    expect(rejected.finalization_rejection.errors.join('\n')).toMatch(/observed_change/);
    const unchanged = runtime.store.read('compact-invalid-close')!;
    expect(unchanged.report).toBeUndefined();
    expect(unchanged.operation_ack).toBeUndefined();
    expect(unchanged.verdict).toBeUndefined();
    expect(runtime.store.visualBarrier(42)?.sha256).toBe(after.sha256);
  });

  it('returns actionable review delivery recovery on compiler rejection without dispatch or premature closure', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-review-debt-recovery-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const mutation = vi.spyOn(registry.get('photoshop_set_layer_opacity')!, 'handler');
    const runtime = runtimeFor(registry, dir);
    const operationId = 'review-debt-prior';
    const separateEvaluation = vi.spyOn(runtime, 'evaluateArtisticOperation');
    const oldEvaluationOverride = vi.spyOn(runtime.store, 'applyArtisticEvaluation');
    await runtime.cycleAuto({ next_pass: compactPassFromOperation({
      id: operationId,
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 51 },
      goal: 'Create a visible fixture for exact review delivery recovery',
      scale: 'global',
    }) });
    runtime.store.recordVisualDeliveryReceipt(operationId, {
      expected_roles: ['after'], delivered: [], undelivered_roles: ['after'], delivery_complete: false,
    });
    // Persisted failures from the retired local reviewer must not override a new pixel observation.
    runtime.store.write({ ...runtime.store.read(operationId), artistic_evaluation_required: true,
      artistic_evaluation: { status: 'unavailable', reason: 'old evaluator timeout' } });
    const guardTools = createGuardTools(runtime);
    const cycleTool = guardTools.find(def => def.tool.name === 'photoshop_guard_cycle_auto')!;
    const nextPass = compactPassFromOperation({
      id: 'review-debt-next',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 62 },
      goal: 'Continue only after the prior exact frame has been delivered and assessed',
      scale: 'global',
    });
    const closure = {
      previous_operation_id: operationId,
      previous_observation: compactObservationFromVerdict(critic()),
    };
    for (const next_pass of [undefined, nextPass, { ...nextPass, goal: '' }]) {
      const result = await cycleTool.handler({ ...closure, ...(next_pass ? { next_pass } : {}) });
      const body = JSON.parse((result.content[0] as any).text);
      expect(body.delivery_recovery).toMatchObject({
        action: 'call_photoshop_guard_review_image',
        review_tool: 'photoshop_guard_review_image',
        review_operation_id: operationId,
        review_arguments: { operation_id: operationId },
        read_only: true, mutation_replayed: false, next_mutation_dispatched: false,
        bound_whole_sha256: after.sha256, undelivered_roles: ['after'],
      });
      expect(body.next_required_action).toContain('photoshop_guard_review_image');
      expect(body.next_required_action).toContain(operationId);
      expect(body.finalization_rejection.errors.join('\n')).toMatch(/image delivery debt/);
      if (next_pass?.goal === '') expect(body.preflight_rejection.errors.join('\n')).toMatch(/goal/);
      expect(result.content.filter(item => item.type === 'image')).toHaveLength(0);
      expect(mutation).toHaveBeenCalledTimes(1);
      const pending = runtime.store.read(operationId)!;
      expect(pending.report).toBeUndefined();
      expect(pending.operation_ack).toBeUndefined();
      expect(pending.verdict).toBeUndefined();
      expect(runtime.store.read('review-debt-next')).toBeUndefined();
    }
    const reviewTool = guardTools.find(def => def.tool.name === 'photoshop_guard_review_image')!;
    const review = await reviewTool.handler({ operation_id: operationId });
    expect(review.isError).not.toBe(true);
    expect(review.content.filter(item => item.type === 'image')).toHaveLength(2);
    expect(JSON.parse((review.content[0] as any).text).delivery.delivered)
      .toContainEqual(expect.objectContaining({ role: 'after', sha256: after.sha256 }));
    expect(runtime.store.visualDeliveryDebt(runtime.store.read(operationId))).toBeNull();
    expect(runtime.store.read(operationId)?.verdict).toBeUndefined();
    const continuedResult = await cycleTool.handler({ ...closure, next_pass: nextPass });
    const continued = JSON.parse((continuedResult.content[0] as any).text);
    expect(continued.closed_previous.closed).toBe(true);
    expect(continued.execution).toMatchObject({ operation_id: 'review-debt-next', phase: 'completed', failed: false });
    expect(mutation).toHaveBeenCalledTimes(2);
    expect(continued.artistic_review).toMatchObject({ mode: 'same_chat', status: 'awaiting_host_observation' });
    expect(continuedResult.content.some(item => item.type === 'image')).toBe(true);
    expect(runtime.store.read(operationId)?.verdict.target_resolved).toBe('yes');
    expect(separateEvaluation).not.toHaveBeenCalled();
    expect(oldEvaluationOverride).not.toHaveBeenCalled();
  });

  it('fully prevalidates a close-only visual verdict before writing report or acknowledgement', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-close-only-prevalidate-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'close-only-prevalidate',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 54 },
        summary: 'Create a visual pass whose comparison provenance is removed for validation coverage',
        purpose: 'Verify close-only finalization validates the complete verdict before any closure write',
        problem_id: 'close-only-prevalidate-problem',
        scale: 'global',
      }),
    }) as any;
    const record = runtime.store.read('close-only-prevalidate')!;
    delete record.before_preview;
    delete record.baseline_preview;
    delete record.baseline_preview_source_operation_id;
    runtime.store.write(record);

    const rejected = await runtime.cycleAuto({
      previous_operation_id: 'close-only-prevalidate',
      previous_observation: compactObservationFromVerdict(critic()),
    }) as any;

    expect(rejected.finalization_rejection.errors.join('\n')).toMatch(/visual_comparison_gate/);
    const unchanged = runtime.store.read('close-only-prevalidate')!;
    expect(unchanged.report).toBeUndefined();
    expect(unchanged.operation_ack).toBeUndefined();
    expect(unchanged.verdict).toBeUndefined();
    expect(runtime.store.visualBarrier(42)?.sha256).toBe(after.sha256);
  });

  it('rolls back close-only report and acknowledgement if a late closure write fails after prevalidation', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-close-only-rollback-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'close-only-late-failure',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 56 },
        summary: 'Create a valid close-only visual pass for transactional rollback coverage',
        purpose: 'Verify the closure snapshot also protects finalization without a next operation',
        problem_id: 'close-only-late-failure-problem',
        scale: 'global',
      }),
    }) as any;

    const originalVerdict = runtime.store.verdict.bind(runtime.store);
    runtime.store.verdict = ((input: any) => {
      runtime.store.verdict = originalVerdict as any;
      throw new Error('synthetic_late_verdict_write_failure');
    }) as any;

    await expect(runtime.cycleAuto({
      previous_operation_id: 'close-only-late-failure',
      previous_observation: compactObservationFromVerdict(critic()),
    })).rejects.toThrow(/synthetic_late_verdict_write_failure/);

    const restored = runtime.store.read('close-only-late-failure')!;
    expect(restored.report).toBeUndefined();
    expect(restored.operation_ack).toBeUndefined();
    expect(restored.verdict).toBeUndefined();
    expect(runtime.store.visualBarrier(42)?.sha256).toBe(after.sha256);
    expect(runtime.store.paintingState().documents['42'].workflow_lifecycle.status).toBe('active');
  });

  it('keeps an active painting workflow active when a close-only read is finalized', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-read-close-only-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    runtime.store.updatePaintingState(42, current => ({
      ...current,
      document_id: 42,
      workflow_lifecycle: {
        status: 'active',
        reason: 'operation_dispatched',
        operation_id: 'prior-paint-pass',
        at: new Date().toISOString(),
      },
    }));

    const read = await runtime.cycleAuto({
      next_pass: {
        request_key: 'mid-run-state-read',
        document_id: 42,
        goal: 'Read current state without ending the active painting workflow',
        actions: [{
          id: 'state-read',
          tool: 'photoshop_get_state',
          args: { document_id: 42 },
        }],
      },
    }) as any;
    expect(read.execution).toMatchObject({
      operation_id: 'mid-run-state-read',
      tool: 'photoshop_get_state',
      phase: 'completed',
      failed: false,
    });

    const closed = await runtime.cycleAuto({
      previous_operation_id: 'mid-run-state-read',

    }) as any;

    expect(closed.closed_previous.closed).toBe(true);
    expect(runtime.store.paintingState().documents['42'].workflow_lifecycle).toMatchObject({
      status: 'active',
      reason: 'operation_dispatched',
      operation_id: 'prior-paint-pass',
    });
  });

  it('returns missing compact metadata and all supplied nested action errors in one rejection', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-envelope-errors-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const result = await runtime.cycleAuto({ next_pass: {
      document_id: 42,
      actions: [
        { id: 'bad-opacity', tool: 'photoshop_set_layer_opacity', args: { opacity: 'wrong' } },
        { id: 'bad-dabs', tool: 'photoshop_paint_dabs', args: { dabs: 'wrong' } },
      ],
    } }) as any;
    const errors = result.preflight_rejection.violations.map((row: any) => row.message).join('\n');
    expect(errors).toMatch(/request_key/);
    expect(errors).toMatch(/goal/);
    expect(errors).toMatch(/opacity.*number/);
    expect(errors).toMatch(/dabs.*array/);
    const intentResult = await runtime.cycleAuto({ painting_intent: {
      request_key: '', problem_id: 'shape', document_id: 42, goal: '', action: 'wrong',
      visual_intent: 'wrong', scale: 'wrong', actions: [
        { id: 'bad-opacity', tool: 'photoshop_set_layer_opacity', args: { opacity: 'wrong' } },
        { id: 'bad-dabs', tool: 'photoshop_paint_dabs', args: { dabs: 'wrong' } },
      ],
    } }) as any;
    const intentErrors = intentResult.preflight_rejection.errors.join('\n');
    for (const field of ['request_key', 'goal', 'action', 'visual_intent', 'scale', 'opacity', 'dabs']) {
      expect(intentErrors).toContain(field);
    }
    expect(runtime.store.records()).toEqual([]);
  });

  it('rolls back the whole close-only transaction when latency finalization fails after closure writes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-close-only-latency-rollback-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const first = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'close-only-latency-failure',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 57 },
        summary: 'Create a valid visual pass for end-to-end close-only rollback coverage',
        purpose: 'Verify failures after closure writes still restore the entire closure snapshot',
        problem_id: 'close-only-latency-failure-problem',
        scale: 'global',
      }),
    }) as any;
    const originalCloseLatency = runtime.store.closeLatency.bind(runtime.store);
    runtime.store.closeLatency = (() => { throw new Error('synthetic_close_latency_failure'); }) as any;

    await expect(runtime.cycleAuto({
      previous_operation_id: 'close-only-latency-failure',
      previous_observation: compactObservationFromVerdict(critic()),
    })).rejects.toThrow(/synthetic_close_latency_failure/);
    runtime.store.closeLatency = originalCloseLatency as any;

    const restored = runtime.store.read('close-only-latency-failure')!;
    expect(restored.report).toBeUndefined();
    expect(restored.operation_ack).toBeUndefined();
    expect(restored.verdict).toBeUndefined();
    expect(runtime.store.visualBarrier(42)?.sha256).toBe(after.sha256);
    expect(runtime.store.paintingState().documents['42'].workflow_lifecycle.status).toBe('active');
  });

  it('rejects stale close-only finalization instead of stopping a newer active workflow', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-stale-close-only-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const first = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'stale-close-old',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 58 },
        summary: 'Create the older visual operation',
        purpose: 'Set up stale close-only lifecycle ownership coverage',
        problem_id: 'stale-close-old-problem',
        scale: 'global',
      }),
    }) as any;
    const second = await runtime.cycleAuto({
      previous_operation_id: 'stale-close-old',
      previous_observation: compactObservationFromVerdict(critic()),
      next_pass: compactPassFromOperation({
        id: 'stale-close-newer',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 59 },
        summary: 'Create the newer active visual operation',
        purpose: 'Ensure an old id cannot later stop this newer workflow',
        problem_id: 'stale-close-newer-problem',
        scale: 'global',
      }),
    }) as any;
    expect(second.execution.operation_id).toBe('stale-close-newer');
    const before = runtime.store.paintingState().documents['42'].workflow_lifecycle;
    expect(before).toMatchObject({ status: 'active', operation_id: 'stale-close-newer' });

    const rejected = await runtime.cycleAuto({
      previous_operation_id: 'stale-close-old',
      previous_observation: compactObservationFromVerdict(critic()),
    }) as any;
    expect(rejected.finalization_rejection?.errors.join('\n')).toMatch(/stale_close_only/);
    expect(runtime.store.paintingState().documents['42'].workflow_lifecycle)
      .toMatchObject({ status: 'active', operation_id: 'stale-close-newer' });
  });

  it('reuses full close-only verdict prevalidation instead of decoding significance twice', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-verdict-prevalidation-cache-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const first = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'verdict-prevalidation-cache',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 60 },
        summary: 'Create a visual pass for verdict validation cache coverage',
        purpose: 'Ensure semantic prevalidation is reused by the actual verdict write',
        problem_id: 'verdict-prevalidation-cache-problem',
        scale: 'global',
      }),
    }) as any;
    const validateSpy = vi.spyOn(runtime.store as any, 'validateVerdictInput');
    await runtime.cycleAuto({
      previous_operation_id: 'verdict-prevalidation-cache',
      previous_observation: compactObservationFromVerdict(critic()),
    });
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it('treats a successful document close as non-visual and does not request a post-close preview', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-close-document-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let previewCalls = 0;
    registry.register('photoshop_get_preview', {
      tool: {
        name: 'photoshop_get_preview',
        description: 'preview must not run after close',
        inputSchema: { type: 'object', properties: { document_id: { type: 'number' } } },
      },
      handler: async () => {
        previewCalls++;
        throw new Error('document_not_found');
      },
    });
    registry.register('photoshop_close_document', {
      tool: {
        name: 'photoshop_close_document',
        description: 'close test document',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, save: { type: 'boolean' } },
        },
      },
      handler: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ ok: true, closed: true, document_id: 42 }) }],
      }),
    });
    const runtime = runtimeFor(registry, dir);

    const result = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'close-document-success',
        tool: 'photoshop_close_document',
        args: { document_id: 42, save: false },
        summary: 'Close the disposable Photoshop document',
        purpose: 'Verify document lifecycle completion is not treated as a visual painting pass',
      }),
    });

    expect((result as any).execution.phase).toBe('completed');
    expect((result as any).execution.failed).toBe(false);
    expect((result as any).preview).toBeUndefined();
    expect(runtime.store.read('close-document-success')?.visual).toBe(false);
    expect(previewCalls).toBe(0);
  });

  it('persists rollback as a mandatory document obligation until a rollback mutation executes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-rollback-obligation-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    registry.register('photoshop_paint_dabs', {
      tool: {
        name: 'photoshop_paint_dabs',
        description: 'multi-history test paint mutation',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number' },
            dabs: { type: 'array' },
          },
          required: ['dabs'],
        },
      },
      handler: async () => ({
        content: [{
          type: 'text',
          text: JSON.stringify({ ok: true, summary: 'paint applied', details: { history_steps: 3 } }),
        }],
      }),
    });
    const runtime = runtimeFor(registry, dir);
    runtime.store.setArtRunState({
      document_id: 42,
      process_dir: 'processes/rollback-test-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });

    const first = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'rollback-source',
        tool: 'photoshop_paint_dabs',
        args: { document_id: 42, dabs: [{ x: 10, y: 10 }] },
        summary: 'Create a visual change that will be rejected',
        purpose: 'Verify rollback disposition becomes a durable obligation',
        problem_id: 'rollback-obligation',
        stage: 'FORM',
        scale: 'global',
      }),
    });
    const receipt = (first as any).operation_receipt;
    runtime.store.report({
      id: 'rollback-source',
      did: 'Applied the test visual change and captured its frame',
      why: 'Create a classified regression for rollback testing',
      result: 'The frame is available for a rollback verdict',
    });
    runtime.store.ackOperation({ id: 'rollback-source', token: receipt.token });
    runtime.store.verdict({
      id: 'rollback-source',
      preview_id: 'rollback-source',
      sha256: (first as any).preview.sha256,
      verdict: 'regression',
      disposition: 'rollback',
      observations: [{ region: 'whole frame', visible: 'The rendered test hierarchy is visibly worse than in the before frame.' }],
      primary_mismatch: 'The intended hierarchy is degraded.',
      observed_change: 'The test image became visibly worse and should be reverted immediately',
      target_resolved: 'no',
      regressions: ['The intended visual hierarchy was degraded'],
      uncertainty: 'none observed',
      global_readability: 'degraded',
      primitive_footprint: 'none',
      trend_signals: [],
    });

    expect(runtime.store.paintingState().documents['42'].pending_rollback).toMatchObject({
      operation_id: 'rollback-source',
      required_undo_steps: 3,
      remaining_undo_steps: 3,
    });
    expect(runtime.store.paintingState().documents['42'].visual_problems['cumulative-trend-global-readability-degraded']).toMatchObject({
      status: 'open',
      severity: 'must-fix',
      source_operations: ['rollback-source'],
    });
    expect(runtime.store.documentNextRequiredAction(42)).toMatch(/rollback required/i);
    expect(() => runtime.store.begin({
      id: 'illegal-after-rollback',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 60 },
      summary: 'Attempt another visual mutation instead of rollback',
      purpose: 'Verify rollback obligation blocks unrelated painting work',
      problem_id: 'rollback-obligation',
      scale: 'global',
    })).toThrow(/rollback_required/);

    expect(() => runtime.store.begin({
      id: 'undo-too-short',
      tool: 'photoshop_undo',
      args: { document_id: 42, steps: 1 },
      summary: 'Attempt an incomplete undo of the rejected pass',
      purpose: 'Verify one Undo cannot satisfy a multi-history-step rollback obligation',
    })).toThrow(/rollback_undo_step_mismatch/);
    expect(runtime.store.paintingState().documents['42'].pending_rollback).toMatchObject({
      operation_id: 'rollback-source',
      required_undo_steps: 3,
      remaining_undo_steps: 3,
    });

    const finalUndo = runtime.store.begin({
      id: 'required-undo-final',
      tool: 'photoshop_undo',
      args: { document_id: 42, steps: 3 },
      summary: 'Finish undoing the rejected visual pass',
      purpose: 'Consume the complete recorded history footprint of the rejected pass atomically',
    }).record;
    runtime.store.markDispatched(finalUndo);
    runtime.store.complete(finalUndo, {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, undone: true }) }],
    });

    expect(runtime.store.paintingState().documents['42'].pending_rollback).toBeUndefined();
    expect(runtime.store.paintingState().documents['42'].last_rollback).toMatchObject({
      operation_id: 'required-undo-final',
      source_operation_id: 'rollback-source',
      required_undo_steps: 3,
    });
    expect(runtime.store.read('rollback-source')?.rollback).toMatchObject({
      completed: true,
      rollback_operation_id: 'required-undo-final',
    });
    expect(runtime.store.paintingState().documents['42'].visual_problems['cumulative-trend-global-readability-degraded']).toMatchObject({
      status: 'resolved',
      source_operations: [],
      trend_count: 0,
      resolution_reason: 'source_evidence_rolled_back',
      retired_source_operation_id: 'rollback-source',
      retired_by_rollback_operation_id: 'required-undo-final',
    });
    expect((runtime.store as any).cumulativeTrendState(42)).toMatchObject({
      triggered: false,
      repeated_signals: [],
    });
    expect(runtime.store.largestOpenMustFix(runtime.store.paintingState().documents['42'].visual_problems)).toBeUndefined();
  });

  it('keeps a pre-dispatch deadline rejection not-executed without creating a visual barrier', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-pre-dispatch-deadline-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'deadline-baseline',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 50 },
        summary: 'Create a baseline frame before the deadline regression',
        purpose: 'Ensure the next operation does not need an initial preview',
        problem_id: 'deadline-regression',
        scale: 'global',
      }),
    });
    const receipt = (first as any).operation_receipt;
    runtime.store.report({
      id: 'deadline-baseline',
      did: 'Created the baseline visual frame for deadline testing',
      why: 'Avoid spending the short next deadline on initial preview capture',
      result: 'A durable baseline exists for the following guarded operation',
    });
    runtime.store.ackOperation({ id: 'deadline-baseline', token: receipt.token });
    runtime.store.verdict({
      id: 'deadline-baseline',
      preview_id: 'deadline-baseline',
      sha256: (first as any).preview.sha256,
      verdict: 'improvement',
      disposition: 'accept',
      observations: [{ region: 'whole frame', visible: 'The baseline fixture visibly differs from its captured before frame.' }],
      primary_mismatch: 'No blocking mismatch is visible in this synthetic baseline fixture.',
      observed_change: 'The baseline test frame changed visibly and is suitable for the deadline regression',
      target_resolved: 'yes',
      regressions: [],
      uncertainty: 'none observed',
      global_readability: 'improved',
      primitive_footprint: 'none',
      trend_signals: [],
    });

    let mutationCalls = 0;
    registry.register('photoshop_set_layer_opacity', {
      tool: {
        name: 'photoshop_set_layer_opacity',
        description: 'deadline test mutation',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, opacity: { type: 'number' } },
          required: ['opacity'],
        },
      },
      handler: async () => {
        mutationCalls++;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
      },
    });

    const started = runtime.startJob({
      next_operation: {
        id: 'deadline-before-dispatch',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 60 },
        summary: 'Reject before dispatch when too little cycle time remains',
        purpose: 'Prove a local deadline failure cannot manufacture uncertain Photoshop state',
        problem_id: 'deadline-regression',
        scale: 'global',
        timeout_ms: 1_000,
      },
    });
    const deadlineJobId = String((started as any).job_id);
    let rejected: any = {};
    for (let i = 0; i < 100; i++) {
      const polled = runtime.pollJob(deadlineJobId) as any;
      if (polled.state === 'completed' || polled.state === 'failed' || polled.state === 'uncertain') {
        rejected = polled.result;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(mutationCalls).toBe(0);
    expect((rejected as any).execution).toMatchObject({
      operation_id: 'deadline-before-dispatch',
      phase: 'completed',
      failed: true,
      execution: 'not-executed',
    });
    expect(runtime.store.visualBarrier(42)).toBeUndefined();
    expect(runtime.store.read('deadline-before-dispatch')?.dispatched).not.toBe(true);
  });

  it('keeps compact preview targeting Guard-owned while accepting exact pre-pass artistic commentary', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-preview-retarget-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/soft-volume-test-process/run-01',
      commentary_mode: 'mixed',
      painting_profile: 'simple_graphic',
    });

    const schema = createGuardTools(runtime)
      .find(def => def.tool.name === 'photoshop_guard_cycle_auto')!
      .tool.inputSchema as any;
    expect(schema.properties.next_pass.properties.preview_args).toBeUndefined();
    expect(schema.properties.next_pass.properties.artistic_commentary).toMatchObject({ type: 'string' });
    expect(schema.properties.next_pass.required ?? []).not.toContain('artistic_commentary');

    const corrected = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'preview-retarget-attempt',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 50 },
        summary: 'Apply the corrected same semantic request to the pinned document',
        purpose: 'Verify deterministic rejection creates no journal debt and the same durable id can be corrected and executed',
        problem_id: 'preview-document-integrity',
        scale: 'global',
      }),
    }) as any;
    expect(corrected.execution).toMatchObject({
      operation_id: 'preview-retarget-attempt',
      phase: 'completed',
      failed: false,
    });
    expect(runtime.store.read('preview-retarget-attempt')?.preview?.document_id).toBe(42);
    expect(runtime.store.read('preview-retarget-attempt')?.artistic_commentary).toBeTruthy();
  });

  it('keeps compact preview pinned without a model-supplied preview document id', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-preview-normalize-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const result = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'preview-document-normalized',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 50 },
        summary: 'Use one redundant matching preview document id',
        purpose: 'Verify safe duplicate targeting is normalized instead of rejected',
        problem_id: 'preview-document-normalization',
        scale: 'global',
      }),
    }) as any;

    expect(result.execution).toMatchObject({
      operation_id: 'preview-document-normalized',
      phase: 'completed',
      failed: false,
    });
    expect(result.preview.sha256).toBe(after.sha256);
    expect(runtime.store.read('preview-document-normalized')?.preview_args?.document_id).toBeUndefined();
  });

  it('runs unified preflight before cycle_auto reserves an async job', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-async-preflight-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/async-preflight-process/run-01',
      commentary_mode: 'mixed',
      painting_profile: 'simple_graphic',
    });

    const rejected = await runtime.cycleAuto({
      next_pass: {
        request_key: 'async-preflight-reject',
        goal: 'Attempt a long paint operation with a deterministic compact preflight mistake',
        scale: 'medium',
        actions: [{
          id: 'long-paint',
          tool: 'photoshop_paint_dabs',
          args: {
            dabs: Array.from({ length: 25 }, (_, index) => ({ x: index + 1, y: index + 1 })),
          },
        }],
      },
    }) as any;

    expect(rejected.execution).toBeNull();
    expect(rejected.preflight_rejection.errors.join('\n')).toMatch(/next_pass\.document_id is required/);
    expect(rejected.job_id).toBeUndefined();
    expect(runtime.store.activeJobs(undefined)).toHaveLength(0);
    expect(runtime.store.read('async-preflight-reject')).toBeUndefined();
  });

  it('aggregates operation, Guard and underlying Photoshop tool schema errors in one compiler response', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-schema-aggregate-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/schema-aggregate-process/run-01',
      commentary_mode: 'mixed',
      painting_profile: 'simple_graphic',
    });

    const rejected = await runtime.cycle({
      next_pass: {
        request_key: 'schema-aggregate-reject',
        document_id: 42,
        goal: 'Submit several deterministic compact request mistakes together',
        scale: 'global',
        visual_intent: 'soft-transition',
        actions: [{
          id: 'invalid-opacity',
          tool: 'photoshop_set_layer_opacity',
          args: {},
        }],
      },
    }) as any;

    const errors = rejected.preflight_rejection.errors.join('\n');
    expect(errors).toMatch(/Supplied method hints or exclusions conflict with executable tools/);
    expect(errors).toMatch(/args\.opacity is required/);
    expect(rejected.execution.execution).toBe('not-executed');
    expect(runtime.store.read('schema-aggregate-reject')).toBeUndefined();
    expect(runtime.store.visualBarrier(42)).toBeUndefined();
    await runtime.cycleAuto({ next_pass: {
      request_key: 'schema-defaults-pass', document_id: 42, goal: 'Adjust opacity without duplicated stage or scale',
      actions: [{ tool: 'photoshop_set_layer_opacity', args: { opacity: 80 } }],
    } });
    expect(runtime.store.read('schema-defaults-pass')).toMatchObject({
      phase: 'completed', stage: 'GLOBAL_BLOCK_IN', scale: 'global',
    });
  });

  it('rejects attached preview provenance from a different document', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-preview-provenance-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const result = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'preview-provenance-source',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 50 },
        summary: 'Create a visual operation with a pinned preview',
        purpose: 'Verify attached preview provenance remains bound to the operation document',
        problem_id: 'preview-document-integrity',
        scale: 'global',
      }),
    });
    expect((result as any).preview.document_id).toBe(42);

    expect(() => runtime.store.attachPreview('preview-provenance-source', {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...after,
          document_id: 84,
        }),
      }],
    })).toThrow(/does not match pinned document 42/);
    expect(runtime.store.read('preview-provenance-source')?.preview?.document_id).toBe(42);
  });

  it('classifies raw public mutations as blocked in required mode while reads and guard tools remain direct', () => {
    expect(shouldBlockRawTool('photoshop_paint_regions', 'required')).toBe(true);
    expect(shouldBlockRawTool('photoshop_fill_layer', 'required')).toBe(true);
    expect(shouldBlockRawTool('photoshop_get_state', 'required')).toBe(false);
    expect(shouldBlockRawTool('photoshop_get_preview', 'required')).toBe(false);
    expect(shouldBlockRawTool('photoshop_guard_cycle_auto', 'required')).toBe(false);
    expect(shouldBlockRawTool('photoshop_paint_regions', 'compatible')).toBe(false);
  });

  it('makes required-mode raw mutation tools self-describing instead of inviting direct calls', () => {
    const rawDescription = 'Select an installed Photoshop brush preset by exact name. Extra implementation detail.';
    const guarded = describeToolForGuardMode(
      'photoshop_select_brush_preset',
      rawDescription,
      'required'
    );

    expect(guarded).toMatch(/Guard-only mutation/);
    expect(guarded).toMatch(/photoshop_guard_cycle_auto/);
    expect(guarded).toContain('Select an installed Photoshop brush preset by exact name.');
    expect(guarded).not.toContain('Extra implementation detail.');
    expect(describeToolForGuardMode('photoshop_get_state', 'Read state.', 'required')).toBe('Read state.');
    expect(describeToolForGuardMode('photoshop_select_brush_preset', rawDescription, 'compatible')).toBe(rawDescription);
  });

  it('compacts only published descriptions for the largest orchestration schemas', () => {
    const tool = {
      name: 'photoshop_guard_cycle_auto',
      description: 'First sentence. Second sentence.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          next_pass: {
            type: 'object',
            description: 'Primary public meaning. Additional detail kept internally.',
            properties: {
              risk: {
                type: 'string',
                enum: ['low', 'high'],
                description: 'Declared risk. More explanation.',
              },
            },
          },
        },
        required: ['next_pass'],
      },
    };
    const published = compactToolForPublishedCatalog(tool);

    expect(published.inputSchema).toMatchObject({
      type: 'object',
      required: ['next_pass'],
      properties: {
        next_pass: {
          description: 'Primary public meaning.',
          properties: {
            risk: {
              enum: ['low', 'high'],
              description: 'Declared risk.',
            },
          },
        },
      },
    });
    expect(tool.inputSchema.properties.next_pass.description).toBe(
      'Primary public meaning. Additional detail kept internally.'
    );
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-description-contract-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const tools = createGuardTools(runtimeFor(registry, dir));
    const cycleOriginal = tools.find(def => def.tool.name === 'photoshop_guard_cycle_auto')!.tool;
    const cycleCompact = compactToolForPublishedCatalog(cycleOriginal);
    const next = (cycleCompact.inputSchema as any).properties.next_pass.properties;
    expect(next.restore_anchor_operation_id.description).toContain('instead of actions');
    expect(next.replace_protected_layer_ids.description).toContain('action_class=REPLACE or ERASE');
    expect(next.stage.description).toContain('stage_reset');
    expect(next.scene_geometry_model.description).toContain('keep model_id and increase revision');
    expect(next.scale.description).toContain('small/local plus region_bounds');
    const withoutDescriptions = (value: any): any => Array.isArray(value)
      ? value.map(withoutDescriptions)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description')
          .map(([key, nested]) => [key, withoutDescriptions(nested)]))
        : value;
    expect(withoutDescriptions(cycleCompact.inputSchema)).toEqual(withoutDescriptions(cycleOriginal.inputSchema));

    for (const name of ['photoshop_guard_status', 'photoshop_guard_lint_next_pass']) {
      const original = tools.find(def => def.tool.name === name)!.tool;
      const compact = compactToolForPublishedCatalog(original);
      expect((compact.inputSchema as any).properties.next_pass).toEqual({
        type: 'object',
        description: 'Use the exact next_pass schema published by photoshop_guard_cycle_auto; validation returns all field corrections without mutation.',
      });
    }
    const autoDescription = tools.find(def => def.tool.name === 'photoshop_guard_cycle_auto')!.tool.description;
    expect(autoDescription).toContain('photoshop_guard_review_image');
    expect(autoDescription).toContain('photoshop_guard_job_poll');
  });

  it('rejects generative-class next operations before any Guard dispatch or journaling', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-generative-contract-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    expect(isGenerativeToolName('photoshop_generative_fill')).toBe(true);
    expect(isGenerativeToolName('photoshop_generate_image')).toBe(true);
    expect(isGenerativeToolName('photoshop_paint_regions')).toBe(false);

    for (const [entry, tool] of [
      ['cycle', 'photoshop_generate_image'],
      ['cycleAuto', 'photoshop_generative_fill'],
    ] as const) {
      const rejected = await runtime[entry]({
        next_pass: compactPassFromOperation({
          id: `blocked-${entry}`,
          tool,
          args: { document_id: 42 },
          summary: 'Attempt a disabled generative operation',
          purpose: 'Verify operation-contract errors join the same unified compiler rejection',
        }),
      }) as any;
      expect(rejected.preflight_rejection.error_codes).toContain('generative_tool_disabled_by_contract');
      expect(rejected.preflight_rejection.errors.join('\n')).toMatch(/Generative tool .* is disabled by the Guard contract/);
      expect(rejected.preflight_rejection.next_operation_errors.length).toBeGreaterThan(0);
      expect(runtime.store.read(`blocked-${entry}`)).toBeUndefined();
    }

    try {
      runtime.startJob({
        next_operation: {
          id: 'blocked-start-job',
          tool: 'photoshop_generative_remove',
          args: {},
          summary: 'Attempt a disabled generative background operation',
          purpose: 'Verify the async Guard entry point rejects before job creation',
        },
      });
      throw new Error('startJob unexpectedly accepted a disabled generative operation');
    } catch (error) {
      expect(guardRuntimeErrorCode(error, 'fallback')).toBe('generative_tool_disabled_by_contract');
    }
    expect(runtime.store.read('blocked-start-job')).toBeUndefined();
    expect(runtime.store.activeJobs(undefined)).toHaveLength(0);
  });

  it('rejects retired raw script, recipes, and unknown registered tools at compiler and runtime boundaries', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-execution-policy-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    let rawCalls = 0;
    let recipeCalls = 0;
    let debugCalls = 0;
    registry.register('photoshop_execute_script', {
      tool: {
        name: 'photoshop_execute_script',
        description: 'retired raw script fixture',
        inputSchema: {
          type: 'object',
          properties: {
            document_id: { type: 'number' },
            code: { type: 'string' },
          },
          required: ['code'],
        },
      },
      handler: async () => {
        rawCalls += 1;
        return { content: [{ type: 'text', text: 'should not execute' }] };
      },
    });
    registry.register('photoshop_recipe_dodge_burn', {
      tool: {
        name: 'photoshop_recipe_dodge_burn',
        description: 'registered upstream recipe fixture',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' } },
        },
      },
      handler: async () => {
        recipeCalls += 1;
        return { content: [{ type: 'text', text: 'should not execute' }] };
      },
    });
    registry.register('photoshop_debug_future_tool', {
      tool: {
        name: 'photoshop_debug_future_tool',
        description: 'registered but not authorized fixture',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' } },
        },
      },
      handler: async () => {
        debugCalls += 1;
        return { content: [{ type: 'text', text: 'should not execute' }] };
      },
    });
    const runtime = runtimeFor(registry, dir);

    const rawRejected = await runtime.cycle({
      next_pass: {
        request_key: 'retired-raw-script',
        document_id: 42,
        goal: 'Attempt retired raw script execution',
        actions: [{
          tool: 'photoshop_execute_script',
          args: { code: 'app.activeDocument.flatten();' },
        }],
      },
    }) as any;
    expect(rawRejected.preflight_rejection.error_codes).toContain('guard_tool_retired');
    expect(rawRejected.preflight_rejection.next_operation_dispatched).toBe(false);
    expect(rawCalls).toBe(0);

    const recipeRejected = await runtime.cycle({
      next_pass: {
        request_key: 'forbidden-upstream-recipe',
        document_id: 42,
        goal: 'Attempt a pre-baked upstream recipe',
        actions: [{ tool: 'photoshop_recipe_dodge_burn', args: {} }],
      },
    }) as any;
    expect(recipeRejected.preflight_rejection.error_codes).toContain('guard_tool_not_executable');
    expect(recipeRejected.preflight_rejection.next_operation_dispatched).toBe(false);
    expect(recipeCalls).toBe(0);

    const unknownRejected = await runtime.cycle({
      next_pass: {
        request_key: 'unknown-registered-tool',
        document_id: 42,
        goal: 'Attempt an unclassified registered tool',
        actions: [{ tool: 'photoshop_debug_future_tool', args: {} }],
      },
    }) as any;
    expect(unknownRejected.preflight_rejection.error_codes).toContain('guard_tool_not_executable');
    expect(unknownRejected.preflight_rejection.next_operation_dispatched).toBe(false);
    expect(debugCalls).toBe(0);

    await expect(
      (runtime as any).invoke(
        'photoshop_execute_script',
        { document_id: 42, code: 'app.activeDocument.flatten();' },
        1_000
      )
    ).rejects.toThrow('guard_tool_retired');
    await expect(
      (runtime as any).invoke(
        'photoshop_recipe_dodge_burn',
        { document_id: 42 },
        1_000
      )
    ).rejects.toThrow('guard_tool_not_executable');
    await expect(
      (runtime as any).invoke(
        'photoshop_debug_future_tool',
        { document_id: 42 },
        1_000
      )
    ).rejects.toThrow('guard_tool_not_executable');
    expect(rawCalls).toBe(0);
    expect(recipeCalls).toBe(0);
    expect(debugCalls).toBe(0);
  });

  it('starts and completes an in-process durable job without a second MCP daemon', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-job-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const started = runtime.startJob({
      next_operation: {
        id: 'job-read-one',
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Read current state in a background job',
        purpose: 'Verify native durable job start and polling',
      },
    });

    expect(started.state).toBe('starting');
    const jobId = String(started.job_id);
    expect(() => runtime.startJob({
      next_operation: {
        id: 'job-read-two',
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Start a competing state read',
        purpose: 'Verify a second guarded job cannot replace active work',
      },
    })).toThrow(/already active/);
    let polled: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      polled = runtime.pollJob(jobId);
      if (polled.state === 'completed' || polled.state === 'failed' || polled.state === 'uncertain') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(polled.state).toBe('completed');
    expect((polled.result as any)?.execution?.operation_id).toBe('job-read-one');
  });

  it.each([0, 300])('keeps async reservation, execution, and polling to one full journal scan with %i historical records', async (historySize) => {
    const dir = mkdtempSync(path.join(tmpdir(), `embedded-guard-job-history-${historySize}-`));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    for (let index = 0; index < historySize; index += 1) {
      runtime.store.write({
        id: `async-history-${index}`,
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Historical async scan fixture',
        purpose: 'Prove async helper scans stay bounded as journal history grows',
        hash: `async-history-hash-${index}`,
        sequence: index + 1,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        phase: 'completed',
        execution: 'completed',
        visual: false,
        failed: false,
        report: { delivered: true },
      });
    }

    const recordsSpy = vi.spyOn(runtime.store, 'records');
    const operationId = `job-history-${historySize}-read`;
    const started = runtime.startJob({
      next_operation: {
        id: operationId,
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Read current state through the durable async worker',
        purpose: 'Prove reservation, worker execution, and polling do not multiply full journal scans',
      },
    });
    const jobId = String(started.job_id);
    let polled: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      polled = runtime.pollJob(jobId);
      if (polled.state === 'completed' || polled.state === 'failed' || polled.state === 'uncertain') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(polled.state, JSON.stringify(polled, null, 2)).toBe('completed');
    expect((polled.result as any)?.execution?.operation_id).toBe(operationId);
    expect(recordsSpy).toHaveBeenCalledTimes(1);
  });

  it('atomically reserves the async-job slot before checking/creating jobs', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-job-race-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const first = runtimeFor(registry, dir);
    const competitor = runtimeFor(registry, dir);

    // Force a deterministic check-then-act interleaving. Before the fix, the
    // competitor could create its job while first.activeJobs() was in flight,
    // after which the first caller would also create a second job. With the
    // controller lock acquired before activeJobs(), the competitor fails closed.
    const originalActiveJobs = first.store.activeJobs.bind(first.store);
    let competitorError: unknown;
    let injected = false;
    first.store.activeJobs = ((documentId?: number) => {
      if (!injected) {
        injected = true;
        try {
          competitor.startJob({
            next_operation: {
              id: 'race-competitor',
              tool: 'photoshop_get_state',
              args: { document_id: 42 },
              summary: 'Competing guarded job reservation',
              purpose: 'Verify cross-runtime startJob reservation is atomic',
            },
          });
        } catch (error) {
          competitorError = error;
        }
      }
      return originalActiveJobs(documentId);
    }) as typeof first.store.activeJobs;

    const started = first.startJob({
      next_operation: {
        id: 'race-winner',
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Winning guarded job reservation',
        purpose: 'Verify exactly one async job can claim a shared runtime',
      },
    });

    expect(started.state).toBe('starting');
    expect(String((competitorError as Error)?.message ?? competitorError)).toMatch(/Another controller owns the session/);
    expect(first.store.activeJobs(undefined)).toHaveLength(1);
    expect(first.store.activeJobs(undefined)[0]?.operation_id).toBe('race-winner');
  });

  it('marks a live-PID async job stalled on deadline or stale heartbeat and refuses unsafe lock recovery', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-stalled-job-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const runtimeDirectory = path.join(dir, 'controller');
    const input = {
      next_operation: {
        id: 'job-stalled-one',
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Simulate a stalled embedded Guard job',
        purpose: 'Verify live PID is not treated as proof of job progress',
        timeout_ms: 1_000,
      },
    };
    const created = createJob(runtimeDirectory, input, { text: 'test stalled job' });
    writeJobStarted(created.dir, { embedded_guard: true, progress_state: 'running' });
    updateJob(created.dir, { deadline_at: new Date(Date.now() - 1_000).toISOString() });

    const job = readJob(runtimeDirectory, created.jobId);
    expect(job.alive).toBe(true);
    expect(job.state).toBe('stalled');
    expect(job.stall_reason).toBe('deadline_exceeded');

    updateJob(created.dir, {
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
      heartbeat_stale_ms: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const heartbeatStalled = readJob(runtimeDirectory, created.jobId);
    expect(heartbeatStalled.state).toBe('stalled');
    expect(heartbeatStalled.stall_reason).toBe('heartbeat_stale');

    const recovery = runtime.recoverLocks() as any;
    expect(recovery.controller.code).toBe('embedded_guard_job_stalled');
    expect(recovery.execution.code).toBe('embedded_guard_job_stalled');
    expect(recovery.next).toMatch(/Restart only the Photoshop MCP child process/);
    expect(runtime.store.activeJobs(undefined)).toEqual(expect.arrayContaining([
      expect.objectContaining({ job_id: created.jobId, state: 'stalled' }),
    ]));
  });

  it('releases a starting async-job reservation when its owner died before execution began', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-orphaned-start-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const runtimeDirectory = path.join(dir, 'controller');
    const created = createJob(runtimeDirectory, {
      next_operation: {
        id: 'job-orphaned-before-start',
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Simulate an interrupted async reservation',
        purpose: 'Verify restart recovery before execution begins',
      },
    }, { text: 'test orphaned starting job' });

    updateJob(created.dir, {
      owner_pid: 2_147_483_647,
      pid: 2_147_483_647,
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const orphaned = readJob(runtimeDirectory, created.jobId);
    expect(orphaned.started).toBeUndefined();
    expect(orphaned.state).toBe('failed');
    expect(orphaned.stall_reason).toBe('owner_process_exited_before_start');
    expect(runtime.store.activeJobs(undefined)).toHaveLength(0);
    expect(runtime.pollJob(created.jobId)).toMatchObject({
      ok: false,
      state: 'failed',
      stall_reason: 'owner_process_exited_before_start',
    });

    const replacement = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'job-after-orphaned-start',
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Run guarded work after orphan cleanup',
        purpose: 'Verify an abandoned starting job no longer blocks the Guard',
      }),
    });
    expect((replacement.execution as any)?.operation_id).toBe('job-after-orphaned-start');
  });

  it('expires a legacy starting job with no owner PID after its deadline', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-ownerless-start-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const runtimeDirectory = path.join(dir, 'controller');
    const created = createJob(runtimeDirectory, {
      next_operation: {
        id: 'job-ownerless-before-start',
        tool: 'photoshop_get_state',
        args: { document_id: 42 },
        summary: 'Simulate a legacy ownerless reservation',
        purpose: 'Verify old partial jobs cannot block Guard forever',
      },
    }, { text: 'test ownerless starting job' });

    updateJob(created.dir, {
      owner_pid: null,
      pid: null,
      deadline_at: new Date(Date.now() - 1_000).toISOString(),
    });

    const expired = readJob(runtimeDirectory, created.jobId);
    expect(expired.started).toBeUndefined();
    expect(expired.state).toBe('failed');
    expect(expired.stall_reason).toBe('start_deadline_exceeded');
    expect(runtime.store.activeJobs(undefined)).toHaveLength(0);
  });

  it('rejects edge observations on an atomic visual operation instead of journaling them unvalidated', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-atomic-edge-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'atomic-edge-observation',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 55 },
        summary: 'Change opacity for atomic edge observation validation',
        purpose: 'Verify edge observations require a declared VisualMicroPlan edge contract',
        problem_id: 'atomic-edge-contract',
        scale: 'global',
      }),
    });

    expect(() => runtime.store.verdict({
      id: 'atomic-edge-observation',
      preview_id: 'atomic-edge-observation',
      sha256: after.sha256,
      verdict: 'neutral',
      disposition: 'correct',
      observations: [{ region: 'whole frame', visible: 'The atomic opacity fixture differs visibly from its captured before frame.' }],
      primary_mismatch: 'The declared edge behavior is not valid evidence for an atomic non-microplan operation.',
      observed_change: 'The atomic opacity operation visibly changed the test frame.',
      target_resolved: 'no',
      regressions: [],
      uncertainty: 'none observed',
      global_readability: 'stable',
      primitive_footprint: 'none',
      trend_signals: [],
      edge_observations: [{
        boundary_id: 'atomic-boundary',
        observed_behavior: 'The boundary appears softer.',
        target_met: 'uncertain',
      }],
    })).toThrow(/edge_observations are allowed only/);
    expect(runtime.store.read('atomic-edge-observation')?.verdict).toBeUndefined();
  });

  it('recovers exact ack and preview verdict material after a completed async result is lost', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-lost-poll-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const started = runtime.startJob({
      next_operation: {
        id: 'job-visual-lost-result',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 65 },
        summary: 'Run a visual mutation whose poll result will be treated as lost',
        purpose: 'Verify resume can recover the exact durable continuation material',
        problem_id: 'lost-poll-recovery',
        scale: 'global',
      },
    });

    const jobId = String(started.job_id);
    for (let i = 0; i < 100; i++) {
      const polled = runtime.pollJob(jobId);
      if (polled.state === 'completed' || polled.state === 'failed' || polled.state === 'uncertain') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    const resumed = runtime.resume(42) as any;
    const receipt = runtime.store.read('job-visual-lost-result')?.operation_receipt;
    expect(receipt?.token).toBeTruthy();
    expect(resumed.pending_operation_ack).toEqual({
      operation_id: 'job-visual-lost-result',
      protocol: 'photoshop.guard.operation_ack.v1',
      receipt_protocol: 'photoshop.guard.operation_receipt.v1',
      receipt_token: receipt.token,
      issued_at: receipt.issued_at,
    });
    expect(resumed.pending_visual_verdict).toEqual({
      operation_id: 'job-visual-lost-result',
      preview_id: 'job-visual-lost-result',
      sha256: after.sha256,
      materialized_path: after.materialized_path,
      document_id: 42,
      canvas: { width: null, height: null },
      crop: null,
    });

    const status = runtime.status() as any;
    expect(status.pending_operation_ack_details).toContainEqual(resumed.pending_operation_ack);
    expect(status.pending_visual_verdict_details).toContainEqual(resumed.pending_visual_verdict);
  });

  it('redirects a stale next-pass attempt back to the pending delivered visual closure instead of generic rejection', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-stale-visual-handoff-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'stale-handoff-source',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 63 },
        summary: 'Create a delivered visual frame whose closure will be intentionally left pending',
        purpose: 'Verify stale post-visual handoff is redirected to exact closure',
        problem_id: 'stale-handoff',
        scale: 'global',
      }),
    });

    const old = new Date(Date.now() - 180_000).toISOString();
    const record = runtime.store.read('stale-handoff-source')!;
    record.created_at = old;
    record.completed_at = old;
    record.preview_attached_at = old;
    if (record.operation_receipt) record.operation_receipt.issued_at = old;
    runtime.store.write(record);

    const redirected = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'stale-handoff-next',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 68 },
        summary: 'Attempt another visual pass without closing the delivered frame',
        purpose: 'Verify the Guard points the model back to the pending frame',
        problem_id: 'stale-handoff',
        scale: 'global',
      }),
    }) as any;

    expect(redirected.mode).toBe('photoshop-guard-continuation-required');
    expect(redirected.next_pass_deferred).toBe(true);
    expect(redirected.next_mutation_dispatched).toBe(false);
    expect(redirected.pending_visual_verdict?.operation_id).toBe('stale-handoff-source');
    expect(redirected.next_required_action).toMatch(/previous_operation_id \+ previous_observation/);
    expect(runtime.store.read('stale-handoff-next')).toBeUndefined();
    // A redirect still consumes a model-visible call, but the old visual
    // operation must not inherit the new request's run attribution.
    const [redirectEvent] = runtime.store.artisticThroughputMetrics(42).recent_events;
    expect(redirectEvent).toMatchObject({ kind: 'rejected', model_visible: true, semantic_actions: 0 });
    expect(redirectEvent).not.toHaveProperty('operation_id');
    expect(runtime.store.artisticThroughputMetrics(42).rejected_before_dispatch_round_trips).toBe(1);
    const failedTelemetry = vi.spyOn(runtime.store, 'recordArtisticThroughputEvent')
      .mockImplementationOnce(() => { throw new Error('telemetry disk unavailable'); });
    const stillRedirected = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'stale-handoff-telemetry-failure',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 72 },
        summary: 'Retry stale handoff with diagnostic storage unavailable',
        purpose: 'A telemetry failure must not bypass pending visual closure',
        problem_id: 'stale-handoff',
        scale: 'global',
      }),
    }) as any;
    expect(failedTelemetry).toHaveBeenCalledOnce();
    expect(stillRedirected.mode).toBe('photoshop-guard-continuation-required');
    expect(stillRedirected.next_mutation_dispatched).toBe(false);
    expect(runtime.store.read('stale-handoff-telemetry-failure')).toBeUndefined();
  });

  it('keeps successful pixel execution separate from goal confirmation when an accepted pass is unresolved', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-unresolved-accept-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'accepted-but-unresolved',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 55 },
        summary: 'Run a visibly changing but unresolved visual experiment',
        purpose: 'Verify execution, retention, observation and goal confirmation remain separate',
        problem_id: 'goal-still-open',
        scale: 'global',
      }),
    }) as any;

    expect(first.significance.execution_effect).toBe('meaningful');
    await runtime.cycleAuto({
      previous_operation_id: 'accepted-but-unresolved',
      previous_observation: compactObservationFromVerdict({
        verdict: 'neutral',
        disposition: 'accept',
        observations: [{ region: 'whole frame', visible: 'The rendered fixture is visibly lighter than its before frame.' }],
        primary_mismatch: 'The requested visual goal is still not established by the observed frame.',
        observed_change: 'The test render changed visibly, but the intended visual goal is not established.',
        target_resolved: 'no',
        regressions: [],
        uncertainty: 'The synthetic frame does not establish the requested goal.',
        global_readability: 'stable',
        primitive_footprint: 'none',
        trend_signals: [],
      }),
    });

    const record = runtime.store.read('accepted-but-unresolved')!;
    expect(record.verdict?.significance?.execution_effect).toBe('meaningful');
    expect(record.verdict).toMatchObject({
      execution_outcome: 'completed',
      artistic_outcome: 'unresolved',
      comparison_metric: { status: 'available' },
    });
    expect(record.verdict?.goal_assessment).toMatchObject({
      status: 'unresolved',
      pixels_retained: true,
      target_resolved: 'no',
    });
    const state = runtime.store.paintingState().documents['42'];
    expect(state.visual_problems['goal-still-open'].status).toBe('open');
    expect(state.visual_problems['goal-still-open'].confirmation.status).toBe('unresolved');
    expect(state.accepted_frame).toMatchObject({
      operation_id: 'accepted-but-unresolved',
      acceptance_scope: 'pixels_retained_not_goal_confirmation',
      goal_confirmation: 'unresolved',
    });
    expect(state.confirmed_goal_frame).toBeUndefined();
    expect(state.workflow_lifecycle).toMatchObject({
      status: 'active',
      reason: 'close_only_artistic_debt_remains',
      operation_id: 'accepted-but-unresolved',
    });

    const compact = runtime.status() as any;
    expect(compact.documents['42'].last_critique.goal_assessment.status).toBe('unresolved');
    expect(compact.documents['42'].last_critique).toMatchObject({
      execution_outcome: 'completed',
      artistic_outcome: 'unresolved',
      comparison_metric: { status: 'available' },
    });
    expect(compact.documents['42'].global_brief_outcome).toBe('not-evaluated');
    expect(compact.documents['42'].unresolved_visual_basis).toMatchObject({
      status: 'unresolved',
      primary_mismatch: 'The requested visual goal is still not established by the observed frame.',
    });
    expect(compact.documents['42'].visual_cadence.active_visual_workflow).toBe(true);
    expect(compact.documents['42'].continuation_watch.active_visual_workflow).toBe(true);
    expect(compact.documents['42'].next_required_action).not.toBe('ready');
    const resumed = runtime.resume(42) as any;
    expect(resumed.document.last_critique.goal_assessment.status).toBe('unresolved');
    expect(resumed.unresolved_visual_basis).toMatchObject({
      status: 'unresolved',
      primary_mismatch: 'The requested visual goal is still not established by the observed frame.',
    });
    expect(resumed.resume_summary.text).toContain('Unresolved visual basis');
    expect(resumed.next_required_action).not.toBe('ready');
  });

  it('refuses to close a meaningful visual pass from local-only observations without whole-frame review', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-whole-frame-review-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'whole-frame-review-source',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 57 },
        summary: 'Create one meaningful changed frame',
        purpose: 'Verify verdict closure requires whole-frame observation',
        problem_id: 'whole-frame-review-source',
        scale: 'global',
      }),
    }) as any;
    expect(first.significance.execution_effect).toBe('meaningful');

    const rejected = await runtime.cycleAuto({
      previous_operation_id: 'whole-frame-review-source',
      previous_observation: {
        observed: 'The local subject patch changed visibly.',
        target: 'resolved',
        observations: [{ region: 'subject crop', visible: 'The crop changed as intended.' }],
      },
    }) as any;
    expect(rejected.finalization_rejection?.errors.join('\n') ?? rejected.preflight_rejection?.errors.join('\n'))
      .toMatch(/whole_frame_review_required/);
    expect(runtime.store.read('whole-frame-review-source')?.verdict).toBeUndefined();
  });

  it('closes a decoded-identical false improvement without a repair turn or task completion', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-rendering-noop-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir, { afterValue: 40 });
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({ document_id: 42, process_dir: 'processes/rendering-noop-process/run-01',
      painting_profile: 'simple_graphic', commentary_mode: 'mixed' });
    const first = await runtime.cycle({ next_pass: compactPassFromOperation({
      id: 'form-noop', tool: 'photoshop_set_layer_opacity', args: { document_id: 42, opacity: 100 },
      summary: 'Develop vehicle form', purpose: 'Model volume rather than claim polish',
      problem_id: 'vehicle-volume', scale: 'medium',
    }) }) as any;
    expect(first.significance.global.decoded_pixels_equal).toBe(true);
    const closed = await runtime.cycleAuto({ previous_operation_id: 'form-noop', previous_observation: {
      observed: 'The vehicle has become fully modelled; only surface texture remains.', target: 'resolved',
      planner_task_assessment: { status: 'completed', evidence_scope: 'task', evidence: ['Vehicle body is complete.'] },
    } }) as any;
    expect(closed.finalization_rejection).toBeUndefined();
    expect(closed.preflight_rejection).toBeUndefined();
    expect(closed.closed_previous).toMatchObject({ closed: true, verdict_recorded: true,
      execution_claim_correction: { code: 'unchanged_rendered_frame', target_resolved: 'no', planner_task_status: 'continue' },
    });
    const verdict = runtime.store.read('form-noop')?.verdict;
    expect(verdict).toMatchObject({
      verdict: 'neutral', disposition: 'accept', target_resolved: 'no',
      goal_assessment: { status: 'unresolved' }, planner_task_assessment: { status: 'continue' },
      artistic_value: { accepted_improvement: false, execution_changed: false },
      execution_claim_correction: { original_claim: { target_resolved: 'yes', observed_change: expect.stringContaining('fully modelled') } },
    });
    expect(verdict.observed_change).not.toContain('only surface texture remains');
    const record = runtime.store.read('form-noop')!;
    expect(record.report.result).toBe(verdict.observed_change);
    expect(readFileSync(record.preview.commentary_path, 'utf8')).not.toContain('only surface texture remains');
    expect(runtime.store.paintingState().documents['42'].active_problem?.status).not.toBe('resolved');
  });

  it.each([false, true])('preserves real changed-frame assessments, including intentional flat/simple work (small=%s)', async small => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-real-rendering-change-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir, { singlePixelDelta: small });
    const runtime = runtimeFor(registry, dir);
    await runtime.cycle({ next_pass: compactPassFromOperation({
      id: 'actual-change', tool: 'photoshop_set_layer_opacity', args: { document_id: 42, opacity: 75 },
      summary: 'Change the requested flat tonal area', purpose: 'Preserve the explicitly simple finish', scale: 'medium',
    }) });
    const closed = await runtime.cycleAuto({ previous_operation_id: 'actual-change', previous_observation: {
      observed: 'The requested flat tonal adjustment is visible.', target: 'resolved',
    } }) as any;
    expect(closed.finalization_rejection).toBeUndefined();
    expect(runtime.store.read('actual-change')?.verdict).toMatchObject({
      verdict: 'improvement', target_resolved: 'yes', artistic_value: { execution_changed: true },
    });
    expect(closed.closed_previous.execution_claim_correction).toBeUndefined();
  });

  it('uses decoded equality rather than JPEG bytes or sparse zero-delta samples', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-full-pixel-identity-'));
    dirs.push(dir);
    const before = jpegMeta(dir, 'before.jpg', 40);
    const bytes = readFileSync(before.materialized_path);
    const tagged = path.join(dir, 'tagged.jpg');
    writeFileSync(tagged, Buffer.concat([bytes.subarray(0, 2), Buffer.from([0xff, 0xfe, 0, 4, 65, 66]), bytes.subarray(2)]));
    expect(comparePreviewFiles(before.materialized_path, tagged)?.decoded_pixels_equal).toBe(true);
    const width = 48, height = 48;
    const data = Buffer.alloc(width * height * 4);
    for (let offset = 0; offset < data.length; offset += 4) data.set([40, 40, 40, 255], offset);
    data[(40 * width + 40) * 4] = 240;
    const changed = path.join(dir, 'unsampled-change.jpg');
    writeFileSync(changed, jpeg.encode({ data, width, height }, 100).data);
    expect(comparePreviewFiles(before.materialized_path, changed, 1)).toMatchObject({
      mean_abs_rgb_delta: 0, decoded_pixels_equal: false,
    });
  });

  it('requires whole-frame review for an accepted low-delta structural change', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-low-delta-structural-review-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir, { singlePixelDelta: true });
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'low-delta-structural-source',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 99 },
        summary: 'Create a deliberately sub-threshold structural pixel change',
        purpose: 'Verify structural review authority does not depend on the meaningful threshold',
        problem_id: 'figure-contact',
        scale: 'global',
      }),
    }) as any;
    expect(first.significance.execution_effect).toBe('insufficient');
    const structuralRecord = runtime.store.read('low-delta-structural-source')!;
    structuralRecord.affected_relations = ['figure support/contact'];
    runtime.store.write(structuralRecord);

    const rejected = await runtime.cycleAuto({
      previous_operation_id: 'low-delta-structural-source',
      previous_observation: compactObservationFromVerdict({
        verdict: 'neutral',
        disposition: 'accept',
        observations: [{ region: 'contact crop', visible: 'The contact edge changed slightly as intended.' }],
        primary_mismatch: 'The structural relation is acceptable locally but has not been checked in the whole frame.',
        observed_change: 'The support contact changed by a small but visible pixel delta.',
        target_resolved: 'no',
        regressions: [],
        uncertainty: 'Whole-frame structural effect has not yet been inspected.',
        global_readability: 'unknown',
        primitive_footprint: 'none',
        trend_signals: [],
      }),
    }) as any;
    expect(rejected.finalization_rejection?.errors.join('\n') ?? rejected.preflight_rejection?.errors.join('\n'))
      .toMatch(/whole_frame_review_required/);
    expect(runtime.store.read('low-delta-structural-source')?.verdict).toBeUndefined();
  });

  it('promotes a must-fix perspective review into structural debt and blocks cosmetic continuation immediately', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-structural-review-debt-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/structural-review-debt-process/run-01',
      painting_profile: 'simple_graphic',
      commentary_mode: 'technical',
    });

    await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'perspective-structural-source',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 58 },
        summary: 'Create one visibly changed frame for perspective review',
        purpose: 'Verify structural whole-frame findings become blocking debt',
        problem_id: 'facade-perspective',
        scale: 'global',
      }),
    });
    await runtime.cycleAuto({
      previous_operation_id: 'perspective-structural-source',
      previous_observation: {
        observed: 'The whole frame changed, but the facade perspective still visibly diverges from the sceneRegion projection.',
        target: 'unresolved',
        observations: [{ region: 'whole frame', visible: 'Facade supportPlane/openingForm lines do not converge consistently with the sceneRegion.' }],
        primary_mismatch: 'Perspective geometry remains structurally inconsistent across the facades.',
        review_findings: [{
          kind: 'perspective_geometry',
          severity: 'must-fix',
          problem_id: 'facade-perspective',
        }],
      },
    });

    expect(runtime.store.paintingState().documents['42'].visual_problems['facade-perspective']).toMatchObject({
      status: 'open',
      severity: 'must-fix',
      scale: 'global',
      structural_review: true,
      source_review_kind: 'perspective_geometry',
    });

    const cosmetic = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'perspective-cosmetic-attempt',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 61 },
        summary: 'Attempt surface masking without rebuilding perspective',
        purpose: 'Verify structural review debt blocks cosmetic continuation',
        problem_id: 'facade-perspective',
        scale: 'global',
        strategy_family: 'surface-mask-cosmetic',
      }),
    }) as any;
    expect(cosmetic.preflight_rejection?.errors.join('\n')).toMatch(
      /structural_debt_requires_structural_correction|requires a causally distinct structural strategy/
    );
    expect(runtime.store.read('perspective-cosmetic-attempt')).toBeUndefined();

    const structural = await runtime.cycleAuto({
      next_pass: compactPassFromOperation({
        id: 'perspective-structural-rebuild',
        tool: 'photoshop_paint_dabs',
        args: { document_id: 42, dabs: [{ x: 20, y: 20 }] },
        summary: 'Run the structural correction path for the same perspective problem',
        purpose: 'Verify structural correction remains admissible',
        problem_id: 'facade-perspective',
        scale: 'global',
        stage: 'SHAPE',
        strategy_family: 'perspective-structural-rebuild',
        causal_escalation_level: 3,
      }),
    }) as any;
    expect(structural.preflight_rejection).toBeUndefined();
  });

  it('does not promote uncertain recognition into a confirmed recognition milestone or goal frame', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-uncertain-recognition-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'uncertain-recognition',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 60 },
        summary: 'Create a recognition-block fixture with uncertain subject evidence',
        purpose: 'Verify uncertainty remains uncertainty in durable recognition state',
        problem_id: 'recognition-open',
        stage: 'RECOGNITION_BLOCK_IN',
        scale: 'global',
      }),
    }) as any;

    await runtime.cycleAuto({
      previous_operation_id: 'uncertain-recognition',
      previous_observation: compactObservationFromVerdict({
        verdict: 'neutral',
        disposition: 'accept',
        observations: [
          { region: 'whole frame', visible: 'The whole frame remains compositionally stable, but the subject is not securely identifiable.' },
          { region: 'central frame', visible: 'A changed central tonal mass is visible, without a securely identifiable subject.' },
        ],
        primary_mismatch: 'The subject is not yet reliably recognizable.',
        observed_change: 'A central tonal mass changed visibly, but subject recognition remains uncertain.',
        target_resolved: 'uncertain',
        regressions: [],
        uncertainty: 'Subject identity cannot be confirmed from the visible mass.',
        global_readability: 'stable',
        primitive_footprint: 'none',
        trend_signals: [],
        recognition: {
          subject: 'uncertain',
          style: 'uncertain',
          evaluator: 'producer',
          visible_features: ['central tonal mass'],
          lost_features: [],
        },
      }),
    });

    const metrics = runtime.store.recognitionMetrics(42);
    expect(metrics.first_subject_recognizable_at).toBeNull();
    expect(metrics.first_subject_and_style_recognizable_at).toBeNull();
    const state = runtime.store.paintingState().documents['42'];
    expect(state.visual_problems['recognition-open'].confirmation.status).toBe('uncertain');
    expect(state.confirmed_goal_frame).toBeUndefined();
  });

  it('rejects a stale same-document preview as the evidence frame for the current verdict', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-stale-verdict-frame-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);

    const first = await runtime.cycle({
      next_pass: compactPassFromOperation({
        id: 'current-visual-for-verdict',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 50 },
        summary: 'Create the current visual operation',
        purpose: 'Verify a verdict cannot be attached to a different preview record',
        problem_id: 'frame-identity',
        scale: 'global',
      }),
    }) as any;

    runtime.store.write({
      id: 'stale-same-document-preview',
      tool: 'photoshop_get_preview',
      args: { document_id: 42 },
      summary: 'Create a later same-document read preview fixture',
      purpose: 'Exercise exact operation-to-verdict frame binding',
      hash: 'stale-preview-fixture',
      sequence: 999,
      created_at: new Date(Date.now() + 1000).toISOString(),
      completed_at: new Date(Date.now() + 1000).toISOString(),
      phase: 'completed',
      visual: false,
      failed: false,
      preview: { ...after, document_id: 42 },
    });

    expect(() => runtime.store.verdict({
      id: 'current-visual-for-verdict',
      preview_id: 'stale-same-document-preview',
      sha256: after.sha256,
      verdict: 'neutral',
      disposition: 'correct',
      observations: [{ region: 'whole frame', visible: 'A later same-document preview exists.' }],
      primary_mismatch: 'The preview is not the frame attached to the current mutation.',
      observed_change: 'A later preview exists but cannot classify the current operation.',
      target_resolved: 'uncertain',
      regressions: [],
      uncertainty: 'The supplied frame belongs to another journal record.',
      global_readability: 'unknown',
      primitive_footprint: 'none',
      trend_signals: [],
    })).toThrow(/exact current operation/);
    expect(runtime.store.read('current-visual-for-verdict')?.verdict).toBeUndefined();
    expect(first.preview.sha256).toBe(after.sha256);
  });

  it('inlines a fitting Guard-cycle visual review and preserves explicit exact redelivery without a preview recapture', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-review-package-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const before = jpegMeta(dir, 'review-before.jpg', 30);
    const after = jpegMeta(dir, 'review-after.jpg', 180);
    const beforeFocus = jpegMeta(dir, 'review-before-focus.jpg', 35);
    const afterFocus = jpegMeta(dir, 'review-after-focus.jpg', 185);
    const crop = { left: 100, top: 50, right: 300, bottom: 250 };
    let previewCalls = 0;
    let mutationCalls = 0;

    registry.register('photoshop_get_preview', {
      tool: {
        name: 'photoshop_get_preview',
        description: 'review package preview fixture',
        inputSchema: { type: 'object', properties: { document_id: { type: 'number' } } },
      },
      handler: async () => {
        const frame = previewCalls++ === 0 ? before : after;
        const focus = previewCalls === 1 ? beforeFocus : afterFocus;
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ...frame,
            canvas_width: 400,
            canvas_height: 300,
            scale_x: 0.12,
            scale_y: 0.16,
            focus: {
              ...focus,
              region: crop,
              scale_x: 0.24,
              scale_y: 0.24,
            },
          }) }],
        };
      },
    });
    registry.register('photoshop_paint_dabs', {
      tool: {
        name: 'photoshop_paint_dabs',
        description: 'review package mutation fixture',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, dabs: { type: 'array' } },
          required: ['dabs'],
        },
      },
      handler: async () => {
        mutationCalls += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'paint changed' }) }] };
      },
    });
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/review-package-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });

    const cycleTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_cycle_auto')!;
    const publicResult = await cycleTool.handler({
      next_pass: {
        request_key: 'review-package-operation',
        document_id: 42,
        goal: 'Create a visual pass with whole-frame and crop review evidence',
        region: 'review-crop',
        region_bounds: crop,
        stage: 'FORM',
        scale: 'small',
        significance_mode: 'subtle_local',
        actions: [{
          id: 'review-paint',
          tool: 'photoshop_paint_dabs',
          args: { dabs: [{ x: 150, y: 120 }] },
        }],
      },
    });

    expect(previewCalls).toBe(2);
    expect(mutationCalls).toBe(1);
    expect(publicResult.content.filter((item: any) => item.type === 'image')).toHaveLength(4);
    const body = JSON.parse((publicResult.content[0] as any).text);
    expect(body.visual_review).toMatchObject({
      operation_id: 'review-package-operation',
      document_id: 42,
      visual_observation: 'required',
      goal_confirmation: 'pending_verdict',
      comparison: {
        whole_frame_comparable: true,
        focus_comparable: true,
        before_document_matched: true,
        after_document_matched: true,
      },
      after: {
        role: 'after',
        source_operation_id: 'review-package-operation',
        document_id: 42,
        canvas: { width: 400, height: 300, provenance: 'capture_metadata' },
        crop: {
          region: crop,
          width: 48,
          height: 48,
          scale: { x: 0.24, y: 0.24 },
        },
      },
      before: {
        role: 'before',
        source_operation_id: 'review-package-operation',
        document_id: 42,
      },
      delivery: {
        transport: 'mcp_image_content_explicit_review',
        delivery_complete: true,
        delivered: [
          expect.objectContaining({ role: 'after', sha256: after.sha256 }),
          expect.objectContaining({ role: 'after_crop', sha256: afterFocus.sha256 }),
          expect.objectContaining({ role: 'before_crop', sha256: beforeFocus.sha256 }),
          expect.objectContaining({ role: 'before', sha256: before.sha256 }),
        ],
      },
    });
    const reviewTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_review_image')!;
    const projectionSpy = vi.spyOn(runtime.store, 'captureProjectionContext');
    const paintingStateSpy = vi.spyOn(runtime.store, 'paintingState');
    const reviewResult = await reviewTool.handler({ operation_id: 'review-package-operation' });
    expect(projectionSpy).toHaveBeenCalledTimes(1);
    expect(paintingStateSpy).toHaveBeenCalledTimes(1);
    expect(reviewResult.content.filter((item: any) => item.type === 'image')).toHaveLength(4);
    const reviewBody = JSON.parse((reviewResult.content[0] as any).text);
    expect(reviewBody.delivery).toMatchObject({
      delivery_complete: true,
      undelivered_roles: [],
      delivered: [
        expect.objectContaining({ role: 'after', sha256: after.sha256 }),
        expect.objectContaining({ role: 'after_crop', sha256: afterFocus.sha256 }),
        expect.objectContaining({ role: 'before_crop', sha256: beforeFocus.sha256 }),
        expect.objectContaining({ role: 'before', sha256: before.sha256 }),
      ],
    });

    const secondPublicResult = await cycleTool.handler({
      previous_operation_id: 'review-package-operation',
      previous_observation: compactObservationFromVerdict({
        verdict: 'improvement',
        disposition: 'accept',
        observations: [{ region: 'whole frame', visible: 'The after fixture is visibly brighter than the before fixture.' }],
        primary_mismatch: 'No blocking mismatch is visible in this synthetic fixture.',
        observed_change: 'The after fixture is visibly brighter than the comparable before fixture.',
        target_resolved: 'yes',
        regressions: [],
        uncertainty: 'none observed in the synthetic fixture',
        global_readability: 'improved',
        primitive_footprint: 'none',
        trend_signals: [],
      }),
      next_pass: {
        request_key: 'review-package-operation-2',
        document_id: 42,
        goal: 'Run an ordinary second visual pass from the current captured baseline',
        region: 'review-crop',
        region_bounds: crop,
        stage: 'FORM',
        scale: 'global',
        actions: [{
          id: 'review-paint-2',
          tool: 'photoshop_paint_dabs',
          args: { dabs: [{ x: 160, y: 130 }] },
        }],
      },
    });

    expect(previewCalls).toBe(3); // first pass: before+after; normal continuation: after only
    expect(mutationCalls).toBe(2);
    expect(secondPublicResult.content.filter((item: any) => item.type === 'image')).toHaveLength(2);
    const secondBody = JSON.parse((secondPublicResult.content[0] as any).text);
    expect(secondBody.visual_review.before.source_operation_id).toBe('review-package-operation');
    expect(secondBody.visual_review.after.source_operation_id).toBe('review-package-operation-2');
    expect(secondBody.visual_review.delivery_policy.before_delivery).toBe('metadata_only_prior_frame_already_available');
    expect(secondBody.visual_review.delivery.delivered.map((item: any) => item.role)).toEqual(['after', 'after_crop']);
    expect(secondBody.visual_review.delivery.delivery_complete).toBe(true);
  });

  it('escalates a structured local finding with read-only crop evidence for the same operation before allowing the next mutation', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-multiscale-escalation-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const before = jpegMeta(dir, 'multiscale-before.jpg', 25);
    const after = jpegMeta(dir, 'multiscale-after.jpg', 180);
    const micro = jpegMeta(dir, 'multiscale-micro.jpg', 205);
    let previewCalls = 0;
    let mutationCalls = 0;

    registry.register('photoshop_get_preview', {
      tool: {
        name: 'photoshop_get_preview',
        description: 'multiscale review preview fixture',
        inputSchema: { type: 'object', properties: { document_id: { type: 'number' } } },
      },
      handler: async (args: any) => {
        previewCalls += 1;
        const whole = previewCalls === 1 ? before : after;
        const focus = args.focus_region ? {
          ...micro,
          region: args.focus_region,
          scale_x: 1,
          scale_y: 1,
        } : undefined;
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ...whole,
            canvas_width: 400,
            canvas_height: 300,
            scale_x: whole.width / 400,
            scale_y: whole.height / 300,
            ...(focus ? { focus } : {}),
          }) }],
        };
      },
    });
    registry.register('photoshop_set_layer_opacity', {
      tool: {
        name: 'photoshop_set_layer_opacity',
        description: 'multiscale review mutation fixture',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, opacity: { type: 'number' } },
          required: ['opacity'],
        },
      },
      handler: async () => {
        mutationCalls += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'opacity changed' }) }] };
      },
    });

    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/multiscale-review-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const cycleTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_cycle_auto')!;

    const firstPublicResult = await cycleTool.handler({
      next_pass: {
        request_key: 'multiscale-source-operation',
        problem_id: 'global-tone-pass',
        document_id: 42,
        goal: 'Make one global visual change before local review',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'opacity-pass', tool: 'photoshop_set_layer_opacity', args: { opacity: 70 } }],
      },
    });
    const firstBody = JSON.parse((firstPublicResult.content[0] as any).text);
    expect(firstBody.visual_review.review_profile).toMatchObject({ level: 'composition', require_region: false });
    expect(mutationCalls).toBe(1);
    expect(previewCalls).toBe(2);
    const reviewTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_review_image')!;
    const initialReview = await reviewTool.handler({ operation_id: 'multiscale-source-operation' });
    expect(initialReview.content.filter((item: any) => item.type === 'image')).toHaveLength(2);

    const requested = { left: 120, top: 80, right: 180, bottom: 140 };
    const escalatedPublicResult = await cycleTool.handler({
      previous_operation_id: 'multiscale-source-operation',
      previous_observation: {
        observed: 'A small edge transition remains too uncertain to judge from the whole-frame overview.',
        target: 'unresolved',
        action: 'correct',
        review_findings: [{
          kind: 'edge_transition',
          region_bounds: requested,
          severity: 'must-fix',
        }],
      },
      next_pass: {
        request_key: 'multiscale-deferred-next',
        problem_id: 'deferred-followup',
        document_id: 42,
        goal: 'This mutation must remain deferred until the original review closes',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'deferred-opacity', tool: 'photoshop_set_layer_opacity', args: { opacity: 60 } }],
      },
    });
    const escalatedBody = JSON.parse((escalatedPublicResult.content[0] as any).text);

    expect(mutationCalls).toBe(1);
    expect(previewCalls).toBe(3);
    expect(escalatedBody.execution.operation_id).toBe('multiscale-source-operation');
    expect(escalatedBody.closed_previous).toEqual({ closed: false });
    expect(escalatedBody.review_escalation).toMatchObject({
      operation_id: 'multiscale-source-operation',
      read_only: true,
      mutation_replayed: false,
      next_mutation_dispatched: false,
      captured_roles: ['micro_after_1'],
    });
    expect(escalatedBody.visual_review.review_state).toMatchObject({
      operation_id: 'multiscale-source-operation',
      required_review_level: 'micro',
      state: 'awaiting_observation',
    });
    expect(escalatedBody.visual_review.review_evidence).toHaveLength(1);
    expect(escalatedBody.visual_review.review_evidence[0]).toMatchObject({
      role: 'micro_after_1',
      finding_kind: 'edge_transition',
      review_level: 'micro',
      requested_region: requested,
      document_id: 42,
      bound_whole_sha256: after.sha256,
      sha256: micro.sha256,
      materialized_for_review: true,
    });
    expect(escalatedBody.visual_review.review_evidence[0].effective_region).toEqual({
      left: 108,
      top: 68,
      right: 192,
      bottom: 152,
    });
    expect(escalatedBody.visual_review.delivery.delivered).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'after', sha256: after.sha256, image_delivered_for_review: true }),
    ]));
    expect(escalatedBody.visual_review.delivery.delivered).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'micro_after_1', sha256: micro.sha256, image_delivered_for_review: true }),
    ]));
    expect(escalatedBody.visual_review.delivery.undelivered_roles).not.toContain('micro_after_1');
    expect(runtime.store.read('multiscale-source-operation')?.verdict).toBeUndefined();

    const microReview = await reviewTool.handler({
      operation_id: 'multiscale-source-operation',
      roles: ['micro_after_1'],
    });
    expect(microReview.content.filter((item: any) => item.type === 'image')).toHaveLength(1);
    expect(runtime.store.visualDeliveryDebt(runtime.store.read('multiscale-source-operation'))).toBeNull();

    const status = runtime.store.statusCompact() as any;
    const pending = status.pending_visual_verdict_details.find((item: any) => item.operation_id === 'multiscale-source-operation');
    expect(pending.review_state.required_review_level).toBe('micro');
    expect(pending.review_evidence[0]).toMatchObject({
      requested_region: requested,
      effective_region: { left: 108, top: 68, right: 192, bottom: 152 },
      bound_whole_sha256: after.sha256,
    });

    const resumed = runtime.store.resume(42) as any;
    expect(resumed.pending_visual_verdict).toMatchObject({
      operation_id: 'multiscale-source-operation',
      review_state: { required_review_level: 'micro' },
    });

    const closedAndContinued = await cycleTool.handler({
      previous_operation_id: 'multiscale-source-operation',
      previous_observation: {
        observed: 'The escalated crop now makes the edge transition readable; the local target remains unresolved and needs a later correction.',
        target: 'unresolved',
        action: 'correct',
      },
      next_pass: {
        request_key: 'multiscale-deferred-next',
        problem_id: 'deferred-followup',
        document_id: 42,
        goal: 'Run the deferred mutation only after the original visual operation closes',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'deferred-opacity', tool: 'photoshop_set_layer_opacity', args: { opacity: 60 } }],
      },
    });
    const continuedBody = JSON.parse((closedAndContinued.content[0] as any).text);
    expect(mutationCalls).toBe(2);
    expect(continuedBody.closed_previous).toMatchObject({
      closed: true,
      operation_id: 'multiscale-source-operation',
      verdict_recorded: true,
    });
    expect(runtime.store.read('multiscale-source-operation')?.pending_review).toBeUndefined();
    expect(runtime.store.read('multiscale-source-operation')?.verdict).toBeTruthy();
  });

  it('escalates structured runtime uncertainty from overview to OBJECT then MICRO on the same operation without mutation replay', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-uncertainty-escalation-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const before = jpegMeta(dir, 'uncertainty-before.jpg', 30);
    const after = jpegMeta(dir, 'uncertainty-after.jpg', 185);
    const objectCrop = jpegMeta(dir, 'uncertainty-object.jpg', 195);
    const microCrop = jpegMeta(dir, 'uncertainty-micro.jpg', 210);
    let previewCalls = 0;
    let focusCalls = 0;
    let mutationCalls = 0;

    registry.register('photoshop_get_preview', {
      tool: {
        name: 'photoshop_get_preview',
        description: 'structured uncertainty review fixture',
        inputSchema: { type: 'object', properties: { document_id: { type: 'number' } } },
      },
      handler: async (args: any) => {
        previewCalls += 1;
        const whole = previewCalls === 1 ? before : after;
        let focus;
        if (args.focus_region) {
          focusCalls += 1;
          const crop = focusCalls === 1 ? objectCrop : microCrop;
          focus = { ...crop, region: args.focus_region, scale_x: 1, scale_y: 1 };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ...whole,
            canvas_width: 400,
            canvas_height: 300,
            scale_x: whole.width / 400,
            scale_y: whole.height / 300,
            ...(focus ? { focus } : {}),
          }) }],
        };
      },
    });
    registry.register('photoshop_set_layer_opacity', {
      tool: {
        name: 'photoshop_set_layer_opacity',
        description: 'uncertainty source mutation',
        inputSchema: {
          type: 'object',
          properties: { document_id: { type: 'number' }, opacity: { type: 'number' } },
          required: ['opacity'],
        },
      },
      handler: async () => {
        mutationCalls += 1;
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
      },
    });

    const runtime = runtimeFor(registry, dir);
    runtime.artRun({
      document_id: 42,
      process_dir: 'processes/uncertainty-review-process/run-01',
      commentary_mode: 'technical',
      painting_profile: 'simple_graphic',
    });
    const cycleTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_cycle_auto')!;
    await cycleTool.handler({
      next_pass: {
        request_key: 'uncertainty-source-operation',
        problem_id: 'uncertain-local-read',
        document_id: 42,
        goal: 'Make one global change, then verify an uncertain local relationship at increasing scale.',
        region: 'whole-canvas',
        stage: 'FORM',
        scale: 'global',
        actions: [{ id: 'opacity-pass', tool: 'photoshop_set_layer_opacity', args: { opacity: 72 } }],
      },
    });
    expect(mutationCalls).toBe(1);
    const reviewTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_review_image')!;
    const overviewReview = await reviewTool.handler({ operation_id: 'uncertainty-source-operation' });
    expect(overviewReview.content.filter((item: any) => item.type === 'image')).toHaveLength(2);

    const objectRegion = { left: 90, top: 60, right: 230, bottom: 200 };
    const objectResult = await cycleTool.handler({
      previous_operation_id: 'uncertainty-source-operation',
      previous_observation: {
        observed: 'The overview is sufficient globally, but the bounded local relationship remains uncertain.',
        target: 'uncertain',
        uncertainty_review: { after_level: 'composition', region_bounds: objectRegion },
      },
    });
    const objectBody = JSON.parse((objectResult.content[0] as any).text);
    expect(mutationCalls).toBe(1);
    expect(objectBody.execution.operation_id).toBe('uncertainty-source-operation');
    expect(objectBody.review_escalation).toMatchObject({
      operation_id: 'uncertainty-source-operation',
      read_only: true,
      mutation_replayed: false,
      next_mutation_dispatched: false,
      captured_roles: ['object_after_1'],
    });
    expect(objectBody.visual_review.review_state).toMatchObject({
      trigger: 'runtime_uncertainty',
      uncertainty_after_level: 'composition',
      required_review_level: 'object',
    });
    const objectReview = await reviewTool.handler({
      operation_id: 'uncertainty-source-operation',
      roles: ['object_after_1'],
    });
    expect(objectReview.content.filter((item: any) => item.type === 'image')).toHaveLength(1);

    const tighter = { left: 130, top: 105, right: 170, bottom: 145 };
    const microResult = await cycleTool.handler({
      previous_operation_id: 'uncertainty-source-operation',
      previous_observation: {
        observed: 'The object crop narrows the issue, but the exact edge junction remains uncertain.',
        target: 'uncertain',
        uncertainty_review: {
          after_level: 'object',
          region_bounds: objectRegion,
          tighter_region_bounds: tighter,
        },
      },
    });
    const microBody = JSON.parse((microResult.content[0] as any).text);
    expect(mutationCalls).toBe(1);
    expect(focusCalls).toBe(2);
    expect(microBody.execution.operation_id).toBe('uncertainty-source-operation');
    expect(microBody.review_escalation).toMatchObject({
      operation_id: 'uncertainty-source-operation',
      mutation_replayed: false,
      captured_roles: ['micro_after_2'],
    });
    expect(microBody.visual_review.review_state).toMatchObject({
      trigger: 'runtime_uncertainty',
      uncertainty_after_level: 'object',
      required_review_level: 'micro',
    });
    expect(microBody.visual_review.review_evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ review_level: 'object', requested_region: objectRegion }),
      expect.objectContaining({ review_level: 'micro', requested_region: tighter }),
    ]));

    const status = runtime.store.statusCompact() as any;
    expect(status.pending_visual_verdict_details.find((item: any) => item.operation_id === 'uncertainty-source-operation'))
      .toMatchObject({ review_state: { trigger: 'runtime_uncertainty', required_review_level: 'micro' } });
    const resumed = runtime.store.resume(42) as any;
    expect(resumed.pending_visual_verdict).toMatchObject({
      operation_id: 'uncertainty-source-operation',
      review_state: { trigger: 'runtime_uncertainty', required_review_level: 'micro' },
    });
  });

  it('keeps completed async job poll reference-only and delivers review bytes only through the explicit review tool', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-async-review-delivery-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const frame = jpegMeta(dir, 'async-review-after.jpg', 170);
    runtime.store.write({
      id: 'async-review-operation',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
      summary: 'Async review delivery fixture',
      purpose: 'Verify completed job polling carries existing visual-review pixels',
      hash: 'async-review-operation-hash',
      sequence: 1,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      phase: 'completed',
      execution: 'completed',
      visual: true,
      failed: false,
      preview: {
        ...frame,
        document_id: 42,
        canvas_width: frame.width,
        canvas_height: frame.height,
      },
    });
    const runtimeDirectory = path.join(dir, 'controller');
    const created = createJob(runtimeDirectory, {
      next_operation: {
        id: 'async-review-operation',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 50 },
        summary: 'Async review delivery fixture',
        purpose: 'Verify completed job polling carries existing visual-review pixels',
      },
    }, {
      progress_id: 'async-review-delivery',
      operation_id: 'async-review-operation',
      state: 'starting',
      now: 'fixture',
      why: 'fixture',
      photoshop: 'fixture',
      next: 'poll',
      text: 'fixture',
    });
    writeJobStarted(created.dir, { progress_state: 'running' });
    writeJobResult(created.dir, {
      mode: 'photoshop-mcp-cycle',
      execution: {
        operation_id: 'async-review-operation',
        tool: 'photoshop_set_layer_opacity',
        phase: 'completed',
        failed: false,
      },
      visual_review: {
        protocol: 'photoshop.guard.visual_review.v1',
        operation_id: 'async-review-operation',
        document_id: 42,
        after: {
          role: 'after',
          source_operation_id: 'async-review-operation',
          document_id: 42,
          sha256: frame.sha256,
          mime_type: 'image/jpeg',
          width: frame.width,
          height: frame.height,
          materialized_path: frame.materialized_path,
        },
        before: null,
        comparison: { whole_frame_comparable: false, focus_comparable: false, status: 'unconfirmed' },
        delivery_policy: {
          preferred_content_order: ['after'],
          before_delivery: 'unavailable',
        },
      },
    });
    writeJobCompleted(created.dir, 0, { embedded_guard: true, has_result: true });

    const pollTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_job_poll')!;
    const publicResult = await pollTool.handler({ job_id: created.jobId });
    const images = publicResult.content.filter((item: any) => item.type === 'image');
    expect(images).toHaveLength(0);
    const body = JSON.parse((publicResult.content[0] as any).text);
    expect(body.state).toBe('completed');
    expect(body.result.visual_review.delivery).toMatchObject({
      transport: 'materialized_reference',
      delivered: [],
      delivery_complete: false,
      references: [expect.objectContaining({ role: 'after', sha256: frame.sha256 })],
    });
    const reviewTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_review_image')!;
    const reviewed = await reviewTool.handler({ operation_id: 'async-review-operation' });
    const reviewedImages = reviewed.content.filter((item: any) => item.type === 'image');
    expect(reviewedImages).toHaveLength(1);
    expect((reviewedImages[0] as any).data).toBe(readFileSync(frame.materialized_path).toString('base64'));
    const reviewedBody = JSON.parse((reviewed.content[0] as any).text);
    expect(reviewedBody.delivery).toMatchObject({
      delivery_complete: true,
      undelivered_roles: [],
      delivered: [expect.objectContaining({ role: 'after', sha256: frame.sha256 })],
      timing: expect.objectContaining({
        protocol: 'photoshop.guard.continuation_timing.v1',
        request_received_at: expect.any(String),
        result_ready_at: expect.any(String),
      }),
    });
    expect(runtime.store.read('async-review-operation')?.continuation_timing).toMatchObject({
      protocol: 'photoshop.guard.continuation_timing.v1',
      review_image_request_received_at: expect.any(String),
      review_image_result_ready_at: expect.any(String),
      review_image_delivery_complete: true,
    });

    const statusTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_status')!;
    const reviewFinished = await statusTool.handler({
      diagnostic_timing_marker: { operation_id: 'async-review-operation', phase: 'review_finished' },
    });
    const reviewFinishedBody = JSON.parse((reviewFinished.content[0] as any).text);
    expect(reviewFinishedBody).toMatchObject({
      ok: true,
      mode: 'diagnostic-continuation-timing-marker',
      diagnostic_timing_marker: {
        operation_id: 'async-review-operation',
        phase: 'review_finished',
        marker_semantics: 'server_observed_diagnostic_boundary',
      },
    });
    expect(reviewFinishedBody.paint_readiness).toBeUndefined();

    const passReady = await statusTool.handler({
      diagnostic_timing_marker: { operation_id: 'async-review-operation', phase: 'next_pass_ready' },
    });
    const passReadyBody = JSON.parse((passReady.content[0] as any).text);
    expect(passReadyBody).toMatchObject({
      ok: true,
      mode: 'diagnostic-continuation-timing-marker',
      diagnostic_timing_marker: {
        operation_id: 'async-review-operation',
        phase: 'next_pass_ready',
      },
    });
    expect(runtime.store.read('async-review-operation')?.continuation_timing).toMatchObject({
      review_finished_marker_received_at: expect.any(String),
      next_pass_ready_marker_received_at: expect.any(String),
    });
  });

  it('keeps a completed job successful when one materialized review image cannot be read', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-review-read-failure-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const sourceFrame = jpegMeta(dir, 'read-failure-source.jpg', 150);
    const badPath = path.join(dir, 'not-an-image-file');
    mkdirSync(badPath);
    runtime.store.write({
      id: 'async-review-read-failure',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
      summary: 'Unreadable review image fixture',
      purpose: 'Verify delivery debt blocks closure until the same review bytes are delivered',
      hash: 'async-review-read-failure-hash',
      sequence: 1,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      phase: 'completed',
      execution: 'completed',
      visual: true,
      failed: false,
      preview: {
        ...sourceFrame,
        sha256: sourceFrame.sha256,
        materialized_path: badPath,
        document_id: 42,
        canvas_width: sourceFrame.width,
        canvas_height: sourceFrame.height,
      },
      report: {
        did: 'Completed the visual mutation once.',
        why: 'The fixture isolates model-facing delivery debt.',
        result: 'Mutation pixels exist; delivery remains unresolved.',
      },
    });
    const runtimeDirectory = path.join(dir, 'controller');
    const created = createJob(runtimeDirectory, {
      next_operation: {
        id: 'async-review-read-failure',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 50 },
        summary: 'Unreadable review image fixture',
        purpose: 'Verify delivery failure does not erase a completed durable job result',
      },
    }, {
      progress_id: 'async-review-read-failure', operation_id: 'async-review-read-failure',
      state: 'starting', now: 'fixture', why: 'fixture', photoshop: 'fixture', next: 'poll', text: 'fixture',
    });
    writeJobStarted(created.dir, { progress_state: 'running' });
    writeJobResult(created.dir, {
      mode: 'photoshop-mcp-cycle',
      execution: { operation_id: 'async-review-read-failure', tool: 'photoshop_set_layer_opacity', phase: 'completed', failed: false },
      visual_review: {
        protocol: 'photoshop.guard.visual_review.v1', operation_id: 'async-review-read-failure', document_id: 42,
        after: { role: 'after', source_operation_id: 'async-review-read-failure', document_id: 42, sha256: sourceFrame.sha256, mime_type: 'image/jpeg', width: sourceFrame.width, height: sourceFrame.height, materialized_path: badPath },
        before: null,
        comparison: { status: 'unconfirmed' },
        delivery_policy: { preferred_content_order: ['after'], before_delivery: 'unavailable' },
      },
    });
    writeJobCompleted(created.dir, 0, { embedded_guard: true, has_result: true });

    const pollTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_job_poll')!;
    const publicResult = await pollTool.handler({ job_id: created.jobId });
    expect(publicResult.isError).not.toBe(true);
    const body = JSON.parse((publicResult.content[0] as any).text);
    expect(body.state).toBe('completed');
    expect(body.result.visual_review.delivery).toMatchObject({
      transport: 'materialized_reference',
      delivery_complete: false,
      undelivered_roles: ['after'],
      omitted: [expect.objectContaining({ role: 'after', reason: 'materialized_reference_not_file' })],
    });
    expect(runtime.store.visualDeliveryDebt(runtime.store.read('async-review-read-failure'))).toMatchObject({
      state: 'redelivery_required',
      undelivered_roles: ['after'],
      mutation_replay_allowed: false,
    });
    expect((runtime.store.statusCompact() as any).pending_visual_verdict_details
      .find((item: any) => item.operation_id === 'async-review-read-failure')?.delivery_debt)
      .toMatchObject({ state: 'redelivery_required', undelivered_roles: ['after'] });
    expect((runtime.store.resume(42) as any).pending_visual_verdict.delivery_debt)
      .toMatchObject({ state: 'redelivery_required', undelivered_roles: ['after'] });
    expect(() => runtime.store.closePreviousCycle({
      previous_operation_id: 'async-review-read-failure',
      previous_visual_verdict: {},
    })).toThrow(/model-facing image delivery debt/);

    rmSync(badPath, { recursive: true, force: true });
    writeFileSync(badPath, readFileSync(sourceFrame.materialized_path));
    const reviewTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_review_image')!;
    const redelivered = await reviewTool.handler({ operation_id: 'async-review-read-failure' });
    expect(redelivered.content.filter((item: any) => item.type === 'image')).toHaveLength(1);
    const redeliveredBody = JSON.parse((redelivered.content[0] as any).text);
    expect(redeliveredBody.delivery).toMatchObject({
      delivery_complete: true,
      undelivered_roles: [],
      delivered: [expect.objectContaining({ role: 'after', sha256: sourceFrame.sha256 })],
    });
    expect(runtime.store.visualDeliveryDebt(runtime.store.read('async-review-read-failure'))).toBeNull();
    expect(runtime.store.read('async-review-read-failure')?.verdict).toBeUndefined();
    expect(runtime.store.records().filter((record: any) => record.id === 'async-review-read-failure')).toHaveLength(1);
  });

  it('defaults legacy review delivery to the after frame and never reports complete without delivering it', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-review-policy-fallback-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const frame = jpegMeta(dir, 'legacy-policy-after.jpg', 120);
    runtime.store.write({
      id: 'legacy-policy-review',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
      summary: 'Legacy delivery policy fixture',
      purpose: 'Verify expected roles are derived safely when policy metadata is absent',
      hash: 'legacy-policy-review-hash',
      sequence: 1,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      phase: 'completed',
      execution: 'completed',
      visual: true,
      failed: false,
      preview: {
        ...frame,
        document_id: 42,
        canvas_width: frame.width,
        canvas_height: frame.height,
      },
    });
    const runtimeDirectory = path.join(dir, 'controller');
    const created = createJob(runtimeDirectory, {
      next_operation: {
        id: 'legacy-policy-review', tool: 'photoshop_set_layer_opacity', args: { document_id: 42, opacity: 50 },
        summary: 'Legacy delivery policy fixture', purpose: 'Verify expected roles are derived safely when policy metadata is absent',
      },
    }, {
      progress_id: 'legacy-policy-review', operation_id: 'legacy-policy-review',
      state: 'starting', now: 'fixture', why: 'fixture', photoshop: 'fixture', next: 'poll', text: 'fixture',
    });
    writeJobStarted(created.dir, { progress_state: 'running' });
    writeJobResult(created.dir, {
      mode: 'photoshop-mcp-cycle',
      execution: { operation_id: 'legacy-policy-review', tool: 'photoshop_set_layer_opacity', phase: 'completed', failed: false },
      visual_review: {
        protocol: 'photoshop.guard.visual_review.v1', operation_id: 'legacy-policy-review', document_id: 42,
        after: { role: 'after', source_operation_id: 'legacy-policy-review', document_id: 42, ...frame },
        before: null, comparison: { status: 'unconfirmed' },
      },
    });
    writeJobCompleted(created.dir, 0, { embedded_guard: true, has_result: true });

    const pollTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_job_poll')!;
    const publicResult = await pollTool.handler({ job_id: created.jobId });
    expect(publicResult.content.filter((item: any) => item.type === 'image')).toHaveLength(0);
    const body = JSON.parse((publicResult.content[0] as any).text);
    expect(body.result.visual_review.delivery).toMatchObject({
      transport: 'materialized_reference',
      delivery_complete: false,
      expected_roles: ['after'],
      undelivered_roles: ['after'],
      delivered: [],
    });
    const reviewTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_review_image')!;
    const reviewed = await reviewTool.handler({ operation_id: 'legacy-policy-review' });
    expect(reviewed.content.filter((item: any) => item.type === 'image')).toHaveLength(1);
    const reviewedBody = JSON.parse((reviewed.content[0] as any).text);
    expect(reviewedBody.delivery).toMatchObject({
      delivery_complete: true,
      expected_roles: ['after'],
      undelivered_roles: [],
      delivered: [expect.objectContaining({ role: 'after', sha256: frame.sha256 })],
    });
  });

  it('budgets encoded MCP image payload rather than accepting a raw file that expands past transport capacity', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-review-encoded-budget-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const file = path.join(dir, 'raw-under-six-mib.bin');
    const bytes = Buffer.alloc(4_600_000, 0x33);
    writeFileSync(file, bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    runtime.store.write({
      id: 'encoded-budget-review',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
      summary: 'Encoded budget fixture',
      purpose: 'Verify response-budget delivery debt blocks visual closure',
      hash: 'encoded-budget-review-hash',
      sequence: 1,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      phase: 'completed',
      execution: 'completed',
      visual: true,
      failed: false,
      preview: {
        sha256,
        materialized_path: file,
        mime_type: 'image/jpeg',
        width: 1,
        height: 1,
        document_id: 42,
        canvas_width: 1,
        canvas_height: 1,
      },
      report: {
        did: 'Completed the visual mutation once.',
        why: 'The fixture isolates response-budget delivery debt.',
        result: 'Artifact exists but cannot fit in the model-facing response budget.',
      },
    });
    const runtimeDirectory = path.join(dir, 'controller');
    const created = createJob(runtimeDirectory, {
      next_operation: {
        id: 'encoded-budget-review', tool: 'photoshop_set_layer_opacity', args: { document_id: 42, opacity: 50 },
        summary: 'Encoded budget fixture', purpose: 'Verify base64 expansion is accounted for before reading/embedding review bytes',
      },
    }, {
      progress_id: 'encoded-budget-review', operation_id: 'encoded-budget-review',
      state: 'starting', now: 'fixture', why: 'fixture', photoshop: 'fixture', next: 'poll', text: 'fixture',
    });
    writeJobStarted(created.dir, { progress_state: 'running' });
    writeJobResult(created.dir, {
      mode: 'photoshop-mcp-cycle',
      execution: { operation_id: 'encoded-budget-review', tool: 'photoshop_set_layer_opacity', phase: 'completed', failed: false },
      visual_review: {
        protocol: 'photoshop.guard.visual_review.v1', operation_id: 'encoded-budget-review', document_id: 42,
        after: { role: 'after', source_operation_id: 'encoded-budget-review', document_id: 42, sha256, mime_type: 'image/jpeg', width: 1, height: 1, materialized_path: file },
        before: null, comparison: { status: 'unconfirmed' },
        delivery_policy: { preferred_content_order: ['after'], before_delivery: 'unavailable' },
      },
    });
    writeJobCompleted(created.dir, 0, { embedded_guard: true, has_result: true });

    const pollTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_job_poll')!;
    const publicResult = await pollTool.handler({ job_id: created.jobId });
    expect(publicResult.content.filter((item: any) => item.type === 'image')).toHaveLength(0);
    const body = JSON.parse((publicResult.content[0] as any).text);
    expect(body.result.visual_review.delivery).toMatchObject({
      transport: 'materialized_reference',
      delivery_complete: false,
      undelivered_roles: ['after'],
    });
    const reviewTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_review_image')!;
    const reviewed = await reviewTool.handler({ operation_id: 'encoded-budget-review' });
    expect(reviewed.content.filter((item: any) => item.type === 'image')).toHaveLength(0);
    const reviewedBody = JSON.parse((reviewed.content[0] as any).text);
    expect(reviewedBody.delivery.omitted).toContainEqual(expect.objectContaining({
      role: 'after',
      reason: 'response_byte_budget',
      bytes: 4_600_000,
      encoded_bytes: 6_133_336,
    }));
    expect(reviewedBody.delivery.delivery_complete).toBe(false);
    expect(runtime.store.visualDeliveryDebt(runtime.store.read('encoded-budget-review'))).toMatchObject({
      state: 'redelivery_required',
      undelivered_roles: ['after'],
      omitted: [expect.objectContaining({ reason: 'response_byte_budget' })],
    });
    expect(() => runtime.store.closePreviousCycle({
      previous_operation_id: 'encoded-budget-review',
      previous_visual_verdict: {},
    })).toThrow(/model-facing image delivery debt/);
  });

  it('enforces the visual-review byte budget on the first image and reports the omission explicitly', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-review-byte-budget-'));
    dirs.push(dir);
    const { registry } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const oversizedPath = path.join(dir, 'oversized-first-review-image.jpg');
    const oversizedBytes = Buffer.alloc(6 * 1024 * 1024 + 1, 0x5a);
    writeFileSync(oversizedPath, oversizedBytes);
    const oversizedSha = createHash('sha256').update(oversizedBytes).digest('hex');
    runtime.store.write({
      id: 'async-review-oversized-first',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 50 },
      summary: 'Oversized first review image fixture',
      purpose: 'Verify the response byte budget is hard from the first candidate image',
      hash: 'async-review-oversized-first-hash',
      sequence: 1,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      phase: 'completed',
      execution: 'completed',
      visual: true,
      failed: false,
      preview: {
        sha256: oversizedSha,
        materialized_path: oversizedPath,
        mime_type: 'image/jpeg',
        width: 1,
        height: 1,
        document_id: 42,
        canvas_width: 1,
        canvas_height: 1,
      },
    });
    const runtimeDirectory = path.join(dir, 'controller');
    const created = createJob(runtimeDirectory, {
      next_operation: {
        id: 'async-review-oversized-first',
        tool: 'photoshop_set_layer_opacity',
        args: { document_id: 42, opacity: 50 },
        summary: 'Oversized first review image fixture',
        purpose: 'Verify the response byte budget is hard from the first candidate image',
      },
    }, {
      progress_id: 'async-review-byte-budget',
      operation_id: 'async-review-oversized-first',
      state: 'starting',
      now: 'fixture',
      why: 'fixture',
      photoshop: 'fixture',
      next: 'poll',
      text: 'fixture',
    });
    writeJobStarted(created.dir, { progress_state: 'running' });
    writeJobResult(created.dir, {
      mode: 'photoshop-mcp-cycle',
      execution: {
        operation_id: 'async-review-oversized-first',
        tool: 'photoshop_set_layer_opacity',
        phase: 'completed',
        failed: false,
      },
      visual_review: {
        protocol: 'photoshop.guard.visual_review.v1',
        operation_id: 'async-review-oversized-first',
        document_id: 42,
        after: {
          role: 'after',
          source_operation_id: 'async-review-oversized-first',
          document_id: 42,
          sha256: oversizedSha,
          mime_type: 'image/jpeg',
          width: 1,
          height: 1,
          materialized_path: oversizedPath,
        },
        before: null,
        comparison: { whole_frame_comparable: false, focus_comparable: false, status: 'unconfirmed' },
        delivery_policy: {
          preferred_content_order: ['after'],
          before_delivery: 'unavailable',
        },
      },
    });
    writeJobCompleted(created.dir, 0, { embedded_guard: true, has_result: true });

    const pollTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_job_poll')!;
    const publicResult = await pollTool.handler({ job_id: created.jobId });
    expect(publicResult.content.filter((item: any) => item.type === 'image')).toHaveLength(0);
    const body = JSON.parse((publicResult.content[0] as any).text);
    expect(body.result.visual_review.delivery).toMatchObject({
      transport: 'materialized_reference',
      delivered: [],
      delivery_complete: false,
      undelivered_roles: ['after'],
      raw_image_bytes: 0,
      max_total_bytes: 6 * 1024 * 1024,
    });
    const reviewTool = createGuardTools(runtime).find(def => def.tool.name === 'photoshop_guard_review_image')!;
    const reviewed = await reviewTool.handler({ operation_id: 'async-review-oversized-first' });
    expect(reviewed.content.filter((item: any) => item.type === 'image')).toHaveLength(0);
    const reviewedBody = JSON.parse((reviewed.content[0] as any).text);
    expect(reviewedBody.delivery).toMatchObject({
      transport: 'metadata_only',
      delivered: [],
      delivery_complete: false,
      undelivered_roles: ['after'],
      raw_image_bytes: 0,
      max_total_bytes: 6 * 1024 * 1024,
      omitted: [{
        role: 'after',
        reason: 'response_byte_budget',
        bytes: 6 * 1024 * 1024 + 1,
        max_total_bytes: 6 * 1024 * 1024,
      }],
    });
  });

  it('does not allow an unconditional improvement claim when no comparable before exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-no-before-improvement-'));
    dirs.push(dir);
    const { registry, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const record = runtime.store.begin({
      id: 'no-before-improvement',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 70 },
      summary: 'Create a direct journal fixture without before evidence',
      purpose: 'Verify comparison claims require comparable before evidence',
      problem_id: 'missing-before',
      scale: 'global',
    }).record;
    runtime.store.markDispatched(record);
    const completed = runtime.store.complete(record, {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'opacity changed' }) }],
    });
    runtime.store.attachPreview(completed.id, {
      content: [{ type: 'text', text: JSON.stringify({ ...after, document_id: 42 }) }],
    });

    expect(() => runtime.store.verdict({
      id: 'no-before-improvement',
      preview_id: 'no-before-improvement',
      sha256: after.sha256,
      verdict: 'improvement',
      disposition: 'accept',
      observations: [{ region: 'whole frame', visible: 'The after frame is visible.' }],
      primary_mismatch: 'There is no comparable before frame for a directional improvement claim.',
      observed_change: 'An after frame exists, but no comparable before establishes improvement.',
      target_resolved: 'no',
      regressions: [],
      uncertainty: 'Before-frame comparison is unavailable.',
      global_readability: 'unknown',
      primitive_footprint: 'none',
      trend_signals: [],
    })).toThrow(/improvement\/regression requires a comparable before preview/);
  });

  it('retains the artistic verdict when same-document BEFORE/AFTER exists but the machine comparison metric is unavailable', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'embedded-guard-unavailable-metric-'));
    dirs.push(dir);
    const { registry, before, after } = fakeRegistry(dir);
    const runtime = runtimeFor(registry, dir);
    const record = runtime.store.begin({
      id: 'same-doc-unavailable-metric',
      tool: 'photoshop_set_layer_opacity',
      args: { document_id: 42, opacity: 70 },
      summary: 'Create a journal fixture with same-document before and after evidence.',
      purpose: 'Verify machine comparison degradation does not rewrite the artistic verdict.',
      problem_id: 'comparison-metric-degraded',
      scale: 'global',
    }).record;
    runtime.store.attachBeforePreview(record.id, {
      content: [{ type: 'text', text: JSON.stringify({ ...before, document_id: 42, width: before.width * 2 }) }],
    });
    const withBefore = runtime.store.read(record.id)!;
    runtime.store.markDispatched(withBefore);
    const completed = runtime.store.complete(withBefore, {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'opacity changed' }) }],
    });
    runtime.store.attachPreview(completed.id, {
      content: [{ type: 'text', text: JSON.stringify({ ...after, document_id: 42 }) }],
    });

    runtime.store.verdict({
      id: record.id,
      preview_id: record.id,
      sha256: after.sha256,
      verdict: 'improvement',
      disposition: 'accept',
      observations: [{ region: 'whole frame', visible: 'The exact after frame visibly resolves the bounded opacity target.' }],
      primary_mismatch: 'No blocking artistic mismatch remains in the bounded target.',
      observed_change: 'The bounded target is visibly resolved in the exact after frame.',
      target_resolved: 'yes',
      regressions: [],
      uncertainty: 'Machine comparison geometry differs, so the numeric metric is unavailable.',
      global_readability: 'unknown',
      primitive_footprint: 'none',
      trend_signals: [],
    });

    expect(runtime.store.read(record.id)?.verdict).toMatchObject({
      verdict: 'improvement',
      artistic_outcome: 'resolved',
      comparison_metric: {
        status: 'unavailable',
        reason: 'BEFORE/AFTER output geometry differs; unrelated scales are not machine-compared.',
      },
    });
  });
});
