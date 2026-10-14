/** Inputs to the narrow initial-coat exemption from committed scene geometry. */
export interface InitialLayerToneInput {
  hasVisualFrame: unknown;
  actionClass: string;
  createStep?: { id?: unknown };
  logicalDecision?: string;
  constructionRole?: string;
  constructionTier?: string;
  logicalLayer?: Record<string, unknown>;
  mutationSteps: ReadonlyArray<{ tool?: unknown; args?: unknown }>;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * A first uniform coat is not spatial construction. Only the exact new-layer
 * fill shape qualifies; authored geometry, owner relations and later frames do
 * not inherit the exemption. This is a pure predicate, not an admission grant.
 */
export function isInitialLayerTone(input: InitialLayerToneInput): boolean {
  const {
    hasVisualFrame, actionClass, createStep, logicalDecision,
    constructionRole, constructionTier, logicalLayer, mutationSteps,
  } = input;
  return hasVisualFrame !== true
    && actionClass === 'ADD'
    && !!createStep
    && logicalDecision === 'create-new'
    && !constructionRole
    && !constructionTier
    && logicalLayer?.construction_change !== true
    && !logicalLayer?.surface_frame
    && !logicalLayer?.geometry_binding
    && !logicalLayer?.parent_hypothesis_id
    && (!Array.isArray(logicalLayer?.depth_relations) || logicalLayer.depth_relations.length === 0)
    && mutationSteps.length === 1
    && text(mutationSteps[0]?.tool) === 'photoshop_fill_layer'
    && text((mutationSteps[0]?.args as Record<string, unknown> | undefined)?.layer_id)
      === `$steps.${text(createStep.id)}.details.layerId`;
}
