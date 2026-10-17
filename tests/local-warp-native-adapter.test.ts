import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const moduleObject: { exports: Record<string, any> } = { exports: {} };
runInNewContext(readFileSync(new URL('../uxp-plugin/local-warp-native-adapter.js', import.meta.url), 'utf8'),
  { module: moduleObject, Uint8Array, Number, Array, Math, Error });
const { performLocalWarpNativeExperiment } = moduleObject.exports;
const width = 8, height = 8, roi = { left: 2, top: 2, right: 6, bottom: 6 };
function setup() {
  let pixels = new Uint8Array(width * height * 4).fill(90);
  let original = pixels.slice();
  const calls: string[] = [];
  let badRead = false;
  const image = (data: Uint8Array) => ({ width, height, components: 4, componentSize: 8,
    hasAlpha: true, colorSpace: 'RGB', colorProfile: 'sRGB IEC61966-2.1',
    getData: async () => data.slice(), dispose() {} });
  const imaging = {
    async getPixels() { calls.push('read'); return { imageData: image(pixels), level: 0,
      sourceBounds: badRead ? { ...roi } : { left: 0, top: 0, right: width, bottom: height } }; },
    async createImageDataFromBuffer(buffer: Uint8Array) { calls.push('create'); return image(buffer); },
    async putPixels({ imageData, replace, targetBounds }: any) {
      expect(replace).toBe(true);
      expect(targetBounds).toEqual({ left: 0, top: 0 });
      calls.push('write'); pixels = await imageData.getData();
    },
  };
  const hostControl = {
    async suspendHistory() { calls.push('suspend'); original = pixels.slice(); return 7; },
    async resumeHistory(_: number, commit: boolean) {
      calls.push(commit ? 'commit' : 'rollback');
      if (!commit) pixels = original.slice();
    },
  };
  const options = { imaging, executionContext: { hostControl },
    documentId: 5, layerId: 9, width, height, roi, protectedRects: [],
    disposableProof: 'explicit-disposable-photoshop-document',
    verifyAuthority: async () => { calls.push('authority'); },
    verifyHistoryRollback: async () => { calls.push('verifyRollback'); },
    digest: async (b: Uint8Array) => [...b].join(','),
    transform: async (input: Uint8Array) => {
      const copy = input.slice(); copy[(3 * width + 3) * 4] = 120;
      return { pixels: copy, changedPixels: 1, changedBounds: { left: 3, top: 3, right: 4, bottom: 4 } };
    },
  };
  return { options, calls, imaging, setBadRead: () => { badRead = true; }, getPixels: () => pixels };
}
describe('unregistered native warp adapter', () => {
  it('fails closed without explicit capability, before reading or writing', async () => {
    const f = setup();
    await expect(performLocalWarpNativeExperiment({ ...f.options, disposableProof: undefined }))
      .rejects.toThrow('local_warp_native_capability_closed');
    expect(f.calls).toEqual([]);
  });
  it('rejects trimmed image reads without writing', async () => {
    const f = setup(); f.setBadRead();
    await expect(performLocalWarpNativeExperiment(f.options)).rejects.toThrow('exact_rgba_unavailable');
    expect(f.calls).not.toContain('write');
  });
  it('commits only verified full-layer output', async () => {
    const f = setup();
    const result = await performLocalWarpNativeExperiment(f.options);
    expect(result.changedPixels).toBe(1);
    expect(f.calls).toContain('commit');
    expect(f.getPixels()[(3 * width + 3) * 4]).toBe(120);
  });
  it('rolls back and checks original digest after post-write mismatch', async () => {
    const f = setup();
    const originalPut = f.imaging.putPixels;
    f.imaging.putPixels = async (args: any) => {
      await originalPut(args);
      f.getPixels()[0] = 1;
    };
    await expect(performLocalWarpNativeExperiment(f.options)).rejects.toThrow('post_digest_mismatch');
    expect(f.calls).toContain('rollback');
    expect(f.calls).toContain('verifyRollback');
    expect(f.getPixels()[0]).toBe(90);
  });
  it('rejects changes outside ROI before history suspension', async () => {
    const f = setup();
    f.options.transform = async input => {
      const pixels = input.slice(); pixels[0] = 0;
      return { pixels, changedPixels: 1, changedBounds: { left: 0, top: 0, right: 1, bottom: 1 } };
    };
    await expect(performLocalWarpNativeExperiment(f.options)).rejects.toThrow('change_escaped_bounds');
    expect(f.calls).not.toContain('suspend');
  });
});
