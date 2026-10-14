import { describe, expect, it } from 'vitest';
import { collectCompactEdgeBindingViolations } from '../src/core/guard/compact-edge-bindings.js';

const edges = [
  { boundary_id: 'foreground-sky', region_a: 'foreground', region_b: 'sky', class: 'hard' },
  { boundary_id: 'tree-ground', region_a: 'tree', region_b: 'ground', class: 'soft' },
];

describe('compact edge binding extraction', () => {
  it('accepts independently bound authored boundaries without adding violations', () => {
    const result = collectCompactEdgeBindingViolations(edges, [
      { tool: 'photoshop_paint_regions', method_id: 'region-block-in', edge_boundary_ids: ['foreground-sky', 'tree-ground'] },
    ]);
    expect(result.violations).toEqual([]);
    expect(result.edgeIntentsValid).toBe(true);
    expect(result.edgeIntents).toMatchObject([
      { boundaryId: 'foreground-sky', regionA: 'foreground', regionB: 'sky', edgeClass: 'hard' },
      { boundaryId: 'tree-ground', regionA: 'tree', regionB: 'ground', edgeClass: 'soft' },
    ]);
  });

  it('retains the exact order and payload of independent unknown, method and unbound diagnostics', () => {
    expect(collectCompactEdgeBindingViolations(edges, [
      { tool: 'photoshop_paint_regions', edge_boundary_ids: ['unknown', 'foreground-sky'] },
    ]).violations).toEqual([
      {
        scope: 'next_operation',
        code: 'compact_edge_boundary_unknown',
        message: 'next_pass.actions[0].edge_boundary_ids references undeclared boundary_id unknown',
        details: { action_index: 0, boundary_id: 'unknown' },
      },
      {
        scope: 'next_operation',
        code: 'compact_edge_method_required',
        message: 'next_pass.actions[0] must declare method_id when edge_boundary_ids are present',
        details: { action_index: 0, boundary_ids: ['foreground-sky'] },
      },
      {
        scope: 'next_operation',
        code: 'compact_edge_intent_unbound',
        message: 'next_pass.edges boundary_id tree-ground must bind to at least one visual mutation through edge_boundary_ids',
        details: { boundary_id: 'tree-ground' },
      },
    ]);
  });

  it('preserves parser failure as the only edge diagnostic', () => {
    expect(collectCompactEdgeBindingViolations('not-an-array', [
      { tool: 'photoshop_paint_regions', edge_boundary_ids: ['missing'] },
    ]).violations).toEqual([
      { scope: 'next_operation', code: 'compact_edge_intents_invalid', message: 'edges must be an array' },
    ]);
  });

  it('ignores nonvisual edge references and retains unbound evidence', () => {
    expect(collectCompactEdgeBindingViolations(edges.slice(0, 1), [
      { tool: 'photoshop_get_state', method_id: 'region-block-in', edge_boundary_ids: ['foreground-sky'] },
      { tool: 'photoshop_paint_regions', method_id: 'region-block-in', edge_boundary_ids: 'foreground-sky' },
    ]).violations).toEqual([
      {
        scope: 'next_operation',
        code: 'compact_edge_boundary_ids_invalid',
        message: 'next_pass.actions[1].edge_boundary_ids must be an array of declared boundary ids',
        details: { action_index: 1 },
      },
      {
        scope: 'next_operation',
        code: 'compact_edge_intent_unbound',
        message: 'next_pass.edges boundary_id foreground-sky must bind to at least one visual mutation through edge_boundary_ids',
        details: { boundary_id: 'foreground-sky' },
      },
    ]);
  });
});
