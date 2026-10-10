import type { GeometryBinding, GeometryBounds } from './geometry-binding.js';
import type { GeometryPoint, SceneGeometryModel, SceneLineMember } from './scene-geometry-model.js';
import type { ExecutableGeometryProvenance } from './executable-geometry-validation.js';
import {
  corridorContainsPoint,
  geometryDistance,
  pointInBounds,
  pointToLineDistance,
} from './geometry-math.js';

export const GEOMETRY_PREFLIGHT_PROTOCOL = 'photoshop.guard.geometry_preflight.v1' as const;

export interface GeometryPreflightIssue {
  code: 'geometry_constraint_conflict' | 'projection_family_conflict' | 'support_contact_conflict' | 'geometry_preflight_insufficient'
    | 'geometry_exact_evidence_required' | 'geometry_exact_evidence_source_mismatch';
  message: string;
}

export interface GeometryPreflightCheck {
  id: string;
  kind: string;
  status: 'pass' | 'uncertain';
  detail: string;
  residual_px?: number;
  tolerance_px?: number;
}

export interface GeometryPreflightReport {
  protocol: typeof GEOMETRY_PREFLIGHT_PROTOCOL;
  owner_id: string;
  scene_geometry_model_id: string;
  scene_geometry_revision: number;
  source_frame: {
    document_id: number;
    document_incarnation: string;
    width: number;
    height: number;
  };
  support_plane_id?: string;
  vanishing_family_ids: string[];
  dependency_ids: string[];
  tolerance_px: number;
  control_sections: Array<{
    id: string;
    at: GeometryPoint;
    expected_bounds?: GeometryBounds;
  }>;
  anchors: GeometryBinding['anchors'];
  checks: GeometryPreflightCheck[];
  uncertainty: string[];
  uncertainty_acceptable: boolean;
  executable_geometry?: ExecutableGeometryProvenance;
}

export interface GeometryPreflightResult {
  report: GeometryPreflightReport;
  issues: GeometryPreflightIssue[];
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function pointInFrame(point: GeometryPoint, scene: SceneGeometryModel, tolerance: number): boolean {
  return point.x >= -tolerance
    && point.x <= scene.source_frame.width + tolerance
    && point.y >= -tolerance
    && point.y <= scene.source_frame.height + tolerance;
}

function sectionSize(bounds: GeometryBounds): number {
  return Math.sqrt((bounds.right - bounds.left) * (bounds.bottom - bounds.top));
}

export function runGeometryPreflight(
  binding: GeometryBinding,
  scene: SceneGeometryModel
): GeometryPreflightResult {
  const issues: GeometryPreflightIssue[] = [];
  const checks: GeometryPreflightCheck[] = [];
  const uncertainty: string[] = [];
  const diagonal = Math.hypot(scene.source_frame.width, scene.source_frame.height);
  const tolerance = Math.max(2, diagonal * 0.005);
  const tolerancePx = round(tolerance);
  const familyById = new Map(scene.line_families.map(family => [family.id, family]));
  const vpById = new Map(scene.projection.vanishing_points.map(point => [point.id, point]));
  const memberById = new Map(scene.line_families.flatMap(family => family.members.map(member => [member.id, member] as const)));
  const supportById = new Map(scene.support_planes.map(plane => [plane.id, plane]));
  const scaleById = new Map(scene.scale_anchors.map(anchor => [anchor.id, anchor]));

  const namedPoints: Array<[string, GeometryPoint | undefined]> = [
    ['near_contact', binding.anchors.near_contact],
    ['far_extent', binding.anchors.far_extent],
    ...(binding.anchors.centerline
      ? [
          ['centerline.start', binding.anchors.centerline.line[0]],
          ['centerline.end', binding.anchors.centerline.line[1]],
        ] as Array<[string, GeometryPoint]>
      : []),
    ...binding.control_sections.map(section => [`control_section.${section.id}`, section.at] as [string, GeometryPoint]),
  ];
  for (const [id, point] of namedPoints) {
    if (!point) continue;
    if (!pointInFrame(point, scene, tolerance)) {
      issues.push({
        code: 'geometry_constraint_conflict',
        message: `geometry_constraint_conflict: owner=${binding.owner_id}; ${id} at (${round(point.x)},${round(point.y)}) lies outside source frame ${scene.source_frame.width}x${scene.source_frame.height}`,
      });
    }
  }

  for (const section of binding.control_sections) {
    if (section.expected_bounds && !pointInBounds(section.at, section.expected_bounds, tolerance)) {
      issues.push({
        code: 'geometry_constraint_conflict',
        message: `geometry_constraint_conflict: owner=${binding.owner_id}; control_section=${section.id} center is outside its expected_bounds; correct the section geometry before mutation`,
      });
    }
  }

  const projectedFamilies = binding.vanishing_family_ids
    .map(id => familyById.get(id))
    .filter((family): family is NonNullable<typeof family> => !!family);
  const perspectiveSensitive = projectedFamilies.length > 0;
  const centerline = binding.anchors.centerline?.line
    ?? (binding.anchors.near_contact && binding.anchors.far_extent
      ? [binding.anchors.near_contact, binding.anchors.far_extent] as [GeometryPoint, GeometryPoint]
      : undefined);

  if (perspectiveSensitive) {
    if (!binding.anchors.far_extent) {
      issues.push({
        code: 'geometry_preflight_insufficient',
        message: `geometry_preflight_insufficient: owner=${binding.owner_id}; perspective-sensitive construction requires anchors.far_extent so local correction cannot preserve an unchecked termination`,
      });
    }
    if (!centerline) {
      issues.push({
        code: 'geometry_preflight_insufficient',
        message: `geometry_preflight_insufficient: owner=${binding.owner_id}; perspective-sensitive construction requires a centerline or near_contact+far_extent line before mutation`,
      });
    }
    if (binding.control_sections.length < 2) {
      issues.push({
        code: 'geometry_preflight_insufficient',
        message: `geometry_preflight_insufficient: owner=${binding.owner_id}; perspective-sensitive construction requires at least two depth-separated control_sections plus far_extent`,
      });
    } else {
      const separated = binding.control_sections.some((section, index) =>
        binding.control_sections.slice(index + 1).some(other => geometryDistance(section.at, other.at) > tolerance)
      );
      if (!separated) {
        issues.push({
          code: 'geometry_preflight_insufficient',
          message: `geometry_preflight_insufficient: owner=${binding.owner_id}; control_sections are not depth-separated beyond tolerance=${tolerancePx}px`,
        });
      }
    }
  }

  if (centerline) {
    for (const family of projectedFamilies) {
      if (!family.vanishing_point_id) {
        const note = `family=${family.id} has no finite vanishing point; convergence residual is not numerically testable`;
        uncertainty.push(note);
        checks.push({ id: `family:${family.id}`, kind: 'projection-family', status: 'uncertain', detail: note });
        continue;
      }
      const vp = vpById.get(family.vanishing_point_id);
      if (!vp) continue;
      const residual = pointToLineDistance(vp, centerline);
      if (residual > tolerance) {
        issues.push({
          code: 'projection_family_conflict',
          message: `projection_family_conflict: owner=${binding.owner_id}; centerline misses vanishing family ${family.id}/${vp.id} by ${round(residual)}px (tolerance=${tolerancePx}px); rebuild the structural line against the accepted family`,
        });
      } else {
        checks.push({
          id: `family:${family.id}`,
          kind: 'projection-family',
          status: 'pass',
          detail: `centerline is consistent with vanishing point ${vp.id}`,
          residual_px: round(residual),
          tolerance_px: tolerancePx,
        });
      }
      for (const section of binding.control_sections) {
        const residualToCenter = pointToLineDistance(section.at, centerline);
        if (residualToCenter > tolerance) {
          issues.push({
            code: 'geometry_constraint_conflict',
            message: `geometry_constraint_conflict: owner=${binding.owner_id}; control_section=${section.id} is ${round(residualToCenter)}px from the bound centerline (tolerance=${tolerancePx}px)`,
          });
        }
      }
    }
  }

  if (binding.support_plane_id) {
    const support = supportById.get(binding.support_plane_id);
    if (support && !binding.anchors.near_contact) {
      issues.push({
        code: 'geometry_preflight_insufficient',
        message: `geometry_preflight_insufficient: owner=${binding.owner_id}; support_plane=${support.id} requires anchors.near_contact for deterministic support preflight`,
      });
    } else if (support && binding.anchors.near_contact) {
      const boundaryLines = support.boundary_relations
        .map(id => memberById.get(id))
        .filter((member): member is SceneLineMember => !!member);
      if (boundaryLines.length >= 2) {
        const inside = corridorContainsPoint(
          binding.anchors.near_contact,
          boundaryLines[0].points,
          boundaryLines[1].points,
          tolerance
        );
        if (inside === false) {
          issues.push({
            code: 'support_contact_conflict',
            message: `support_contact_conflict: owner=${binding.owner_id}; near_contact lies outside support corridor ${boundaryLines[0].id}/${boundaryLines[1].id} on plane=${support.id}; move the contact into the accepted corridor`,
          });
        } else if (inside === true) {
          checks.push({
            id: `support:${support.id}`,
            kind: 'support-contact',
            status: 'pass',
            detail: `near_contact lies between support boundaries ${boundaryLines[0].id} and ${boundaryLines[1].id}`,
            tolerance_px: tolerancePx,
          });
        } else {
          const note = `support plane ${support.id} boundaries are numerically degenerate at near_contact`;
          uncertainty.push(note);
          checks.push({ id: `support:${support.id}`, kind: 'support-contact', status: 'uncertain', detail: note });
        }
      } else {
        const note = `support plane ${support.id} does not expose two boundary line ids; contact is provenance-bound but corridor membership is not numerically testable`;
        uncertainty.push(note);
        checks.push({ id: `support:${support.id}`, kind: 'support-contact', status: 'uncertain', detail: note });
      }
    }
  }

  const scaleConstraint = binding.constraints.find(constraint => constraint.type === 'scales_with_depth');
  if (scaleConstraint) {
    const scaleTarget = scaleConstraint.target_ref ? scaleById.get(scaleConstraint.target_ref) : undefined;
    const scaleDependency = binding.dependencies.map(id => scaleById.get(id)).find(Boolean);
    const scaleAnchor = scaleTarget ?? scaleDependency;
    const measurableSections = binding.control_sections.filter(section => !!section.expected_bounds);
    if (!scaleAnchor || measurableSections.length < 2 || !projectedFamilies.some(family => family.vanishing_point_id)) {
      issues.push({
        code: 'geometry_preflight_insufficient',
        message: `geometry_preflight_insufficient: owner=${binding.owner_id}; scales_with_depth requires a referenced scale anchor, a finite vanishing family and at least two control sections with expected_bounds`,
      });
    } else {
      const vp = projectedFamilies
        .map(family => family.vanishing_point_id ? vpById.get(family.vanishing_point_id) : undefined)
        .find(Boolean);
      if (vp) {
        const ordered = measurableSections
          .map(section => ({ section, distance: geometryDistance(section.at, vp), size: sectionSize(section.expected_bounds!) }))
          .sort((a, b) => a.distance - b.distance);
        let scaleProgressionValid = true;
        for (let index = 1; index < ordered.length; index += 1) {
          if (ordered[index].size + tolerance < ordered[index - 1].size) {
            scaleProgressionValid = false;
            issues.push({
              code: 'geometry_constraint_conflict',
              message: `geometry_constraint_conflict: owner=${binding.owner_id}; control-section scale decreases while moving farther from vanishing point ${vp.id}; recompute expected_bounds from the accepted depth relation`,
            });
            break;
          }
        }
        // An issue and a positive check for the same depth-scale claim would
        // produce contradictory durable provenance in the preflight report.
        if (scaleProgressionValid) {
          checks.push({
            id: `scale:${scaleAnchor.id}`,
            kind: 'depth-scale',
            status: 'pass',
            detail: `control-section scale progression was checked against vanishing point ${vp.id} and scale anchor ${scaleAnchor.id}`,
          });
        }
      }
    }
  }

  const declaredExactSupport = binding.constraints.some(constraint =>
    ['supported_by', 'rests_on', 'contact', 'bounded_by'].includes(constraint.type)
  );
  if (declaredExactSupport && binding.support_plane_id && uncertainty.some(item => item.includes(`support plane ${binding.support_plane_id}`))) {
    issues.push({
      code: 'geometry_preflight_insufficient',
      message: `geometry_preflight_insufficient: owner=${binding.owner_id}; declared support/contact constraint requires two numeric support boundary line ids on plane=${binding.support_plane_id}`,
    });
  }

  if (binding.exact_geometry_completion_relevant) {
    if (!binding.exact_evidence.length) {
      issues.push({
        code: 'geometry_exact_evidence_required',
        message: `geometry_exact_evidence_required: owner=${binding.owner_id}; exact geometry is completion-relevant but no deterministic measurement/landmark evidence is bound`,
      });
    }
    for (const evidence of binding.exact_evidence) {
      const source = evidence.source_frame;
      const expected = scene.source_frame;
      const sourceMatches = source.document_id === expected.document_id
        && source.document_incarnation === expected.document_incarnation
        && source.width === expected.width
        && source.height === expected.height
        && (expected.operation_id === undefined || source.operation_id === expected.operation_id)
        && (expected.preview_sha256 === undefined || source.preview_sha256 === expected.preview_sha256);
      if (!sourceMatches) {
        issues.push({
          code: 'geometry_exact_evidence_source_mismatch',
          message: `geometry_exact_evidence_source_mismatch: owner=${binding.owner_id}; evidence=${evidence.id} from ${source.document_id}/${source.document_incarnation} ${source.width}x${source.height} does not match scene source frame`,
        });
      } else {
        checks.push({
          id: `exact-evidence:${evidence.id}`,
          kind: 'exact-evidence',
          status: 'pass',
          detail: `${evidence.method} evidence is bound to the exact Scene Geometry Model source frame`,
        });
      }
    }
  }

  const report: GeometryPreflightReport = {
    protocol: GEOMETRY_PREFLIGHT_PROTOCOL,
    owner_id: binding.owner_id,
    scene_geometry_model_id: scene.model_id,
    scene_geometry_revision: scene.revision,
    source_frame: {
      document_id: scene.source_frame.document_id,
      document_incarnation: scene.source_frame.document_incarnation,
      width: scene.source_frame.width,
      height: scene.source_frame.height,
    },
    ...(binding.support_plane_id ? { support_plane_id: binding.support_plane_id } : {}),
    vanishing_family_ids: [...binding.vanishing_family_ids],
    dependency_ids: [...binding.dependencies],
    tolerance_px: tolerancePx,
    control_sections: structuredClone(binding.control_sections),
    anchors: structuredClone(binding.anchors),
    checks,
    uncertainty,
    uncertainty_acceptable: issues.every(issue => issue.code !== 'geometry_preflight_insufficient'),
  };
  return { report, issues };
}
