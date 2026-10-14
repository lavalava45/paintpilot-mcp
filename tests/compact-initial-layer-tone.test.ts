import { describe, expect, it } from 'vitest';
import { isInitialLayerTone, type InitialLayerToneInput } from '../src/core/guard/compact-initial-layer-tone.js';

function firstCoat(): InitialLayerToneInput {
  return {
    hasVisualFrame: false,
    actionClass: 'ADD',
    createStep: { id: 'new-layer' },
    logicalDecision: 'create-new',
    logicalLayer: {},
    mutationSteps: [{
      tool: 'photoshop_fill_layer',
      args: { layer_id: '$steps.new-layer.details.layerId' },
    }],
  };
}

describe('compact initial-layer tone geometry exemption', () => {
  it('accepts only the fresh uniform fill on the newly created layer', () => {
    expect(isInitialLayerTone(firstCoat())).toBe(true);
    expect(isInitialLayerTone({ ...firstCoat(), hasVisualFrame: true })).toBe(false);
  });

  it('does not exempt continuation, rollback or an absent create step', () => {
    expect(isInitialLayerTone({ ...firstCoat(), logicalDecision: 'continue-logical-layer' })).toBe(false);
    expect(isInitialLayerTone({ ...firstCoat(), actionClass: 'ROLLBACK' })).toBe(false);
    expect(isInitialLayerTone({ ...firstCoat(), createStep: undefined })).toBe(false);
  });

  it('requires exactly one fill targeting the matching deferred create-layer id', () => {
    const coat = firstCoat();
    expect(isInitialLayerTone({ ...coat, mutationSteps: [{ tool: 'photoshop_fill_layer', args: { layer_id: 123 } }] })).toBe(false);
    expect(isInitialLayerTone({ ...coat, mutationSteps: [{ tool: 'photoshop_paint_regions', args: { layer_id: '$steps.new-layer.details.layerId' } }] })).toBe(false);
    expect(isInitialLayerTone({ ...coat, mutationSteps: [...coat.mutationSteps, ...coat.mutationSteps] })).toBe(false);
  });

  it('never exempts authored construction or explicit geometry binding', () => {
    const coat = firstCoat();
    expect(isInitialLayerTone({ ...coat, constructionRole: 'structured-mass' })).toBe(false);
    expect(isInitialLayerTone({ ...coat, constructionTier: 'primary' })).toBe(false);
    expect(isInitialLayerTone({ ...coat, logicalLayer: { geometry_binding: { model_id: 'scene' } } })).toBe(false);
    expect(isInitialLayerTone({ ...coat, logicalLayer: { construction_change: true } })).toBe(false);
  });

  it('does not exempt a spatial parent, depth relation or surface frame', () => {
    const coat = firstCoat();
    expect(isInitialLayerTone({ ...coat, logicalLayer: { parent_hypothesis_id: 'parent' } })).toBe(false);
    expect(isInitialLayerTone({ ...coat, logicalLayer: { depth_relations: [{ kind: 'behind' }] } })).toBe(false);
    expect(isInitialLayerTone({ ...coat, logicalLayer: { surface_frame: { id: 'surface' } } })).toBe(false);
  });
});
