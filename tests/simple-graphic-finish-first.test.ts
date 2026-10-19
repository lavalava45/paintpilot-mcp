import { describe, expect, it } from 'vitest';
import { normalizeSimpleGraphicPass, simpleGraphicFoundationAdvisory } from '../src/core/guard/simple-graphic-leniency.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { foundationAdmission, SCENE_FOUNDATION_VERSION } from '../src/core/guard/scene-foundation.js';
import { SessionStore } from '../src/core/guard/session-store.js';

const ctx = (profile: string = 'simple_graphic'): any => ({
  painting_profile: profile, document_target: { id: 42 },
  logical_layer_owners: [], scene_ownership_plan: null, has_visual_frame: false,
});
const canvas = (): any => ({
  request_key: 'finish-first-flat-sky', problem_id: 'sky', document_id: 42,
  goal: 'Make one independently editable continuous sky field.',
  stage: 'GLOBAL_BLOCK_IN', scale: 'global', action_class: 'ADD',
  visual_intent: 'continuous-field',
  actions: [
    { id: 'make-field', tool: 'photoshop_create_layer', args: { name: 'Sky Field' } },
    { id: 'sky-fill', tool: 'photoshop_paint_color_gradient',
      args: { layer_id: '$steps.make-field.details.layerId',
        from: { x: 0, y: 0 }, to: { x: 400, y: 300 },
        stops: [{ position: 0, red: 20, green: 45, blue: 65 },
          { position: 1, red: 90, green: 110, blue: 125 }] } },
  ],
});
const skyProof = () => ({
  tool: 'photoshop_execute_visual_microplan', args: {
    document_id: 42, action_class: 'REFINE',
    logical_layer: { decision: 'continue-logical-layer', hypothesis_id: 'sky-owner',
      layer_id: 20 },
    steps: [{ tool: 'photoshop_paint_color_gradient', args: {
      layer_id: 20, preserve_transparency: true,
      clip_contour: [{ x: 0, y: 0 }, { x: 400, y: 0 },
        { x: 400, y: 240 }, { x: 0, y: 240 }],
    } }],
  },
});
const state = () => ({
  painting_profile: 'simple_graphic', document_id: 42,
  original_brief: 'Night skyline and a distant roofline',
  scene_foundation_policy: SCENE_FOUNDATION_VERSION,
  current_frame: { operation_id: 'reviewed-frame' },
  visual_problems: { 'bad-roofs': { status: 'open', structural_defect: {
    region_bounds: { left: 0, top: 300, right: 500, bottom: 460 },
  } } },
});
const owners = [{ hypothesis_id: 'sky-owner', layer_id: 20, temporary: false }];

describe('simple_graphic finish-first is WARN/AUTO-FIX only for provable artistic metadata', () => {
  it('normalizes a stale method hint for a native gradient only when the executable method is unique', () => {
    const registry = new ToolRegistry();
    for (const name of ['photoshop_paint_color_gradient', 'photoshop_fill_layer', 'photoshop_paint_regions']) {
      registry.register(name, { tool: { name, inputSchema: { type: 'object' } },
        handler: async () => { throw new Error('No mutation'); } });
    }
    const request = { document_id: 42, action_class: 'ADD',
      visual_intent: 'continuous-field', impact_class: 'construct',
      preferred_method_id: 'constructed-contour',
      actions: [{ tool: 'photoshop_paint_color_gradient', args: { layer_id: 12 } }] };
    const normalized = normalizeSimpleGraphicPass(request, ctx(), registry);
    expect(normalized.pass.actions).toEqual(request.actions);
    expect(normalized.pass.visual_intent).toBe(request.visual_intent);
    expect(normalized.pass.preferred_method_id).not.toBe(request.preferred_method_id);
    expect(normalized.notices.some(item => item.code === 'simple_graphic_auto_fix')).toBe(true);
    expect(normalizeSimpleGraphicPass(request, ctx('nontrivial_painting'), registry).pass).toEqual(request);
    expect(normalizeSimpleGraphicPass({ ...request, action_class: 'ERASE' }, ctx(), registry).pass.preferred_method_id).toBe(request.preferred_method_id);
  });
  it('derives a single canvas owner, separation and native field role, leaving authored input unchanged', () => {
    const authored = canvas();
    const original = structuredClone(authored);
    const result = normalizeSimpleGraphicPass(authored, ctx());
    expect(result.pass).toMatchObject({
      construction_role: 'continuous-field',
      logical_layer: { decision: 'create-new', component_space: 'canvas', layer_name: 'Sky Field',
        hypothesis_id: expect.stringMatching(/^simple_field_[a-f0-9]{18}$/) },
      layer_separation_check: { change_kind: 'new-plane', substantial: true },
    });
    expect(result.notices.map(item => item.code)).toContain('simple_graphic_auto_fix');
    expect(result.notices.map(item => item.code)).toContain('simple_graphic_warn');
    expect(authored).toEqual(original);
    expect(normalizeSimpleGraphicPass(authored, ctx()).pass).toEqual(result.pass);
  });

  it('threads bounded single-canvas owner bootstrap through the actual compiler without any Photoshop call', async () => {
    const registry = new ToolRegistry();
    let calls = 0;
    for (const name of ['photoshop_create_layer', 'photoshop_paint_color_gradient', 'photoshop_get_preview']) {
      registry.register(name, { tool: { name, inputSchema: { type: 'object' } },
        handler: async () => { calls++; throw new Error('No mutation'); } });
    }
    const store: any = { compactPassContext: () => ctx(),
      collectClosePreviousErrors: () => [], collectPreflightErrors: () => [] };
    const result = await compileGuardCycle({ next_pass: canvas() }, store, registry);
    expect(result.normalizations.map(item => item.code)).toContain('simple_graphic_auto_fix');
    expect(result.normalizations.map(item => item.code)).toContain('simple_graphic_warn');
    expect(result.violations.map(item => item.code)).not.toContain('scene_ownership_plan_required');
    expect(result.violations.map(item => item.code)).not.toContain('semantic_layer_owner_missing');
    expect(result.nextOperation?.scene_ownership_plan).toBeDefined();
    expect(calls).toBe(0);
  });

  it('does not alter strict profile, world scene, competing owners or destructive/mismatched actions', () => {
    expect(normalizeSimpleGraphicPass(canvas(), ctx('nontrivial_painting')).notices).toEqual([]);
    const wrongDoc = { ...canvas(), document_id: 99 };
    expect(normalizeSimpleGraphicPass(wrongDoc, ctx()).notices).toEqual([]);
    const wrong = canvas();
    wrong.actions[1].args.layer_id = 7;
    expect(normalizeSimpleGraphicPass(wrong, ctx()).notices).toEqual([]);
    const deletion = { ...canvas(), action_class: 'ERASE' };
    expect(normalizeSimpleGraphicPass(deletion, ctx()).notices).toEqual([]);
    const ambiguous = canvas();
    ambiguous.actions.push({ id: 'second-paint', tool: 'photoshop_paint_color_gradient',
      args: { layer_id: '$steps.make-field.details.layerId' } });
    expect(normalizeSimpleGraphicPass(ambiguous, ctx()).notices).toEqual([]);
    const withWorldOwner = { ...canvas(), logical_layer: {
      decision: 'create-new', component_space: 'world', hypothesis_id: 'building', layer_name: 'Sky Field',
    } };
    expect(normalizeSimpleGraphicPass(withWorldOwner, ctx()).notices).toEqual([]);
    const usedName = { ...ctx(), logical_layer_owners: [
      { hypothesis_id: 'other-owner', layer_id: 8, layer_name: 'Sky Field' },
    ] };
    expect(normalizeSimpleGraphicPass(canvas(), usedName).pass.logical_layer).toBeUndefined();
  });

  it('inherits missing material only from a unique known physical owner; never invents brush material', () => {
    const request = { document_id: 42, construction_role: 'structured-mass',
      visual_intent: 'mass', target_owner_id: 'person-owner',
      actions: [{ tool: 'photoshop_paint_strokes', args: { layer_id: 12, strokes: [] } }] };
    const known = { ...ctx(), logical_layer_owners: [
      { hypothesis_id: 'person-owner', layer_id: 12, temporary: false, material_role: 'fabric' },
    ] };
    expect(normalizeSimpleGraphicPass(request, known).pass.material_role).toBe('fabric');
    expect(normalizeSimpleGraphicPass(request, { ...known, logical_layer_owners: [
      ...known.logical_layer_owners, { hypothesis_id: 'person-owner', layer_id: 13, material_role: 'metal' },
    ] }).pass.material_role).toBeUndefined();
  });

  it('treats unfinished artistic foundation as advice for ordinary Simple paint, not a mandatory prerequisite', () => {
    const s = state();
    const o = skyProof();
    expect(foundationAdmission(s, o).status).toBe('blocked');
    expect(simpleGraphicFoundationAdvisory(s, o, owners)).toBe(true);
    expect(simpleGraphicFoundationAdvisory({ ...s, painting_profile: 'nontrivial_painting' }, o, owners)).toBe(false);
    const fakeStore: any = {
      paintingState: () => ({ documents: { '42': s } }),
      semanticLayerOwners: () => owners,
    };
    expect(SessionStore.prototype.sceneFoundationAdmission.call(fakeStore, 42, o))
      .toMatchObject({ status: 'advisory', warning_code: 'simple_graphic_foundation_deferred',
        missing: ['composition', 'technique'] });
    fakeStore.paintingState = () => ({ documents: { '42': {
      ...s, painting_profile: 'nontrivial_painting',
    } } });
    expect(SessionStore.prototype.sceneFoundationAdmission.call(fakeStore, 42, o).status)
      .toBe('blocked');
    expect(simpleGraphicFoundationAdvisory({ ...s, visual_problems: {} }, o, owners)).toBe(true);
    expect(simpleGraphicFoundationAdvisory(s, {}, owners)).toBe(true); // read-only next-action guidance
    const newCanal = { tool: 'photoshop_execute_visual_microplan', args: {
      document_id: 42, action_class: 'ADD', logical_layer: { decision: 'create-new',
        hypothesis_id: 'canal_water', layer_name: 'Canal Water', component_space: 'canvas' },
      steps: [
        { id: 'create', tool: 'photoshop_create_layer', args: { name: 'Canal Water' } },
        { id: 'water', tool: 'photoshop_paint_color_gradient', args: {
          layer_id: '$steps.create.details.layerId', from: { x: 0, y: 250 },
          to: { x: 400, y: 600 }, stops: [] } },
      ],
    } };
    expect(foundationAdmission(s, newCanal).status).toBe('blocked');
    expect(simpleGraphicFoundationAdvisory(s, newCanal, owners)).toBe(true);
    expect(SessionStore.prototype.sceneFoundationAdmission.call(fakeStore, 42, newCanal).status)
      .toBe('blocked'); // fakeStore above was switched to nontrivial_painting
    fakeStore.paintingState = () => ({ documents: { '42': s } });
    expect(SessionStore.prototype.sceneFoundationAdmission.call(fakeStore, 42, newCanal).status)
      .toBe('advisory');
    expect(SessionStore.prototype.sceneFoundationAdmission.call(fakeStore, 42, {}).status)
      .toBe('advisory');
  });

  it('retains hard guards for cross-document, destructive and explicitly foreign-owner commands', () => {
    const invalid = [
      [state(), { ...skyProof(), args: { ...skyProof().args, document_id: 43 } }, owners],
      [state(), { ...skyProof(), args: { ...skyProof().args, action_class: 'ROLLBACK' } }, owners],
      [state(), skyProof(), [{ hypothesis_id: 'foreign', layer_id: 20 }]],
      [state(), { ...skyProof(), args: { ...skyProof().args,
        steps: [{ tool: 'photoshop_erase', args: { layer_id: 20 } }] } }, owners],
      [state(), { ...skyProof(), args: { ...skyProof().args,
        steps: [{ tool: 'photoshop_paint_regions', args: { layer_id: 22 } }] } }, owners],
      [state(), { ...skyProof(), args: { ...skyProof().args,
        logical_layer: { ...skyProof().args.logical_layer, layer_id: 88 } } }, owners],
    ] as const;
    for (const [s, operation, linked] of invalid)
      expect(simpleGraphicFoundationAdvisory(s, operation, linked as any)).toBe(false);
    // Artistic region overlap and technique selection are reviewed after
    // painting, not turned into a mandatory pre-paint foundation declaration.
    expect(simpleGraphicFoundationAdvisory(state(), { ...skyProof(), args: { ...skyProof().args,
      steps: [{ tool: 'photoshop_paint_strokes', args: { layer_id: 20 } }] } }, owners)).toBe(true);
    expect(simpleGraphicFoundationAdvisory(state(), { ...skyProof(), args: { ...skyProof().args,
      steps: [{ tool: 'photoshop_paint_color_gradient', args: { layer_id: 20,
        preserve_transparency: false } }] } }, owners)).toBe(true);
  });
});
