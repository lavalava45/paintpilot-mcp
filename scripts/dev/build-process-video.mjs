#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { subtitleBlocks, distributeSubtitleBlocks } from './process-video-subtitles.mjs';

function fail(message) {
  console.error(`[build-process-video] ${message}`);
  process.exit(1);
}

function usage() {
  console.log(`
Usage:
  node scripts/dev/build-process-video.mjs <run-dir> [options]

Example:
  node scripts/dev/build-process-video.mjs processes/autumn-temple-process/run-02 --slowdown 4 --min-clip-duration 4

Options:
  --slowdown <factor>  Make the final video N times longer. Default: 1
  --min-clip-duration <seconds>
                       After slowdown, hold the final frame until each clip reaches
                       at least this duration. Default: 0 (disabled)
  --name <stem>        Output stem. Default: process-video
  --crf <value>        H.264 CRF when re-encoding. Default: 18
  --preset <name>      H.264 preset when re-encoding. Default: medium
  --keep-list          Keep the temporary FFmpeg concat list
  --help               Show this help

Outputs:
  <run-dir>/export/final/<name>.mp4
  <run-dir>/export/final/<name>.srt
  <run-dir>/export/final/<name>.timeline.json
`.trim());
}

function parseArgs(argv) {
  if (!argv.length || argv.includes('--help')) {
    usage();
    process.exit(argv.length ? 0 : 1);
  }

  const result = {
    runDir: argv[0],
    slowdown: 1,
    minClipDuration: 0,
    name: 'process-video',
    crf: 18,
    preset: 'medium',
    keepList: false,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--slowdown') result.slowdown = Number(argv[++i]);
    else if (arg === '--min-clip-duration') result.minClipDuration = Number(argv[++i]);
    else if (arg === '--name') result.name = argv[++i];
    else if (arg === '--crf') result.crf = Number(argv[++i]);
    else if (arg === '--preset') result.preset = argv[++i];
    else if (arg === '--keep-list') result.keepList = true;
    else fail(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(result.slowdown) || result.slowdown <= 0) {
    fail('--slowdown must be a positive number');
  }
  if (!Number.isFinite(result.minClipDuration) || result.minClipDuration < 0) {
    fail('--min-clip-duration must be zero or a positive number');
  }
  if (!Number.isFinite(result.crf) || result.crf < 0 || result.crf > 51) {
    fail('--crf must be between 0 and 51');
  }
  if (!result.name || /[\\/:*?"<>|]/.test(result.name)) {
    fail('--name must be a non-empty safe filename stem');
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) fail(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`${command} exited with code ${result.status}${details ? `\n${details}` : ''}`);
  }
  return result.stdout ?? '';
}

function probe(filePath) {
  const raw = run('ffprobe', [
    '-v', 'error',
    '-show_entries',
    'format=duration:stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,sample_rate,channel_layout',
    '-of', 'json',
    filePath,
  ]);
  const parsed = JSON.parse(raw);
  const duration = Number(parsed?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    fail(`Could not determine positive duration for ${filePath}`);
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
  if (!video) fail(`No video stream found in ${filePath}`);
  return {
    duration,
    video: {
      codec: video.codec_name ?? null,
      width: video.width ?? null,
      height: video.height ?? null,
      pixFmt: video.pix_fmt ?? null,
      frameRate: video.r_frame_rate ?? null,
    },
    audio: audio
      ? {
          codec: audio.codec_name ?? null,
          sampleRate: audio.sample_rate ?? null,
          channelLayout: audio.channel_layout ?? null,
        }
      : null,
  };
}

function streamSignature(info) {
  return JSON.stringify({
    video: info.video,
    audio: info.audio ? { present: true, ...info.audio } : { present: false },
  });
}

function srtTime(seconds) {
  const millis = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(millis / 3_600_000);
  const minutes = Math.floor((millis % 3_600_000) / 60_000);
  const secs = Math.floor((millis % 60_000) / 1000);
  const ms = millis % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function subtitleText(text) {
  // Blank lines terminate an SRT cue, so retain all meaningful text lines but
  // remove empty separators inside one operation's sidecar.
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function ffConcatPath(filePath) {
  const normalized = resolve(filePath).replaceAll('\\', '/');
  return normalized.replaceAll("'", "'\\''");
}

function atempoChain(tempo) {
  if (!Number.isFinite(tempo) || tempo <= 0) fail('Invalid audio tempo');
  const filters = [];
  let remaining = tempo;
  while (remaining < 0.5) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }
  while (remaining > 2) {
    filters.push('atempo=2');
    remaining /= 2;
  }
  filters.push(`atempo=${remaining.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}`);
  return filters.join(',');
}

const options = parseArgs(process.argv.slice(2));
const runDir = resolve(options.runDir);
const exportDir = join(runDir, 'export');
const manifestPath = join(exportDir, 'manifest.json');
const framesDir = join(exportDir, 'frames');
const finalDir = join(exportDir, 'final');

if (!existsSync(runDir)) fail(`Run directory does not exist: ${runDir}`);
if (!existsSync(manifestPath)) fail(`Missing export manifest: ${manifestPath}`);
if (!existsSync(framesDir)) fail(`Missing frames directory: ${framesDir}`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entries = [...(manifest.entries ?? [])].sort((a, b) => Number(a.sequence) - Number(b.sequence));
if (!entries.length) fail('Manifest has no video entries');

const clips = [];
let expectedSignature = null;

for (const entry of entries) {
  if (!entry.clip_path) fail(`Manifest entry ${entry.sequence ?? '?'} has no clip_path`);
  const clipPath = isAbsolute(entry.clip_path)
    ? entry.clip_path
    : resolve(runDir, entry.clip_path);
  if (!existsSync(clipPath)) fail(`Missing video clip: ${clipPath}`);

  const stem = basename(clipPath, extname(clipPath));
  const textPath = join(framesDir, `${stem}.txt`);
  if (!existsSync(textPath)) fail(`Missing matching subtitle text: ${textPath}`);

  const info = probe(clipPath);
  const signature = streamSignature(info);
  if (expectedSignature === null) expectedSignature = signature;
  if (signature !== expectedSignature) {
    fail(
      `Clip stream layout differs from the first clip and cannot be safely concatenated as one stream:\n${clipPath}\n`
      + `Expected: ${expectedSignature}\nActual:   ${signature}`,
    );
  }

  const rawText = readFileSync(textPath, 'utf8');
  const text = subtitleText(rawText);
  const blocks = subtitleBlocks(rawText);
  if (!text) fail(`Subtitle text is empty: ${textPath}`);

  const sourceDuration = info.duration;
  const slowedDuration = sourceDuration * options.slowdown;
  const holdDuration = Math.max(0, options.minClipDuration - slowedDuration);
  const plannedDuration = slowedDuration + holdDuration;

  clips.push({
    sequence: Number(entry.sequence),
    operationId: entry.operation_id ?? stem,
    kind: entry.kind ?? null,
    clipPath,
    textPath,
    text,
    blocks,
    info,
    sourceDuration,
    slowedDuration,
    holdDuration,
    plannedDuration,
    renderedDuration: sourceDuration,
    mediaPath: clipPath,
    manifestStartedAt: entry.started_at ?? null,
    manifestStoppedAt: entry.stopped_at ?? null,
  });
}

mkdirSync(finalDir, { recursive: true });
const videoPath = join(finalDir, `${options.name}.mp4`);
const srtPath = join(finalDir, `${options.name}.srt`);
const timelinePath = join(finalDir, `${options.name}.timeline.json`);
const concatListPath = join(finalDir, `.${options.name}.concat.txt`);
const partsDir = join(finalDir, `.${options.name}.parts`);

const needsPerClipRender = options.slowdown !== 1 || options.minClipDuration > 0;
const hasAudio = Boolean(clips[0]?.info?.audio);

if (needsPerClipRender) {
  rmSync(partsDir, { recursive: true, force: true });
  mkdirSync(partsDir, { recursive: true });

  for (const clip of clips) {
    const partPath = join(partsDir, `${String(clip.sequence).padStart(4, '0')}.mp4`);
    const videoFilters = [];
    if (options.slowdown !== 1) videoFilters.push(`setpts=${options.slowdown}*PTS`);
    if (clip.holdDuration > 0.0005) {
      videoFilters.push(`tpad=stop_mode=clone:stop_duration=${clip.holdDuration.toFixed(6)}`);
    }

    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-i', clip.clipPath,
      '-map', '0:v:0',
    ];

    if (videoFilters.length) args.push('-vf', videoFilters.join(','));
    args.push(
      '-c:v', 'libx264',
      '-preset', options.preset,
      '-crf', String(options.crf),
      '-pix_fmt', 'yuv420p',
    );

    if (hasAudio) {
      const audioFilters = [];
      if (options.slowdown !== 1) audioFilters.push(atempoChain(1 / options.slowdown));
      if (clip.holdDuration > 0.0005) {
        audioFilters.push(`apad=pad_dur=${clip.holdDuration.toFixed(6)}`);
      }
      args.push('-map', '0:a:0');
      if (audioFilters.length) args.push('-af', audioFilters.join(','));
      args.push('-c:a', 'aac', '-b:a', '192k');
    } else {
      args.push('-an');
    }

    args.push('-movflags', '+faststart', partPath);
    run('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    clip.mediaPath = partPath;
    clip.renderedDuration = probe(partPath).duration;
  }
}

let cursor = 0;
for (const clip of clips) {
  clip.start = cursor;
  clip.end = cursor + clip.renderedDuration;
  cursor = clip.end;
}

const concatList = clips
  .map((clip) => `file '${ffConcatPath(clip.mediaPath)}'`)
  .join('\n') + '\n';
writeFileSync(concatListPath, concatList, 'utf8');

const subtitleCues = [];
for (const clip of clips) {
  clip.subtitleCues = distributeSubtitleBlocks(clip.blocks, clip.start, clip.end, subtitleCues.length + 1);
  subtitleCues.push(...clip.subtitleCues);
}
const srt = subtitleCues
  .map((cue) => [
    String(cue.index),
    `${srtTime(cue.start)} --> ${srtTime(cue.end)}`,
    cue.text,
    '',
  ].join('\n'))
  .join('\n');

// BOM makes Russian subtitles more predictable in Windows video/editor software.
writeFileSync(srtPath, `\uFEFF${srt}`, 'utf8');

const ffmpegArgs = [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-f', 'concat',
  '-safe', '0',
  '-i', concatListPath,
];

ffmpegArgs.push('-c', 'copy', '-movflags', '+faststart', videoPath);

run('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

const finalProbe = probe(videoPath);
const expectedDuration = clips.at(-1)?.end ?? 0;
const drift = finalProbe.duration - expectedDuration;

const timeline = {
  protocol: 'paintpilot.process_video_timeline.v1',
  run_dir: runDir,
  manifest: manifestPath,
  slowdown: options.slowdown,
  min_clip_duration_seconds: options.minClipDuration,
  output_video: videoPath,
  output_subtitles: srtPath,
  subtitle_distribution: 'equal-commentary-blocks',
  subtitle_cue_count: subtitleCues.length,
  expected_duration_seconds: expectedDuration,
  actual_duration_seconds: finalProbe.duration,
  duration_drift_seconds: drift,
  clips: clips.map((clip) => ({
    sequence: clip.sequence,
    operation_id: clip.operationId,
    kind: clip.kind,
    clip_path: clip.clipPath,
    text_path: clip.textPath,
    source_duration_seconds: clip.sourceDuration,
    slowed_duration_seconds: clip.slowedDuration,
    hold_last_frame_seconds: clip.holdDuration,
    planned_duration_seconds: clip.plannedDuration,
    final_duration_seconds: clip.renderedDuration,
    start_seconds: clip.start,
    end_seconds: clip.end,
    srt_start: srtTime(clip.start),
    srt_end: srtTime(clip.end),
    text: clip.text,
    subtitle_cues: clip.subtitleCues.map((cue) => ({
      index: cue.index,
      start_seconds: cue.start,
      end_seconds: cue.end,
      srt_start: srtTime(cue.start),
      srt_end: srtTime(cue.end),
      text: cue.text,
    })),
    manifest_started_at: clip.manifestStartedAt,
    manifest_stopped_at: clip.manifestStoppedAt,
  })),
};
writeFileSync(timelinePath, JSON.stringify(timeline, null, 2) + '\n', 'utf8');

if (!options.keepList) rmSync(concatListPath, { force: true });
if (needsPerClipRender) rmSync(partsDir, { recursive: true, force: true });

console.log(`Built ${clips.length} clips`);
console.log(`Slowdown: ${options.slowdown}x duration`);
console.log(`Minimum clip duration: ${options.minClipDuration.toFixed(3)} s`);
console.log(`Video:    ${videoPath}`);
console.log(`Subtitles:${srtPath}`);
console.log(`Timeline: ${timelinePath}`);
console.log(`Expected duration: ${expectedDuration.toFixed(3)} s`);
console.log(`Actual duration:   ${finalProbe.duration.toFixed(3)} s`);
console.log(`Drift:             ${drift.toFixed(3)} s`);
