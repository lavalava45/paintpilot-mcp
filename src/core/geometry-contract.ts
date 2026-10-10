import type { StructuredRepairOperation } from './guard/preflight-repair.js';

type RecordValue = Record<string, unknown>;
type Schema = {
  type?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema;
  enum?: unknown[]; minimum?: number; exclusiveMinimum?: number; minItems?: number;
  maxItems?: number; pattern?: string; additionalProperties?: boolean; description?: string;
};
const object = (properties: Record<string, Schema>, required: string[] = []): Schema =>
  ({ type: 'object', properties, required, additionalProperties: false });
const text: Schema = { type: 'string', pattern: '\\S' };
const id: Schema = { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$' };
const finite: Schema = { type: 'number' };
const positiveInteger: Schema = { type: 'integer', minimum: 1 };
const point = object({ x: finite, y: finite }, ['x', 'y']);
const list = (items: Schema, maxItems: number, minItems = 0): Schema => ({ type: 'array', items, maxItems, minItems });
const line = object({ line: list(point, 2, 2) }, ['line']);
const sourceFrame = object({
  document_id: positiveInteger, document_incarnation: text, width: positiveInteger, height: positiveInteger,
  operation_id: id, preview_sha256: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
}, ['width', 'height']);

// Omitted technical identity fields are filled only from the pinned pass/context.
// Supplied values remain authoritative input and are checked by the existing normalizers/preflight.
export const SCENE_GEOMETRY_SCHEMA = object({
  protocol: { type: 'string', enum: ['photoshop.guard.scene_geometry_model.v1'] },
  model_id: id, revision: positiveInteger,
  applicability: { type: 'string', enum: ['coherent_3d', 'orthographic_or_diagrammatic', 'flat_or_collage', 'intentional_non_euclidean', 'insufficient_evidence'] },
  applicability_rationale: text,
  applicability_style_contract_basis: object({ field: id, criterion: text }, ['field', 'criterion']),
  source_frame: sourceFrame,
  projection: object({
    kind: { type: 'string', enum: ['one_point', 'two_point', 'three_point', 'weak_perspective', 'orthographic', 'custom'] },
    horizon: line,
    vanishing_points: list(object({ id, x: finite, y: finite,
      evidence: { type: 'string', enum: ['derived', 'proposed'], description: 'Use proposed for a planned construction, derived only with at least two real source line ids in derived_from.' }, derived_from: { type: 'array', items: id },
    }, ['id', 'x', 'y', 'evidence']), 8),
  }, ['kind']),
  line_families: list(object({ id, vanishing_point_id: id,
    members: list(object({ id, points: list(point, 2, 2) }, ['id', 'points']), 32),
  }, ['id']), 16),
  support_planes: list(object({ id, role: text, vanishing_family_ids: list(id, 8), boundary_relations: list(text, 16) }, ['id', 'role']), 16),
  scale_anchors: list(object({ id, contact_point: point, visible_extent: { type: 'number', exclusiveMinimum: 0 }, depth_role: text },
    ['id', 'contact_point', 'visible_extent', 'depth_role']), 24),
}, ['model_id', 'revision', 'applicability', 'source_frame', 'projection']);
SCENE_GEOMETRY_SCHEMA.description = 'Incarnation-bound geometry/projection; updates keep model_id and increase revision. Omitted source document identity inherits the pinned pass/context.';

export const GEOMETRY_BINDING_SCHEMA = object({
  protocol: { type: 'string', enum: ['photoshop.guard.geometry_binding.v1'] },
  owner_id: id, scene_geometry_model_id: id, scene_geometry_revision: positiveInteger,
  support_plane_id: { ...id, description: 'Must name a declared support plane and also supply anchors.near_contact.' },
  vanishing_family_ids: { ...list(id, 8), description: 'Use declared families; provide far_extent, centerline or near_contact+far_extent, and at least two depth-separated control sections.' }, dependencies: list(id, 32),
  anchors: object({ near_contact: point, far_extent: point, centerline: line }),
  control_sections: list(object({ id, at: point, expected_bounds: object({ left: finite, top: finite, right: finite, bottom: finite },
    ['left', 'top', 'right', 'bottom']) }, ['id', 'at']), 12),
  constraints: list(object({
    type: { type: 'string', enum: ['supported_by', 'centered_between', 'converges_to', 'parallel_family', 'contact', 'rests_on', 'bounded_by', 'scales_with_depth'] },
    subject_ref: id, target_ref: id, evidence: list(text, 8),
  }, ['type']), 24),
  exact_geometry_completion_relevant: { type: 'boolean' },
  exact_evidence: list(object({ id,
    method: { type: 'string', enum: ['photoshop_measure_points', 'photoshop_transform_landmarks', 'photoshop_compare_landmarks'] },
    source_frame: object({ ...sourceFrame.properties, width: finite, height: finite, operation_id: text, preview_sha256: text }, ['document_id', 'document_incarnation', 'width', 'height']),
  }, ['id', 'method', 'source_frame']), 16),
  local_exceptions: list(text, 16),
});
GEOMETRY_BINDING_SCHEMA.description = 'Bind to the chosen scene; omitted owner/model/revision inherit uniquely. Supply at least one real support, family, dependency, anchor or control section; these spatial choices are never invented.';

export interface GeometryContractIssue {
  path: string; message: string; expected?: Schema; allowed_ids?: string[]; decision?: boolean; code?: string;
}
function record(value: unknown): RecordValue | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
}
function rows(value: unknown): RecordValue[] {
  return Array.isArray(value) ? value.map(record).filter((v): v is RecordValue => !!v) : [];
}
function collect(value: unknown, schema: Schema, path: string, issues: GeometryContractIssue[]): void {
  const error = (message: string, expected = schema) => issues.push({ path, message: `${path} ${message}`, expected });
  const matches = schema.type === 'object' ? !!record(value)
    : schema.type === 'array' ? Array.isArray(value)
    : schema.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : schema.type === 'integer' ? typeof value === 'number' && Number.isInteger(value)
    : typeof value === schema.type;
  if (!matches) { error(`must be ${schema.type}`); return; }
  if (schema.enum && !schema.enum.includes(value)) error(`must be one of ${schema.enum.join('|')}`);
  if (typeof value === 'string' && schema.pattern && !new RegExp(schema.pattern).test(value)) error('has invalid format');
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) error(`must be >= ${schema.minimum}`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) error(`must be > ${schema.exclusiveMinimum}`);
  }
  const raw = record(value);
  if (raw) {
    for (const key of schema.required ?? []) if (raw[key] === undefined) issues.push({
      path: `${path}.${key}`, message: `${path}.${key} is required`, expected: schema.properties?.[key],
    });
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (raw[key] !== undefined) collect(raw[key], child, `${path}.${key}`, issues);
    if (schema.additionalProperties === false) for (const key of Object.keys(raw)) if (!schema.properties?.[key]) issues.push({
      path: `${path}.${key}`, message: `${path}.${key} is not allowed; fields=${Object.keys(schema.properties ?? {}).join('|')}`,
    });
    if (['left', 'top', 'right', 'bottom'].every(key => typeof raw[key] === 'number' && Number.isFinite(raw[key]))) {
      if (Number(raw.right) <= Number(raw.left) || Number(raw.bottom) <= Number(raw.top)) error('must have positive area');
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) error(`must contain at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) error(`must contain at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => collect(v, schema.items!, `${path}[${i}]`, issues));
  }
}

export function prepareGeometryContract(input: RecordValue, context: RecordValue = {}): {
  pass: RecordValue; repairs: StructuredRepairOperation[]; issues: GeometryContractIssue[];
} {
  const pass = structuredClone(input);
  const repairs: StructuredRepairOperation[] = [];
  const issues: GeometryContractIssue[] = [];
  const supplied = record(pass.scene_geometry_model);
  const scene = supplied ?? record(context.scene_geometry_model);
  const logical = record(pass.logical_layer);
  const binding = record(logical?.geometry_binding);
  function inject(target: RecordValue, key: string, value: unknown, path: string, source: string): void {
    if (target[key] !== undefined || value === undefined || value === null) return;
    target[key] = structuredClone(value);
    repairs.push({ kind: 'inject_from_context', path, source, reason: 'The omitted technical identity is unique in the pinned pass/context.' });
  }
  if (supplied && record(supplied.source_frame)) {
    const source = record(supplied.source_frame)!;
    inject(source, 'document_id', pass.document_id, 'next_pass.scene_geometry_model.source_frame.document_id', 'next_pass.document_id');
    inject(source, 'document_incarnation', context.document_incarnation_id,
      'next_pass.scene_geometry_model.source_frame.document_incarnation', 'compactPassContext.document_incarnation_id');
  }
  if (binding) {
    inject(binding, 'owner_id', logical?.hypothesis_id, 'next_pass.logical_layer.geometry_binding.owner_id', 'next_pass.logical_layer.hypothesis_id');
    inject(binding, 'scene_geometry_model_id', scene?.model_id, 'next_pass.logical_layer.geometry_binding.scene_geometry_model_id', 'selected_scene.model_id');
    inject(binding, 'scene_geometry_revision', scene?.revision, 'next_pass.logical_layer.geometry_binding.scene_geometry_revision', 'selected_scene.revision');
  }
  if (supplied !== undefined) collect(supplied, SCENE_GEOMETRY_SCHEMA, 'next_pass.scene_geometry_model', issues);
  else if (pass.scene_geometry_model !== undefined) collect(pass.scene_geometry_model, SCENE_GEOMETRY_SCHEMA, 'next_pass.scene_geometry_model', issues);
  if (logical?.geometry_binding !== undefined) collect(logical.geometry_binding, GEOMETRY_BINDING_SCHEMA, 'next_pass.logical_layer.geometry_binding', issues);
  if (supplied) {
    const source = record(supplied.source_frame);
    if (source) for (const key of ['document_id', 'document_incarnation']) if (source[key] === undefined) issues.push({
      path: `next_pass.scene_geometry_model.source_frame.${key}`, message: `scene_geometry_model.source_frame.${key} is required; pinned context is unavailable`, expected: sourceFrame.properties?.[key],
    });
  }
  const constructing = context.painting_profile === 'nontrivial_painting'
    && pass.action_class !== 'ROLLBACK' && logical?.decision !== 'temporary-hypothesis'
    && rows(pass.actions).some(v => typeof v.tool === 'string' && /photoshop_(paint_|fill_layer|apply_)/.test(v.tool))
    && (pass.construction_role === 'structured-mass' || logical?.construction_change === true
      || (logical?.decision === 'create-new' && !!logical?.construction_tier));
  if (constructing && scene?.applicability === 'coherent_3d' && logical?.hypothesis_id && logical.geometry_binding === undefined) issues.push({
    path: 'next_pass.logical_layer.geometry_binding', decision: true, code: 'geometry_binding_required',
    message: 'geometry_binding is required for this coherent-3D owner; its technical identity is supplied in the correction template, but choose a real support/family/dependency/anchor/control section',
  });
  // The early format/identity gate must not hide an independent perspective
  // basis defect when a binding is missing. Neither defect can be repaired by
  // inventing spatial choices, and neither may reach Photoshop dispatch.
  if (constructing && scene?.applicability === 'coherent_3d') {
    const projection = record(scene.projection);
    const kind = projection?.kind;
    const required = kind === 'one_point' ? 1 : kind === 'two_point' ? 2 : kind === 'three_point' ? 3 : 0;
    if (required > 0) {
      const points = rows(projection?.vanishing_points);
      const known = new Set(points.map(point => point.id).filter((value): value is string => typeof value === 'string'));
      const covered = new Set(rows(scene.line_families)
        .map(family => family.vanishing_point_id)
        .filter((value): value is string => typeof value === 'string' && known.has(value)));
      if (points.length < required || covered.size < required) issues.push({
        path: 'next_pass.scene_geometry_model.projection', code: 'perspective_basis_required', decision: true,
        message: `perspective_basis_required: projection.kind=${kind} requires ${required} distinct declared vanishing points covered by line families; got vanishing_points=${points.length}, covered_vanishing_points=${covered.size}`,
      });
    }
  }
  if (binding) {
    for (const key of ['owner_id', 'scene_geometry_model_id', 'scene_geometry_revision']) if (binding[key] === undefined) {
      issues.push({ path: `next_pass.logical_layer.geometry_binding.${key}`, message: `geometry_binding.${key} is required; no unique context is available`, expected: GEOMETRY_BINDING_SCHEMA.properties?.[key] });
    }
    const hasSpatial = typeof binding.support_plane_id === 'string'
      || rows(binding.control_sections).length > 0 || Object.keys(record(binding.anchors) ?? {}).length > 0
      || (Array.isArray(binding.dependencies) && binding.dependencies.length > 0)
      || (Array.isArray(binding.vanishing_family_ids) && binding.vanishing_family_ids.length > 0);
    if (!hasSpatial) issues.push({ path: 'next_pass.logical_layer.geometry_binding', decision: true, code: 'geometry_binding_required',
      message: 'geometry_binding must name at least one support/family/dependency/anchor/control-section spatial constraint; choose a real relation, not an arbitrary id',
    });
    const anchors = record(binding.anchors);
    if (typeof binding.support_plane_id === 'string' && rows(scene?.support_planes).some(v => v.id === binding.support_plane_id)
        && anchors?.near_contact === undefined) issues.push({
      path: 'next_pass.logical_layer.geometry_binding.anchors.near_contact', decision: true, code: 'geometry_preflight_insufficient', expected: point,
      message: 'A support-plane binding also requires a real anchors.near_contact point for deterministic support preflight',
    });
    if (Array.isArray(binding.vanishing_family_ids) && binding.vanishing_family_ids.some(v => rows(scene?.line_families).some(f => f.id === v))) {
      if (anchors?.far_extent === undefined) issues.push({ path: 'next_pass.logical_layer.geometry_binding.anchors.far_extent', decision: true, code: 'geometry_preflight_insufficient',
        expected: point, message: 'Perspective-sensitive construction requires a real anchors.far_extent point' });
      if (!anchors?.centerline && !(anchors?.near_contact && anchors?.far_extent)) issues.push({ path: 'next_pass.logical_layer.geometry_binding.anchors', decision: true, code: 'geometry_preflight_insufficient',
        message: 'Perspective-sensitive construction requires centerline.line or near_contact plus far_extent' });
      if (rows(binding.control_sections).length < 2) issues.push({ path: 'next_pass.logical_layer.geometry_binding.control_sections', decision: true, code: 'geometry_preflight_insufficient',
        message: 'Perspective-sensitive construction requires at least two depth-separated control sections', expected: { ...GEOMETRY_BINDING_SCHEMA.properties!.control_sections, minItems: 2 } });
    }
  }
  // These references can be checked independently of malformed coordinates/metadata.
  if (scene) {
    const projection = record(scene.projection);
    const points = rows(projection?.vanishing_points);
    const families = rows(scene.line_families);
    const planes = rows(scene.support_planes);
    const scales = rows(scene.scale_anchors);
    const pointIds = points.map(v => v.id).filter((v): v is string => typeof v === 'string');
    const familyIds = families.map(v => v.id).filter((v): v is string => typeof v === 'string');
    const planeIds = planes.map(v => v.id).filter((v): v is string => typeof v === 'string');
    const allIds = [...pointIds, ...familyIds, ...planeIds,
      ...families.flatMap(v => rows(v.members).map(m => m.id)), ...scales.map(v => v.id)].filter((v): v is string => typeof v === 'string');
    const ref = (value: unknown, ids: string[], path: string) => {
      if (typeof value === 'string' && !ids.includes(value)) issues.push({ path, allowed_ids: ids, code: 'geometry_dependency_missing',
        message: `${path} references unknown id=${value}; available=${ids.join('|') || '(none)'}`, decision: true });
    };
    if (supplied) {
      points.forEach((v, i) => {
        if (v.evidence === 'derived' && (!Array.isArray(v.derived_from) || new Set(v.derived_from).size < 2)) issues.push({
          path: `next_pass.scene_geometry_model.projection.vanishing_points[${i}].derived_from`,
          message: 'derived vanishing-point evidence requires at least two source line ids', expected: list(id, 32, 2),
        });
      });
      families.forEach((v, i) => ref(v.vanishing_point_id, pointIds, `next_pass.scene_geometry_model.line_families[${i}].vanishing_point_id`));
      planes.forEach((v, i) => { if (Array.isArray(v.vanishing_family_ids)) v.vanishing_family_ids.forEach((x, j) =>
        ref(x, familyIds, `next_pass.scene_geometry_model.support_planes[${i}].vanishing_family_ids[${j}]`)); });
    }
    if (binding) {
      ref(binding.support_plane_id, planeIds, 'next_pass.logical_layer.geometry_binding.support_plane_id');
      if (Array.isArray(binding.vanishing_family_ids)) binding.vanishing_family_ids.forEach((x, i) => ref(x, familyIds, `next_pass.logical_layer.geometry_binding.vanishing_family_ids[${i}]`));
      if (Array.isArray(binding.dependencies)) binding.dependencies.forEach((x, i) => ref(x, allIds, `next_pass.logical_layer.geometry_binding.dependencies[${i}]`));
      rows(binding.constraints).forEach((v, i) => {
        for (const key of ['subject_ref', 'target_ref']) ref(v[key], [...allIds, String(binding.owner_id)], `next_pass.logical_layer.geometry_binding.constraints[${i}].${key}`);
      });
    }
  }
  return { pass, repairs, issues };
}

export function geometryContractRecipe(pass: RecordValue, context: RecordValue, violations: Array<{ code: string }>): RecordValue {
  if (!violations.some(v => v.code.startsWith('geometry_') || v.code.startsWith('scene_geometry_'))) return {};
  const prepared = prepareGeometryContract(pass, context);
  const scene = record(prepared.pass.scene_geometry_model) ?? record(context.scene_geometry_model);
  const logical = record(prepared.pass.logical_layer);
  return { geometry_contract: {
    issues: prepared.issues,
    correction_template: { requires_completion: true,
      logical_layer: { geometry_binding: {
        owner_id: logical?.hypothesis_id ?? null, scene_geometry_model_id: scene?.model_id ?? null, scene_geometry_revision: scene?.revision ?? null,
      } },
    },
    spatial_choices: { support_plane_ids: rows(scene?.support_planes).map(v => v.id), vanishing_family_ids: rows(scene?.line_families).map(v => v.id),
      requirements_by_choice: { support_plane_id: 'Also provide anchors.near_contact={x,y}.',
        vanishing_family_ids: 'Also provide anchors.far_extent, centerline.line=[{x,y},{x,y}] or near_contact+far_extent, and at least two control_sections={id,at:{x,y}}.',
        anchors: 'near_contact/far_extent={x,y} or centerline.line=[{x,y},{x,y}]', control_sections: '[{id,at:{x,y},expected_bounds?:{left,top,right,bottom}}]' },
      alternative: 'Provide real anchors or control_sections from the intended construction; do not invent evidence or a support id.' },
  } };
}
