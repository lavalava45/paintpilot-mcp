import { describe, expect, it } from 'vitest';
import { hostProgressPayload, operationNarrative, progressPayload } from '../src/core/guard/operation-narrative.js';

describe('E.17 truthful localized operation progress', () => {
  const base = { id: 'form-pass', tool: 'photoshop_apply_gaussian_blur', visual: true, phase: 'completed',
    summary: 'Technical goal', artistic_commentary: 'Смягчить дальние края, сохранив глубину.',
    purpose: 'Execute the requested bounded Photoshop pass.' };

  it('does not request image review for explicitly read-only painting-method or geometry queries', () => {
    for (const tool of ['photoshop_select_painting_method', 'photoshop_transform_landmarks']) {
      const narrative = operationNarrative({ id: 'read-query', tool, visual: false, phase: 'completed',
        summary: 'Inspect the available painting method or calculate geometry.' }, 'completed', { language: 'en' });
      expect(narrative.photoshop).toBe('operation completed');
      expect(narrative.next).toBe('use the result for the next task decision');
      expect(narrative.text).not.toMatch(/final frame|assess the image/);
    }
  });

  it.each(['ru', 'en'])('uses the selected %s language and artistic intent without inventing visual success', language => {
    const intent = language === 'ru' ? base.artistic_commentary : 'Soften distant edges while preserving depth.';
    const record = { ...base, artistic_commentary: intent };
    const narrative = operationNarrative(record, 'completed', { language });
    expect(narrative.now).toBe(intent);
    expect(narrative.text).not.toContain(base.summary);
    expect(narrative.text).not.toContain('Execute');
    expect(narrative.photoshop).toContain(language === 'ru' ? 'кадр не подтверждён' : 'frame is unconfirmed');
    expect(narrative.next).toContain(language === 'ru' ? 'оценить изображение' : 'assess the image');
    expect(progressPayload(record, 'completed', { language }).text).toBe(narrative.text);
    expect(hostProgressPayload(record, 'completed', { language }).text).toBe(narrative.text);
    if (language === 'en') expect(narrative.text).not.toMatch(/[А-Яа-яЁё]/);
  });

  it.each([
    [{ execution: 'not-executed' }, 'not-executed'],
    [{ failed: true }, 'failed'],
    [{ execution: 'partial' }, 'uncertain'],
    [{ phase: 'uncertain' }, 'uncertain'],
  ])('does not report completion for %j', (patch, expected) => {
    const narrative = operationNarrative({ ...base, ...patch }, 'completed', { language: 'en' });
    expect(narrative.state).toBe(expected);
    expect(narrative.photoshop).not.toContain('execution completed');
    if (expected === 'not-executed') expect(narrative.next).not.toMatch(/reconcile|inspect.*state/i);
    else expect(narrative.next).toContain('without replaying');
  });

  it('keeps observed shortcomings visible and avoids a second review after accepted closure', () => {
    const observed = 'Edges are softer, but the facade remains flat and unfinished.';
    const narrative = operationNarrative({ ...base, preview: { sha256: 'frame' },
      verdict: { disposition: 'accept', observed_change: observed } }, 'completed', { language: 'en' });
    expect(narrative.text).toContain(observed);
    expect(narrative.next).not.toMatch(/assess the image|accept, correct/);
    expect(narrative.next).toContain('remaining defects');
  });

  it('distinguishes pending rollback from a completed reversal', () => {
    const record = { ...base, verdict: { disposition: 'rollback', observed_change: 'The building disappeared.' } };
    expect(operationNarrative(record, 'completed', { language: 'en' }).next).toContain('complete bounded rollback');
    expect(operationNarrative({ ...record, rolled_back: true }, 'completed', { language: 'en' }).next).not.toContain('complete bounded rollback');
  });

  it('gives pre-dispatch progress its request identity and honors auto only when language is not selected', () => {
    const record = { ...base, id: undefined, request_key: 'fresh-pass' };
    expect(operationNarrative(record, 'starting', { language: 'auto' }).language).toBe('ru');
    expect(operationNarrative(record, 'starting', { language: 'en' }).language).toBe('en');
    expect(operationNarrative(record, 'starting').progress_id).toBe('photoshop-operation:fresh-pass');
  });
});
