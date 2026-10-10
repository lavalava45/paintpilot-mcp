import type { SceneCameraImagingModel, CameraDepthRole, CameraFocusRole } from './scene-camera-imaging-model.js';

export const IMAGING_PREFLIGHT_PROTOCOL = 'photoshop.guard.imaging_preflight.v1' as const;

export interface ImagingPreflight {
  protocol: typeof IMAGING_PREFLIGHT_PROTOCOL;
  scene_camera_model_id: string;
  scene_camera_revision: number;
  effect_kind: 'depth-of-field' | 'global-softness' | 'motion-blur' | 'camera-post';
  motivation: string;
  scope: 'global' | 'local-exception';
  owner_expectations: Array<{
    owner_id: string;
    depth_role: CameraDepthRole;
    expected_focus_role: CameraFocusRole;
    local_exception?: string;
  }>;
  revalidate_edge_detail: boolean;
  outcome: 'supported' | 'review-required' | 'conflict';
  findings: string[];
}

export const IMAGING_PREFLIGHT_SCHEMA = {
  type: 'object',
  description: 'Required before substantial blur or camera-post treatment; binds the exact active Scene Camera & Imaging Model revision and owner focus/depth expectations.',
  properties: {
    protocol: { type: 'string', enum: [IMAGING_PREFLIGHT_PROTOCOL] },
    scene_camera_model_id: { type: 'string' },
    scene_camera_revision: { type: 'integer', minimum: 1 },
    effect_kind: { type: 'string', enum: ['depth-of-field', 'global-softness', 'motion-blur', 'camera-post'] },
    motivation: { type: 'string', minLength: 1 },
    scope: { type: 'string', enum: ['global', 'local-exception'] },
    owner_expectations: {
      type: 'array', minItems: 1, maxItems: 32,
      items: {
        type: 'object',
        properties: {
          owner_id: { type: 'string', minLength: 1 },
          depth_role: { type: 'string', enum: ['near', 'focal', 'mid', 'far'] },
          expected_focus_role: { type: 'string', enum: ['sharp', 'moderately_soft', 'soft', 'lost'] },
          local_exception: { type: 'string', minLength: 1 },
        },
        required: ['owner_id', 'depth_role', 'expected_focus_role'],
        additionalProperties: false,
      },
    },
    revalidate_edge_detail: { type: 'boolean' },
    outcome: { type: 'string', enum: ['supported', 'review-required', 'conflict'] },
    findings: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'scene_camera_model_id', 'scene_camera_revision', 'effect_kind', 'motivation',
    'scope', 'owner_expectations', 'revalidate_edge_detail',
  ],
  additionalProperties: false,
} as const;

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

export function normalizeImagingPreflight(value: unknown, model: SceneCameraImagingModel): ImagingPreflight {
  const raw = object(value, 'imaging_preflight');
  if (raw.scene_camera_model_id !== model.model_id || raw.scene_camera_revision !== model.revision) {
    throw new Error('imaging_preflight must reference the exact active Scene Camera & Imaging Model revision');
  }
  const effectKind = text(raw.effect_kind, 'imaging_preflight.effect_kind') as ImagingPreflight['effect_kind'];
  if (!['depth-of-field', 'global-softness', 'motion-blur', 'camera-post'].includes(effectKind)) {
    throw new Error('imaging_preflight.effect_kind is invalid');
  }
  const scope = text(raw.scope, 'imaging_preflight.scope') as ImagingPreflight['scope'];
  if (!['global', 'local-exception'].includes(scope)) throw new Error('imaging_preflight.scope must be global|local-exception');
  if (raw.revalidate_edge_detail !== true && raw.revalidate_edge_detail !== false) {
    throw new Error('imaging_preflight.revalidate_edge_detail must be boolean');
  }
  if (Array.isArray(raw.debt_clearance_claims) && raw.debt_clearance_claims.length) {
    throw new Error('imaging_preflight cannot claim to clear geometry or recognition debt');
  }
  if (!Array.isArray(raw.owner_expectations) || !raw.owner_expectations.length || raw.owner_expectations.length > 32) {
    throw new Error('imaging_preflight.owner_expectations must contain 1-32 owners');
  }
  const expectations = raw.owner_expectations.map((entry, index) => {
    const row = object(entry, `imaging_preflight.owner_expectations[${index}]`);
    const depthRole = text(row.depth_role, `imaging_preflight.owner_expectations[${index}].depth_role`) as CameraDepthRole;
    const focusRole = text(row.expected_focus_role, `imaging_preflight.owner_expectations[${index}].expected_focus_role`) as CameraFocusRole;
    if (!['near', 'focal', 'mid', 'far'].includes(depthRole)) throw new Error(`invalid depth_role at owner_expectations[${index}]`);
    if (!['sharp', 'moderately_soft', 'soft', 'lost'].includes(focusRole)) throw new Error(`invalid expected_focus_role at owner_expectations[${index}]`);
    return {
      owner_id: text(row.owner_id, `imaging_preflight.owner_expectations[${index}].owner_id`),
      depth_role: depthRole,
      expected_focus_role: focusRole,
      ...(row.local_exception === undefined ? {} : { local_exception: text(row.local_exception, `imaging_preflight.owner_expectations[${index}].local_exception`) }),
    };
  });

  const findings: string[] = [];
  let outcome: ImagingPreflight['outcome'] = 'supported';
  const byDepth = new Map<string, typeof expectations>();
  for (const row of expectations) {
    const group = byDepth.get(row.depth_role) ?? [];
    group.push(row);
    byDepth.set(row.depth_role, group);
  }
  for (const [depth, group] of byDepth) {
    const roles = new Set(group.filter(row => !row.local_exception).map(row => row.expected_focus_role));
    if (roles.size > 1) {
      outcome = 'conflict';
      findings.push(`owners at comparable depth=${depth} request incompatible focus roles without a local exception`);
    }
  }
  const farSharp = expectations.find(row => row.depth_role === 'far' && row.expected_focus_role === 'sharp' && !row.local_exception);
  if (farSharp && !/^(?:none|zero|sharp)$/i.test(model.focus.background_softness.trim())) {
    outcome = 'conflict';
    findings.push(`far owner ${farSharp.owner_id} requests sharp focus contrary to declared background softness`);
  }
  if (scope === 'local-exception' && !expectations.some(row => row.local_exception)) {
    outcome = outcome === 'conflict' ? outcome : 'review-required';
    findings.push('local-exception scope requires at least one explicit owner local_exception');
  }
  return {
    protocol: IMAGING_PREFLIGHT_PROTOCOL,
    scene_camera_model_id: model.model_id,
    scene_camera_revision: model.revision,
    effect_kind: effectKind,
    motivation: text(raw.motivation, 'imaging_preflight.motivation'),
    scope,
    owner_expectations: expectations,
    revalidate_edge_detail: raw.revalidate_edge_detail as boolean,
    outcome,
    findings,
  };
}
