import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PROCESS_VIDEO_TRACE_PROTOCOL = 'photoshop.guard.process_video_trace.v1';
export const PROCESS_VIDEO_TRACE_SETTINGS_PROTOCOL = 'paintpilot.process_video_trace.settings.v1';

const DEFAULT_PROCESS_VIDEO_TRACE_SETTINGS_PATH = fileURLToPath(
  new URL('../../.photoshop-runtime/process-video-trace-settings.json', import.meta.url)
);

export type ProcessTraceKind = 'attempt' | 'correction' | 'rollback' | 'accepted-continuation';

export interface ProcessTraceEntry {
  protocol: typeof PROCESS_VIDEO_TRACE_PROTOCOL;
  sequence: number;
  operation_id: string;
  kind: ProcessTraceKind;
  artistic_intent: string;
  commentary_path?: string;
  clip_path: string;
  started_at: string;
  stopped_at: string;
  outcome_operation_id?: string;
  outcome_note?: string;
}

export interface ProcessTraceManifest {
  protocol: typeof PROCESS_VIDEO_TRACE_PROTOCOL;
  entries: ProcessTraceEntry[];
}

export interface ProcessVideoCapture {
  operation_id: string;
  clip_path: string;
  absolute_clip_path: string;
  started_at: string;
  recorder_started_at?: string;
  capture_target?: string;
  process: ChildProcessWithoutNullStreams;
  ffmpeg_path?: string;
  first_frame_at?: string;
  action_started_at?: string;
  action_stopped_at?: string;
  action_start_frame_count?: number;
  action_end_frame_count?: number;
  progress_frame_count?: number;
  diagnostic_stderr?: string;
  wake_warning?: string;
}

export interface ProcessVideoCaptureResult {
  enabled: boolean;
  capture?: ProcessVideoCapture;
  warning?: string;
}

export interface ProcessVideoCaptureReadyResult {
  ready: boolean;
  first_frame_at?: string;
  warning?: string;
}

export interface ProcessVideoTraceSettingState {
  protocol: typeof PROCESS_VIDEO_TRACE_SETTINGS_PROTOCOL;
  enabled: boolean;
  source: 'runtime' | 'environment' | 'default';
  settings_path: string;
  updated_at?: string;
  warning?: string;
}

export type ProcessVideoFfmpegReadiness =
  | { status: 'ready'; executable: string; version?: string }
  | { status: 'not-found'; executable: string; error: string }
  | { status: 'failed-to-start'; executable: string; error: string };

export type ProcessVideoPhotoshopWindowReadiness =
  | { status: 'ready'; capture_target: string; capture_backend: 'gfxcapture' | 'gdigrab' }
  | { status: 'not-found'; error: string }
  | { status: 'failed'; error: string };

export interface ProcessVideoTraceReadiness {
  ready: boolean;
  status:
    | 'ready'
    | 'ffmpeg-not-found'
    | 'ffmpeg-failed-to-start'
    | 'photoshop-window-not-found'
    | 'photoshop-window-failed';
  ffmpeg: ProcessVideoFfmpegReadiness;
  photoshop_window: ProcessVideoPhotoshopWindowReadiness;
  checked_at: string;
}

export interface ProcessTraceAssemblyPlan {
  concat_list_path: string;
  subtitles_path: string;
  output_path: string;
  entries: ProcessTraceEntry[];
  total_duration_ms: number;
}

export interface ProcessTraceAssemblyResult {
  plan: ProcessTraceAssemblyPlan;
  ffmpeg_path: string;
  exit_code: number;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function processVideoTraceSettingsPath(): string {
  return DEFAULT_PROCESS_VIDEO_TRACE_SETTINGS_PATH;
}

export function readProcessVideoTraceSetting(options: {
  settingsPath?: string;
  envEnabled?: string;
} = {}): ProcessVideoTraceSettingState {
  const settingsPath = options.settingsPath ?? processVideoTraceSettingsPath();
  const envEnabled = options.envEnabled ?? process.env.PAINTPILOT_PROCESS_VIDEO_TRACE;
  if (fs.existsSync(settingsPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as {
        protocol?: string;
        enabled?: unknown;
        updated_at?: unknown;
      };
      if (parsed.protocol !== PROCESS_VIDEO_TRACE_SETTINGS_PROTOCOL || typeof parsed.enabled !== 'boolean') {
        throw new Error('process_video_trace_settings_invalid');
      }
      return {
        protocol: PROCESS_VIDEO_TRACE_SETTINGS_PROTOCOL,
        enabled: parsed.enabled,
        source: 'runtime',
        settings_path: settingsPath,
        ...(typeof parsed.updated_at === 'string' && parsed.updated_at.trim()
          ? { updated_at: parsed.updated_at.trim() }
          : {}),
      };
    } catch (error) {
      const fallbackEnabled = envEnabled === '1';
      return {
        protocol: PROCESS_VIDEO_TRACE_SETTINGS_PROTOCOL,
        enabled: fallbackEnabled,
        source: envEnabled === '1' || envEnabled === '0' ? 'environment' : 'default',
        settings_path: settingsPath,
        warning: `process_video_trace_settings_read_failed:${String((error as Error)?.message ?? error)}`,
      };
    }
  }
  return {
    protocol: PROCESS_VIDEO_TRACE_SETTINGS_PROTOCOL,
    enabled: envEnabled === '1',
    source: envEnabled === '1' || envEnabled === '0' ? 'environment' : 'default',
    settings_path: settingsPath,
  };
}

export function setProcessVideoTraceEnabled(
  enabled: boolean,
  options: { settingsPath?: string } = {}
): ProcessVideoTraceSettingState {
  const settingsPath = options.settingsPath ?? processVideoTraceSettingsPath();
  const updatedAt = new Date().toISOString();
  const payload = {
    protocol: PROCESS_VIDEO_TRACE_SETTINGS_PROTOCOL,
    enabled,
    updated_at: updatedAt,
  };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const temp = `${settingsPath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, settingsPath);
  return {
    protocol: PROCESS_VIDEO_TRACE_SETTINGS_PROTOCOL,
    enabled,
    source: 'runtime',
    settings_path: settingsPath,
    updated_at: updatedAt,
  };
}

export function processTraceDirectory(projectDirectory: string): string {
  return path.join(projectDirectory, 'video-trace');
}

export function processTraceManifestPath(projectDirectory: string): string {
  return path.join(processTraceDirectory(projectDirectory), 'manifest.json');
}

export function readProcessTraceManifest(projectDirectory: string): ProcessTraceManifest {
  const manifestPath = processTraceManifestPath(projectDirectory);
  if (!fs.existsSync(manifestPath)) return { protocol: PROCESS_VIDEO_TRACE_PROTOCOL, entries: [] };
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Partial<ProcessTraceManifest>;
  if (parsed.protocol !== PROCESS_VIDEO_TRACE_PROTOCOL || !Array.isArray(parsed.entries)) {
    throw new Error('process_video_trace_manifest_invalid');
  }
  return { protocol: PROCESS_VIDEO_TRACE_PROTOCOL, entries: parsed.entries };
}

export function traceArtisticIntent(operation: Record<string, unknown>): string {
  const intent = cleanText(operation.artistic_commentary);
  if (!intent) throw new Error('process_video_trace_artistic_intent_required');
  return intent;
}

export function appendProcessTraceEntry(
  projectDirectory: string,
  input: Omit<ProcessTraceEntry, 'protocol' | 'sequence'>
): ProcessTraceEntry {
  const manifest = readProcessTraceManifest(projectDirectory);
  const existing = manifest.entries.find(entry => entry.operation_id === input.operation_id);
  if (existing) return existing;
  const entry: ProcessTraceEntry = {
    protocol: PROCESS_VIDEO_TRACE_PROTOCOL,
    sequence: manifest.entries.length + 1,
    ...input,
  };
  const traceDir = processTraceDirectory(projectDirectory);
  fs.mkdirSync(path.join(traceDir, 'clips'), { recursive: true });
  const manifestPath = processTraceManifestPath(projectDirectory);
  const tmp = manifestPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({
    protocol: PROCESS_VIDEO_TRACE_PROTOCOL,
    entries: [...manifest.entries, entry],
  }, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, manifestPath);
  return entry;
}

export function deterministicTraceAssemblyInputs(projectDirectory: string): ProcessTraceEntry[] {
  return [...readProcessTraceManifest(projectDirectory).entries]
    .sort((a, b) => a.sequence - b.sequence);
}

function traceDurationMs(entry: ProcessTraceEntry): number {
  const start = Date.parse(entry.started_at);
  const stop = Date.parse(entry.stopped_at);
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) {
    throw new Error(`process_video_trace_duration_invalid:${entry.operation_id}`);
  }
  return stop - start;
}

function srtTimestamp(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

function escapeSrtText(value: string): string {
  return value.replace(/\r?\n+/g, ' ').trim();
}

function concatPath(value: string): string {
  return value.replace(/'/g, `'\\''`);
}

export function buildProcessTraceAssemblyPlan(
  projectDirectory: string,
  options: { outputFile?: string } = {}
): ProcessTraceAssemblyPlan {
  const entries = deterministicTraceAssemblyInputs(projectDirectory);
  if (entries.length === 0) throw new Error('process_video_trace_assembly_empty');
  const traceDir = processTraceDirectory(projectDirectory);
  fs.mkdirSync(traceDir, { recursive: true });
  const concatList = path.join(traceDir, 'assembly.ffconcat');
  const subtitles = path.join(traceDir, 'captions.srt');
  const output = path.join(traceDir, options.outputFile ?? 'process-trace-captioned.mp4');
  let cursor = 0;
  const concatLines = ['ffconcat version 1.0'];
  const srtBlocks: string[] = [];
  entries.forEach((entry, index) => {
    const absoluteClip = path.resolve(projectDirectory, ...entry.clip_path.split('/'));
    if (!fs.existsSync(absoluteClip) || fs.statSync(absoluteClip).size === 0) {
      throw new Error(`process_video_trace_assembly_clip_missing:${entry.operation_id}`);
    }
    const duration = traceDurationMs(entry);
    concatLines.push(`file '${concatPath(absoluteClip.replace(/\\/g, '/'))}'`);
    const end = cursor + duration;
    const outcome = cleanText(entry.outcome_note);
    const caption = outcome
      ? `${entry.artistic_intent} — ${outcome}`
      : entry.artistic_intent;
    srtBlocks.push(`${index + 1}\n${srtTimestamp(cursor)} --> ${srtTimestamp(end)}\n${escapeSrtText(caption)}`);
    cursor = end;
  });
  fs.writeFileSync(concatList, concatLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(subtitles, srtBlocks.join('\n\n') + '\n', 'utf8');
  return {
    concat_list_path: concatList,
    subtitles_path: subtitles,
    output_path: output,
    entries,
    total_duration_ms: cursor,
  };
}

export function processTraceAssemblyFfmpegArgs(plan: ProcessTraceAssemblyPlan): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', plan.concat_list_path,
    '-vf', `subtitles=${plan.subtitles_path.replace(/\\/g, '/').replace(/:/g, '\\:')}`,
    '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-an', plan.output_path,
  ];
}

export async function assembleProcessTraceVideo(
  projectDirectory: string,
  options: { outputFile?: string; ffmpegPath?: string } = {}
): Promise<ProcessTraceAssemblyResult> {
  const plan = buildProcessTraceAssemblyPlan(projectDirectory, { outputFile: options.outputFile });
  const executable = options.ffmpegPath ?? process.env.PAINTPILOT_FFMPEG_PATH ?? 'ffmpeg';
  const args = processTraceAssemblyFfmpegArgs(plan);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', error => reject(new Error('process_video_trace_assembly_spawn_failed:' + error.message)));
    child.once('exit', code => {
      if (code === 0) return resolve();
      const detail = stderr.trim().replace(/\s+/g, ' ').slice(-1000);
      reject(new Error('process_video_trace_assembly_failed:' + (code ?? 'signal') + (detail ? ':' + detail : '')));
    });
  });
  if (!fs.existsSync(plan.output_path) || fs.statSync(plan.output_path).size === 0) {
    throw new Error('process_video_trace_assembly_output_missing_or_empty');
  }
  return { plan, ffmpeg_path: executable, exit_code: 0 };
}

function safeOperationFilePart(operationId: string): string {
  return operationId.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 96) || 'operation';
}

export function processVideoFfmpegArgs(captureTarget: string, absoluteClip: string): string[] {
  const hwndMatch = /^hwnd=(0x[0-9a-f]+|[0-9]+)$/i.exec(captureTarget.trim());
  if (hwndMatch) {
    let hwnd: bigint;
    try {
      hwnd = BigInt(hwndMatch[1]);
    } catch {
      throw new Error('process_video_trace_photoshop_window_handle_invalid');
    }
    if (hwnd <= 0n) throw new Error('process_video_trace_photoshop_window_handle_invalid');
    return [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-progress', 'pipe:1', '-stats_period', '0.05', '-nostats',
      '-f', 'lavfi',
      '-i', `gfxcapture=hwnd=${hwnd.toString()}:capture_cursor=0:capture_border=0:max_framerate=30`,
      '-vf', 'hwdownload,format=bgra,format=yuv420p',
      '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
      '-bf', '0', '-g', '30', '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
      '-an', absoluteClip,
    ];
  }
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-progress', 'pipe:1', '-stats_period', '0.05', '-nostats',
    '-f', 'gdigrab', '-framerate', '30', '-i', captureTarget,
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
    '-bf', '0', '-g', '30', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', absoluteClip,
  ];
}

export function photoshopHwndCaptureTarget(handle: string | number | bigint): string {
  let parsed: bigint;
  try {
    parsed = typeof handle === 'bigint' ? handle : BigInt(String(handle).trim());
  } catch {
    throw new Error('process_video_trace_photoshop_window_handle_invalid');
  }
  if (parsed <= 0n) throw new Error('process_video_trace_photoshop_window_handle_invalid');
  return `hwnd=0x${parsed.toString(16).toUpperCase()}`;
}

export function discoverPhotoshopCaptureTarget(
  options: { powershellPath?: string; platform?: NodeJS.Platform } = {}
): string {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') throw new Error('process_video_trace_photoshop_window_discovery_windows_only');
  const powershell = options.powershellPath ?? 'powershell.exe';
  const script = [
    "$p = Get-Process -Name Photoshop -ErrorAction SilentlyContinue",
    "| Where-Object { $_.MainWindowHandle -ne 0 -and -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle) }",
    '| Sort-Object StartTime',
    '| Select-Object -First 1;',
    "if ($null -eq $p) { [Console]::Error.Write('photoshop_window_not_found'); exit 3 };",
    '[Console]::Out.Write($p.MainWindowHandle.ToInt64().ToString())',
  ].join(' ');
  const result = spawnSync(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 3000,
  });
  if (result.error) {
    throw new Error(`process_video_trace_photoshop_window_discovery_failed:${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = cleanText(result.stderr)?.replace(/\s+/g, ' ').slice(-500);
    throw new Error(`process_video_trace_photoshop_window_discovery_failed:${detail ?? result.status ?? 'unknown'}`);
  }
  const handle = cleanText(result.stdout);
  if (!handle) throw new Error('process_video_trace_photoshop_window_discovery_failed:empty_handle');
  return photoshopHwndCaptureTarget(handle);
}

export function resolveProcessVideoCaptureTarget(options: {
  captureTarget?: string;
  envCaptureTarget?: string;
  discoverCaptureTarget?: () => string;
} = {}): string {
  const explicit = cleanText(options.captureTarget) ?? cleanText(options.envCaptureTarget);
  if (explicit) return explicit;
  return (options.discoverCaptureTarget ?? discoverPhotoshopCaptureTarget)();
}

function probeFfmpegReadiness(
  executable: string,
  options: { requireGfxCapture?: boolean } = {}
): ProcessVideoFfmpegReadiness {
  const result = spawnSync(executable, ['-version'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 3000,
  });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    return code === 'ENOENT'
      ? { status: 'not-found', executable, error: result.error.message }
      : { status: 'failed-to-start', executable, error: result.error.message };
  }
  if (result.status !== 0) {
    const detail = cleanText(result.stderr)?.replace(/\s+/g, ' ').slice(-500);
    return {
      status: 'failed-to-start',
      executable,
      error: detail ?? `ffmpeg_exit_${String(result.status ?? 'unknown')}`,
    };
  }
  const version = cleanText(result.stdout)?.split(/\r?\n/, 1)[0];
  if (options.requireGfxCapture) {
    const gfx = spawnSync(executable, ['-hide_banner', '-h', 'filter=gfxcapture'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000,
    });
    const help = `${gfx.stdout ?? ''}\n${gfx.stderr ?? ''}`;
    if (gfx.error || gfx.status !== 0 || !help.includes('Filter gfxcapture')) {
      const detail = gfx.error?.message
        ?? cleanText(help)?.replace(/\s+/g, ' ').slice(-500)
        ?? 'gfxcapture_unavailable';
      return { status: 'failed-to-start', executable, error: `gfxcapture_unavailable:${detail}` };
    }
  }
  return { status: 'ready', executable, ...(version ? { version } : {}) };
}

export function probeProcessVideoTraceReadiness(options: {
  ffmpegPath?: string;
  captureTarget?: string;
  envCaptureTarget?: string;
  discoverCaptureTarget?: () => string;
  ffmpegProbe?: (executable: string) => ProcessVideoFfmpegReadiness;
} = {}): ProcessVideoTraceReadiness {
  const executable = options.ffmpegPath ?? process.env.PAINTPILOT_FFMPEG_PATH ?? 'ffmpeg';
  let photoshopWindow: ProcessVideoPhotoshopWindowReadiness;
  try {
    const captureTarget = resolveProcessVideoCaptureTarget({
      captureTarget: options.captureTarget,
      envCaptureTarget: options.envCaptureTarget ?? process.env.PAINTPILOT_PHOTOSHOP_CAPTURE_TARGET,
      discoverCaptureTarget: options.discoverCaptureTarget,
    });
    photoshopWindow = {
      status: 'ready',
      capture_target: captureTarget,
      capture_backend: /^hwnd=(0x[0-9a-f]+|[0-9]+)$/i.test(captureTarget.trim()) ? 'gfxcapture' : 'gdigrab',
    };
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    photoshopWindow = message.includes('photoshop_window_not_found')
      ? { status: 'not-found', error: message }
      : { status: 'failed', error: message };
  }
  const requireGfxCapture = photoshopWindow.status === 'ready'
    && photoshopWindow.capture_backend === 'gfxcapture';
  const ffmpeg = options.ffmpegProbe
    ? options.ffmpegProbe(executable)
    : probeFfmpegReadiness(executable, { requireGfxCapture });
  const status: ProcessVideoTraceReadiness['status'] =
    ffmpeg.status === 'not-found' ? 'ffmpeg-not-found'
      : ffmpeg.status === 'failed-to-start' ? 'ffmpeg-failed-to-start'
        : photoshopWindow.status === 'not-found' ? 'photoshop-window-not-found'
          : photoshopWindow.status === 'failed' ? 'photoshop-window-failed'
            : 'ready';
  return {
    ready: status === 'ready',
    status,
    ffmpeg,
    photoshop_window: photoshopWindow,
    checked_at: new Date().toISOString(),
  };
}

export function startProcessVideoCapture(
  projectDirectory: string,
  operationId: string,
  options: {
    enabled?: boolean;
    ffmpegPath?: string;
    captureTarget?: string;
    discoverCaptureTarget?: () => string;
  } = {}
): ProcessVideoCaptureResult {
  const enabled = options.enabled ?? readProcessVideoTraceSetting().enabled;
  if (!enabled) return { enabled: false };
  try {
    const manifest = readProcessTraceManifest(projectDirectory);
    if (manifest.entries.some(entry => entry.operation_id === operationId)) {
      return { enabled: true, warning: 'process_video_trace_operation_already_recorded' };
    }
    const sequence = manifest.entries.length + 1;
    const relativeClip = `video-trace/clips/${String(sequence).padStart(4, '0')}-${safeOperationFilePart(operationId)}.mp4`;
    const absoluteClip = path.join(projectDirectory, ...relativeClip.split('/'));
    fs.mkdirSync(path.dirname(absoluteClip), { recursive: true });
    const executable = options.ffmpegPath ?? process.env.PAINTPILOT_FFMPEG_PATH ?? 'ffmpeg';
    const target = resolveProcessVideoCaptureTarget({
      captureTarget: options.captureTarget,
      envCaptureTarget: process.env.PAINTPILOT_PHOTOSHOP_CAPTURE_TARGET,
      discoverCaptureTarget: options.discoverCaptureTarget,
    });
    const child = spawn(executable, processVideoFfmpegArgs(target, absoluteClip), {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    const recorderStartedAt = new Date().toISOString();
    const capture: ProcessVideoCapture = {
      operation_id: operationId, clip_path: relativeClip, absolute_clip_path: absoluteClip,
      started_at: recorderStartedAt, recorder_started_at: recorderStartedAt,
      capture_target: target, process: child, ffmpeg_path: executable,
      progress_frame_count: 0, diagnostic_stderr: '',
    };
    let progressTail = '';
    child.stdout.on('data', chunk => {
      progressTail += String(chunk);
      const lines = progressTail.split(/\r?\n/);
      progressTail = lines.pop() ?? '';
      for (const line of lines) {
        const match = /^frame=(\d+)$/.exec(line.trim());
        if (!match) continue;
        const frameCount = Number(match[1]);
        if (!Number.isFinite(frameCount)) continue;
        capture.progress_frame_count = Math.max(capture.progress_frame_count ?? 0, frameCount);
        if (frameCount > 0 && !capture.first_frame_at) {
          const firstFrameAt = new Date().toISOString();
          capture.first_frame_at = firstFrameAt;
        }
      }
    });
    child.stderr.on('data', chunk => {
      capture.diagnostic_stderr = `${capture.diagnostic_stderr ?? ''}${String(chunk)}`.slice(-16_000);
    });
    child.on('error', error => {
      capture.diagnostic_stderr = `${capture.diagnostic_stderr ?? ''}\n${error.message}`.slice(-16_000);
    });
    return { enabled: true, capture };
  } catch (error) {
    return { enabled: true, warning: `process_video_trace_start_failed:${String((error as Error)?.message ?? error)}` };
  }
}

function processVideoDiagnosticSuffix(capture: ProcessVideoCapture): string {
  const detail = cleanText(capture.diagnostic_stderr)?.replace(/\s+/g, ' ').slice(-1000);
  return detail ? `:${detail}` : '';
}

async function waitForCaptureFrameAdvance(
  capture: ProcessVideoCapture,
  baseline: number,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() <= deadline) {
    if ((capture.progress_frame_count ?? 0) > baseline) return true;
    if (capture.process.exitCode != null || capture.process.killed) return false;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return (capture.progress_frame_count ?? 0) > baseline;
}

export async function waitForProcessVideoCaptureReady(
  capture: ProcessVideoCapture,
  options: { timeoutMs?: number } = {}
): Promise<ProcessVideoCaptureReadyResult> {
  if ((capture.progress_frame_count ?? 0) > 0 && capture.first_frame_at) {
    return { ready: true, first_frame_at: capture.first_frame_at };
  }
  const timeoutMs = Math.max(100, Math.min(10_000, Number(options.timeoutMs ?? 3000)));
  const ready = await waitForCaptureFrameAdvance(capture, 0, timeoutMs);
  if (ready && capture.first_frame_at) {
    return { ready: true, first_frame_at: capture.first_frame_at };
  }
  if (capture.process.exitCode != null) {
    return {
      ready: false,
      warning: `process_video_trace_ffmpeg_exited_before_first_frame:${capture.process.exitCode}${processVideoDiagnosticSuffix(capture)}`,
    };
  }
  return {
    ready: false,
    warning: `process_video_trace_first_frame_timeout:${timeoutMs}${processVideoDiagnosticSuffix(capture)}`,
  };
}

function captureHwnd(capture: ProcessVideoCapture): bigint | undefined {
  const match = /^hwnd=(0x[0-9a-f]+|[0-9]+)$/i.exec(String(capture.capture_target ?? '').trim());
  if (!match) return undefined;
  try {
    const hwnd = BigInt(match[1]);
    return hwnd > 0n ? hwnd : undefined;
  } catch {
    return undefined;
  }
}

export function wakeProcessVideoCaptureWindow(
  capture: ProcessVideoCapture,
  options: { powershellPath?: string; platform?: NodeJS.Platform } = {}
): { woke: boolean; warning?: string } {
  const platform = options.platform ?? process.platform;
  const hwnd = captureHwnd(capture);
  if (!hwnd || platform !== 'win32') return { woke: false };
  const powershell = options.powershellPath ?? 'powershell.exe';
  const typeDefinition = [
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class PaintPilotVideoWake {',
    '  [DllImport("user32.dll")] public static extern bool RedrawWindow(IntPtr hWnd, IntPtr lprcUpdate, IntPtr hrgnUpdate, uint flags);',
    '}',
  ].join(' ');
  const script = [
    `Add-Type -TypeDefinition '${typeDefinition.replace(/'/g, "''")}';`,
    `$ok = [PaintPilotVideoWake]::RedrawWindow([IntPtr]${hwnd.toString()}, [IntPtr]::Zero, [IntPtr]::Zero, 0x181);`,
    "if (-not $ok) { [Console]::Error.Write('redraw_window_failed'); exit 4 }",
  ].join(' ');
  const result = spawnSync(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script,
  ], {
    encoding: 'utf8', windowsHide: true, timeout: 3000,
  });
  if (!result.error && result.status === 0) return { woke: true };
  const detail = result.error?.message
    ?? cleanText(result.stderr)?.replace(/\s+/g, ' ').slice(-500)
    ?? `powershell_exit_${String(result.status ?? 'unknown')}`;
  return { woke: false, warning: `process_video_trace_redraw_failed:${detail}` };
}

async function waitForProcessExit(capture: ProcessVideoCapture, timeoutMs: number): Promise<boolean> {
  const child = capture.process;
  if (child.exitCode != null) return true;
  return new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
    child.once('exit', () => { clearTimeout(timer); resolve(true); });
    child.once('error', () => { clearTimeout(timer); resolve(false); });
  });
}

async function stopCaptureProcess(capture: ProcessVideoCapture, timeoutMs = 5000): Promise<boolean> {
  const child = capture.process;
  if (child.exitCode == null && !child.killed) child.stdin.write('q\n');
  // gfxcapture can be blocked waiting for the next Windows.Graphics.Capture
  // frame and therefore not return to FFmpeg's stdin loop to consume `q`.
  // Give ordinary shutdown a brief chance first; only then request a harmless
  // redraw of the same HWND. RedrawWindow does not focus, raise or activate
  // Photoshop, but it wakes WGC so FFmpeg can observe `q` and finalize MP4.
  let exited = await waitForProcessExit(capture, Math.min(75, timeoutMs));
  if (!exited && child.exitCode == null && !child.killed) {
    const wake = wakeProcessVideoCaptureWindow(capture);
    if (wake.warning) capture.wake_warning = wake.warning;
    exited = await waitForProcessExit(capture, Math.max(0, timeoutMs - Math.min(75, timeoutMs)));
  }
  if (!exited && child.exitCode == null && !child.killed) child.kill();
  return exited;
}

export async function discardProcessVideoCapture(capture: ProcessVideoCapture): Promise<void> {
  await stopCaptureProcess(capture, 2000);
  try {
    if (fs.existsSync(capture.absolute_clip_path)) fs.rmSync(capture.absolute_clip_path, { force: true });
  } catch {
    // Diagnostic cleanup must never affect the Photoshop mutation lane.
  }
}

export async function prepareProcessVideoCapture(
  projectDirectory: string,
  operationId: string,
  options: {
    enabled?: boolean;
    ffmpegPath?: string;
    captureTarget?: string;
    discoverCaptureTarget?: () => string;
    warmupMs?: number;
  } = {}
): Promise<ProcessVideoCaptureResult> {
  const enabled = options.enabled ?? readProcessVideoTraceSetting().enabled;
  if (!enabled) return { enabled: false };
  const started = startProcessVideoCapture(projectDirectory, operationId, {
    enabled: true,
    ffmpegPath: options.ffmpegPath,
    captureTarget: options.captureTarget,
    discoverCaptureTarget: options.discoverCaptureTarget,
  });
  if (!started.capture) return started;
  const warmupMs = Math.max(0, Math.min(1000, Number(options.warmupMs ?? 120)));
  if (warmupMs) await new Promise(resolve => setTimeout(resolve, warmupMs));
  if (started.capture.process.exitCode != null || started.capture.process.killed) {
    const warning = `process_video_trace_ffmpeg_exited_during_warmup:${started.capture.process.exitCode ?? 'killed'}${processVideoDiagnosticSuffix(started.capture)}`;
    await discardProcessVideoCapture(started.capture);
    return { enabled: true, warning };
  }
  started.capture.action_started_at = new Date().toISOString();
  started.capture.action_start_frame_count = started.capture.progress_frame_count ?? 0;
  started.capture.started_at = started.capture.action_started_at;
  return started;
}

function validateProcessVideoClip(capture: ProcessVideoCapture): string | undefined {
  const executable = capture.ffmpeg_path ?? process.env.PAINTPILOT_FFMPEG_PATH ?? 'ffmpeg';
  const result = spawnSync(executable, [
    '-hide_banner', '-loglevel', 'error',
    '-i', capture.absolute_clip_path,
    '-map', '0:v:0', '-frames:v', '1', '-f', 'null', '-',
  ], {
    encoding: 'utf8', windowsHide: true, timeout: 5000,
  });
  if (!result.error && result.status === 0) return undefined;
  const detail = result.error?.message
    ?? cleanText(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)?.replace(/\s+/g, ' ').slice(-1000)
    ?? `ffmpeg_exit_${String(result.status ?? 'unknown')}`;
  return `process_video_trace_clip_invalid:${detail}`;
}

function trimProcessVideoClipToAction(capture: ProcessVideoCapture): string | undefined {
  const startFrame = capture.action_start_frame_count;
  const endFrame = capture.action_end_frame_count;
  if (typeof startFrame !== 'number' || typeof endFrame !== 'number' || endFrame <= startFrame) {
    return 'process_video_trace_action_frame_bounds_invalid';
  }
  const executable = capture.ffmpeg_path ?? process.env.PAINTPILOT_FFMPEG_PATH ?? 'ffmpeg';
  const trimmedPath = `${capture.absolute_clip_path}.trimmed.mp4`;
  const filter = `trim=start_frame=${Math.max(0, Math.floor(startFrame))}:end_frame=${Math.max(1, Math.floor(endFrame))},setpts=PTS-STARTPTS`;
  const result = spawnSync(executable, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', capture.absolute_clip_path,
    '-vf', filter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
    '-bf', '0', '-g', '30', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-an',
    trimmedPath,
  ], {
    encoding: 'utf8', windowsHide: true, timeout: 10_000,
  });
  if (result.error || result.status !== 0 || !fs.existsSync(trimmedPath) || fs.statSync(trimmedPath).size === 0) {
    try { fs.rmSync(trimmedPath, { force: true }); } catch { /* diagnostic cleanup only */ }
    const detail = result.error?.message
      ?? cleanText(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)?.replace(/\s+/g, ' ').slice(-1000)
      ?? `ffmpeg_exit_${String(result.status ?? 'unknown')}`;
    return `process_video_trace_trim_failed:${detail}`;
  }
  fs.rmSync(capture.absolute_clip_path, { force: true });
  fs.renameSync(trimmedPath, capture.absolute_clip_path);
  return undefined;
}

export async function stopProcessVideoCapture(
  projectDirectory: string,
  capture: ProcessVideoCapture,
  operation: Record<string, unknown>,
  options: { kind?: ProcessTraceKind; settleMs?: number; outcomeNote?: string } = {}
): Promise<{ entry?: ProcessTraceEntry; warning?: string }> {
  try {
    capture.action_stopped_at = new Date().toISOString();
    const settleMs = Math.max(0, Math.min(5000, Number(options.settleMs ?? process.env.PAINTPILOT_VIDEO_SETTLE_MS ?? 1500)));
    const actionBaseline = capture.action_start_frame_count;
    if (settleMs) {
      if (typeof actionBaseline === 'number') {
        await waitForCaptureFrameAdvance(capture, actionBaseline, settleMs);
      } else {
        await new Promise(resolve => setTimeout(resolve, settleMs));
      }
    }
    capture.action_end_frame_count = capture.progress_frame_count ?? 0;
    if (typeof actionBaseline === 'number' && capture.action_end_frame_count <= actionBaseline) {
      await discardProcessVideoCapture(capture);
      return { warning: `process_video_trace_no_action_frame${processVideoDiagnosticSuffix(capture)}` };
    }
    // FFmpeg's interactive `q` command must remain readable from the pipe long
    // enough for gfxcapture/lavfi to process it. Ending stdin in the same call
    // can race the command and leave the capture process running with only an
    // unfinalized MP4 header. Keep the pipe open; process exit closes it.
    const exited = await stopCaptureProcess(capture);
    if (!exited) {
      const wakeDetail = capture.wake_warning ? `:${capture.wake_warning}` : '';
      return { warning: `process_video_trace_ffmpeg_stop_timeout${wakeDetail}${processVideoDiagnosticSuffix(capture)}` };
    }
    if (!fs.existsSync(capture.absolute_clip_path) || fs.statSync(capture.absolute_clip_path).size === 0) {
      return { warning: 'process_video_trace_clip_missing_or_empty' };
    }
    const invalidWarning = capture.ffmpeg_path ? validateProcessVideoClip(capture) : undefined;
    if (invalidWarning) return { warning: `${invalidWarning}${processVideoDiagnosticSuffix(capture)}` };
    const trimWarning = capture.ffmpeg_path ? trimProcessVideoClipToAction(capture) : undefined;
    if (trimWarning) return { warning: `${trimWarning}${processVideoDiagnosticSuffix(capture)}` };
    const trimmedInvalidWarning = capture.ffmpeg_path ? validateProcessVideoClip(capture) : undefined;
    if (trimmedInvalidWarning) return { warning: `${trimmedInvalidWarning}${processVideoDiagnosticSuffix(capture)}` };
    const entry = appendProcessTraceEntry(projectDirectory, {
      operation_id: capture.operation_id,
      kind: options.kind ?? 'attempt',
      artistic_intent: traceArtisticIntent(operation),
      clip_path: capture.clip_path,
      started_at: capture.started_at,
      stopped_at: new Date().toISOString(),
      ...(options.outcomeNote ? { outcome_note: options.outcomeNote } : {}),
    });
    return { entry };
  } catch (error) {
    return { warning: `process_video_trace_stop_failed:${String((error as Error)?.message ?? error)}` };
  }
}
