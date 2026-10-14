# Painting Work Details and Acceptance

Last updated: 2026-10-11

**Reference for a selected task, not another priority queue.** Start with the
[short roadmap](PAINTING-ROADMAP.md), then read only the relevant section here.
Original E.*, AUD-* and Task identifiers are retained for existing evidence and handoffs.
Open requirements and conditional gates have been moved here without claiming new completion.
Implementation history is in [CHANGELOG](../CHANGELOG.md); evidence status is in the
[acceptance matrix](roadmap-final-acceptance-matrix.md). A source pass, a live execution pass
and independent artistic acceptance are distinct.

| Main outcome | Detailed requirements |
| --- | --- |
| Correct the defect visible in the whole scene | [E.7f](#e7f), [E.24](#e24), [E.7h](#e7h) |
| Keep meaningful parts separately editable | [E.7g](#e7g), [E.25](#e25), [E.18](#e18) |
| Convincing form, lighting, materials and contact | [E.7e](#e7e), [E.7f](#e7f), [E.19](#e19) |
| Preserve the original brief through local work and recovery | [E.7f](#e7f), [E.17](#e17), [E.8b](#e8b) |
| More useful pixels per unit of time | [E.8](#e8), [E.7b](#e7b), [E.8c](#e8c) |

The activation checklist below is a menu of owning boundaries, **not a compulsory
eight-part run before every painting**. Use the boundary needed by the actual work.
E.8a is maintenance-only. Goal/Loop, local warp, broader transactions, brush profiling,
video, release, portability and exploration keep their existing conditional/deferred scope.
Do not change user settings, run live painting or alter an active artwork merely to close docs.

<a id="e26"></a>

## P0-E.26 — Autonomous painting continuation across the host turn boundary

**Conditional on a user-authorized unattended Goal/Loop run; live acceptance remains open.**
Ordinary painting does not depend on Goal/Loop being enabled. Do not change user preferences.

**Only remaining functional acceptance:**
1. On the *actual running host/child*, with Goal deliberately enabled for
   the test, carry an authenticated Guard continue_required/unfinished whole
   brief across a model final response into the next bounded visual pass.
2. A PSD save, local target acceptance, or technical receipt must not end an
   unfinished artistic goal; repeated no-gain/rejection should change the
   construction strategy or surface an actionable blocker, not retry forever.
3. User STOP, true whole-brief completion, and uncertain/no-replay recovery
   must terminate or defer correctly. No arbitrary time/pass quota and no
   second host scheduler.

**Do not** manufacture session evidence, trigger unattended runs, restart
COS or enable Goal merely to close this item. Detailed host changes, tests
and recorded historical failures are in CHANGELOG and the preserved
pre-compaction roadmap snapshot.

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

<a id="e25"></a>

### E.25 — Coordinate fidelity and connected object construction

Connected translation and exact one-step Undo have bounded live support. Retain that accepted
boundary; do not repeat demonstrations to vary colors, hierarchy or timing.

**Remaining real-pixel gates (only when the artwork requires them):**
1. Verify the **loaded** Guard/UXP child and exact owner/layer identity before
   a genuine new transform boundary. Reject malformed geometry, ambiguous
   layers, unsupported mixed operations, and target/coordinate errors beyond
   2 px without mutation.
2. Demonstrate the canonical native scale→move case including (80,30),
   validating actual source/destination pixels, bounds, unrelated-owner
   protection and provenance; source-only tests do not close this gate.
3. Validate one **rigid connected object** and one **articulated chain**
   under real move/scale, retaining parent/descendant constraints and
   correct perspective/incarnation invalidation. A mug handle or articulated
   limb must remain attached in the resulting pixels, not just a solved model.

**Accept:** visible connected placement/proportions on actual Photoshop
pixels plus safe owner/history behaviour. Numeric geometry or simulated
receipts alone do not certify anatomy, perspective or artistic quality.
Do not generate more disposable demos absent a reproduced painting defect.
**Remaining:** verify retained model-part clipping during later painterly construction_ref work
after a real move/Undo; reject missing or stale model-to-pixel evidence.

<a id="e24"></a>

### E.24 — Same-chat pixel review and technical closure

**Partial live support only.** Meaningful scene critique, technical review-debt recovery,
Director evidence and artistic correction remain open.

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


<a id="e18"></a>

### P1-E.18 — Scene Perspective Model: live acceptance and real-paint enforcement

**Live only, AUD-02:** after verified current-child restart, change rail convergence → owner-specific
`generated_geometry_rebuild_debt`/next action in status/resume → regenerate or reject → prove dispatched
contours/strokes/transforms agree with current pixels and selective dependency invalidation. Source projection,
canvas-snapshot invalidation and dependency plumbing are complete and belong to CHANGELOG, not this roadmap.

<a id="e11"></a>

### P1-E.11 — Semantic pass/history ownership

Exact one-step connected-move Undo and prepared-operation rollback have narrow live support.
Retain these accepted bounds; do not repeat them on new disposable documents.

**Open only for a reproduced real failure or prerequisite to E.7b:**
1. On one actual mixed-method / multi-owner or interrupted operation,
   prove the receipt owns the whole contiguous native Photoshop History
   interval, including preparatory selection, conversion and mask edits.
2. On exact Undo/anchor restore, verify actual layers/selection and
   semantic owner state (construction revision, parent/dependent geometry,
   durable stage/problem/Director facts). Preserve earlier accepted pixels.
3. On partial/uncertain failure, keep the debt and exact blocker; never
   replay mutations or perform a guessed multi-step Undo.

**Accept:** one safely recovered real scenario with pixel/owner parity
and no lost accepted work. No second rollback store or blanket extension
of transform methods without an observed need.

<a id="e27"></a>

### P1-E.27 — Bounded local-warp correction (after E.25 and E.11)

**DEFERRED.** The isolated similarity-MLS forward-mesh
src/core/local-warp-geometry.ts remains non-executable, and no Photoshop
local-warp tool is registered. Current native/history evidence does not
justify activation. Design contracts:
[English](en/e27-local-warp-design.md) · [Русский](ru/e27-local-warp-design.md).

**If an actual painting shows a correction that repainting cannot solve:**
first prove one supported native/UXP deformation path, after the E.25
coordinate/owner and E.11 exact rollback prerequisites. Pin exactly one
semantic owner and physical layer, authorized canvas ROI, authored
source→target landmarks, protected points and displacement/foldover limits.
Reject stale revisions, dependent-owner invalidation, protected-pixel motion
and unsupported transforms before mutation; never add a raw-script route
or independent planner.

**Accept / stop:** one reversible native BEFORE/AFTER pixel correction
within measured tolerance, protected surroundings unchanged, exact one-step
rollback and visible improvement of the original defect in normal whole-frame
review. No gain or safe native route: keep E.27 deferred, without broader
MLS research or test matrix.

### P1-E.7 — Replace orchestration-heavy painting with useful visual passes

<a id="e7b"></a>

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

<a id="e7e"></a>

#### E.7e — Reach form/material quality, not a faster pictogram

**Still OPEN: artistic quality of a real complete scene.** Narrow native surface-tone support
does not establish convincing finished form/material/light. Real-pixel directional fidelity
and whole-scene artistic improvement remain unaccepted.
**Remaining clip/strength acceptance:** on the next justified surface correction, verify exact polygon containment, requested faint versus full strength, selection/path restoration and one-step rollback on native pixels after loading the matching server/UXP revision. Offline checks do not close this gate.
**Do not rerun wall-gradient parameter permutations.**

**Next concrete artwork:** use the prepared
[wuxia road brief and acceptance](../processes/e7e-wuxia-road-form-process/run-01/acceptance.json)
and [instructions](../processes/e7e-wuxia-road-form-process/run-01/RUN-NEXT.ru.md),
or an existing user-selected painting. Preserve the frozen reference/brief.
Rebuild turning planes, contact and neighbouring terrain *before* texture,
fog or finishing effects. In one bounded painting session compare entire
BEFORE/AFTER frames and matched-value/crop evidence against the original
brief. A 15-minute wall-time target / up to six bounded passes applies only
to this selected experiment, not to all painting.

**Accept:** recognizable structural improvement in volume, edge,
material, contact/light and original style beyond silhouettes plus marks.
A whole-scene failure is still a failure even if a local owner was
technically accepted. Repeat only a successful approach on another subject
or style as part of E.8, with independent human preference where needed.

**If genuinely blocked:** correct only a reproduced ineffective brush,
occlusion/opacity leak, clip, owner or dispatch defect, with one owning
regression test and one real visual recheck. Do not add a second painter,
a stroke quota, extra Critic questionnaire or speculative renderer.
**Remaining brush acceptance:** verify the effective preset/settings and fail-before-paint
behaviour on real Photoshop when that boundary is needed.
Optional existing controls: staged [mug/apple/cloth](../processes/e7e-mug-volume-process/run-01/acceptance.json),
stairwell and back-facing cat/rabbit; do not run all without cause.

<a id="e7f"></a>

#### E.7f — Turn visual defects into executed corrections, then extend surface rendering

**Initial-contract recovery — source fixed offline (2026-10-11).** PaintingIntent and next_pass
share typed ownership, scene/model, logical-layer/preflight and construction/painterly contracts.
First construction can declare its independently editable owners in the same compact request;
later additions preserve existing bindings. Proposed plans are used for compilation without
being committed by rejection. Unknown fields and mixed methods are explicit blockers, never
silently dropped; recovery keeps the selected owner and corrects the complete declaration.
Generated methods need no dummy raw actions. Public schema drift checks cover both input forms.
The retained tiger declaration and a generic compound construction are replayed offline;
actual Photoshop execution/artistic acceptance remains pending.

**Bounded source implemented offline (2026-10-11); real visual acceptance remains open.**
Ranked Critic deficits carry stable correction targets and optional generic correction kinds.
The next intent inherits the chosen target/domains unless an explicit Director target applies;
final Guard checks actual execution methods and preserves ownership/stage/protection gates.
Two exact no-gain observations of unchanged construction require a different actual target or
method; labels and cosmetic recoloring of a form do not reset the attempt. Newly returned
Critic debt constrains the next operation in the same cycle. Local gain never closes whole-scene debt.
Compact continuation anchors retain original intent and unresolved requirements. Full original
text is restored at Critic/recovery boundaries and stored continuation checkpoints independently
of image delivery receipts, with no extra review call or source reads.
Artist-authored `painterly.form_field` now accepts arbitrary triangulated surfaces or corresponding
cross-sections, interpolated normals and chosen roughness/specular/anisotropy response, plus a
cast-shadow field with explicit caster, receiving owner/plane, contact and light. Orthographic
2.5D calculations produce target pixels and coverage masks intersected with existing component/
exclusion masks; the existing executor produces actual bounded Photoshop brush actions.
Shared coordinate/depth units and triangle winding are authored choices. This approximation
does not infer anatomy, perspective, hidden geometry, area-light penumbra, occlusion between
unrelated owners or global illumination. Full material edge/texture/reflection behavior remains
open; the current response supplies oriented target shading/highlights. The five saved visual
cases below remain pending: passing calculations and dispatch tests do not establish artistic gain.
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
Uncertain whole-image relations remain due and cannot permit completion. Passed relations
need not be repeated. Real whole-scene artistic acceptance remains open.

**Original-brief anchor — SOURCE IMPLEMENTED offline (2026-10-11), artistic relevance pending.**
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

**Shared support/contact/weight review — SOURCE IMPLEMENTED (2026-10-11), live visual acceptance open.**
The existing Painter/Critic image boundary asks for visible support, contact and plausible
weight distribution of every relevant depicted object. Critic contact_and_protection=pass
requires a positive findings observation; fail/unknown preserves scene debt. The same
rule survives compact responses and optional delegation. Suspension, motion, counterweights
and brief-authorized stylization remain valid; hidden support stays unknown. No new review
call, physical simulator or automatic inference of unseen geometry. Old approvals without
the new review policy cannot suppress its checkpoint. This validates host-reported observation
and binding, not the truth of pixels; real artistic gain remains to be checked.

**Acceptance — five small saved cases:** missing object, composition, flat illumination,
weak material, incorrect contact shadow. Retain each original brief, exact BEFORE/AFTER,
editable owners and protected regions. Compare at equal scale and in whole-scene context;
object visibility/recognition, requested layout, volume, material and grounded contact
must actually improve in their respective cases without unacceptable regressions.
Use narrow offline checks for changed calculations/dispatch; they establish technical
correctness only. Image review establishes visual gain, with E.8/P1-B retaining independent
artistic acceptance. Reuse saved evidence where possible; prepare cases before any
separately authorized live run. Do not add per-stroke questionnaires or arbitrary run quotas.

<a id="e7g"></a>

#### E.7g — Verify editable scope, not a self-declared single component

**SOURCE IMPLEMENTED (2026-10-11); live semantic/pixel acceptance remains open.**
Temporary composition units are frozen after their initial pass, including GLOBAL_BLOCK_IN.
Continuation/adjust, raw targeted drawing and keep/reclassification cannot reuse their pixels
as independent parts; substantial=false does not waive new temporary component declarations.
Independent component hypotheses remain editable. On activation, verify the retained cafe
scaffold is preserved while the next actual part gets its own owner/layer. This does not
certify live visual acceptance. The semantic inventory/review and additive reconstruction path
are now enforced in source as described below.
Implementation and offline validation: [CHANGELOG](../CHANGELOG.md).
Source contract: units.edit_axes names independent editing rights; existing owner pins bind all
scales of mutation, including small passes. artistic_review.editable_scope requests a part/layer
map and previous_observation.editable_scope_review at scope changes and whole/final checkpoints.
The host reports visible omitted parts; Guard validates exact frame/incarnation/map coverage
and actual retained owner bindings, persists debt and freezes combined owners through
continue/raw/keep, including observation-plus-next-pass in the same cycle. Unknown/missing
dedicated parts remain repairable and cannot certify completion. Replacements need new distinct
owner/layers and a whole-scene confirmation; old pixels stay frozen references. Same-part work
reuses accepted scope; no extra mandatory model cycle. Read-only review_scope=whole-scene can
retrieve final/replacement metadata using cached exact images. No automatic visual recognition.
Prioritize with E.24/E.7f first, before further refinement of a misgrouped owner.
Reproduced Ontime document 850: one facade owner received 22 contours spanning wall,
fascia, glazing/frames, door, step and lighting; another temporary environment owner
received 22 spanning sky, houses, pavement and road. Both were declared single-component
and admitted; the tree was correctly split into trunk/branch owners. Counts describe
this reproduction, never a proposed contour, stroke, layer-count or canvas-area quota.

**1 — Define scope by expected edits.** Extend the existing scene ownership plan
with an explicit inventory of independently editable visible parts, derived from the
brief and intended edits. If a part needs independent hiding, colour/material/light,
position, masking or rollback while retaining its neighbours, assign a distinct
semantic part, owner and physical layer. Keep inseparable accents and any number of
marks modelling the same surface together. Single-component means one such editing
scope; continuous-field means a genuinely continuous field, not all background objects.
Use generic/custom compound declarations for arbitrary objects, without noun/ID keyword
classification, named-style rules or a closed subject catalogue. A rationale or label
alone is not proof that an inventory is complete or that pixels are actually separated.

**2 — Bind executable work to that inventory.** Pin each structural action/region
group or construction part to its declared component and actual owner/layer through
the existing compiler/executor. Different independently editable components cannot
share one raster owner. Validate new components on EVERY applicable route, including
temporary block-in, direct/native layer creation and additions to existing layers;
a continue-logical-layer label cannot authorize an undeclared new object/material/light
scope. Infer pins only from unique retained evidence; return complete public corrections
for conflicts/ambiguity, without source-reading or extra planning ceremonies. Reuse
accepted scope for ordinary same-part strokes; do not require one layer per mark.

**3 — Check semantic scope with actual evidence.** At the first existing image review
after a scope-changing pass, and the ordinary whole-scene/final checkpoints, let the
existing same-chat Critic/Painter review compare brief, exact pixels, part-to-owner map
and actual Photoshop layer topology. Identify omitted independently editable parts or
multiple declared parts bound to one physical layer. The composite image alone cannot
prove editability: use read-only owner/mask previews where supported and needed; if
evidence is unavailable, retain uncertainty, never claim separation from labels.
Reuse existing findings and editable_parts/completion debt; no new critic service,
per-stroke questionnaire or extra mandatory model/tool cycle. Guard enforces binding
and unresolved scope debt, while the model judges semantic decomposition; do not claim
that deterministic validation recognizes arbitrary objects or guarantees truthful labels.

**4 — Repair without relabelling old pixels.** Preserve existing combined imagery and
its exact checkpoint. A scope finding prevents refining/finalizing the combined owner
as if it were valid. Prepare explicit reversible component extraction/masking or rebuild
on separate layers, inspect actual separation, then retire the old scaffold only through
the authorized replacement path. Temporary/keep/save never clears this debt. Do not
silently split, flatten, erase, undo or migrate an active artwork during code development.
For Ontime, separate facade structure, door, glazing/frames and lighting as appropriate;
separate sky, buildings, pavement, road and reflections. These are examples, not templates.

**Narrow acceptance:** replay the retained Ontime requests (facade and environment),
an existing-owner new-part addition, and an ordinary one-component multi-contour pass.
The first cases must expose the missing scope and lead to distinct actual owners/layers;
the last remains legal regardless of mark count. Check temporary and raw/native creation
routes, retained failures and interruption/safe recovery without live painting. Prepare
saved topology/pixel evidence for human review; code tests establish binding only.
Artist-supplied false single-component scope must not be treated as visual or editing
proof. Missing semantic evidence stays unknown; never substitute a numerical complexity
threshold. Keep E.26 stop/no-replay and E.11 history/protected-owner requirements.

<a id="e7h"></a>

#### E.7h — Correct a global defect through bounded component passes

**CODE DONE / OFFLINE VERIFIED (2026-10-11); plugin activation and live artistic acceptance pending.**
The retained cafe chair refusal exposed two compiler gaps now fixed offline: polygon/native
method classification no longer discards declared structural change domains, and eligible
medium PaintingIntent construction inherits the active bounded correction target and planned
domains instead of linking the component to itself. Explicit parent/domain choices are preserved
and validated, not rewritten. Cosmetic, outside-region, stale/review-due and unrelated requests
do not inherit correction authority; the existing final planner/priority/ownership gates remain.

Fixed the Ontime `global`-forbidden / `medium`-blocked deadlock without allowing global
Painter mutations or downgrading the perceptual defect. The existing Director task
contract now accepts `correction_target={problem_id,region_bounds}` for an open global
must-fix, with a construction plan and allowed medium scope. Execute a distinct component
goal at `scale=medium`, `addresses_problem_id` set to that global id, authorized structural
change domains and declared review bounds contained in the planned correction region.
Only the active matching task is eligible; unrelated/detail/cosmetic work stays blocked.
These bounds are review metadata, not a native pixel mask. Existing semantic owner,
protected-layer, History, uncertain-operation and exact-image review requirements remain.

The global defect remains open across component successes until exact-current whole-frame
review supports its resolution through the existing priority/evidence contract. Recovery
counts failed related component attempts against that parent; new component/task ids do
not erase exhausted strategies, and local goal success does not reset the global history.
Director binding expresses an artistic correction decision, not mathematical proof that
the chosen region addresses the defect. Review must compare the original brief and the
actual supporting regions; a road-only correction must not claim to resolve facade/glass
defects. No category/style-specific branch or contour-count threshold was added.

**Remaining user-run acceptance after activation:** on the retained Ontime scene, choose
a causally distinct component reconstruction grounded in the current whole frame, issue
the bounded target and inspect delivered pixels. Confirm actual separation/protection,
continuation across component passes, preserved global debt and whole-frame reassessment.
E.7g remains planned, not implemented.

<a id="e8"></a>

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

**General admission acceptance:** the same selected Critic correction and its
prerequisite graph must agree across PaintingIntent, Painter and method admission.
Scene defect scale and active task mutation scale are distinct. Inherit only a
unique allowed task scale and exact owner-bound component/Director links; retain
explicit choices and report ambiguity. Technical execution/preparation failures
remain recovery debt and cannot exhaust artistic strategies or reset real failed
pixel strategies. Native owner/protection, exact-image, rollback and uncertainty
gates remain mandatory. The public offline roof/background/cloud scenarios check
this control flow with a stub executor; only authorized live pixels establish
quality. Verify brush readback after selecting the tool before the preset, plus
the matching source/runtime bridge revision; an unreadable preset remains unknown.

<a id="e8a"></a>

#### E.8a — Split visual-confirmation telemetry

**Accounting is implemented; real COS acceptance remains open.** Exact attribution and
interrupted/concurrent persistence must fail closed; offline coverage is not end-to-end
Photoshop acceptance. This is maintenance-only unless its trigger below is met.

**Remaining acceptance only:**
1. **Actual COS concurrency/interruption:** one controlled, authorized
   live run with interleaved host operations, restart or interrupted
   persistence/PSD checkpoint. Report verifiable complete owned events
   or explicit gaps/unverified, never invented zeros.
2. **Ownership of unkeyed recovery/rejection:** only count model-visible
   rejected, deferred and repair events where durable run/operation
   attribution exists; ambiguous events remain unknown.
3. **Time-to-useful-art:** log actual wall time, dispatch, first accepted
   useful frame and rejected/recovery calls; compare complete images
   against an original brief with independent artistic assessment.
   Synthetic timing does not prove image-quality acceleration.

**STOP RULE:** E.8a is not the default next engineering task. Do not
search for more contrived numeric/clock/format permutations or add new
test files without a **new reproduced real COS/Photoshop failure**, a
specific new contract boundary, and a named measurable user-facing impact.
Reuse existing tests; run the smallest owning test, not cumulative
17-suite benchmark batteries. If live conditions are unavailable, mark
this task BLOCKED and work on observable painting quality instead.
Keep further implementation/test history out of this roadmap.

<a id="e8b"></a>

#### E.8b — Compaction-safe continuation: remaining COS/live gate

**Sibling chat-on-steroids-FORK:** inject existing checkpoint at real compaction; resume exact document/incarnation/
operation/frame with bounded failed-replacement-chat watchdog. Join host compaction/recovery/native planning/review
to Guard timeline; remove/asynchronize fixed attribution waits. Reproduce 2026-09-30 failure: healthy continuation in
seconds, prompt failed-resume recovery, separate idle/compaction/recovery/dispatch timing. Diagnostic markers stay opt-in.

<a id="e8c"></a>

#### E.8c — COS schema-budget-safe publication of critical Photoshop/Guard tools

**Sibling host, AUD-30 P0:** reserve/reorder/bounded degradation must protect ping/required reads; Guard status/resume/
cycle/cycle_auto/review_image/job_poll/reconcile/set_priorities/art_director and any mandatory next action/protected replacement.
Test every current upstream tool enabled, shuffled order and over-budget schemas: complete when fit, explicit omissions when not;
diagnose count vs byte ceilings and regenerate catalog sizes. Final COS+ChatGPT session reaches Art Director after normal
child restart/Refresh, without Photoshop restart, checkbox juggling, disabled ordinary tools or contract changes.
Measure schema bytes and actual selection errors before consolidating/search-gating homogeneous tool clusters;
preserve typed contracts and required-action exposure. No mega-tool or extra mandatory discovery round.

<a id="e17"></a>

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

<a id="e19"></a>

### P1-E.19 — Remaining Lighting/Color Acceptance Work

**Live only:** prove coherent palette/value, source/material interaction and atmosphere; exact RGB remains artistic.
Reuse shared constraints and E.7c/E.7e without fresh per-pass causal prose. [Context](ru/process-revision-perspective-color.md).

### P1-E.10 — Maintained homestead regression and completion gate

**Next:** one replayable/live scenario joins E.7 passes/review/checkpoints, E.1/2/6/11 ownership/rollback, E.4 frame/
recovery lineage, E.14 methods, E.18/19/20 constraints/hierarchy, E.17 fidelity and E.8 quality/time. Fix failures in
owning subsystems. Machine closure needs canonical + fresh live behavior; better-images-sooner also needs independent E.8 evidence.

<a id="e6"></a>

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

<a id="e14"></a>

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

<a id="e22"></a>

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

<a id="p1-b"></a>

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

<a id="p0-d"></a>

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

<a id="supplied-packs"></a>

## P0-E.7 — Supplied brush/stamp-pack live/human acceptance

**Wait for real user pack/folder.** Fresh-chat focal subject/environment/depth/light/material; ingestion/attribution,
bounded profiling/durable roles, media-brush passes, per-instance stamps when available, organic anti-copy review,
integration/overpaint, multiscale/final-vs-brief review. Pack vocabulary shapes coherent art; generic brushes or mere placement fail.

<a id="release"></a>

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

<a id="p1-d"></a>

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

<a id="conditional"></a>

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

<a id="p3"></a>

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
