type Row = Record<string, any>;

export function committedSceneRecord(record: Row): boolean {
  return record.phase === 'completed' && record.failed !== true && !record.error && record.dispatched !== false
    && !['not-executed', 'uncertain', 'partial', 'failed'].includes(record.execution)
    && record.rolled_back !== true && record.rollback?.completed !== true
    && record.current_frame_authority !== false && !['abandoned', 'partial'].includes(record.resolved?.outcome);
}

export function pendingCreatedLayers(records: Row[], documentId: number, owners: Row[]): Row[] {
  const pending = new Map<number, Row>();
  for (const record of [...records].sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0))) {
    if (record.args?.document_id !== documentId || record.phase !== 'completed'
      || record.rolled_back || record.rollback?.completed || record.current_frame_authority === false
      || record.resolved?.outcome === 'abandoned' || record.execution === 'not-executed') continue;
    // Retain the creation identity through unrelated work and reconciled
    // preparation failures. It does NOT certify current emptiness: the executor
    // always reads that natively. Undo can retire creation; delete/merge retire
    // the pinned physical identity. An unowned nonempty layer still cannot bind.
    if (record.tool === 'photoshop_undo' || record.args?.steps?.some((step: Row) => step.tool === 'photoshop_undo')) pending.clear();
    if (/^photoshop_(delete_layer|merge_layer_down)$/.test(record.tool)) {
      if (Number.isSafeInteger(record.args?.layer_id)) pending.delete(record.args.layer_id);
      else pending.clear();
    }
    if (record.tool !== 'photoshop_create_layer' || record.failed || record.dispatched !== true
      || ['uncertain', 'partial'].includes(record.execution)) continue;
    for (const item of record.result?.content ?? []) {
      let body: Row;
      try { body = JSON.parse(item.text); } catch { continue; }
      const id = body?.details?.layerId;
      const layer = body?.details?.context?.activeLayer;
      const bounds = layer?.bounds;
      if (body?.ok !== true || body.document_target?.id !== documentId
        || !Number.isSafeInteger(id) || id <= 0 || layer?.isBackground !== false
        || !bounds || !['left', 'top', 'right', 'bottom'].every(key => bounds[key] === 0)
        || owners.some(owner => (owner.physical_layer_ids ?? [owner.layer_id]).includes(id))) continue;
      pending.set(id, { layer_id: id, layer_name: body.details.layerName,
        source_operation_id: record.id });
    }
  }
  return [...pending.values()];
}

/** A provisional binding is admission context only. It is persisted solely by
 * the successful executor receipt, never by compilation or a rejected plan. */
export function provisionalOwner(pass: Row, context: Row): Row | undefined {
  const logical = pass.logical_layer;
  const reuseDeclaredNew = logical?.decision === 'create-new' && Array.isArray(pass.actions)
    && pass.actions.length > 0 && !pass.actions.some((step: Row) => step.tool === 'photoshop_create_layer');
  if (!logical || (!['continue-logical-layer', 'adjust'].includes(logical.decision) && !reuseDeclaredNew)
    || !logical.hypothesis_id || (pass.target_owner_id && pass.target_owner_id !== logical.hypothesis_id)
    || (pass.action_class !== undefined && pass.action_class !== 'ADD')
    || (pass.action !== undefined && pass.action !== 'add')
    || pass.cross_layer_correction || pass.restore_anchor_operation_id) return;
  const owners = context.logical_layer_owners ?? [];
  if (owners.some((owner: Row) => owner.hypothesis_id === logical.hypothesis_id
    || (owner.physical_layer_ids ?? [owner.layer_id]).includes(logical.layer_id))) return;
  const matches = (context.pending_created_layers ?? []).filter((layer: Row) => layer.layer_id === logical.layer_id);
  if (matches.length !== 1 || (logical.binding_source_operation_id !== undefined
    && logical.binding_source_operation_id !== matches[0].source_operation_id)) return;
  return { ...structuredClone(logical), decision: 'continue-logical-layer', layer_id: matches[0].layer_id,
    layer_name: matches[0].layer_name, binding_source_operation_id: matches[0].source_operation_id,
    physical_layer_ids: [matches[0].layer_id], temporary: false };
}

export function ownerContextForPass<T extends Record<string, unknown>>(pass: Row, context: T): T {
  const owner = provisionalOwner(pass, context);
  return owner ? { ...context, logical_layer_owners: [...(Array.isArray(context.logical_layer_owners) ? context.logical_layer_owners : []), owner] } : context;
}

/** One admission rule for journal-backed ownership and its scene declaration.
 * Proposals and ambiguous execution never become physical binding evidence.
 * A reconciled partial create can own its layer without claiming painted pixels.
 */
export function ownershipEvidence(record: Row, documentId: number): Row[] {
  if (record.phase !== 'completed' || record.rolled_back === true
    || record.current_frame_authority === false || record.rollback?.completed === true
    || record.resolved?.outcome === 'abandoned'
    || ['not-executed', 'uncertain', 'failed'].includes(record.execution) || record.dispatched === false
    || (record.resolved?.outcome === 'partial' && record.execution !== 'partial')
    || (record.failed === true && record.execution !== 'partial')) return [];
  const rows: Row[] = [];
  for (const content of record.result?.content ?? []) {
    if (content.type !== 'text') continue;
    let body: Row;
    try { body = JSON.parse(content.text); } catch { continue; }
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || ['not-executed', 'uncertain'].includes(body.execution)
      || (body.ok === false && record.execution !== 'partial')
      || (body.document_target?.id !== undefined && body.document_target.id !== documentId)) continue;
    if (Array.isArray(body.continuation_layers)) rows.push(...body.continuation_layers);
    if (rows.length || record.execution !== 'partial' || record.resolved?.outcome !== 'partial') continue;
    const logical = record.args?.logical_layer;
    if (!['create-new', 'temporary-hypothesis'].includes(logical?.decision)
      || typeof logical.hypothesis_id !== 'string' || !logical.hypothesis_id.trim()) continue;
    const created = (record.args?.steps ?? []).filter((step: Row) => step.tool === 'photoshop_create_layer'
      && body.steps?.some((status: Row) => status.id === step.id && status.tool === step.tool
        && status.ok === true && status.execution === 'completed'));
    const receipt = created.length === 1 ? body.completed_results?.[created[0].id] : undefined;
    if (receipt?.ok === true && receipt.document_target?.id === documentId
      && Number.isSafeInteger(receipt.details?.layerId) && receipt.details.layerId > 0) {
      rows.push({ ...structuredClone(logical), layer_id: receipt.details.layerId,
        temporary: logical.decision === 'temporary-hypothesis' });
    }
  }
  return rows.filter(row => row && typeof row === 'object' && !Array.isArray(row)
    && typeof row.hypothesis_id === 'string' && row.hypothesis_id.trim()
    && Number.isSafeInteger(row.layer_id) && row.layer_id > 0);
}
