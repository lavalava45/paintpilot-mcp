import type { GeometryPoint, SceneGeometryModel } from './scene-geometry-model.js';

export const GEOMETRY_BINDING_PROTOCOL = 'photoshop.guard.geometry_binding.v1' as const;
export const GEOMETRY_CONSTRAINT_TYPES = [
  'supported_by', 'centered_between', 'converges_to', 'parallel_family',
  'contact', 'rests_on', 'bounded_by', 'scales_with_depth',
] as const;

export type GeometryConstraintType = (typeof GEOMETRY_CONSTRAINT_TYPES)[number];
export interface GeometryBounds { left: number; top: number; right: number; bottom: number }
export interface GeometryBinding {
  protocol: typeof GEOMETRY_BINDING_PROTOCOL;
  owner_id: string;
  scene_geometry_model_id: string;
  scene_geometry_revision: number;
  support_plane_id?: string;
  vanishing_family_ids: string[];
  dependencies: string[];
  anchors: {
    near_contact?: GeometryPoint;
    far_extent?: GeometryPoint;
    centerline?: { line: [GeometryPoint, GeometryPoint] };
  };
  control_sections: Array<{ id: string; at: GeometryPoint; expected_bounds?: GeometryBounds }>;
  constraints: Array<{ type: GeometryConstraintType; subject_ref?: string; target_ref?: string; evidence: string[] }>;
  exact_geometry_completion_relevant: boolean;
  exact_evidence: Array<{
    id: string;
    method: 'photoshop_measure_points' | 'photoshop_transform_landmarks' | 'photoshop_compare_landmarks';
    source_frame: {
      document_id: number;
      document_incarnation: string;
      width: number;
      height: number;
      operation_id?: string;
      preview_sha256?: string;
    };
  }>;
  local_exceptions: string[];
}

export interface GeometryBindingIssue { code: string; message: string }
export interface GeometryBindingStaleness {
  stale: boolean;
  reason: 'current' | 'model_identity_changed' | 'source_revision_unavailable' | 'dependency_changed';
  changed_dependency_ids: string[];
}

const STABLE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}
function asId(value: unknown, path: string): string {
  const result = asString(value, path);
  if (!STABLE_ID.test(result)) throw new Error(`${path} must be a stable id using letters, numbers, _ or -`);
  return result;
}
function asFinite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
  return value;
}
function asPositiveInteger(value: unknown, path: string): number {
  const result = asFinite(value, path);
  if (!Number.isInteger(result) || result <= 0) throw new Error(`${path} must be a positive integer`);
  return result;
}
function asPoint(value: unknown, path: string): GeometryPoint {
  const raw = asRecord(value, path);
  return { x: asFinite(raw.x, `${path}.x`), y: asFinite(raw.y, `${path}.y`) };
}
function asBounds(value: unknown, path: string): GeometryBounds {
  const raw = asRecord(value, path);
  const bounds = {
    left: asFinite(raw.left, `${path}.left`), top: asFinite(raw.top, `${path}.top`),
    right: asFinite(raw.right, `${path}.right`), bottom: asFinite(raw.bottom, `${path}.bottom`),
  };
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) throw new Error(`${path} must have positive area`);
  return bounds;
}
function asIdArray(value: unknown, path: string, maxItems: number): string[] {
  const raw = value ?? [];
  if (!Array.isArray(raw) || raw.length > maxItems) throw new Error(`${path} must be an array with at most ${maxItems} ids`);
  return [...new Set(raw.map((item, index) => asId(item, `${path}[${index}]`)))].sort();
}
function asStringArray(value: unknown, path: string, maxItems: number): string[] {
  const raw = value ?? [];
  if (!Array.isArray(raw) || raw.length > maxItems) throw new Error(`${path} must be an array with at most ${maxItems} entries`);
  return [...new Set(raw.map((item, index) => asString(item, `${path}[${index}]`)))].sort();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function structuralEntries(scene: SceneGeometryModel): Map<string, unknown> {
  const entries = new Map<string, unknown>();
  entries.set('__projection__', {
    kind: scene.projection.kind,
    horizon: scene.projection.horizon ?? null,
  });
  for (const point of scene.projection.vanishing_points) entries.set(point.id, point);
  for (const family of scene.line_families) {
    entries.set(family.id, family);
    for (const member of family.members) entries.set(member.id, member);
  }
  for (const plane of scene.support_planes) entries.set(plane.id, plane);
  for (const anchor of scene.scale_anchors) entries.set(anchor.id, anchor);
  return entries;
}

/**
 * Returns structural ids whose geometry changed between two revisions, including
 * transitive containers (member -> family -> support plane). A projection/horizon
 * change is represented by __projection__ and is intentionally global.
 */
export function changedSceneGeometryDependencyIds(
  previous: SceneGeometryModel,
  current: SceneGeometryModel,
): string[] {
  if (previous.model_id !== current.model_id) return ['__projection__'];
  const before = structuralEntries(previous);
  const after = structuralEntries(current);
  const changed = new Set<string>();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (stableJson(before.get(id)) !== stableJson(after.get(id))) changed.add(id);
  }

  // A changed line/VP changes its family even when the family declaration itself is unchanged.
  for (const family of [...previous.line_families, ...current.line_families]) {
    if (family.members.some(member => changed.has(member.id))
        || (family.vanishing_point_id && changed.has(family.vanishing_point_id))) {
      changed.add(family.id);
    }
  }
  // A support plane inherits the geometry of every referenced vanishing family/boundary.
  for (const plane of [...previous.support_planes, ...current.support_planes]) {
    if (plane.vanishing_family_ids.some(id => changed.has(id))
        || plane.boundary_relations.some(id => changed.has(id))) {
      changed.add(plane.id);
    }
  }
  return [...changed].sort();
}

export function geometryBindingDependencyIds(binding: GeometryBinding): string[] {
  const ids = new Set<string>([
    ...binding.vanishing_family_ids,
    ...binding.dependencies,
    ...(binding.support_plane_id ? [binding.support_plane_id] : []),
  ]);
  for (const constraint of binding.constraints) {
    if (constraint.subject_ref && constraint.subject_ref !== binding.owner_id) ids.add(constraint.subject_ref);
    if (constraint.target_ref && constraint.target_ref !== binding.owner_id) ids.add(constraint.target_ref);
  }
  return [...ids].sort();
}

export function geometryBindingStaleness(
  binding: GeometryBinding,
  current: SceneGeometryModel,
  sourceRevision?: SceneGeometryModel | null,
): GeometryBindingStaleness {
  if (binding.scene_geometry_model_id !== current.model_id) {
    return { stale: true, reason: 'model_identity_changed', changed_dependency_ids: ['__projection__'] };
  }
  if (binding.scene_geometry_revision === current.revision) {
    return { stale: false, reason: 'current', changed_dependency_ids: [] };
  }
  if (!sourceRevision
      || sourceRevision.model_id !== binding.scene_geometry_model_id
      || sourceRevision.revision !== binding.scene_geometry_revision) {
    return { stale: true, reason: 'source_revision_unavailable', changed_dependency_ids: [] };
  }
  const changed = changedSceneGeometryDependencyIds(sourceRevision, current);
  const dependencies = new Set(geometryBindingDependencyIds(binding));
  const relevant = changed.filter(id => id === '__projection__' || dependencies.has(id));
  return {
    stale: relevant.length > 0,
    reason: relevant.length ? 'dependency_changed' : 'current',
    changed_dependency_ids: relevant,
  };
}

export function normalizeGeometryBinding(value: unknown): GeometryBinding {
  const raw = asRecord(value, 'geometry_binding');
  const anchorsRaw = raw.anchors === undefined ? {} : asRecord(raw.anchors, 'geometry_binding.anchors');
  let centerline: GeometryBinding['anchors']['centerline'];
  if (anchorsRaw.centerline !== undefined) {
    const centerlineRaw = asRecord(anchorsRaw.centerline, 'geometry_binding.anchors.centerline');
    if (!Array.isArray(centerlineRaw.line) || centerlineRaw.line.length !== 2) {
      throw new Error('geometry_binding.anchors.centerline.line must contain exactly two points');
    }
    centerline = {
      line: [
        asPoint(centerlineRaw.line[0], 'geometry_binding.anchors.centerline.line[0]'),
        asPoint(centerlineRaw.line[1], 'geometry_binding.anchors.centerline.line[1]'),
      ],
    };
  }
  const anchors: GeometryBinding['anchors'] = {
    ...(anchorsRaw.near_contact === undefined ? {} : { near_contact: asPoint(anchorsRaw.near_contact, 'geometry_binding.anchors.near_contact') }),
    ...(anchorsRaw.far_extent === undefined ? {} : { far_extent: asPoint(anchorsRaw.far_extent, 'geometry_binding.anchors.far_extent') }),
    ...(centerline ? { centerline } : {}),
  };
  const sectionsRaw = raw.control_sections ?? [];
  if (!Array.isArray(sectionsRaw) || sectionsRaw.length > 12) throw new Error('geometry_binding.control_sections must contain at most 12 entries');
  const sectionIds = new Set<string>();
  const controlSections = sectionsRaw.map((entry, index) => {
    const section = asRecord(entry, `geometry_binding.control_sections[${index}]`);
    const id = asId(section.id, `geometry_binding.control_sections[${index}].id`);
    if (sectionIds.has(id)) throw new Error(`geometry_binding contains duplicate control section id=${id}`);
    sectionIds.add(id);
    return {
      id,
      at: asPoint(section.at, `geometry_binding.control_sections[${index}].at`),
      ...(section.expected_bounds === undefined ? {} : { expected_bounds: asBounds(section.expected_bounds, `geometry_binding.control_sections[${index}].expected_bounds`) }),
    };
  });
  const constraintsRaw = raw.constraints ?? [];
  if (!Array.isArray(constraintsRaw) || constraintsRaw.length > 24) throw new Error('geometry_binding.constraints must contain at most 24 entries');
  const constraints = constraintsRaw.map((entry, index): GeometryBinding['constraints'][number] => {
    const constraint = asRecord(entry, `geometry_binding.constraints[${index}]`);
    const type = asString(constraint.type, `geometry_binding.constraints[${index}].type`) as GeometryConstraintType;
    if (!GEOMETRY_CONSTRAINT_TYPES.includes(type)) throw new Error(`geometry_binding.constraints[${index}].type must be one of ${GEOMETRY_CONSTRAINT_TYPES.join('|')}`);
    return {
      type,
      ...(constraint.subject_ref === undefined ? {} : { subject_ref: asId(constraint.subject_ref, `geometry_binding.constraints[${index}].subject_ref`) }),
      ...(constraint.target_ref === undefined ? {} : { target_ref: asId(constraint.target_ref, `geometry_binding.constraints[${index}].target_ref`) }),
      evidence: asStringArray(constraint.evidence, `geometry_binding.constraints[${index}].evidence`, 8),
    };
  });
  const exactRelevant = raw.exact_geometry_completion_relevant === true;
  if (raw.exact_geometry_completion_relevant !== undefined && typeof raw.exact_geometry_completion_relevant !== 'boolean') {
    throw new Error('geometry_binding.exact_geometry_completion_relevant must be boolean');
  }
  const exactEvidenceRaw = raw.exact_evidence ?? [];
  if (!Array.isArray(exactEvidenceRaw) || exactEvidenceRaw.length > 16) {
    throw new Error('geometry_binding.exact_evidence must contain at most 16 entries');
  }
  const exactEvidenceIds = new Set<string>();
  const exactEvidence = exactEvidenceRaw.map((entry, index): GeometryBinding['exact_evidence'][number] => {
    const evidence = asRecord(entry, `geometry_binding.exact_evidence[${index}]`);
    const id = asId(evidence.id, `geometry_binding.exact_evidence[${index}].id`);
    if (exactEvidenceIds.has(id)) throw new Error(`geometry_binding contains duplicate exact evidence id=${id}`);
    exactEvidenceIds.add(id);
    const method = asString(evidence.method, `geometry_binding.exact_evidence[${index}].method`) as GeometryBinding['exact_evidence'][number]['method'];
    if (!['photoshop_measure_points', 'photoshop_transform_landmarks', 'photoshop_compare_landmarks'].includes(method)) {
      throw new Error(`geometry_binding.exact_evidence[${index}].method must be a deterministic measurement/landmark helper`);
    }
    const source = asRecord(evidence.source_frame, `geometry_binding.exact_evidence[${index}].source_frame`);
    return {
      id,
      method,
      source_frame: {
        document_id: asPositiveInteger(source.document_id, `geometry_binding.exact_evidence[${index}].source_frame.document_id`),
        document_incarnation: asString(source.document_incarnation, `geometry_binding.exact_evidence[${index}].source_frame.document_incarnation`),
        width: asFinite(source.width, `geometry_binding.exact_evidence[${index}].source_frame.width`),
        height: asFinite(source.height, `geometry_binding.exact_evidence[${index}].source_frame.height`),
        ...(source.operation_id === undefined ? {} : { operation_id: asString(source.operation_id, `geometry_binding.exact_evidence[${index}].source_frame.operation_id`) }),
        ...(source.preview_sha256 === undefined ? {} : { preview_sha256: asString(source.preview_sha256, `geometry_binding.exact_evidence[${index}].source_frame.preview_sha256`) }),
      },
    };
  });
  const binding: GeometryBinding = {
    protocol: GEOMETRY_BINDING_PROTOCOL,
    owner_id: asId(raw.owner_id, 'geometry_binding.owner_id'),
    scene_geometry_model_id: asId(raw.scene_geometry_model_id, 'geometry_binding.scene_geometry_model_id'),
    scene_geometry_revision: asPositiveInteger(raw.scene_geometry_revision, 'geometry_binding.scene_geometry_revision'),
    ...(raw.support_plane_id === undefined ? {} : { support_plane_id: asId(raw.support_plane_id, 'geometry_binding.support_plane_id') }),
    vanishing_family_ids: asIdArray(raw.vanishing_family_ids, 'geometry_binding.vanishing_family_ids', 8),
    dependencies: asIdArray(raw.dependencies, 'geometry_binding.dependencies', 32),
    anchors,
    control_sections: controlSections.sort((a, b) => a.id.localeCompare(b.id)),
    constraints,
    exact_geometry_completion_relevant: exactRelevant,
    exact_evidence: exactEvidence.sort((a, b) => a.id.localeCompare(b.id)),
    local_exceptions: asStringArray(raw.local_exceptions, 'geometry_binding.local_exceptions', 16),
  };
  if (!binding.support_plane_id
      && !binding.vanishing_family_ids.length
      && !binding.dependencies.length
      && !Object.keys(binding.anchors).length
      && !binding.control_sections.length) {
    throw new Error('geometry_binding must name at least one support/family/dependency/anchor/control-section spatial constraint');
  }
  return binding;
}

export function geometryBindingIssues(
  binding: GeometryBinding,
  scene: SceneGeometryModel,
  expectedOwnerId: string,
  options: { allowOlderUnchangedRevision?: boolean } = {},
): GeometryBindingIssue[] {
  const issues: GeometryBindingIssue[] = [];
  if (binding.owner_id !== expectedOwnerId) {
    issues.push({
      code: 'geometry_binding_owner_mismatch',
      message: `geometry binding owner_id=${binding.owner_id} must match logical owner ${expectedOwnerId}`,
    });
  }
  if (binding.scene_geometry_model_id !== scene.model_id
      || (binding.scene_geometry_revision !== scene.revision && !options.allowOlderUnchangedRevision)) {
    issues.push({
      code: 'geometry_dependency_stale',
      message: `geometry binding depends on ${binding.scene_geometry_model_id}@${binding.scene_geometry_revision}, but current scene geometry is ${scene.model_id}@${scene.revision}`,
    });
  }
  const familyIds = new Set(scene.line_families.map(family => family.id));
  const planeIds = new Set(scene.support_planes.map(plane => plane.id));
  const dependencyIds = new Set<string>([
    ...scene.projection.vanishing_points.map(point => point.id),
    ...scene.line_families.map(family => family.id),
    ...scene.line_families.flatMap(family => family.members.map(member => member.id)),
    ...scene.support_planes.map(plane => plane.id),
    ...scene.scale_anchors.map(anchor => anchor.id),
  ]);
  if (binding.support_plane_id && !planeIds.has(binding.support_plane_id)) {
    issues.push({ code: 'geometry_dependency_missing', message: `geometry binding references unknown support_plane_id=${binding.support_plane_id}` });
  }
  for (const familyId of binding.vanishing_family_ids) {
    if (!familyIds.has(familyId)) issues.push({ code: 'geometry_dependency_missing', message: `geometry binding references unknown vanishing_family_id=${familyId}` });
  }
  for (const dependency of binding.dependencies) {
    if (!dependencyIds.has(dependency)) issues.push({ code: 'geometry_dependency_missing', message: `geometry binding references unknown dependency=${dependency}` });
  }
  const allowedConstraintRefs = new Set([...dependencyIds, binding.owner_id]);
  for (const constraint of binding.constraints) {
    for (const ref of [constraint.subject_ref, constraint.target_ref]) {
      if (ref && !allowedConstraintRefs.has(ref)) {
        issues.push({ code: 'geometry_dependency_missing', message: `geometry binding constraint references unknown structural id=${ref}` });
      }
    }
  }
  return issues;
}
