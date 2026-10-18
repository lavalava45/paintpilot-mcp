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
  properties?: Record<string, TransitionFieldSchema>;
  items?: TransitionFieldSchema;
  required?: string[];
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
  if (rule.operator === 'one-of')
    return (rule.expected as unknown[]).flatMap(value => validate(value, field, rule.path));
  if (['equals', 'contains-bounds'].includes(rule.operator)) return validate(rule.expected, field, rule.path);
  if (rule.operator === 'includes') return !field.items ? [`${rule.path} has no array item schema`]
    : (rule.expected as unknown[]).flatMap(value => validate(value, field.items!, rule.path + '[]'));
  if (rule.operator === 'nonempty-string') return validate('x', field, rule.path);
  if (rule.operator === 'number-range') {
    const range = rule.expected as { min: number; max: number; exclusive_min?: boolean };
    const sample = (range.min + range.max) / 2;
    const lower = field.exclusiveMinimum ?? field.minimum ?? -Infinity;
    const upper = field.exclusiveMaximum ?? field.maximum ?? Infinity;
    const errors = validate(sample, field, rule.path);
    if (lower > range.min || upper < range.max
      || (field.exclusiveMinimum === range.min && !range.exclusive_min)
      || field.exclusiveMaximum === range.max)
      errors.push(`${rule.path} runtime range exceeds the published numeric bounds`);
    return errors;
  }
  return [`${rule.path} uses an unsupported requirement operator ${rule.operator}`];
}

export class TransitionRequirementsError extends Error {
  constructor(public readonly issues: TransitionIssue[]) {
    super(issues.map(issue => issue.message).join('\n'));
    this.name = 'TransitionRequirementsError';
  }
}
