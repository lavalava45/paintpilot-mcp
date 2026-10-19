# Build the violinist 60-second video

**Русский:** [README-build-reddit-violinist-demo.ru.md](README-build-reddit-violinist-demo.ru.md)

[`build-reddit-violinist-demo.py`](build-reddit-violinist-demo.py) is the original Python/FFmpeg script for the [published showcase](../../docs/showcase.md). It makes a faster ~60-second edit from the **specific previously assembled** violinist process recording. It is a session-specific recipe, not an automatic summarizer for arbitrary recordings or an AI video generator.

## Requirements and execution

Install Python 3 and FFmpeg (`ffmpeg` on `PATH`). The input is:

```text
processes/window-violinist-process/study-01/export/final/process-video.mp4
```

From the repository root, run:

```powershell
python scripts/dev/build-reddit-violinist-demo.py
```

The `processes/` recordings are ignored by Git, so this input **is not included in a fresh clone**. It can be built from original captured clips with [`build-process-video.mjs`](build-process-video.mjs) ([English instructions](README-build-process-video.en.md)). The Python script has **no CLI arguments**: input/output paths, source time ranges and crop values are hardcoded for this particular run.

## What it does

From the 913.6-second long edit, it selects ten chronological intervals (seconds):

```text
0–28, 56–91, 114–134, 176–196, 212–232,
266–282, 520–540, 597–627, 669–691, 722–745
```

Each interval plays 4× faster than the already-slowed long edit (`setpts=(PTS-STARTPTS)/4`), at 30 fps. The video is cropped using `crop=1440:810:170:80`, resized to 1280 × 720 with Lanczos, and encoded to silent H.264 (`libx264`, `veryfast`, CRF 20). A roughly one-second final still comes from approximately 903 seconds into the long edit. All eleven processed pieces are concatenated without additional re-encoding.

Temporary segments and concat data:

```text
.photoshop-runtime/reddit-clip-review/segments/
```

Local output:

```text
processes/window-violinist-process/study-01/export/final/paintpilot-reddit-violinist-60s.mp4
```

The [public demo](../../assets/showcase/paintpilot-reddit-violinist-60s.mp4) runs 59.633 seconds, 1280 × 720, 30 fps, H.264 without audio. **The script overwrites local intermediate/output files but does not automatically replace the tracked showcase asset.** Reproducing the published bytes depends on the exact source media and FFmpeg environment.

This shows edited real Photoshop interaction, not a continuous real-time record or independent confirmation of Guard/artwork quality.
