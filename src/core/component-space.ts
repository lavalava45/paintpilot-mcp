// Coordinate space is an authored component decision, not an object-name heuristic.
// A canvas field is still subject to semantic ownership and exact-image Critic review.
export const COMPONENT_SPACE_SCHEMA = {
  type: 'string', enum: ['canvas', 'world'],
  description: 'world (default): depicted spatial component. canvas: paper/backdrop/flat graphic field in canvas coordinates, with no physical support, construction model or spatial parent. For a flat fill/gradient use construction_role=continuous-field, visual_intent=continuous-field and method continuous-color-field; omit spatial construction_tier/change/bindings. Geometry is not required for that field; applicable color preflight and visual review remain required.',
};

export function canvasComponent(raw: any, context: any = {}): boolean {
  const logical = raw.logical_layer;
  const prior = Array.isArray(context.logical_layer_owners)
    ? context.logical_layer_owners.find((owner: any) => owner?.hypothesis_id === logical?.hypothesis_id)
    : undefined;
  return (logical?.component_space ?? prior?.component_space) === 'canvas';
}

export function componentSpaceIssue(raw: any, context: any = {}) {
  const logical = raw.logical_layer;
  const prior = Array.isArray(context.logical_layer_owners)
    ? context.logical_layer_owners.find((owner: any) => owner?.hypothesis_id === logical?.hypothesis_id)
    : undefined;
  const space = logical?.component_space ?? prior?.component_space;
  if (space !== undefined && !['canvas', 'world'].includes(space))
    return { code: 'component_space_invalid', message: 'logical_layer.component_space must be canvas or world.' };
  // A durable spatial owner cannot be relabelled to bypass its geometry/rebuild debt.
  if (prior && logical?.component_space !== undefined
      && logical.component_space !== (prior.component_space ?? 'world'))
    return { code: 'component_space_owner_conflict', message: 'Preserve the durable component coordinate space; create a distinct owner for a different component.' };
  if (space === 'canvas' && (raw.construction || ['structured-mass', 'structured-contour'].includes(raw.construction_role)
      || logical?.construction_change || logical?.construction_tier || logical?.parent_hypothesis_id
      || logical?.geometry_binding || logical?.surface_frame || logical?.camera_binding
      || ['support-surface', 'transmissive-surface'].includes(logical?.physical_role)
      || prior?.geometry_binding || prior?.construction_tier
      || (Array.isArray(context.construction_bindings)
        && context.construction_bindings.some((binding: any) => binding?.owner_id === logical?.hypothesis_id))))
    return { code: 'component_space_conflict', path: 'next_pass.logical_layer.component_space',
      message: 'Canvas components cannot claim spatial construction/support/parent bindings. For a flat field keep canvas, use fill/gradient with construction_role=continuous-field, and omit construction, construction_change, construction_tier, spatial parent/bindings and support-surface/transmissive-surface roles. For a depicted spatial component choose world and supply actual geometry. A durable world owner requires a distinct canvas owner; preserve semantic units.' };
  return undefined;
}
