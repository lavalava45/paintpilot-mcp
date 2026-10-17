import { AsyncLocalStorage } from 'node:async_hooks';

export interface ToolExecutionContext {
  /** MCP request cancellation is advisory and scoped to this invocation only. */
  mcpAbortSignal?: AbortSignal;
  /** Opaque, host-injected COS per-invocation token (MCP _meta only). */
  cosStopCallToken?: string;
  /** Host-proven conversation identity; never supplied in model tool arguments. */
  reviewContextId?: string;
  /** Absolute epoch deadline supplied by the controller/daemon. */
  deadlineAt?: number;
  /** Guard-owned logical operation id; absent for raw/direct MCP execution. */
  guardOperationId?: string;
  /**
   * Stable idempotency identity for the currently executing physical/nested
   * Photoshop command. Guard operations may contain multiple VisualMicroPlan
   * steps, so this must be more specific than guardOperationId when present.
   */
  stableCommandId?: string;
}

const storage = new AsyncLocalStorage<ToolExecutionContext>();

export function withToolExecutionContext<T>(context: ToolExecutionContext, run: () => Promise<T>): Promise<T> {
  return storage.run({ ...storage.getStore(), ...context }, run);
}

export function currentToolExecutionContext(): ToolExecutionContext | undefined {
  return storage.getStore();
}

/**
 * Returns the stable physical-command identity visible to a leaf Photoshop
 * tool. Direct Guard-owned single-tool dispatches fall back to the root Guard
 * operation id; nested VisualMicroPlan steps install a deterministic child id.
 */
export function currentStableCommandId(): string | undefined {
  const context = storage.getStore();
  return context?.stableCommandId ?? context?.guardOperationId;
}

/**
 * Execute one nested VisualMicroPlan/tool step under its own deterministic
 * stable command identity while preserving the root Guard operation id and the
 * shared logical deadline. Re-running the same step reuses the exact id; a
 * sibling step receives a different id.
 */
export function withToolExecutionStepContext<T>(stepId: string, run: () => Promise<T>): Promise<T> {
  const parent = storage.getStore();
  const rootId = parent?.guardOperationId?.trim();
  const normalizedStepId = stepId.trim();
  if (!rootId || !normalizedStepId) return run();
  const encodedStepId = encodeURIComponent(normalizedStepId);
  return storage.run(
    {
      ...parent,
      stableCommandId: `${rootId}:step:${encodedStepId}`,
    },
    run
  );
}

/**
 * Returns the maximum safe timeout for the next Photoshop-side operation.
 *
 * When a controller deadline exists it is authoritative across nested tool calls
 * (including VisualMicroPlan steps). A small reserve remains for result transport,
 * cleanup and durable journal writes. Without a controller deadline we preserve the
 * historical per-script timeout.
 */
export function executionTimeoutMs(requestedMs?: number, fallbackMs = 30_000, reserveMs = 350): number {
  // Prevent *new* UXP commands after a host cancellation that was actually
  // delivered. Commands already sent to Photoshop must still be reconciled.
  if (storage.getStore()?.mcpAbortSignal?.aborted) {
    throw new Error('mcp_request_cancelled_before_uxp_dispatch: command not sent; reconcile any earlier commands separately');
  }
  const requested = requestedMs === undefined ? undefined : Number(requestedMs);
  if (requested !== undefined && (!Number.isFinite(requested) || requested <= 0)) {
    throw new Error('Invalid script timeout');
  }

  const deadlineAt = storage.getStore()?.deadlineAt;
  if (!deadlineAt) return Math.max(1, Math.floor(requested ?? fallbackMs));

  const remaining = Math.floor(deadlineAt - Date.now() - reserveMs);
  if (remaining <= 0) {
    throw new Error('Logical operation deadline exhausted before Photoshop script dispatch; script not executed.');
  }

  return Math.max(1, Math.min(Math.floor(requested ?? remaining), remaining));
}
