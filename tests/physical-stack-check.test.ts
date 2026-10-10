import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isPhysicalStackGatedStage,
  normalizePhysicalStackCheck,
  PHYSICAL_STACK_CRITERIA,
} from '../src/core/physical-stack-check.js';
import { SessionStore } from '../src/core/guard/session-store.js';
import { createGuardTools } from '../src/tools/guard-tools.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function store() {
  const dir = mkdtempSync(path.join(tmpdir(), 'physical-stack-check-'));
  dirs.push(dir);
  return new SessionStore(path.join(dir, 'controller'), {
    visualBarrierDirectory: path.join(dir, 'barriers'),
  });
}

function criteria(overrides: Record<string, string> = {}) {
  return Object.fromEntries(PHYSICAL_STACK_CRITERIA.map(key => [
    key,
    {
      status: overrides[key] ?? 'resolved',
      note: `${key} observed on the current whole-frame preview`,
    },
  ]));
}

function passingCheck() {
  return {
    status: 'pass',
    observed: true,
    preview_sha256: 'a'.repeat(64),
    evidence_operation_id: 'shape-frame',
    criteria: criteria(),
    confidence: 0.9,
    limitations: [],
  };
}

function physicalOwnerRecord(id: string, hypothesisId: string, layerId: number) {
  return {
    id,
    tool: 'photoshop_execute_visual_microplan',
    args: { document_id: 42, stage: 'SHAPE' },
    summary: `Establish physical owner ${hypothesisId}`,
    purpose: 'Physical stack fixture',
    hash: `hash-${id}`,
    sequence: layerId,
    created_at: new Date(layerId * 1000).toISOString(),
    completed_at: new Date(layerId * 1000 + 1).toISOString(),
    phase: 'completed',
    visual: true,
    failed: false,
    execution: 'executed',
    result: {
      content: [{
        type: 'text',
        text: JSON.stringify({
          continuation_layers: [{
            hypothesis_id: hypothesisId,
            hypothesis: `Physical owner ${hypothesisId}`,
            layer_id: layerId,
            layer_name: hypothesisId,
            rollback_value: 'moderate',
            temporary: false,
            decision: 'create-new',
            physical_role: 'opaque-mass',
            opacity_role: 'opaque',
            depth_relations: [],
          }],
        }),
      }],
    },
  };
}

function valueRequest() {
  return {
    id: 'value-pass-1',
    tool: 'photoshop_execute_visual_microplan',
    args: {
      document_id: 42,
      planner_directive_id: 'physical-directive',
      planner_task_id: 'value-pass',
      painter_scope: 'medium',
      change_domains: ['local-tone'],
      stage: 'VALUE',
      scale: 'medium',
      region: 'subject',
      problem_id: 'value-structure',
    },
    summary: 'Advance to value after physical stack review.',
    purpose: 'Exercise the physical-stack stage gate.',
    problem_id: 'value-structure',
    stage: 'VALUE',
    scale: 'medium',
  };
}

function reviewedFrame(s: SessionStore) {
  const dir = mkdtempSync(path.join(tmpdir(), 'physical-stack-frame-'));
  dirs.push(dir);
  const bytes = jpeg.encode({ width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4, 160) }, 90).data;
  const file = path.join(dir, 'frame.jpg');
  writeFileSync(file, bytes);
  const sha = createHash('sha256').update(bytes).digest('hex');
  s.write({
    id: 'shape-frame', tool: 'photoshop_paint_strokes', args: { document_id: 42, stage: 'SHAPE', problem_id: 'value-structure' },
    problem_id: 'value-structure', stage: 'SHAPE', summary: 'Shape frame', purpose: 'Review ordinary physical stack', hash: 'shape-hash', sequence: 10,
    created_at: new Date(10000).toISOString(), completed_at: new Date(10001).toISOString(),
    phase: 'completed', visual: true, failed: false,
    preview: { sha256: sha, document_id: 42, materialized_path: file, width: 8, height: 8 },
  });
  s.updatePaintingState(42, current => ({
    ...current, current_stage: 'SHAPE', current_frame: { operation_id: 'shape-frame', sha256: sha },
  }));
  return {
    id: 'shape-frame', preview_id: 'shape-frame', sha256: sha,
    verdict: 'neutral', disposition: 'accept', target_resolved: 'uncertain',
    observed_change: 'The current frame keeps opaque subjects above the background.',
    observations: [{ region: 'whole frame', visible: 'Depth and opaque coverage remain visible.' }],
    primary_mismatch: 'The larger artistic task is still unfinished.',
    regressions: [], uncertainty: 'Form modelling remains unfinished.',
    global_readability: 'unknown', primitive_footprint: 'unknown', trend_signals: [],
  };
}

describe('physical stack / occlusion gate', () => {
  it('gates VALUE and later but leaves SHAPE/block-in available', () => {
    expect(isPhysicalStackGatedStage('GLOBAL_BLOCK_IN')).toBe(false);
    expect(isPhysicalStackGatedStage('SHAPE')).toBe(false);
    expect(isPhysicalStackGatedStage('VALUE')).toBe(true);
    expect(isPhysicalStackGatedStage('FORM_AND_LIGHT')).toBe(true);
    expect(isPhysicalStackGatedStage('DETAIL')).toBe(true);
  });

  it('accepts exact-frame pass evidence only when core physical relations are resolved', () => {
    expect(normalizePhysicalStackCheck(passingCheck())).toMatchObject({
      status: 'pass',
      observed: true,
      preview_sha256: 'a'.repeat(64),
    });

    expect(() => normalizePhysicalStackCheck({
      ...passingCheck(),
      criteria: criteria({ occlusion_integrity: 'debt' }),
    })).toThrow(/cannot leave physical-stack debt.*occlusion_integrity/i);

    expect(() => normalizePhysicalStackCheck({
      ...passingCheck(),
      criteria: criteria({ transparency_intent: 'not-applicable' }),
    })).toThrow(/requires transparency_intent=resolved/i);
  });

  it('requires real debt for fail and keeps pending evidence-free', () => {
    expect(normalizePhysicalStackCheck({
      status: 'pending',
      observed: false,
      limitations: [],
    })).toMatchObject({
      status: 'pending',
      observed: false,
      preview_sha256: null,
      owner_signature: null,
    });

    expect(() => normalizePhysicalStackCheck({
      ...passingCheck(),
      status: 'fail',
    })).toThrow(/requires debt or uncertain/i);

    expect(normalizePhysicalStackCheck({
      ...passingCheck(),
      status: 'fail',
      criteria: criteria({ layer_stack_alignment: 'uncertain' }),
    })).toMatchObject({ status: 'fail' });
  });

  it('blocks VALUE on pending evidence and invalidates a pass when the physical owner graph changes', () => {
    const s = store();
    s.setArtRunState({
      document_id: 42,
      process_dir: 'processes/physical-stack-gate-process/run-01',
      painting_profile: 'nontrivial_painting',
      commentary_mode: 'technical',
    });
    s.write(physicalOwnerRecord('rear-owner-shape', 'rear-owner', 7));
    s.updatePaintingState(42, current => ({
      ...current,
      current_stage: 'SHAPE',
      art_director: {
        directive_id: 'physical-directive',
        status: 'active',
        review_due: false,
        current_task_id: 'value-pass',
        tasks: [{
          task_id: 'value-pass',
          status: 'active',
          allowed_scales: ['medium'],
          allowed_global_changes: [],
        }],
        physical_stack_check: normalizePhysicalStackCheck({ status: 'pending', observed: false }),
      },
    }));

    expect(() => s.plannerGate(42, valueRequest())).toThrow(/physical_stack_check_required/);

    const ownerSignature = s.physicalStackOwnerSignature(42);
    s.updatePaintingState(42, current => ({
      ...current,
      art_director: {
        ...current.art_director,
      },
      physical_stack_check: { ...normalizePhysicalStackCheck(passingCheck()), owner_signature: ownerSignature },
    }));
    expect(() => s.plannerGate(42, valueRequest())).not.toThrow();

    s.write(physicalOwnerRecord('front-owner-shape', 'front-owner', 8));
    expect(() => s.plannerGate(42, valueRequest())).toThrow(/physical_stack_check_stale/);
  });

  it.each([false, true])('uses the ordinary visual verdict with Director active=%s and keeps omission pending', async directorActive => {
    const s = store();
    s.setArtRunState({ document_id: 42, process_dir: 'processes/physical-ordinary-process/run-01',
      painting_profile: 'nontrivial_painting', commentary_mode: 'technical' });
    s.write(physicalOwnerRecord('owner', 'rear-owner', 7));
    const input = reviewedFrame(s);
    if (directorActive) s.updatePaintingState(42, current => ({ ...current, art_director: {
      directive_id: 'physical-directive', status: 'active', current_task_id: 'value-pass',
      tasks: [{ task_id: 'value-pass', status: 'active', allowed_scales: ['medium'], allowed_global_changes: [] }],
      physical_stack_check: normalizePhysicalStackCheck({ status: 'pending', observed: false }),
    } }));
    s.verdict(input);
    expect(() => s.plannerGate(42, valueRequest())).toThrow(/physical_stack_check_required/);
    // Exact provenance is supplied by closure, not retyped in the observation.
    s.verdict({ ...input, physical_stack_check: { status: 'pass', observed: true, criteria: criteria() } });
    expect(s.paintingState().documents['42'].physical_stack_check).toMatchObject({
      status: 'pass', preview_sha256: input.sha256, evidence_operation_id: input.id,
    });
    expect(() => s.plannerGate(42, valueRequest())).not.toThrow();
    expect(s.statusCompact().documents['42'].physical_stack_check.status).toBe('pass');
    s.write(physicalOwnerRecord('new-front', 'front-owner', 8));
    expect(() => s.plannerGate(42, valueRequest())).toThrow(/physical_stack_check_stale/);
  });

  it('retains observed physical debt and refuses false completion on the same ordinary review', () => {
    const s = store();
    s.setArtRunState({ document_id: 42, process_dir: 'processes/physical-debt-process/run-01',
      painting_profile: 'nontrivial_painting', commentary_mode: 'technical' });
    const input = reviewedFrame(s);
    const physical_stack_check = { status: 'fail', observed: true, criteria: criteria({ opaque_mass_coverage: 'debt' }) };
    expect(() => s.verdict({ ...input, physical_stack_check, target_resolved: 'yes' })).toThrow(/physical_stack_debt_unresolved/);
    s.verdict({ ...input, physical_stack_check });
    expect(() => s.plannerGate(42, valueRequest())).toThrow(/physical_stack_debt_unresolved/);
    s.verdict(input); // Omitting the check cannot erase the known debt.
    expect(() => s.plannerGate(42, valueRequest())).toThrow(/physical_stack_debt_unresolved/);
  });

  it('rejects forged, stale and crop-bound ordinary review evidence and does not persist rolled-back evidence', () => {
    const s = store();
    s.setArtRunState({ document_id: 42, process_dir: 'processes/physical-provenance-process/run-01',
      painting_profile: 'nontrivial_painting', commentary_mode: 'technical' });
    s.write(physicalOwnerRecord('owner', 'rear-owner', 7));
    const input = reviewedFrame(s);
    const check = { status: 'pass', observed: true, criteria: criteria() };
    expect(() => s.verdict({ ...input, physical_stack_check: { ...check, preview_sha256: 'b'.repeat(64) } })).toThrow(/preview_sha256 must match/);
    expect(() => s.verdict({ ...input, physical_stack_check: { ...check, evidence_operation_id: 'owner' } })).toThrow(/preview_sha256 must match|whole-frame preview/);
    const frame = s.read('shape-frame');
    s.write({ ...frame, preview: { ...frame.preview, region: { left: 0, top: 0, right: 4, bottom: 4 } } });
    expect(() => s.verdict({ ...input, physical_stack_check: check })).toThrow(/whole-frame preview/);
    s.write(frame);
    s.updatePaintingState(42, current => ({ ...current, current_frame: { operation_id: 'later-frame', sha256: input.sha256 } }));
    expect(() => s.verdict({ ...input, physical_stack_check: check })).toThrow(/current document frame operation/);
    s.updatePaintingState(42, current => ({ ...current, current_frame: { operation_id: input.id, sha256: input.sha256 } }));
    s.verdict({ ...input, physical_stack_check: check, disposition: 'rollback' });
    expect(s.paintingState().documents['42'].physical_stack_check.status).toBe('pending');
  });

  it('exposes one shared physical-stack schema in ordinary observation and Director directive', () => {
    const tools = createGuardTools({} as any);
    const cycle = tools.find(tool => tool.tool.name === 'photoshop_guard_cycle_auto')!.tool.inputSchema as any;
    const director = tools.find(tool => tool.tool.name === 'photoshop_guard_art_director')!.tool.inputSchema as any;
    expect(cycle.properties.previous_observation.properties.physical_stack_check)
      .toEqual(director.properties.directive.properties.physical_stack_check);
  });

  it('binds observed physical-stack evidence to the exact current visual frame', () => {
    const s = store();
    const sha = 'a'.repeat(64);
    s.write({
      id: 'shape-frame',
      tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42, stage: 'SHAPE' },
      summary: 'Shape frame evidence',
      purpose: 'Physical stack evidence fixture',
      hash: 'shape-frame-hash',
      sequence: 1,
      created_at: new Date(1000).toISOString(),
      completed_at: new Date(1001).toISOString(),
      phase: 'completed',
      visual: true,
      failed: false,
      preview: { sha256: sha, document_id: 42 },
    });
    s.updatePaintingState(42, current => ({
      ...current,
      current_frame: {
        operation_id: 'shape-frame',
        sha256: sha,
        accepted: true,
        acceptance_scope: 'pixels_retained_not_goal_confirmation',
        goal_confirmation: 'unresolved',
      },
    }));
    expect(() => (s as any).validatePhysicalStackCheckEvidence(
      42,
      normalizePhysicalStackCheck(passingCheck())
    )).not.toThrow();

    s.updatePaintingState(42, current => ({
      ...current,
      current_frame: {
        ...current.current_frame,
        sha256: 'b'.repeat(64),
      },
    }));
    expect(() => (s as any).validatePhysicalStackCheckEvidence(
      42,
      normalizePhysicalStackCheck(passingCheck())
    )).toThrow(/stale/i);
  });
});
