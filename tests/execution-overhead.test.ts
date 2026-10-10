import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeLogicalOperation } from '../src/core/guard/cycle.js';
import { stopProcessVideoCapture } from '../src/core/process-video-trace.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('separates recorder overhead on success, failed dispatch, broken tracing and replay', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  let now = 10000;
  vi.setSystemTime(now);
  const advance = (ms: number) => vi.setSystemTime(now += ms);
  for (const failed of [false, true]) {
    const record: any = { id: 'timed', tool: 'photoshop_save_document', args: { document_id: 7 }, visual: false };
    const invoke = vi.fn(async () => { advance(12); if (failed) throw Error('dispatch failed'); return {}; });
    const store = {
      begin: () => ({ record, replay: false }), markDispatched: vi.fn(),
      complete: (active: any) => active,
      fail: (active: any) => ({ ...active, failed: true }),
    };
    const args = { input: record, store, invoke, materializeArguments: (_: string, a: any) => a,
      mutationLifecycle: {
        beforeMutation: () => { advance(200); return 'capture'; },
        afterMutation: (_: any, token: any, error: any) => {
          expect(token).toBe('capture'); expect(!!error).toBe(failed); advance(300);
          return { recorder_settle_ms: 50, recorder_stop_ms: 100, recorder_postprocess_ms: 150 };
        },
      } };
    const run = await executeLogicalOperation(args);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(run.timing).toMatchObject({ photoshop_dispatch_wall_ms: 12, recorder_prepare_ms: 200,
      recorder_finalize_ms: 300, recorder_settle_ms: 50, recorder_stop_ms: 100, recorder_postprocess_ms: 150 });
    const replay = await executeLogicalOperation({ ...args, store: { ...store, begin: () => ({ record, replay: true }) } });
    expect(replay.timing.photoshop_dispatch_wall_ms).toBeNull();
    expect(replay.timing.recorder_prepare_ms).toBeNull(); expect(invoke).toHaveBeenCalledTimes(1);
  }
  const input: any = { id: 'broken-recorder', tool: 'photoshop_save_document', args: { document_id: 7 } };
  const run = await executeLogicalOperation({ input,
    store: { begin: () => ({ record: input }), markDispatched: () => {}, complete: (r: any) => r, fail: () => { throw Error('unexpected'); } },
    invoke: async () => { advance(12); return {}; }, materializeArguments: (_: string, a: any) => a,
    mutationLifecycle: { beforeMutation: () => { advance(20); throw Error('start'); },
      afterMutation: () => { advance(30); throw Error('stop'); } },
  });
  expect(run.timing).toMatchObject({ photoshop_dispatch_wall_ms: 12, recorder_prepare_ms: 20, recorder_finalize_ms: 30 });
});

it('returns honest recorder phases on a finalized clip and a missing-action-frame warning', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'recorder-phases-'));
  try {
    mkdirSync(path.join(dir, 'export/videos'), { recursive: true });
    const capture: any = { operation_id: 'trace', absolute_clip_path: path.join(dir, 'export/videos/clip.mp4'),
      clip_path: 'export/videos/clip.mp4', started_at: new Date().toISOString(),
      action_start_frame_count: 0, progress_frame_count: 1, process: { exitCode: 0 } };
    writeFileSync(capture.absolute_clip_path, 'fixture');
    const result = await stopProcessVideoCapture(dir, capture, { artistic_commentary: 'Model the curved cup.' }, { settleMs: 0 });
    expect(result.entry?.operation_id).toBe('trace');
    for (const value of Object.values(result.timing)) expect(value).toEqual(expect.any(Number));
    capture.progress_frame_count = 0;
    const warning = await stopProcessVideoCapture(dir, capture, {}, { settleMs: 0 });
    expect(warning.warning).toContain('no_action_frame');
    expect(warning.timing.recorder_stop_ms).toEqual(expect.any(Number));
    expect(warning.timing.recorder_postprocess_ms).toBeNull();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
