/** E.25 — semantic authority for one native atomic connected-layer move.
 * Physical layer/bounds verification is independently enforced by the UXP
 * executor. Neither semantic parentage nor a geometric reprojection proves
 * any pixel movement by itself.
 */
type Row = Record<string, unknown>;

function record(value: unknown): Row | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined;
}
function id(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function pin(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/** Cheap structural peek. Ordinary paint/Guard cycles must never read the
 * entire durable owner journal simply to rule out an optional connected move.
 */
export function hasConnectedMove(operation: Row): boolean {
  const args = record(operation.args);
  const steps = operation.tool === 'photoshop_execute_visual_microplan'
    && Array.isArray(args?.steps) ? args.steps : [operation];
  return steps.some(step => {
    const row = record(step);
    const stepArgs = record(row?.args);
    return row?.tool === 'photoshop_move_layer' && stepArgs?.connected_move !== undefined;
  });
}

export function connectedMoveOwnerIssues(
  operation: Row,
  owners: unknown[],
  sceneGeometryModel?: unknown,
): string[] {
  const args = record(operation.args);
  const steps = operation.tool === 'photoshop_execute_visual_microplan'
    && Array.isArray(args?.steps) ? args.steps : [operation];
  const actions = steps.map(record).filter((v): v is Row => !!v);
  const moves = actions.filter(step => step.tool === 'photoshop_move_layer'
    && record(step.args)?.connected_move !== undefined);
  if (!moves.length) return [];
  // Moving both sets of pixels does not by itself preserve vanishing-line,
  // contact/depth calibration of a coherent-3D scene. Require an explicit
  // geometry revision/revalidation protocol before enabling that case.
  if (record(sceneGeometryModel)?.applicability === 'coherent_3d') {
    return ['connected_move_perspective_revalidation_required'];
  }
  if (moves.length !== 1 || actions.filter(step => step.tool === 'photoshop_move_layer'
      || step.tool === 'photoshop_scale_layer' || step.tool === 'photoshop_rotate_layer').length !== 1) {
    return ['connected_move_requires_one_transform_per_guard_pass'];
  }
  const spec = record(record(moves[0]!.args)?.connected_move);
  const parent = record(spec?.parent);
  const children = Array.isArray(spec?.children) ? spec.children.map(record) : [];
  if (!parent || children.length < 1 || children.length > 7 || children.some(child => !child)) {
    return ['connected_move_manifest_invalid'];
  }
  const manifest = [parent, ...children] as Row[];
  const parentId = id(parent.owner_id);
  const declaredIds = manifest.map(entry => id(entry.owner_id));
  const layerIds = manifest.map(entry => pin(entry.layer_id));
  if (!parentId || declaredIds.some(v => !v) || layerIds.some(v => !v)
      || new Set(declaredIds).size !== manifest.length || new Set(layerIds).size !== manifest.length) {
    return ['connected_move_owner_identity_invalid'];
  }
  const known = new Map(owners.map(record).filter((v): v is Row => !!v)
    .filter(row => id(row.hypothesis_id))
    .map(row => [id(row.hypothesis_id)!, row]));
  const selected = manifest.map(entry => known.get(id(entry.owner_id)!));
  if (selected.some((v, i) => !v || v.temporary === true
      || pin(v.layer_id) !== pin(manifest[i]?.layer_id))) {
    return ['connected_move_owner_not_durable_or_physical_layer_mismatch'];
  }
  // Every descendant, including grandchildren, must be in the same atomic
  // native transaction. Otherwise a visually connected part stays behind.
  const descendants = new Set<string>();
  const queue = [parentId];
  while (queue.length) {
    const ancestor = queue.shift()!;
    for (const owner of known.values()) {
      const childId = id(owner.hypothesis_id);
      if (childId && !descendants.has(childId) && childId !== parentId
          && id(owner.parent_hypothesis_id) === ancestor) {
        descendants.add(childId);
        queue.push(childId);
      }
    }
  }
  if (!descendants.size || children.length !== descendants.size
      || children.some(child => !descendants.has(id(child?.owner_id)!))) {
    return ['connected_move_descendant_set_incomplete'];
  }
  for (const owner of selected.slice(1)) {
    const parentOwner = known.get(id(owner!.parent_hypothesis_id)!);
    if (!parentOwner || !id(parentOwner.construction_revision)
        || id(owner!.parent_construction_revision) !== id(parentOwner.construction_revision)) {
      return ['connected_move_parent_construction_stale'];
    }
  }
  if (!id(selected[0]?.construction_revision)) {
    return ['connected_move_parent_revision_unverified'];
  }
  return [];
}

/** Reprojection authority is deliberately stricter than a completed UXP call:
 * a saved pass must contain an exact native history span, a separately
 * observed accepted frame, and one verified pixel-bounds receipt per durable
 * owner. Forged/incomplete journals must not silently mark children current.
 */
export function acceptedConnectedMoveReceipt(
  operation: Row,
  knownOwners: Row[],
): { owner_ids: string[]; delta_x: number; delta_y: number } | undefined {
  if (operation.tool !== 'photoshop_execute_visual_microplan' || operation.phase !== 'completed'
      || operation.failed === true || operation.rolled_back === true
      || operation.current_frame_authority === false
      || record(operation.verdict)?.disposition !== 'accept'
      || record(operation.verdict)?.target_resolved !== 'yes'
      || !record(operation.operation_ack)
      || !record(operation.report)
      || !id(record(operation.preview)?.sha256)) return undefined;
  if (connectedMoveOwnerIssues(operation, knownOwners).length) return undefined;
  const plan = record(operation.args);
  const step = (Array.isArray(plan?.steps) ? plan.steps : [])
    .map(record).find(row => row?.tool === 'photoshop_move_layer' && record(record(row.args)?.connected_move));
  if (!step || !id(step.id)) return undefined;
  const args = record(step.args);
  const spec = record(args?.connected_move);
  const manifests = [record(spec?.parent), ...(Array.isArray(spec?.children) ? spec.children.map(record) : [])];
  const dx = args?.deltaX;
  const dy = args?.deltaY;
  if (typeof dx !== 'number' || !Number.isFinite(dx) || typeof dy !== 'number' || !Number.isFinite(dy)
      || Math.max(Math.abs(dx), Math.abs(dy)) > 512 || (dx === 0 && dy === 0)) return undefined;
  const textContents = Array.isArray(record(operation.result)?.content)
    ? record(operation.result)!.content as unknown[] : [];
  for (const textRow of textContents) {
    const rawText = record(textRow)?.text;
    if (typeof rawText !== 'string') continue;
    let body: Row | undefined;
    try { body = record(JSON.parse(rawText)); } catch { continue; }
    const history = record(record(body?.pass_execution)?.history_ownership);
    if (history?.status !== 'exact') continue;
    const mutation = record(record(body?.mutation_results)?.[id(step.id)!]);
    const data = record(mutation?.details);
    if (!data || data.moved !== true || data.connected !== true || data.history_steps !== 1
        || data.deltaX !== dx || data.deltaY !== dy
        || data.parent_owner_id !== record(spec?.parent)?.owner_id
        || !Array.isArray(data.layer_receipts)
        || data.layer_receipts.length !== manifests.length) continue;
    const receiptMap = new Map((data.layer_receipts as unknown[]).map(record)
      .filter((row): row is Row => !!row).map(row => [id(row.owner_id), row]));
    if (receiptMap.size !== manifests.length) continue;
    const expectedFields = ['left', 'top', 'right', 'bottom'] as const;
    if (!manifests.every(entry => {
      if (!entry) return false;
      const receipt = receiptMap.get(id(entry.owner_id));
      if (!receipt || receipt.layer_id !== entry.layer_id) return false;
      const expected = record(entry.expected_bounds);
      const source = record(receipt.source_bounds);
      const target = record(receipt.target_bounds);
      return !!expected && !!source && !!target && expectedFields.every(field => {
        const original = expected[field];
        const pre = source[field];
        const post = target[field];
        const delta = field === 'left' || field === 'right' ? dx : dy;
        return typeof original === 'number' && Number.isFinite(original)
          && typeof pre === 'number' && Number.isFinite(pre)
          && typeof post === 'number' && Number.isFinite(post)
          && Math.abs(pre - original) <= 1 && Math.abs(post - (pre + delta)) <= 1;
      });
    })) continue;
    return { owner_ids: manifests.map(entry => id(entry!.owner_id)!), delta_x: dx, delta_y: dy };
  }
  return undefined;
}
