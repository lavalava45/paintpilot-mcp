import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoshopConnection } from '../src/platform/connection.js';
import type { PhotoshopBackendRouter, PhotoshopPrimitive } from '../src/platform/photoshop-backend.js';

const bridge = vi.hoisted(() => ({ operation: vi.fn() }));

vi.mock('../src/platform/uxp-bridge-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/uxp-bridge-client.js')>();
  return { ...actual, invokeUxpOperation: bridge.operation };
});

import { createFilterTools } from '../src/tools/filter-tools.js';
import { createAdjustmentTools } from '../src/tools/adjustment-tools.js';
import { createColorAdjustmentTools } from '../src/tools/color-adjustment-tools.js';

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === 'text')?.text ?? '';
}

function jsonOf(result: { content?: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  return JSON.parse(textOf(result)) as Record<string, unknown>;
}

function fixture() {
  const executeScript = vi.fn(async () => {
    throw new Error('legacy_dispatch_must_not_run');
  });
  const connection = { executeScript } as unknown as PhotoshopConnection;
  const backendFor = vi.fn(async (_primitive: PhotoshopPrimitive) => ({ kind: 'uxp' as const }));
  const router = { backendFor } as unknown as PhotoshopBackendRouter;
  return { connection, router, executeScript, backendFor };
}

beforeEach(() => {
  vi.clearAllMocks();
  bridge.operation.mockImplementation(async (action: string, payload: Record<string, unknown>) => ({
    ok: true,
    data: {
      action,
      ...payload,
      ...(action.startsWith('adjust_') || action.startsWith('apply_') ? { layer_name: `${action} layer` } : {}),
      ...(action === 'apply_high_pass' ? { filter: 'high_pass' } : {}),
      ...(action === 'apply_smart_blur' ? { filter: 'smart_blur' } : {}),
      ...(action === 'adjust_curves' ? { layer_name: 'Curves 1' } : {}),
    },
  }));
});

describe('filter + adjustment + color-adjustment public contract', () => {
  it('keeps all 18 public tools in their established family order', () => {
    const { connection, router } = fixture();
    expect(createFilterTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_apply_gaussian_blur',
      'photoshop_apply_sharpen',
      'photoshop_apply_noise',
      'photoshop_apply_motion_blur',
      'photoshop_apply_high_pass',
      'photoshop_apply_smart_blur',
    ]);
    expect(createAdjustmentTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_adjust_brightness_contrast',
      'photoshop_adjust_hue_saturation',
      'photoshop_auto_levels',
      'photoshop_auto_contrast',
      'photoshop_adjust_curves',
      'photoshop_desaturate',
      'photoshop_invert',
    ]);
    expect(createColorAdjustmentTools(connection, router).map((item) => item.tool.name)).toEqual([
      'photoshop_apply_lut',
      'photoshop_adjust_vibrance',
      'photoshop_adjust_exposure',
      'photoshop_apply_photo_filter',
      'photoshop_apply_gradient_map',
    ]);
  });

  it('preserves basic filter payloads and plain-text confirmations', async () => {
    const { connection, router, executeScript, backendFor } = fixture();
    const tools = createFilterTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(textOf(await byName('photoshop_apply_gaussian_blur').handler({ radius: 4.5, document_id: 42 })))
      .toBe('Gaussian Blur applied with radius 4.5px');
    expect(textOf(await byName('photoshop_apply_sharpen').handler({ amount: 120, radius: 1.4, document_id: 42 })))
      .toBe('Unsharp Mask applied: amount 120%, radius 1.4px, threshold 0');
    expect(textOf(await byName('photoshop_apply_noise').handler({ amount: 12, distribution: 'GAUSSIAN', monochromatic: true, document_id: 42 })))
      .toBe('Add Noise applied: 12% (GAUSSIAN, monochromatic)');
    expect(textOf(await byName('photoshop_apply_motion_blur').handler({ angle: 30, radius: 20, document_id: 42 })))
      .toBe('Motion Blur applied: angle 30°, radius 20px');

    expect(bridge.operation.mock.calls.slice(0, 4)).toEqual([
      ['apply_gaussian_blur', { radius: 4.5 }, 'uxp_apply_gaussian_blur_failed'],
      ['apply_sharpen', { amount: 120, radius: 1.4, threshold: 0 }, 'uxp_apply_sharpen_failed'],
      ['apply_noise', { amount: 12, distribution: 'GAUSSIAN', monochromatic: true }, 'uxp_apply_noise_failed'],
      ['apply_motion_blur', { angle: 30, radius: 20 }, 'uxp_apply_motion_blur_failed'],
    ]);
    expect(backendFor.mock.calls.map(([primitive]) => primitive)).toEqual([
      'filter.gaussian_blur', 'filter.sharpen', 'filter.noise', 'filter.motion_blur',
    ]);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves high-pass/smart-blur validation, defaults and atomic result contours', async () => {
    const { connection, router } = fixture();
    const tools = createFilterTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(jsonOf(await byName('photoshop_apply_high_pass').handler({ radius: 2.5 }))).toMatchObject({
      ok: true,
      summary: 'High Pass filter applied (radius 2.5px)',
      details: { filter: 'high_pass', radius: 2.5 },
    });
    expect(jsonOf(await byName('photoshop_apply_high_pass').handler({ radius: 300 }))).toMatchObject({ ok: false });

    expect(jsonOf(await byName('photoshop_apply_smart_blur').handler({ radius: 4, threshold: 8, mode: 'INVALID', quality: 'INVALID' })))
      .toMatchObject({
        ok: true,
        summary: 'Smart Blur applied (radius 4px, threshold 8)',
        details: { filter: 'smart_blur', radius: 4, threshold: 8, mode: 'NORMAL', quality: 'MEDIUM' },
      });
    expect(bridge.operation).toHaveBeenLastCalledWith(
      'apply_smart_blur',
      { radius: 4, threshold: 8, mode: 'NORMAL', quality: 'MEDIUM' },
      'uxp_apply_smart_blur_failed'
    );
  });

  it('preserves direct adjustment actions, document pin payloads and text results', async () => {
    const { connection, router, executeScript } = fixture();
    const tools = createAdjustmentTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(textOf(await byName('photoshop_adjust_brightness_contrast').handler({ brightness: 12, contrast: -8, document_id: 42 })))
      .toBe('Brightness/Contrast adjusted: brightness 12, contrast -8');
    expect(textOf(await byName('photoshop_adjust_hue_saturation').handler({ hue: 10, saturation: 20, lightness: -5, document_id: 42 })))
      .toBe('Hue/Saturation adjusted: hue 10, saturation 20, lightness -5');
    expect(textOf(await byName('photoshop_auto_levels').handler({ document_id: 42 }))).toBe('Auto Levels applied');
    expect(textOf(await byName('photoshop_auto_contrast').handler({ document_id: 42 }))).toBe('Auto Contrast applied');
    expect(textOf(await byName('photoshop_desaturate').handler({ document_id: 42 }))).toBe('Layer desaturated (converted to grayscale)');
    expect(textOf(await byName('photoshop_invert').handler({ document_id: 42 }))).toBe('Colors inverted');

    expect(bridge.operation.mock.calls).toEqual([
      ['adjust_brightness_contrast', { brightness: 12, contrast: -8, document_id: 42 }, 'uxp_adjust_brightness_contrast_failed'],
      ['adjust_hue_saturation', { hue: 10, saturation: 20, lightness: -5, document_id: 42 }, 'uxp_adjust_hue_saturation_failed'],
      ['auto_levels', { document_id: 42 }, 'uxp_auto_levels_failed'],
      ['auto_contrast', { document_id: 42 }, 'uxp_auto_contrast_failed'],
      ['desaturate', { document_id: 42 }, 'uxp_desaturate_failed'],
      ['invert', { document_id: 42 }, 'uxp_invert_failed'],
    ]);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('preserves Curves preset normalization and atomic payload/result', async () => {
    const { connection, router } = fixture();
    const curves = createAdjustmentTools(connection, router)
      .find((item) => item.tool.name === 'photoshop_adjust_curves')!;

    expect(jsonOf(await curves.handler({ preset: 'invalid', document_id: 42 }))).toMatchObject({
      ok: true,
      summary: 'Curves adjustment layer created (auto_tone)',
      details: { layer_name: 'Curves 1', preset: 'auto_tone', document_id: 42 },
    });
    expect(bridge.operation).toHaveBeenCalledWith(
      'adjust_curves',
      { preset: 'auto_tone', document_id: 42 },
      'uxp_adjust_curves_failed'
    );
  });

  it('preserves color-adjustment validation, clamping/defaults and atomic results', async () => {
    const { connection, router, executeScript } = fixture();
    const tools = createColorAdjustmentTools(connection, router);
    const byName = (name: string) => tools.find((item) => item.tool.name === name)!;

    expect(jsonOf(await byName('photoshop_apply_lut').handler({ lut: '  Crisp_Warm.3dl  ', document_id: 42 }))).toMatchObject({
      ok: true,
      summary: 'Color Lookup adjustment layer created (Crisp_Warm.3dl)',
      details: { lut: 'Crisp_Warm.3dl', document_id: 42 },
    });
    expect(jsonOf(await byName('photoshop_apply_lut').handler({ lut: '   ' }))).toMatchObject({ ok: false });

    expect(jsonOf(await byName('photoshop_adjust_vibrance').handler({ vibrance: 999, saturation: -999, document_id: 42 }))).toMatchObject({
      ok: true,
      summary: 'Vibrance adjustment layer created (vibrance 100, saturation -100)',
      details: { vibrance: 100, saturation: -100, document_id: 42 },
    });
    expect(jsonOf(await byName('photoshop_adjust_exposure').handler({ document_id: 42 }))).toMatchObject({
      ok: true,
      summary: 'Exposure adjustment layer created (0.5 stops)',
      details: { exposure: 0.5, offset: 0, gamma: 1, document_id: 42 },
    });
    expect(jsonOf(await byName('photoshop_apply_photo_filter').handler({ red: -1, green: 300, density: 140, preserve_luminosity: false, document_id: 42 })))
      .toMatchObject({
        ok: true,
        summary: 'Photo Filter adjustment layer created (density 100%)',
        details: { red: 0, green: 255, blue: 0, density: 100, preserve_luminosity: false, document_id: 42 },
      });
    expect(jsonOf(await byName('photoshop_apply_gradient_map').handler({ reverse: true, document_id: 42 }))).toMatchObject({
      ok: true,
      summary: 'Gradient Map adjustment layer created (reversed)',
      details: { reverse: true, document_id: 42 },
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('fails closed on UXP errors without legacy replay', async () => {
    bridge.operation.mockResolvedValue({ ok: false, error: 'uxp_failed_after_dispatch' });
    const { connection, router, executeScript } = fixture();
    const filter = createFilterTools(connection, router)[0]!;
    const adjustment = createAdjustmentTools(connection, router)[0]!;
    const color = createColorAdjustmentTools(connection, router)[0]!;

    expect((await filter.handler({ radius: 2 })).isError).toBe(true);
    expect((await adjustment.handler({ brightness: 1, contrast: 2 })).isError).toBe(true);
    expect((await color.handler({ lut: 'Crisp_Warm.3dl' })).isError).toBe(true);
    expect(executeScript).not.toHaveBeenCalled();
  });
});
