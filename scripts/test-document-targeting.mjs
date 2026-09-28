import {
  DOCUMENT_ID_SCHEMA_EXCLUDES,
  getTargetDocumentId,
  withOptionalDocumentId,
  wrapDocumentIdHandler,
} from '../dist/core/document-target.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseJsonText(result) {
  for (const item of result?.content ?? []) {
    if (item.type !== 'text') continue;
    try {
      return JSON.parse(item.text);
    } catch {
      // continue
    }
  }
  throw new Error('No JSON text content found');
}

const baseTool = {
  name: 'photoshop_create_layer',
  description: 'test',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
};
const targetedTool = withOptionalDocumentId(baseTool);
assert(targetedTool.inputSchema.properties.document_id, 'document_id should be injected');
assert(targetedTool.inputSchema.properties.document_id.minimum === 1, 'document_id schema should reject non-positive ids');

for (const name of [
  'photoshop_create_document',
  'photoshop_open_image',
  'photoshop_set_brush',
  'photoshop_transform_landmarks',
]) {
  assert(DOCUMENT_ID_SCHEMA_EXCLUDES.has(name), `${name} should be excluded from document targeting`);
  const tool = withOptionalDocumentId({ name, description: 'test', inputSchema: { type: 'object', properties: {} } });
  assert(!tool.inputSchema.properties.document_id, `${name} should not expose document_id`);
}

let observedTarget;
const structuredHandler = wrapDocumentIdHandler(
  'photoshop_create_layer',
  async () => {
    observedTarget = getTargetDocumentId();
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: true, details: { layerId: 7 } }) }],
    };
  }
);
const structured = await structuredHandler({ document_id: 42 });
assert(observedTarget === 42, 'handler should run inside AsyncLocal document target');
const structuredJson = parseJsonText(structured);
assert(structuredJson.document_target?.id === 42, 'structured result should include document_target.id');
assert(structuredJson.document_target?.pinned === true, 'structured result should mark target as pinned');

const plainHandler = wrapDocumentIdHandler(
  'photoshop_apply_layer_style',
  async () => ({ content: [{ type: 'text', text: 'Style applied' }] })
);
const plain = await plainHandler({ document_id: 17 });
assert(
  plain.content.some((item) => item.type === 'text' && item.text.includes('"document_target"')),
  'plain-text results should receive a document_target metadata block'
);

let invalidHandlerRan = false;
const invalidHandler = wrapDocumentIdHandler('photoshop_create_layer', async () => {
  invalidHandlerRan = true;
  return { content: [{ type: 'text', text: 'unexpected' }] };
});
for (const invalidId of [0, -1, 2.5, '12', null]) {
  const result = await invalidHandler({ document_id: invalidId });
  const body = parseJsonText(result);
  assert(result.isError === true, `invalid document_id ${String(invalidId)} should fail`);
  assert(body.code === 'invalid_arguments', 'invalid document_id should use invalid_arguments');
}
assert(invalidHandlerRan === false, 'invalid document_id must fail before executing the handler');

let neuralObserved;
const neuralHandler = wrapDocumentIdHandler(
  'photoshop_neural_filter',
  async () => {
    neuralObserved = getTargetDocumentId();
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
  }
);
const neural = await neuralHandler({ document_id: 99, filter: 'skin_smoothing' });
assert(neuralObserved === 99, 'UXP handler should retain AsyncLocal target');
assert(parseJsonText(neural).document_target?.id === 99, 'UXP result should report pinned document id');

const here = path.dirname(fileURLToPath(import.meta.url));
const uxpMain = await readFile(path.resolve(here, '..', 'uxp-plugin', 'main.js'), 'utf8');
assert(uxpMain.includes('await assertPinnedActiveDocument(cmdAction, params);'), 'UXP lane should verify the pinned document before command dispatch');
assert(uxpMain.includes('document_not_active: pinned document'), 'UXP lane should fail closed instead of switching tabs');
assert(uxpMain.includes("_target: [{ _ref: 'document', _id: params.document_id }]"), 'UXP plugin should select pinned document id in the same batchPlay command');

console.log('DOCUMENT_TARGETING_TEST_OK');
