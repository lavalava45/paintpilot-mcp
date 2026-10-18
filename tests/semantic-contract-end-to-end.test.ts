import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import {
  constructionOwnershipPlan, normalizeConstructionModel,
} from '../src/core/object-construction.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

function fixture() {
  const model = JSON.parse(readFileSync(
    new URL('../examples/object-construction/crane.json', import.meta.url), 'utf8'));
  const plan: any = constructionOwnershipPlan(normalizeConstructionModel(model));
  for (const unit of plan.units) unit.edit_axes = ['visibility', 'position', 'rollback'];
  const owner = model.parts[0].id;
  const raw: any = {
    request_key: 'semantic-crane-first', problem_id: 'semantic-crane-problem', document_id: 42,
    goal: 'Construct the first crane part under a single authored warm light.',
    action: 'add', visual_intent: 'mass', target_owner_id: owner, scale: 'medium',
    construction_role: 'structured-mass', material_role: 'metal',
    scene_ownership_plan: plan,
    construction: { model, part_id: owner, color: { red: 70, green: 90, blue: 60 } },
    scene_lighting_color_model: {
      global_value_structure: { key: 'mid', local_value_anchor: 'warm overhead crane lamp' },
      ambient_environment: {
        role: 'ambient', family: 'gray', provenance: 'user-or-prompt',
        chroma: 'low', value_role: 'soft_fill',
      },
      emitters: [{
        role: 'emitter', family: 'amber', provenance: 'user-or-prompt',
        light_role: 'overhead_crane_lamp',
      }],
      palette_relations: [], sampled_anchors: [], intentional_exceptions: [],
    },
  };
  const store: any = {
    compactPassContext: () => ({
      painting_profile: 'simple_graphic', logical_layer_owners: [],
      document_incarnation_id: 'uxp:42:current',
    }),
    collectClosePreviousErrors: () => [], collectPreflightErrors: () => [],
  };
  const registry = new ToolRegistry();
  let dispatched = 0;
  for (const name of ['photoshop_create_layer', 'photoshop_paint_regions',
    'photoshop_execute_visual_microplan', 'photoshop_get_preview']) {
    registry.register(name, { tool: { name, inputSchema: { type: 'object' } },
      handler: async () => { dispatched++; throw new Error('No Photoshop mutation may occur in compiler test'); } });
  }
  return { raw, store, registry, dispatches: () => dispatched };
}

describe('Semantic Contract Compiler in the real Guard cycle', () => {
  it('compiles complete first-pass artwork with caller-free IDs and validated cross-references', async () => {
    const f = fixture();
    const compiled = await compileGuardCycle({ painting_intent: f.raw }, f.store, f.registry);
    expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
    expect(compiled.rejection).toBeUndefined();
    const scene: any = compiled.nextOperation?.scene_lighting_color_model;
    expect(scene?.emitters[0].id).toMatch(/^light_source_/);
    expect(scene?.global_value_structure.local_value_anchor).toBe(scene?.emitters[0].id);
    expect(scene?.source_frame.document_incarnation).toBe('uxp:42:current');
    expect(f.dispatches()).toBe(0);
  });

  it('reports a genuinely ambiguous artwork decision and dispatches nothing', async () => {
    const f = fixture();
    f.raw.scene_lighting_color_model.emitters.push({
      role: 'emitter', family: 'blue', provenance: 'user-or-prompt', light_role: 'blue_side_lamp',
    });
    const compiled = await compileGuardCycle({ painting_intent: f.raw }, f.store, f.registry);
    expect(compiled.violations.map(item => item.code)).toContain('semantic_reference_ambiguous');
    expect(compiled.rejection).toBeDefined();
    expect(f.dispatches()).toBe(0);
  });
});
