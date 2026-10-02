export const SCENE_GEOMETRY_MODEL_PROTOCOL = 'photoshop.guard.scene_geometry_model.v1' as const;

export const SCENE_GEOMETRY_APPLICABILITY = [
  'coherent_3d', 'orthographic_or_diagrammatic', 'flat_or_collage',
  'intentional_non_euclidean', 'insufficient_evidence',
] as const;
export const SCENE_PROJECTION_KINDS = [
  'one_point', 'two_point', 'three_point', 'weak_perspective', 'orthographic', 'custom',
] as const;

export type SceneGeometryApplicability = (typeof SCENE_GEOMETRY_APPLICABILITY)[number];
export type SceneProjectionKind = (typeof SCENE_PROJECTION_KINDS)[number];
export interface GeometryPoint { x: number; y: number }
export interface SceneVanishingPoint {
  id: string; x: number; y: number; evidence: 'derived' | 'proposed'; derived_from: string[];
}
export interface SceneLineMember { id: string; points: [GeometryPoint, GeometryPoint] }
export interface SceneLineFamily {
  id: string; vanishing_point_id?: string; members: SceneLineMember[];
}
export interface SceneSupportPlane {
  id: string; role: string; vanishing_family_ids: string[]; boundary_relations: string[];
}
export interface SceneScaleAnchor {
  id: string; contact_point: GeometryPoint; visible_extent: number; depth_role: string;
}
export interface SceneGeometryModel {
  protocol: typeof SCENE_GEOMETRY_MODEL_PROTOCOL;
  model_id: string; revision: number; applicability: SceneGeometryApplicability;
  applicability_rationale?: string;
  source_frame: {
    document_id: number; document_incarnation: string; width: number; height: number;
    operation_id?: string; preview_sha256?: string;
  };
  projection: {
    kind: SceneProjectionKind;
    horizon?: { line: [GeometryPoint, GeometryPoint] };
    vanishing_points: SceneVanishingPoint[];
  };
  line_families: SceneLineFamily[];
  support_planes: SceneSupportPlane[];
  scale_anchors: SceneScaleAnchor[];
}

const STABLE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const SHA256 = /^[a-fA-F0-9]{64}$/;
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

export function normalizeSceneGeometryModel(value: unknown): SceneGeometryModel {
  const raw = asRecord(value, 'scene_geometry_model');
  const modelId = asId(raw.model_id, 'scene_geometry_model.model_id');
  const revision = asPositiveInteger(raw.revision, 'scene_geometry_model.revision');
  const applicability = asString(raw.applicability, 'scene_geometry_model.applicability') as SceneGeometryApplicability;
  if (!SCENE_GEOMETRY_APPLICABILITY.includes(applicability)) {
    throw new Error(`scene_geometry_model.applicability must be one of ${SCENE_GEOMETRY_APPLICABILITY.join('|')}`);
  }
  const rationale = raw.applicability_rationale === undefined ? undefined
    : asString(raw.applicability_rationale, 'scene_geometry_model.applicability_rationale');
  const source = asRecord(raw.source_frame, 'scene_geometry_model.source_frame');
  const sourceFrame: SceneGeometryModel['source_frame'] = {
    document_id: asPositiveInteger(source.document_id, 'scene_geometry_model.source_frame.document_id'),
    // The host witness token is an opaque exact incarnation token, not a model-owned stable id.
    // Real UXP witnesses may contain separators such as ':'; preserve the token verbatim (trimmed)
    // so compiler/session equality can bind the model to the exact live document incarnation.
    document_incarnation: asString(source.document_incarnation, 'scene_geometry_model.source_frame.document_incarnation'),
    width: asPositiveInteger(source.width, 'scene_geometry_model.source_frame.width'),
    height: asPositiveInteger(source.height, 'scene_geometry_model.source_frame.height'),
  };
  if (source.operation_id !== undefined) sourceFrame.operation_id = asId(source.operation_id, 'scene_geometry_model.source_frame.operation_id');
  if (source.preview_sha256 !== undefined) {
    const sha = asString(source.preview_sha256, 'scene_geometry_model.source_frame.preview_sha256').toLowerCase();
    if (!SHA256.test(sha)) throw new Error('scene_geometry_model.source_frame.preview_sha256 must be a SHA-256 hex digest');
    sourceFrame.preview_sha256 = sha;
  }
  const projectionRaw = asRecord(raw.projection, 'scene_geometry_model.projection');
  const kind = asString(projectionRaw.kind, 'scene_geometry_model.projection.kind') as SceneProjectionKind;
  if (!SCENE_PROJECTION_KINDS.includes(kind)) throw new Error(`scene_geometry_model.projection.kind must be one of ${SCENE_PROJECTION_KINDS.join('|')}`);
  let horizon: { line: [GeometryPoint, GeometryPoint] } | undefined;
  if (projectionRaw.horizon !== undefined) {
    const horizonRaw = asRecord(projectionRaw.horizon, 'scene_geometry_model.projection.horizon');
    if (!Array.isArray(horizonRaw.line) || horizonRaw.line.length !== 2) throw new Error('scene_geometry_model.projection.horizon.line must contain exactly two points');
    horizon = { line: [asPoint(horizonRaw.line[0], 'scene_geometry_model.projection.horizon.line[0]'), asPoint(horizonRaw.line[1], 'scene_geometry_model.projection.horizon.line[1]')] };
  }
  const vpRaw = projectionRaw.vanishing_points ?? [];
  if (!Array.isArray(vpRaw) || vpRaw.length > 8) throw new Error('scene_geometry_model.projection.vanishing_points must be an array with at most 8 entries');
  const seen = new Set<string>();
  const vanishingPoints = vpRaw.map((entry, index): SceneVanishingPoint => {
    const vp = asRecord(entry, `scene_geometry_model.projection.vanishing_points[${index}]`);
    const vpId = asId(vp.id, `scene_geometry_model.projection.vanishing_points[${index}].id`);
    if (seen.has(vpId)) throw new Error(`scene_geometry_model contains duplicate vanishing point id=${vpId}`);
    seen.add(vpId);
    const evidence = asString(vp.evidence, `scene_geometry_model.projection.vanishing_points[${index}].evidence`);
    if (evidence !== 'derived' && evidence !== 'proposed') throw new Error(`scene_geometry_model.projection.vanishing_points[${index}].evidence must be derived|proposed`);
    const sources = vp.derived_from ?? [];
    if (!Array.isArray(sources)) throw new Error(`scene_geometry_model.projection.vanishing_points[${index}].derived_from must be an array`);
    const derivedFrom = [...new Set(sources.map((item, sourceIndex) => asId(item, `scene_geometry_model.projection.vanishing_points[${index}].derived_from[${sourceIndex}]`)))].sort();
    if (evidence === 'derived' && derivedFrom.length < 2) throw new Error(`scene_geometry_model.projection.vanishing_points[${index}] derived evidence requires at least two source line ids`);
    return { id: vpId, x: asFinite(vp.x, `scene_geometry_model.projection.vanishing_points[${index}].x`), y: asFinite(vp.y, `scene_geometry_model.projection.vanishing_points[${index}].y`), evidence, derived_from: derivedFrom };
  });
  const vanishingPointIds = new Set(vanishingPoints.map(point => point.id));
  const familyRaw = raw.line_families ?? [];
  if (!Array.isArray(familyRaw) || familyRaw.length > 16) throw new Error('scene_geometry_model.line_families must be an array with at most 16 entries');
  const familyIds = new Set<string>();
  const structuralIds = new Set<string>();
  const lineFamilies = familyRaw.map((entry, index): SceneLineFamily => {
    const family = asRecord(entry, `scene_geometry_model.line_families[${index}]`);
    const id = asId(family.id, `scene_geometry_model.line_families[${index}].id`);
    if (familyIds.has(id)) throw new Error(`scene_geometry_model contains duplicate line family id=${id}`);
    familyIds.add(id); structuralIds.add(id);
    const vanishingPointId = family.vanishing_point_id === undefined ? undefined
      : asId(family.vanishing_point_id, `scene_geometry_model.line_families[${index}].vanishing_point_id`);
    if (vanishingPointId && !vanishingPointIds.has(vanishingPointId)) {
      throw new Error(`scene_geometry_model.line_families[${index}].vanishing_point_id=${vanishingPointId} is not declared by projection.vanishing_points`);
    }
    const membersRaw = family.members ?? [];
    if (!Array.isArray(membersRaw) || membersRaw.length > 32) throw new Error(`scene_geometry_model.line_families[${index}].members must contain at most 32 entries`);
    const memberIds = new Set<string>();
    const members = membersRaw.map((memberEntry, memberIndex): SceneLineMember => {
      const member = asRecord(memberEntry, `scene_geometry_model.line_families[${index}].members[${memberIndex}]`);
      const memberId = asId(member.id, `scene_geometry_model.line_families[${index}].members[${memberIndex}].id`);
      if (memberIds.has(memberId) || structuralIds.has(memberId)) throw new Error(`scene_geometry_model contains duplicate structural id=${memberId}`);
      memberIds.add(memberId); structuralIds.add(memberId);
      if (!Array.isArray(member.points) || member.points.length !== 2) throw new Error(`scene_geometry_model.line_families[${index}].members[${memberIndex}].points must contain exactly two points`);
      return {
        id: memberId,
        points: [
          asPoint(member.points[0], `scene_geometry_model.line_families[${index}].members[${memberIndex}].points[0]`),
          asPoint(member.points[1], `scene_geometry_model.line_families[${index}].members[${memberIndex}].points[1]`),
        ],
      };
    });
    return { id, ...(vanishingPointId ? { vanishing_point_id: vanishingPointId } : {}), members: members.sort((a, b) => a.id.localeCompare(b.id)) };
  });
  const supportRaw = raw.support_planes ?? [];
  if (!Array.isArray(supportRaw) || supportRaw.length > 16) throw new Error('scene_geometry_model.support_planes must be an array with at most 16 entries');
  const supportIds = new Set<string>();
  const supportPlanes = supportRaw.map((entry, index): SceneSupportPlane => {
    const plane = asRecord(entry, `scene_geometry_model.support_planes[${index}]`);
    const id = asId(plane.id, `scene_geometry_model.support_planes[${index}].id`);
    if (supportIds.has(id) || structuralIds.has(id)) throw new Error(`scene_geometry_model contains duplicate structural id=${id}`);
    supportIds.add(id); structuralIds.add(id);
    const role = asString(plane.role, `scene_geometry_model.support_planes[${index}].role`);
    const familyRefs = plane.vanishing_family_ids ?? [];
    if (!Array.isArray(familyRefs) || familyRefs.length > 8) throw new Error(`scene_geometry_model.support_planes[${index}].vanishing_family_ids must contain at most 8 ids`);
    const vanishingFamilyIds = [...new Set(familyRefs.map((item, familyIndex) => asId(item, `scene_geometry_model.support_planes[${index}].vanishing_family_ids[${familyIndex}]`)))].sort();
    for (const familyId of vanishingFamilyIds) {
      if (!familyIds.has(familyId)) throw new Error(`scene_geometry_model.support_planes[${index}] references unknown vanishing family id=${familyId}`);
    }
    const boundaryRaw = plane.boundary_relations ?? [];
    if (!Array.isArray(boundaryRaw) || boundaryRaw.length > 16) throw new Error(`scene_geometry_model.support_planes[${index}].boundary_relations must contain at most 16 entries`);
    const boundaryRelations = [...new Set(boundaryRaw.map((item, boundaryIndex) => asString(item, `scene_geometry_model.support_planes[${index}].boundary_relations[${boundaryIndex}]`)))].sort();
    return { id, role, vanishing_family_ids: vanishingFamilyIds, boundary_relations: boundaryRelations };
  });
  const scaleRaw = raw.scale_anchors ?? [];
  if (!Array.isArray(scaleRaw) || scaleRaw.length > 24) throw new Error('scene_geometry_model.scale_anchors must be an array with at most 24 entries');
  const scaleIds = new Set<string>();
  const scaleAnchors = scaleRaw.map((entry, index): SceneScaleAnchor => {
    const anchor = asRecord(entry, `scene_geometry_model.scale_anchors[${index}]`);
    const id = asId(anchor.id, `scene_geometry_model.scale_anchors[${index}].id`);
    if (scaleIds.has(id) || structuralIds.has(id)) throw new Error(`scene_geometry_model contains duplicate structural id=${id}`);
    scaleIds.add(id); structuralIds.add(id);
    const visibleExtent = asFinite(anchor.visible_extent, `scene_geometry_model.scale_anchors[${index}].visible_extent`);
    if (visibleExtent <= 0) throw new Error(`scene_geometry_model.scale_anchors[${index}].visible_extent must be > 0`);
    return {
      id,
      contact_point: asPoint(anchor.contact_point, `scene_geometry_model.scale_anchors[${index}].contact_point`),
      visible_extent: visibleExtent,
      depth_role: asString(anchor.depth_role, `scene_geometry_model.scale_anchors[${index}].depth_role`),
    };
  });
  return {
    protocol: SCENE_GEOMETRY_MODEL_PROTOCOL, model_id: modelId, revision, applicability,
    ...(rationale ? { applicability_rationale: rationale } : {}), source_frame: sourceFrame,
    projection: { kind, ...(horizon ? { horizon } : {}), vanishing_points: vanishingPoints.sort((a, b) => a.id.localeCompare(b.id)) },
    line_families: lineFamilies.sort((a, b) => a.id.localeCompare(b.id)),
    support_planes: supportPlanes.sort((a, b) => a.id.localeCompare(b.id)),
    scale_anchors: scaleAnchors.sort((a, b) => a.id.localeCompare(b.id)),
  };
}
