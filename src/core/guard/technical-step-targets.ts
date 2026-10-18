/** Bind a missing new-layer target only to the sole prior layer producer in
 * the same semantic owner pass. Deferred results are resolved by the ordinary
 * VisualMicroPlan executor; never guess a Photoshop numeric layer id. */
export function bindUniqueNewLayerStepTarget(
  pass: Record<string, unknown>,
): { pass: Record<string, unknown>; repairs: Array<{ kind: 'inject_from_context'; path: string; source: string; reason: string }> } {
  const original = pass;
  const logical = original.logical_layer as Record<string, unknown> | undefined;
  const actions = Array.isArray(original.actions) ? original.actions as Array<Record<string, unknown>> : [];
  if (!logical || !['create-new', 'temporary-hypothesis'].includes(String(logical.decision))
    || original.construction || original.painterly || original.restore_anchor_operation_id
    || logical.layer_id !== undefined || !actions.length) return { pass, repairs: [] };
  const creates = actions.flatMap((action, index) => action?.tool === 'photoshop_create_layer'
    ? [{ action, index }] : []);
  if (creates.length !== 1) return { pass, repairs: [] };
  const [{ action: producer, index: producerIndex }] = creates;
  const producerId = producer.id;
  if (typeof producerId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(producerId)
    || actions.some((action, i) => i !== producerIndex && action?.id === producerId)) return { pass, repairs: [] };
  const name = (producer.args as Record<string, unknown> | undefined)?.name;
  if (typeof logical.layer_name === 'string' && typeof name === 'string' && name !== logical.layer_name)
    return { pass, repairs: [] };
  // Only one paint target for the new owner. Other steps, multiple producers,
  // explicit foreign targets, or target edits before layer creation forbid repair.
  const eligible = new Set(['photoshop_create_layer', 'photoshop_fill_layer', 'photoshop_paint_regions', 'photoshop_get_preview']);
  if (actions.some(action => !eligible.has(String(action?.tool)))) return { pass, repairs: [] };
  const reference = `$steps.${producerId}.details.layerId`;
  let missingCount = 0;
  for (const [index, action] of actions.entries()) {
    if (!['photoshop_fill_layer', 'photoshop_paint_regions'].includes(String(action?.tool))) continue;
    if (index <= producerIndex) return { pass, repairs: [] };
    const args = action.args as Record<string, unknown> | undefined;
    if (!args || typeof args !== 'object' || Array.isArray(args)) return { pass, repairs: [] };
    if (action.tool === 'photoshop_fill_layer') {
      if (args.layer_id !== undefined && args.layer_id !== reference) return { pass, repairs: [] };
      if (args.layer_id === undefined) missingCount++;
    } else {
      if (args.layer_id !== undefined && args.layer_id !== reference) return { pass, repairs: [] };
      const regions = args.regions;
      if (!Array.isArray(regions) || !regions.length) return { pass, repairs: [] };
      for (const region of regions) {
        if (!region || typeof region !== 'object' || Array.isArray(region)) return { pass, repairs: [] };
        const target = (region as Record<string, unknown>).layer_id;
        if (target !== undefined && target !== reference) return { pass, repairs: [] };
        if (target === undefined) missingCount++;
      }
    }
  }
  if (!missingCount) return { pass, repairs: [] };
  const repaired = structuredClone(original);
  const updated = repaired.actions as Array<Record<string, unknown>>;
  const repairs: Array<{ kind: 'inject_from_context'; path: string; source: string; reason: string }> = [];
  const bind = (args: Record<string, unknown>, path: string): void => {
    if (args.layer_id !== undefined) return;
    args.layer_id = reference;
    repairs.push({ kind: 'inject_from_context', path, source: `next_pass.actions[${producerIndex}].details.layerId`,
      reason: 'The sole earlier create-layer action in this new semantic owner pass guarantees the target layer id at execution time.' });
  };
  updated.forEach((action, i) => {
    const args = action.args as Record<string, unknown> | undefined;
    if (action.tool === 'photoshop_fill_layer') bind(args!, `next_pass.actions[${i}].args.layer_id`);
    else if (action.tool === 'photoshop_paint_regions') {
      (args!.regions as Array<Record<string, unknown>>).forEach((region, j) =>
        bind(region, `next_pass.actions[${i}].args.regions[${j}].layer_id`));
    }
  });
  return { pass: repaired, repairs };
}
