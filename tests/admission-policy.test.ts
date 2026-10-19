import { describe, expect, it } from 'vitest';
import {
  ArtisticReviewNotice, classifyPainterFinding, enforcePainterFinding, reportArtisticAdvice,
} from '../src/core/guard/admission-policy.js';

describe('Typed admission authority, independent of style and error-code inventories', () => {
  it('classifies by originating authority, never by diagnostic text or painting profile', () => {
    for (const message of [
      'invented_style_of_2075: unknown method', 'scene_foundation_required: draw clouds',
      'document_identity_unverified: this is just an aesthetic metaphor',
    ]) {
      expect(classifyPainterFinding({ authority: 'artistic-review', message })).toBe('WARN');
      expect(classifyPainterFinding({ authority: 'execution-integrity', message })).toBe('BLOCK');
      expect(classifyPainterFinding({ authority: 'user-constraint', message })).toBe('BLOCK');
    }
  });

  it('does not block artistic remarks, including previously unseen styles, without a collector', () => {
    const warnings: string[] = [];
    reportArtisticAdvice('free-form expressionist watercolor method', warnings);
    reportArtisticAdvice('free-form expressionist watercolor method', warnings);
    reportArtisticAdvice('photographic perspective is intentionally distorted', warnings);
    expect(warnings).toHaveLength(2);
    expect(() => reportArtisticAdvice('never before seen invented method')).not.toThrow();
    expect(() => enforcePainterFinding({ authority: 'artistic-review', message: 'unexpected artistic phrase' })).not.toThrow();
  });

  it('fails closed for true execution and user-authorized constraints regardless of wording', () => {
    expect(() => enforcePainterFinding({ authority: 'execution-integrity', message: 'wrong Photoshop owner' })).toThrow(/wrong Photoshop owner/);
    expect(() => enforcePainterFinding({ authority: 'user-constraint', message: 'preserve protected layer' })).toThrow(/protected layer/);
    expect(new ArtisticReviewNotice('invented creative finding')).toBeInstanceOf(ArtisticReviewNotice);
  });
});
