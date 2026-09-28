import { describe, expect, it } from 'vitest';
import {
  currentStableCommandId,
  currentToolExecutionContext,
  executionTimeoutMs,
  withToolExecutionContext,
  withToolExecutionStepContext,
} from './execution-context.js';

describe('logical Photoshop execution deadline', () => {
  it('preserves the historical fallback without a logical deadline', () => {
    expect(executionTimeoutMs()).toBe(30_000);
    expect(executionTimeoutMs(1_234)).toBe(1_234);
  });

  it('clamps nested script timeouts to the remaining shared deadline', async () => {
    await withToolExecutionContext({ deadlineAt: Date.now() + 3_000 }, async () => {
      const inherited = executionTimeoutMs(undefined, 30_000, 0);
      expect(inherited).toBeGreaterThan(2_000);
      expect(inherited).toBeLessThanOrEqual(3_000);
      expect(executionTimeoutMs(500, 30_000, 0)).toBeLessThanOrEqual(500);
    });
  });

  it('fails before dispatch when the logical deadline is already exhausted', async () => {
    await withToolExecutionContext({ deadlineAt: Date.now() - 1 }, async () => {
      expect(() => executionTimeoutMs()).toThrow(/deadline exhausted.*not executed/i);
    });
  });

  it('derives a deterministic physical command id per nested Guard step while preserving the root operation id', async () => {
    await withToolExecutionContext({
      guardOperationId: 'guard-pass-24a',
      deadlineAt: Date.now() + 3_000,
    }, async () => {
      expect(currentStableCommandId()).toBe('guard-pass-24a');

      await withToolExecutionStepContext('select-brush', async () => {
        expect(currentToolExecutionContext()?.guardOperationId).toBe('guard-pass-24a');
        expect(currentStableCommandId()).toBe('guard-pass-24a:step:select-brush');
      });
      await withToolExecutionStepContext('set-brush', async () => {
        expect(currentStableCommandId()).toBe('guard-pass-24a:step:set-brush');
      });
      await withToolExecutionStepContext('select-brush', async () => {
        expect(currentStableCommandId()).toBe('guard-pass-24a:step:select-brush');
      });

      const ids: string[] = [];
      await withToolExecutionStepContext('paint', async () => {
        ids.push(`${currentStableCommandId()}:batch:0`);
      });
      await withToolExecutionStepContext('paint:batch:0', async () => {
        ids.push(String(currentStableCommandId()));
      });
      expect(ids[0]).toBe('guard-pass-24a:step:paint:batch:0');
      expect(ids[1]).toBe('guard-pass-24a:step:paint%3Abatch%3A0');
      expect(ids[0]).not.toBe(ids[1]);
    });
  });
});
