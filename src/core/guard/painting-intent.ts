import { createHash } from 'node:crypto';

/** Fill omitted technical keys without changing caller-owned references or input. */
export function normalizeGuardActionIds(input: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const actions = structuredClone(input);
  const explicitIds = new Set(actions.flatMap(step => step && typeof step === 'object' && !Array.isArray(step)
    && typeof step.id === 'string' ? [step.id] : []));
  for (let index = 0; index < actions.length; index++) {
    const step = actions[index];
    if (!step || typeof step !== 'object' || Array.isArray(step) || step.id !== undefined) continue;
    let id = `guard_action_${index + 1}`;
    while (explicitIds.has(id)) id += '_';
    step.id = id;
    explicitIds.add(id);
  }
  return actions;
}

export const PAINTING_INTENT_ACTIONS = [
  'add',
  'refine',
  'replace',
  'erase',
  'rollback',
] as const;

export const PAINTING_INTENT_SCALES = [
  'global',
  'medium',
  'small',
  'detail',
  'local',
  'micro',
] as const;

export const PAINTING_INTENT_VISUAL_INTENTS = [
  'mass',
  'painted-mass',
  'planar-mass',
  'broken-mass',
  'atmospheric-mass',
  'directional-mass',
  'surface-flow',
  'soft-transition',
  'hard-edge',
  'lost-edge',
  'texture',
  'light-sculpt',
  'tonal-contrast',
  'remove-distraction',
  'move-scale-rotate',
] as const;

export type PaintingIntentAction = (typeof PAINTING_INTENT_ACTIONS)[number];
export type PaintingIntentScale = (typeof PAINTING_INTENT_SCALES)[number];
export type PaintingIntentVisualIntent = (typeof PAINTING_INTENT_VISUAL_INTENTS)[number];

export interface PaintingIntentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PaintingIntent {
  request_key: string;
  problem_id: string;
  document_id: number;
  goal: string;
  artistic_commentary?: string;
  target_owner_id?: string;
  region?: string;
  region_bounds?: PaintingIntentBounds;
  action: PaintingIntentAction;
  scale?: PaintingIntentScale;
  visual_intent: PaintingIntentVisualIntent;
  material_role?: string;
  preferred_method_id?: string;
  preferred_brush_role?: string;
  preserve?: string[];
  addresses_primary_mismatch?: boolean;
  deferred_from_operation_id?: string;

  /**
   * Concrete Photoshop geometry remains model-authored until a deterministic
   * action compiler can prove a unique construction. Keeping this optional
   * lets PaintingIntent remove protocol boilerplate without inventing strokes,
   * regions, transforms or colors.
   */
  actions?: Array<Record<string, unknown>>;

  /**
   * Advanced semantic overrides are accepted only when the artistic decision
   * itself changes these contracts. Stable values are inherited locally.
   */
  stage?: string;
  stage_reset?: Record<string, unknown>;
  impact_class?: string;
  construction_role?: string;
  material_response?: Record<string, unknown>;
}

export class PaintingIntentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PaintingIntentError';
  }
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function positiveDocumentId(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function bounds(value: unknown): PaintingIntentBounds | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PaintingIntentError('painting_intent_region_bounds_invalid', 'PaintingIntent region_bounds must be an object.');
  }
  const row = value as Record<string, unknown>;
  const parsed = {
    left: Number(row.left),
    top: Number(row.top),
    right: Number(row.right),
    bottom: Number(row.bottom),
  };
  if (![row.left, row.top, row.right, row.bottom].every(value => typeof value === 'number' && Number.isFinite(value))
    || parsed.right <= parsed.left || parsed.bottom <= parsed.top) {
    throw new PaintingIntentError(
      'painting_intent_region_bounds_invalid',
      'PaintingIntent region_bounds must contain finite left/top/right/bottom coordinates with positive width and height.'
    );
  }
  return parsed;
}

export function parsePaintingIntent(value: unknown): PaintingIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PaintingIntentError('painting_intent_invalid', 'painting_intent must be an object.');
  }
  const raw = value as Record<string, unknown>;
  const requestKey = nonEmptyText(raw.request_key);
  const problemId = nonEmptyText(raw.problem_id);
  const documentId = positiveDocumentId(raw.document_id);
  const goal = nonEmptyText(raw.goal);
  const action = nonEmptyText(raw.action)?.toLowerCase();
  const visualIntent = nonEmptyText(raw.visual_intent)?.toLowerCase();
  const scale = nonEmptyText(raw.scale)?.toLowerCase();

  const errors: PaintingIntentError[] = [];
  if (!requestKey) errors.push(new PaintingIntentError('painting_intent_request_key_required', 'PaintingIntent request_key is required.'));
  if (!problemId) errors.push(new PaintingIntentError('painting_intent_problem_id_required', 'PaintingIntent problem_id is required.'));
  if (!documentId) errors.push(new PaintingIntentError('painting_intent_document_required', 'PaintingIntent document_id must be a positive integer.'));
  if (!goal) errors.push(new PaintingIntentError('painting_intent_goal_required', 'PaintingIntent goal is required.'));
  if (!action || !PAINTING_INTENT_ACTIONS.includes(action as PaintingIntentAction)) {
    errors.push(new PaintingIntentError(
      'painting_intent_action_invalid',
      `PaintingIntent action must be one of ${PAINTING_INTENT_ACTIONS.join('|')}.`
    ));
  }
  if (!visualIntent || !PAINTING_INTENT_VISUAL_INTENTS.includes(visualIntent as PaintingIntentVisualIntent)) {
    errors.push(new PaintingIntentError(
      'painting_intent_visual_intent_invalid',
      `PaintingIntent visual_intent must be one of ${PAINTING_INTENT_VISUAL_INTENTS.join('|')}.`
    ));
  }
  if (raw.scale !== undefined && (!scale || !PAINTING_INTENT_SCALES.includes(scale as PaintingIntentScale))) {
    errors.push(new PaintingIntentError(
      'painting_intent_scale_invalid',
      `PaintingIntent scale must be one of ${PAINTING_INTENT_SCALES.join('|')} when supplied.`
    ));
  }
  if (raw.actions !== undefined && !Array.isArray(raw.actions)) {
    errors.push(new PaintingIntentError('painting_intent_actions_invalid', 'PaintingIntent actions must be an array when supplied.'));
  }

  let regionBounds: PaintingIntentBounds | undefined;
  try { regionBounds = bounds(raw.region_bounds); }
  catch (error) { if (error instanceof PaintingIntentError) errors.push(error); else throw error; }
  if (errors.length) throw new PaintingIntentError(errors[0]!.code,
    errors.map(error => error.message).join('\n'),
    { errors: errors.map(error => ({ code: error.code, message: error.message })) });

  return {
    request_key: requestKey!,
    problem_id: problemId!,
    document_id: documentId!,
    goal: goal!,
    ...(nonEmptyText(raw.artistic_commentary) ? { artistic_commentary: nonEmptyText(raw.artistic_commentary) } : {}),
    ...(nonEmptyText(raw.target_owner_id) ? { target_owner_id: nonEmptyText(raw.target_owner_id) } : {}),
    ...(nonEmptyText(raw.region) ? { region: nonEmptyText(raw.region) } : {}),
    ...(raw.region_bounds !== undefined ? { region_bounds: regionBounds } : {}),
    action: action as PaintingIntentAction,
    ...(scale ? { scale: scale as PaintingIntentScale } : {}),
    visual_intent: visualIntent as PaintingIntentVisualIntent,
    ...(nonEmptyText(raw.material_role) ? { material_role: nonEmptyText(raw.material_role) } : {}),
    ...(nonEmptyText(raw.preferred_method_id) ? { preferred_method_id: nonEmptyText(raw.preferred_method_id) } : {}),
    ...(nonEmptyText(raw.preferred_brush_role) ? { preferred_brush_role: nonEmptyText(raw.preferred_brush_role) } : {}),
    ...(Array.isArray(raw.preserve) ? {
      preserve: [...new Set(raw.preserve.map(nonEmptyText).filter((item): item is string => !!item))],
    } : {}),
    ...(typeof raw.addresses_primary_mismatch === 'boolean'
      ? { addresses_primary_mismatch: raw.addresses_primary_mismatch }
      : {}),
    ...(nonEmptyText(raw.deferred_from_operation_id)
      ? { deferred_from_operation_id: nonEmptyText(raw.deferred_from_operation_id) }
      : {}),
    ...(Array.isArray(raw.actions)
      ? { actions: structuredClone(raw.actions) as Array<Record<string, unknown>> }
      : {}),
    ...(nonEmptyText(raw.stage) ? { stage: nonEmptyText(raw.stage) } : {}),
    ...(raw.stage_reset && typeof raw.stage_reset === 'object' && !Array.isArray(raw.stage_reset)
      ? { stage_reset: structuredClone(raw.stage_reset) as Record<string, unknown> }
      : {}),
    ...(nonEmptyText(raw.impact_class) ? { impact_class: nonEmptyText(raw.impact_class) } : {}),
    ...(nonEmptyText(raw.construction_role) ? { construction_role: nonEmptyText(raw.construction_role) } : {}),
    ...(raw.material_response && typeof raw.material_response === 'object' && !Array.isArray(raw.material_response)
      ? { material_response: structuredClone(raw.material_response) as Record<string, unknown> }
      : {}),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function paintingIntentFingerprint(intent: PaintingIntent): string {
  return createHash('sha256').update(stableJson(intent)).digest('hex');
}
