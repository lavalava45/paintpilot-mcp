import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import {
  normalizeSoftDominanceReview,
  softDominanceRiskForOperation,
  SOFT_DOMINANCE_CRITERIA,
} from '../src/core/guard/soft-dominance-review.js';

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function criteria(overrides: Record<string, 'resolved' | 'debt' | 'uncertain' | 'not-applicable'> = {}) {
  return Object.fromEntries(SOFT_DOMINANCE_CRITERIA.map(key => [
    key,
    {
      status: overrides[key] ?? 'resolved',
      note: `${key} observed on the exact current frame`,
    },
  ]));
}

function passingReview(overrides: Record<string, 'resolved' | 'debt' | 'uncertain' | 'not-applicable'> = {}) {
  return {
    status: 'pass',
    observed: true,
    criteria: criteria(overrides),
  };
}

function store() {
  const dir = mkdtempSync(path.join(tmpdir(), 'soft-dominance-'));
  dirs.push(dir);
  return {
    dir,
    store: new SessionStore(path.join(dir, 'controller'), {
      visualBarrierDirectory: path.join(dir, 'barriers'),
    }),
  };
}

function seedBroadSoftOperation(s: SessionStore, dir: string) {
  const previewPath = path.join(dir, 'soft-after.jpg');
  const previewBytes = Buffer.from('soft-dominance-preview');
  writeFileSync(previewPath, previewBytes);
  const sha = createHash('sha256').update(previewBytes).digest('hex');
  s.write({
    id: 'soft-op',
    tool: 'photoshop_execute_visual_microplan',
    args: {
      document_id: 42,
      stage: 'FORM',
      scale: 'global',
      problem_id: 'broad-soft-pass',
      method_class: 'paint',
      paint_strategy: {
        construction_role: 'volumetric-soft-mass',
        visual_intent: 'painted-mass',
      },
      logical_layer: {
        physical_role: 'opaque-mass',
      },
      steps: [{
        id: 'soft-build',
        tool: 'photoshop_paint_dabs',
        method_id: 'soft-brush-build',
        args: {},
      }],
    },
    summary: 'Broad soft modelling pass',
    purpose: 'Exercise soft-dominance review',
    hash: 'soft-op-hash',
    sequence: 10,
    created_at: new Date(1000).toISOString(),
    completed_at: new Date(1100).toISOString(),
    phase: 'completed',
    visual: true,
    failed: false,
    preview: {
      sha256: sha,
      materialized_path: previewPath,
      document_id: 42,
      width: 400,
      height: 300,
      canvas_width: 400,
      canvas_height: 300,
      scale_x: 1,
      scale_y: 1,
    },
  });
  s.updatePaintingState(42, current => ({
    ...current,
    painting_profile: 'nontrivial_painting',
  }));
  return sha;
}

function verdictInput(sha: string, softnessReview?: Record<string, unknown>) {
  return {
    id: 'soft-op',
    preview_id: 'soft-op',
    sha256: sha,
    verdict: 'neutral',
    disposition: 'correct',
    observations: [{
      region: 'whole frame',
      visible: 'The broad soft pass has been inspected for structural edge and mass separation.',
    }],
    primary_mismatch: 'The broad softness still needs structural review.',
    observed_change: 'The broad soft treatment changed the current frame and remains under review.',
    target_resolved: 'no',
    regressions: [],
    uncertainty: 'none observed',
    global_readability: 'unknown',
    primitive_footprint: 'none',
    trend_signals: [],
    ...(softnessReview ? { softness_review: softnessReview } : {}),
  };
}

describe('soft-dominance / over-smoothing review', () => {
  it('accepts intentional optical haze when underlying mass/form/focal readability stays resolved', () => {
    const result = normalizeSoftDominanceReview(
      passingReview({
        edge_hierarchy: 'not-applicable',
        primitive_footprint: 'not-applicable',
      }),
      {
        previewSha256: 'a'.repeat(64),
        constructionRole: 'optical-veil',
        physicalRole: 'atmosphere',
      }
    );

    expect(result.status).toBe('pass');
    expect(result.construction_role).toBe('optical-veil');
    expect(result.criteria.mass_separation.status).toBe('resolved');
    expect(result.criteria.focal_hierarchy.status).toBe('resolved');
    expect(result.trend_signals).toEqual([]);
  });

  it('rejects a volumetric soft mass that tries to exempt its edge hierarchy', () => {
    expect(() => normalizeSoftDominanceReview(
      passingReview({ edge_hierarchy: 'not-applicable' }),
      {
        previewSha256: 'b'.repeat(64),
        constructionRole: 'volumetric-soft-mass',
        physicalRole: 'opaque-mass',
      }
    )).toThrow(/edge_hierarchy=resolved.*volumetric soft mass/i);
  });

  it('turns homogeneous airbrush/soft-round evidence into stable defect signals instead of a sharpness score', () => {
    const result = normalizeSoftDominanceReview(
      {
        status: 'fail',
        observed: true,
        criteria: criteria({
          edge_hierarchy: 'debt',
          mass_separation: 'debt',
          large_form_readability: 'debt',
          primitive_footprint: 'debt',
        }),
      },
      {
        previewSha256: 'c'.repeat(64),
        constructionRole: 'volumetric-soft-mass',
        physicalRole: 'opaque-mass',
      }
    );

    expect(result.debt_criteria).toEqual(expect.arrayContaining([
      'edge_hierarchy',
      'mass_separation',
      'large_form_readability',
      'primitive_footprint',
    ]));
    expect(result.trend_signals).toEqual(['soft-dominance', 'soft-round-footprint']);
  });

  it('requires contextual review only for broad soft-dominant passes, not ordinary small edge work', () => {
    const broad = softDominanceRiskForOperation({
      tool: 'photoshop_execute_visual_microplan',
      args: {
        scale: 'global',
        method_class: 'paint',
        paint_strategy: { visual_intent: 'atmospheric-mass' },
        steps: [],
      },
    });
    const local = softDominanceRiskForOperation({
      tool: 'photoshop_execute_visual_microplan',
      args: {
        scale: 'small',
        method_class: 'paint',
        paint_strategy: { visual_intent: 'soft-transition' },
        steps: [],
      },
    });

    expect(broad.required).toBe(true);
    expect(local.required).toBe(false);
  });

  it('fails closed when a nontrivial broad soft pass is classified without softness_review', () => {
    const fixture = store();
    const sha = seedBroadSoftOperation(fixture.store, fixture.dir);
    expect(() => fixture.store.validateVerdictInput(verdictInput(sha))).toThrow(
      /soft_dominance_review_required/i
    );
  });

  it('opens a global must-fix blocker on failed soft-dominance review and blocks finer work', () => {
    const fixture = store();
    const sha = seedBroadSoftOperation(fixture.store, fixture.dir);
    const failed = {
      status: 'fail',
      observed: true,
      criteria: criteria({
        edge_hierarchy: 'debt',
        mass_separation: 'debt',
        large_form_readability: 'debt',
      }),
    };

    fixture.store.verdict(verdictInput(sha, failed));

    expect(fixture.store.paintingState().documents['42'].visual_problems['soft-dominance']).toMatchObject({
      problem_id: 'soft-dominance',
      scale: 'global',
      severity: 'must-fix',
      status: 'open',
      source_operation_id: 'soft-op',
      debt_criteria: expect.arrayContaining(['edge_hierarchy', 'mass_separation', 'large_form_readability']),
    });
    expect(fixture.store.read('soft-op')?.verdict).toMatchObject({
      softness_review: {
        protocol: 'photoshop.guard.soft_dominance.v1',
        status: 'fail',
        evidence_sha256: sha,
      },
      review_findings: expect.arrayContaining([
        expect.objectContaining({ kind: 'soft_dominance', severity: 'must-fix' }),
      ]),
    });

    expect(() => fixture.store.priorityGate(42, {
      tool: 'photoshop_execute_visual_microplan',
      args: { document_id: 42, scale: 'small' },
    })).toThrow(/stage_priority_gate.*soft-dominance/i);
  });

  it('requires primitive-footprint debt to feed the existing primitive footprint guard', () => {
    const fixture = store();
    const sha = seedBroadSoftOperation(fixture.store, fixture.dir);
    const failed = {
      status: 'fail',
      observed: true,
      criteria: criteria({ primitive_footprint: 'debt' }),
    };
    expect(() => fixture.store.validateVerdictInput(verdictInput(sha, failed))).toThrow(
      /requires primitive_footprint=suspect/i
    );
  });
});
