import { describe, expect, it } from 'vitest';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

const fixture = (profile: 'simple_graphic' | 'nontrivial_painting') => {
  let mutations = 0;
  const registry = new ToolRegistry();
  for (const name of ['photoshop_create_layer', 'photoshop_paint_regions',
    'photoshop_paint_color_gradient', 'photoshop_get_preview']) {
    registry.register(name, { tool: { name, inputSchema: { type: 'object' } },
      handler: async () => { mutations++; throw new Error('Never execute a Photoshop mutation'); } });
  }
  const store: any = { compactPassContext: () => ({
    painting_profile: profile, logical_layer_owners: [], has_visual_frame: true,
    document_incarnation_id: 'doc:42:current',
  }), collectClosePreviousErrors: () => [], collectPreflightErrors: () => [] };
  return { registry, store, mutations: () => mutations };
};

const committedSpatial = () => ({
  request_key: 'perspective-shared-owner', problem_id: 'incorrect-roof-vanishing',
  document_id: 42, goal: 'Build one roof mass aligned with a shared street vanishing point.',
  action_class: 'ADD', stage: 'GLOBAL_BLOCK_IN', scale: 'global',
  construction_role: 'structured-mass',
  logical_layer: { decision: 'create-new', hypothesis_id: 'roof',
    construction_tier: 'primary', component_space: 'world',
    physical_role: 'opaque-mass', layer_name: 'Roof' },
  actions: [{ id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Roof' } },
    { id: 'region', tool: 'photoshop_paint_regions', args: { layer_id: '$steps.layer.details.layerId',
      regions: [] } }],
});

describe('spatial perspective consistency is shared across painting profiles', () => {
  it.each(['simple_graphic', 'nontrivial_painting'] as const)(
    'blocks committed world-space construction without geometry in %s',
    async profile => {
      const f = fixture(profile);
      const result = await compileGuardCycle({ next_pass: committedSpatial() }, f.store, f.registry);
      expect(result.violations.map(v => v.code)).toContain('scene_geometry_model_required');
      expect(f.mutations()).toBe(0);
    },
  );
  it('recognizes an explicitly world-space opaque building even without construction_tier in simple_graphic', async () => {
    const f = fixture('simple_graphic');
    const pass = committedSpatial();
    const input: any = { ...pass, logical_layer: {
      ...pass.logical_layer, construction_tier: undefined,
    }, construction_role: 'mass' };
    const result = await compileGuardCycle({ next_pass: input }, f.store, f.registry);
    expect(result.violations.map(v => v.code)).toContain('scene_geometry_model_required');
    expect(f.mutations()).toBe(0);
  });
  it.each(['simple_graphic', 'nontrivial_painting'] as const)(
    'rejects empty perspective families even when model declares sufficient VP ids in %s',
    async profile => {
      const f = fixture(profile);
      const pass: any = committedSpatial();
      pass.scene_geometry_model = {
        model_id: 'street', revision: 1, applicability: 'coherent_3d',
        source_frame: { document_id: 42, document_incarnation: 'doc:42:current',
          width: 1200, height: 800 },
        projection: { kind: 'two_point', horizon: { line: [
          { x: 0, y: 300 }, { x: 1200, y: 300 },
        ] }, vanishing_points: [
          { id: 'left', x: 150, y: 300, evidence: 'proposed', derived_from: [] },
          { id: 'right', x: 1150, y: 300, evidence: 'proposed', derived_from: [] },
        ] },
        line_families: [
          { id: 'left-axes', vanishing_point_id: 'left', members: [] },
          { id: 'right-axes', vanishing_point_id: 'right', members: [] },
        ],
      };
      const result = await compileGuardCycle({ next_pass: pass }, f.store, f.registry);
      expect(result.violations.map(v => v.code)).toContain('perspective_basis_required');
      expect(f.mutations()).toBe(0);
    },
  );
  it('does not demand a 3D scene model for an unbound 2D simple graphic', async () => {
    const f = fixture('simple_graphic');
    const pass = committedSpatial();
    const graphic: any = { ...pass, logical_layer: {
      ...pass.logical_layer, construction_tier: undefined,
      physical_role: undefined, component_space: undefined,
    } };
    const result = await compileGuardCycle({ next_pass: graphic }, f.store, f.registry);
    expect(result.violations.map(v => v.code)).not.toContain('scene_geometry_model_required');
    expect(f.mutations()).toBe(0);
  });
  it.each(['simple_graphic', 'nontrivial_painting'] as const)(
    'exempts one independent flat canvas field from 3D perspective in %s',
    async profile => {
      const f = fixture(profile);
      const result = await compileGuardCycle({ next_pass: {
        request_key: 'flat-matte', problem_id: 'sky-matte',
        document_id: 42, goal: 'Paint a flat sky color.',
        action_class: 'ADD', stage: 'GLOBAL_BLOCK_IN', scale: 'global',
        visual_intent: 'continuous-field', construction_role: 'continuous-field',
        logical_layer: { decision: 'create-new', hypothesis_id: 'matte',
          layer_name: 'Matte', component_space: 'canvas' },
        actions: [{ id: 'layer', tool: 'photoshop_create_layer', args: { name: 'Matte' } },
          { id: 'fill', tool: 'photoshop_paint_color_gradient',
            args: { layer_id: '$steps.layer.details.layerId',
              from: { x: 0, y: 0 }, to: { x: 100, y: 100 },
              stops: [{ position: 0, red: 30, green: 40, blue: 50 },
                { position: 1, red: 70, green: 80, blue: 90 }] } }],
      } }, f.store, f.registry);
      expect(result.violations.map(v => v.code)).not.toContain('scene_geometry_model_required');
      expect(result.violations.map(v => v.code)).not.toContain('perspective_basis_required');
      expect(f.mutations()).toBe(0);
    },
  );
});
