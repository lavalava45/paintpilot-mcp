# Semantic Contract Compiler

The agent authors **artistic intent**. PaintPilot compiles deterministic technical identities before the strict Guard checks and any Photoshop mutation. The compiler does **not** decide composition, lighting choices, ownership migrations, colors or scene geometry.

## Source of truth

The shared specification is `src/core/guard/semantic-contract-spec.ts` (`SEMANTIC_CONTRACT_SPEC`). It declares:

- **Typed entities** such as scene models, light sources, geometry elements, semantic owners and scene objects.
- **Typed references** to those declarations, including local value anchors, atmosphere, model revisions and ownership references.
- **Provenance pins** from the exact selected document/model context, not generated guesses.

`semantic-entity-registry.ts` consumes this specification. `applySemanticPublicSchema` derives the optional technical ID and provenance fields in the public `next_pass` and `painting_intent` schemas. `compileGuardCycle` uses the same specification before ownership/model normalization and during bounded revalidation. The existing Guard remains authoritative for execution permission, visual checks, undo, document incarnation, ownership and rollback.

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

`tests/semantic-contract-registry.test.ts` checks deterministic IDs, schema derivation, typed ambiguity, stale pins, model continuation, and reference safety. `tests/semantic-contract-end-to-end.test.ts` exercises both acceptance and rejection through the actual `compileGuardCycle` without dispatch. Live artistic acceptance of `nontrivial_painting` remains separate from compilation correctness.

[Русская версия](../ru/semantic-contract-compiler.md)
