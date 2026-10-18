import { isDeepStrictEqual } from 'node:util';

/** Executable requirements are also the public correction contract. No second
 * prose parser or independently maintained expected-value table is involved. */
export type TransitionConstraint =
  | { operator: 'equals'; expected: unknown }
  | { operator: 'absent'; expected: true }
  | { operator: 'one-of' | 'includes'; expected: readonly unknown[] }
  | { operator: 'number-range'; expected: { min: number; max: number; exclusive_min?: boolean } }
  | { operator: 'contains-bounds'; expected: { left: number; top: number; right: number; bottom: number } }
  | { operator: 'nonempty-string'; expected: true };
export type TransitionRequirement = TransitionConstraint & {
  path: string;
  code: string;
  message: string;
  actual: unknown;
};
export type TransitionIssue = TransitionRequirement;

export function unmetTransitionRequirements(requirements: TransitionRequirement[]): TransitionIssue[] {
  return requirements.filter(rule => {
    switch (rule.operator) {
      case 'equals': return !isDeepStrictEqual(rule.actual, rule.expected);
      case 'absent': return rule.actual !== undefined;
      case 'one-of': return !rule.expected.some(value => isDeepStrictEqual(value, rule.actual));
      case 'includes': return !Array.isArray(rule.actual)
        || !rule.expected.every(value => (rule.actual as unknown[]).some(item => isDeepStrictEqual(item, value)));
      case 'nonempty-string': return typeof rule.actual !== 'string' || !rule.actual.trim();
      case 'contains-bounds': {
        const bounds = rule.actual as Record<string, number> | null;
        return !bounds || !['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(bounds[key]))
          || bounds.left > rule.expected.left || bounds.top > rule.expected.top
          || bounds.right < rule.expected.right || bounds.bottom < rule.expected.bottom;
      }
      case 'number-range': return typeof rule.actual !== 'number' || !Number.isFinite(rule.actual)
        || (rule.expected.exclusive_min ? rule.actual <= rule.expected.min : rule.actual < rule.expected.min)
        || rule.actual > rule.expected.max;
    }
  });
}

/** Resolve only declared public fields. A permissive object has no type
 * guarantee, so callers must not claim a typed contract check for it. */
export interface TransitionFieldSchema {
  type?: string;
  properties?: Record<string, TransitionFieldSchema>;
  items?: TransitionFieldSchema;
  required?: string[];
  enum?: unknown[];
  multipleOf?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
}
export function transitionFieldSchema(schema: TransitionFieldSchema, path: string): TransitionFieldSchema | undefined {
  let node: TransitionFieldSchema | undefined = schema;
  for (const part of path.replace(/\[\d+\]/g, '[]').split('.')) {
    const array = part.endsWith('[]');
    node = node?.properties?.[array ? part.slice(0, -2) : part];
    if (array) node = node?.items;
    if (!node) return undefined;
  }
  return node;
}

/** Shared by compiler rejection and built-MCP audit. The ordinary schema
 * validator is injected so this module does not implement a second JSON Schema. */
export function transitionRequirementSchemaErrors(
  rule: { path: string; operator: string; expected: unknown },
  schema: TransitionFieldSchema,
  validate: (value: unknown, schema: TransitionFieldSchema, path: string) => string[],
): string[] {
  const field = transitionFieldSchema(schema, rule.path);
  if (rule.operator === 'absent') {
    const parts = rule.path.split('.');
    const name = parts.pop()!;
    const parent = transitionFieldSchema(schema, parts.join('.'));
    return parent?.required?.includes(name) ? [`${rule.path} is required but runtime requests its removal`] : [];
  }
  if (!field) return [`${rule.path} is not declared in the public schema`];
  // One supported member is sufficient for a one-of requirement. Demanding
  // that *all* alternatives fit the public schema invented false blockers.
  if (rule.operator === 'one-of') {
    if (!Array.isArray(rule.expected) || rule.expected.length === 0) return [`${rule.path} has no permitted values`];
    const checks = rule.expected.map(value => validate(value, field, rule.path));
    return checks.some(errors => errors.length === 0) ? [] :
      [`${rule.path} has no value shared by the runtime alternatives and the public schema`,
        ...checks.flat().slice(0, 4)];
  }
  if (['equals', 'contains-bounds'].includes(rule.operator)) return validate(rule.expected, field, rule.path);
  if (rule.operator === 'includes') return !field.items ? [`${rule.path} has no array item schema`]
    : (rule.expected as unknown[]).flatMap(value => validate(value, field.items!, rule.path + '[]'));
  if (rule.operator === 'nonempty-string') return validate('x', field, rule.path);
  if (rule.operator === 'number-range') {
    const range = rule.expected as { min: number; max: number; exclusive_min?: boolean };
    if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max)
      return [`${rule.path} has an invalid runtime numeric range`];
    const lower = Math.max(range.min, field.exclusiveMinimum ?? field.minimum ?? -Infinity);
    const upper = Math.min(range.max, field.exclusiveMaximum ?? field.maximum ?? Infinity);
    const lowerOpen = (lower === range.min && !!range.exclusive_min)
      || (lower === field.exclusiveMinimum);
    const upperOpen = upper === field.exclusiveMaximum;
    if (lower > upper || (lower === upper && (lowerOpen || upperOpen)))
      return [`${rule.path} runtime and public numeric ranges do not intersect`];
    let candidates: unknown[];
    if (field.enum) candidates = field.enum;
    else if (field.type === 'integer' || (typeof field.multipleOf === 'number'
      && Number.isFinite(field.multipleOf) && field.multipleOf > 0)) {
      const step = field.type === 'integer' ? 1 : field.multipleOf!;
      const first = Math.ceil(lower / step) * step;
      candidates = [first === lower && lowerOpen ? first + step : first];
    } else candidates = [lower === upper ? lower : lower + (upper - lower) / 2];
    return candidates.some(value => typeof value === 'number'
      && value >= lower && (value > lower || !lowerOpen)
      && value <= upper && (value < upper || !upperOpen)
      && validate(value, field, rule.path).length === 0)
      ? [] : [`${rule.path} has no valid shared numeric value in the public schema`];
  }
  return [`${rule.path} uses an unsupported requirement operator ${rule.operator}`];
}

/** Catch contradictory *runtime* correction requests, independently of schema
 * compatibility. Compare only typed requirements for the exact same field;
 * prose, different array elements and artistic decisions are not inferred. */
export function contradictoryTransitionRequirements(
  requirements: Array<Pick<TransitionRequirement, 'path' | 'operator' | 'expected'>>,
): Array<{ path: string; first: number; second: number; reason: string }> {
  const contradictions: Array<{ path: string; first: number; second: number; reason: string }> = [];
  const choices = (rule: typeof requirements[number]): unknown[] | undefined =>
    rule.operator === 'equals' ? [rule.expected]
      : rule.operator === 'one-of' && Array.isArray(rule.expected) ? rule.expected : undefined;
  const permits = (rule: typeof requirements[number], value: unknown): boolean => {
    if (rule.operator === 'equals') return isDeepStrictEqual(value, rule.expected);
    if (rule.operator === 'one-of') return Array.isArray(rule.expected)
      && rule.expected.some(candidate => isDeepStrictEqual(candidate, value));
    if (rule.operator === 'absent') return value === undefined;
    if (rule.operator === 'nonempty-string') return typeof value === 'string' && !!value.trim();
    if (rule.operator === 'number-range') {
      const range = rule.expected as { min: number; max: number; exclusive_min?: boolean };
      return typeof value === 'number' && Number.isFinite(value)
        && (range.exclusive_min ? value > range.min : value >= range.min) && value <= range.max;
    }
    return true; // unknown relationship: do not infer a contradiction
  };
  for (let i = 0; i < requirements.length; i++) {
    const a = requirements[i];
    if (!a.path || !['equals', 'one-of', 'absent', 'nonempty-string', 'number-range'].includes(a.operator)) continue;
    for (let j = i + 1; j < requirements.length; j++) {
      const b = requirements[j];
      if (a.path !== b.path || !['equals', 'one-of', 'absent', 'nonempty-string', 'number-range'].includes(b.operator)) continue;
      const aa = choices(a); const bb = choices(b);
      let impossible = false;
      if (aa) impossible = !aa.some(value => permits(b, value));
      else if (bb) impossible = !bb.some(value => permits(a, value));
      else if (a.operator === 'absent' && ['nonempty-string', 'number-range'].includes(b.operator)
        || b.operator === 'absent' && ['nonempty-string', 'number-range'].includes(a.operator)) impossible = true;
      else if (a.operator === 'number-range' && b.operator === 'number-range') {
        const ra = a.expected as { min: number; max: number; exclusive_min?: boolean };
        const rb = b.expected as { min: number; max: number; exclusive_min?: boolean };
        const lower = Math.max(ra.min, rb.min);
        const upper = Math.min(ra.max, rb.max);
        impossible = lower > upper || (lower === upper
          && (lower === ra.min && !!ra.exclusive_min || lower === rb.min && !!rb.exclusive_min));
      }
      if (impossible) contradictions.push({ path: a.path, first: i, second: j,
        reason: 'The same field has mutually exclusive typed runtime requirements.' });
    }
  }
  return contradictions;
}

export class TransitionRequirementsError extends Error {
  constructor(public readonly issues: TransitionIssue[]) {
    super(issues.map(issue => issue.message).join('\n'));
    this.name = 'TransitionRequirementsError';
  }
}
