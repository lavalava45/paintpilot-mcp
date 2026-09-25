# Task: multiscale visual review and crop escalation in Photoshop Guard

## Goal

Implement a balanced multiscale visual-review policy for the canonical compact-v2 Photoshop Guard.

The Guard must stop treating every visual operation as if one overview frame were equally suitable
for composition, object-level structure and micro-detail. It must automatically choose the minimum
review level justified by the pass, preserve whole-frame context, and escalate to exact
document-space crops when a local finding cannot be judged reliably from the overview.

The implementation must remain on the canonical route:

```text
ChatGPT -> Chat On Steroids Plugins -> dist/cos-plugin.js
        -> embedded Guard -> internal ToolRegistry -> Photoshop
```

Do not add a second controller, daemon, proxy, image-generation route or new maintained Core workflow.
Do not use image_gen. Keep Photoshop visual evidence sourced from the existing UXP preview pipeline.

## Mandatory first steps

1. Read `AGENTS.md` in full before changing code.
2. Run `git status --short --branch` and inspect the current diff.
3. Preserve all unrelated in-progress work. At the time this task was written the worktree already had
   edits in:
   - `src/core/guard/session-store.ts`
   - `tests/embedded-guard.test.ts`
   - `tests/session-store-regressions.test.ts`
   These may change before execution; treat the live status as authoritative.
4. Read at minimum:
   - `docs/preview-pipeline.md`
   - `docs/photoshop-guard-architecture.md`
   - `docs/PAINTING-ROADMAP.md`
   - `src/core/guard/cycle.ts`
   - `src/core/guard/cycle-compiler.ts`
   - `src/core/guard/session-store.ts`
   - `src/core/visual-microplan.ts`
   - `src/core/guard/visual-significance.ts`
   - `src/tools/guard-tools.ts`
   - `src/tools/state-tools.ts`
   - the existing preview / compact-contract / recovery tests.

Do not rewrite existing documentation before checking project backup rules in `AGENTS.md`.

---

## Existing capabilities that must be reused

The repository already has most of the low-level primitives needed:

- `photoshop_get_preview` returns a whole-document MCP image block.
- It accepts a source-document `focus_region={left,top,right,bottom}`.
- It returns the focus crop as a second image block and keeps crop coordinates in source-document
  pixels.
- `focus_max_dimension_px` already supports up to 4096.
- `photoshop_guard_cycle_auto` already returns a `visual_review` package with exact SHA/path,
  canvas size and crop geometry.
- small/local/subtle-local VisualMicroPlans already require matching BEFORE/AFTER focus crops.
- the Guard already knows `scale`, `action_class`, `impact_class`, `region_bounds`,
  `significance_mode`, open visual problems and the exact current preview SHA.

This task is therefore a policy/state-machine improvement, not a new preview renderer.

---

## Core design

Introduce an explicit internal **visual review profile** with three levels:

### Level 1 — COMPOSITION

Purpose:

- whole-frame composition;
- subject read / recognition;
- focal hierarchy;
- global value and color balance;
- major depth relationships;
- large silhouette and negative-space balance.

Evidence:

- mandatory whole-frame after-preview;
- target long edge: 1600 px or native size when the document is smaller;
- no crop required unless an issue discovered during review triggers escalation.

Use by default for:

- `scale=global`;
- whole-canvas block-in;
- final whole-frame comparison;
- global value/composition problems.

### Level 2 — OBJECT

Purpose:

- readability of one semantic object or region;
- proportion;
- silhouette;
- contact/support;
- occlusion/depth order;
- transform placement;
- local value/color relationships;
- transition between the edited object and its surroundings.

Evidence:

- whole-frame overview remains mandatory;
- one exact document-space focus crop for the semantic region;
- focus target long edge: 1200 px;
- BEFORE/AFTER focus pair when the pass is local, corrective, subtle, destructive-looking, or when
  the current significance policy already requires a pair.

Use automatically for:

- `scale=medium` with usable `region_bounds`;
- `scale=small` or `scale=local`;
- `significance_mode=subtle_local`;
- transform/composite/isolate operations with a bounded semantic region;
- REPLACE/ERASE/cleanup operations where the transition perimeter must be inspected.

### Level 3 — MICRO

Purpose:

- edge quality;
- seams / halos / patch boundaries;
- tiny artifacts;
- feature-level anatomy or facial detail;
- text/signature legibility;
- repeated dabs/scallops;
- local texture;
- small color/value discontinuities;
- any issue too small to judge confidently in the object crop.

Evidence:

- whole-frame overview remains mandatory;
- an object-context crop remains available;
- one tighter exact document-space micro crop is delivered at native detail as far as possible;
- focus target long edge: 1600 px, without treating upscaling as new evidence;
- BEFORE/AFTER pair is mandatory for corrections whose success depends on edge/transition cleanup.

Use automatically for:

- `scale=detail` or `scale=micro`;
- structured findings classified as micro-detail;
- explicit uncertainty remaining after OBJECT evidence.

The level is a **minimum required review level**, not permission to omit the whole-frame overview.
Every visual verdict must remain grounded in the current whole-frame frame so local fixes cannot hide
global regressions.

---

## Review-profile resolver

Add a pure resolver, preferably in a small dedicated module, for example:

```text
resolveVisualReviewProfile(input) -> {
  level: 'composition' | 'object' | 'micro',
  whole_max_dimension_px,
  require_region,
  require_before_after,
  focus_max_dimension_px,
  reasons[]
}
```

Inputs should be derived from existing durable/compiled state rather than duplicated model prose:

- scale;
- significance_mode;
- action_class;
- impact_class;
- region_bounds presence;
- current/open problem scale;
- whether the operation is a final comparison;
- any structured post-preview finding requiring escalation.

The resolver must be deterministic and table-testable.

Minimum mapping:

| Condition | Minimum level |
| --- | --- |
| `scale=global` | COMPOSITION |
| `scale=medium` + region | OBJECT |
| `scale=small/local` | OBJECT |
| `scale=detail/micro` | MICRO |
| `significance_mode=subtle_local` | OBJECT |
| `action_class=REPLACE/ERASE` with region | OBJECT |
| `impact_class=edge/transition/cleanup` + detail-scale region | MICRO |
| structured micro finding | MICRO |
| unresolved local uncertainty after overview | at least OBJECT |
| unresolved uncertainty after OBJECT crop | MICRO when a tighter region is supplied |

Do not implement free-text keyword heuristics as the primary mechanism.

---

## Exact coordinate contract

All review regions must use **source Photoshop document pixel coordinates**, not preview coordinates.

Coordinate system:

- origin: document top-left;
- `left/right` increase to the right;
- `top/bottom` increase downward;
- bounds are `{left, top, right, bottom}`;
- `right > left`, `bottom > top`.

For every crop preserve both:

```json
{
  "requested_region": { "left": 420, "top": 180, "right": 760, "bottom": 520 },
  "effective_region": { "left": 390, "top": 150, "right": 790, "bottom": 550 }
}
```

`requested_region` is the exact semantic/problem box. `effective_region` is the actual crop after
Guard-added context padding and canvas-edge clamping.

Normalization rules:

1. reject non-finite bounds;
2. reject zero/negative area;
3. reject a requested box that does not intersect the current canvas;
4. normalize to integer pixel coverage deterministically: floor left/top, ceil right/bottom;
5. requested coordinates must remain traceable; never silently replace them with preview-space values;
6. only Guard-generated padding may be clamped to canvas bounds;
7. return canvas dimensions and `scale_x/scale_y` with every crop;
8. bind every crop to the current document id and current whole-frame SHA.

Suggested context padding:

- OBJECT: 12% of the requested box width/height, minimum 24 px per side;
- MICRO: 6%, minimum 12 px per side.

If implementation evidence shows a different simple padding rule is materially better, keep it
deterministic and document/test the chosen rule.

---

## Structured findings and crop escalation

The Guard must not infer exact crop coordinates from vague natural-language critique.

Add a **small structured finding surface** to compact visual closure. Keep it compact; do not revive
the removed full-operation schema.

Suggested form:

```json
{
  "review_findings": [
    {
      "kind": "edge_transition",
      "region_bounds": { "left": 420, "top": 180, "right": 760, "bottom": 520 },
      "review_level": "micro"
    }
  ]
}
```

Prefer deriving `review_level` from `kind`; it may be omitted from the public schema if the mapping
is fully deterministic.

Recommended finding classes:

### COMPOSITION findings — no crop required by class alone

- `composition_balance`
- `focal_hierarchy`
- `global_value_structure`
- `global_color_balance`
- `global_depth_read`
- `subject_recognition`

### OBJECT findings — exact region required

- `object_readability`
- `silhouette`
- `proportion`
- `contact_support`
- `occlusion_depth`
- `spatial_relation`
- `transform_placement`
- `local_value_color`

### MICRO findings — exact region required

- `edge_transition`
- `seam_halo`
- `patch_boundary`
- `hard_corner`
- `small_artifact`
- `feature_detail`
- `text_legibility`
- `signature_legibility`
- `repeated_dab_pattern`
- `texture_detail`
- `local_discontinuity`

Keep the list subject-agnostic. Do not create default hand/face/object-specific pipelines.

### Escalation rule

If a model submits a finding whose class requires OBJECT or MICRO evidence and the exact current
operation has not yet delivered adequate crop evidence for that region:

1. **do not close the visual verdict yet**;
2. **do not dispatch the next mutation**;
3. **do not replay the prior mutation**;
4. capture the required crop(s) read-only from the current unchanged document;
5. bind them to the same operation id, document id and current whole-frame SHA;
6. return the image content in the same preferred visual-review response path;
7. keep the previous operation pending visual closure;
8. instruct the caller to inspect the escalated crop and resubmit `previous_observation` for the
   **same** `previous_operation_id`.

This is a read-only review escalation, not a new artistic operation.

The normal one-call closure remains unchanged when the initial review package already contains all
evidence required by the resolved profile.

---

## Crop selection before the first verdict

Where the mutation already declares a bounded region, prefetch the appropriate crop so avoidable
extra round trips are not introduced.

Rules:

1. COMPOSITION:
   - overview only.
2. OBJECT:
   - overview + focus crop of `next_pass.region_bounds`;
   - BEFORE/AFTER when required by existing local/significance rules or corrective action class.
3. MICRO:
   - overview + object-context crop;
   - if `region_bounds` is already a tight detail box, it may serve as the micro crop;
   - otherwise return a deterministic tighter crop only when a tighter exact region is known.

Do not invent a tight region from the center of a larger box. If a true micro-region is not known,
return OBJECT evidence first and let structured post-preview findings request the exact tighter box.

---

## Multiple findings and bounded review cost

Avoid turning every pass into an unbounded crop fan-out.

Policy:

- maximum two newly captured escalation crops per review round;
- stable priority order:
  1. must-fix severity;
  2. micro issue blocking acceptance;
  3. object issue blocking acceptance;
  4. optional findings;
- deduplicate substantially overlapping requested regions;
- if more findings remain, return them as pending review requirements and request another read-only
  review round; never silently drop them.

No new visual mutation may start while a required review escalation for the previous operation is
pending.

---

## Evidence and anti-false-proof requirements

The implementation must preserve the distinction between:

1. a materialized preview path existing;
2. an MCP image content block being returned to the model;
3. the model making a visual judgment from that evidence.

Requirements:

- the Guard may record which exact image bytes were **delivered for review** (SHA, role, crop region,
  content order), but must not claim that delivery proves correct interpretation;
- a file path/SHA alone must never be treated as model visual inspection;
- crop evidence must be stale if the current whole-frame SHA changes;
- crop evidence from a different document id is invalid;
- recovery may expose the same materialized paths/SHA, but must not replay the mutation;
- status/resume must preserve any pending review level and exact requested/effective crop regions.

If a dedicated field is added for delivery provenance, use wording such as
`image_delivered_for_review`, not `image_seen` or `image_understood`.

---

## Interaction with existing visual significance

Do not conflate two different questions:

- **visual significance**: did Photoshop pixels materially change?
- **visual review level**: at what spatial scale can the artistic result be judged reliably?

`visual-significance.ts` may continue to compare whole/focus BEFORE/AFTER pixels.
The new review-profile logic decides which evidence is required for human/model artistic judgment.

For subtle local changes:

- matching BEFORE/AFTER focus remains mandatory;
- the new policy may increase the review level, never weaken existing significance evidence.

---

## Compact-v2 compatibility

Preserve the compact mental model:

```text
next_pass
-> mutation
-> visual_review
-> previous_operation_id + previous_observation
-> optional next_pass
```

The only allowed extra turn is a **read-only evidence escalation** when the first visual review
cannot legitimately support the submitted local/micro finding.

Do not reintroduce:

- public receipt-token copying;
- standalone report/ack/verdict tools;
- legacy `next_operation`;
- a large model-authored operation payload;
- a second state store.

If adding `review_findings` changes the public compact-v2 schema incompatibly, explicitly decide
whether the change is additive under the current revision or requires a protocol revision. Add a
contract regression test for that decision and update capability reporting/documentation.

---

## Implementation guidance

Prefer small separable pieces:

1. pure review-profile resolver;
2. pure region normalize/pad/deduplicate helpers;
3. durable pending-review requirement in the existing Guard/session state;
4. cycle-envelope support for multiple review images/roles;
5. read-only escalation capture path;
6. compact observation normalization for structured findings;
7. recovery/status projection.

Likely files to inspect/change include, but are not limited to:

- `src/core/guard/cycle.ts`
- `src/core/guard/cycle-compiler.ts`
- `src/core/guard/session-store.ts`
- `src/core/guard/runtime.ts`
- `src/core/visual-microplan.ts`
- `src/tools/guard-tools.ts`
- `src/tools/state-tools.ts`
- `src/core/guard/guard-capabilities.ts`

Do not force changes into all of them if a smaller implementation is sufficient.

---

## Required automated tests

Add focused tests rather than one monolithic integration test.

### A. Review-profile table tests

Create a new test file if useful, e.g. `tests/visual-review-profile.test.ts`.

Cover at least:

1. global -> COMPOSITION;
2. medium + region -> OBJECT;
3. small/local -> OBJECT;
4. detail/micro -> MICRO;
5. subtle_local -> at least OBJECT;
6. REPLACE/ERASE with bounded region -> OBJECT and BEFORE/AFTER when appropriate;
7. edge/transition cleanup at detail scale -> MICRO;
8. a micro structured finding upgrades OBJECT -> MICRO;
9. no unrelated condition accidentally upgrades every pass to MICRO.

### B. Coordinate tests

Cover:

- exact source-document coordinate preservation;
- integer normalization;
- deterministic padding;
- padding clamp at each canvas edge;
- invalid/empty/outside bounds rejected;
- requested and effective regions both returned;
- preview scaling does not alter source-document coordinates;
- same requested region remains stable across differently sized overview previews.

### C. Compiler tests

Extend `compact-contract-regressions.test.ts` / compiler tests as appropriate:

- COMPOSITION does not inject unnecessary focus work;
- OBJECT injects the correct focus region;
- existing small/local matching BEFORE/AFTER behavior remains intact;
- MICRO uses the intended review profile;
- no crop is guessed when no exact region is known.

### D. Visual review delivery tests

Extend cycle/envelope tests:

- whole-frame image is always first-class evidence;
- object crop is returned with role and exact region;
- micro crop can coexist with whole/object evidence;
- SHAs and document id are attached to every evidence frame;
- preferred content order is deterministic;
- materialized path without delivered image is never labeled as proof of visual interpretation.

### E. Escalation state-machine tests

Critical cases:

1. operation returns overview only;
2. model reports an OBJECT finding with exact bounds;
3. Guard refuses to close, performs read-only crop capture and returns same operation pending review;
4. **zero new mutation dispatches** occur during escalation;
5. second observation after crop closes the original operation;
6. a next mutation is blocked until closure;
7. duplicate/replayed observation does not duplicate mutation;
8. multiple findings are bounded/deduplicated deterministically.

### F. Stale/mismatched evidence tests

- crop from wrong document rejected;
- crop bound to old whole-frame SHA rejected after document changes;
- changed requested region requires fresh evidence;
- recovery does not silently reuse stale crop evidence.

### G. Recovery tests

Extend recovery/status tests:

- restart while an OBJECT/MICRO review escalation is pending;
- `photoshop_guard_status` / `photoshop_guard_resume` expose:
  - same operation id;
  - required review level;
  - requested/effective regions;
  - exact whole/crop SHA/path;
- continuation closes from recovered evidence without replaying the artistic mutation.

### H. Regression tests

Explicitly prove:

- existing global composition passes still work without mandatory crops;
- existing local VisualMicroPlan significance tests still pass;
- existing preview barrier semantics remain exact;
- existing anchor/rollback/final comparison paths do not lose whole-frame SHA identity;
- no public raw mutation bypass is introduced;
- no extra Photoshop foreground stealing is introduced by preview capture.

---

## Required live smoke test

After unit/integration tests pass, run a minimal live Photoshop smoke test through
**Chat On Steroids Plugins -> Photoshop**.

Preflight:

- `photoshop_ping`;
- `photoshop_guard_capabilities`;
- verify current bridge/protocol readiness;
- pin the active document id.

Live scenarios:

1. COMPOSITION review:
   - perform or reuse one safe whole-frame visual pass;
   - verify overview delivery and no unnecessary crop.
2. OBJECT review:
   - use a bounded region with exact document coordinates;
   - verify overview + crop, crop metadata and document-space region.
3. Escalation:
   - after overview, submit a structured local finding whose crop was not pre-delivered;
   - verify Guard returns read-only crop evidence for the same pending operation;
   - verify Photoshop history shows **no second mutation**.
4. If safe and practical, MICRO review:
   - request a tighter region;
   - verify the tighter crop is delivered and bound to the same current whole-frame SHA.

Record actual dimensions, source coordinates, SHA identities and mutation/history evidence in the
task report. Do not weaken the acceptance if live Photoshop is unavailable: report the live-only
blocker explicitly and leave the code gate separated from the live gate.

---

## Suggested validation commands

Use the repository's actual package scripts after inspecting `package.json`. At minimum run the
equivalent of:

```powershell
npm test -- tests/visual-review-profile.test.ts
npm test -- tests/compact-contract-regressions.test.ts
npm test -- tests/embedded-guard.test.ts
npm test -- tests/session-store-regressions.test.ts
npm test -- tests/recovery-state-machine.test.ts
npm test -- tests/state-preview.test.ts
npm test -- tests/preview-barriers.test.ts
npm run build:server
git diff --check
```

If the repository uses a different targeted-test invocation, use the canonical local command and
record exactly what ran.

---

## Acceptance criteria

The task is complete only when all of the following are true:

1. Guard has a deterministic three-level review policy: COMPOSITION / OBJECT / MICRO.
2. Every level preserves whole-frame context.
3. Pass scale/action/significance automatically chooses a minimum review level.
4. Local/micro findings can request exact source-document crop coordinates.
5. Required crop evidence blocks verdict closure and any next mutation until delivered/reviewed.
6. Escalation is read-only and never replays the artistic mutation.
7. Requested/effective crop coordinates, SHA, document id and scale metadata are durable and
   recovery-safe.
8. Existing local BEFORE/AFTER significance guarantees are preserved or strengthened.
9. Global passes do not pay mandatory micro-review cost.
10. No free-text keyword heuristic is the authoritative crop selector.
11. No new legacy controller/Core production dependency is added.
12. Unit/integration tests pass.
13. Live smoke test passes, or a precise live-only blocker is documented.

---

## Mandatory documentation and Git closeout

Do not stop after code/tests.

### Documentation

Update all documentation affected by the actual implementation, at minimum:

- `docs/preview-pipeline.md` — document review levels, source-coordinate crops and escalation flow;
- `docs/photoshop-guard-architecture.md` — document Guard ownership of multiscale evidence and
  read-only review escalation;
- `docs/PAINTING-ROADMAP.md` — add/update the corresponding roadmap item and its code/live
  acceptance status;
- `CHANGELOG.md` — record the implemented behavior and tests.

If public compact schema/capabilities change, also update the relevant contract/capability docs and
acceptance matrix.

### Git

Before committing:

1. inspect `git status --short --branch`;
2. inspect the complete `git diff`;
3. run `git diff --check`;
4. ensure unrelated pre-existing work is not staged or overwritten;
5. stage only this task's intended files/hunks.

Create one clean commit for this implementation with a descriptive message, for example:

```text
feat(guard): add multiscale visual review and crop escalation
```

Report:

- commit hash;
- final branch/status;
- files changed;
- tests/build executed and results;
- live smoke result;
- any remaining live-only or human-review gaps.

Do not claim the task complete while code changes remain uncommitted. Do not push/merge unrelated
pre-existing work merely to obtain a clean branch; preserve it and report its status separately.
