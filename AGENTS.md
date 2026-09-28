# AGENTS.md — Photoshop MCP Digital Painting Edition

## First action and every continuation in Chat On Steroids

**Production state, 2026-09-18:** the embedded native-MCP Photoshop Guard and the
dedicated CoS entry point, `dist/cos-plugin.js`, have passed the dedicated live
CoS/Photoshop acceptance sequence. The native Plugins route is now canonical for
ordinary Chat On Steroids Photoshop work. The retired external Core/controller/daemon
provider chain has been removed; do not recreate it or add parallel recovery transports.

Do not substitute image_gen for Photoshop work in this project.

Use **Chat On Steroids Plugins** and this project's `dist/cos-plugin.js` entry for normal
Photoshop work. Known read-only Photoshop tools may be called directly; mutations
must go through `photoshop_guard_cycle_auto`. On interruption or uncertainty, use
`photoshop_guard_status` / `photoshop_guard_resume`, obtain fresh evidence as required,
and reconcile rather than replaying a mutation. Long work may return a durable
`job_id`; continue it with `photoshop_guard_job_poll`.

Normal visual continuation uses the compact hot loop: first
`photoshop_guard_cycle_auto(next_pass=...)` returns a preview; after inspecting it,
the next `photoshop_guard_cycle_auto` sends
`previous_operation_id + previous_observation + next_pass`. The
`previous_observation.target` field classifies only the just-finished operation
goal. It must not complete the active Planner task by implication. Use explicit
`planner_task_assessment` with task-scope evidence only when judging the whole
Planner task. Standalone report/ack/verdict providers are retired; after an actual
interruption use only the supported compact recovery/status surfaces as documented.

### Mandatory prompt-conflict and strategy preflight

Before the first Painter mutation, every Art Director directive must record a
`prompt_conflict_preflight`. Do not silently average contradictory artistic requirements.
Choose one **dominant rendering objective**, keep secondary traits subordinate to it, and
declare the rendering strategy plus the first 1–3 passes that follow from that choice.

Classify a conflict as **structural** when two reasonable interpretations require materially
different first 1–3 rendering passes (for example, line-first illustration versus
value/material-first photorealism). Structural conflicts must be resolved before Painter
dispatch. When one interpretation is clearly subordinate to the dominant objective, use
`resolution_mode=declared-interpretation` and state that interpretation to the user before the
first mutation. When multiple interpretations remain materially reasonable, set
`requires_user_choice=true`; Guard then requires `resolution_mode=user-confirmed` plus concrete
user confirmation before Painter work can start.

Every directive must also set `strategy_validation_after_microplans` to **1 or 2** and begin with
`strategy_validation.status=pending`. Guard counts only Painter passes whose visual significance
is `meaningful`. After that many meaningful previews, it forces Art Director re-review. Judge
whether the **dominant objective itself** is becoming more visible, rather than merely whether
secondary prompt traits are accumulating. Record `pass` to continue, or `replan` with the exact
current-frame operation id and a genuinely changed rendering strategy / first-pass sequence. A
replan starts a fresh early strategy-validation window.

Do not create a second controller CLI, persistent MCP daemon, ad-hoc MCP REPL, or parallel
recovery transport. Diagnostics and recovery stay on the embedded Guard surfaces.

### Current architecture decision — keep Photoshop safety out of the COS fork

Read [docs/architecture.md](docs/architecture.md)
before changing controller/host integration.

The architecture keeps **Photoshop safety owned by this repository's
Guard**, not by Chat On Steroids internals. The Guard is now implemented inside the
same MCP server process as the Photoshop tool registry. The canonical model-facing
loop uses compact `next_pass` and `previous_observation`; the Guard owns technical
receipt/report/verdict closure internally. Explicit public closure fields are removed;
the retired external controller/daemon implementation has been removed.

The canonical CoS route is:

```text
ChatGPT → Chat On Steroids Plugins → dist/cos-plugin.js
       → embedded Guard → internal ToolRegistry → Photoshop
```

`dist/cos-plugin.js` sets `PHOTOSHOP_GUARD_MODE=required`. In that mode known
read-only tools may be called directly, but public raw mutating tools fail closed with
`guard_required`; mutations must be dispatched through `photoshop_guard_cycle_auto`.
The model must construct compact `next_pass`; removed full-operation payloads are rejected
and are not a model-facing recovery or compatibility path.

### Applying local server / UXP changes in the current CoS development setup

After `npm run build:server`, restart only this repository's Photoshop MCP child process:

```text
Chat On Steroids app → Plugins → this Digital Painting Edition entry → … → Restart
```

Do **not** restart the whole Chat On Steroids application merely to pick up a rebuilt
`dist/cos-plugin.js`, and do not use old ad-hoc restart-helper scripts. A ChatGPT-side
**Settings → Plugins → Refresh** refreshes the host schema/connector view; it does not
guarantee that the already-running `cos-plugin.js` child process has been replaced.
When code freshness matters, verify that the plugin child PID/creation time changed.

The Photoshop-side UXP companion is a separate runtime. After changing
`uxp-plugin/main.js`, use:

```text
Adobe UXP Developer Tool → Photoshop MCP UXP Bridge → … → Reload
```

After changing `uxp-plugin/manifest.json`, use **Unload → Load** so manifest changes are
re-read. Do not restart Photoshop or all of CoS for either case. After a UXP reload,
`GET http://127.0.0.1:38452/health` should report `plugin_connected: true`,
`transport: "long-poll"`, and normally one `waiting_long_polls` waiter.

`photoshop_save_document` is now intentionally **UXP-only**. It writes an `asCopy`
checkpoint/export and verifies that active document, working path, active layers, active
tool and selection did not change. There is no COM/ExtendScript persistence fallback: if
the UXP companion is not connected, save/checkpoint fails closed with
`uxp_bridge_unavailable` rather than foregrounding Photoshop.

`src/platform/photoshop-backend.ts` is the production semantic transport boundary.
`PhotoshopBackendRouter` configures UXP only and fails closed before dispatch when compatible UXP
readiness is unavailable. Do **not** reintroduce pre- or post-dispatch ExtendScript/COM fallback.
An uncertain/dispatched mutation is reconciled from durable state/fresh evidence, never replayed
through another backend. Keep public MCP schema/result contracts unchanged.

The accepted UXP `state.read` implementation is intentionally `batchPlay`-only for Photoshop
state collection. Do not replace it with `app.activeDocument` / `app.documents` / active-layer
DOM reads: live sampling showed that DOM state reads can foreground Photoshop. The accepted
open-document regression is 40 consecutive reads with a non-Photoshop window foreground,
0 Photoshop foreground samples/transitions, and COM↔UXP field parity. Action Manager's
`numberOfLayers` excludes the Background layer, so parity requires adding
`hasBackgroundLayer` back into the normalized public `layerCount`.

The accepted UXP read lane includes `document.info`,
`documents.list`, `selection.bounds`, and `layers.list` primitives
(`photoshop_get_document_info`, `photoshop_list_documents`,
`photoshop_get_selection_bounds`, and `photoshop_get_layers`). These implementations are also
read-only `batchPlay`; do not regress them to UXP DOM reads. The layer list reconstructs the
legacy top-to-bottom recursive hierarchy from Action Manager indexes and `layerSection`
start/end markers while omitting section-end pseudo-layers. Production semantic dispatch is UXP-only.

Brush configuration reads use application
`currentToolOptions` for `brush.settings.read` and application `presetManager` for
`brush.presets.list`; both are accepted read-only `batchPlay` paths. Do **not** probe a direct
Action Manager target of `brush` to discover settings: Photoshop 27.8 can reject that `Get`
with a modal host dialog, which blocks the bridge until dismissed. The accepted
`currentToolOptions` implementation preserves the public 14-field settings payload without
selecting the Brush Tool.

Pixel reads use the UXP Imaging API. `photoshop_get_preview`,
`photoshop_sample_color`, and `photoshop_sample_colors` use the UXP Imaging API. In the
accepted Photoshop 27.8 runtime, `imaging.getPixels` is read-only but must execute inside
`core.executeAsModal`; live 5 ms foreground sampling showed zero Photoshop foreground
transitions for preview and color sampling. Do not reintroduce the legacy duplicate/crop/save
preview path or temporary Color Sampler documents on the UXP backend. Preview parity is judged
on decoded pixels rather than binary JPEG identity because the encoders differ.

`photoshop_get_history` enumerates indexed
read-only Action Manager `historyState` descriptors and preserves the legacy history/context
payload. `photoshop_measure_points` now performs its geometry in Node after one migrated
`document.info` read; do not reintroduce a JSX measurement program for caller-supplied points.

The painting mutation lane — `photoshop_select_brush_preset`,
`photoshop_set_brush`, `photoshop_set_foreground_color`, `photoshop_fill_layer`,
`photoshop_paint_regions`, `photoshop_paint_strokes`, and `photoshop_paint_dabs` are
UXP-only and fail closed when the companion is unavailable. Fill preserves the exact
legacy pixel/target/selection behavior and Photoshop history sequence
`Select Canvas → Fill → Deselect`. Regions use UXP compound paths, convert the uniquely named
path to a selection through Action Manager, fill, deselect, and delete the temporary path.
Strokes/dabs must retrieve the created path through `doc.pathItems.getByName(pathName)` before
calling `strokePath`; do not assume `pathItems.add()` returns a directly usable PathItem in
this host.

The current bridge source revision is `compact-v2-20260926-brush-profile`.
Document create/open use UXP exact-outcome receipts. The remaining catalog migration work is
implemented under the same UXP-only/fail-closed contract.
The rebuilt child/current companion load-and-revision preflight is live-accepted; the final
representative post-migration behavior/no-focus-steal trace remains pending. Do not use older
migration-era revision strings as readiness targets.

Photoshop 27.8 has one accepted painting quirk: assigning `app.foregroundColor` inside the same
painting modal can restore stale brush opacity/flow. After a color write, the UXP strokes/dabs
implementation therefore re-applies the desired core brush state (size/opacity/flow) through
the whole-`currentToolOptions` writer. Do not move that re-application ahead of the color write.

`photoshop_set_active_document` is Guard **preparation/navigation**, not a visual mutation. It
may explicitly switch tabs when the workflow asks for that tool, but document-bound semantic
tools must not switch tabs implicitly merely to satisfy `document_id`; they verify the pinned
active document and fail closed on mismatch. Live diagnostic `run-09` showed that this explicit UXP
tab activation can foreground Photoshop, so classify it as **UI-activating navigation** and exclude it
from no-focus acceptance traces. Do not claim the tool itself is background-safe.

The current Photoshop 2026 / UXP runtime used for live acceptance rejects the loopback
HTTP bridge when `requiredPermissions.network.domains` is narrowed to either
`http://127.0.0.1` or `http://127.0.0.1:38452` (`Manifest entry not found`). The live-
accepted development manifest therefore uses `domains: "all"`. The Node bridge itself
still binds only to `127.0.0.1`; do not broaden that listener. Revisit the manifest
permission when Adobe's runtime accepts a loopback-only declaration reliably.

There are two generic host capabilities we want to request upstream from the Chat
On Steroids author:

1. a verified assistant-message delivery receipt (message id + exact text hash +
   delivery/render timestamp) available to the next tool invocation;
2. generic structured semantic progress emitted by an MCP/tool process and rendered
   as one native host progress item with revisions.

If those capabilities are not accepted upstream, **do not grow a permanent COS
fork** for Photoshop. Use a small external MCP Guard/proxy between stock/latest COS
and the Photoshop MCP executor. `MoaidHathot/mcp-proxy` is the first candidate to
audit because it exposes pre/post invoke hooks, interception and virtual tools;
`postcondition-mcp` is a useful reference for independent postcondition checking.
No external proxy has been adopted yet. Capability negotiation, not a hard-coded
COS version, is the intended contract.

### Local experiment/process workspace

All personal painting/editing experiments live under the repository-local
`processes/` directory. Never create experiment directories, process directories,
temporary process scripts, checkpoints, previews, PSD snapshots, or process state
files in the repository root.

For artwork experiments, use a lowercase kebab-case family directory ending in
`-process`. Keep the current naming pattern for new work:

```text
processes/<subject>-process/
processes/<subject>-process/<run-name>/
```

Generic examples (these are naming shapes, not subject suggestions):

```text
processes/<subject>-process/study-01/
processes/<subject>-process/polished-01/
processes/<subject>-process/experiment-01/
```

Past process directories are recovery/evaluation evidence, not an inspiration library. When the
user delegates selection of a fresh subject, do not browse old process frames, plans, commentary or
folder names to choose it. Read at most `processes/subject-selection-memory.json`, when present, as
compact negative recency evidence; choose first, append one abstract feature signature, retain only
the newest 12 entries, then bind the new art run. Initialize a missing file from
`docs/subject-selection-memory-template.json` when a file-write route is already available; a
missing/unwritable memory file is non-blocking.

Naming rules:

- family names: lowercase kebab-case and normally `<subject>-process`;
- run/study names: lowercase kebab-case;
- numbered runs use two digits (`study-01`, `photoreal-02`, `semi-real-03`);
- keep one experiment's scripts, frames, `painting-state.json`, checkpoints and
  recovery material together in its own family/run directory;
- before the first paint mutation, bind the Photoshop document with
  `photoshop_guard_set_art_run` to exactly one immutable
  `processes/<subject>-process/<run-name>/` directory;
- use the standard run layout `frames/`, `checkpoints/`, `final/` plus the
  run-local `painting-state.json`; never write artwork frames, checkpoint PSDs,
  final artwork or commentary sidecars into the repository root;
- every process frame in `frames/` must have a same-stem `.txt` sidecar. In
  artistic/mixed mode it contains the exact pre-operation artistic commentary
  shown to the user and is later extended with the inspected
  `Что сделал / Зачем / Результат` report;
- store `process_dir` in process state as a repository-relative `processes/...`
  path, never as a machine-specific absolute path;
- `processes/brush-preflight-live/` is the existing local live-preflight workspace
  and may keep that specialized name; new artwork experiment families should use
  the `*-process` convention.

If a run genuinely needs a per-process helper, checkpoint, inspection, recovery,
or experimental `.mjs`/`.py` script, place it inside the exact process/run
directory that owns it. Prefer the most specific run directory rather than the
family parent when a run directory exists. Generic reusable development helpers
that are part of the repository itself go under `scripts/dev/`, not `processes/`.

Run process-local scripts from the repository root unless the script explicitly
resolves the repository root itself, and keep relative imports valid after moving
or creating a script.

`processes/` is a personal local workspace and is intentionally ignored by Git.
Do not force-add it, remove its ignore rule, publish its contents, or include it in
GitHub commits/releases unless the user explicitly changes that policy.

### Persistent artist signature — `Sol`

The canonical visual references for the artist signature live outside any individual
painting run:

```text
assets/signature/Sol-reference.png
assets/signature/Sol-reference.psd
```

These files are **visual references only**. Never place, import, paste, composite, or
reuse the PNG/PSD pixels as the final signature on an artwork. The signature must be
freshly **redrawn with Photoshop brush strokes** on a separate signature layer.

When signing an artwork:

- sign only at the **very end of the artistic work**, after the final visual review and
  immediately before the definitive PSD/raster exports;
- inspect `assets/signature/Sol-reference.png` and redraw `Sol` as closely as practical
  to that reference while preserving the slight natural variation of a real hand-made
  signature;
- prefer the **minimum number of natural continuous brush gestures** that can reproduce
  the signature convincingly. Do not trace it mechanically with many tiny geometric
  segments merely to match pixels;
- paint the signing/finalization **date at the same time**, by brush rather than a text
  layer, and keep it visually subordinate to the signature;
- small differences between works are expected and desirable: the goal is the same
  handwriting/gesture, not a cloned stamp;
- if a signed artwork is later reopened for substantive artistic changes, the existing
  signature layer may remain as a reference, but the artwork is no longer considered
  finally signed. At the new end of the work, review and, when appropriate, redraw the
  signature and date before producing the new final exports.

Keep the reference assets persistent even if the artwork from which the first `Sol`
signature originated is deleted.

### Stamp / motif anti-copy policy

Stamp brushes are reusable visual vocabulary, not permission to duplicate finished objects.
Use `intentional_regular` only for genuinely deliberate regular systems such as ornament,
tiles, grids or repeated architectural modules. Organic, character, creature and hero-visible
motifs remain subject to mechanical-pattern review even when the same source stamp is translated,
rotated, scaled, mirrored, recolored, faded or given small positional jitter. Those parameter
changes are not structural variation.

When repetition is visible, prefer multiple evidence-bound source motifs, meaningful overlap /
occlusion / cropping, selective erase, overpaint or structural redraw. A hero or foreground organic
element placed from a stamp is not automatically finished; raw stamp-only completion is allowed only
when the explicit user/style contract calls for a collage/stamp language. Review actual motif
instances and evidence rather than counting tool calls or imposing a universal repetition maximum.

For a user-supplied pack, build the scene before distributing assets. The Art Director's existing
composition, focal hierarchy, large-value-mass, depth, silhouette and lighting assessment remains
primary; `brush_pack_scene_plan` then maps evidence-bound media roles / stamp profiles onto specific
Painter tasks only where they causally help. Pack availability must not determine the hero pose,
face, gesture, key silhouette or overall composition by convenience.

When the art run declares `brush_pack_policy.mode=exclusive`, every brush-based mutation must
explicitly select a preset/profile bound to that `brush_pack_id`; silent fallback to the current or a
generic unrelated brush is forbidden. Stamp-only passes bind `brush_pack_id + stamp_profile_id`
directly and do not pretend to be media-brush roles. Non-brush Photoshop operations remain available.

After **every completed external action**, emit a distinct ordinary user-visible
assistant message:
**Что сделал: … / Зачем: … / Результат: …**. A "Tool called" card, stdout,
internal `commentary`/thought/progress event or saved report is not user-facing
delivery. Continue after the report without waiting for "continue". The
controller's `report` command records
the report *after* it was delivered; it cannot prove ChatGPT displayed it. Every
new completed controller operation also returns durable technical evidence. In the
canonical compact loop the caller supplies `previous_operation_id` plus an honest
`previous_observation`; the Guard closes its receipt/report/verdict obligations
internally. Never synthesize an acknowledgement or use the explicit legacy ack path
as normal continuation. Verified UI-delivery evidence remains optional. Local recovery
bookkeeping is not a new Photoshop action and does not recursively require
another journal acknowledgment.

Painting commentary has a sticky presentation mode for the current art run:

- `режим техника` — technical/execution commentary;
- `режим художник` — artist-facing commentary in natural Russian;
- `режим вместе` — artistic explanation first, then a compact technical note;
- `коротко` / `обычно` / `подробно` change commentary detail without changing
  the content mode; `режим кратко` preserves the current mode and sets short detail;
- `следующий шаг — художник|техника|вместе` is a one-action override and does not
  change the sticky mode. A detail word may be added to the same command.

Default to `режим вместе` + `обычно` when the user has not chosen otherwise. For
long/resumable runs persist `commentary_mode` and `commentary_detail` in painting
state and restore them on resume.

In `режим художник`, do not expose protocol, transport, schema, ids, hashes,
internal tool names, runtime/controller/Guard terminology, English jargon, or
hidden chain-of-thought. Explain only artist-useful rationale: what is visually
wrong, what result is sought, what Photoshop-native artistic action is being taken
in Russian, where and with what brush/selection/layer parameters when relevant,
what must be preserved, and what visibly changed. Ordinary artist terms such as
слой, маска, кисть, ластик, выделение, непрозрачность, нажим, жёсткость, мягкость,
размер, цвет, режим наложения and трансформация are allowed. A blocking technical
failure must be described only by its practical consequence in plain Russian. The
mandatory Что сделал / Зачем / Результат semantics remain; commentary mode changes
their wording, not the safety barrier.

Before every visual mutation in `artistic` or `mixed` mode, emit the concise
artist-facing intent as an **ordinary visible assistant message** and pass that
exact same text as the guarded operation's `artistic_commentary`. The Guard
persists it beside the resulting frame. Generating the text only in an internal
commentary/progress channel never counts as delivery.

For Photoshop work, progress must describe the **meaning of the visual action**,
not transport. Write operation `summary` and `purpose` so automatic narrative can
say, for example:

```text
Сейчас: корректирую форму лица
Почему: глаза читаются как символы
Photoshop: mutation выполняется
Следом: локальный before/after preview
```

Never use `Called Photoshop tool`, an MCP tool name, process/session id, or similar
transport text as the operation narrative. `cycle-auto`, `job-poll`, synchronous
`cycle`, and `resume` expose transport-neutral `operation.progress.v1` and, for
compatible COS builds, the legacy alias `cos.host_progress.v1`. Progress is
transient telemetry only. It does **not** count as the mandatory completion report
and does not release the Guard acknowledgement or preview barriers.

On an interrupted chat: status → report any unreported result → inspect fresh
state and preview → reconcile uncertain execution → continue with a new operation
id. A process/session id is not completion. Never blindly replay an uncertain edit.

### Active art-run cadence — hard working rule

After a visual preview has been inspected and its verdict is recorded, the next
canonical cycle **must contain the next meaningful visual pass** when all of the
following are true: there is no uncertain operation, no active async job, the
preview/verdict barrier is closed by that verdict, no controller-required
checkpoint/recovery step remains, and the user has not changed the task.

Do not insert routine `status`, `photoshop_get_state`, `photoshop_list_documents`,
schema inspection, source inspection/grep, extra previews, or infrastructure
investigation between healthy visual passes. Exceptions are limited to actual
uncertainty/recovery, a controller/tool error, suspected wrong document/retargeting,
a demonstrated systemic runtime/tool defect, a controller-required checkpoint, or
an explicit user request to investigate the pipeline instead of continuing art.

`photoshop_get_state` is required before the first mutation of a new run; after an
uncertain/interrupted operation or recovery; when an external event may have
changed Photoshop state; when the active/latched document is genuinely suspect;
or when a concrete controller/tool error requires fresh state. It is **not**
required between normal visual passes when the pinned `document_id`, materialized
preview, recorded verdict, closed barrier and normal controller continuation are
already established.

After a proven systemic failure, allow one compact diagnostic investigation, then
form a causal replan and return to the next visual pass. A second diagnostic pass
is allowed only when the first produced no actionable cause. Do not turn an
ordinary visual verdict into open-ended source/schema/state/status/grep analysis.

When a controller checkpoint becomes due, treat it as a technical barrier:
save/verify the pinned layered PSD, then continue the next planned visual cycle.
Do not restart whole-image analysis merely because a checkpoint was written.

`status-compact` / `resume` expose wall-clock visual cadence. In an active visual
workflow, roughly 90 seconds after the last classified visual pass with no blocking
job/recovery/verdict/checkpoint requirement is a `decision_loop_stall`; follow its
prescriptive `next_required_action` by dispatching the next meaningful visual pass
or entering the single explicit diagnostic exception above. The cadence signal is
advisory for continuation and must never weaken or bypass safety barriers.

`silent_stall` is a separate continuation watchdog. It fires when an active visual
run has a known `next_required_action`, no durable job is actually running, and
roughly 90 seconds pass without **semantic advancement**. Pending report,
operation-ack, visual-verdict, reconcile, replan or checkpoint obligations do not
suppress this signal; they become its `silent_stall_reason`. Ordinary read-only
status/state/schema/preview churn does not reset the clock. On detection, perform
the prescribed next action immediately or explicitly tell the user what is blocking
continuation. Never leave a supposedly active art run silently idle. The Guard can
persist and expose this condition on the next host interaction, but repository code
cannot independently push a new ChatGPT message when the host makes no call.

Runtime gates are implemented by this controller. Raw tool access can bypass
them; use the controller consistently. Do not claim that project code can repair
ChatGPT's own message delivery or force Core discovery before it is called.

For every visual verdict, also classify the cumulative whole-frame trend with
`global_readability`, `primitive_footprint`, and stable **negative** `trend_signals`.
Use `trend_signals` only for recurring defects/symptoms, never as praise labels for
stable or successful features; leave them empty when no negative trend is present. The
controller examines the latest three classified visual operations; a repeated
negative signal in at least two promotes a `cumulative-trend-*` global must-fix,
which the existing stage priority gate then places ahead of medium/small work.
This is the hard backstop against repeatedly "improving" local details while the
whole image drifts into blur, contrast collapse, primitive footprint, or another
systemic failure.

For non-trivial paintings, broad **global/medium** work whose declared construction/method is
softness-dominant must also close the exact-current `softness_review`. Judge edge hierarchy, mass
separation, large-form readability, focal hierarchy and primitive footprint against the declared
construction/physical role and style contract; do not substitute a generic sharpness score.
Intentional optical haze may remain soft while preserving underlying structure, but a form-bearing
soft mass may not dissolve its edge/mass hierarchy. A failed review opens the existing
`soft-dominance` must-fix problem and therefore blocks finer texture/detail through the ordinary
stage/scale priority gate.

At `MATERIAL`, do not equate material with texture. Every visual MATERIAL pass must carry the shared
qualitative `material_response` decomposition before mutation: base response, form/light response,
specular/reflection, transmission when applicable, surface condition, variation scale, edge/contact
interaction, plus an explicitly subordinate microtexture policy. Keep base material, surface condition
and optical effect distinct and consistent with semantic `physical_role` / `opacity_role` and any
construction role. The exact-current `refinement_check.material_response` reuses this same vocabulary;
texture-only treatment or unresolved material components cannot close `material_light_response` and
therefore cannot unlock DETAIL/MICRO_DETAIL. Intentional flat/stylized treatment may omit otherwise
required form response only through an exact active `style_contract` basis. Never invent numeric
roughness/PBR/material-quality scores.

> **Navigation map, not a reference manual.**
> Start with [README.md](README.md), [INSTALL.md](INSTALL.md), or [llms.txt](llms.txt).
>
> **Project identity:** this repository is the independently maintained
> [Photoshop MCP — Digital Painting Edition](https://github.com/lavalava45/photoshop-mcp-digital-painting).
> Historical origin, upstream identifiers and retained licensing attribution are centralized in
> [`NOTICE`](NOTICE); those historical identifiers do not distribute this project's maintained surface.

## Entry strategy

| Scenario | Path |
| -------- | ---- |
| Cursor / Claude Desktop / VS Code | Clone this repository, build it, and configure stdio to `node <repo>/dist/index.js` |
| Claude Code | Add a local stdio server pointing to this repository's built `dist/index.js` |
| Chat On Steroids (canonical) | Plugins → this project's `dist/cos-plugin.js` → embedded Guard |
| Local development | `pnpm install --frozen-lockfile && npm run build:server && node dist/index.js` — see [docs/development.md](docs/development.md) |

### Chat On Steroids: canonical guarded route

The native Plugins route has passed the dedicated live acceptance sequence and is
the documented production default. Use the installed custom Photoshop plugin pointed
at `dist/cos-plugin.js` for ordinary work.

The canonical native route is:

```text
ChatGPT agent
  → Chat_On_Steroids_Plugins
  → node <repo>/dist/cos-plugin.js
  → embedded Photoshop Guard
  → internal ToolRegistry dispatch
  → PhotoshopBackendRouter
  → UXP bridge plugin on localhost
  → Adobe Photoshop
```

The external controller/daemon route has been deleted after dependency/replacement proof.
Backward compatibility with that provider chain is not a requirement.

In the current Windows workspace, the project source lives at:

```text
E:\Downloads\devspace-test\experiments\photoshop-mcp-digital-painting
```

and the server entry after `npm run build:server` is this repository's `dist/index.js`.

Agent routing rules:

- **Canonical:** `Chat_On_Steroids_Plugins` → this project's `dist/cos-plugin.js` → embedded Guard → internal `ToolRegistry` → Photoshop.
- **Removed:** the former external Core/controller/daemon provider chain is not a supported or recoverable route.
- The current compact-only native catalog is 130 tools / 14 public Guard tools. Do not interpret a stale legacy connector snapshot as a server limitation.
- If the native Plugins route is genuinely absent/stale, inspect its discovery/readiness state and repair that route. Do not silently create or switch to a parallel controller path.
- `Chat_On_Steroids_Desktop` is for read-only desktop/UI inspection when useful, not the Photoshop MCP transport.
- The Adobe UXP bridge in `uxp-plugin/` is a separate Photoshop-side runtime; it is not the Chat On Steroids Plugins route. Production semantic Photoshop dispatch is UXP-only and fail-closed for every migrated Photoshop primitive. Raw `photoshop_execute_script` and the production ExtendScript/COM fallback are removed; Guard keeps only negative tombstones for stale callers. The current readiness target is bridge revision `compact-v2-20260926-brush-profile`.

**Prerequisites:** Photoshop running on Windows 10/11, Node.js 18+. This project intentionally supports Windows only. This is unofficial and not affiliated with Adobe.

**Tool surface:** 130 semantic `photoshop_*` MCP tools; 14 are the public embedded `photoshop_guard_*` façade; 5 MCP guide prompt templates (`ps.*`); no `photoshop_recipe_*` tools remain.

### Continuing painting-pipeline development

Before changing the painting architecture, read
[`docs/PAINTING-ROADMAP.md`](docs/PAINTING-ROADMAP.md) for implementation order and
[`docs/available-tools.md#generated-backend-and-access-inventory`](docs/available-tools.md#generated-backend-and-access-inventory) for current
per-tool transport/access status. Do not infer roadmap state from old chat summaries or
dated handoff files.

In particular, the recognition-first block-in, `photoshop_paint_regions`,
automatic first visual baseline, recognition/TTFR journal metrics, compact normal cycle
envelope, live DPI 72/144/300 validation, live relative layer-placement validation and
the first executable stable-layer protection stage are implemented. VisualMicroPlan now
supports `protected_layer_ids` with fail-closed target pinning and narrow explicit
replacement exceptions. A fresh wind-up-robot holdout also passed: subject+style were
recognized in the first visual pass at 10.8 s, a protected second pass preserved all
recognition cues, and no destruction event was recorded. The measured holdout justified
one narrow continuation optimization: created stable layer ids now surface as compact
`continuation_layers` / `confirmed_targets.layer_ids`, while full results stay in the
journal. Do not build general geometric masks without new live evidence that specifically
requires them. Reduce duplicated model-facing protocol obligations through the compact
facade; do not weaken pinned-target, exact-outcome, preview, or no-blind-replay safety.

The native Plugins route has also passed its dedicated live acceptance and is no longer
pending validation. Resume/status can recover the exact pending receipt token and visual
preview evidence after a lost async poll result without replay or weakening exact-token
safety. Recent painting tests additionally promoted semantic layer separation,
scene-relationship auditing, negative-only `trend_signals`, selectable commentary modes,
and the `silent_stall` continuation watchdog into the maintained policy. Do not regress
those rules merely to reduce call count or simplify a one-off paint pass.

## Architecture (agent view)

```
AI host (Cursor / Claude / UI)
  │  MCP stdio
  ▼
PhotoshopMCPServer (Node.js)
  │  semantic backend routing
  ▼
Adobe Photoshop

Primary production lane: UXP bridge plugin (`uxp-plugin/`) on 127.0.0.1:38452 using localhost
long-poll. Current source/readiness revision is `compact-v2-20260926-brush-profile`.
Production semantic dispatch is UXP-only / fail-closed for the current catalog; retained legacy
platform executors are not selectable semantic backends. Repository migration acceptance is green;
the acceptance matrix remains authoritative for any outstanding real-Photoshop retest.
```

Deep dive: [docs/architecture.md](docs/architecture.md).

## Recommended workflow

Follow the server `instructions` advertised on MCP `initialize` ([src/prompts/instructions.ts](src/prompts/instructions.ts)):

For new drawing/painting subjects, the first artistic milestone is **recognition**, not a polished silhouette. Before ordinary refinement, derive 3–7 discriminative recognition features plus a large style cue when style is requested, rough in the whole subject, inspect one overview preview, and correct the largest recognition barrier. Feature importance is semantic, not proportional to pixel size. Once the subject reads without relying on the prompt, return to the normal composition/shape/value/form hierarchy. `photoshop_paint_regions` is the preferred broad-mass primitive when closed filled regions are a better fit than many dabs/strokes.

**One Guard pass is not an artistic stage.** "Rough in the whole subject" or "complete
the recognition block-in" may require several sequential `photoshop_guard_cycle_auto`
passes. `request_key` is the unique idempotency identity of one execution attempt;
`problem_id` is the stable artistic-problem identity shared by later attempts at the
same unresolved problem. The compiler derives method/preview requirements from the
actual actions rather than a duplicate pass label. Use `photoshop_guard_status.paint_readiness`
before first live paint instead of inferring setup order from later preflight errors.

For non-trivial scenes, establish a **semantic layer architecture before broad
paint**. Every VisualMicroPlan performs a **Layer Separation Check**. Before the
first substantial change to a new independent object, material, light effect or
plane, assess rollback value and whether the concern is likely to need independent
adjustment, masking, weakening, recoloring, protection, transform or rollback. If
so, create one new logical layer (or a temporary hypothesis layer) before painting
it. Ordinary continuation and low-value tiny accents stay on their existing
logical layer: do not create a layer merely for formal segmentation or per stroke.
At minimum, keep background/support surfaces, cast shadows and each major
subject/object independently editable when the scene contains them. A broad
convenience pass is not a reason to merge unrelated scene entities onto one raster
layer.

For fresh non-trivial paintings, semantic ownership also carries the **physical
stack contract**. Every new logical layer declares `physical_role` and
`opacity_role`; use at most one direct `depth_relations` anchor and chain owners for
larger depth order. Opaque/support scene masses use opaque pixels and explicit
above/below layer placement for declared front/behind relations. Glass/transmissive
surfaces, surface conditions, optical light/glow, atmosphere and camera/post remain
distinct physical roles; never make an opaque object translucent merely to soften
its rendering. Before advancing from SHAPE/block-in into VALUE or any later stage,
Art Director must record an exact-current-frame Physical Stack / Occlusion Gate pass
covering depth order, occlusion, opaque-mass coverage, transparency intent and
Photoshop layer-stack alignment. Structural-owner changes make that evidence stale;
a new structural owner after SHAPE requires a real stage reset and fresh gate.

Every global/shape/form review must include an **independent scene-relationship audit**, not only the current `problem_id`. At normal/thumbnail scale check support/contact, unintended gaps or floating, occlusion/depth order, cast-shadow relationship, accidental tangencies/intersections and silhouette/proportion. A pass may not be accepted merely because its local target improved if one of these structural relationships is visibly broken. Small/detail passes still require a quick regression scan for the same failures before acceptance.

```
1. DISCOVER: tools/list + prompts/list (or get_capabilities once per session)
2. STATE:    photoshop_get_state before the first mutation or when state is uncertain; do not repeat it between healthy pinned visual passes
3. ACT:      compose the smallest supported semantic photoshop_* chain
4. RECOVER:  on uncertain/error state, follow the structured envelope, obtain fresh state/preview evidence as required, reconcile, then continue without blind replay
```

### Tool selection

| Need | Use |
| ---- | --- |
| Multi-step outcome | semantic `photoshop_*` chain, optionally guided by `ps.*` |
| Single precise edit | atomic `photoshop_*` |
| Vague user intent | MCP guide prompt `prompts/get`, then call supported semantic tools |
| Neural Filters (skin smooth, colorize, …) | `photoshop_neural_filter` — requires UXP bridge loaded |
| Version / feature check | `photoshop_get_capabilities` |

Full catalog: [docs/available-tools.md](docs/available-tools.md). Prompt/Guard/preview architecture:
[docs/architecture.md](docs/architecture.md).

## MCP client configuration

```json
{
  "mcpServers": {
    "photoshop": {
      "command": "node",
      "args": ["/absolute/path/to/photoshop-mcp-digital-painting/dist/index.js"],
      "env": { "LOG_LEVEL": "1" }
    }
  }
}
```

Examples: [examples/cursor-config.json](examples/cursor-config.json), [examples/claude-desktop-config.json](examples/claude-desktop-config.json).

### Environment variables

| Variable | Purpose |
| -------- | ------- |
| `LOG_LEVEL` | `0`=DEBUG, `1`=INFO, `2`=WARN, `3`=ERROR |
| `PHOTOSHOP_PATH` | Optional custom Photoshop install path |

## Troubleshooting (common agent blockers)

| Symptom | Fix |
| ------- | --- |
| Photoshop not found | Start Photoshop; set `PHOTOSHOP_PATH` if non-standard install |
| Tool times out | Large operations may need retries; check `get_state` for partial progress |
| `generative_unavailable` / `version_unsupported` | Call `get_capabilities`; feature may need newer Photoshop or Adobe login |
| Neural filter fails | **Add Plugin** → `uxp-plugin/manifest.json` → **Load** in UXP Developer Tools — see [docs/development.md](docs/development.md) |
| Rebuilt `dist/cos-plugin.js` still behaves like old code | In the **Chat On Steroids app** open Plugins → this Digital Painting Edition entry → `…` → **Restart**. ChatGPT Plugins **Refresh** is schema refresh only and may leave the old child process running. |
| Edited `uxp-plugin/main.js` but Photoshop still runs old UXP code | Adobe UXP Developer Tool → Photoshop MCP UXP Bridge → `…` → **Reload**. For `manifest.json` changes use **Unload → Load**. |
| No active document | Ask user to open/create a document, then `get_state` |

More: [docs/development.md](docs/development.md#8-troubleshooting).

## Distribution

| Channel | Identifier |
| ------- | ---------- |
| Project source | https://github.com/lavalava45/photoshop-mcp-digital-painting |
| Public npm package | **None** — build from this repository |
| MCP Registry entry | **None** — use local stdio |
| Historical provenance | [`NOTICE`](NOTICE) |

## Key files

| File | Purpose |
| ---- | ------- |
| [llms.txt](llms.txt) | LLM-oriented project summary |
| [README.md](README.md) | Human docs, install, example prompts |
| [server.json](server.json) | MCP Registry metadata |
| [src/core/server.ts](src/core/server.ts) | MCP server entry |
| [src/tools/](src/tools/) | Tool implementations |
| [src/prompts/](src/prompts/) | MCP prompt templates |
| [CONTRIBUTING.md](CONTRIBUTING.md) | PR and release workflow |

## Contributing (agents editing this repo)

- Canonical language for code, comments, commits, and PRs: **English**.
- Before PR: `npm run verify:canonical`.
- Do not add AI-attribution footers to commits or PR descriptions.
