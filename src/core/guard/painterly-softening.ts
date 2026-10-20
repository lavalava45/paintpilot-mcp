/** A narrow illustrative effect, not an optical camera/depth-of-field claim. */
export const PAINTERLY_SOFTENING_SCHEMA = {
  type: 'object',
  description: 'Explicit local illustrative Gaussian softness on an existing independently owned transparent optical-effect layer. No camera model is inferred. Smart Object/source, History, owner, before/after and edge review protections remain required. This does not permit structural mass or whole-image defocus.',
  properties: {
    purpose: { type: 'string', enum: ['local-glow'] },
    owner_id: { type: 'string', minLength: 1 },
    revalidate_edges: { type: 'boolean', enum: [true] },
  },
  required: ['purpose', 'owner_id', 'revalidate_edges'],
  additionalProperties: false,
} as const;

export interface PainterlySoftening {
  purpose: 'local-glow';
  owner_id: string;
  revalidate_edges: true;
}

type Owner = Record<string, unknown>;

/** Both compact compilation and the final SessionStore gate use this exact predicate. */
export function validatePainterlySoftening(
  request: unknown,
  tool: unknown,
  layerId: unknown,
  radius: unknown,
  owners: Owner[],
  cameraClaims: { scene_camera_imaging_model?: unknown; imaging_preflight?: unknown },
): { contract?: PainterlySoftening; error?: string } {
  if (request === undefined) return {};
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { error: 'painterly_softening_invalid: an explicit contract object is required' };
  }
  const declared = request as Record<string, unknown>;
  if (Object.keys(declared).some(key => !['purpose', 'owner_id', 'revalidate_edges'].includes(key))
    || declared.purpose !== 'local-glow' || typeof declared.owner_id !== 'string'
    || !declared.owner_id || declared.revalidate_edges !== true) {
    return { error: 'painterly_softening_invalid: purpose=local-glow, exact owner_id and revalidate_edges=true are required' };
  }
  if (tool !== 'photoshop_apply_gaussian_blur') {
    return { error: 'painterly_softening_tool_invalid: only Gaussian blur can serve as a local illustrative glow' };
  }
  if (cameraClaims.scene_camera_imaging_model !== undefined || cameraClaims.imaging_preflight !== undefined) {
    return { error: 'painterly_softening_camera_conflict: do not mix local illustrative glow with camera/depth imaging claims' };
  }
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0.1 || radius > 24) {
    return { error: 'painterly_softening_radius_invalid: use a finite 0.1..24px Gaussian radius' };
  }
  if (!Number.isSafeInteger(layerId) || Number(layerId) <= 0) {
    return { error: 'painterly_softening_owner_invalid: one explicit positive numeric target layer_id is required' };
  }
  const matches = owners.filter(owner => owner.temporary !== true && owner.layer_id === layerId);
  const owner = matches.length === 1 ? matches[0] : undefined;
  if (!owner || owner.hypothesis_id !== declared.owner_id
    || owner.physical_role !== 'optical-effect'
    || !['effect-only', 'transparent-overlay'].includes(String(owner.opacity_role))) {
    return { error: 'painterly_softening_owner_invalid: exact unique durable optical-effect owner with effect-only/transparent-overlay opacity required' };
  }
  if (owner.camera_binding !== undefined && owner.camera_binding !== null) {
    return { error: 'painterly_softening_camera_binding_conflict: camera-bound owners remain subject to camera revision checks' };
  }
  return { contract: { purpose: 'local-glow', owner_id: declared.owner_id, revalidate_edges: true } };
}
