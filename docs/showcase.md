# PaintPilot showcase — recorded Photoshop work

**Русский:** [Демонстрации PaintPilot](showcase.ru.md).

## Seated violinist by a window — 60-second Reddit demo

[![Still frame from the original agent-driven Photoshop process](../assets/showcase/violinist-demo-preview.jpg)](../assets/showcase/paintpilot-reddit-violinist-60s.mp4)

**[Play or download the MP4](../assets/showcase/paintpilot-reddit-violinist-60s.mp4)** — 59.633 seconds, 1280 × 720, 30 fps, H.264, silent.

This is a chronological **edited selection of real Photoshop screen-capture footage** from a drawing session. The session progressively creates the figure, violin, environment and light, then refines the painting. This is not an AI-generated video, not a continuous real-time capture and not proof that every intermediate artistic choice was good.

### Where the recording came from

The PaintPilot process export contains per-operation captured video fragments and commentary sidecars. The repository's own [`build-process-video.mjs`](../scripts/dev/build-process-video.mjs) ([English instructions](../scripts/dev/README-build-process-video.en.md), [Russian instructions](../scripts/dev/README-build-process-video.md)) assembled the session into a 913.6-second `process-video.mp4`, slowing its source clips by a factor of four and preparing a corresponding separate `.srt` file. Those complete local recordings and process journals are ignored by Git and are **not** in this public repository.

The Reddit edit was built from that 913.6-second file using **Python calling FFmpeg**, not a named video-generation or automatic-editing skill. The original editing script has been preserved at [`scripts/dev/build-reddit-violinist-demo.py`](../scripts/dev/build-reddit-violinist-demo.py) ([English guide](../scripts/dev/README-build-reddit-violinist-demo.md), [Russian guide](../scripts/dev/README-build-reddit-violinist-demo.ru.md)). It uses the following 10 chronological source intervals (seconds):

`0–28`, `56–91`, `114–134`, `176–196`, `212–232`, `266–282`, `520–540`, `597–627`, `669–691`, `722–745`.

Each interval is retimed with `setpts=(PTS-STARTPTS)/4` (4× faster than the already slowed long edit), resampled to 30 fps, cropped using `crop=1440:810:170:80`, and resized to 1280 × 720 with Lanczos filtering. Segments are encoded as H.264 (`libx264`, CRF 20). A final still is taken from approximately second 903 of the long source, held for about one second, and the 11 encoded pieces are concatenated without re-encoding. The published MP4 is an **exact byte-for-byte copy** of the local Reddit montage, not a fresh edit.

### Rebuilding locally

If the original ignored local recording exists at `processes/window-violinist-process/study-01/export/final/process-video.mp4`, and Python plus FFmpeg are installed, run from the repository root:

```bash
python scripts/dev/build-reddit-violinist-demo.py
```

The script writes intermediate files to the ignored `.photoshop-runtime/reddit-clip-review/` directory and recreates the final video under the ignored local process export. It does not overwrite this repository's `assets/showcase/` copy automatically.

**Interpretation:** The clip demonstrates the agent's interaction with Photoshop and the observable painting process. Guard controls, independent layer ownership, exact visual review and recovery are engineering mechanisms documented elsewhere; a sped-up video by itself does not verify all of their invariants or establish release acceptance.
