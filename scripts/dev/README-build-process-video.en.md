# Assemble PaintPilot process video from recorded clips

**Русский:** [README-build-process-video.md](README-build-process-video.md)

[`build-process-video.mjs`](build-process-video.mjs) combines the short Photoshop screen recordings captured during a PaintPilot run into one MP4. It also creates an external SRT subtitle file and a JSON timeline. This is a Node.js/FFmpeg post-processing utility, not an image or video generator.

## Prerequisites

Node.js, `ffmpeg` and `ffprobe` must be available on `PATH`. Verify with `ffmpeg -version` and `ffprobe -version`.

The run directory must contain:

```text
<run-dir>/
  export/
    manifest.json
    videos/
      0001_....mp4
      0002_....mp4
    frames/
      0001_....txt
      0002_....txt
```

The script sorts `manifest.json` entries by `sequence` and reads each `clip_path`. For subtitles, it finds the identically named `.txt` file under `export/frames/`. If a sidecar is missing, it warns and uses saved manifest `artistic_intent` and `outcome_note`, explicitly marking outcomes without a saved result as unconfirmed. An empty existing text file or missing usable intent is an error. Clips must have compatible stream layouts.

## Usage

From the repository root:

```powershell
node scripts/dev/build-process-video.mjs processes/autumn-temple-process/run-02 --slowdown 4 --min-clip-duration 4
```

Custom output filename stem:

```powershell
node scripts/dev/build-process-video.mjs processes/autumn-temple-process/run-02 --slowdown 4 --min-clip-duration 4 --name process-video-x4-min4
```

Replace the example run path with your own recorded run. The local source media are not included in the Git repository.

| Option | Purpose |
| --- | --- |
| `--slowdown <factor>` | Stretch playback duration; `4` means 4× slower. Default `1`. |
| `--min-clip-duration <seconds>` | Hold each clip's last frame to reach a minimum duration. Default `0`. |
| `--name <stem>` | Output filename stem. Default `process-video`. |
| `--crf <0-51>` | H.264 re-encoding quality. Default `18`. |
| `--preset <name>` | FFmpeg H.264 preset. Default `medium`. |
| `--keep-list` | Retain temporary FFmpeg concat list. |
| `--help` | Display all supported options. |

For short action captures, `--slowdown 4 --min-clip-duration 4` makes actions legible and gives each video segment at least four seconds. To give three commentary blocks at least four seconds **each**, instead set `--min-clip-duration 12`.

## Outputs

The script writes to `<run-dir>/export/final/`:

```text
process-video.mp4
process-video.srt
process-video.timeline.json
```

FFprobe measures each processed segment's actual duration, including slowdown and held final frames. Authored intent/technique/outcome commentary is preserved in sequential SRT cues, distributed evenly between the segment's exact time boundaries; the timeline includes cue timing, text provenance and duration drift. The UTF-8 SRT has a BOM for Windows compatibility. **SRT captions are separate and are not burned into the video.**

For the violinist showcase, a separate [Python/FFmpeg montage script](README-build-reddit-violinist-demo.md) turns one particular long video into a faster ~60-second demonstration. It is not part of ordinary export.
