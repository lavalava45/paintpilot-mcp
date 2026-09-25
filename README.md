# Photoshop MCP — Digital Painting Edition

Community-maintained fork of [alisaitteke/photoshop-mcp](https://github.com/alisaitteke/photoshop-mcp), focused on native digital-painting workflows in Photoshop.

**Original project / upstream:** [alisaitteke/photoshop-mcp](https://github.com/alisaitteke/photoshop-mcp)<br>
**This fork:** [lavalava45/photoshop-mcp-digital-painting](https://github.com/lavalava45/photoshop-mcp-digital-painting)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey.svg)]()

> This is an independent fork. It is not an official release of the upstream project and is not affiliated with or endorsed by Adobe Inc.

## GuardBot — project mascot

<p align="center">
  <img src="assets/mascot/guardbot.jpg" alt="GuardBot, the Photoshop MCP Digital Painting Edition mascot" width="360">
</p>

**GuardBot** is the mascot of this fork: a wind-up screenprint robot produced by the painting pipeline itself during a fresh holdout validation run. It represents the fork's core ideas — recognition-first construction, stable layer targeting, protected achieved features, and mandatory visual review after each semantic mutation.

The mascot image is not an upstream Photoshop MCP asset and does not represent Adobe branding.

See [`docs/mascot.md`](docs/mascot.md) for the story of the holdout run that produced him.

## What this fork adds

The upstream project already provides a broad Photoshop automation MCP. This edition keeps that toolset and adds a focused painting and visual-control layer for brush-driven work:

- installed brush-preset discovery and exact preset selection;
- brush size, hardness, opacity, flow, spacing, angle, roundness, flip, pressure, airbrush, and smoothing controls;
- batched raster painting with Brush, Pencil, Eraser, and Smudge;
- straight, polyline, and Bezier strokes;
- ordered closed Bezier region fills for fast silhouettes and broad color/value block-ins;
- one-point dabs/stamps;
- per-stroke color, size, opacity, and flow overrides;
- automatic cost-aware batching for large heterogeneous paint passes;
- interpolated size/opacity/flow dynamics along open strokes;
- Photoshop `simulatePressure` support;
- point and local-average composite color sampling for reference-based painting;
- explicit measurement, landmark, and guide tools for reference/proportion work;
- reusable landmark-frame transforms and normalized landmark-set comparison;
- a materialized preview pipeline for direct stdio/COS workflows without a second Photoshop export;
- background-safe Windows execution: when Photoshop is already running, the fork attaches to the existing COM application with `GetObject` instead of recreating it with `CreateObject`, avoiding repeated foreground/focus stealing during MCP calls;
- more reliable nested-layer targeting and ordering with recursive lookup and stable layer IDs;
- strict optional `document_id` pinning for document-bound tools, with fail-closed validation, no automatic active-tab switching, and returned target metadata;
- `photoshop_execute_visual_microplan` to collapse setup/read calls + one atomic visual mutation + its mandatory preview into one MCP round-trip without crossing the preview barrier;
- an embedded durable Guard surface (`photoshop_guard_*`) that moves operation journaling, receipt/ack gates, preview/verdict barriers, uncertainty recovery, checkpoints, workflow metrics and async jobs into the MCP server itself;
- a Photoshop-side UXP companion on localhost long-poll for Neural Filters, foreground-safe `asCopy` PSD/JPEG/PNG persistence, and low-latency fast-lane development/diagnostics;
- an agent visual-control workflow with semantic passes, previews, measurement checkpoints, occlusion reasoning, cleanup, sticky Photoshop routing, and a state-based Definition of Done.

The current build exposes **147 tools** (**131 atomic/non-recipe + 16 recipes**) and **21 prompts**.

The dedicated Chat On Steroids entry point is `dist/cos-plugin.js`. It starts the same MCP server with `PHOTOSHOP_GUARD_MODE=required`, so read-only tools remain directly callable while raw mutating tools fail closed and must be dispatched through `photoshop_guard_cycle_auto`. This native Plugins route has passed dedicated live acceptance and is the canonical Chat On Steroids path. The older `scripts/photoshop-session.mjs` route remains available for dev/debug/recovery compatibility and regression coverage.

## Research directions

This project is also a testbed for stateful visual-agent control: how a multimodal model can inspect,
modify, verify, recover, and progressively refine an image through a real editor rather than producing
one opaque one-shot render. Three research ideas currently shape the painting architecture.

### Adaptive Multiscale Visual Verification

A single screenshot is not equally useful for every visual decision. Composition, object structure,
and micro-detail require different observational scales, so the Guard selects a minimum review level:

```text
COMPOSITION -> OBJECT -> MICRO
```

Whole-frame context is retained at every level. Exact source-document crops are added only when the
semantic scope of the operation or a structured review finding requires more local evidence. If the
first view is insufficient, the same artistic operation can acquire additional crops read-only without
replaying the mutation. Review evidence is bound to exact document/frame identity so stale local
evidence cannot silently satisfy a later verdict.

The working theory, formalization, open hypotheses, and proposed experiments are documented in
[`docs/adaptive-multiscale-visual-verification.md`](docs/adaptive-multiscale-visual-verification.md).

### Bounded Artistic Autonomy

Useful painting requires more than safe atomic tool calls, but unconstrained multi-step autonomy can
drift, compound errors, or hide regressions. The project therefore explores a middle regime:
**semantic-pass autonomy inside an explicit artistic task**.

The Art Director owns global intent, task boundaries, stage changes, and re-review. The Painter may
execute a bounded sequence of coherent semantic passes inside the delegated task, while every pass
still crosses a visual-evidence barrier. Serious regressions, uncertainty, strategy exhaustion,
protected-quality loss, global/composition changes, or the autonomy horizon immediately return
control to the stricter review path.

The research question is not "how many commands can the agent run by itself?" but rather **how much
locally coherent artistic work can be delegated without weakening perceptual control**. Current and
planned semantics are tracked under
[`P0-C — Painter/Guard semantic-pass throughput and bounded autonomy`](docs/PAINTING-ROADMAP.md#p0-c--painterguard-semantic-pass-throughput-and-bounded-autonomy).

### Evidence-Bound Recovery

In a stateful editor, repeating an uncertain mutation is not a harmless retry: a brush stroke,
transform, erase, fill, or composite may be applied twice and permanently diverge from the state that
was being evaluated. Recovery therefore treats **evidence, not replay, as the default response to
uncertainty**.

Operations are journaled with document identity, execution receipts, preview identity, visual-review
state, and accepted artistic anchors. After interruption or ambiguous transport failure, the Guard
recovers from fresh state/preview evidence, reconciles the existing operation, and only then permits a
new mutation. Accepted-anchor restoration is likewise verified against the exact registered visual
state rather than inferred from tool success alone.

This makes recovery part of the visual control theory: a system should preserve causal identity across
failures and prove what state it is in before continuing. The current implementation is described in
[`docs/photoshop-guard-architecture.md`](docs/photoshop-guard-architecture.md).

## Digital-painting tools

```text
photoshop_list_brush_presets
photoshop_select_brush_preset
photoshop_get_brush_settings
photoshop_set_brush
photoshop_set_foreground_color
photoshop_sample_color
photoshop_paint_strokes
photoshop_paint_regions
photoshop_paint_dabs
photoshop_execute_visual_microplan
photoshop_measure_points
photoshop_add_guides
photoshop_list_guides
photoshop_clear_guides
photoshop_transform_landmarks
photoshop_compare_landmarks
```

For proportion-sensitive work, the landmark tools let an agent reuse the same named points across differently sized or framed references without hard-coding portrait-specific math. `photoshop_transform_landmarks` maps points between semantic frames while preserving local `u/v` position; `photoshop_compare_landmarks` reports per-point normalized error plus mean, RMSE, and maximum error. Both are pure geometry helpers and do not perform automatic landmark detection.

The painting workflow is also exposed as the MCP guide prompt:

```text
ps.digital_painting_control
```

That guide is intended for iterative drawing rather than one-shot stroke dumping:

```text
recognition block-in → preview → shape/value → preview → form → preview
→ edge/material → preview → detail → preview → cleanup → final preview
```

## Install this fork

If you want the painting extensions, install **this repository from GitHub**. The upstream npm package does not contain the fork-specific painting tools.

Requirements:

- Adobe Photoshop;
- Node.js 18 or newer;
- Windows or macOS;
- Git, or a downloaded GitHub source archive.

Clone and build:

```bash
git clone https://github.com/lavalava45/photoshop-mcp-digital-painting.git
cd photoshop-mcp-digital-painting
npm install
npm run build:server
```

The MCP server entry point is:

```text
<repo>/dist/index.js
```

Point your MCP host directly at that file over stdio. Example:

```json
{
  "mcpServers": {
    "photoshop-painting": {
      "command": "node",
      "args": ["/absolute/path/to/photoshop-mcp-digital-painting/dist/index.js"],
      "env": {
        "PHOTOSHOP_PATH": "/absolute/path/to/Photoshop"
      }
    }
  }
}
```

`PHOTOSHOP_PATH` is only required when Photoshop is not detected automatically.

### Windows: background-safe Photoshop control

On Windows, this fork is intentionally **background-safe by default**. When Photoshop is already running, MCP script execution attaches to the existing `Photoshop.Application` COM object instead of creating a new one for every request. In addition, each background-safe `DoJavaScript` call is wrapped by a short-lived foreground guard because Photoshop itself can still raise its window from inside COM execution even after a safe `GetObject` attach. If that happens without an explicit user window-switch gesture, the guard immediately restores the user's most recent non-Photoshop foreground window. `PHOTOSHOP_MCP_ALLOW_UI_ACTIVATION=1` opts out of both protections when foreground activation is intentionally allowed.

By default, the server also will **not** launch Photoshop automatically if it is closed. If an integration explicitly wants to allow UI activation / automatic Photoshop launch, opt in with:

```text
PHOTOSHOP_MCP_ALLOW_UI_ACTIVATION=1
```

Leave that variable unset for normal background workflows.

This transport behavior is separate from document targeting. `document_id` is now a fail-closed guard, not an automatic tab switch: a pinned call proceeds only when that document is already active; if another Photoshop document is active, the call stops instead of changing the user's tab.

For Chat On Steroids, the canonical production path is **Plugins → `dist/cos-plugin.js` → embedded Guard → Photoshop**. It has passed the dedicated live acceptance sequence. The older **Core → `photoshop-session.mjs` → persistent daemon → `dist/index.js`** route is retained only for dev/debug/recovery compatibility and regression/live-test coverage.

For local development after `npm run build:server`, restart only the custom MCP child with
**Chat On Steroids app → Plugins → Photoshop MCP Digital Painting Fork → … → Restart**.
ChatGPT-side Plugins **Refresh** updates the schema/connector view but does not guarantee
that a running `cos-plugin.js` process has reloaded new code. Do not restart the entire CoS
application or use legacy restart-helper scripts. The UXP companion is reloaded separately
in Adobe UXP Developer Tool (`Reload` for `main.js`; `Unload → Load` for manifest changes).
`photoshop_save_document` is intentionally UXP-only: it verifies that document/layer/tool/
selection state remains unchanged and never falls back to COM persistence if the companion
is offline.

See [`INSTALL.md`](INSTALL.md) for the full clean-machine setup.

## Verify the installation

Static checks:

```bash
npm run build:server
npm run lint
npm run verify:photoshop-prompts
npm run verify:tool-counts
```

With Photoshop running, execute the live painting smoke test:

```bash
node scripts/test-painting-tools.mjs
node scripts/test-measurement-tools.mjs
node scripts/test-landmark-ergonomics.mjs
npm run test:painting-batching
npm run test:painting-batching-live
npm run test:document-targeting
npm run test:document-targeting-live
```

The current verified tool-count result is:

```text
tool counts consistent: 147 = 131 atomic + 16 recipes
```

The fork has been live-tested primarily on **Photoshop 2026 for Windows**. During the current validation, 123 installed brush presets were enumerated and the painting smoke test completed with `PAINTING_TEST_OK`.

## Documentation

- [`INSTALL.md`](INSTALL.md) — installation and MCP host configuration
- [`docs/adaptive-multiscale-visual-verification.md`](docs/adaptive-multiscale-visual-verification.md) — research concept for adaptive, provenance-bound COMPOSITION / OBJECT / MICRO visual evidence
- [`docs/photoshop-guard-architecture.md`](docs/photoshop-guard-architecture.md) — current Guard/gateway architecture, host boundary, upstream COS requests, and proxy fallback
- [`docs/digital-painting.md`](docs/digital-painting.md) — painting API and design notes
- [`docs/digital-painting-agent-skill.md`](docs/digital-painting-agent-skill.md) — visual-control workflow, checkpoints, cleanup, and Definition of Done
- [`docs/available-tools.md`](docs/available-tools.md) — complete tool reference
- [`docs/architecture.md`](docs/architecture.md) — architecture inherited from upstream plus fork integration points
- [`docs/development.md`](docs/development.md) — build and development workflow
- [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) — validation before publishing a release
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — common connection and Photoshop issues

The repository also retains upstream documentation for the broader Photoshop MCP feature set. Those inherited documents may describe upstream features that are not specific to Digital Painting Edition.

## Layer API consistency

The fork also tightens several inherited layer-operation contracts that matter in multi-layer painting workflows:

- `photoshop_get_layers` now exposes recursive layer `id`, `path`, and `depth` metadata;
- layer ordering resolves targets recursively, so layers returned by `photoshop_get_layers` can also be targeted when they live inside groups;
- `photoshop_move_layer_to_position` accepts `targetLayerId` (preferred over a possibly duplicated name);
- `photoshop_move_layer_up`, `photoshop_move_layer_down`, `photoshop_move_layer_to_top`, and `photoshop_move_layer_to_bottom` keep nested layers inside their current parent stack;
- core layer tools now return structured JSON envelopes instead of a mixture of plain-text confirmations and JSON.

Regression coverage is provided by:

```bash
node scripts/test-layer-api-contracts.mjs
node scripts/test-layer-api-live.mjs
```

The live test creates its own temporary Photoshop document, exercises grouped/nested layers and id-based ordering, and closes that temporary document without saving.

## Upstream and attribution

This fork is based on [Photoshop MCP](https://github.com/alisaitteke/photoshop-mcp), originally created by Ali Sait Teke. The upstream project, its website (`photoshop-mcp.com`), npm package (`@alisaitteke/photoshop-mcp`), and MCP Registry identity are separate from this fork.

The upstream source, documentation, and assets retain their original copyright and license notices. This fork is maintained independently; references to the upstream project do not imply that its original author maintains or endorses this fork.

## Analytics

The upstream anonymous usage-analytics subsystem remains in this fork. Aggregated analytics are enabled by default and can be disabled; see [`docs/anonymous-usage-analytics.md`](docs/anonymous-usage-analytics.md).

## License

MIT. See [`LICENSE`](LICENSE). The original upstream copyright notice is retained there.
