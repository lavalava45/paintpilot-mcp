# Painting Quality Roadmap

Last updated: 2026-10-02

This file is the canonical **forward-looking TODO** for the digital-painting project.

Completed implementation belongs in `CHANGELOG.md`; detailed acceptance evidence belongs in
`docs/roadmap-final-acceptance-matrix.md`, Git history and the referenced live-evidence artifacts.
Do not keep completed implementation plans here merely to preserve history.

The canonical production lane is compact-v2, Guard-controlled and **UXP-only / fail-closed** for
Photoshop semantic dispatch. Do not reintroduce the retired controller/daemon, raw-script bypass,
recipe execution layer or ExtendScript/COM production fallback.

## Priority order

The remaining work is split into a **sequential engineering critical path** and **parallel/external lanes**.
Completed milestones are not part of the forward order. The goal is still **time to a better actual image**,
not faster production of the same primitive scaffold.

### Sequential engineering critical path

1. **Completion truth and blocker correctness:** AUD-05 → AUD-24 → AUD-03 → AUD-04. A workflow must not expose
   `closed/ready` while its durable artistic state still requires work, must-fix dependencies must be evaluated on
   the full graph, and final review/critic authority must be evidence-bound rather than caller-downgradable.
2. **Exact-frame review authority:** AUD-19 → AUD-17 → AUD-25. A required whole-image review must remain bound to
   the exact frame it was requested for, and structural/global-sensitive accepted changes must receive enough
   whole-frame relational review to create durable debt when a real defect is observed.
3. **Planner and geometry correctness:** AUD-06 → AUD-20 → AUD-02. Direct visual operations must expose truthful
   change domains; perspective/geometry opt-outs must be backed by the active brief/style contract; accepted scene
   geometry must derive or numerically validate the actual Photoshop coordinates that are dispatched.
4. **Reliable pass rollback before broader batching:** finish E.11 live ownership proof, then E.7b mixed-method /
   multi-layer batching. Keep separately editable semantic owners and exact no-replay / partial-outcome semantics.
5. **Finish the remaining E.7c/E.7d/E.7e quality path:** remove remaining prose-only artistic vetoes, complete
   executable geometry derivation, and demonstrate real form/material/lighting/edge improvement rather than a
   faster pictogram.
6. **High-priority hot-loop follow-ups:** E.8e handles AUD-08/09/10/11/12/13/16/27/32 and preserves AUD-01 as a
   regression invariant. These improve deterministic compilation, continuation compactness, local repair and
   redundant runtime reads without reopening the completed E.8d milestone.
7. **Review-delivery turn reduction:** AUD-07 is **P1-high latency**, not a correctness P0. Remove the mandatory
   extra model-visible image-fetch turn when exact MCP image evidence can be delivered in the semantic Guard result,
   while keeping explicit review delivery as a bounded fallback.
8. **Benchmark/telemetry truth:** AUD-14/15/26/28/31 plus E.8a. Split actual Photoshop work, checkpoint/video
   overhead and review service time; do not close further performance work from contaminated or ambiguously scoped
   counters.
9. **Matched quality/time proof and integration:** run the already-defined E.8 comparison after the owning changes,
   then E.10 integration. The E.8 baseline is already frozen; this step is the comparison, not another baseline task.
10. **Secondary ergonomics/brush work:** E.6 owner-stack correction ergonomics and E.14a pressure-response work
    where a demonstrated rendering need justifies it.
11. **Release and portability:** finish the remaining PaintPilot release work, then P1-D host-neutral MCP + portable
    Agent Skills once core painting/Guard semantics are stable.

### Parallel / externally gated lanes

- **E.8b host continuation work:** sibling `chat-on-steroids-FORK`; PaintPilot-side checkpoint/resume/timeline
  projection is already implemented.
- **E.8c / AUD-30 schema-budget exposure risk:** **P0 cross-project / parallel** in the sibling COS host. It must
  protect the Photoshop/Guard control plane, but it does not block local E.17/E.18 implementation.
- **P1-B human/artistic acceptance:** Task 23 → Task 22 → Task 15d.3 → Task 21 when an independent evaluator is
  available.
- **P0-D human critic calibration:** Tasks 8/8a → 8b, with Tasks 6, 11 and 13a.1A/13a.1C inheriting the same held-out
  evidence. Runtime may not invent broader critic authority while this remains human-gated.
- **P0-E.7 supplied-pack acceptance:** only when the user provides a real brush/stamp pack/folder.
- **E.22 process-video live acceptance:** after the main image-quality/time path; recording remains optional.
- **Conditional / optional:** Task 10 only if Task 8/8a justifies it; Task 15c remains P3.

Host-specific ChatGPT / Chat On Steroids routing bugs, connector attribution and sticky-tool-selection
remain owned by the sibling `chat-on-steroids-FORK` project and are tracked in its
`docs/COS-ROADMAP.md`. The public host-neutral MCP/skills contract and installation surface for this
Photoshop product are owned here under P1-D.

---

## Baseline invariants for every remaining task

All new work must preserve:

- exact document pinning and document-incarnation isolation;
- UXP-only / fail-closed production dispatch;
- no mutation replay after an uncertain or partially executed Photoshop operation;
- one authoritative visual barrier per semantic pass, with whole-frame context and bounded
  OBJECT/MICRO escalation when needed;
- exact materialized preview/crop identity and source-coordinate provenance;
- durable Guard recovery/state across restart/resume;
- separation of technical execution facts from artistic/perceptual conclusions;
- export/save/checkpoint success must never be treated as evidence that the artistic brief is complete;
- unresolved evidence-backed `hard_perceptual` debt must survive through save/export and remain visible to
  STOP/FINALIZE logic until corrected, explicitly accepted by the user or human-adjudicated;
- no universal numeric aesthetic score, no arbitrary stroke/detail quota and no optimization of raw
  mutation count as a substitute for pass quality.

For E.7, preserve technical safety and truthful artistic completion, **not every existing artistic
pre-dispatch rejection**. A bounded semantic pass may contain multiple tools/layers and ends where a new
visual decision is needed. It still has one authoritative final preview and observed continuation; do not
prequeue later decisions that require an unseen intermediate result. Artistic observations/debt remain
durable and inform correction/STOP, but missing narrative or a declared escalation level must not by itself
forbid a technically safe corrective experiment. Do not weaken document/layer protection, destructive bounds,
evidence identity, uncertain-outcome recovery or no-replay semantics to obtain speed.

### Shared Scene Constraint Escalation Rule

When a local decision must remain coherent across independent owners/passes, retain its shared source in an
existing durable scene model. Derive dependent execution parameters from that source (E.7d); do not make the
model repeat equivalent coordinates, bindings or an opt-out justification on every pass.

Use shared state when both of the following are true; this is a design rule, not a new per-pass questionnaire:

1. changing the decision would require one or more other owners/passes to be revalidated or rebuilt; and
2. at least one of these also applies:
   - the property is shared by multiple independent owners;
   - it must survive across several passes/stages;
   - it describes a condition of the scene/camera rather than one object's private appearance.

Examples:

- rail convergence shared by rails/train/platform → E.18 Scene Geometry Model;
- twilight/headlight/fog color relations shared by multiple materials/effects → E.19 Lighting & Color Model;
- focus/optical softness shared by objects at different depths → E.20 Camera & Imaging Model;
- focal ordering and contrast/detail/edge allocation shared across unrelated owners → Art Director
  Perceptual Hierarchy Contract;
- wind direction shared by smoke/rain/foliage should be stored as one environmental condition in an
  appropriate shared contract rather than spawning three unrelated local guesses.

Do not create a new scene model for every shared fact. Prefer extending one of the established scene
contracts when the concept naturally belongs there. A new top-level model is justified only when the shared
property has its own durable dependencies, stale propagation and review semantics that cannot be represented
cleanly by E.18, E.19, E.20 or the Art Director hierarchy contract.

Repository-only evidence must not be presented as proof of live Photoshop behavior, and tool success
must not be presented as proof of artistic quality.

---

## P1-E — Live-paint robustness, semantic ownership and Guard-cycle efficiency

**Status: ACTIVE. Forward work only.** Completed implementation and acceptance evidence are archived in
`CHANGELOG.md` and `docs/roadmap-final-acceptance-matrix.md`.

Primary live evidence includes the 2026-09-28 nostalgic-homestead run and the 2026-10-01 night-city run.
The objective is better rendered images sooner, with preview/observation/recovery, document pinning,
destructive-edit bounds and no-replay semantics preserved. E.7 replaces costly artistic admission machinery;
it does not declare the existing scaffold artistically acceptable.

### P1-E.23 — Manual document-close Guard abandonment recovery — COMPLETE

**Status: COMPLETE / regression invariant as of 2026-10-03.** A user manually closing an unfinished Photoshop
document must terminate only that document's active Guard workflow instead of leaving stale debt that blocks a
later painting. The production path is now UXP close notification -> bridge event -> incarnation-aware
document-scoped abandonment, with a fresh `list_documents` / zero-document fallback when the notification is lost.

Required invariants now covered and accepted:

1. manual close terminalizes the matching workflow as `stopped / abandoned_document_absent` and clears its
   blocking uncertain/report/ack/verdict/barrier/job debt without erasing audit history;
2. a close event from an older document incarnation cannot abandon a newly rebound document that reused the same
   numeric Photoshop id;
3. Guard-controlled `photoshop_close_document` remains a normal controlled terminal close and is not converted to
   abandonment;
4. losing the push notification still self-heals on the next Guard status/cycle from fresh document-presence
   evidence, without replaying a mutation;
5. multiple-document state remains isolated: closing one document cannot clear another document's Guard debt.

Live 2026-10-03 acceptance used unfinished `Untitled-1`, `document_id=353`. After manual user close,
`photoshop_ping` reported zero open documents and `photoshop_guard_status` showed empty blocking debt while document
353 retained historical state with `workflow_lifecycle.reason=abandoned_document_absent`. This item is closed;
future work should preserve it as a lifecycle/recovery regression, not add another reset path.

### 2026-10-02 whole-project audit — implementation backlog and traceability

This block converts the read-only whole-project audit into implementation work. It is deliberately attached to
the existing owning contracts instead of creating a second Guard or quality framework. If an item was already
closed by concurrent 2026-10-02 hot-loop work, keep it as a regression invariant rather than re-implementing it.

| Audit id | Priority | Finding | Owning task / required status |
| --- | --- | --- | --- |
| AUD-01 | **P0 latency invariant** | Rebuilding `compactPassContext` from fresh synchronous journal reads multiplies O(N) state cost through intent/compact/validation/repair. | **Regression-protected in E.8d:** every Guard cycle must reuse one captured projection; add scan-count/perf regression so this cannot return. |
| AUD-02 | **P0 quality** | Valid Scene Geometry metadata can still sit beside hand-guessed region/path/stroke coordinates. | **OPEN — E.7d/E.18:** derive or numerically verify actual executable coordinates against the accepted geometry. |
| AUD-03 | **P0 completion** | Pre-final hostile review can report a defect yet allow completion when the caller labels the mapped major defect `soft`. | **OPEN — E.17:** completion-relevant defect authority must not be caller-downgradable. |
| AUD-04 | **P0 completion** | `global_brief_assessment` treats `critic_authority=authorized` + any non-empty `critic_result_id` as independently validated without proving that durable critic result exists. | **OPEN — E.17/P0-D:** bind assessment to a registered exact critic result/authority record. |
| AUD-05 | **P0 lifecycle** | Close-only finalization can return `next_state=closed` / `next_required_action=ready` while unresolved visual problems or unfinished directive work keep the workflow lifecycle active. | **OPEN — E.17/AUD-S1:** user/model-facing closure state must agree with artistic lifecycle debt. E.7a remains completed regression context only. |
| AUD-06 | **P0 Planner correctness** | Directive-bound direct visual operations default to `change_domains=['local-tone']` regardless of actual tool/scope. | **OPEN — E.7c:** derive change domains from tool + impact + target/scope; ambiguous global/direct effects must not masquerade as local tone. |
| AUD-07 | **P1-high latency** | Every ordinary visual pass still requires a separate model-visible `photoshop_guard_review_image` call even though review bytes are already materialized. | **OPEN — AUD-S4:** collapse delivery into the semantic review turn when within evidence/response limits; keep explicit tool only as bounded fallback. |
| AUD-08 | **P1 compiler** | `PaintingIntent` still needs model-authored Photoshop action geometry whenever the compiler cannot prove a unique construction. | **OPEN — E.7d/E.8e:** expand deterministic action compilation only for uniquely derivable geometry/color/tool facts; never guess artistic choices. |
| AUD-09 | **P1 continuation** | Continuation candidates A/B/C carry semantic summaries but not enough current-problem/binding detail to reliably choose/adapt the next intent without another lookup or rejection. | **OPEN — E.8e:** enrich the local compact continuation projection with bounded problem/region/structural and relevant binding summaries. E.8b remains host compaction/resume context only. |
| AUD-10 | **P1 repair** | Violation classes advertise `AUTO_NORMALIZE`, but deterministic repair primarily patches a narrow set of owner/model facts; many deterministic defects still fall back to model resubmission. | **OPEN — E.8e:** implement typed local normalization/patch handlers for proven deterministic violations and measure coverage. |
| AUD-11 | **P1 repair robustness** | Safe split budget is recovered by regex-parsing human error text such as `allows N` / `at most N`. | **OPEN — E.8e:** carry a typed numeric mutation budget in violation details; message wording must not control behavior. |
| AUD-12 | **P1 dispatch latency** | Dynamic preflight reads UXP state, then VisualMicroPlan preflight performs another `photoshop_list_documents` read for bounds already available from the fresh state witness. | **OPEN — E.8e:** thread the fresh document bounds/witness into VMP preflight and remove the duplicate read. |
| AUD-13 | **P1 dispatch latency** | Backend routing and stable mutation each perform readiness/health checks after Guard has already proved the route in the same execution lease. | **OPEN — E.8e:** reuse a bounded request-local readiness lease/snapshot; force-refresh only on expiry/error/recovery boundaries. |
| AUD-14 | **P1 telemetry** | Optional video trace stop/settle/FFmpeg work is included inside mutation wall timing, obscuring actual Photoshop dispatch cost. | **OPEN — E.22/E.8a:** split recorder lifecycle timing from Photoshop mutation timing. |
| AUD-15 | **P1 telemetry** | Automatic PSD checkpoint save can add real Photoshop time before the visible dispatch but lacks a first-class benchmark component. | **OPEN — E.8a/AUD-S7:** expose checkpoint-save wall/execution time separately and include it in run wall accounting. E.7a behavior itself remains complete. |
| AUD-16 | **P1 brush quality** | Brush-role resolution can choose a unique role/material without using the durable role `working_scale`, even though scale is present in context. | **OPEN — E.14/E.8e:** include compatible working scale in deterministic role resolution and ambiguity tests. |
| AUD-17 | **P0 review quality** | Whole-frame closure currently proves that a `region="whole frame"` observation string exists; structured relationship findings remain optional and can be omitted. | **OPEN — E.17/E.7c:** require a bounded scene-relationship audit for accepted structural/global-sensitive work, with evidence-backed findings becoming durable debt. |
| AUD-18 | **P1 review quality** | `world-consistency-critic` is advisory-only and therefore does not itself ensure support/contact/occlusion/spatial conflicts are surfaced into Guard debt. | **OPEN — E.17/P0-D:** keep critic uncertainty/stylization safeguards, but provide an explicit path from evidence-backed conflict to review finding/debt. |
| AUD-19 | **P0 review barrier** | Stage/global `whole_image_glance.due` is exact-frame review debt but does not itself block the next mutation; the bound frame can be superseded before review. | **OPEN — E.17:** pending exact-frame glance becomes a pre-mutation barrier or equivalent non-overwritable debt. |
| AUD-20 | **P0 geometry correctness** | A coherent-3D scene can self-declare a flat/diagrammatic/non-Euclidean geometry opt-out without exact brief/style backing, disabling perspective completion checks. | **OPEN — E.18/E.17:** the active brief/style contract must authorize the opt-out; current-frame review may confirm compliance but may not invent the exception. |
| AUD-21 | **P1 recognition quality** | Recognition evidence is required only when the pass is already in `RECOGNITION_BLOCK_IN`; later stages do not consume a durable recognition prerequisite. | **OPEN — E.7e/E.17:** for briefs requiring recognizable subjects, gate later polish on a current recognition milestone or explicit brief/style exemption. |
| AUD-22 | **P1 imaging quality** | Imaging preflight `outcome=review-required` and `revalidate_edge_detail` do not create an enforced review obligation. | **OPEN — E.20/E.17:** review-required blocks/defers mutation as specified; post-effect edge/detail revalidation is bound to the exact resulting frame. |
| AUD-23 | **P1 policy coherence** | `AGENTS.md` still describes forced early strategy re-review after 1–2 meaningful passes while runtime intentionally treats that threshold as telemetry/guidance. | **OPEN — E.7c docs/policy sync:** one canonical rule; tests and agent instructions must match runtime. |
| AUD-24 | **P0 priority correctness** | `largestOpenMustFix()` filters to must-fix before resolving dependencies, so a must-fix depending on an unresolved lower-severity problem can disappear from blocker selection. | **OPEN — E.17:** evaluate dependency eligibility against the full problem graph, then rank/filter must-fix candidates. |
| AUD-25 | **P1 cumulative review** | Whole-frame review is required only for `execution_effect=meaningful`; accepted smaller pixel changes can accumulate structural drift without a whole-frame observation. | **OPEN — E.17/E.7c:** any accepted pixel-changing structural/global-sensitive pass requires whole-frame inspection regardless of significance threshold. |
| AUD-26 | **P1 benchmark truth** | Unkeyed throughput events are attributed by time window and benchmark can still report `complete=true`, so concurrent activity may contaminate selected-run counters. | **OPEN — E.8:** ambiguous/unkeyed attribution makes exact counters incomplete unless a durable run identity proves ownership. |
| AUD-27 | **P1 benchmark truth** | `deterministic_violations_repaired_locally_percent` is unmeasurable because telemetry lacks a typed deterministic-violation denominator. | **OPEN — E.8e produces; E.8/AUD-S7 consumes:** record encountered deterministic violations by class/code in E.8e, then verify/report the real repair percentage in the benchmark. |
| AUD-28 | **P1 benchmark durability** | Controller `painting-state.json` and run-local mirror are separate writes with no shared commit/watermark; a stale but valid-looking mirror can skew run-scoped throughput. | **OPEN — E.8:** add shared monotonic revision/commit identity or derive benchmark state from authoritative journals; fail closed on mismatch. |
| AUD-29 | **P1 model-context latency** | `photoshop_guard_status` / `resume` can project large owner/scene/director/history state; sanitizer only warns above the context budget instead of trimming. | **OPEN — E.8b/local model-facing projection:** add hard-budget status/resume DTOs; keep full diagnostic state internal/on disk. This does not wait for P1-D portability. |
| AUD-30 | **P0 cross-project exposure risk** | Current 133-tool published catalog is approximately 249,865 bytes, leaving only ~135 bytes below the reproduced COS schema ceiling. | **ALREADY OWNED — E.8c / sibling COS host:** protected control-plane publication remains mandatory; execute in parallel with local PaintPilot work. |
| AUD-31 | **P1 review telemetry** | `review_image` service timing marks result-ready before delivery-receipt persistence and artistic-continuation projection, understating actual server service time. | **OPEN — E.8a:** service end boundary is immediately before the tool result leaves the server, after all synchronous continuation/receipt work. |
| AUD-32 | **P1 continuation latency** | `artisticContinuationContext()` can reread journal/state independently while building review response. | **OPEN — E.8e:** build continuation from the same request-local projection/review record; no extra full journal scan. |
| AUD-33 | **P2 docs/verifier** | Tool-count/control-plane documentation and verifier regexes can drift from the actual 133/16 catalog. | **OPEN — P1-D/release hygiene:** derive or set-compare documented public tool names/counts; do not rely on prose regex only. |

#### AUD-S1 — Truthful completion, blockers and exact-frame review authority

Implement AUD-03/04/05/17/19/24/25 as one completion/review-hardening slice; do not add a second critic or
parallel lifecycle state machine.

Requirements:

- A hostile-review `status=defect` in a completion-relevant area cannot become completion-safe merely because
  the same caller labels its `major_defect.debt_class=soft`. Either the defect is explicitly proven to be an
  allowed deviation by the exact active brief/style contract, or completion remains blocked.
- `global_brief_assessment.validation=independently-validated` requires a durable critic result whose id,
  authority class, exact frame SHA and exact artistic-contract revision all match. Caller-supplied strings are
  not evidence. Preserve P0-D human-calibration limits on what authority that critic may exercise.
- Close-only finalization must distinguish **technical operation closure** from **artistic workflow completion**.
  If unresolved visual problems, unfinished Planner tasks/directive work, pending whole-image review, unresolved
  hard brief debt or another explicit completion blocker remains, return an active/continue-required next action;
  do not emit a model-facing `ready` that contradicts durable lifecycle state.
- Compute must-fix eligibility against the full visual-problem dependency graph. A must-fix blocked by a
  should-fix prerequisite remains visible as completion debt and exposes the prerequisite as the actionable next
  blocker; filtering by severity must not erase dependency nodes.
- Pending `whole_image_glance` at stage/global/final boundaries is exact-frame debt. No later visual mutation may
  silently overwrite/supersede its required operation id/SHA before the glance is recorded or explicitly
  invalidated by a recovery/replan transition.
- For every accepted pixel-changing structural/global-sensitive pass, require whole-frame inspection even when
  significance is below the current `meaningful` threshold. For ordinary local micro-edits, preserve the bounded
  evidence path but prevent a long series of accepted sub-threshold changes from bypassing whole-frame cadence.
- Whole-frame review of structural/global-sensitive work must include the bounded **applicable** scene relations
  (support/contact, occlusion/depth, perspective/proportion, negative-space/composition as relevant). Applicability
  and affected-relation scope should be compiler/state-derived whenever durable task/owner/scene data already knows
  it. Do not introduce a mandatory prose questionnaire. The model reports observed findings/uncertainty; concrete
  evidence-backed failures become normal durable `review_findings`.

Focused regressions:

1. hostile check=`defect` + caller soft label cannot finalize without exact allowed-deviation authority;
2. forged/nonexistent `critic_result_id` cannot become independently validated;
3. close-only after a locally resolved operation but an active remaining Planner task returns continue-required;
4. must-fix A depending on unresolved should-fix B remains visible and directs work to B first;
5. stage-boundary whole-image glance blocks mutation until the exact required frame is reviewed;
6. accepted low-delta structural change still requires whole-frame observation;
7. structural relation finding created during whole-frame review blocks cosmetic masking until resolved.

#### AUD-S2 — Executable geometry and geometry opt-out authority

AUD-02/AUD-20 strengthen E.7d/E.18; do not create a duplicate perspective subsystem.

Requirements:

- For deterministic structured constructions, the Scene Geometry Model/Binding must feed the actual Photoshop
  action coordinates. Region contours, paths, transform anchors and perspective-regular module placement are
  either compiler-derived from accepted independent inputs or numerically validated against them before dispatch.
- Geometry validation must operate on the **actual compiled action payload**, not only on a parallel metadata
  model. Persist enough derivation/provenance to explain which scene constraints produced each dependent geometry
  set and to invalidate only affected dependents when a source changes.
- `flat_or_collage`, `orthographic_or_diagrammatic` and `intentional_non_euclidean` may bypass coherent-3D
  requirements only when the exact active brief/style contract authorizes that interpretation. Exact-frame review
  may confirm that the current image follows that already-authorized intent; it may not create the exception by
  itself. An enum value, caller prose or critic assertion is insufficient authority.
- Freehand/organic work remains freehand. Ask the model/user for an independent artistic choice only when no unique
  executable construction exists; never turn every brush mark into CAD.

Focused regressions/live acceptance:

- a valid two-point metadata model paired with off-family facade vertices is rejected before mutation;
- compiler-derived facade/rail coordinates change deterministically when the source vanishing/support geometry changes;
- a stale dependent module cannot continue against a new geometry revision;
- an unsupported flat/non-Euclidean opt-out cannot disable perspective debt;
- E.18 rail and architectural-facade live cases prove parameter-to-rendered-pixel agreement in Photoshop.

#### AUD-S3 — Correct Planner semantics for direct visual tools

AUD-06 must be fixed before relying on Art Director forbidden-global-change policy for direct operations.

- Replace the blanket `change_domains=['local-tone']` default with deterministic derivation from tool, impact class,
  target scope/bounds and operation semantics. Whole-canvas Curves/exposure/transform/filter operations must expose
  the global domains they can affect; genuinely local bounded changes may remain local.
- When a direct tool's artistic domain cannot be derived safely, require the compact pass to supply the semantic
  domain from a bounded enum/set and validate it against tool/scope. Do not infer permission from missing metadata.
- Tests must cover global Curves, whole-layer transform, local masked adjustment, local opacity/property change and
  an ambiguous direct visual operation under a directive that forbids composition/large-value changes.

#### AUD-S4 — Remove the mandatory extra review-image model turn

**Priority: P1-high latency.** AUD-07 is the largest remaining protocol-turn target after E.8d's completed
request-local compiler optimization, but it must not outrank the P0 correctness slices above.

Preferred design: when a completed visual cycle has review evidence that fits the bounded MCP response/image
budget, deliver the exact required image block(s) in that same semantic Guard result and record the normal delivery
receipt before returning. The model should be able to inspect the frame and make the next artistic decision without
issuing a separate bookkeeping-style tool call. Preserve `photoshop_guard_review_image` as an explicit fallback for
oversized/multiscale/partial delivery, recovery and redelivery debt.

Acceptance:

- ordinary one-whole-frame visual passes require no separate model decision/tool invocation solely to fetch bytes;
- delivered SHA/role/content identity and verdict barrier are identical to the explicit-review path;
- response-budget overflow degrades deterministically to reference-only + explicit remaining-role delivery;
- no image bytes are serialized into text; MCP image content remains the delivery channel;
- benchmark counts image delivery consistently and demonstrates the reduced model-visible round trips without
  claiming opaque host/model time as reasoning.

#### AUD-S5 — Compiler/continuation determinism after E.8d

Implement AUD-08/09/10/11/16 without broadening compiler authority beyond uniquely derivable facts.

- Extend PaintingIntent action compilation for constructions where exact action geometry/color/tool parameters are
  uniquely determined by durable owner/scene contracts; otherwise continue to require bounded model-authored action
  geometry. E.7d owns structured geometry derivation.
- Enrich continuation A/B/C with only the decision-relevant current problem region/hypothesis/dependencies,
  structural/global flag and relevant owner binding summaries. Do not dump full scene models into chat.
- Give `AUTO_NORMALIZE` and `AUTO_PATCH` typed handlers. Unknown violations remain semantic/systemic rather than
  being guessed. Record total encountered deterministic violations, locally repaired violations and unresolved ones.
- Replace text parsing in `allowedMutationCount()` with typed violation details carrying the numeric budget and
  causality/splittability facts.
- Include `working_scale` in brush-role/material compatibility so a role that is unique only after scale filtering
  can be derived locally and a scale mismatch cannot be silently chosen.

Focused tests: action compilation from unique geometry; non-unique action decision remains model-owned; continuation
projection size/fields; every AUTO class has an executor or explicit non-auto classification; split behavior is
invariant to error-message wording; scale-specific brush-role selection and ambiguity.

#### AUD-S6 — Eliminate redundant runtime reads/readiness probes

Preserve AUD-01 as a regression invariant and implement AUD-12/13/32 as one request-snapshot performance slice.

- **Keep the E.8d fix:** capture operations + painting state + active jobs once per Guard cycle and thread that
  projection through PaintingIntent compilation, compact-pass compilation, next-operation validation, repair and
  response continuation. Add a regression that counts filesystem journal/state reads so future helper additions
  cannot silently reintroduce O(N) rereads.
- Reuse the fresh UXP state witness's document id/width/height in VisualMicroPlan bounds validation; do not call
  `photoshop_list_documents` again solely for the same data.
- Introduce a bounded request/lease-scoped UXP readiness result. `backendFor()` and stable command dispatch reuse it
  while valid; force-refresh on first entry, expiry, route/revision mismatch, execution error or recovery boundary.
- Build `artisticContinuationContext` from the same request-local projection and already-known review record rather
  than rereading the operation directory/painting state.

Acceptance includes a long-session fixture (hundreds of journal records) proving filesystem reads and UXP read-only
round trips remain O(1) per semantic cycle with respect to helper count, while document-incarnation/no-replay tests
remain green.

#### AUD-S7 — Telemetry and benchmark truth before the next optimization claim

Implement AUD-14/15/26/28/31 before using benchmark deltas to close additional speed work. For AUD-27, E.8e owns
the typed deterministic-violation denominator; AUD-S7/E.8 only consumes and verifies that telemetry in benchmark output.

- End `review_image_service_ms` only after image reads/hash checks, delivery-receipt persistence, continuation
  projection and response construction are complete. The end boundary is the last synchronous server work before
  returning the tool result.
- Split video recorder start/stop/settle/FFmpeg timing from Photoshop mutation dispatch. Trace remains optional and
  cannot inflate the metric named `photoshop_dispatch_wall_ms`.
- Record automatic checkpoint save wall time and Photoshop-reported execution time as first-class components. A
  checkpoint is real Photoshop work even when it consumes no model-facing turn.
- A scoped benchmark may call run counters `complete` only when every counted event has provable selected-run
  ownership. Unkeyed events in an overlapping window make exact counters unavailable/incomplete unless a durable
  run/process identity links them.
- Verify that E.8e's typed deterministic-violation counts are scoped to the selected run and compute
  `deterministic_violations_repaired_locally_percent` from those real counters rather than `null`/inference.
- Give authoritative controller state and run-local mirror a shared monotonic revision/commit/watermark, or derive
  benchmark counters from journals. Benchmark must detect/fail closed on a stale mirror rather than silently using it.

Negative controls: concurrent mixed-prefix events; crash/failure between central and run-local state writes; video
trace enabled vs disabled; due auto-checkpoint before a visual pass; review response with an intentionally expensive
continuation projection. None may be misattributed to model reasoning.

#### AUD-S8 — Compact model-facing status/resume

Implement AUD-29 as local PaintPilot/E.8b model-facing compaction work. It does **not** wait for the later P1-D
host-neutral portability track.

- Define bounded `ModelFacingStatus` and `ModelFacingResume` projections containing only the current decision:
  next required action, pending barrier/verdict/recovery ids, exact current/accepted frame identity, checkpoint debt,
  active blocker/problem, current task and bounded relevant owner/binding summaries. Full scene/director/history state
  stays in durable diagnostics/on disk and remains available through explicit diagnostic surfaces.
- Enforce a hard model-facing byte budget in tests; warning-only behavior is insufficient for normal status/resume.
- AUD-30 remains separate E.8c work in the sibling COS host: protected control-plane publication and meaningful
  schema headroom are parallel cross-project requirements, not a prerequisite for this local status/resume DTO.

#### AUD-S9 — Recognition, imaging and world-consistency obligations

Implement AUD-18/21/22 without converting artistic uncertainty into universal hard blocking.

- For a brief with named/recognizable subject requirements, persist a recognition milestone tied to exact current
  frame evidence. Later FORM/VALUE/MATERIAL/DETAIL progression must consume that milestone or an exact active
  brief/style exemption; entering a later stage must not silently skip recognition-first policy.
- `imaging_preflight.outcome=review-required` must create a real pre-mutation review/replan obligation rather than
  being treated like a non-conflict pass-through. `revalidate_edge_detail=true` creates a post-mutation exact-frame
  review debt that must be satisfied before the affected edge/detail quality can be called complete.
- Keep world-consistency evaluation advisory under uncertainty/stylization, but provide a canonical conversion from
  concrete evidence-backed conflicts into `review_findings` with the same debt/priority machinery as other observed
  spatial failures. Do not let an advisory critic directly invent hard debt without evidence.

#### AUD-S10 — Policy/docs coherence and verification

Implement AUD-23/AUD-33 and the existing AGENTS/runtime review-image mismatch as maintenance work, not runtime logic.

- Make `AGENTS.md`, host guidance and runtime agree on strategy-validation cadence: if the threshold is guidance/
  telemetry, do not instruct agents that it is a forced barrier; if it becomes a barrier again, runtime/tests must
  implement that exact rule.
- `AGENTS.md` normal-loop text must match the actual reference-only vs inline-image behavior chosen by AUD-S4.
- Replace prose-only tool-count checks with a generated/set-comparison verifier for the public catalog and Guard
  control-plane names. Canonical docs should not retain stale 130/14, 131/15 or incomplete Guard lists when runtime
  is 133/16.

Do not close this audit block from unit tests alone. P0 correctness items need the same representative live-art
failure shapes they protect (perspective/facade, structural defect, completion, exact-frame review). P1 speed items
need scoped telemetry showing the expected round-trip/read reduction without weakening safety or quality evidence.

**Optimization non-goal from the same audit:** do not start by rewriting the accepted UXP long-poll transport,
brush execution or JPEG encoding merely because they are low-level. The measured bottleneck is orchestration and
decision delivery unless new split telemetry proves otherwise. Optimize a lower layer only after its measured share
is material in the current benchmark and the higher-level round-trip/read issues above are controlled.

### P1-E.22 — FFmpeg Visual Process Trace: live acceptance only

**Status: per-action capture reliability live-accepted; broader chronology/assembly acceptance remains. Priority:
after the active image-quality gates.** Historical implementation detail belongs in `CHANGELOG.md`; the remaining
forward gate is the real Photoshop+FFmpeg chronology run below.

Live 2026-10-02 acceptance already proved the recorder's critical capture lifecycle on two consecutive real Guard
visual mutations. The production path is still **one clip per actual visual mutation**, not continuous whole-run
recording. `gfxcapture` targets the Photoshop HWND through Windows Graphics Capture, Photoshop may remain behind
other windows, and recorder shutdown uses bounded `q` handling plus a non-activating `RedrawWindow(HWND)` wake only
when WGC is blocked waiting for another frame. Warm-up/shutdown wake frames are trimmed from the retained clip.
The accepted regression produced valid H.264 clips for both background and foliage operations in `run-04`; the old
48-byte/unfinalized-MP4 failure is therefore closed. Current operating constraint: the Photoshop window must remain
open/non-minimized during capture; foreground activation is not required.

Live acceptance must use one multi-pass painting run containing at least two successful visible mutations,
one visibly unsatisfactory/incorrect attempt, and a later correction or rollback. Verify that:

1. capture is bounded around real Photoshop visual mutations and does not preserve long planning/idle gaps;
2. the captured target is the Photoshop window/content rather than unrelated desktop content;
3. every retained clip has the exact Guard operation identity and chronological manifest entry;
4. viewer-facing captions come from pre-operation artistic intent, not MCP/tool/receipt plumbing;
5. failed attempts remain visible before their later correction/rollback;
6. interruption/resume does not duplicate or reorder retained operations;
7. recorder/FFmpeg failure cannot block, replay or bypass the canonical Guard mutation;
8. the final MP4, SRT and manifest are rebuildable from retained run-local trace inputs.

The first two requirements now have direct live evidence for consecutive production Guard mutations. The remaining
acceptance burden is specifically: failed-attempt chronology, correction/rollback retention, interruption/resume
ordering/idempotence, and deterministic final MP4/SRT rebuild from the retained run-local clips and manifest.

Optional TTS remains a presentation layer over the same artistic-intent chronology, not a second semantic
source of truth.

### P1-E.18 — Scene Perspective Model: live acceptance and real-paint enforcement

**Priority: E.7d construction integration, then live spatial correctness. Existing validation/helper
implementation is complete; execution derivation and its quality/time proof remain forward work. Historical
E.18e/f/g/i implementation detail belongs in CHANGELOG.md.**

The deterministic geometry helpers, Scene Geometry Binding, selective structural invalidation, Surface Frame
integration, exact-evidence preflight and repository regression packs are implemented. The remaining work is
to connect those helpers to actual dispatched shapes under E.7d and prove the resulting construction in live
Photoshop. Passing manually supplied geometry metadata is insufficient.

The 2026-10-01 night-city run adds a second live failure shape to the original railway case: a durable scene
vanishing model existed, but individual building silhouettes/facade bottoms were still hand-guessed as screen
coordinates, so the lower geometry drifted and later windows did not make the building volumes readable.
Treat this as failed live acceptance, not as evidence that E.18 is done.

Live acceptance must demonstrate both:

- **rail/support case:** actual current Photoshop rail/support pixels derive one corridor; near/mid/far
  dependent analytic geometry is recomputed or rejected when its executable inputs reference an obsolete
  projection; changing source convergence marks affected dependents stale without requiring redundant prose;
- **architectural facade case:** building ground contacts, facade planes and perspective-regular dependent
  modules derive from the current Scene Geometry Model/Surface Frame. Windows/doors/courses may be regular
  only inside the bound facade grammar; they must not be placed as independent screen-space guesses. Changing
  the facade/support geometry invalidates the dependent modules.

The accepted live trace must use actual current Photoshop pixel coordinates, expose durable stale debt through
status/resume, and show that invalid analytic inputs cannot silently generate dependent detail. Qualitative
spatial uncertainty directs image review/reconstruction under E.7c; safe repair must remain possible without
first declaring the spatial problem solved.
### P1-E.19 — Remaining Lighting/Color Acceptance Work

Repository implementation for the Scene Lighting & Color Model, material/light bindings, selective causal
invalidation, geometry→lighting dependency propagation, provenance-aware color/gradient preflight and the
repository regression pack is complete and recorded in CHANGELOG.md.

Repository admission coverage now also includes global direct color-adjustment routes (hue/saturation,
vibrance, exposure, photo filter, gradient map and LUT), closing the known bypass beyond the existing
gradient/atmosphere/optical-effect/global-lighting categories. The blank-canvas first-visible-progress exemption
remains intact.

The existing implementation must also follow E.7c's separation of technical admission from qualitative
artistic judgement. Retain useful shared lighting state; do not make each safe color/brush experiment depend
on a freshly authored causal explanation. Forward acceptance remains:

1. **Live Photoshop acceptance** once the UXP companion is ready. Demonstrate that exact RGB values remain
   legitimate artistic choices while value role, source, material interaction, atmosphere and palette
   relationships remain durable, inspectable and revisable. Do not substitute repository tests for this live gate.

Russian design note: [Как живой тест изменил процесс: перспектива и цвет](ru/process-revision-perspective-color.md).

### P1-E.17 — Brief-fidelity completion correctness: active hardening + live/benchmark gate

**Priority: P0/P1 completion correctness.** Earlier repository slices are archived in `CHANGELOG.md`, but E.17 is
active again for AUD-S1/AUD-S9 correctness hardening before its remaining live/benchmark acceptance.

The durable hard-perceptual brief debt, named-object recognition evidence, E.18-backed geometry completion
debt, E.19 physical/optical accountability, hostile pre-final review, problem-local corrective history,
construction-plan escalation and structural-mismatch cosmetic one-shot gate are implemented.

E.7c revises the admission use of corrective-attempt/escalation metadata. Preserve observed defects,
attempt history, best-frame recovery and truthful completion; replace count/label-driven mutation vetoes
with image-based corrective decisions. A safe structural repair must not require new narrative certification.
The night-city run had no persisted Art Director directive: quality review and truthful STOP must also work
in the ordinary compact loop without making another director setup sequence mandatory.

After the AUD-S1/AUD-S9 repository hardening, the remaining live/benchmark work is:

1. run a fresh live Photoshop reproduction of the snow-temple failure shape: saved/exported/Guard-clean but
   with an unrecognizable required object, inconsistent perspective, physically unclear effect or visibly
   unmet requested realism must end in `CONTINUE_REQUIRED`, not `FINALIZE_NOW`;
2. run a positive control where all hard prompt items are genuinely met and prove that the agent can stop
   promptly instead of manufacturing optional polish;
3. integrate the live result with Task 22 target-fidelity acceptance and Task 8b STOP/FINALIZE calibration
   rather than creating a second perceptual score.

`SAVE`, `EXPORT`, clean Guard debt, successful preview capture and green technical checks remain delivery
state, not artistic completion evidence.
### P1-E.14 — Finish effective tool/brush breadth and prove it live

**Priority: secondary after the active correctness/quality critical path.** Finish selection-audit, live-breadth or
pressure-response work when a demonstrated rendering need warrants it; do not delay E.17/E.18/E.7d correctness or
the matched quality/time proof merely to expand tool diversity. Do not rebuild the existing brush-selection machinery.

Remaining work:

- audit method-selection behavior from existing evidence and focused experiments when needed; do not require
  a model-authored rejected-candidate list before every painting pass;
- use broader scene/style/recent-use context only where it materially improves causal fit; do not add
  random diversity pressure;
- run a real Photoshop breadth exercise against the installed preset inventory and prove that several
  materially distinct mark footprints are considered and used when appropriate;
- exercise evidence-backed simulated/native pressure or other dynamics in a pass where they visibly
  matter;
- verify that `paint_regions` naturally recedes after block-in when later work calls for a more suitable
  mark vocabulary;
- add new method families only if the live report identifies a concrete artistic bottleneck. Do not add
  mixer/clone/other primitives merely for catalog completeness.

Acceptance: broader **effective** mark/tool use is demonstrated in better rendered pixels without random
switching, lower artistic quality, or weakened technical safety. Tool diversity alone is not success. Any
pressure-response profile promoted into brush/tool selection memory must be backed by the live rendered
result for that exact tool/settings class rather than inferred only from API signatures or tool names.

#### E.14a — Pressure-response profiling for stroke tools

**Problem.** The existence of Photoshop's `simulatePressure` flag in the UXP/path-stroking API does not
prove that every compatible tool produces a useful or even visible pressure-dependent response. PaintPilot
needs evidence for what each tool actually does, not only evidence that the API accepts the flag.

**Goal.** Build an evidence-backed pressure-response profile for stroke tools and make that profile available
to brush probing, tool selection and causal pass planning.

Implementation / experiment:

- use an identical path and matched tool settings to compare `simulatePressure=false` versus
  `simulatePressure=true`;
- test the currently exposed stroke tools first: `BRUSH`, `PENCIL`, `ERASER`, `SMUDGE`;
- then, only where the backend/UXP route is actually implemented and live-proven, evaluate additional
  `strokePath`-compatible tools such as Blur, Sharpen, Dodge, Burn and Sponge;
- record what actually changes for each tool, including where measurable:
  - footprint / width;
  - opacity / density;
  - effective strength of the tool effect;
  - accumulation / buildup;
  - texture reveal;
  - edge character;
  - response profile along the path;
- record whether the result depends on the active Photoshop tool/brush settings;
- compare Photoshop-native `simulatePressure` against PaintPilot's segmented dynamics
  (`size` / `opacity` / `flow` ramps) as two distinct mechanisms rather than treating them as equivalent.

Constraints:

- undocumented per-point stylus samples (`pressure`, `tilt`, `bearing`) are not part of the production
  contract until a reproducible live Photoshop/UXP experiment proves such a channel;
- do not document or depend on a specific `simulatePressure` curve shape unless it is measured from the
  actual rendered result;
- API signature support is capability evidence only, not behavioral evidence.

Acceptance:

- every promoted tool pressure-response profile is backed by a live rendered before/after comparison for
  that exact tool/settings class;
- the profile states explicitly when `simulatePressure` has no meaningful visible effect;
- brush/tool selection can consume the observed profile without inferring behavior from tool names;
- documentation clearly distinguishes Photoshop-native simulated pressure from PaintPilot segmented
  dynamics.

### P1-E.7 — Replace orchestration-heavy painting with useful visual passes

**Status: ACTIVE / PARTIALLY IMPLEMENTED.** E.7a and substantial E.7c slices are complete; E.7b, the remaining
E.7c cleanup, E.7d executable derivation and E.7e artistic proof remain forward work. E.11 live ownership proof
remains the prerequisite for widening rollback scope under E.7b.

Supersedes the former coverage/underfill proposal. Do not implement mandatory `pass_coverage`, defer-reason
lists or `semantic_pass_underfilled` admission. Increasing paperwork to force use of an action budget would
preserve the expensive loop. Extend the existing compiler/executor and retire superseded normal-path checks;
do not add a parallel fast mode, recipe engine, controller, agent or model-driven retry wrapper.

Evidence: the night-city journals contain 14 successful operations, including 11 microplans with exactly one
painting mutation each and a separate blur. Elapsed time was 29:10; successful cycles totalled 77.001 s,
preflight 35.647 s, dispatch 12.826 s. Dispatch includes embedded previews in some microplans. Uninstrumented
gaps cannot be attributed entirely to model reasoning. The persisted stage remained GLOBAL_BLOCK_IN despite
six locally resolved problems, and no Art Director directive was registered. These are execution observations,
not an independent quality score or proof that every delay had the same cause.

Remaining mechanisms to change, rather than wrap with more orchestration:

| Existing mechanism | Source | Planned replacement |
| --- | --- | --- |
| One method class / one created layer | `src/core/guard/cycle-compiler.ts` | E.7b connected, recoverable mixed passes |
| Global-scale mutation contraction | `src/core/visual-microplan.ts` | E.7b actual execution/risk/observation bounds |
| Manually supplied geometry binding/control sections | `src/core/geometry-preflight.ts`, `src/core/geometry-math.ts` | E.7d one derivation feeding real shapes |
| Artistic admission and declared escalation thresholds | `src/core/guard/cycle-compiler.ts`, `src/core/guard/session-store.ts`; E.17g in `CHANGELOG.md` | E.7c observed correction/completion without per-mutation certification |

The old `pass_coverage` proposal was roadmap work, not an implemented blocker. Art Director-specific gates
are not established causes of this particular run's delay because its persisted directive is absent.

#### E.7a — Close observations once; automate routine persistence

**COMPLETE (2026-10-01); keep only as a regression invariant.** Previous observation closure is independent and
idempotent across a rejected next plan; invalid observation/evidence cannot unlock mutation; routine due checkpoints
are saved/verified internally before the next visual mutation; failed/uncertain save preserves recovery state and
never causes replay. Historical implementation detail belongs in `CHANGELOG.md` and the acceptance matrix.

#### E.7b — Batch by visual dependency and recovery scope, not tool labels

- After E.11 proves rollback/partial-outcome ownership, remove the blanket one-method-class and one-created-
  layer restrictions for supported bounded sequences. Permit connected fill/region/brush/filter work and
  several separately editable owners in one pass when all actions can be specified before seeing a result.
- Replace scale-only contraction (including global=2) with bounds tied to actual execution cost, destructive
  risk, recoverability and required observation. Keep finite payload/time limits and interruption points;
  do not merely raise constants or execute an entire painting without visual feedback.
- Pin every target. Derive new-layer references and ownership bookkeeping internally; retain protected-layer
  checks and exact action receipts. Never flatten unrelated owners for convenient rollback or lower call count.
- Return one final whole-frame preview, with only necessary focused evidence. Split when a later artistic
  decision genuinely depends on an intermediate image. Keep individual mutations recoverable if execution
  stops partway; do not claim atomicity unless the backend proves it.
- Verify a mixed-method/multi-layer additive pass, an intentionally one-action correction, an intermediate
  visual dependency, a protected-target refusal and a mid-pass failure. No minimum action/stroke quota.

#### E.7c — Keep execution safety; remove per-mutation artistic certification

Separate existing responsibilities inside the current Guard; this is not a second policy service:

- **Blocking execution checks:** document/incarnation and target identity, protection/authorized destructive
  scope, valid executable arguments, runtime readiness, bounded execution, evidence integrity, locks,
  persistence and uncertain-outcome/no-replay recovery.
- **Artistic guidance:** qualitative geometry/light/material explanations, method rationale, stage labels,
  strategy-validation cadence and declared causal escalation levels. Keep useful shared facts and actual
  visual findings; remove missing prose/labels or attempt-count thresholds as standalone mutation vetoes.
  Derivable method/risk/ownership metadata belongs to the compiler, not duplicate model fields.
- **Observed quality/completion:** retain honest before/after observation, best-frame recovery, unresolved
  brief defects and image-based correction/STOP decisions. A failed image should lead to a changed visual
  attempt or rollback, not schema repair. Known unresolved hard requirements must still prevent an unqualified
  completion claim. Support this in the normal compact loop without mandatory Art Director initialization.

Specifically revisit existing E.17 cosmetic-one-shot/construction-exit escalation checks: preserve the defect
and exhausted-strategy history but remove the need to certify a numerical escalation level to try a safe
repair. Repeated texture/blur over unresolved form should change the next artistic action, not start another
metadata negotiation. Do not discard truthful observations to satisfy a validator.

**Completed E.7c slices are archived in `CHANGELOG.md` and the acceptance matrix.** The implemented split already
makes free-form rationale/commentary fields non-authoritative where structured execution/evidence state is sufficient,
keeps strategy-validation cadence as guidance/telemetry rather than a count-only mutation barrier, preserves durable
stage/owner/recovery authority, and derives several unambiguous construction/material facts in the compiler.

Forward E.7c work is limited to:

- remove any remaining prose/label-only mutation vetoes that do not change executable authority, evidence or recovery;
- keep structured scene/owner/protection/destructive/recovery facts fail-closed;
- synchronize `AGENTS.md`, tests and public schemas with the implemented policy so stale instructions do not
  reintroduce narrative gates;
- integrate AUD-S1/AUD-S3 review and Planner fixes without turning them into another mandatory per-pass questionnaire.

**Observed-quality enforcement is partially complete:** meaningful passes require whole-frame evidence, observed
`must-fix` findings become durable visual-problem debt, structural findings can block cosmetic masking, and internal
workflow state remains active while debt exists. AUD-05/17/19/24/25 remain open because model-facing close-only
semantics, dependency selection, exact-frame glance barriers and broader structural/global-sensitive review still need
the audit hardening defined above.

Retain deterministic constraints necessary to execute a chosen analytic construction correctly (E.7d).
Do not confuse these with mandatory declarations that an ordinary brush experiment is artistically justified.
Remove superseded rejection expectations from maintained tests and conflicting agent policy when implementing
this change; this roadmap edit alone does not alter current runtime or AGENTS instructions.

#### E.7d — Compute dependent geometry once and use it to draw

**Admission-side progress, 2026-10-02:** committed spatial-owner construction is no longer allowed to bypass scene
geometry merely by choosing a brush/continuous-field mechanism or omitting `structured-mass`. A coherent
one/two/three-point scene must establish the matching number of distinct vanishing-point families and the committed
owner must carry a current Geometry Binding before mutation. This closes the "start the facade by eye, notice the
perspective later" admission hole. E.7d itself remains open until the accepted geometry is also used to derive or
verify the actual region/path/stroke coordinates below; valid metadata beside hand-guessed polygons is still not
acceptance.

- Reuse E.18/Surface Frame and existing geometry-math helpers. Supply independent construction inputs once;
  derive dependent coordinates, control sections and bindings internally from the same source.
- Feed derived geometry into the actual region/path arguments. Valid anchors beside unrelated hand-guessed
  polygons are not acceptance. Reuse the derivation for facade modules, contacts and supported depth scaling.
- Keep selective invalidation: a changed source recomputes affected dependents or reports the precise
  unsolvable executable constraint. Do not require a separate model-visible calculation/preflight round.
- A helper may reject impossible numeric inputs; it must not silently invent missing artistic choices or
  turn organic/freehand marks into a mandatory CAD model. Ask for a missing independent choice only when
  execution cannot proceed without it. Verify parameter-to-rendered-pixel agreement in E.18 live acceptance.

#### E.7e — Reach form/material quality, not a faster pictogram

Use the existing brief and observed image to choose the next visual experiment. Recognition-first is an early
milestone, not the finish criterion. After recognition, resolve the largest visible deficit in form, value,
lighting, material or edges before unrelated decorative detail; a connected batch may address several together.
No new mandatory pass questionnaire, tool quota or realism taxonomy is required.

For the attached night-city baseline, the positive comparison must visibly improve:

- coherent facade planes, ground contacts and depth, rather than flat bent building silhouettes;
- vehicle volume, plane transitions, contact and light response rather than repeated polygonal symbols;
- light interacting with nearby surfaces, controlled highlights/shadows and plausible separation of materials;
- wet-road reflections tied to their sources and perspective, with surface breakup and edge variation rather
  than isolated uniformly blurred color strips;
- focal hierarchy and distance-dependent edge/detail distribution without hiding broken structure in haze.

These are criteria for this brief, not universal demands for photorealism. Intentional flat/stylized requests
remain valid. Preserve composition, recognition and editable structure while improving the requested finish.
E.14 supplies already-supported useful mark/selection/mask/compositing methods; more polygons, noise, stamps,
blur, tool diversity or a FORM/MATERIAL stage label alone do not demonstrate improved rendering.

Quality review occurs on actual previews at meaningful visual decisions and at completion. Reuse existing
whole-frame/crop and best-frame mechanisms. Do not add another critic call after each tool or let a package
contain speculative downstream decisions. Independent human comparison under E.8 determines whether the
redesigned workflow actually beats this image; producer self-verdicts cannot establish that claim.

### P1-E.6 — Owner-stack corrective transaction ergonomics

**Priority: medium. E.1/E.2 ownership authority is complete.** Keep the current one-mutation safety budget
for medium/high-risk ERASE when transactional proof is absent. Add an ergonomic path only for an
identical bounded correction intentionally applied across layers belonging to the same verified owner or
correction group.

Requirements:

- prove every target layer belongs to the same owner/correction group;
- use identical, source-bounded carve/mask geometry;
- dispatch as one semantic mutation only when the backend can guarantee all-or-nothing behavior;
- otherwise retain one-layer-per-cycle fail-closed behavior;
- keep one inspectable before/after review and reconcile any uncertain partial execution without replay.

### P1-E.11 — Semantic pass/history ownership

**Priority: prerequisite for E.7b mixed-method/multi-layer dispatch.** Resolve the mismatch between one Guard
semantic pass and Photoshop history. Existing multi-mutation execution does not prove one reliable Ctrl+Z
state, particularly across created layers, different tools or partial failures.

Acceptance requires live evidence for one of two safe outcomes:

- a semantically atomic pass is committed as one Photoshop history state; or
- Guard durably records the exact contiguous history-state span owned by that pass and exposes an exact
  rollback handle, including for temporary hypotheses.

Do not group history at the cost of uncertain-execution/no-replay semantics, and never roll back across an
earlier accepted operation merely to obtain a convenient one-step undo.

Include interrupted/partial mixed-method and multi-layer passes in the proof. Preserve separate owners and
an exact retained/rolled-back action outcome; unsupported destructive combinations remain bounded rather
than blocking the supported additive path. Reuse the existing journal and UXP history capabilities.

Repository plumbing is complete and archived: semantic passes persist exact/unproven/partial history ownership,
exact ownership drives rollback handles, and unproven/partial ownership cannot enter a zero-step pseudo rollback.
The **only forward E.11 gate** is live Photoshop proof that an `exact` receipt corresponds to the real contiguous
host-history span and that normal/interrupted rollback stops exactly at the semantic-pass boundary before E.7b
widens mixed-method/multi-layer execution.

### P1-E.8 — Quality/time comparison and rejection-path throughput

**Priority: run the matched comparison after the owning E.7/E.11/audit changes.** The baseline is already frozen;
do not create another baseline task. This track measures whether the revised system reaches a visibly better image
sooner; it is not another runtime preflight or mandatory instrumentation project.

Frozen reference: [user-supplied night-city image](../processes/documentation-maintenance-process/pre-quality-speed-roadmap-20261001T145358Z/night-city-user-baseline.png).
The [pre-revision roadmap](../processes/documentation-maintenance-process/pre-quality-speed-roadmap-20261001T145358Z/PAINTING-ROADMAP.md)
preserves the superseded plan verbatim. Original run evidence remains under
`processes/night-downtown-city-process/run-01/` and `.photoshop-runtime/controller/operations/night-downtown-20261001-*.json`.
These local artifacts are acceptance inputs, not guaranteed public distribution assets; package the exact
reference/brief with the eventual review bundle rather than silently substituting another image.

Use the original brief/settings from run evidence where available, record any unrecoverable inputs and do
not invent missing reference/style requirements. Compare fresh runs from a matched starting document, with
the same host/model settings, canvas and available tools. Continuing the existing scaffold is a useful
diagnostic but is not a from-scratch speed benchmark. Record environment differences and interruptions.

Evaluate both:

1. **Equal wall time:** at the baseline's approximately 29:10 budget, the new image must be independently
   preferred for the requested rendering/finish and the E.7e deficits, without loss of composition/recognition.
2. **Time to quality:** record the earliest evidenced frame reaching baseline quality and the earliest frame
   meeting the predeclared improved-quality criteria. The target is a better-than-baseline image before the
   old time budget, not merely a faster block-in. Report unmet targets honestly; no speed multiplier is assumed.

Give the user/independent human the brief and randomized A/B whole frames plus necessary equal-scale crops,
without timing, operation-count or producer-verdict cues. Use qualitative item judgements and preference,
not a universal numeric quality score. E.17/Task 22 own prompt fidelity; Task 23/15d.3 supply existing
form/material controls. A human-unavailable result remains perceptually unverified, not artistically passed.

Negative controls: faster same scaffold; extra windows/regions without form; noise/detail/blur over defective
geometry; empty stage advancement; a model saying "improved" without visible gain. All fail the quality claim.
An intentionally flat brief remains a positive control against indiscriminate realism enforcement.

Report total wall time, time to first useful frame and to the compared quality milestones, model-visible
round trips (including rejection/bookkeeping/recovery), pre-dispatch failures, existing execution timings,
and request volume when available. Missing counters are unavailable, not zero. Do not sum overlapping timing
fields or attribute opaque inter-call gaps to reasoning. Detailed E.8a timing is secondary unless the remaining
measured bottleneck warrants it. Repeat a successful matched comparison on the homestead or another existing
holdout before claiming general improvement; do not launch a broad benchmark matrix by default.

#### E.8a — Split visual-confirmation telemetry

**Partially deferred.** The full mutation/pixel/encode/transport split is still secondary until a remaining measured
bottleneck justifies it. However, the audit accuracy fixes in AUD-S7 are active now: video-trace overhead,
automatic-checkpoint time, review service boundaries and run-attribution correctness must be separated before those
metrics are used to justify or close further optimization work.

**Problem.** Current cycle timing can combine Photoshop mutation work with preview acquisition and
materialization, making it difficult to identify whether latency comes from the mutation itself, pixel
acquisition, image encoding or transport back to the agent.

**Goal.** Split visual-confirmation telemetry into independently measurable stages so performance decisions
are based on observed cost rather than one aggregate wall-time number.

At minimum add separate measurements for:

- `mutation_dispatch_ms`;
- `preview_get_pixels_ms`;
- `preview_encode_ms`;
- `preview_transport_ms`;
- `focus_crop_get_pixels_ms`;
- `focus_crop_encode_ms`;
- `focus_crop_transport_ms`.

Also record the evidence shape for each visual cycle:

- reduced whole-frame preview only;
- whole frame + one local/object crop;
- whole frame + object-context crop + micro/detail crop.

Requirements:

- keep Photoshop mutation timing distinct from read-only visual-confirmation work;
- keep whole-frame and local-crop costs distinct;
- expose the split in Guard/runtime telemetry and the maintained latency benchmark;
- do not infer model reasoning time from uninstrumented gaps;
- preserve the existing preview/verdict barrier and evidence provenance while instrumenting the path.

Acceptance:

- one meaningful visual cycle can report mutation latency, whole-frame confirmation latency, local-crop
  latency and total confirmation overhead separately;
- benchmark output can compare whole-frame-only, whole-frame-plus-local and multiscale confirmation modes
  without conflating them with mutation cost;
- performance work can identify whether a regression belongs to Photoshop dispatch, pixel acquisition,
  encoding or transport before proposing an optimization.

#### E.8b — Compaction-safe continuation: remaining COS/live gate

**Priority: high / cross-project for host compaction/resume.** PaintPilot-side checkpoint/resume/timeline projection
plus opt-in continuation-phase diagnostics are complete and recorded in CHANGELOG.md. AUD-S8/AUD-29 is a separate
local PaintPilot follow-up for model-facing status/resume payload size and does not wait for this host work.

PaintPilot now records explicit review-image request/result-ready boundaries and can, in benchmark mode only,
record server-observed `review_finished` and `next_pass_ready` markers through the existing
`photoshop_guard_status` surface. The timeline therefore can partition
`preview/review delivery -> review-finished marker -> next-pass-ready marker -> next Guard call` without
pretending those intervals are pure model-reasoning time. These marker calls are **not** part of the normal hot
loop and must not become mandatory painting overhead.

The remaining **compaction/replacement-chat** work is host-owned in the sibling `chat-on-steroids-FORK`:

- persist/inject the existing compact continuation checkpoint at the actual ChatGPT compaction boundary;
- automatically resume from that exact document/incarnation/operation/frame rather than performing routine
  journal archaeology;
- add a bounded watchdog so a failed replacement-chat resume enters recovery within seconds/tens of seconds,
  never a silent multi-minute idle interval;
- join COS compaction/replacement/resume/recovery events to PaintPilot's existing Guard timeline export and,
  where available, provide host-native review/planning boundaries without diagnostic marker round trips;
- remove or make asynchronous fixed connector-attribution waits that delay an otherwise healthy Photoshop call.

Live acceptance must reproduce the 2026-09-30 failure shape and prove:

1. a ready visual frame normally reaches the next bounded artistic decision in seconds;
2. forced compaction resumes from the exact pending operation/frame without replay;
3. failed resume enters bounded recovery promptly;
4. the latency report separates host/model activity, compaction, failed resume, post-failure idle, recovery,
   Guard work and Photoshop dispatch instead of one opaque multi-minute bucket;
5. attribution/recording does not impose repeated fixed waits on healthy Photoshop work;
6. document-incarnation, preview/verdict and no-replay invariants remain green.

#### E.8c — COS schema-budget-safe publication of critical Photoshop/Guard tools

**Priority: high / cross-project. Reproduced live on 2026-10-01. Implementation owner: sibling
`chat-on-steroids-FORK`; PaintPilot owns the representative Photoshop MCP catalog and acceptance fixture.**

**PaintPilot-side mitigation, 2026-10-02:** model-facing `tools/list` descriptions are now compacted without
changing internal schemas or tool semantics. Raw Guard-only mutations publish the Guard route plus only the first
purpose sentence, while the three largest orchestration schemas (`photoshop_execute_visual_microplan`,
`photoshop_guard_cycle`, `photoshop_guard_cycle_auto`) publish one-sentence field descriptions. After the
2026-10-02 structural-contract and continuation-diagnostic fields were exposed, the current full 133-tool catalog
measures **249,865 bytes**, leaving only **135 bytes** below the 250,000-byte regression ceiling.
This restores complete publication for the current PaintPilot catalog, but does **not** close E.8c: COS still needs
deterministic protected-capacity behavior when future schema growth exceeds the host budget.

**Reproduced failure.** The current `Photoshop MCP - Digital Painting` server exposes a catalog of **133
upstream tools**, comfortably below COS's nominal **256-tool** count ceiling, yet ChatGPT can still receive only
a prefix of that catalog because COS also enforces an aggregate published-tool schema budget of approximately
**250 KB**. In the reproduced catalog order, `photoshop_guard_art_director` appears near the tail and is omitted
even though it exists upstream, is enabled, and is required by an active Guard interrupt. Temporarily disabling
an unrelated earlier tool makes Art Director fit, proving that the failure is schema-budget/order dependent
rather than an absent Photoshop/MCP capability.

This is a host exposure bug, not a reason to weaken Guard or manually curate tools during ordinary painting.
The host adapter must treat the Photoshop **control plane** as protected capacity when the entire catalog cannot
fit. Do not rely on alphabetical/registration order, manual checkbox juggling, or the user knowing which
unrelated tool to disable.

At minimum guarantee publication of the currently required control-plane set whenever the Photoshop plugin is
enabled and healthy:

- `photoshop_ping` and the bounded state/read surfaces required to establish the active route;
- `photoshop_guard_status` and `photoshop_guard_resume`;
- `photoshop_guard_cycle` and `photoshop_guard_cycle_auto`;
- `photoshop_guard_review_image` and `photoshop_guard_job_poll`;
- `photoshop_guard_reconcile`;
- `photoshop_guard_set_priorities`;
- `photoshop_guard_art_director`;
- any other tool that the current Guard state can name as a **mandatory next action** must either be protected
  by the same exposure policy or have one documented protected replacement route.

The implementation may reserve schema budget for protected tools, prioritize/reorder publication, compact
host-facing schemas without changing tool semantics, or introduce another bounded host-level exposure strategy.
It must not silently change the canonical MCP contract, disable safety/recovery tools, or require PaintPilot to
fork its tool semantics for COS.

**Acceptance — current 133-tool regression fixture:**

1. Start from the current `Photoshop MCP - Digital Painting` catalog with **133/133 upstream tools enabled**;
   no acceptance run may pre-disable `photoshop_guard_lint_next_pass`,
   `photoshop_execute_visual_microplan`, or any other ordinary tool merely to create room.
2. Restart only the Photoshop MCP child, then perform the normal ChatGPT/COS **Refresh tools** flow.
3. Verify that the protected control-plane tools above are all callable from ChatGPT in the same plugin session,
   including `photoshop_guard_art_director`, while the upstream catalog still reports 133 tools.
4. Verify the result under at least one deliberately reordered/shuffled catalog fixture: protected-tool exposure
   must be invariant to registration order and must not depend on Art Director appearing before the byte cutoff.
5. Add a boundary regression where non-critical schemas are enlarged enough to exceed the host's aggregate schema
   budget. The host must keep the protected control plane exposed and explicitly report which lower-priority tools
   were omitted and why; omission must never be silent.
6. When the full catalog fits, preserve ordinary complete exposure. When it does not fit, degradation must be
   deterministic and diagnosable rather than first-N-by-byte-budget behavior.
7. Reproduce the original painting interruption: an active Guard state requiring Art Director review must proceed
   through the protected Art Director route without manually changing plugin tool checkboxes, restarting Photoshop,
   weakening the Guard interrupt, or starting a replacement painting workflow.
8. Keep the nominal tool-count ceiling and schema-byte ceiling separately visible in diagnostics so UI text such as
   "up to 256 tools" cannot imply that count is the only effective exposure limit.

Do not close E.8c from unit tests alone. The final gate is a live COS + ChatGPT + current 133-tool Photoshop MCP
session that reaches the previously blocked Art Director review through the normal production route.

#### E.8d — Hot-loop orchestration compiler and deterministic repair

**COMPLETE engineering milestone (2026-10-02); do not reopen it as a catch-all.** E.8d established
`PaintingIntent -> NextPassCompiler -> durable-state injection -> bounded local validation/repair -> Guard`,
safe deferred split after review, typed repair classes, rejection-without-recovery semantics, continuation candidates
and hot-loop telemetry. The accepted live run reached 1.25 model-visible Guard round trips per artistic mutation and
removed the repeated global state/history scan by reusing the captured cycle projection.

Regression invariants:

- one captured operations/state/jobs projection is reused through a semantic Guard cycle (AUD-01);
- deterministic repair stays bounded, no-replay and fail-closed on semantic/systemic ambiguity;
- deferred work never auto-runs before post-review selection;
- pre-dispatch rejection never masquerades as reconcile/recovery;
- E.8d latency acceptance does not substitute for E.8/E.10 artistic-quality evidence.

Historical implementation detail and exact benchmark numbers belong in
`docs/PAINTING-HOT-LOOP-OPTIMIZATION-PLAN.md`, `docs/hotloop-final5-20261002-benchmark.md`,
`CHANGELOG.md` and the acceptance matrix.

#### E.8e — Post-E.8d hot-loop hardening

**Status: ACTIVE follow-up.** This is the owner for newly audited hot-loop issues; it does not invalidate E.8d's
completed milestone.

Implement:

- **AUD-08:** deterministic action compilation only when geometry/color/tool parameters are uniquely derivable;
- **AUD-09:** bounded decision-relevant continuation A/B/C context without full scene dumps;
- **AUD-10:** real typed `AUTO_NORMALIZE` / `AUTO_PATCH` executors for proven deterministic violations;
- **AUD-11:** typed mutation-budget/splittability details instead of parsing human error strings;
- **AUD-12:** reuse fresh document bounds/state witness instead of a duplicate documents-list read;
- **AUD-13:** bounded request/lease-scoped UXP readiness reuse with forced refresh on expiry/error/recovery;
- **AUD-16:** include `working_scale` in deterministic brush-role/material resolution;
- **AUD-27:** record the deterministic-violation denominator needed for truthful local-repair percentages;
- **AUD-32:** build artistic continuation from the same request-local projection/review record.

Preserve AUD-01 as a regression invariant rather than implementing it again. Acceptance is the focused AUD-S5/AUD-S6
test set plus the existing no-replay, uncertainty, incarnation, protection, geometry, material and visual-review
regressions. Do not claim an artistic gain from E.8e telemetry alone.

### P1-E.10 — Maintained homestead regression and completion gate

**Priority: final P1-E integration gate.** E.10 is not another feature specification. Create one maintained
replayable/live homestead-derived scenario that exercises the **joins between the owning tasks**:

- useful mixed-method passes, independently committed observations and internal checkpoints: E.7;
- owner planning, correction and rollback semantics: E.1/E.2/E.6/E.11;
- current-frame lineage and recovery authority: E.4;
- evidence-driven effective method/brush choice: E.14;
- shared scene constraints and stale propagation: E.18/E.19/E.20 plus the Art Director hierarchy contract;
- brief fidelity, recognition, effect accountability and causal corrective escalation: E.17;
- independently compared quality/time and necessary continuation telemetry: E.8;
- all baseline safety/evidence invariants at the top of this roadmap.

If the integration scenario exposes a failure, fix it in the owning task/contract rather than adding an
E.10-specific duplicate rule.

P1-E closes only when those joins have targeted regression coverage, canonical verification is green and a
fresh live Photoshop run demonstrates the integrated behavior without weakening safety or artistic completion
criteria.

Machine integration may be verified while human comparison is pending, but P1-E's claim of better paintings
sooner remains open until E.8 has independent image evidence. A green test suite or more accepted passes is
insufficient.

---
## P1-B — Remaining real-paint and artistic acceptance

**Status: HUMAN-GATED.** This track proceeds when an independent evaluator is available and does not
block the active P1-E machine-engineering sequence.

### Task 23 — Blinded human progressive-refinement acceptance

**Status: HUMAN-REQUIRED.** Run the repeat/adjudication round with
`task23-review-pack/task23-blinded-evaluator-bundle.zip`, using
`blinded-evaluator-pack/review-form.v2.blank.json`, `INSTRUCTIONS-v2-RU.txt` and the predeclared
`task23-review-pack/aggregation-rule.v2.json`. Automated workers must not fill the form from producer
intent, tool logs or pixel statistics.

Acceptance:

- the positive modelled-form case is judged as genuine structural/form improvement;
- texture-only, residual-block-in and destructive-overdetail controls are rejected as sufficient
  refinement;
- the intentional flat/stylized control is not falsely forced toward photoreal rendering;
- the labels satisfy the predeclared Task-23 questions/criteria in `docs/visual-evaluation.md`.

After labels are recorded, update the acceptance matrix and remove Task 23 from this roadmap.

### Task 22 — Final target fidelity / prompt-to-frame acceptance

**Priority:** after Task 23 human acceptance.

Task 22 is the **human validation consumer of E.17**, not a second completion-contract implementation.
For each representative final-art case, give the evaluator the original request, E.17's durable brief items,
the exact registered final whole-frame evidence and no tool-success/pass-count/producer-verdict cues. The
evaluator independently labels each hard-perceptual item `MET | NOT_MET | UNCERTAIN`.

The representative set must contain at least:

- a positive case where subject/composition/style are all met;
- a recognizable-content case with intentionally wrong style/realism/finish;
- a case where lighting/atmosphere is central;
- a case where material/detail treatment is explicit enough that flat block-in must fail.

Acceptance:

- runtime/E.17 `MET` claims must agree with independent human judgement on the representative set;
- any human `NOT_MET` hard requirement exposes a fidelity/completion mismatch rather than being overridden
  by technical success;
- `UNCERTAIN` hard requirements remain adjudication cases;
- explicit style/realism mismatch cannot be compensated for by recognizable content;
- the positive control can finalize without polishing merely because another edit is possible;
- failures identify the concrete unmet user-visible requirement.

### Task 15d.3 — Compositing/material/atmosphere artistic gain

Remaining gate: human artistic judgment on the exact registered BEFORE/AFTER evidence.

Acceptance:

- material/depth/atmosphere improves rather than merely adding texture;
- important structure remains convincing;
- blend/mask effects do not hide unresolved form/composition debt;
- the human judgment is recorded separately from technical execution facts.

### Task 21 — Real-artwork artistic preference over anchors

Remaining gate: in a real artwork with a meaningful current-vs-anchor tradeoff, obtain independent human
judgment on whether the chosen anchor is artistically preferable.

Acceptance:

- preference is recorded by a human, not inferred from detail count, pixel delta or successful undo;
- if the later state is judged weaker, use the existing Guard-owned anchor/restore path rather than
  silently finalizing it.

---

## P1-D — Host-neutral MCP + portable Agent Skills

**Priority:** after P1-E machine closure; it may proceed while P1-B is waiting on human evidence.

The public repository must expose a host-neutral Photoshop MCP product rather than encode Chat On
Steroids as a product dependency. Our own local installation remains COS-first by local routing
policy; that preference must not leak into the portable product contract.

### P1-D.1 — Inventory host coupling

Find every maintained reference to `Chat On Steroids`, `COS`, `Chat_On_Steroids_Core` and
`Chat_On_Steroids_Plugins` and classify it as exactly one of:

- canonical product requirement;
- local routing preference;
- host-specific documentation/example;
- obsolete coupling to remove.

Acceptance: no COS dependency remains hidden inside a supposedly portable painting/Guard contract.

### P1-D.2 — Canonical host-neutral contract

Define the public execution contract in terms of standard MCP capabilities and Photoshop/Guard tool
semantics rather than a particular host namespace. Host discovery and namespace resolution must live
outside painting correctness semantics.

Acceptance:

- no painting/Guard invariant requires COS;
- tool schemas, state semantics, recovery, preview barriers and UXP dispatch remain unchanged across
  supported hosts;
- host-specific routing failure cannot silently change the canonical painting contract.

### P1-D.3 — Portable Agent Skills

Extract reusable agent workflow/policy into standard `SKILL.md` packages with bounded supporting
references/scripts where appropriate. Skills describe how to use Photoshop MCP/Guard, not how to find
COS-specific namespaces.

The workflow/craft source of truth must remain **host-neutral and single-source**: portable skills
reference canonical painting/Guard policy instead of copying it, and COS/Codex/Claude/Cursor
integrations remain delivery adapters rather than independent artistic rulebooks. Where practical,
parity tests should prove that a canonical policy/skill change propagates to every supported host
surface.

At minimum cover:

- digital-painting workflow;
- Guard operation lifecycle and recovery;
- multiscale visual review/final acceptance;
- supplied brush/stamp-pack workflow where useful.

Acceptance: the same core skill package can be consumed without semantic edits by multiple supported
agent hosts.

#### P1-D.3a — User-facing skill configuration file

Design a small host-neutral configuration file for the Photoshop skill so presentation preferences can be
changed without editing `SKILL.md` or forking the workflow policy. Keep this strictly separate from Guard
correctness, execution safety and artistic acceptance rules: configuration may alter **how the agent reports**,
not weaken what it verifies or how it mutates Photoshop.

At minimum evaluate configurable fields for:

- **output language** for progress reports, review notes and final commentary (for example `ru`, `en`, or
  `auto` from the user's language);
- **commentary mode / vocabulary** — e.g. `technical`, `artist`, or `hybrid`, where technical mode emphasizes
  geometry, layers, masks, tool state and Guard evidence; artist mode emphasizes composition, value, color,
  edge hierarchy, material/readability and painterly intent; hybrid combines both without duplicating the same
  observation twice;
- **reporting verbosity / cadence** — concise checkpoints versus fuller step-by-step commentary, while still
  emitting any mandatory warnings, blockers and review failures;
- optional presentation preferences that prove useful in real use, without turning the config into a second
  policy language.

Prefer a simple versioned format such as `photoshop-skill.config.yaml` or `.json`, with documented defaults,
validation and graceful fallback when the file is absent or partially invalid. Host adapters may expose their
own path/override mechanism, but they must resolve to the same canonical config semantics.

Acceptance:

- changing language/commentary style requires no edit to the canonical skill text;
- identical config produces equivalent presentation semantics across supported hosts;
- no presentation option can bypass Guard, reduce required visual review, suppress hard errors, or change the
  canonical painting workflow;
- defaults preserve the current useful behavior when no config file is present.

### P1-D.4 — Generic MCP installation and host guides

Provide explicit installation/configuration paths for:

- Codex;
- Claude Code;
- Cursor or another representative generic MCP client;
- generic MCP stdio configuration;
- Chat On Steroids as a supported host adapter, not the canonical dependency.

Host guides may differ in configuration syntax, but they must point at the same canonical MCP server
and the same portable skill/policy surface.

### P1-D.5 — Preserve local COS-first routing

Keep our current local behavior: for Photoshop tasks our own agent should still prefer Chat On
Steroids, discover its Photoshop route and verify it with the existing ping/Guard-status checks before
declaring the route unavailable.

This local preference must stay in local/COS routing policy rather than the public host-neutral skill
contract.

Acceptance: our current COS-first workflow remains unchanged after the public portability refactor.

### P1-D.6 — Cross-host parity smoke

Validate that supported hosts observe the same canonical product surface:

- equivalent MCP `tools/list` contract;
- equivalent Guard tool schemas and lifecycle semantics;
- equivalent portable skill workflow;
- at least one Codex MCP startup/smoke path;
- current COS startup/smoke path;
- Claude Code configuration validation or smoke where the environment permits.

Do not claim cross-host parity from configuration files alone when a runnable smoke is available.

### P1-D completion gate

Close P1-D only when the public repository is usable without COS-specific assumptions, portable skills
and installation instructions are present, cross-host contract parity is demonstrated, and our local
COS-first workflow still behaves as before.

---

## P0-D — Human critic calibration and decision-quality validation

**Status: HUMAN-REQUIRED.** No critic authority may be promoted from repository fixtures alone.

### Tasks 8 / 8a — Human adjudication of the isolated critic

Use `task8a-review-pack/review.html`, generate the human reference file from the supplied template,
then validate with:

~~~
node scripts/task8a-calibration.mjs validate
~~~

The held-out corpus must cover genuine improvements, regressions, ambiguous tradeoffs, identical
pairs, locally successful/global-weaker edits, useful simplifications, lost accidental strengths,
mechanically repeated motifs, legitimate regular rhythms and stylized/surreal cases.

Compare the current decision path against the same evidence plus the bounded critic/relational
context. Measure true detections, misses, false alarms, appropriate uncertainty, changed
keep/rollback/global-promotion decisions, latency/cost and repeat/order consistency.

Acceptance: grant only the narrow authority supported by held-out human labels; otherwise keep the
critic advisory/shadow-only. Model agreement is not ground truth.

### Task 8b — STOP / FINALIZE calibration

After Tasks 8/8a are labelled, extend the held-out corpus with:

~~~
FINALIZE_NOW
CONTINUE_REQUIRED
CONTINUE_OPTIONAL_OR_AMBIGUOUS
~~~

Acceptance:

- zero held-out false `FINALIZE_NOW` decisions on cases with a visibly unmet hard user requirement;
- fewer unnecessary continuation decisions on human-labelled `FINALIZE_NOW` cases versus baseline;
- ambiguous cases may abstain/escalate;
- accepted `FINALIZE_NOW` prevents further automatic visual mutation until new user input or new
  contradictory evidence.

### Tasks 6, 11 and 13a.1A / 13a.1C — inherited human claims

Do not create separate evaluation stacks. Use the same Task-8/8a held-out evidence to decide:

- whether support/contact/connectivity/intersection failures are detected more reliably without an
  unacceptable stylization/surreal false-positive pattern (Task 6);
- whether independent whole-image review surfaces unforeseen regressions often enough to be useful
  (Task 11);
- whether isolated/transition/final critic authority is perceptually reliable enough to promote
  beyond advisory use (13a.1A / 13a.1C).

---

## P0-E.7 — Supplied brush/stamp-pack live/human acceptance

**Status: WAITING FOR AN ACTUAL USER-SUPPLIED PACK/FOLDER.**

Do not simulate this acceptance with generic/default brushes.

When a real pack is provided, run one representative fresh-chat Photoshop scene that requires a
readable focal subject, developed environment/background, depth, lighting/atmosphere and
material/detail refinement.

The run must exercise:

1. pack ingestion and attribution;
2. bounded visual profiling;
3. durable brush/stamp role mapping;
4. at least one media-brush semantic pass when the pack contains media brushes;
5. per-instance stamp placement when the pack contains motif/stamp brushes;
6. anti-copy review for repeated organic motifs;
7. integration/overpaint where raw stamps would remain visibly pasted;
8. canonical whole-frame/multiscale Guard review;
9. exact final-frame comparison against the original scene brief.

Acceptance is artistic as well as technical: the supplied vocabulary must materially shape a
coherent scene, not merely prove that presets imported or stamps were placed.

---

## PaintPilot first release — remaining public/release work

**Status (2026-10-01): GitHub standalone cutover COMPLETE. Identity sweep / repository governance / funding /
milestone / first standalone release remain open.**

1. **Final public identity sweep.** Audit README/README.ru, release-facing docs, examples, package
   metadata and MCPB metadata. Current product-facing surfaces should consistently use:
   - **PaintPilot — AI Digital Painting for Adobe Photoshop**;
   - **Autonomous AI painting agent for Adobe Photoshop, powered by MCP.**
   Historical `fork`/`upstream` wording should remain only where it is genuinely provenance/history, with
   required attribution retained in `LICENSE`, `NOTICE`, Git history and the dedicated provenance docs.
2. **Standalone milestone commit/tag.** After the identity sweep and related working tree are
   coherent, run canonical verification, create one explicit standalone-cutover milestone commit, and mark
   that exact point with the release tag. Do not manufacture a clean point by omitting unfinished related
   changes.
3. **First standalone PaintPilot release.** Publish project-owned release notes, installation
   instructions and MCPB/package artifacts where applicable, with a concise provenance pointer to `NOTICE`.
   Then verify the public GitHub page and released artifacts from a user perspective: installation and normal
   operation must require no knowledge of, checkout from, remote to, or release cadence of
   `alisaitteke/photoshop-mcp`.
4. **GitHub Ruleset / default-branch protection.** Configure a repository Ruleset for the current
   default branch (`digital-painting`, or its eventual replacement if the default branch is renamed before
   release). The intended public-maintainer baseline is:
   - block branch deletion;
   - block force-pushes;
   - require changes to arrive through Pull Requests rather than direct writes for normal development;
   - keep squash merge as the canonical merge mode;
   - require the maintained CI/status checks that actually protect release correctness (prefer the canonical
     verification gate or an intentionally smaller stable required-check set rather than decorative checks);
   - require the PR branch to be up to date with the protected base branch when that requirement is reliable
     for the maintained CI workflow;
   - avoid bypass rules that silently defeat the protection; any maintainer/emergency bypass must be explicit,
     narrow and documented.
   Verify the rules with a disposable branch/PR before treating the repository as release-governed.
5. **Sponsor funding destination.** Sponsorships are enabled in GitHub repository settings, but the
   Sponsor button must not point to an invented or placeholder destination. Choose and verify the actual
   payment/support endpoint (for example GitHub Sponsors, Ko-fi, Buy Me a Coffee, Patreon, or another
   user-approved funding URL/account), then add the corresponding project-owned `.github/FUNDING.yml`
   configuration. Verify on the public repository page that the Sponsor button resolves to the intended
   destination and that no private payment/account data is exposed beyond what the selected provider requires.

Acceptance for the remaining work:

- all current product-facing metadata consistently presents the PaintPilot identity;
- the default branch has an enforced, tested GitHub Ruleset that prevents accidental destructive/direct
  changes while preserving the intended PR workflow;
- the Sponsor button, if displayed, resolves only to a real user-approved funding destination;
- one green canonical milestone commit/tag defines the public standalone cutover point;
- the first standalone PaintPilot release installs from `lavalava45/paintpilot-mcp` and ships only
  project-owned/current artifacts plus required `LICENSE`/`NOTICE`;
- provenance remains explicit without acting as the primary product identity.

---

## Conditional work — do not implement before its trigger

### Task 10 — Compact artistic relationships / achieved-quality memory

**Blocked by Tasks 8/8a human evidence.**

Implement only if held-out calibration shows that compact relational memory measurably improves
keep/rollback/global-promotion decisions or catches losses the baseline repeatedly misses.

If activated, keep the state small, causal, evidence-bound and revisable. If the experiment only
lengthens explanations without changing decisions, close Task 10 as **not adopted**.

---

## P3 — Optional exploration

### Task 15c — Reference / 3D construction support

Optional only. For proportion-sensitive subjects, evaluate whether bounded reference/3D blockout
evidence materially improves silhouette/landmark/depth preservation or throughput.

Do not add a mandatory 3D dependency to ordinary painting and do not treat technically correct
geometry as proof of artistic quality.

---

## Work deliberately not prioritized

Do not optimize these without new evidence:

- migrating every remaining Photoshop primitive merely for completeness;
- maximizing mutations per bundle or actions/round-trip independently of pass quality/safety;
- caching arbitrary Photoshop state without invalidation proof;
- weakening preview/verdict/recovery evidence to save calls;
- optimizing raw tool count instead of semantic-cycle wall time;
- resurrecting retired inherited architecture for upstream parity.

## Explicit non-goals

Do not add without new evidence:

- universal numeric composition/style/expressiveness scores;
- one aggregate artistic quality score;
- full Art Director critique after every stroke/pass;
- mandatory coverage/defer questionnaires or cosmetic rewording as a substitute for removing protocol turns;
- a parallel fast mode, new orchestration agent or hidden model retry loop for E.7;
- blind multi-pass autonomy without per-pass observation and interruption triggers;
- mandatory thumbnails for every scene;
- more Guard safety layers without a reproduced integrity failure;
- large schemas whose fields do not change execution/review behavior;
- category-specific anatomy/hand/object pipelines as the default world-consistency mechanism;
- a second Guard/controller or duplicate art-run persistence tree.

## Upstream integration policy

Continue evaluating upstream/external candidates selectively against the **current project architecture**
under [`external-intake.md`](external-intake.md). Do not wholesale merge changes
that can restore retired controller/raw-script paths, legacy fallback assumptions or incompatible
compact-v2 semantics.

Interrupt this roadmap for upstream work only when a change fixes a reproduced current bug, is
required for host/API compatibility, or provides a measured material advantage to an active task.

## Validation policy for remaining work

Every implemented item should include, as applicable:

1. a reproduced failure/need or a predeclared human-evaluation question;
2. fail-closed or explicitly bounded semantics;
3. targeted repository regression tests;
4. preservation of the baseline invariants defined above;
5. `npm run verify:canonical` for code changes plus subsystem-specific build/lint/policy checks;
6. real Photoshop/CoS acceptance when the claim depends on live host/Photoshop behavior;
7. independent human-labelled evidence for perceptual/artistic/calibration claims;
8. updates to this roadmap, `CHANGELOG.md` and `docs/roadmap-final-acceptance-matrix.md` so completed
   work does not accumulate again in the forward TODO.

Tool success, comparison SHA, pixel delta, layer creation, primitive/stroke count and mocked critic
verdicts are never sufficient by themselves to prove artistic correctness.\n
