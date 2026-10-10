import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/core/guard/session-store.js';
import { compileGuardCycle, type GuardCycleCompilerStore } from '../src/core/guard/cycle-compiler.js';
import { ToolRegistry } from '../src/core/tool-registry.js';

const saved = JSON.parse(readFileSync(new URL('./fixtures/nonvisual-brush-continuation.json', import.meta.url), 'utf8'));
const id = 'dragon-woman-20261009-create';
const token = '40285b8c-79e4-4fec-a448-ff39aad690fd';
const dirs: string[] = [];
afterEach(() => { vi.restoreAllMocks(); while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

function record(extra: Record<string, unknown> = {}) {
  return { id, sequence: 1, tool: 'photoshop_create_document', visual: false, dispatched: true,
    phase: 'completed', failed: false, created_at: '2026-10-09T08:21:53.000Z',
    completed_at: '2026-10-09T08:21:54.255Z', goal: 'Create the portrait document',
    args: { width: 1100, height: 1600, resolution: 144, colorMode: 'RGB' },
    result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, summary: 'Created document 4280', details: { documentId: 4280 } }) }] },
    operation_receipt: { protocol: 'photoshop.guard.operation_receipt.v1', operation_id: id, token,
      issued_at: '2026-10-09T08:21:54.255Z', phase: 'completed', execution: 'completed' }, ...extra };
}
function fixture(extra: Record<string, unknown> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'nonvisual-closure-')); dirs.push(dir);
  const s = new SessionStore(path.join(dir, 'controller'), { visualBarrierDirectory: path.join(dir, 'barriers'), workspaceRoot: dir });
  s.write(record(extra));
  const dispatch = vi.fn(async () => { throw new Error('Offline compile must never dispatch'); });
  const registry = new ToolRegistry();
  registry.register('photoshop_select_brush_preset', { tool: { name: 'photoshop_select_brush_preset', inputSchema: { type: 'object' } }, handler: dispatch });
  const store: GuardCycleCompilerStore = {
    read: operationId => s.read(operationId),
    compactPendingNonvisualClosureId: context => s.compactPendingNonvisualClosureId(context),
    compactClosureDefaults: (operationId, verdict) => s.compactClosureDefaults(operationId, verdict),
    collectClosePreviousErrors: input => s.collectClosePreviousErrors(input),
    collectPreflightErrors: (request, options) => s.collectPreflightErrors(request, { ...options, stateOnly: true }),
  };
  return { s, store, registry, dispatch };
}

it('replays the saved brush continuation, closes its exact technical receipt and never dispatches or invents a visual verdict', async () => {
  const f = fixture();
  expect(f.s.collectPreflightErrors({ tool: 'photoshop_select_brush_preset', args: { name: 'Soft Round' } }, { stateOnly: true }))
    .toContainEqual(expect.stringContaining(`Report required for ${id}`));
  const before = f.s.read(id);
  const compiled = await compileGuardCycle(saved, f.store, f.registry);
  expect(compiled.violations, JSON.stringify(compiled.violations)).toEqual([]);
  expect(compiled.nextOperation).toBeDefined();
  expect(compiled.input).toMatchObject({ previous_operation_id: id, _compact_closure: true,
    previous_operation_ack: { token } });
  expect(compiled.normalizations).toContainEqual(expect.objectContaining({ code: 'completed_nonvisual_closure_inherited' }));
  expect(f.s.read(id)).toEqual(before); // Compilation is read-only; closure belongs to the existing controller lane.
  const closure = f.s.closePreviousCycle(compiled.input);
  expect(closure).toMatchObject({ closed: true, operation_id: id, verdict_recorded: false });
  expect(f.s.read(id)).toMatchObject({ report: { source: 'guard_compact_closure' }, operation_ack: { receipt_token: token } });
  expect(f.s.read(id).verdict).toBeUndefined();
  expect(f.s.compactPendingNonvisualClosureId()).toBeUndefined();
  expect(f.s.collectPreflightErrors({ tool: 'photoshop_select_brush_preset', args: { name: 'Soft Round' } }, { stateOnly: true }))
    .not.toContainEqual(expect.stringContaining('Report required'));
  expect(saved).not.toHaveProperty('previous_operation_id');
  expect(f.dispatch).not.toHaveBeenCalled();
});

it('inherits an exact ack-only debt without replacing the existing report', async () => {
  const report = { did: 'Created a new canvas', why: 'Prepare the requested portrait', result: 'Document 4280 exists', source: 'guard_compact_closure' };
  const f = fixture({ report });
  const compiled = await compileGuardCycle(saved, f.store, f.registry);
  expect(compiled.violations).toEqual([]);
  expect(compiled.input.previous_report).toBeUndefined();
  f.s.closePreviousCycle(compiled.input);
  expect(f.s.read(id).report).toEqual(report);
  expect(f.s.read(id).operation_ack).toMatchObject({ receipt_token: token });
});

it.each([
  ['visual', { visual: true }],
  ['visual tool mislabeled nonvisual', { tool: 'photoshop_paint_regions' }],
  ['uncertain phase', { phase: 'uncertain' }],
  ['uncertain execution despite completed phase', { execution: 'uncertain' }],
  ['partial execution', { execution: 'partial' }],
  ['failed', { failed: true }],
  ['error', { error: 'dispatch interrupted' }],
  ['not dispatched', { dispatched: false }],
  ['not executed', { execution: 'not-executed' }],
  ['missing receipt', { operation_receipt: undefined }],
  ['foreign receipt', { operation_receipt: { ...record().operation_receipt, operation_id: 'other' } }],
  ['uncertain receipt', { operation_receipt: { ...record().operation_receipt, execution: 'uncertain' } }],
] as const)('never infers %s as successful technical closure', async (_name, extra) => {
  const f = fixture(extra);
  const compiled = await compileGuardCycle(saved, f.store, f.registry);
  expect(compiled.input.previous_operation_id).toBeUndefined();
  expect(f.s.read(id).report).toBeUndefined();
  expect(f.dispatch).not.toHaveBeenCalled();
});

it('does not choose among multiple debts; the blocker gives an explicit public closure route', async () => {
  const f = fixture(); f.s.write(record({ id: 'other', sequence: 2 }));
  const compiled = await compileGuardCycle(saved, f.store, f.registry);
  expect(compiled.input.previous_operation_id).toBeUndefined();
  expect(compiled.violations).toContainEqual(expect.objectContaining({ message: expect.stringContaining(`photoshop_guard_cycle_auto(previous_operation_id=${id})`) }));
  expect(compiled.violations.some(row => row.message.includes('emit real assistant prose'))).toBe(false);
});

it('preserves an explicit previous id and never selects a replacement', async () => {
  const f = fixture();
  const infer = vi.spyOn(f.store, 'compactPendingNonvisualClosureId');
  const compiled = await compileGuardCycle({ ...saved, previous_operation_id: 'authored-id' }, f.store, f.registry);
  expect(compiled.input.previous_operation_id).toBe('authored-id');
  expect(infer).not.toHaveBeenCalled();
});

it.each([{}, { ...saved, previous_observation: {} }, { ...saved, painting_intent: {} }])
  ('does not infer for close-only, model observation or conflicting continuations', async input => {
    const f = fixture(); const infer = vi.spyOn(f.store, 'compactPendingNonvisualClosureId');
    await compileGuardCycle(input, f.store, f.registry);
    expect(infer).not.toHaveBeenCalled();
  });

it('uses the provided record projection instead of reading a different journal', () => {
  const f = fixture(); const readRecords = vi.spyOn(f.s, 'records');
  expect(f.s.compactPendingNonvisualClosureId({ records: [] })).toBeUndefined();
  expect(f.s.compactPendingNonvisualClosureId({ records: [record()] })).toBe(id);
  expect(readRecords).not.toHaveBeenCalled();
});

it('leaves a completed visual operation unreviewed when closing an unrelated technical debt', async () => {
  const f = fixture();
  const visual = record({ id: 'unreviewed-paint', sequence: 2, tool: 'photoshop_paint_regions',
    visual: true, args: { document_id: 4280 }, report: { did: 'Painted a face', why: 'Build the portrait', result: 'Needs image review' },
    operation_ack: { token: 'visual-token' } });
  f.s.write(visual);
  const before = f.s.read('unreviewed-paint');
  const compiled = await compileGuardCycle(saved, f.store, f.registry);
  expect(compiled.input.previous_operation_id).toBe(id);
  f.s.closePreviousCycle(compiled.input);
  expect(f.s.read('unreviewed-paint')).toEqual(before);
  expect(f.s.collectClosePreviousErrors({ previous_operation_id: 'unreviewed-paint', next_operation: {} }))
    .toContainEqual(expect.stringContaining('previous_visual_verdict is required'));
});
