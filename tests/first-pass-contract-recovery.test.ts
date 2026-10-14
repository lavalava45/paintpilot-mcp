import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { createMethodPaletteTools } from '../src/tools/method-palette-tools.js';
import { prepareTechnicalPassBindings } from '../src/core/guard/preflight-repair.js';

// Complete, untruncated next_pass recovered from CoS events.jsonl line 26.
const journalPass = JSON.parse(readFileSync(
  new URL('./fixtures/tiger-unknown-command-cos-20261011.json', import.meta.url), 'utf8',
));

function offline() {
  const registry = new ToolRegistry();
  let executed = 0;
  const define = (name: string, inputSchema: Record<string, unknown> = { type: 'object' }) =>
    registry.register(name, { tool: { name, inputSchema },
      handler: async () => { executed += 1; throw new Error('Offline preparation must never dispatch'); } });
  define('photoshop_create_layer', { type: 'object', properties: {
    name: { type: 'string' }, document_id: { type: 'integer', minimum: 1 },
  }, required: ['name'] });
  define('photoshop_paint_regions', { type: 'object', properties: {
    document_id: { type: 'integer', minimum: 1 },
    regions: { type: 'array', minItems: 1, items: { type: 'object',
      properties: {
        id: { type: 'string' },
        color: { type: 'object', properties: {
          red: { type: 'integer', minimum: 0, maximum: 255 },
          green: { type: 'integer', minimum: 0, maximum: 255 },
          blue: { type: 'integer', minimum: 0, maximum: 255 },
        }, required: ['red', 'green', 'blue'] },
        contours: { type: 'array', minItems: 1, items: {
          type: 'object', properties: { points: { type: 'array', minItems: 3, items: {
            type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'],
          } } }, required: ['points'],
        } },
        layer_id: { type: 'integer', minimum: 1 },
      }, required: ['id', 'color', 'contours'],
    } },
  }, required: ['regions'] });
  for (const name of ['photoshop_paint_strokes', 'photoshop_set_brush',
    'photoshop_select_brush_preset', 'photoshop_list_brush_presets',
    'photoshop_get_preview', 'photoshop_execute_visual_microplan']) define(name);
  const state = { painting_profile: 'simple_graphic', logical_layer_owners: [] };
  const store: any = {
    compactPassContext: () => state,
    collectClosePreviousErrors: () => [],
    collectPreflightErrors: () => [],
  };
  return { registry, store, executed: () => executed };
}

describe('first-pass contract recovery from recorded CoS tiger rejection', () => {
  it('returns the selected executor contract and a specific correction for the untruncated CoS command', async () => {
    const { registry, store, executed } = offline();
    const selection = createMethodPaletteTools(registry).find(x => x.tool.name === 'photoshop_select_painting_method')!;
    const response = JSON.parse(String((await selection.handler({
      construction_role: 'structured-mass', impact_class: 'construct', preferred_method_id: 'region-block-in',
    })).content[0].text));
    expect(response.execution_contract).toMatchObject({
      method_id: 'region-block-in',
      allowed_commands: ['photoshop_paint_regions'],
      request_skeleton: { next_pass: { preferred_method_id: 'region-block-in',
        actions: [{ tool: 'photoshop_paint_regions' }] } },
    });
    expect(response.execution_contract.action_contracts[0].input_schema.properties.regions.items
      .properties.contours.items.properties.points.items.required).toEqual(['x', 'y']);
    const schema: any = createGuardTools({} as any).find(x => x.tool.name === 'photoshop_guard_cycle_auto')!.tool.inputSchema;
    expect(schema.properties.next_pass.properties.logical_layer.properties.camera_binding
      .properties.expected_focus_role.enum).toContain('sharp');
    expect(schema.properties.painting_intent.properties.logical_layer.properties.surface_frame
      .properties.axes.items.required).toContain('angle_degrees');
    const recorded = await compileGuardCycle({ next_pass: structuredClone(journalPass) }, store, registry);
    const recordedRows = JSON.parse(String(recorded.rejection!.content[0].text))
      .compact_correction_recipe.field_correction_packet.corrections;
    expect(recordedRows).toEqual(expect.arrayContaining([expect.objectContaining({
      path: 'next_pass.actions[0].tool', selected_method_id: 'installed-brush-preset',
      allowed: ['photoshop_paint_strokes'],
    })]));
    expect(executed()).toBe(0);
  });

  it('bundles the unknown command and independent format faults into a single rejection', async () => {
    const { registry, store, executed } = offline();
    const broken = structuredClone(journalPass);
    broken.preferred_method_id = 'region-block-in'; // Explicitly select the desired semantics.
    broken.request_key = ''; // Independently invalid envelope, same correction packet.
    const cycle = await compileGuardCycle({ next_pass: broken }, store, registry);
    expect(cycle.violations.map(v => v.code)).toContain('compact_action_tool_invalid');
    const rejection = JSON.parse(String(cycle.rejection!.content[0].text));
    const rows = rejection.compact_correction_recipe.field_correction_packet.corrections;
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'next_pass.actions[0].tool', allowed: ['photoshop_paint_regions'] }),
    ]));
    expect(cycle.violations.length).toBeGreaterThan(1);
    expect(rejection.error_codes).toContain('compact_request_key_required');
    expect(rejection.compact_correction_recipe.field_correction_packet.corrections).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'compact_request_key_required' })]),
    );
    expect(executed()).toBe(0);
  });

  it('prepares a corrected pass offline, derives unique technical bindings and rejects foreign targets', async () => {
    const { registry, store, executed } = offline();
    const corrected = structuredClone(journalPass);
    corrected.visual_intent = 'mass';
    corrected.material_role = 'fur';
    corrected.preferred_method_id = 'region-block-in';
    corrected.scene_ownership_plan.units[0].editability = 'independent';
    corrected.scene_ownership_plan.units[0].edit_axes = ['visibility', 'position', 'rollback'];
    corrected.layer_separation_check = {
      change_kind: 'new-object', substantial: true, rollback_value: 'high',
      independent_adjustment_expected: true,
    };
    corrected.scene_ownership_plan.objects[0].component_semantic_ids =
      ['tiger_underpaint', 'tiger_head', 'tiger_paws', 'tiger_tail'];
    corrected.scene_ownership_plan.units.push(...[
      ['tiger_head', 'Head'], ['tiger_paws', 'Paws'], ['tiger_tail', 'Tail'],
    ].map(([semantic_id, role]) => ({ semantic_id, owner_id: semantic_id,
      role, editability: 'independent', edit_axes: ['visibility', 'position', 'rollback'] })));
    const points = corrected.actions[0].args.points.map(([x, y]: number[]) => ({ x, y }));
    corrected.actions = [
      { tool: 'photoshop_create_layer', args: { document_id: corrected.document_id } },
      { tool: 'photoshop_paint_regions', args: { regions: [{
        id: 'tiger-underpaint', contours: [{ points }],
        color: { red: 186, green: 112, blue: 61 },
      }] } },
    ];
    const bound = prepareTechnicalPassBindings(corrected, {});
    expect(bound.issues).toEqual([]);
    expect((bound.pass.actions as any)[0].args.name).toBe('Tiger | silhouette');
    const cycle = await compileGuardCycle({ next_pass: corrected }, store, registry);
    expect(cycle.violations, JSON.stringify(cycle.violations)).toEqual([]);
    expect(executed()).toBe(0);
    const mismatch = structuredClone(corrected);
    mismatch.actions[0].args.name = 'Wrong unrelated layer';
    const synchronized = prepareTechnicalPassBindings(mismatch, {});
    expect(synchronized.issues).toEqual([]);
    expect((synchronized.pass.actions as any)[0].args.name).toBe('Tiger | silhouette');
    expect(synchronized.repairs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'normalize', path: 'next_pass.actions[].args.name' }),
    ]));
    expect((mismatch.actions as any)[0].args.name).toBe('Wrong unrelated layer');
    // The same preparation must pin only exact durable facts, not artistic choices.
    const context = { document_incarnation_id: 'doc-42-current',
      logical_layer_owners: [{ hypothesis_id: 'head-owner', layer_id: 71,
        layer_name: 'Tiger head', rollback_value: 'high' }],
      scene_geometry_model: { model_id: 'artist-geometry', revision: 3 },
      scene_camera_imaging_model: { model_id: 'artist-camera', revision: 2 },
    };
    const pass: any = { document_id: 42,
      logical_layer: { decision: 'continue-logical-layer', hypothesis_id: 'head-owner',
        camera_binding: { depth_role: 'focal', expected_focus_role: 'sharp',
          approximate_depth_rationale: 'Selected approximate depth in the scene' } },
      scene_lighting_color_model: { model_id: 'artist-light', revision: 1,
        source_frame: {} },
      actions: [{ tool: 'photoshop_paint_regions', args: { regions: [{
        id: 'head', color: { red: 70, green: 40, blue: 20 }, contours: [{ points: [
          { x: 1, y: 1 }, { x: 9, y: 1 }, { x: 7, y: 6 },
        ] }],
      }] } }],
    };
    const result = prepareTechnicalPassBindings(pass, context);
    expect(result.issues).toEqual([]);
    expect((result.pass.logical_layer as any).layer_id).toBe(71);
    expect((result.pass.actions as any)[0].args.regions[0].layer_id).toBe(71);
    expect((result.pass.logical_layer as any).camera_binding).toMatchObject({
      scene_camera_model_id: 'artist-camera', scene_camera_revision: 2,
      depth_role: 'focal', expected_focus_role: 'sharp',
    });
    expect((result.pass.scene_lighting_color_model as any).source_frame).toEqual({
      document_id: 42, document_incarnation: 'doc-42-current',
    });
    expect((pass.actions as any)[0].args.regions[0].layer_id).toBeUndefined();
    const foreign = structuredClone(pass);
    foreign.actions[0].args.regions[0].layer_id = 99;
    const rejected = prepareTechnicalPassBindings(foreign, context);
    expect(rejected.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'next_pass.actions[0].args.regions[0].layer_id' }),
    ]));
    expect((rejected.pass.actions as any)[0].args.regions[0].layer_id).toBe(99);
  });
});
