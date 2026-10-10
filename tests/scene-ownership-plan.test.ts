import { describe, expect, it } from 'vitest';
import {
  SCENE_SUBJECT_KINDS,
  normalizeSceneOwnershipPlan,
  extendSceneOwnershipPlan,
  promoteTemporarySceneOwnershipUnit,
  sceneOwnershipPlanSchema,
  sceneOwnershipOwnerIds,
  sceneOwnershipUnitsForOwner,
} from '../src/core/scene-ownership-plan.js';
import { collectSchemaErrors } from '../src/core/guard/cycle-compiler.js';
import { createGuardTools } from '../src/tools/guard-tools.js';

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

it('promotes only the exact temporary component during explicit keep without relabeling pixels', () => {
  const before = normalizeSceneOwnershipPlan({
    plan_id: 'provisional', units: [unit('face', 'face-layer', 'temporary'), unit('backdrop')],
    objects: [
      { object_id: 'face', kind: 'single-part', subject_kind: 'single-component', component_semantic_ids: ['face'] },
      { object_id: 'backdrop', kind: 'single-part', subject_kind: 'single-component', component_semantic_ids: ['backdrop'] },
    ],
  });
  const after = normalizeSceneOwnershipPlan({
    ...before, units: before.units.map(row => row.semantic_id === 'face' ? { ...row, editability: 'independent' } : row),
  });
  expect(promoteTemporarySceneOwnershipUnit(before, after, 'face-layer')).toEqual(after);
  expect(() => extendSceneOwnershipPlan(before, after)).toThrow(/conflict/);
  for (const invalid of [
    { ...after, plan_id: 'other' },
    { ...after, units: after.units.map(row => row.semantic_id === 'face' ? { ...row, owner_id: 'other-layer' } : row) },
    { ...after, units: after.units.map(row => row.semantic_id === 'backdrop' ? { ...row, role: 'Reassigned backdrop' } : row) },
    { ...after, objects: after.objects?.filter(row => row.object_id !== 'backdrop') },
  ]) expect(() => promoteTemporarySceneOwnershipUnit(before, invalid as typeof after, 'face-layer')).toThrow(/conflict/);
});

it('publishes one scene ownership schema with required subject_kind across every guard entry point', () => {
  const canonical = sceneOwnershipPlanSchema() as any;
  expect(canonical.properties.objects.items.properties.subject_kind.enum).toEqual([...SCENE_SUBJECT_KINDS]);
  expect(canonical.properties.objects.items.required).toEqual([
    'object_id', 'subject_kind', 'kind', 'component_semantic_ids',
  ]);

  const tools = createGuardTools({} as any);
  const schema = (name: string) => tools.find(definition => definition.tool.name === name)!.tool.inputSchema as any;
  const publishedPlans = [
    schema('photoshop_guard_cycle_auto').properties.next_pass.properties.scene_ownership_plan,
    schema('photoshop_guard_lint_next_pass').properties.next_pass.properties.scene_ownership_plan,
    schema('photoshop_guard_keep_logical_layer').properties.scene_ownership_plan,
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

  for (const published of publishedPlans) {
    expect(published.properties).toEqual(canonical.properties);
    expect(published.required).toEqual(canonical.required);
    expect(published.additionalProperties).toBe(false);
    expect(collectSchemaErrors(personPlan, published, 'scene_ownership_plan')).toEqual([]);
  }
});
