/**
 * Pure projections for the compact pass's durable layer-target checks.
 * Preserve the compiler's existing numeric coercion, projected-stack precedence,
 * and last-owner-wins indexing; the Guard still decides target authorization.
 */
export function indexDurableOwnersByLayerId(
  owners: Array<Record<string, unknown>>
): Map<number, Record<string, unknown>> {
  return new Map(
    owners.flatMap(owner => {
      const projected = Array.isArray(owner.physical_layer_ids)
        ? owner.physical_layer_ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0)
        : [];
      const current = Number(owner.layer_id);
      const ids = projected.length
        ? projected
        : (Number.isSafeInteger(current) && current > 0 ? [current] : []);
      return ids.map(id => [id, owner] as [number, Record<string, unknown>]);
    })
  );
}

/** Extract only concrete numeric layer targets from mutation arguments. */
export function collectConcreteMutationLayerIds(
  mutationSteps: Array<Record<string, unknown>>
): Set<number> {
  const mutationTargetLayerIds = new Set<number>();
  const collectConcreteLayerIds = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) {
      for (const entry of value) collectConcreteLayerIds(entry, key);
      return;
    }
    if (!value || typeof value !== 'object') {
      if ((key === 'layer_id' || key === 'layerId') && Number.isSafeInteger(Number(value)) && Number(value) > 0) {
        mutationTargetLayerIds.add(Number(value));
      }
      return;
    }
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      collectConcreteLayerIds(child, childKey);
    }
  };
  for (const step of mutationSteps) collectConcreteLayerIds(step.args);
  return mutationTargetLayerIds;
}
