import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { constructionOwnershipPlan, normalizeConstructionModel, expandConstructionPass } from '../src/core/object-construction.js';
import { normalizeSceneOwnershipPlan, sceneComponentScopeIssue } from '../src/core/scene-ownership-plan.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

import { parsePaintingIntent, normalizeGuardActionIds } from '../src/core/guard/painting-intent.js';
import {
  NextPassCompilerError,
  compilePaintingIntentToNextPass,
  resolvePlannerBinding,
} from '../src/core/guard/next-pass-compiler.js';

function existingOwnerContext() {
  return {
    stage: 'FORM',
    scale: 'medium',
    painting_profile: 'nontrivial_painting',
    logical_layer_owners: [
      {
        hypothesis_id: 'coat-owner',
        hypothesis: 'Main coat mass',
        layer_id: 17,
        layer_name: 'Coat',
        rollback_value: 'low',
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
        construction_tier: 'primary',
        geometry_binding: {
          scene_geometry_model_id: 'scene-geometry',
          scene_geometry_revision: 3,
          owner_id: 'coat-owner',
        },
        camera_binding: { scene_camera_model_id: 'camera', scene_camera_revision: 2 },
        attention_binding: { hierarchy_revision: 4, zone_id: 'hero', dimensions: ['detail'] },
      },
      {
        hypothesis_id: 'background-owner',
        layer_id: 9,
        layer_name: 'Background',
      },
    ],
    brush_roles: [
      {
        role_id: 'fur-form',
        material_roles: ['fur'],
        visual_intents: ['directional-mass'],
      },
    ],
    art_director: {
      directive_id: 'directive-7',
      current_task_id: 'task-coat',
      tasks: [{
        task_id: 'task-coat',
        status: 'active',
        allowed_scales: ['medium', 'small'],
        allowed_global_changes: ['local-tone'],
      }],
    },
  };
}

function existingOwnerIntent() {
  return parsePaintingIntent({
    request_key: 'coat-refine-01',
    problem_id: 'coat-material',
    document_id: 42,
    goal: 'Build directional fur structure on the coat.',
    target_owner_id: 'coat-owner',
    action: 'refine',
    visual_intent: 'directional-mass',
    preserve: ['background-owner'],
    actions: [
      {
        id: 'fur-a',
        tool: 'photoshop_paint_strokes',
        method_id: 'installed-brush',
        args: {
          opacity: 70,
          strokes: [{ points: [{ x: 20, y: 20 }, { x: 40, y: 30 }] }],
        },
      },
      {
        id: 'fur-b',
        tool: 'photoshop_paint_strokes',
        method_id: 'installed-brush',
        args: {
          opacity: 70,
          strokes: [{ points: [{ x: 50, y: 40 }, { x: 70, y: 55 }] }],
        },
      },
    ],
  });
}

describe('NextPassCompiler', () => {
  it('accepts a redundant create_layer alongside construction but rejects meaningful extra actions', () => {
    const construction = { model_id: 'room-construction-v1', part_id: 'coat-owner',
      color: { red: 120, green: 80, blue: 40 } };
    const redundant = parsePaintingIntent({ ...existingOwnerIntent(), actions: [
      { tool: 'photoshop_create_layer', args: { document_id: 42 } },
    ], construction });
    const result = compilePaintingIntentToNextPass(redundant, { compactPassContext: existingOwnerContext });
    expect(result.next_pass.construction).toEqual(construction);
    expect(result.next_pass.actions).toBeUndefined();
    expect(result.diagnostics.map(row => row.code)).toContain('intent_redundant_construction_layer_removed');
    const placed = parsePaintingIntent({ ...redundant, actions: [
      { tool: 'photoshop_create_layer', args: { above_layer_id: 77 } },
    ] });
    expect(() => compilePaintingIntentToNextPass(placed, { compactPassContext: existingOwnerContext }))
      .toThrow(/Choose exactly one/);
  });
  it('unified admission inherits task scale and BOTH correction links without inventing unrelated intent', () => {
    const context: any = existingOwnerContext();
    context.scale = 'global';
    Object.assign(context.art_director, { status: 'active', review_due: false });
    Object.assign(context.art_director.tasks[0], { allowed_scales: ['medium'],
      allowed_global_changes: ['depth-structure'], construction_plan: { representation_strategy: 'Rebuild an owned component' },
      correction_target: { problem_id: 'scene-debt', region_bounds: { left: 0, top: 0, right: 200, bottom: 200 } } });
    context.critic_correction = { problem_id: 'component-defect', component_ids: ['coat-owner'],
      allowed_change_domains: ['large-value'] };
    const intent = parsePaintingIntent({ ...existingOwnerIntent(), visual_intent: 'mass', impact_class: 'construct',
      region_bounds: { left: 10, top: 10, right: 150, bottom: 150 } });
    const compiled = compilePaintingIntentToNextPass(intent, { compactPassContext: () => context }).next_pass;
    expect(compiled).toMatchObject({ scale: 'medium', addresses_problem_ids: ['scene-debt', 'component-defect'],
      change_domains: ['depth-structure'] });
    const parentOnly = compilePaintingIntentToNextPass(parsePaintingIntent({ ...intent,
      addresses_problem_id: 'scene-debt' }), { compactPassContext: () => context }).next_pass;
    expect(parentOnly.addresses_problem_ids).toEqual(['scene-debt', 'component-defect']);
    const other = compilePaintingIntentToNextPass(parsePaintingIntent({ ...intent,
      addresses_problem_id: 'different-artistic-choice' }), { compactPassContext: () => context }).next_pass;
    expect(other.addresses_problem_ids).toEqual(['different-artistic-choice', 'scene-debt']);
    expect(compilePaintingIntentToNextPass(parsePaintingIntent({ ...intent, scale: 'global' }),
      { compactPassContext: () => context }).next_pass.scale).toBe('global');
    context.art_director.tasks[0].allowed_scales = ['medium', 'small'];
    expect(() => compilePaintingIntentToNextPass(intent, { compactPassContext: () => context }))
      .toThrow(/Choose painting_intent.scale/);
    context.art_director.tasks[0].allowed_scales = ['medium'];
    context.critic_correction.component_ids = ['another-owner'];
    expect(compilePaintingIntentToNextPass(parsePaintingIntent({ ...intent, addresses_problem_id: 'scene-debt' }),
      { compactPassContext: () => context }).next_pass.addresses_problem_ids).toEqual(['scene-debt']);
  });
  it('unified admission derives technical brush fit for a novel purpose and respects working scale', () => {
    const context: any = existingOwnerContext();
    context.brush_roles[0].working_scale = 'medium';
    const intent = parsePaintingIntent({ ...existingOwnerIntent(), visual_intent: 'mass',
      preferred_brush_role: 'fur-form', brush_use_reason: 'Test the dry brush on a bounded new planar form.' });
    expect(compilePaintingIntentToNextPass(intent, { compactPassContext: () => context }).next_pass)
      .toMatchObject({ brush_role: 'fur-form', material_role: 'fur' });
    const implicit = parsePaintingIntent({ ...existingOwnerIntent(), scale: 'small' });
    const wrongScale = compilePaintingIntentToNextPass(implicit, { compactPassContext: () => context }).next_pass;
    expect(wrongScale.brush_role).toBeUndefined();
    expect(wrongScale.material_role).toBeUndefined();
  });

  it('preserves a novel brush-purpose explanation from PaintingIntent through next_pass', () => {
    const intent = parsePaintingIntent({ ...existingOwnerIntent(),
      preferred_brush_role: 'fur-form', brush_use_reason: 'The installed dry marks can carry the chosen planar form at this size.' });
    const compiled = compilePaintingIntentToNextPass(intent, { compactPassContext: existingOwnerContext });
    expect(compiled.next_pass).toMatchObject({
      brush_role: 'fur-form',
      brush_use_reason: 'The installed dry marks can carry the chosen planar form at this size.',
    });
  });
  it('inherits the bounded correction parent and planned semantics while preserving explicit overrides', () => {
    const context:any=existingOwnerContext();
    Object.assign(context.art_director,{status:'active',review_due:false});
    Object.assign(context.art_director.tasks[0],{allowed_global_changes:['depth-structure','silhouette'],
      construction_plan:{representation_strategy:'Rebuild the chair support'},
      correction_target:{problem_id:'cumulative-trend-primitive-footprint-repeating',region_bounds:{left:0,top:0,right:200,bottom:200}}});
    const intent=parsePaintingIntent({...existingOwnerIntent(),visual_intent:'mass',impact_class:'construct',
      region_bounds:{left:10,top:10,right:180,bottom:180},addresses_primary_mismatch:true});
    const compiled=compilePaintingIntentToNextPass(intent,{compactPassContext:()=>context});
    expect(compiled.next_pass).toMatchObject({problem_id:'coat-material',
      addresses_problem_id:'cumulative-trend-primitive-footprint-repeating',change_domains:['depth-structure','silhouette']});
    expect(compiled.diagnostics.map(d=>d.code)).toContain('intent_bounded_correction_inherited');
    const explicit=parsePaintingIntent({...intent,addresses_problem_id:'different-parent',change_domains:['large-value']});
    expect(compilePaintingIntentToNextPass(explicit,{compactPassContext:()=>context}).next_pass)
      .toMatchObject({addresses_problem_id:'different-parent',change_domains:['large-value']});
    for (const change of [{impact_class:'texture',visual_intent:'texture'},
      {region_bounds:{left:0,top:0,right:300,bottom:300}}, {scale:'small'}]) {
      const rejected=compilePaintingIntentToNextPass(parsePaintingIntent({...intent,...change}),{compactPassContext:()=>context});
      expect(rejected.next_pass.change_domains).toBeUndefined();
      expect(rejected.next_pass.addresses_problem_id).toBe('coat-material');
    }
    context.art_director.review_due=true;
    expect(compilePaintingIntentToNextPass(intent,{compactPassContext:()=>context}).next_pass.change_domains).toBeUndefined();
    expect(parsePaintingIntent({...intent,change_domains:['made-up-domain']}).change_domains)
      .toEqual(['made-up-domain']);
  });
  it('preserves localized artistic commentary independently of the technical goal', () => {
    const intent = parsePaintingIntent({ ...existingOwnerIntent(), artistic_commentary: '  Хочу связать шерсть с объёмом тела направленными мазками.  ' });
    const compiled = compilePaintingIntentToNextPass(intent, { compactPassContext: () => existingOwnerContext() });
    expect(compiled.next_pass.goal).toBe(intent.goal);
    expect(compiled.next_pass.artistic_commentary).toBe('Хочу связать шерсть с объёмом тела направленными мазками.');
  });
  it('retains distinct task identity and multiple explicit defect links through Painter compilation', () => {
    const context: any = existingOwnerContext();
    context.art_director.status = 'active';
    context.art_director.review_due = false;
    Object.assign(context.art_director.tasks[0], { construction_plan: { representation_strategy: 'Rebuild intermediate depth' },
      correction_target: { problem_id: 'global-primitive', region_bounds: { left: 0, top: 0, right: 200, bottom: 200 } },
      allowed_global_changes: ['depth-structure'] });
    const parsed = parsePaintingIntent({ ...existingOwnerIntent(), scale: 'medium', visual_intent: 'mass',
      impact_class: 'construct', region_bounds: { left: 20, top: 20, right: 100, bottom: 100 },
      addresses_problem_id: 'critic-previous', addresses_problem_ids: ['critic-previous'] });
    expect(parsed.addresses_problem_ids).toEqual(['critic-previous']);
    const compiled = compilePaintingIntentToNextPass(parsed, { compactPassContext: () => context });
    expect(compiled.next_pass).toMatchObject({ problem_id: 'coat-material',
      addresses_problem_id: 'critic-previous',
      addresses_problem_ids: ['critic-previous', 'global-primitive'] });
    expect(compiled.next_pass.addresses_primary_mismatch).toBeUndefined();
    expect(() => parsePaintingIntent({ ...existingOwnerIntent(), addresses_problem_ids: [' ', 4] })).toThrow(/problem_link_invalid|nonempty defect/);
  });
  it('inherits an existing owner, injects its physical layer, preserves planner context, and batches compatible actions', () => {
    const context = existingOwnerContext();
    const compiled = compilePaintingIntentToNextPass(existingOwnerIntent(), {
      compactPassContext: () => context,
    });

    expect(compiled.next_pass).toMatchObject({
      request_key: 'coat-refine-01',
      problem_id: 'coat-material',
      document_id: 42,
      stage: 'FORM',
      scale: 'medium',
      action_class: 'ADD',
      material_role: 'fur',
      brush_role: 'fur-form',
      protected_layer_ids: [9],
      logical_layer: {
        decision: 'continue-logical-layer',
        hypothesis_id: 'coat-owner',
        layer_id: 17,
        layer_name: 'Coat',
        physical_role: 'opaque-mass',
        opacity_role: 'opaque',
        construction_tier: 'primary',
        geometry_binding: context.logical_layer_owners[0].geometry_binding,
        camera_binding: context.logical_layer_owners[0].camera_binding,
        attention_binding: context.logical_layer_owners[0].attention_binding,
      },
    });

    const actions = compiled.next_pass.actions as Array<Record<string, any>>;
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: 'fur-a',
      tool: 'photoshop_paint_strokes',
      method_id: 'installed-brush',
      args: { layer_id: 17, opacity: 70 },
    });
    expect(actions[0].args.strokes).toHaveLength(2);

    expect(resolvePlannerBinding(compiled.context)).toEqual({
      planner_directive_id: 'directive-7',
      planner_task_id: 'task-coat',
      allowed_scales: ['medium', 'small'],
      allowed_global_changes: ['local-tone'],
    });
    expect(compiled.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining([
      'intent_stage_inherited',
      'intent_scale_inherited',
      'intent_owner_layer_injected',
      'intent_material_role_inherited',
      'intent_brush_role_inherited',
    ]));
  });

  it('creates a predeclared owner without forcing a construction role or artistic physical stack', () => {
    const context = {
      painting_profile: 'nontrivial_painting',
      stage: 'SHAPE',
      scale: 'global',
      logical_layer_owners: [],
      scene_ownership_plan: {
        plan_id: 'scene-plan',
        units: [{ semantic_id: 'tower', owner_id: 'tower-owner', role: 'Primary tower mass' }],
      },
    };
    const raw = {
      request_key: 'tower-create',
      problem_id: 'tower-structure',
      document_id: 42,
      goal: 'Create the primary tower mass.',
      target_owner_id: 'tower-owner',
      action: 'add',
      visual_intent: 'mass',
      actions: [
        { id: 'tower-layer', tool: 'photoshop_create_layer', args: { name: 'Tower' } },
        {
          id: 'tower-region',
          tool: 'photoshop_paint_regions',
          method_id: 'region-block-in',
          args: { regions: [{ contours: [{ points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 40, y: 60 }] }] }] },
        },
      ],
    };

    const withoutRole = compilePaintingIntentToNextPass(parsePaintingIntent(raw), { compactPassContext: () => context });
    expect(withoutRole.next_pass.construction_role).toBeUndefined();
    expect(withoutRole.next_pass.logical_layer).toMatchObject({
      decision: 'create-new', hypothesis_id: 'tower-owner', layer_name: 'Tower',
    });
    expect((withoutRole.next_pass.logical_layer as any).physical_role).toBeUndefined();
    expect((withoutRole.next_pass.actions as any[])[1].args.regions[0].layer_id)
      .toBe('$steps.tower-layer.details.layerId');

    const accepted = compilePaintingIntentToNextPass(
      parsePaintingIntent({ ...raw, construction_role: 'structured-mass' }),
      { compactPassContext: () => context }
    );
    expect(accepted.next_pass).toMatchObject({
      construction_role: 'structured-mass',
      layer_separation_check: {
        change_kind: 'new-object',
        substantial: true,
        rollback_value: 'moderate',
        independent_adjustment_expected: true,
      },
      logical_layer: {
        decision: 'create-new',
        hypothesis_id: 'tower-owner',
        hypothesis: 'Primary tower mass',
        layer_name: 'Tower',
      },
    });
    expect((accepted.next_pass.logical_layer as any).physical_role).toBeUndefined();
    const foreign = parsePaintingIntent({ ...raw, actions: [
      raw.actions[0],
      { ...raw.actions[1], args: { regions: [{
        layer_id: 999,
        contours: [{ points: [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 40, y: 60 }] }],
      }] } },
    ] });
    expect(() => compilePaintingIntentToNextPass(foreign, { compactPassContext: () => context }))
      .toThrow(/created physical layer/);
    const selected = compilePaintingIntentToNextPass(parsePaintingIntent({ ...raw,
      preferred_method_id: 'my-own-brush-method',
      actions: [raw.actions[0], { ...raw.actions[1], method_id: 'my-own-brush-method' }],
    }), { compactPassContext: () => context }).next_pass;
    expect(selected.preferred_method_id).toBe('my-own-brush-method');
    expect((selected.actions as any[])[1].method_id).toBe('my-own-brush-method');
    expect((accepted.next_pass.actions as any[])[1].args.regions[0].layer_id)
      .toBe('$steps.tower-layer.details.layerId');
    const implicit = compilePaintingIntentToNextPass(
      parsePaintingIntent({ ...raw, construction_role: 'structured-mass',
        actions: raw.actions.map(({ id, ...action }) => action) }),
      { compactPassContext: () => context }
    );
    const steps = implicit.next_pass.actions as any[];
    expect(steps[0].id).toBe('guard_action_1');
    const collision = [{ tool: 'paint', args: { layer_id: '$steps.guard_action_1.details.layerId' } },
      { id: 'guard_action_1', tool: 'create' }];
    expect(normalizeGuardActionIds(collision)).toEqual([
      { ...collision[0], id: 'guard_action_1_' }, collision[1],
    ]);
    expect(collision[0]).not.toHaveProperty('id');
    expect(steps[1].args.regions[0].layer_id).toBe('$steps.guard_action_1.details.layerId');
  });

  it('is deterministic for identical PaintingIntent and durable context', () => {
    const context = existingOwnerContext();
    const intent = existingOwnerIntent();
    const store = { compactPassContext: () => structuredClone(context) };

    const first = compilePaintingIntentToNextPass(intent, store);
    const second = compilePaintingIntentToNextPass(intent, store);

    expect(second.next_pass).toEqual(first.next_pass);
    expect(second.diagnostics).toEqual(first.diagnostics);
    expect(second.context).toEqual(first.context);
  });
});

it('replays the rejected tiger declaration through compact input without losing ownership or artist choices', () => {
  const saved=JSON.parse(readFileSync(new URL('./fixtures/tiger-initial-contract-20261011.json',import.meta.url),'utf8'));
  const plan=structuredClone(saved.scene_ownership_plan);
  for(const unit of plan.units)unit.edit_axes=['visibility','color','position','rollback'];
  const raw={request_key:saved.request_key,problem_id:saved.problem_id,document_id:saved.document_id,
    goal:saved.goal,target_owner_id:'tiger-core',action:'add',visual_intent:saved.visual_intent,
    scale:saved.scale,construction_role:saved.construction_role,material_role:'tiger-fur-base',
    actions:saved.actions,logical_layer:saved.logical_layer,scene_ownership_plan:plan,
    scene_geometry_model:{model_id:'artist-scene',revision:1}};
  const state={painting_profile:'nontrivial_painting',logical_layer_owners:[]};
  const parsed=parsePaintingIntent(raw),compiled=compilePaintingIntentToNextPass(parsed,{compactPassContext:()=>state});
  expect(compiled.next_pass.scene_ownership_plan).toEqual(plan);
  expect(compiled.next_pass.logical_layer).toEqual(saved.logical_layer);
  expect(compiled.next_pass.scene_geometry_model).toEqual(raw.scene_geometry_model);
  expect(compiled.next_pass.material_role).toBe('tiger-fur-base');
  expect(sceneComponentScopeIssue(normalizeSceneOwnershipPlan(compiled.next_pass.scene_ownership_plan),'tiger-core')).toBeUndefined();
  expect(state).not.toHaveProperty('scene_ownership_plan'); // compilation is not persistence
  plan.units[0].owner_id='mutated-after-parse';
  expect((compiled.next_pass.scene_ownership_plan as any).units[0].owner_id).not.toBe('mutated-after-parse');
});

it('compiles generic first construction through the real cycle with no dummy actions or dispatch', async () => {
  const model=JSON.parse(readFileSync(new URL('../examples/object-construction/crane.json',import.meta.url),'utf8'));
  const plan:any=constructionOwnershipPlan(normalizeConstructionModel(model));
  for(const unit of plan.units)unit.edit_axes=['visibility','position','rollback'];
  const owner=model.parts[0].id,raw:any={request_key:'generic-first-part',problem_id:'generic-structure',document_id:42,
    goal:'Build the first independently editable part from chosen proportions.',action:'add',visual_intent:'mass',
    target_owner_id:owner,construction_role:'structured-mass',material_role:'metal',scale:'medium',
    scene_ownership_plan:plan,construction:{model,part_id:owner,color:{red:70,green:90,blue:60}}};
  const state:any={painting_profile:'simple_graphic',logical_layer_owners:[]};
  const store:any={compactPassContext:()=>state,collectClosePreviousErrors:()=>[],collectPreflightErrors:()=>[]};
  const compiled=compilePaintingIntentToNextPass(parsePaintingIntent(raw),store);
  expect(compiled.next_pass).not.toHaveProperty('actions');
  const expanded=expandConstructionPass(compiled.next_pass,state,()=>null);
  expect(expanded.pass.actions.some((a:any)=>a.tool==='photoshop_paint_regions')).toBe(true);
  const registry=new ToolRegistry();let dispatches=0;
  for(const name of ['photoshop_create_layer','photoshop_paint_regions','photoshop_execute_visual_microplan','photoshop_get_preview'])
    registry.register(name,{tool:{name,inputSchema:{type:'object'}},handler:async()=>{dispatches++;throw new Error('No Photoshop dispatch');}});
  const cycle=await compileGuardCycle({painting_intent:raw},store,registry);
  expect(cycle.violations,JSON.stringify(cycle.violations)).toEqual([]);
  expect(cycle.nextOperation?.construction_provenance).toMatchObject({part_id:owner,pixel_geometry_verified:false});
  const linksInput = { ...raw,
    addresses_problem_id: 'director-global-defect',
    addresses_problem_ids: ['critic-previous-form'] };
  const linkedCycle = await compileGuardCycle({ painting_intent: linksInput }, store, registry);
  expect(linkedCycle.violations, JSON.stringify(linkedCycle.violations)).toEqual([]);
  expect(linkedCycle.nextOperation?.problem_id).toBe('generic-structure');
  expect((linkedCycle.nextOperation?.args as any).addresses_problem_ids)
    .toEqual(['director-global-defect', 'critic-previous-form']);
  expect((linkedCycle.nextOperation?.args as any).addresses_primary_mismatch).toBeUndefined();
  const linkedPass = compilePaintingIntentToNextPass(parsePaintingIntent(linksInput), store).next_pass;
  const passthrough = await compileGuardCycle({ next_pass: linkedPass }, store, registry);
  expect(passthrough.violations, JSON.stringify(passthrough.violations)).toEqual([]);
  const invalidLight = await compileGuardCycle({ next_pass: {
    ...linkedPass, scene_lighting_color_model: { model_id: 'incomplete-model' },
    color_gradient_preflight: { scene_model_id: 'incomplete-model' },
  } }, store, registry);
  expect(invalidLight.violations.map(item => item.code)).toContain('scene_lighting_color_model_invalid');
  expect(invalidLight.violations.map(item => item.code)).not.toContain('color_gradient_preflight_scene_model_missing');
  expect((passthrough.nextOperation?.args as any).addresses_problem_ids)
    .toEqual(['director-global-defect', 'critic-previous-form']);
  const invalid = await compileGuardCycle({ next_pass: {
    ...linkedPass, addresses_problem_ids: ['director-global-defect', ''],
  } }, store, registry);
  expect(invalid.violations.map(item => item.code)).toContain('problem_links_invalid');
  expect(dispatches).toBe(0);
  expect((cycle.nextOperation?.scene_ownership_plan as any).units.every((u:any)=>u.edit_axes?.length)).toBe(true);
  expect(dispatches).toBe(0);
  // Addition is allowed; remapping an established unit is not.
  const durable:any=structuredClone(plan);durable.units.pop();durable.objects[0].component_semantic_ids=durable.units.map((u:any)=>u.semantic_id);
  expect(compilePaintingIntentToNextPass(parsePaintingIntent(raw),{compactPassContext:()=>({...state,scene_ownership_plan:durable})}).next_pass.scene_ownership_plan).toEqual(plan);
  const conflict=structuredClone(raw);conflict.scene_ownership_plan.units[0].owner_id='other-owner';
  expect(()=>compilePaintingIntentToNextPass(parsePaintingIntent(conflict),{compactPassContext:()=>({...state,scene_ownership_plan:plan})})).toThrow('scene_ownership_plan_conflict');
});

it('retains typed methods across input forms and rejects lost fields or mixed ownership before execution', () => {
  const context=existingOwnerContext(),raw:any={...existingOwnerIntent(),actions:undefined,
    painterly:{owner_id:'coat-owner',form_field:{kind:'surface'}},scene_camera_imaging_model:{model_id:'camera'},
    scene_lighting_color_model:{model_id:'light'},imaging_preflight:{region:'coat'},cross_layer_correction:{mode:'correction'}};
  const compiled=compilePaintingIntentToNextPass(parsePaintingIntent(raw),{compactPassContext:()=>context});
  for(const field of ['painterly','scene_camera_imaging_model','scene_lighting_color_model','imaging_preflight','cross_layer_correction'])
    expect(compiled.next_pass[field]).toEqual(raw[field]);
  const schema:any=createGuardTools({} as any).find(t=>t.tool.name==='photoshop_guard_cycle_auto')!.tool.inputSchema;
  expect(schema.properties.painting_intent.properties.scene_ownership_plan.properties.units.items.properties.edit_axes)
    .toEqual(schema.properties.next_pass.properties.scene_ownership_plan.properties.units.items.properties.edit_axes);
  expect(()=>parsePaintingIntent({...raw,future_unpublished_field:{value:true}})).toThrow('was not discarded');
  expect(()=>parsePaintingIntent({...raw,scene_ownership_plan:[]})).toThrow('must be an object');
  expect(()=>parsePaintingIntent({...raw,geometry_preflight:{passed:true}})).toThrow('was not discarded');
  expect(()=>compilePaintingIntentToNextPass(parsePaintingIntent({...raw,actions:existingOwnerIntent().actions}),{compactPassContext:()=>context})).toThrow('exactly one');
  expect(()=>compilePaintingIntentToNextPass(parsePaintingIntent({...raw,logical_layer:{hypothesis_id:'foreign'}}),{compactPassContext:()=>context})).toThrow('must match target_owner_id');
  try{compilePaintingIntentToNextPass(parsePaintingIntent({...existingOwnerIntent(),target_owner_id:'unregistered'}),{compactPassContext:()=>context});throw new Error('Expected owner rejection');}
  catch(error:any){expect(error.message).toContain('A rejected earlier pass did not register its plan');}
});
