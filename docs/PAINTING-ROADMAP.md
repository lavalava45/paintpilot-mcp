# Painting Quality Roadmap

Last updated: 2026-09-28

This file is the canonical **forward-looking TODO** for the digital-painting project.

Completed implementation belongs in `CHANGELOG.md`; detailed acceptance evidence belongs in
`docs/roadmap-final-acceptance-matrix.md`, Git history and the referenced live-evidence artifacts.
Do not keep completed implementation plans here merely to preserve history.

The canonical production lane is compact-v2, Guard-controlled and **UXP-only / fail-closed** for
Photoshop semantic dispatch. Do not reintroduce the retired controller/daemon, raw-script bypass,
recipe execution layer or ExtendScript/COM production fallback.

## Priority order

Execute the remaining work in this order:

1. **P1-B human/artistic acceptance:** Task 23 independent blinded labels → Task 22 final target
   fidelity → Task 15d.3 compositing/material/atmosphere artistic gain → Task 21 real-artwork
   current-vs-anchor preference.
2. **P1-D host-neutral MCP + portable Agent Skills:** make the public project host-agnostic while
   preserving the current local COS-first workflow as a local routing preference. Inventory existing
   COS coupling → define the canonical host-neutral contract → extract portable skills → document
   Codex / Claude Code / Cursor / generic MCP installation → keep COS as a supported adapter → prove
   local COS preference and cross-host contract parity.
3. **P2 independent-product cutover:** **CLOSED (2026-09-28).**
   - P2.4 fresh-origin release-autonomy proof passed from published `2be5260` in a completely new
     origin-only clone with no `upstream` remote;
   - P2.5–P2.8 remain closed and regression-protected;
4. **P0-D human critic calibration**, when an independent human evaluator is available:
   Tasks 8/8a → 8b, with Tasks 6, 11 and 13a.1A/13a.1C inheriting the same held-out evidence.
5. **P0-E.7 supplied-pack live/human acceptance** when the user provides a real brush/stamp pack.
6. **Conditional / optional work:** Task 10 only if Task 8/8a justifies it; Task 15c remains P3.

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
- no universal numeric aesthetic score, no arbitrary stroke/detail quota and no optimization of raw
  mutation count as a substitute for pass quality.

Repository-only evidence must not be presented as proof of live Photoshop behavior, and tool success
must not be presented as proof of artistic quality.

---

## Remaining follow-ups inherited from closed P0-2 acceptance

All three retained machine follow-ups are now repository-complete and archived in `CHANGELOG.md`:
explicit document activation foreground classification, selection-mask compact execution, and negative
regression sentinel normalization. Final canonical verification after the third closure is green at
**74/74 test files / 738/738 tests**, **130 tools / 14 Guard tools / 5 prompts**. Reopen this block
only on a reproduced regression.

---

## P1-C — Visual-construction method hardening

**Status: COMPLETE (repository C.1–C.9 + residual C.1 live acceptance).**

Completed implementation details belong in `CHANGELOG.md`; repository evidence belongs in
`docs/roadmap-final-acceptance-matrix.md`. Do not reopen individual C.1–C.9 implementation items
without a reproduced regression or new evidence.

The final C.1 live check passed on 2026-09-28 in
`processes/p1c1-continuous-field-live-process/run-01/`. Operation
`p1c1-live-gradient-20260928-04` painted a full-canvas 1200×800 diagonal three-stop field through the
canonical Guard → UXP route. The durable operation record preserves exact endpoints `(0,0) →
(1200,800)` and ordered RGB stops `(28,50,86) @ 0`, `(156,114,108) @ 0.5`, `(232,183,143) @ 1`, and
the backend reports `gradient_kind=raster-color-linear`. Exact-current visual review accepted frame SHA
`0442052123782a5f9134f5df8323022a50c2809612831cdec9794c28d2553354` as a smooth continuous
cold-to-warm field with no visible dab/stamp periodicity or mechanical patterning. Guard closed the
operation with `verdict=improvement`, `disposition=accept`, `target_resolved=yes`, and zero pending
report/ack/verdict/job debt.

This live run also exposed and closed one compact-compiler defect before dispatch: global gradient
passes were missing the mandatory AFTER preview and did not carry the explicit `construction_role` into
`paint_strategy`. Focused regressions plus full canonical verification are green after the repair.

All C.1–C.9 contracts are now closed. Any new artistic deficiency discovered in real
painting should enter this roadmap as a new evidence-backed task rather than by restoring the old
implementation plans.

---

## P1-B — Remaining real-paint and artistic acceptance

### Task 23 — Blinded human progressive-refinement acceptance

**Status:** machine implementation and disposable live progression are complete. A first human round
has been received, but **human acceptance remains open**: the positive control did not cleanly satisfy
all target-required criteria, and that round predates the now-predeclared aggregation rule.

The review pack is already materialized in `task23-review-pack/` with exact SHA-bound BEFORE/AFTER
evidence for all five cases:

- positive modelled-form progression;
- texture-only negative control;
- residual-block-in geometry negative control;
- destructive-overdetail negative control;
- intentionally flat/stylized control.

An evaluator-safe neutral bundle is now materialized at
`task23-review-pack/task23-blinded-evaluator-bundle.zip` (source directory:
`task23-review-pack/blinded-evaluator-pack/`). It removes positive/negative case names and producer
construction cues while preserving the exact SHA-bound BEFORE/AFTER bytes and predeclared questions.
The private neutral-to-source mapping remains outside the evaluator bundle.

For the required repeat round, the evaluator must use
`blinded-evaluator-pack/review-form.v2.blank.json` together with `INSTRUCTIONS-v2-RU.txt`; both are
already included in `task23-blinded-evaluator-bundle.zip`. Automated workers must not fill the form
from producer intent, tool logs or pixel statistics. The original v1 form and producer-side
`human-labels.blank.json` remain historical/unfilled evidence rather than substitutes for independent
adjudication.

Supporting evidence: a blinded external Gemini review has been recorded in
`task23-review-pack/external-model-review.gemini.json`. It cleanly distinguished the modelled-form,
texture-only, residual-geometry, overdetail and intentional-flat cases, but remains model evidence and
therefore does **not** close the human-required gate.

First human-round evidence is preserved at
`task23-review-pack/human-labels.received-20260927.json`. Do not retroactively score it with a rule
created after those answers. For the next/repeat round, use
`task23-review-pack/aggregation-rule.v2.json`: applicable required positive criteria are conjunctive,
not vote-counted, and target-required criteria cannot be converted to N-A.

The first round also exposed a concrete machine-side false-positive class: the texture-only control
received YES on “major form more modelled?” despite no intended lower-frequency form change. The
refinement gate is therefore strengthened so PASS requires exact-current low-frequency thumbnail
evidence in addition to the ordinary current-frame judgement.

Acceptance:

- the positive modelled-form case is judged as genuine structural/form improvement;
- texture-only, residual-block-in and destructive-overdetail controls are rejected as sufficient
  refinement;
- the intentional flat/stylized control is not falsely forced toward photoreal rendering;
- the labels satisfy the predeclared Task-23 questions/criteria in `docs/visual-evaluation.md`.

After labels are recorded, update the acceptance matrix and archive Task 23 completely.

### Task 22 — Final target fidelity / prompt-to-frame acceptance

**Priority:** after Task 23 human acceptance.

For each representative final-art case, predeclare a concise checklist from the original user brief
and classify requirements as:

~~~
hard_perceptual
soft_preference
technical/non-visual
~~~

The human evaluator receives the original request, exact registered final whole-frame preview and
the checklist, but not tool-success/pass-count/producer-verdict cues.

For every `hard_perceptual` item record exactly one of `MET | NOT_MET | UNCERTAIN`.

The representative set must contain at least:

- a positive case where subject/composition/style are all met;
- a recognizable-content case with intentionally wrong style/realism/finish;
- a case where lighting/atmosphere is central;
- a case where material/detail treatment is explicit enough that flat block-in must fail.

Acceptance:

- no final state with a `NOT_MET` hard requirement is accepted;
- `UNCERTAIN` hard requirements require human adjudication;
- explicit style/realism mismatch cannot be compensated for by recognizable content;
- the positive control can finalize without polishing merely because another edit is possible;
- failures identify the concrete unmet user-visible requirement.

### Task 15d.3 — Compositing/material/atmosphere artistic gain

The editable technical fixture already passes. The only remaining question is human artistic
judgment on the exact registered BEFORE/AFTER evidence.

Acceptance:

- material/depth/atmosphere improves rather than merely adding texture;
- important structure remains convincing;
- blend/mask effects do not hide unresolved form/composition debt;
- the human judgment is recorded separately from technical execution facts.

### Task 21 — Real-artwork artistic preference over anchors

One-action accepted-anchor restore is technically and live proven. The remaining claim is purely
perceptual: in a real artwork with a meaningful current-vs-anchor tradeoff, is the chosen anchor
actually artistically preferable?

Acceptance:

- preference is recorded by a human, not inferred from detail count, pixel delta or successful undo;
- if the later state is judged weaker, use the existing Guard-owned anchor/restore path rather than
  silently finalizing it.

---

## P1-D — Host-neutral MCP + portable Agent Skills

**Priority:** immediately after P1-B human/artistic acceptance.

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

At minimum cover:

- digital-painting workflow;
- Guard operation lifecycle and recovery;
- multiscale visual review/final acceptance;
- supplied brush/stamp-pack workflow where useful.

Acceptance: the same core skill package can be consumed without semantic edits by multiple supported
agent hosts.

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

**Status:** repository harness complete; **human-required**.

The held-out manifest, blinded review pack, balanced/repeated evaluation plan and scorer exist.
No critic authority may be promoted from repository fixtures alone.

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

**Status:** repository gate complete; **pending an actual user-supplied pack/folder**.

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

## P2 — Independent-product cutover

**Status: CLOSED (2026-09-28).**

### P2.4 — Final fresh-origin release-autonomy proof

**DONE (2026-09-28).** Final proof used published commit
`2be5260012ce026da4fd6b79437ac4beb1fa6fb4` from the completely new clone
`E:\Downloads\devspace-test\experiments\photoshop-mcp-digital-painting-p2.4-proof-2be5260`.
The clone had only `origin`, no `upstream`, and was clean before install.

Fresh-clone evidence:

- dependency installation from declared manifests passed;
- `npm run verify:canonical` passed with **74/74 Vitest files / 740/740 tests**, lint
  **0 errors / 30 existing warnings**, **124 packed dist JS**, **130 atomic tools / 14 Guard tools /
  5 prompts**, source independence **626 / 40,972 = 1.53%**, and all identity/provenance/intake/live
  evidence gates green;
- `npm run build:mcpb` passed on Windows and produced both
  `photoshop-mcp-digital-painting-1.7.6.mcpb` and `photoshop-mcp-digital-painting.mcpb`;
- both archives contain `manifest.json`, `server/dist/index.js`,
  `server/uxp-plugin/manifest.json`, `server/LICENSE`, and `server/NOTICE`; both have 4,193 entries and
  identical SHA-256 `E5F1E52BB423DD9BFCDAB15C32644B9365E94C1F5C8BCE725BCA5FC505E99A85`;
- fresh-clone MCP stdio startup/initialize passed with product identity
  `photoshop-mcp-digital-painting v1.7.6`, 5 guide prompts, tool listing, and capabilities;
- the installed COS Photoshop route was separately verified live as UXP-ready with matching bridge
  revision. The fresh-clone stdio child itself did not acquire that UXP bridge revision, so no
  Photoshop mutation was claimed from the fresh artifact; the bounded live check remained
  non-mutating and did not interfere with an already-active artistic workflow.

### P2.5–P2.8 — Closed repository gates

**DONE (2026-09-28).** Source-independence/upstream-code retirement, standalone product identity,
license/origin attribution, and selective external/upstream intake are closed repository gates.
Their implementation history belongs in `CHANGELOG.md`; current gate evidence is maintained by:

- `npm run verify:source-independence`;
- `npm run verify:product-identity`;
- `npm run verify:provenance`;
- `npm run verify:external-intake`;
- `docs/roadmap-final-acceptance-matrix.md`.

Do not expand these closed items back into forward work unless one of those maintained gates regresses.

### P2 completion gate

**CLOSED (2026-09-28).** P2.4–P2.8 are all closed. The final fresh-origin proof above establishes that
the published standalone product can be installed, canonically verified, packaged and started from
`origin` without an `upstream` remote or upstream checkout.

### Post-P2 cleanup — GitHub repository identity

This is a separate metadata cleanup and is **not** part of the closed P2 release-autonomy gate.

1. review the GitHub **Leave fork network** option and confirm repository eligibility;
2. assess metadata consequences before execution, including PRs, issues, stars/watchers, wiki,
   comments, child forks and irreversibility;
3. if acceptable, detach the repository from the fork network;
4. update the repository description to standalone product wording;
5. verify the GitHub header no longer shows `Forked from alisaitteke/photoshop-mcp`;
6. retain historical origin/attribution in `LICENSE`, `NOTICE` and project documentation.

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
- blind multi-pass autonomy without per-pass observation and interruption triggers;
- mandatory thumbnails for every scene;
- more Guard safety layers without a reproduced integrity failure;
- large schemas whose fields do not change execution/review behavior;
- category-specific anatomy/hand/object pipelines as the default world-consistency mechanism;
- a second Guard/controller or duplicate art-run persistence tree.

## Upstream integration policy

P2.8 is closed. Continue evaluating upstream/external candidates selectively against the **current
project architecture** under [`external-intake.md`](external-intake.md). Do not wholesale merge changes
that can restore retired controller/raw-script paths, legacy fallback assumptions or incompatible
compact-v2 semantics.

Interrupt this roadmap for upstream work only when a change fixes a reproduced current bug, is
required for host/API compatibility, or provides a measured material advantage to an active task.

## Validation policy for remaining work

Every implemented item should include, as applicable:

1. a reproduced failure/need or a predeclared human-evaluation question;
2. fail-closed or explicitly bounded semantics;
3. targeted repository regression tests;
4. preservation of compact-v2, UXP-only, document-pinning, no-replay and multiscale evidence
   invariants;
5. `npm run verify:canonical` for code changes plus subsystem-specific build/lint/policy checks;
6. real Photoshop/CoS acceptance when the claim depends on live host/Photoshop behavior;
7. independent human-labelled evidence for perceptual/artistic/calibration claims;
8. updates to this roadmap, `CHANGELOG.md` and `docs/roadmap-final-acceptance-matrix.md` so completed
   work does not accumulate again in the forward TODO.

Tool success, comparison SHA, pixel delta, layer creation, primitive/stroke count and mocked critic
verdicts are never sufficient by themselves to prove artistic correctness.
