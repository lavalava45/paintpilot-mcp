# Painting Quality Roadmap

Last updated: 2026-09-25

This file is the canonical **forward-looking TODO** for the digital-painting project.
Completed work belongs in `CHANGELOG.md`; detailed acceptance evidence remains in
`docs/roadmap-final-acceptance-matrix.md`, Git history and the referenced test/live-evidence
artifacts.

The current canonical painting lane is compact-v2, Guard-controlled and UXP-first with a bounded
ExtendScript/COM fallback that may be selected only before any UXP dispatch. Do not reintroduce the
retired controller/daemon or raw-script bypass, and never add cross-backend replay after UXP
dispatch/claim/uncertainty/failure.

As of 2026-09-25, deterministic COMPOSITION / OBJECT / MICRO review selection, same-operation
read-only crop escalation and the later P0-B state/evidence/recovery correctness fixes are baseline
compact-v2 Guard behavior rather than remaining roadmap items. Future roadmap work must preserve
whole-frame context, broad semantic review coverage, source-document crop coordinates, exact
materialized evidence identity, artistic-frame identity, document-incarnation isolation, bounded
structural recovery, instance-scale anti-copy review and no-mutation-replay semantics. A later audit
against the original multiscale-review task found several **stronger theory-to-runtime guarantees that
are not yet complete**; they are tracked separately under **P0-V** rather than reopening the accepted
baseline. The implementation/live evidence belongs in `CHANGELOG.md` and the acceptance matrix. The
research rationale is documented in `docs/adaptive-multiscale-visual-verification.md`.

## Priority order

The remaining work should be executed in this order. Closed milestones and implementation history
are consolidated in `CHANGELOG.md`; detailed acceptance evidence remains in the acceptance matrix,
Git history and referenced test/live artifacts.

1. **P0-A — host routing / CoS attribution:** Tasks **3 and 4 are closed**; continue Tasks **1 → 2**.
2. **P0-E — brush/stamp-pack onboarding and motif-aware painting:** implement **P0-E.1 → P0-E.7**
   below before the next user-facing real-art test that starts from a supplied brush folder/pack. This
   is an immediate production prerequisite, not optional tooling polish.
3. **P0-C — Painter/Guard semantic-pass throughput and bounded autonomy:** implement Tasks
   **P0-C.1 → P0-C.10** below as one coordinated contract change, with the evidence-identity and
   bookkeeping invariants treated as correctness work rather than optional speed polish.
4. **P0-V — adaptive multiscale visual-verification hardening:** close **P0-V.1 → P0-V.4** below.
   The baseline multiscale Guard is already implemented; these are the residual gaps between that
   implementation and the stronger review theory: uncertainty-driven escalation, hierarchical
   object→micro context, delivery-aware closure and explicit scale-invariance/semantic-trigger proof.
5. **P0-D — human critic calibration / stop-decision calibration:** Tasks **8 / 8a → 8b**, then
   close the residual human claims from Tasks **6, 11 and 13a.1A/13a.1C** from the same labelled
   evidence where possible.
6. **P1-A — autonomous-product cleanup / legacy retirement:** physically remove retired controller,
   daemon, historical provider code and other no-longer-owned compatibility surfaces once their
   canonical replacements are proven. Reduce the repository to the code paths we actually maintain.
7. **P1-B — human artistic acceptance:** Task **23 human pack → 22 → 15d.3**,
   then the real-artwork artistic-preference part of Task **21**.
8. **P2 — upstream-derived substrate review and independent-product cutover:** systematically review
   the remaining inherited Photoshop/MCP substrate, keep/rewrite/remove it according to our actual
   product needs, remove dependence on upstream release cadence, and reframe the GitHub/project
   identity as an independently maintained derivative product with explicit origin attribution.
9. **Conditional / P3 only after evidence:** Task **5** if ordinary ChatGPT/CoS routing remains
   unreliable; Task **10** only if Task 8/8a demonstrates measurable decision-quality gain; Task
   **15c** remains optional exploration.

Rationale:

- Host routing is the first remaining external gate because losing the established Photoshop/CoS route can bypass the entire
  painting architecture regardless of its internal quality.
- The next planned real-art experiment is explicitly a **user-supplied brush/stamp-pack → coherent
  detailed scene** workflow. The current lane can inventory/select installed presets and enforce a
  durable brush-role preflight, but it cannot yet accept a folder/ABR pack as a first-class input,
  visually profile unknown brushes, or place heterogeneous stamp instances with per-instance
  orientation/flip while preserving anti-copy semantics. P0-E is therefore promoted ahead of the
  next test rather than discovering those gaps during the test itself.
- Accepted-state recovery is now closed and archived. The 2026-09-25 representative real-Photoshop
  painting run then exposed a separate production-loop problem: too much model-visible Guard
  choreography per useful artistic pass, plus concrete evidence/materialization and trend-scope
  failure modes. P0-C therefore comes before critic calibration so the later human calibration is not
  measuring avoidable orchestration friction or stale review-state behavior.
- The multiscale visual-review baseline is already live-accepted, but a point-by-point audit against
  the original design found four stronger guarantees that are still only partial: the resolver has
  uncertainty/final-comparison inputs that are not driven by the normal runtime, MICRO review does not
  yet guarantee a distinct object-context view alongside the tight crop, MCP image-delivery
  completeness is reported but is not yet a durable prerequisite for visual closure, and durable
  escalation evidence does not yet project the full canvas/scale-invariance provenance required by
  the original brief. These are perceptual-evidence correctness gaps, not speed optimizations, so
  P0-V closes them before critic calibration.
- Critic calibration remains the next **perceptual-authority** gate after P0-C/P0-V because it controls any
  claim of perceptual reliability and broader critic authority, and it also decides whether Task 10
  should exist at all.
- Progressive refinement comes before final-target fidelity: Task 23 already has a machine-enforced
  de-block-in gate and a completed disposable real-Photoshop progression run; only its blinded human
  perceptual pack remains as the forward acceptance gate. Final target fidelity and the remaining
  compositing/final-selection questions follow after that.
- The repository has now diverged far enough from upstream that **cleanup is architectural work, not
  cosmetics**. Against the current upstream tree, most source files are either ours or modified, and
  the canonical painting-control stack (embedded Guard, compact-v2, VisualMicroPlan, Art
  Director/Painter, recovery/evidence, UXP routing, painting methods and review) is predominantly our
  implementation. Retired controller/daemon code and compatibility artifacts therefore obscure the
  actual architecture and should be removed at P1-A after their replacement coverage is proven.
- The longer-term goal is an **independently maintained derivative product**: upstream remains the
  historical origin and a source of selectively reviewed ideas/fixes, but our runtime, release plan,
  architecture and roadmap must not depend on upstream releases or ownership decisions. P2 turns
  that de-facto state into an explicit codebase/product boundary while preserving license and origin
  attribution.
- Optional 3D/reference support should not compete with routing or calibration work.

---

## Active follow-ups inherited from closed P0-2 acceptance

The closed P0-2 acceptance is archived in `CHANGELOG.md`. These concrete code/contract gaps were
discovered while producing it and remain active:

1. **Explicit document activation can foreground Photoshop.** Diagnostic `run-09` recorded one
   Photoshop foreground transition exactly at UXP `document.activate`. Either make
   `photoshop_set_active_document` background-safe or explicitly classify it as UI-activating and
   prevent it from being used inside no-focus canonical traces.
2. **Selection-mask capability/compiler mismatch.** The capability snapshot advertises
   `selection-mask` as available, but the compact multi-action compiler currently cannot represent
   that mask method as a valid VisualMicroPlan and rejects it before dispatch. Align advertised
   availability with executable compact semantics.
3. **Negative regression sentinel normalization.** A compact visual observation carrying
   `regression: "none observed"` is currently treated as truthy regression evidence. Normalize
   explicit negative sentinel text so a resolved visual pass cannot be mislabeled `regression`.

---

## P0-E — Brush/stamp-pack onboarding and motif-aware painting

**Priority:** immediate implementation prerequisite for the **next real-art test**. The intended user
workflow is: provide a folder/brush pack, provide a scene brief, then let the canonical CoS → embedded
Guard → Photoshop lane inspect/import/profile those brushes and use them deliberately to build a
coherent, detailed image with foreground subject, environment/background, lighting/atmosphere and
refinement. The next test should not require the user to manually pre-classify the pack or tell the
Painter which preset to use for each mark.

This task covers two related but distinct inputs:

1. **painting/media brushes** — brushes whose main value is mark character, edge quality, glazing,
   broken mass, texture or material rendering;
2. **stamp/motif brushes** — brushes whose main value is placing a recognizable discrete motif such
   as foliage, cloud, rock, bird, architecture fragment, ornament, crowd/figure silhouette or other
   reusable form.

Do not collapse the two into one heuristic. A useful media brush is classified mainly by **mark
behavior**; a stamp brush is classified mainly by **motif identity, placement affordances and
repetition risk**.

### Existing foundation — reuse it

Do **not** rebuild the painting lane or brush contract from zero. Current implementation already has:

- `photoshop_list_brush_presets` and `photoshop_select_brush_preset` for installed Photoshop presets;
- `photoshop_get_brush_settings` and `photoshop_set_brush`, including size, hardness, opacity/flow,
  spacing, angle, roundness, flip and pressure-related settings;
- durable `brush_preflight` with 1–16 concrete roles, material roles, visual intents, preferred and
  alternative presets, effective-settings readback, working scale, pressure policy and probe status;
- `paint_strategy` enforcement that binds material role → visual intent → brush role → accepted
  preset/pressure policy instead of allowing arbitrary brush choice;
- `photoshop_paint_dabs` for efficient point placements, but individual dab records currently expose
  only x/y, color, size, opacity and flow; angle/flip remain brush-state-wide rather than
  per-instance;
- `pattern_intent`, `motif_instances` and `mechanical-patterning` Guard analysis that distinguishes
  intentional regular rhythm from repeated organic/character motifs and already detects near-copy
  geometry despite translation/rotation/reflection/uniform-scale/small-jitter variants.

The missing work is **pack ingestion, evidence-based profiling, stamp-instance execution and
scene-level integration**, not another brush subsystem.

### P0-E.1 — Make a supplied brush folder/ABR pack a first-class canonical input

Add a canonical pack-ingestion path rather than assuming the brushes were already installed manually.

Implementation requirements:

- accept a user-supplied folder or explicit brush-pack file set and enumerate supported brush assets
  deterministically; nested folders must not silently disappear;
- compute a durable `brush_pack_id` / manifest fingerprint from the supplied source assets and record
  filenames, sizes/hashes and ingestion time without depending on display names alone;
- add a canonical Photoshop-facing import/load operation through the existing backend router if the
  installed Photoshop/UXP surface supports it; preserve UXP-first/no-replay semantics;
- compare preset inventory before/after ingestion and bind newly available presets to that pack
  manifest instead of guessing by name;
- repeated ingestion of the same unchanged pack must be idempotent and must not duplicate presets or
  silently remap a profile to a different pack revision;
- if the actual Photoshop host cannot programmatically import the supplied pack format, return a
  deterministic `brush_pack_import_unavailable` capability result with the exact missing host
  capability. Do not pretend the folder was loaded. A one-time user/UI fallback may be documented,
  but the production path remains fail-closed until post-install inventory proves the presets exist.

**Acceptance**

- fixture/test coverage for unchanged re-ingestion, changed pack revision, nested assets and
  before/after inventory attribution;
- the next live test can start from the supplied pack/folder and end with a durable pack manifest plus
  exact installed-preset identities, without the model inventing preset names;
- no ImageGen or alternate rendering engine is introduced as an ingestion fallback.

### P0-E.2 — Evidence-based brush-pack profiling, not name-based guessing

For unknown painting/media brushes, build a bounded **probe sheet** and classify actual Photoshop
marks. A preset called `Charcoal`, `Water`, `Cloud`, etc. is not evidence of what it really does.

For each candidate worth profiling, generate a compact probe set such as:

- isolated dab/footprint;
- short and long stroke;
- slow/fast or sparse/dense stroke where the host exposes a meaningful difference;
- small/medium/large working scale;
- pressure/opacity/size response where available;
- overlap/build-up behavior;
- directional/edge behavior.

Persist evidence-bound profile fields sufficient to drive brush roles, including at least:

- usable visual intents / material roles;
- mark character such as soft, hard, broken, bristly, directional, granular, glazing or textural;
- useful scale range;
- edge behavior and buildup behavior;
- whether rotation/orientation is visually meaningful;
- recommended pressure policy;
- known caveats / unsuitable uses;
- exact probe preview/evidence identity and pack revision used for the classification.

Do not require exhaustive probing of thousands of presets. Use bounded candidate selection and stop
once the active scene has enough role coverage. Cache profiles by **pack revision + preset identity +
effective host state**, with explicit invalidation when those change.

**Acceptance**

- at least one deliberately misleading-name fixture proves classification follows visual probe
  evidence rather than the preset name;
- the resulting durable `brush_preflight` can be generated from the profile without the model manually
  retyping internal enum tables or inventing settings;
- a scene can select a broad-form, atmosphere/soft, broken/texture and detail/edge role from the pack
  when the actual probes support those roles, or explicitly report missing role coverage when they do
  not.

### P0-E.3 — Profile stamp/motif brushes as a reusable visual vocabulary

When probes reveal a discrete stamp-like footprint, classify it separately from ordinary media
brushes. Store a **stamp/motif profile** rather than pretending it is just another texture brush.

Record, where the evidence supports it:

- stable preset/pack identity;
- motif category/semantic description;
- canonical footprint bounds and orientation;
- useful size/scale range;
- whether horizontal/vertical mirroring is visually admissible;
- whether rotation is meaningful or restricted;
- intended use: foreground/support/background/detail/ornament/texture;
- repetition class: `intentional_regular`, `organic_instances`, or explicitly unclassified;
- whether raw placement is acceptable as a finished element or normally requires
  overlap/erase/overpaint/integration;
- representative probe evidence identity.

Do not fabricate semantic labels from filenames alone. If the visual probe is ambiguous, keep the
motif unclassified/advisory rather than assigning a false category.

### P0-E.4 — Add a bounded per-instance stamp placement primitive

`photoshop_paint_dabs` is not sufficient for a serious stamp pack because angle/flip are global brush
state. Add a canonical stamp-instance operation (name may differ, e.g.
`photoshop_paint_stamp_instances`) whose individual instances can carry at least:

```text
instance_id
x / y
size or scale
angle
flip_x / flip_y
opacity
color when the brush supports colorized placement
```

Implementation constraints:

- target a stable raster `layer_id` and preserve/restore the prior active layer/brush state where the
  existing painting tools promise that behavior;
- execute a bounded list as **one semantic placement pass**, not one model-visible Guard call per
  stamp;
- internal partial execution must report completed / failed-or-uncertain / not-started instances or
  an equivalent exact partial receipt, capture reconciliation evidence, and **never replay** already
  dispatched stamps after uncertainty;
- return exact instance ids and source-document bounds sufficient to populate `motif_instances` and
  later crop/review provenance;
- keep the operation bounded; thousands of decorative placements must be chunked into coherent
  semantic passes rather than one unreviewable mega-call.

**Acceptance**

- one call places heterogeneous rotations/scales/flips of the same preset without model-visible
  setter choreography between instances;
- a simulated mid-batch failure proves no replay and preserves exact completed/not-started identity;
- instance bounds survive into Guard review metadata.

### P0-E.5 — Prevent visible copy-paste while preserving legitimate pattern use

Stamp support must not recreate the already observed failure mode where repeated birds/figures/trees
look mechanically copied. Transform jitter alone is **not** enough to qualify repeated organic motifs
as artistically varied.

Reuse and extend the existing `pattern_intent` / `motif_instances` / `mechanical-patterning` path:

- `intentional_regular` patterns such as ornament, tiles or deliberate decorative rhythm remain
  allowed when explicitly intended;
- repeated `organic_instances` remain reviewable even after translation, rotation, reflection,
  uniform scale, color/opacity changes or small jitter;
- stamp-instance execution must emit the metadata needed by the current anti-copy detector rather
  than becoming invisible to it;
- for organic or hero-visible motifs, the Planner/Painter should prefer multiple source stamps,
  meaningful overlap/occlusion/cropping, selective erase, overpaint or structural redraw when needed;
- one stamp placement is not automatically a finished object. For hero/foreground organic elements,
  raw stamp-only completion should require an explicit user/style contract that actually calls for
  that collage/stamp language;
- do not introduce a universal numeric "maximum repetitions" aesthetic rule. Use motif class,
  visibility/importance and evidence of near-copy repetition to decide when intervention is needed.

**Acceptance**

- a bird/figure/tree fixture using one stamp with only transform/parameter jitter still triggers the
  appropriate anti-copy review;
- a deliberately regular ornament/tile fixture remains exempt when declared intentional;
- a mixed-source/overpainted organic fixture can pass without being forced into pointless variation;
- the detector reasons from actual instances/evidence, not from how many tool calls occurred.

### P0-E.6 — Integrate brush/stamp packs into scene planning, not as asset dumping

The target workflow is a **coherent image**, not a contact sheet. Art Director/Painter must use the
pack as a visual vocabulary inside the existing composition → form → light → materials → detail →
atmosphere process.

Required behavior:

- plan the scene independently of the available stamps first: establish composition, focal hierarchy,
  major masses, foreground/midground/background and lighting intent before decorative filling;
- map brush/stamp roles onto those scene tasks only where they are causally useful;
- use stamps readily for foliage, clouds, rocks, distant architecture/crowds, ornament, texture breakup
  and similar supporting motifs when the pack supports them;
- do not let a convenient humanoid/creature/object stamp replace the structural drawing of a hero
  subject, face, pose, gesture or key silhouette unless the user explicitly requests a collage/stamp
  aesthetic;
- after motif placement, integrate stamps through overlap, erase/masks, paint-over, value/color/light
  unification, atmospheric depth and edge hierarchy as needed so the result reads as one scene;
- if the user says **use exactly this brush pack for painting marks**, every brush-based mutation must
  select a preset bound to that pack profile. Non-brush Photoshop operations such as masks,
  transforms/adjustments or compositing may still be used when artistically justified; do not silently
  fall back to a generic unrelated brush because a role is missing.

### P0-E.7 — Gate the next real-art test on an end-to-end brush/stamp-pack workflow

Before declaring this feature ready, run one representative real-Photoshop test in a fresh chat with
a user-supplied pack/folder and a scene brief that genuinely requires:

- a readable foreground/primary subject or focal element;
- a developed environment/background rather than a blank or token backdrop;
- spatial depth / foreground-midground-background relationship;
- lighting or atmosphere;
- material/texture/detail refinement beyond block-in;
- deliberate use of the supplied pack rather than generic default-brush substitution.

The run must exercise:

1. pack ingestion/attribution;
2. bounded visual profiling;
3. durable brush/stamp role map;
4. at least one semantic pass using a media-brush role when the pack contains one;
5. stamp-instance placement when the pack contains stamp/motif brushes;
6. anti-copy review for any repeated organic motifs;
7. integration/overpaint or equivalent unification pass where raw stamps would remain visibly pasted;
8. whole-frame and multiscale review through the canonical Guard path;
9. final exact-frame comparison against the original scene brief.

**Repository acceptance before the live test**

- unit/integration tests cover pack manifest identity, inventory attribution, profile cache invalidation,
  evidence-based brush/stamp classification, per-instance stamp transforms, partial execution/no-replay,
  anti-copy metadata propagation and pack-only brush enforcement;
- `npm run verify:canonical` passes;
- roadmap/CHANGELOG and the acceptance matrix identify which parts are repo-pass versus live/human
  evidence rather than calling visual quality proven from mocks.

**Live/human acceptance for the next test**

- no manual per-stroke preset selection by the user after supplying the pack;
- the final work visibly contains a composed scene with background, subject/focal structure,
  lighting/atmosphere and refinement, not merely stamped assets on a canvas;
- the user can identify that the supplied brush/stamp vocabulary materially shaped the image;
- obvious same-stamp copy/paste repetition in organic/hero-visible content is a failure even when
  rotation/scale/color differ;
- tool success, preset count or detail count alone never proves that the artwork succeeded.

---

## P0-C — Painter/Guard semantic-pass throughput and bounded autonomy

**Trigger:** a representative real-Photoshop painting run on 2026-09-25 reached a useful structural
block-in, but a disproportionate amount of the interaction budget was spent on Guard choreography:
preflight correction, report/ack closure, recovery bookkeeping, review-evidence recapture,
priority reclassification and repeated Art Director transitions. The same run also reproduced an
evidence-file overwrite/oscillation failure and a trend-scope error where a localized repeated-brush
problem became a global blocker.

**Goal:** move the canonical lane from command-level choreography to **semantic artistic-pass
control**. Guard still owns safety, receipts, evidence identity, recovery and review barriers; Painter
gets enough bounded freedom to execute a coherent pass before control is escalated. Do not weaken
the existing compact-v2 no-replay, document-incarnation, multiscale-review or UXP-first guarantees.

These ten items are one coordinated design. Implement them in small reviewable slices, but do not
solve one item by violating another. In particular, "more autonomy" never means blind mutation,
skipping visual evidence, replaying an uncertain operation, or maximizing raw tool count.

**Code-audit snapshot — 2026-09-25.** This section was checked against the current implementation,
not only against roadmap prose. Targeted baseline verification passed **196/196 tests** across
`visual-microplan`, `embedded-guard`, `artistic-recovery-policy`, `planner-painter`,
`visual-review-escalation-state` and `session-store-regressions`. Status labels below mean:
`MOSTLY PRESENT` = the core mechanism exists and this task is primarily hardening/finishing;
`PARTIAL` = important reusable machinery exists but the requested behavior is incomplete;
`FOUNDATION ONLY` = supporting primitives exist but the central requested behavior is absent or
currently behaves in the opposite way.

### P0-C.1 — Make one Guard semantic cycle represent one artistic pass

**Code audit: MOSTLY PRESENT — finish/extend, do not redesign from zero.**

- `next_pass.actions` already compiles one root goal/request identity into one VisualMicroPlan;
  `request_key` is durable idempotency identity and `problem_id` is stable artistic-problem identity
  (`src/tools/guard-tools.ts`, `src/core/guard/cycle-compiler.ts`).
- `photoshop_execute_visual_microplan` already supports **1–4 contiguous visual mutations** under one
  region/intent/method/risk envelope with one mandatory AFTER preview and no preview between those
  mutations (`VISUAL_MICROPLAN_MAX_MUTATIONS = 4`). Preparation actions may precede them, and one
  logical layer creation is currently supported.
- Middle-mutation failure already stops later mutations, records completed mutation results plus the
  failed step, captures a reconciliation preview, and explicitly forbids automatic replay
  (`src/tools/visual-microplan-tools.ts`).
- **Still missing:** make pass/sub-action outcome projection explicit enough to distinguish
  `completed / failed-or-uncertain / not-started` for every planned action; broaden the existing
  bounded pass only where P0-C.2 allows it; avoid forcing otherwise coherent non-paint action chains
  back into one-action direct-operation semantics. The architectural primitive itself already exists.

The model-facing unit should be a bounded **artistic pass**, not an individual Photoshop command.
A pass may compile to several related Photoshop actions when they share one artistic hypothesis,
one target region/task and one verification boundary. Examples include create-layer → paint masses →
soften transition, or create-light-layer → build key/fill/fog → bounded cleanup.

Implementation requirements:

- add/clarify a pass-level identity in the compact cycle and keep individual executor actions internal
  implementation details of that pass;
- permit multiple already-supported compact actions to execute under one pass when their combined
  risk stays within the current task/scale/region contract;
- do not require an externally visible report/ack/preview barrier between successful sub-actions;
- if a sub-action fails or becomes uncertain, return exact completed/not-started/uncertain action
  state and reconcile the pass from fresh evidence; never replay the whole pass blindly;
- preserve the normal whole-frame + required local review at the **pass boundary**.

**Acceptance**

- a representative multi-action painting pass executes as one model-facing semantic cycle and yields
  one pass-level visual review boundary;
- an injected middle-action failure proves partial-state accounting and zero replay of already
  completed visual actions;
- single-action/high-risk passes continue to work unchanged;
- no new public full-operation schema or retired controller/report path is introduced.

### P0-C.2 — Add an adaptive per-pass mutation budget

**Code audit: PARTIAL — fixed limits and risk primitives exist; adaptive budgeting does not.**

- Existing hard limits are fixed: compact `actions` max 11, VisualMicroPlan max 4 visual mutations,
  max 1 created logical layer. These are executor constants, not an adaptive budget.
- VisualMicroPlan already carries `risk = low|moderate|high`, validates that a step cannot hide a
  higher risk than the enclosing pass, and Guard checkpoint debt already weights mutation risk rather
  than using elapsed time or a fixed pass count.
- **Missing:** no function derives allowed semantic-action count from risk + stage + scale + region +
  protected qualities/relations; no deterministic budget is emitted in diagnostics; no automatic
  split/defer behavior exists for a coherent request that exceeds a risk-derived budget.

Give each semantic pass a bounded budget of low-risk **semantic Photoshop actions**. This budget is
not a target to maximize and does not count individual stroke points, dabs, path vertices or internal
UXP sub-operations. For ordinary low-risk painting, experimentally support roughly **5–20 related
semantic actions** before the next external review boundary; reduce the budget automatically for
higher-risk operations.

Implementation requirements:

- derive the allowed budget from risk class, stage, scale, affected region, destructive potential and
  whether protected qualities/relations are touched;
- composition/global destructive changes, document replacement, uncertain recovery and similarly
  high-risk work may collapse the budget to one action;
- exceeding the budget must split/defer the remaining actions before dispatch rather than silently
  weakening verification;
- budget selection must be deterministic and visible in Guard diagnostics/receipts.

**Acceptance**

- a low-risk representative pass can execute at least five related semantic Photoshop actions inside
  one pass without intermediate bookkeeping round-trips;
- an over-budget request is deterministically segmented/rejected before unsafe dispatch;
- a high-risk control proves the budget contracts to the stricter boundary;
- no acceptance criterion rewards adding meaningless actions merely to increase the count.

### P0-C.3 — Eliminate leaked bookkeeping from the compact hot loop

**Code audit: MOSTLY PRESENT — contract implemented; recovery/finalization edge cases need hardening.**

- Public compact-v2 already rejects legacy `previous_report`, `previous_operation_ack`,
  `previous_visual_verdict` and `previous_report_ack` fields. `previous_observation` is expanded
  internally, and `compactClosureDefaults()` supplies the technical report and exact receipt token
  before `closePreviousCycle()` runs (`src/core/guard/cycle-compiler.ts`).
- Existing embedded-Guard tests prove one compact continuation records
  `technical_execution_record`, exact operation receipt acknowledgement and the visual verdict without
  public standalone closure calls.
- The lower-level session store still retains explicit report/ack machinery as an internal primitive,
  which is compatible with compact-v2 as long as it does not leak to the model-facing path.
- **Still missing / reproduced live:** multiscale/recovery edge cases can strand the operation in a
  closure/review loop even after the artistic fact is known. P0-C.3 should therefore be treated as a
  regression-hardening task: stable one-step compact closure after recovery, plus table-driven proof
  that bookkeeping-only state cannot oscillate or demand model choreography.

Compact-v2 already says Guard owns technical receipt/report/verdict closure internally. Treat any
model-visible requirement to manually shepherd report/ack bookkeeping on the happy path as a
**regression of the canonical contract**, not as a new workflow to document.

Implementation requirements:

- completed visual passes close technical receipt/report/ack state behind
  `photoshop_guard_cycle_auto` when the next honest visual observation arrives;
- completed non-visual/read-only passes close behind the same compact facade without standalone
  report/ack calls;
- recovery may require fresh evidence/reconciliation, but bookkeeping-only closure must not create a
  chain of model-visible calls after the artistic/recovery decision is already known;
- when closure cannot proceed, return one stable `next_required_action` describing the missing fact;
  do not oscillate among equivalent report/ack/verdict states.

**Acceptance**

- table-driven coverage for completed visual, completed non-visual, rejected-before-dispatch,
  partial, uncertain and reconciled operations shows no standalone public report/ack dependency;
- one compact continuation closes all derivable technical debt exactly once;
- the canonical hot loop does not gain extra model-visible calls solely for bookkeeping;
- legacy explicit report/ack surfaces remain retired.

### P0-C.4 — Make review evidence immutable and content-addressed

**Implementation status: COMPLETE (repository correctness slice, 2026-09-25).**

The prior audit correctly found that SHA validation/persistence were strong while materialized capture
identity was mutable. That gap is now closed:

- Existing code binds review evidence to document id + whole-frame SHA + review level + exact source
  region and verifies the materialized crop bytes against their SHA before accepting them.
- Persisted evidence survives restart; tests already prove deleted or byte-replaced crop files become
  invalid and must be recaptured (`tests/visual-review-escalation-state.test.ts`).
- Each logical requirement now has a deterministic `requirement_id`; each read-only recapture gets a
  durable monotonic `capture_sequence` plus unique `capture_id`, and runtime materialization keys are
  derived from `capture_id` rather than the per-round semantic role.
- Accepted evidence is append-only and carries source operation, requirement, capture and content-bound
  `artifact_id` provenance. Re-capturing the same logical requirement creates a new record/path rather
  than mutating the old one.
- `reviewEvidenceState()` distinguishes `captured`, `artifact_missing_or_corrupt` and
  `never_captured` while retaining strict materialized-byte/SHA verification. No SHA, document pinning,
  no-replay or multiscale evidence check was relaxed.
- Regression coverage reproduces the original three-requirement/two-round overwrite failure, proves
  old bytes and paths remain immutable, verifies recapture after corruption is append-only, prevents
  captured→pending resurrection, and preserves all identities across restart.

Fix the reproduced failure where later escalation crops reused a materialized filename, overwrote
earlier evidence bytes, and caused a requirement to oscillate `captured → pending → captured` when
the stored SHA no longer matched the file on disk.

Implementation requirements:

- every materialized review artifact gets immutable identity including operation, requirement/role,
  escalation round and/or content SHA;
- never overwrite bytes referenced by an accepted/captured evidence record;
- `captured` must be monotonic while the referenced artifact is still present and its SHA verifies;
- recapturing the same logical requirement creates a new evidence record rather than mutating the old
  file in place;
- recovery/status must distinguish "artifact missing/corrupt" from "requirement never captured".

**Acceptance**

- add a regression reproducing two or more same-operation object crops across escalation rounds and
  prove their paths/bytes/SHA identities remain distinct and stable;
- once all requirements are captured, repeated verdict submission cannot resurrect an older pending
  requirement merely because a later crop was materialized;
- restart/resume preserves the same immutable evidence identities;
- this strengthens, rather than relaxes, the existing exact-evidence-identity baseline.

**Verification:** targeted escalation test **7/7**; required C.4 linked suite **114/114**; current shared
P0-C.4/P0-C.6 baseline **203/203** across the six requested test files. The canonical repository gate
also passes **608/608** Vitest tests plus build/typecheck, pack, compact-v2 contract, painting-policy,
prompt-coverage, tool-count and live-evidence-ledger checks.

**Remaining:** no known repository correctness blocker remains in P0-C.4. A future real-Photoshop run
may provide additional live evidence, but it is not needed to reopen the fixed overwrite semantics.

### P0-C.5 — Normalize only unambiguous preflight classification mismatches

**Code audit: PARTIAL — safe normalization framework exists, but not this artistic-contract case.**

- The cycle/compiler already performs narrow deterministic normalizations: compact root goal/id
  defaults, duplicate preview document-id removal, explicit stage aliases, legacy
  `region-fill-closed-contours → region-block-in`, created-layer target wiring and Guard-selected
  preflighted brush presets.
- These normalizations are surfaced through a `normalizations[]` result and tests explicitly require
  that wrong explicit targets are **not** silently rewritten.
- Artistic method selection already knows the valid `(visual_intent, impact_class) → method`
  relationships through `selectPaintingMethod()` / `compileArtisticOperation()`.
- **Missing:** when the declared intent/impact pair is invalid but the actual tool + action + goal admit
  exactly one semantics-preserving classification, the compiler still rejects with
  `No available method...`; it does not infer that unique classification. The live
  `tonal-contrast + construct` structural-stroke rejection is therefore still reproducible in
  principle.

The live run showed a pass rejected because an otherwise valid `photoshop_paint_strokes` structural
operation was labelled with an intent/impact pair unsupported by the method palette. Do not make the
model inspect internal enum tables for a correction that is mechanically unique and semantics-
preserving.

Implementation requirements:

- add a deterministic normalization step that may rewrite **classification metadata only** when the
  requested tool, target, action class and artistic goal admit exactly one valid method/intent/impact
  interpretation;
- record every normalization in the preflight result/receipt;
- never silently change document/layer target, stage, scale, destructive risk, action class,
  requested Photoshop tool or artistic goal;
- if more than one materially different interpretation is possible, remain fail-closed and return a
  compact correction recipe instead of guessing.

**Acceptance**

- table-driven tests cover a unique semantics-preserving normalization and prove it dispatches the
  same intended Photoshop method;
- ambiguous and risk-changing controls still reject before mutation;
- normalized requests produce the same verification expectations as an explicitly correct request;
- this mechanism does not become a generic "make invalid plans pass" fallback.

### P0-C.6 — Scope cumulative trend problems from evidence, not from the trend name

**Implementation status: COMPLETE (repository correctness slice, 2026-09-25).**

The prior audit correctly found that trend detection existed while promotion hard-coded global scope.
Promotion is now evidence-scoped and resolution-aware:

- Guard already collects verdict trend signals in a bounded recent window, synthesizes
  `primitive-footprint-repeating` from repeated `primitive_footprint=suspect`, counts recurrence and
  creates a durable cumulative-trend problem.
- Trend support now carries source operation, sequence, signal evidence identity, declared
  region/scale and exact spatial provenance. Review-finding coordinates may contribute to a trend
  only when the finding is causally bound to that signal: either explicitly through the additive
  `review_findings[].trend_signals` field or through a semantically direct finding kind such as
  `repeated_dab_pattern` / `mechanical_patterning` for `primitive-footprint-repeating`. Unrelated
  findings are never borrowed as spatial evidence for another trend. When there is no signal-bound
  finding, Guard falls back to the operation's exact `region_bounds` / verified focus region rather
  than unrelated finding coordinates. Severity remains independent from scope.
- Repeated overlapping/localized support remains local/medium. Global promotion requires either
  explicit whole-frame `global_readability=degraded` evidence or geometrically materially separate
  exact source regions from independent operations; signal names alone never imply global scope.
- Durable trend problems retain `source_operations`, `supporting_regions` (including `region_source`),
  `supporting_evidence` and a deterministic `promotion_reason`. `active_problem` is selected through the existing
  `largestOpenMustFix()` ordering rather than forcibly seized by every synthetic trend.
- Resolving or reclassifying a cumulative trend advances a durable `resolution_epoch` and
  `resolution_cutoff_sequence`; pre-resolution verdict history is excluded from later recurrence.
  Reopening requires enough new post-resolution evidence and survives restart/resume.
- Priority semantics are unchanged: a medium/local must-fix does not block unrelated medium work, but
  an evidence-supported larger blocker still gates finer dependent work.

A repeated-brush-footprint problem confined to the woman's head/neck was promoted to a global
must-fix and blocked unrelated medium work. Trend severity and trend **scope** must be separate.

Implementation requirements:

- derive initial trend region/scale from the union of current supporting evidence regions;
- keep a repeated localized defect local/medium even when it is severe;
- promote to global only when independent evidence spans materially separate regions or a whole-frame
  review demonstrates global degradation;
- allow a resolved/down-scoped trend to remain resolved/down-scoped; old source operations must not
  automatically resurrect a stale global copy without new post-resolution evidence;
- preserve provenance linking the trend to all source operations and regions.

**Acceptance**

- repeated primitive-footprint findings on one face produce a medium/local must-fix, not a global
  blocker;
- the same signal reproduced in independent distant regions promotes according to the declared
  evidence rule;
- resolving the trend prevents stale pre-resolution source operations from reopening it;
- unrelated medium tasks remain dispatchable when no larger open problem is supported by evidence.

**Verification:** the original four regression controls cover localized repetition, materially
separate multi-region promotion, explicit whole-frame degradation and resolution stability. A
follow-up correctness audit then reproduced one additional false-global case: two
`primitive_footprint=suspect` operations in the same face region were promoted globally because
unrelated distant `proportion` findings were borrowed as footprint evidence. Commit `735d5ce` closes
that causal-binding gap and adds two controls proving (a) unrelated distant findings cannot promote
the footprint trend and (b) explicitly signal-bound distant findings can. The current shared six-file
baseline passes **203/203**; `npm run verify:canonical` passes **608/608** Vitest tests plus all canonical
build/policy/contract/ledger gates.

**Remaining:** no known repository correctness blocker remains in P0-C.6. Broader trend-quality or
critic-authority calibration remains separate later roadmap work and is not implied by this slice.

### P0-C.7 — Turn repeated strategy failure into a concrete causal method switch

**Code audit: PARTIAL — bounded causal recovery is implemented; actionable alternative selection is not.**

- `artistic-recovery-policy.ts` already implements the bounded policy: one same-strategy retry,
  `require_distinct_strategy`, then block dependent work or continue explicitly independent work
  after two causally distinct failures.
- Guard already computes a structural `visualStrategyFingerprint()` from problem/region/stage/scale,
  method class, action class, brush role and mutation structure. Color/opacity/count-style parameter
  changes are intentionally not sufficient to become a new strategy; `strategyChanged()` enforces
  this at preflight.
- Useful partial work is already represented and may be preserved by the recovery policy.
- **Missing:** durable/exposed set of exhausted method classes and a machine-readable list of viable
  **available causal alternatives** from the current method palette/capability snapshot. Today the
  caller gets essentially “make a causally distinct structural strategy change” and must rediscover
  the alternative manually. There is also no explicit “no alternative remains → Art Director” result
  derived from current tool availability.

The current recovery gate can correctly detect that two strategies failed, but it can stop at
"strategy change required" and leave the Painter to rediscover the method palette manually. Make the
recovery output operational without automatically mutating the image.

Implementation requirements:

- track attempted **method classes / causal strategies** per problem/hypothesis, not merely parameter
  variants;
- after the configured failure horizon (initially two causally distinct failed strategies), mark the
  exhausted classes for that problem and return `strategy_change_required` with currently available
  materially different method classes;
- parameter-only changes to the same underlying method do not count as a new strategy;
- retain useful pixels/anchors from partial progress unless the visual verdict explicitly rejects
  them;
- if no causally distinct method remains, escalate to Art Director/human review rather than looping.

**Acceptance**

- two failed Hard-Round/paint-style strategies cause the next plan to exclude the exhausted class and
  surface a valid transition/region/filter alternative when available;
- a radius/opacity/size-only variant is rejected as non-distinct;
- a successful strategy clears the strategy-debt for that problem without erasing unrelated history;
- no strategy suggestion itself dispatches Photoshop work without normal preflight/review.

### P0-C.8 — Expose one primary blocking artistic problem at a time

**Code audit: PARTIAL — problem ledger and active blocker already exist, but promotion semantics are incomplete.**

- Painting state already stores `visual_problems`, one `active_problem`,
  `largest_open_must_fix`, `priority_review_required`, relation review and Art Director task state.
- `priorityGate()` already blocks a finer-scale mutation only when a larger unresolved must-fix
  exists, and `largestOpenMustFix()` deterministically orders must-fix problems by scale.
- `setPriorityState()` can retain multiple problems while selecting a must-fix active problem, so the
  data model already supports “one active + backlog”.
- **Missing/weak:** selection is mainly `must-fix + scale`; there is no explicit dependency/causal-order
  scheduler across must-fix/should-fix backlog, and `active_problem` can remain stale when no new
  must-fix is selected (`nextMustFix ?? current.active_problem`). The live trend incident also showed
  that a mis-scoped synthetic problem can seize `active_problem` and force manual reclassification.
- P0-C.8 is therefore scheduler/promotion hardening, not a new problem-memory subsystem.

Critic/review may detect several real issues, but the scheduler should not turn all of them into
simultaneous active gates. Preserve all findings as backlog/evidence while selecting one explicit
primary problem for the next pass.

Implementation requirements:

- maintain `primary_blocker` / active problem separately from non-blocking findings/backlog;
- select by severity, scale dependency and causal order: larger prerequisite problems block finer
  dependent work;
- a newly detected independent higher-severity regression may pre-empt the current primary problem;
- resolving/reclassifying the primary problem deterministically promotes the next eligible backlog
  item;
- do not discard secondary critic findings merely because they are not currently active.

**Acceptance**

- a fixture with form, lighting and texture findings schedules the prerequisite form problem first
  while retaining the other two for later;
- resolving form promotes lighting without requiring the critic to rediscover it;
- a new severe whole-frame regression can pre-empt a smaller active task;
- the compact next-step output contains one actionable primary mismatch rather than a flat list of
  competing corrections.

### P0-C.9 — Add a task-scoped Painter autonomy window

**Code audit: PARTIAL / CLOSE FOUNDATION — cadence and interrupts exist, but the counter is directive-wide rather than task-scoped.**

- Art Director directives already require `review_after_microplans` (1–20, documented as normally
  around 5–10), persist `completed_microplans`, track `current_task_id`, and automatically move to the
  next pending task when `planner_task_assessment.status=completed`.
- `advanceArtDirectorAfterVerdict()` already forces review on serious regression/global readability
  degradation, explicit interrupt, task failure/block, all-tasks-complete, stage boundary/global
  change whole-image glance, or cadence exhaustion. The state is durable and survives restart.
- **Key gap:** `completed_microplans` is accumulated across the **whole directive** and is not reset or
  separately tracked per current task. Thus the implemented cadence is not yet the requested
  “N successful passes inside one unchanged task” autonomy window. There is no explicit remaining
  task-window count or task-local successful-pass counter.
- The required per-pass visual barrier already remains intact, so P0-C.9 should reuse this mechanism
  rather than introduce a second autonomy state machine.

Use the existing Planner/Art-Director task concept to avoid a full directive/replanning round-trip
after every successful pass. This is **not** permission to skip per-pass visual observation. The
Painter may continue within one approved task for a bounded number of semantic passes while Guard
still captures/verifies each pass and the producer still supplies an honest visual observation.

Implementation requirements:

- make `review_after_microplans` (or its successor) an enforced task-scoped autonomy horizon;
- start with an experimental default of roughly **three successful passes** inside one unchanged task
  before mandatory Art Director re-review;
- interrupt the window immediately for a new must-fix regression, uncertainty/recovery, strategy
  exhaustion, stage transition, composition/global-scope change, protected-quality loss or explicit
  user interruption;
- ordinary progress within the same task should not require a new directive merely because one pass
  completed successfully.

**Acceptance**

- three representative successful passes can progress one Planner task under one directive with
  normal per-pass evidence but without forced Art Director replanning between them;
- an injected severe regression interrupts after the first affected pass;
- stage/global/composition changes still trigger the stricter review path;
- restart/resume preserves the remaining autonomy-window count and task identity.

### P0-C.10 — Measure artistic throughput without optimizing the metric itself

**Code audit: PARTIAL — latency telemetry is mature; artistic-throughput/choreography aggregation is absent.**

- Guard already records per-cycle `guard_preflight_ms`, Photoshop dispatch wall time, preview
  materialization time where separable, visual-evaluation/inter-call gap, report/ack closure,
  recovery reconciliation, `guard_invocation_count_observed`, total Guard time and
  `semantic_cycle_wall_ms`; status exposes aggregate median/p95 summaries.
- VisualMicroPlan already reports per-pass `mutation_count`, and existing Task-19 cache benchmarking
  compares semantic-cycle wall time / preparation host calls before and after caching.
- **Missing:** no durable aggregation currently classifies semantic artistic actions versus
  bookkeeping-only/recovery-only model-visible round trips; no
  `artistic semantic actions / model-visible Guard round-trip` metric exists; `mutation_count` is not
  rolled into the latency summary; there is no P0-C before/after report combining throughput with
  regression/recovery/evidence-integrity outcomes.
- Therefore the telemetry foundation should be extended, not replaced with a new timing system.

Add telemetry that makes Guard overhead visible, but keep semantic-cycle wall time and artistic
correctness as the real optimization targets. The useful diagnostic from this run is the ratio of
meaningful artistic work to model-visible Guard choreography, not raw Photoshop command volume.

Record at least:

- semantic artistic actions dispatched;
- model-visible Guard round-trips;
- bookkeeping-only/recovery-only round-trips;
- artistic semantic actions per model-visible Guard round-trip;
- share of semantic-cycle wall time spent in Guard/host bookkeeping versus Photoshop dispatch and
  visual evaluation where measurable;
- pass completion, regression/recovery and evidence-integrity outcomes alongside the timing data.

For ordinary low-risk passes, **5:1–10:1 artistic semantic actions per model-visible Guard
round-trip** is a useful experimental health range, not a hard production score. Never inflate the
ratio by bundling unrelated work, skipping review, counting stroke points as actions or weakening
recovery evidence.

**Acceptance**

- run the same representative task before/after P0-C and report both semantic-cycle wall time and the
  new choreography metrics;
- the new path reduces bookkeeping-only round-trips and/or end-to-end semantic-cycle latency without
  increasing unresolved regressions, uncertain replays or evidence failures;
- quality/recovery controls can fail the optimization even when the action/round-trip ratio improves;
- telemetry is diagnostic only and is never used as proof that an artwork improved.

### P0-C compatibility constraints

The P0-C work is explicitly compatible with the existing roadmap only under these constraints:

- **No contradiction with "do not maximize mutations per bundle":** the mutation budget is an upper
  bound chosen from semantic/risk context, not a throughput quota. Unrelated actions must not be
  bundled to improve a metric.
- **No contradiction with multiscale review:** P0-C reduces intermediate bookkeeping boundaries, not
  the required pass-level whole-frame/local visual evidence or escalation crops.
- **No contradiction with compact-v2 closure:** P0-C.3 is a regression/invariant task because compact-v2
  already promises Guard-owned receipt/report/verdict closure. Do not reintroduce standalone closure
  tools to solve it.
- **No contradiction with exact evidence identity:** P0-C.4 repairs a reproduced implementation bug
  against an already-declared baseline guarantee; it does not define a weaker evidence model.
- **No contradiction with critic calibration:** P0-C.8 changes scheduling/priority presentation, not
  critic artistic authority. Human reliability claims still require P0-D calibration.
- **No blind autonomy:** P0-C.9 removes unnecessary Art Director/replanning churn while retaining an
  honest visual observation after every semantic pass and immediate interruption on safety/artistic
  regression triggers.

---

## P0-V — Adaptive multiscale visual verification: residual theory-to-runtime gaps

**Status:** baseline implemented and live-accepted; stronger review theory remains partially open.

The original implementation brief (`docs/guard-multiscale-visual-review-task.md`) and the publishable
research concept (`docs/adaptive-multiscale-visual-verification.md`) define a stronger claim than the
already-accepted COMPOSITION / OBJECT / MICRO baseline. A 2026-09-25 point-by-point audit found that
most of the brief is implemented in code/tests, but the following items are not yet fully represented
in production behavior or regression coverage. Do not mark them complete merely because the baseline
MR.1–MR.4 acceptance is green.

Already present and **not** reopened here:

- deterministic minimum COMPOSITION / OBJECT / MICRO profile resolution from pass scale,
  action/impact class, significance mode and current problem scale;
- whole-frame context at every review level;
- exact source-document `region_bounds`, requested/effective region separation and deterministic
  OBJECT/MICRO padding/clamp for escalation crops;
- structured subject-agnostic `review_findings[]` with exact bounds for OBJECT/MICRO findings;
- same-operation read-only crop escalation, maximum two new crops per round, overlap dedupe and
  deterministic priority;
- wrong-document/stale-whole-SHA/changed-region rejection;
- durable status/resume state and immutable review artifacts;
- additive compact-v2 schema behavior;
- no artistic mutation replay and no second Photoshop history step during read-only evidence
  enrichment;
- live COMPOSITION → OBJECT → MICRO evidence from the 2026-09-24 smoke run.

### P0-V.1 — Drive review escalation from runtime uncertainty and final-comparison semantics

**Code audit: PARTIAL.**

`resolveVisualReviewProfile()` already models `unresolved_after_overview`,
`unresolved_after_object`, `has_tighter_region` and `final_comparison`, and unit tests exercise the
uncertainty ladder. The normal compiler/runtime path does **not** currently drive those inputs as a
general production policy; `final_comparison` is likewise a dormant resolver input rather than a
production trigger.

Implement:

- when an honest review reports unresolved **local** uncertainty after a whole-frame view and an exact
  semantic region is available, escalate the same operation to at least OBJECT evidence without a new
  artistic mutation;
- when OBJECT evidence remains insufficient and an exact tighter region is supplied, escalate the
  same operation to MICRO;
- keep this structured: do not infer coordinates or escalation level from free-text keywords;
- make final artistic comparison explicitly require the COMPOSITION/whole-frame evidence contract,
  with any local evidence treated as supplemental rather than substituting for the whole frame;
- preserve the existing `review_findings[]` path for concrete localized findings; uncertainty-driven
  escalation is complementary, not a duplicate mutation path.

**Acceptance**

- integration tests prove overview uncertainty → OBJECT and OBJECT uncertainty + tighter exact region
  → MICRO on the same operation id with zero mutation replay;
- final comparison cannot be completed from crop-only/local evidence;
- unrelated resolved/global passes do not acquire unnecessary local crops;
- restart/status/resume preserve an uncertainty-driven pending review exactly as they do structured
  finding escalation.

### P0-V.2 — Preserve object context during MICRO review

**Code audit: PARTIAL.**

Direct detail/micro passes currently preserve the whole frame and one exact focus crop at the MICRO
target size. The stronger Level-3 contract from the original design calls for a contextual ladder:

```text
whole frame -> object-context crop -> tight micro crop
```

This hierarchy appears naturally when a later MICRO finding escalates an already-OBJECT-reviewed
operation, but it is **not guaranteed** for a direct MICRO pass.

Implement a deterministic context-preserving MICRO contract:

- retain the whole frame unconditionally;
- when a broader exact semantic/object region and a tighter micro region are both known, deliver both
  roles and bind both to the same document and whole-frame SHA;
- never invent a wider object region or a tighter center crop geometrically when semantic bounds are
  unknown;
- define an explicit compact representation for the broader context region if the existing
  `region_bounds` field cannot distinguish object context from the micro target;
- avoid duplicate image roles when object and micro regions are materially identical;
- if response/image-count budgets cannot carry all mandatory roles in one result, split the review
  into bounded read-only evidence rounds rather than silently dropping the context role.

**Acceptance**

- direct MICRO coverage proves whole + object-context + tight micro evidence when both exact regions
  are available;
- a control proves no synthetic/guessed object-context crop is created when only the tight region is
  known;
- whole/object/micro evidence keeps source-document coordinates and one shared whole-frame identity;
- blinded or human calibration can later compare `whole+micro` against
  `whole+object-context+micro` without changing the mutation itself.

### P0-V.3 — Make model-facing image delivery a closure prerequisite

**Code audit: PARTIAL.**

The public tool wrapper already records `image_delivered_for_review`, `delivery_complete`,
`undelivered_roles` and concrete omission reasons such as response-byte budget or unreadable artifact.
However, those response-delivery facts are not yet a durable Guard prerequisite for the next visual
closure. A crop can therefore exist and verify by path/SHA while the model-facing MCP response reports
that a mandatory image role was not actually delivered.

Implement:

- distinguish durable artifact capture from model-facing MCP image delivery;
- persist or otherwise causally bind a delivery receipt for every mandatory review role before the
  Guard accepts a visual observation that depends on that role;
- if `delivery_complete=false`, keep the same artistic operation pending and request bounded read-only
  re-delivery/re-encoding/re-capture as appropriate; never replay the mutation;
- treat path/SHA as artifact identity only, not proof of visual delivery or interpretation;
- continue using conservative terminology such as `image_delivered_for_review`; do not introduce
  `image_seen` / `image_understood` claims;
- if the host cannot prove UI rendering, scope the guarantee precisely to **MCP image-content delivery
  to the model-facing tool result**, not user-visible rendering.

**Acceptance**

- the existing unreadable-artifact and response-byte-budget fixtures cannot close the visual verdict
  while a mandatory role is undelivered;
- a successful re-delivery for the same SHA/role clears only the delivery debt, not by replaying or
  reclassifying the mutation;
- status/resume exposes pending delivery debt distinctly from missing/corrupt artifact debt;
- normal successful delivery adds no extra model-visible round-trip.

### P0-V.4 — Complete the crop provenance and scale-invariance contract

**Code audit: PARTIAL TEST/PROJECTION GAP.**

Escalation evidence currently persists crop scale metadata but does not persist/project explicit
`canvas_width` / `canvas_height` on each durable `review_evidence` record. The original exact-coordinate
contract required canvas dimensions with every crop, and the original test plan also required direct
proof that source-document regions remain identical when the overview is captured at different
downscale sizes.

Implement/verify:

- store and project canvas width/height alongside every durable escalation crop, including
  status/resume;
- add a regression where the same requested source-document region is reviewed with two different
  whole-frame `max_dimension_px` values and prove `requested_region` / `effective_region` remain
  unchanged while only preview scale metadata changes;
- cover both initial prefetched local evidence and later escalation evidence;
- retain integer floor/ceil normalization, canvas-edge clamp and exact requested/effective provenance;
- keep native-resolution behavior explicit: larger review limits may downsample less, but must never
  be represented as creating new source detail by upscaling.

**Acceptance**

- unit/state tests assert canvas dimensions, source coordinates and scale metadata after restart;
- changing overview resolution cannot change the semantic crop coordinates;
- all existing wrong-document, stale-SHA, immutable-artifact and no-replay regressions remain green.

---

## P0-A — ChatGPT / CoS route integrity

### Task 1 — Reproduce and classify the ImageGen → CoS failure

**Priority:** first.

**Current handoff state — 2026-09-24**

- Closed predecessor milestones are archived in `CHANGELOG.md`; the active roadmap frontier is
  P0-A / Task 1.
- Historical project evidence already proves one **real attribution failure with connector visibility
  preserved**: a CoS session was recorded as `Unattributed activity` with no conversation id while
  Photoshop reads, Guard status and Guard cycle remained callable. This is evidence for
  `attribution_failure`, not for `connector_visibility_failure`.
- The current continuation independently reproduces the same diagnostic boundary: Core and Photoshop
  MCP calls continue to execute while their returned identity notice says the exact ChatGPT
  conversation is not known and the call is filed as `Unattributed`. Therefore current
  `Unattributed` state must not be described as “CoS/Photoshop disappeared”.
- This does **not** yet prove that the historical accidental ImageGen route and the attribution
  failure are the same incident. Task 1 remains open until one deterministic same-conversation
  real-host trace captures the route transition itself.
- The earlier `session` result is now classified correctly: current CoS source intentionally
  **retires the model-facing `session` lookup tool**, and its tests require it to be absent from the
  current Core declaration. The host still exposing `session` in this conversation is stale plugin
  schema; `McpServerError: Tool session not found` is therefore the expected backend result for that
  stale declaration, not evidence that local recordings are missing or unreadable.
- The active slot-A recording store was read directly and does contain the historical Photoshop
  conversations, including repeated explicit “не пользуй imagegen … только COS / MCP Photoshop”
  instructions. The exact prior-chat incident has also now been recovered at transcript level:
  on **2026-09-21 11:54** the user wrote “ты случайно запустил imagegen”, and the immediately
  following assistant response explicitly stated “Я ошибочно запустил image_gen” before restoring
  the COS → Plugins → Photoshop MCP route. This proves that the accidental-route incident itself was
  real; it still does **not** supply the request/tool-level host trace required by this task's
  acceptance criteria, so Task 1 remains open.
- The current live attribution failure is now localized one layer further. The active ChatGPT tab
  still carried the **pre-v2 boolean** `window.__cosUsageObserver`; current CoS source/slot-A bytes
  contain observer v2. Re-injecting v2 into such an already-open document previously returned early
  because the legacy observer had no disposal handle. The page therefore stopped publishing the
  early exact `conversation_id + metadata.request_id` evidence while the MCP tunnel itself remained
  healthy, and recorder calls expired after the 20 s request-evidence grace into `Unattributed`.
- A focused CoS fork fix now upgrades that legacy boolean observer **in place**, wrapping its passive
  fetch forwarder instead of forcing a ChatGPT reload. Regression coverage proves the upgraded tab
  emits exact request-origin evidence; focused usage-observer/extension tests and TypeScript pass.
  This is a repository-level Task-3 fix candidate; live acceptance still requires running that build
  and proving a subsequent same-chat CoS call becomes exactly attributed without replaying any
  Photoshop mutation.
- The fixed CoS commit \`5d87e8d\` is now packaged as the validated **inactive slot-b** candidate.
  Its embedded identity is \`our-release / slot-b / 5d87e8d\`, its packaged extension contains the
  legacy-observer upgrade, and \`app.asar\` contains the required \`@modelcontextprotocol/core\`
  runtime dependency. The active runtime remains slot-a until the live cutover.
- **Next step:** activate validated slot-b, then run the smallest read-only same-chat attribution
  smoke on the first request issued after the cutover. If exact attribution is restored, continue
  Task 1 with the deterministic host-route trace; do not invoke ImageGen merely to manufacture
  evidence.

The historical failure must be classified from one deterministic real-host trace, not from model
prose. Capture one same-conversation sequence:

```text
healthy attributed CoS Photoshop read
→ ordinary image/drawing/editing continuation language
→ unexpected host-native visual route or tool-selection failure
→ next attempted CoS/Photoshop continuation
```

Record, where observable:

- whether the CoS/Photoshop tool catalog is still offered to the model;
- CoS request id and conversation/page/Fiber identity evidence;
- attribution method: exact request id vs `Unattributed`;
- whether the plugin call is executed, refused, not selected, or genuinely unavailable;
- whether Guard status/resume remains reachable;
- page/browser reload or connector reattachment events;
- the exact host-visible failure before any claim that CoS is unavailable.

Classify the incident as one or more of:

1. `routing_failure` — another visual engine was selected although the Photoshop workflow was
   already established;
2. `attribution_failure` — CoS received/executed the call but could not prove conversation
   ownership;
3. `connector_visibility_failure` — the CoS/Photoshop surface genuinely disappeared from the host
   turn;
4. `model_recovery_failure` — the tools remained available/recoverable but were not checked before
   the model declared them absent.

**Acceptance**

- one minimal reproducible real-host transcript/trace exists;
- classification is evidence-based;
- a successful Photoshop mutation is never replayed to repair attribution;
- the same test can be rerun after every routing/rebind change.

### Task 3 — CoS attribution/rebind survival across non-CoS host-tool turns

**Status:** **closed / live-pass 2026-09-25**.

Validated on CoS `our-release / slot-b / 5d87e8d`. Earlier calls in the same live continuation were
correctly recorded as `unattributed` while connector execution remained available. After the
browser-repair/legacy-observer upgrade took effect, a read-only Core smoke and Photoshop Guard status
were both recorded with exact `request_id` attribution. A later built-in non-CoS web read was then
followed by another Core read, `photoshop_ping` and `photoshop_guard_resume(3766)`; all CoS calls were
again recorded as exact `request_id` ownership for the same chat. Guard resume recovered the existing
Task21a document/run/anchor state and exact restored frame SHA with no mutation replay and no pending
report/ack/verdict/uncertain debt. Hashed evidence is recorded in `docs/live-evidence-ledger.json`.

The acceptance below is retained as a non-regression contract.

This is an independent known failure class and is currently more actionable than adding more
painting-side routing text. The likely implementation owner is the **Chat On Steroids host/rebind
layer**, while Photoshop Guard state must remain conversation-independent.

Using Task 1 evidence, determine:

- whether the next CoS invocation carries a request id;
- whether URL/page/Fiber conversation identities agree;
- whether calls temporarily land in `Unattributed`;
- whether existing late-attribution repair can rebind them;
- whether the companion/browser connection actually changed;
- which exact missing event/evidence prevents reattachment if repair fails.

Do not bind Photoshop journal/art-run state to browser attribution. After rebind, a safe Guard
status/resume read must recover the pre-existing run without repeating work.

**Acceptance**

- a native/unrelated host-tool turn can be followed by a CoS Photoshop read in the same chat;
- exact attribution is restored when sufficient evidence exists;
- temporary `Unattributed` calls never cause replay of a successful mutation;
- Guard resume reaches the pre-existing document/art-run state;
- when identity truly cannot be proven, the failure is explicit and attribution-specific rather
  than presented as “Photoshop/CoS no longer exists”.

### Task 2 — Real-host sticky Photoshop route acceptance

**Priority:** next real-host routing acceptance after Task 1; Task 3 rebind is now proven.

The repository already contains sticky-route metadata/instructions and a static routing corpus.
The remaining work is **real ChatGPT + CoS host acceptance**, because repository tests cannot prove
which host tool the model actually selects.

Run the established-workflow corpus in Russian and English, including:

- “продолжи изображение”;
- “дорисуй фон”;
- “улучши картинку”;
- “нарисуй здесь…”;
- “сделай изображение более реалистичным”;
- “continue painting this image”;
- “improve the artwork”;
- terse continuation such as “дальше”.

Run it only after confirming the rebuilt CoS Photoshop child/schema is the one actually serving the
conversation, so a stale process cannot invalidate the result.

**Acceptance**

- an established Photoshop workflow does not switch to another visual execution engine without an
  explicit user mode change;
- ordinary words such as “image”, “draw”, “рисуй”, “картинка” remain usable;
- failures are recorded as routing/visibility/attribution evidence rather than inferred from prose.

### Task 4 — Host recovery wording and three-state availability model

**Status:** **closed 2026-09-25**.

The CoS model-facing recovery contract now names the three states explicitly on both Core and
Plugins initialization surfaces: `Tool not selected`, `Caller unattributed`, and `Connector
genuinely unavailable`. `Unattributed` is explicitly an identity/recording state rather than
connector loss; genuine unavailability may be claimed only after a concrete discovery/readiness/
tool-call failure; successful mutations must never be replayed and an established workflow must not
silently switch engines as a repair. CoS implementation commit: `b1ce9ed` (`fix: distinguish
connector recovery states`). Full focused MCP validation: 190 passed / 6 skipped plus TypeScript.

The Photoshop MCP side already supplies the workflow-specific recovery order retained below:
existing CoS Photoshop surface → `photoshop_guard_status` / `photoshop_guard_resume` → durable state
recovery → continue. Task 3 live evidence additionally proves this recovery preserved the existing
Task21a art-run/anchor state without replay.

The acceptance below is retained as a non-regression contract.

**Priority:** after Tasks 1–3 provide real observability.

Align CoS-facing guidance and recovery behavior around exactly three states:

```text
tool not selected
tool available but caller unattributed
tool/connector genuinely unavailable
```

The last state may be claimed only after a concrete availability check fails.

Preferred recovery order for an established Photoshop workflow:

```text
discover/use existing CoS Photoshop surface
→ safe Guard status/resume read
→ recover exact pending state if present
→ continue
```

Never repair binding by repainting or replaying a successful mutation.

**Acceptance**

- host/model guidance does not collapse “not selected” or “unattributed” into “unavailable”;
- concrete failure evidence is surfaced when the connector is genuinely unavailable;
- recovery preserves existing Guard/art-run state.

---

## P0-D — Human critic calibration and decision-quality validation

### Tasks 8 / 8a — Human adjudication of the isolated critic

**Priority:** after the immediate P0-E brush/stamp-pack implementation and the remaining P0-C
semantic-pass work in the priority order above. This remains the next perceptual-authority gate, not
a reason to delay the pack workflow required for the next real-art test.

The machine infrastructure is already present. The remaining work is real human reference
judgment, not more critic plumbing.

Use:

- review pack: `task8a-review-pack/review.html`;
- human reference file generated from the pack/template;
- validator: `node scripts/task8a-calibration.mjs validate`.

The held-out set must include:

- genuine improvements;
- regressions;
- ambiguous tradeoffs;
- identical before/after pairs;
- locally successful edits that weaken the whole;
- useful simplifications;
- lost accidental strengths;
- mechanically repeated character/creature/decorative motifs, including transform-only and
  parameter-jitter variants;
- legitimate intentional regular rhythms, so calibration measures false alarms as well as detection;
- stylized/surreal cases where ordinary-world assumptions should not trigger correction.

Human reference judgments must be recorded before critic answers are used to adjudicate disputed
cases. Keep producer reports, prior verdicts and expected answers out of critic input.

The existing `world-consistency-critic` fixture remains useful as plumbing/suppression coverage, but
its injected expected `flaggedIds` are not independent evidence of critic detection accuracy and must
not be promoted into a reliability claim.

Compare, under the same evidence/time budget:

1. current image comparison + style/Art Director state;
2. the same evidence plus the bounded critic/relational context being evaluated.

Measure:

- additional true detections;
- misses;
- false alarms;
- appropriate abstentions/uncertainty;
- changed keep/rollback/global-promotion decisions;
- latency/cost;
- consistency on repeated/order-balanced cases.

**Acceptance**

- grant narrow critic authority only where held-out human-labelled evidence shows useful reliability
  at acceptable overhead;
- otherwise keep the critic advisory/shadow-only or restrict it to narrower tasks;
- agreement between models is never treated as truth;
- no mandatory second-model call per layer/stroke;
- mocks/tool success/pixel delta do not substitute for human calibration.

### Task 8b — Calibrate the decision to STOP / FINALIZE

**Priority:** immediately after the base Task 8/8a calibration corpus is labelled.

A painting system that can always propose another local pass is not complete. The critic/Art
Director path must also be evaluated on whether it can recognize when the current frame is already
good enough to finalize and when a further edit would create more regression risk than expected
benefit.

Extend the held-out human-labelled corpus with three explicit decision classes:

~~~
FINALIZE_NOW
CONTINUE_REQUIRED
CONTINUE_OPTIONAL_OR_AMBIGUOUS
~~~

The corpus must include:

- already-good frames where no user-critical mismatch remains;
- frames with at least one clearly unmet hard perceptual requirement;
- frames with a real but low-value local imperfection whose correction carries meaningful global
  regression risk;
- frames where a later “improvement” loses an accidental strength or weakens the whole;
- ambiguous tradeoffs where abstention or human review is appropriate.

Human labels must be recorded before critic/Art Director answers are used for adjudication. The
evaluation manifest must predeclare the case counts, repeat/order-balancing procedure and any numeric
pass thresholds before results are unblinded.

Measure separately:

- false-finalize rate on CONTINUE_REQUIRED;
- unnecessary-continue rate on FINALIZE_NOW;
- abstention/review rate on ambiguous cases;
- changed keep/continue/finalize decisions versus the current baseline;
- consistency across repeated/order-balanced evaluation;
- whether a FINALIZE_NOW decision actually prevents another visual mutation.

**Acceptance**

- **zero** held-out false FINALIZE_NOW decisions are allowed on cases whose human label is
  CONTINUE_REQUIRED because an explicit hard user requirement is still visibly unmet;
- on the human-labelled FINALIZE_NOW subset, the stop-aware path must reduce unnecessary
  continuation decisions versus the same-evidence baseline, not merely produce shorter or more
  confident explanations;
- any predeclared repeat/order-consistency threshold must be met before stop authority is promoted;
- CONTINUE_OPTIONAL_OR_AMBIGUOUS cases may abstain/escalate rather than being forced into a false
  binary decision;
- once FINALIZE_NOW is accepted, only save/export/final Guard closure operations may follow; no
  further visual mutation may be auto-scheduled without new user input or new contradictory
  evidence;
- tool success, number of completed passes, elapsed time, pixel delta or “more detail” are never
  sufficient evidence to finalize;
- if these gates fail, stop/finalize judgment remains human/Art-Director-controlled or advisory-only
  rather than being granted automatic authority.

### Task 6 — Remaining World Consistency Critic human gate

The object-agnostic critic implementation is complete. Only these empirical claims remain:

- known support/contact/connectivity/intersection failures are detected more reliably than the
  previous baseline;
- explicit stylization/surreal intent does not create an unacceptable systematic false-positive
  pattern.

Use the Task 8/8a human-labelled evidence rather than creating a second evaluation stack.

**Acceptance**

- relation-specific held-out results support or reject the two claims above;
- unsupported claims remain advisory and are not promoted to runtime authority.

### Task 11 — Remaining unforeseen-regression human gate

Scheduling and bounded relation-aware review mechanics are complete. The remaining perceptual claim
is whether an independent whole-image look actually surfaces unforeseen regressions often enough to
be useful.

Evaluate this from the same held-out review/calibration process where possible.

**Acceptance**

- observed unforeseen-regression detection is documented against human labels;
- false alarms and abstentions are reported;
- no recursive critique loop is added to compensate for weak detection.

### 13a.1A / 13a.1C — Calibrated critic claims

The compact-v2 isolation/provenance/state mechanics are complete. The remaining claims inherit the
Task 8a gate:

- an isolated critic can reliably reject a technically admissible but visibly inadequate result;
- any transition/final critic authority is calibrated rather than inferred from repository mocks.

Do not reopen compact-v2 transport/state-machine work to address these human claims.

---

## P1-A — Autonomous-product cleanup / retire historical fork scaffolding

**Priority:** high. Execute after the current P0 implementation gates are stable enough that deletion
does not compete with active correctness work. This is no longer a cosmetic cleanup: the canonical
product architecture has moved away from the historical controller/provider model, while the
repository still contains several retired implementations, acceptance fixtures and compatibility
paths that make ownership and maintenance boundaries harder to see.

### Current divergence snapshot — 2026-09-25

The current repository should no longer be reasoned about as "upstream plus a few painting tools".
After refreshing `upstream/master`, the `src` trees have the following structural relationship:

- current project: **189** tracked TypeScript source files under `src`;
- current upstream: **149**;
- **58** current source files do not exist in upstream at all;
- **67** source files exist in both trees but are modified here;
- only **64** current source files remain byte-for-byte identical to upstream;
- **18** upstream source files are absent from the current project;
- the current-vs-upstream `src` diff is roughly **+32k / -6k lines**;
- the obviously project-owned painting/control core alone (embedded Guard, compact-v2,
  VisualMicroPlan, artistic/recovery/review/state modules and related canonical surfaces) is already
  tens of thousands of lines and determines normal production behavior.

These counts are a maintenance snapshot, **not a code-ownership percentage** and not a reason to
erase provenance. They demonstrate that the canonical behavior is now predominantly defined by this
project, while the remaining inherited substrate should be treated deliberately rather than assumed
to be the product architecture.

### P1-A.1 — Produce a deletion/retention manifest from actual reachability

Before deleting files, classify every historical/compatibility surface into exactly one category:

```text
canonical_required
bounded_compatibility_required
test_or_migration_fixture_only
historical_archaeology_only
unreachable_dead_code
```

At minimum audit:

- `scripts/photoshop-session.mjs`;
- `scripts/lib/photoshop-session-store.mjs`;
- `scripts/lib/photoshop-cycle.mjs`;
- persistent MCP daemon/client/provider code;
- controller/Stage A/C/D historical acceptance scripts;
- compatibility Guard entry points/modes that are not used by the canonical CoS path;
- duplicated state/recovery implementations;
- obsolete docs/examples that describe removed public contracts;
- generated/runtime artifacts accidentally living close enough to source to look maintained.

Use call/import/package-script reachability plus the maintained acceptance suite; do not retain code
only because Git history once used it.

### P1-A.2 — Delete the retired controller/daemon implementation after replacement proof

The historical controller/daemon is already non-canonical. Remove its provider implementation once
the deletion manifest proves every still-required invariant has a native embedded-Guard owner.

Required proof before deletion:

- operation journaling and exact receipt/outcome recovery are covered by native tests;
- preview/verdict and multiscale evidence barriers are covered natively;
- durable async jobs / interruption / restart-resume behavior needed by production are covered
  natively;
- accepted-anchor restore and no-replay behavior are covered natively;
- `package.json`, CI and release checks invoke no retired controller/daemon provider;
- maintained docs/prompts/examples do not instruct users or agents to use the retired path.

Historical information belongs in Git history and, only where genuinely useful, concise archival
documentation. Do **not** keep an executable duplicate architecture merely as archaeology.

### P1-A.3 — Remove obsolete duplicate fixtures and migrate the last useful assertions

For each historical controller/live fixture, either:

1. port the unique behavioral assertion to the canonical Vitest/embedded-Guard suite; or
2. document why the assertion describes a retired provider property and delete/archive the fixture.

Do not preserve tests whose only purpose is to keep dead providers buildable. The maintained
acceptance suite should test **current product invariants**, not historical implementation parity.

### P1-A.4 — Separate production source from historical evidence

Clean the repository layout so a new maintainer can distinguish, without oral history:

- current production runtime;
- current tests/acceptance;
- development diagnostics;
- generated evidence/artifacts;
- deliberately retained historical documentation.

Prefer deletion + Git history over creating a large permanent `legacy/` source subtree. Archive only
small documents/evidence that remain useful for explaining a decision or reproducing a migration
claim.

### P1-A.5 — Remove clearly unused generic surfaces, but only from reachability evidence

Once canonical painting behavior is stable, identify generic inherited tools/UI/recipes that are not
used by this product, its supported workflows or its acceptance suite. Remove them when doing so
reduces maintenance/runtime/tool-catalog complexity without removing a capability required by
current scene construction, compositing, persistence, recovery or diagnostics.

This is deliberately narrower than P2. P1-A removes **clearly dead or retired baggage**. P2 decides
whether still-live inherited substrate is the right long-term implementation for this product.

### P1-A.6 — Cleanup acceptance

P1-A is complete only when:

- the canonical CoS → embedded Guard → UXP-first route builds and passes from a clean checkout;
- `npm run verify:canonical` passes after the deletions;
- repository search finds no production import/package command that reaches a retired provider;
- no current prompt/README/agent instruction recommends the deleted route;
- no second durable Guard/controller/state machine remains executable in parallel with the canonical
  one;
- removed source is recoverable from Git history, so compatibility code is not retained merely from
  fear of losing history;
- `CHANGELOG.md` and the acceptance matrix record what was removed and which native evidence replaced
  it.

---

## P1-B — Human artistic acceptance on representative real artwork

### Task 23 — Progressive form refinement / de-block-in

**Priority:** first P1 gate, before final-target fidelity.

Machine implementation and disposable live progression are already complete and belong in
`CHANGELOG.md` / the acceptance matrix rather than this forward-looking TODO. The remaining Task 23
work is only the blinded human perceptual pack below.

Only the following acceptance work remains forward-looking:

1. **Blinded human perceptual pack**
   - positive modelled-form case;
   - texture-only negative control;
   - residual-block-in negative control;
   - destructive-overdetail negative control;
   - intentionally flat/graphic stylized control.

The evaluator receives only exact BEFORE/AFTER frames, the original target/style contract and the
predeclared Task-23 questions from docs/painting-evaluation-suite.md; tool logs, layer/stroke
counts, producer verdicts and the expected answer stay hidden.

**Acceptance**

- the positive case is judged to have genuinely improved major/secondary form rather than merely
  added marks or texture;
- texture-only, residual-block-in and destructive-overdetail controls are rejected;
- the stylized-flat control is not incorrectly pushed toward realism;
- machine/live stage-gate acceptance is already satisfied; until the blinded human labels exist,
  status remains **machine-complete / live-pass / human-gate-pending**.

### Task 22 — Final target fidelity / prompt-to-frame acceptance

**Priority:** second P1-B artistic gate, after Task 23 and before compositing polish or anchor
preference.

Before a real artwork is called finished, evaluate the exact final frame against the important
user-visible perceptual requirements in the original request. A readable composition or technically
successful Guard run is not enough if the requested style, realism level, atmosphere, lighting,
material treatment or other explicit visual target is still visibly wrong.

For each representative acceptance case, prepare a concise review checklist from the original user
request before looking at the final verdict. Classify only user-explicit or genuinely necessary
visual requirements as:

~~~
hard_perceptual
soft_preference
technical/non-visual
~~~

Do not turn this checklist into a new mandatory production schema or a universal aesthetic score.
It is an acceptance artifact for testing prompt-to-frame fidelity.

The human evaluator receives:

- the original user request;
- the exact registered final whole-frame preview;
- the predeclared requirement checklist;
- no tool-success, pass-count, expected-answer or producer-verdict cues.

For every hard_perceptual item, record exactly one:

~~~
MET
NOT_MET
UNCERTAIN
~~~

The representative set must include at least:

- one positive control where subject/composition/style requirements are all judged met;
- one negative control where subject and composition are broadly correct but the explicitly
  requested style/realism/finish level is wrong;
- one case where lighting/atmosphere is a central explicit target;
- one case where material/detail treatment is explicit enough that a flat block-in should not pass
  as finished.

**Acceptance**

- no final state is accepted while any hard_perceptual requirement is NOT_MET;
- any UNCERTAIN hard requirement blocks automatic finalization and requires human adjudication;
- when style/realism level is explicit, a content/composition match cannot compensate for a style
  miss;
- the negative style/finish control is rejected even if the scene content is recognizable;
- the positive control is accepted without requiring extra polishing merely because another edit is
  possible;
- judgment is made from the exact final whole-frame evidence, not from layer count, tool success,
  pixel delta or the fact that the composition is readable;
- the recorded result identifies which user-visible requirement blocked acceptance when a case
  fails, so the next pass addresses a concrete mismatch rather than generic “make it better” advice.

### Task 15d.3 — Compositing/material/atmosphere gain

The editable technical fixture already exists. A human must judge whether the representative
before/after:

- improves material/depth/atmosphere rather than merely increasing texture;
- preserves important structure;
- avoids letting blend/mask effects substitute for unresolved form/composition problems.

**Acceptance**

- human judgment is recorded against the exact registered BEFORE/AFTER evidence;
- technical execution facts remain separate from the artistic conclusion.

### Task 21 — Real-artwork artistic preference over anchors

One-action Guard-owned accepted-anchor recovery is technically and live proven; Task 21a is archived
in `CHANGELOG.md`. This Task 21 remains purely about whether the selected anchor
is actually artistically preferable in a representative real artwork.

Use a human comparison when a real run contains a meaningful current-vs-anchor tradeoff.

**Acceptance**

- the preference is recorded as human artistic judgment, not inferred from detail count, pixel
  difference or successful restore;
- if the later state is judged weaker, the existing anchor/restore machinery is used rather than
  silently finalizing it.

---

## P2 — Upstream-derived substrate review and independent-product cutover

**Goal:** turn the project's current de-facto architectural independence into an explicit,
maintainable product boundary. The project began as a fork of `alisaitteke/photoshop-mcp`; that origin
must remain visible and correctly attributed. But normal development, releases and runtime behavior
should depend on **our repository and our decisions**, not on upstream release cadence, upstream
internal architecture or the assumption that inherited code is automatically the right long-term
implementation.

Here, **autonomous** means:

- a fresh clone of our repository can build/test/run without configuring the upstream Git remote;
- no runtime component downloads or imports implementation from the upstream repository;
- our canonical APIs, state contracts, release/versioning and architecture are owned here;
- upstream can still be consulted and selectively ported like any other external open-source source;
- external platform dependencies such as Photoshop, UXP, Node/MCP and the chosen host remain explicit
  product dependencies. Autonomy does not mean pretending those platforms do not exist.

### P2.1 — Build a provenance/ownership map for the remaining live inherited substrate

After P1-A removes obviously dead baggage, inventory every still-live source area and classify it as:

```text
project_owned
upstream_derived_heavily_modified
upstream_derived_lightly_modified
upstream_identical_but_still_required
external_protocol_or_platform_adapter
candidate_for_removal_or_rewrite
```

The purpose is engineering ownership, not assigning simplistic authorship percentages. For each
remaining inherited subsystem, record:

- why the product still needs it;
- current canonical callers;
- whether its public shape constrains our architecture;
- whether upstream-specific abstractions/compatibility assumptions remain;
- whether keeping, simplifying, rewriting or deleting it best serves the current product.

At minimum review MCP/server bootstrap, generic tool registration, connection/platform layer,
document/layer/mask/selection/filter/export primitives, recipes/UI, analytics and retained
ExtendScript/COM implementations.

### P2.2 — Optimize inherited live code for our product instead of preserving upstream parity

For code we keep, remove accidental compatibility with upstream design where it adds complexity and
does not serve an accepted workflow. Examples include:

- APIs shaped around generic automation use-cases that conflict with the canonical painting lane;
- duplicate wrappers/state reads made unnecessary by compact-v2 or UXP;
- tool-catalog breadth that increases routing ambiguity without serving painting/compositing;
- abstractions whose only justification is matching upstream file/module structure;
- generic error/transport behavior weaker than our document-target/no-replay/evidence requirements.

Do not rewrite stable code merely to make it "ours". Rewrite only when there is a concrete
maintainability, correctness, latency, catalog-simplicity or product-boundary benefit. Preserve
behavioral tests across any rewrite.

### P2.3 — Make an explicit long-term decision on the retained ExtendScript/COM backend

The current canonical path is UXP-first and already prevents post-dispatch cross-backend replay, but
ordinary migrated primitives may retain a bounded **pre-dispatch** ExtendScript/COM fallback. Decide
from real compatibility evidence whether the independent product should:

1. keep a **small, explicitly supported fallback subset**;
2. make the UXP companion a hard runtime requirement and remove the remaining production fallback;
   or
3. maintain a separately bounded compatibility edition/profile.

Do not let historical fallback code survive indefinitely without a declared product policy. If UXP
coverage proves sufficient for supported environments, prefer deleting unreachable legacy backend
surface over carrying two execution architectures forever.

Acceptance requires real-host evidence for every capability whose backend policy changes, including
no-focus/no-replay/document-target behavior.

### P2.4 — Prove repository and release autonomy

Add a clean-room project acceptance that starts from **our origin only**:

1. fresh clone with no `upstream` remote configured;
2. dependency install from declared package manifests;
3. build/typecheck/lint and canonical tests;
4. package/build the CoS entry point and UXP companion from this repository;
5. start the canonical server/Guard surface;
6. verify no build/runtime script expects an upstream checkout, branch, tag or generated file;
7. where the environment permits Photoshop live acceptance, execute the canonical smoke from these
   artifacts.

Git history may retain the original fork ancestry. **Operational autonomy does not require rewriting
history or squashing away upstream commits.**

### P2.5 — Establish our own release/versioning compatibility policy

Define release ownership around this project's contracts rather than inherited upstream version
numbers:

- product/package version is advanced by our release criteria;
- compact Guard protocol, runtime-state version and UXP bridge revision remain explicitly versioned;
- release notes describe our canonical lane and migration requirements;
- compatibility statements name supported Photoshop/UXP/host versions directly;
- upstream releases do not automatically trigger our release or version bump;
- selectively ported upstream fixes are credited and tested like any other external contribution.

### P2.6 — Reframe GitHub/project identity as an independent derivative product

After P1-A cleanup and the P2 substrate review make the boundary truthful, update the public project
presentation so **fork ancestry is provenance, not the primary product definition**.

Target framing:

> **Photoshop MCP — Digital Painting Edition is an independently maintained digital-painting system
> for Photoshop, originally derived from the MIT-licensed `alisaitteke/photoshop-mcp` project.**

The exact product name may be revisited separately, but the GitHub page should make these facts clear:

- what the product does now: autonomous/agent-driven digital painting, Guard-controlled execution,
  scene construction, brush/stamp workflows, evidence/recovery and UXP-first Photoshop integration;
- that it is maintained/released independently and is not an official upstream or Adobe product;
- that it **originated from and still contains MIT-licensed upstream-derived code**;
- which architecture/components are project-owned additions;
- how upstream attribution and selectively ported contributions are credited;
- which runtime dependencies are actually required.

Update as applicable:

- repository description/About text and topics;
- README opening/architecture diagrams/features;
- package description/name if a rename is chosen;
- installation and release docs;
- issue/PR templates and contribution guidance;
- screenshots/branding that still present the project mainly as "a fork" rather than the current
  product;
- links between `origin`, historical upstream attribution and current releases.

Do **not** hide or erase the fork history to make the project look more original than it is.

### P2.7 — Preserve explicit license/origin attribution while adding our project ownership notice

The upstream project is MIT-licensed. Preserve the required upstream copyright/license notice for
upstream-derived portions and distributions. Add an appropriate project copyright/notice for new
work if desired, without replacing or obscuring the original notice.

Create a concise `UPSTREAM.md`, `NOTICE`, or equivalent if useful, documenting:

- original project and repository;
- original MIT license;
- that this project began as a fork/derivative;
- major architectural divergence at a high level;
- policy for crediting selectively ported upstream changes.

This roadmap item is an engineering/repository hygiene requirement, not a claim that attribution can
be removed once enough code has changed.

### P2.8 — Change upstream integration from fork-synchronization to selective external intake

Once the product boundary is explicit, treat upstream as a useful external source rather than a
branch that our architecture is expected to converge back toward:

- keep an `upstream` remote only if it remains useful for discovery/comparison;
- do not wholesale merge upstream history into canonical branches;
- inspect individual fixes/features against our architecture;
- port/cherry-pick/reimplement only when they solve a current problem or provide measured value;
- record provenance for non-trivial ports;
- prefer a small adaptation/reimplementation when an upstream change assumes architecture we have
  intentionally retired.

### P2 completion acceptance

P2 is complete when:

- a fresh origin-only clone proves build/test/package independence from an upstream checkout/remote;
- the canonical runtime has no hidden upstream runtime dependency;
- every retained inherited subsystem has an explicit keep/rewrite/remove rationale;
- the long-term ExtendScript/COM compatibility policy is decided and enforced in code/tests/docs;
- project versioning/releases are defined independently;
- GitHub/README/package presentation describes an **independently maintained derivative product**,
  not merely "our fork with extra tools";
- upstream MIT/origin attribution remains explicit and correct;
- future upstream work enters through selective review rather than synchronization pressure.

---

## Conditional work — do not implement before its trigger

### Task 5 — Thin Photoshop-only host with fail-closed tool allowlist

**Current priority:** inactive contingency.

Activate only if Tasks 1–4 show that ordinary ChatGPT + CoS still cannot preserve the established
Photoshop route reliably enough, or if a hard architectural guarantee is explicitly required.

If activated, first build only a minimal headless/CLI proof:

1. start independently of ChatGPT/CoS;
2. connect to the existing Photoshop MCP;
3. expose only explicitly approved Photoshop MCP tools;
4. prove unrelated visual engines/tools are absent from the acting model's catalog;
5. keep embedded Guard required;
6. deliver fresh Photoshop preview evidence back to model vision;
7. execute and continue one visual request end to end;
8. survive host restart without losing Guard/art-run state.

Reuse the existing Guard, Planner/Painter state, UXP transport and art-run persistence. Do not create
a second controller or duplicate project tree.

Only after that proof should any UI/panel or hard commentary-delivery ACK barrier be considered.

**Acceptance for activation**

- Tasks 1–4 still reproduce unacceptable route substitution after softer fixes, or a hard allowlist
  guarantee is explicitly required;
- the host/API surface actually supports the needed tool allowlist/tool-choice control;
- the added host complexity is justified by measured reliability gain.

### Task 10 — Compact artistic relationships / achieved-quality memory

**Current priority:** blocked by Task 8/8a evidence.

Implement only if human calibration shows that compact relational memory measurably improves
keep/rollback/global-promotion decisions or catches losses the baseline repeatedly misses.

If activated:

- keep only a small number of causal artistic hypotheses/achieved qualities;
- distinguish user constraints, chosen artistic hypotheses and emergent valuable qualities;
- bind every stored relation to observed frame/anchor evidence;
- allow relations to become questioned/retired;
- keep state compact enough for normal continuation;
- never hard-code generic aesthetic preferences as universal truth.

If the experiment only lengthens explanations without changing decisions, close Task 10 as
**not adopted** rather than adding another mandatory schema.

---

## P3 — Optional exploration

### Task 15c — Reference / 3D construction support

This is not required for the canonical painting lane.

For proportion-sensitive subjects, optionally evaluate a verified reference or bounded 3D blockout
as construction evidence for silhouettes, landmarks, masks, depth/occlusion or plane relationships.
Treat projected/estimated geometry as evidence with provenance and uncertainty, not proof of
artistic quality.

**Acceptance before adoption**

- a bounded comparison demonstrates useful structural preservation and/or throughput gain over the
  unsupported workflow;
- remaining model/review errors are reported;
- a technically correct render is not described as artistic mastery;
- no mandatory 3D dependency is added to ordinary painting.

---

## Work deliberately not prioritized

Do not optimize these merely because they are measurable:

- migrating every remaining Photoshop primitive to UXP when it is not on the canonical required
  painting path;
- maximizing mutations per bundle, or chasing an actions/round-trip ratio independently of semantic
  pass quality and safety; P0-C may use that ratio only as diagnostic telemetry;
- caching arbitrary Photoshop state without invalidation proof;
- weakening preview/verdict/recovery evidence to save calls;
- optimizing raw tool count instead of semantic-cycle wall time;
- deleting or rewriting still-live inherited source **without reachability/ownership proof**. P1-A
  explicitly promotes deletion of retired historical providers once native replacement coverage is
  proven; P2 may simplify/rewrite retained inherited substrate only from an explicit product benefit,
  not merely to increase a superficial "percent ours" metric.

Current measurements show that real semantic-cycle latency is often dominated by the
host/model/visual-evaluation interval rather than Photoshop dispatch alone. New speed work must
target a measured bottleneck.

## Explicit non-goals

Do not add these without new evidence:

- universal numeric composition/style/expressiveness scores;
- one aggregate artistic “quality score”;
- full Art Director critique after every stroke/pass;
- blind multi-pass autonomy without per-pass visual observation and interruption triggers;
- mandatory rendered thumbnails for every scene;
- more Guard safety layers without a reproduced integrity failure;
- large required schemas whose fields do not change execution or review behavior;
- category-specific anatomy/hand/object pipelines as the default world-consistency mechanism;
- a second Guard/controller or duplicate art-run persistence tree.

## Upstream integration policy

Upstream changes must continue to be evaluated selectively against the **current project
architecture**. The project is not expected to converge back toward upstream. Do not perform
wholesale merges that can restore retired controller/raw-script paths, reintroduce upstream-specific
assumptions, or overwrite the compact-v2 UXP-first/pre-dispatch-fallback painting architecture.

Until P2 formalizes the independent-product cutover, the `upstream` remote remains useful for
comparison and selective intake only. After P2 it may remain as a convenience, but no build, release,
runtime or roadmap process may depend on it being configured.

Interrupt this roadmap for upstream work only when a change:

- fixes a reproduced current bug;
- is required for host/API compatibility;
- or provides a measured material advantage relevant to an active task.

## Validation policy for remaining roadmap work

Every implemented item should include, as applicable:

1. a minimal reproduced failure/need or a predeclared human-evaluation question;
2. fail-closed or explicitly bounded semantics;
3. targeted regression tests for machine behavior;
4. no resurrection of retired public contracts or raw-script bypass; any allowed
   ExtendScript/COM fallback must be selected before UXP dispatch, remain document-targeted and never
   be used for cross-backend replay;
5. preservation of the multiscale visual-review barrier: whole-frame context at every review level,
   exact source-coordinate escalation crops, and zero artistic mutation replay during evidence enrichment;
6. the canonical non-Photoshop repository gate runs for every code change, plus any area-specific
   build/typecheck/lint/policy verification required by the touched subsystem;
7. real Photoshop/CoS host acceptance when the claim depends on real host or Photoshop behavior;
8. human-labelled evidence when the claim is perceptual/artistic/calibration-related;
9. updates to this roadmap, `CHANGELOG.md` and canonical acceptance docs rather than accumulating
   another temporary completion log.
10. for anti-mechanical-patterning work, paired controls for exact/near copy, transform/jitter-only
    variation, genuine structural variation and intentional regular rhythm; randomization is not an
    accepted substitute for structural artistic variation.

Tool success, comparison SHA, pixel delta, layer creation and mocked critic verdicts are never, by
themselves, proof of artistic correctness.
