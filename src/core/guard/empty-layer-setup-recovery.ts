import { committedSceneRecord, pendingCreatedLayers } from './ownership-evidence.js';

type Row = Record<string, any>;

/** Recovery before the first painted frame. A layer name or an empty active
 * layer alone is not document identity. Require the complete native New +
 * New Layer history, original bootstrap dimensions and every created layer's
 * pinned receipt. Unknown history, content or extra layers stays quarantined.
 */
export function provesEmptyLayerSetup(input: {
  documentId: number; document: Row; saved: Row; bootstrap?: Row;
  records: Row[]; history: Row | null; layerBody?: Row;
}): boolean {
  const { documentId, document, saved, bootstrap, records, history, layerBody } = input;
  if (!bootstrap || bootstrap.tool !== 'photoshop_create_document' || !committedSceneRecord(bootstrap)
    || bootstrap.id !== saved.document_instance?.bootstrap_operation_id) return false;
  const initial = bootstrap.bootstrap_outcome?.document;
  if (initial?.id !== documentId || !['name', 'width', 'height'].every(key => initial[key] === document[key])) return false;
  const pending = pendingCreatedLayers(records, documentId, []);
  if (!pending.length) return false;
  const expected = new Map(pending.map(layer => [layer.layer_id, layer]));
  const layers = layerBody?.layers;
  const liveDocument = layerBody?.context?.document;
  if (!Array.isArray(layers) || layers.length !== pending.length + 1
    || liveDocument?.id !== documentId || !['name', 'width', 'height'].every(key => liveDocument[key] === document[key])
    || new Set(layers.map((layer: Row) => layer.id)).size !== layers.length) return false;
  const background = layers.filter((layer: Row) => layer.isBackground === true);
  if (background.length !== 1 || background[0].kind !== 'LayerKind.NORMAL'
    || !Number.isSafeInteger(background[0].id) || background[0].id <= 0) return false;
  let firstSource: Row | undefined;
  for (const layer of layers.filter((layer: Row) => !layer.isBackground)) {
    const receipt = expected.get(layer.id);
    const source = records.find(record => record.id === receipt?.source_operation_id);
    if (!receipt || !source || !committedSceneRecord(source) || source.dispatched !== true
      || layer.name !== receipt.layer_name || layer.kind !== 'LayerKind.NORMAL'
      || layer.depth !== 0 || layer.isBackground !== false
      || !layer.bounds || !['left', 'top', 'right', 'bottom'].every(key => layer.bounds[key] === 0)) return false;
    let exact = false;
    for (const item of source.result?.content ?? []) {
      let body: Row;
      try { body = JSON.parse(item.text); } catch { continue; }
      if (body?.ok === true && body.document_target?.id === documentId && body.details?.layerId === layer.id
        && body.details.history_steps === 1 && body.details.history_evidence === 'uxp_modal_native_history_cursor') {
        exact = true;
        if (!firstSource || source.sequence < firstSource.sequence) firstSource = { ...source, native_details: body.details };
      }
    }
    if (!exact) return false;
  }
  if (firstSource?.native_details?.relativeToId !== background[0].id) return false;
  if (!history || !Array.isArray(history.states) || history.totalStates !== history.states.length
    || history.currentIndex !== history.totalStates - 1 || history.currentState !== 'New Layer'
    || (history.context?.document?.id !== undefined && history.context.document.id !== documentId)) return false;
  const prefixLength = history.states.length - pending.length;
  if (![1, 2].includes(prefixLength) || history.states[prefixLength - 1]?.name !== 'New') return false;
  if (prefixLength === 2 && (history.states[0]?.name !== document.name || history.states[0]?.snapshot !== true)) return false;
  return history.states.slice(prefixLength).every((state: Row) => state.name === 'New Layer' && state.snapshot === false);
}
