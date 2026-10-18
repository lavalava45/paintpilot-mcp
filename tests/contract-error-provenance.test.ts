import { describe, expect, it } from 'vitest';
import { ContractErrorProvenanceObserver, readContractPath, sanitizeContractErrorProvenance } from '../src/core/guard/contract-error-provenance.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { projectCompilerAttemptAudit } from '../src/core/guard/compiler-attempt-audit-projection.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

const report = (input: Record<string, unknown>, item: { code: string; message: string; details?: Record<string, unknown> },
  state: Record<string, unknown> = {}) => {
  const observer = new ContractErrorProvenanceObserver(input);
  return { observer, result: () => observer.report([{ scope: 'next_operation', ...item }], state).findings[0]! };
};
const owner = { hypothesis_id: 'lamp', layer_id: 7, temporary: false };

describe('bounded evidence-based error provenance', () => {
  it('reads only exact, bounded own-property paths', () => {
    const value = { actions: [{ args: { layer_id: 7, nested: { material_role: 'warm' } } }] };
    expect(readContractPath(value, 'actions[0].args.layer_id')).toEqual({ present: true, value: 7 });
    expect(readContractPath(value, 'actions[0].args.missing')).toEqual({ present: false });
    expect(readContractPath(value, '__proto__.polluted')).toEqual({ present: false });
    expect(readContractPath(value, 'actions[99999].args.layer_id')).toEqual({ present: false });
  });

  it('proves field presence, not that the model received or disobeyed an instruction', () => {
    const input = { next_pass: { goal: 'PRIVATE melancholic street scene', logical_layer: { layer_id: 9 } } };
    const { observer, result } = report(input, {
      code: 'technical_binding_conflict', message: 'Submitted owner differs',
      details: { path: 'next_pass.logical_layer.layer_id' },
    });
    observer.capture('semantic_ownership', 'next_pass', { logical_layer: { layer_id: 9 } });
    const origin = result();
    expect(origin.finding).toBe('input_field_present');
    expect(origin.certainty).toBe('proven');
    expect(origin.evidence.map(item => item.stage)).toEqual(['submitted', 'semantic_ownership']);
    expect(origin.evidence[0].value_hmac_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(observer.report([{ scope: 'next_operation', code: 'technical_binding_conflict', message: 'Submitted owner differs', details: { path: 'next_pass.logical_layer.layer_id' } }]))).not.toContain('PRIVATE');
    expect(observer.report([]).instruction_delivery).toBe('not-observed');
    expect(observer.report([]).model_instruction_noncompliance_proven).toBe(false);
  });

  it('proves compiler introduction when authored field was absent', () => {
    const { observer, result } = report({ next_pass: { logical_layer: {} } }, {
      code: 'semantic_layer_owner_missing',
      message: 'Logical owner is missing',
      details: { path: 'next_pass.logical_layer.hypothesis_id' },
    });
    observer.capture('semantic_ownership', 'next_pass', { logical_layer: { hypothesis_id: 'compiler-created' } });
    const origin = result();
    expect(origin.finding).toBe('compiler_output_invalid');
    expect(origin.evidence.map(item => item.presence)).toEqual(['absent', 'present']);
    expect(origin.certainty).toBe('proven');
  });

  it('proves submitted foreign mutation target against the unique durable owner, without retargeting it', () => {
    const input = { next_pass: {
      target_owner_id: 'lamp',
      actions: [{ tool: 'photoshop_paint_regions', args: { regions: [{ layer_id: 9 }] } }],
    } };
    const origin = report(input, {
      code: 'semantic_mutation_target_owner_mismatch',
      message: 'Mutation targeted layer 9 outside owner stack',
    }, { logical_layer_owners: [owner] }).result();
    expect(origin.finding).toBe('authored_conflict_with_durable_binding');
    expect(origin.certainty).toBe('proven');
    expect(origin.state_binding).toEqual({
      owner_registered: true, owner_matches: 1, current_layer_id: 7, requested_layer_id: 9,
    });
    expect((input.next_pass.actions[0].args.regions[0] as { layer_id: number }).layer_id).toBe(9);
  });

  it('does not label a missing durable owner record as ignored instructions', () => {
    const input = { next_pass: { logical_layer: {
      hypothesis_id: 'never-committed', decision: 'continue-logical-layer',
    } } };
    const origin = report(input, {
      code: 'semantic_layer_owner_missing', message: 'No durable owner journal binding',
    }, { logical_layer_owners: [] }).result();
    expect(origin.finding).toBe('durable_owner_binding_absent');
    expect(origin.state_binding?.owner_matches).toBe(0);
    expect(origin.certainty).toBe('proven');
  });

  it('does not make a durable claim when no authoritative owner inventory was supplied', () => {
    const input = { next_pass: { target_owner_id: 'lamp', actions: [{ tool: 'photoshop_paint_regions',
      args: { regions: [{ layer_id: 9 }] } }] } };
    const origin = report(input, {
      code: 'semantic_mutation_target_owner_mismatch', message: 'Foreign target',
    }).result();
    expect(origin.finding).toBe('input_field_present');
    expect(origin.state_binding).toBeUndefined();
  });

  it('recognizes invalid compiled paint_strategy without claiming anything about delivered prompts', () => {
    const { observer, result } = report({ next_pass: { material_role: undefined } }, {
      code: 'tool_schema_invalid',
      message: 'args.paint_strategy.material_role must be a string',
    });
    observer.capture('operation_compiled', 'next_operation',
      { args: { paint_strategy: { material_role: undefined } } });
    const origin = result();
    expect(origin.path).toBe('next_operation.args.paint_strategy.material_role');
    expect(origin.finding).toBe('compiler_output_invalid');
    expect(origin.evidence[0].value_type).toBe('undefined');
  });

  it('does not attribute a directly submitted executable payload to the compiler', () => {
    const { observer, result } = report({
      next_operation: { args: { paint_strategy: { material_role: 7 } } },
    }, {
      code: 'tool_schema_invalid', message: 'args.paint_strategy.material_role must be string',
    });
    observer.capture('operation_compiled', 'next_operation',
      { args: { paint_strategy: { material_role: 7 } } });
    expect(result().finding).toBe('input_field_present');
  });

  it('labels an unstructured VisualMicroPlan failure as unattributed rather than blaming the model', () => {
    const origin = report({ next_pass: { goal: 'wide shot' } }, {
      code: 'invalid_visual_microplan', message: 'Execution preflight returned an opaque error',
    }).result();
    expect(origin.path).toBe('next_operation.args.steps');
    expect(origin.finding).toBe('unattributed');
    expect(origin.certainty).toBe('insufficient-evidence');
  });

  it('recognizes intrinsic Guard schema conflicts and missing compiler output as server-side defects', () => {
    const observer = new ContractErrorProvenanceObserver({ next_pass: { goal: 'scene' } });
    const findings = observer.report([
      { scope: 'next_operation', code: 'guard_requirement_conflict', message: 'Contradictory requirements' },
      { scope: 'next_operation', code: 'guard_requirement_unexpressible', message: 'Runtime requirement absent in public schema' },
      { scope: 'next_operation', code: 'compiled_operation_missing', message: 'No operation emitted' },
    ]).findings;
    expect(findings.map(item => item.finding)).toEqual([
      'contract_spec_conflict', 'contract_spec_conflict', 'compiler_pipeline_failure',
    ]);
    expect(findings.every(item => item.certainty === 'proven')).toBe(true);
    expect(findings.every(item => item.path === null)).toBe(true);
  });

  it('never emits raw prompts, images or unlimited diagnostics', () => {
    const privateText = 'A_PRIVATE_USER_BRIEF_NOT_FOR_LOGS';
    const data = { next_pass: { goal: privateText, actions: new Array(1).fill({
      tool: 'photoshop_get_preview', args: { image_base64: privateText.repeat(10) },
    }) } };
    const observer = new ContractErrorProvenanceObserver(data);
    observer.capture('semantic_identity', 'next_pass', data.next_pass);
    const violations = Array.from({ length: 35 }, (_, i) => ({
      scope: 'next_operation' as const, code: `err_${i}`,
      message: 'Private field', details: { path: 'next_pass.actions' },
    }));
    const result = observer.report(violations);
    expect(result.findings).toHaveLength(24);
    expect(result.remaining_count).toBe(11);
    expect(JSON.stringify(result)).not.toContain(privateText);
    expect(result.photoshop_mutation_started).toBe(false);
  });

  it('rejects untrusted journal fields while preserving only typed, bounded witnesses', () => {
    const origin = report({ next_pass: { logical_layer: { hypothesis_id: 'lamp' } } }, {
      code: 'semantic_layer_owner_missing', message: 'No binding',
    }).observer.report([{ scope: 'next_operation', code: 'semantic_layer_owner_missing', message: 'No binding' }]);
    const contaminated = {
      ...origin,
      private_prompt: 'NEVER_PERSIST_THIS_USER_TEXT',
      findings: origin.findings.map(item => ({ ...item, unsafe_raw_args: 'NEVER_PERSIST_THIS_USER_TEXT',
        evidence: item.evidence.map(field => ({ ...field, user_payload: 'NEVER_PERSIST_THIS_USER_TEXT' })),
      })),
    };
    const sanitized = sanitizeContractErrorProvenance(contaminated);
    expect(sanitized).toBeDefined();
    expect(JSON.stringify(sanitized)).not.toContain('NEVER_PERSIST_THIS_USER_TEXT');
    expect(sanitized?.model_instruction_noncompliance_proven).toBe(false);
    expect(sanitizeContractErrorProvenance({ ...origin, findings: new Array(25).fill(origin.findings[0]) }))
      .toBeUndefined();
    expect(sanitizeContractErrorProvenance({ ...origin, findings: origin.findings.map(item => ({
      ...item, evidence: item.evidence.map(field => ({ ...field, path: 'next_pass.secret field' })),
    })) })).toBeUndefined();
  });

  it('persists the sanitized rejection provenance without changing the execution outcome', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'contract-origin-'));
    try {
      const runtime = new EmbeddedGuardRuntime(new ToolRegistry(), {
        workspaceRoot: root, runtimeDirectory: path.join(root, 'controller'),
        previewBarrierDirectory: path.join(root, 'barriers'),
        executionLeaseFile: path.join(root, 'execution.lock'), processVideoTraceEnabled: false,
      });
      const observer = new ContractErrorProvenanceObserver({ next_pass: { request_key: 'failure-x' } });
      const provenance = observer.report([{ scope: 'next_operation', code: 'semantic_layer_owner_missing',
        message: 'Missing owner', details: { path: 'next_pass.logical_layer' } }]);
      const rejection = { cycle_fingerprint: 'input-1', rejection_fingerprint: 'reject-1',
        error_codes: ['semantic_layer_owner_missing'], contract_error_provenance: provenance };
      vi.spyOn(runtime, 'cycle').mockResolvedValueOnce({
        preflight_rejection: rejection, execution: { execution: 'not-executed' },
        next_state: 'terminal_not_executed',
      } as any);
      const result = await runtime.cycleAuto({
        next_pass: { document_id: 42, request_key: 'failure-x', problem_id: 'missing-layer' },
      }) as any;
      expect(result.preflight_rejection).toMatchObject(rejection);
      const attempts = (runtime.store.paintingState() as any).documents['42'].compiler_attempt_audit.recent_attempts;
      expect(attempts.at(-1).outcome).toBe('rejected');
      expect(attempts.at(-1).contract_error_provenance).toMatchObject({
        protocol: 'paintpilot.contract_error_provenance.v1',
        findings: [expect.objectContaining({ code: 'semantic_layer_owner_missing' })],
      });
      const projected = projectCompilerAttemptAudit({ recent_attempts: attempts, rejected_attempts: 1 });
      expect(projected.last_rejection_origin).toMatchObject({
        instruction_delivery: 'not-observed', findings: [
          expect.objectContaining({ code: 'semantic_layer_owner_missing', finding: 'input_field_missing' }),
        ],
      });
      expect(result.throughput_accounting_integrity).toBeUndefined();
    } finally {
      vi.restoreAllMocks();
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('appears in the actual Guard preflight rejection without dispatching Photoshop', async () => {
    const registry = new ToolRegistry();
    let called = 0;
    registry.register('photoshop_paint_regions', { tool: {
      name: 'photoshop_paint_regions', inputSchema: { type: 'object' },
    }, handler: async () => { called++; throw new Error('Not allowed to dispatch'); } });
    const store: any = {
      compactPassContext: () => ({ painting_profile: 'simple_graphic', logical_layer_owners: [owner] }),
      collectClosePreviousErrors: () => [], collectPreflightErrors: () => [],
    };
    const input = { next_pass: {
      request_key: 'incorrect-lamp-layer', problem_id: 'lamp-base', document_id: 42,
      goal: 'Keep the warm light', actions: [{ tool: 'photoshop_paint_regions',
        args: { regions: [{ layer_id: 9 }] } }],
      logical_layer: { hypothesis_id: 'lamp', decision: 'continue-logical-layer', layer_id: 7 },
    } };
    const compiled = await compileGuardCycle(input, store, registry);
    expect(compiled.rejection).toBeDefined();
    expect(called).toBe(0);
    const body = JSON.parse(compiled.rejection!.content.find(item => item.type === 'text')!.text);
    expect(body.contract_error_provenance).toMatchObject({
      protocol: 'paintpilot.contract_error_provenance.v1',
      instruction_delivery: 'not-observed', model_instruction_noncompliance_proven: false,
      photoshop_mutation_started: false,
    });
    expect(body.contract_error_provenance.findings.length).toBeGreaterThan(0);
    expect(body.next_operation_dispatched).toBe(false);
  });
});
