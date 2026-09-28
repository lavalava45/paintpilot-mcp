# Visual Evaluation and Adaptive Multiscale Verification

This document is the canonical visual-evaluation reference for the digital-painting project. It
combines the adaptive multiscale verification model with the practical painting evaluation suite.

It serves two purposes:

1. define what visual evidence a stateful Photoshop agent needs in order to judge its own edits;
2. define controlled evaluation protocols for comparing controller, prompt and tool revisions without
   confusing execution success with perceptual quality.

Current implementation/acceptance status remains authoritative in
[`roadmap-final-acceptance-matrix.md`](roadmap-final-acceptance-matrix.md) and
[`PAINTING-ROADMAP.md`](PAINTING-ROADMAP.md).

## 1. Evaluation principles

A stateful visual agent repeatedly executes:

```text
intent → editor action → rendered state → visual judgment → next action
```

The difficult part is not merely producing a preview. The system must decide whether the available
visual evidence is sufficient to answer the artistic question at the current spatial scale.

The evaluation model therefore follows these invariants:

- whole-frame context is retained for every visual review;
- local evidence supplements the overview rather than replacing it;
- source-document coordinates remain canonical regardless of preview scaling;
- evidence is bound to exact document/frame identity;
- additional evidence acquisition is read-only and must never replay the artistic mutation;
- execution significance and artistic correctness remain separate judgments;
- materialization, delivery and interpretation are distinct events;
- local improvement and global quality are evaluated separately;
- human perceptual claims are not inferred from tool success, pixel delta or producer self-review.

## 2. Three observational scales

The project uses three visual-review levels. These are evidence-resolution classes, not aesthetic
categories.

### COMPOSITION

Questions depend on the whole frame:

- subject readability;
- focal hierarchy;
- large value/color masses;
- negative space and depth;
- global regression caused by a local edit.

The primary evidence is the canonical whole-frame preview. The Guard currently targets a long edge of
about 1600 px without upscaling smaller documents.

### OBJECT

Questions concern a bounded semantic region while preserving the whole frame:

- recognizability;
- silhouette and proportion;
- placement/contact/support;
- overlap, occlusion and depth;
- damage around replacement/erase/transform boundaries.

The evidence set includes the whole frame plus an exact source-document crop, typically targeted at
about 1200 px on the crop's long edge.

### MICRO

Questions concern detail that may disappear at object scale:

- edge continuity;
- seams and halos;
- patch boundaries;
- small artifacts;
- feature-level anatomy;
- text/signature legibility;
- mechanical repetition;
- small value/color discontinuities.

The strongest evidence hierarchy is whole frame + object context + micro crop. A micro crop may target
about 1600 px on its long edge, but native source resolution remains the information limit.

## 3. Evidence model and provenance

Let the visual review package be an evidence set rather than one universal screenshot.

Every review contains a whole-frame observation. OBJECT and MICRO reviews add exact local evidence as
needed. Regions are expressed in Photoshop document pixels with the document's top-left as origin.

The system distinguishes:

- `requested_region` — the exact semantic/problem bounds;
- `effective_region` — the deterministic padded/clamped crop actually captured.

Current deterministic read-only escalation padding is:

- OBJECT: 12% of region dimensions, minimum 24 px per side;
- MICRO: 6%, minimum 12 px per side.

These values are engineering parameters rather than universal perceptual constants.

Local evidence is meaningful only when bound to:

- artistic operation id;
- pinned document/document incarnation;
- canonical whole-frame identity/SHA;
- requested/effective region;
- review level;
- crop identity/SHA;
- immutable materialized artifact identity.

If the whole-frame identity changes, the crop becomes stale. If the requested region changes, the old
crop does not automatically satisfy the new request.

## 4. Adaptive evidence acquisition

The canonical review loop is:

```text
1. Compile one bounded visual operation.
2. Resolve the minimum review level from structured pass facts.
3. Execute the artistic mutation exactly once.
4. Capture whole-frame and predictable local evidence.
5. Deliver the review package.
6. Record a factual visual observation.
7. If evidence is insufficient:
     capture bounded read-only crop evidence
     for the same operation/document/frame identity.
8. Close the verdict only after required evidence is classified.
9. Permit the next mutation.
```

The no-replay invariant is:

```text
mutation once
→ visual evidence
→ optional read-only evidence enrichment
→ verdict
→ next mutation
```

Never:

```text
mutation
→ insufficient evidence
→ repeat mutation
```

This matters because brush strokes, erases, transforms and many compositing operations are
non-idempotent.

### Structured findings

Free-text criticism is not sufficient for reproducible crop acquisition. When local evidence is
required, the critic supplies a structured finding with exact document-space bounds.

Subject-agnostic examples include:

- composition: `focal_hierarchy`, `global_value_structure`, `subject_recognition`;
- object: `silhouette`, `proportion`, `contact_support`, `occlusion_depth`;
- micro: `edge_transition`, `seam_halo`, `small_artifact`, `local_discontinuity`.

One escalation round is bounded to at most two new crops with deterministic prioritization and
deduplication.

## 5. Execution evidence versus artistic judgment

### Execution significance

Question: did Photoshop materially change the relevant pixels?

Useful mechanical evidence includes:

- before/after delta;
- changed-pixel ratio;
- exact state/readback;
- operation/history identity.

This can detect no-op or negligible execution.

### Artistic interpretation

Question: did the change solve the intended visual problem without creating unacceptable regressions?

This is semantic. A destructive edit may have a huge pixel delta; a successful subtle correction may
have a small one. Pixel significance is therefore an execution gate, not an aesthetic score.

### Materialization, delivery and interpretation

These are separate facts:

1. image bytes/artifact exist;
2. those exact bytes were delivered through the model-facing visual channel;
3. a critic formed an observation from them.

A path/SHA proves identity, not perception. Delivery metadata such as
`image_delivered_for_review` is defensible; fields such as `image_understood` would overstate what
transport can prove.

## 6. Research hypotheses

The evaluation program keeps the following falsifiable hypotheses:

- **H1 — scale matching:** OBJECT/MICRO evidence reduces missed local errors for spatially small
  targets compared with overview-only review.
- **H2 — persistent overview:** retaining the whole frame during local review reduces global
  regressions compared with crop-only inspection.
- **H3 — adaptive efficiency:** selective escalation can match or improve decision accuracy with less
  image traffic than fixed maximum-resolution review.
- **H4 — exact provenance:** document/frame/crop identity reduces false closure from stale evidence.
- **H5 — uncertainty-driven escalation:** allowing review to escalate after initial observation
  improves decisions beyond static pre-execution scale mapping.
- **H6 — hierarchical context:** whole + object-context + micro evidence reduces tunnel-vision errors
  relative to whole + micro-only review.
- **H7 — delivery-aware closure:** verified delivery of mandatory visual roles reduces metadata-only
  false claims of inspection.

These hypotheses are evaluation questions, not blanket claims that more pixels always improve model
reasoning.

## 7. Controlled evaluation conditions

When comparing revisions, use matched briefs and budgets.

Recommended review-policy conditions:

1. **Overview-only control** — one whole-frame preview per operation.
2. **Fixed exhaustive control** — whole frame plus predefined high-resolution crops for every pass.
3. **Adaptive multiscale** — minimum required profile plus bounded uncertainty/finding-driven
   escalation.

For hierarchical MICRO evaluation, compare:

- whole frame + tight micro crop;
- whole frame + object-context crop + tight micro crop.

For delivery-aware evaluation, include negative controls where a required artifact is materialized but
not actually delivered to the visual review channel.

## 8. Standard painting exercises

These exercises test transfer across different visual problems rather than memorized scene geometry.

### 8.1 Sphere — value and transition control

Goal: render one sphere with readable light/shadow families, turning form and contact/cast-shadow
relationship.

Success evidence:

- clean silhouette;
- grouping reads at thumbnail scale;
- continuous form without airbrush haze or stamp scallops;
- highlights/reflected light do not flatten hierarchy.

### 8.2 Cube or simple building — planes, perspective and edges

Goal: render a box-like form with three readable planes and intentional edge hierarchy.

Success evidence:

- coherent plane separation;
- internally consistent major axes/perspective;
- marks reinforce planes rather than creating ribbons/grids;
- local detail does not disguise a broken silhouette or plane relationship.

### 8.3 Small still life — overlap and negative space

Goal: arrange 2–4 simple objects with overlap and meaningful negative space.

Success evidence:

- unambiguous front/back ordering;
- protected silhouettes survive correction;
- negative spaces remain intentional;
- correction seams do not become equal-or-worse defects.

### 8.4 Small portrait study — proportion and selective detail

Goal: produce a compact head study with stable major proportions, value grouping and selective
feature detail.

Success evidence:

- landmarks/proportions stabilize before micro-detail;
- volume is not merely visible blob/tube primitives;
- focal features are selectively resolved rather than uniformly sharpened;
- local corrections are judged both zoomed-in and at normal/thumbnail scale.

### 8.5 Holdout transfer task

After tuning on the standard exercises, run at least one new composition whose subject and geometry
were not used during pipeline design. Do not choose a cosmetic variation of an earlier task.

The holdout detects benchmark-specific rules and memorized execution plans.

## 9. Fixed-budget comparison discipline

Baseline and candidate revisions should use the same applicable budget dimensions:

- wall-clock time;
- external MCP actions;
- visual atomic bundles;
- internal Photoshop batches/history steps;
- maximum correction/rollback attempts for one `problem_id`.

Budget is a comparison constraint, not a completion rule. A run that reaches its limit with unresolved
must-fix structure remains incomplete.

Never reuse scene-specific coordinates, stroke lists, masks, landmarks or geometry from an earlier
run. Reuse only generic capability knowledge such as brush-role behavior at comparable scale.

## 10. Required metrics

For each evaluation run, record the metrics that are actually observable:

- request → first visible canvas change;
- time/bundle count to first subject recognition by a blinded evaluator;
- when style is requested, time/bundle count to first subject + style recognition;
- Photoshop/tool execution time when measurable;
- explicit async waiting/job time when measurable;
- unattributed between-call/model-review gaps without pretending they are pure reasoning time;
- recognition-feature destruction count;
- accepted final frame + layered PSD checkpoint;
- total visual bundles;
- `improvement / neutral / regression` counts;
- `accept / correct / rollback` counts;
- problem-scoped replans;
- internal dab/stroke batches and execution duration;
- timeout/uncertain operation and recovery counts;
- primitive-footprint/correction-seam failures;
- whether Definition of Done was reached within budget;
- missed-defect / false-positive rates for visual-review experiments;
- global-regression rate after local corrections;
- false visual-closure rate;
- number of read-only crop captures;
- visual-evidence bytes delivered;
- mutation replay count during evidence escalation — expected to remain zero.

Keep visual quality separate from execution efficiency. Fewer calls do not make an image better; they
make an equally good accepted result cheaper or more reliable.

## 11. World-consistency shadow evaluation

The World Consistency Critic is evaluated as an advisory shadow pass over structured observations.

Use a generic relation vocabulary:

- support;
- contact;
- attachment;
- containment;
- connectivity;
- articulation;
- count/topology;
- gravity;
- occlusion;
- depth/order;
- scale;
- intersection.

The first evaluator step records observable relations only. A second step may flag a possible conflict
after considering prompt/style intent and must record:

- ordinary-world expectation;
- alternative explanation;
- certainty/uncertainty.

Explicit surreal, anti-gravity or impossible-architecture intent is a negative control: the critic
must not convert intentional departure into a realism correction.

Measure added true detections, false positives, surreal-control false positives and ambiguous cases.
The shadow critic does not itself accept, correct or roll back an edit.

## 12. Task 23 progressive-refinement human evaluation pack

Task 23's machine contract can prove that the Guard persists/enforces declared refinement evidence.
It cannot prove that an artwork is perceptually more modelled. That claim requires a blinded human
evaluation pack.

Required cases:

| Case | BEFORE → AFTER construction | Expected gate behavior |
| --- | --- | --- |
| positive-modelled-form | broad coherent block-in → genuinely modelled major/secondary form, edge hierarchy and material/light response | eligible to pass |
| negative-texture-only | same broad flat form → grain/noise/small marks with no meaningful lower-frequency form change | reject |
| negative-residual-geometry | readable composition → detail added while conspicuous temporary block-in primitives still dominate | reject |
| negative-overdetail | more small marks → weaker structural/form readability | reject / preserve stronger earlier state |
| stylized-flat-control | intentionally flat/graphic treatment declared in style contract | do not force toward realism |

For each case save:

- exact BEFORE frame;
- exact AFTER frame;
- original visual target/style contract.

Give the blinded evaluator only those materials and these predeclared questions:

1. major form more modelled? YES / NO / UNCERTAIN
2. secondary forms more informative? YES / NO / UNCERTAIN
3. edge hierarchy improved? YES / NO / UNCERTAIN / N-A
4. material/light response more specific? YES / NO / UNCERTAIN / N-A
5. residual block-in reduced? YES / NO / UNCERTAIN
6. extra detail structurally useful rather than noise? YES / NO / UNCERTAIN
7. important structure preserved? YES / NO / UNCERTAIN
8. requested realism/detail target materially closer? YES / NO / UNCERTAIN

Blind the evaluator to:

- tool logs;
- operation/layer/stroke counts;
- Painter/Critic verdicts;
- intended expected answer;
- statements that the candidate was designed to improve realism.

Task 23 perceptual acceptance requires the positive case to pass, all three negative controls to be
rejected, and the stylized control not to be incorrectly forced toward realism. Human labels are
necessary but not sufficient: the human gate remains open whenever the returned labels do not
cleanly satisfy the predeclared acceptance rule for that evaluation round.

### 12.1 Human aggregation rule for subsequent rounds

The first returned human labels were received before a case-level aggregation rule had been
predeclared. Preserve those labels as evidence, but do **not** retroactively invent a vote-count
threshold or rescore that round as though the rule below had existed beforehand.

For every subsequent/repeat Task-23 human round, predeclare and apply this rule:

- for a representational positive case, questions **1, 2, 3, 4, 5, 7 and 8** are core criteria when
  the target contract makes them applicable;
- every applicable core criterion must be **YES**; a required criterion answered **NO** or
  **UNCERTAIN** prevents positive-case acceptance;
- **N-A** is allowed only when the target/style contract genuinely makes that criterion
  inapplicable. A criterion explicitly required by the target contract cannot be converted to N-A;
- question 6 is **YES** when extra detail was introduced and is structurally useful, and may be N-A
  only when the candidate introduced no relevant extra detail;
- do not aggregate by a raw count such as “6/8”. The contract is conjunctive over applicable
  required criteria;
- a negative control is correctly rejected only when it fails the positive-case rule and the
  manipulated failure remains visible in at least one corresponding required criterion;
- the stylized-flat control is evaluated for **style preservation**, not forced realism. Criteria
  made irrelevant by the explicit flat/graphic style contract may be N-A without penalty.

The machine-readable copy of this rule is
task23-review-pack/aggregation-rule.v2.json.

The first human round is preserved in
task23-review-pack/human-labels.received-20260927.json. It is informative but not sufficient to
close Task 23: the positive case contains a **NO** on edge hierarchy and an **N-A** on secondary
forms, while those dimensions are part of the positive target contract. The returned answer block
also did not separately include evaluator identity, review date, or the bundle's independence
attestation, so those metadata must not be inferred after the fact.

The same round exposed a specific false-positive risk: the texture-only negative control received a
YES on “major form more modelled?” despite intentionally lacking lower-frequency modelling. Task-23
machine admission therefore also requires explicit low-frequency evidence showing that major-form
modelling survives thumbnail/downsample suppression of small texture/noise.

## 13. Recognition evaluation

For recognition measurements, prefer a blinded evaluator that receives the preview without the target
noun in its prompt. Record evaluator setup and confidence/answer rather than treating producer intent
as proof of recognizability.

Controller-observable recognition fields may include:

- `seconds_to_first_detected_visual_change`;
- `seconds_to_subject_recognizable`;
- `seconds_to_subject_and_style_recognizable`;
- `between_operation_gap_ms`;
- `reported_tool_execution_ms`;
- recognition-feature destruction counts.

These are observable controller timings, not proof that every millisecond can be uniquely attributed
to model reasoning, visual inspection, host transport or Photoshop.

## 14. Current implementation boundary

The repository/live baseline already covers deterministic COMPOSITION / OBJECT / MICRO selection,
whole-frame context, source-document crop coordinates, bounded same-operation read-only escalation,
exact evidence identity, recovery-safe review state and no mutation replay during evidence enrichment.

The stronger P0-V theory-to-runtime guarantees have also been implemented and archived as completed
roadmap work. Do not resurrect the older document's superseded “open P0-V gaps” list.

What still remains outside machine proof are specifically perceptual claims that the acceptance matrix
marks `human-required`, including the Task 23 blinded pack and other human artistic-preference gates.

## 15. Transferable learning

Persist generic observations such as:

- a preset/settings/scale signature produces periodic scallops;
- a brush is reliable for broad planar strokes but poor for silhouette repair;
- a batch size repeatedly approaches timeout on this Photoshop/runtime setup;
- a critic view at a particular scale exposes seams missed in the overview.

Do not persist scene-specific coordinates, successful tower/portrait/object geometry or other
task-specific execution traces as reusable painting knowledge.

## 16. Scope

Adaptive multiscale verification does not claim to make a model equivalent to a trained human artist,
nor that higher resolution always improves judgment. Failure modes include crop-induced context bias,
attention dilution, compression artifacts, ambiguous semantic regions, localization errors,
inconsistent repeated observations and inherently global questions that resist decomposition.

The broader proposition is narrower and testable:

> For stateful visual agents, perception should be treated as an active, provenance-bound evidence
> acquisition process rather than as a passive screenshot attached after tool execution.
