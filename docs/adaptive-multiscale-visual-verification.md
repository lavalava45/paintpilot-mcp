# Adaptive Multiscale Visual Verification for Tool-Using Image Agents

## A working theory and experimental program

### Abstract

Tool-using image agents face a verification problem that is different from ordinary image
generation. A generated image can be judged as one completed output, whereas an agent operating a
stateful visual editor must repeatedly decide whether a specific action changed the intended visual
property, whether that change introduced regressions elsewhere, and whether the available visual
evidence is spatially detailed enough to support the next decision.

This project tests the hypothesis that reliable visual editing requires **adaptive multiscale
verification** rather than a single fixed preview. The core proposal is to treat visual inspection as
an evidence-acquisition policy over spatial scales. Every review retains a whole-frame view for
global context, while object-scale and micro-scale crops are acquired only when the semantic scope of
the action or the critic's uncertainty justifies them. Local evidence is expressed in exact source
document coordinates, bound to immutable frame identity, and may be enriched read-only without
replaying the artistic mutation.

The theory is intentionally stronger than "show the model a larger image." It separates pixel-change
evidence from semantic interpretation, separates evidence materialization from evidence delivery, and
defines falsifiable hypotheses about when additional spatial resolution should improve correctness
without imposing the cost of maximum-resolution inspection on every step.

---

## 1. Problem statement

A stateful visual agent executes a repeated control loop:

```text
intent -> editor action -> rendered state -> visual judgment -> next action
```

The quality of that loop depends on the quality of the visual judgment. A single preview resolution
creates an unavoidable trade-off:

- a whole-frame image preserves composition, hierarchy, negative space and global regression
  awareness, but may undersample small defects;
- a tight crop reveals edges, seams, features and local artifacts, but may hide the global context
  needed to decide whether the local change is actually beneficial;
- always transmitting full-resolution imagery is wasteful and still does not guarantee that the
  relevant local region receives sufficient attention.

The engineering problem is therefore not merely image transport. It is **adaptive allocation of
visual evidence**.

We model the review process as choosing an evidence set for each visual operation rather than using a
single universal frame.

---

## 2. Core hypothesis

The central hypothesis is:

> A tool-using visual agent is more reliable when the minimum spatial review scale is selected from
> the semantics of the current action and then escalated according to unresolved uncertainty, while
> whole-frame context and exact state provenance are preserved throughout the review.

This implies five design principles.

1. **Whole-frame context is invariant.** Local inspection supplements the overview; it does not
   replace it.
2. **Review resolution is task-dependent.** Composition, object structure and micro-detail are
   different observational problems and should not share one fixed evidence policy.
3. **Escalation is evidence acquisition, not a new artistic action.** Additional crops must not replay
   the mutation being reviewed.
4. **Coordinates belong to the source document.** Review geometry must remain stable regardless of
   preview downscaling.
5. **Evidence identity is explicit.** A crop is meaningful only when it is bound to the exact document
   state from which it was captured.

---

## 3. Three observational scales

The project currently uses three review levels. These are not aesthetic categories; they are
observational-resolution classes.

### 3.1 COMPOSITION

COMPOSITION review asks questions whose answer depends on the entire frame:

- Does the subject read?
- Is the focal hierarchy coherent?
- Are large value and color masses balanced?
- Do the major depth relationships work?
- Did a local edit create a global regression?

The primary evidence is a whole-frame preview. The current Guard policy targets a long edge of
approximately 1600 pixels, without upscaling documents that are already smaller.

### 3.2 OBJECT

OBJECT review addresses a bounded semantic region while retaining the whole frame:

- Is the object recognizable?
- Are proportion, silhouette and placement plausible?
- Does the object make contact with its support?
- Are overlap, occlusion and depth ordering coherent?
- Did a replacement, erase or transform damage the transition to its surroundings?

The evidence set contains the whole frame plus an exact document-space crop. The current policy uses
approximately 1200 pixels on the crop's long edge, again without inventing information by upscaling.

### 3.3 MICRO

MICRO review targets information that can disappear at object scale:

- edge continuity;
- seams and halos;
- patch boundaries;
- small local artifacts;
- feature-level anatomy or facial structure;
- text and signature legibility;
- repeated dabs or mechanical patterning;
- local texture and small value/color discontinuities.

The intended evidence model is hierarchical: whole-frame context remains present, an object-context
view should remain available when the micro-region is nested inside a larger semantic object, and a
tighter crop supplies the detail required for the specific judgment. A micro crop may use a larger
target long edge, currently about 1600 pixels, but native source resolution remains the upper bound on
real information.

---

## 4. Formalization

Let:

- $D$ be the pinned editor document;
- $I_t$ be the rendered document state after operation $a_t$;
- $H(I_t)$ be the content identity of the canonical whole-frame preview;
- $W(I_t, s)$ be a whole-frame observation at maximum scale $s$;
- $C(I_t, R, s)$ be a crop of source-document region $R$ at maximum scale $s$;
- $L_t \in \{C, O, M\}$ be the required review level: composition, object or micro;
- $E_t$ be the evidence set delivered for review.

The invariant is:

$$
W(I_t, s_C) \in E_t
$$

for every visual review.

For object review:

$$
E_t \supseteq \{W(I_t, s_C), C(I_t, R_O, s_O)\}
$$

For micro review, the stronger contextual form is:

$$
E_t \supseteq \{W(I_t, s_C), C(I_t, R_O, s_O), C(I_t, R_M, s_M)\}
$$

where $R_M \subseteq R_O$ when an explicit object context exists. If the initial exact region is
already both semantically contextual and sufficiently tight, redundant crops may be omitted, but the
decision must be deterministic rather than guessed from preview coordinates.

The initial review level is selected by a policy:

$$
L_t = f(S_t, A_t, P_t, R_t, G_t)
$$

where:

- $S_t$ is the declared artistic scale;
- $A_t$ is action class and impact class;
- $P_t$ is the currently open problem scale;
- $R_t$ indicates whether exact source-document bounds are known;
- $G_t$ denotes special semantic gates such as final comparison.

After the first observation, the level may increase according to structured findings and uncertainty:

$$
L'_t = g(L_t, F_t, U_t)
$$

but it must never decrease the evidence already required by the operation.

---

## 5. Adaptive evidence acquisition

The proposed control loop is:

```text
1. Compile one bounded visual operation.
2. Resolve the minimum review level from structured operation semantics.
3. Execute the artistic mutation exactly once.
4. Capture the whole frame and any predictable local evidence.
5. Deliver the review package to the critic.
6. Record a factual observation.
7. If the observation exposes a local problem not supported by adequate evidence:
     a. keep the same artistic operation open;
     b. acquire exact crops read-only;
     c. bind them to the same document and whole-frame identity;
     d. deliver the enriched evidence;
     e. request another observation for the same operation.
8. Close the visual verdict only when the required evidence has been reviewed.
9. Permit the next mutation.
```

This design makes visual review **progressive**. A global pass does not pay a micro-detail tax, while
a suspicious local result can request more evidence before the workflow commits to the next action.

---

## 6. Exact coordinate semantics

All local regions are represented in source Photoshop document pixels:

```json
{
  "left": 420,
  "top": 180,
  "right": 760,
  "bottom": 520
}
```

The coordinate origin is the document's top-left corner. Preview scale is metadata, not a coordinate
system for artistic decisions.

The system distinguishes:

- `requested_region`: the semantic/problem region specified by the planner or critic;
- `effective_region`: the actual crop after deterministic context padding and canvas-edge clamping.

This separation matters because a critic may need surrounding context without losing traceability to
the exact region that motivated the request.

The current implementation uses deterministic padding rules for read-only escalation:

- OBJECT: 12% of region size, minimum 24 pixels per side;
- MICRO: 6%, minimum 12 pixels per side.

The exact numbers are engineering parameters rather than theoretical constants. They are candidates
for empirical calibration.

---

## 7. Structured findings instead of free-text crop guessing

Natural-language criticism is semantically rich but geometrically ambiguous. A statement such as
"the edge around the face looks wrong" does not provide a reproducible crop.

The theory therefore separates two channels:

1. a human/model-readable visual observation;
2. a compact structured finding carrying a finding class and, when local evidence is required, exact
   source-document bounds.

Examples of finding classes include:

- composition: `focal_hierarchy`, `global_value_structure`, `subject_recognition`;
- object: `silhouette`, `proportion`, `contact_support`, `occlusion_depth`;
- micro: `edge_transition`, `seam_halo`, `small_artifact`, `local_discontinuity`.

The finding taxonomy is deliberately subject-agnostic. The system should not require a special
pipeline for every possible face, hand, building, tree or material.

---

## 8. Visual significance is not visual correctness

Two different questions must remain separate.

### 8.1 Execution significance

Did the editor materially change the pixels?

This can be estimated mechanically from before/after previews using pixel deltas, changed-pixel ratios
or similar measures. It is useful for detecting no-op or negligible actions.

### 8.2 Artistic interpretation

Did the change solve the intended visual problem without introducing unacceptable regressions?

This is a semantic judgment and cannot be inferred from a large pixel delta. A visually destructive
operation may produce a very large delta; a successful subtle correction may produce a small one.

The project therefore treats visual significance as an execution gate, not an artistic quality score.

---

## 9. Materialization, delivery and interpretation are different events

Visual-agent systems can accidentally collapse three distinct facts:

1. an image file exists;
2. the image bytes were delivered through the model-facing visual channel;
3. the critic actually formed a judgment using those bytes.

These are not equivalent.

A path and SHA prove artifact identity, not perception. An MCP image-content block proves that exact
bytes were supplied for review, not that the model interpreted them correctly. The subsequent visual
observation is the semantic claim.

For that reason, provenance terminology should be conservative. Fields such as
`image_delivered_for_review` are defensible. Fields such as `image_seen` or `image_understood` would
overstate what the transport can prove.

One open project question is whether durable Guard closure should require a verified delivery receipt
for every mandatory review role, rather than treating a materialized artifact as sufficient evidence
that visual review was possible.

---

## 10. Evidence identity and no-replay semantics

Every local review artifact is meaningful only relative to the state it describes. The project binds
review evidence to:

- artistic operation id;
- pinned document identity;
- canonical whole-frame SHA;
- requested and effective region;
- review level;
- crop SHA and immutable materialized artifact identity.

If the whole-frame identity changes, the local evidence is stale. If the requested region changes,
the old crop does not automatically satisfy the new requirement. If evidence is missing or corrupt,
it must be recaptured read-only.

Crucially, evidence enrichment must not replay the artistic mutation. The state machine is:

```text
mutation once
-> review evidence
-> optional read-only evidence enrichment
-> verdict
-> next mutation
```

not:

```text
mutation
-> insufficient review
-> mutation again
```

This property is essential in non-idempotent editors where repeating the same brush stroke, erase,
transform or compositing action can irreversibly diverge from the state being evaluated.

---

## 11. Bounded escalation

Adaptive review must not become unbounded attention fan-out. The current experimental policy limits a
single escalation round to at most two newly captured crops and uses deterministic prioritization and
deduplication.

This creates a finite local-review budget while preserving unresolved requirements for a subsequent
read-only round. The hypothesis is that bounded adaptive acquisition is more efficient than either:

- one low-resolution overview for every operation; or
- a fixed high-resolution multi-crop bundle for every operation.

The correct bound is empirical and may change with host limits, model capabilities and task class.

---

## 12. Falsifiable research hypotheses

The project treats this design as a working theory, not as an established result. The following
hypotheses are intended to be testable.

### H1 — Scale matching reduces missed local errors

For operations whose target is spatially small, OBJECT/MICRO evidence should reduce the rate of missed
local defects relative to whole-frame-only review.

### H2 — Persistent whole-frame context reduces local-fix regressions

Review packages that retain the whole frame while presenting crops should produce fewer global
regressions than crop-only inspection.

### H3 — Adaptive review is more efficient than fixed maximum-resolution review

Given comparable decision accuracy, scale-selective review should require fewer image bytes, fewer
crop captures and lower end-to-end latency than sending maximum-resolution local evidence for every
pass.

### H4 — Exact provenance reduces false closure

Binding every crop to document id, whole-frame SHA and immutable artifact identity should reduce
cases where stale or overwritten visual evidence is incorrectly accepted as current.

### H5 — Uncertainty-driven escalation improves decisions beyond static scale mapping

A reviewer that can escalate from COMPOSITION to OBJECT or from OBJECT to MICRO after discovering
uncertainty should outperform a policy that chooses the review level only before execution.

### H6 — Hierarchical context improves micro-detail decisions

For nested local problems, presenting whole-frame + object-context + micro evidence should reduce
tunnel-vision errors relative to whole-frame + micro-only evidence.

### H7 — Delivery-aware closure reduces false claims of visual inspection

Requiring verified delivery of mandatory image roles before accepting a visual verdict should reduce
metadata-only closure failures when image transport is omitted, truncated or exceeds response budgets.

---

## 13. Experimental design

### 13.1 Conditions

Representative visual-editing tasks can be evaluated under at least three review policies:

1. **Overview-only control** — one whole-frame preview per operation.
2. **Fixed exhaustive control** — whole frame plus predeclared high-resolution crops for every pass.
3. **Adaptive multiscale policy** — minimum review profile plus uncertainty-driven escalation.

For H6, compare:

- whole + tight micro crop;
- whole + object-context crop + tight micro crop.

For H7, include transport-failure controls where one required image role is materialized but not
delivered to the model-facing image channel.

### 13.2 Measurements

Useful machine and human measurements include:

- missed-defect rate;
- false-positive defect rate;
- global-regression rate after local corrections;
- false visual-closure rate;
- number of review rounds;
- number of read-only crop captures;
- image bytes delivered;
- host/model/visual-review latency;
- Photoshop mutation count;
- mutation replay count, which should remain zero during evidence escalation;
- human preference or critic agreement on specifically predeclared perceptual questions.

The project intentionally avoids reducing these dimensions to one universal aesthetic score. A
single aggregate number would hide the distinction between execution correctness, perceptual
reliability, artistic judgment and transport cost.

### 13.3 Evaluation discipline

Experiments should separate:

- tool success from visual success;
- model self-evaluation from blinded human evaluation;
- local improvement from global quality;
- evidence acquisition from artistic mutation;
- transport failures from critic failures.

Where possible, evaluation sets should include negative controls, stale-evidence controls and
deliberately ambiguous cases rather than only successful examples.

---

## 14. Current project status

The project already implements the baseline mechanics required to study this theory:

- deterministic COMPOSITION / OBJECT / MICRO profile resolution from structured pass facts;
- whole-frame review at every level;
- exact source-document focus regions;
- deterministic requested/effective crop geometry;
- local BEFORE/AFTER evidence where the existing significance contract requires it;
- structured review findings;
- same-operation read-only crop escalation;
- bounded two-crop escalation rounds with deterministic deduplication/prioritization;
- document/SHA-bound durable review evidence;
- immutable crop artifact identity and restart-safe recovery;
- explicit `image_delivered_for_review` transport metadata;
- no artistic mutation replay during evidence enrichment.

Four important parts of the stronger theory remain experimental follow-ups rather than completed
claims:

1. **runtime uncertainty escalation** — the pure review resolver can represent escalation after
   overview/object uncertainty, but the normal runtime does not yet drive those inputs as a general
   policy;
2. **context-preserving MICRO review** — the current initial micro profile can use one tight focus
   crop, but the stronger whole + object-context + micro hierarchy is not yet guaranteed;
3. **delivery-aware closure** — response metadata can report incomplete image delivery, but durable
   Guard closure is not yet universally conditioned on a verified model-facing image-delivery receipt;
4. **complete crop provenance projection** — escalation evidence retains exact requested/effective
   regions and crop scale, but durable crop records do not yet carry explicit canvas width/height, and
   the required regression proving source-coordinate invariance across different overview downscales
   has not yet been added.

These gaps are tracked in the project roadmap rather than hidden behind the already-completed
baseline milestone.

---

## 15. Scope and limitations

This theory does not claim that multiscale evidence makes a model equivalent to a trained human
artist or human visual system. It also does not imply that higher pixel resolution always improves
reasoning. Possible failure modes include:

- crop-induced context bias;
- attention dilution when too many images are supplied at once;
- compression artifacts;
- ambiguous semantic regions;
- incorrect critic localization;
- model inconsistency across repeated observations;
- transport limits that force evidence omission;
- cases where the artistic question itself is global and cannot be decomposed into local regions.

The theory is therefore deliberately adaptive: evidence should be increased only when the decision
requires it, while the whole-frame state remains the common reference.

---

## 16. Broader implication

The underlying idea is not Photoshop-specific. Any agent that modifies a spatial world through tools
may need a similar distinction between global context and task-local evidence: CAD, 3D modeling,
diagram editing, map manipulation, scientific imaging and GUI-based design systems all contain
operations whose correctness is visible only at particular spatial scales.

The broader research proposition is:

> For stateful visual agents, perception should be treated as an active, provenance-bound evidence
> acquisition process rather than as a passive screenshot attached after tool execution.

This project uses digital painting as a demanding test case because artistic work combines global
composition, object-scale structure, micro-detail, irreversible stateful edits and semantic judgments
that cannot be reduced to exact numeric postconditions. That makes it a useful environment for
testing whether adaptive multiscale verification can support longer, safer and more perceptually
grounded visual-agent workflows.
