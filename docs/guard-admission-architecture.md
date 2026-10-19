# Guard Admission Architecture: Execution Authority vs. Artistic Review

## Status and scope

This document records the October 2026 architectural audit of PaintPilot's Painting Mode admission boundary. It describes intended authority, verified implementation entry points, residual risks, and acceptance limits. It is **not** a certification of the complete test suite or a live Photoshop end-to-end acceptance report. Source locations and behavior should be revalidated when implementation changes.

The rule is deliberately independent of error-code naming, painting profile, artistic stage, aesthetic style, selected method, and current review debt:

| Finding authority | Admission | Meaning |
| --- | --- | --- |
| `execution-integrity` | **BLOCK** | A native operation, document, layer ownership, protected target, causal provenance, schema, transaction, recovery, or Undo invariant is unproven or violated. |
| `user-constraint` | **BLOCK** | An explicit, applicable instruction from the user restricts the requested action (for example, avoiding a named method or restricting use to an exclusive brush pack). |
| `artistic-review` | **WARN** | A Critic, Planner, material/style model, physical-scene review, or heuristic recommends a different technique, stage, sequence, composition, or correction. The finding remains observable but cannot alone veto technically authorized painting. |

The typed authority contract lives in `src/core/guard/admission-policy.ts`: `PainterFindingAuthority`, `classifyPainterFinding`, `reportArtisticAdvice`, `enforcePainterFinding`, and `ArtisticReviewNotice`. Diagnostic strings and codes **do not confer authority**. A message containing “structural,” “method,” or “required” is not automatically an execution fault. Conversely, an artistic label must never downgrade a confirmed unauthorized document/layer mutation.

## Pipeline and authority boundaries

1. **Painting intent and semantic compilation.** The authored compact pass enters the painting-intent/compiler path. `src/core/guard/cycle-compiler.ts` normalizes the request, preserves explicit user restrictions and technical targets, compiles the executable operation, and collects violations. A method suggestion or stylistic mismatch must not become a denylist-based veto or silently rewrite a deliberately chosen technique. Reconciliation of descriptive metadata is separate from changing the actual Photoshop command.
2. **Cycle compiler admission.** In `cycle-compiler.ts`, the `collectPreflightErrors` call is supplied an `artisticAdvisories` collector. Returned technical errors become Guard preflight violations; advisory messages are emitted as `artistic_admission_warning` normalizations rather than rejections. Parsing, tool availability, valid arguments, and current technical bindings still matter.
3. **SessionStore state/evidence admission.** `src/core/guard/session-store.ts` evaluates durable document incarnation, actual operation and preview state, layer/scene owners, protected regions/layers, causal evidence, unresolved dispatched work, visual barriers, checkpoint/rollback state, and Undo provenance. Its `collectPreflightErrors` routes artistic Critic/Planner/foundation/physical-stack concerns to advisory reporting, but retains `execution-integrity` findings as hard errors. For example, the `criticCorrectionIssue` branch explicitly checks `issue.authority === 'execution-integrity'` before adding a blocking error.
4. **Critic and visual review.** `src/core/guard/critic-correction.ts` is permitted to produce diagnoses such as `critic_structural_priority_required` in Nontrivial Painting. Such diagnoses are meaningful feedback on the image or proposed correction **without** independently determining Photoshop admission. Its verified cross-owner or invalid `causal_source` findings, where marked `execution-integrity`, remain blocking. Review and admission are different interfaces.
5. **VisualMicroPlan construction and execution.** `src/core/visual-microplan.ts` parses bounded mutation transactions, preserves owner and protected-layer semantics, validates step references, separates preparation from mutation, and requires a final preview. `src/tools/visual-microplan-tools.ts` preflights resolved arguments and bounds, dispatches the verified transaction, records preparation/mutation outcomes, and tracks exact versus unknown native history ownership. Artistic construction roles, material preferences, stage ordering, and nominal `method_id` should not block otherwise valid executable actions. The concrete selection-mask exception is described below: this is an **execution-integrity** contract, not an aesthetic recipe.
6. **Native routing and UXP.** The backend/bridge invokes Photoshop operations. Native document and active-layer identity, actual selection state, committed-history receipts, and failure outcomes must be checked at the point of mutation rather than inferred from prose or a mock preview. `src/tools/selection-operations.ts`, `src/tools/selection-catalog.ts`, and `uxp-plugin/main.js` implement an optional pinned `create_layer_mask` contract while retaining unpinned Direct Photoshop Tools compatibility. Other tools must meet their own native invariants.

## What remains a hard safety boundary

- **Document identity:** the target document, active document and document incarnation must match validated state; pending identity recovery forbids mutation.
- **Layer and semantic owner:** target pixels must be on the authorized physical layer(s), not merely whichever layer happens to be active. A named or logical owner cannot silently resolve to an unrelated physical ID. New-layer references must resolve from the trusted creation result.
- **Protected content:** protected layers/regions must not be overwritten unless an explicit, valid action-specific replacement exception and exact target authorization are present. `REPLACE` is not a blanket exemption.
- **Native argument/geometry integrity:** malformed commands, out-of-canvas coordinates, invalid tool payloads, unresolved references, and execution against unverified targets fail closed.
- **Transaction and recovery state:** no additional mutation may bypass unresolved dispatch outcomes, an unacknowledged preview/visual verdict barrier, or a required reconciliation.
- **Undo:** rollback counts are not guessed from “success” prose. Native history ownership and causal Undo receipts must be established; incomplete or uncertain preparation/mutation histories remain uncertain rather than being presented as safely undoable.
- **Explicit user constraints:** `avoid_method_ids`, an exclusive user-approved brush pack, or another clear user restriction may block a conflicting plan. An optional Critic recommendation or preset-fitness recipe is not a user instruction.

These restrictions apply in **both** `simple_graphic` and `nontrivial_painting`. Neither profile authorizes a foreign document, unknown owner, destructive protected-layer edit, or unauthenticated Undo. Neither profile is allowed to require a single predefined artistic school, linear stage progression, brush recipe, or preferred method solely because a heuristic favors it.

## Worked examples

### Artistic disagreement: admit with a warning

A Nontrivial Painting pass deliberately paints material while the Critic records an unresolved form issue. The Critic may return `critic_structural_priority_required`. If the document, target owner, protection, action and native transaction are valid, `SessionStore.collectPreflightErrors` puts that message in `artisticAdvisories`, not the execution-error array. The painter may proceed; the Critic debt is retained for later evaluation.

### Technical provenance: refuse even if the image looks acceptable

A proposed correction cites a `causal_source` from a different owner's operation as authority to mutate the current layer. If the finding is `execution-integrity`, the gate returns **BLOCK** in either profile. Rewording it as “style correction” does not authorize the foreign target.

### Explicit preference versus artistic recommendation

A region-based fill during `FORM`, an unusual brush choice, or a late `ADD` is not rejected merely for departing from a preferred construction order. A genuine user-specified `avoid_method_ids` restriction can still reject a named prohibited method. In all cases, required payloads, target ownership and protected-area checks continue to apply.

### Pending native history

A prior mutation has succeeded but its final visual verdict or Undo provenance has not been reconciled. The next pass is blocked until the outstanding evidence is closed, even when its method is aesthetically appropriate. This is a transaction-integrity barrier, not a Critic preference.

## Selection-mask security: explicit native intent and remaining caveats

The earlier native path in `uxp-plugin/main.js` derived mask semantics from whichever pixel selection was active: `revealSelection` when a selection existed, otherwise implicit `revealAll`. Thus a stale selection could affect the wrong area, and a missing selection could accidentally create a full reveal mask. The current pinned path supports:

```json
{
  "document_id": 42,
  "layer_id": 9,
  "mask_mode": "revealSelection",
  "expected_selection_bounds": {
    "left": 10,
    "top": 20,
    "right": 40,
    "bottom": 60
  }
}
```

For pinned calls, the UXP modal verifies the active document and single active target layer, reads the current native selection, checks the chosen `mask_mode` and (for `revealSelection`) exact expected bounds, and rejects mismatches before creating a mask. Pinned `revealAll` requires no active selection. Unpinned Direct Photoshop Tools calls intentionally retain legacy behavior for compatibility.

`src/core/visual-microplan.ts` now requires a target `layer_id` (numeric or a narrowly accepted step-result reference), explicit `mask_mode`, and in-plan selection preparation plus expected bounds for guarded `revealSelection`. These are **technical ownership/provenance conditions**; no particular artistic mask technique is mandatory.

**Residual caveats:**

- Equal bounding rectangles do **not** prove identical pixel-selection shapes. Two disjoint or differently feathered selections may share bounds. The Guard's in-plan preparation requirement narrows provenance, but a complete native selection revision/token or stronger per-pixel fingerprint, bound to the same document incarnation and execution transaction, has not been established by the bounds comparison alone.
- Selection belongs to a Photoshop **document state**, not to an individual layer. “Selection owner” therefore means the authorized operation/context and its pinned target layer, not a fictional native selection-owner property.
- Preserving Direct mode's optional/unpinned API is intentional; Guard must never rely on that legacy implicit-selection mode to satisfy its stronger contract.
- Document and layer stability should be rechecked as close to the native mutation as possible, including against asynchronous UI changes and native selection-read failures. No assurance of exhaustive race safety follows merely from unit-test coverage.

## Testing and acceptance status

Focused regression tests have exercised admission distinctions, VisualMicroPlan parsing/execution, compact-cycle behavior, and the pinned selection-mask parameter path in mocked connectors. These are useful regression signals but **not** live native acceptance. Do not infer that all repository tests pass from isolated runs, and do not claim the Photoshop bridge, selection races, or real Undo behavior have been verified end-to-end on a live document.

Before production acceptance, run the complete relevant test suite and report its actual pass/fail count; execute controlled native Photoshop tests covering selection absent, stale, changed, same-bounds/different-shape, wrong document, wrong layer, protected owner, failed preparation, and Undo/recovery after both exact and uncertain history receipts. Until that evidence is recorded, native mask provenance and live Photoshop acceptance remain explicitly **open**.
