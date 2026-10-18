# Semantic owner creation and continuation

## One contract for both profiles

This mechanism applies to both `simple_graphic` and `nontrivial_painting`. The artist owns depicted object decomposition and the independence of its parts; the compiler derives IDs, declarations and bindings only from unambiguous typed inputs. Guard verifies actual Photoshop targets, document incarnation, transaction/Stop safety and receipts.

### Minimal ownership-plan compilation

`ownership-bootstrap-compiler.ts` creates a minimal `scene_ownership_plan` only when there is **one** new semantic owner, **one** create-layer action and **one** eligible visual mutation targeting its exact `$steps.<create-id>.details.layerId` result. The authored layer name must agree. An already registered owner is never recreated.

A canvas field may be classified automatically as `continuous-field` only when `logical_layer.component_space=canvas`, `construction_role=continuous-field`, `visual_intent=continuous-field` and the executor uses a native gradient or uniform fill. For an independently editable depicted part, the artist can supply the short `component_scope={subject_kind:"single-component",role:"...",edit_axes?:[...]}` declaration. The artistic judgment about **what constitutes a single part** is not inferred from prose or the layer name.

The compiler cannot collapse a person, animal, multi-part window or other compound subject into one owner, rewrite foreign `layer_id` values, override an authored ownership plan, or treat a requested continuation as authorization to create. Established plans are extended without reassigning existing owners. Authored input remains immutable.

### Atomic transaction and recovery

Execution uses the existing `VisualMicroPlan` transaction: `photoshop_create_layer` → verified native `layerId` → mutation referencing the created layer with `$steps` → AFTER preview/barrier → Guard journal. A plan is **intent**, not proof that a Photoshop layer exists.

`SessionStore.sceneOwnershipPlan()` ignores queued/preflight/Stop, `not-executed`, `uncertain` and unconfirmed failed proposals. A `create-new` plan needs a matching `continuation_layers` receipt with positive `layer_id` even when marked `completed`. A partial operation retains its plan only if the created owner has such a concrete receipt. Uncertain creation must be recovered, **not replayed**.

Continuations use `compileSemanticOwnership` and its unique durable `target_owner_id` binding. Foreign physical targets and explicit conflicts still fail closed.

### Verification scope

`tests/ownership-bootstrap-contract.test.ts` covers both profiles, fresh/durable plans, wrong targets, ambiguous scope, public `painting_intent` and real `compileGuardCycle` preflight. `tests/ownership-bootstrap-recovery.test.ts` covers Stop/rejected/uncertain/partial creation, receipt requirements and durability selection. Existing VisualMicroPlan and SessionStore regressions cover one native rollback span and continuation authority.

Historical October 10 versus October 14–18 artifacts contain error codes and counters, but do not retain all exact executable requests. Comparative tests therefore represent the **documented failure classes**, not a claimed byte-for-byte historical replay. Real Photoshop acceptance remains a separate final gate.
