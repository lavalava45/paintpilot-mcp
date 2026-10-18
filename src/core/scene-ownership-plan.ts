import { DEPICTION_DETAIL_GUIDANCE, DEPICTION_DETAIL_SCHEMA, normalizeDepictionDetail, wholeObjectDepiction, type DepictionDetail } from './depiction-detail.js';
export const SCENE_OWNERSHIP_PLAN_PROTOCOL = 'photoshop.guard.scene_ownership_plan.v1' as const;

export const SCENE_OWNERSHIP_EDITABILITY = [
  'independent',
  'shared-owner',
  'continuous-field',
  'temporary',
] as const;

export const SCENE_EDIT_AXES = ['visibility', 'color', 'material', 'lighting', 'position', 'mask', 'rollback'] as const;

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
  /** Absent only in retained historical plans/scaffolds. */
  edit_axes?: string[];
}

export interface SceneOwnershipSharedOwnerJustification {
  owner_id: string;
  semantic_ids: string[];
  rationale?: string;
}

export interface SceneOwnershipObject {
  depiction?: DepictionDetail;
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
    if (unit.edit_axes !== undefined && (!Array.isArray(unit.edit_axes) || !unit.edit_axes.length
      || unit.edit_axes.some(axis => !SCENE_EDIT_AXES.includes(axis)) || new Set(unit.edit_axes).size !== unit.edit_axes.length))
      throw new Error(`scene_ownership_plan.units[${index}].edit_axes requires unique visibility|color|material|lighting|position|mask|rollback values`);
    const rationale = unit.rationale === undefined
      ? undefined
      : requiredString(unit.rationale, `scene_ownership_plan.units[${index}].rationale`);
    return {
      semantic_id: semanticId,
      owner_id: ownerId,
      role,
      editability,
      ...(unit.edit_axes !== undefined ? { edit_axes: [...unit.edit_axes].sort() } : {}),
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
        ...(subjectKind ? { subject_kind: subjectKind as SceneSubjectKind } : {}),
        ...(row.depiction === undefined ? {} : { depiction: normalizeDepictionDetail(row.depiction) }), component_semantic_ids: ids };
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

/** Enforce editing scope at creation, continuation and promotion, independent of the rendering profile.
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
    message: `Declare scene_ownership_plan.objects for this owner. ${DEPICTION_DETAIL_GUIDANCE}`,
    details: { path: 'next_pass.scene_ownership_plan.objects', owner_id: ownerId,
      required_fields: ['object_id', 'subject_kind', 'kind', 'component_semantic_ids'],
      allowed_subject_kinds: [...SCENE_SUBJECT_KINDS],
      component_examples: { person: ['body', 'face', 'hair', 'garment'], animal: ['body', 'head', 'ears', 'eyes'],
        furniture: ['frame', 'cover', 'cushions'], window: ['frame', 'glass', 'curtains'] },
      next: DEPICTION_DETAIL_GUIDANCE },
  };
  for (const object of plan.objects.filter(row => row.component_semantic_ids.some(id => units.some(unit => unit.semantic_id === id)))) {
    const index = plan.objects.indexOf(object);
    const details = { path: `next_pass.scene_ownership_plan.objects[${index}]`, object_id: object.object_id,
      owner_id: ownerId, allowed_subject_kinds: [...SCENE_SUBJECT_KINDS],
      required_fields: ['subject_kind', 'kind', 'component_semantic_ids'],
      component_rule: DEPICTION_DETAIL_GUIDANCE };
    if (!object.subject_kind) return {
      code: 'scene_component_scope_required',
      message: `Declare objects[${index}].subject_kind for ${object.object_id}; single-component means one real part (e.g. face or hair), never an entire complex subject. Existing unknown scope may be classified additively without changing owner bindings.`, details,
    };
    const compound = !['single-component', 'continuous-field'].includes(object.subject_kind);
    if (compound && object.kind !== 'compound-object' && !wholeObjectDepiction(object.depiction)) return {
      code: 'scene_component_decomposition_required',
      message: `${object.subject_kind} ${object.object_id} needs compound-object with independently editable parts, or a scale/task-grounded depiction for a tiny contextual whole-object component. Focal subjects and requested part edits still require decomposition.`, details,
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
  const incomplete = units.filter(unit => unit.editability !== 'temporary' && !unit.edit_axes?.length);
  if (incomplete.length) return { code: 'scene_editable_inventory_required',
    message: `Declare edit_axes for ${incomplete.map(unit => unit.semantic_id).join(', ')}: which visibility/color/material/lighting/position/mask/rollback edits must be independent? List every separately editable visible part as its own unit and owner, including arbitrary custom subjects. single-component is a hypothesis checked against pixels, not an exemption. Existing bindings may be enriched, never reassigned.`,
    details: { path: 'scene_ownership_plan.units[].edit_axes', allowed: [...SCENE_EDIT_AXES] } };
  return undefined;
}

/** Add declarations without reassigning, deleting or flattening existing semantic owners. */
export function extendSceneOwnershipPlan(durable: SceneOwnershipPlan, supplied?: SceneOwnershipPlan): SceneOwnershipPlan {
  if (!supplied) return durable;
  const conflict = (field: string, previous: unknown, incoming: unknown): never => {
    throw new Error(`scene_ownership_plan_conflict: ${field}: saved=${JSON.stringify(previous)}, supplied=${JSON.stringify(incoming)}; existing ownership must remain unchanged`);
  };
  if (durable.plan_id !== supplied.plan_id) conflict('plan_id', durable.plan_id, supplied.plan_id);
  for (const unit of durable.units) {
    const next = supplied.units.find(row => row.semantic_id === unit.semantic_id);
    if (!next) conflict(`units[${unit.semantic_id}]`, unit, undefined);
    for (const field of Object.keys(unit) as (keyof SceneOwnershipUnit)[]) {
      if (JSON.stringify(unit[field]) !== JSON.stringify(next![field]))
        conflict(`units[${unit.semantic_id}].${field}`, unit[field], next![field]);
    }
  }
  for (const row of durable.shared_owner_justifications) {
    const next = supplied.shared_owner_justifications.find(item => item.owner_id === row.owner_id);
    if (JSON.stringify(row) !== JSON.stringify(next))
      conflict(`shared_owner_justifications[${row.owner_id}]`, row, next);
  }
  for (const object of durable.objects ?? []) {
    const next = supplied.objects?.find(row => row.object_id === object.object_id);
    if (!next) conflict(`objects[${object.object_id}]`, object, undefined);
    // A first-pass single part may be decomposed into an independently owned
    // compound without moving or relabelling its already committed component.
    const safeDecomposition = object.kind === 'single-part' && next!.kind === 'compound-object'
      && next!.component_semantic_ids.length > object.component_semantic_ids.length
      && object.component_semantic_ids.every(id => next!.component_semantic_ids.includes(id))
      && object.component_semantic_ids.every(id => durable.units.find(unit => unit.semantic_id === id)?.editability === 'independent');
    if (next!.kind !== object.kind && !safeDecomposition)
      conflict(`objects[${object.object_id}].kind`, object.kind, next!.kind);
    if (object.subject_kind && next!.subject_kind !== object.subject_kind
      && !(safeDecomposition && object.subject_kind === 'single-component'))
      conflict(`objects[${object.object_id}].subject_kind`, object.subject_kind, next!.subject_kind);
    for (const id of object.component_semantic_ids)
      if (!next!.component_semantic_ids.includes(id))
        conflict(`objects[${object.object_id}].component_semantic_ids`, object.component_semantic_ids, next!.component_semantic_ids);
  }
  const oldOwners = new Set(durable.units.map(row => row.owner_id));
  const oldIds = new Set(durable.units.map(row => row.semantic_id));
  for (const row of supplied.units)
    if (!oldIds.has(row.semantic_id) && oldOwners.has(row.owner_id))
      conflict(`units[${row.semantic_id}].owner_id`, 'new unique owner', row.owner_id);
  return supplied;
}

/** Complete an abbreviated continuation with durable declarations, but never
 * manufacture a new owner, component, editable axis or object classification.
 * Explicit changes to existing fields remain visible to extendSceneOwnershipPlan,
 * which rejects reassignment and relabelling. */
export function completeSceneOwnershipContinuation(
  durable: SceneOwnershipPlan,
  incoming: unknown,
): SceneOwnershipPlan {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming))
    throw new Error('scene_ownership_plan continuation must be an object');
  const raw = structuredClone(incoming) as Record<string, unknown>;
  const rows = (name: string): Array<Record<string, unknown>> => {
    const value = raw[name];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row)))
      throw new Error(`scene_ownership_plan.${name} must be an array of objects`);
    return value as Array<Record<string, unknown>>;
  };
  const suppliedUnits = rows('units');
  const suppliedObjects = rows('objects');
  const suppliedShared = rows('shared_owner_justifications');
  const complete = <T extends Record<string, unknown>>(saved: T[], submitted: T[], id: string): T[] => [
    ...saved.map(row => {
      const patch = submitted.find(candidate => candidate[id] === row[id]);
      return patch ? { ...structuredClone(row), ...patch } : structuredClone(row);
    }),
    ...submitted.filter(row => !saved.some(previous => previous[id] === row[id])),
  ];
  const objects = complete(
    (durable.objects ?? []) as unknown as Array<Record<string, unknown>>,
    suppliedObjects,
    'object_id',
  );
  for (const saved of durable.objects ?? []) {
    const explicit = suppliedObjects.find(row => row.object_id === saved.object_id);
    if (explicit?.component_semantic_ids !== undefined) {
      const claimed = explicit.component_semantic_ids;
      if (!Array.isArray(claimed)
        || saved.component_semantic_ids.some(id => !claimed.includes(id)))
        throw new Error(`scene_ownership_plan_conflict: objects[${saved.object_id}].component_semantic_ids: existing members must not be removed`);
    }
  }
  return normalizeSceneOwnershipPlan({
    ...raw,
    plan_id: raw.plan_id ?? durable.plan_id,
    units: complete(durable.units as unknown as Array<Record<string, unknown>>, suppliedUnits, 'semantic_id'),
    ...(objects.length ? { objects } : {}),
    shared_owner_justifications: complete(durable.shared_owner_justifications as unknown as Array<Record<string, unknown>>,
      suppliedShared, 'owner_id'),
  });
}

/** Temporary semantic units are composition scaffolds, not editable component authority.
 * A real component hypothesis declares independent editability from its first pass;
 * logical_layer.temporary still records its reversible experimental lifecycle.
 * Never infer scope from object names, mark counts, stage labels or prose.
 */
export function sceneScaffoldScopeIssue(plan: SceneOwnershipPlan, ownerId: string) {
  if (!sceneOwnershipUnitsForOwner(plan, ownerId).some(unit => unit.editability === 'temporary')) return undefined;
  return {
    code: 'scene_scaffold_frozen',
    message: `Temporary composition scaffold ${ownerId} is frozen after its initial pass. Do not continue, adjust or keep it as an editable component. Extend the same ownership plan with independently editable parts on distinct new owners/layers; retain existing scaffold pixels as reference until authorized replacement.`,
    details: { owner_id: ownerId, path: 'next_pass.scene_ownership_plan.units',
      preserved: 'Existing scaffold pixels and bindings; no relabelling, replay or automatic split.',
      next: 'Add independent units and objects for the actual parts; create one component on a new layer. A temporary component experiment uses independent editability plus logical_layer.decision=temporary-hypothesis.' },
  };
}

export const SCENE_OWNERSHIP_OBJECTS_SCHEMA = {
  type: 'array', minItems: 1, maxItems: 64,
  description: DEPICTION_DETAIL_GUIDANCE,
  items: { type: 'object', properties: {
    object_id: { type: 'string' }, kind: { type: 'string', enum: ['single-part', 'compound-object'] },
    subject_kind: { type: 'string', enum: [...SCENE_SUBJECT_KINDS] },
    depiction: DEPICTION_DETAIL_SCHEMA,
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
            editability: { type: 'string', enum: [...SCENE_OWNERSHIP_EDITABILITY], description: 'independent denotes one genuinely editable component, including temporary component experiments. temporary is a composition scaffold: initial pass only, then frozen; no continuation, adjust or keep. Extend the plan with independent component owners instead.' },
            edit_axes: { type: 'array', minItems: 1, maxItems: 7, uniqueItems: true, items: { type: 'string', enum: [...SCENE_EDIT_AXES] }, description: 'Required for editable component creation/continuation. Identify edits that must remain independent. Add a separate unit/owner for each independently hideable/recolorable/movable/material/light/mask/rollback part. Inseparable accents may share their component regardless of mark count. Historical bindings may be enriched without changing ownership.' },
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

/** Public next-pass only: established records may be omitted or represented
 * by their identity. The Guard completes those from durable state, and still
 * requires a complete plan when no durable plan exists. */
export function sceneOwnershipContinuationSchema(description?: string): Record<string, unknown> {
  const schema = structuredClone(sceneOwnershipPlanSchema(description)) as any;
  delete schema.required;
  schema.properties.units.items.required = ['semantic_id'];
  schema.properties.objects.items.required = ['object_id'];
  return schema;
}
