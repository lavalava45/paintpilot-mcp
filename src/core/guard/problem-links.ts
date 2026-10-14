/** Painter problem_id is task identity; these references are correction intents,
 * never evidence that a referenced defect was resolved. */
export function normalizeProblemLinks(
  single: unknown,
  multiple: unknown,
): string[] {
  if (single !== undefined && (typeof single !== 'string' || !single.trim()))
    throw new Error('addresses_problem_id must be a nonempty string');
  if (multiple !== undefined && (!Array.isArray(multiple) || multiple.length < 1 || multiple.length > 16
    || multiple.some(id => typeof id !== 'string' || !id.trim())))
    throw new Error('addresses_problem_ids must be an array of 1-16 nonempty defect IDs');
  const result = [...new Set([...(single === undefined ? [] : [single.trim()]),
    ...(Array.isArray(multiple) ? multiple.map((id: string) => id.trim()) : [])])];
  if (result.length > 16) throw new Error('addresses_problem_ids must contain at most 16 distinct defect IDs including addresses_problem_id');
  return result;
}

export function requestProblemLinks(request: any): string[] {
  const args = request?.args && typeof request.args === 'object' ? request.args : {};
  return [...new Set([
    ...normalizeProblemLinks(request?.addresses_problem_id, request?.addresses_problem_ids),
    ...normalizeProblemLinks(args.addresses_problem_id, args.addresses_problem_ids),
  ])];
}

export const ADDRESSES_PROBLEM_IDS_SCHEMA = {
  type: 'array', minItems: 1, maxItems: 16, uniqueItems: true,
  items: { type: 'string', minLength: 1 },
  description: 'Explicit IDs of additional unresolved defects addressed by this pass. Includes Critic/previous-operation and Director/global defects; does not change problem_id, prove relevance, or resolve any defect. Compatible with addresses_problem_id.',
} as const;
