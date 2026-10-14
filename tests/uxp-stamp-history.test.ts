import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8')
  .replace(/\npollLoop\(\);\s*$/, '\n');

function stampHarness(unreadable = false, selectedName = 'Organic Motif Stamp', readbackName?: string, styleReadback: 'correct' | 'wrong' | 'missing' | 'rounded-opacity' = 'correct', restoreFails = false, invalidTarget = false, restoreEvidence: 'correct' | 'wrong' | 'missing' = 'correct', toolReselectRestoresOldPreset = false) {
  let activeTool = 'moveTool';
  let activePreset = 'Old Brush';
  const events: string[] = [];
  const resumeHistory = vi.fn(async (_id: number, commit: boolean) => { events.push(`history:${commit}`); });
  const draw = vi.fn(async () => { if (toolReselectRestoresOldPreset) events.push(`paint:${activePreset}`); });
  const selectPreset = vi.fn(async () => {
    activeTool = 'paintbrushTool';
    activePreset = selectedName;
    return { ok: true, preset: selectedName };
  });
  const snapshot = vi.fn(async () => {
    if (unreadable || activeTool !== 'paintbrushTool') {
      throw new Error('brush_settings_unavailable_for_current_tool');
    }
    const settings = { size: 12, opacity: 100, flow: 100, angle: 0, flip_x: false, flip_y: false };
    return { preset: readbackName, settings, observed_fields: Object.keys(settings) };
  });
  const batchPlay = vi.fn(async (descriptors: any[]) => descriptors.map(descriptor => {
    if (descriptor?._obj === 'select' && descriptor?._target?.[0]?._ref === 'paintbrushTool') {
      if (toolReselectRestoresOldPreset && activeTool === 'paintbrushTool') activePreset = 'Old Brush';
      activeTool = 'paintbrushTool';
    }
    return {};
  }));
  const harness = {
    target: {
      doc: { id: 42, pathItems: { add: vi.fn(async () => ({})) } },
      targetLayerId: 7, targetDescriptor: { name: 'Motifs' }, originalLayerId: 7, resolution: 72,
    },
    snapshot,
    draw,
    selectPreset,
    prepare: vi.fn(async () => {
      if (invalidTarget) throw new Error('document_not_active: pinned document is not active');
      return harness.target;
    }),
    apply: async (settings: Record<string, unknown>, options?: { activateBrushTool?: boolean }) => {
      if (toolReselectRestoresOldPreset && options?.activateBrushTool !== false) activePreset = 'Old Brush';
      events.push(`brush:${settings.size}`);
      if (restoreFails && settings.size === 12) throw new Error('native_restore_failed');
      const restoring = settings.size === 12;
      return {
        settings: restoring && restoreEvidence === 'wrong' ? { ...settings, size: 28 }
          : styleReadback === 'wrong' ? { ...settings, size: 12 }
          : styleReadback === 'rounded-opacity' ? { ...settings, opacity: Math.round(Number(settings.opacity)) } : settings,
        observed_fields: restoring && restoreEvidence === 'missing' || !restoring && styleReadback === 'missing'
          ? [] : Object.keys(settings),
      };
    },
  };
  const api: any = runInNewContext(source + `
    preparePaintTarget = harness.prepare;
    snapshotBrushSettings = harness.snapshot;
    selectBrushPreset = harness.selectPreset;
    applyBrushSettingsModal = harness.apply;
    currentForegroundRgb = () => ({ red: 0, green: 0, blue: 0 });
    setForegroundColorModal = () => {};
    makeUxpDabSubPath = point => point;
    strokeNamedPathModal = harness.draw;
    deleteNamedPathModal = async () => {};
    ({ paintStampInstancesBatch });`, {
    harness,
    require: (name: string) => name === 'uxp'
      ? { entrypoints: { setup() {} }, storage: {} }
      : name === 'photoshop'
        ? {
          action: { batchPlay }, app: {}, constants: { ToolType: { BRUSH: 'brush' } },
          core: { executeAsModal: async (callback: (context: unknown) => Promise<unknown>) => callback({
            hostControl: { suspendHistory: async () => 19, resumeHistory },
          }) },
        }
        : {},
  });
  return { api, target: harness.target, resumeHistory, draw, snapshot, batchPlay, selectPreset, events };
}

describe('UXP stamp placement initialization', () => {
  const params = { preset_name: 'Organic Motif Stamp', instances: [{ instance_id: 'one', x: 50, y: 50, size: 12 }] };

  it('stamps the pinned layer after a confirmed native layer switch', async () => {
    const harness = stampHarness();
    harness.target.originalLayerId = 19;
    (harness.target.doc as any).activeLayers = [{ id: 19 }];
    harness.batchPlay.mockImplementation(async (descriptors: any[]) => {
      const selected = descriptors[0]?._target?.[0];
      if (selected?._ref === 'layer') (harness.target.doc as any).activeLayers = [{ id: selected._id }];
      return [{}];
    });
    const result = await harness.api.paintStampInstancesBatch(params);
    expect(result.placement_status).toBe('complete');
    expect(harness.draw).toHaveBeenCalledOnce();
  });

  it.each(['error', 'silent'] as const)('refuses stamp pixels when target layer selection is %s', async mode => {
    const harness = stampHarness();
    harness.target.originalLayerId = 19;
    (harness.target.doc as any).activeLayers = [{ id: 19 }];
    if (mode === 'error') harness.batchPlay.mockResolvedValueOnce([{ _obj: 'error', message: 'layer select failed' }]);
    await expect(harness.api.paintStampInstancesBatch(params)).rejects.toThrow('paint_target_layer_unverified');
    expect(harness.draw).not.toHaveBeenCalled();
    expect(harness.resumeHistory).toHaveBeenCalledWith(19, false);
  });

  it('rejects a wrong document before selecting or changing the global brush preset', async () => {
    const harness = stampHarness(false, 'Organic Motif Stamp', undefined, 'correct', false, true);
    await expect(harness.api.paintStampInstancesBatch(params)).rejects.toThrow('document_not_active');
    expect(harness.selectPreset).not.toHaveBeenCalled();
    expect(harness.draw).not.toHaveBeenCalled();
    expect(harness.resumeHistory).not.toHaveBeenCalled();
  });

  it('activates the brush before reading its options when a different tool was active', async () => {
    const harness = stampHarness();
    const result = await harness.api.paintStampInstancesBatch(params);
    expect(result.placement_status).toBe('complete');
    expect(harness.draw).toHaveBeenCalledTimes(1);
    expect(harness.resumeHistory).toHaveBeenCalledWith(19, true);
    expect(harness.snapshot).toHaveBeenCalledTimes(1);
    expect(harness.selectPreset).toHaveBeenCalledWith({ name: 'Organic Motif Stamp' });
  });

  it('does not reselect the brush tool after a verified stamp preset when Photoshop restores an older preset on tool activation', async () => {
    // On affected hosts, a redundant select(paintbrushTool) silently replaces
    // the just-selected preset. A nameless currentToolOptions cannot detect it.
    const harness = stampHarness(false, 'Organic Motif Stamp', undefined, 'correct', false, false, 'correct', true);
    const result = await harness.api.paintStampInstancesBatch({
      ...params, instances: [{ ...params.instances[0], size: 28 }],
    });
    expect(result.placement_status).toBe('complete');
    expect(harness.events).toContain('paint:Organic Motif Stamp');
    expect(harness.events).not.toContain('paint:Old Brush');
  });

  it('refuses to stamp with a different active preset before any pixels or History changes', async () => {
    const harness = stampHarness(false, 'Different Brush');
    await expect(harness.api.paintStampInstancesBatch(params)).rejects.toThrow('stamp_preset_unverified');
    expect(harness.draw).not.toHaveBeenCalled();
    expect(harness.resumeHistory).not.toHaveBeenCalled();
  });

  it('refuses a missing stamp preset identity before any pixels', async () => {
    const harness = stampHarness(false, '');
    await expect(harness.api.paintStampInstancesBatch(params)).rejects.toThrow('stamp_preset_unverified');
    expect(harness.draw).not.toHaveBeenCalled();
  });

  it('aborts suspended History if the brush changes after verified selection', async () => {
    const harness = stampHarness(false, 'Organic Motif Stamp', 'Different Brush');
    await expect(harness.api.paintStampInstancesBatch(params))
      .rejects.toThrow('stamp_preset_changed_after_selection');
    expect(harness.draw).not.toHaveBeenCalled();
    expect(harness.resumeHistory).toHaveBeenCalledWith(19, false);
  });

  it('always releases suspended History when brush initialization fails', async () => {
    const harness = stampHarness(true);
    await expect(harness.api.paintStampInstancesBatch(params))
      .rejects.toThrow('brush_settings_unavailable_for_current_tool');
    expect(harness.draw).not.toHaveBeenCalled();
    expect(harness.resumeHistory).toHaveBeenCalledOnce();
    expect(harness.resumeHistory).toHaveBeenCalledWith(19, false);
  });

  it('restores initial brush settings before committing the single stamp History state', async () => {
    const harness = stampHarness();
    const result = await harness.api.paintStampInstancesBatch({
      ...params, instances: [{ ...params.instances[0], size: 28 }],
    });
    expect(result.placement_status).toBe('complete');
    expect(harness.draw).toHaveBeenCalledOnce();
    expect(harness.events).toEqual(['brush:28', 'brush:12', 'history:true']);
  });

  it('aborts empty stamp History after a pre-stroke style rejection', async () => {
    const harness = stampHarness(false, 'Organic Motif Stamp', undefined, 'wrong');
    const result = await harness.api.paintStampInstancesBatch({
      ...params, instances: [{ ...params.instances[0], size: 28 }],
    });
    expect(result.placement_status).toBe('partial');
    expect(harness.draw).not.toHaveBeenCalled();
    expect(harness.events).toEqual(['brush:28', 'brush:12', 'history:false']);
  });

  it('retains uncertain History when a native stamp stroke throws after dispatch', async () => {
    const harness = stampHarness();
    harness.draw.mockRejectedValueOnce(new Error('native_stroke_uncertain'));
    const result = await harness.api.paintStampInstancesBatch({
      ...params, instances: [{ ...params.instances[0], size: 28 }],
    });
    expect(result.placement_status).toBe('partial');
    expect(result.failed_or_uncertain_instance.error).toContain('native_stroke_uncertain');
    expect(harness.events).toEqual(['brush:28', 'brush:12', 'history:true']);
  });

  it('reports failure to release suspended History instead of silently succeeding', async () => {
    const harness = stampHarness(true);
    harness.resumeHistory.mockRejectedValueOnce(new Error('native_history_resume_failed'));
    await expect(harness.api.paintStampInstancesBatch(params))
      .rejects.toThrow('native_history_resume_failed');
    expect(harness.resumeHistory).toHaveBeenCalledWith(19, false);
  });

  it('does not report a completed stamp when the original brush state could not be restored', async () => {
    const harness = stampHarness(false, 'Organic Motif Stamp', undefined, 'correct', true);
    await expect(harness.api.paintStampInstancesBatch({
      ...params, instances: [{ ...params.instances[0], size: 28 }],
    })).rejects.toThrow('stamp_state_restore_failed');
    expect(harness.draw).toHaveBeenCalledOnce();
    expect(harness.resumeHistory).toHaveBeenCalledWith(19, true);
    expect(harness.events).toEqual(['brush:28', 'brush:12', 'history:true']);
  });

  it.each(['wrong', 'missing'] as const)('rejects stamp success when native brush restoration readback is %s', async restoreEvidence => {
    const harness = stampHarness(false, 'Organic Motif Stamp', undefined, 'correct', false, false, restoreEvidence);
    await expect(harness.api.paintStampInstancesBatch({
      ...params, instances: [{ ...params.instances[0], size: 28 }],
    })).rejects.toThrow('stamp_state_restore_failed:brush:stamp_restore_style_unverified:size:native_readback_');
    expect(harness.draw).toHaveBeenCalledOnce();
    expect(harness.events).toEqual(['brush:28', 'brush:12', 'history:true']);
  });

  it.each(['wrong', 'missing'] as const)('does not stamp when the native size readback is %s', async styleReadback => {
    const harness = stampHarness(false, 'Organic Motif Stamp', undefined, styleReadback);
    const result = await harness.api.paintStampInstancesBatch({
      ...params, instances: [{ ...params.instances[0], size: 28 }],
    });
    expect(result.placement_status).toBe('partial');
    expect(result.completed_instances).toHaveLength(0);
    expect(result.failed_or_uncertain_instance).toMatchObject({
      instance_id: 'one', state: 'failed-or-uncertain', error: expect.stringContaining('stamp_style_unverified'),
    });
    expect(harness.draw).not.toHaveBeenCalled();
    expect(harness.resumeHistory).toHaveBeenCalledOnce();
    expect(harness.resumeHistory).toHaveBeenCalledWith(19, false);
  });

  it('accepts a fractional requested opacity when Photoshop confirms its native integer value', async () => {
    const harness = stampHarness(false, 'Organic Motif Stamp', undefined, 'rounded-opacity');
    const result = await harness.api.paintStampInstancesBatch({
      ...params, instances: [{ ...params.instances[0], opacity: 37.5 }],
    });
    expect(result.placement_status).toBe('complete');
    expect(harness.draw).toHaveBeenCalledOnce();
  });
});

describe('UXP foreground color setter verification', () => {
  function foregroundHarness(mode: 'ignored' | 'rounded') {
    let stored = { red: 0, green: 0, blue: 0 };
    class SolidColor {
      rgb = { red: 0, green: 0, blue: 0 };
    }
    const app = {
      SolidColor,
      get foregroundColor() { return { rgb: { ...stored } }; },
      set foregroundColor(value: { rgb: { red: number; green: number; blue: number } }) {
        if (mode !== 'ignored') {
          stored = {
            red: Math.round(value.rgb.red),
            green: Math.round(value.rgb.green),
            blue: Math.round(value.rgb.blue),
          };
        }
      },
    };
    return runInNewContext(source + '\n({ setForegroundColorModal });', {
      require: (name: string) => name === 'uxp'
        ? { entrypoints: { setup() {} }, storage: {} }
        : name === 'photoshop'
          ? { app, action: {}, core: {}, constants: {} }
          : {},
    }) as { setForegroundColorModal: (color: { red: number; green: number; blue: number }) => void };
  }

  it('rejects a silently ignored native foreground-color setter instead of painting in the old color', () => {
    const harness = foregroundHarness('ignored');
    expect(() => harness.setForegroundColorModal({ red: 120, green: 20, blue: 40 }))
      .toThrow('paint_color_unverified');
  });

  it('accepts native 8-bit rounding without falsely rejecting a correctly applied color', () => {
    const harness = foregroundHarness('rounded');
    expect(() => harness.setForegroundColorModal({ red: 37.4, green: 128.49, blue: 255 }))
      .not.toThrow();
  });
});
