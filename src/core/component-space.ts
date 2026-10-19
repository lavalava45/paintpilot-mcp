// Coordinate space is an authored component decision, not an object-name heuristic.
// A canvas field is still subject to semantic ownership and exact-image Critic review.
export const COMPONENT_SPACE_SCHEMA = {
  type: 'string', enum: ['canvas', 'world'],
  description: 'world (default): depicted spatial component; canvas: two-dimensional canvas-space component. Neither choice prescribes style, material or Photoshop painting method. Existing durable owner coordinate space cannot be silently relabelled.',
};

export function canvasComponent(raw: any, context: any = {}): boolean {
  const logical = raw.logical_layer;
  const prior = Array.isArray(context.logical_layer_owners)
    ? context.logical_layer_owners.find((owner: any) => owner?.hypothesis_id === logical?.hypothesis_id)
    : undefined;
  return (logical?.component_space ?? prior?.component_space) === 'canvas';
}

/** A declared 2D contour is not a spatial construction model. This predicate
 * is shared by admission and owner-plan compilation; neither may advertise a
 * transition that the other forbids. Native contour/topology checks still run. */
export function flatCanvasContour(raw: any): boolean {
  if (raw.logical_layer?.component_space !== 'canvas' || raw.construction) return false;
  // Coordinate-space intent does not imply one prescribed contour method or
  // artistic object type. Exact contour validity and targeting are checked by
  // the Photoshop operation itself.
  const mutations = (Array.isArray(raw.actions) ? raw.actions : [])
    .filter((step: any) => !['photoshop_create_layer', 'photoshop_get_preview'].includes(step?.tool));
  return mutations.length > 0 && mutations.every((step: any) => step?.tool === 'photoshop_paint_regions'
    && Array.isArray(step?.args?.regions) && step.args.regions.length > 0
    && step.args.regions.every((region: any) => Array.isArray(region?.contours) && region.contours.length > 0));
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
  // Artistic combinations (canvas-space contours, diagrams, imaginary
  // perspective, support surfaces, optical overlays) are not errors. A truly
  // contradictory existing owner is rejected by component_space_owner_conflict.
  return undefined;
}
