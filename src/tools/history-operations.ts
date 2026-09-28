import type { ToolResult } from '../core/tool-registry.js';
import type { PhotoshopBackendRouter } from '../platform/photoshop-backend.js';
import { invokeUxpOperation, invokeUxpUndo } from '../platform/uxp-bridge-client.js';
import { atomicFailureFromError } from './atomic-shared.js';

type Args = Record<string, unknown>;

function requestedSteps(args: Args): number {
  return (args.steps as number) || 1;
}

function documentTarget(args: Args): number | undefined {
  const value = args.document_id;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function message(text: string, isError = false): ToolResult {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text', text }],
  };
}

export async function runUndo(router: PhotoshopBackendRouter, args: Args): Promise<ToolResult> {
  const steps = requestedSteps(args);
  try {
    await router.backendFor('history.undo');
    const documentId = documentTarget(args);
    const outcome = await invokeUxpUndo({
      ...(documentId === undefined ? {} : { document_id: documentId }),
      steps,
    });
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_undo_failed');
    return message(
      `Undo successful (${steps} step${steps > 1 ? 's' : ''})\nResult: ${JSON.stringify(outcome.data)}`
    );
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

export async function runRedo(router: PhotoshopBackendRouter, args: Args): Promise<ToolResult> {
  const steps = requestedSteps(args);
  try {
    await router.backendFor('history.redo');
    const documentId = documentTarget(args);
    const outcome = await invokeUxpOperation(
      'redo',
      { steps, ...(documentId === undefined ? {} : { document_id: documentId }) },
      'uxp_redo_failed'
    );
    if (!outcome.ok || !outcome.data) throw new Error(outcome.error ?? 'uxp_redo_failed');
    return message(
      `Redo successful (${steps} step${steps > 1 ? 's' : ''})\nResult: ${JSON.stringify(outcome.data)}`
    );
  } catch (error) {
    return message(`Error redoing: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}

export async function runHistoryRead(router: PhotoshopBackendRouter): Promise<ToolResult> {
  try {
    const history = await router.readHistory();
    return message(`History States:\n${JSON.stringify(history, null, 2)}`);
  } catch (error) {
    return message(
      `Error getting history: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  }
}
