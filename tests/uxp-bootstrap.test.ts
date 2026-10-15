import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8')
  .replace(/\npollLoop\(\);\s*$/, '\n');

function bootstrapHarness(options: { deploymentMarker?: { source_sha256: string }; fetch?: (url: string) => Promise<any>; dropModalReturn?: boolean; dropDocumentReturn?: boolean; batchPlay?: (descriptors: any[]) => Promise<any[]>; notifications?: { add: (events: string[], callback: (event: string, descriptor: any) => void) => Promise<void>; remove: (events: string[], callback: (event: string, descriptor: any) => void) => Promise<void> } } = {}) {
  const calls: Array<{ kind: string; value?: unknown }> = [];
  let modalDepth = 0;
  const inertDispatcher = async () => ({ handled: false });
  const phaseDispatchers: Record<string, Record<string, typeof inertDispatcher>> = {
    './p1-document-ops': { tryHandleP1DocumentOperation: inertDispatcher },
    './p1-selection-ops': { tryHandleP1SelectionOperation: inertDispatcher },
    './p1-layer-ops': { tryHandleP1LayerOperation: inertDispatcher },
    './p2-adjustment-ops': { tryHandleP2AdjustmentOperation: inertDispatcher },
    './p2-filter-ops': { tryHandleP2FilterOperation: inertDispatcher },
    './p2-text-export-ops': { tryHandleP2TextExportOperation: inertDispatcher },
    './p3-utility-ops': { tryHandleP3UtilityOperation: inertDispatcher },
    './p3-document-data-ops': { tryHandleP3DocumentDataOperation: inertDispatcher },
    './p3-layer-advanced-ops': { tryHandleP3LayerAdvancedOperation: inertDispatcher },
  };
  const app: Record<string, any> = {
    activeDocument: null,
    documents: {
      length: 0,
      async add(options: Record<string, unknown>) {
        if (modalDepth < 1) throw new Error('document add must run inside executeAsModal');
        calls.push({ kind: 'add', value: options });
        const document = {
          id: 41,
          name: 'Untitled-1',
          width: options.width,
          height: options.height,
          resolution: options.resolution,
        };
        app.activeDocument = document;
        app.documents[0] = document;
        app.documents.length = 1;
        return options.dropDocumentReturn ? undefined : document;
      },
    },
    async open(entry: unknown) {
      if (modalDepth < 1) throw new Error('open must run inside executeAsModal');
      calls.push({ kind: 'open', value: entry });
      const document = {
        id: 84,
        name: 'source image.png',
        width: 1920,
        height: 1080,
        resolution: 72,
      };
      app.activeDocument = document;
      return document;
    },
  };
  const localFileSystem = {
    async getEntryWithUrl(url: string) {
      calls.push({ kind: 'getEntryWithUrl', value: url });
      return { isFile: true, nativePath: 'C:\\Users\\Test\\source image.png' };
    },
  };
  const core = {
    async executeAsModal(fn: () => Promise<unknown>, options: unknown) {
      calls.push({ kind: 'modal', value: options });
      modalDepth += 1;
      try {
        const result = await fn();
        return options.dropModalReturn ? undefined : result;
      } finally {
        modalDepth -= 1;
      }
    },
  };
  const functions = runInNewContext(
    source + '\n({ createDocumentMutation, openImageMutation, selectBrushPreset, normalizeBrushSettingsDescriptor, pollOnce })',
    {
      require: (name: string) => {
        if (name === './deployment-build' && options.deploymentMarker) return options.deploymentMarker;
        if (name === 'uxp') {
          return {
            entrypoints: { setup() {} },
            storage: { localFileSystem, types: { file: Symbol('file') } },
          };
        }
        if (name === 'photoshop') {
          return {
            action: { batchPlay: options.batchPlay ?? (async () => []),
              addNotificationListener: options.notifications?.add, removeNotificationListener: options.notifications?.remove },
            core,
            app,
            constants: {
              NewDocumentMode: {
                RGB: 'RGBColorMode',
                CMYK: 'CMYKColorMode',
                GRAYSCALE: 'GrayscaleMode',
              },
              DocumentFill: { WHITE: 'white' },
            },
          };
        }
        if (phaseDispatchers[name]) return phaseDispatchers[name];
        throw new Error(`Unexpected require: ${name}`);
      },
      fetch: options.fetch ?? (async () => ({ ok: true, status: 204 })),
      setTimeout,
      clearTimeout,
    }
  ) as {
    selectBrushPreset(params: Record<string, unknown>): Promise<Record<string, any>>;
    normalizeBrushSettingsDescriptor(descriptor: Record<string, unknown>): Record<string, any>;
    createDocumentMutation(params: Record<string, unknown>): Promise<Record<string, any>>;
    openImageMutation(params: Record<string, unknown>): Promise<Record<string, any>>;
    pollOnce(): Promise<boolean>;
  };
  return { ...functions, calls };
}

describe('UXP bootstrap mutations', () => {
  it('announces the loaded build identity without relabelling running UXP after a rebuild', async () => {
    const marker = { source_sha256: 'a'.repeat(64) };
    const urls: string[] = [];
    const harness = bootstrapHarness({ deploymentMarker: marker, fetch: async url => {
      urls.push(url); return { ok: true, status: 204 };
    } });
    marker.source_sha256 = 'b'.repeat(64);
    expect(await harness.pollOnce()).toBe(true);
    const poll = urls.find(url => url.includes('/poll?'))!;
    expect(new URL(poll).searchParams.get('deploymentSourceSha256')).toBe('a'.repeat(64));
  });
  it('does not certify absent native brush settings merely because their defaults match', () => {
    const harness = bootstrapHarness();
    const snapshot = harness.normalizeBrushSettingsDescriptor({
      currentToolOptions: { brush: { diameter: { _unit: 'pixelsUnit', _value: 16 } } },
    });
    expect(snapshot.settings).toMatchObject({ size: 16, hardness: 100, opacity: 100 });
    expect(snapshot.observed_fields).toContain('size');
    expect(snapshot.observed_fields).not.toContain('hardness');
    expect(snapshot.observed_fields).not.toContain('opacity');
    const nullReadback = harness.normalizeBrushSettingsDescriptor({
      currentToolOptions: { brush: { diameter: 16, hardness: null }, opacity: null },
    });
    expect(nullReadback.settings).toMatchObject({ hardness: 100, opacity: 100 });
    expect(nullReadback.observed_fields).not.toContain('hardness');
    expect(nullReadback.observed_fields).not.toContain('opacity');
    const complete = harness.normalizeBrushSettingsDescriptor({
      currentToolOptions: { brush: { diameter: 16, hardness: 100 }, opacity: 100 },
    });
    expect(complete.observed_fields).toEqual(expect.arrayContaining(['size', 'hardness', 'opacity']));
  });
  it('retains a confirmed brush-select event when a delayed tool-select event arrives afterwards', async () => {
    let listener: ((event: string, descriptor: any) => void) | undefined;
    const harness = bootstrapHarness({
      dropModalReturn: true,
      notifications: {
        add: async (_events, callback) => { listener = callback; },
        remove: async () => { listener = undefined; },
      },
      batchPlay: async descriptors => descriptors.map(descriptor => {
        if (descriptor._obj === 'select' && descriptor._target[0]._ref === 'brush') {
          listener?.('select', { _target: [{ _ref: 'brush', _name: 'Installed Dry Brush' }] });
          // Host notification callbacks need not arrive in the same order as
          // the tool-activation and preset-selection batch descriptors.
          listener?.('select', { _target: [{ _ref: 'paintbrushTool' }] });
        }
        return descriptor._obj === 'get'
          ? { currentToolOptions: { brush: { diameter: 16 } } }
          : {};
      }),
    });
    expect((await harness.selectBrushPreset({ name: 'Installed Dry Brush' })).preset)
      .toBe('Installed Dry Brush');
  });

  it('waits for a native brush-select notification delayed beyond the first 100ms after modal exit', async () => {
    let listener: ((event: string, descriptor: any) => void) | undefined;
    const harness = bootstrapHarness({
      notifications: {
        add: async (_events, callback) => { listener = callback; },
        remove: async () => { listener = undefined; },
      },
      batchPlay: async descriptors => descriptors.map(descriptor => {
        if (descriptor._obj === 'select' && descriptor._target[0]._ref === 'brush') {
          setTimeout(() => listener?.('select', {
            _target: [{ _ref: 'brush', _name: 'Installed Dry Brush' }],
          }), 150);
        }
        return descriptor._obj === 'get'
          ? { currentToolOptions: { brush: { diameter: 16 } } }
          : {};
      }),
    });
    expect(await harness.selectBrushPreset({ name: 'Installed Dry Brush' })).toMatchObject({
      preset: 'Installed Dry Brush',
      preset_verification: { source: 'photoshop_select_notification' },
    });
  });

  it('rejects contradictory current-tool readback and native selection event', async () => {
    let listener: ((event: string, descriptor: any) => void) | undefined;
    const harness = bootstrapHarness({
      notifications: {
        add: async (_events, callback) => { listener = callback; },
        remove: async () => { listener = undefined; },
      },
      batchPlay: async descriptors => descriptors.map(descriptor => {
        if (descriptor._obj === 'select' && descriptor._target[0]._ref === 'brush') {
          listener?.('select', { _target: [{ _ref: 'brush', _name: 'Different Brush' }] });
        }
        return descriptor._obj === 'get'
          ? { currentToolOptions: { brush: { name: 'Installed Dry Brush', diameter: 16 } } }
          : {};
      }),
    });
    const result = await harness.selectBrushPreset({ name: 'Installed Dry Brush' });
    expect(result.preset).toBeNull();
    expect(result.preset_verification.source).toBe('conflicting_evidence');
  });

  it('verifies nameless preset readback through a real Photoshop select event, preserving conflict, missing events and errors', async () => {
    let listener: ((event: string, descriptor: any) => void) | undefined;
    let notificationName: string | undefined = 'Installed Dry Brush';
    let failed = false;
    let removed = 0;
    const harness = bootstrapHarness({ dropModalReturn: true, notifications: {
      add: async (_events, callback) => { listener = callback; },
      remove: async () => { listener = undefined; removed++; },
    }, batchPlay: async descriptors => descriptors.map(descriptor => {
      if (descriptor._obj === 'select' && descriptor._target[0]._ref === 'brush') {
        if (failed) return { _obj: 'error', message: 'Preset unavailable' };
        if (notificationName) listener?.('select', { _target: [{ _ref: 'brush', _name: notificationName }] });
      }
      return descriptor._obj === 'get' ? { currentToolOptions: { brush: { diameter: 16, spacing: 2 } } } : {};
    }) });
    expect(await harness.selectBrushPreset({ name: 'Installed Dry Brush' })).toMatchObject({
      preset: 'Installed Dry Brush', preset_verification: { source: 'photoshop_select_notification' } });
    notificationName = 'Different Brush';
    expect((await harness.selectBrushPreset({ name: 'Installed Dry Brush' })).preset).toBe('Different Brush');
    notificationName = undefined;
    expect((await harness.selectBrushPreset({ name: 'Installed Dry Brush' })).preset).toBeNull();
    failed = true;
    await expect(harness.selectBrushPreset({ name: 'Installed Dry Brush' })).rejects.toThrow('Preset unavailable');
    expect(removed).toBe(4);
  });
  it('selects the paint tool before the preset, verifies actual readback and preserves unknown', async () => {
    let selected = 'previous-tool-brush';
    let readable = true;
    const f = bootstrapHarness({ batchPlay: async descriptors => descriptors.map(descriptor => {
      const target = descriptor._target?.[0]?._ref;
      if (descriptor._obj === 'select' && target === 'paintbrushTool') selected = 'default-brush';
      if (descriptor._obj === 'select' && target === 'brush') selected = descriptor._target[0]._name;
      if (descriptor._obj === 'get') return { currentToolOptions: { brush: {
        ...(readable ? { name: selected } : {}), diameter: 20 } } };
      return {};
    }) });
    expect((await f.selectBrushPreset({ name: 'Installed Dry Brush' })).preset).toBe('Installed Dry Brush');
    readable = false;
    expect((await f.selectBrushPreset({ name: 'Installed Dry Brush' })).preset).toBeNull();
  });
  it('captures bounded native diagnostic evidence when Square Charcoal identity is unavailable', async () => {
    const harness = bootstrapHarness({ batchPlay: async descriptors => descriptors.map(descriptor =>
      descriptor._obj === 'get'
        ? { currentToolOptions: { brush: { diameter: 24, spacing: 16 }, flow: 70 } }
        : { _obj: 'select', acknowledged: true }
    ) });
    const result = await harness.selectBrushPreset({ name: 'Square Charcoal' });
    expect(result.preset).toBeNull();
    expect(result.preset_verification.source).toBe('unavailable');
    expect(result.preset_verification.native_diagnostics).toMatchObject({
      select_response_types: ['select', 'select'],
      current_tool_option_keys: ['brush', 'flow'],
      brush_option_keys: ['diameter', 'spacing'],
      independent_readback: { preset: null },
    });
  });
  it('never invokes unsupported active brush Get that raises Photoshop modal errors', async () => {
    const queries: any[] = [];
    const h = bootstrapHarness({ batchPlay: async descriptors => descriptors.map(d => {
      if (d._obj === 'get' && d._target?.[0]?._ref === 'brush') {
        queries.push(d);
        return { _obj: 'error', message: 'The command Get is not currently available' };
      }
      return d._obj === 'get' ? { currentToolOptions: { brush: { diameter: 52 } } } : {};
    }) });
    const result = await h.selectBrushPreset({ name: 'Square Charcoal' });
    expect(queries).toHaveLength(0);
    expect(result.preset).toBeNull();
    expect(result.preset_verification.source).toBe('unavailable');
    expect(result.preset_verification.native_diagnostics.active_brush_query).toBeUndefined();
  });
  it('reads native dtipsHardness instead of inventing a default hardness', () => {
    const harness = bootstrapHarness();
    const native = harness.normalizeBrushSettingsDescriptor({ currentToolOptions: {
      brush: { diameter: { _unit: 'pixelsUnit', _value: 52 }, dtipsHardness: 65, spacing: { _unit: 'percentUnit', _value: 19 } },
      opacity: 75, flow: 55,
    } });
    expect(native.settings).toMatchObject({ size: 52, hardness: 65, spacing: 19 });
    expect(native.observed_fields).toContain('hardness');
  });

  it('captures the uniquely created identity even when modal/add return values are absent', async () => {
    const harness = bootstrapHarness({ dropModalReturn: true, dropDocumentReturn: true });
    const result = await harness.createDocumentMutation({ width: 640, height: 360 });
    expect(result).toMatchObject({ operation: 'create_document', document: { id: 41, width: 640, height: 360 } });
    expect(harness.calls.filter(call => call.kind === 'add')).toHaveLength(1);
  });
  it('keeps selection post-mutation readback modal-safe inside executeAsModal', () => {
    for (const functionName of ['selectShapeMutation', 'featherSelectionMutation', 'selectSubjectMutation']) {
      const start = source.indexOf(`async function ${functionName}`);
      expect(start, `${functionName} must exist`).toBeGreaterThanOrEqual(0);
      const nextFunction = source.indexOf('\nasync function ', start + 1);
      const body = source.slice(start, nextFunction >= 0 ? nextFunction : source.length);
      expect(body).toContain('snapshotSelectionBounds({ synchronousExecution: true })');
      expect(body).not.toContain('snapshotSelectionBounds()');
    }
  });

  it('creates a document inside executeAsModal and returns the real Photoshop document id', async () => {
    const harness = bootstrapHarness();
    const result = await harness.createDocumentMutation({
      width: 1400,
      height: 1750,
      resolution: 144,
      colorMode: 'CMYK',
    });

    expect(harness.calls.find((call) => call.kind === 'add')?.value).toEqual({
      width: 1400,
      height: 1750,
      resolution: 144,
      mode: 'CMYKColorMode',
      fill: 'white',
    });
    expect(result).toMatchObject({
      transport: 'uxp',
      operation: 'create_document',
      document: { id: 41, name: 'Untitled-1', width: 1400, height: 1750, resolution: 144 },
      active_document_id: 41,
    });
  });

  it('opens an arbitrary fullAccess file entry inside executeAsModal and returns its real document id', async () => {
    const harness = bootstrapHarness();
    const result = await harness.openImageMutation({
      filePath: 'C:\\Users\\Test\\source image.png',
    });

    expect(harness.calls.find((call) => call.kind === 'getEntryWithUrl')?.value)
      .toBe('file:/C:/Users/Test/source%20image.png');
    expect(harness.calls.some((call) => call.kind === 'open')).toBe(true);
    expect(result).toMatchObject({
      transport: 'uxp',
      operation: 'open_image',
      path: 'C:\\Users\\Test\\source image.png',
      document: { id: 84, name: 'source image.png', width: 1920, height: 1080, resolution: 72 },
      active_document_id: 84,
    });
  });
});
