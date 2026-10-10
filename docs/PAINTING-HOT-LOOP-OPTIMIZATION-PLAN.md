# PaintPilot hot-loop optimization plan

**Historical technical reference — 2026-10-04.** E.8d implemented the engineering foundation below;
P0-A…P0-H and the proposed new modules are not a fresh implementation backlog. Use the
[current Roadmap](PAINTING-ROADMAP.md) for remaining hardening, coding order and acceptance.
The 2026-10-02 engineering gate does not close total painting time or artistic quality: its live run exercised
zero automatic repairs/splits, and the exact review-to-intent interval remained unknown. Preserve the
[benchmark evidence](hotloop-final5-20261002-benchmark.md); E.8 owns fresh quality/time and repair/split live proof.

## Purpose

This historical implementation brief records the work on two dominant latency classes exposed by the
2026-10-02 rainy-tram-stop live benchmark:

1. excessive latency between a completed visual review and a dispatch-ready next pass;
2. deterministic Guard preflight rejection / recovery churn that produces many model-visible round trips
   without Photoshop mutations.

The work preserves Guard safety, visual review, no-replay behavior,
document-incarnation binding, checkpointing, or artistic-quality gates.

The intended end state is:

```text
review image
  -> artistic decision
  -> compact PaintingIntent
  -> deterministic compiler
  -> durable-state injection
  -> local validation
  -> deterministic auto-repair when safe
  -> Guard dispatch
  -> Photoshop
```

The model should own the artistic decision. Repository code should own deterministic protocol construction.

---

## Benchmark evidence that motivates this work

Run:

```text
processes/rainy-tram-stop-process/benchmark-01
```

The run completed eight meaningful visual passes and a final PSD save.

Observed high-level results:

- total wall clock from create-document dispatch to final save: about 35m55s;
- observed Photoshop dispatch time for the artistic run: about 14.7s;
- observed Guard bookkeeping/preflight time: about 41.3s;
- 41 model-visible Guard round trips;
- 9 semantic dispatch round trips;
- 8 semantic artistic actions actually dispatched;
- 16 rejected-before-dispatch round trips;
- 15 recovery-only round trips;
- 1 bookkeeping-only round trip;
- artistic actions per model-visible Guard round trip: 0.195.

Continuation markers showed:

- review-image service itself: 0-1ms server-side in the measured samples;
- visual review median: about 13s;
- `review_finished -> next_pass_ready` median: about 58s;
- two large `Guard response -> review-image request` stalls were about 104s and 115s.

The benchmark therefore does **not** justify optimizing Photoshop execution or JPEG delivery first.
The primary optimization target is orchestration between artistic review and dispatch.

The run also demonstrated that the current documented payload-only correction rule is not sufficient by
itself: model-visible rejection/recovery churn still dominates many passes.

---

## Non-negotiable invariants

Every implementation slice below must preserve these invariants.

1. A mutation that may have been dispatched is never replayed merely because a host response was lost.
2. A true uncertain/dispatched operation still enters evidence-based reconcile/recovery.
3. A deterministic preflight rejection with
   `visual_mutation_started=false` is **not** an uncertainty/recovery event.
4. The visual-review barrier remains mandatory after a real visual mutation.
5. The current document/incarnation remains pinned and verified.
6. Guard remains fail-closed for genuinely ambiguous or unsafe semantic decisions.
7. Durable ownership, geometry, lighting, camera, material, checkpoint and planner contracts remain authoritative.
8. No optimization may silently relax a required artistic or structural field merely to make a request pass.
9. Diagnostic timing markers remain benchmark-only; they must not become required production round trips.
10. The model-facing contract must stay compact. Do not solve this by exposing larger schemas or dumping more
    durable state into chat.

---

# Target architecture

## Current failure shape

Today the model frequently performs two jobs at once:

1. decide what should happen artistically;
2. reconstruct enough of the Guard protocol to express that decision.

That means a normal continuation can require the model to recover or restate:

- current stage and scale;
- semantic owner and physical layer;
- scene-geometry revision and owner binding;
- material/construction role;
- brush role and preset;
- protected layers;
- planner directive/task ids;
- action/method metadata;
- mutation-budget constraints;
- current problem identity;
- rollback/editability policy.

This is both slow and error-prone.

## Desired separation

Introduce a stable intermediate representation:

```text
Model / Art Director
        |
        v
PaintingIntent
        |
        v
NextPassCompiler
        |
        +--> compactPassContext(document)
        +--> owner bindings
        +--> active planner task
        +--> brush preflight
        +--> geometry / material / camera context
        +--> mutation budget
        |
        v
compiled next_pass
        |
        v
local Guard validation
        |
        +--> safe deterministic auto-repair
        |
        v
photoshop_guard_cycle_auto
```

The model should not repeatedly synthesize fields that can be derived uniquely from durable state.

---

# P0-A — Introduce a compact PaintingIntent IR

## Goal

Represent the model's next artistic decision using only fields that genuinely require artistic judgment.

## Proposed minimum shape

Start deliberately small:

```ts
type PaintingIntent = {
  request_key: string;
  problem_id: string;
  document_id: number;

  goal: string;
  target_owner_id?: string;
  region?: string;
  region_bounds?: Bounds;

  action: 'add' | 'refine' | 'replace' | 'erase' | 'rollback';
  scale?: 'global' | 'medium' | 'small' | 'detail' | 'local' | 'micro';

  visual_intent:
    | 'mass'
    | 'painted-mass'
    | 'planar-mass'
    | 'broken-mass'
    | 'atmospheric-mass'
    | 'directional-mass'
    | 'surface-flow'
    | 'soft-transition'
    | 'hard-edge'
    | 'lost-edge'
    | 'texture'
    | 'light-sculpt'
    | 'tonal-contrast'
    | 'remove-distraction'
    | 'move-scale-rotate';

  material_role?: string;
  preferred_method_id?: string;
  preferred_brush_role?: string;

  preserve?: string[];
  addresses_primary_mismatch?: boolean;
};
```

Do **not** put durable protocol data into this IR unless the value is genuinely an artistic choice.

In particular, the model should normally not have to provide:

- physical `layer_id`;
- current planner directive/task ids;
- scene geometry revision;
- geometry binding boilerplate;
- current camera/lighting revision;
- current stage when it is unchanged;
- current brush preflight details;
- protected layer ids derivable from ownership;
- rollback boilerplate;
- default verification-envelope fields;
- preview size/quality;
- current document-incarnation token;
- adaptive mutation budget.

## Compatibility

Do not immediately delete the existing `next_pass` API.

Implement PaintingIntent first as an internal/compiler input or as an optional compact extension. Existing
explicit `next_pass` callers must continue to work during migration.

## Acceptance criteria

- a healthy continuation pass can be expressed with substantially fewer model-authored fields;
- compiler output remains a valid existing Guard `next_pass`/VisualMicroPlan contract;
- no Guard safety contract is bypassed;
- missing values that are not uniquely derivable still fail closed with a semantic request for the model.

---

# P0-B — Build a deterministic NextPassCompiler

## Goal

Compile `PaintingIntent` plus durable state into the current full compact Guard pass.

## Suggested module boundary

Add a dedicated module rather than continuing to grow `cycle-compiler.ts`, for example:

```text
src/core/guard/painting-intent.ts
src/core/guard/next-pass-compiler.ts
```

`cycle-compiler.ts` should remain the authoritative Guard validator/compiler for the final contract.
The new compiler sits immediately before it and produces that contract.

## Inputs

The compiler should receive:

- PaintingIntent;
- `store.compactPassContext(document_id)`;
- semantic owner bindings;
- current Art Director task/directive if present;
- brush preflight roles;
- scene geometry/lighting/camera models;
- current active problem/backlog;
- capability/method registry.

## Derivations

Implement explicit deterministic derivation functions rather than one large heuristic function.

Recommended helpers:

```text
resolveIntentStage()
resolveIntentScale()
resolveTargetOwner()
resolvePhysicalLayer()
resolveActionClass()
resolveLayerSeparationContract()
resolveGeometryBinding()
resolveMaterialContract()
resolveBrushRole()
resolveProtectionSet()
resolvePlannerBinding()
resolveVerificationProfile()
resolveMutationBudget()
compileIntentActions()
```

Each helper must distinguish:

- uniquely derivable;
- defaultable by an existing documented rule;
- ambiguous and requiring model input.

Never silently guess in the third case.

## Ownership / layer resolution

If `target_owner_id` identifies exactly one durable semantic owner:

- inject its current authoritative physical layer id;
- inject its rollback/editability metadata;
- preserve its current construction revision unless the intent explicitly performs structural reconstruction;
- derive protected sibling owners according to the existing ownership plan.

If the owner is missing or ambiguous, return a semantic compiler error instead of a low-level Guard schema error.

## Stage / scale resolution

If the model does not request a stage change:

- inherit current durable stage;
- inherit current scale when compatible with the intent;
- do not make the model restate these fields every pass.

Only require explicit stage-reset authority when existing Guard rules already require it.

## Planner binding

When one current planner task exists, inject:

- `planner_directive_id`;
- `planner_task_id`;
- bounded painter scope / affected-domain defaults.

The model should name a different task only when changing the active task is itself the artistic decision.

## Brush selection

When a preferred brush role is specified, resolve it against durable brush preflight.

When it is omitted:

- derive the best compatible role only if there is exactly one unambiguous role for
  `material_role + visual_intent + scale`;
- otherwise return a compact semantic ambiguity to the model.

Do not fabricate brush evidence.

## Acceptance criteria

- repeated stable fields disappear from normal model-authored next-pass payloads;
- compiler output is deterministic for identical PaintingIntent + durable state;
- compiler has unit tests for every derived contract family;
- compiler errors are phrased in artistic/semantic terms where possible.

---

# P0-C — Make deterministic preflight errors auto-repairable

## Goal

Prevent field-level, schema-shape and bounded-budget errors from causing a full model-visible
rejection/recovery cycle when the correction is unique and safe.

## Error taxonomy

Introduce an explicit classification attached to each compile violation:

```ts
type ViolationRepairClass =
  | 'AUTO_NORMALIZE'
  | 'AUTO_PATCH'
  | 'SPLIT_DEFER'
  | 'MODEL_SEMANTIC_DECISION'
  | 'SYSTEMIC_FAILURE';
```

Every violation that participates in the hot path should declare its class.

### AUTO_NORMALIZE

No semantic choice is involved.

Examples:

- canonical field shape conversion;
- inherited document id where the operation is already pinned;
- inherited current stage/scale;
- planner ids from the active durable task;
- geometry revision / binding metadata already uniquely established;
- current physical layer id for a known semantic owner;
- preview/verification defaults;
- action enum normalization.

The request should not be rejected. Record a normalization and continue.

### AUTO_PATCH

The request is invalid as written but has exactly one safe bounded correction.

Examples:

- a required derived field was omitted but exists uniquely in durable state;
- a canonical geometry substructure can be mechanically materialized from an already explicit model;
- one contract field is stale but the current authoritative binding is unambiguous.

Apply the patch, rerun validation locally, and only expose the repair in compact diagnostics.

### SPLIT_DEFER

The artistic request is sound but exceeds an execution envelope.

Primary example:

- adaptive mutation budget allows N mutations and the intent compiled to N+K compatible mutations.

Do **not** blindly split arbitrary destructive or causally coupled actions.

Safe automatic split requires all of:

- no mutation has started;
- operations are ordered and independently valid;
- split preserves semantic meaning;
- first chunk can be visually reviewed before deferred chunk;
- no later action is required to make the first chunk safe/valid;
- rollback semantics remain well-defined.

When safe:

1. dispatch the first bounded chunk;
2. persist the deferred continuation as a compiler-owned pending sub-pass;
3. after review, only continue the deferred chunk if the artistic observation still supports it.

When these conditions are not met, classify as `MODEL_SEMANTIC_DECISION`.

### MODEL_SEMANTIC_DECISION

Return to the model only when there is a real artistic/structural choice.

Examples:

- which owner should own a new effect;
- whether a geometry revision is intentional;
- whether to replace or refine a protected owner;
- multiple equally valid brush/method choices with materially different visible outcomes;
- a material or causal relation cannot be inferred from established state.

### SYSTEMIC_FAILURE

Use for implementation/runtime faults, not malformed artistic payloads.

Examples:

- contradictory durable state;
- current authoritative owner maps to missing physical layers;
- validator/compiler invariant failure;
- tool registry inconsistency.

These may justify bounded diagnostics.

---

# P0-D — Add an internal compile/validate/repair loop

## Goal

Make one model decision normally produce one Guard dispatch.

## Required control flow

```text
PaintingIntent
  -> compile
  -> validate
       |
       +-- valid ------------------------------> dispatch
       |
       +-- AUTO_NORMALIZE/AUTO_PATCH
              -> apply patch
              -> validate again
              -> dispatch if valid
       |
       +-- SPLIT_DEFER
              -> bounded split
              -> validate first chunk
              -> dispatch
       |
       +-- MODEL_SEMANTIC_DECISION
              -> return compact ambiguity to model
       |
       +-- SYSTEMIC_FAILURE
              -> return bounded diagnostic failure
```

## Retry bound

The automatic repair loop must be finite.

Recommended default:

- compile attempt 1;
- at most one aggregate deterministic repair pass;
- validation attempt 2;
- if the same deterministic violation fingerprint remains, stop and surface it as a systemic/compiler defect.

Do not enter an unbounded auto-retry loop.

## Fingerprinting

Reuse or extend current cycle/rejection fingerprints.

Persist:

- original intent fingerprint;
- first compiled payload fingerprint;
- repair list;
- repaired payload fingerprint;
- final validation result.

This makes automatic repair auditable without model-visible chatter.

## Acceptance criteria

- deterministic preflight errors do not create multiple model-visible turns;
- repeated identical repair failure is surfaced once with a stable fingerprint;
- no mutation is dispatched twice;
- all applied repairs are present in the operation journal.

---

# P0-E — Eliminate recovery after never-dispatched preflight rejection

## Goal

Codify in runtime behavior what AGENTS.md already states.

If:

```text
execution = not-executed
next_operation_dispatched = false
visual_mutation_started = false
```

then this is a compile/preflight failure, **not** recovery.

## Required changes

1. Ensure status/resume does not advertise a recovery action for this state.
2. Ensure the host-facing result names the next action as correction/resubmission only.
3. Do not create recovery-only throughput events for a payload correction.
4. Preserve the same semantic problem/request lineage while generating a fresh idempotency key for a genuinely
   new execution attempt where required.
5. Never request a fresh Photoshop state/preview solely because a preflight request was rejected before dispatch.

## Regression test

Create a test:

```text
invalid deterministic next_pass
  -> reject before dispatch
  -> corrected payload
  -> successful dispatch
```

Assert:

- zero reconcile calls;
- zero recovery-only events;
- zero extra preview/state reads;
- exactly one Photoshop visual mutation;
- original rejection and correction remain durably auditable.

---

# P0-F — Convert compact_correction_recipe from guidance into machine-readable repair data

## Current problem

`compact_correction_recipe` currently tells the model to correct and resubmit, but it does not supply enough
machine-readable repair information for a local repair engine.

## Proposed extension

Keep the existing human-readable fields for compatibility, but add structured repair operations:

```json
{
  "compact_correction_recipe": {
    "repeat_same_semantic_cycle": true,
    "photoshop_mutation_started": false,
    "repairs": [
      {
        "kind": "inject_from_context",
        "path": "next_pass.logical_layer.layer_id",
        "source": "owner:pavilion-owner.current_layer_id"
      },
      {
        "kind": "normalize",
        "path": "next_pass.scene_geometry_model.projection.horizon",
        "normalizer": "horizon_line_from_canvas_width"
      }
    ]
  }
}
```

Alternative implementation: keep repair instructions internal and expose only a compact summary. The important
requirement is that the repair executor must not have to parse English validation messages.

## Safety rule

No repair operation may invent an artistic choice. A repair must identify a deterministic source or a
documented normalization function.

---

# P0-G — Precompute the next artistic candidate set

## Goal

Reduce `review_finished -> next_pass_ready` by making post-review planning a selection/adaptation task rather
than full regeneration.

## Planner behavior

At each Art Director review, persist a short ranked/ordered task queue, as already supported by the directive
model.

Before the next visual review completes, the runtime should be able to project a compact candidate set such as:

```text
candidate A: continue current task, same owner/method family
candidate B: next queued planner task
candidate C: corrective branch if current target remains unresolved
```

Do not pre-author actual Photoshop actions before seeing the visual result. Precompute only the stable semantic
skeleton:

- problem/task id;
- owner;
- intended scale;
- allowed change domains;
- allowed method family;
- protected qualities;
- stage.

After review, the model should usually need to choose/adapt one candidate:

```text
select A
```

or:

```text
select A, but change goal to strengthen roof-plane perspective before material work
```

The compiler then produces the full pass.

## Avoid over-constraining the artist

The candidate set is an optimization hint, not a forced finite-state art recipe.

If the review reveals a new must-fix defect, the model may create a new PaintingIntent outside the queue.

---

# P0-H — Add a compact continuation packet optimized for model use

## Goal

After `review_finished`, give the model only the state needed to make the next artistic decision.

## Proposed projection

Add a method similar to `compactPassContext`, but explicitly shaped for artistic continuation:

```ts
type ArtisticContinuationContext = {
  document_id: number;
  current_stage?: string;
  active_scale?: string;
  current_problem?: {
    problem_id: string;
    scale?: string;
    severity?: string;
  };
  owners: Array<{
    owner_id: string;
    role?: string;
    layer_id?: number;
  }>;
  current_task?: {
    directive_id?: string;
    task_id?: string;
    summary?: string;
    allowed_scales?: string[];
    allowed_global_changes?: string[];
  };
  next_candidates?: PaintingIntentSkeleton[];
  protected_qualities?: string[];
};
```

Do not include large brush evidence, full scene models, journal history or full schemas unless the next decision
actually needs them.

This context should be cheap to compute and stable across the hot loop.

---

# P1-A — Move more current compile-time defaults into durable-state injection

Audit `compileCompactPass()` and `compileNextOperation()` for fields that are repeatedly required from the
model despite already existing in `compactPassContext()`.

Create a table in code/tests documenting for each field:

```text
field
source of truth
derivation rule
when model must override
when ambiguity must fail closed
```

Priority candidates:

- stage;
- scale;
- planner ids;
- owner layer id;
- logical owner metadata;
- geometry binding;
- attention/camera binding when unchanged;
- brush role;
- protected sibling layers;
- verification profile;
- material role when already fixed by active planner task/owner;
- action class for simple continue/refine operations.

The objective is not "default everything." The objective is "do not ask the model for facts the runtime
already authoritatively knows."

---

# P1-B — Mutation-budget-aware action compilation

## Problem

The model currently can construct a visually sensible pass that is rejected only because the compiled action
count exceeds the adaptive mutation budget.

## Fix

Move budget awareness earlier into action compilation.

Before finalizing the action list:

1. compute effective risk/scale/protection budget;
2. ask the action compiler to fit within that budget;
3. merge compatible same-tool work where semantics permit;
4. otherwise produce a safe split plan.

Examples of safe consolidation:

- several same-layer brush strokes in one `photoshop_paint_strokes` batch;
- multiple compatible closed color regions in one `photoshop_paint_regions` call;
- many compatible dabs in one `photoshop_paint_dabs` call.

Do not merge actions merely to reduce count when doing so harms rollback, semantic ownership or reviewability.

## Acceptance

The adaptive budget should normally be a compiler constraint, not a late Guard rejection.

---

# P1-C — Semantic compiler errors instead of low-level schema errors

When the compiler cannot derive a required choice, return a compact error that directly names the artistic
decision needed.

Bad:

```text
geometry_binding.owner_id must be a non-empty string
```

Preferred:

```text
Cannot bind this structural pass: no unique semantic owner is selected.
Choose one of: pavilion-owner, base-environment-owner.
```

Bad:

```text
construction_role_material_role_required
```

Preferred:

```text
This is a new structured material-bearing mass and its material role is not established.
Specify the material role, or target an existing owner whose role is already durable.
```

Keep the exact machine error code in diagnostics, but optimize model-visible text for one-turn correction.

---

# P1-D — Instrument compiler and repair latency separately

Extend telemetry with:

- `painting_intent_compile_ms`;
- `durable_state_injection_ms`;
- `local_validation_ms`;
- `auto_repair_ms`;
- `auto_repair_count`;
- `auto_split_count`;
- `model_semantic_ambiguity_count`;
- `preflight_rejection_exposed_to_model_count`.

Also persist per-pass:

```text
intent_received_at
compiled_at
validated_at
repaired_at
dispatch_started_at
```

The benchmark must continue to distinguish server-observed timing from model/host time.

Do not label the remaining interval "model reasoning time."

---

# P1-E — Add a benchmark summary specifically for hot-loop efficiency

Extend or add to `scripts/dev/benchmark-painting-cycles.mjs` a run-scoped summary:

```text
pass
review delivery
visual review
artistic decision
intent compile
auto repair
ready -> dispatch
Guard
Photoshop
semantic wall
model-visible rejection count
recovery-only count
```

Aggregate metrics:

- median visual review;
- median review_finished -> PaintingIntent ready;
- median PaintingIntent -> dispatch;
- model-visible Guard round trips per artistic mutation;
- rejected-before-dispatch round trips;
- recovery-only round trips;
- percent of deterministic violations repaired locally;
- Photoshop share of wall clock;
- largest stall.

This benchmark should accept an operation-id prefix or process directory so one run can be evaluated without
mixing historical data.

---

# Tests required before live acceptance

## Unit tests — PaintingIntent compiler

Add focused tests covering:

1. existing owner refinement with inherited stage/scale/layer;
2. new owner creation where the model must provide a real semantic role;
3. current planner task injection;
4. geometry binding inheritance;
5. protected sibling layer derivation;
6. brush-role resolution from one compatible preflight role;
7. ambiguous brush role -> model semantic decision;
8. material-stage requirements;
9. rollback/replace behavior;
10. deterministic output for identical state + intent.

## Unit tests — repair classifier

For representative violations assert the intended repair class.

Minimum cases:

- missing derivable layer id -> AUTO_PATCH;
- canonical shape normalization -> AUTO_NORMALIZE;
- mutation budget overflow with safe independent actions -> SPLIT_DEFER;
- mutation budget overflow with causally inseparable actions -> MODEL_SEMANTIC_DECISION;
- ambiguous semantic owner -> MODEL_SEMANTIC_DECISION;
- contradictory durable owner state -> SYSTEMIC_FAILURE.

## Integration tests — no recovery on not-executed rejection

Assert the complete correction flow and throughput accounting.

## Integration tests — one decision / one dispatch

Simulate a normal sequence:

```text
review accepted
-> PaintingIntent
-> compiled pass
-> dispatch
-> review
```

Assert no intermediate:

- status;
- get_state;
- list_documents;
- schema inspection;
- recovery;
- extra preview;
- model-visible preflight rejection.

## Regression tests

Keep all existing safety tests green, especially:

- no replay after uncertain dispatch;
- accepted-anchor restore;
- scene geometry binding;
- physical-effect completion debt;
- protected-layer behavior;
- material-response enforcement;
- adaptive mutation budget;
- visual-review barrier;
- checkpoint barrier;
- document incarnation reset.

---

# Implementation sequence

## Slice 1 — Measurements and fixtures

1. Preserve the rainy-tram benchmark artifacts as current evidence.
2. Add a run-scoped benchmark command/output path.
3. Add test fixtures reproducing at least the first-pass and later-pass deterministic rejection shapes seen
   in the run.

Exit condition:

- current bad behavior is reproducible in tests and benchmark output.

## Slice 2 — PaintingIntent + compiler skeleton

1. Define the IR.
2. Implement compilation for the simplest common case: refine existing owner.
3. Inject stage, scale, owner layer and planner ids.
4. Feed the result into the existing `cycle-compiler.ts`.

Exit condition:

- an existing-owner refinement no longer requires the model to restate those fields.

## Slice 3 — deterministic repair engine

1. Add repair classes.
2. Add one bounded repair pass.
3. Persist repair audit data.
4. Ensure no recovery event is emitted.

Exit condition:

- representative deterministic rejection is repaired and dispatched without model-visible retry.

## Slice 4 — geometry / material / protection derivation

Add the higher-value fields that caused live benchmark rejections:

- geometry binding;
- material role where uniquely established;
- protection set;
- layer-separation defaults for continuation;
- canonical geometry normalization.

Exit condition:

- first-pass and mid-run benchmark fixtures compile without the historical field-level rejections.

## Slice 5 — mutation-budget-aware compilation

1. compute budget before final action emission;
2. consolidate compatible batchable Photoshop calls;
3. safely split/defer where allowed.

Exit condition:

- adaptive budget overflow is normally prevented before Guard rejection.

## Slice 6 — continuation candidate projection

1. project the active task and next candidates;
2. keep candidate skeletons compact;
3. let review select/adapt the next candidate.

Exit condition:

- post-review next-pass construction no longer requires rebuilding the entire operation contract.

## Slice 7 — production guidance cleanup

After code owns these behaviors:

- simplify host guidance;
- remove instructions that make the model manually perform work now guaranteed by the compiler;
- retain explicit guidance for semantic ambiguity and true recovery only.

Do not leave conflicting old instructions that encourage manual schema reconstruction.

## Slice 8 — live acceptance

Run a fresh from-scratch artwork benchmark of comparable complexity.

Do not reuse the completed rainy-tram frame as the performance comparison starting state.

---

# Live acceptance targets

These are engineering targets, not claims that every pass will meet them.

For a healthy run of 5-8 meaningful passes:

| Metric | 2026-10-02 benchmark | Target |
|---|---:|---:|
| visual review median | ~13s | <=15s, no regression |
| review_finished -> next artistic intent ready | ~58s | <=10-15s median |
| intent ready -> Guard dispatch | not cleanly isolated | <=2s server-side compiler path |
| Guard round trips / artistic mutation | ~5.1 | <=1.5 |
| rejected-before-dispatch round trips | 16 | <=2, preferably 0 |
| recovery-only round trips in healthy run | 15 | 0 |
| deterministic violations exposed to model | many | <=1 exceptional case |
| Photoshop execution | ~15s total | no required speedup |

## 2026-10-02 live acceptance result

The fresh scoped run `hotloop-final5-20261002` used a new 1200x800 document and completed **8 meaningful
VisualMicroPlan passes**. The generated evidence is
`docs/hotloop-final5-20261002-benchmark.md`.

| Metric | Fresh run | Result |
|---|---:|---|
| visual review median | 13.337s | target met |
| review_finished -> next_pass_ready diagnostic proxy | 1.752s | target met as diagnostic planning proxy |
| PaintingIntent -> Guard dispatch median | 1.690s | target met |
| Guard round trips / artistic mutation | 1.25 | target met |
| rejected-before-dispatch round trips | 1 | target met |
| recovery-only round trips | 0 | target met |
| model-visible semantic ambiguities / exposed rejects | 1 / 1 | target met |

The exact `review_finished -> PaintingIntent ready` interval remains unknown because the current benchmark has no
separate intent-ready marker; `next_pass_ready` is intentionally retained as a server-observed diagnostic proxy and
is not relabelled as model reasoning.

The live run also found and fixed the last material hot-path latency gap. Before the fix, one continuation spent
8.633s from `intent_received_at` to `dispatch_started_at`: `compactPassContext()` repeatedly rebuilt state/history
despite an already-captured Guard projection. The compiler now reuses that projection through durable-state injection,
compact-pass compilation and deterministic repair. Post-fix P3-P8 continuation samples all reached dispatch in
<=1.873s. A transient long-poll readiness sample now receives one bounded read-only wake/probe before fail-closed
readiness is evaluated, and art-run setup binds the live UXP document-incarnation witness before first-pass state is
written. New-owner PaintingIntent compilation also injects the just-created layer step reference and deterministic
opaque stack facts when uniquely implied.

The one rejected visual attempt was `structured_mass_iconic_primitive_compound`: the historical vertex-count heuristic
was retired on 2026-10-04 because extra contour points do not prove form quality. That earlier correction did not enter recovery. Full acceptance after the
implementation changes is **93/93 test files, 939/939 tests**.

This closes the **engineering hot-loop performance gate**. Artistic parity/quality remains independently evaluated by
the P1-E.8/P1-E.10 quality-time comparison; the latency benchmark is not used as evidence that a simpler stylized image
is artistically equivalent to the rainy-tram reference.

Additional pass/fail conditions:

1. no safety invariant is weakened;
2. no mutation is replayed;
3. every automatic repair is durable/auditable;
4. model-visible ambiguity is genuinely semantic rather than schema boilerplate;
5. the final artwork is not simplified merely to hit latency targets;
6. benchmark output explicitly keeps unknown/unattributed host/model intervals separate.

---

# Likely code touchpoints

The implementer should verify current code before editing, but the expected ownership is:

```text
src/core/guard/cycle-compiler.ts
    final Guard compile/validation authority; integrate compiled PaintingIntent output,
    violation repair classes and repair-aware validation

src/core/guard/session-store.ts
    durable state projection, continuation context, repair audit trail,
    throughput accounting and run-scoped telemetry

src/tools/guard-tools.ts
    compact public surfaces; avoid adding extra production round trips

src/prompts/host-guidance.ts
    simplify manual correction guidance only after runtime owns deterministic repair

src/core/guard/painting-intent.ts                (new, suggested)
src/core/guard/next-pass-compiler.ts             (new, suggested)
src/core/guard/preflight-repair.ts               (new, suggested)

tests/compact-contract-regressions.test.ts
tests/embedded-guard.test.ts
tests/session-store-regressions.test.ts
tests/visual-microplan.test.ts
tests/planner-painter.test.ts

scripts/dev/benchmark-painting-cycles.mjs
docs/performance-and-latency.md
docs/PAINTING-ROADMAP.md
```

Avoid solving this by putting still more responsibilities into one giant `cycle-compiler.ts` function.
The new intermediate representation and repair policy should have independently testable module boundaries.

---

# What not to do

Do not:

- remove Guard validation;
- increase mutation budgets globally just to reduce rejections;
- turn all missing fields into permissive defaults;
- auto-select between genuinely different artistic strategies;
- auto-retry uncertain/dispatched mutations;
- insert more status/state calls into the healthy loop;
- make diagnostic timing markers mandatory production calls;
- expose full durable state or full schemas to the model each pass;
- optimize image delivery before orchestration;
- merge unrelated visual mutations merely to reduce tool-call count;
- measure success only by speed while artwork quality regresses.

---

# Definition of done

This work is done only when all of the following are true:

1. normal post-review continuation can be authored as a compact PaintingIntent;
2. durable protocol facts are injected locally instead of reconstructed by the model;
3. safe deterministic preflight corrections happen locally in a bounded loop;
4. never-dispatched preflight failures do not enter recovery;
5. adaptive mutation budgets are considered before dispatch;
6. only real semantic ambiguity returns to the model;
7. telemetry separately exposes intent/compile/repair/dispatch latency;
8. tests prove no regression in no-replay and Guard safety;
9. a fresh live artwork benchmark reaches the latency/round-trip targets above;
10. the separate P1-E.8/P1-E.10 quality/time gate verifies that the performance architecture does not obtain its
    speedup by simplifying the target artwork; hot-loop latency evidence alone cannot close that artistic-quality claim.

The core success criterion is simple:

> After the model has visually decided what should happen next, protocol construction should be a fast,
> deterministic repository responsibility rather than another large reasoning/recovery loop.
