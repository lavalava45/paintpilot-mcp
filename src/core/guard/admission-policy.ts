/**
 * The *origin and authority* of a finding determine whether it can stop a
 * Photoshop operation. Its diagnostic code, artistic style, profile, stage,
 * material or preferred method never confer execution authority.
 *
 * Artistic review describes the image and suggests a next decision. Only a
 * real executor/document invariant or a user-authored restriction may veto
 * an otherwise technically valid operation.
 */
export type PainterFindingAuthority = 'artistic-review' | 'execution-integrity' | 'user-constraint';
export type PainterAdmission = 'WARN' | 'BLOCK';

export interface PainterFinding {
  authority: PainterFindingAuthority;
  message: string;
}

export function classifyPainterFinding(finding: PainterFinding): PainterAdmission {
  return finding.authority === 'artistic-review' ? 'WARN' : 'BLOCK';
}

/** Artistic advice remains nonblocking even without a collector. */
export function reportArtisticAdvice(message: string, advisorySink?: string[]): void {
  if (advisorySink && !advisorySink.includes(message)) advisorySink.push(message);
}

/** A narrow, explicitly trusted execution or user-constraint gate. */
export function enforcePainterFinding(finding: PainterFinding): void {
  if (classifyPainterFinding(finding) === 'BLOCK') throw new Error(finding.message);
  reportArtisticAdvice(finding.message);
}

/** Distinguish advisory failures in artistic review code from runtime defects. */
export class ArtisticReviewNotice extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtisticReviewNotice';
  }
}
