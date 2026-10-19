import { describe, expect, it } from 'vitest';
import { parseVisualMicroPlan } from '../src/core/visual-microplan.js';

const plan = (overrides: Record<string, unknown> = {}) => ({
  plan_id: 'art-admission', summary: 'Artist chooses an unconventional method',
  stage: 'RECOGNITION_BLOCK_IN', scale: 'local', region: 'study',
  intent: 'soft boundary built from hard marks', method_class: 'paint', risk: 'low',
  action_class: 'REFINE', expected_visual_delta: 'The chosen mark is visible',
  expected_visual_result: 'A deliberate mark', document_id: 42,
  verification_envelope: { mode: 'before_after', min_focus_dimension_px: 800 },
  layer_separation_check: {
    change_kind: 'continuation', substantial: false, rollback_value: 'low',
    independent_adjustment_expected: false,
  },
  steps: [
    { id: 'before', tool: 'photoshop_get_preview', args: {
      focus_region: { left: 0, top: 0, right: 100, bottom: 100 }, focus_max_dimension_px: 800,
    } },
    { id: 'paint', tool: 'photoshop_paint_dabs', method_id: 'unlisted-custom-technique',
      args: { dabs: [{ x: 10, y: 10 }] } },
    { id: 'preview', tool: 'photoshop_get_preview', args: {
      max_dimension_px: 800,
      focus_region: { left: 0, top: 0, right: 100, bottom: 100 }, focus_max_dimension_px: 800,
    } },
  ],
  ...overrides,
});

describe('artistic advice never grants or denies Photoshop execution', () => {
  it('permits custom method IDs and local recognition work', () => {
    expect(parseVisualMicroPlan(plan()).mutationIndexes).toEqual([1]);
  });
  it('permits deliberately mixed visual and construction roles', () => {
    expect(parseVisualMicroPlan(plan({
      paint_strategy: {
        construction_role: 'optical-veil', visual_intent: 'continuous-field',
        pressure_policy: 'none',
      },
    })).paintStrategy?.constructionRole).toBe('optical-veil');
  });
  it('keeps document identity, preview and bounded mutation safety', () => {
    expect(() => parseVisualMicroPlan(plan({ document_id: -1 }))).toThrow(/document_id/);
    expect(() => parseVisualMicroPlan(plan({
      steps: [{ id: 'paint', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 10, y: 10 }] } },
        { id: 'not-preview', tool: 'photoshop_paint_dabs', args: { dabs: [{ x: 11, y: 11 }] } }],
    }))).toThrow(/preview/);
    expect(() => parseVisualMicroPlan(plan({
      protected_layer_ids: [5], replace_protected_layer_ids: [7],
    }))).toThrow(/replace_protected_layer_ids/);
  });
  it('requires exact native layer and selection provenance for a selection mask independently of artistic method', () => {
    const bounds = { left: 10, top: 10, right: 50, bottom: 50 };
    const select = { id: 'select', tool: 'photoshop_select_rectangle', args: bounds };
    const before = { id: 'before', tool: 'photoshop_get_preview', args: {
      focus_region: { left: 0, top: 0, right: 100, bottom: 100 }, focus_max_dimension_px: 800,
    } };
    const native = { id: 'mask', tool: 'photoshop_create_layer_mask', method_id: 'experimental-watercolor-veil',
      args: { layer_id: 9, mask_mode: 'revealSelection', expected_selection_bounds: bounds } };
    const after = { id: 'preview', tool: 'photoshop_get_preview', args: {
      max_dimension_px: 800,
      focus_region: { left: 0, top: 0, right: 100, bottom: 100 }, focus_max_dimension_px: 800,
    } };
    expect(parseVisualMicroPlan(plan({ steps: [select, before, native, after] })).mutationIndexes).toEqual([2]);
    expect(() => parseVisualMicroPlan(plan({ steps: [before, native, after] })))
      .toThrow(/mask_selection_provenance_required/);
    expect(() => parseVisualMicroPlan(plan({ steps: [select, before, { ...native, args: { mask_mode: 'revealSelection', expected_selection_bounds: bounds } }, after] })))
      .toThrow(/mask_target_layer_required/);
    expect(() => parseVisualMicroPlan(plan({ steps: [select, before, { ...native, args: { layer_id: 9, mask_mode: 'revealSelection' } }, after] })))
      .toThrow(/mask_selection_bounds_required/);
    expect(() => parseVisualMicroPlan(plan({ steps: [before, { ...native, args: { layer_id: 9 } }, after] })))
      .toThrow(/mask_mode_required/);
    expect(parseVisualMicroPlan(plan({ steps: [before, { ...native, args: { layer_id: 9, mask_mode: 'revealAll' } }, after] })).mutationIndexes).toEqual([1]);
  });
});
