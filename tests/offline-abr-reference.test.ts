import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { compareTips, decode } = require('../scripts/offline-abr/reference.cjs');

const tip = (values: number[]) => ({ width: 2, height: 2, alpha: Uint8Array.from(values) });

describe('isolated offline ABR tip reference', () => {
  it('rejects wrong decoded shape even with identical geometric metadata', () => {
    const source = { ...tip([0, 255, 255, 0]), diameter: 50, hardness: 0, spacing: 25 };
    const wrong = { ...tip([255, 0, 0, 255]), diameter: 50, hardness: 0, spacing: 25 };
    expect(compareTips(source, wrong)).toEqual({ outcome: 'mismatch', reason: 'alpha_pixels_differ' });
  });
  it('retains uncertainty for missing, matching and similar/duplicate masks', () => {
    const a = tip([0, 255, 255, 0]);
    expect(compareTips(a, { alpha: null })).toMatchObject({ outcome: 'unknown' });
    expect(compareTips(a, tip([0, 255, 255, 1]))).toMatchObject({ outcome: 'mismatch' });
    expect(compareTips(a, tip([0, 255, 255, 0]))).toMatchObject({ outcome: 'consistent-only' });
    expect(compareTips(a, a, [tip([0, 255, 255, 0])])).toMatchObject({ outcome: 'unknown' });
  });
  it('does not accept an invalid ABR file', () => {
    expect(() => decode(import.meta.filename)).toThrow(/abr_parse_failed/);
  });
});
