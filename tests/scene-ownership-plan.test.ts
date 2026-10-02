import { describe, expect, it } from 'vitest';
import {
  normalizeSceneOwnershipPlan,
  sceneOwnershipOwnerIds,
  sceneOwnershipUnitsForOwner,
} from '../src/core/scene-ownership-plan.js';

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
        unit('sky', 'sky-field', 'continuous-field'),
        unit('alternate-tree', 'tree-temp', 'temporary'),
      ],
    });
    expect(plan.protocol).toBe('photoshop.guard.scene_ownership_plan.v1');
    expect(sceneOwnershipOwnerIds(plan)).toEqual(['hero', 'sky-field']);
    expect(sceneOwnershipUnitsForOwner(plan, 'tree-temp')[0]?.editability).toBe('temporary');
  });

  it('rejects silently sharing one persistent owner across semantic units', () => {
    expect(() => normalizeSceneOwnershipPlan({
      plan_id: 'silent-share',
      units: [unit('left-house', 'village'), unit('right-house', 'village')],
    })).toThrow(/multiple semantic units/i);
  });

  it('requires an exact explicit justification for an intentional shared owner', () => {
    const raw = {
      plan_id: 'shared-village',
      units: [
        unit('left-house', 'village', 'shared-owner'),
        unit('right-house', 'village', 'shared-owner'),
      ],
    };
    expect(() => normalizeSceneOwnershipPlan(raw)).toThrow(/requires shared_owner_justifications/i);
    expect(() => normalizeSceneOwnershipPlan({
      ...raw,
      shared_owner_justifications: [{
        owner_id: 'village',
        semantic_ids: ['left-house', 'unrelated'],
        rationale: 'The two houses intentionally share correction and rollback as one distant village mass.',
      }],
    })).toThrow(/must name exactly/i);
  });

  it('accepts an intentionally inseparable shared owner with a concrete correction-rights rationale', () => {
    const plan = normalizeSceneOwnershipPlan({
      plan_id: 'shared-village',
      units: [
        unit('left-house', 'village', 'shared-owner'),
        unit('right-house', 'village', 'shared-owner'),
      ],
      shared_owner_justifications: [{
        owner_id: 'village',
        semantic_ids: ['right-house', 'left-house'],
        rationale: 'Both distant houses are intentionally corrected and rolled back together as one low-detail village mass.',
      }],
    });
    expect(sceneOwnershipOwnerIds(plan)).toEqual(['village']);
    expect(plan.shared_owner_justifications[0]?.semantic_ids).toEqual(['left-house', 'right-house']);
  });
});
