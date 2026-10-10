# Painting Quality Roadmap

Last updated: 2026-10-10

Goal: **a visibly better image sooner**, preserving the requested style, composition and recognition.
Open actions and acceptance only; implementation history is in [CHANGELOG](../CHANGELOG.md), evidence/status
in [the acceptance matrix](roadmap-final-acceptance-matrix.md). Code, live and independent artistic closure differ.

## Completion boundary

**Machine checks passed; live pixel and artistic checks are not closed.**
Latest local `npm run verify:canonical` (2026-10-10 documentation/Git synchronization):
**136/136 test files, 1512/1512 tests PASS** plus build, published Guard contract,
packaging, policy and provenance. Earlier saved verification evidence:
`.photoshop-runtime/e24e25-20261010-canonical.log` (1511/1511 tests).
All earlier intermediate failures, source revisions and completion reports are
historical and belong in [CHANGELOG](../CHANGELOG.md), not in this queue.
Loaded COS Plugins child and matching UXP bridge still need verified
activation; connectivity alone does not demonstrate the loaded Guard revision.

## Priority order

One bounded change and its owning check at a time. Preserve the live document,
owners, history and accepted frames. Do not reopen source-complete
implementations without reproducing an actual live failure.

| Order | Still-open action | Gate |
| --- | --- | --- |
| **P0** | **E.26: fix premature autonomous-session termination.** Find the real stopping boundary, then close the PaintPilot/CoS continuation contract before another unattended artwork run; do not count saved/accepted pixels as completed art | **E.26**, prerequisite for meaningful E.7e/E.8 autonomous acceptance |
| 0 | Activate current managed Plugins child; verify published Guard source, matching UXP bridge and required host tool exposure | E.24, E.8c |
| 1 | Reconnect/recover current document, exact pixels/owners, pending operations and public actionable blockers without replay | E.17, E.24, E.11 |
| 2 | Validate physical scale/move, connected articulated objects, cutout curves and perspective invalidation | E.25, E.18, E.7d |
| 3 | Produce one substantial whole-scene Painter → Critic → Painter improvement, not merely a correct review object | E.24, E.7e, E.7f first |
| 4 | Show credible volume, anatomy/contact, cloth, lighting and material beyond block-in | E.7e, E.19, E.7f second/third |
| 5 | Compare complete images and time-to-useful-art with independent human assessment | E.8, P1-B, E.7f five-case acceptance |
| 6 | Prove preparation/history parity and safe restore, then broader multi-tool/owner passes | E.11 → E.7b → E.10 |
| After E.25 + E.11 | **E.27: optional single-owner `local-warp` correction**, only after real native transform/owner/rollback acceptance. One bounded implementation, not a new visual-repair research programme; preserve the existing Critic → Painter → Guard review loop | **E.25 + E.11 → E.27**; independent of the broader E.7b multi-owner expansion |
| Later | Correction transactions, brush profiling, release and portability | E.6, E.14, P1-D |

Parallel if needed: E.8a real concurrent/interrupted telemetry, E.8b
compaction-safe continuation, E.8c host schema-budget, P0-D Critic
calibration and P0-E.7 user-supplied packs. E.22 video and P3 exploration
do not block the main painting path.

## P0-E.26 — Autonomous painting continuation across the host turn boundary

**OFFLINE IMPLEMENTATION DONE IN ACTIVE COS SOURCE CHECKOUT; HOST ACTIVATION AND LIVE ACCEPTANCE STILL OPEN (2026-10-10).** Fix premature termination of an
unattended Painter activation without conflating it with the separate engineering agents'
work. This is a **host/session lifecycle and artistic-completion** issue, not permission
to remove the per-pass visual barrier or to add a new arbitrary pass/time quota.

**Source-level stop boundary established:** Windows process inspection identified the running
Chat On Steroids executable at `experiments/chat-on-steroids-OUR-RELEASE-2.1.32/release/win-unpacked/`
and the actual child invocation of this repo's `dist/cos-plugin.js` (not a sibling checkout).
The host Goal driver in `src/main/goal.ts` supplied its decision helper the conversation
and only the **number** of MCP calls per turn; trusted Guard result state was absent.
Consequently a helper STOP on an optimistic Painter final could become `no-reply` / "goal met"
even when Guard had returned `continue_required`. This is a reproduced **source/host
boundary**, not a forensic attribution of all seven overnight activations.

**Applied in that COS 2.1.32 source checkout, without restarting the running app:** a
small source-turn-scoped Guard receipt reader now exposes only sanitized
`unresolved|blocked|null` evidence to the existing Goal/Loop decision, including the
finish-follow-up path. Only successful, complete, exactly attributed MCP tool results
for this turn/chat may establish unfinished work; a verified rejection/uncertain receipt
produces a safe blocker. Technical close/save and optimistic final prose never erase
already verified unfinished artwork. An unsupported Goal STOP gets **at most one**
revised decision; a second STOP becomes a visible **non-retryable**
`painting_guard_unresolved_no_action` blocker, not an endless identical attempt or
fabricated continuation. Existing user STOP/Off, page final/settle, exact source ownership,
outbox priority and no-replay control retain authority. No new scheduler, callback daemon,
local model or additional Photoshop tool was introduced.

**Offline verification:** focused COS Goal/Loop / Goal races / session-finish / new receipt
tests **256/256 PASS**, TypeScript typecheck PASS. This proves deterministic host-boundary
behaviour under mocked helper decisions, not actual continuation in the already running
packaged COS binary. **Next activation:** rebuild/activate the modified COS source through
the authorized host release path, confirm which version actually loaded, and accept one
real Goal-enabled Painter final with exact Guard `continue_required` → new concrete
correction in the **same COS goal activation**; also accept explicit user STOP, unresolved
no-gain/blocker and genuine confirmed whole-brief finish. Do not run that live test or
restart during this offline implementation step. E.26 remains P0 until this activation
and artistic throughput check pass. See CHANGELOG.

**Reported overnight audit (investigation inputs, not independently revalidated here):**
seven Painter activations without a configured time limit produced four visual passes;
all four were `neutral` with `target_resolved=no`; Guard still returned
`continue_required` after reviews and PSD saves, yet the Painter ended each activation
until the next scheduled invocation. Of 32 `cycle_auto` requests, 15 were rejected.
The Critic identified proportion, lighting and contact defects in the first activation.
Do not include source-development agents' operations in these Painter totals.

**First: reproduce and locate the real stop, before prescribing a fix.** Trace one
activation from a completed Guard operation and delivered image through the model's
review, final response, host scheduling/Automatic Continue and actual next dispatch.
Differentiate and record **five independent states**: (1) operation execution/receipt,
(2) acceptance or rejection of its exact pixels, (3) resolution of its local goal,
(4) satisfaction of the original whole-artwork brief, and (5) whether the *current
agent activation* has legitimately ended. A successful tool call, pixel acceptance,
neutral verdict, PSD checkpoint or final assistant message is not equivalent to
the latter three states. Establish which component terminates the activation and
why, rather than assuming Guard or the prompt is responsible.

**Host integration boundary:** if PaintPilot cannot ensure a next turn after a model
final response, use the **existing CoS continuation/agent-lifecycle mechanism**,
not another ad-hoc scheduler or a new orchestration daemon. **Before modifying CoS,
identify the checkout actually used by the running app** (process/executable and
loaded child/plugin paths); a sibling checkout or source directory is not proof of
the active build. Inspect its existing Automatic Continue/stop conditions, and
integrate only the minimal needed PaintPilot-to-host continuation signal.
Preserve user STOP/pause, safety, uncertain-operation no-replay and existing
Guard visual verdict/receipt authority. A prompt-only instruction is insufficient
unless an offline host-boundary test proves it works.

**Required state transitions:**

- `neutral` + `target_resolved=no` + unsatisfied whole brief -> choose the next
  **specific** construction/lighting/contact correction within the *same activation*;
  review one bounded pass before the next. A per-pass limit is a review boundary,
  **not** a stop condition for the overall autonomous run.
- Repeated neutral/no-gain or the same rejected request -> change the causal
  construction/dispatch strategy, using retained Critic findings and previous
  failures. Stop a fruitless exact retry with a **specific actionable blocker**,
  not silent finalization or unbounded identical attempts.
- Saving a PSD, closing a technical receipt, or accepting delivered pixels ->
  preserve unresolved local goals, whole-brief defects and Critic findings;
  no artificial completion of the Painter activation.
- A justified pre-dispatch refusal -> one corrected publicly valid request
  when evidence allows, otherwise an exact reason/blocker and next public
  action. `unknown`/uncertain review is **not** success; uncertain execution
  retains the existing reconcile/no-replay barrier.
- Terminate the active autonomous loop only on **confirmed whole-brief
  completion**, an **actual actionable blocker** that prevents safe progress,
  or an **explicit user STOP**. Do not invent wall-clock/pass-count limits.
  Convergence failure must be reported without declaring artistic success.

**Keep the hot loop compact:** the Painter obtains required contracts through
published `photoshop_guard_*` capabilities/status/recovery tools, **never** by
reading source/runtime files. Reuse already delivered exact-frame evidence and
the existing ordinary review + next-pass continuation; no compulsory image
redelivery, redundant report/close-only call, source inspection or separate
technical negotiation on a healthy cycle. Preserve the per-pass whole-frame
review barrier and one safe bounded mutation at a time.

**Narrow offline acceptance (no live painting/models/focus/restarts):**

1. `neutral` + `target_resolved=no` + Guard `continue_required` crosses the
   actual host final-response boundary and schedules the next concrete pass
   *within the same autonomous activation*.
2. PSD save / technical receipt / pixel acceptance leaves the artistic goal
   open and does not stop the activation.
3. Repeated deterministic rejection or identical no-gain attempt returns a
   concrete correction or actionable blocker, not another identical request.
4. Explicit user stop wins and suppresses subsequent automatic continuation.
5. Evidence-confirmed whole-brief completion suppresses continuation.

**Execution constraints for this task:** preserve all other agents' night work;
work against verified active checkout(s), no reset/clean/revert or broad unrelated
changes. Run only focused offline tests; **do not** run `verify:canonical`, live
painting, model calls, plugin/app restarts, UI focus actions or unattended
continuation during implementation/verification. When implemented, move source
and test details to canonical `CHANGELOG.md`; retain only unresolved live
activation/painting acceptance here. Implementation handoff must report the
**proven stopping cause**, code/host changes, narrow test results and the exact
activation step still required. Existing **E.24** review, **E.17** brief fidelity,
**E.8b** compaction continuity and **E.8** time-to-quality remain separate gates.

## Immediate user-run acceptance after activation

One consolidated **open** checklist; use public Guard/Photoshop commands
rather than source-file reads or assuming test counts certify the image.

1. **Loaded runtime and exposure.** Verify managed child revision
   `2026-10-10-chat-critic-journal-boundary` (or a documented newer build),
   UXP bridge `compact-v2-20261009-component-rebuild` (or a matching newer
   published contract), and availability of cycle_auto, art_director,
   resume, review_image, poll and reconcile under the actual host schema budget.
2. **Same-document recovery.** Match incarnation/witness, `details.layers`,
   physical owners, authoritative journal and exact current pixels after
   child/UXP reconnect. Old abandoned operations must not become new work;
   real pending/uncertain operations must show actionable IDs and recover
   via public status/resume/poll/reconcile without mutation replay.
3. **Fast first useful pass.** Retain brief/style, create a recognizable
   component, surface complete actionable validation errors at once,
   avoid unnecessary nonvisual closure turns and review its actual pixels.
   Dynamic stroke splits must preserve all targets and final-preview reserve.
4. **Semantic components and construction.** An articulated person/animal/
   instrument uses distinct editable parts and real layer contents.
   Move a parent/joint/contact target; verify authored IK lengths,
   changed/rebuilt dependent contours, layer identity, physical contact
   and perspective projection. Refuse flattened compound declarations even
   in simple_graphic; allow genuinely inseparable accents.
5. **Curves and painterly marks.** Paint a curved owner plus protected
   cutout and run one bounded reference-aligned Hertzmann/brush pass.
   Compare exact BEFORE/AFTER, physical layer, brush fringe, proportions,
   form/light/material and time-to-gain. Nominal polygon containment
   does not certify native pixel clipping.
6. **Nonvisual and image continuation.** Document-create → brush-select
   closes one unique confirmed technical receipt without a report ritual;
   several debts require explicit disambiguation. Same-chat unchanged
   evidence may be reused only with real caller identity; force delivery,
   unknown/restarted chat and changed pixels require actual image bytes.
   PSD/copy export must preserve unresolved brief debt.
7. **History, mask and ownership.** Test reversible local black-mask
   subtraction, additive independent components, one mask/stroke or
   existing-owner filter preparation, split suffix targeting, exact
   history/rollback and failure-before-mutation semantics.
8. **Critic, quality and timing.** Whole-scene Critic findings bind to
   this document/incarnation/brief/frame, survive export and unrelated
   local success, and drive a visible construction improvement. Capture
   complete time-to-frame and model-visible turns, not guessed savings.
   Human evaluation remains separate from Painter self-review.

Implementation details and pre-activation test checkpoints are already in
[CHANGELOG](../CHANGELOG.md). Further live details stay with their
owning E.* and human acceptance sections below.

## Baseline invariants for every remaining task

- Pin document/incarnation and targets; preserve editable/protected owners and bounded destructive authority.
- Use compact-v2 embedded Guard, UXP-only fail-closed dispatch, locks and durable receipts/recovery. No retired
  raw-script, COM/ExtendScript, controller/daemon, recipe or parallel fast-mode path; no uncertain/partial replay.
- One exact final whole-frame barrier per semantic pass; bounded OBJECT/MICRO evidence when needed. Preserve
  materialized SHA/role/crop/source coordinates; keep image bytes out of text. End a pass before an unseen
  intermediate result is needed to choose its next action; preserve interruption and best-frame recovery.
- Keep execution, local goal, Planner task and whole-brief outcome distinct. Goal is intent; receipt is execution;
  observation is artistic result. Reuse one observation across reports/review. Named objects, changed pixels,
  retained frames, elapsed effort and stage labels cannot prove rendering quality or global completion.
- Preserve observed defects/hard brief debt through save/export/STOP. Judge style against the brief, including
  intentional flatness. Uncalibrated judgement stays advisory; genuinely satisfied briefs stop promptly.
  Pending independent labels do not block ordinary safe painting.
- Editable semantic component declarations constrain ownership and physical separation, not artistic quality. No label/rationale-only quality veto, mandatory Director setup/per-tool critic, new review questionnaire/state machine,
  universal aesthetic/realism score, keyword inference, stroke/action/coverage quota or speculative orchestration.
- Reusable artistic knowledge holds intent, constraints, structural relations and proven success; scene plans/history
  stay separate. Never promote fixed object/stroke recipes, failed-scene colors/forms or fixtures into universal art rules.

### Shared Scene Constraint Escalation Rule

Keep one durable source when rebuilding other owners/passes depends on a shared, cross-stage or scene/camera fact.
Reuse E.18 geometry, E.19 light/color, E.20 imaging and perceptual hierarchy; derive once and invalidate selectively.
Do not repeat bindings or require per-pass opt-outs. Organic/freehand stays freehand; a new model needs dependencies existing contracts cannot express.


### Director and host exposure — live gate

Verify critical Director/recovery tools survive the *actual* COS schema budget.
Retrieve missing atomic command formats via public `photoshop_guard_capabilities(tool_name=...)`,
not source reads. On the current document, recover via status/resume, resolve
one complete set of returned attention/geometry errors, and preserve the
exact frame, hierarchy revision and authorized owner zone. Missing identities
may derive only from uniquely proven ownership; foreign/conflicting targets
must remain rejected. Prove one reversible black-mask correction, exact
intermediate review and substantial form/contact improvement without
inventing an additional planning questionnaire. Do not clear debt or replay
uncertain operations to bypass rejection.

## P1-E — Live-paint robustness, semantic ownership and Guard-cycle efficiency

### E.25 — Coordinate fidelity and connected object construction

**Open: native Photoshop pixel/owner acceptance.** Canonical cubic evidence:
[`run-02/canonical-pixel-verification.json`](../processes/curve-fidelity-process/run-02/canonical-pixel-verification.json).

**Live partial acceptance (2026-10-10):** the current managed child reports
Guard revision `2026-10-10-chat-critic-journal-boundary` and a matching UXP
bridge `compact-v2-20261009-component-rebuild`; the isolated 640×480 document
795 was verified, with no unrelated artwork selected. The previously blocked
`scale 50% (top-left) → move (+80,+30)` **now dispatched and completed**:
native bounds on physical layer 2 are exactly `(200,130)–(270,195)` against
the same expected bounds (**0 px error**). An independently editable two-part
hinged mechanism was painted on native layers 3/4 using IK.ts, smooth contours
and shared joint/contact; changing its contact target from `(187,382)` to
`(156,390)` and explicitly rebuilding both owners restored the actual physical
joint and removed old outlines. Exact images and a control PSD were retained;
see CHANGELOG for operation IDs and rollback evidence.

**Still open:** independently establish the full rigid parent-transform case,
dependent-owner propagation after physical move/scale, protected cutout/curve
fidelity and perspective invalidation, including negative controls for stale or
malformed parent provenance. The IK *pose-rebuild* acceptance above does not
substitute for these other E.25 cases. Do not declare E.25 fully closed.

**Additional live evidence (same day):** a separate two-owner rigid panel
(`e25_rigid_panel_20261010`), with independent shell and inset bar, was painted
on physical layers 5/6. A shared parent move + 18-degree rotation with fixed
intrinsic scale was rebuilt on both original owners (operations
`e25_rigid_pose_shell_rev2_h2` and `e25_rigid_pose_bar_rev2_i`); exact Photoshop
AFTER shows the correctly rotated inset and no accumulated old contours.
An unapproved `rigid=true` scale change was rejected **before mutation** with
`construction_rigid_shape_changed`. A further independent owner-coordinate
move of +9 px was verified at native bounds `(209,130)–(279,195)` and recorded
an authentic orthographic diagram Scene Geometry Model. The related control
PSD is `run-01/export/e25-rigid-ik-connected-20261010.psd`.
**Remaining:** prove physical move/scale *propagation* as distinct from
authoritative construction rebuild, cutout/curve/negative controls and
perspective invalidation. Do not overclaim E.25 closure from the rigid-pose
rebuild alone.

1. **Use the currently activated child.** Verify the loaded Guard source and matching UXP revision against the common
   activation gate above, not an obsolete bridge checkpoint.
2. **Constrained paint geometry:** on real Photoshop pixels, prove mixed strokes/regions/stamps/dabs obey the accepted
   geometry and physical owner target; malformed sibling payloads, invalid numeric values, conflicting/ambiguous layer
   targets, unsupported mixed operations and tolerance >2 px must fail closed.
3. **Ordered transform:** re-run the canonical compact scale→move case including `(80,30)`, inspect fresh active-layer
   identity/source bounds and destination pixels/bounds at **0–2 px** tolerance, and confirm unrelated operations cannot
   inherit exact-transform provenance.
4. **Connected construction:** live-accept one rigid connected object and one articulated chain after real move/scale;
   descendants must follow the validated parent transform, while malformed persisted parent bounds/provenance fail closed.

**Accept:** one mug and one articulated limb retain intended placement, proportions and connected landmarks after real move/scale; modelling follows that construction. Unknown perceptual geometry stays explicit. Correct numbers/JSON or corridor membership alone do not establish anatomy, perspective or artistic finish. Remaining live geometry acceptance stays open; history belongs to CHANGELOG.

### E.24 — Same-chat pixel review and technical closure

**Live slice (2026-10-10):** a new isolated 640×480 RGB document (id 795)
successfully completed a Guard-owned create-layer + painted-region pass;
exact BEFORE/AFTER were delivered for same-chat review, a separate layer
was verified, and the preceding nonvisual document-create receipt closed
within the next cycle. This is a *partial* E.24 acceptance only: meaningful
scene critique, technical review-debt recovery, Director evidence and
artistic correction remain open; see CHANGELOG for the reproducible trace.

**Geometry contract live gate:** after activating the current managed child, start a coherent-3D scene.
The public contract must expose horizon points, vanishing-point evidence and every binding field. Missing unique
owner/model/revision and pinned source identity are filled internally; support/contact/projection decisions remain
explicit. A malformed request returns the independently detectable nested field/reference errors together,
valid ids and a correction template with conditional spatial requirements, without source/schema/shell reads.
A second technically malformed attempt for the same problem returns stop-and-report rather than another retry
instruction; a valid correction still compiles. Measure time to the first painted scene and count technical
rejections. Source/test history is recorded in [CHANGELOG](../CHANGELOG.md); live pixel and quality acceptance remain open.

**Review:** [same-chat workflow](artistic-evaluator.md). Automatic local inference is removed in source. Existing exact-frame
review asks the Painter to judge visible form/proportions/perspective/light against original_brief/style, name the largest defect
and choose the next construction change through existing observation/pass fields. Repeated failure requires changing construction,
not cosmetic detail. This is self-review, not independent acceptance; commands/filled fields certify no quality. No extra Guard round.

**Public evidence live acceptance:** call `photoshop_analyze_value_structure` once after a meaningful delivered frame.
Expect its source SHA to equal that frame, a real durable `evidence_operation_id`, materialized grayscale/low-frequency
images and ready `director_evidence_fields`; a changed cached file/source-overwrite request must fail. Retrieve exact
saved style/strategy/assessment through `photoshop_guard_resume(document_id, director_fields)` and update Director
without SessionStore/shell/source reads. Do not use a fresh blank value check as a prerequisite to first construction.

**Next / acceptance:** after activation, one real modelling pass plus async/final review. Confirm actual images and original brief
reach the host, no model loading/request/wait occurs, and the ordinary observation plus next pass fixes a visible construction
defect without metadata negotiation. Human-check flat/abstract positives and realistic schematic negatives; keep E.8 independent
labels separate. A critique or correct JSON alone is not improved painting.
**Review-debt live recovery:** when a real compiler-rejected continuation leaves prior visual debt, deliver the
exact pending image/review through public `review_arguments`. Do not replay a mutation or manufacture another
mutation to create review debt. The rejected continuation must not finalize the prior verdict. Confirm the
subsequent E.7e pass actually improves the defective construction.


### P1-E.18 — Scene Perspective Model: live acceptance and real-paint enforcement

**Live only, AUD-02:** after verified current-child restart, change rail convergence → owner-specific
`generated_geometry_rebuild_debt`/next action in status/resume → regenerate or reject → prove dispatched
contours/strokes/transforms agree with current pixels and selective dependency invalidation. Source projection,
canvas-snapshot invalidation and dependency plumbing are complete and belong to CHANGELOG, not this roadmap.

### P1-E.11 — Semantic pass/history ownership

**Live partial acceptance (2026-10-10, document 795):** a prepared
`select_layer_by_name` + `set_brush` + native `paint_strokes` on `layer-mask`
produced a clearly visible black-mask subtraction on existing owner/layer 2,
without changing owners/layers 3 and 4. After the exact Guard-reported
**one-step** rollback requirement, `photoshop_undo(steps=1)` restored the
previous whole-frame JPEG **bit-for-bit** (SHA-256
`f4ba1dc18e838ead60238553c67e7e26ffd008955d1dfecb8964ee33025c226a`),
with four layers, no selection, prior active fore-link and no pending or
uncertain visual operation. This verifies one bounded mask/undo history case,
**not** complete E.11 parity. The separate Gaussian Smart Filter smoke was
rejected **before mutation** by `imaging_preflight_required` and then
`scene_camera_imaging_model_invalid` / `imaging_preflight_camera_model_missing`:
this isolated graphic lacks a durable matching camera/depth model. Do not
fabricate that authority simply to run a filter. The attempted
`restore_anchor_operation_id` was also rejected as the frame was not a
registered artistic anchor; ordinary proven bounded undo succeeded instead.
See CHANGELOG. **Next:** use a legitimately model-bound document for the
Smart Filter case; verify Smart Object owner/layer identity, exact history
including preparation, semantic parity after restore and interruption cases.

**Additional live E.11 evidence and reproducible blocker (2026-10-10):** the
document's actual orthographic scene geometry was durably registered by
`e25_ortho_scene_geometry_control_l`, then the same-document camera/imaging
model and explicit local technical exception passed preflight. Native
`e11_camera_bound_gaussian_20261010_m` applied a 3 px Gaussian Smart Filter
to owner `fore_link`: the physical layer converted NORMAL **id=4** →
SMARTOBJECT **id=7**; the Guard owner followed id=7 and all other owners
retained their layers. Photoshop History showed one native `MCP Gaussian Blur`
state, but the UXP outcome omitted `history_steps`; the Guard correctly
rejected a requested rollback with `semantic_pass_rollback_unproven`.
**Source fix prepared:** `uxp-plugin/p2-filter-ops.js` now returns
`history_steps:1` only after the successful suspendHistory/resumeHistory
transaction; UXP and Guard MicroPlan regressions passed **109/109** targeted
tests. **Not live-verified after the change:** plugin-only UXP reload was
reported successful by Adobe Developer Tool, but an unrelated concurrent
`close-old-technical-document-20261010-a` operation became uncertain and
Photoshop displayed a Save As dialog for `window-violinist-process` while the
bridge was unavailable. Do not alter that dialog, issue blind undo, claim
recovery or replay the other operation. First reconcile the concurrent
operation with its owner and verify exact document/bridge state; then run one
fresh isolated Smart Filter + exactly-owned undo to close this E.11 slice.

**First user-run smoke after activation:** selection/layer preparation plus one mask/stroke and a separate selection
plus one existing-owner Gaussian Smart Filter. Confirm one final preview/review, preparation failure stops mutation,
and verified Smart Object id changes retain the same owner. Undo includes history-writing preparation, not only paint;
zero-step preparation is valid only when explicitly reported. Missing counts remain unproven, partial failure remains
uncertain, and a prior accepted pass survives. No blind undo or blanket expansion of mixed methods/owners.

**Next; prerequisite for broader E.7b:** prove receipts own the actual contiguous Photoshop history span
or one atomic state. Check ordinary short undo and exact-anchor restore against retained stage/problems/representation,
same-revision Director task/finish facts, newer-plan preservation, owner hypotheses/construction revisions and geometry/depth/surface
bindings, plus actual layer/order/visibility/opacity/selection parity. Continue with review + next pass in one cycle.
**Accept:** normal/interrupted mixed-method/multi-layer recovery preserves an earlier accepted pass, editable owners
and failure history. Partial/failed/mismatched restore keeps debt without another blind undo. Legacy/no exact history or
incarnation remains explicitly limited; reconcile/restore an exact anchor. Fix a reproduced parity gap in its existing
owner; no second rollback store or model certificate. Implemented recovery and checks are in CHANGELOG.

### P1-E.27 — Bounded local-warp correction (after E.25 and E.11)

**DEFERRED; not implemented or live-accepted.** Do not start until **both** E.25 has verified
native Photoshop move/scale/coordinate/owner fidelity on real pixels **and** E.11 has verified
exact, safe rollback/history and recovery of a prepared mutation. This is a narrow addition to
the **existing Painting Method Palette `transform` family**, not a new autonomous repair
planner, Critic, candidate search, model service or mandatory planning/review cycle. It is
independent of the later E.7b broad multi-owner batching work.

**2026-10-10 gate:** E.25 native scale→move and articulated *pose rebuild* and
E.11 one-owner mask→bounded undo are now evidenced, but the remaining E.25
connected-transform cases and E.11 Smart Filter/semantic history parity are
still open. A later Smart Filter physically worked and preserved semantic
owner identity, but its legacy UXP history receipt omitted exact undo steps;
source/test repair is not yet confirmed live. **Do not implement `local-warp`
yet**; these prerequisites have not been discharged by the narrow passing tests.

**Problem / scope:** when the existing Critic identifies a spatial/form mismatch and the
Painter can specify an actual correction, allow an owner-local *controlled deformation* of
**existing pixels** instead of repeatedly repainting a bad contour with lines, regions or
texture. Use image-deformation Moving Least Squares (MLS) as the leading algorithmic option,
not as a general artistic-quality solution; its suitability for any particular Photoshop
implementation remains to be verified. Apply to arbitrary subject matter and styles,
including free-form objects, paths, garments and surroundings; do not introduce a human,
animal or architecture-specific dependency. The Critic/artist still supplies the desired
geometry: MLS cannot infer correct proportions, missing objects, volume, lighting or contact.

**Minimal operator contract:** exactly one pinned existing physical layer/semantic owner;
bounded region in actual canvas coordinates; at least the required nondegenerate
source→destination landmark pairs (or supported line handles); optional fixed/protected
anchors and neighbouring masks/owners; explicit maximum displacement/deformation and
out-of-bounds policy. Reject ambiguous or missing geometry, incompatible owner/geometry
revisions, edits outside the authorized region, protected-pixel movement and unsafe
stretch/foldover. For linked or compound construction, do **not** silently warp one part
while leaving dependent geometry apparently valid: either explicitly rebuild/invalidate
dependencies through existing E.25 construction contracts or refuse the operation.

**Photoshop execution:** first establish one supported native/UXP deformation path and
its exact pixel/coordinate behaviour in a disposable document (e.g. verified native
warp support); never assume generic `batchPlay` access makes an operation safe or
available. Alternatively use a bounded offline MLS raster calculation only if it can
be transferred through the **existing Guard-owned mutation path** without flattening,
replacing unrelated pixels or bypassing owner, history and mask authority. Preserve the
original image and reversible history. Do not add a raw-script/COM transport or a
second Photoshop executor. Add only a capability advertised as available after native
preflight; unsupported setups remain explicitly unavailable.

**Acceptance / stop condition:** one selected, already-observed geometry defect, one
owner and one reversible correction. Prove on real Photoshop BEFORE/AFTER pixels that
the requested displacement is applied within measured tolerance, fixed/protected areas
stay unchanged, physical owner/layer and required dependents stay consistent, and
rollback restores the exact pre-operation state. The ordinary whole-frame artistic
review must find a visible reduction in that **specific original defect** without a
new major regression; valid MLS numbers or successful Photoshop execution alone do not
certify artistic improvement. Test malformed/control-point and interrupted-operation
fail-closed cases in focused existing suites. If no safe native route or demonstrable
quality gain appears in this bounded case, **stop and defer E.27**: no framework rewrite,
extra library stack, multi-candidate search, broad benchmark campaign or speculative
rollout. Keep unmet brief/scene debts open.

### P1-E.7 — Replace orchestration-heavy painting with useful visual passes

#### E.7b — Batch by visual dependency and recovery scope, not tool labels

**AUD-34, after E.11 proof.** In [cycle-compiler](../src/core/guard/cycle-compiler.ts),
[executor](../src/core/visual-microplan.ts) and [tool surface](../src/tools/visual-microplan-tools.ts):

- Permit knowable connected fill/region/brush/filter work on several editable owners. Replace
  compact_pass_mixed_method_class, blanket compact_pass_multiple_layer_creation and global-scale two-mutation
  contraction with actual payload/duration/risk/recovery/observation bounds; renaming a pass local is insufficient.
- Infer individual step classes and created-layer references internally; pin targets and journal each receipt.
- Accept one-action correction and one object modelled through compatible mixed tools/owners with one final review.
  Test intermediate-preview dependency, protected-target refusal and failure after an early action: exact partial
  retained/rolled-back scope, no earlier-pass loss. Raising constants or flattening owners does not close the task.

**Independent narrow slice: live acceptance remains.** Use preparation plus one mask/stroke, or one existing-owner
Gaussian Smart Filter with unchanged imaging/owner authority. Check select-layer + mask, set-brush + stroke and selection
+ filter with one final preview/review. Preparation history belongs to the same recovery span; a failed preparation
must prevent mutation, missing history counts must not mint an exact rollback, and verified Smart Object conversion
must preserve physical ownership. Other filters, mixed owners, exports and intermediate choices still split.
Source details/tests are in CHANGELOG; broader expansion still requires E.11 live proof.

#### E.7c — Keep execution safety; remove per-mutation artistic certification

**Initial tone live gate:** create a separate layer and apply one pinned `photoshop_fill_layer` before the first
recorded visual frame, without declaring object construction or optional method classification. Expect zero scene-geometry
negotiation, one execution and exact-image review; this cannot certify space, volume or finish. Declared construction,
existing-layer fills, gradients and later modelling retain their applicable geometry/ownership checks. Code/history: CHANGELOG.

**Code, AUD-23/AUD-35:** remove other reproduced prose/label-only vetoes; keep descriptive fallback notes audit-only.
Align AGENTS, host guidance, schemas/tests and inline/reference review with ordinary exact-frame closure. Preserve optional detailed evidence without inventing a
passed certificate from omission; real edge/mass/focal/primitive-footprint failure remains review debt.

**Live gate after restart:** ordinary blur/form/atmosphere and unambiguous direct/gradient/bundled methods survive
stale descriptive hints without a repair round; brush-built fields/volumes need no invented gradient-fallback history;
missing method-classification fields derive from compatible execution only when unique; otherwise validate supplied hints without requiring completion, equally for Russian/English goals.
Expect no repair/recompile or goal-keyword inference; incompatible hints, explicit exclusions and destructive authority retain validation.
Director directives accept short non-empty objectives/strategies, relevant style fields and an omitted first-pass list;
unresolved structural conflicts or missing required user choice still fail. Code/history: CHANGELOG.
1–2 meaningful previews require no Director call. Actual defects,
execution/ownership ambiguity, explicit method exclusions/construction choices and destructive authority retain their refusal/recovery paths.
MATERIAL brush/filter passes need no per-pass `material_response` planning prose; supplied plans remain validated/audited,
and omission cannot resolve exact-frame material/refinement debt or unlock detail. Verify both direct and bundled routes.

#### E.7d — Compute dependent geometry once and use it to draw

**Open live gate:** change one retained pose or shared landmark; show the dependent contours,
rebuild debt and physical Photoshop layers match the resulting pixels. Geometry JSON alone
does not establish correct anatomy or certify old pixels after a model revision.

**Code, AUD-36:** reuse orthographic_or_diagrammatic, flat_or_collage or intentional_non_euclidean applicability
only when exact brief/style authority makes it unique. Do not fabricate weak perspective for organic/storybook work;
ambiguous/rigid construction keeps E.18 authority. No model-visible arithmetic round or deterministic artistic guess.
Other uniquely derivable action facts belong to AUD-08; executable geometry live proof belongs to E.18.

#### E.7e — Reach form/material quality, not a faster pictogram

**Open live gate:** prove native brush/layer/contour fidelity and visible artistic gain;
surrogate error or generated-mark counts do not close E.7e.

**First; user-run experiment:** [wuxia road acceptance](../processes/e7e-wuxia-road-form-process/run-01/acceptance.json)
and [run brief](../processes/e7e-wuxia-road-form-process/run-01/RUN-NEXT.ru.md). Open only the prepared working PSD copy;
frozen v2 BEFORE PNG/PSD and SHA are retained. Rebuild the central road's turning planes/contact and one adjacent reed
bank before texture/fog/film overlays. Compare equal-scale whole-frame plus grayscale/low-frequency evidence within
15 minutes from the first construction mutation, at most six bounded passes. Preserve the original King Hu wuxia brief.
PASS requires visible structural gain; texture over the same wedge is FAIL. No live run or artistic gain is claimed.

**Other reproduced controls:** freeze brief/accepted anchor and a 15-minute wall-time budget. Rebuild a substantial visible
area through brush/dab/stroke modelling of mass, turning planes, value, light, contacts and edges; use editable masks/owners.
Compare equal-scale BEFORE/AFTER and whole frame before grain/bloom or other finishing overlays. Use stairwell steps/wall
or the rear-facing cat/rabbit as reproduced failures, retaining each original requested style and pose. Animals watching
the sunset need credible backs, seated masses, ground contact and light; missing visible faces are not a defect.

**Accept:** clear improvement in depicted structure and requested finish, beyond silhouette plus texture strokes;
then repeat on another subject/style in E.8. Geometry/proportions must agree with drawn pixels and shared scene anchors;
colour decisions follow this brief/reference, not an inherited demo palette. Include large-area sky/terrain structure,
city planes/vehicle volumes/contact values and surface-bound reflections when relevant. Extra polygons, fur marks,
noise, blur or renamed "volumetric" passes cannot certify modelling. Intentional flatness remains valid when requested.

**Code only for an observed obstacle:** correct ineffective brush dispatch/settings, or compile repeated mark controls
into existing bounded stroke/dab packets when hand-authored coordinate lists are the measured bottleneck. Reuse the
executor/receipts and one ordinary final review; no second painter/controller, brush quota or new artistic questionnaire.
If the image remains schematic, change the construction mechanism; record the failed result, not a promise of later texture.

**Mug/apple/cloth live control:** repeat the [staged acceptance](../processes/e7e-mug-volume-process/run-01/acceptance.json)
with visibly effective brush settings. Prove surface turns, handle attachments, an actual cloth
fold and coherent light/occlusion; reserve low opacity for intentional glazes. `target_resolved`
or the number of generated marks cannot certify pixel quality.

**Opacity live gate after deferred reload:** a new solid foreground object occludes the old scene before glazing;
low-opacity marks do not leak settings into later marks/AUTO chunks/calls. Existing receipts expose actual target/parent
opacity, fill and blend mode; deliberate glass/fog/glazes survive. Labels and 100% settings do not prove pixel coverage.

**Rendering live gate:** model one main object beyond silhouette/accents through light/value turns, contact and materials.
No contour-point workaround or SHAPE fill priority; observed owner scaffold debt keeps refinement/detail unfinished.
An identical decoded frame closes as neutral/unresolved without a wording repair; intentional-flat briefs remain valid.

#### E.7f — Turn visual defects into executed corrections, then extend surface rendering

**Planned; not implemented or visually accepted by this entry (2026-10-10).**
Extend E.24/E.7e and E.19 through the existing Critic → Painter → Guard path;
E.26 owns continuation across host turns. Reuse existing findings, component owners,
construction and brush/mask executors; no parallel critic, scheduler or quality schema.
This is category-independent work for arbitrary objects and brief-defined styles.

**First — close the correction loop.** Translate each visible Critic finding into
an executable correction at the appropriate scope: a missing object needs its editable
components built; composition needs changed major masses/placement/scale; flat volume
needs revised form/light; weak material needs surface-dependent light/edge response;
wrong contact shadow needs corrected contact, receiver and lighting geometry.
The Painter supplies artistic choices; do not infer a universally correct composition
or proportions from an object name. Execute one bounded correction, inspect exact pixels
and the whole scene, then continue while the defect remains. Repeated neutral results
require a changed construction/strategy or a concrete blocker, not cosmetic texture
over an unchanged structural error. Preserve E.26 user-stop and uncertain-operation rules.
Guard validates execution/provenance; mathematical or field validity is not visual success.

**Original-brief anchor — planned extension of the first step (2026-10-10).**
Before selecting the next pass, include a compact task anchor in the existing
continuation: original intent, the main unresolved brief requirements and how the
chosen action addresses one of those requirements. Derive it from the retained
original_brief and exact-frame findings; a local goal or success summary must never
replace the original task. Use existing goal/next_change and review fields, without
another compulsory questionnaire, host call or long user-visible recap.

At whole-scene Critic checkpoints and after context compaction/recovery, provide
the complete retained original prompt again within the existing response/recovery
path. An earlier delivery receipt or brief hash is not evidence that the text remains
available in the model's current context: bypass brief-text deduplication at these
boundaries independently of image delivery. Do not recapture/retransmit unchanged
images merely to restore the task. If the original task cannot be recovered, retain
uncertainty and report the exact blocker rather than inventing it or reading sources.

Check the relevance of the chosen correction: which substantive unmet requirement
of the original brief does it improve, and why is that the next priority? A local
highlight/texture gain cannot substitute for a missing subject, incorrect composition,
unresolved form/light/material or contact. Preserve brief-defined intentional flatness,
protected qualities, explicit user changes and E.26 stop/recovery rules. Guard checks
binding/persistence; Critic assesses the depicted relevance and actual gain.

**Narrow acceptance:** replay saved cases for a long local-action sequence, a Critic
checkpoint with a previously observed brief, and compaction/recovery. Confirm the exact
full brief is restored at the required boundaries and the next correction links to
retained whole-scene debt without extra calls, duplicate images or false completion.
Technical delivery checks do not establish visual improvement; E.7f/E.8 image review does.

**Second — extend authored form and illumination targets.** Beyond the current
ellipsoid/light-field, support artist-specified planes, cross-sections and approximate
surface normals in shared object/scene coordinates. Derive coherent shading from the
chosen geometry and light, and feed the resulting target into the existing bounded
painterly executor. Preserve component masks and protected neighbours. Hertzmann
translates a target into marks; it cannot repair an incorrect target or infer anatomy.
Start with one bounded surface case before generalizing; no subject-specific templates
or fixed named-style taxonomy. Native Photoshop pixels must confirm the calculated effect.

**Third — turn shadow and material relationships into pixels.** Use explicit caster,
receiving surface, contact and light relationships to calculate bounded shadow masks,
including contact density and falloff appropriate to the chosen model. Use surface
orientation and artist-chosen material response to drive highlight/reflection shape,
edge behaviour and texture direction/scale. Generate real masks/brush actions through
existing reversible executors; material_response planning text alone does not render
material. State approximation limits; do not claim general physical rendering or infer
hidden geometry. Establish form/light before supporting microtexture.

**Acceptance — five small saved cases:** missing object, composition, flat illumination,
weak material, incorrect contact shadow. Retain each original brief, exact BEFORE/AFTER,
editable owners and protected regions. Compare at equal scale and in whole-scene context;
object visibility/recognition, requested layout, volume, material and grounded contact
must actually improve in their respective cases without unacceptable regressions.
Use narrow offline checks for changed calculations/dispatch; they establish technical
correctness only. Image review establishes visual gain, with E.8/P1-B retaining independent
artistic acceptance. Reuse saved evidence where possible; prepare cases before any
separately authorized live run. Do not add per-stroke questionnaires or arbitrary run quotas.

### P1-E.8 — Quality/time comparison and rejection-path throughput

**Next:** freeze original brief/settings, [baseline image](../processes/documentation-maintenance-process/pre-quality-speed-roadmap-20261001T145358Z/night-city-user-baseline.png),
processes/night-downtown-city-process/run-01/ and night-downtown-20261001-* journals; run fresh matched model/host/canvas/tools/start states. Old-scaffold
continuation is diagnostic. Package exact local references/briefs; record missing inputs/environment/interruptions.

**Accept:** blinded randomized whole-frame A/B and needed equal-scale crops prefer improved finish at equal wall time,
without lost composition/recognition. Record earliest baseline-quality and predeclared improved-quality frames; target
better quality before the old **29:10** budget. Give brief, omit producer verdicts/timings/counts; use qualitative preference,
no aggregate score. Human-unavailable results stay unverified. Repeat a success on homestead/another existing holdout.
Negative controls: faster same scaffold, added windows without form, cosmetic noise/blur, empty stage advancement and
self-reported gain; intentionally flat briefs remain valid controls. E.8a owns honest cost accounting.

**Warm-route median targets:** review_finished → actual artistic intent ready **10–15 s**; server intent_received →
dispatch **≤2 s**; model-visible Guard calls/artistic mutation **≤1.5**. These are benchmark targets, not Guard gates.
A next_pass_ready proxy cannot prove the actual intent-ready interval; keep unmeasured intervals unknown.

#### AUD-S11 — Simple storybook painting hot-loop acceptance (selected 2026-10-03 scope)

**Live gate:** existing cat + rabbit holding carrot + sunset watercolor, **3–5 minutes** on a warm healthy route
to equal-or-better finished whole-frame review. Exercise AUD-07, AUD-08, AUD-09, AUD-10, AUD-29, AUD-34, AUD-35, AUD-36, AUD-37:
inline review, connected passes,
deterministic repair, softness, legitimate geometry applicability, run-level brush reuse and compact continuation.
Connected environment/subject/finish decisions are examples, not quotas; unit checks and faster worse pictograms fail.

#### E.8e — Post-E.8d hot-loop hardening

| Owner | Next action / acceptance |
| --- | --- |
| AUD-08 | Live: continue/adjust omits saved description, rollback value, layer_separation_check, ID/name and a region's physical target without model-visible rejection. The compiler may locally repair an omitted target from the unique durable owner, but must refuse explicit foreign targets and mixed ambiguous targets. Fresh rollback/structural changes require explicit separation; fresh assessment wins. Use the durable target after migration; refuse conflicts/absent authority. Derive other reproduced owner facts from context, never invent unknown/create-new facts. Zero added state reads/second state owner; E.7d owns geometry, E.7c method hints, artistic ambiguity stays model-owned. |
| Strategy recovery | Live-check bounded failed/regressive/promising history + existing causal-change requirement in close-only/status/resume and combined/async responses. No new calls or preferred-method invention; pending review remains mandatory. Verify stable problem identity and retained improvement through actual E.11 restore. |
| AUD-29 / AUD-S8 | Code done: 24-KiB UTF-8 status/resume budget; exact required references/bindings survive, omissions/full projection are explicit. Live-check large-history recovery and actual context savings after reload; no additional healthy-loop writes/reads. |
| AUD-16 / AUD-37 | Live gate: one real catalog/settings/runtime-instance drift triggers exactly one bounded brush reprobe; healthy repeats perform zero inventory/settings reads. Reuse the original evidence epoch and preserve unexplained-change refusal. |
| AUD-09 | Validation only: clear the canonical painting-policy gate (sticky commentary/tutorial rationale and prompt-size invariants) before declaring bounded-continuation closure. |

Check covered deterministic defects need no model retry; splitting survives message rewording; hundreds of journal
records or active jobs do not add helper-count-dependent scans/UXP reads. Preserve AUD-01 request-local snapshot and resume/recovery
correctness. In controlled owning live cases, exercise one covered deterministic repair and one safe budget split/defer:
durable audit, no model payload-repair/recovery round or extra state/preview read for a never-dispatched rejection;
continue the deferred piece only after supporting review. Pair engineering evidence with E.8 image-quality comparison.

#### E.8a — Split visual-confirmation telemetry

**Partial source implementation closed; E.8a live acceptance OPEN.**
The append-only fsync event archive, per-event sequence/checksum/incarnation,
verified >64-event run benchmark, >32 MiB streaming input and bounded
selected-event memory safeguards are in [CHANGELOG](../CHANGELOG.md)
(2026-10-10 Agent 1–3). None alone establishes exact real-run totals.

1. **Multi-process and interruption.** Run interleaved run prefixes, restarts,
   interrupted writes, PSD checkpoint and expensive review/poll/recovery.
   Demonstrate complete owned events or explicit gaps/`unverified`.
2. **Unkeyed catch paths.** Attribute a rejected/deferred/recovery/repair
   round trip only when durable evidence proves run/operation ownership;
   ambiguous overlaps remain unknown. Missing, malformed, partial and
   unsafe semantic-action or optional counts are *not zero*.
3. **Unlimited selected-stream aggregation.** Remove the current interim
   16 MiB/50,000-selected-event `unverified` ceiling by exact bounded-memory
   streaming aggregation. Preserve checksum, sequence, incarnation,
   stable-read and legacy-history checks; no truncated exact prefixes.
4. **E.8 linkage.** Measure real wall time, first useful/accepted frame,
   dispatch, previews, recovery/rejection turns, action counts and reads.
   Compare complete frames at matched time with E.8's independent review.
   Offline/synthetic timing cannot establish acceleration.

**Accept** real concurrent/interrupted host proof with complete trustworthy
counters, or correct explicit uncertainty where evidence is missing.
The separate E.8 image-quality/time claim remains unverified.

#### E.8b — Compaction-safe continuation: remaining COS/live gate

**Sibling chat-on-steroids-FORK:** inject existing checkpoint at real compaction; resume exact document/incarnation/
operation/frame with bounded failed-replacement-chat watchdog. Join host compaction/recovery/native planning/review
to Guard timeline; remove/asynchronize fixed attribution waits. Reproduce 2026-09-30 failure: healthy continuation in
seconds, prompt failed-resume recovery, separate idle/compaction/recovery/dispatch timing. Diagnostic markers stay opt-in.

#### E.8c — COS schema-budget-safe publication of critical Photoshop/Guard tools

**Sibling host, AUD-30 P0:** reserve/reorder/bounded degradation must protect ping/required reads; Guard status/resume/
cycle/cycle_auto/review_image/job_poll/reconcile/set_priorities/art_director and any mandatory next action/protected replacement.
Test every current upstream tool enabled, shuffled order and over-budget schemas: complete when fit, explicit omissions when not;
diagnose count vs byte ceilings and regenerate catalog sizes. Final COS+ChatGPT session reaches Art Director after normal
child restart/Refresh, without Photoshop restart, checkbox juggling, disabled ordinary tools or contract changes.
Measure schema bytes and actual selection errors before consolidating/search-gating homogeneous tool clusters;
preserve typed contracts and required-action exposure. No mega-tool or extra mandatory discovery round.

### P1-E.17 — Brief fidelity: remaining live acceptance

**Open nonvisual continuation gate:** after activation, confirm document-create → brush-select
closes its unique exact technical receipt without another model round. Multiple debts need an
explicit ID; visual/uncertain operations remain in review/recovery. Measure first-image time.

**Reconnect acceptance, before another long painting run:** restart only the companion/session with a painted document
still open. A changed UXP session must quarantine and preserve its art run, current frame, Director state, owners and
history rather than assert document replacement. After user confirmation, public resume must obtain fresh exact-frame
and owner evidence internally; mismatch keeps work preserved and blocked. A different document object in the same UXP
session still retires stale state. Test interrupted/uncertain work separately; recovery must not replay or auto-finalize it.
Keep actual document-close cleanup, first recognizable construction and no-source painting checks in the same smoke.
Code completion is documented in CHANGELOG; timing and live identity/artistic acceptance remain unmeasured here.

Director remains optional and plan-oriented. Local pixel retention, goal, task, stage and global finish stay separate.

**Next:** after reload, verify selected commentary/progress language at every detail level independently of panel locale;
exact unchanged frames close confirmed completed execution as no-effect/unresolved, without replay or new recovery reads.
Physical-stack/occlusion review must work with and without Director. Tiny change is insufficient/uncertain, not proven absent.
Keep recognition, refinement, hostile review, frame authority, dependency and STOP requirements. Observed world conflicts
use existing findings; uncertain/uncalibrated machine criticism cannot create automatic hard style/physical debt.

**Accept:** named objects or local texture gain cannot complete missing realistic form/material rendering; genuinely
satisfied briefs stop. Use city/tram/still-life negative controls and intentional-flat positives. E.24 tests prove mechanism;
E.7e/E.8 and human Tasks 22/8b own actual artistic completion. Do not reopen completed implementation as new prose tasks.

### P1-E.19 — Remaining Lighting/Color Acceptance Work

**Live only:** prove coherent palette/value, source/material interaction and atmosphere; exact RGB remains artistic.
Reuse shared constraints and E.7c/E.7e without fresh per-pass causal prose. [Context](ru/process-revision-perspective-color.md).

### P1-E.10 — Maintained homestead regression and completion gate

**Next:** one replayable/live scenario joins E.7 passes/review/checkpoints, E.1/2/6/11 ownership/rollback, E.4 frame/
recovery lineage, E.14 methods, E.18/19/20 constraints/hierarchy, E.17 fidelity and E.8 quality/time. Fix failures in
owning subsystems. Machine closure needs canonical + fresh live behavior; better-images-sooner also needs independent E.8 evidence.

### P1-E.6 — Owner-stack corrective transaction ergonomics

**Open native mask gate:** on a verified physical owner, prove real gradient polarity,
affected pixels, selected-mask/channel preservation and single-history-unit failure rollback.
A whole-owner gradient does not protect an individual focal region; use a bounded mask
brush for local carving. Verify pixels and disposable-hypothesis commit/rejection.


**Pull forward for reproduced destruction:** local temple-mask intent hiding the whole focal owner is the first case.
Use known target/affected bounds and native mask direction semantics; protect retained owners with a disposable
duplicate/hypothesis when needed, then one exact review before commit. Rejection discards the experiment and restores
the accepted scene/semantics; test local-vs-whole-owner scope, direction, commit and failed-stage parity. Reuse existing
owners/transactions; no blanket staging or universal visibility score. Uncertain/partial execution still reconciles.

**Later:** identical source-bounded carve/mask across a verified owner/correction group; transaction only with backend
all-or-nothing proof. Otherwise preserve medium/high-risk ERASE one-mutation/one-layer bounds. One before/after review,
exact ownership/partial reconciliation; ordinary additive work does not wait for this extension.

### P1-E.14 — Finish effective tool/brush breadth and prove it live

**Rendering need first:** focused live tests must prove useful distinct mark footprints/contextual fit; paint_regions
recedes when form/material needs other marks. No rejected-candidate questionnaire, random diversity or speculative tool
family. Actual pixel gain closes selection experiments; E.8e owns reuse, E.14a pressure.
Keep BRUSH/PENCIL/ERASER/SMUDGE dispatch, pixel-effect and settings evidence in existing runtime capability snapshots,
bound to backend revision and selectively invalidated. Known ineffective mechanisms cannot be the sole structural fix;
unknown evidence prompts a bounded probe only when needed, never a mandatory probe before every artwork/pass.

#### E.14a — Pressure-response profiling for stroke tools

**Later experiment:** same paths/settings with simulatePressure=false/true for BRUSH/PENCIL/ERASER/SMUDGE; add tools
only when backend live-proven. Compare footprint/width, density/strength/buildup/texture/edges/path response, including
no effect/settings dependence, against segmented size/opacity/flow ramps. Publish exact rendered profiles; no assumed
curve or undocumented per-point pressure/tilt/bearing. Distinguish mechanisms in docs.

### P1-E.22 — FFmpeg Visual Process Trace: progressive playback and live acceptance

**Open playback gate:** with 120-fps capture and 30-fps playback (4× slower),
verify genuine intermediate frames, clip/caption durations and final concatenation
without double slowdown. Measure recording overhead independently; optional for artwork quality.

**Next, after the 120-fps/4× trial:** prove actual canvas redraw between bounded execution chunks in the existing UXP
batch executor, within one Guard operation. Enable progressive presentation only for video capture; preserve action
order/settings, targets, history ownership, interruption/partial recovery and one final preview/review. No extra Guard
cycles, state/preview reads or per-chunk acceptance. Prefer native redraw/yield over fixed sleeps; measure added wall time
against the same pass without progressive capture. Accept a recording with distinct intermediate drawing states and
equivalent final artwork/recovery; duplicated frames or a crossfade between before/after do not demonstrate drawing.

**Optional live gate:** failed attempts, later correction/rollback retention, interruption/resume order/idempotence,
and deterministic final MP4/SRT/manifest rebuild from retained clips; at least two successes, one unsatisfactory
attempt and correction. Bind intent/execution/result captions to exact operations; optional TTS follows chronology.
Photoshop stays open/non-minimized without foreground activation; recorder failure must not block/replay/bypass painting.

## P1-B — Remaining real-paint and artistic acceptance

Human-gated, independent engineering continues. Sequence: Task 23 → 22 → 15d.3 → 21.

### Task 23 — Blinded human progressive-refinement acceptance

**Human repeat/adjudication:** task23-review-pack/task23-blinded-evaluator-bundle.zip, review-form.v2.blank.json,
INSTRUCTIONS-v2-RU.txt and aggregation-rule.v2.json; follow [visual evaluation](visual-evaluation.md).
Modelled form positive; texture-only/residual block-in/destructive overdetail negative; intentional-flat control valid.
Record labels/matrix, then retire. Workers cannot manufacture human labels from intent/logs/pixel statistics.

### Task 22 — Final target fidelity / prompt-to-frame acceptance

**Human E.17 gate:** original brief/hard items + exact final frame, no producer/tool/count cues; MET/NOT_MET/UNCERTAIN.
Cases: complete brief, recognized content/wrong finish or style, lighting-led and explicit material/detail where flat
block-in fails. Runtime claims agree; adjudicate uncertainty, wrong style cannot be offset by recognition, positive stops.

### Task 15d.3 — Compositing/material/atmosphere artistic gain

**Human BEFORE/AFTER:** improved material/depth/atmosphere with convincing structure; texture/blend/masks cannot hide
unresolved form/composition. Keep perceptual judgement separate from execution.

### Task 21 — Real-artwork artistic preference over anchors

**Human current-vs-anchor:** meaningful artistic tradeoff, not detail/pixel delta/undo success. Restore the anchor
through existing Guard if the later frame is weaker; do not silently finalize it.

## P0-D — Human critic calibration and decision-quality validation

### Tasks 8 / 8a — Human adjudication of the isolated critic

**Human held-out comparison:** task8a-review-pack/review.html, reference template and
`node scripts/task8a-calibration.mjs validate`. Gains/regressions/ambiguity/identical pairs; local gain/global loss; simplification/lost strengths;
mechanical repetition/rhythm/stylized-surreal cases. Baseline vs bounded critic/relational context: detection/miss/false
alarm, uncertainty, keep/rollback/promotion, latency/cost and repeat/order consistency. Promote only human-justified
narrow authority; otherwise advisory/shadow. Model agreement is not truth.

### Task 8b — STOP / FINALIZE calibration

**After 8/8a:** FINALIZE_NOW/CONTINUE_REQUIRED/CONTINUE_OPTIONAL_OR_AMBIGUOUS. Zero held-out false finalizations on
unmet hard briefs; fewer needless continuations on complete frames; ambiguity abstains/escalates. Finalization stops
automatic mutation until new user input or contradictory evidence.

### Tasks 6, 11 and 13a.1A / 13a.1C — inherited human claims

**Same labels:** spatial/connectivity/intersection detection without stylization false positives (6), independent
whole-image regression detection (11), bounded transition/final critic authority (13a.1A/C). No additional evaluation stack.

## P0-E.7 — Supplied brush/stamp-pack live/human acceptance

**Wait for real user pack/folder.** Fresh-chat focal subject/environment/depth/light/material; ingestion/attribution,
bounded profiling/durable roles, media-brush passes, per-instance stamps when available, organic anti-copy review,
integration/overpaint, multiscale/final-vs-brief review. Pack vocabulary shapes coherent art; generic brushes or mere placement fail.

## PaintPilot first release — remaining public/release work

**After coherent green milestone:** identity sweep, governance, verified funding endpoint, milestone/tag and first
project-owned release from lavalava45/paintpilot-mcp.

- Product: **PaintPilot — AI Digital Painting for Adobe Photoshop**; **Autonomous AI painting agent for Adobe Photoshop,
  powered by MCP.** Provenance belongs in LICENSE/NOTICE/history/dedicated docs.
- Disposable PR tests default-branch Ruleset: no deletion/force-push, normal PR writes, squash, meaningful reliable
  required/up-to-date checks and narrow documented emergency bypass.
- Sponsor only a verified user-approved endpoint/account in .github/FUNDING.yml; no placeholders/private data.
- Tag/notes/install/MCPB/package artifacts; public install/use without upstream checkout/remote/release knowledge,
  retaining LICENSE/NOTICE. AUD-33: generate/set-compare public tool/control-plane names/counts; replace stale prose/regex checks.

## P1-D — Host-neutral MCP + portable Agent Skills

After stable P1-E machine closure; human availability need not block it. One canonical craft/policy source,
host adapters, local COS-first preference outside public correctness.

### P1-D.1 — Inventory host coupling

Classify COS/Core/Plugins references as requirement/local preference/host guide/obsolete; remove hidden portable-policy coupling.

### P1-D.2 — Canonical host-neutral contract

Equivalent standard MCP schema/lifecycle/recovery/preview/UXP across hosts; discovery/namespaces cannot change correctness silently.

### P1-D.3 — Portable Agent Skills

Bounded painting/Guard/recovery/multiscale-final-review/supplied-pack packages reference canonical policy; same package across hosts.

#### P1-D.3a — User-facing skill configuration

**Portable packaging/parity only:** versioned user_config/presentation_context via photoshop-skill.config YAML/JSON;
prove another non-COS host. Reuse precedence/defaults and strict presentation-only authority; no second policy DSL.

### P1-D.4 — Generic MCP installation and host guides

Codex, Claude Code, Cursor/generic stdio client and COS adapter guides use the same server/skills.

### P1-D.5 — Preserve local COS-first routing

Keep discovery/ping/Guard readiness preference in local/COS policy; public workflow remains host-neutral.

### P1-D.6 — Cross-host parity smoke

Runnable Codex/current COS parity of tools/schema/Guard lifecycle/skills; Claude config/smoke where available. Config
files alone fail. Close after packages/guides, tested parity and preserved local behavior.

## Conditional work — do not implement before its trigger

### Guard reliability ideas — existing owners first

[Source note](../processes/documentation-maintenance-process/pre-video-120fps-guard-intake-20261004-134829Z/docs/PAINTPILOT-GUARD-RELIABILITY-PLAN.md) is design input, not a second implementation queue. Execute
E.24 live review → E.7e rendering → E.17 no-effect closure → E.11 semantic parity before broader
E.7b/E.6 transactions. Existing automatic checkpoints need only E.8a's failure/parity/timing check, not reimplementation.
Extend E.8's existing benchmark with no-effect, destructive mask, strategy change, semantic rollback and due-checkpoint
cases; aim for 50% fewer avoidable model turns on reproduced failures while healthy-loop reads stay flat and E.8 quality
does not regress. This is a measured target, not a new Guard threshold. A generic impact estimator or unified transaction
abstraction is conditional on repeated code duplication/failures after these fixes; do not introduce a new orchestrator.

### Task 10 — Compact artistic relationships / achieved-quality memory

Only if human 8/8a evidence improves keep/rollback/promotion or repeated misses: small evidence-bound/revisable causal
state. Audit relevant persistent prompts/fixtures for recipe leakage when a run reproduces that bias; preserve
intent/constraints/success evidence, not a universal action sequence. Validate on a different scene/style before reuse;
keep scene-specific plans and historical examples separate. If it only lengthens prose, close as not adopted.

### External-source audit — Editmamei (conditional)

Only for a reproduced gap in E.17/E.8e/E.8c: inspect the relevant [Community source](https://github.com/editmamei/editmamei)
at a pinned revision, beyond README. Record mechanism → current PaintPilot path → evidenced gap → adapt/reject, with
targeted validation and measured cost/error benefit. Audit output/state/verification/discovery/recovery only as needed;
respect license/provenance. Do not port COM/AppleScript transport, inaccessible Pro templates or photo-retouch assumptions.

## P3 — Optional exploration

### Task 15c — Reference / 3D construction support

Only if a bounded experiment improves proportion/landmarks/depth or throughput; no mandatory 3D or artistic proof from geometry alone.
Local perception is conditional on repeated coordinate failures that existing canvas/layer/owner geometry cannot solve.
Start with bounds, owner masks or simple edges/components from existing captures; accept fewer errors/vision rounds at
measured cost. A generic ONNX/detector/face-mesh runtime is not an automatic next task.

## Validation policy for remaining work

Reproduced need → narrow owning check → owning live scenario when required → independent labels for perceptual claims.
For code slices, reuse existing coverage and keep only distinct risky scenarios; no routine variant matrices,
helper-mirroring tests or repeated unchanged runs. Run only the affected checks; full suites belong to the gates below.
Run canonical verification for machine closure/before PR or release; docs-only changes use preservation/diff/link audits.
Update the matrix and retire completed actions to CHANGELOG. A ready implementation keeps one concrete live gate here,
not its implementation/test history. Optional exploration/tool migrations/caching/transport/thumbnail/anatomy pipelines
need decision-changing evidence; follow [external intake](external-intake.md).

Full sources: [2026-10-03 cleanup](../processes/documentation-maintenance-process/pre-roadmap-cleanup-20261003T201104Z/PAINTING-ROADMAP.md),
[before implementation instructions](../processes/documentation-maintenance-process/pre-implementation-roadmap-20261003T213054Z/PAINTING-ROADMAP.md),
[2026-10-04 compaction snapshot](../processes/documentation-maintenance-process/pre-roadmap-compaction-20261004T080229Z/docs/PAINTING-ROADMAP.md).
