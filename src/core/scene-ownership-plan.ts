export const SCENE_OWNERSHIP_PLAN_PROTOCOL = 'photoshop.guard.scene_ownership_plan.v1' as const;

export const SCENE_OWNERSHIP_EDITABILITY = [
  'independent',
  'shared-owner',
  'continuous-field',
  'temporary',
] as const;

export type SceneOwnershipEditability = (typeof SCENE_OWNERSHIP_EDITABILITY)[number];

export interface SceneOwnershipUnit {
  semantic_id: string;
  owner_id: string;
  role: string;
  editability: SceneOwnershipEditability;
  rationale?: string;
}

export interface SceneOwnershipSharedOwnerJustification {
  owner_id: string;
  semantic_ids: string[];
  rationale?: string;
}

export interface SceneOwnershipPlan {
  protocol: typeof SCENE_OWNERSHIP_PLAN_PROTOCOL;
  plan_id: string;
  units: SceneOwnershipUnit[];
  shared_owner_justifications: SceneOwnershipSharedOwnerJustification[];
}

const STABLE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;

function requiredString(value: unknown, path: string, minLength = 1): string {
  if (typeof value !== 'string' || value.trim().length < minLength) {
    throw new Error(`${path} must be a non-empty string${minLength > 1 ? ` of at least ${minLength} characters` : ''}`);
  }
  return value.trim();
}

function stableId(value: unknown, path: string): string {
  const id = requiredString(value, path);
  if (!STABLE_ID.test(id)) throw new Error(`${path} must be a stable id using letters, numbers, _ or -`);
  return id;
}

function canonicalIds(values: unknown, path: string): string[] {
  if (!Array.isArray(values) || values.length < 2) {
    throw new Error(`${path} must contain at least two semantic ids`);
  }
  const ids = values.map((value, index) => stableId(value, `${path}[${index}]`));
  if (new Set(ids).size !== ids.length) throw new Error(`${path} must not contain duplicate semantic ids`);
  return [...ids].sort();
}

export function normalizeSceneOwnershipPlan(value: unknown): SceneOwnershipPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('scene_ownership_plan must be an object');
  }
  const raw = value as Record<string, unknown>;
  const planId = stableId(raw.plan_id, 'scene_ownership_plan.plan_id');
  if (!Array.isArray(raw.units) || raw.units.length < 1 || raw.units.length > 32) {
    throw new Error('scene_ownership_plan.units must contain 1-32 semantic units');
  }

  const semanticIds = new Set<string>();
  const units: SceneOwnershipUnit[] = raw.units.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`scene_ownership_plan.units[${index}] must be an object`);
    }
    const unit = entry as Record<string, unknown>;
    const semanticId = stableId(unit.semantic_id, `scene_ownership_plan.units[${index}].semantic_id`);
    if (semanticIds.has(semanticId)) {
      throw new Error(`scene_ownership_plan semantic_id values must be unique; duplicate=${semanticId}`);
    }
    semanticIds.add(semanticId);
    const ownerId = stableId(unit.owner_id, `scene_ownership_plan.units[${index}].owner_id`);
    const role = requiredString(unit.role, `scene_ownership_plan.units[${index}].role`, 4);
    const editability = requiredString(unit.editability, `scene_ownership_plan.units[${index}].editability`) as SceneOwnershipEditability;
    if (!SCENE_OWNERSHIP_EDITABILITY.includes(editability)) {
      throw new Error(
        `scene_ownership_plan.units[${index}].editability must be one of ${SCENE_OWNERSHIP_EDITABILITY.join('|')}`
      );
    }
    const rationale = unit.rationale === undefined
      ? undefined
      : requiredString(unit.rationale, `scene_ownership_plan.units[${index}].rationale`);
    return {
      semantic_id: semanticId,
      owner_id: ownerId,
      role,
      editability,
      ...(rationale ? { rationale } : {}),
    };
  });

  const byOwner = new Map<string, SceneOwnershipUnit[]>();
  for (const unit of units) {
    const group = byOwner.get(unit.owner_id) ?? [];
    group.push(unit);
    byOwner.set(unit.owner_id, group);
  }

  const sharedRowsRaw = raw.shared_owner_justifications === undefined
    ? []
    : raw.shared_owner_justifications;
  if (!Array.isArray(sharedRowsRaw) || sharedRowsRaw.length > 16) {
    throw new Error('scene_ownership_plan.shared_owner_justifications must be an array with at most 16 rows');
  }
  const justificationOwners = new Set<string>();
  const sharedOwnerJustifications: SceneOwnershipSharedOwnerJustification[] = sharedRowsRaw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`scene_ownership_plan.shared_owner_justifications[${index}] must be an object`);
    }
    const row = entry as Record<string, unknown>;
    const ownerId = stableId(row.owner_id, `scene_ownership_plan.shared_owner_justifications[${index}].owner_id`);
    if (justificationOwners.has(ownerId)) {
      throw new Error(`scene_ownership_plan contains duplicate shared-owner justification for owner_id=${ownerId}`);
    }
    justificationOwners.add(ownerId);
    const ids = canonicalIds(row.semantic_ids, `scene_ownership_plan.shared_owner_justifications[${index}].semantic_ids`);
    const rationale = row.rationale === undefined
      ? undefined
      : requiredString(row.rationale, `scene_ownership_plan.shared_owner_justifications[${index}].rationale`);
    return { owner_id: ownerId, semantic_ids: ids, ...(rationale ? { rationale } : {}) };
  });

  const justificationByOwner = new Map(sharedOwnerJustifications.map(row => [row.owner_id, row]));
  for (const [ownerId, group] of byOwner.entries()) {
    if (group.length === 1) {
      if (group[0]!.editability === 'shared-owner') {
        throw new Error(`scene_ownership_plan owner_id=${ownerId} is marked shared-owner but has only one semantic unit`);
      }
      if (justificationByOwner.has(ownerId)) {
        throw new Error(`scene_ownership_plan shared-owner justification for owner_id=${ownerId} is unnecessary because the owner is not shared`);
      }
      continue;
    }

    if (group.some(unit => unit.editability !== 'shared-owner')) {
      throw new Error(
        `scene_ownership_plan owner_id=${ownerId} is assigned to multiple semantic units; every shared unit must declare editability=shared-owner`
      );
    }
    const justification = justificationByOwner.get(ownerId);
    if (!justification) {
      throw new Error(
        `scene_ownership_plan owner_id=${ownerId} intentionally represents multiple semantic units and requires shared_owner_justifications`
      );
    }
    const expected = group.map(unit => unit.semantic_id).sort();
    if (JSON.stringify(justification.semantic_ids) !== JSON.stringify(expected)) {
      throw new Error(
        `scene_ownership_plan shared-owner justification for owner_id=${ownerId} must name exactly: ${expected.join(', ')}`
      );
    }
  }

  for (const row of sharedOwnerJustifications) {
    const group = byOwner.get(row.owner_id) ?? [];
    if (group.length < 2) {
      throw new Error(`scene_ownership_plan shared-owner justification references non-shared owner_id=${row.owner_id}`);
    }
    for (const semanticId of row.semantic_ids) {
      if (!semanticIds.has(semanticId)) {
        throw new Error(`scene_ownership_plan shared-owner justification references unknown semantic_id=${semanticId}`);
      }
    }
  }

  return {
    protocol: SCENE_OWNERSHIP_PLAN_PROTOCOL,
    plan_id: planId,
    units: units.sort((a, b) => a.semantic_id.localeCompare(b.semantic_id)),
    shared_owner_justifications: sharedOwnerJustifications.sort((a, b) => a.owner_id.localeCompare(b.owner_id)),
  };
}

export function sceneOwnershipOwnerIds(plan: SceneOwnershipPlan): string[] {
  return [...new Set(plan.units
    .filter(unit => unit.editability !== 'temporary')
    .map(unit => unit.owner_id))].sort();
}

export function sceneOwnershipUnitsForOwner(plan: SceneOwnershipPlan, ownerId: string): SceneOwnershipUnit[] {
  return plan.units.filter(unit => unit.owner_id === ownerId);
}
