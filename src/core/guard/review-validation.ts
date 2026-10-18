import { TransitionRequirementsError, type TransitionRequirement } from '../transition-requirements.js';

/** Collect independent reviews after frame/identity prerequisites are verified. */
export interface FrameReviewIssue {
  path: string;
  code: string;
  message: string;
  operator?: TransitionRequirement['operator'];
  expected?: unknown;
  actual?: unknown;
}

export class FrameReviewValidationError extends Error {
  constructor(public readonly issues: FrameReviewIssue[]) {
    super(issues.map(issue => issue.message).join('\n'));
    this.name = 'FrameReviewValidationError';
  }
}

export function validateReviewSections(sections: Array<{
  key: string;
  path: string;
  validate: () => unknown;
}>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const issues: FrameReviewIssue[] = [];
  for (const section of sections) {
    try { values[section.key] = section.validate(); }
    catch (error) {
      if (error instanceof FrameReviewValidationError || error instanceof TransitionRequirementsError) issues.push(...error.issues);
      else {
        const message = error instanceof Error ? error.message : String(error);
        issues.push({ path: section.path,
          code: message.match(/^([a-z][a-z0-9_]+)(?=[: (])/)?.[1] ?? 'frame_review_invalid', message });
      }
    }
  }
  if (issues.length) throw new FrameReviewValidationError(issues);
  return values;
}
