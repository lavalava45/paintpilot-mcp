# Contract Preservation Audit — Guard cycle boundary

## Purpose and invariant

A field accepted by the published `photoshop_guard_cycle_auto` schema may be retained, translated into a typed executable/Guard contract, validated without becoming native Photoshop arguments, or checked against durable frame/owner authority. **It must never disappear at a compiler boundary without an explicit, documented disposition.** A successful build and a count of unit tests are not proof of this property.

`src/core/guard/contract-preservation.ts` is the reviewed inventory of **every public named top-level field** on the four surfaces:

| Surface | Fields | Compilation boundary |
|---|---:|---|
| Cycle envelope | 6 | Previous visual/nonvisual closure, retained review, or one new request |
| `next_pass` | 62 | Semantic → ownership → technical → geometry → direct/VisualMicroPlan → Guard |
| `painting_intent` | 40 | Typed parse → inherited owner/material → `next_pass` → execution |
| `previous_observation` | 33 | Exact-frame review → validated `previous_visual_verdict` → closure |
| **Total** | **141** | Published schema and source policy must agree exactly |

The read-only audit recursively enumerates the named nested schema members (currently 1375 paths). These inherit their typed parent's policy; fields added at the top level fail the inventory check until their disposition is reviewed. Three open `args`/object shapes are intentionally not claimed to have a finite exhaustive field list: their admissibility is selected from the actual executable tool contract.

### Allowed dispositions

- **`retained`**: same meaningful identifier, goal or scoped semantic field remains available to Guard/executor.
- **`translated`**: normalized action class, material/brush strategy, geometry or review envelope; never invented artistic facts.
- **`validated`**: admitted/rejected by Guard but not necessarily a Photoshop-native argument, including correction metadata.
- **`durable`**: proven against an authoritative stored owner, scene model or exact visual observation.
- **`conditional`**: only relevant to the selected request route, such as accepted-anchor restore or deferred PaintingIntent.

The catalog is a complete **declared disposition inventory**, not a claim that every possible artistic payload was dynamically exercised. Critical cross-boundary properties are additionally enforced by executable code.

## Pre-dispatch invariant

`criticalPreservationFailures()` runs against the **final** compiled operation after the bounded convergence/repair cycle, just before an operation can be returned as admissible. It forbids:

1. Dropping or rewriting `next_pass.foundation_goal`.
2. Dropping any authored `next_pass.change_domains` from the final direct or VisualMicroPlan Guard envelope. Planner-derived additions are allowed; removal is not.
3. Retargeting a pinned `next_pass.document_id`.
4. Changing `next_pass.action_class` for an executable VisualMicroPlan.

The typed rejection is `contract_field_lost_during_compilation`, with the exact originating `next_pass.*` path. It is a pre-dispatch system defect: no Photoshop action is authorized. For direct `photoshop_delete_layer`, `action_class=ROLLBACK` does **not** magically become a VisualMicroPlan/Undo rollback or confer permission to delete; independent layer, Stop, instance, history and protected-target checks remain authoritative.

### Native operations are not necessarily artistic painting methods

`directMethodApplicability()` checks registered tools against the **single painting method palette**. Tools represented by an artistic method (strokes, gradient, filters and other cataloged techniques) retain strict `visual_intent`, `impact_class`, preference and exclusion checks. A known Guard-authorized native operation **not** represented by a painting method (such as `photoshop_delete_layer`) must not require a fabricated paint method. Stale artistic hints produce an `artistic_method_not_applicable_to_native_operation` normalization without changing the Photoshop command.

Unknown, unregistered and forbidden tools are not exempt. All independent delete, owner, document, Stop and protection checks still apply. `tests/direct-method-applicability.test.ts` and `tests/direct-foundation-domain-regressions.test.ts` cover both profiles, with/without Art Director, stale method metadata, and an actual paint-method mismatch as a negative control.

## Regression matrix and negative controls

`tests/contract-preservation-audit.test.ts` and `tests/direct-foundation-domain-regressions.test.ts` exercise both `simple_graphic` and `nontrivial_painting`, with/without Art Director, direct and VisualMicroPlan routes, PaintingIntent conversion, multiple action classes, exact-frame closure, Stop refusal, stale restore and missing/invalid declarations. The October 18 deletion of a failed halo is represented by an **offline** attempt against mocked layer 16; no actual Photoshop command is dispatched.

The gate deliberately removes `foundation_goal`, `change_domains` and replaces `document_id`, proving that the check would fail if these losses recur. It also fails if a new published top-level field has no explicit preservation policy, or an obsolete field remains in that policy.

### Mandatory commands

`npm run verify:contract-preservation` checks the freshly built/public schema and targeted tests. It is required by `test:acceptance`, `verify:canonical` and `prepublishOnly`. All source tests remain part of `test:acceptance` through automatic Vitest discovery; this is not a separate optional QA note.

**Limitations:** This audit does not prove the model received instructions, that a document mutation succeeded, or that an artwork is visually correct. A richer automated semantic equivalence check for every field/subschema still requires domain-specific proof obligations; the current runtime guard intentionally enforces the highest-risk cross-boundary fields without guessing meanings.

## Reviewed structural relation vs. separately owned causal overlay

A Critic may accurately identify a relation defect involving architecture, fog and a lamp while the flawed brush marks reside on a **distinct owned layer**. Never rewrite the durable `structural_defect.part_ids` to make such a correction pass. Optional `structural_correction.causal_source` pins `semantic_id`, `owner_id`, `layer_id`, `source_operation_id`, and `frame_sha256`; the original `part_ids` and `relation_ids` must still match the reviewed relation.

The source is admitted only if the exact retained editable-scope review, unique durable native/scene owner, exact completed source-operation `continuation_layers` receipt and every explicitly targeted Photoshop mutation agree. No unbound active-layer edits, foreign physical targets, unreviewed history or retroactive Critic identity changes are authorized. This does not waive protected-layer, Stop, Director, method, structural footprint or visual recheck gates.

The October 18 example has a reviewed relation `roofline-center-distance`, but its over-bright marks reside on layer 20, `far-roof-planar-weathering` (owner `far-roof-material-owner-v1`). Layer 18, fog 19 and lamp 7 remain independently owned. `tests/structural-causal-overlay.test.ts` proves both a pinned simulated positive route and negative mismatched/stale/foreign-target routes. Live Photoshop acceptance remains separate.

## Native Photoshop History ownership and safe rollback refusal

A `VisualMicroPlan` can have completed painting but still lack an **exact independently owned Photoshop History span**. `history_ownership.status=unproven` must continue to block `previous_observation.disposition=rollback`; guessing a count and issuing Undo could erase unrelated work.

For **future** operations, UXP `create_layer` and ordinary `color_gradient` (without `preserve_transparency`) expose `history_steps` only when two native `itemIndex/count` reads **inside the same exclusive executeAsModal transaction** demonstrate an actual increasing History cursor. If History is unavailable or ambiguous, the receipt remains absent and Undo remains blocked. `fill_layer` already uses independently authenticated `suspendHistory/resumeHistory` for one unit. Historical incomplete receipts must never be backfilled from assumptions.

`photoshop_guard_resume(document_id, projection="recovery")` reports `pending_visual_verdict.undo_proof`: `candidate-exact` or `unproven`, with missing step IDs where available. A candidate exact span is **not** automatic authorization: document/frame identity and intervening writers remain independent gates. For unproven passes, the agent should review the exact frame and use a truthful `correct` disposition if it requires improvement, followed by a fresh guarded correction on a pinned owner, or independently verified accepted-anchor restoration. A correction verdict is not an undo and never claims pixels were restored.

Mandatory regression coverage: `tests/native-history-ownership-uxp.test.ts`, `tests/undo-proof-projection.test.ts` and `tests/bounded-undo-semantics.test.ts`. They use a simulated native modal and isolated Guard, not the user's Photoshop document. Updated UXP requires a separate disposable-document live acceptance.
