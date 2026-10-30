import { describe, expect, it } from 'vitest';
import { assessHostStop } from '../src/core/guard/host-stop-authority.js';
import { EmbeddedGuardRuntime } from '../src/core/guard/runtime.js';

describe('host Stop authority', () => {
  it('fails closed on missing state, Photoshop workflow status, and unsupported assertions', () => {
    for (const value of [undefined, null, {}, { workflow_lifecycle: { status: 'active' } },
      { source: 'cos-host-stop', state: 'running' },
      { source: 'cos-host-stop', state: 'running', authoritative: false },
      { source: 'paintpilot', state: 'running', authoritative: true }]) {
      expect(assessHostStop(value)).toMatchObject({ state: 'unknown', may_mutate: false });
    }
  });

  it('recognizes only explicit authoritative host observations', () => {
    expect(assessHostStop({ source: 'cos-host-stop', state: 'stopped', authoritative: true }))
      .toMatchObject({ state: 'stopped', may_mutate: false });
    expect(assessHostStop({ source: 'cos-host-stop', state: 'running', authoritative: true }))
      .toMatchObject({ state: 'running', may_mutate: true });
  });
});

describe('host Stop at the Photoshop command boundary', () => {
  it.each([false, true])('keeps per-call host authority alive through execution (Stop between commands: %s)', async (stopBetweenCommands) => {
    let callActive = true;
    let stopped = false;
    let executed = 0;
    let deferred: Promise<unknown> | undefined;
    const runtime = Object.create(EmbeddedGuardRuntime.prototype) as any;
    runtime.requireHostStop = true;
    runtime.hostStopProbe = async () => callActive
      ? { source: 'cos-host-stop', authoritative: true, state: stopped ? 'stopped' : 'running' }
      : undefined;
    runtime.registry = {
      get: () => ({ tool: { inputSchema: { properties: {} } } }),
      execute: async () => { executed++; return { content: [] }; },
    };
    const execute = async () => {
      await runtime.invoke('photoshop_paint_strokes', {}, 1000);
      stopped = stopBetweenCommands;
      await runtime.invoke('photoshop_paint_strokes', {}, 1000);
      return { ok: true };
    };
    // COS retires the call token as soon as the outer MCP response returns.
    // Model the normal auto-job handoff, not a stopped Photoshop document.
    runtime.cycle = async (_input: unknown, _job: unknown, options: { dispatchMode: string }) => {
      if (options.dispatchMode === 'sync') return execute();
      deferred = new Promise(resolve => setTimeout(resolve, 0)).then(execute).catch(error => error);
      return { mode: 'photoshop-guard-async', state: 'starting' };
    };
    let failure: unknown;
    try { await runtime.cycleAuto({}); } catch (error) { failure = error; }
    finally { callActive = false; }
    await deferred;
    expect(executed).toBe(stopBetweenCommands ? 1 : 2);
    if (stopBetweenCommands) expect(String(failure)).toContain('cos_host_stop_active');
    else expect(failure).toBeUndefined();
    expect(deferred).toBeUndefined();
  });

  it('allows the stock-COS Guard executor without a fork-only host probe, while retaining PaintPilot admission', async () => {
    let executed = 0;
    let checked = 0;
    const runtime = Object.create(EmbeddedGuardRuntime.prototype) as any;
    runtime.registry = { get: () => ({ tool: { inputSchema: { properties: {} } } }),
      execute: async () => { executed++; return { content: [] }; } };
    runtime.requireHostStop = false;
    runtime.hostStopProbe = undefined;
    runtime.paintPilotStop = { assertMutationAllowed: (id: string) => {
      expect(id).toBe('stock-cos-operation'); checked++;
    } };
    await expect(runtime.invoke('photoshop_paint_strokes', {}, 1000, { guardOperationId: 'stock-cos-operation' }))
      .resolves.toBeDefined();
    expect({ executed, checked }).toEqual({ executed: 1, checked: 1 });
  });
  const invokeWith = async (observation: unknown, tool: string) => {
    let calls = 0;
    const runtime = Object.create(EmbeddedGuardRuntime.prototype) as any;
    runtime.registry = {
      get: () => ({ tool: { inputSchema: { properties: {} } } }),
      execute: async () => { calls += 1; return { content: [] }; },
    };
    runtime.hostStopProbe = async () => observation;
    runtime.requireHostStop = true;
    let failure: string | undefined;
    try { await runtime.invoke(tool, {}, 1000); } catch (error) { failure = String(error); }
    return { calls, failure };
  };

  it('blocks a Photoshop state change for stopped or unknown COS authority', async () => {
    for (const observation of [undefined, { source: 'cos-host-stop', state: 'stopped', authoritative: true }]) {
      const result = await invokeWith(observation, 'photoshop_paint_strokes');
      expect(result.calls).toBe(0);
      expect(result.failure).toContain('cos_host_stop_');
    }
  });

  it('permits state changes only after a verified running observation and allows reads while stopped', async () => {
    expect(await invokeWith({ source: 'cos-host-stop', state: 'running', authoritative: true }, 'photoshop_paint_strokes'))
      .toMatchObject({ calls: 1, failure: undefined });
    expect(await invokeWith({ source: 'cos-host-stop', state: 'stopped', authoritative: true }, 'photoshop_get_state'))
      .toMatchObject({ calls: 1, failure: undefined });
  });
});
