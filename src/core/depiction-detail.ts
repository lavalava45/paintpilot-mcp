/** Detail is an editing decision at delivered canvas scale, not an anatomical taxonomy. */
export interface DepictionDetail {
  purpose: 'context' | 'focal' | 'part-edit';
  projected_size: { width: number; height: number };
  canvas_size: { width: number; height: number };
}

export const DEPICTION_DETAIL_GUIDANCE = 'Choose editable scope from projected size AND task. A contextual subject at most 8% of canvas width/height and 0.5% of canvas area may be one whole-object component; retain its true subject_kind. Declare depiction with purpose=context, projected_size and canvas_size once. Focal subjects and requested independent part edits require separate parts. Do not split tiny contextual silhouettes into anatomical passes. Existing separate owners remain separate; never merge or relabel their pixels. Review recognizability, placement and support on the delivered whole figure, without demanding invisible anatomy.';

export function normalizeDepictionDetail(value: unknown): DepictionDetail {
  const row = value as DepictionDetail;
  if (!row || !['context', 'focal', 'part-edit'].includes(row.purpose))
    throw new Error('depiction.purpose must be context|focal|part-edit');
  for (const key of ['projected_size', 'canvas_size'] as const)
    for (const axis of ['width', 'height'] as const)
      if (!Number.isFinite(row[key]?.[axis]) || row[key][axis] <= 0)
        throw new Error(`depiction.${key}.${axis} must be a positive finite number`);
  return { purpose: row.purpose, projected_size: { ...row.projected_size }, canvas_size: { ...row.canvas_size } };
}

export function wholeObjectDepiction(value?: DepictionDetail): boolean {
  if (!value || value.purpose !== 'context') return false;
  const p = value.projected_size, c = value.canvas_size;
  return p.width <= c.width * 0.08 && p.height <= c.height * 0.08
    && p.width * p.height <= c.width * c.height * 0.005;
}

const sizeSchema = { type: 'object', properties: {
  width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 },
}, required: ['width', 'height'], additionalProperties: false };
export const DEPICTION_DETAIL_SCHEMA = {
  type: 'object', description: DEPICTION_DETAIL_GUIDANCE,
  properties: {
    purpose: { type: 'string', enum: ['context', 'focal', 'part-edit'] },
    projected_size: sizeSchema, canvas_size: sizeSchema,
  }, required: ['purpose', 'projected_size', 'canvas_size'], additionalProperties: false,
};
