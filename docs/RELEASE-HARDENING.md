# PaintPilot — Release Hardening

> **Current six-scene artistic qualification:** [user's exact replacement prompts, RQP-2026-10-13-02](RELEASE-QUALIFICATION-SCENES-USER-20261013.md). The [S01 tiger incident and exact continuation state](RELEASE-S01-TIGER-INCIDENT-20261013.md) describe the blocker observed in the exploratory live Photoshop run. Older pagoda/cabin/Mykonos matrix rows are obsolete for this qualification.

Status: **source-level machine gate passed; live Beta acceptance open**. Initiated 2026-10-13.

**Updated source-only verification (2026-10-14, Git source synchronization):**
`npm run verify:canonical` **PASS**, 174/174 Vitest files and 1906/1906
tests; build/package/Guard contract/provenance/source-independence/policy/tool
counts/bilingual docs passed; ESLint zero errors, 173 warnings.
`npm run test:embedded-guard-mcp` **PASS** (38 tools, 15 Guard,
raw mutation `guard_required`). The evidence ledger reported structure PASS,
21/23 files locally present and hash-checked; two gitignored historical files
are unavailable and **not** verified. This supersedes the older offline counts
below but **does not** close Beta/live Photoshop or six-scene qualification.

**Earlier machine-gate verdict (2026-10-13):** `npm run verify:canonical`
**PASS**, 160/160 Vitest files and 1826/1826 tests; build, lint (zero
errors, 173 existing `any` warnings), public Guard contract, package,
provenance, product identity, tools, prompts, policies and bilingual docs all
passed. The independent `npm run test:embedded-guard-mcp` **PASS** exercised
the built stdio child and its published schemas: 38 public tools (15 Guard),
228,409/250,000 catalog bytes; direct raw mutations returned `guard_required`.
This passes **offline/isolated machine qualification only**, not release
approval. The loaded Photoshop MCP remained a **foreign checkout** according to
`deployment:health` (`running_mcp=null` for this workspace) even though the
UXP bridge is connected and its revision matches. The working tree is not a
frozen commit. Clean-install proof, activated-runtime identity, disposable
Photoshop smoke, recovery/save drill and all six genuine artistic runs remain
unperformed. Do not tag, publish or claim Beta safety/autonomy until those
checks pass; see `RELEASE_CHECKLIST.md` at the repository root.

This is a **finite release qualification**, not another feature roadmap or an
additional runtime subsystem. The existing [short painting roadmap](PAINTING-ROADMAP.md)
retains its outcome areas, [work details](PAINTING-WORK-DETAILS.md) retain owning
contracts and [final acceptance matrix](roadmap-final-acceptance-matrix.md) retains
historical evidence. Neither offline tests nor the incident reports below establish
live-pixel or independent artistic success.

## Release scope and change-control rule

- Freeze optional features, new mandatory Guard layers, scene-specific exceptions,
  extra artistic questionnaires and speculative telemetry. Preserve established
  safety, independent component ownership, exact-image review, History, recovery,
  no uncertain mutation replay and explicit user STOP.
- Improve **the existing** `Critic → Painter → Guard → Photoshop` path: Painter
  expresses visual intent and authored artistic choices; the compiler restores
  uniquely known technical metadata; Guard validates and safely dispatches.
  The compiler must **not** infer artistic perspective, anatomy, lighting or
  composition from a subject name, or silently rewrite an unsafe operation.
- Admit a hardening fix only with a reproduced safety failure, execution dead end
  on a standard scenario, shared defect class across scenes, or measured failure
  to reach the stated artistic target. Record trigger, root cause, owning boundary,
  minimal regression and live acceptance. An isolated theme-specific shortcoming
  without a release-level impact can be deferred.
- Run owning offline checks for each fix; after code freeze run canonical gates,
  deployment/restart/recovery checks and the **full unchanged** artistic matrix.
  Do not change code during a qualification run or silently relax its rubric.
- Maintain **one bounded queue** below. A new incident links to an existing class
  unless evidence proves a distinct release blocker. Do not add another P1/P2/P3
  series or confuse number of tests passed with end-to-end readiness.

## Incoming failure evidence (Mykonos night run, reported 2026-10-13)

The timestamps, counts and state values below are **user-reported observations**;
they have not yet been independently reproduced against the loaded runtime.
The guard refusals described may be correct fail-closed behaviour. The suspected
defect is often the missing **recoverable route** after a technically valid refusal.

| ID / owning class | Reported evidence | Required general resolution | Release acceptance |
| --- | --- | --- | --- |
| RH-01 — recovery contract / priority gate | `stage_priority_gate` and a must-fix medium problem blocking a genuine small/local corrective operation; recommendations may contradict gate; separate request used `local` where Director expressly allowed only `medium`/`small` | Make accepted scale/scope and actionable alternatives consistent across Director, compiler, Guard and error response. Permit bounded work contributing to a larger defect when justified by its relation to that defect; never auto-admit arbitrary `local` scope | One authorized local correction to a larger scene problem proceeds safely; one genuinely forbidden scale receives a correct admissible alternative. No same-cause refusal loop |
| RH-02 — autonomous stall / priority reconciliation | `workflow_stall=true`, `external_actions_since_last_meaningful_visual_change=11`; last material gain reportedly ~01:32, sky pass ~01:41 unresolved; subsequent near-equivalent sky plans; right-facade perspective remains | Detect no-gain and repeated same-cause rejections; switch *causal visual strategy* or report an actionable stop. Re-evaluate the original brief and Critic's scene-wide defects before allowing a minor Director task to dominate. Preserve truly authorized user STOP and unfinished work | Autonomous run either makes an independently visible structural gain or terminates with a named, non-retryable blocker; cannot keep proposing equivalent requests. Architecture can regain priority over decorative sky work |
| RH-03 — new installed-brush purpose | ~01:53 `Round Fan Stiff Thin Bristles`, ~06:51 `Round Curve Low Bristle Percent` rejected for role `plane`; first request also produced six distinct validation codes including owner-role, gradient preflight and intent conflicts | Keep rejection for real unsafe combinations; provide one complete, coherent correction packet and a bounded, reversible compatible-brush trial when the *new use* is unproven, rather than treating missing allowlist membership as physical incompatibility. Repair independently derivable technical fields only | Compatible novel use reaches a bounded trial with exact-image validation and safe owner/History handling; incompatible preset receives a reason and viable alternative without manual schema rewriting |
| RH-04 — executable artistic method | ~04:58 `construction_role_method_unavailable` for `smudge-shape` + `painted-mass/transition`, followed by `invalid_visual_microplan` | Resolve method/role/intent against **actual registered capabilities**, offer one valid replacement method, and aggregate remaining independent preflight errors. Do not invent a method or alter visual intent silently | Valid artistic edge-softening request compiles into an available technique; invalid combination reports an executable correction in one round, not an endless incompatible-method chain |
| RH-05 — edge treatment vs optical blur | Artistic cloud edge softening was reportedly routed through imaging preflight demanding camera model (`imaging_preflight_camera_model_missing`) | Distinguish painterly edge transition/feathering from simulated optical defocus. Only camera-model-dependent operations require optical preflight; keep clipping, owner and reversibility safeguards for both | Ordinary edge correction works without invented camera metadata; optical blur remains gated by its justified imaging preflight |
| RH-06 — bounded status projection | `photoshop_guard_status` returned `guard_state_projection_requires_public_resume` above a 24,576-byte response budget; `resume(projection=recovery)` succeeded | Return a bounded **useful** status with active document, safety/recovery state, blocking reason, next authorized action, and explicit indication that details require `resume`. Do not truncate away authoritative safety facts or send a success-looking partial state | Status stays within budget even after long sessions and always gives a valid recovery route; expanded resume remains exact and agrees with status |
| RH-07 — refusal diagnostics / event boundaries | Counts reported: 123 model-visible Guard calls, 59 pre-execution rejections, 44 semantic-dispatch calls, 32 artistic actions, `deterministic_violations_encountered_count=10`, sum of per-code encounters=120 | Audit definitions, sampling window, event ownership, unique-request vs per-code incidence and denominator semantics. Different scopes are **not automatically contradictory**. Inspect whether the latest telemetry is loaded before relying on it | A documented per-run funnel reconciles by explicit set relationships and labels partial coverage; counts are reproducible from authoritative events, with no fictional attribution or silent extrapolation |
| RH-08 — global artistic completion | `global_brief_outcome=not-evaluated` after roughly 30 visible passes; recognizable scene but reported geometrical clouds, foliage, paving, architecture | Ensure whole-brief evaluation checkpoints cannot disappear in local execution; distinguish technical pass, local artistic improvement, whole-frame brief evaluation and independent human judgment. No claim of quality from a correct command or pixel delta | Whole-brief evaluation is issued at predetermined checkpoints, recorded against the exact image and original prompt, and leaves unresolved substantive deficits open; independent image review determines artistic acceptance |
| RH-09 — optional notification observability | Notifications reportedly missing for skip/error outcomes | Verify whether notification delivery is part of the beta-supported product contract. If yes, cover completed, skipped and failed runs with correct outcome labels and delivery failure reporting; do not misreport sent alerts | Supported notification modes surface each terminal outcome or disclose a delivery failure. If outside beta scope, explicitly document the limitation instead of blocking artistic release |

**RH-05 follow-up (2026-10-20, forest cottage):** after user acceptance of
the editable layered cottage, a soft-brush firefly-halo correction was blocked
because `paint` had been exhausted for this problem. Reversible Gaussian blur
then failed `imaging_preflight_camera_model_missing`; proposing a camera
without durable scene geometry produced `scene_camera_imaging_model_invalid`.
These were pre-dispatch refusals with no uncertain pending Photoshop action.

First, recovery suggestions stopped presenting camera-blocked blur as a ready
alternative (147/147 targeted tests). Next, a distinct, **explicitly opted-in**
`next_pass.painterly_softening` path was implemented for local illustrative
glow. It requires `{purpose:"local-glow",owner_id:"...",revalidate_edges:true}`;
the actual single persistent owner must be `optical-effect` with `effect-only`
or `transparent-overlay` opacity, have no camera binding, and match the exact
layer ID. Gaussian radius is limited to 0.1–24 px; no mixed camera claims or
other blur tools are admitted. Prepared selection/blur uses the same gate.
Native UXP still preserves source pixels with an editable Smart Filter and
one History unit, while Guard retains its normal before/after image review.
The normal camera/depth blur path and wrong/opaque layer rejections are unchanged.

**Still open:** restart the updated MCP server and demonstrate one bounded
firefly-glow pass in Photoshop, verifying actual target ownership, pixel
effect, edge review, layer preservation and Undo. Offline regressions alone
are not end-to-end RH-05 acceptance; do not claim it fully resolved yet.

**Scene model registration follow-up (2026-10-20, same document):** inspection
of the authoritative journal identified two successful saves, sequences 1497
and 1498 (`fairytale_geometry_registration_psd_checkpoint_20261020_v2` and
`fairytale_camera_registration_psd_checkpoint_20261020_v1`), both with
`tool=photoshop_save_document` but **without** root
`scene_geometry_model`/`scene_camera_imaging_model` metadata. Their summaries
mentioned registration, but saved PSD bytes and prose cannot establish Guard
model authority. Read-only `SessionStore` interrogation returned both active
models `null`. The existing `forest-fireflies` owner is layer 15 with
`physical_role=optical-effect`, `opacity_role=transparent-overlay`, and no
explicit `component_space`; its effective world coordinate choice may not be
silently relabelled canvas.

A new bounded checkpoint pathway permits **explicit typed** scene geometry
and, in a subsequent operation, camera data to be recorded with successful
guarded `photoshop_save_document` PSD saves. Compiler and final SessionStore
preflight require the current exact-frame operation ID, SHA-256, document
incarnation, PSD path/format, model/revision continuity, supported style
basis for diagrammatic opt-out, and a *previously durable* exact geometry
revision for the camera. Same-call geometry+camera, stale frames, invalid
models and JPEG/PNG are rejected before saving. The record acquires authority
only on a completed, nonfailed native save; saving without explicit metadata
still saves PSD **without registering any model**. Owner identities and
component coordinate spaces are not edited by registration.

The already-implemented `painterly_softening` path remains the more direct
solution for the firefly halo: existing `forest-fireflies` owner, exact layer
15, no new component-space or camera model claims. The independent live
Photoshop glow acceptance remains open after the MCP server restart.

### Triage order (dependencies, not a growing priority hierarchy)

1. **Stop unsafe or wasteful continuation:** RH-02 and RH-01. Preserve strict
   owner, pending-operation and no-replay guarantees while preventing useless loops.
2. **Make ordinary intent executable:** RH-04, RH-05 and RH-03; first repair
   shared method/capability and admissible-correction pathways, not named presets.
3. **Make state and quality observable:** RH-06, RH-07 and RH-08. In particular,
   a safe status fallback is more urgent than richer optional counters.
4. **Release-experience condition:** RH-09 only within supported beta claims.

These cases are **queued, not declared fixed**. A shared root cause may close
several IDs with one change; a passing isolated unit test closes none without
the specified integration evidence.

**2026-10-13 source-level hardening evidence (not a release PASS):** the public
`photoshop_guard_status` call reproduced RH-06 as
`guard_state_projection_requires_public_resume` (24,576-byte response limit),
while the document-scoped `resume(projection=recovery)` returned an actionable
state. `response-budget.ts` now omits bulky historic Critic/Director diagnostics
from oversized **status** projections, retains priority, exact operation and
ownership/recovery identity, and preserves the full archived projection. The
focused `guard-response-budget.test.ts` suite passed 12/12 including two
long-session cases. Activation and a repeated **live** status query after MCP
reload remain required; if any safety-critical detail cannot fit, fail-closed
resume/ownership projection remains mandatory.

**RH-01 source-level follow-up:** priority-scale advice in the existing
`session-store.ts` is now selected from currently admissible scales under the
active Director/correction target and blocker relation, instead of suggesting
an action that the same Guard will certainly reject. The owning
`planner-painter.test.ts` suite passed **105/105**. This checks actionable
preflight guidance, **not** visual progress or final Director/Critic alignment.

**RH-02 source-level fix (live acceptance still open):** workflow stall metrics
already existed, but the next-action route previously fell through to the
unchanged Director task. Source now rejects the same executable strategy on
subsequent visual mutation after genuine ineffective visual evidence, directs
the next action toward the largest remaining must-fix rather than blindly
reentering a decorative task, and flags Director review_due after two
insufficient passes. Action-count-only churn with no ineffective visual
does not block the next meaningful pass. `decision_loop_stall` remains advisory;
rollback, technical reads and genuine recovery remain permitted. The focused
RH-02 tests and full `planner-painter` **106/106** passed. Full
`session-store-regressions` was **99/100**: the unrelated one failing historical
ownership fixture lacks mandatory `edit_axes`. No autonomous Photoshop result
has yet been used to accept RH-02.

**Machine-gate blocker (cross-cutting, not a new feature ticket):** the first
broader run of `compact-contract-regressions`, `next-pass-compiler` and
`geometry-contract-repair` finished at **83/125 passing, 42 failing**.
Multiple failures return `scene_editable_inventory_required` for omitted
`scene_ownership_plan.units[].edit_axes`, including formerly accepted
first-block-in/continuation fixtures. Do **not** make the gate green by blindly
inserting invented artist edit intentions into fixtures. First determine the
correct compatibility/safe-inheritance rule; maintain real separate-owner and
exact-image editable-scope guarantees. Canonical verification is not yet PASS.

**Follow-up compatibility evidence:** Fixture ownership plans that were
authored before `edit_axes` became mandatory were updated *in tests only*,
using explicitly authored expected axes. Production does not infer them.
`session-store-regressions` now passes **100/100**; `planner-painter`,
`artistic-recovery-production` and `guard-response-budget` together pass
**136/136**. Geometry replay is **5/6** (21,275-byte aggregated error result
above the existing 20,000-byte test threshold). Compact contract acceptance
still has multiple follow-on failures, not cleared by inventing editability or
success receipts. `npm run lint` now returns 0 errors (173 historical warnings).
Candidate source/dist was rebuilt as `04a96f4b1f90` before the final lint
cleanup; rebuild again from a frozen candidate before activation.

**Second safety review and follow-up (source-only):** independent review found
three missing cases in the first narrow implementation. The status budget now
retains an active whole-image-glance hard blocker and review route; it never
silently truncates identity-recovery blockers or semantic owner bindings.
If they cannot fit, the existing fail-closed resume-required response wins.
In stall accounting, rolled-back or explicitly nonauthoritative visual frames
no longer reset the meaningful-progress anchor. The cabin geometry rejection
now deduplicates only exact path+reason corrections repeated in
`geometry_contract.issues`, retaining full canonical `violations` and spatial
repair template. Direct owning suites: `guard-response-budget` **14/14**,
`geometry-contract-repair` **6/6**, `session-store-regressions` **101/101**,
including a current-frame-authority rollback case. Source builds successfully.
These checks remain strictly offline; complete canonical and Photoshop artistic
qualification are still open.

The initial working-tree `deployment:health` reported `deployment_build_outdated`
and `deployment_foreign_runtime`. After a source build (`622f342c3336`),
`deployment:health` confirmed source/dist fingerprint parity and UXP revision
parity, but **still** returned `deployment_foreign_runtime` (`running_mcp=null`).
Runtime activation remains a release blocker; no in-process restart or
Photoshop mutation has been performed as part of this check. The pre-existing long control prompt failed the
compactness/policy gate; after a nonsemantic compaction with preserved consent,
no-replay and critique guidance, `verify:painting-policy` and its owning
`commentary-mode-contract` tests passed locally. These are build-time checks,
not independent painting outcomes.

## Fixed artistic qualification matrix

**Exact prompts, sizes and retained-source provenance:**
[RQP-2026-10-13-01 six-scene protocol](RELEASE-QUALIFICATION-SCENES.md).

Register six prompts, scene constraints, style/finish goals, clean-document
settings, seed/reference rules if any, and baseline image/runtime before first
qualifying run. Use **three retained/problem-known** and **three previously
unseen** prompts. Do not tune the compiler, Guard or Painter per scene.

| Scenario | General mechanism covered | Mandatory visual evidence |
| --- | --- | --- |
| Detailed architectural line drawing (retained pagoda or equivalent) | Thin strokes, contour geometry, roof perspective, separable components | Recognizable structure, stable thin lines and correct major projections |
| Object-rich interior (retained cabin) | Multiple layers/owners, occlusion, material/light and contact | Readable placement, coherent depth and independently editable important objects |
| Urban perspective (retained Mykonos or equivalent) | Facade/window convergence, camera relations, sky vs structure prioritization | Major vanishing relations and window planes correct; naturalization does not displace geometry repair |
| Human figure (held out) | Anatomy, articulation, proportions, cloth/contact, layer independence | Credible pose and attachments within requested stylization |
| Natural landscape (held out) | Organic masses, atmospheric depth, brush-purpose flexibility, edge transition | Plausible natural forms and depth without geometric placeholders |
| Free painterly illustration (held out) | Open-ended style, expressiveness, light/material, Critic flexibility | Deliberate composition and style fidelity, without forcing photographic realism |

For **every** case capture initial prompt, runtime/build identity, start/end,
first meaningful pixels, first recognizable composition, time to acceptable
result, actual delivered frames, PSD/layer topology, tool/rejection funnel,
stall/recovery episodes, no-replay and rollback outcomes, exact-image Critic
checkpoints and independent assessment. A procedural pass or `saved` status does
not establish artistic completion. If a run stalls, preserve the last safe image
and the blocker; do not manually patch JSON or call an engineer mid-run.

Before running, freeze the scoring rubric and numeric time/quality thresholds
from baseline measurements: subject/brief fidelity, composition, structural
geometry, material/light, style, independent editable parts and overall
acceptability. Use independent, image-first review **without Painter rationale**;
record disagreements and uncertain ratings rather than inventing precision.
Track both time-to-first-useful-image and time-to-accepted-result, including
failed attempts and technical negotiation. Faster but artistically worse is not a pass.

### Qualification thresholds (pre-registered before any six-scene acceptance run)

Do not silently alter these thresholds after inspecting a candidate result.
The same prompts, evaluator directions, document dimensions, installed brush
inventory and termination rules apply to candidate and baseline. Baseline is a
**full six-scene run of the frozen pre-hardening build**, not historical snippets
of different paintings; if it cannot be run safely, time-improvement remains
`not-measurable`, never a presumed pass.

- **Safety (Beta and 1.0):** zero lost previously accepted pixel regions,
  unauthorized owner edits, silent replay of uncertain mutation, or unreported
  document/session identity mismatch in six runs; exact PSD save/reopen and one
  planned MCP/UXP restart-recovery drill must succeed.
- **Autonomous technical path (Beta):** six of six scenes complete initial
  recognizable composition and one meaningful correction without a human
  JSON/schema repair or engineer restart. A technically nonrecoverable refusal,
  a same-cause repeated loop, or missing evidence at mandatory review is a fail.
- **Independent artistic assessment (1.0):** two evaluators separately score
  subject/brief fidelity, composition, geometry/form, light/material, style
  fidelity and overall finished-image quality on an anchored 1–5 scale
  (`1=absent/wrong`, `3=recognizable but visibly unfinished`,
  `5=convincing within the requested style`). A scene passes only if **both**
  evaluators score overall quality **at least 4** and brief fidelity **at least
  4**, and neither identifies a critical unresolved structural mismatch. A
  disagreement exceeding one point is adjudicated by a third image-first
  evaluator, without revealing Painter claims or scores to that evaluator.
  All six scenes must pass; no average may conceal one failed scenario.
- **Speed (1.0):** median time to first recognizable composition must be no
  worse than baseline; median time to independently accepted finished image
  must improve by **at least 20%** (`candidate_median <= 0.8 * baseline_median`).
  A scene with no accepted image is counted as an **unfinished run**, not
  excluded as a fast success. Report wall-clock/turn counts and rejection rate
  separately; image quality cannot be traded for raw dispatch throughput.

Beta may pass with honestly documented unfinished final images; 1.0 may not.
If a threshold turns out unrealistic, record the failure and change the claim
or start a newly numbered, preregistered qualification protocol. Never adjust
the running protocol retroactively.

**Qualification protocol:** baseline → freeze candidate → clean install/launch
and MCP/UXP restart verification → six complete uninterrupted runs → independent
review → fix only admitted general defects → freeze a **new** candidate → rerun
all six. Keep the held-out prompts unchanged; replace a leaked prompt only by
pre-registered procedure, not because it failed.

## Explicit release claims

**PaintPilot Beta — managed Photoshop painting:** no accepted pixel loss,
foreign-owner edits, nonreversible uncertain replay or silent document/session
corruption; clean setup, restart, recovery and PSD save verified; supported
operations reproducible; every failure gives a bounded actionable state. All
six workflows must reach their declared core stages without an unresolvable
technical contract dead end. Artistic/autonomy limitations must be published,
and beta must not claim six independently successful finished artworks unless
such evidence exists.

**PaintPilot 1.0 — autonomous digital artist:** all beta safety gates **plus**
all six scenes independently rated acceptable against their preregistered
brief/style/quality criteria, without engineer intervention or manual JSON
repair, with measured time-to-acceptable-image meeting the frozen baseline
improvement target. Self-Critic agreement, test counts and closed Guard
receipts alone are insufficient.

**Current release verdict: machine gate PASS; Beta/1.0 release NOT APPROVED.**
The prior incident failures and exact-identity safety constraints have owning
regressions, but that alone does not certify the installed runtime, autonomous
correction, independent image quality, deployment recovery or either release.
