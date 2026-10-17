import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { acceptedConnectedMoveReceipt, connectedMoveOwnerIssues } from '../src/core/connected-move-guard.js';

const bounds = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const manifest = () => ({
  parent: { owner_id: 'parent', layer_id: 2, expected_bounds: bounds(50, 70, 145, 160) },
  children: [{ owner_id: 'child', layer_id: 3, expected_bounds: bounds(140, 100, 186, 135) }],
});
const owners = () => [
  { hypothesis_id: 'parent', layer_id: 2, construction_revision: 'parent-r1', construction_tier: 'primary' },
  { hypothesis_id: 'child', layer_id: 3, construction_revision: 'child-r1', construction_tier: 'secondary',
    parent_hypothesis_id: 'parent', parent_construction_revision: 'parent-r1' },
];
const guardOperation = (connected_move: unknown = manifest()) => ({
  tool: 'photoshop_execute_visual_microplan',
  args: { steps: [{ tool: 'photoshop_move_layer', args: { deltaX: 20, deltaY: 0, connected_move } },
    { tool: 'photoshop_get_preview', args: {} }] },
});

describe('E.25 connected native owner/descendant contract', () => {
  it('allows only the exact durable complete same-revision physical owner set', () => {
    expect(connectedMoveOwnerIssues(guardOperation(), owners())).toEqual([]);
  });
  it('accepts an explicitly complete two-level parent→child→grandchild physical manifest', () => {
    const nested = manifest();
    nested.children.push({
      owner_id: 'grandchild', layer_id: 4, expected_bounds: bounds(180, 109, 205, 128),
    });
    const grandchild = {
      hypothesis_id: 'grandchild', layer_id: 4, construction_revision: 'grandchild-r1',
      construction_tier: 'tertiary', parent_hypothesis_id: 'child',
      parent_construction_revision: 'child-r1',
    };
    expect(connectedMoveOwnerIssues(guardOperation(nested), [...owners(), grandchild])).toEqual([]);
  });
  it.each([
    ['no semantic owners', []],
    ['incorrect descendant physical ID', [{ ...owners()[0] }, { ...owners()[1], layer_id: 999 }]],
    ['temporary descendant', [owners()[0], { ...owners()[1], temporary: true }]],
    ['stale descendant parent', [owners()[0], { ...owners()[1], parent_construction_revision: 'parent-r0' }]],
    ['unconfirmed parent revision', [{ ...owners()[0], construction_revision: undefined }, owners()[1]]],
    ['unlisted second descendant', [...owners(), { hypothesis_id: 'grandchild', layer_id: 4,
      parent_hypothesis_id: 'child', parent_construction_revision: 'child-r1' }]],
  ])('rejects %s without native mutation', (_name, actual) => {
    expect(connectedMoveOwnerIssues(guardOperation(), actual as unknown[])).not.toEqual([]);
  });
  it('rejects a duplicate owner or physical layer and a second independent transform', () => {
    const bad = manifest();
    bad.children[0]!.layer_id = 2;
    expect(connectedMoveOwnerIssues(guardOperation(bad), owners())).toContain('connected_move_owner_identity_invalid');
    const mixed = guardOperation() as any;
    mixed.args.steps.unshift({ tool: 'photoshop_scale_layer', args: { scalePercent: 50 } });
    expect(connectedMoveOwnerIssues(mixed, owners())).toContain('connected_move_requires_one_transform_per_guard_pass');
  });
  it('blocks connected motion in coherent-3D perspective until an explicit scene revision review is supported', () => {
    expect(connectedMoveOwnerIssues(guardOperation(), owners(), {
      applicability: 'coherent_3d', model_id: 'perspective-v1', revision: 2,
    })).toContain('connected_move_perspective_revalidation_required');
  });
});

function acceptedRecord() {
  const payload = manifest();
  return {
    tool: 'photoshop_execute_visual_microplan', phase: 'completed', failed: false,
    args: { document_id: 42, steps: [{ id: 'move', tool: 'photoshop_move_layer', args: {
      deltaX: 20, deltaY: 0, connected_move: payload,
    } }] },
    verdict: { disposition: 'accept', target_resolved: 'yes' },
    report: { did: 'Observed all component pixels at new physical positions' },
    operation_ack: { receipt_token: 'native-verified' },
    preview: { sha256: 'a'.repeat(64) },
    result: { content: [{ type: 'text', text: JSON.stringify({
      pass_execution: { history_ownership: { status: 'exact', total_history_steps: 1 } },
      mutation_results: { move: { ok: true, details: {
        moved: true, connected: true, history_steps: 1,
        deltaX: 20, deltaY: 0, parent_owner_id: 'parent',
        layer_receipts: [
          { owner_id: 'parent', layer_id: 2,
            source_bounds: bounds(50, 70, 145, 160), target_bounds: bounds(70, 70, 165, 160) },
          { owner_id: 'child', layer_id: 3,
            source_bounds: bounds(140, 100, 186, 135), target_bounds: bounds(160, 100, 206, 135) },
        ],
      } } },
    }) }] },
  };
}

describe('E.25 only accepted native pixel/history evidence advances linked owners', () => {
  it('recognizes one verified and fully accepted two-owner native receipt', () => {
    expect(acceptedConnectedMoveReceipt(acceptedRecord(), owners())).toEqual({
      owner_ids: ['parent', 'child'], delta_x: 20, delta_y: 0,
    });
  });
  it('does not advance model geometry with only tool success, no whole-frame visual acceptance', () => {
    const rec = acceptedRecord() as any;
    delete rec.verdict;
    expect(acceptedConnectedMoveReceipt(rec, owners())).toBeUndefined();
  });
  it('does not advance model geometry with partial or invented Photoshop History', () => {
    const rec = acceptedRecord() as any;
    const result = JSON.parse(rec.result.content[0].text);
    result.pass_execution.history_ownership.status = 'unproven';
    rec.result.content[0].text = JSON.stringify(result);
    expect(acceptedConnectedMoveReceipt(rec, owners())).toBeUndefined();
  });
  it('does not accept missing child physical receipts or wrong source/target pixel bounds', () => {
    const rec = acceptedRecord() as any;
    const result = JSON.parse(rec.result.content[0].text);
    result.mutation_results.move.details.layer_receipts.pop();
    rec.result.content[0].text = JSON.stringify(result);
    expect(acceptedConnectedMoveReceipt(rec, owners())).toBeUndefined();
    result.mutation_results.move.details.layer_receipts.push({
      owner_id: 'child', layer_id: 3,
      source_bounds: bounds(140, 100, 186, 135), target_bounds: bounds(140, 100, 186, 135),
    });
    rec.result.content[0].text = JSON.stringify(result);
    expect(acceptedConnectedMoveReceipt(rec, owners())).toBeUndefined();
  });
  it('rejects a late stale parent revision even for an authentic historic receipt', () => {
    expect(acceptedConnectedMoveReceipt(acceptedRecord(), [
      owners()[0], { ...owners()[1], parent_construction_revision: 'older-parent' },
    ])).toBeUndefined();
  });
  it('refuses rolled-back or foreign/non-ancestral frames as owner-revision evidence', () => {
    const rec = acceptedRecord() as any;
    rec.rolled_back = true;
    expect(acceptedConnectedMoveReceipt(rec, owners())).toBeUndefined();
    delete rec.rolled_back;
    rec.current_frame_authority = false;
    expect(acceptedConnectedMoveReceipt(rec, owners())).toBeUndefined();
  });
});

const source = readFileSync(new URL('../uxp-plugin/p1-layer-ops.js', import.meta.url), 'utf8');

function uxpFixture(opts: { stale?: boolean; failSecond?: boolean; wrongDocument?: boolean; failCommit?: boolean; cachedProxy?: boolean; activeOnly?: boolean; initiallyActiveChild?: boolean } = {}) {
  const calls: string[] = [];
  function layer(id: number, b: ReturnType<typeof bounds>) {
    const item = {
      id, kind: 'normal', isBackgroundLayer: false, visible: true, bounds: { ...b },
      translate: vi.fn(async (dx: number, dy: number) => {
        calls.push('translate:' + id);
        if (opts.failSecond && id === 3) throw new Error('native child transform failed');
        // Models actual Photoshop behavior that triggered the second live
        // failure: a non-selected Layer.translate may succeed as a Promise
        // while leaving that layer's physical pixels untouched.
        if (opts.activeOnly && doc.activeLayers[0]?.id !== id) return;
        item.bounds = bounds(item.bounds.left + dx, item.bounds.top + dy,
          item.bounds.right + dx, item.bounds.bottom + dy);
      }),
    };
    return item;
  }
  const parent = layer(2, bounds(opts.stale ? 51.5 : 50, 70, 145, 160));
  const child = layer(3, bounds(140, 100, 186, 135));
  const doc = {
    id: opts.wrongDocument ? 99 : 42,
    // In live Photoshop an earlier UXP Layer proxy can expose stale bounds
    // after translate; a fresh lookup by stable ID must win.
    get layers() {
      return opts.cachedProxy
        ? [child, parent].map(item => ({ ...item, bounds: { ...item.bounds } }))
        : [child, parent];
    },
    activeLayers: opts.initiallyActiveChild ? [child] : [parent],
  };
  const snapshots = [structuredClone(parent.bounds), structuredClone(child.bounds)];
  const hostControl = {
    suspendHistory: vi.fn(async () => { calls.push('suspend'); return 17; }),
    resumeHistory: vi.fn(async (_id: number, commit: boolean) => {
      calls.push(commit ? 'commit' : 'abort');
      if (opts.failCommit && commit) throw new Error('native commit failed');
      if (!commit) { parent.bounds = snapshots[0]!; child.bounds = snapshots[1]!; }
    }),
  };
  const photos = {
    app: { documents: opts.wrongDocument ? [doc, { id: 42 }] : [doc], activeDocument: doc },
    constants: { LayerKind: { NORMAL: 'normal' } },
    core: { executeAsModal: (fn: (ctx: { hostControl: typeof hostControl }) => unknown) => fn({ hostControl }) },
    action: { batchPlay: vi.fn(async (descriptors: any[]) => {
      const layerId = descriptors[0]?._target?.[0]?._id;
      calls.push('select:' + layerId);
      if (layerId === 2) doc.activeLayers = [parent];
      else if (layerId === 3) doc.activeLayers = [child];
    }) },
  };
  const context = { require: (name: string) => {
    if (name !== 'photoshop') throw new Error('Unexpected require ' + name);
    return photos;
  }, module: { exports: {} } };
  runInNewContext(source, context);
  const handle = (context.module.exports as {
    tryHandleP1LayerOperation: (action: string, payload: unknown) => Promise<{ handled: boolean; data: any }>;
  }).tryHandleP1LayerOperation;
  const payload = { document_id: 42, deltaX: 20, deltaY: 0, connected_move: manifest() };
  return { handle, payload, calls, parent, child, hostControl };
}

describe('E.25 actual UXP source atomic translation and native History', () => {
  it('guarded layer transform moves only the pinned active raster layer and rejects invalid identities/offsets', async () => {
    const f = uxpFixture();
    const { data } = await f.handle('transform_layer', {
      document_id: 42, layer_id: 2, translation: { x: -6, y: 4 },
    });
    expect(data).toMatchObject({ transformed: true, document_id: 42, layer_id: 2,
      translation: { x: -6, y: 4 } });
    expect(f.parent.bounds).toEqual(bounds(44, 74, 139, 164));
    expect(f.child.bounds).toEqual(bounds(140, 100, 186, 135));
    const transformedOther = await f.handle('transform_layer', { document_id: 42, layer_id: 3,
      translation: { x: 5, y: 1 } });
    expect(transformedOther.data.layer_id).toBe(3);
    expect(f.parent.bounds).toEqual(bounds(44, 74, 139, 164));
    expect(f.child.bounds).toEqual(bounds(145, 101, 191, 136));
    expect(f.calls.slice(-3)).toEqual(['select:3', 'translate:3', 'select:2']);
    await expect(f.handle('transform_layer', { document_id: 42, layer_id: 999,
      translation: { x: 1, y: 0 } })).rejects.toThrow('transform_layer_identity_mismatch');
    await expect(f.handle('transform_layer', { document_id: 42, layer_id: 2,
      translation: { x: 0, y: 0 } })).rejects.toThrow('transform_parameters_invalid');
    await expect(f.handle('transform_layer', { document_id: 42, layer_id: 2,
      translation: { x: 129, y: 0 } })).rejects.toThrow('transform_parameters_invalid');
    await expect(f.handle('transform_layer', { document_id: 999, layer_id: 2,
      translation: { x: 1, y: 0 } })).rejects.toThrow('document_not_found');
  });
  it('physically moves both original raster layers and commits precisely one Undo unit', async () => {
    const f = uxpFixture();
    const { data } = await f.handle('move_layer_pixels', f.payload);
    expect(data).toMatchObject({ moved: true, connected: true, history_steps: 1,
      parent_owner_id: 'parent', layer_receipts: [
        { owner_id: 'parent', layer_id: 2, target_bounds: bounds(70, 70, 165, 160) },
        { owner_id: 'child', layer_id: 3, target_bounds: bounds(160, 100, 206, 135) },
      ],
    });
    expect(f.calls).toEqual(['suspend', 'translate:2', 'select:3', 'translate:3', 'select:2', 'commit']);
    expect(f.hostControl.suspendHistory).toHaveBeenCalledWith({ documentID: 42, name: 'MCP Connected Move' });
    expect(f.hostControl.resumeHistory).toHaveBeenCalledExactlyOnceWith(17, true);
  });
  it('reacquires fresh native bounds after translating both layers even when original DOM proxies are stale', async () => {
    const f = uxpFixture({ cachedProxy: true });
    const { data } = await f.handle('move_layer_pixels', f.payload);
    expect(data).toMatchObject({ moved: true, connected: true, history_steps: 1,
      layer_receipts: [
        { layer_id: 2, target_bounds: bounds(70, 70, 165, 160) },
        { layer_id: 3, target_bounds: bounds(160, 100, 206, 135) },
      ],
    });
    expect(f.calls).toEqual(['suspend', 'translate:2', 'select:3', 'translate:3', 'select:2', 'commit']);
  });
  it('selects the non-active parent and each subsequent child INSIDE one History span', async () => {
    const f = uxpFixture({ activeOnly: true });
    const { data } = await f.handle('move_layer_pixels', f.payload);
    expect(data.history_steps).toBe(1);
    expect(f.parent.bounds).toEqual(bounds(70, 70, 165, 160));
    expect(f.child.bounds).toEqual(bounds(160, 100, 206, 135));
    expect(f.calls).toEqual(['suspend', 'translate:2', 'select:3', 'translate:3', 'select:2', 'commit']);
  });
  it('moves the non-active parent in the real child-selected scenario and restores the original active child', async () => {
    const f = uxpFixture({ activeOnly: true, initiallyActiveChild: true });
    const { data } = await f.handle('move_layer_pixels', f.payload);
    expect(data.history_steps).toBe(1);
    expect(f.parent.bounds).toEqual(bounds(70, 70, 165, 160));
    expect(f.child.bounds).toEqual(bounds(160, 100, 206, 135));
    expect(f.calls).toEqual(['suspend', 'select:2', 'translate:2', 'select:3', 'translate:3', 'commit']);
  });
  it('rejects stale observed pixel bounds before any History suspension', async () => {
    const f = uxpFixture({ stale: true });
    await expect(f.handle('move_layer_pixels', f.payload)).rejects.toThrow('connected_move_bounds_stale');
    expect(f.calls).toEqual([]);
  });
  it('does not move foreign active documents', async () => {
    const f = uxpFixture({ wrongDocument: true });
    await expect(f.handle('move_layer_pixels', f.payload)).rejects.toThrow('document_not_active');
    expect(f.calls).toEqual([]);
  });
  it('aborts the entire History group and refuses a receipt if the child fails', async () => {
    const f = uxpFixture({ failSecond: true });
    await expect(f.handle('move_layer_pixels', f.payload)).rejects.toThrow('native child transform failed');
    expect(f.calls).toEqual(['suspend', 'translate:2', 'select:3', 'translate:3', 'abort']);
    expect(f.parent.bounds).toEqual(bounds(50, 70, 145, 160));
    expect(f.child.bounds).toEqual(bounds(140, 100, 186, 135));
  });
  it('aborts when native commit fails, never claiming history_steps=1', async () => {
    const f = uxpFixture({ failCommit: true });
    await expect(f.handle('move_layer_pixels', f.payload)).rejects.toThrow('native commit failed');
    expect(f.calls.at(-1)).toBe('abort');
  });
  it('rejects duplicate layer IDs and excessive offsets before entering Photoshop modal scope', async () => {
    const f = uxpFixture();
    const repeated = structuredClone(f.payload);
    repeated.connected_move.children[0]!.layer_id = 2;
    await expect(f.handle('move_layer_pixels', repeated)).rejects.toThrow('connected_move_identity_invalid');
    await expect(f.handle('move_layer_pixels', { ...f.payload, deltaX: 999 })).rejects.toThrow('connected_move_delta_invalid');
    expect(f.calls).toEqual([]);
  });
});
