# AGENTS.md — Photoshop MCP Digital Painting Edition

## ChatGPT Critic role (2026-10-10 source)

Keep the artistic evaluator as a distinct ROLE in the same ChatGPT conversation. At
artistic_review.critic_role.required, stop planning strokes briefly and act as Critic of the WHOLE
delivered scene against original_brief; setting, space/light and subject relationships count even
when the last local component improved. Return previous_observation.critic_review using the exact
request_id, five pass|fail|unknown criteria, and concrete visible/next_change for each failed criterion.
Then resume Painter and submit the observation plus next_pass through the SAME ordinary cycle_auto.
Checkpoints: after three substantial visual passes, every six further visual passes, stage changes
and final completion. Unfinished initial masses may be kept; their scene findings persist through
local successes and saves until the corresponding whole-scene criterion is actually reassessed pass.
Unknown is not success. Small/detail does not require a second reviewer after every stroke.

Optional delegation uses the real exposed Core agents API when the user authorized subagents:
status once, message a suitable sleeping Critic or spawn once using optional_spawn. Send original
brief and exact registered BEFORE/AFTER image paths, not Painter justifications/tool-success logs.
Do not change focus, paint, inspect source or alter model settings. A missing image/report is
unknown/pending; never fabricate a worker verdict or poll repeatedly. Without Core agents use the
same-chat role. Neither role labels nor host-reported delegation grant calibrated critic authority.
No local LM Studio model is automatically called or prepared by PaintPilot.

## Ordinary same-chat pixel review

Preserve the original user task once as original_brief in photoshop_guard_set_art_run. The Director
endpoint records host plans. At the EXISTING inline/exact-image review boundary, the Painter inspects
delivered BEFORE/AFTER directly in this chat. Follow artistic_review: describe visible form, proportions,
perspective and light against the original brief/style in observed; put the largest remaining defect in
primary_mismatch and judge target honestly. Next pass addresses that defect with a concrete construction
change; repeated failure calls for changing construction rather than adding texture/highlights. Keep pass,
task, stage and global finish distinct. Commands and filled fields prove no quality. This is self-review,
not independent acceptance. No automatic LM Studio/Gemma inference or extra review cycle is used.
Useful unfinished pixels can remain; preserve exact-image delivery and uncertainty without replay.
Current workflow and experimental history: [docs/artistic-evaluator.md](docs/artistic-evaluator.md).
First visual stage/scale inherit durable state or default to GLOBAL_BLOCK_IN/global; bounded marks should
explicitly declare local/small. A continuation with exactly one outstanding, dispatched, completed
nonvisual operation inherits its exact durable receipt and derives report/ack internally; the Painter
does not need to repeat previous_operation_id or emit standalone prose/report. Multiple debts require
an explicit previous_operation_id. Visual or uncertain work never inherits successful technical closure;
visual operations still require delivered exact-image evidence and observation.


## First action and every continuation in Chat On Steroids

During painting, including setup, rejection and recovery, never read repository source,
tests, dist implementations or tool schemas through Core/shell/grep/imports. Never import
SessionStore or write artificial evidence records. Use public Photoshop/Guard tools and
returned field-level corrections. If one corrected attempt still lacks an actionable fix,
report the exact blocker. Source work requires the user's explicit pipeline-development request.
For a user-confirmed closed target call photoshop_guard_reconcile with id, outcome=abandoned,
document_closed_confirmed=true and reason; omit documents_id so Guard collects and closes fresh
evidence internally. Do not review historical pixels to dispose of that closed document.

The first meaningful painting pass contains the requested main subject and recognition cues.
Establish the setting/path/large masses in the following bounded passes before refinement;
do not begin with an independent atmosphere-only/gradient task. Preserve editable owner layers
and the bounded pass contract. Director is optional; its first task should cover whole-scene
recognition/composition with global/medium scope and the relevant subject/context zones.

Component ownership applies to every rendering profile, including simple_graphic and initial
block-in. Do not put an entire person/animal/furniture/window on one persistent layer and promise
to separate it later. Declare scene_ownership_plan.objects with subject_kind and compound-object
before semantic layer construction; enumerate the visible independently editable parts on
distinct semantic units, owners and physical layers. For a clothed person this normally includes
face/body, hair and garment; add separately editable hands/accessories when needed. Construct
and review one component per pass. single-component means one actual part, not a whole complex
subject renamed as a silhouette; continuous-field means a continuous background field. Substantial
temporary objects also require decomposition, and keep cannot bypass component validation.
Small inseparable accents remain on their component. A typed plan is an editing contract, not
proof of pixel content or artistic quality. Existing flattened pixels are retained until explicit
component extraction/reconstruction; never reassign old ownership labels as if pixels were split.

Fresh nontrivial compound owners must use executable construction, not a pure solve followed by guessed
polygons/transforms. Use chosen distance/ratio constraints or proportion_checks; rigid=true objects keep
fixed intrinsic shape/scale and share a single origin/rotation across all component layers. Explicit
reshape_object_ids authorizes shape correction; rebuild and inspect every affected part. Existing parts
are replaced on exactly one owned raster layer in one reversible transaction so old silhouettes cannot
accumulate. Model-bound manual pose transforms and stale-part refinement are rejected. Legacy paintings
retain their existing policy; migrating them needs explicit construction/rebuild, never relabelled pixels.
Walls, window openings, frames and curtains remain separate semantic components. Flat wall fill is only
an initial mass when the brief requires room depth/light. Missing reference does not justify flat finish:
painterly.form_field accepts an explicit authored ellipsoid/light-field and chosen colors/light/clip;
it uses the bounded stroke planner, not a fake reference or anatomy inference.
Save/export closure must retain document-wide unresolved critique, primitive-footprint debt and pending
construction components. Continue a concrete visual correction; explicit user stop/pause always wins.
Use capabilities command_sets once and tool_names batches (max eight) for actual needed schemas;
do not guess aliases or serially inspect contracts. Known missing owner pins/final previews repair locally.

For any object whose proportions/connections matter, next_pass.construction can calculate geometry from a
category-independent model: arbitrary parts, landmarks/relative contour controls, length ratios, angles,
attachments, symmetry, poses and a shared camera. Supply model once, then durable model_id + part_id + color;
do not mix authored actions. It generates one component and its independent layer through the existing Guard
lane. Optional guard_status(construction_model=...) solves without painting; construction_ref inspects durable
geometry and parts requiring rebuild after a revision. Use the complete public schema and returned corrections,
never source/examples during painting. Choose proportions from reference/brief or explicit artistic intent;
the solver cannot infer them from a noun. Compare construction_target with exact delivered pixels at the normal
review boundary before dependent detail. Numerical success is not anatomy, pixel identity or artistic proof.


For articulated reach/contact and pose edits, the same general model supports ik_chains: authored
absolute object-local joint landmarks, an explicit target and optional interior bend limits. A fixed
root or shared parent-chain joint anchors each 2D/3D chain; IK.ts solves with original bone lengths.
Relative/axis-bound part contours follow those joints. Keep each component independently editable.
Unreachable/limited/conflicting poses return public corrections instead of stretching or accepting
an approximate contact. Numerical IK is not anatomy, rendered contact or artistic proof. Choose this
path from the visual problem; it needs no additional tool, source read or model-review round.

Reference-guided painterly refinement uses next_pass.painterly on ONE existing component owner.
Provide an aligned materialized JPEG reference and canvas bounds, plus clip_contour or a current durable
construction_ref. Guard computes an omitted reference SHA and derives the exact whole-frame BEFORE internally;
explicit conflicting SHA/owner/model revisions are rejected. The bounded Hertzmann adapter generates descending
brush-scale marks inside the existing BRUSH executor budget. It does not invent missing anatomy/light or treat
a textured block-in as finished form. Read the full public schema/corrections, not repository source. Inspect
the native preview, including preset fringes outside the intended contour; the planner only bounds the nominal
round footprint. Replan from the latest frame after observation; never replay the previous generated package.


Smooth construction contours use Bezier.js with 0.25-pixel accuracy and a 256-point cap; a cap refusal
requires reducing projected size/curvature or choosing linear, never silently dropping precision.
Painterly clip_exclusions explicitly protect up to eight cutout contours. Clipper2's TypeScript port
unions exclusions, subtracts them and calculates brush-center insets, retaining holes/islands. This
bounds nominal strokes, not real brush fringes. Continue through the public contract and normal review.

When developing the pipeline, record every external dependency/copied adaptation/algorithm/asset in
THIRD_PARTY_NOTICES.md and third-party-components.json with author, source, exact revision/version,
usage paths and licensing relationship. Retain required texts in licenses/; keep npm/MCPB packaging
and verify:third-party-notices in sync. Library dependencies retain upstream authorship; inspiration
is separate from copied implementation. Painter work still never reads repository source.

On a fresh unpainted document omit value_check or use {status:pending, observed:false};
pending creates no evidence claim and never opens the DETAIL gate.

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

The MCP connection owns the in-process async worker. Keep the installed plugin connected through
job completion and final review. A durable job receipt does not detach the worker. Do not pipe a
single request into a temporary stdio client: EOF closes its MCP child and kills unfinished jobs.
If Plugins are unavailable, restore the installed plugin rather than launching a second server.

Normal visual continuation uses the compact hot loop: first
`photoshop_guard_cycle_auto(next_pass=...)` returns a preview; after inspecting it,
the next `photoshop_guard_cycle_auto` sends
`previous_operation_id + previous_observation + next_pass`. The
`previous_observation.target` field classifies only the just-finished operation
goal. It must not complete the active Planner task by implication. Use explicit
`planner_task_assessment` with task-scope evidence only when judging the whole
Planner task. Standalone report/ack/verdict providers are retired; after an actual
interruption use only the supported compact recovery/status surfaces as documented.

### Compact MCP mode — mandatory for PaintPilot chat context

Treat chat-context budget as a production resource. Keep full technical evidence on
disk in `.photoshop-runtime/` and process-run artifacts; bring only the minimum
decision-relevant projection into the model conversation.

- Never stringify, print, forward, or otherwise place preview image bytes/base64 in
  text context. For `photoshop_get_preview` and any tool result carrying image
  content, keep only small metadata in text: operation id, SHA-256, materialized path,
  canvas/crop bounds, and the fields needed for the next Guard decision. Inspect the
  image through the image/view path instead of serializing the enclosing result.
- Never dump a complete `photoshop_guard_status` payload when a small projection is
  sufficient. Extract only the fields needed for the current decision, normally
  `next_required_action`, pending barrier/verdict ids, current/accepted frame SHA,
  checkpoint debt/state, active problem/blocker, and the immediately relevant
  rollback/recovery state.
- Never print full MCP tool schemas or large `ALL_TOOLS` discovery results. Discover
  by exact/specific name and emit only matching names or the small schema fragment
  required to construct the next call.
- Read Guard journals surgically: use exact-key search or bounded line ranges around
  `result`, `preview`, `verdict`, `rollback`, `failed_step`, `error`,
  `latency`, or another explicitly needed field. Do not reread an entire operation
  journal once its relevant state is known.
- After a rejected pass is fully rolled back, retain only a compact failure note in
  working context: operation id, why it failed artistically, exact accepted SHA after
  rollback, and any resulting strategy constraint. The durable journal remains the
  source of detailed history.
- Prefer one combined tool call that extracts several small read-only facts over a
  sequence of calls that each return large overlapping state objects.
- For long painting sessions maintain a compact running state containing only:
  active document id, accepted frame SHA, latest checkpoint path, active visual
  problem, current temporary hypothesis/layer if any, pending Guard obligation, and
  the next planned artistic experiment.
- If a tool returns unexpectedly large text/image data, summarize/projection-filter
  it before any subsequent model-visible emission. Do not repeat the raw payload.
- Exceptions are allowed only when the exact full payload is necessary to diagnose a
  concrete failure that cannot be localized by search/projection. Even then, prefer a
  bounded excerpt and record the full evidence on disk rather than in chat.

The purpose of Compact MCP mode is not to weaken Guard, visual review, recovery, or
auditability. Guard remains fail-closed and all durable evidence remains available;
only redundant transport into the conversation is reduced.

### Mandatory prompt-conflict and strategy preflight

Before the first Painter mutation, every Art Director directive must record a
`prompt_conflict_preflight`. Do not silently average contradictory artistic requirements.
Choose one **dominant rendering objective**, keep secondary traits subordinate to it, and
declare the rendering strategy. First-pass notes are optional; no minimum prose length,
style-constraint count or pass-list quota proves artistic quality.

Classify a conflict as **structural** when two reasonable interpretations require materially
different initial rendering passes (for example, line-first illustration versus
value/material-first photorealism). Structural conflicts must be resolved before Painter
dispatch. When one interpretation is clearly subordinate to the dominant objective, use
`resolution_mode=declared-interpretation` and state that interpretation to the user before the
first mutation. When multiple interpretations remain materially reasonable, set
`requires_user_choice=true`; Guard then requires `resolution_mode=user-confirmed` plus concrete
user confirmation before Painter work can start.

Strategy cadence is advisory: `strategy_validation_after_microplans` is optional (default **2**)
and initial `strategy_validation` defaults to `pending`. Guard counts meaningful Painter previews
as telemetry; reaching **1 or 2** does not force a Director call or block painting. Judge the
dominant objective through the ordinary frame review. Observed failure, uncertainty, protected-quality
loss and existing task/whole-frame review boundaries still require action. At an actual due strategy
review, record `pass` or `replan` against the exact current frame; replan must change the rendering strategy.

Do not create a second controller CLI, persistent MCP daemon, ad-hoc MCP REPL, or parallel
recovery transport. Diagnostics and recovery stay on the embedded Guard surfaces.

### Current architecture decision — host-independent Photoshop safety ownership

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

For a fresh blank `nontrivial_painting` document, make the first meaningful visual construction
before standalone future-stage setup. A brush preset/configuration, helper layer, selection or other
preparation needed only later must not consume its own Guard cycle while no visual frame exists.
Preparation genuinely required by the immediate first pass belongs inside that same VisualMicroPlan.
Guard enforces this with `premature_future_preparation` (document create/open are exempt), complementing
the existing `premature_value_analysis` blank-canvas gate.

The current bridge source revision is `compact-v2-20261009-component-rebuild`.
Document create/open use UXP exact-outcome receipts. The remaining catalog migration work is
implemented under the same UXP-only/fail-closed contract.
The earlier child/companion baseline was live-accepted. The 2026-10-09 source revision still
requires the managed MCP/UXP reload and a representative behavior/no-focus-steal trace. Do not use older
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

Past process directories are recovery/evaluation evidence only, never an inspiration library or a
cross-run artistic memory. When the user delegates selection of a fresh subject, do not browse old
process frames, plans, commentary, folder names, subject lists, style choices, compositions, motifs,
method choices or prior artistic outcomes to choose it. Do not maintain or consult a subject-selection
recency file. Fresh artistic choices derive from the current user brief and current-run evidence only.
Technical evidence may persist across runs only when it is subject-neutral (for example transport,
latency, rollback, brush-footprint or capability evidence).

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
assistant message with the localized semantic fields **Did / Why / Result**
(`Что сделал / Зачем / Результат` in Russian). A "Tool called" card, stdout,
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

- `режим техника` / `technical` — developer/debug telemetry only;
- `режим художник` / `artistic` — artist-facing visual reasoning plus practical Photoshop technique;
- `режим вместе` / `mixed` — artistic explanation first, then a compact separated technical/debug note;
- `коротко` / `обычно` / `подробно` change commentary detail without changing
  the content mode; `режим кратко` preserves the current mode and sets short detail;
- `следующий шаг — художник|техника|вместе` is a one-action override and does not
  change the sticky mode. A detail word may be added to the same command.

Default to `режим вместе` + `обычно` when the user has not chosen otherwise. For
long/resumable runs persist `commentary_mode` and `commentary_detail` in painting
state and restore them on resume.

The authoritative commentary classification lives in `src/prompts/host-guidance.ts`.
Keep this boundary exact:

- `technical` contains observable implementation/debug facts: Photoshop/UXP/MCP connection and
  operation state, runtime/capability limitations, Guard admission/barriers/evidence/receipts/
  checkpoints/recovery, internal ids/hashes/protocol/schema, compiler/preflight/repair/retry/
  fallback diagnostics, errors, timing and capture telemetry. It must not contain artistic
  rationale or Photoshop craft except the minimum operation label needed to identify the debug event.
  Technical mode still never exposes hidden chain-of-thought.
- `artistic` contains everything useful to an artist: visible problem, intended effect,
  composition/hierarchy/depth/perspective/geometry/form/value/light/color/material/edge logic,
  Photoshop method choice and why, layer/mask/selection structure, brush preset/settings,
  opacity/flow/hardness/size/spacing/smoothing/pressure, blend mode, adjustment/filter/gradient/
  transform parameters, target region, protected qualities, inspected result and next artistic step.
  Do not expose protocol, transport, schema, ids, hashes, internal tool names, runtime/controller/
  Guard terminology or other implementation telemetry. A blocking technical failure is stated only
  as its practical consequence for the artist.
- `mixed` renders the artistic explanation first and then one clearly separated compact technical
  note. Do not duplicate facts: artistic states the useful visual/Photoshop consequence, technical
  states the machine evidence/cause.

Use the effective `presentation_context.language` in every mode (`auto` follows the current user's
conversation language). `commentary_detail` changes only depth/length inside the selected boundary.
The mandatory completion-report semantics remain; commentary mode changes their content and wording,
not the safety barrier.

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

After a proven systemic failure, inspect only the bounded diagnostics returned by public
tools, then apply a supported correction or report the concrete blocker. Repository/source,
schema, test and shell investigation is never a painting fallback, even after repeated failure.

For a deterministic Guard preflight rejection with `visual_mutation_started=false`
and a returned `compact_correction_recipe`, use a payload-only fast path: apply the
listed violations directly to the rejected cycle and immediately resubmit the same
semantic cycle. Do **not** inspect repository source, schemas, tests, status/state,
or extra previews before that first corrected resubmission when the validation
message already names the actionable problem. Investigate implementation details
only in a separately authorized pipeline-development task. A repeated rejection without
an actionable field-level correction requires a concrete blocker report during painting.

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
softness-dominant uses the ordinary exact-current whole-frame observation. Judge edge hierarchy, mass
separation, large-form readability, focal hierarchy and primitive footprint against the declared
construction/physical role and style contract; do not substitute a generic sharpness score.
Intentional optical haze may remain soft while preserving underlying structure, but a form-bearing
soft mass may not dissolve its edge/mass hierarchy. Report concrete failure through the existing
`soft_dominance` must-fix finding and uncertainty through ordinary review. Detailed `softness_review`
is optional; omission is not a passed certificate. Observed debt blocks finer texture/detail through
the ordinary stage/scale priority gate.

At `MATERIAL`, do not equate material with texture. The shared qualitative `material_response` plan
is optional before mutation; omission is not evidence of quality or a passed review. A supplied plan covers
base response, form/light response,
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
> [Photoshop MCP — Digital Painting Edition](https://github.com/lavalava45/paintpilot-mcp).
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
- The current compact-only native catalog is 132 tools / 15 public Guard tools. Do not interpret a stale legacy connector snapshot as a server limitation.
- If the native Plugins route is genuinely absent/stale, inspect its discovery/readiness state and repair that route. Do not silently create or switch to a parallel controller path.
- `Chat_On_Steroids_Desktop` is for read-only desktop/UI inspection when useful, not the Photoshop MCP transport.
- The Adobe UXP bridge in `uxp-plugin/` is a separate Photoshop-side runtime; it is not the Chat On Steroids Plugins route. Production semantic Photoshop dispatch is UXP-only and fail-closed for every migrated Photoshop primitive. Raw `photoshop_execute_script` and the production ExtendScript/COM fallback are removed; Guard keeps only negative tombstones for stale callers. The current readiness target is bridge revision `compact-v2-20261009-component-rebuild`.

**Prerequisites:** Photoshop running on Windows 10/11, Node.js 18+. This project intentionally supports Windows only. This is unofficial and not affiliated with Adobe.

**Tool surface:** 132 semantic `photoshop_*` MCP tools; 15 are the public embedded `photoshop_guard_*` façade; 5 MCP guide prompt templates (`ps.*`); no `photoshop_recipe_*` tools remain.

### Continuing painting-pipeline development

Before changing the painting architecture, read
[`docs/PAINTING-ROADMAP.md`](docs/PAINTING-ROADMAP.md) for implementation order and
[`docs/available-tools.md#generated-backend-and-access-inventory`](docs/available-tools.md#generated-backend-and-access-inventory) for current
per-tool transport/access status. Do not infer roadmap state from old chat summaries or
dated handoff files.

In particular, the recognition-first block-in, `photoshop_paint_regions`,
first meaningful visual-frame tracking without a blank-canvas value-check round, recognition/TTFR journal metrics, compact normal cycle
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
long-poll. Current source/readiness revision is `compact-v2-20261009-component-rebuild`.
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
record depth order, occlusion, opaque coverage, transparency intent and layer order
on the ordinary current whole-frame review via previous_observation.physical_stack_check.
Guard binds frame/owner evidence; Director setup or a separate review call is not required.
Omission is not a pass. Structural-owner changes stale the check; new structural owners
after SHAPE require a real stage reset and fresh review.

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
| Project source | https://github.com/lavalava45/paintpilot-mcp |
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

Fresh enforced art runs finish only after the existing exact whole-frame review supplies painting_completion against original_brief (brief_fidelity, form_proportions, light_material, composition_context, editable_parts, contact_and_protection: pass|fail|unknown). Guard binds that assessment to the frame SHA and original brief; all criteria must pass and other debts must be closed. Saves preserve it, later pixels/brief invalidate it. This is Painter self-assessment, not independent quality certification; explicit user pause/stop remains valid. No extra review call or compulsory painting when only final review metadata is missing.

Timing discipline (2026-10-10): inspect the exact inline images once, then combine previous_operation_id + previous_observation + next_pass in ONE cycle_auto call. Lint is optional for a new risky draft; include the same previous observation when linting a continuation, then reuse the complete validated request without a separate closure or repeated successful lint. Do not use lint as a mandatory ritual for ordinary model_id/part_id continuation. First construction declares all editable parts once plus selected part, chosen proportions/IK lengths, material role, authorized scene projection and owner geometry relation; declared support/contact requires numeric boundary witnesses. Reuse model_id/part_id and stable scene/ownership ids afterwards. Capabilities/methods/brush inventory/settings are setup reads once per art run; batch missing exact contracts (tool_names), retain discovery_revision and use if_revision only for an actual recheck. Successful inline delivery needs no review_image follow-up; request missing roles only. force_redelivery requires images-unavailable|delivery-failed, never routine confirmation; an availability blocker is not permission to invent review or read source.
