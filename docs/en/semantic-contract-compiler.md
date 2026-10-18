# Semantic Contract Compiler

The agent authors **artistic intent**. PaintPilot compiles deterministic technical identities before the strict Guard checks and any Photoshop mutation. The compiler does **not** decide composition, lighting choices, ownership migrations, colors or scene geometry.

## Source of truth

The shared specification is `src/core/guard/semantic-contract-spec.ts` (`SEMANTIC_CONTRACT_SPEC`). It declares:

- **Typed entities** such as scene models, light sources, geometry elements, semantic owners and scene objects.
- **Typed references** to those declarations, including local value anchors, atmosphere, model revisions and ownership references.
- **Provenance pins** from the exact selected document/model context, not generated guesses.

`semantic-entity-registry.ts` consumes this specification. `applySemanticPublicSchema` derives the optional technical ID and provenance fields in the public `next_pass` and `painting_intent` schemas. `compileGuardCycle` uses the same specification before ownership/model normalization and during bounded revalidation. The existing Guard remains authoritative for execution permission, visual checks, undo, document incarnation, ownership and rollback.

## Intent → ownership → method → executable plan

`SEMANTIC_EXECUTION_SPEC` in the same specification and `semantic-execution-compiler.ts` extend the pipeline beyond entity IDs. They enforce three separate contracts:

1. **Ownership binding:** one explicitly selected `target_owner_id` can inherit its unique current non-temporary durable `logical_layer` and numeric layer target. An explicitly foreign target, duplicate owner registration, uncommitted new layer, or cross-layer action cannot be silently retargeted. The existing Guard's physical-stack and separation/rollback checks remain mandatory.
2. **Method compilation:** the required `paint_strategy` fields come from the same declarative specification as the published VisualMicroPlan input schema. A material is derived only from the caller's explicit `material_role` or the *single* verified role of the chosen brush. Multiple eligible materials require an artistic decision. No first-item fallback, `undefined` material acceptance, or invented brush evidence.
3. **Executable plan:** the immutable final compiler applies deterministic sequencing and an exact terminal preview after a visual mutation. The existing VisualMicroPlan parser, tool schema, real UXP behavior, execution journal and review gates still validate/admit the result.

This fixes **some** missing-owner and method-schema cases at the cause, rather than filtering error codes. `semantic_mutation_target_owner_mismatch` for a genuinely foreign layer and `invalid_visual_microplan` for genuinely invalid executable steps remain valid safety rejections.

## Evidence-based origin of Guard contract errors

`contract-error-provenance.ts` attaches a bounded `contract_error_provenance` report to **every compiled-cycle preflight rejection**. The report is generated in the same compiler attempt, before Photoshop mutation, and joins the existing error codes instead of replacing the Guard's decision.

The observer captures technical fields at the submitted, identity, ownership, durable-binding, geometry, compiled-operation, validation and bounded-convergence stages. Each finding includes its exact field path (when available), stage/presence/type, and a per-attempt HMAC-SHA-256 fingerprint of the value. Full prompts, pixel buffers and argument bodies are not included in the report. The durable compiler-attempt journal saves only a sanitized, bounded projection; the recent rejection summary provides the latest classification without flooding the hot-loop status.

- **`authored_conflict_with_durable_binding`**: the submitted numeric mutation target is provably outside exactly one durable owner's current physical binding. This proves **payload provenance**, not that the model disregarded instructions.
- **`durable_owner_binding_absent`**: the submitted continuation requires a semantic owner but the authoritative inventory contains no registered owner.
- **`compiler_output_invalid`**: a rejected technical field appeared during compilation, or an invalid executor field came from the server-generated `next_operation`.
- **`contract_spec_conflict`** / **`compiler_pipeline_failure`**: a detected incompatible/unexpressible Guard requirement or an absent compiled operation is a server-side failure, not an invitation to invent artistic input.
- **`input_field_present`**, **`input_field_missing`** and **`unattributed`**: only the stated field lineage is proven; ambiguous runtime errors remain unattributed.

`instruction_delivery: "not-observed"` and `model_instruction_noncompliance_proven: false` are deliberate. MCP cannot attest which host instructions were actually delivered/read by the model or its internal reasons. Evidence of an invalid payload must **never** be presented as proof that the artist saw and ignored a rule. Genuine Photoshop execution faults, uncertain mutation/recovery, and external host instruction delivery are outside this *current-preflight-only* trace.

The report does not grant auto-repair, cross-layer authority, Undo, replay or artistic acceptance. The pre-existing validator retains the final verdict.

## Example

An agent may submit a complete scene-light declaration with one emitter but **without** technical `id`, `model_id`, `revision` and `source_frame`. If the current document witness is known, the compiler deterministically allocates the new IDs, binds the exact witness and derives the initial revision. An authored prose `local_value_anchor` can bind to the single compatible declared emitter; multiple possible emitters produce a **semantic-reference ambiguity** rather than a guessed choice. Existing explicit unknown IDs are not remapped.

The full artistic declaration remains necessary: emitter role, family, provenance, global value key and other required artistic fields. Reference samples require genuine evidence; compiler-generated IDs never fabricate RGB measurements.

## Identity and safety rules

1. A declared stable ID is preserved. Missing or label-like IDs may receive deterministic IDs scoped to the exact document incarnation; equivalent input and context yield identical output.
2. New entities with indistinguishable identities are rejected rather than silently distinguished by array position.
3. Updated models with omitted IDs reuse one authoritative durable model and derive its next revision. An explicit conflicting identity, revision or host witness is never overwritten.
4. Typed references use exact IDs and unambiguous declared aliases. A prose local-light reference resolves by cardinality only when a single compatible declared emitter exists; otherwise the agent must make the artistic selection.
5. No registry operation writes pixels, publishes a durable record or grants a new Guard authority. Rejected passes do not register proposed scene ownership or consume a Photoshop operation.
6. Omitted host evidence stays unknown. A matching numeric document ID alone is not proof of matching incarnation.

## Extending the compiler

Add a `SemanticDeclarationSpec`, `SemanticReferenceSpec` or `SemanticPinSpec` to the shared specification and add negative/positive tests. Do **not** add a field-name-specific replacement branch to preflight repair. Technical links resolved through the registry must still satisfy their domain-specific strict validators and the normal Guard execution gate.

The specification currently covers the main scene-light/color, geometry, camera and scene-ownership identities and the technical fields listed there. It is **not** a universal inference mechanism for arbitrary English/Russian prose, novel artistic objects, source-image measurements or Photoshop native layer state. Expanding domain coverage requires explicit typed descriptions, not silent safety fallback.

## Verification

`tests/semantic-contract-registry.test.ts` checks deterministic IDs, schema derivation, typed ambiguity, stale pins, model continuation, and reference safety. `tests/semantic-execution-compiler.test.ts` covers owner binding, foreign and ambiguous targets, method derivation and executable preview compilation. `tests/contract-error-provenance.test.ts` covers trustworthy classifications, privacy/redaction, durable audit and real compiler rejection. `tests/semantic-contract-end-to-end.test.ts` exercises both acceptance and rejection through the actual `compileGuardCycle` without dispatch. Live artistic acceptance of `nontrivial_painting` remains separate from compilation correctness.

[Русская версия](../ru/semantic-contract-compiler.md)
