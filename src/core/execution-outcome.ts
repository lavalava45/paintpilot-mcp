export const EXACT_EXECUTION_OUTCOME_PROTOCOL = 'photoshop.execution_exact_outcome.v1' as const;

export type ExactNotExecutedProof = Readonly<{
  protocol: typeof EXACT_EXECUTION_OUTCOME_PROTOCOL;
  dispatch: 'not-dispatched';
  side_effects: 'none';
  reason: string;
}>;

export class ExactNotExecutedError extends Error {
  readonly exactExecutionProof: ExactNotExecutedProof;

  constructor(message: string, reason: string) {
    super(message);
    this.name = 'ExactNotExecutedError';
    this.exactExecutionProof = {
      protocol: EXACT_EXECUTION_OUTCOME_PROTOCOL,
      dispatch: 'not-dispatched',
      side_effects: 'none',
      reason,
    };
  }
}

export function exactNotExecutedError(message: string, reason: string): ExactNotExecutedError {
  return new ExactNotExecutedError(message, reason);
}

export function exactNotExecutedResultFields(error: unknown): {
  execution: 'not-executed';
  execution_proof: ExactNotExecutedProof;
} | undefined {
  if (!(error instanceof ExactNotExecutedError)) return undefined;
  return {
    execution: 'not-executed',
    execution_proof: error.exactExecutionProof,
  };
}
