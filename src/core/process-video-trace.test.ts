import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appendProcessTraceEntry,
  assembleProcessTraceVideo,
  buildProcessTraceAssemblyPlan,
  deterministicTraceAssemblyInputs,
  photoshopHwndCaptureTarget,
  readProcessTraceManifest,
  processVideoFfmpegArgs,
  probeProcessVideoTraceReadiness,
  readProcessVideoTraceSetting,
  processTraceAssemblyFfmpegArgs,
  resolveProcessVideoCaptureTarget,
  setProcessVideoTraceEnabled,
  startProcessVideoCapture,
  stopProcessVideoCapture,
  traceArtisticIntent,
  waitForProcessVideoCaptureReady,
  wakeProcessVideoCaptureWindow,
} from './process-video-trace.js';

const roots: string[] = [];
function project(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paintpilot-video-trace-'));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('E.22 process video trace manifest', () => {
  it('uses Windows Graphics Capture for a Photoshop HWND so GPU-rendered canvas content is included', () => {
    expect(startProcessVideoCapture(project(), 'op-disabled', { enabled: false })).toEqual({ enabled: false });
    const args = processVideoFfmpegArgs('hwnd=0xA10CFA', 'clip.mp4');
    expect(args).toContain('lavfi');
    expect(args).toContain('gfxcapture=hwnd=10554618:capture_cursor=0:capture_border=0:max_framerate=30');
    expect(args).toContain('hwdownload,format=bgra,format=yuv420p');
    expect(args).toContain('pipe:1');
    expect(args).toContain('0.05');
    expect(args).toContain('zerolatency');
    expect(args).toContain('-bf');
    expect(args).not.toContain('gdigrab');
    expect(args).not.toContain('desktop');
    expect(args.at(-1)).toBe('clip.mp4');
  });

  it('keeps legacy/manual non-HWND capture targets on gdigrab as an explicit debug fallback', () => {
    const args = processVideoFfmpegArgs('title=Manual Photoshop Target', 'clip.mp4');
    expect(args).toContain('gdigrab');
    expect(args).toContain('title=Manual Photoshop Target');
    expect(args.join(' ')).not.toContain('gfxcapture=');
  });

  it('formats a discovered Photoshop window handle as the canonical HWND target', () => {
    expect(photoshopHwndCaptureTarget('10554618')).toBe('hwnd=0xA10CFA');
    expect(() => photoshopHwndCaptureTarget('0')).toThrow('process_video_trace_photoshop_window_handle_invalid');
    expect(() => photoshopHwndCaptureTarget('not-a-handle')).toThrow('process_video_trace_photoshop_window_handle_invalid');
  });

  it('uses explicit capture target overrides and otherwise auto-discovers the current Photoshop HWND', () => {
    expect(resolveProcessVideoCaptureTarget({
      captureTarget: 'title=Manual Photoshop Target',
      envCaptureTarget: 'title=Environment Target',
      discoverCaptureTarget: () => 'hwnd=0x111',
    })).toBe('title=Manual Photoshop Target');
    expect(resolveProcessVideoCaptureTarget({
      envCaptureTarget: 'title=Environment Target',
      discoverCaptureTarget: () => 'hwnd=0x111',
    })).toBe('title=Environment Target');
    expect(resolveProcessVideoCaptureTarget({
      discoverCaptureTarget: () => 'hwnd=0xA10CFA',
    })).toBe('hwnd=0xA10CFA');
  });

  it('persists the UXP video-recording toggle and gives it precedence over the environment fallback', () => {
    const dir = project();
    const settingsPath = path.join(dir, 'process-video-trace-settings.json');
    expect(readProcessVideoTraceSetting({ settingsPath, envEnabled: '1' })).toMatchObject({
      enabled: true,
      source: 'environment',
    });
    setProcessVideoTraceEnabled(false, { settingsPath });
    expect(readProcessVideoTraceSetting({ settingsPath, envEnabled: '1' })).toMatchObject({
      enabled: false,
      source: 'runtime',
    });
    setProcessVideoTraceEnabled(true, { settingsPath });
    expect(readProcessVideoTraceSetting({ settingsPath, envEnabled: '0' })).toMatchObject({
      enabled: true,
      source: 'runtime',
    });
  });

  it('reports full video-recording readiness without starting a capture', () => {
    expect(probeProcessVideoTraceReadiness({
      ffmpegPath: 'ffmpeg-test',
      ffmpegProbe: (executable) => ({ status: 'ready', executable, version: 'ffmpeg test' }),
      discoverCaptureTarget: () => 'hwnd=0xA10CFA',
    })).toMatchObject({
      ready: true,
      status: 'ready',
      ffmpeg: { status: 'ready', executable: 'ffmpeg-test' },
      photoshop_window: {
        status: 'ready',
        capture_target: 'hwnd=0xA10CFA',
        capture_backend: 'gfxcapture',
      },
    });
  });

  it('reports legacy/manual title targets as gdigrab readiness', () => {
    expect(probeProcessVideoTraceReadiness({
      captureTarget: 'title=Manual Photoshop Target',
      ffmpegProbe: (executable) => ({ status: 'ready', executable }),
    })).toMatchObject({
      ready: true,
      photoshop_window: {
        status: 'ready',
        capture_target: 'title=Manual Photoshop Target',
        capture_backend: 'gdigrab',
      },
    });
  });

  it('distinguishes missing FFmpeg, failed FFmpeg launch and missing Photoshop window', () => {
    expect(probeProcessVideoTraceReadiness({
      ffmpegProbe: (executable) => ({ status: 'not-found', executable, error: 'ENOENT' }),
      discoverCaptureTarget: () => 'hwnd=0x1',
    }).status).toBe('ffmpeg-not-found');
    expect(probeProcessVideoTraceReadiness({
      ffmpegProbe: (executable) => ({ status: 'failed-to-start', executable, error: 'timed out' }),
      discoverCaptureTarget: () => 'hwnd=0x1',
    }).status).toBe('ffmpeg-failed-to-start');
    expect(probeProcessVideoTraceReadiness({
      ffmpegProbe: (executable) => ({ status: 'ready', executable }),
      discoverCaptureTarget: () => { throw new Error('process_video_trace_photoshop_window_discovery_failed:photoshop_window_not_found'); },
    }).status).toBe('photoshop-window-not-found');
  });

  it('keeps Photoshop mutation semantics non-authoritative when HWND discovery fails', () => {
    const result = startProcessVideoCapture(project(), 'op-window-missing', {
      enabled: true,
      discoverCaptureTarget: () => { throw new Error('photoshop_window_not_found'); },
    });
    expect(result.enabled).toBe(true);
    expect(result.capture).toBeUndefined();
    expect(result.warning).toContain('process_video_trace_start_failed:photoshop_window_not_found');
  });

  it('stops FFmpeg with an interactive q write without closing stdin before gfxcapture can process it', async () => {
    const dir = project();
    const relativeClip = 'video-trace/clips/0001-op-stop.mp4';
    const absoluteClip = path.join(dir, ...relativeClip.split('/'));
    fs.mkdirSync(path.dirname(absoluteClip), { recursive: true });
    fs.writeFileSync(absoluteClip, Buffer.from('mock-video'));
    const writes: string[] = [];
    const child = {
      exitCode: null as number | null,
      killed: false,
      stdin: {
        write(value: string) {
          writes.push(value);
          child.exitCode = 0;
          return true;
        },
      },
      once() { return child; },
    };

    const result = await stopProcessVideoCapture(dir, {
      operation_id: 'op-stop',
      clip_path: relativeClip,
      absolute_clip_path: absoluteClip,
      started_at: '2026-10-02T00:00:00.000Z',
      process: child as never,
    }, {
      artistic_commentary: 'Verify the recorder stop path.',
    }, { settleMs: 0 });

    expect(writes).toEqual(['q\n']);
    expect(result.warning).toBeUndefined();
    expect(result.entry?.operation_id).toBe('op-stop');
  });

  it('does not attempt a Windows redraw wake for non-HWND capture targets', () => {
    const result = wakeProcessVideoCaptureWindow({
      operation_id: 'manual-target',
      clip_path: 'video-trace/clips/manual.mp4',
      absolute_clip_path: 'manual.mp4',
      started_at: '2026-10-02T00:00:00.000Z',
      capture_target: 'title=Manual Photoshop Target',
      process: {} as never,
    }, { platform: 'win32' });
    expect(result).toEqual({ woke: false });
  });

  it('does not attempt a Windows redraw wake outside Windows even for an HWND target', () => {
    const result = wakeProcessVideoCaptureWindow({
      operation_id: 'hwnd-target',
      clip_path: 'video-trace/clips/hwnd.mp4',
      absolute_clip_path: 'hwnd.mp4',
      started_at: '2026-10-02T00:00:00.000Z',
      capture_target: 'hwnd=0x1234',
      process: {} as never,
    }, { platform: 'linux' });
    expect(result).toEqual({ woke: false });
  });

  it('waits for a real FFmpeg frame before allowing the Photoshop mutation to begin', async () => {
    const listeners = new Map<string, Array<(value?: unknown) => void>>();
    const on = (name: string, listener: (value?: unknown) => void) => {
      const group = listeners.get(name) ?? [];
      group.push(listener);
      listeners.set(name, group);
    };
    const child = {
      exitCode: null as number | null,
      killed: false,
      stdin: { write() { return true; } },
      stdout: { on },
      stderr: { on },
      on() { return child; },
      once() { return child; },
      kill() { child.killed = true; return true; },
    };
    const capture = {
      operation_id: 'op-ready',
      clip_path: 'video-trace/clips/0001-op-ready.mp4',
      absolute_clip_path: 'unused.mp4',
      started_at: '2026-10-02T00:00:00.000Z',
      process: child as never,
      progress_frame_count: 0,
    };

    setTimeout(() => {
      capture.progress_frame_count = 1;
      (capture as typeof capture & { first_frame_at?: string }).first_frame_at = '2026-10-02T00:00:00.050Z';
    }, 20);
    const ready = await waitForProcessVideoCaptureReady(capture as never, { timeoutMs: 250 });
    expect(ready).toEqual({ ready: true, first_frame_at: '2026-10-02T00:00:00.050Z' });
  });

  it('does not append a trace entry when no captured frame advances during the agent mutation', async () => {
    const dir = project();
    const relativeClip = 'video-trace/clips/0001-op-static.mp4';
    const absoluteClip = path.join(dir, ...relativeClip.split('/'));
    fs.mkdirSync(path.dirname(absoluteClip), { recursive: true });
    fs.writeFileSync(absoluteClip, Buffer.from('mock-video'));
    const child = {
      exitCode: null as number | null,
      killed: false,
      stdin: { write() { child.exitCode = 0; return true; } },
      once() { return child; },
    };
    const result = await stopProcessVideoCapture(dir, {
      operation_id: 'op-static', clip_path: relativeClip, absolute_clip_path: absoluteClip,
      started_at: '2026-10-02T00:00:00.000Z', process: child as never,
      action_start_frame_count: 1, progress_frame_count: 1,
      ffmpeg_path: path.join(dir, 'missing-ffmpeg.exe'),
    }, { artistic_commentary: 'Paint the visible action.' }, { settleMs: 0 });
    expect(result.warning).toContain('process_video_trace_no_action_frame');
    expect(readProcessTraceManifest(dir).entries).toHaveLength(0);
  });

  it('uses pre-operation artistic commentary as the canonical caption source', () => {
    expect(traceArtisticIntent({
      artistic_commentary: 'Break the mirrored pose and make the left silhouette more natural.',
      tool: 'photoshop_execute_visual_microplan',
    })).toBe('Break the mirrored pose and make the left silhouette more natural.');
    expect(() => traceArtisticIntent({ tool: 'photoshop_execute_visual_microplan' }))
      .toThrow('process_video_trace_artistic_intent_required');
  });

  it('retains failed attempts and later corrections in chronological order', () => {
    const dir = project();
    appendProcessTraceEntry(dir, {
      operation_id: 'op-attempt', kind: 'attempt', artistic_intent: 'Try a broader left silhouette.',
      clip_path: 'video-trace/clips/0001-op-attempt.mp4',
      started_at: '2026-10-01T00:00:00.000Z', stopped_at: '2026-10-01T00:00:02.000Z',
      outcome_note: 'Too broad; correct on the next pass.',
    });
    appendProcessTraceEntry(dir, {
      operation_id: 'op-correction', kind: 'correction', artistic_intent: 'Narrow the silhouette while keeping asymmetry.',
      clip_path: 'video-trace/clips/0002-op-correction.mp4',
      started_at: '2026-10-01T00:00:03.000Z', stopped_at: '2026-10-01T00:00:05.000Z',
      outcome_operation_id: 'op-attempt',
    });
    expect(deterministicTraceAssemblyInputs(dir).map(x => [x.operation_id, x.kind]))
      .toEqual([['op-attempt', 'attempt'], ['op-correction', 'correction']]);
  });

  it('is append-only/idempotent for an operation across interruption and resume', () => {
    const dir = project();
    const input = {
      operation_id: 'op-1', kind: 'accepted-continuation' as const, artistic_intent: 'Strengthen the focal edge.',
      clip_path: 'video-trace/clips/0001-op-1.mp4',
      started_at: '2026-10-01T00:00:00.000Z', stopped_at: '2026-10-01T00:00:01.000Z',
    };
    const first = appendProcessTraceEntry(dir, input);
    const resumed = appendProcessTraceEntry(dir, { ...input, outcome_note: 'duplicate resume must not replace history' });
    expect(resumed).toEqual(first);
    expect(readProcessTraceManifest(dir).entries).toHaveLength(1);
  });

  it('builds deterministic concat and SRT inputs from Guard chronology while retaining correction notes', () => {
    const dir = project();
    const clipDir = path.join(dir, 'video-trace', 'clips');
    fs.mkdirSync(clipDir, { recursive: true });
    fs.writeFileSync(path.join(clipDir, '0001-attempt.mp4'), 'clip-one');
    fs.writeFileSync(path.join(clipDir, '0002-correction.mp4'), 'clip-two');
    appendProcessTraceEntry(dir, {
      operation_id: 'attempt', kind: 'attempt', artistic_intent: 'Try the wider silhouette.',
      clip_path: 'video-trace/clips/0001-attempt.mp4',
      started_at: '2026-10-01T00:00:00.000Z', stopped_at: '2026-10-01T00:00:01.250Z',
      outcome_note: 'Too wide; correct it.',
    });
    appendProcessTraceEntry(dir, {
      operation_id: 'correction', kind: 'correction', artistic_intent: 'Narrow the silhouette.',
      clip_path: 'video-trace/clips/0002-correction.mp4',
      started_at: '2026-10-01T00:10:00.000Z', stopped_at: '2026-10-01T00:10:02.000Z',
      outcome_operation_id: 'attempt',
    });
    const plan = buildProcessTraceAssemblyPlan(dir);
    expect(plan.total_duration_ms).toBe(3250);
    expect(fs.readFileSync(plan.concat_list_path, 'utf8')).toContain('0001-attempt.mp4');
    const srt = fs.readFileSync(plan.subtitles_path, 'utf8');
    expect(srt).toContain('00:00:00,000 --> 00:00:01,250');
    expect(srt).toContain('Try the wider silhouette. — Too wide; correct it.');
    expect(srt).toContain('00:00:01,250 --> 00:00:03,250');
    expect(srt).not.toContain('00:10:00');
    const args = processTraceAssemblyFfmpegArgs(plan);
    expect(args).toContain('concat');
    expect(args.some(arg => arg.startsWith('subtitles='))).toBe(true);
    expect(args).toContain('-an');
  });

  it('fails closed when deterministic assembly references a missing clip', () => {
    const dir = project();
    appendProcessTraceEntry(dir, {
      operation_id: 'missing', kind: 'attempt', artistic_intent: 'Visible attempt.',
      clip_path: 'video-trace/clips/missing.mp4',
      started_at: '2026-10-01T00:00:00.000Z', stopped_at: '2026-10-01T00:00:01.000Z',
    });
    expect(() => buildProcessTraceAssemblyPlan(dir))
      .toThrow('process_video_trace_assembly_clip_missing:missing');
  });

  it('exposes a controlled assembler entry point and fails closed when FFmpeg cannot start', async () => {
    const dir = project();
    const clipDir = path.join(dir, 'video-trace', 'clips');
    fs.mkdirSync(clipDir, { recursive: true });
    fs.writeFileSync(path.join(clipDir, '0001-attempt.mp4'), 'placeholder');
    appendProcessTraceEntry(dir, {
      operation_id: 'attempt', kind: 'attempt', artistic_intent: 'Strengthen the focal silhouette.',
      clip_path: 'video-trace/clips/0001-attempt.mp4',
      started_at: '2026-10-01T00:00:00.000Z', stopped_at: '2026-10-01T00:00:01.000Z',
    });
    await expect(assembleProcessTraceVideo(dir, { ffmpegPath: path.join(dir, 'missing-ffmpeg.exe') }))
      .rejects.toThrow('process_video_trace_assembly_spawn_failed');
    expect(fs.existsSync(path.join(dir, 'video-trace', 'process-trace-captioned.mp4'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'video-trace', 'assembly.ffconcat'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'video-trace', 'captions.srt'))).toBe(true);
  });
});
