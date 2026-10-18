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

## Regression matrix and negative controls

`tests/contract-preservation-audit.test.ts` and `tests/direct-foundation-domain-regressions.test.ts` exercise both `simple_graphic` and `nontrivial_painting`, with/without Art Director, direct and VisualMicroPlan routes, PaintingIntent conversion, multiple action classes, exact-frame closure, Stop refusal, stale restore and missing/invalid declarations. The October 18 deletion of a failed halo is represented by an **offline** attempt against mocked layer 16; no actual Photoshop command is dispatched.

The gate deliberately removes `foundation_goal`, `change_domains` and replaces `document_id`, proving that the check would fail if these losses recur. It also fails if a new published top-level field has no explicit preservation policy, or an obsolete field remains in that policy.

### Mandatory commands

`npm run verify:contract-preservation` checks the freshly built/public schema and targeted tests. It is required by `test:acceptance`, `verify:canonical` and `prepublishOnly`. All source tests remain part of `test:acceptance` through automatic Vitest discovery; this is not a separate optional QA note.

**Limitations:** This audit does not prove the model received instructions, that a document mutation succeeded, or that an artwork is visually correct. A richer automated semantic equivalence check for every field/subschema still requires domain-specific proof obligations; the current runtime guard intentionally enforces the highest-risk cross-boundary fields without guessing meanings.
