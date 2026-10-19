import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { compileMinimalOwnerBootstrap } from '../src/core/guard/ownership-bootstrap-compiler.js';
import { compileSemanticOwnership } from '../src/core/guard/semantic-execution-compiler.js';

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'owner-session-chain-'));
  roots.push(root);
  const reload = () => new SessionStore(path.join(root, 'controller'), { workspaceRoot: root });
  return { store: reload(), reload };
}
const result = (body: any) => ({ content: [{ type: 'text', text: JSON.stringify(body) }] });
const logical = { decision: 'create-new', hypothesis_id: 'sky', hypothesis: 'Sky field',
  layer_name: 'Sky', component_space: 'canvas', physical_role: 'atmosphere', opacity_role: 'effect-only',
  rollback_value: 'moderate', construction_tier: 'primary', depth_relations: [] };
const plan = compileMinimalOwnerBootstrap({ document_id: 42, logical_layer: { ...logical, construction_tier: undefined },
  construction_role: 'continuous-field', visual_intent: 'continuous-field',
  actions: [{ id: 'new', tool: 'photoshop_create_layer', args: { name: 'Sky' } },
    { id: 'paint', tool: 'photoshop_fill_layer', args: { layer_id: '$steps.new.details.layerId' } }],
}).pass.scene_ownership_plan;
function record(id: string, sequence: number, changes: any = {}): any {
  return { id, sequence, created_at: new Date(sequence * 1000).toISOString(),
    tool: 'photoshop_execute_visual_microplan', args: { document_id: 42, logical_layer: logical },
    phase: 'completed', failed: false, execution: 'completed',
    scene_ownership_plan: plan,
    result: result({ ok: true, continuation_layers: [{ ...logical, layer_id: 2, temporary: true }] }), ...changes };
}

describe('durable ownership lifecycle across real journal reloads', () => {
  it.each([
    { phase: 'queued' }, { phase: 'prepared' }, { phase: 'uncertain' },
    { execution: 'uncertain' }, { execution: 'not-executed' }, { failed: true },
    { execution: 'failed' }, { dispatched: false },
    { rolled_back: true }, { current_frame_authority: false },
    { rollback: { completed: true } }, { resolved: { outcome: 'abandoned' } },
  ])('does not register a proposal or resurrect a rejected/retired binding: %j', changes => {
    const { store, reload } = fixture();
    store.write(record('proposal', 1, changes));
    const restarted = reload();
    expect(restarted.semanticLayerOwners(42)).toEqual([]);
    expect(restarted.sceneOwnershipPlan(42)).toBeNull();
  });

  it('projects the same owner and plan from a reconciled native partial create after failure', () => {
    const { store, reload } = fixture();
    store.write(record('partial', 1, { failed: true, execution: 'partial', resolved: { outcome: 'partial' },
      args: { document_id: 42, logical_layer: logical,
        steps: [{ id: 'create', tool: 'photoshop_create_layer' }] },
      result: result({ ok: false, steps: [{ id: 'create', tool: 'photoshop_create_layer', ok: true, execution: 'completed' }],
        completed_results: { create: { ok: true, document_target: { id: 42 }, details: { layerId: 2 } } } }),
    }));
    const restarted = reload();
    expect(restarted.semanticLayerOwners(42)).toContainEqual(expect.objectContaining({ hypothesis_id: 'sky', layer_id: 2 }));
    expect(restarted.sceneOwnershipPlan(42)?.units[0].owner_id).toBe('sky');
    expect(restarted.semanticLayerOwners(43)).toEqual([]);
    const invalid = store.read('partial')!;
    invalid.result = result({ ok: false, steps: [{ id: 'create', tool: 'photoshop_create_layer', ok: true, execution: 'completed' }],
      completed_results: { create: { ok: true, document_target: { id: 43 }, details: { layerId: 2 } } } });
    store.write(invalid);
    expect(reload().semanticLayerOwners(42)).toEqual([]);
    expect(reload().sceneOwnershipPlan(42)).toBeNull();
  });

  it('retains metadata through continuation and keep, then undo cannot be undone by metadata-only keep', () => {
    const { store, reload } = fixture();
    store.write(record('created', 1));
    store.write(record('continued', 2, { scene_ownership_plan: undefined,
      result: result({ ok: true, continuation_layers: [{ hypothesis_id: 'sky', layer_id: 2, decision: 'adjust' }] }) }));
    store.write(record('kept', 3, { tool: 'photoshop_guard_keep_logical_layer',
      args: { document_id: 42, hypothesis_id: 'sky', layer_id: 2 },
      result: result({ ok: true, continuation_layers: [{ hypothesis_id: 'sky', layer_id: 2, decision: 'keep', temporary: false }] }) }));
    const before = reload().semanticLayerOwners(42);
    expect(before[0]).toMatchObject({ ...logical, decision: 'keep', layer_id: 2, temporary: false });
    before[0].depth_relations.push({ relation: 'above', target_hypothesis_id: 'untrusted' });
    expect(reload().semanticLayerOwners(42)[0].depth_relations).toEqual([]);
    for (const id of ['created', 'continued']) store.write({ ...store.read(id), rolled_back: true, current_frame_authority: false });
    expect(reload().semanticLayerOwners(42)).toEqual([]);
    expect(reload().sceneOwnershipPlan(42)).toBeNull();
  });

  it('drops prepared binding on a new document incarnation despite reused numeric document and layer ids', () => {
    const { store, reload } = fixture();
    store.write(record('old-document-owner', 1));
    store.updatePaintingState(42, current => ({ ...current, document_instance: { superseded_through_sequence: 1 } }));
    expect(reload().semanticLayerOwners(42)).toEqual([]);
    expect(reload().sceneOwnershipPlan(42)).toBeNull();
  });

  it('retains unbound creation receipts after restart but never consumes a declaration or accepts a forged/foreign source', () => {
    const { store, reload } = fixture();
    store.write(record('unbound-create', 1, { tool: 'photoshop_create_layer', scene_ownership_plan: undefined,
      dispatched: true, visual: false,
      result: result({ ok: true, document_target: { id: 42 }, details: { layerId: 2, layerName: 'Sky',
        context: { activeLayer: { isBackground: false, bounds: { left: 0, top: 0, right: 0, bottom: 0 } } } } }) }));
    const input = { document_id: 42, target_owner_id: 'sky', action_class: 'ADD',
      logical_layer: { ...logical, decision: 'continue-logical-layer', layer_id: 2 },
      actions: [{ tool: 'photoshop_fill_layer', args: { layer_id: 2 } }] };
    const context = reload().compactPassContext(42);
    expect(context.pending_created_layers).toHaveLength(1);
    const compiled = compileSemanticOwnership(input, context);
    expect(compiled.issues).toEqual([]);
    expect(compiled.pass.logical_layer).toMatchObject({ binding_source_operation_id: 'unbound-create' });
    expect(reload().semanticLayerOwners(42)).toEqual([]);
    expect(reload().sceneOwnershipPlan(42)).toBeNull();
    expect(input.logical_layer).not.toHaveProperty('binding_source_operation_id');
    store.write(record('preparation-failed', 2, { phase: 'completed', failed: true, execution: 'partial',
      resolved: { outcome: 'partial' }, scene_ownership_plan: undefined, result: result({ ok: false }) }));
    expect(reload().compactPassContext(42).pending_created_layers).toHaveLength(1);
    expect(compileSemanticOwnership({ ...input, logical_layer: { ...input.logical_layer,
      binding_source_operation_id: 'foreign-source' } }, context).issues).not.toEqual([]);
    expect(compileSemanticOwnership(compiled.pass, reload().compactPassContext(43)).issues).not.toEqual([]);
    store.updatePaintingState(42, current => ({ ...current, document_instance: { superseded_through_sequence: 1 } }));
    expect(reload().compactPassContext(42).pending_created_layers).toEqual([]);
    expect(compileSemanticOwnership(compiled.pass, reload().compactPassContext(42)).issues).not.toEqual([]);
  });

  it('inherits temporary owners for target selection and defers historical targets to the explicit cross-layer contract', () => {
    const context = { logical_layer_owners: [{ hypothesis_id: 'sky', layer_id: 2, temporary: true, physical_layer_ids: [2, 3] }] };
    const input = { target_owner_id: 'sky', actions: [{ tool: 'photoshop_fill_layer', args: { layer_id: 2 } }] };
    expect(compileSemanticOwnership(input, context).pass.logical_layer).toMatchObject({ layer_id: 2 });
    const cross = { ...input, actions: [{ tool: 'photoshop_fill_layer', args: { layer_id: 3 } }],
      cross_layer_correction: { mode: 'correction', current_layer_id: 2, target_layer_ids: [3], post_authoritative_layer_id: 2 } };
    expect(compileSemanticOwnership(cross, context).issues).toEqual([]);
    expect(compileSemanticOwnership({ ...cross, cross_layer_correction: undefined }, context).issues).not.toEqual([]);
    expect(compileSemanticOwnership(input, { logical_layer_owners: [...context.logical_layer_owners,
      { hypothesis_id: 'foreign', layer_id: 2 }] }).issues[0].code).toBe('semantic_execution_owner_ambiguous');
  });

  it('removes deleted bindings using the real atomic layer-list envelope, without accepting another document inventory', () => {
    const { store, reload } = fixture();
    store.write(record('created', 1));
    const inventory = record('inventory', 2, { tool: 'photoshop_get_layers',
      result: result({ ok: true, document_target: { id: 43 }, details: { layers: [] } }) });
    store.write(inventory);
    expect(reload().semanticLayerOwners(42)).toHaveLength(1);
    store.write({ ...inventory, result: result({ ok: true, document_target: { id: 42 }, details: { layers: [] } }) });
    expect(reload().semanticLayerOwners(42)).toEqual([]);
  });

  it.each(['scene_geometry_model', 'scene_lighting_color_model', 'scene_camera_imaging_model'])
    ('does not expose a failed, queued or undone %s as current or historical binding authority', field => {
      const { store, reload } = fixture();
      store.updatePaintingState(42, current => ({ ...current, document_instance: { host_witness: {
        protocol: 'photoshop.uxp.document_instance_witness.v1', session_id: 'session', token: 'instance',
      } } }));
      const source_frame = { document_id: 42, document_incarnation: 'instance', width: 400, height: 300 };
      const model: any = field === 'scene_geometry_model'
        ? { model_id: 'model', revision: 1, applicability: 'coherent_3d', source_frame, projection: { kind: 'one_point', vanishing_points: [] } }
        : field === 'scene_lighting_color_model'
          ? { model_id: 'model', revision: 1, source_frame,
            ambient_environment: { id: 'ambient', role: 'ambient', family: 'blue', chroma: 'low', value_role: 'sky', provenance: 'artist-selected' },
            emitters: [], atmosphere: { id: 'air', density_role: 'clear', contrast_effect: 'none', color_bias: 'neutral', provenance: 'artist-selected' },
            global_value_structure: { key: 'high', local_value_anchor: 'ambient', atmospheric_lift: 'air' },
            sampled_anchors: [], intentional_exceptions: [] }
          : { model_id: 'model', revision: 1, source_frame, geometry_model_id: 'geometry', geometry_model_revision: 1,
            camera: { framing: 'wide scene', view_character: 'wide', lens_character: 'wide lens' },
            focus: { focal_depth_or_plane: 'scene', depth_of_field_behavior: 'deep', foreground_softness: 'none', background_softness: 'slight' },
            motion: { camera_motion: 'locked', subject_motion: 'static', shutter_character: 'frozen' },
            optical_response: { base_softness: 'low', bloom: 'none', halation: 'none' },
            capture_finish: { grain: 'none', vignette: 'none', film_or_sensor_character: 'digital' }, intentional_exceptions: [] };
      const getter = field === 'scene_geometry_model' ? 'sceneGeometryModel'
        : field === 'scene_lighting_color_model' ? 'sceneLightingColorModel' : 'sceneCameraImagingModel';
      store.write(record('model-r1', 1, { [field]: model }));
      expect((reload() as any)[getter](42)?.revision).toBe(1);
      for (const changes of [{ failed: true }, { phase: 'queued' }, { execution: 'uncertain' }, { execution: 'not-executed' },
        { execution: 'failed' }, { dispatched: false }, { resolved: { outcome: 'partial' } },
        { rolled_back: true }, { current_frame_authority: false }, { resolved: { outcome: 'abandoned' } }]) {
        store.write(record('invalid-r2', 2, { [field]: { ...model, revision: 2 }, ...changes }));
        expect((reload() as any)[getter](42)?.revision, JSON.stringify(changes)).toBe(1);
        expect((reload() as any)[getter + 'Revision'](42, 'model', 2)).toBeNull();
      }
    });
});
