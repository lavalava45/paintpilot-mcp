import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PaintPilotStopControl } from '../src/core/guard/paintpilot-stop-control.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';

describe('PaintPilot-owned explicit per-operation Stop', () => {
  it('persists an idempotent stop across instances and rejects tampered markers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paintpilot-stop-'));
    try {
      const first = new PaintPilotStopControl(dir);
      expect(() => first.assertMutationAllowed('operation-1')).not.toThrow();
      const original = first.requestStop('operation-1');
      expect(first.requestStop('operation-1').requested_at).toBe(original.requested_at);
      expect(() => new PaintPilotStopControl(dir).assertMutationAllowed('operation-1'))
        .toThrow('paintpilot_stop_requested');
      expect(() => first.assertMutationAllowed('operation-2')).not.toThrow();
      fs.writeFileSync(path.join(dir, 'paintpilot-stops', 'operation-1.json'), '{broken');
      expect(() => first.assertMutationAllowed('operation-1')).toThrow('paintpilot_stop_marker_unverifiable');
      expect(() => first.requestStop('../escape')).toThrow('paintpilot_stop_invalid_operation_id');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('blocks mutation dispatch after an async preflight but permits read-only calls', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paintpilot-invoke-'));
    try {
      let calls = 0;
      const stop = new PaintPilotStopControl(dir);
      const runtime = Object.create(EmbeddedGuardRuntime.prototype) as any;
      runtime.registry = { get: () => ({ tool: { inputSchema: { properties: {} } } }),
        execute: async () => { calls++; return { content: [] }; } };
      runtime.hostStopProbe = async () => {
        stop.requestStop('exact-run');
        return { source: 'cos-host-stop', authoritative: true, state: 'running' };
      };
      runtime.requireHostStop = true;
      runtime.paintPilotStop = stop;
      await expect(runtime.invoke('photoshop_paint_strokes', {}, 1000, { guardOperationId: 'exact-run' }))
        .rejects.toThrow('paintpilot_stop_requested');
      expect(calls).toBe(0);
      await expect(runtime.invoke('photoshop_get_state', {}, 1000, { guardOperationId: 'exact-run' }))
        .resolves.toBeDefined();
      expect(calls).toBe(1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
