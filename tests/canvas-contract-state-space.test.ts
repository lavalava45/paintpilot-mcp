import { describe, expect, it } from 'vitest';
import { componentSpaceIssue } from '../src/core/component-space.js';
import { compileMinimalOwnerBootstrap } from '../src/core/guard/ownership-bootstrap-compiler.js';

// Finite state-space property: any flat owner transition advertised by the
// bootstrap compiler must be admitted by coordinate-space validation. Changing
// any spatial authority or target must never silently register that owner.
const pass = () => ({ document_id: 42, action_class: 'ADD', construction_role: 'structured-mass', visual_intent: 'mass',
  logical_layer: { decision: 'create-new', hypothesis_id: 'panel', hypothesis: 'One flat rectangular graphic panel',
    layer_name: 'Panel', component_space: 'canvas', physical_role: 'opaque-mass', opacity_role: 'opaque' },
  actions: [{ id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Panel' } },
    { id: 'panel', tool: 'photoshop_paint_regions', args: { regions: [{ layer_id: '$steps.layer.details.layerId',
      color: { red: 25, green: 80, blue: 200 }, contours: [{ points: [{ x: 1, y: 1 }, { x: 20, y: 1 }, { x: 20, y: 20 }] }] }] } }],
});
describe('canvas owner compiler/admission state-space property', () => {
  it('does not treat artistic spatial metadata as a forbidden canvas painting recipe', () => {
    const spatial = ['construction_tier', 'construction_change', 'geometry_binding', 'surface_frame', 'camera_binding', 'parent_hypothesis_id'];
    for (let mask = 0; mask < (1 << spatial.length); mask++) {
      const input: any = pass();
      spatial.forEach((key, index) => { if (mask & (1 << index)) input.logical_layer[key] = key === 'construction_change' ? true : 'spatial-authority'; });
      const compiled = compileMinimalOwnerBootstrap(input);
      const conflict = componentSpaceIssue(compiled.pass);
      if (mask === 0) expect(compiled.derived).toBe(true);
      expect(conflict).toBeUndefined();
    }
  });
  it('never accepts a foreign, missing or mixed physical target as a new owner receipt', () => {
    for (const target of [undefined, 9, '$steps.foreign.details.layerId']) {
      const input: any = pass(); input.actions[1].args.regions[0].layer_id = target;
      expect(compileMinimalOwnerBootstrap(input).derived).toBe(false);
    }
    const input: any = pass(); input.actions[1].args.regions.push({ ...input.actions[1].args.regions[0], layer_id: 9 });
    expect(compileMinimalOwnerBootstrap(input).derived).toBe(false);
    // Only the ownership compiler is allowed to authorize creation from an
    // exact physical target; freeform canvas metadata is never that receipt.
    expect(componentSpaceIssue(input)).toBeUndefined();
  });
});
