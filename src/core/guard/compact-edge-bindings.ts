import { parseEdgeIntents } from '../edge-control.js';
import { VISUAL_MICROPLAN_MUTATION_TOOLS } from '../visual-microplan.js';
import type { GuardCycleCompileViolation } from './cycle-compiler.js';

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function violation(
  code: string,
  message: string,
  details?: Record<string, unknown>
): GuardCycleCompileViolation {
  return { scope: 'next_operation', code, message, ...(details ? { details } : {}) };
}

/**
 * Validate authored edge intent references without consulting runtime state.
 * Keep diagnostic order and payloads stable: callers append these violations
 * after action validation and before required-envelope validation.
 */
export function collectCompactEdgeBindingViolations(
  edges: unknown,
  actions: Array<Record<string, unknown>>
): {
  violations: GuardCycleCompileViolation[];
  edgeIntents: ReturnType<typeof parseEdgeIntents>;
  edgeIntentsValid: boolean;
} {
  const violations: GuardCycleCompileViolation[] = [];
  let edgeIntents: ReturnType<typeof parseEdgeIntents> = [];
  let edgeIntentsValid = true;
  try {
    edgeIntents = parseEdgeIntents(edges);
  } catch (error) {
    edgeIntentsValid = false;
    violations.push(violation(
      'compact_edge_intents_invalid',
      error instanceof Error ? error.message : String(error)
    ));
  }
  if (edgeIntentsValid) {
    const declaredEdgeIds = new Set(edgeIntents.map(intent => intent.boundaryId));
    const referencedEdgeIds = new Set<string>();
    actions.forEach((action, actionIndex) => {
      if (!VISUAL_MICROPLAN_MUTATION_TOOLS.has(text(action.tool) ?? '')) return;
      if (action.edge_boundary_ids === undefined) return;
      if (!Array.isArray(action.edge_boundary_ids)) {
        violations.push(violation(
          'compact_edge_boundary_ids_invalid',
          `next_pass.actions[${actionIndex}].edge_boundary_ids must be an array of declared boundary ids`,
          { action_index: actionIndex }
        ));
        return;
      }
      const boundIds: string[] = [];
      action.edge_boundary_ids.forEach((value, boundaryIndex) => {
        const boundaryId = text(value);
        if (!boundaryId) {
          violations.push(violation(
            'compact_edge_boundary_ids_invalid',
            `next_pass.actions[${actionIndex}].edge_boundary_ids[${boundaryIndex}] must be a non-empty string`,
            { action_index: actionIndex, boundary_index: boundaryIndex }
          ));
          return;
        }
        if (!declaredEdgeIds.has(boundaryId)) {
          violations.push(violation(
            'compact_edge_boundary_unknown',
            `next_pass.actions[${actionIndex}].edge_boundary_ids references undeclared boundary_id ${boundaryId}`,
            { action_index: actionIndex, boundary_id: boundaryId }
          ));
          return;
        }
        referencedEdgeIds.add(boundaryId);
        boundIds.push(boundaryId);
      });
      if (boundIds.length && !text(action.method_id)) {
        violations.push(violation(
          'compact_edge_method_required',
          `next_pass.actions[${actionIndex}] must declare method_id when edge_boundary_ids are present`,
          { action_index: actionIndex, boundary_ids: boundIds }
        ));
      }
    });
    for (const intent of edgeIntents) {
      if (!referencedEdgeIds.has(intent.boundaryId)) {
        violations.push(violation(
          'compact_edge_intent_unbound',
          `next_pass.edges boundary_id ${intent.boundaryId} must bind to at least one visual mutation through edge_boundary_ids`,
          { boundary_id: intent.boundaryId }
        ));
      }
    }
  }
  return { violations, edgeIntents, edgeIntentsValid };
}
