import { describe, expect, it } from 'vitest';
import { compileSemanticContracts } from '../src/core/guard/semantic-entity-registry.js';
import { applySemanticPublicSchema, SEMANTIC_CONTRACT_SPEC } from '../src/core/guard/semantic-contract-spec.js';
import { normalizeSceneLightingColorModel } from '../src/core/scene-lighting-color-model.js';
import { collectSchemaErrors, compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { createGuardTools } from '../src/tools/guard-tools.js';

const light = (overrides: Record<string, unknown> = {}) => ({
  global_value_structure: { key: 'low', local_value_anchor: 'Тёплый локальный свет из окна' },
  ambient_environment: { role: 'ambient', family: 'cool_blue', provenance: 'user-or-prompt', chroma: 'low', value_role: 'sky_fill' },
  emitters: [{ role: 'emitter', family: 'warm_amber', provenance: 'artist-selected', light_role: 'local_primary' }],
  palette_relations: ['cool_dominates_warm'], sampled_anchors: [], intentional_exceptions: [],
  ...overrides,
});
const pass = (model: Record<string, unknown> = light()) => ({ document_id: 42, scene_lighting_color_model: model });
const context = { document_incarnation_id: 'uxp:42:current' };

describe('declarative semantic contracts', () => {
  it('replaces boilerplate IDs and prose local_value_anchor with a unique typed light source', () => {
    const raw = pass();
    const compiled = compileSemanticContracts(raw, context);
    expect(compiled.issues).toEqual([]);
    const model = normalizeSceneLightingColorModel(compiled.pass.scene_lighting_color_model);
    expect(model.global_value_structure.local_value_anchor).toBe(model.emitters[0].id);
    expect(model.emitters[0].id).toMatch(/^light_source_[a-f0-9]{16}$/);
    expect(model.source_frame).toMatchObject({ document_id: 42, document_incarnation: 'uxp:42:current' });
    expect(model.revision).toBe(1);
    expect(model.emitters[0]).toMatchObject({ provenance: 'artist-selected', family: 'warm_amber' });
    expect((raw.scene_lighting_color_model as any).emitters[0]).not.toHaveProperty('id');
    expect(compileSemanticContracts(raw, context).pass).toEqual(compiled.pass);
    expect(compileSemanticContracts(compiled.pass, context).pass).toEqual(compiled.pass);
  });

  it('preserves identity across reordering uniquely described declarations', () => {
    const a = light({ emitters: [
      { role: 'emitter', family: 'amber', light_role: 'warm_window', provenance: 'user-or-prompt' },
      { role: 'emitter', family: 'blue', light_role: 'cool_moon', provenance: 'user-or-prompt' },
    ], global_value_structure: { key: 'low', local_value_anchor: 'warm_window' } });
    const before = compileSemanticContracts(pass(a), context);
    const b = light({ ...a, emitters: [...(a.emitters as any[])].reverse() });
    const after = compileSemanticContracts(pass(b), context);
    expect(before.issues).toEqual([]);
    expect(after.issues).toEqual([]);
    const get = (row: any) => Object.fromEntries(row.scene_lighting_color_model.emitters.map((e: any) => [e.light_role, e.id]));
    expect(get(before.pass)).toEqual(get(after.pass));
    expect((before.pass.scene_lighting_color_model as any).global_value_structure.local_value_anchor).toBe(get(before.pass).warm_window);
  });

  it('reports ambiguous selectors together without picking an arbitrary artistic source', () => {
    const raw = pass(light({ emitters: [
      { role: 'emitter', family: 'warm', light_role: 'candle', provenance: 'user-or-prompt' },
      { role: 'emitter', family: 'cool', light_role: 'moon', provenance: 'user-or-prompt' },
    ] }));
    const result = compileSemanticContracts(raw, context);
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'semantic_reference_ambiguous',
      path: 'scene_lighting_color_model.global_value_structure.local_value_anchor',
    })]);
    expect((result.pass.scene_lighting_color_model as any).global_value_structure.local_value_anchor)
      .toBe('Тёплый локальный свет из окна');
  });

  it('never reassigns an explicit unknown ID or hides a stale host witness', () => {
    const raw = pass(light({ global_value_structure: { key: 'low', local_value_anchor: 'other_light_id' },
      source_frame: { document_id: 42, document_incarnation: 'uxp:42:stale' } }));
    const result = compileSemanticContracts(raw, context);
    expect(result.issues.map(item => item.code).sort()).toEqual([
      'semantic_pin_conflict', 'semantic_reference_unresolved',
    ]);
    expect((result.pass.scene_lighting_color_model as any).source_frame.document_incarnation).toBe('uxp:42:stale');
    expect((result.pass.scene_lighting_color_model as any).global_value_structure.local_value_anchor).toBe('other_light_id');
  });

  it('refuses indistinguishable unlabelled declarations instead of giving order-based IDs', () => {
    const raw = pass(light({ emitters: [
      { role: 'emitter', family: 'warm', light_role: 'accent', provenance: 'user-or-prompt' },
      { role: 'emitter', family: 'warm', light_role: 'accent', provenance: 'user-or-prompt' },
    ] }));
    const result = compileSemanticContracts(raw, context);
    expect(result.issues.some(issue => issue.code === 'semantic_identity_conflict')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'semantic_reference_ambiguous')).toBe(false);
  });

  it('uses exact durable model incarnation and revision for an authored update', () => {
    const initial = compileSemanticContracts(pass(light()), context);
    const durable = { ...context, scene_lighting_color_model: initial.pass.scene_lighting_color_model };
    const updated = compileSemanticContracts(pass(light({
      global_value_structure: { key: 'mid', local_value_anchor: 'local_primary' },
    })), durable);
    expect(updated.issues).toEqual([]);
    const previous = initial.pass.scene_lighting_color_model as any;
    const next = updated.pass.scene_lighting_color_model as any;
    expect(next.model_id).toBe(previous.model_id);
    expect(next.revision).toBe(2);
    const visuallyChanged = compileSemanticContracts(pass(light({
      emitters: [{ role: 'emitter', family: 'cold_blue', provenance: 'artist-selected', light_role: 'local_primary' }],
    })), durable);
    expect((visuallyChanged.pass.scene_lighting_color_model as any).emitters[0].id)
      .toBe(previous.emitters[0].id);
  });

  it('compiles typed geometry refs and stable declarations without inventing perspective coordinates', () => {
    const raw = { document_id: 42, scene_geometry_model: {
      applicability: 'coherent_3d', projection: { kind: 'one_point',
        vanishing_points: [{ x: 100, y: 20, evidence: 'proposed', derived_from: [] }] },
      line_families: [{ members: [], vanishing_point_id: '' }], support_planes: [], scale_anchors: [],
    } };
    const withVanishing = compileSemanticContracts(raw, context);
    const geometry: any = withVanishing.pass.scene_geometry_model;
    expect(geometry.projection.vanishing_points[0].id).toMatch(/^vanishing_point_/);
    expect(geometry.projection.vanishing_points[0]).toMatchObject({ x: 100, y: 20 });
    // Explicit bad reference remains a decision; no guessed target.
    expect(withVanishing.issues.some(issue => issue.code === 'semantic_reference_unresolved')).toBe(true);
  });

  it('one specification derives required-field schema affordances for identity and host pins', () => {
    const schema: any = { type: 'object', properties: { scene_lighting_color_model: {
      type: 'object', required: ['model_id', 'revision', 'source_frame', 'emitters'],
      properties: { model_id: { type: 'string' }, source_frame: {
        type: 'object', required: ['document_id', 'document_incarnation'],
        properties: { document_id: { type: 'number' }, document_incarnation: { type: 'string' } },
      }, emitters: { type: 'array', items: { type: 'object', required: ['id', 'role'],
        properties: { id: { type: 'string' }, role: { type: 'string' } } } },
      },
    } } };
    applySemanticPublicSchema(schema);
    expect(schema.properties.scene_lighting_color_model.required).toEqual(['emitters']);
    expect(schema.properties.scene_lighting_color_model.properties.emitters.items.required).toEqual(['role']);
    expect(schema.properties.scene_lighting_color_model.properties.source_frame.required).toEqual([]);
    expect(SEMANTIC_CONTRACT_SPEC.references.some(ref => ref.path.endsWith('.local_value_anchor'))).toBe(true);
  });

  it('the actual published Guard schema admits compiler-managed identities instead of rejecting artistic input first', () => {
    const cycle = createGuardTools({} as any).find(tool => tool.tool.name === 'photoshop_guard_cycle_auto')!;
    const publicSchema = cycle.tool.inputSchema;
    const submitted = { next_pass: {
      request_key: 'first-light-contract',
      document_id: 42, goal: 'Lay in the station light.',
      scene_lighting_color_model: light(),
    } };
    expect(collectSchemaErrors(submitted, publicSchema, 'cycle')).toEqual([]);
  });

  it('production cycle compiles the light reference before strict scene validation and never dispatches while missing artistic data', async () => {
    const tools = new ToolRegistry();
    let dispatches = 0;
    tools.register('photoshop_guard_cycle_auto', {
      tool: { name: 'photoshop_guard_cycle_auto', inputSchema: createGuardTools({} as any)
        .find(tool => tool.tool.name === 'photoshop_guard_cycle_auto')!.tool.inputSchema },
      handler: async () => { dispatches++; throw new Error('No real Photoshop dispatch is allowed in this fixture.'); },
    });
    const store: any = { compactPassContext: () => context,
      collectClosePreviousErrors: () => [], collectPreflightErrors: () => [] };
    const compiled = await compileGuardCycle({ next_pass: {
      request_key: 'first-light-contract',
      problem_id: 'station-light',
      document_id: 42, goal: 'Lay in the station light.',
      scene_lighting_color_model: light(),
    } }, store, tools);
    expect(compiled.violations.map(item => item.code)).not.toContain('scene_lighting_color_model_invalid');
    expect(compiled.normalizations.map(item => item.code)).toContain('semantic_contract_compiled');
    expect(dispatches).toBe(0);
  });
});
