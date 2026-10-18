import { describe, expect, it } from 'vitest';
import { compileMinimalOwnerBootstrap } from '../src/core/guard/ownership-bootstrap-compiler.js';
import { sceneComponentScopeIssue, normalizeSceneOwnershipPlan } from '../src/core/scene-ownership-plan.js';
import { compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';
import { compilePaintingIntentToNextPass } from '../src/core/guard/next-pass-compiler.js';
import { parsePaintingIntent } from '../src/core/guard/painting-intent.js';

const fresh = (withScope = false) => ({
  request_key: 'initial-field', problem_id: 'field', document_id: 42,
  goal: 'Paint one native continuous canvas field',
  action_class: 'ADD', stage: 'GLOBAL_BLOCK_IN', scale: 'global',
  construction_role: 'continuous-field', visual_intent: 'continuous-field',
  ...(withScope ? { component_scope: { subject_kind: 'single-component', role: 'The isolated foreground symbol' } } : {}),
  logical_layer: {
    decision: 'create-new', hypothesis_id: 'field-background',
    hypothesis: 'One flat canvas field', layer_name: 'Field',
    component_space: 'canvas', physical_role: 'atmosphere', opacity_role: 'effect-only',
    rollback_value: 'moderate', expected_independent_rollback: true,
  },
  actions: [
    { id: 'make', tool: 'photoshop_create_layer', args: { name: 'Field' } },
    { id: 'field', tool: 'photoshop_paint_color_gradient', method_id: 'continuous-color-field', args: {
      layer_id: '$steps.make.details.layerId',
      from: { x: 0, y: 0 }, to: { x: 400, y: 300 },
      stops: [{ position: 0, red: 28, green: 49, blue: 56 }, { position: 1, red: 80, green: 89, blue: 98 }],
    } },
  ],
});

describe('one-component semantic owner bootstrap in both profiles', () => {
  it.each(['simple_graphic', 'nontrivial_painting'])(
    'derives only a truthful continuous canvas field and does not mutate authored input in %s',
    painting_profile => {
      const authored = fresh();
      const before = structuredClone(authored);
      const result = compileMinimalOwnerBootstrap(authored, {
        painting_profile, logical_layer_owners: [],
      });
      expect(result.derived).toBe(true);
      expect(result.source).toBe('proven-canvas-continuous-field');
      const plan = normalizeSceneOwnershipPlan(result.pass.scene_ownership_plan);
      expect(plan.objects).toMatchObject([{
        kind: 'single-part', subject_kind: 'continuous-field',
      }]);
      expect(plan.units).toEqual([expect.objectContaining({
        owner_id: 'field-background', editability: 'continuous-field',
        edit_axes: ['color', 'rollback', 'visibility'],
      })]);
      expect(sceneComponentScopeIssue(plan, 'field-background')).toBeUndefined();
      expect(authored).toEqual(before);
      expect(compileMinimalOwnerBootstrap(result.pass).derived).toBe(false);
    },
  );

  it('accepts explicitly authored ONE component, never inferring the number of parts from prose', () => {
    const single = fresh(true);
    single.logical_layer.component_space = 'world';
    const result = compileMinimalOwnerBootstrap(single);
    expect(result.derived).toBe(true);
    expect(normalizeSceneOwnershipPlan(result.pass.scene_ownership_plan).objects?.[0].subject_kind)
      .toBe('single-component');
  });

  it('extends an existing plan without reassigning or renaming historical owners', () => {
    const first = compileMinimalOwnerBootstrap(fresh()).pass.scene_ownership_plan;
    const second = fresh();
    second.request_key = 'other-field';
    second.logical_layer.hypothesis_id = 'next-background';
    const result = compileMinimalOwnerBootstrap(second, { scene_ownership_plan: first,
      logical_layer_owners: [{ hypothesis_id: 'field-background', layer_id: 11 }] });
    expect(result.derived).toBe(true);
    const resultPlan = normalizeSceneOwnershipPlan(result.pass.scene_ownership_plan);
    expect(resultPlan.units.map(unit => unit.owner_id).sort()).toEqual(['next-background', 'field-background'].sort());
    expect(resultPlan.plan_id).toBe(normalizeSceneOwnershipPlan(first).plan_id);
  });

  it('rejects ambiguity, foreign targets and non-creation decisions without invented ownership', () => {
    const counterexamples: Array<{ modify(input: ReturnType<typeof fresh>): void }> = [
      { modify: input => { input.logical_layer.decision = 'continue-logical-layer'; } },
      { modify: input => { input.logical_layer.component_space = 'world'; } },
      { modify: input => { input.construction_role = 'structured-mass'; } },
      { modify: input => { input.actions[1]!.args.layer_id = 99 as never; } },
      { modify: input => { input.actions.push({ id: 'more', tool: 'photoshop_paint_color_gradient',
        method_id: 'continuous-color-field', args: { layer_id: '$steps.make.details.layerId' } }); } },
    ];
    for (const row of counterexamples) {
      const input = fresh();
      row.modify(input);
      expect(compileMinimalOwnerBootstrap(input).derived).toBe(false);
    }
    expect(compileMinimalOwnerBootstrap(fresh(), { logical_layer_owners: [
      { hypothesis_id: 'field-background', layer_id: 7 },
    ] }).derived).toBe(false);
    expect(compileMinimalOwnerBootstrap(fresh(), { document_target: { id: 99 } }).derived).toBe(false);
  });

  it('keeps compound subject classifications out of the one-component compiler', () => {
    const authored = { ...fresh(), component_scope: { subject_kind: 'person',
      role: 'The whole person, face, hair, hands and garments' } };
    expect(compileMinimalOwnerBootstrap(authored).derived).toBe(false);
    expect(compileMinimalOwnerBootstrap({ ...fresh(), scene_ownership_plan: {} }).derived).toBe(false);
  });

  it('threads the derived scene plan into the real Guard compact cycle without any Photoshop call', async () => {
    const registry = new ToolRegistry();
    let commands = 0;
    for (const name of ['photoshop_create_layer', 'photoshop_paint_color_gradient', 'photoshop_get_preview']) {
      registry.register(name, { tool: { name, inputSchema: { type: 'object' } },
        handler: async () => { commands++; throw new Error('Must not execute'); } });
    }
    const store: any = { compactPassContext: () => ({ painting_profile: 'simple_graphic',
      logical_layer_owners: [], has_visual_frame: false }),
      collectClosePreviousErrors: () => [], collectPreflightErrors: () => [],
    };
    const result = await compileGuardCycle({ next_pass: fresh() }, store, registry);
    expect(result.normalizations).toEqual(expect.arrayContaining([expect.objectContaining({
      code: 'scene_single_component_plan_compiled',
    })]));
    expect(result.violations.map(item => item.code)).not.toContain('scene_ownership_plan_required');
    expect(result.violations.map(item => item.code)).not.toContain('scene_component_plan_required');
    expect(commands).toBe(0);
  });

  it('can bootstrap PaintingIntent before its missing-owner check, preserving the derived plan', () => {
    const p = fresh();
    const { action_class: _notAnIntentField, ...intentBase } = p;
    const parsed = parsePaintingIntent({
      ...intentBase, action: 'add', target_owner_id: 'field-background',
      // PaintingIntent intentionally carries only the compact artistic action.
      component_scope: { subject_kind: 'single-component', role: 'One authored continuous decorative part' },
      scene_ownership_plan: undefined,
      visual_intent: 'continuous-field',
      material_role: undefined,
    });
    const result = compilePaintingIntentToNextPass(parsed, {
      compactPassContext: () => ({ painting_profile: 'simple_graphic', logical_layer_owners: [] }),
    } as any);
    expect(result.diagnostics.map(item => item.code)).toContain('intent_single_component_plan_compiled');
    const plan = normalizeSceneOwnershipPlan(result.next_pass.scene_ownership_plan);
    expect(plan.units[0]?.owner_id).toBe('field-background');
  });
});
