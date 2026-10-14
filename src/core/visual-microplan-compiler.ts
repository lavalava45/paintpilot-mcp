import { createHash } from 'node:crypto';
import { VISUAL_MICROPLAN_MUTATION_TOOLS } from './visual-microplan.js';

export const VISUAL_MICROPLAN_STAGES = [
  'RECOGNITION_BLOCK_IN',
  'GLOBAL_BLOCK_IN',
  'COMPOSITION',
  'SHAPE',
  'VALUE',
  'FORM',
  'MEDIUM_FORM',
  'FORM_AND_LIGHT',
  'EDGE',
  'MATERIAL',
  'DETAIL',
  'MICRO_DETAIL',
] as const;

function canonicalStage(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return normalized === 'BLOCKIN' || normalized === 'BLOCK_IN' || normalized === 'MASS_BLOCK_IN'
    ? 'GLOBAL_BLOCK_IN'
    : normalized;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Stable identity for an already-compiled semantic plan. */
export function visualMicroPlanFingerprint(input: Record<string, unknown>): string {
  const compiled = compileVisualMicroPlan(input);
  return createHash('sha256').update(stableJson(compiled)).digest('hex');
}

/** Deterministic protocol defaults only; never invent artistic intent or retarget explicit ids. */
export function compileVisualMicroPlan(input: Record<string, unknown>): Record<string, unknown> {
  const args = structuredClone(input);
  if (typeof args.stage === 'string') args.stage = canonicalStage(args.stage);
  if (!Array.isArray(args.steps)) return args;
  const steps = args.steps as Array<Record<string, unknown>>;
  // These setters depend on brush/color state, never on the active layer. Move
  // only independent setters across layer setup, keeping their order and IDs.
  // References, evidence boundaries and all other preparation remain barriers.
  const setters = new Set(['photoshop_select_brush_preset', 'photoshop_set_brush', 'photoshop_set_foreground_color']);
  const layerSetup = new Set(['photoshop_create_layer', 'photoshop_select_layer_by_name']);
  const hasReference = (value: unknown): boolean => typeof value === 'string' ? value.includes('$steps.')
    : Array.isArray(value) ? value.some(hasReference)
    : !!value && typeof value === 'object' && Object.values(value).some(hasReference);
  const firstMutation = steps.findIndex(step => VISUAL_MICROPLAN_MUTATION_TOOLS.has(String(step?.tool)));
  for (let index = 0; index < firstMutation; index++) {
    const step = steps[index]!;
    if (!setters.has(String(step?.tool)) || hasReference(step.args)) continue;
    let destination = index;
    while (destination > 0 && layerSetup.has(String(steps[destination - 1]?.tool))) destination--;
    if (destination < index) { steps.splice(index, 1); steps.splice(destination, 0, step); }
  }
  for (const step of steps) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
    // Legacy clients sometimes repeated the root artistic intent on each step.
    // Treat that free text as explanatory prose, not as a competing semantic
    // contract. The root intent remains the single authoritative pass goal.
    if (typeof step.intent === 'string' && step.intent.trim()) {
      if (step.description === undefined) step.description = step.intent;
      delete step.intent;
    }
  }
  const layer = args.logical_layer as Record<string, unknown> | undefined;
  const creates = steps.filter(step => step?.tool === 'photoshop_create_layer');
  const create = creates.length === 1 ? creates[0] : undefined;
  const createTarget = layer && ['create-new', 'temporary-hypothesis'].includes(String(layer.decision))
    && typeof create?.id === 'string' ? `$steps.${create.id}.details.layerId` : undefined;
  for (const step of steps) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) continue;
    if (step.tool === 'photoshop_paint_regions' && step.method_id === 'region-fill-closed-contours') {
      step.method_id = 'region-block-in';
    }
    const payload = step.args;
    if (!createTarget || !payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
    const nested = payload as Record<string, unknown>;
    if (step.tool === 'photoshop_paint_regions' && Array.isArray(nested.regions)) {
      for (const region of nested.regions) {
        if (region && typeof region === 'object' && !Array.isArray(region) && region.layer_id === undefined) {
          region.layer_id = createTarget;
        }
      }
    } else if (['photoshop_paint_strokes', 'photoshop_paint_dabs', 'photoshop_fill_layer'].includes(String(step.tool))
      && nested.layer_id === undefined) {
      nested.layer_id = createTarget;
    }
  }
  const last = steps.at(-1);
  // Stay aligned with the executor's mutation contract: transforms and stamps
  // also require the exact final visual review, not only painting/filter tools.
  if (last && VISUAL_MICROPLAN_MUTATION_TOOLS.has(String(last.tool))) {
    const ids = new Set(steps.map(step => step?.id));
    let id = 'after_preview';
    while (ids.has(id)) id += '_';
    steps.push({ id, tool: 'photoshop_get_preview', args: { max_dimension_px: 1000, quality: 8 } });
  }
  return args;
}
