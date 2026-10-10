export const SCENE_OWNERSHIP_PLAN_PROTOCOL = 'photoshop.guard.scene_ownership_plan.v1' as const;

export const SCENE_OWNERSHIP_EDITABILITY = [
  'independent',
  'shared-owner',
  'continuous-field',
  'temporary',
] as const;

export type SceneOwnershipEditability = (typeof SCENE_OWNERSHIP_EDITABILITY)[number];

export const SCENE_SUBJECT_KINDS = [
  'person', 'animal', 'furniture', 'window', 'plant', 'custom-compound',
  'single-component', 'continuous-field',
] as const;
export type SceneSubjectKind = (typeof SCENE_SUBJECT_KINDS)[number];

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

export interface SceneOwnershipObject {
  object_id: string;
  kind: 'single-part' | 'compound-object';
  /** Optional only for historical plans. New owners must declare their actual scope. */
  subject_kind?: SceneSubjectKind;
  component_semantic_ids: string[];
}

export interface SceneOwnershipPlan {
  protocol: typeof SCENE_OWNERSHIP_PLAN_PROTOCOL;
  plan_id: string;
  units: SceneOwnershipUnit[];
  objects?: SceneOwnershipObject[];
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
  if (!Array.isArray(raw.units) || raw.units.length < 1 || raw.units.length > 128) {
    throw new Error('scene_ownership_plan.units must contain 1-128 semantic units');
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

  let objects: SceneOwnershipObject[] | undefined;
  if (raw.objects !== undefined) {
    if (!Array.isArray(raw.objects) || !raw.objects.length || raw.objects.length > 64) {
      throw new Error('scene_ownership_plan.objects must contain 1-64 objects');
    }
    const objectIds = new Set<string>();
    const assigned = new Set<string>();
    objects = raw.objects.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`objects[${index}] must be an object`);
      const row = entry as Record<string, unknown>;
      const objectId = stableId(row.object_id, `objects[${index}].object_id`);
      if (objectIds.has(objectId)) throw new Error(`duplicate object_id=${objectId}`);
      objectIds.add(objectId);
      const kind = row.kind;
      if (kind !== 'single-part' && kind !== 'compound-object') throw new Error(`objects[${index}].kind must be single-part|compound-object`);
      const subjectKind = row.subject_kind;
      if (subjectKind !== undefined && !SCENE_SUBJECT_KINDS.includes(subjectKind as SceneSubjectKind)) {
        throw new Error(`objects[${index}].subject_kind must be ${SCENE_SUBJECT_KINDS.join('|')}`);
      }
      if (!Array.isArray(row.component_semantic_ids) || row.component_semantic_ids.length < (kind === 'compound-object' ? 2 : 1)
        || (kind === 'single-part' && row.component_semantic_ids.length !== 1)) {
        throw new Error(`object ${objectId}: single-part needs exactly one component; compound-object needs at least two`);
      }
      const ids = row.component_semantic_ids.map((id, i) => stableId(id, `objects[${index}].component_semantic_ids[${i}]`)).sort();
      const owners = new Set<string>();
      for (const id of ids) {
        const unit = units.find(unit => unit.semantic_id === id);
        if (!unit || assigned.has(id)) throw new Error(`component ${id} must reference exactly one declared object and semantic unit`);
        assigned.add(id);
        if (kind === 'compound-object' && (unit.editability !== 'independent' || owners.has(unit.owner_id)
          || byOwner.get(unit.owner_id)?.length !== 1)) {
          throw new Error(`compound object ${objectId}: each component requires an independent unique owner/layer; shared-owner cannot flatten editable parts`);
        }
        owners.add(unit.owner_id);
      }
      return { object_id: objectId, kind: kind as SceneOwnershipObject['kind'],
        ...(subjectKind ? { subject_kind: subjectKind as SceneSubjectKind } : {}), component_semantic_ids: ids };
    }).sort((a, b) => a.object_id.localeCompare(b.object_id));
    if (assigned.size !== units.length) throw new Error('Every semantic unit must be assigned to an object when objects are declared');
  }
  return {
    protocol: SCENE_OWNERSHIP_PLAN_PROTOCOL,
    plan_id: planId,
    ...(objects ? { objects } : {}),
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

/** Enforce editing scope at creation/promotion, independent of the rendering profile.
 * Subject classification is a host artistic declaration, never inferred from prose/IDs.
 * Historical plans remain readable; this function does not reassign their pixels.
 */
export function sceneComponentScopeIssue(plan: SceneOwnershipPlan, ownerId: string): {
  code: string; message: string; details: Record<string, unknown>;
} | undefined {
  const units = sceneOwnershipUnitsForOwner(plan, ownerId);
  if (!units.length) return undefined; // Existing unplanned-owner validation supplies that error.
  if (!plan.objects?.length) return {
    code: 'scene_component_plan_required',
    message: 'Declare scene_ownership_plan.objects for this owner in every rendering profile. A whole person/animal/furniture/window is compound, including initial block-in; name each visible independently editable part and give it its own owner/layer.',
    details: { path: 'next_pass.scene_ownership_plan.objects', owner_id: ownerId,
      required_fields: ['object_id', 'subject_kind', 'kind', 'component_semantic_ids'],
      allowed_subject_kinds: [...SCENE_SUBJECT_KINDS],
      component_examples: { person: ['body', 'face', 'hair', 'garment'], animal: ['body', 'head', 'ears', 'eyes'],
        furniture: ['frame', 'cover', 'cushions'], window: ['frame', 'glass', 'curtains'] },
      next: 'Keep one logical component per pass; create and review it, then paint the next component on a different layer. Small inseparable accents stay with that component. Preserve every existing binding.' },
  };
  for (const object of plan.objects.filter(row => row.component_semantic_ids.some(id => units.some(unit => unit.semantic_id === id)))) {
    const index = plan.objects.indexOf(object);
    const details = { path: `next_pass.scene_ownership_plan.objects[${index}]`, object_id: object.object_id,
      owner_id: ownerId, allowed_subject_kinds: [...SCENE_SUBJECT_KINDS],
      required_fields: ['subject_kind', 'kind', 'component_semantic_ids'],
      component_rule: 'Each visible independently editable part has one semantic unit, one distinct owner and one distinct physical layer; review one component before the next. Initial block-in and simple_graphic do not waive this rule.' };
    if (!object.subject_kind) return {
      code: 'scene_component_scope_required',
      message: `Declare objects[${index}].subject_kind for ${object.object_id}; single-component means one real part (e.g. face or hair), never an entire complex subject. Existing unknown scope may be classified additively without changing owner bindings.`, details,
    };
    const compound = !['single-component', 'continuous-field'].includes(object.subject_kind);
    if (compound && object.kind !== 'compound-object') return {
      code: 'scene_component_decomposition_required',
      message: `${object.subject_kind} ${object.object_id} cannot be single-part: declare compound-object with separately editable visible parts on distinct owners/layers before painting, including the first block-in.`, details,
    };
    if (object.subject_kind === 'single-component' && (object.kind !== 'single-part' || units.length !== 1)) return {
      code: 'scene_component_decomposition_required',
      message: `single-component ${object.object_id} must represent exactly one semantic part on one owner; do not use shared-owner to combine independently editable parts.`, details,
    };
    if (object.subject_kind === 'continuous-field' && (object.kind !== 'single-part'
      || units.some(unit => unit.editability !== 'continuous-field'))) return {
      code: 'scene_component_decomposition_required',
      message: `continuous-field ${object.object_id} requires one continuous-field unit; subject parts cannot be relabelled as a background field.`, details,
    };
  }
  return undefined;
}

/** Add declarations without reassigning, deleting or flattening existing semantic owners. */
export function extendSceneOwnershipPlan(durable: SceneOwnershipPlan, supplied?: SceneOwnershipPlan): SceneOwnershipPlan {
  if (!supplied) return durable;
  const conflict = () => { throw new Error('scene_ownership_plan_conflict: preserve plan_id and every existing unit/object/shared-owner binding; only additive declarations are allowed'); };
  if (durable.plan_id !== supplied.plan_id) conflict();
  for (const unit of durable.units) {
    if (JSON.stringify(unit) !== JSON.stringify(supplied.units.find(row => row.semantic_id === unit.semantic_id))) conflict();
  }
  for (const row of durable.shared_owner_justifications) {
    if (JSON.stringify(row) !== JSON.stringify(supplied.shared_owner_justifications.find(item => item.owner_id === row.owner_id))) conflict();
  }
  for (const object of durable.objects ?? []) {
    const next = supplied.objects?.find(row => row.object_id === object.object_id);
    if (!next || next.kind !== object.kind || (object.subject_kind && next.subject_kind !== object.subject_kind)
      || object.component_semantic_ids.some(id => !next.component_semantic_ids.includes(id))) conflict();
  }
  const oldOwners = new Set(durable.units.map(row => row.owner_id));
  const oldIds = new Set(durable.units.map(row => row.semantic_id));
  if (supplied.units.some(row => !oldIds.has(row.semantic_id) && oldOwners.has(row.owner_id))) conflict();
  return supplied;
}

/** Explicitly promote one temporary component without changing its semantic identity or owner. */
export function promoteTemporarySceneOwnershipUnit(durable: SceneOwnershipPlan, supplied: SceneOwnershipPlan, ownerId: string): SceneOwnershipPlan {
  const conflict = () => { throw new Error('scene_ownership_plan_conflict: temporary keep may only change the exact existing unit to independent'); };
  if (durable.plan_id !== supplied.plan_id || durable.units.length !== supplied.units.length
      || JSON.stringify(durable.objects ?? []) !== JSON.stringify(supplied.objects ?? [])
      || JSON.stringify(durable.shared_owner_justifications) !== JSON.stringify(supplied.shared_owner_justifications)) conflict();
  const candidates = durable.units.filter(unit => unit.owner_id === ownerId && unit.editability === 'temporary');
  if (candidates.length !== 1 || durable.units.some(unit => unit.owner_id === ownerId && unit !== candidates[0])) conflict();
  for (const unit of durable.units) {
    const updated = supplied.units.find(row => row.semantic_id === unit.semantic_id);
    const expected = unit === candidates[0] ? { ...unit, editability: 'independent' } : unit;
    if (JSON.stringify(updated) !== JSON.stringify(expected)) conflict();
  }
  return supplied;
}

export const SCENE_OWNERSHIP_OBJECTS_SCHEMA = {
  type: 'array', minItems: 1, maxItems: 64,
  description: 'Required for semantic layer creation in every rendering profile, including initial block-in. subject_kind person/animal/furniture/window/plant/custom-compound requires compound-object and distinct component owners/layers. Person: body, face, hair, garment where visible; bed: frame/blanket/pillows; window: frame/glass/curtains; animal: body/head/ears/eyes where separately editable. single-component is one real part, never the whole complex subject. continuous-field is one background field. Create/review one component per pass; a virtual object owns no raster. Tiny inseparable accents remain on their component.',
  items: { type: 'object', properties: {
    object_id: { type: 'string' }, kind: { type: 'string', enum: ['single-part', 'compound-object'] },
    subject_kind: { type: 'string', enum: [...SCENE_SUBJECT_KINDS] },
    component_semantic_ids: { type: 'array', minItems: 1, maxItems: 128, uniqueItems: true, items: { type: 'string' } },
  }, required: ['object_id', 'subject_kind', 'kind', 'component_semantic_ids'], additionalProperties: false },
};

export function sceneOwnershipPlanSchema(description?: string): Record<string, unknown> {
  return {
    type: 'object',
    ...(description ? { description } : {}),
    properties: {
      protocol: { type: 'string', enum: [SCENE_OWNERSHIP_PLAN_PROTOCOL] },
      plan_id: { type: 'string' },
      objects: SCENE_OWNERSHIP_OBJECTS_SCHEMA,
      units: {
        type: 'array',
        minItems: 1,
        maxItems: 128,
        items: {
          type: 'object',
          properties: {
            semantic_id: { type: 'string' },
            owner_id: { type: 'string' },
            role: { type: 'string', minLength: 4 },
            editability: { type: 'string', enum: [...SCENE_OWNERSHIP_EDITABILITY] },
            rationale: { type: 'string', description: 'Optional audit/artistic guidance for this semantic ownership assignment.' },
          },
          required: ['semantic_id', 'owner_id', 'role', 'editability'],
          additionalProperties: false,
        },
      },
      shared_owner_justifications: {
        type: 'array',
        maxItems: 16,
        items: {
          type: 'object',
          properties: {
            owner_id: { type: 'string' },
            semantic_ids: { type: 'array', minItems: 2, items: { type: 'string' } },
            rationale: { type: 'string', description: 'Optional audit/artistic guidance for why these semantic ids intentionally share one owner.' },
          },
          required: ['owner_id', 'semantic_ids'],
          additionalProperties: false,
        },
      },
    },
    required: ['plan_id', 'units'],
    additionalProperties: false,
  };
}
