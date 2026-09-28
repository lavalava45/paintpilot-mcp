import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isPhysicalStackGatedStage,
  normalizePhysicalStackCheck,
  PHYSICAL_STACK_CRITERIA,
} from '../src/core/physical-stack-check.js';
import { SessionStore } from '../src/core/guard/session-store.js';

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
        physical_stack_check: {
          ...normalizePhysicalStackCheck(passingCheck()),
          owner_signature: ownerSignature,
        },
      },
    }));
    expect(() => s.plannerGate(42, valueRequest())).not.toThrow();

    s.write(physicalOwnerRecord('front-owner-shape', 'front-owner', 8));
    expect(() => s.plannerGate(42, valueRequest())).toThrow(/physical_stack_check_stale/);
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
