import { VISUAL_MICROPLAN_MUTATION_TOOLS } from '../visual-microplan.js';
import type { GuardCycleCompileViolation } from './cycle-compiler.js';

function reject(code: string, message: string): GuardCycleCompileViolation {
  return { scope: 'next_operation', code, message };
}

/** The caller supplies already-normalized request/goal/restore identifiers. */
export function collectCompactRequiredEnvelopeViolations(input: {
  requestKey?: string;
  goal?: string;
  restoreAnchorOperationId?: string;
  actionCount: number;
}): GuardCycleCompileViolation[] {
  const violations: GuardCycleCompileViolation[] = [];
  if (!input.requestKey) violations.push(reject('compact_request_key_required', 'next_pass.request_key must be a non-empty string'));
  if (!input.goal) violations.push(reject('compact_goal_required', 'next_pass.goal must be a non-empty string'));
  if (!input.restoreAnchorOperationId && !input.actionCount)
    violations.push(reject('compact_actions_required', 'next_pass.actions must contain executable actions'));
  return violations;
}

/** Bootstrap's document rule is nonterminal; the non-bootstrap rule is terminal. */
export function collectCompactDocumentGateViolations(documentId: unknown, bootstrap: boolean): GuardCycleCompileViolation[] {
  if (!bootstrap && (!Number.isSafeInteger(documentId) || Number(documentId) <= 0))
    return [reject('compact_pass_document_required', 'next_pass.document_id is required for every non-bootstrap Photoshop pass')];
  if (bootstrap && documentId !== undefined)
    return [reject('compact_bootstrap_document_forbidden', 'next_pass.document_id must be omitted for photoshop_create_document/photoshop_open_image because the target document does not exist yet')];
  return [];
}

/** Multiple direct operations cannot share a single durable Guard operation. */
export function collectCompactDirectBundleViolations(actions: readonly Record<string, unknown>[]): GuardCycleCompileViolation[] {
  const visualMicroplanMutationCount = actions.filter(step =>
    VISUAL_MICROPLAN_MUTATION_TOOLS.has(typeof step.tool === 'string' ? step.tool.trim() : '')
  ).length;
  if (actions.length > 1 && visualMicroplanMutationCount === 0)
    return [reject('compact_pass_multiple_direct_operations',
      'next_pass cannot bundle multiple direct Photoshop operations into one durable Guard operation; submit each direct operation as its own guarded pass (for example, save PSD and PNG in two sequential passes)')];
  return [];
}
