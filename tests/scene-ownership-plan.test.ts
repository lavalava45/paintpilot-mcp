import { describe, expect, it } from 'vitest';
import {
  SCENE_SUBJECT_KINDS,
  normalizeSceneOwnershipPlan,
  completeSceneOwnershipContinuation,
  extendSceneOwnershipPlan,
  sceneScaffoldScopeIssue,
  sceneOwnershipPlanSchema,
  sceneOwnershipContinuationSchema,
  sceneOwnershipOwnerIds,
  sceneOwnershipUnitsForOwner,
} from '../src/core/scene-ownership-plan.js';
import { collectSchemaErrors, compileGuardCycle } from '../src/core/guard/cycle-compiler.js';
import { createGuardTools } from '../src/tools/guard-tools.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

function unit(
  semanticId: string,
  ownerId = semanticId,
  editability: 'independent' | 'shared-owner' | 'continuous-field' | 'temporary' = 'independent'
) {
  return {
    semantic_id: semanticId,
    owner_id: ownerId,
    role: `Scene role ${semanticId}`,
    editability,
    edit_axes: ['visibility', 'rollback'],
    rationale: 'Preserve future independent correction rights before structural painting begins.',
  };
}

describe('scene ownership plan', () => {
  it('normalizes independent, continuous-field and temporary semantic units without imposing one-object-per-layer', () => {
    const plan = normalizeSceneOwnershipPlan({
      plan_id: 'scene-owners',
      units: [
        unit('hero'),
        unit('field-a', 'continuous-owner', 'continuous-field'),
        unit('provisional-form', 'temporary-owner', 'temporary'),
      ],
    });
    expect(plan.protocol).toBe('photoshop.guard.scene_ownership_plan.v1');
    expect(sceneOwnershipOwnerIds(plan)).toEqual(['continuous-owner', 'hero']);
    expect(sceneOwnershipUnitsForOwner(plan, 'temporary-owner')[0]?.editability).toBe('temporary');
  });

  it('rejects silently sharing one persistent owner across semantic units', () => {
    expect(() => normalizeSceneOwnershipPlan({
      plan_id: 'silent-share',
      units: [unit('unit-left', 'shared-owner'), unit('unit-right', 'shared-owner')],
    })).toThrow(/multiple semantic units/i);
  });

  it('requires an exact explicit justification for an intentional shared owner', () => {
    const raw = {
      plan_id: 'shared-plan',
      units: [
        unit('unit-left', 'shared-owner', 'shared-owner'),
        unit('unit-right', 'shared-owner', 'shared-owner'),
      ],
    };
    expect(() => normalizeSceneOwnershipPlan(raw)).toThrow(/requires shared_owner_justifications/i);
    expect(() => normalizeSceneOwnershipPlan({
      ...raw,
      shared_owner_justifications: [{
        owner_id: 'shared-owner',
        semantic_ids: ['unit-left', 'unrelated'],
        rationale: 'The two semantic units intentionally share correction and rollback as one coupled mass.',
      }],
    })).toThrow(/must name exactly/i);
  });

  it('accepts an intentionally inseparable shared owner with a concrete correction-rights rationale', () => {
    const plan = normalizeSceneOwnershipPlan({
      plan_id: 'shared-plan',
      units: [
        unit('unit-left', 'shared-owner', 'shared-owner'),
        unit('unit-right', 'shared-owner', 'shared-owner'),
      ],
      shared_owner_justifications: [{
        owner_id: 'shared-owner',
        semantic_ids: ['unit-right', 'unit-left'],
        rationale: 'Both semantic units are intentionally corrected and rolled back together as one coupled mass.',
      }],
    });
    expect(sceneOwnershipOwnerIds(plan)).toEqual(['shared-owner']);
    expect(plan.shared_owner_justifications[0]?.semantic_ids).toEqual(['unit-left', 'unit-right']);
  });
});

it('keeps compound parts on distinct owners and rejects flattening even with a sharing justification', () => {
  const raw = { plan_id: 'cabin', units: ['bed-frame', 'blanket', 'pillows'].map(id => unit(id)),
    objects: [{ object_id: 'bed', kind: 'compound-object', component_semantic_ids: ['bed-frame', 'blanket', 'pillows'] }] };
  expect(normalizeSceneOwnershipPlan(raw).objects?.[0].component_semantic_ids).toHaveLength(3);
  const flat = { ...raw, units: raw.units.map(row => ({ ...row, owner_id: 'bed', editability: 'shared-owner' })),
    shared_owner_justifications: [{ owner_id: 'bed', semantic_ids: raw.units.map(row => row.semantic_id) }] };
  expect(() => normalizeSceneOwnershipPlan(flat)).toThrow(/independent unique owner/);
  expect(() => normalizeSceneOwnershipPlan({ ...raw, objects: [{ ...raw.objects[0], component_semantic_ids: ['bed-frame'] }] })).toThrow(/at least two/);
});

it('adds a lamp to the same durable plan but forbids remapping, deletion, owner reuse and compound collapse', () => {
  const before = normalizeSceneOwnershipPlan({ plan_id: 'cabin', units: [unit('bed-frame'), unit('blanket')],
    objects: [{ object_id: 'bed', kind: 'compound-object', component_semantic_ids: ['bed-frame', 'blanket'] }] });
  const after = normalizeSceneOwnershipPlan({ ...before, units: [...before.units, unit('lamp')],
    objects: [...before.objects!, { object_id: 'lamp', kind: 'single-part', component_semantic_ids: ['lamp'] }] });
  expect(extendSceneOwnershipPlan(before, after)).toEqual(after);
  for (const changed of [
    { ...after, plan_id: 'replacement' },
    { ...after, units: after.units.filter(row => row.semantic_id !== 'blanket') },
    { ...after, units: after.units.map(row => row.semantic_id === 'blanket' ? { ...row, owner_id: 'bed-frame' } : row) },
    { ...after, objects: after.objects!.filter(row => row.object_id !== 'bed') },
  ]) expect(() => extendSceneOwnershipPlan(before, changed)).toThrow(/conflict/);
  expect(before.units).toHaveLength(2);
});

it('completes a sparse next-pass ownership extension without rewriting any durable component', () => {
  const before = normalizeSceneOwnershipPlan({ plan_id: 'mykonos',
    units: [unit('left-wall'), unit('right-wall')],
    objects: [{ object_id: 'street-architecture', kind: 'compound-object', subject_kind: 'custom-compound',
      component_semantic_ids: ['left-wall', 'right-wall'] }],
  });
  const delta = { units: [unit('sky', 'sky', 'continuous-field')],
    objects: [{ object_id: 'sky-field', kind: 'single-part', subject_kind: 'continuous-field', component_semantic_ids: ['sky'] }],
  };
  const continued = completeSceneOwnershipContinuation(before, delta);
  expect(continued.units).toHaveLength(3);
  expect(continued.objects).toHaveLength(2);
  expect(continued.units.find(x => x.semantic_id === 'left-wall')).toEqual(before.units.find(x => x.semantic_id === 'left-wall'));
  expect(extendSceneOwnershipPlan(before, continued)).toEqual(continued);
  expect(completeSceneOwnershipContinuation(before, { units: [{ semantic_id: 'left-wall' }] })).toEqual(before);
  for (const changed of [
    { units: [{ semantic_id: 'left-wall', owner_id: 'sky' }] },
    { units: [{ semantic_id: 'left-wall', editability: 'continuous-field' }] },
    { objects: [{ object_id: 'street-architecture', subject_kind: 'single-component' }] },
    { objects: [{ object_id: 'street-architecture', component_semantic_ids: ['left-wall'] }] },
  ]) expect(() => extendSceneOwnershipPlan(before, completeSceneOwnershipContinuation(before, changed))).toThrow();
  expect(() => completeSceneOwnershipContinuation(before, { units: [{ semantic_id: 'new-part' }] }))
    .toThrow(/owner_id/);
  const published: any = createGuardTools({} as any).find(x => x.tool.name === 'photoshop_guard_cycle_auto')!.tool.inputSchema;
  expect(collectSchemaErrors(delta, published.properties.next_pass.properties.scene_ownership_plan)).toEqual([]);
  expect(collectSchemaErrors(delta, sceneOwnershipPlanSchema()).length).toBeGreaterThan(0);
});

it('uses durable ownership completion at the actual Guard next_pass compiler boundary', async () => {
  const durable = normalizeSceneOwnershipPlan({ plan_id: 'mykonos', units: [unit('left-wall')],
    objects: [{ object_id: 'left-building', kind: 'single-part', subject_kind: 'single-component',
      component_semantic_ids: ['left-wall'] }] });
  const registry = new ToolRegistry();
  let dispatched = 0;
  for (const name of ['photoshop_create_layer', 'photoshop_paint_regions',
    'photoshop_get_preview', 'photoshop_execute_visual_microplan']) registry.register(name, {
    tool: { name, inputSchema: { type: 'object' } },
    handler: async () => { dispatched++; throw new Error('offline compiler must not dispatch'); },
  });
  const store: any = {
    compactPassContext: () => ({ painting_profile: 'simple_graphic', scene_ownership_plan: durable,
      logical_layer_owners: [], stage: 'GLOBAL_BLOCK_IN', has_visual_frame: true }),
    collectClosePreviousErrors: () => [], collectPreflightErrors: () => [],
  };
  const cycle = await compileGuardCycle({ next_pass: {
    request_key: 'mykonos-sky', problem_id: 'sky', document_id: 42,
    goal: 'Add a bounded independent sky field', stage: 'GLOBAL_BLOCK_IN', scale: 'global',
    scene_ownership_plan: {
      units: [unit('sky', 'sky', 'continuous-field')],
      objects: [{ object_id: 'sky', kind: 'single-part', subject_kind: 'continuous-field',
        component_semantic_ids: ['sky'] }],
    },
    logical_layer: { decision: 'create-new', hypothesis_id: 'sky', hypothesis: 'Independent sky field',
      rollback_value: 'moderate', expected_independent_rollback: true, layer_name: 'Sky' },
    layer_separation_check: { change_kind: 'new-plane', substantial: true,
      rollback_value: 'moderate', independent_adjustment_expected: true },
    actions: [{ id: 'sky-layer', tool: 'photoshop_create_layer', args: { name: 'Sky' } },
      { id: 'sky-paint', tool: 'photoshop_paint_regions', args: { regions: [{
        id: 'sky-region', layer_id: '$steps.sky-layer.details.layerId',
        color: { red: 10, green: 100, blue: 210 },
        contours: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }] }],
      }] } }],
  } }, store, registry);
  expect(cycle.normalizations.map(n => n.code)).toContain('scene_ownership_continuation_completed');
  expect(cycle.violations.filter(v => v.code.startsWith('scene_ownership'))).toEqual([]);
  expect(cycle.violations, JSON.stringify(cycle.violations)).toEqual([]);
  expect(dispatched).toBe(0);
});

it('refuses relabelling a temporary composition scaffold while preserving independent component experiments', () => {
  const before = normalizeSceneOwnershipPlan({ plan_id: 'provisional',
    units: [unit('study', 'study-layer', 'temporary'), unit('face')],
    objects: ['study', 'face'].map(id => ({ object_id: id, kind: 'single-part', subject_kind: 'single-component', component_semantic_ids: [id] })),
  });
  expect(sceneScaffoldScopeIssue(before, 'study-layer')?.code).toBe('scene_scaffold_frozen');
  expect(sceneScaffoldScopeIssue(before, 'face')).toBeUndefined();
  const relabelled = normalizeSceneOwnershipPlan({ ...before,
    units: before.units.map(row => row.semantic_id === 'study' ? { ...row, editability: 'independent' } : row),
  });
  expect(() => extendSceneOwnershipPlan(before, relabelled)).toThrow(/conflict/);
});

it('publishes one scene ownership schema with required subject_kind across every guard entry point', () => {
  const canonical = sceneOwnershipPlanSchema() as any;
  expect(canonical.properties.objects.items.properties.subject_kind.enum).toEqual([...SCENE_SUBJECT_KINDS]);
  expect(canonical.properties.objects.items.required).toEqual([
    'object_id', 'subject_kind', 'kind', 'component_semantic_ids',
  ]);

  const tools = createGuardTools({} as any);
  const schema = (name: string) => tools.find(definition => definition.tool.name === name)!.tool.inputSchema as any;
  const continuationPlans = [
    schema('photoshop_guard_cycle_auto').properties.next_pass.properties.scene_ownership_plan,
    schema('photoshop_guard_lint_next_pass').properties.next_pass.properties.scene_ownership_plan,
    schema('photoshop_guard_cycle_auto').properties.painting_intent.properties.scene_ownership_plan,
  ];
  const personPlan = normalizeSceneOwnershipPlan({
    plan_id: 'knight-components',
    objects: [{
      object_id: 'knight',
      subject_kind: 'person',
      kind: 'compound-object',
      component_semantic_ids: ['body', 'face', 'hair', 'armor'],
    }],
    units: ['body', 'face', 'hair', 'armor'].map(id => unit(id)),
  });
  expect(personPlan.protocol).toBe('photoshop.guard.scene_ownership_plan.v1');

  for (const published of continuationPlans) {
    const continuation = sceneOwnershipContinuationSchema() as any;
    expect(published.properties).toEqual(continuation.properties);
    expect(published.required).toEqual(continuation.required);
    expect(published.additionalProperties).toBe(false);
    expect(collectSchemaErrors(personPlan, published, 'scene_ownership_plan')).toEqual([]);
  }
  const keepPlan = schema('photoshop_guard_keep_logical_layer').properties.scene_ownership_plan;
  expect(keepPlan.properties).toEqual(canonical.properties);
  expect(keepPlan.required).toEqual(canonical.required);
});
