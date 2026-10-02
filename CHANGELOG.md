# Changelog

## 2026-10-03 — Repository provenance and GitHub identity cleanup

- Updated the repository-facing GitHub URLs from the retired
  `lavalava45/photoshop-mcp-digital-painting` location to the current
  `lavalava45/paintpilot-mcp` origin while keeping the package/runtime identity
  `photoshop-mcp-digital-painting` unchanged.
- Corrected the root MIT `LICENSE` so it identifies the current project copyright as
  `lavalava45 and PaintPilot contributors` instead of presenting the historical upstream author as
  the copyright holder of the independently rewritten current source tree.
- Retained Ali Sait Teke and the original Photoshop MCP repository in `NOTICE` strictly as historical
  provenance. The notice now reflects the maintained source-independence gate: no identical files,
  no substantial same-path copied blocks, no cross-path clone blocks, and no high-similarity
  implementation files remain in the current production source.

## 2026-10-03 — Compact Guard public schema exposes lighting/color preflight

- Fixed a live-discovered compact-v2 contract mismatch where the Guard compiler required
  `next_pass.color_gradient_preflight` for broad atmosphere / relighting / optical-effect work, and already
  understood same-pass `scene_lighting_color_model`, while the public MCP `next_pass` schema rejected both
  fields because they were absent under `additionalProperties: false`.
- Added fail-closed public JSON schemas for `scene_lighting_color_model` and
  `color_gradient_preflight` that mirror the existing compiler normalization contracts instead of weakening
  the boundary with an open-ended object.
- Added focused public-schema regression coverage so `photoshop_guard_cycle_auto` cannot again demand these
  semantic preflights internally while making them impossible for an MCP client to submit.
- Focused schema regression, TypeScript `--noEmit`, and `npm run build:server` are green.

## 2026-10-03 — Manual Photoshop document close now auto-abandons stale Guard state

- Added document-scoped recovery for a user manually closing an in-progress Photoshop document. The UXP companion
  listens for Photoshop `close` notifications and sends a bounded `document_closed` event through the existing
  localhost bridge; Guard then terminalizes only the matching document workflow as
  `stopped / abandoned_document_absent` instead of leaving stale `uncertain`, report, acknowledgement, visual
  verdict, barrier or active-job debt that can block the next painting.
- Close recovery is incarnation-aware. UXP includes the known document-instance witness when available, and Guard
  rejects a stale close event if the same numeric Photoshop document id has already been rebound to a different
  incarnation.
- Guard-controlled `photoshop_close_document` remains a normal terminal close and is not reclassified as manual
  abandonment. Successful controlled close now records `workflow_lifecycle.reason=controlled_document_close`.
- Added a self-healing fallback for lost UXP notifications: `photoshop_guard_status` / Guard cycle compares active
  Guard document debt with fresh UXP document presence and abandons only documents proven absent. A confirmed
  `document_count=0` can close stale document debt without replaying any Photoshop mutation.
- Added focused coverage for manual close cleanup, stale-incarnation rejection, controlled-close exclusion,
  successful controlled-close terminal state, lost-event recovery, and bridge event delivery. Focused verification
  is green (**39/39**), TypeScript `--noEmit` passes, `node --check uxp-plugin/main.js` passes, and
  `npm run build:server` passes.
- Live acceptance on 2026-10-03 passed against `Untitled-1`, `document_id=353`: after the user manually closed the
  unfinished document, `photoshop_ping` reported `documentCount=0` / no active document, while
  `photoshop_guard_status` reported empty `uncertain`, pending report/ack/verdict and active-job sets and recorded
  document 353 as `workflow_lifecycle.status=stopped`, `reason=abandoned_document_absent`. The historical document
  state remains available for audit but no longer blocks a new workflow.

## 2026-10-02 — E.22 stable per-action `gfxcapture` shutdown and exact mutation clips

- Fixed the remaining live FFmpeg/WGC race that produced **48-byte MP4 files** after otherwise successful
  Photoshop mutations. The failure was not caused by Photoshop being behind another window: FFmpeg's
  `gfxcapture` could receive frames, then block waiting for the next Windows Graphics Capture frame and fail to
  return to its stdin loop to consume the interactive `q` shutdown command.
- The recorder now preserves the existing **one clip per real Guard visual mutation** contract rather than
  switching to continuous whole-run recording. After a mutation ends it records the action frame boundary, sends
  `q`, gives FFmpeg a short ordinary-exit window, and only if `gfxcapture` is still blocked calls Win32
  `RedrawWindow(HWND)` for the same Photoshop window. `RedrawWindow` does not foreground, raise or activate
  Photoshop; it only wakes the window/compositor path so FFmpeg can consume `q` and finalize the MP4.
- Added explicit action frame boundaries and post-finalization trimming so recorder warm-up and the technical
  wake frame are excluded from the retained viewer-facing clip. The saved clip therefore represents the agent's
  Photoshop mutation rather than planning/idle time before it or shutdown plumbing after it.
- Kept the H.264 path low-latency for short mutation clips (`libx264`, `tune=zerolatency`, no B-frames) and retained
  validation of the finalized video before a manifest entry is accepted.
- Live regression on `processes/poppy-video-test-process/run-04` passed **two consecutive real Guard visual
  mutations** through the production lifecycle: `poppy-video-r4-bg-01` produced a valid 1920×1024 H.264 clip
  (11 frames, 0.366667 s, 61,551 bytes) and `poppy-video-r4-foliage-01` produced a second valid clip
  (19 frames, 0.633333 s, 70,666 bytes). This directly replaces the earlier sequence where the first later
  mutation collapsed to a 48-byte `ftyp/free/mdat` shell with no `moov` atom.
- Focused process-video tests are green (**20/20**) and `npm run build:server` passes. The remaining E.22 work is
  the broader end-to-end acceptance run covering an intentionally bad attempt, correction/rollback,
  interruption/resume ordering and deterministic final MP4/SRT assembly; basic per-action capture reliability is
  no longer the open blocker.

## 2026-10-02 — Hot-loop compiler live acceptance and projection reuse

- Completed the fresh `hotloop-final5-20261002` live performance run with **8 meaningful VisualMicroPlan passes**.
  Run-scoped benchmark evidence reports **13.337s median visual review**, **1.752s median
  review_finished -> next_pass_ready diagnostic marker**, **1.690s median PaintingIntent -> dispatch**,
  **1.25 model-visible Guard round trips per artistic mutation**, **1 predispatch rejection**, and
  **0 recovery-only round trips**.
- Fixed the live hot-path bottleneck exposed by the run: `compactPassContext()` now reuses Guard's captured
  projection instead of repeatedly reading/scanning global painting state and operation history during
  PaintingIntent compilation, compact-pass validation and deterministic repair. The pre-fix run contained an
  8.633s intent-to-dispatch outlier; post-fix P3-P8 samples all dispatched in <=1.873s.
- Hardened live setup/readiness without weakening fail-closed mutation gates: a transient disconnected long-poll
  readiness sample gets one bounded read-only state wake/probe before readiness is rechecked, and
  `photoshop_guard_set_art_run` binds the exact live UXP document-incarnation witness before writing the new run.
- New-owner PaintingIntent compilation now injects the just-created layer's deterministic step reference into
  layer-targeted mutations and supplies opaque physical-stack facts for structured masses when uniquely implied.
- Added regression coverage for blank-document reactivation, public-cycle stale scene-model incarnation repair, and
  new-owner PaintingIntent layer/stack derivation. Full acceptance: **93/93 test files, 939/939 tests**;
  TypeScript `--noEmit` and `npm run build:server` are green.
- The sole final-run predispatch rejection, `structured_mass_iconic_primitive_compound`, was a genuine form decision
  and remained correction rather than recovery. The latency run closes the engineering performance gate; artistic
  parity remains a separate P1-E.8/P1-E.10 quality/time judgment.

## 2026-10-02 — E.22 GPU-safe Photoshop window capture

- Fixed live process-video capture missing the actual Photoshop document canvas while still recording Photoshop
  chrome/panels. The root cause was `gdigrab hwnd=...`: Photoshop's document surface is GPU/compositor-rendered,
  so GDI window capture returned stale/Home content for the viewport even though the live document was visible.
- The automatic HWND path now uses FFmpeg's Windows Graphics Capture source (`gfxcapture`) against the current
  Photoshop top-level HWND, followed by `hwdownload` for the existing libx264 pipeline. This captures the real
  GPU-rendered document surface and remains window-scoped rather than recording the desktop.
- Explicit non-HWND overrides such as `title=...` remain on the legacy `gdigrab` path for diagnostics/backward
  compatibility. Live read-only verification on the current Photoshop window captured the open daisy document,
  layers and UXP panel correctly where the old GDI path captured the Photoshop Home surface instead.
- Fixed the FFmpeg stop handshake for the new `gfxcapture` path: send the interactive `q` command with
  `stdin.write()` and leave the pipe open until FFmpeg exits. Closing stdin in the same call could race the
  command, leave FFmpeg running, and produce only an unfinalized MP4 header.
- Tightened explicit document-navigation outcome reporting exposed by the live capture diagnostic: a UXP
  `document_not_found` / `ambiguous_name` activation failure now reports `execution: not-executed`, and the Guard
  auto-terminalizes matching legacy uncertain journals because no document activation could have occurred.

## 2026-10-02 — E.22 recording readiness indicator in Photoshop

- Extended the UXP Bridge video controls with live readiness indicators for `FFmpeg` and the current Photoshop
  window before any recording starts. The probe runs `ffmpeg -version` with a short timeout and resolves the
  current Photoshop HWND, but it does not create a clip or mutate Photoshop.
- The readiness contract distinguishes `ready`, `ffmpeg-not-found`, `ffmpeg-failed-to-start`,
  `photoshop-window-not-found`, and a generic Photoshop-window probe failure. The panel renders these as
  `FFmpeg: готов / не найден / ошибка запуска` and `Окно Photoshop: найдено / не найдено / ошибка проверки`.
- Added `GET /settings/process-video-trace/readiness` on the existing localhost bridge and bumped the UXP bridge
  revision to `compact-v2-20261002-video-trace-readiness`.

## 2026-10-02 — E.22 Photoshop-panel video recording toggle

- Added a persistent `Включить видеозапись` control to the Photoshop UXP Bridge panel. The panel reads and writes
  the setting through the existing localhost bridge; it does not add a new MCP tool or a parallel transport.
- Added atomic repo-runtime persistence for the recording preference. A saved panel choice has precedence over
  `PAINTPILOT_PROCESS_VIDEO_TRACE`; the environment variable remains a fallback when no runtime choice exists.
- Guard video capture now resolves its enabled state from that shared setting immediately before each visual
  mutation, so toggling the checkbox affects subsequent clips without restarting the PaintPilot child.
- Added localhost `GET/POST /settings/process-video-trace` endpoints and bumped the UXP bridge revision to
  `compact-v2-20261002-video-trace-ui`. One Adobe UXP Developer Tool **Reload** is therefore required after this
  change; `manifest.json` is unchanged, so Unload/Load is not required.

## 2026-10-02 — E.22 dynamic Photoshop HWND capture target

- Replaced the brittle default `title=Adobe Photoshop` capture target with per-clip discovery of the current
  visible `Photoshop.exe` main-window handle. The recorder now resolves that handle immediately before FFmpeg
  starts and supplies `gdigrab` with `hwnd=0x...`, so document title, zoom, layer name and unsaved-state changes
  do not invalidate the default capture target across operations or Photoshop restarts.
- `PAINTPILOT_PHOTOSHOP_CAPTURE_TARGET` and the programmatic `captureTarget` option remain explicit overrides for
  debugging/special setups. Discovery failure remains recorder-only/non-authoritative: it is converted to the
  existing capture warning path and cannot block or replay the Guard mutation.
- Live read-only discovery against the currently running Photoshop resolved `hwnd=0xA10CFA`, matching the
  observed Photoshop top-level window. Focused verification: `src/core/process-video-trace.test.ts` **10/10 PASS**,
  TypeScript `--noEmit` PASS, `npm run build:server` PASS and `git diff --check` PASS.

## 2026-10-02 — Continuation-phase latency instrumentation

- Added durable `photoshop.guard.continuation_timing.v1` boundaries around explicit
  `photoshop_guard_review_image` delivery and projected them into the existing Guard latency/timeline export.
- Added opt-in benchmark markers `review_finished` and `next_pass_ready` through the existing
  `photoshop_guard_status` surface, avoiding a new public tool and avoiding any mandatory normal-painting
  round trip. Marker mode returns a compact acknowledgement instead of building the expensive full status
  projection.
- The latency record can now expose `guard_response_to_review_request_ms`, `review_image_service_ms`,
  `review_delivery_to_review_finished_marker_ms`, `review_finished_to_next_pass_ready_marker_ms`,
  `next_pass_ready_marker_to_guard_ms`, and `review_delivery_to_next_guard_ms`. These are explicitly
  server-observed diagnostic boundaries, not claims about pure model reasoning.
- Extended the maintained painting-cycle benchmark with a continuation-phase section that reports only
  instrumented samples and keeps missing phases unknown rather than zero.
- Regression coverage proves exact phase partitioning, durable timeline export, marker ordering, automatic
  explicit-review timing, and compact marker-mode behavior. Targeted verification:
  `tests/session-store-regressions.test.ts` + `tests/embedded-guard.test.ts` **153/153 PASS**;
  TypeScript `--noEmit` PASS, `npm run build:server` PASS, compact-v2/tool-count verification PASS.
- Rechecked the actual COS publication budget after rebuilding `dist`: **133 tools / 249,865 bytes** against
  the 250,000-byte ceiling (**135 bytes remaining**). No new public tool was added; E.8c remains an urgent
  host-side capacity problem rather than being hidden by the timing instrumentation.

## 2026-10-02 — E.7c refinement style exemption no longer requires prose authority

- Changed `refinement_check.status=style-not-applicable` so its exact `style_contract_basis` is the executable
  exemption authority; `applicability_reason` is now optional audit/artistic guidance.
- Preserved fail-closed Art Director validation that the supplied basis exactly matches the active durable
  `style_contract`; missing prose cannot authorize a style exemption by itself.
- Repaired stale refinement/unified-operation fixtures to include the now-required perceptual hierarchy, so these
  suites exercise their intended contracts rather than failing at an unrelated earlier directive gate.
- Targeted verification: `npx vitest run tests/refinement-check.test.ts tests/unified-artistic-operation.test.ts`
  PASS (26/26); `npm run build:server` PASS.

## 2026-10-02 — E.7c logical-layer separation prose removed from admission

- Continued E.7c by making `logical_layer.separation_reasons` optional in both compact/public VisualMicroPlan
  schemas and runtime parsing. New/temporary semantic owners are still admitted fail-closed from the structured
  Layer Separation Check, independent rollback semantics, exact one-layer creation/targeting and stable owner id;
  free-form separation prose is audit/artistic guidance only.
- Added regression coverage for a substantial independently adjustable new owner with complete structured
  isolation semantics and no narrative separation reasons.
- Validation: `tests/visual-microplan.test.ts` + `tests/compact-contract-regressions.test.ts` **115/115 PASS**;
  `npm run build:server` PASS; touched-slice `git diff --check` PASS.

## 2026-10-02 — E.7c Art Director interrupt prose/admission separation

- Made free-form Art Director interrupt `detail` optional audit/artistic guidance. The enumerated interrupt
  `reason` remains the structural authority that marks the directive interrupted, forces review and prevents
  further Painter continuation until review; malformed supplied detail is still rejected.
- Aligned the public Guard schema with runtime semantics and added planner/painter regression coverage proving a
  classified interrupt works without narrative certification.
- Validation: `tests/planner-painter.test.ts` 61/61 PASS, `npm run build:server` PASS and `git diff --check`
  PASS for the changed slice.

## 2026-10-02 — E.7c value-criterion prose/admission separation

- Made `value_check.criteria.*.note` optional audit/artistic guidance. The enumerated criterion `status`
  values remain the executable value-gate inputs, with PASS/FAIL consistency and exact grayscale
  evidence/current-frame provenance still fail-closed.
- Aligned the public Guard schema with runtime semantics and added a regression proving a structurally complete
  PASS can admit DETAIL without per-criterion prose. Refreshed the value-check fixture with the currently
  required perceptual-hierarchy contract so the focused suite exercises the value gate rather than failing
  earlier on unrelated Art Director setup.
- Validation: `tests/value-check.test.ts` 13/13 PASS and `tests/planner-painter.test.ts` 60/60 PASS.

## 2026-10-02 — E.7c prompt-conflict rationale/admission separation

- Made `prompt_conflict_preflight.resolution_rationale` optional artistic/audit guidance rather than a
  minimum-length admission certificate. Structural prompt-conflict authority remains fail-closed through the
  dominant objective, conflict declarations, `resolution_mode`, chosen rendering strategy, first-pass sequence
  and concrete user-confirmation evidence whenever a conflict requires user choice.
- Aligned the public Guard schema with runtime semantics and added planner/painter regression coverage proving
  a structurally complete preflight persists without narrative resolution rationale.
- Validation: `tests/planner-painter.test.ts` 60/60 PASS and `npm run build:server` PASS.

## 2026-10-02 — E.7c distributed-attention prose/admission separation

- Made `perceptual_hierarchy.distributed_attention_rationale` optional artistic/audit guidance instead of a
  minimum-length admission certificate. Distributed attention remains structurally explicit through
  `mode=distributed`, mandatory distributed zone priorities and per-zone contrast/detail/edge/chroma budgets.
- Added regression coverage proving prose-free distributed hierarchy normalization while retaining rejection of
  structurally non-distributed priorities. Updated the public Guard schema description to match runtime semantics.
- Validation: `src/core/perceptual-hierarchy.test.ts` 3/3 PASS, `npm run build:server` PASS and
  `git diff --check` PASS for the changed slice.

## 2026-10-02 — E.7c scene-ownership prose/admission separation

- Made `scene_ownership_plan.units[].rationale` and
  `shared_owner_justifications[].rationale` optional audit/artistic guidance in normalization and both public
  Guard schemas. Stable semantic/owner identity, role/editability, shared-owner classification and exact shared
  semantic membership remain fail-closed executable ownership authority.
- Added compact regression coverage proving a deliberately shared owner is admitted and durably normalized
  without narrative rationale while the existing missing-shared-membership rejection remains intact.
- Validation: `compact-contract-regressions.test.ts` 51/51 PASS, `npm run build:server` PASS and
  `git diff --check` PASS for the changed slice.

## 2026-10-02 — E.7c semantic-owner keep prose/admission separation

- Made `photoshop_guard_keep_logical_layer.rationale` optional audit/artistic guidance rather than a
  minimum-length admission certificate. Promotion still requires the exact durable temporary
  `hypothesis_id -> layer_id` binding and a compatible scene ownership plan that predeclares the owner.
- Aligned the public Guard schema and durable lifecycle/report serialization so omitted prose is not recreated
  as fake authority, while supplied rationale remains available for audit context.
- Validation: `session-store-regressions.test.ts` 68/68 PASS,
  `compact-contract-regressions.test.ts` 50/50 PASS, `npm run build:server` PASS and
  `git diff --check` PASS.

## 2026-10-02 — E.7c stage-reset public-schema alignment

- Aligned the public compact Guard schema with the already-implemented E.7c stage-reset behavior: only the
  enumerated structural `stage_reset.reason` is required; `stage_reset.detail` is optional audit guidance with
  no minimum prose length.
- Extended the stage-regression regression to assert the published tool schema as well as runtime execution, so
  a future schema/handler drift cannot silently reintroduce a narrative admission certificate.
- Validation: `compact-contract-regressions.test.ts` 50/50 PASS, `npm run build:server` PASS and
  `git diff --check` PASS. `npm run verify:canonical` remains FAIL in the shared working tree at acceptance:
  23/899 failures are concentrated in `value-check`, `refinement-check` and `unified-artistic-operation`, all
  failing on the unrelated `perceptual_hierarchy must be an object` Art Director state requirement; the compact
  stage-reset regression passes inside that same canonical run.

## 2026-10-02 — E.7c final-comparison prose/admission separation

- Made `final_comparison.reason` and the five free-form `criteria` strings optional artistic/audit guidance
  instead of completion certificates. Completion remains fail-closed on explicit scope/preference, current
  classified whole-frame evidence, durable previous-anchor identity when comparing, document/order binding,
  unfinished-task rules, and the existing brief/refinement/hostile-review completion gates.
- Updated the public Art Director schema and added planner/painter regression coverage proving a structurally
  evidenced current-vs-anchor comparison can complete without narrative comparison prose.

## 2026-10-02 — E.7c artistic-anchor prose/admission separation

- Made `anchor_decision.rationale` optional review/audit guidance instead of a minimum-length admission
  certificate. Anchor authority remains fail-closed through the explicit action and durable classified frame
  identity/evidence checks; promotion still cannot target an unretained or mismatched frame.
- Updated the public Guard schema and added planner/painter regression coverage proving a durable accepted frame
  can be explicitly promoted without narrative prose. Targeted validation: `planner-painter.test.ts` 57/57;
  `npm run build:server` PASS.

## 2026-10-02 — E.7c composition-selection prose/admission separation

- Made Art Director `composition_exploration.selection_reason` optional guidance instead of a prerequisite
  for free or constrained material composition commitment. The bounded hypothesis comparison and exact
  `selected_id` remain structural decision authority.
- Added planner/painter regressions proving both free and constrained composition choices persist with a null
  selection reason when the executable structural choice is otherwise valid.

## 2026-10-02 — E.7c fallback prose/admission separation

- Made VisualMicroPlan `paint_strategy.fallback_reason` optional guidance instead of an execution certificate.
  `fallback_from_method_id` remains executable routing authority, and a reason without a fallback identity is
  still rejected as malformed metadata.
- Preserved continuous-field and optical-veil anti-degradation checks while removing their dependency on
  minimum-length fallback prose. Added regression coverage for prose-free explicit fallback.
- Targeted validation: `visual-microplan.test.ts` 62/62, `visual-microplan-compiler.test.ts` 17/17,
  `compact-contract-regressions.test.ts` 50/50; `npm run build:server` PASS.

## 2026-10-02 — E.7c cross-layer correction prose/admission separation

- Made `cross_layer_correction.reason` optional guidance across the compact Guard and VisualMicroPlan
  schemas/parser. Executable authorization remains fail-closed through correction/migration mode, current owner
  layer, exact historical targets, and the post-authoritative binding.
- Updated the historical-layer correction regression to execute without prose certification. Targeted
  `compact-contract-regressions.test.ts` validation passes 50/50.

## 2026-10-02 — E.7c stage-reset prose/admission separation

- Removed the minimum-length `stage_reset.detail` prose certificate from backward painting-stage admission. A
  reset still requires an explicit allowed structural `reason` and exact durable from/to stage binding, so a bare
  stage label still cannot silently downgrade durable state.
- Kept optional reset detail as durable audit guidance when supplied and preserved reset invalidation of dependent
  refinement/physical-stack evidence. Added regression coverage proving an explicit structural reset executes and
  persists correctly without free-form detail.

## 2026-10-02 — Whole-frame structural-debt enforcement and perspective admission

- Made whole-frame review an execution boundary rather than post-hoc commentary: every meaningful visual pass must
  include one whole-frame observation before its verdict can close. Compact observations default their evidence
  scope to the whole delivered frame, while genuinely local-only observations now fail closed.
- Promote generic `must-fix` visual-review findings into durable `visual_problems`, including a new
  `perspective_geometry` composition finding. Structural must-fix debt blocks unrelated dependent painting and
  cosmetic/surface masking of the same problem until a structural correction resolves or reclassifies it.
- Prevent Art Director completion while any must-fix visual problem remains. A due final whole-image glance may be
  supplied and verified in the same `action=complete` call, and the public Art Director schema now exposes the
  already-enforced pre-final hostile review contract instead of hiding that completion requirement.
- Keep close-only visual workflows active when the just-reviewed target is unresolved, any visual problem remains
  open, or an Art Director still has unfinished work. A locally successful pass no longer turns remaining artistic
  work into `ready`/stopped state merely because its own operation goal was satisfied.
- Strengthened geometry admission independently of paint mechanism: committed spatial owners now require a durable
  scene-geometry classification; coherent one/two/three-point construction requires the corresponding distinct
  vanishing-point basis plus an owner Geometry Binding. Filled compact `logical_layer`/causal schema gaps so the
  public compact contract can express the same structural signals the compiler already understands.
- Added regressions for whole-frame closure, durable perspective debt, cosmetic rejection with structural repair
  still admissible, finalization refusal on must-fix debt, mechanism-independent spatial geometry admission,
  duplicate-VP two-point rejection, public schema parity, and active-workflow retention after a resolved local pass.

## 2026-10-02 — Compact model-facing MCP tool catalog

- Reduced the published `tools/list` byte footprint without changing internal Photoshop/Guard schemas: Guard-only
  raw mutations now expose a compact Guard routing marker plus the first purpose sentence instead of repeating the
  full mutation prose on every blocked tool.
- Compact only the model-facing field descriptions of the three largest orchestration schemas
  (`photoshop_execute_visual_microplan`, `photoshop_guard_cycle`, `photoshop_guard_cycle_auto`) to their first
  sentence; property names, required fields, enums, ranges and internal validation semantics remain unchanged.
- Rebuilt the complete current **133-tool / 16-Guard-tool** catalog; after the structural-contract fields above the
  current measured exposure is **247,175 bytes**, leaving **2,825 bytes** below the 250,000-byte CoS regression
  ceiling; updated the embedded MCP acceptance fixture from stale 129 to 133.

## 2026-10-01 — E.7c derivable brush material-role metadata

- Moved unambiguous substantial-brush `material_role` classification into the compact compiler: when the
  durable brush preflight plus resolved visual intent (and any explicit brush role) leaves exactly one shared
  single material, Guard derives it instead of requiring duplicate model certification.
- Kept ambiguous/no-fit material inventories fail-closed and retained brush-role/preset ambiguity, probe,
  dynamics and retry-evidence checks unchanged.
- Updated compact-contract regression coverage so an omitted but uniquely evidenced material role proceeds to
  the next real evidence decision rather than failing on `brush_material_role_required`.

## 2026-10-01 — E.7c derivable construction-role metadata

- Moved the unambiguous continuous-field construction role from model certification into the compact compiler:
  a pass composed of the dedicated `photoshop_paint_color_gradient` mutation now derives
  `construction_role=continuous-field` automatically.
- Kept ambiguous region/brush construction roles fail-closed and preserved material, geometry, method and
  mandatory after-preview checks. Added regression coverage proving the derived role is persisted in the
  executable paint strategy.

## 2026-10-01 — E.7c construction-plan/admission separation

- Removed the deep-local `construction_plan` prose certificate from broad structured-mass mutation admission.
  Representation-strategy prose, structural-feature lists and stage-exit-condition text remain useful durable
  artistic guidance but no longer grant execution authority.
- Preserved executable construction-role/material/method checks, anti-iconic primitive constraints and geometry
  contracts, and added regression coverage proving a safe structured-mass pass can execute without the narrative
  plan while the same pass still works when guidance is present.

## 2026-10-01 — E.7c escalation-label/admission separation

- Removed validation of optional `causal_escalation_level` from mutation admission. The field may remain as
  legacy/process annotation, but malformed or stale narrative labels no longer veto an otherwise safe visual
  operation; observed failure history and executable strategy differences remain authoritative.
- Added regression coverage proving an artistic VisualMicroPlan enters the normal guarded path even when a
  legacy escalation label is non-numeric.

## 2026-10-01 — E.7c commentary/admission separation

- Removed the artistic/mixed-run requirement that every visual mutation carry `artistic_commentary` matching
  user-visible prose. Commentary remains available as presentation/process-trace metadata but no longer grants
  execution authority or blocks an otherwise safe visual operation.
- Updated Guard art-run guidance and added regression coverage proving an artistic-mode visual microplan can
  enter the normal guarded path without a prose commentary token.

## 2026-10-01 — E.7a independent observation closure

- Decoupled valid previous-observation closure from deterministic validation of the next operation in the compact
  Guard cycle. A malformed continuation can now be rejected without reopening an already delivered visual result.
- Repeated combined retries are idempotent: the previous operation remains closed and the rejected next mutation
  is never dispatched or persisted.
- Added focused embedded-Guard regression coverage for valid previous + invalid next and its repeated retry.

## 2026-10-01 — Forward-roadmap cleanup + E.7 semantic-pass coverage plan

- Pruned completed implementation detail from `docs/PAINTING-ROADMAP.md` so the forward roadmap no longer
  restates repository-complete E.18e/f/g/i, E.22 capture/assembly implementation, completed E.17 corrective
  machinery or PaintPilot-owned E.8b checkpoint/timeline work. Those completed slices remain recorded in this
  changelog and the acceptance matrix; only their outstanding live/host gates remain in the roadmap.
- Removed stale forward-priority wording for the already-complete E.20 Scene Camera & Imaging Model and
  Perceptual Hierarchy Contract, corrected the obsolete E.6 dependency on completed E.1/E.2 ownership work, and
  updated the public-release section to reflect that the GitHub standalone cutover itself is already complete.
- Added forward task **P1-E.7 Semantic-pass coverage and underfill prevention**, reproduced by the 2026-10-01
  night-city run. The plan does not add a minimum action/stroke quota: it requires the Planner to account for
  causally compatible ready work, distinguish primitive-instance count from artistic coverage, surface
  unexplained pass underfill, and reuse E.18/mechanical-pattern contracts for geometry-bound repeated facade
  detail. The maintained acceptance fixture includes the observed one-mutation / roughly 27 template-window
  failure and a one-item simple-pass control.

## 2026-10-01 — E.17g structural-mismatch cosmetic one-shot gate

- Added the problem-local structural-mismatch gate required by E.17g. Once a verdict identifies persistent
  silhouette/topology/perspective/proportion/occlusion/large-mass/primitive-scaffold debt, only one bounded
  cosmetic/surface-masking exploratory correction is admitted before another cosmetic pass fails closed as
  `causal_strategy_exhausted`.
- Structural rebuilds at causal escalation level 3+ remain admissible, so the gate redirects method-search loops
  toward the causal scaffold instead of imposing a global action quota.
- Added focused production regression coverage using the motivating polygonal-tree silhouette/negative-space case.

## 2026-10-01 — E.17g construction-plan exit-condition escalation

- Joined repeated same-problem corrective debt to the active Planner task's durable
  `construction_plan.stage_exit_condition`. After two unresolved attempts, dependent work below the
  problem-local minimum causal escalation level now fails closed as `causal_strategy_exhausted` instead of
  continuing to decorate an unresolved scaffold.
- The rejection carries the exhausted problem, exact stage exit condition, attempted strategy families, current
  escalation level and minimum required next level. A structural rebuild that meets the required escalation level
  remains admissible; independent-region work keeps its existing preservation-facts path.
- Added focused production regression coverage for blocking another cosmetic/detail continuation while admitting
  the required structural rebuild.

## 2026-10-01 — E.17g durable corrective-attempt history foundation

- Extended the existing artistic-recovery journal projection instead of adding a parallel retry store. Recovery
  state now reports per-problem attempt/consecutive-unresolved counts, tried methods/strategy families,
  regression/rollback outcomes, strongest-known evidenced frame, current causal escalation level and the minimum
  required next level.
- Added optional subject-agnostic `causal_strategy_id`, `strategy_family` and validated
  `causal_escalation_level=0..4` metadata to the Guard request path. Explicit strategy identity can now survive
  cycle compilation while legacy operations continue to use the structural strategy fingerprint that deliberately
  ignores color/opacity/preset/count jitter.
- Added production regression coverage for durable problem-local escalation history, including rollback/regression
  accounting and a structural-level next-step requirement.
- Verification: TypeScript `--noEmit` green; focused artistic-recovery production suite 8/8 green.

## 2026-10-01 — E.17d physical/optical completion accountability

- Added completion-side `physical_effect_completion_debt` over the existing semantic owner stack. Persistent
  transmissive/transparent/effect-only owners must retain a concrete physical/perceptual role rather than an
  unexplained decorative overlay; opacity/role contradictions are completion debt.
- When an E.19 Scene Lighting & Color Model is active, lighting/material-causal roles such as atmosphere,
  optical effects, surface conditions, cast shadows and transmissive surfaces must have a current E.19
  `lighting_color_binding`. Missing or selectively stale bindings block Art Director completion.
- `camera-post` remains owned by E.20 and is deliberately not forced through E.19 causality. Ordinary named
  translucent material roles can remain qualitative when no E.19 scene-light model applies.
- Compact pass context and status expose physical-effect completion debt separately. Art Director completion now
  fails closed while that debt remains unresolved.
- Added regression coverage for an unexplained lantern glow, successful closure after a current E.19 causal
  binding, relighting-driven stale debt reopening, and E.20 camera-post remaining outside the E.19 gate.

## 2026-10-01 — E.17c E.18-backed geometry completion gate

- Added completion-side `geometry_completion_debt` as a projection over the existing E.18 Scene Geometry Model
  and durable Object Geometry Bindings; E.17 does not duplicate horizon/vanishing/support-plane logic.
- `applicability=insufficient_evidence` is explicit completion debt. Deliberate `orthographic_or_diagrammatic`,
  `flat_or_collage`, and `intentional_non_euclidean` applicability records remain valid brief/style-backed
  opt-outs rather than being forced through coherent perspective.
- For coherent-3D owners, only bindings explicitly marked `exact_geometry_completion_relevant` participate in
  this completion gate. Their current binding must be non-stale and still pass E.18 exact measurement/landmark
  evidence checks against the exact Scene Geometry Model source frame.
- Art Director `action=complete` now rejects unresolved E.18 completion debt before declaring a final artistic
  state. Compact pass context and status expose the same debt separately from ordinary geometry-binding state.
- Added regressions proving current exact evidence yields no completion debt, a later structural-source revision
  makes the completion-relevant owner stale, `insufficient_evidence` blocks finalization, and an explicit flat
  applicability opt-out allows completion.

## 2026-10-01 — E.17b named-object recognition crop gate

- Extended hard brief items with optional `recognition_target` metadata for concrete named subjects/objects without
  introducing object-specific anatomy logic. Only hard-perceptual items may declare a recognition target.
- A recognition-target hard item cannot be independently assessed `MET` from prose, layer names or whole-frame
  intent alone. The final assessment must cite a materialized `review_artifact:<artifact_id>` from the exact
  current-frame operation, at OBJECT or MICRO review level, bound to the same brief item and whole-frame SHA.
- Propagated `brief_item_id` / `brief_state` through the existing structured review escalation pipeline into
  immutable crop evidence, preserving source-document crop coordinates and current-frame provenance.
- Existing recognition/crop machinery remains generic: ambiguous named subjects can request an OBJECT
  `object_readability`/structural crop, while deliberately stylized but recognizable subjects are not rejected for
  lacking photoreal detail. The gate proves prompt-relative identity evidence, not a universal realism score.
- Added regressions proving a named guardian-lion item cannot be marked `MET` without current-frame crop evidence,
  that the exact bound crop permits `MET`, and that brief identity survives pending-review → capture → artifact.

## 2026-10-01 — E.17a durable hard-perceptual brief debt

- Extended the existing revision-bound `artistic_evaluation_contract` rather than creating a second brief system.
  Contracts may now carry explicit `brief_items` classified as `hard_perceptual`, `soft_preference`, or
  `technical_non_visual`, with stable ids, prompt provenance and concrete requirements.
- Independently validated global brief assessments now record per-item `UNASSESSED | MET | NOT_MET | UNCERTAIN`
  results. Every hard-perceptual item must be assessed before a strict brief can report `satisfied`; any
  `NOT_MET`, `UNCERTAIN` or `UNASSESSED` hard item remains blocking debt, while unresolved soft preferences do
  not prevent completion.
- Compact pass context and status/resume now expose `unresolved_hard_brief_debt`. Newly declared hard requirements
  appear immediately as `UNASSESSED`, so lack of evaluation cannot be mistaken for lack of debt.
- Structured current-frame review findings may bind directly to a hard brief item with `brief_item_id` plus
  `brief_state=NOT_MET|UNCERTAIN`. A must-fix producer/critic finding therefore becomes durable prompt debt in the
  same verdict that detects it instead of coexisting with an optimistic completion claim.
- Hard-debt evidence follows current-frame lineage: an override sourced from a rolled-back, superseded, foreign-
  incarnation or otherwise non-authoritative operation no longer blocks forever and falls back to the latest
  independently validated assessment or `UNASSESSED` state.
- A later independently validated `MET` result clears the corresponding current-frame override. Strict Art
  Director completion is gated by `globalCompletionAllowed` only for contracts that actually declare hard brief
  items, preserving compatibility for older contracts while making the new E.17a mode fail closed.
- Added regressions for hard-vs-soft debt, uncertain/not-met completion blocking, positive hard-MET completion,
  immediate UNASSESSED status projection, current-frame finding promotion and rollback retirement.

## 2026-10-01 — Durable Art Director perceptual hierarchy contract complete

- Extended the existing Art Director directive instead of creating a separate E.21 scene model. Added
  `photoshop.guard.perceptual_hierarchy.v1` with revisioned ranked/distributed attention modes, explicit owner→zone
  allocation, qualitative contrast/detail/edge/chroma budgets and ordered focal zones for ranked compositions.
- Ranked mode now rejects the degenerate "every zone is primary" state; intentionally flat/all-over graphics use
  explicit `mode=distributed` plus a concrete rationale instead of accumulating independent local focal choices.
- Added bounded Painter task authorization through `perceptual_zone_ids` and semantic-owner `attention_binding`
  records. Attention-sensitive local passes that change contrast/detail/edge/chroma must identify the exact active
  hierarchy revision and authorized zone before Photoshop mutation. Cross-owner/unauthorized zone use fails closed.
- Attention bindings persist through VisualMicroPlan continuation layers and semantic ownership. SessionStore now
  exposes independent `attention_binding_states` debt. Changes to a bound zone budget or focal ordering selectively
  stale affected owners; unrelated zone-only revisions leave other attention bindings current.
- Kept evidence critics and mechanisms separated from hierarchy authority: Value Check/Softness Review remain
  evidence-bound critics, E.20 camera focus remains optical/capture state, and local edge/detail/chroma mechanisms
  consume rather than redefine the Art Director attention allocation.
- Added regressions for ranked budgets, distributed attention, duplicate owner allocation, all-primary rejection,
  zone-budget and focal-order invalidation, Guard rejection without an attention binding, wrong/unauthorized zone
  rejection and successful authorized local emphasis dispatch.
- Per forward-only roadmap policy, the completed Cross-cutting P1-E perceptual hierarchy block was removed from
  `docs/PAINTING-ROADMAP.md`; this changelog is the historical record.

## 2026-10-01 — E.20 Scene Camera & Imaging Model repository implementation complete

- Completed E.20b focus/depth binding on top of the durable E.20a camera model. Semantic owners may now carry a
  normalized `camera_binding` pinned to the exact camera revision, a declared depth role and expected focus role.
  Depth provenance must come either from the same owner's accepted E.18 geometry binding or from an explicit
  approximate-depth rationale; cross-owner geometry borrowing is rejected before Photoshop mutation.
- Added durable serialization/reconstruction of camera bindings through VisualMicroPlan continuation layers and
  SessionStore semantic ownership. Guard rejects missing camera models, stale camera revisions, stale E.18 depth
  provenance and owner mismatches before dispatch, while explicit current-revision revalidation remains possible.
- Added `photoshop.guard.imaging_preflight.v1` for E.20c. Camera-post and explicit blur treatment now require a
  preflight bound to the exact active E.20 revision. It records effect kind/motivation/scope, per-owner depth/focus
  expectations and edge/detail revalidation. Comparable-depth owners with contradictory focus roles conflict
  unless an explicit local exception exists; far sharpening against declared background softness also conflicts.
  Imaging preflight is forbidden from claiming that optical post-processing clears geometry or recognition debt.
- Completed E.20d selective invalidation. Camera bindings declare dependency domains (`focus`, `motion`,
  `optical-response`, `capture-finish`); revision diffing invalidates only owners whose declared camera dependencies
  changed. Geometry-derived bindings additionally inherit the owner's E.18 geometry-stale state, while bounded
  approximate-depth bindings do not become stale merely because unrelated geometry provenance changed.
- `camera_binding_states` are reconstructed durably and exposed independently through compact pass context/status,
  separate from geometry and lighting/color debt. Tests cover focal-depth, motion and capture-finish invalidation,
  plus E.18 geometry propagation only where the owner's depth relation is actually affected.
- Completed the E.20f repository regression pack: coherent near/focal/far focus allocation, same-depth conflict,
  focal-depth invalidation, E.19 atmospheric fog softness remaining distinct from E.20 optical DOF softness,
  qualitative camera/lens language without fabricated physical focal-length simulation, and subordinate
  grain/bloom/vignette behavior that cannot close geometry/recognition debt.
- Per forward-only roadmap policy, the completed P1-E.20 block was removed from `docs/PAINTING-ROADMAP.md`; this
  changelog is now the historical record for the completed work.

## 2026-10-01 — E.19 preflight admission coverage completed

- Closed the remaining repository-side E.19 admission gap for substantial direct color treatment. Once a visual
  frame exists, global hue/saturation, vibrance, exposure, photo-filter, gradient-map and LUT mutations now require
  the same provenance-aware `color_gradient_preflight` used by broad gradients, relighting, atmosphere and major
  optical-effect work. Local bounded color work is not globally over-gated, and the blank-canvas first-visible
  progress exemption remains unchanged. Live Photoshop acceptance remains the only E.19 forward gate.

## 2026-10-01 — E.19c Guard enforcement for material/light bindings

- Continued the existing E.19c implementation by wiring `lighting_color_binding` validation into the canonical
  Guard compiler before MATERIAL dispatch; no parallel runtime or material store was introduced.
- MATERIAL bindings are checked against the applicable E.19 scene model: the exact current durable revision or
  a valid same-pass successor. A binding with no active scene model now fails closed with
  `material_lighting_color_scene_model_missing`; stale/mismatched causal references are rejected before mutation.
- Added a compact-contract regression proving that a MATERIAL pass cannot dispatch Photoshop strokes when it
  claims a lighting/color binding without an evidenced active scene model.
- Focused verification: scene-lighting + compact-contract suites **51 tests green**; TypeScript `--noEmit` green.
  E.19 remains open for the later preflight/dependency-invalidation slices and their acceptance evidence.

## 2026-10-01 — E.19c material/light binding foundation

- Continued E.19 from the durable scene-model persistence boundary by extending the existing Material Response
  plan with an optional normalized `lighting_color_binding`; no second material schema/store was introduced.
- The binding records exact scene-model id/revision plus base color family, received ambient/emitter sources,
  atmosphere, reflection emitters, surface condition and qualitative color relations.
- Added causal scene validation that rejects stale E.19 revisions, unknown illumination sources, invented
  reflection emitters and atmosphere references outside the active scene model. Regression coverage includes
  the foggy-railway wet painted-metal/headlight case and stale/invented-source failures.
- Focused verification: **2 files / 67 tests green**; TypeScript `--noEmit` green. E.19c remains open for
  Guard-cycle enforcement against the current durable scene model before MATERIAL dispatch.

## 2026-10-01 — E.19b Guard persistence

- Continued the E.19 Scene Lighting & Color Model from its normalization foundation and wired it into the
  canonical Guard cycle rather than creating a parallel state store. `scene_lighting_color_model` is now an
  allowed cycle contract field and a successful operation persists the normalized model in the durable journal.
- Added fail-closed identity/revision rules matching the document-incarnation safety boundary: the source document
  and incarnation must be current, an existing model keeps its `model_id`, and replacement revisions must increase.
- SessionStore now reconstructs the latest valid lighting/color model only from the current document incarnation
  and exposes it through compact pass context and compact status/resume. Added regression coverage proving a newer
  current-incarnation revision wins while a later stale-incarnation record cannot replace it.
- Focused SessionStore verification is green at **1 file / 60 tests** and TypeScript `--noEmit` is green. E.19
  remains open for material/light binding, color preflight/severity and selective dependency invalidation.

## 2026-10-01 — E.19 Scene Lighting & Color Model foundation

- Rechecked the higher-priority E.18 live gate first. The installed Photoshop route still reports the required
  UXP companion unavailable (`fetch failed` / revision not ready), so no live E.18 evidence was fabricated.
- Started the next repository-owned scene-coherence slice, E.19a/b, with
  `photoshop.guard.scene_lighting_color_model.v1`: durable revision/incarnation identity, global value
  structure, ambient environment, emitters, atmosphere, palette relations, sampled anchors and intentional
  exceptions.
- Added explicit provenance normalization so prompt/user constraints, reference samples, accepted-frame
  evidence, deterministic derivation and artist-selected choices remain distinguishable. Exact RGB sample
  payloads are accepted only as reference/accepted-frame evidence; reference-sample claims require a concrete
  RGB sample and source.
- Added focused foggy-railway regressions proving relational cool-environment/warm-emitter constraints remain
  durable without inventing exact RGB measurements, plus fail-closed tests for false sampled provenance.
- E.19 is not complete: Guard persistence, material/light binding, preflight severity and dependency
  invalidation remain open.

## 2026-10-01 — E.8b Guard-side cross-layer timeline export

- Added the PaintPilot-owned E.8b.4 join surface: full Guard status now exports
  `photoshop.guard.continuation_timeline_export.v1` per document with stable document-incarnation/operation
  join identity and exact Guard response-ready / next-continuation boundary events.
- The export projects the existing authoritative E.8a `photoshop.guard.cycle_latency.v1` record rather than
  inventing a second Photoshop timing schema. The between-call interval stays explicitly
  `unattributed_until_host_join`, so later COS evidence may partition compaction/resume/recovery phases without
  mislabelling unobserved time.
- Added regression coverage for a 40-second visual continuation gap and the host join contract. Focused
  session-store verification is green at **1 file / 59 tests** and TypeScript `--noEmit` is green. COS-side
  event correlation and live replacement-chat latency acceptance remain open.

## 2026-10-01 — E.8b automatic exact-resume routing

- Completed the PaintPilot-owned E.8b.2 routing contract: `photoshop_guard_resume` without an explicit document id
  now consumes and verifies `continuation-checkpoint.json` before doing ordinary durable-state discovery.
- A verified checkpoint returns the exact pending operation/delivered frame and an explicit continuation contract;
  the next model action is inspection plus `previous_operation_id + previous_observation`, never mutation replay.
- A stale/inconsistent checkpoint fails closed into one bounded status/recovery verification and explicitly marks
  exact resume as required. Only a genuinely missing checkpoint uses the legacy durable-state fallback. COS-side
  replacement-chat injection/watchdog and live forced-compaction acceptance remain open.

## 2026-10-01 — E.8b exact-resume checkpoint verification

- Completed the repository-owned E.8b.1 persistence slice and started E.8b.2: SessionStore now verifies a
  supplied continuation checkpoint against current authoritative durable Guard state before it can guide resume.
- Verification fails closed on document-incarnation, current operation, pending-verdict, delivered-preview
  operation/SHA/path or immutable art-run drift. A stale checkpoint therefore cannot resume a newer frame.
- Added bounded persisted-checkpoint load/verification with explicit missing, invalid and stale results. Success
  returns the exact operation/frame identity and canonical next Guard action without replaying a mutation.
- Focused verification is green at **1 file / 58 tests**, TypeScript `--noEmit`, painting-policy and
  acceptance-matrix checks. COS replacement-chat handoff/watchdog and live forced-compaction acceptance remain open.

## 2026-10-01 — E.8b durable continuation checkpoint foundation

- After rechecking the higher-priority live gates, Photoshop is detected but the required UXP companion is still
  unavailable (`uxp_bridge_revision_missing`), so neither E.18 nor E.22 live acceptance was fabricated.
- Started the next repository-owned E.8b slice: `SessionStore.continuationCheckpoint()` now derives a compact
  `photoshop.guard.continuation-checkpoint.v1` directly from durable Guard resume state, including exact
  document/incarnation, current/pending operation, delivered preview SHA/path, pending-verdict state, active
  problem/stage/scale/severity, accepted anchor, art-run, planner directive/task and prescriptive next action.
- Added atomic `persistContinuationCheckpoint()` output under the Guard runtime directory and exposed `process_dir`
  in the compact document projection so host handoff does not need journal archaeology. Focused regression proves
  the persisted checkpoint is sufficient for exact-resume routing without embedding journal history.
- Verification is green at **1 file / 56 tests**, TypeScript `--noEmit`, and `git diff --check`. The COS-side
  pre-compaction trigger, replacement-chat injection/watchdog and live compaction acceptance remain open.

## 2026-10-01 — E.22 controlled final assembler entry point

- Added `assembleProcessTraceVideo()` as the one controlled repository entry point from retained trace inputs
  to a captioned FFmpeg render. It deterministically regenerates FFconcat/SRT inputs, invokes the configured
  FFmpeg binary, and verifies that the final output exists and is non-empty before reporting success.
- Assembly launch/render failure is fail-closed and cannot fabricate an accepted video or alter Guard mutation
  semantics. Focused regression coverage proves a missing FFmpeg executable rejects while leaving rebuildable
  concat/subtitle inputs and no fake final MP4.
- Focused verification is green at **1 file / 7 tests** and TypeScript `--noEmit` is green. The host has FFmpeg
  installed, but E.22 live acceptance still requires a real multi-pass Photoshop capture; this entry does not
  claim that live proof.

## 2026-10-01 — E.22 deterministic captioned assembly inputs

- Added deterministic E.22.4 assembly planning from the append-only process-video manifest: Guard-ordered
  retained clips now generate an FFconcat list and SRT subtitle artifact without reintroducing wall-clock
  planning/idle gaps between operations.
- SRT timing is based on retained clip durations; the canonical caption remains pre-operation
  artistic_commentary, with an optional outcome/correction note kept as a distinct appended clause. Missing
  or empty clips and invalid durations fail closed instead of silently producing a misleading process film.
- Added final FFmpeg assembly arguments that normalize output to 30 fps H.264/yuv420p and burn the generated
  SRT captions into the process video. Focused tests cover deterministic chronology, dead-gap removal,
  correction-note retention and missing-clip failure.
- Focused verification is green at **1 file / 6 tests**, TypeScript --noEmit and touched-file
  git diff --check are green. This is repository evidence only: a real Photoshop+FFmpeg render remains
  required before E.22 live acceptance can be claimed.

## 2026-10-01 — E.22 Guard-bound FFmpeg capture lifecycle

- Wired opt-in process-video capture into the canonical Guard mutation lifecycle rather than requiring a
  separate model-issued recorder call. Capture starts only after durable dispatch marking and immediately
  before the Photoshop invocation, then stops after a bounded settling tail.
- Added Windows FFmpeg/gdigrab capture scoped to a configurable Photoshop window target, with clips written
  under the immutable art run's `video-trace/clips/` directory. The default path is opt-in through
  `PAINTPILOT_PROCESS_VIDEO_TRACE=1`; FFmpeg path/window target/settling tail remain configurable for live
  acceptance without changing Guard semantics.
- Recorder start/stop failures are deliberately non-authoritative: lifecycle-hook exceptions cannot block a
  canonical mutation, turn an already-dispatched operation into replayable work, or replace Guard evidence.
  A manifest entry is appended only for a non-empty completed clip.
- Added focused coverage for opt-in/window-scoped FFmpeg arguments and for recorder lifecycle failure not
  blocking canonical dispatch. Focused verification is green at **2 files / 21 tests**, TypeScript `--noEmit`,
  painting-policy, acceptance-matrix and `git diff --check` are green. Live Photoshop/FFmpeg acceptance and
  subtitle/final assembly are still open; this entry does not claim them.

## 2026-10-01 — E.22 process-video trace manifest foundation

- Added `src/core/process-video-trace.ts` with an append-only, run-local `video-trace/manifest.json` contract
  and deterministic assembly ordering. Entries preserve visible attempts/corrections/rollbacks rather than
  replacing earlier history, and duplicate operation ids are idempotent across interruption/resume.
- Bound the canonical caption source to the operation's pre-dispatch `artistic_commentary`; missing artistic
  intent fails closed in the trace layer instead of falling back to tool names or technical plumbing.
- Added focused tests for caption provenance, failed-attempt retention/correction ordering and resume
  deduplication. Focused geometry + trace verification is green at **3 files / 13 tests**, with TypeScript
  `--noEmit`, painting-policy and acceptance-matrix checks also green.
- Attempted the remaining E.18 live acceptance first, but the local Photoshop UXP companion was unavailable
  and Photoshop was not running. E.18 therefore remains open; no live evidence was fabricated. This E.22 slice
  is repository-only and does not yet claim FFmpeg capture/Guard-dispatch integration.

## 2026-10-01 — E.18i additional repository regression pack

- Added `src/core/geometry-additional-regressions.test.ts` to cover the remaining non-railway repository
  shapes: a two-point facade rejects a private window-row perspective, bench/sign/person bindings share one
  platform support plane while retaining different quantitative strength, explicit orthographic/flat/
  non-Euclidean applicability records do not invent vanishing points, and organic foliage can bind
  support/depth anchors without forcing contour vertices into analytic geometry.
- Kept perspective-regular coverage at the existing Guard/compiler boundary, where scene-family/support
  provenance is inherited from the current Geometry Binding and contradictory/private perspective is rejected.
- Focused E.18 repository verification is green at **5 files / 25 tests**. The repository regression pack is
  complete; live Photoshop current-pixel-coordinate plus durable status/resume stale-debt acceptance remains
  open and E.18 is therefore not declared complete.

## 2026-10-01 — E.18i maintained railway regression core

- Added \`src/core/geometry-railway-regression.test.ts\` as a maintained regression for the 2026-09-29 railway
  failure shape. It derives the accepted track corridor from exact rail edges, rejects a near contact outside
  that corridor, and rejects the dangerous front-only correction where the far termination/control sections
  still follow an obsolete convergence guess.
- Added revision-transition coverage proving that changing rail convergence makes the accepted train binding
  stale and that merely carrying the old construction into the new revision still fails Geometry Preflight;
  a full current-revision near/mid/far rebuild is required before the binding becomes usable again.
- Kept repository proof distinct from live Photoshop acceptance; the remaining E.18i additional-scene cases
  and live pixel-coordinate/status-resume acceptance remain open in the roadmap.

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — PaintPilot — AI Digital Painting for Adobe Photoshop

### Added

- 2026-10-01 — Completed the specified **P1-E.18g exact measurement/landmark integration** repository slice.
  Geometry Bindings may now mark exact geometry as completion-relevant and bind bounded deterministic
  `photoshop_measure_points` / landmark-helper evidence to the exact Scene Geometry Model source frame. Geometry
  Preflight fails closed on missing evidence or source document/incarnation/dimension provenance mismatch (and
  exact operation/preview identity when the scene model carries it). The exact-evidence requirement also follows
  the durable owner into later visual mutation, preventing VALUE/MATERIAL/TEXTURE continuation from silently
  dropping a completion-relevant geometry dependency. Focused geometry + compact-contract verification passes
  **3 files / 55 tests** and TypeScript `--noEmit` is green. E.18i repository/live regression acceptance remains
  open; this entry does not claim live Photoshop acceptance.

- 2026-10-01 — Extended **P1-E.18g integration hardening** through the perspective-regular/mechanical-pattern
  boundary. A perspective-regular Surface Frame now persists the vanishing-family/support-plane references it
  inherits from its owner's Scene Geometry Binding, so downstream repetition review consumes explicit scene
  provenance rather than rediscovering a private local perspective. Coherent-3D perspective-regular visual
  mutations now require a current Geometry Binding and reuse the same E.18 binding/Geometry Preflight checks
  even when the pass is not classified as structured-mass construction. This remains repository-only evidence;
  focused compact-contract + geometry verification is green at **4 files / 58 tests**, TypeScript `--noEmit`,
  painting-policy, acceptance-matrix and touched-file `git diff --check` are green. Exact measurement/landmark
  promotion and live E.18 acceptance are still open.

- 2026-10-01 — Advanced **P1-E.18g integration hardening** with a fail-closed Surface Frame → Scene Geometry
  Binding boundary. Surface Frames may explicitly reference scene vanishing families and a support plane;
  Guard rejects references outside the owner's durable binding and rejects a local convergence anchor that
  contradicts the bound Scene Geometry Model vanishing point before Photoshop mutation. Frames without explicit
  family references inherit/check the binding's families, so local material/repetition flow cannot silently
  establish a second private perspective. Public VisualMicroPlan schema/serialization preserves the new scene
  references. Focused compact-contract plus geometry verification passes **4 files / 58 tests**, and TypeScript
  `--noEmit` is green. E.18g remains open for perspective-regular/mechanical-pattern and exact measurement/
  landmark evidence integration; no live-acceptance claim is made by this repository-only slice.

- 2026-10-01 — Completed the repository slice of **P1-E.18f Structural dependency invalidation**. Scene geometry
  revisions now diff stable structural ids and propagate changes transitively from line members/vanishing
  points through line families into support planes. Geometry bindings retain their exact source revision and
  are selectively classified current/stale from durable revision history: rail changes stale rail-bound owners
  without invalidating unrelated facade owners, revision-only/texture-only updates remain geometry-neutral,
  missing source revisions fail closed, and horizon/projection changes invalidate globally. Compact pass
  context and status/resume expose `geometry_binding_states`; stale owners cannot continue later visual
  refinement until an explicit binding revalidation/rebuild targets the current scene revision. Added focused
  dependency-propagation and SessionStore projection regressions; targeted Guard/geometry tests and TypeScript
  `--noEmit` are green. E.18g integration hardening is the next roadmap slice.

- 2026-10-01 — Completed the repository slice of **P1-E.18e Deterministic geometry helpers**. Added reusable
  pure geometry operations for validated line/ray construction, stable and near-parallel line intersection,
  multi-line/vanishing-family fitting with residual diagnostics, point-to-line distance, x/y/parameter
  interpolation/extrapolation, converging corridor membership, deterministic near/mid/far cross-sections,
  bounded envelopes and polygon/support intersection. Geometry Preflight consumes the shared helpers rather
  than maintaining private math, while semantic line identification and source-frame provenance remain in the
  scene/binding contracts. Targeted geometry tests and TypeScript --noEmit are green; E.18f structural
  dependency invalidation is the next roadmap slice.

- 2026-10-01 — Added **model-context protection for Photoshop visual review**. Guard
  `cycle[_auto]` and job-poll responses are now reference-only for review images
  (SHA-256, materialized path, dimensions and crop metadata), while the new explicit
  `photoshop_guard_review_image` tool verifies durable file identity and delivers the exact
  required bytes only through MCP image content. Visual verdict closure remains fail-closed
  until every required review role has an explicit delivery receipt. In
  `PHOTOSHOP_GUARD_MODE=required`, direct `photoshop_get_preview` also defaults to
  materialized reference delivery unless `include_image=true` is explicitly requested.
  A final model-facing boundary now redacts semantic binary fields/data URLs from textual or
  structured payloads and every Guard result reports `estimated_context_bytes`, with a
  `large_model_facing_response` warning above 64 KiB. Regression coverage includes explicit
  review delivery, delivery debt, byte-budget enforcement, binary redaction, false-positive
  avoidance and direct-preview normalization; the full unit suite passes **80 files / 803 tests**.

- 2026-09-30 — Completed **P1-E.18d Mandatory Geometry Preflight** on the public compact Guard path. Every
  committed coherent-3D `structured-mass` owner now resolves its durable E.18c binding against the exact accepted
  Scene Geometry Model revision before Photoshop dispatch and records a normalized
  `photoshop.guard.geometry_preflight.v1` receipt. The preflight operates in source-document pixels, preserves
  exact document/incarnation/model provenance, requires bounded depth-separated control sections plus far
  termination for perspective-sensitive construction, checks centerline residual against accepted vanishing
  families, checks support contact against numeric two-boundary corridors when available, validates optional
  depth-scale progression against scale anchors, records remaining uncertainty, and fails closed with
  `projection_family_conflict`, `support_contact_conflict`, `geometry_constraint_conflict` or
  `geometry_preflight_insufficient` before visual mutation. Accepted receipts survive compact status/resume and
  are discarded automatically when their scene model/incarnation is no longer current. Focused geometry +
  scene-model + compact-contract + SessionStore + VisualMicroPlan verification passes **5 files / 167 tests**;
  TypeScript `--noEmit` is green; the full canonical gate passes **78 files / 793 tests**, pack verification sees
  **155 dist JS files**, and lint remains at **0 errors / 31 warnings**.

- 2026-09-30 — Completed **P1-E.18c Object Geometry Binding** on the public compact Guard path. Committed
  coherent-3D `structured-mass` semantic owners now require a normalized durable
  `photoshop.guard.geometry_binding.v1` before Photoshop mutation. The binding is tied to the exact
  `scene_geometry_model` id/revision and validates owner identity, support-plane ids, vanishing-family ids,
  structural dependencies and constraint references fail-closed; stale scene revisions report
  `geometry_dependency_stale`, missing bindings report `geometry_binding_required`, and unknown structural
  references are rejected before dispatch. The binding is stored with the semantic owner, projected through
  compact status/resume, inherited automatically by continuation passes and protected against silent in-place
  replacement. Explicit orthographic/diagrammatic, flat/collage and intentional non-Euclidean scene opt-outs do
  not acquire an artificial coherent-3D owner binding. Focused scene-geometry + compact-contract + SessionStore +
  VisualMicroPlan verification passes **4 files / 162 tests**; TypeScript `--noEmit` is green; the full canonical
  gate passes **77 files / 788 tests** with lint at **0 errors / 31 warnings**.

- 2026-09-30 — Closed the first **P1-E.18 mandatory Scene Geometry Model gate** on the public compact path.
  Committed nontrivial `structured-mass` construction now fails closed without an applicable durable
  `scene_geometry_model`; `insufficient_evidence` cannot authorize committed construction, while explicit
  orthographic/diagrammatic, flat/collage and intentional non-Euclidean scene classifications remain valid
  brief-backed opt-outs and `temporary-hypothesis` exploration remains reversible. First-model admission binds
  its source frame to a freshly observed exact UXP document-incarnation witness before Photoshop dispatch;
  repeated passes continue to use the durable incarnation check. Host witness tokens are treated as opaque
  exact values rather than stable-id strings. Focused geometry + SessionStore + compact-contract verification
  passes **3 files / 99 tests**, the integrated 13a.1B regression passes, TypeScript `--noEmit` is green, and the
  full canonical gate passes **77 files / 786 tests** with lint at 0 errors.

- 2026-09-30 — Advanced **P1-E.18 Scene Perspective Model** from a pure schema into durable Guard state.
  `scene_geometry_model` can now travel through the public compact pass contract, is journal-projected only
  for the exact current Photoshop document incarnation, appears in compact status/resume, and uses fail-closed
  model/revision/document/incarnation conflict checks before dispatch. A regression proves latest-revision
  projection and automatic disappearance after document reincarnation. Focused geometry + SessionStore +
  compact-contract verification is green at **3 files / 97 tests** and TypeScript `--noEmit` is green.

- 2026-09-30 — Completed the **public GitHub standalone cutover**. After reviewing fork-network metadata
  consequences and creating a verified mirror backup, the repository was detached from the GitHub fork network,
  renamed to `lavalava45/paintpilot-mcp`, and given standalone product wording. GitHub now reports
  `isFork: false` with no parent; the local `origin` points to `https://github.com/lavalava45/paintpilot-mcp.git`.
  The product identity is now **PaintPilot — AI Digital Painting for Adobe Photoshop** with the descriptor
  **Autonomous AI painting agent for Adobe Photoshop, powered by MCP.** The remaining release work is the
  repository-wide public-identity sweep followed by a green milestone commit/tag and first standalone release.

- 2026-09-30 — Started **P1-E.18 Scene Perspective Model** with a normalized
  `photoshop.guard.scene_geometry_model.v1` foundation. The contract records explicit scene applicability,
  requires a scene-level rationale for non-coherent-3D modes, binds projection data to document/frame
  provenance, and distinguishes derived vanishing evidence from proposed anchors; a derived vanishing point
  must cite at least two declared source-line ids. Focused verification is green at **1 file / 3 tests** and
  TypeScript `--noEmit` is green. Durable Guard journal/status wiring and compiler enforcement remain next.

- 2026-09-30 — Completed **P1-E.4 current-frame lineage enforcement**. Priority reclassification now rejects
  exact visual verdicts from abandoned branches and computes the latest authoritative verdict through the same
  durable frame/branch ancestry predicate used by derived-problem reconciliation. Physical semantic-owner bindings
  deliberately remain a separate concern and survive a non-pixel branch restore while their Photoshop layer still
  exists and has not been rolled back, deleted, merged, migrated or invalidated by authoritative inventory. Added
  regressions for both the stale-perceptual-evidence rejection and surviving physical-owner boundary. Focused compact
  + SessionStore verification is green at **2 files / 93 tests**; TypeScript `--noEmit`, touched-file
  `git diff --check`, and the full canonical gate are green (**76 files / 780 tests**, lint 0 errors).

- 2026-09-30 — Added durable **P1-E.4 frame/branch ancestry** for perceptual evidence. Guard now reconstructs
  current-frame ancestry from the already-durable baseline-preview parent chain, with verified accepted-anchor
  restoration overriding the ordinary parent to point at the restored anchor. Trend and non-trend evidence that
  belongs to a superseded branch loses authority even without a manually written `current_frame_authority=false`,
  while evidence on the restored ancestral branch remains authoritative. Legacy journals with no resolvable lineage
  keep the explicit-authority fallback. Added a branch-restore regression; focused compact + SessionStore verification
  is green at **2 files / 91 tests** and TypeScript `--noEmit` is green.

- 2026-09-30 — Made **P1-E.4 stale-evidence reconciliation durable across status/resume**. When ordinary
  priority preflight prunes or retires non-ancestral trend/non-trend evidence, the reconciled document projection
  is now persisted through the canonical painting-state writer instead of existing only as an in-memory gate
  view; supplied request-local projection snapshots remain side-effect free. Regression coverage proves a stale
  non-trend source is removed from durable state and does not reappear in compact continuation status. Focused
  compact + SessionStore verification is green at **2 files / 90 tests**, TypeScript `--noEmit` and touched-file
  `git diff --check` are green.

- 2026-09-30 — Completed **P1-E.2 ownership-aware target verification and owner→layer-stack reconciliation**.
  Successful `photoshop_get_layers` inventory observations now retire stale semantic-owner physical bindings
  that disappeared through external Photoshop delete/undo without a Guard delete/merge record. Authority
  falls back to the newest observed surviving binding; owners with no surviving physical layer are removed,
  preventing stale historical IDs from retaining mutation authority. Focused compact + SessionStore
  verification is green at **2 files / 88 tests**, TypeScript `--noEmit` and touched-file `git diff --check`
  are green.

- 2026-09-30 — Added the missing **P1-E.2 public historical-layer execution regression**. The compact
  public path now proves that an explicit cross-layer correction can reach real VisualMicroPlan dispatch
  against a historical physical binding of the same semantic owner while preserving the newer authoritative
  binding and the bounded owner stack. This complements the SessionStore migration/rollback projection
  regressions instead of testing only compiler acceptance. Focused compact + SessionStore verification is
  green at **2 files / 87 tests**.

- 2026-09-30 — Wired the **P1-E.2 `cross_layer_correction` contract through the real downstream execution
  contract**. The compact compiler already validated and emitted the contract, but public execution still
  rejected it at the SessionStore request allowlist and VisualMicroPlan schema/parser, and the microplan
  continuation rule still required every mutation to hit only the current layer. The request/schema/parser
  now accept the bounded Guard contract, and VisualMicroPlan permits only its explicitly authorized
  historical targets while Guard remains responsible for stack/current/post-authority validation. Focused
  compact + SessionStore verification is green at **2 files / 86 tests**, TypeScript `--noEmit` and
  `git diff --check` are green.

- 2026-09-30 — Added the homestead-derived **P1-E.2 shared-owner targeting regression**. A tree-only
  correction now has explicit regression coverage proving that a concrete mutation aimed at the separately
  declared shared hills/houses raster owner fails closed before Photoshop dispatch. Focused compact +
  SessionStore verification is green at **2 files / 86 tests**.

- 2026-09-30 — Hardened **P1-E.2 cross-layer ownership reconciliation**. Successful explicit migration can
  move the authoritative semantic binding to its declared historical target while correction mode preserves
  the current binding. SessionStore now excludes rolled-back/non-current-frame operations from semantic
  ownership projection, preventing a reverted migration (or its continuation metadata) from silently
  regaining owner authority after restart. Focused compact + SessionStore verification is green at **2 files /
  85 tests**, TypeScript `--noEmit` is green, and `git diff --check` passes for the touched E.2 files.

- 2026-09-30 — Advanced **P1-E.2 owner→physical-layer targeting**. Durable semantic owners already expose
  bounded `physical_layer_ids`; compact preflight now checks concrete layer targets nested inside every
  medium/global visual mutation against that projected stack before dispatch. A target outside the owner's
  stack fails closed with `semantic_mutation_target_owner_mismatch`; a historical stack member that is not
  the current authoritative binding fails with `semantic_cross_layer_contract_required` rather than being
  silently accepted. This deliberately prepares, but does not yet authorize, explicit migration/shared-owner
  cross-layer correction. Focused compact + SessionStore verification is green at **2 files / 83 tests** and
  TypeScript `--noEmit` is green.

- 2026-09-29 — Completed **P1-E.1 predeclared semantic scene ownership**. Added a Guard-level
  `photoshop.guard.scene_ownership_plan.v1` contract that must exist before the first committed
  nontrivial semantic owner is constructed. The plan predeclares scene concerns and their stable future
  `logical_layer.hypothesis_id` owners before Photoshop dispatch, preserving correction/rollback rights
  rather than enforcing a one-object-one-layer quota. Continuous fields and disposable temporary
  hypotheses remain legal; intentional shared owners require an exact semantic-id set plus a concrete
  sharing rationale. Guard rejects committed owners invented outside the durable plan and rejects
  standalone `photoshop_create_layer` in nontrivial painting because that route would bypass atomic
  semantic owner binding. Temporary owners may be explored without a plan, but Guard-only `keep`
  promotion now requires/predeclares durable scene ownership. The plan is journal-backed and exposed by
  compact status/resume across restart. Focused verification is green at **3 files / 86 tests** plus
  TypeScript build. Full `verify:canonical` is green at **76/76 test files / 769/769 tests**, **152 packed
  dist JS files**, lint **0 errors / 30 existing warnings**, **131 atomic tools / 15 Guard tools / 5 prompts**.
  Source-independence remains green at **206 / 42,656 = 0.4829%** with **0 cross-path clone blocks**.

- 2026-09-29 — Completed **P1-E.16 preparation exact-outcome / false-uncertainty hardening**. Added the
  canonical `photoshop.execution_exact_outcome.v1` contract for failures proven to have been rejected before
  Photoshop semantic dispatch, and propagate that proof through atomic/public tool error envelopes and
  nested VisualMicroPlan preparation. The reproduced first-step `photoshop_create_layer` route rejection can
  now terminate the enclosing plan as durable `execution='not-executed'` instead of creating false
  reconciliation debt. The micro-plan tracks prior state-changing preparation with the canonical Guard
  execution classification: if a layer/brush/selection/configuration side effect already completed, a later
  failure remains partial/`uncertain` even when that failing child itself was rejected pre-dispatch. Pure edge
  method compilation and statically resolvable protected-layer checks now run before preparation; deferred
  post-preparation argument resolution/validation has distinct failure codes and retains uncertainty whenever
  earlier preparation changed Photoshop. Regression coverage freezes the zero-side-effect case, prior-side-
  effect case, pre-preparation edge rejection, deferred post-create failure, public create-layer exact proof,
  SessionStore terminalization and post-dispatch visual-mutation no-replay behavior. Focused verification is
  green at **7 files / 237 tests**. Full `verify:canonical` is green at **75/75 test files / 764/764 tests**,
  **151 packed dist JS files**, lint **0 errors / 30 existing warnings**, **131 atomic tools / 15 Guard tools /
  5 prompts**. Source-independence remains green at **206 / 42,288 = 0.4871%** with **0 cross-path clone
  blocks**. The acceptance for the reproduced failure mode is controlled/integration-level; no fresh live
  Photoshop outage or mutation failure was deliberately induced merely to reproduce the transport fault.

- 2026-09-29 — Closed the remaining cross-path source-independence and local dependency-cleanup gaps.
  `verify:source-independence` now compares normalized contiguous source blocks across **different file
  paths** with an 8-line threshold, backed by a regression test proving that a moved/reindented block is
  detected. The previously identified 19-line Neural Filter residue and 10-line UXP font-search residue
  were independently rewritten; the stronger gate then exposed and closed four additional 8–11-line
  moved blocks. Current result: **0 cross-path clone blocks**, alongside the existing same-path gates.
  Local reference/upstream/Adobe/proof/backup trees were removed, the canonical checkout still has only
  `origin`, and `node_modules` was rebuilt from a cleaned pnpm dependency graph. `pnpm-lock.yaml` is now
  intended to be tracked instead of ignored, eliminating the previous mismatch where development docs
  required `--frozen-lockfile` but a fresh clone had no committed pnpm lockfile. Full canonical
  verification is green at **75/75 test files / 757/757 tests**, **150 packed dist JS files**, lint
  **0 errors / 30 existing warnings**, **131 atomic tools / 15 Guard tools / 5 prompts**.

- 2026-09-29 — Removed the canonical checkout's persistent historical `upstream` Git remote and
  hardened the maintained external-intake policy around a single project `origin`. Development and
  release documentation now require exact external URL/revision inspection or a disposable checkout
  outside the canonical project tree instead of a standing upstream remote. `verify:external-intake`
  now fails if maintained workflow documentation reintroduces `git remote add upstream` or
  `git remote set-url upstream`. Historical Git ancestry and the required MIT attribution in
  `LICENSE`/`NOTICE` remain intact.

- 2026-09-29 — Completed **P1-S residual source-independence hardening** and the standalone-product
  implementation-ownership cutover. Against historical baseline
  `7b635963f87b5b8ff5380c3156841f5253ec8063`, the reproducible production-runtime audit now reports
  **206 aligned exact lines / 42,057 nonblank lines = 0.4898% exact-line overlap**. The canonical gate
  default is tightened from 5% to **0.50%**, with **0 byte-identical production files, 0 contiguous
  exact blocks >=12 lines, 0 production files >=50% exact similarity, 0 retired package entries and
  0 package-script dependencies on an upstream checkout/remote**. Project-owned runtime registries,
  session/log/error/document-target/discovery abstractions, server protocol/lifecycle composition,
  host guidance/prompt catalogs and semantic tool catalogs now own the maintained implementation;
  historical paths remain only as thin compatibility facades where needed. Neural Filter semantics
  were removed from generic bridge plumbing. The working UXP bridge was deliberately **not** rewritten
  merely to chase a cosmetic 0% score. Full `verify:canonical` is green at **74/74 test files / 755/755
  tests**, **150 packed dist JS files**, lint **0 errors / 30 existing warnings**, and **131 atomic tools /
  15 Guard tools / 5 prompts**. `LICENSE` and `NOTICE` remain mandatory historical attribution; the
  0.4898% figure is a source-line-overlap metric, not an authorship percentage.

- 2026-09-29: P1-E.14 method breadth observability now joins durable `method_usage` with the current
  capability snapshot, exposing available semantic method IDs and the subset not yet used in the run.
  This makes "available but never used" measurable without introducing random diversity pressure.

- 2026-09-29: P1-E.14 selected-candidate pressure execution now uses the chosen preset's probe-backed
  pressure policy instead of the role-level preferred preset policy. Simulated pressure candidates are
  consequently fail-closed unless the VisualMicroPlan contains matching executable stroke dynamics;
  focused compact + session-store regressions pass **80/80**.

- 2026-09-29: Extended P1-E.14 anti-stickiness across problem boundaries: compact Guard now remembers bounded recent preset/material outcomes and requires a causal retry explanation before reusing a recently failed preset for the same material when evidence-bound alternatives exist.

- Guard brush selection now resists failure-driven preset stickiness: for a stable visual problem with
  multiple preflighted candidates, retrying the same preset after failure/rollback requires an explicit
  causal `brush_retry_reason`; legitimate successful reuse remains unaffected.

- 2026-09-29: P1-E.14 brush candidate portfolios now expose durable `dynamics_capability` metadata for
  native/simulated pressure, meaningful rotation and spacing/opacity/flow tunability. SessionStore
  validates/persists it and planner guidance uses it for causal taper/buildup/breakup/directional marks.
  Focused brush-profile + session-store tests pass **50/50**.

- 2026-09-29: P1-E.14 brush roles now retain durable `candidate_evidence` for every ranked viable preset:
  probe-derived mark/edge/buildup behavior, scale, rotation, pressure, settings, caveats, profile identity
  and evidence score survive SessionStore persistence and are exposed in Guard status. Focused brush-
  profile + session-store tests pass **50/50** and TypeScript build is green.

- 2026-09-29: P1-E.14 brush preflight now ranks multiple role candidates by probe-observed mark/edge/buildup/dynamics fit instead of making deterministic profile order the preferred-brush decision; added a name-blind broken-texture regression proving a bristly evidence-fit candidate beats a generic smooth candidate.

- 2026-09-29 — Completed P1-E.13 correction scoping. Compact Guard now records a machine-readable
  `correction_scope` before dispatch, binding the stable problem to semantic owner, durable physical
  layer IDs, region/bounds, canonical method class and mutation tools instead of relying on the active
  Photoshop layer. The semantic-owner regression now asserts the exact correction scope. Also admitted
  the already-implemented P1-E.12 root-cause escalation fields through the production preflight field
  allowlist (state-only tests had masked that integration gap). Focused compact + recovery tests pass
  **43/43** and TypeScript build is green.

- 2026-09-29 — Completed **P1-E.12 repeated-problem structural escalation**. After two unsuccessful
  attempts on the same stable problem, a dependent third mutation must classify the root cause, explain
  it, and declare a real causal-level change; one diagnosed structural attempt is allowed, after which
  further dependent mutation stops instead of resetting the loop. Supported root-cause classes include
  owner/layer, representation, scale, method family, silhouette/negative space, value/form, brush
  vocabulary and insufficient evidence. Read-only diagnosis and independent work remain available.

- 2026-09-29 — P1-E.14 multi-candidate brush selection: substantial form/material/detail work no
  longer silently reuses `preferred_preset` when a preflighted role has several viable presets. Guard
  now requires an explicit evidence-fit choice; single-candidate roles remain deterministic. Prompt
  guidance mirrors the contract, and compact-contract regression is green at 36/36 including deliberate
  selection of a non-preferred alternative.

- 2026-09-29 — Added the first P1-E.14 tool/brush breadth observability slice. Guard document status now
  derives `method_usage` from durable completed VisualMicroPlans, including distinct/count summaries for
  mutation tools, semantic method classes/IDs, brush roles/presets, stages, problems and outcomes. This
  makes the regions + familiar-brush default-collapse measurable before changing selection policy.
  Focused session-store regression is green at 43/43; TypeScript build and `git diff --check` pass.

- 2026-09-29 — Guard priority reclassification is now evidence-bound: resolving/rescaling/re-severitying an existing
  open visual problem through `photoshop_guard_set_priorities` requires the latest authoritative visual
  verdict for that document, rejects stale/rolled-back evidence, and persists the evidence operation and
  sequence on the problem. This prevents priority blockers from being dismissed by controller assertion
  while retaining the existing larger-before-finer stage gate.

- 2026-09-29 — Added the read-only P1-E.8 deterministic next-pass lint to
  `photoshop_guard_status(next_pass=...)`. It reuses the compact compiler and durable Guard preflight
  to expose machine-readable blockers before execution; no additional public tool was added.

- 2026-09-29 — Exposed checkpoint debt before visual-plan construction: compact Guard status/resume now
  report `checkpoint_due_before_next_visual_mutation`, its reason, and the complete bounded checkpoint
  debt state while preserving the existing risk-weighted fail-closed checkpoint gate (P1-E.5).

- 2026-09-29: implement the exact-rollback half of **P1-E.4 rollback-aware evidence invalidation**.
  Completed Guard rollbacks now durably mark the rejected source operation as discarded current-frame
  evidence. Cumulative-trend projection ignores rolled-back records, and already-promoted trend problems
  prune that source/evidence/region lineage and retire themselves when surviving support falls below the
  original promotion threshold. Historical operation/verdict evidence remains durable for diagnostics,
  but a rolled-back one-pass global degradation can no longer remain an open must-fix and block the
  restored frame. Focused verification passes: embedded-guard + planner-painter 126/126 and TypeScript
  build. Broader supersede/non-ancestral branch lineage remains tracked in P1-E.4.

- 2026-09-29: complete the repository implementation of **P1-E.3 canonical semantic method-class
  resolution**. Compact Guard now prefers a validated known `method_id` over the low-level transport
  classification when the method's primary tool matches the dispatched mutation. In particular,
  `installed-brush-preset` on `photoshop_paint_strokes` remains `preset-brush` rather than collapsing
  to generic `paint`; known method IDs cannot be used to relabel an incompatible mutation tool, and
  fail closed with `step_method_tool_mismatch`. Brush-strategy compilation accepts both generic paint
  and semantic preset-brush classes. Focused verification passes: compact-contract regressions 35/35,
  visual-microplan + painting-method-palette 71/71, and TypeScript build.

- 2026-09-28: close **P2.4 fresh-origin release autonomy** and therefore the overall **P2
  independent-product cutover**. Published commit
  `2be5260012ce026da4fd6b79437ac4beb1fa6fb4` was cloned into a completely new Windows directory with
  only `origin` and no `upstream`; dependency install and full canonical verification passed
  (**74/74 Vitest files / 740/740 tests**, lint **0 errors / 30 existing warnings**, 124 packed dist
  JS, 130 atomic tools / 14 Guard tools / 5 prompts, source independence 626/40,972 = 1.53%).
  `build:mcpb` produced both 1.7.6 and stable archives; each contains the product manifest, compiled
  server entrypoint, UXP manifest, LICENSE and NOTICE, with 4,193 entries and identical SHA-256
  `E5F1E52BB423DD9BFCDAB15C32644B9365E94C1F5C8BCE725BCA5FC505E99A85`. Fresh-clone MCP stdio
  initialize/prompt/tool/capability smoke passed. The installed COS Photoshop route was separately
  verified UXP-ready with matching bridge revision; no Photoshop mutation is claimed from the fresh
  stdio artifact because that child did not acquire the live bridge revision. GitHub fork-network
  detachment/description cleanup is now tracked as a separate post-P2 metadata task, while historical
  attribution remains in LICENSE/NOTICE/project docs.

- 2026-09-28: complete **P1-C.9 qualitative material-response decomposition**. MATERIAL planning
  and exact-current refinement review now share one subject-agnostic `material_response` contract
  covering base response, form-driven light, specular/reflection, transmission where applicable,
  surface condition, variation scale, edge/contact interaction and subordinate microtexture. The
  existing refinement gate remains authoritative: texture-only or unresolved material response cannot
  unlock DETAIL/MICRO_DETAIL, while exact durable style-contract basis preserves intentional flat/
  stylized treatment without forcing photorealism. Compact Guard requires the decomposition before
  MATERIAL mutation. Canonical verification after closure passes **74/74 test files / 736/736 tests**;
  the catalog remains **130 tools / 14 Guard tools / 5 prompts** and strict source-independence residuals are zero.

- 2026-09-28: implement P1-C.3 Soft-dominance / over-smoothing review as part of the existing Guard
  visual-closure and stage-priority system. Broad global/medium softness-dominant work in non-trivial
  paintings now requires an exact-current structured `softness_review` across edge hierarchy, mass
  separation, large-form readability, focal hierarchy and primitive footprint. The contract is
  construction-role aware: intentional optical haze is not penalized merely for softness, while a
  form-bearing volumetric soft mass cannot pass by dissolving its structure. Failed reviews cannot be
  accepted or marked resolved; they create a stable `soft-dominance` must-fix problem that blocks
  finer work through the existing priority gate. Soft-round footprint debt is wired into the existing
  `primitive_footprint=suspect` / cumulative-trend path instead of creating a separate quality score.
  Focused soft-dominance/review tests pass, and the full canonical gate is green at **73 test files /
  723 tests**, **130 atomic tools / 14 Guard tools / 5 prompts**, with source-independence still green.

- 2026-09-28: implement P1-C.8 Causal Effects Graph. Semantic effect owners can now persist
  reflection_of, shadow_from and emission_from relations to durable source owners and, where
  required, receiving surfaces/media. Guard binds those relations to source/receiver construction
  revisions, rejects missing or temporary causal owners, inherits the relation across continuation,
  prevents silent in-place retargeting and marks dependent effects stale after structural source or
  receiver changes. VisualMicroPlan/compact schemas preserve a qualitative causal statement plus
  evidence instead of treating local reflection/shadow/glow resemblance as proof of causality.

- 2026-09-28: implement P1-C.7 Aperture / Negative-Space Topology. Semantic owners can now persist
  `aperture-of` / `negative-space-of` relations to established parent construction, including a
  parent construction revision, topology statement and structural evidence. Background/color
  sampling alone is rejected as structural proof. Parent repaint/texture continuation fails closed
  until all durable opening dependents are explicitly reviewed via `preserve_negative_space_ids`,
  and parent construction revision drift makes the opening relation stale. Focused regressions cover
  durable architectural opening topology, silent parent repaint rejection, explicit preservation and
  the background-color false-proof case.

- 2026-09-28: implement P1-C.6 Pattern Distribution Semantics on top of the existing mechanical-pattern
  review. Compact passes can declare `organic-clustered`, `directional-broken`, `perspective-regular`
  or `intentional-uniform` distribution independently from motif-copy intent. Guard can now flag
  mechanically uniform organic/directional spacing even when individual motifs differ, and reject
  depth-invariant repeated modules when a perspective Surface Frame declares material scale
  progression. Findings reuse the existing evidence-bound mechanical-pattern crop/review path;
  random jitter is not treated as proof of organic distribution.

- 2026-09-28: implement P1-C.5 Surface Frame / Orientation Field as durable semantic-owner metadata.
  VisualMicroPlan can bind surface-driven work to 1–3 weighted dominant axes, an optional
  convergence anchor, optional near/far scale progression, distribution semantics and explicit
  local exceptions. Perspective-regular frames require a convergence anchor; continuation inherits
  the established frame and Guard rejects silent in-place orientation drift. Focused contracts
  cover water, facade and fabric cases without subject-name policy.

- 2026-09-28: add the P1-C.4 Hierarchical Construction Graph. Semantic logical-layer owners can now
  declare `primary -> secondary -> tertiary -> surface` construction dependencies. Guard binds
  dependent owners to durable parent construction revisions, rejects missing/temporary/out-of-order
  parents, and detects transitive stale prerequisites after structural parent corrections. Explicit
  `construction_change` separates structural invalidation from ordinary tone/texture continuation,
  so unrelated branches are not invalidated. Subject-agnostic fixtures cover tree, architecture and
  water mappings.

- 2026-09-28: complete P2.5 C6 specification-first replacement of the retained text/style semantic
  domain. The six public text/style tools keep their established schemas and result contours while
  their implementation now lives in project-owned `text-operations.ts` / `style-operations.ts`,
  dispatches only through the UXP backend, fails closed on backend/UXP failure, and preserves pinned
  `document_id` on document-bound mutations. A focused contract suite freezes tool order, defaults,
  UXP payloads, style normalization, pinning and no-alternate-execution behavior. Canonical
  verification passes **72 test files / 706 tests**; the current catalog is **130 tools / 14 Guard
  tools / 5 prompts** (the additional tool is the independently developed continuous color-gradient
  primitive already present in this dirty worktree).

- 2026-09-28: add the P1-C.2 construction-role split above raw Photoshop mechanism selection.
  Planning now distinguishes `continuous-field`, `volumetric-soft-mass`, and `optical-veil` before
  choosing a concrete method; `photoshop_select_painting_method` can resolve that role directly and
  still reports normal capability/fallback information. VisualMicroPlan preserves the role in its
  paint strategy and enforces role/intent consistency plus Physical Stack authority, preventing an
  optical veil from replacing opaque/form-bearing structure or a volumetric mass from being encoded
  as a purely atmospheric/optical owner. Subject-agnostic fixtures cover a wall field, smoke body,
  and aerial haze.

- 2026-09-28: harden P1-C.2 construction-role enforcement for broad soft/environmental work.
  Global/medium softness-dominant passes now require an explicit construction role. A
  `continuous-field` stays on `continuous-color-field` by default and alternate execution requires a
  named, justified fallback. An `optical-veil` can no longer silently fall back to the legacy Soft
  Round / `soft-brush-build` dab-chain: the plan must name the preferred non-dab method and record a
  concrete fallback reason.

- 2026-09-28: add the P1-C.1 continuous tonal-field primitive. `photoshop_paint_color_gradient`
  paints one UXP-native linear raster RGB/value field on an exact `layer_id` from explicit
  canvas-pixel endpoints and 2–4 strictly ordered bounded color stops. The method palette now has a
  dedicated `continuous-color-field` / `continuous-field` route and VisualMicroPlan treats it as one
  semantic `gradient` mutation. Invalid stop topology is rejected rather than being reinterpreted as
  the existing transparency-only gradient-mask operation. Live Photoshop acceptance is now complete:
  `p1c1-live-gradient-20260928-04` paints an exact three-stop `(0,0) → (1200,800)` field on a 1200×800
  raster layer, returns `gradient_kind=raster-color-linear`, and produces accepted frame SHA
  `0442052123782a5f9134f5df8323022a50c2809612831cdec9794c28d2553354`; visual review confirms a
  continuous cold-to-warm field with no dab/stamp or mechanical periodicity.

- 2026-09-27: record the first returned Task-23 human labels without retroactively inventing a
  vote-count acceptance rule. The neutral case answers are preserved in
  `task23-review-pack/human-labels.received-20260927.json`; the positive case remains unresolved
  because edge hierarchy was judged NO and secondary forms N-A, while all three negative controls
  were rejected and the stylized-flat control was not forced toward realism. A non-retroactive v2
  aggregation rule now requires every applicable target-required positive criterion to pass and
  restricts N-A to genuinely inapplicable criteria. The same human round exposed a texture-only
  false-positive on “major form more modelled?”, so `photoshop_analyze_value_structure` now also
  emits/materializes a low-frequency grayscale thumbnail. A representational refinement PASS must
  bind to exact-current low-frequency evidence showing that major-form modelling survives suppression
  of small texture/noise; DETAIL/finalization fail closed when that evidence is absent or unresolved.

- 2026-09-27: add the subject-agnostic Physical Stack / Occlusion Gate for fresh non-trivial
  paintings. Semantic logical layers now carry explicit physical/opacity roles and optional
  direct depth anchors; declared front/behind relations are bound to exact Photoshop
  `above_layer_id` / `below_layer_id` placement. VALUE and later stages fail closed until Art
  Director records exact-current-frame evidence that depth order, opaque-mass coverage,
  occlusion, transparency intent and layer-stack alignment are coherent. The pass is bound to a
  stable signature of occlusion-relevant semantic owners, so later structural-owner changes make
  it stale; adding a new opaque/support/transmissive owner after SHAPE requires a structural reset.
  This prevents physically opaque scene masses from surviving into form/material rendering as
  translucent overlays while preserving explicit glass, atmosphere, light and other optical roles.

- 2026-09-27: define the project-owned release and compatibility policy in docs/release-policy.md. Product SemVer/release criteria are independent of upstream releases; Guard protocol, runtime-state and UXP bridge revisions remain explicit compatibility contracts; release notes must name migrations and the supported Photoshop/UXP host baseline; selectively ported external fixes receive normal project testing and attribution.

- 2026-09-27: complete materialization of the Task-23 blinded perceptual image pack. The three
  predeclared negative controls now have canonical Guard -> UXP Photoshop AFTER captures with frozen
  SHA-256 identities and operation provenance: texture-only, residual-block-in geometry and
  destructive overdetail. All five review pairs are therefore materialized; Task 23 remains
  intentionally human-required because human-labels.blank.json is still empty and no producer/tool
  verdict is substituted for independent blinded adjudication.

- 2026-09-27: materialize the first reviewable slice of the Task-23 blinded human perceptual pack.
  task23-review-pack now freezes exact SHA-bound BEFORE/AFTER evidence for the positive modelled-form
  case and the intentionally flat/graphic style-preservation control, plus explicit target/style
  contracts and an intentionally blank independent-human label sheet. The manifest also records the
  three still-missing negative-control AFTER captures instead of manufacturing human acceptance from
  repository, tool-success or pixel evidence.

- 2026-09-26: add a mandatory Art Director prompt-conflict / rendering-strategy preflight. Every
  painting directive now freezes one dominant rendering objective, secondary traits, any prompt
  tensions that change the first 1–3 passes, the chosen rendering strategy, and the initial pass
  sequence before Painter mutation. Structural ambiguity fails closed; when multiple materially
  reasonable interpretations remain, the contract requires explicit user confirmation rather
  than silently averaging them. Guard also enforces an early strategy-validation checkpoint after
  1–2 **meaningful** Painter previews: the exact current frame must show that the dominant objective
  is advancing, otherwise the directive must replan with a genuinely changed rendering strategy
  and re-enter the early validation window. Focused Planner/Painter regressions cover missing
  preflight, structural conflicts, user-choice conflicts, insufficient-vs-meaningful preview
  counting, stale validation evidence, and no-op replans.

- 2026-09-25: expose three core visual-agent research directions in the public README: Adaptive
  Multiscale Visual Verification, Bounded Artistic Autonomy, and Evidence-Bound Recovery. The README
  now presents the project not only as a Photoshop tool extension but as an experimental platform for
  stateful visual-agent control, with links to the multiscale research concept, the P0-C autonomy
  roadmap, and the Guard/recovery architecture.

- 2026-09-25: add the adaptive-multiscale visual-verification concept (now consolidated in
  `docs/visual-evaluation.md`), a publishable technical concept
  for treating visual review as adaptive, provenance-bound evidence acquisition across COMPOSITION /
  OBJECT / MICRO scales. A point-by-point audit against the original multiscale task also separates
  the already-live-accepted baseline from four stronger open P0-V guarantees: runtime
  uncertainty/final-comparison escalation, object-context-preserving MICRO review, delivery-aware
  visual closure, and complete canvas/scale-invariance crop provenance. The roadmap and acceptance
  matrix now make that boundary explicit instead of treating the research model as fully closed.

- 2026-09-24: add deterministic multiscale Guard visual review with COMPOSITION / OBJECT / MICRO
  profiles on the canonical compact-v2 path. Whole-frame context remains mandatory; bounded passes
  prefetch exact source-document crops at the minimum justified scale; existing local/detail
  BEFORE/AFTER significance evidence is preserved. Optional structured `review_findings` can now
  trigger bounded read-only crop escalation for the **same** pending operation without replaying the
  artistic mutation or dispatching the next pass. Requested/effective regions, pinned document id,
  bound whole-frame SHA and crop SHA/path are durable across status/resume; wrong-document, stale-SHA
  and changed-region evidence fail closed. Capability reporting marks `review_findings` as additive
  to `photoshop.guard.compact.v2`. Focused resolver/coordinate/state tests plus the embedded Guard
  integration prove same-operation escalation, max-two crop fan-out, deterministic dedupe/priority,
  zero extra mutation dispatch during escalation and closure only after the enriched evidence is
  observed. Real Photoshop/CoS acceptance on 2026-09-24 also verified COMPOSITION whole-frame-only
  review, bounded OBJECT crop delivery, same-operation MICRO escalation with pinned whole/crop SHA
  provenance, and no second Photoshop history step during read-only evidence enrichment.

- Add Task 23 progressive form refinement / de-block-in as a durable, subject-agnostic stage-exit
  contract in the existing Art Director/Guard state. refinement_check records exact current-frame
  evidence for major-form modelling, secondary forms, edge hierarchy, material/light response,
  selective detail and residual block-in plus a separate representation-change classification.
  DETAIL / MICRO_DETAIL now fail closed on missing/pending/failing refinement evidence;
  texture-only cannot masquerade as form completion, stale preview evidence is rejected, and a
  style-not-applicable escape requires an exact declared style-contract field/value instead of
  silently forcing flat/graphic work toward photorealism.
- Add a reproducible Task-23 human evaluation pack with positive-modelled-form,
  texture-only, residual-block-in, destructive-overdetail and stylized-flat controls. The pack
  predeclares eight perceptual questions and blinds the evaluator to tool logs, mark/layer counts,
  producer verdicts and expected answers; machine mechanics are explicitly kept separate from
  human artistic acceptance.

- Add non-destructive grayscale/value evidence and a real stage-aware value gate. `photoshop_analyze_value_structure` converts the existing preview to grayscale in Node and returns descriptive luminance evidence without scoring the artwork. Art Director `value_check` records large-value grouping, focal hierarchy, silhouette separation, local contrast budget and detail-before-form; DETAIL is blocked on failed/unobserved structure, with explicit justified `override` and `style-not-applicable` escape paths.

- Add executable boundary-level Edge Control. VisualMicroPlan `edges[]` supports `hard`, `firm`, `soft`, `lost`, and `broken` intents for explicit region pairs; mutation steps bind boundaries to real `method_id`s which are preflighted against the live method capability map with explicit fallback behavior. Guard verdicts require qualitative `edge_observations` for every declared boundary, so edge intent affects both execution and verification rather than remaining metadata.

- Add `photoshop_guard_art_director` and a durable two-level Art Director / Painter controller contract. Art Director reviews persist global assessment, priorities, bounded tasks and an adaptive review horizon; Painter VisualMicroPlans bind directive/task/scope/change domains and remain locally verified. Cadence, directive completion and event-driven serious-error/global-drift/likeness/unsafe-execution interrupts return control to Planner, while unapproved global-structure changes fail before Photoshop dispatch.

- Add `photoshop_get_painting_method_capabilities` and `photoshop_select_painting_method`, a read-only executable method palette derived from the live ToolRegistry. The contract routes `visual intent → impact class → method → registered runtime tool → fallback`, marks preset-dependent methods conditional, and records unsupported Clone Stamp, Mixer Brush and arbitrary radial paint/fill as unavailable rather than inventing APIs.

- Add an isolated digital-painting extension in `src/tools/painting-tools.ts`, integrated into the upstream server with only one import and one tool-registration call.
- Add `photoshop_list_brush_presets` with optional case-insensitive filtering and result limiting.
- Add `photoshop_select_brush_preset` for exact-name selection of installed Photoshop brush presets.
- Add `photoshop_get_brush_settings` and `photoshop_set_brush` for size, hardness, opacity, flow, spacing, angle, roundness, tip flips, pressure overrides, airbrush, and smoothing.
- Add `photoshop_set_foreground_color` for painting color control.
- Add `photoshop_sample_color` for pinned composite point sampling and optional local-average sampling via a temporary merged duplicate; returns RGB/8-bit RGB/HEX without modifying the source document or its Color Sampler markers.
- Add `photoshop_paint_strokes` for batched Brush/Pencil/Eraser/Smudge strokes, Bezier handles, closed paths, and Photoshop `simulatePressure`.
- Add per-stroke `color`, `size`, `opacity`, and `flow` overrides to `photoshop_paint_strokes`.
- Add interpolated `dynamics` profiles to `photoshop_paint_strokes` for size/opacity/flow changes along open strokes, with linear/ease-in/ease-out/ease-in-out interpolation and automatic segment-count selection.
- Add `AUTO`/`SINGLE_HISTORY` paint batching modes. `AUTO` proactively chunks expensive mixed batches before they hit the ExtendScript timeout; `SINGLE_HISTORY` keeps the legacy one-history-step behavior when that tradeoff is explicitly preferred.
- Allow one-point strokes as brush dabs/stamps; internally they are converted to a zero-length path stroke.
- Add `scripts/test-painting-tools.mjs` for live Photoshop validation.
- Add offline and live paint batching/dynamics regressions in `scripts/test-painting-batching.mjs` and `scripts/test-painting-batching-live.mjs`.
- Add `docs/digital-painting.md` for painting architecture and API documentation.
- Add `docs/digital-painting-agent-skill.md` and MCP guide prompt `ps.digital_painting_control` for iterative visual control, semantic passes, occlusion-aware drawing, cleanup, and state-based completion.
- Add `photoshop_measure_points`, `photoshop_add_guides`, `photoshop_list_guides`, and `photoshop_clear_guides` for explicit reference/proportion measurement and Photoshop guide control.
- Add `photoshop_transform_landmarks` and `photoshop_compare_landmarks` for reusable semantic-frame landmark transfer and normalized reference-vs-candidate error reporting without automatic landmark detection.
- Add `scripts/test-measurement-tools.mjs` for live measurement/guide smoke testing.
- Add `scripts/test-landmark-ergonomics.mjs` for Photoshop-independent landmark transform/compare regression coverage.
- Add offline and two-document live regressions for document targeting in `scripts/test-document-targeting.mjs` and `scripts/test-document-targeting-live.mjs`.
- Add offline and live color-sampling regressions in `scripts/test-color-sampling.mjs` and `scripts/test-color-sampling-live.mjs`.
- Add `photoshop_sample_colors` for batched visible-composite point sampling from a pinned reference document.
- Add `photoshop_paint_dabs` for grouped/chunked high-volume brush dabs without one MCP call per mark.
- Add `photoshop_execute_visual_microplan`: one MCP round-trip may now contain bounded preparation/read/configuration steps, exactly one approved visual mutation, and its mandatory preview. A per-document preview SHA/verdict gate prevents the next micro-plan from running before the returned frame is visually classified.
- Add VisualMicroPlan validation/regression tests for one-mutation enforcement, preview placement, brush-settings verification after preset selection, backward-only `$steps.*` result references, pinned document propagation, mutation-error preview reconciliation, and cross-plan preview-verdict blocking.
- Add multiscale preview observation: `photoshop_get_preview` may return a document-space `focus_region`, and VisualMicroPlan may capture one read-only before preview immediately before its single mutation plus the mandatory after preview.
- Add structured visual critique fields (`observed_change`, `target_resolved`, `regressions`, `uncertainty`) to the preview barrier contract and durable controller verdicts.
- Add a compact durable controller `painting-state.json` mirror with current/accepted frame, active problem/hypothesis and last structured critique, linked to operation ids.
- Add paint-dab execution telemetry for ordered style runs, unique styles, planned internal batches, affected center bounds and measured per-batch duration.
- Add the painting evaluation suite (now consolidated in `docs/visual-evaluation.md`) with sphere, cube/building, still-life, portrait and holdout-transfer exercises under fixed execution budgets.
- Add the embedded 13-tool `photoshop_guard_*` surface and dedicated `dist/cos-plugin.js` required-mode entry for Chat On Steroids, with durable operation receipts, exact acknowledgements, preview/verdict barriers, checkpoints, recovery, and in-process async jobs.
- Add durable continuation recovery data to Guard status/resume: after a lost completed async poll result, callers can recover the exact pending receipt token plus pending visual preview SHA/path without replaying the mutation.
- Add `silent_stall` continuation monitoring: known-next-step visual workflows are reported after roughly 90 seconds without semantic advancement; pending closure obligations identify the phase and read-only diagnostic churn does not reset the timer.
- Add sticky technical/artistic/mixed commentary modes with independent short/normal/detailed verbosity and one-action overrides.

### Changed

- 2026-09-29: clean the forward roadmap after the overnight implementation run. Closed P1-C and P2,
  completed P1-E.3/P1-E.5/P1-E.12/P1-E.13 implementation plans, and already-completed P1-E.14 slices
  no longer occupy the forward TODO. Remaining P1-E work is reprioritized around scene-level ownership,
  current-frame lineage, live method/brush breadth proof, correction/history ergonomics and final
  benchmark/regression closure. Human-only acceptance tracks are explicitly non-blocking for machine
  engineering, and the former P1-E.15 host-neutral/single-source requirement is consolidated into P1-D.

- 2026-09-28: harden the P2.4 fresh-origin Windows proof against checkout line-ending variance.
  A literal published Windows clone at `a32e184` passed all 740 Vitest tests but exposed that
  `verify:painting-policy` counted raw CRLF characters against the compact kernel/prompt budgets,
  causing false failures (`>13000` / `>18000`) despite the same committed content passing under LF.
  The verifier now normalizes `CRLF`/`CR` to `LF` immediately after reading text before applying
  compactness budgets and policy regexes, with an internal LF/CRLF invariance probe. Re-running the
  updated verifier against that CRLF checkout restores the canonical `kernel=12970` and
  `prompt=17888` counts.

- 2026-09-28: close the live-discovered compact compiler gap for global `continuous-field` passes.
  `photoshop_paint_color_gradient` now participates in automatic mandatory AFTER-preview insertion,
  and compact passes can carry an explicit subject-agnostic `construction_role` through to the
  VisualMicroPlan `paint_strategy` instead of losing the role before execution. A regression proves
  missing construction role rejects before mutation while a valid continuous field executes through
  the normal durable async Guard path. Full canonical verification after the repair is green at
  **74/74 Vitest files / 740/740 tests**, with the unchanged **130 tools / 14 Guard tools / 5 prompts**.

- 2026-09-28: close the final retained P0-2 compact-observation gap. Exact negative
  `previous_observation.regression` sentinels (`none`, `none observed`, `no regression(s) [observed]`)
  now normalize to **no regression evidence** instead of becoming truthy regression text that forces
  `verdict=regression` / `disposition=correct`. The compiler reports
  `negative_regression_sentinel_normalized`; substantive text is deliberately preserved, including
  phrases that begin with “no regression” but then describe a real degradation. The public compact
  schema continues to prefer omission/null when no regression is visible. This closes the last retained
  P0-2 machine follow-up. Final canonical verification is green at **74/74 Vitest files / 738/738
  tests**, **124 packed dist JS files**, 0 lint errors (30 existing warnings), **130 tools / 14 Guard
  tools / 5 prompts**, and source-independence **626 / 40,956 = 1.53%** with all strict residuals zero.

- 2026-09-28: close the retained P0-2 `selection-mask` capability/compiler mismatch. The method palette
  now models selection sources as an explicit `preparationAnyOf` contract rather than pretending that
  rectangle, ellipse, subject selection and feathering are all simultaneously required. Compact
  VisualMicroPlan treats selection tools as preparation and `photoshop_create_layer_mask` as the one
  visual mutation, requires one explicit selection source, preserves optional feathering without
  inferring geometry, and appends the mandatory AFTER preview barrier. The method runs through the
  normal moderate-risk durable async Guard job. Focused selection/method/microplan regressions pass,
  and full canonical verification is green at **74/74 files / 737/737 tests**, **130 tools / 14 Guard
  tools / 5 prompts**, with source-independence **626 / 40,931 = 1.53%** and all strict residuals zero.

- 2026-09-28: close the retained P0-2 document-activation focus gap by classifying
  `photoshop_set_active_document` as explicit **UI-activating navigation**. Successful activation reports
  machine-readable `ui_effect` metadata with `may_foreground_photoshop=true` and
  `eligible_for_no_focus_acceptance=false`; no-focus acceptance explicitly excludes this operation.
  Ordinary document-bound work remains pinned by `document_id` and must not switch tabs implicitly.

- 2026-09-28: close repository gates **P2.5–P2.8**. Source-independence, standalone product identity,
  provenance/license, and selective external-intake verifiers are wired into `verify:canonical`;
  `NOTICE` is the canonical provenance record and `docs/external-intake.md` is the maintained selective
  intake contract. The overall P2 gate remains open only on **P2.4**: publish the Windows MCPB
  packaging repair and repeat the literal fresh origin-only clone proof.

- 2026-09-27: complete **P2.5 Phase D — Windows-only platform cut and legacy transport retirement**.
  Make Windows the sole supported host platform and remove the now-unreachable macOS AppleScript
  detector/executor, Windows COM/VBS executor, cross-platform `ScriptExecutor`, script queue,
  ExtendScript transport helpers, legacy executor/document-target tests, old ExtendScript spike and
  batching harnesses, and unused POSIX release helpers. Rewrite `windows-detector.ts` around Windows
  Registry/standard Adobe install paths/`PHOTOSHOP_PATH`/`tasklist.exe`, and reduce
  `PhotoshopConnection` to discovery/version/status only; it no longer exposes `executeScript()` or
  launch semantics. MCPB packaging and manifest compatibility are now explicitly Windows-only.
  Production Photoshop execution remains exclusively Guard → UXP and fail-closed. Canonical verification
  passes **71 test files / 698 tests** with the unchanged **129 tools / 14 Guard tools / 5 prompts**
  surface. Exact-line overlap against `v1.7.6` falls from 6.51% to **4.68% canonical runtime**, from
  8.96% to **5.00% first-party source**, and from 6.76% to **3.55% code + tests**. This is the first
  phase to pass the predeclared `<5%` canonical-runtime overlap threshold; P2.5 remains open for the
  remaining high-overlap production islands and final provenance gate. The final Windows-only MCPB is
  ~5.71 MB / 114 packed dist JS files. A fresh Chat On Steroids child started after that build
  (`PID 10976`, after the 00:47:11 dist timestamp) reports UXP ready, matching bridge revision,
  Photoshop 2026 capabilities, and embedded Guard `mode=required` with raw mutation bypass blocked.

- 2026-09-27: complete **P2.5 Phase C5 — image placement + Smart Object source-independence rewrite**.
  Replace the inherited inline implementation for the six image-placement/Smart Object tools with
  project-owned `image-placement-operations.ts`, `smart-object-operations.ts` and the narrow
  `asset-operation-shared.ts` helper; rebuild both public tool modules as compact catalog builders.
  Preserve absolute-top-left Place semantics, central pinned-document behavior, Smart Object detail
  projections and pre-dispatch absolute-path/file-existence validation. Preserve `photoshop_open_image`
  as the special stable-command bootstrap path with `_guard_operation_id`, durable UXP receipt and
  `not-executed` retry semantics instead of normalizing it into the ordinary mutation path. Production
  remains UXP-only/fail-closed with no `executeScript` dependency or mutation replay. Add a dedicated
  six-tool black-box contract. Canonical verification passes **76 test files / 727 tests**; runtime
  remains 129 tools / 14 Guard tools / 5 prompts. Exact-line overlap against `v1.7.6` falls to **6.51%
  canonical runtime**, **8.96% first-party source**, and **6.76% code + tests**. Same-path overlap drops
  from 58.0% to 9.7% for image placement and from 56.0% to 8.3% for Smart Objects; no cross-file
  implementation block exceeds five contiguous exact lines. The final ~5.74 MB MCPB passes pack
  verification, and a fresh Chat On Steroids child (`PID 16372`) started after the final build passes
  UXP/revision readiness. Direct Place and Convert-to-Smart-Object calls are correctly rejected by the
  required Guard as `guard_required`, confirming the rewritten C5 catalog is live without reopening raw
  mutation bypass.

- 2026-09-27: complete **P2.5 Phase C4 — filters + adjustments/color source-independence rewrite**.
  Replace the inherited inline implementation for 18 filter/adjustment/color tools with project-owned
  `filter-operations.ts`, `adjustment-operations.ts`, `color-adjustment-operations.ts` and the small
  `adjustment-operation-shared.ts` substrate; rebuild the three public tool modules as compact catalog
  builders. Preserve the exact primitive/action routing, filter validators/defaults, Curves preset
  normalization, color clamping/defaults, central pinned-document semantics and the established split
  between plain-text confirmations and atomic JSON results. Production remains UXP-only/fail-closed
  with no `executeScript` dependency or mutation replay. Add a dedicated 18-tool black-box contract.
  Canonical verification passes **75 test files / 720 tests**; runtime remains 129 tools / 14 Guard tools /
  5 prompts. Exact-line overlap against `v1.7.6` falls to **7.02% canonical runtime**, **9.39%
  first-party source**, and **7.08% code + tests**. Same-path overlap is now 10.4% for filters, 11.3%
  for adjustments and 14.4% for color adjustments, with no cross-file implementation block larger than
  six contiguous exact lines. The final ~5.73 MB MCPB passes pack verification; a Chat On Steroids child
  started after the final build (`PID 30576`) passes UXP/revision readiness and capabilities reads, and a
  direct call to the rewritten Curves tool is correctly rejected by the required Guard as `guard_required`,
  confirming the C4 catalog is live without reopening raw mutation bypass.

- 2026-09-27: complete **P2.5 Phase C3 — selection + masks source-independence rewrite**. Replace the
  inherited 18-tool selection/mask implementation with project-owned `selection-operations.ts`,
  `mask-operations.ts` and `selection-operation-shared.ts`, and rebuild `selection-tools.ts` /
  `mask-tools.ts` as compact catalog builders. Preserve central pinned-document semantics, the accepted
  mix of atomic JSON and legacy-visible plain-text confirmations, selection normalization/error mappings,
  gradient/clipping behavior, and UXP-only/fail-closed routing with no mutation replay. Remove the
  direct `PhotoshopDetector` dependency from Select Subject and use the already rewritten capability
  contract for the PS 23+ gate. Add `tests/selection-mask-domain-contract.test.ts` covering all 18 tool
  names/order plus representative payloads, result contours, validation and no-legacy-dispatch behavior.
  Canonical verification passes **74 test files / 713 tests**; runtime remains 129 tools / 14 Guard tools /
  5 prompts. Exact-line overlap against `v1.7.6` falls to **8.35% canonical runtime**, **10.53%
  first-party source**, and **7.90% code + tests**. Same-path overlap drops from 78.2% to 9.0% for
  `selection-tools.ts` and from 67.5% to 20.8% for `mask-tools.ts`; cross-file review finds no moved
  implementation block larger than six contiguous exact lines. The final ~5.73 MB MCPB passes pack
  verification; a Chat On Steroids child started after the final build (`PID 25088`) passes UXP/revision
  readiness, the rewritten selection-bounds read correctly fails closed with `no_active_document` in
  the current empty session, and embedded Guard remains required with raw mutation bypass blocked.

- 2026-09-27: complete **P2.5 Phase C2 — full layer-domain source-independence rewrite**. Replace the
  inherited inline implementations for base layer tools, layer properties, transforms and stack ordering
  with project-owned `layer-operations.ts`, `layer-property-operations.ts`,
  `layer-transform-operations.ts`, `layer-ordering-operations.ts` and shared bounded helpers. Rebuild
  the four public declaration modules as compact catalog builders while preserving the 25-tool public
  surface, central `document_id` pinning, accepted result contours and UXP-only/fail-closed routing.
  Reimplement the formerly upstream-identical blend-mode helper and add a full layer-domain black-box
  contract. Retire the stale current-only ExtendScript layer API harness from README verification.
  Canonical verification passes 73 test files / 707 tests; runtime remains 129 tools / 14 Guard tools /
  5 prompts. Exact-line overlap against `v1.7.6` falls to **9.93% canonical runtime**, **11.87%
  first-party source**, and **8.89% code + tests**. Same-path layer declaration overlap is now
  6.1–13.3%, and cross-file review finds no transplanted implementation block larger than four lines.
  The final ~5.72 MB MCPB passes pack verification; a Chat On Steroids child started after the final
  build (`PID 16012`) passes UXP/revision readiness, the rewritten layer read path correctly fails
  closed with `no_active_document` in the current empty session, and embedded Guard remains required
  with raw mutation bypass blocked.

- 2026-09-27: complete **P2.5 Phase C1 — document + history/state source-independence rewrite**.
  Preserve the existing 12-tool public MCP schemas/results and central document pinning contract while
  replacing upstream-shaped inline execution with project-owned `document-operations.ts`,
  `history-operations.ts` and `state-operations.ts`. Reimplement the formerly 97.6%-matching
  `platform/capabilities.ts` with frozen version/feature behavior and restructure the shared atomic
  result helper. Production dispatch remains UXP-only with no legacy script execution. New family
  contract/capability tests plus the existing preview bundle test pass; canonical verification is now
  72 test files / 701 tests. Exact-line overlap against `v1.7.6` falls to 11.74% for the canonical
  runtime, 13.38% for first-party source and 10.01% for code + tests. Cross-file inspection finds no
  large transplanted implementation block (largest contiguous exact match: 10 lines document, 3 lines
  history/state). The final 5.71 MB MCPB passes pack verification, and a freshly restarted CoS child
  passes UXP ping/state/list/capabilities plus the expected structured no-document history failure;
  embedded Guard remains required and raw mutation bypass stays blocked.

- 2026-09-27: complete Phase B of the P2.5 source-independence work by replacing the inherited MCP
  bootstrap substrate from current behavioral contracts. `src/index.ts`, `src/core/server.ts`,
  tool/prompt registries, `src/core/session.ts`, `src/utils/logger.ts` and `src/errors/envelope.ts`
  now use a smaller project-owned structure; server tool wiring moved into the current-only
  `src/core/server-tool-catalog.ts`. New bootstrap regression coverage freezes registry replacement,
  Session injection/state, stderr-only logging and structured-error normalization. The static tool-count
  verifier was updated to follow the new catalog declaration without changing the runtime surface:
  129 tools / 14 Guard tools / 5 prompts remain intact. Canonical verification passes 70 test files /
  693 tests. Exact-line overlap against `v1.7.6` is now 12.65% for the canonical runtime, 14.15% for
  first-party source and 10.60% for code + tests; a freshly restarted CoS child passes UXP/Guard
  readiness on the rewritten substrate.

- 2026-09-27: complete Phase A of the P2.5 source-independence cutover. Retire the inherited
  standalone browser product (`web/` + `src/ui/`) and anonymous analytics subsystem
  (`src/analytics/`) together with their SQLite/provider/AI-SDK/Hono dependencies, UI-only tests,
  package entrypoints and MCPB payload. Replace the analytics-owned version lookup with the small
  project-owned `src/core/app-version.ts`, remove telemetry side effects from the canonical MCP
  runtime, and harden pack verification so retired UI/analytics output cannot ship. The resulting
  first-party-source exact-line overlap against the original `v1.7.6` baseline falls from ~29.0% to
  14.87% (canonical runtime 13.40%); canonical verification passes 69 test files / 687 tests, the
  rebuilt MCPB contains no retired UI/analytics/web payload, and a freshly restarted CoS child passes
  UXP/Guard readiness.

- 2026-09-27: collapse `docs/PAINTING-ROADMAP.md` back to a true forward-only TODO. Completed
  P0-C implementation, Task 23a repository implementation, P2.1–P2.3 and P2.5 implementation detail
  now lives in this changelog / the acceptance matrix instead of remaining as active roadmap prose.
  Partially complete items were reduced to their actual residual gates: Task 24 real-Photoshop
  brush/anti-primitive acceptance, Task 23 independent blinded human labels, P0-E.7 supplied-pack
  live/human acceptance and P2.4 fresh-origin proof. The priority order was rewritten around only
  work that can still change project acceptance status.

- 2026-09-27: complete the **repository implementation of Task 24a–24f real-paint brush-path and
  anti-primitive finish hardening**. Guard/VisualMicroPlan now assigns deterministic nested stable UXP
  command ids instead of reusing one root operation id across distinct brush preparation/mutation
  commands; stroke-tool readiness fails closed before visual mutation for unproven mechanism/settings
  combinations; command-identity, tool-readiness and generic bridge failures remain distinguishable;
  ordinary later-stage passes cannot regress to `GLOBAL_BLOCK_IN` merely to regain broad
  `paint_regions`; material passes use the existing evidence-backed brush-role/style contracts; and
  nontrivial finalization consumes exact-frame multiscale refinement evidence plus journal-derived
  primitive-dominance provenance rather than accepting a recognizable block-in as finished. Focused
  regression suites and TypeScript builds passed during implementation.

- 2026-09-27: close **Task 24 live brush-path / anti-primitive acceptance** against real Photoshop.
  `task24-live-brush-smoke-20260927-01` completed preset selection, brush configuration and real BRUSH
  raster mutation in one Guard/VisualMicroPlan pass without the old `uxp_bridge_command_id_conflict`;
  dedicated PENCIL, SMUDGE and ERASER live smokes also completed. A deliberate backward-stage request
  was rejected before dispatch with `painting_stage_regression_requires_reset`, while an incompatible
  material/brush-role request was rejected with `brush_role_material_fitness_mismatch` /
  `paint_strategy_required`. Representative document 7090 then progressed from semantic sky/ground/
  rabbit block-in owners through real FORM_AND_LIGHT and MATERIAL brush passes. The final accepted
  frame is `task24-rep-directive-final-touch-20260927-01`, SHA
  `c4788d353c28cbfeb04a6d685f70ec24240622c04440c0bacbc06284599ae04c`; exact-current grayscale
  evidence is `task24-rep-final-value-exact-20260927-01`, grayscale SHA
  `bb2e2947a674f57cbe6f842a081bcc63e22da1669fff3ffb7119d53ba60e08a8`. Exact-current Art Director
  value/refinement gates and completion passed. Evidence summary:
  `processes/task24-live-brush-acceptance-process/run-02/evidence/task24-live-acceptance.md`.

- 2026-09-27: repair `build:mcpb` for the project's Windows-only release host instead of
  unconditionally requiring the Unix `zip` executable. A fresh origin-only Windows clone exposed the
  release-autonomy failure after canonical verification passed 66/66 files and 601/601 tests; the
  packer now uses PowerShell `Compress-Archive` and fails closed on unsupported host platforms. The
  repaired current worktree successfully builds both `photoshop-mcp-digital-painting-1.7.6.mcpb` and
  the stable `photoshop-mcp-digital-painting.mcpb`.
  Follow-up verification inspected the stable archive and confirmed its manifest, compiled server
  entry point and UXP manifest are present; the local MCP stdio smoke also starts the packaged source
  server surface successfully. The strict P2.4 fresh-origin closure remains pending until this repair
  itself is published to origin and replayed from a new origin-only clone.

- 2026-09-27: tighten the P2.4 repository-autonomy documentation boundary: `docs/development.md` no
  longer presents an upstream Git remote as a development prerequisite and instead identifies it as
  optional selective comparison/intake. The literal fresh origin-only clone acceptance remains
  pending and is not inferred from the current dirty worktree.

- 2026-09-27: complete the repository implementation of **Task 23a semantic layer ownership /
  layer-separation**. Compact painting passes now bind a stable caller-declared `hypothesis_id` to an
  exact logical layer, derive the owner registry from durable Guard journal evidence, reject owner/layer
  mismatches and unrelated-owner reuse before Photoshop dispatch, and preserve temporary ownership
  across restart/status/resume. Moderate/high temporary owners fail closed at committed
  `FORM_AND_LIGHT` and later stages until explicitly resolved; Guard-only `keep` promotes accepted
  temporary ownership without a Photoshop mutation. Status/resume ownership projection now reuses the
  captured journal/state snapshot instead of rescanning durable state mid-projection. Focused compact,
  session-store, embedded-Guard, VisualMicroPlan and Planner/Painter validation passes **232/232** tests
  plus a clean TypeScript server build. Photoshop/UXP connectivity was also verified ready with a
  matching `compact-v2-20260926-brush-profile` bridge revision; the remaining Task-23 gate is blinded
  human perceptual acceptance rather than additional repository ownership plumbing.

- 2026-09-26: complete the **repository implementation of P2.1–P2.3 inherited-substrate cleanup and
  UXP-only cutover**. Added the consolidated `docs/ownership-and-retirement.md`, removed generic product breadth that did not
  serve the painting/compositing product, and collapsed the public surface from **149 tools / 16
  recipes / 21 prompts** to **128 semantic tools / 0 recipes / 5 guide prompts**. Removed the entire
  recipe execution layer, Data Sets/mail-merge subsystem, opaque Actions playback, raw
  `photoshop_execute_script`, dead `src/api/batch-play.ts`, shared `PhotoshopAPIFactory` /
  `ExtendScriptSnippets`, duplicate document-target COM preflight and unreachable legacy branches
  from painting, selection, layer, text, smart-object, transform, filter and other semantic tool
  modules. `PhotoshopBackendRouter` now defaults to one UXP backend and fails closed with
  `uxp_bridge_unavailable`; no production semantic path selects or replays through ExtendScript/COM.
  Legacy platform connection/executors remain bounded to detection/versioning, diagnostics and
  historical fixtures. The dodge/burn method palette now composes semantic layer/fill/blend tools
  rather than a removed recipe. Migration inventory and policy verifiers were rewritten for the
  UXP-only contract. Repository acceptance passes **658/658** Vitest tests plus build, pack, lint
  (warnings only), compact-v2, painting-policy, prompt, catalog-count and live-evidence-ledger gates.
  The only remaining P2.3 acceptance item is a post-cutover real-Photoshop smoke after reloading the
  current server/UXP companion; this live result must not be inferred from repository tests.

- 2026-09-26: complete **P1-A autonomous-product cleanup / legacy retirement**. Reachability audit
  classified the retired external Core/controller/daemon provider chain and historical manual
  consumers as dead or migration-only, then physically deleted 16 obsolete files including
  `photoshop-session.mjs`, the persistent daemon/client, duplicate session-store/cycle helpers,
  historical controller/stage acceptance scripts and the retired Core workflow document. Maintained
  README/INSTALL/AGENTS/prompts/policy/architecture now state that the external provider chain is
  removed rather than compatibility-supported. `tests/legacy-consumer-retirement.test.ts` now asserts
  physical absence; compact-v2 audit status/verifier were updated to deletion-complete semantics.
  P1-A.5 found no additional clearly dead production TypeScript surface: standalone UI remains
  package-reachable and all retained Photoshop tool factories are registered by `src/core/server.ts`;
  broader live inherited-substrate decisions remain P2. Full `npm run verify:canonical` passes
  **660/660** tests, build/pack/lint (warnings only), compact-v2, painting-policy, prompt coverage,
  tool-count and live-evidence-ledger gates.

- 2026-09-26: classify **P0-D Tasks 8/8a/8b** as a completed repository calibration harness with a
  remaining **human-required** gate. The repo contains the neutral held-out manifest, blinded review
  pack, balanced/repeated evaluation plan and scorer, but no completed independent human-reference
  dataset; only the blank pack and reference-shape template exist. Runtime critic/stop authority is
  therefore not promoted from synthetic evidence, and P1-A cleanup is allowed to proceed without
  waiting for perceptual adjudication.

- 2026-09-26: complete **P0-V.4 crop provenance / scale-invariance contract**, closing the P0-V
  multiscale hardening block. Every durable escalation crop now persists source `canvas_width` /
  `canvas_height`, exact requested/effective source-document regions, crop scale metadata and an
  explicit native-or-downsampled/no-new-detail-by-upscaling resolution policy. Initial prefetched
  local review projects the same canvas/source-coordinate contract. Regression coverage proves that
  the same fractional requested region normalizes/clamps to identical semantic coordinates under
  1600px and 800px overview metadata while only preview/crop scale changes; restart/status/resume
  preserve the provenance exactly. Focused region/state/compact/embedded validation passed **108/108**
  tests plus a clean TypeScript build.

- 2026-09-26: complete **P0-V.3 model-facing image delivery as a visual-closure prerequisite**.
  Public Guard cycle/job-poll responses now persist a durable `photoshop.guard.visual_delivery.v1`
  receipt only after MCP image-content blocks are actually assembled and SHA-verified. Artifact
  capture/path/SHA remain separate from delivery proof. An incomplete delivery creates explicit
  `redelivery_required` debt in status/resume, blocks verdict closure and the next mutation, and
  returns the same operation's review package for bounded read-only re-delivery with
  `mutation_replayed=false`. Re-delivery merges roles for the same whole-frame SHA and clears only
  delivery debt; it does not reclassify or replay the artistic mutation. Existing unreadable-artifact
  and response-byte-budget fixtures now prove fail-closed closure behavior. Focused delivery/review
  validation passed **122/122** tests plus a clean TypeScript build.

- 2026-09-26: complete **P0-V.2 context-preserving direct MICRO review**. Compact passes may now
  provide an exact broader `object_context_region_bounds` alongside the tight MICRO `region_bounds`.
  Guard validates containment, never invents context geometry, and after the single artistic mutation
  captures the broader OBJECT evidence read-only through the existing immutable review-evidence path.
  Whole/object/micro evidence stays bound to one document and whole-frame SHA; omitting the broader
  bounds leaves the existing whole+micro contract unchanged. Focused compact/multiscale/embedded
  validation passed **96/96** tests plus a clean TypeScript build.

- 2026-09-26: complete **P0-V.1 runtime uncertainty-driven multiscale escalation and final-comparison whole-frame contract**. Compact visual observations may now carry structured `uncertainty_review` evidence with exact source-document regions: unresolved overview uncertainty escalates the same operation to read-only OBJECT evidence, and unresolved OBJECT uncertainty with an explicit tighter region escalates to MICRO without replaying the artistic mutation. The runtime never infers crop geometry or escalation level from prose. Uncertainty-driven review debt is durable across restart/status/resume and remains additive to existing structured `review_findings[]`. Final Art Director comparison now requires durable whole-frame composition evidence; local crops are supplemental and cannot substitute for a missing whole-frame artifact. Focused multiscale/Planner/session validation passed **192/192** tests plus a clean TypeScript build.

- 2026-09-26: complete **P0-C.10 artistic-throughput / Guard-choreography telemetry**, closing the
  P0-C throughput/autonomy block. Guard now counts canonical model-visible `cycle_auto` calls exactly
  once, distinguishes semantic-dispatch / bookkeeping-only / recovery-only / rejected-before-dispatch
  round-trips, accumulates actually dispatched semantic artistic actions (including internal async
  execution without inventing another host call), and reports actions-per-round-trip beside existing
  latency components plus regression/recovery/evidence-integrity controls. Deterministic same-task
  repository benchmark for six semantic actions: baseline 12 model-visible Guard calls, ratio 0.5 and
  240 ms aggregate semantic-cycle proxy; semantic-pass path 2 calls, ratio 3.0 and 75 ms, with zero
  regression/recovery/evidence failures in both fixtures. A separate regression control proves that an
  improved ratio cannot mask a quality failure. Full `npm run verify:canonical` passes **654/654**
  tests plus build, pack, lint (warnings only), compact-v2, painting-policy, prompt/catalog,
  tool-count and live-evidence-ledger gates.

- 2026-09-26: complete **P0-C.9 task-scoped Painter autonomy window**. Art Director cadence now keeps
  directive-wide `completed_microplans` only as telemetry while each active Painter task owns its own
  successful-pass counter, a bounded experimental horizon of up to three successful passes, and a
  durable `task_autonomy_remaining` count. Moving to the next task resets the task-local window;
  restart/resume preserves task identity and remaining allowance. Regression, uncertainty, protected
  quality loss and existing global/stage interrupt paths still force early review; per-pass visual
  evidence/barriers are unchanged. Focused Planner/session-store validation passed 88/88 tests plus a
  clean TypeScript server build.

- 2026-09-26: complete **P0-C.8 dependency-aware primary artistic blocker scheduling**. Guard now
  separates one deterministic `primary_blocker` from the retained `problem_backlog`, selecting eligible
  work by explicit dependencies, severity, scale and stable order. Resolving a prerequisite promotes
  the next eligible stored problem without critic rediscovery, while a newly introduced severe
  whole-frame must-fix can pre-empt a smaller active task. Compact status exposes one
  `primary_next_action` instead of a flat set of competing corrections. Focused Planner/session-store
  validation passed 87/87 tests; final Planner regression passed 49/49 plus a clean TypeScript build.

- 2026-09-26: complete **P0-C.7 actionable causal strategy recovery**. Recovery attempts now retain
  exhausted structural strategy ids and method classes. Reusing an exhausted causal strategy is
  rejected, while compact dynamic preflight projects machine-readable currently available alternative
  methods/classes from the live method palette without dispatching them. When no distinct method
  remains the contract escalates to Art Director/human review. A successful accepted resolution resets
  strategy debt only for that `problem_id` while unrelated recovery history remains intact. Focused
  recovery/compact-contract validation passed 26/26 tests plus a clean TypeScript server build.

- 2026-09-26: complete **P0-C.5 conservative artistic-classification normalization**. When an invalid
  `visual_intent + impact_class` pair conflicts with an otherwise valid compact pass, the compiler may
  now rewrite classification metadata only when the unchanged goal text and actual execution tool
  admit one conservative semantics-preserving classification. The normalization is recorded in
  `compiler_normalizations`; document/layer target, stage, scale, risk, action class, Photoshop tool and
  artistic goal are never changed. Ambiguous goals and destructive REPLACE/ERASE/ROLLBACK controls
  remain fail-closed before mutation. Focused compact-contract + method-palette validation passed
  23/23 tests plus a clean TypeScript server build.

- 2026-09-26: close **P0-C.3 compact hot-loop bookkeeping regression hardening**. Current compact-v2
  already owns technical report/receipt/verdict closure behind `photoshop_guard_cycle_auto`; public
  standalone report/ack/verdict providers remain absent. `documentNextRequiredAction()` projects one
  stable continuation/finalization action for pending closure and one stable reconciliation action for
  genuine uncertainty, while status/resume agree on the same next step. Table-driven recovery,
  close-only transaction and session-store coverage passed 129/129 tests plus a clean TypeScript
  server build, so no additional state-machine rewrite was justified.

- 2026-09-26: complete **P0-C.2 adaptive per-pass mutation budgeting**. VisualMicroPlan's hard cap is
  now 8 visual mutations, but every pass derives a stricter deterministic budget from risk, scale,
  destructive action class, protected layers and affected artistic contracts. Low-risk medium passes
  admit 6 related mutations and small/local passes up to 8; high-risk and destructive replace/erase/
  rollback passes contract to 1. Over-budget requests fail before dispatch with a split/defer recipe,
  and successful receipts expose requested/allowed/hard-cap budget diagnostics. Focused validation
  passed 117/117 VisualMicroPlan/embedded-Guard tests plus a clean TypeScript server build.

- 2026-09-26: complete **P0-C.1 one Guard semantic cycle = one artistic pass**. VisualMicroPlan now
  projects a pass-level execution receipt across every planned non-preview sub-action with explicit
  `completed | failed-or-uncertain | not-started` state. A middle visual-action failure stops later
  actions, captures the same pass-boundary reconciliation preview, preserves already completed
  action identity and never replays the completed prefix. Successful multi-action passes still expose
  one final review barrier. Focused validation passed 118/118 VisualMicroPlan/embedded-Guard/recovery
  tests plus a clean TypeScript server build.

- 2026-09-26: **P0-E repository implementation gate complete.** P0-E.1–P0-E.6 now cover supplied-pack
  ingestion/attribution, evidence-backed media and stamp profiling, bounded heterogeneous stamp
  placement with exact partial/no-replay receipts, anti-copy propagation, scene-first pack planning,
  and `exclusive` pack-only brush enforcement. The P0-E.7 repository gate is green: the complete
  Vitest acceptance run passes 643/643 tests; painting-policy, prompt/catalog, compact-v2 structural,
  tool-count (`149 = 133 atomic + 16 recipes`) and live-evidence-ledger verifiers pass individually.
  P0-E.7 remains explicitly **live/human pending** because no actual user-supplied `.abr`/pack is
  available in the current workspace/history; that real-art acceptance must not be substituted with
  default brushes or synthetic pack fixtures and does not block subsequent repository implementation.

- 2026-09-26: complete **P0-E.6 scene-first brush/stamp-pack planning and pack-only enforcement**.
  Art runs can now persist `brush_pack_policy=preferred|exclusive`; exclusive mode requires every
  brush mark to explicitly select an evidence-bound preset from the declared pack and every stamp
  placement to carry matching `brush_pack_id + stamp_profile_id`, while non-brush Photoshop
  operations remain unaffected. Art Director directives for pack-bound runs now require a
  `brush_pack_scene_plan` that maps media roles or stamp profiles onto concrete Painter tasks only
  after the existing composition/focal/mass/depth/light assessment is established. Raw hero stamps
  require explicit user authorization for a stamp/collage style contract, and Painter dispatch is
  blocked when pack vocabulary is not causally assigned to the active task. Stamp identity remains
  separate from media-brush roles. Focused validation passed 141/141 tests plus a clean TypeScript
  server build.

- 2026-09-26: complete **P0-E.5 motif anti-copy integration** for stamp-instance painting. Guard's
  mechanical-patterning analysis now treats each stamp instance as evidence-bearing geometry keyed by
  its source stamp profile, so translation, rotation, uniform scale, reflection, color/opacity changes
  and small placement variation do not disguise same-source organic repetition. Execution-derived
  motif bounds from P0-E.4 feed the same durable instance-scale review path; deliberate
  `intentional_regular` ornament remains exempt, while materially different overpaint can break the
  near-copy cluster instead of forcing cosmetic jitter. The Painter/agent policy now explicitly
  forbids treating transform jitter as artistic variation or a raw hero/foreground organic stamp as
  automatically finished without an explicit collage/stamp style contract. Focused validation passed
  91/91 tests plus a clean TypeScript server build.

- 2026-09-26: complete repository implementation for **P0-E.4 bounded per-instance stamp
  placement**. Added Guard-owned `photoshop_paint_stamp_instances`, a bounded UXP-only semantic
  placement primitive with per-instance size, angle, horizontal/vertical flip, opacity and optional
  color. One stable command places a heterogeneous batch on a pinned raster `layer_id`; partial
  execution returns exact completed / failed-or-uncertain / not-started instance identity and is
  never replayed under the same durable command id. Successful placements return source-document
  bounds and motif/profile identity, and Guard now persists those execution-derived motif bounds as
  durable review metadata. The UXP batch restores the prior active layer, foreground color and brush
  settings after execution. Focused validation passed 154/154 tests across stamp placement,
  VisualMicroPlan, session-store and embedded Guard plus a clean TypeScript server build.

- 2026-09-26: complete repository implementation for **P0-E.3 stamp/motif visual vocabulary**.
  The brush-pack profile store now keeps stamp profiles as a separate protocol from media-brush mark
  profiles. `record_stamp` can only be created from an exact durable `probe_operation_id`; it carries
  pack/preset/effective-host identity, probe SHA evidence, canonical footprint bounds/orientation,
  useful scale range, horizontal/vertical mirror policy, rotation policy, intended scene uses,
  repetition class, raw-placement integration requirement and caveats. Classified motifs require an
  evidence-supported category + semantic description; ambiguous probes are stored explicitly as
  `unclassified` and are forbidden from carrying guessed semantic labels. A fixture whose preset name
  explicitly claims to be a bird remains unclassified when the visual evidence is ambiguous, proving
  filename text cannot supply motif semantics. Focused E.2/E.3 verification passes **10/10** tests and
  `npm run build:server` is green; real Photoshop motif classification remains part of the P0-E.7 live
  supplied-pack run.

- 2026-09-26: complete repository implementation for **P0-E.2 evidence-based media-brush profiling**.
  `photoshop_guard_brush_pack_profile` now exposes a bounded `plan → probe_media → record_media →
  build_preflight` workflow. `probe_media` is one stable no-replay UXP command that creates a disposable
  probe document, samples isolated footprints, multiple scales, buildup, short/long/directional and
  pressure-response strokes, materializes the exact JPEG evidence by SHA-256, then closes the probe
  document. Durable probe receipts supply preset identity, effective settings and host revisions to
  `record_media`, so the model classifies observed mark behavior without inventing or retyping those
  fields. Profiles are keyed by pack revision + preset occurrence + effective-settings fingerprint +
  backend/runtime/bridge revision; stale settings/revisions are rejected from current coverage.
  `build_preflight` derives broad-form, atmosphere/soft, broken/texture and detail/edge roles from
  evidence-backed visual intents and reports missing role coverage instead of inferring suitability
  from preset names. A deliberately misleading `Cloud` fixture proves name-independent selection.
  `brush_pack_id` and exact `profile_id` provenance now survive durable `brush_preflight` parsing.
  Companion readiness revision is `compact-v2-20260926-brush-profile`; current catalog is 148 tools /
  132 non-recipe / 16 recipes with 13 public Guard tools. Focused E.1/E.2/session-store verification
  passes **48/48** tests; full `npm run verify:canonical` passes **622/622** plus all canonical gates.
  Real Photoshop probe rendering remains explicitly part of the P0-E.7 supplied-pack live run rather
  than being claimed from repository fixtures.

- 2026-09-26: complete **P0-E.1 brush-pack ingestion**. A supplied folder or explicit `.abr` set is
  recursively enumerated and content-fingerprinted into a durable `brush_pack_id`; per-asset SHA-256,
  relative path and byte size are persisted independently of display names. The canonical
  `photoshop_guard_brush_pack_ingest` path serializes a Guard-owned global preparation operation,
  selects the UXP-only `brush.presets.import` primitive through `PhotoshopBackendRouter`, dispatches
  each ABR under a durable stable UXP command id, and never cross-replays through ExtendScript after
  UXP claim/uncertainty. Before/after installed-preset inventories are compared as exact name
  occurrences, unchanged successful ingestion is reused without redispatch, changed source bytes form
  a new revision, inventory drift fails closed, and a host that cannot load ABR returns deterministic
  `brush_pack_import_unavailable` with the missing `uxp.localFileSystem+photoshop.app.open(ABR)`
  capability rather than pretending import succeeded. The companion revision is now
  `compact-v2-20260926-brush-pack`; catalog accounting is 147 tools / 131 non-recipe / 16 recipes.
  Focused E.1/backend/receipt verification passes **56/56** tests; full `npm run verify:canonical`
  passes **616/616** tests plus build/pack/lint/policy/contract/catalog/live-ledger gates. Real supplied-pack Photoshop acceptance remains part of the
  P0-E.7 live run and is not inferred from repository fixtures.

- 2026-09-25: close the follow-up P0-C.6 causal-evidence binding blocker found during independent
  post-implementation review. Cumulative trend scope no longer borrows arbitrary
  `review_findings.region_bounds` from the same verdict: spatial findings must be explicitly bound to
  the trend through additive `review_findings[].trend_signals` or be a semantically direct finding
  kind, otherwise Guard falls back to the operation's exact region/focus. This prevents unrelated
  distant proportion/readability findings from turning a localized repeated brush-footprint signal
  into a false global must-fix while preserving real global promotion for signal-bound distant
  evidence and explicit whole-frame degradation. Commit `735d5ce`; the requested six-file baseline
  now passes **203/203**, and `npm run verify:canonical` passes **608/608** tests plus all canonical
  build/pack/policy/contract/tool-count/live-ledger checks.

- 2026-09-25: complete the P0-C.4/P0-C.6 correctness foundation for the canonical Painter/Guard
  review loop. Multiscale review escalation now gives every logical requirement a deterministic
  identity and every capture a durable unique sequence/id; runtime crop materialization uses that
  capture identity, accepted evidence is append-only/content-bound, corrupt or missing artifacts are
  distinguished from never-captured requirements, and strict whole-frame/crop SHA plus document
  pinning remain fail-closed. Cumulative trend promotion now derives scope from evidence provenance:
  repeated localized findings remain medium/local, exact materially separate regions or explicit
  whole-frame degradation can promote global, provenance/reason are durable, and a resolution epoch
  prevents pre-resolution source operations from resurrecting the same trend until fresh evidence
  accumulates. Priority-gate semantics therefore no longer let a localized repeated defect block
  unrelated medium work. Commits `c2863f4` and `07cbff4`; the requested six-file baseline passes
  **201/201** tests (up from 196/196 because five focused regressions were added).

- 2026-09-25: close P0-A Task 4 host-recovery wording/state semantics. CoS commit `b1ce9ed`
  publishes one explicit three-state recovery contract to Core and Plugins model-facing initialize
  instructions: **Tool not selected** means discover/use the existing connector; **Caller
  unattributed** is identity/recording state rather than connector loss and must preserve successful
  work; **Connector genuinely unavailable** may be claimed only after a concrete discovery,
  readiness or tool-call failure. Selection/attribution repair may neither replay a successful
  mutation nor silently switch an established workflow to another engine. The Photoshop MCP
  instructions already provide the matching established-workflow order — existing CoS Photoshop
  surface → `photoshop_guard_status` / `photoshop_guard_resume` → durable state → continue — and the
  Task 3 live trace proves that resume preserved the existing Task21a art-run/anchor state without
  replay. CoS validation for the change: **190 passed / 6 skipped** across the full MCP integration
  and connector-instruction tests, plus TypeScript and diff hygiene.

- 2026-09-25: close P0-A Task 3 real-host CoS attribution/rebind acceptance. On validated CoS
  `our-release / slot-b / 5d87e8d`, the live continuation first demonstrated the important three-way
  distinction directly: CoS calls could execute while still recorded as `unattributed`, so that state
  was not treated as connector loss; browser repair then restored exact request ownership without
  replaying Photoshop work. A subsequent built-in non-CoS web read was followed by Core,
  `photoshop_ping` and `photoshop_guard_resume(3766)` in the same chat; all CoS calls were recorded
  with exact `request_id` attribution, and Guard resume recovered the pre-existing Task21a
  document/run/anchor state and exact restored frame SHA with no mutation replay or pending
  report/ack/verdict/uncertain debt. The anonymized live trace is hashed in
  `docs/live-evidence-ledger.json`.

- 2026-09-25: implement Task 21a one-action accepted-anchor recovery on the canonical compact Guard
  path. Art Director anchor promotion may opt into a pinned read-only restore snapshot containing
  normalized layer ordering/visibility/opacity/blend state, active-layer semantics and selection
  bounds. A later recovery uses only `next_pass.restore_anchor_operation_id`; Guard resolves the
  registered primary/alternative anchor inside the current document incarnation, verifies its
  durable preview bytes, rejects later ambiguous undo/redo history, derives the required undo depth
  from recorded operation history (including multi-history mutations), dispatches one pinned
  `photoshop_undo`, captures the post-restore preview/state, and closes recovery only when the exact
  anchor SHA and registered state parity match. Missing/stale anchors and requests mixed with new
  actions fail before Photoshop dispatch; post-undo parity mismatch remains unclosed/fail-closed.
  Repository acceptance passes **601/601 tests across 66 source files**. The first disposable live
  attempt correctly computed and executed `undo(2)` but exposed an evidence bug: restore recaptured
  JPEG proof with a different size/quality profile than the registered anchor, so byte identity could
  not be compared even though a read-only recapture with the anchor profile returned the exact anchor
  SHA. Fix `7502987` now requires and reuses the registered anchor capture spec. Fresh real-Photoshop
  `run-02` then passed end to end on document 3766: anchor SHA
  `addeed28f4fe163ed62d6df6f857e26073f0e873a6b0c5299ac1d6bf01bb1dce`, two later visual/history
  mutations, one model request containing only the anchor identity, Guard-computed `steps=2`, exact
  restored SHA, matching layer/active-layer/selection state, no mutation replay, no model-supplied
  history count and no remaining report/ack/verdict/uncertain debt. Task 21a is therefore live-pass
  and has been archived out of the forward roadmap. Hashed evidence is recorded in
  `docs/live-evidence-ledger.json`.

- 2026-09-25: close the machine-enforceable P0-B Guard state/evidence/review correctness block.
  Nested OBJECT/MICRO dedup now preserves the broad semantic coverage region while independently
  escalating inspection level; read-only observations no longer replace artistic-frame identity;
  whole-image glance debt binds to an exact due reason/operation/frame SHA; persisted crop evidence
  is reusable only while its materialized file still exists and SHA-matches; declarative
  `incomplete_hypothesis_resolution=reversed` now requires an exact durable-anchor restore; and the
  UXP bridge exposes a live document-instance witness so recycled numeric ids reset stale
  document-scoped state and block mutation before dispatch. `resolveArtisticRecovery()` is now the
  production bounded recovery core: color/opacity/preset/primitive-count jitter does not count as a
  new strategy, dependent recovery terminates finitely, and critic false-alarm dismissal requires
  verified durable anchor + fresh current-frame evidence. Repeated organic/character geometry now
  receives transform/scale/color/jitter-invariant mechanical-patterning analysis and routes through
  the existing bounded OBJECT crop-evidence debt; explicit regular architectural rhythm remains
  admissible. The 2026-09-25 canonical gate passes **594/594 tests across 65 source files**, with
  compact-v2 audit, package, lint, painting-policy, prompt/catalog and live-evidence-ledger checks
  also green. Borderline perceptual judgement remains assigned to later human critic calibration.

- 2026-09-24: repair the canonical GitHub Actions path so clean runners execute the same verification
  gate as local development. The workflow now takes the pnpm version only from
  `package.json#packageManager` instead of declaring a second version in
  `pnpm/action-setup`, and it no longer enables pnpm dependency caching when the repository
  intentionally does not track `pnpm-lock.yaml`. Task 8/8a repository tests now stage temporary
  source fixtures instead of depending on gitignored local `processes/**` JPEG/PNG evidence; the
  real calibration/review-pack commands still validate the actual local evidence paths. After these
  fixes the clean GitHub runner reaches and passes `pnpm run verify:canonical`. Session-store
  projection regressions also compare active-job membership independently of random job-directory
  ordering, removing a CI-only ordering flake while preserving the production job-id ordering
  contract. Local canonical verification remains green at **578/578 tests across 62 source files**.
- 2026-09-24: close P0-2 final UXP migration live acceptance on real Photoshop. The accepted
  `run-10` binds repository `78125f2`, live child PID `30684`, and exact UXP revision
  `compact-v2-20260924-targeting`; representative P1 `layer.create`, P2
  `filter.gaussian_blur`, P3 `history.read`, the deliberate pinned-document mismatch and its
  bounded state readback all have pre-dispatch `selected_backend=uxp` evidence with no fallback.
  The 69.24 s monitor recorded zero Photoshop foreground transitions and zero legacy helper
  processes, the mismatch failed closed without changing the active document, and final Guard debt
  is empty. Backend-route telemetry is now durable and bounded, and direct compact artistic-method
  validation remains compiler-local instead of leaking unsupported `artistic_operation` metadata
  into the public Guard request. The canonical suite is green at **578/578 tests across 62 source
  files**; hashed `run-10` evidence is recorded in `docs/live-evidence-ledger.json`.
- 2026-09-24: close P0-1 repository verification integrity. Vitest now discovers only source tests
  under `src/**` and `tests/**` and excludes `dist/**`; production TypeScript output no longer
  compiles co-located tests, and package verification rejects any compiled test artifact. The
  canonical acceptance command is source-wide and checks acceptance-matrix citations for drift;
  compact-v2, package, lint, painting-policy, prompt, catalog-count and committed live-evidence hash
  verifiers are composed under `npm run verify:canonical` and enforced by the GitHub PR/push
  workflow. Required contributor/PR guidance now points to that single gate; repository-wide
  Prettier remains explicitly advisory/non-gating. The final canonical run passed **575/575 tests
  across 62 source files**, 0 lint errors, and all verification scripts. A committed
  `docs/live-evidence-ledger.json` records hashes for the small gitignored runtime/process artifacts
  cited by live-pass claims without committing large PSD/JPEG payloads.
- 2026-09-24: close the P0-0 canonical-execution integrity block. Request-scoped `document_id` is now
  enforced centrally at real legacy and UXP dispatch boundaries; Guard execution uses an explicit
  default-deny classification so registry membership does not grant execution authority; raw
  `photoshop_execute_script` is retired from compact-v2. The upstream `photoshop_recipe_*` workflows
  are intentionally kept outside the canonical painting lane rather than migrated: they may remain
  on the general MCP compatibility surface, but Guard/Painter/Art Director cannot invoke them.
  Painting functionality must be expressed through reusable semantic primitives so the Painter
  chooses the artistic operation instead of delegating to pre-baked recipes.

- 2026-09-24: treat every successful guarded `photoshop_create_document` / `photoshop_open_image`
  bootstrap as a new Photoshop document incarnation even when Photoshop recycles a historical
  numeric `document_id`. Guard now clears stale document-scoped painting state and visual barriers,
  records a bootstrap-sequence boundary, and excludes pre-incarnation visual/checkpoint/trend history
  from the current document. This prevents a fresh document from inheriting an old immutable
  `process_dir`. The live regression reproduced Photoshop reusing `document_id=59` after restart:
  the old `run-01` binding was superseded, the new incarnation was recorded at sequence 241, and the
  same id then bound successfully to `run-05`. The acceptance suite remains green at 174/174; the
  bounded runtime trace observed zero Photoshop foreground transitions and no legacy helper process.
- 2026-09-23: repair the public compact Guard contract so schema, compiler, VisualMicroPlan
  validation and runtime agree. `request_key` now remains the unique idempotency identity of one
  attempt while public `problem_id` persists artistic-problem identity across later attempts;
  explicit `action_class=REPLACE|ERASE` makes protected-layer replacement expressible without
  weakening exact target protection. Brush preflight is derived from actual brush-dependent
  actions rather than a narrow region-only allowlist, normal local passes receive the same required
  BEFORE/AFTER focus evidence without pretending to be `subtle_local`, and bounded late-stage
  `paint_regions` is allowed only as an exact-target clipped REPLACE/ERASE correction. The earlier
  experimental `pass_type`/automatic split-plan layer was removed: executable limits are reported
  from the VisualMicroPlan contract instead of a duplicate caller classification.
- 2026-09-23: keep document bootstrap outside the artistic-method selector. `photoshop_create_document`
  and `photoshop_open_image` now ignore accidental `visual_intent` / `impact_class` /
  `preferred_method_id` metadata carried from a painting request instead of being misclassified as
  methods such as `region-block-in` and rejected before dispatch. Regression coverage reproduces
  the exact `GLOBAL_BLOCK_IN + mass + construct + region-block-in` create-document failure.
- 2026-09-23: harden painting-continuation liveness around read-only Guard checks. Closing a
  read-only compact operation without `next_pass` no longer marks an active painting workflow as
  stopped; pending Art Director review now outranks a stale lifecycle `ready` projection; and
  `continuation_watch` exposes `nonvisual_progress_stall` plus the visual-idle duration without
  allowing read-only churn to reset that clock. Regression coverage reproduces the exact
  visual-pass → cadence-review → read-only-check failure mode and the >90 s no-visual-progress
  watchdog case. Also remove committed literal `\\n` EOF artifacts from seven Guard/value source
  files that prevented TypeScript/Vitest from parsing the current HEAD.
- 2026-09-23: fix the canonical selection-state lane after live regression testing. UXP selection
  mutations now perform their post-mutation selection readback with modal-safe `batchPlay` options
  while already inside `executeAsModal`, preventing a successfully applied `Feather` from being
  misreported as `Photoshop is in a modal state`. `photoshop_expand_selection`,
  `photoshop_contract_selection`, and `photoshop_feather_selection` are now classified by Guard as
  preparation/selection-state mutations rather than rendered-pixel visual mutations, so exact
  selection geometry no longer creates false JPEG significance or visual-verdict debt. The mixed UXP
  DOM/`batchPlay` implementation remains intentional; no broad DOM → Action Manager rewrite was made.
- 2026-09-23: complete the P1/P2/P3 catalog **source migration** to the final backend contract. Normal migrated Photoshop tools now ask `PhotoshopBackendRouter` before dispatch, prefer UXP when ready, and may use the existing ExtendScript/COM implementation only when routing selects it **before any UXP dispatch**. Once a UXP command is dispatched, claimed, uncertain, or returns an error, cross-backend replay is forbidden. `photoshop_save_document` and `photoshop_neural_filter` remain intentionally UXP-only/fail-closed, and raw `photoshop_execute_script` remains retired from the production surface. Guard pinning, preview/verdict barriers, exact-outcome recovery and no-blind-replay invariants are unchanged. Repository/source migration is complete and the current rebuilt child/UXP companion revision has now been loaded and verified; the remaining gate is the final post-migration behavioral live acceptance run.
- Make progressive representation change, rather than tool substitution or mark/texture count, a
  required precondition for representational DETAIL progression. The implementation extends the
  canonical Art Director directive and plannerGate; it does not add a second controller, art-state
  tree, subject-specific anatomy subsystem or universal aesthetic score.
- Align `photoshop_analyze_value_structure` with the canonical Guard whole-frame preview contract
  (`max_dimension_px=1000`, JPEG quality 8) so exact-current-frame value evidence hashes the same
  bytes as the durable Guard frame instead of becoming stale solely because the analyzer recaptured
  the unchanged document at a different preview size/quality. Regression coverage now asserts the
  canonical analyzer capture arguments.

- Complete the compact-v2 painting-control migration: the normal public Guard path is now compact-only, legacy full-operation/standalone closure payloads are rejected rather than adapted, runtime state is versioned, and maintained acceptance no longer depends on the retired controller/daemon path.
- Make the canonical Photoshop production lane **UXP-first with bounded pre-dispatch fallback**. `PhotoshopBackendRouter` chooses the backend before dispatch: migrated catalog tools prefer the current UXP bridge and may use their retained ExtendScript/COM implementation only when UXP is unavailable before dispatch. A UXP command is never replayed through another backend after dispatch, claim, uncertainty or failure. Persistence (`photoshop_save_document`) and neural-filter execution remain intentionally UXP-only/fail-closed.
- Complete the artistic-state split between technical execution, local artistic outcome and global brief outcome. Local repairs no longer imply whole-image improvement, and explicit hash/path-backed artistic anchors survive restart/resume and can be retained, promoted, compared or restored.
- Complete the machine implementation of the object-agnostic World Consistency Critic and isolated critic evaluation harness. The critic uses one prompt-aware relation vocabulary, preserves uncertainty, binds evaluation to exact registered preview evidence and remains advisory until human-held-out calibration grants narrower authority.
- Complete the recovery/state-machine audit for the compact native route, including exact-outcome UXP recovery, bounded uncertain/reconcile paths, transactional closure rollback, stalled/orphan job handling and finite causal artistic retry without blind mutation replay.
- Replace repeated Guard status/finalization projection scans with a request-local projection context. On the preserved large controller-state benchmark, `statusCompact()` fell from 27.245 s to 0.595 s while producing equivalent projected state.
- Complete the representative painting-cycle latency benchmark and use measured semantic-cycle components rather than raw tool-call counts to guide optimization. The dominant observed interval in representative VisualMicroPlan runs is the unattributed host/model/visual-evaluation gap, not Photoshop dispatch alone.
- Complete the unified artistic-operation/method contract, upstream `style_contract` wiring, reusable brush/method evidence, spatial-support transforms and provenance, semantic VisualMicroPlan bundling, per-pass/global-gate separation, bounded artistic recovery and stage-scoped policy loading.
- Complete dependency-bound preparation caching with observable hit/miss/invalidation reasons. Live cold/warm A/B evidence confirms redundant preparation calls are removed, while the small sample does not support a blanket end-to-end latency-speedup claim or more aggressive caching.
- Complete the machine-side composition-freedom policy and final-anchor restore mechanics: fixed/reference work avoids unnecessary branching, free composition requires cheap alternative hypotheses, and a guarded live restore reproduced the exact prior anchor SHA before finalization.
- Complete the technical compositing/mask acceptance fixture with editable layer separation, blend/opacity/mask operations and exact whole-frame/local BEFORE/AFTER evidence. Whether the result is artistically stronger remains a human visual judgment rather than a tool-success claim.
- Keep compact relational artistic memory conditional rather than mandatory: Task 10 is intentionally not implemented until the Task 8/8a human experiment demonstrates measurable decision-quality gain.

- Integrate executable stable-layer protection into the canonical painting policy: accepted isolated features now carry their stable ids forward through `protected_layer_ids`; `protected_regions` is explicitly descriptive-only, and intentional protected-layer replacement requires `REPLACE`/`ERASE` plus the exact `replace_protected_layer_ids` exception.
- Define fail-closed recovery for mandatory PSD checkpoints when the UXP bridge is unavailable: `photoshop_save_document` intentionally has no COM/ExtendScript fallback, no next visual mutation proceeds while persistence is blocked, and recovery retries only the checkpoint save after bridge readiness without replaying prior paint work.
- Remove the machine-specific repository path from the canonical painting skill and synchronize the current compact-only native surface to 145 tools / 11 public Guard tools; older development measurements remain historical snapshots rather than current catalog counts.
- Fix `photoshop_image_stack` ExtendScript path serialization: emit one flat array of `jsStringLiteral` values instead of wrapping `JSON.stringify(jsString(...))`, eliminating both the accidental nested `[[...]]` array and double-escaped Windows backslashes while preserving non-ASCII `\\uXXXX` protection.
- Make embedded Guard async-job reservation atomic across MCP/Node processes. `startJob()` now holds the existing controller `wx` lock across `activeJobs()` + durable job creation, and synchronous `cycle()` performs its competing-job check under the same lock, preventing duplicate `{ state: "starting" }` jobs from a check-then-act race.
- Expand VisualMicroPlan `method_class` from generic paint/fill/rollback to fail-closed executable painting mechanisms: `line`, `region`, `smudge`, `erase`, and `preset-brush` join `paint`, `fill`, and `rollback`. Pencil/Smudge/Eraser modes, region painting, and explicit preset selection must match the declared method class.
- Add rollback-semantic logical layers to VisualMicroPlan: `create-new`, `continue-logical-layer`, `temporary-hypothesis`, `keep`, `adjust`, `discard`, and `merge` are explicit decisions tied to stable artistic `hypothesis_id` metadata. New logical layers are limited to one per micro-plan and all mutations must target that rollback unit; continue/adjust reject redundant layer creation. Exact-id layer discard and exact adjacent merge-down paths prevent unrelated accepted edits from being destroyed.
- VisualMicroPlan now treats one semantic correction, not one primitive Photoshop mutation, as the verification unit: 1–4 contiguous compatible visual operations may run between one optional BEFORE preview and one mandatory AFTER preview when they share intent, region, method class, and bounded risk. `subtle_local` keeps matching >=800 px local evidence, and the hard preview/verdict barrier still spans the whole transaction.
- Route `photoshop_save_document` through the UXP companion only, using `asCopy=true` and explicit before/after invariants for active document, working path, active layers, active tool, and selection. COM/ExtendScript save fallback is intentionally disabled so persistence fails closed instead of stealing foreground focus.
- The live-tested Photoshop 2026 UXP runtime rejects narrowed loopback HTTP entries for the bridge with `Manifest entry not found`; the companion manifest temporarily uses `requiredPermissions.network.domains: "all"` while the Node bridge continues to bind only to `127.0.0.1`. Manifest permission changes require UDT **Unload → Load**.
- Replace the UXP bridge's fixed 400 ms command polling plus 250 ms result polling with a localhost long-poll and exact per-command result waiters. The Photoshop plugin now keeps one `/poll` request open and receives queued commands immediately; failed-server retry backoff remains bounded.
- Document and live-verify the supported development restart boundary: after rebuilding `dist/cos-plugin.js`, restart only **Chat On Steroids app → Plugins → Photoshop MCP Digital Painting Fork → … → Restart**. ChatGPT Plugins Refresh is schema refresh, not a guaranteed child-process restart. UXP `main.js` changes use Adobe UXP Developer Tool **Reload**; manifest changes use **Unload → Load**. Whole-CoS restart and obsolete restart-helper scripts are not part of the normal workflow.
- On Windows, Photoshop execution is now background-safe by default: the COM transport attaches to an already-running Photoshop instance with `GetObject` instead of calling `CreateObject("Photoshop.Application")` for every script request. Because live verification showed that Photoshop can still foreground itself from inside `DoJavaScript`, default-mode calls now run with a short-lived Win32 foreground guard that restores the user's most recent non-Photoshop window when Photoshop raises itself without an explicit user switch gesture. Automatic Photoshop launch / UI activation and the foreground guard opt-out both require `PHOTOSHOP_MCP_ALLOW_UI_ACTIVATION=1`. Regression coverage verifies the default wrapper and guard contracts.
- Brush-setting updates now preserve the full active Photoshop Brush Tool descriptor and modify only requested fields, avoiding accidental loss of complex preset dynamics/settings.
- Painting batches cache the active Brush Tool descriptors and avoid redundant descriptor reads/writes for unchanged per-stroke overrides.
- Painting completion guidance now treats stroke counts as soft planning budgets by default; visual Definition of Done is the normal stopping criterion unless the user explicitly requests a hard cap.
- Strengthen the hard user-visible report barrier: internal commentary/progress/page-tool summaries do not count as delivery; after a completed external call the next external call remains blocked until a materialized user-visible assistant update exists. Hosts that cannot guarantee that delivery must fail closed and continue in a later turn.
- Painting-skill evaluation now has a fresh-composition rule: prior demo coordinates, stroke lists, object proportions and precomputed object-specific occlusion geometry must not be reused unless the user explicitly asks for a variation/refinement.
- Add release-oriented installation documentation for clean GitHub clone/ZIP installs, Chat On Steroids Core/direct-stdio and generic MCP host configuration, verification, updating, and a release checklist.
- Make the live-accepted Chat On Steroids Plugins route (`dist/cos-plugin.js` → embedded Guard) canonical for ordinary Photoshop work. Retain Core + `photoshop-session.mjs` + the persistent daemon only for dev/debug/recovery compatibility and legacy regression/live-test coverage.
- Painting guidance now supports explicit measurement checkpoints for portraits, architecture, perspective, and other proportion-sensitive work; supplied landmark coordinates remain visually chosen rather than automatically detected.
- Photoshop/COS execution is now sticky in the digital-painting control contract: short continuation turns cannot silently reroute an established Photoshop workflow to external image generation.
- Harden optional `document_id` targeting across document-bound tools: ids must be positive integers, unknown ids fail closed, successful pinned calls expose `document_target`, and pinned calls no longer auto-switch the active Photoshop document. If the requested document is open but not already active, execution fails closed instead of changing the user's tab; regression coverage enforces this for ExtendScript and the UXP preflight path.
- Separate fork identity from upstream branding/distribution across README, translated docs, package/server/MCPB metadata, client examples, web/site surfaces, and release tooling. The fork is source-distributed from `lavalava45/photoshop-mcp-digital-painting`; upstream `photoshop-mcp.com`, `@alisaitteke/photoshop-mcp`, and `io.github.alisaitteke/photoshop-mcp` are now explicitly labeled as upstream-only rather than fork distribution channels.
- Disable inherited upstream analytics by default in the fork by removing the embedded upstream Rybbit site id; analytics now require an explicit fork-owned `RYBBIT_SITE_ID` configuration.
- Remove inherited upstream publishing/sponsorship/directory machinery from the fork (`npm`/MCP Registry GitHub Actions, upstream Funding/Glama metadata, upstream release-note publishing scripts). Replace inherited translated upstream READMEs with short fork-safe archive notices pointing to the canonical fork README/INSTALL instead of executable upstream install commands.
- Digital-painting transport guidance now prefers VisualMicroPlan when it can safely collapse setup/read calls around one atomic visual bundle; the hard preview barrier remains mandatory and mutation errors are reconciled by preview rather than blind retry.
- Preserve `photoshop_paint_dabs` caller order: batching now collapses only adjacent compatible dabs instead of globally regrouping equal styles, preventing compositing changes such as red → blue → red becoming red → red → blue.
- Treat brush stages as priority bands rather than a rigid one-way staircase, allow broad directional strokes for surfaces/form when their footprint is appropriate, and remove the former 100+ frame-count target from evaluation guidance.
- Reuse the authoritative post-selection settings returned by `photoshop_select_brush_preset`; an immediate duplicate `photoshop_get_brush_settings` is no longer mandatory when brush state has not changed.
- Scope the controller's three-non-improving-attempt replan gate to the same explicit `problem_id` instead of the last three unrelated visual operations.
- Separate non-trivial scenes by expected independent correction: background/support, cast shadow and major movable/repaintable objects should remain independently editable instead of sharing one convenience raster layer.
- Require an independent scene-relationship audit after global/shape/form work and at stage/final gates, covering support/contact, unintended gaps/floating, cast-shadow relation, occlusion/depth, tangencies/intersections and silhouette/proportion.
- Restrict `trend_signals` to recurring negative defects/symptoms; stable or successful features are no longer valid trend labels.

### Validation

- 2026-09-23 selection-path regression: focused tests passed **42/42** after the fix. After rebuilding
  `dist/cos-plugin.js`, restarting only the Photoshop MCP child, and reloading only the Photoshop UXP
  companion, a disposable Photoshop 2026 document completed `expand_selection(20)` with bounds
  `80,80–320,320`, `contract_selection(10)` with bounds `90,90–310,310`, and
  `feather_selection(8)` without the former post-mutation modal-state failure. All three Guard records
  completed with `visual=false`, no preview/verdict debt, and final Guard status had no pending
  reports/acks, uncertain operations, visual verdicts, or active jobs. A 12 s / 5 ms Win32 monitor
  beginning with Word in foreground observed zero Photoshop foreground transitions and zero legacy
  helper processes during the covered initial portion of the smoke; this narrow trace does **not**
  replace the still-pending full P0-0 post-migration no-focus behavioral acceptance.
- Live-tested on Photoshop 2026 for Windows.
- Enumerated 123 installed brush presets through Photoshop `presetManager` during the 2026-09-14 test.
- Verified exact selection of `Hard Round Pressure Size`.
- Verified write/readback of pressure-size, pressure-opacity, airbrush, and smoothing settings.
- Verified batched straight, pressure-simulated, and Bezier strokes.
- Verified textured `Square Charcoal` painting and pressure tapering.
- Verified per-stroke color/size/opacity/flow overrides and one-point dabs.
- Validated the painting primitives with iterative artistic tests in Photoshop.
- Mixer Brush path stroking is not yet considered supported: a direct Action Manager `stroke` attempt using `wetBrushTool` returned an invalid-parameters Photoshop error.
- Verified a 24-stroke heterogeneous pass through `AUTO` batching (6 internal batches) and a 32-segment Bezier taper through dynamics (8 internal batches) on Photoshop 2026 without per-script timeout.
- Verified RGB per-stroke overrides remain intact while descriptor caching is active.
- Verified document targeting with two simultaneously open temporary documents: while document B was active, pinned layer creation and guide mutation affected only document A, and pinned close closed A while leaving B open (`DOCUMENT_TARGETING_LIVE_TEST_OK`).
- Verified `photoshop_sample_color` on Photoshop 2026 with two temporary documents: pinned point samples returned the intended document's composite color, radius-based Average sampling returned the same known uniform color, source documents were unchanged, and out-of-bounds coordinates failed closed (`COLOR_SAMPLING_LIVE_TEST_OK`).
- Verified the current source catalog at 145 tools (129 atomic/non-recipe + 16 recipes); the maintained public Guard surface is compact-only.
- Current regression baseline after the 2026-09-23 selection-path fix: `npm run test:unit`
  **585/585 PASS**, `npm run test:acceptance` **160/160 PASS**, `npx tsc --noEmit` PASS,
  `npm run verify:painting-policy` PASS (kernel=12999, prompt=17995),
  `npm run verify:photoshop-prompts` PASS, and `npm run build:server` PASS.
- Task-23 targeted mechanics include exact-current-frame/stale-evidence checks, texture-only and
  residual-form-debt rejection, explicit stylized control, fail-closed DETAIL admission,
  restart/resume persistence and a generic-implementation check forbidding subject-specific
  horse/face/hand/car/house conditions.
- Task-23 disposable live acceptance now passes end to end through
  `Chat_On_Steroids_Plugins → dist/cos-plugin.js → embedded Guard → UXP Photoshop` on document 1526.
  The exact flat BLOCK-IN frame (`task23-live-blockin-20260922-b`, SHA `043661a7…`) had Value PASS
  but Refinement FAIL; an attempted DETAIL operation was rejected before Photoshop dispatch with
  `refinement_debt_unresolved`, `next_operation_dispatched=false`, and
  `visual_mutation_started=false`. After real FORM_AND_LIGHT modelling, the exact current form frame
  (`task23-live-form-finalize-20260923-b`, SHA `ee0ff107…`) received exact-frame Value PASS plus
  `refinement_check=pass` / `representation_change=meaningful`. The subsequent DETAIL pass
  (`task23-live-detail-admitted-20260923-f`, SHA `ed2c41e0…`) executed successfully with a matching
  before/after focus envelope and a meaningful `subtle_local` delta while preserving the resolved
  silhouette and major value/light structure. Both Planner tasks completed and Art Director status
  is `completed`; final layered evidence is saved as
  `processes/task23-progressive-refinement-process/run-01/task23-progressive-refinement-final.psd`.
- The same live run exposed and fixed an exact-evidence bug: value analysis had been recapturing the
  unchanged document with a different JPEG size/quality, so its `source_preview_sha256` could not
  equal the durable current-frame SHA. After the canonical-preview fix and CoS child restart, the
  analyzer source SHA matched the Guard frame exactly. A Smart Blur attempt also confirmed the
  retained catalog capability is unavailable on the UXP-only production lane; recovery preserved the
  unchanged frame and the acceptance run continued with executable brush methods instead.
- `npm run build:server` and `npm run lint` pass for the current painting branch.
- Historical native Chat On Steroids/Photoshop acceptance passed for the then-current 148-tool / 13-Guard-tool catalog, `guard_required` raw-mutation gating, direct reads, guarded mutation + materialized preview + verdict closure, async jobs, restart/resume/reconcile and no-blind-replay behavior. It remains supporting evidence, not the final acceptance of the 2026-09-23 P1/P2/P3 backend migration.
- Verified the UXP long-poll transport live on Photoshop 2026 for Windows. A 30-call read-only `batchPlay` diagnostic measured 9 ms median / 11 ms p95 full bridge round-trip with the Photoshop action itself at 0–1 ms; the comparable current COM/ExtendScript read-only micro-call measured ~540 ms median. This is a transport microbenchmark, not a claim that real painting is 60× faster. A 5 ms foreground monitor observed zero Photoshop foreground transitions during the UXP run.
- Verified local development can reload the rebuilt CoS server by restarting only the installed Photoshop MCP custom plugin, producing a new `dist/cos-plugin.js` child PID without restarting the Chat On Steroids application.
- 2026-09-23 post-migration cutover preflight: the rebuilt Photoshop MCP child is PID `10772` (started `2026-09-23T07:15:39.5184010Z`) and is running `dist/cos-plugin.js` SHA-256 `9023114D837A4307EBBE81D280226E1A6AD8F02DFAB35E4EC12208C0F8118801` from repository HEAD `67c0c00a94e071520532692fdbe95b3b535ddb80`. Live `photoshop_ping` reports `connected=true`, `ready=true`, `transport=uxp`, long-poll bridge revision `compact-v2-20260923-full`, exact revision match, and Guard reports no pending reports/acks, uncertain operations, visual verdicts, or active jobs. This closes the loaded-build/revision preflight only; representative post-P1/P2/P3 behavioral acceptance is still pending.
- Live-accepted UXP `photoshop_save_document` on a disposable Photoshop document: PSD copy was written through `transport=uxp` with `as_copy=true`, all persistence invariants true, and a PID-based 10 ms foreground watcher observed zero Photoshop foreground hits during the save.
- Session-controller regression coverage now includes 34 checks, including silent-stall detection and read-only-churn resistance.
- Historical compact-v2 live acceptance on 2026-09-22 bound the then-current `dist/cos-plugin.js` child to the expected `compact-v2-20260922` UXP bridge revision, executed a real visual mutation, observed zero Photoshop foreground transitions and no COM/ExtendScript helper process, and left Guard with no pending reports, acknowledgements, uncertain operations, visual verdicts or active jobs. The 2026-09-23 rebuilt child/current companion revision cutover preflight now also passes; the remaining final live gate is behavioral coverage of the post-P1/P2/P3 architecture.
- Live acceptance also covers authoritative brush-setter `applied`/`not-applied` readback, in-place `simple_graphic -> nontrivial_painting` transition, canonical comparable previews, deliberately unavailable comparison geometry, exact-placement raster evidence, a real editable compositing fixture, and hash-exact guarded artistic-anchor restore.

### Pending

- Record the blinded Task-23 five-case perceptual labels. The machine implementation and disposable
  real-Photoshop stage-gate run are complete; perceptual truth is still intentionally not inferred
  from producer self-review. Status: **machine-complete / live-pass / human-gate-pending**.
- Investigate richer pressure representation beyond Photoshop's binary `simulatePressure` flag.

## Archived Painting Roadmap History — migrated 2026-09-25

This section consolidates the complete content formerly stored in `docs/PAINTING-ROADMAP-HISTORY.md`. The standalone history file was removed so completed roadmap work has one canonical archive: this changelog.

Last updated: 2026-09-25

This section archives roadmap blocks that are no longer forward-looking work. Detailed implementation
evidence is recorded in the dated changelog entries above, `docs/roadmap-final-acceptance-matrix.md`, Git history and the
referenced live/test artifacts. Do not move an item here until its remaining acceptance gates are
closed or explicitly transferred to an active follow-up in `docs/PAINTING-ROADMAP.md`.

### Archived 2026-09-25

#### P0-0 — Canonical execution integrity invariants

The 2026-09-24 global architecture/logic audit found three production-reachability gaps. The code
block is now closed and the rules below are retained as non-regression architecture constraints.
Painter/Art Director should gain expressive power by composing semantic primitives, not by acquiring
pre-baked upstream workflow macros.

#### P0-0.1 — Systemic fail-closed document targeting

`document_id` is currently admitted and carried in Guard context, but not every document-bound
mutation proves the same target at the actual Photoshop dispatch boundary. Some UXP handlers omit
the id, while legacy/ExtendScript execution can run without a systemic document guard.

Implement one end-to-end target invariant across:

```text
Guard admission
→ semantic tool
→ backend selection
→ document-target enforcement
→ UXP or bounded pre-dispatch legacy execution
```

Do not rely on each individual tool author remembering to inject a guard. UXP document-bound
commands must receive the pinned id automatically or through an equivalently exhaustive central
mechanism; legacy execution must fail closed against the same target before mutation.

**Acceptance**

- switching the active Photoshop tab/document between Guard admission and dispatch cannot mutate the
  wrong document;
- every document-bound UXP mutation carries/verifies the pinned target;
- every allowed legacy mutation is protected by the same fail-closed target invariant;
- create/open/bootstrap operations that legitimately have no prior document target remain explicitly
  classified rather than accidentally guarded;
- regression tests prove zero mutation on target mismatch for representative UXP and legacy paths.

#### P0-0.2 — Guard executable policy and raw-script retirement

The public required-mode surface blocks direct raw mutation, but the compact compiler can currently
accept a registered `photoshop_execute_script` action and the Guard runtime can invoke the registry
internally. Registration must not imply canonical-execution permission.

Introduce one authoritative execution classification/allowlist for Guard-compiled actions, with
explicit categories such as allowed semantic mutation, read-only, preparation-only, retired and
forbidden. `photoshop_execute_script` must be unreachable from production compact-v2 execution.

**Acceptance**

- compact compilation rejects `photoshop_execute_script` before Photoshop dispatch;
- newly registered internal/debug tools are not automatically executable through Guard;
- executable policy, migration inventory and public/tool documentation all agree that raw-script
  execution is retired and unreachable from the canonical production lane;
- tests prove the denial at compiler/runtime boundaries without relying only on outer MCP mode.

#### P0-0.3 — Recipes are excluded from the canonical painting lane

The 16 upstream `photoshop_recipe_*` tools are general Photoshop convenience workflows, not Painter
capabilities. Their pre-baked behavior conflicts with the project goal that Painter/Art Director
choose and compose expressive semantic operations themselves.

They may remain registered on the general MCP compatibility surface for upstream compatibility, even
if their upstream implementation uses legacy/monolithic scripting. **Registration does not make them
eligible for compact-v2/Guard execution.** No recipe migration is required for the painting project.
If a useful capability exists only inside a recipe, extract or implement the smallest reusable
semantic primitive instead of admitting that recipe into Painter.

**Permanent invariant / acceptance**

- every `photoshop_recipe_*` name is `forbidden` by the authoritative Guard execution policy;
- compact compilation/runtime rejects a recipe before any Photoshop dispatch, regardless of whether
  the recipe remains registered in the general ToolRegistry;
- no recipe is part of Painter/Art Director capability selection, method selection or fallback;
- the migration inventory explicitly labels recipes as general-MCP compatibility surface and outside
  canonical painting acceptance;
- adding a new upstream recipe does not make it executable through Guard without an explicit
  architecture change; the default-deny regression must catch this automatically;
- artistic functionality needed by Painter is provided as semantic primitives, leaving the artistic
  decision and composition of those primitives to Painter rather than to fixed recipes.

---

#### P0-2 — Final UXP migration live acceptance

**Status: closed 2026-09-24.**

The final accepted real-Photoshop trace is
`processes/compact-v2-live-acceptance-process/run-10` against repository
`78125f2e9b314ad236cc9058921760bc485ac75f`, live Photoshop MCP child PID `30684`, and exact
actual/expected UXP revision `compact-v2-20260924-targeting`.

The accepted monitored window proves:

- representative P1 `layer.create`, P2 `filter.gaussian_blur`, and P3 `history.read` all selected
  `uxp` at the pre-dispatch backend boundary with `fallback_used=false`;
- the helper `painting.regions` pass, required preview reads, deliberate mismatch `history.read`,
  and bounded recovery `state.read` also remained on UXP with no cross-backend replay;
- the 69.24 s foreground/process window started with Chat On Steroids foregrounded and recorded
  **zero Photoshop foreground transitions** and **zero legacy COM/ExtendScript helper processes**;
- the deliberate pinned read for inactive document `3743` while acceptance document `3746`
  remained active failed closed with `document_not_active`; the bounded `photoshop_get_state`
  recovery confirmed document `3746` was still active with the expected two-layer blurred target,
  and the failed operation was reconciled without replay;
- the normal trace used zero deterministic schema retries, zero repository source/schema reads, zero
  general Guard-status / Art Director / value-analysis detours, and no document activation inside the
  accepted window;
- the post-trace Guard projection had no pending reports, operation acknowledgements, uncertain
  operations, visual-verdict debt, or active jobs.

Dispatch-level evidence is in `run-10/evidence/backend-route-window.ndjson`; the independent
foreground/process trace is `run-10/evidence/runtime-window.json`; operation copies, preflight,
post-trace state, call ledger, and the consolidated acceptance ledger are stored beside them. Their
hashes are committed in `docs/live-evidence-ledger.json`.

`run-07`, `run-08`, and `run-09` are retained as diagnostic evidence and are **not** credited
as the final pass. They respectively exposed invalid trace hygiene, a direct compact artistic-method
compiler leak fixed in `78125f2`, and a Photoshop foreground transition during explicit
`photoshop_set_active_document`.

**Acceptance**

The final disposable run must prove all of the following on the current post-migration build:

1. representative **P1/P2/P3** operations execute successfully with UXP selected, with direct
   dispatch-level evidence (bridge action/receipt/backend instrumentation) for every step claimed as
   UXP-path evidence;
2. Photoshop does **not** steal foreground/focus during the accepted UXP-path trace;
3. no unexpected COM/ExtendScript helper process appears during steps claimed as UXP-path evidence;
   process/focus observations are ancillary and do not substitute for dispatch-level route evidence;
4. after any UXP dispatch/claim/uncertainty/failure there is **zero cross-backend replay** through
   ExtendScript/COM;
5. one deliberate pinned-document mismatch / active-document-switch probe fails closed with zero
   mutation to the wrong document, proving the repaired P0-0.1 invariant on real Photoshop;
6. Guard finishes the run without pending reports/acks, uncertain operations, unresolved visual
   verdict debt or active-job debt;
7. durable evidence is recorded and the remaining **13a.6.1** and **13c.7** rows in
   `docs/roadmap-final-acceptance-matrix.md` are changed from `live-pending` to `live-pass` only
   if the run actually proves those conditions.

The detailed execution/evidence procedure used at the time lived in
`docs/compact-v2-live-acceptance-plan.md`; that superseded plan is now retained only in Git history.
The pre-dispatch legacy fallback policy described by that acceptance phase was later superseded by
the P2.3 UXP-only / fail-closed production cutover.

> The three follow-ups discovered during this acceptance were **not** archived; they remain active in
> `docs/PAINTING-ROADMAP.md` under “Active follow-ups inherited from closed P0-2 acceptance”.

---

#### P0-B — Guard state/evidence/review correctness

The machine-enforceable correctness block below is closed and retained as a non-regression contract.
Repository acceptance is recorded in `docs/roadmap-final-acceptance-matrix.md`; implementation details
and the 2026-09-25 canonical verification are recorded in `CHANGELOG.md`. Borderline perceptual
judgement about whether a repeated pattern is artistically objectionable remains part of later human
critic calibration rather than a code-completion gate for this block.

The global audit found several runtime-semantic gaps that do not invalidate the existence of the
multiscale/recovery machinery, but do weaken the correctness guarantees built on top of it. Close
these before Task 21a or critic authority is expanded. A 2026-09-24 live painting run also exposed
an independent review failure: repeated object geometry, parameter-jitter variants and uniform
thin-line detailing could satisfy narrow operation-local goals while the visible result became
obviously mechanical at object scale. That failure is tracked below as P0-B.8 rather than being
treated as a generic aesthetic preference.

#### P0-B.1 — Preserve broad review coverage during nested deduplication

Current overlap-based deduplication can merge a broad must-fix OBJECT region with a smaller nested
MICRO finding and retain the tighter region while carrying forward the stricter severity. That can
allow a tiny crop to satisfy what was originally a broad coverage requirement.

Separate **coverage region** from **inspection level**. A higher review level may tighten/augment the
inspection evidence, but must not silently erase the larger semantic area that still requires proof.

**Acceptance**

- an extreme nested containment fixture preserves the broad must-fix coverage requirement;
- OBJECT + nested MICRO findings may share evidence where valid, but closure cannot occur from a
  micro crop that does not cover the unresolved broad region;
- bounded crop fan-out and deterministic priority ordering remain intact.

#### P0-B.2 — Make bounded artistic recovery the production decision core

`resolveArtisticRecovery()` is currently unit-tested but not authoritative in the production
SessionStore path. Wire one explicit recovery policy into runtime state transitions rather than
maintaining parallel heuristic behavior.

At the same time, split structural strategy identity from incidental execution parameters. Changes
to color, opacity or dab/stroke count must not by themselves masquerade as a new recovery strategy.
Do not make the policy authoritative until its evidence inputs are also fail-closed: an anchor id
must resolve to a real durable anchor for the same document/incarnation, counterevidence must bind to
fresh current-frame observation evidence, and structural strategy identity must be Guard-derived or
validated from admitted mutation structure rather than trusted as a free model label.

**Acceptance**

- repeated same-cause/same-strategy failure reaches deterministic finite termination;
- a real structural strategy change is distinguished from a parameter variant;
- independent continuation remains possible where policy allows it;
- restart/resume preserves the same recovery decision state;
- false-alarm recovery cannot be accepted from a bare anchor id + free-text counterevidence;
- strategy identity used for retry/reset decisions is Guard-derived or validated against the admitted
  operation structure;
- the acceptance matrix no longer cites an unwired helper as proof of runtime enforcement.

#### P0-B.3 — Separate artistic frame identity from read-only observations

Read-only preview/capture operations must not replace the identity of the current artistic frame.
Persist an explicit distinction between the last visual mutation frame and the latest observation
evidence, or enforce an equivalent invariant in the existing schema.

**Acceptance**

- `photoshop_get_preview` and review-only crop capture cannot advance the artistic frame identity;
- anchor promotion/final comparison continue to reference the latest classified visual mutation;
- restart/resume preserves both artistic-frame and observation evidence correctly.

#### P0-B.4 — `reversed` must prove an actual restored image state

`incomplete_hypothesis_resolution='reversed'` must not clear a hypothesis merely because the label was
submitted. The current frame must be proven to match the rollback target through exact registered
state/evidence, or through an equivalently strict verified restore contract.

**Acceptance**

- declaring `reversed` without a qualifying restore does not clear the hypothesis;
- a successful reverse binds to the intended prior frame/anchor identity and exact current evidence;
- tests cover both false declarative reversal and real verified reversal.

#### P0-B.5 — Verify persisted crop evidence before reuse

A stored path/SHA string is not durable proof that the same crop bytes still exist after restart.
Before persisted review evidence satisfies a pending requirement, verify the materialized artifact
still exists and matches the recorded identity, or recapture it read-only.

**Acceptance**

- deleted, replaced or hash-mismatched crop files cannot satisfy pending review closure;
- valid unchanged evidence can still be reused without replaying the artistic mutation;
- restart tests cover valid reuse, deletion and replacement/corruption cases.

#### P0-B.6 — Detect external document reincarnation, not only Guard bootstrap reuse

The existing incarnation reset handles successful guarded create/open bootstrap. The remaining gap is
external/manual close-reopen behavior where Photoshop may reuse the same numeric document id without
passing through Guard bootstrap.

Add a bounded document-incarnation proof at state/operation admission so stale document-scoped state
cannot survive a materially different document that happens to reuse an id.

**Acceptance**

- externally recycled numeric document ids cannot inherit stale art-run/barrier/recovery state;
- unchanged live documents do not spuriously reset;
- the proof is restart-safe and does not depend only on Guard-owned create/open operations.

#### P0-B.7 — Bind whole-image-glance evidence to the exact due boundary/frame

Task 11 scheduling can mark a whole-image glance due at stage/global/final boundaries, but the stored
glance record is still too declarative: a supplied observation can clear `due` without proving that it
was made for the exact pending trigger and exact current visual frame that caused the glance request.

Bind each due glance to the reason/boundary identity and exact current artistic frame/evidence. A
stale or mismatched glance must not clear the pending requirement.

**Acceptance**

- submitted `trigger` must match the actual pending glance reason;
- the glance record binds to the exact current artistic frame/whole-frame evidence and rejects stale
  frame identity;
- restart/resume preserves the same pending reason/frame requirement;
- a mismatched/stale glance cannot clear `due`;
- Task 11 scheduling/state mechanics are not treated as fully machine-complete until this invariant
  is covered, while perceptual usefulness remains a separate human calibration claim.

#### P0-B.8 — Mechanical-patterning / copy-geometry guard with mandatory instance-scale review

The live pink-city failure showed that the current loop can accept a pass because it visibly added
characters, birds, architectural marks or “detail” while missing that several visible objects were
constructed from the same geometric template. Whole-frame review can hide this because the repeated
instances are small; later passes then amplify the defect by adding more lines to the same weak
construction.

The canonical painting lane must distinguish **semantic reuse** from **visible geometry reuse**:
Painter may reuse the concept “flying bird”, “ninja”, “balcony” or “roof”, but independent visible
instances must not silently reuse the same normalized stroke/region geometry unless deliberate
uniform repetition is part of the user/design intent. Translation, uniform scale, small rotation,
color swaps or small coordinate jitter do **not** count as structural variation.

Implement a bounded mechanical-patterning check around admitted compact visual actions:

1. derive normalized signatures for repeated stroke/region constructions by removing incidental
   placement/scale and comparing topology, proportions, relative angles and primitive ordering;
2. prefer Guard-derived grouping from admitted action structure; add only the smallest optional
   instance/motif identity metadata if reliable grouping cannot otherwise be recovered;
3. detect exact copies and near-copies that differ only by transform, color or parameter jitter;
4. when repeated **character / creature / organic / irregular decorative** instances are introduced,
   choose representative source-document crops automatically (at minimum the closest/largest
   instance and the most-similar pair) even if whole-frame review did not already produce a local
   finding;
5. review those crops for silhouette/pose/construction variation, accidental tangencies or
   intersections, line-weight hierarchy and whether the objects read as actual forms rather than
   wireframe glyphs;
6. treat intentional regular systems such as window grids, rail posts, tiles, machine-made modules
   or an explicitly requested clone/uniform formation as allowed rhythm, not as an automatic defect;
7. never “fix” repetition by injecting random noise. Variation must come from a structural reason
   such as pose, viewpoint, wing phase, occlusion, perspective, role, depth or differing construction;
8. do not accept “more detail” merely because primitive/stroke count increased. A detail pass must
   add readable form, plane/material information, spatial relation or deliberately useful texture.

This is a review gate, not a universal numeric beauty score. Deterministic geometry similarity may
raise review debt; the artistic conclusion still comes from the exact visual evidence at the
appropriate scale. Existing COMPOSITION / OBJECT / MICRO crop machinery should be reused rather than
creating a second review subsystem.

**Acceptance**

- four identical distant-bird glyphs at different positions trigger mechanical-patterning review;
- the same glyphs with only scale/rotation/color/jitter changes still trigger;
- structurally different birds with meaningfully different wing phase/silhouette do not fail merely
  because they share the same semantic class;
- a legitimate regular window/railing/tile rhythm remains admissible under an explicit/derived
  regular-pattern classification;
- a fixture of repeated block-character skeletons analogous to the pink-city ninjas forces
  instance-scale crop evidence before the pass can be artistically accepted;
- a crop exposing a railing/architecture line passing through a key character cannot be closed as
  “character readability resolved” from whole-frame evidence alone;
- local crop selection uses exact source-document coordinates and does not replay the artistic
  mutation;
- parameter jitter/randomization alone is never recorded as structural variation;
- tool success, pixel delta, primitive count or a satisfied operation-local “objects were added”
  target cannot by themselves close the artistic review;
- repository tests cover exact-copy, transform-only-copy, jitter-only-copy, structural-variation and
  intentional-rhythm controls; held-out human calibration of borderline perceptual cases is tracked
  under the later critic-calibration block rather than reopening this machine-correctness task.

**Internal ordering inside P0-B:** close frame/evidence/incarnation/restore-proof invariants
(P0-B.3/.4/.5/.6/.7) before making P0-B.2 recovery policy authoritative. P0-B.1 and P0-B.8 may
proceed in parallel because they are independent review-correctness defects; P0-B.8 must be closed
before using repeated small-object/character passes as evidence for human artistic acceptance.

---

#### P0-C / Task 21a — One-action accepted-anchor recovery — closed 2026-09-25

**Closure evidence:** repository acceptance passes in `tests/accepted-anchor-restore.test.ts`. The
current-build disposable Photoshop acceptance is preserved under
`processes/task21a-live-restore-process/run-02/`: document 3766 registered anchor
`task21a-live2-anchor-01` at SHA
`addeed28f4fe163ed62d6df6f857e26073f0e873a6b0c5299ac1d6bf01bb1dce`, then executed two later
region mutations that produced two Photoshop history states. One compact request referencing only
the anchor identity dispatched `photoshop_undo` with Guard-computed `steps=2`; the model supplied no
undo count and no successful artistic mutation was replayed. The post-restore preview returned the
exact anchor SHA, and normalized layer/active-layer/selection parity all matched. Global Guard debt
was empty after closure. Run-01 is retained as a diagnostic precursor: it found that restore proof
must inherit the anchor capture profile; fix `7502987` made that invariant explicit before accepted
run-02. Hashed evidence is recorded in `docs/live-evidence-ledger.json`.

#### Task 21a — One-action restore of an accepted anchor/checkpoint after regression

**Priority:** after P0-B state/evidence correctness and before human critic authority is expanded.

**2026-09-25 final status:** repository implementation and disposable real-Photoshop acceptance are
complete. `next_pass.restore_anchor_operation_id` is a single canonical
Guard recovery request. Guard derives bounded undo depth from the durable current-incarnation
journal, rejects stale/missing/ambiguous anchor history before dispatch, and closes a successful
restore only after exact registered preview SHA plus normalized layer-order/visibility/opacity,
active-layer and selection parity. The model never supplies an undo count and successful artistic
mutations are not replayed. Repository acceptance is covered by `accepted-anchor-restore.test.ts`;
the accepted live run is preserved under `processes/task21a-live-restore-process/run-02/`.

Low-level anchor/checkpoint persistence and exact restoration mechanisms already exist, but a real
painting run exposed a remaining operational gap: after a regression, the ordinary Painter/Guard
workflow may still require manual journal inspection and Photoshop-history-step arithmetic to return
to a known-good state.

The canonical recovery path should allow the model to reference a previously registered accepted
anchor/checkpoint and request one bounded Guard-owned recovery action. Internal implementation may
perform multiple Photoshop operations if required, but the host/model contract must remain one
logical recovery request.

The recovery path must not require:

- manual counting of Photoshop history steps;
- manual inspection of operation journals to derive undo counts;
- replay of successful visual mutations;
- direct/out-of-band file opening that bypasses Guard;
- silent switching to another Photoshop document to satisfy a pinned target.

**Acceptance**

Run a disposable live acceptance with all of the following predeclared before the regression is
introduced:

1. register one accepted anchor/checkpoint with stable identity and exact whole-frame preview SHA;
2. record the relevant layered document state needed for parity checking;
3. perform at least two later visual mutations, including at least one multi-history-step/auto-chunked
   mutation;
4. a predeclared human-labelled fixture marks the later state as a regression relative to the
   registered anchor; a critic may substitute only if that critic already has calibrated authority
   for this decision class;
5. from that degraded state, issue exactly one **logical Guard recovery request** referencing the
   accepted anchor/checkpoint identity rather than a computed undo count.

The task passes only if:

- the recovery request is admitted through the canonical Guard path and is fail-closed on missing,
  mismatched or stale anchor identity;
- the visible composite after recovery has the exact registered anchor preview SHA;
- the layered state matches the registered anchor for all contractually preserved properties,
  including layer ordering/visibility/opacity, active-layer semantics and selection state where
  applicable;
- document targeting remains fail-closed and no hidden tab/document switch is used to make the
  restore succeed;
- no successful unrelated mutation is replayed;
- no model-visible manual history-step arithmetic or journal-derived undo count is required;
- Guard closes the recovery with no remaining preview/report/ack/verdict/reconciliation debt;
- repeating the same recovery acceptance from the same degraded fixture produces the same restored
  visual/state result.

If exact anchor SHA cannot be restored by the proposed implementation, Task 21a remains open; do not
weaken acceptance to a vague “looks similar” claim merely to close the task.

---

## [1.7.6] - 2026-09-09

[v1.7.5...HEAD](https://github.com/alisaitteke/photoshop-mcp/compare/v1.7.5...HEAD)

### Changed

- Update anonymous usage analytics for the MCP server, standalone UI, and marketing site ([#36](https://github.com/alisaitteke/photoshop-mcp/pull/36)).

## [1.7.5] - 2026-09-07

[v1.7.4...v1.7.5](https://github.com/alisaitteke/photoshop-mcp/compare/v1.7.4...v1.7.5)

### Fixes

- Map `photoshop_set_layer_blend_mode` `COLOR` to ExtendScript `BlendMode.COLORBLEND`; Darker/Lighter Color fall back to Action Manager ([#29](https://github.com/alisaitteke/photoshop-mcp/issues/29)).
- Fix `photoshop_apply_layer_style` drop shadow (and other styles) `putObject` class-id argument; Use Global Light is off so `angle` applies.
- Treat `photoshop_place_image` `x`/`y` as absolute canvas top-left, not an offset from centered Place.
- `photoshop_recipe_remove_background` falls back to Color Range on uniform/high-key studio backgrounds (`details.method`).
- Optional `document_id` on mutating tools pins edits to a document from `get_state` / `list_documents`; `document.id` is included in context.
- Drop shadow no longer sets a locale-specific "Linear" contour name; Color Range fallback writes both Lab min and max; `place_image` fails instead of silently skipping translate.
- Wrap generative `prompt` values in ExtendScript string literals (`jsStringLiteral`); non-ASCII is `\uXXXX`-escaped so multi-word prompts no longer break JSX syntax ([#31](https://github.com/alisaitteke/photoshop-mcp/issues/31)).
- Apply the detected Photoshop app name on macOS before the first ExtendScript run ([#32](https://github.com/alisaitteke/photoshop-mcp/pull/32)).

### Docs

- Simplify the README landing page, restore badges, and regenerate the hero image.
- Improve site SEO and AI-search readiness; point the marketing site at photoshop-mcp.com; serve trailing-slash doc URLs on GitHub Pages; link the footer to alisait.com and LinkedIn.

### Other

- Validate release tags and recover notes when a tag points at the wrong commit.

## [1.7.4] - 2026-08-29

[v1.7.3...f8ada83](https://github.com/alisaitteke/photoshop-mcp/compare/v1.7.3...f8ada83)

### Other

- Expand atomic tool surface to 118 tools and sync agent documentation. (`5a9d3cd`)

## [1.7.3] - 2026-08-25

[v1.7.2...v1.7.3](https://github.com/alisaitteke/photoshop-mcp/compare/v1.7.2...v1.7.3)

### Features

- feat(analytics): revert to PostHog-only and remove Mixpanel (`6041ea9`)

### Fixes

- fix(ci): install deps before MCP registry sync workflow (`d1af8e1`)

### Other

- ci: add MCP registry-only workflow and resilient npm publish (`6cfc560`)

### Version bumps

- 1.7.3 (`53c25b5`)

## [1.7.2] - 2026-08-25

[v1.7.1...v1.7.2](https://github.com/alisaitteke/photoshop-mcp/compare/v1.7.1...v1.7.2)

### Fixes

- fix(ci): defer PhotoshopConnection executor init to avoid Linux throw (`0f49d30`)

### Version bumps

- 1.7.2 (`38aa0ba`)

## [1.7.1] - 2026-08-25

[v1.7.0...v1.7.1](https://github.com/alisaitteke/photoshop-mcp/compare/v1.7.0...v1.7.1)

### Fixes

- fix(ci): align @eslint/js with eslint 9 for npm install (`f4bd3d4`)

### Version bumps

- 1.7.1 (`b9d3132`)

## [1.7.0] - 2026-08-25

[v1.6.1...v1.7.0](https://github.com/alisaitteke/photoshop-mcp/compare/v1.6.1...v1.7.0)

### Features

- feat(site): add llms.txt, AI discoverability, and full SEO meta layer (`cfccd5a`)
- feat(workflows): add GitHub Actions workflow for deploying marketing site to GitHub Pages feat(workflows): enhance release workflow to include npm publishing and MCP Registry publishing chore(gitignore): update .gitignore to exclude generated site content and build artifacts docs(CONTRIBUTING): update contributing guidelines to reflect new release and publishing processes (`1e56306`)

### Fixes

- fix(uxp): register bridge panel with manifestVersion 4 and correct entrypoint (`df70d46`)
- fix(site): use Photoshop MCP icon instead of recipe illustration as logo (`7a0710a`)
- fix(ci): commit site lockfile so Pages deploy can run npm ci (`bf5982f`)

### Other

- Add agent discoverability docs and fix MCP registry description sync. (`a1f976b`)

### Version bumps

- 1.7.0 (`ede9928`)

## [1.6.1] - 2026-08-11

[v1.6.0...v1.6.1](https://github.com/alisaitteke/photoshop-mcp/compare/v1.6.0...v1.6.1)

### Other

- Add csv-to-cards recipe infographic and README showcase section (`a928b50`)
- Add 13 tools and csv-to-cards recipe, expanding coverage to 102 tools. (`f79392b`)

### Version bumps

- 1.6.1 (`863c1ae`)

## [1.6.0] - 2026-08-07

[v1.5.0...v1.6.0](https://github.com/alisaitteke/photoshop-mcp/compare/v1.5.0...v1.6.0)

### Fixes

- fix(ui/server): require a per-session token on /api/* (`439d5c3`)
- fix(platform): AppleScript timeout block, queue cancellation, jsString control chars (`93574e1`)
- fix(macos): no focus-steal by default, per-app pgrep, timeout kills child, 2026/Beta paths (`d8adf79`)

### Other

- Improve docs and CLI auth UX for open issues #17–#19. (`5cc17b1`)
- test: add vitest unit-test harness (npm run test:unit) (`ffd21e4`)

### Version bumps

- 1.6.0 (`91d52ae`)

## [1.5.0] - 2026-07-27

[v1.4.0...v1.5.0](https://github.com/alisaitteke/photoshop-mcp/compare/v1.4.0...v1.5.0)

### Features

- feat(tools): add split_carousel, batch_watermark, passport_photo recipes and neural colorize (`f266aee`)

### Fixes

- fix(layers): make photoshop_duplicate_layer activate the duplicate (`50b1a88`)

### Documentation

- docs(readme): make recipe examples visible with infographics for all 15 recipes (`afbe5be`)
- docs(i18n): add locale README translations (ES, ZH, DE, JA, TR) (`bdde203`)

### Version bumps

- 1.5.0 (`5935101`)

## [1.4.0] - 2026-07-03

[v1.3.13...v1.4.0](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.13...v1.4.0)

### Other

- release: v1.4.0 — Photoshop native AI (Generative + Neural Filters) (`d76e822`)

### Version bumps

- 1.3.13 (`b94812f`)

## [1.3.13] - 2026-07-03

[v1.3.12...v1.3.13](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.12...v1.3.13)

### Documentation

- docs: add README hero banner with alisait.com branding (`c535f7d`)
- docs: add portfolio positioning, architecture deep-dive, and social preview assets (`1011044`)

### Chores

- chore(images): update og-social.png to enhance visual quality and branding (`74d48e5`)

## [1.3.12] - 2026-07-02

[v1.3.11...v1.3.12](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.11...v1.3.12)

### Features

- feat(analytics): improve Mixpanel tracking with cohorts, milestones, and flush parity (`b7daf3a`)

### Version bumps

- 1.3.12 (`d016e61`)

## [1.3.11] - 2026-07-02

[v1.3.10...v1.3.11](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.10...v1.3.11)

### Features

- feat(ui): add custom OpenAI/Anthropic-compatible API provider (`a1d3a1a`)
- feat(analytics): default to Mixpanel with PostHog rollback path (`4e9444d`)

### Fixes

- fix(release): generate CHANGELOG from package.json before tag exists (`c7f1a58`)

### Documentation

- docs: add CHANGELOG section for 1.3.10 and fix release tag order (`e6a58c1`)

### Version bumps

- 1.3.11 (`7908066`)

## [1.3.10] - 2026-06-24

[v1.3.9...v1.3.10](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.9...v1.3.10)

### Features

- feat(release): add CHANGELOG, categorized notes, and npm refresh workflow (`844485c`)
- feat(release): enrich GitHub release notes with npm install links (`087bca1`)

### Version bumps

- 1.3.10 (`65dce09`)

## [1.3.9] - 2026-06-24

[v1.3.8...v1.3.9](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.8...v1.3.9)

### Features

- feat(release): add GitHub Actions workflow for automated releases on version tags docs(CONTRIBUTING): update contributing guide with release process details docs(README): add GitHub release badge to README for better visibility chore(scripts): add backfill script to create GitHub Releases for existing tags without releases (`be01916`)

### Other

- Add GitHub Sponsors username to FUNDING.yml (`5f619dd`)
- Add GitHub Sponsors username to FUNDING.yml (`d4c2c66`)

### Version bumps

- 1.3.9 (`b8a3f47`)
- 1.3.5 (`7949efc`)
- 1.3.4 (`cfce75b`)

## [1.3.8] - 2026-06-18

[v1.3.7...v1.3.8](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.7...v1.3.8)

### Features

- feat(analytics): add app version retrieval from package.json for server-side events fix(docs): update anonymous usage analytics documentation to clarify app version tracking (`f767166`)

### Version bumps

- 1.3.8 (`b3c3871`)

## [1.3.7] - 2026-06-18

[v1.3.6...v1.3.7](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.6...v1.3.7)

### Features

- feat(analytics): enhance anonymous usage analytics to track MCP client connection and disconnection events feat(analytics): add support for recording active provider and model in analytics feat(analytics): implement usage surface tracking for anonymous profiles feat(analytics): create smoke tests for MCP client analytics functionality fix(analytics): update event properties to include new metrics for MCP client refactor(analytics): reorganize code for better clarity and maintainability chore(docs): update documentation to reflect changes in analytics tracking and events (`8b71106`)

### Version bumps

- 1.3.7 (`f9245c8`)

## [1.3.6] - 2026-06-18

[v1.3.5...v1.3.6](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.5...v1.3.6)

### Version bumps

- 1.3.6 (`9d84bf0`)

## [1.3.5] - 2026-06-18

[v1.3.4...v1.3.5](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.4...v1.3.5)

### Features

- feat(analytics): enhance tool batch flushing logic to improve performance and responsiveness during usage sessions fix(analytics): add flush method to analytics providers to ensure queued events are sent before shutdown docs(analytics): update documentation to reflect changes in tool batch flushing criteria and behavior (`0ce8d42`)

### Chores

- chore(images): update frame_generic_light.png to improve visual quality and consistency (`a5e8eb2`)

### Version bumps

- 1.3.5 (`4a11910`)

## [1.3.4] - 2026-06-17

[v1.3.3...v1.3.4](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.3...v1.3.4)

### Features

- feat(analytics): enhance anonymous usage analytics to collect more detailed runtime environment data including system locale, CPU count, and memory tier feat(analytics): implement MCP session tracking with tool usage summaries and error reporting fix(analytics): ensure proper identification of analytics person with additional properties for better segmentation fix(server): update tool handler registration to include tool name for accurate tracking fix(server): capture connection events and tool call metrics to improve error handling and analytics reporting docs(anonymous-usage-analytics): update documentation to reflect new data collection practices and clarify what is collected and not collected (`ec1dda2`)

### Version bumps

- 1.3.4 (`26e4849`)

## [1.3.3] - 2026-06-17

[v1.3.2...v1.3.3](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.2...v1.3.3)

### Version bumps

- 1.3.3 (`09ed18d`)

## [1.3.2] - 2026-06-17

[v1.3.1...v1.3.2](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.1...v1.3.2)

### Version bumps

- 1.3.2 (`e09cae6`)
- 1.3.1 (`17891a4`)

## [1.3.1] - 2026-06-17

[v1.3.0...v1.3.1](https://github.com/alisaitteke/photoshop-mcp/compare/v1.3.0...v1.3.1)

### Features

- feat(analytics): implement anonymous usage analytics with locale support to enhance user insights docs(README): simplify anonymous usage analytics section and link to detailed documentation docs(anonymous-usage-analytics): create dedicated documentation for anonymous usage analytics details fix(db): update data directory path to use getPhotoshopMcpHomeDir function for better compatibility (`b1b58e8`)

## [1.3.0] - 2026-06-17

[v1.1.3...v1.3.0](https://github.com/alisaitteke/photoshop-mcp/compare/v1.1.3...v1.3.0)

### Features

- feat(analytics): add launch method detection to capture analytics context (`39beb6c`)
- feat(analytics): implement analytics system with PostHog integration for usage tracking and beta telemetry feat(analytics): add API endpoints for managing analytics settings and beta telemetry opt-in feat(analytics): create UI components for user interaction with analytics settings and beta team participation feat(analytics): capture relevant events for analytics during server and UI operations feat(analytics): enable environment-based configuration for analytics settings docs: update README and .env.example to include new analytics configuration options and usage instructions (`097d19f`)
- feat(ui): enhance chat functionality by adding clear all chats feature and improving tool output handling (`8cef6e7`)
- feat(PlanCard.vue): refactor PlanCard component to use ToolCallStrip for better organization and clarity feat(StreamingMessage.vue): integrate ToolCallStrip for standalone tool calls display chore: remove ToolCallCard component as its functionality is replaced by ToolCallStrip feat: add ToolCallDetailDialog and ToolCallOrb components for enhanced tool call interaction feat: implement utility functions for tool name display and icon retrieval in tool-display and tool-icons modules (`6151bfc`)
- feat(README.md): update version description to include Action Plan (beta) feature and its benefits feat(Action Plan): implement Action Plan (beta) feature for streamlined execution of Photoshop commands feat(ui): add AppLoader component for improved loading experience during app initialization refactor(ui): remove Footer component and integrate author information into Sidebar fix(ui): enhance loading state management in SettingsDialog and ChatView components fix(ui): improve message handling in MessageList and StreamingMessage components for better user experience style(ui): add custom scrollbar styles for a cleaner interface chore(api): update API interfaces to include reasoning and activity tracking for chat messages chore(store): enhance chat store to manage streaming messages and reasoning deltas effectively chore(vite): configure proxy response headers to disable buffering and caching for real-time updates (`cd7d799`)
- feat(ChatView.vue): refactor layout to improve message list and composer positioning for better user experience feat(Composer.vue): implement textarea auto-resizing for improved usability style(Composer.vue): enhance styling of the composer component for better visual appeal fix(ModelSelector.vue): adjust button hover styles for better accessibility and user feedback (`a82cd5f`)
- feat(package.json): add packageManager field to specify pnpm version for consistency across environments feat(agent.ts): implement action plan feature to generate and execute a complete ordered plan for Photoshop tool calls feat(action-plan.ts): create action plan execution logic to handle planning and executing tool calls in a single pass feat(shared.ts): define new types for plan step status and plan view to support action plan feature feat(config.ts): add actionPlanBeta configuration option to enable or disable action plan feature feat(server.ts): add API endpoint to toggle action plan feature in the server configuration feat(chats.ts): extend chat message structure to include action plan details for better state management feat(App.vue): integrate action plan toggle in the UI to allow users to enable or disable the feature feat(ChatView.vue): display action plan and tool calls inline for better user experience feat(PlanCard.vue): create a new component to visualize the action plan and its steps feat(MessageList.vue): update message list to conditionally render action plan and tool calls feat(useTextareaAutosize.ts): add composable for auto-resizing text areas to improve user input experience feat(api.ts): implement API call to set action plan feature state in the backend fix(server.ts): ensure assistant messages persist action plan state when saving chat history (`de0c500`)

### Fixes

- fix(windows-executor.ts): remove unnecessary return statement in DoJavaScript call to streamline execution of JSX script (`2e8f719`)

### Refactors

- refactor: simplify error handling by removing error parameter in catch blocks across platform detector and executor files to enhance code readability and maintainability (`4253d62`)

### Chores

- chore(release): bump version to 1.3.0 (`5e1acaf`)
- chore(images): update image assets to improve visual quality and consistency (`8751c8a`)
- chore(eslint): update ESLint configuration to include globals for Node.js and ES2021 refactor(eslint): adjust no-unused-vars rule to improve TypeScript compatibility and ignore specific patterns (`b440fa1`)

### Version bumps

- 1.2.0 (`51f1756`)

## [1.1.3] - 2026-06-11

### Features

- feat(README.md): update tool counts and descriptions to reflect new features and improvements feat(api): add font listing functionality and enhance text layer creation with font support fix(api): resolve font names for text layers to ensure correct font application fix(errors): add 'font_not_found' error code for better error handling test: add tests for font listing and text layer creation with specified fonts (`5530756`)
- feat(CONTRIBUTING.md): add command for targeted regression tests for issue #2 feat(README.md): update recorded test results to reflect issue #2 fixes and new test harness feat(package.json): add new script for targeted regression tests for issue #2 feat(spike-issue-2.ts): create a new script for targeted regression tests for issue #2 fix(test-all-mcp-tools.ts): improve document info assertion to handle errors gracefully feat(layer-tools.ts): add new tool to select layer by name, including nested groups fix(extendscript.ts): improve error handling when accessing document properties fix(photoshop-api.ts): ensure alert suppression works correctly during script execution fix(macos-executor.ts): ensure ExtendScript BOM is prefixed when writing scripts fix(windows-executor.ts): ensure ExtendScript BOM is prefixed when writing scripts chore(_shared.ts): refactor jsString function to use utility from js-string module feat(extendscript-file.ts): add utility to prefix UTF-8 BOM for ExtendScript files feat(js-string.ts): create utility for escaping JavaScript strings (`68322ce`)
- feat(docs): update README and related documentation to reflect the addition of 12 new recipe tools and 4 new atomic tools, bringing the total to 78 tools fix(docs): correct tool coverage count in test script to match updated total of 78 tools (`6502d01`)
- feat(package.json): add new test script for intent expansion features feat(test-intent-expansion): create local integration test for prompt-intent-expansion features to ensure functionality and coverage of new features (`8fe5a68`)
- feat(docs): update README to reflect new MCP prompts and tools, including 16 pre-engineered templates and 12 outcome-oriented recipe tools feat(docs): add user intent glossary and degrade paths for better user guidance feat(docs): enhance instructions for prompt-layer usage and multi-step workflows feat(docs): finalize intent taxonomy and update phase documentation for clarity feat(prompts): introduce new prompts for gradient fade, sky blend, dodge & burn, and remove distraction feat(tools): add new mask tools for gradient application and enhance existing adjustment tools feat(recipes): implement new recipes for gradient fade, sky blend, dodge & burn, and remove distraction to streamline user workflows fix(extendScript): improve error handling and add new helper functions for gradient and mask operations fix(tests): update tests to cover new prompts and recipes, ensuring all functionalities are validated (`1ce32bb`)
- feat(tests): add local and all MCP tools test scripts to improve testing coverage chore(package.json): add new test scripts for local and all MCP tools to facilitate testing process refactor(extendscript): improve layer handling and error management in ExtendScript snippets for better reliability refactor(recipes): streamline recipe functions to utilize shared helper functions for consistency and maintainability (`56f303d`)
- feat(docs): add AI/Prompt Layer documentation to README.md to explain new features and usage feat(docs): create prompt-layer.md to provide detailed reference for AI/prompt layer functionality chore(gitignore): add local maintenance scripts to .gitignore to prevent unnecessary tracking feat(scripts): add verify-photoshop-prompt-coverage script to ensure prompt and recipe parity feat(scripts): create test-mcp-local script for local smoke testing of the photoshop-mcp server feat(core): implement PromptRegistry to manage prompt definitions and handlers feat(core): integrate prompt handling into PhotoshopMCPServer for improved functionality feat(recipes): add various recipe tools for enhanced image processing capabilities feat(recipes): implement frequency separation, enhance portrait, and batch mockup replace recipes feat(recipes): create export social variants and prepare for web recipes for streamlined exports fix(api): improve error handling in getContextInfo function to prevent crashes fix(api): ensure active layer checks are robust to avoid runtime errors fix(api): enhance error classification for better user feedback on failures fix(tools): update tool descriptions to clarify usage and preconditions for better developer experience (`3e871ab`)
- feat(extendscript): implement hue, saturation, and lightness adjustment for active layer using Action Descriptor for better compatibility with Photoshop (`77a35de`)
- feat: add provider and model information to chat messages and UI components (`80050c4`)
- feat(extendscript): enhance fillLayer function to handle locked and text layers and return additional information fix(macos-executor): improve error handling in parseResult method to throw an error for specific error messages (`658cdad`)
- feat: add Google AI Studio provider support to the application (`34eef62`)
- feat(ui): enhance chat functionality with usage tracking and cost calculation (`77f0cc6`)

### Fixes

- fix(extendscript.ts): improve hasSelection logic to handle exceptions when no active selection exists (`73f94ba`)

### Documentation

- docs(README): update features list formatting for improved readability and consistency (`d8688bb`)
- docs: update contributing and development documentation for clarity and organization (`dfb6878`)
- docs: add CONTRIBUTING.md and pull request template for better contribution guidelines and process clarity (`832292c`)
- docs(README.md): update README to reflect version 1.1 features and integration test results for better clarity and user guidance docs(prompt-intent-expansion): add initial documentation for prompt intent expansion project to outline phases and confirmed decisions docs(intent-taxonomy): create intent taxonomy draft to map user phrases to corresponding tools and recipes for improved user interaction (`1ec19f0`)
- docs(README): update screenshot image for standalone UI to reflect new design feat(images): add new screenshot image for standalone UI in light frame (`1aa0e79`)
- docs(README): add screenshot of standalone UI to enhance documentation clarity feat(images): add standalone UI screenshot to provide visual reference for users (`a3833f1`)
- docs(README): update documentation to include standalone UI mode and usage instructions for better user guidance (`34149f5`)

### Chores

- chore(package.json): update build:web script to use install instead of ci for better dependency management (`1bb0075`)
- chore(.gitignore): add local planning docs directory to .gitignore to prevent tracking of unpublished files (`cc18f6c`)
- chore(.gitignore): add *.tgz to ignore list to prevent tarball files from being tracked (`b5e7097`)
- chore: update package versions to 0.1.8 for both main and web packages to reflect new changes chore: update author information in package.json for better attribution chore: add repository, homepage, and bugs fields in package.json for better project visibility chore: clean up .npmignore by removing unnecessary entries and adding defensive filters feat(cli.ts): dynamically retrieve package version from package.json for CLI output feat(server.ts): implement cache control headers for static assets to improve performance and caching behavior (`9dabea6`)
- chore(package.json): update build:web script to use npm ci for better performance and reliability chore(web/.npmignore): add .npmignore file to exclude unnecessary files from the package feat(web/package.json): add @lobehub/icons-static-svg dependency for icon support feat(main.ts): self-host only the Latin subset of Source Sans 3 Variable font to reduce bundle size (`9101fbe`)

### Version bumps

- 1.1.3 (`bcbba5c`)
- 1.1.2 (`0414f29`)
- 1.1.1 (`5cac9c1`)
- 1.1.0 (`6e1c1f0`)
- 1.0.0 (`17d8d91`)
- Phase E residual pass: prompt helper reduced to a compatibility re-export; core prompt registry now consumes guide-contract directly; image and neural catalog schemas were re-expressed without public-contract changes. Gate: 1,278/40,087 exact lines = 3.19%, 0 identical files, 20 large blocks, 17 high-similarity files. build:server green; canonical tests 72/72 and 716/716, then verify:tool-counts exposed concurrent dirty-worktree drift (128 discovered vs docs expecting 130).
- P1-E.4 lineage hardening: priority preflight now reconciles non-trend derived problem evidence as well as cumulative trends. Stale source-operation support is pruned and an unsupported open blocker is retired rather than retaining authority over the current frame. Added regression coverage for a superseded single-source medium blocker; focused compact + SessionStore suite is 90/90 green with TypeScript `--noEmit` and touched-file diff checks green.
## 2026-10-01 — E.19d color/gradient preflight foundation

- Continued E.19 after canonical material/light binding enforcement with a normalized
  `photoshop.guard.color_gradient_preflight.v1` receipt. Semantic stops now carry role, family and provenance;
  artist-selected exact RGB remains explicitly artistic, while reference/accepted-frame stops must identify a
  durable E.19 source anchor.
- The preflight is revision-bound to the exact active Scene Lighting & Color Model, carries the represented
  interaction and required palette relations, reports sampled-anchor RGB contradictions as `conflict`, and
  reports relations not established by the scene model as `review-required` rather than inventing certainty.
- Added focused railway-gradient regressions for supported artistic+sampled stops, sampled-anchor contradiction,
  stale revision and unknown evidence anchor. Guard admission/persistence remains open, so E.19d is not marked
  complete by this slice.

## 2026-10-01 — E.19d canonical Guard admission

- Wired `photoshop.guard.color_gradient_preflight.v1` into the canonical compact Guard compiler. After a visual
  frame exists, gradient/color-field passes, atmosphere/optical-effect owners, and explicit global
  `lighting-structure` changes now require a preflight before Photoshop dispatch. The first-visible blank-canvas
  path is intentionally exempt so the new causal gate cannot delay first visible progress.
- Preflights are normalized against the exact applicable durable or same-pass Scene Lighting & Color Model.
  Missing scene state, invalid/stale receipts and `conflict` outcomes reject before mutation; softer
  `review-required` outcomes remain admissible. Accepted normalized receipts are carried on the durable Guard
  operation, and the operation-contract allowlist now recognizes that field.
- Verification: TypeScript `--noEmit`; focused color-preflight + compact-contract suite **2 files / 48 tests**;
  `verify:painting-policy`; `verify:acceptance-matrix`; touched-file `git diff --check` — all green. E.19d
  remains open for broader category coverage; E.19f selective invalidation is still pending.
## 2026-10-01 — E.19f selective lighting/color dependency invalidation

- Continued the current E.19 implementation with causal dependency diffing between durable Scene Lighting &
  Color Model revisions. Ambient, emitter, atmosphere, sampled-anchor, global-value and palette-relation
  changes now have stable dependency ids instead of treating every newer model revision as stale-everything.
- Added per-owner `lighting_color_binding_states` reconstructed from current-frame durable material-response
  history and exposed them through compact pass context/status independently of geometry stale debt.
- Guard material admission now accepts an older scene revision only when selective invalidation proves that
  the owner's declared light/color dependencies are unchanged; changed or unverifiable dependencies remain
  fail-closed before Photoshop mutation.
- Added regressions proving headlight-family changes stale the train/headlight reflection while leaving an
  ambient-only mountain current, fog changes stale fog dependents, and revision-only changes do not create
  false debt. Focused verification: **2 files / 69 tests green**; TypeScript `--noEmit` green.
- E.19f remains open only for the explicit geometry→lighting receiver/source bridge where a spatial change
  itself changes a declared lighting/material relationship.
## 2026-10-01 — E.19f geometry-to-lighting dependency bridge

- Completed the repository-side E.19f bridge from Scene Geometry Model changes into lighting/material stale
  debt without introducing a global geometry=>color invalidation rule.
- `lighting_color_binding` now accepts an optional `spatial_relation` that pins the exact Scene Geometry Model
  id/revision plus the stable geometry dependency ids that materially affect the receiver/source relationship.
- Durable `lighting_color_binding_states` now combine E.19 causal-source changes with those explicit E.18
  spatial dependencies. A changed declared VP/family/plane/anchor stales the lighting binding; unrelated geometry
  remains non-stale. Missing source revisions fail closed instead of guessing that an old relation is still valid.
- Guard MATERIAL admission verifies current spatial dependency ids against the applicable Scene Geometry Model
  and rejects missing or stale spatial relations before Photoshop mutation. An older relation is admissible only
  when durable selective-state evidence proves its declared geometry dependencies unchanged.
- Added a regression proving that moving the declared rail-depth geometry invalidates the train's lighting
  relation while an otherwise similar owner with no declared spatial dependency remains current.
- Verification: TypeScript `--noEmit` green; focused Guard/SessionStore/lighting suites **3 files / 115 tests
  green**. E.19f repository implementation is complete; E.19h regression/live acceptance remains next.
## 2026-10-01 — E.19h repository regression pack complete

- Completed the repository-side E.19 acceptance/regression pack across all six roadmap scenarios: foggy railway
  relational light/color state, semantic sky-gradient stops with revisable artist-selected RGB, selective
  headlight invalidation, reference-sample departure rejection, explicit stylized/nonphysical palette exception,
  and grayscale/value-only operation without invented hue/chroma complexity.
- Added regressions confirming an artist-selected teal may change while the same causal relations remain
  satisfied, intentional stylization remains explicitly declared rather than masquerading as sampled evidence,
  and monochrome scenes can collapse to value-only palette relations.
- Rechecked the canonical Chat On Steroids Photoshop route before claiming live acceptance. The current route is
  not ready: `photoshop_ping` reports `ready=false`, `plugin_connected=false`, `revision_match=false` with
  `uxp_bridge_revision_missing`; Guard capability state also reports UXP `fetch failed`. No live Photoshop
  acceptance is claimed or inferred from repository tests.
- Focused verification: **3 files / 76 tests green** plus TypeScript `--noEmit` green. Repository E.19h is
  complete; the live Photoshop acceptance remains an explicit blocked gate.
## 2026-10-01 — E.20a Scene Camera & Imaging Model foundation

- Started E.20 after completing the repository-side E.19 regression pack. Added
  `photoshop.guard.scene_camera_imaging_model.v1` with document-incarnation/source-frame identity and an exact
  dependency on the active E.18 Scene Geometry Model revision; an E.19 Scene Lighting & Color Model provenance
  pair may also be pinned when camera/imaging behavior depends on accepted light/color state.
- The model records qualitative framing/view/lens character, focal/depth-of-field behavior, camera/subject
  motion and shutter character, optical softness/bloom/halation, capture grain/vignette/film-or-sensor character,
  plus explicit intentional exceptions. It deliberately does not invent focal-length/radiometric simulation or
  a second perspective model.
- Added normalization regressions for exact E.18/E.19 provenance, qualitative custom lens character and
  fail-closed incomplete lighting/color provenance. Focused verification: **1 file / 3 tests green** plus
  TypeScript `--noEmit` green. Guard persistence and E.20b focus/depth binding remain open.
## 2026-10-01 — E.20a Guard persistence

- Wired `photoshop.guard.scene_camera_imaging_model.v1` into canonical Guard admission/persistence rather than
  creating a parallel camera state store. Camera revisions now validate exact document/incarnation identity,
  the applicable E.18 Scene Geometry Model revision, and—when present—the exact applicable E.19 light/color
  revision before dispatch.
- Durable replacement preserves camera `model_id` and requires a strictly increasing revision. Invalid or stale
  geometry/light provenance is rejected before Photoshop mutation.
- SessionStore now reconstructs only the latest valid camera/imaging model for the current document incarnation
  and exposes it through compact pass context plus compact status/resume.
- Added regression coverage proving a newer current-incarnation camera revision wins while a later record from
  an old incarnation cannot replace it. Focused verification: **2 files / 66 tests green**; TypeScript
  `--noEmit` green. E.20a persistence is implemented; E.20b focus/depth binding is next.
## 2026-10-01 — E.17g maintained homestead corrective benchmark

- Added a maintained homestead-tree regression for the motivating bad-scaffold failure shape. It reports three
  candidate attempts and two same-problem candidates before structural escalation: the first cosmetic correction
  is admitted and journaled, the second cosmetic method-search is rejected before dispatch, and a structural
  negative-space rebuild remains admissible.
- This closes the repository benchmark slice of E.17g without claiming the remaining live Photoshop completion
  acceptance.

## 2026-10-01 — E.17f pre-final hostile-review completion gate

- Wired the already-defined `photoshop.guard.pre_final_hostile_review.v1` contract into the canonical Art
  Director `complete` transition. Completion now requires an exact-current-frame hostile review after global
  brief, E.18 geometry and E.17d/E.19 physical-effect completion checks.
- The review is normalized against the active artistic evaluation contract/current frame and receives the current
  completion-debt projections. Any mapped hard defect rejects completion; an accepted review is persisted with
  the completed Art Director state instead of remaining an unused helper.
- Verification: TypeScript `--noEmit` green; focused `artistic-contract` + `session-store-regressions` suite
  **2 files / 76 tests green**. Live Photoshop STOP/FINALIZE acceptance remains open.

## 2026-10-01 — E.7a internal checkpoint persistence

- Completed the remaining repository-side E.7a persistence slice. The compact compiler now defers checkpoint
  debt to the embedded runtime, which automatically saves a deterministic layered PSD inside the immutable
  art-run `checkpoints/` directory immediately before a due visual mutation.
- Automatic saves reuse the normal guarded logical-operation path, durable save receipt, on-disk non-empty PSD
  verification and operation acknowledgement. Routine checkpoint reporting is closed internally rather than
  consuming a model-facing protocol turn.
- A verified save clears mutation-risk checkpoint debt and the same visual pass can continue. Missing project
  binding or an unverified save blocks the visual mutation; an uncertain save record remains durable for
  recovery instead of permitting replacement mutation work.
- Added embedded regressions for successful automatic persistence and fail-closed missing-file verification.
  Focused verification: `tests/embedded-guard.test.ts` **79/79 green**; TypeScript `--noEmit` green.

## 2026-10-01 — E.11 semantic history-ownership evidence foundation

- Added `photoshop.guard.semantic_pass_history_ownership.v1` to VisualMicroPlan `pass_execution` results so
  semantic-pass rollback evidence is explicit rather than inferred from mutation count or tool labels.
- A completed pass is `exact` only when every completed visual mutation reports a positive `history_steps`
  count. Missing counts remain `unproven`; a failed/uncertain mutation forces `partial-or-uncertain` even when
  the completed prefix is known, preventing repository code from pretending that a partial pass is atomic.
- Added focused coverage for an exact two-mutation span and a middle-mutation failure. Verification:
  `tests/visual-microplan.test.ts` **61/61 green** and `npm run build:server` green. Live Photoshop history-span
  correspondence/rollback-boundary acceptance remains open before E.7b batching can be widened.

## 2026-10-01 — E.11 durable semantic-pass rollback handle

- Joined semantic-pass history ownership to Guard rollback state. Exact E.11 ownership is now authoritative
  for rollback depth and produces a durable `photoshop.guard.semantic_pass_rollback_handle.v1` tied to the
  originating Guard operation and exact owned history-step count.
- Removed the competing fallback for E.11-aware passes: `unproven` and `partial-or-uncertain` ownership no
  longer becomes an invented one-step rollback merely because the outer Guard operation is visual. Legacy
  non-E.11 records retain their historical fallback until migrated.
- Live Photoshop history-span/boundary correspondence remains required before E.7b restrictions widen.

## 2026-10-01 — E.11 fail-closed unproven rollback

- Prevented E.11-aware `unproven` and `partial-or-uncertain` semantic passes from creating a zero-step pending
  rollback through the ordinary visual-verdict path. Such a pass now fails closed with
  `semantic_pass_rollback_unproven` and must be reconciled or restored from an exact accepted anchor.
- Exact semantic-pass ownership continues to produce the durable exact-step rollback handle; legacy operations
  without an E.11 ownership receipt retain their existing rollback accounting.
## 2026-10-01 — E.7c observed corrective escalation

- Removed `causal_escalation_level` as a required admission certificate from the E.17 construction-exit and
  structural-mismatch corrective gates. The Guard still preserves observed same-problem history and blocks
  repeated cosmetic/detail masking, but a causally distinct structural repair no longer needs a numeric
  escalation label merely to execute safely.
- Updated the maintained artistic-recovery regressions, including a label-free structural-repair control.
  This is a bounded E.7c slice; broader prose/label-only artistic admission cleanup remains open.

## 2026-10-01 — E.7c label-free bounded recovery

- Removed the mandatory `root_cause_classification`, `root_cause_reason` and `causal_level_change`
  negotiation that previously sat between two observed failed strategies and the one remaining bounded
  visual attempt. A causally distinct candidate can now proceed directly from the durable failure history.
- Exhausted-strategy reuse and the existing bounded terminal state remain fail-closed in this slice; the
  broader E.7c removal of attempt-count admission thresholds remains open.

## 2026-10-01 — E.7c attempt-count veto removal

- Removed the fixed failed-attempt-count terminal gate from dependent artistic recovery. Observed failures
  remain durable and an exhausted strategy still cannot be reused, but a genuinely distinct safe visual
  strategy is no longer rejected merely because it is the fourth or later attempt at the same unresolved
  artistic problem.
- Added a focused regression proving a fourth distinct strategy is admitted after three failures while reuse
  of an exhausted earlier strategy remains fail-closed.

## 2026-10-01 — E.7c strategy-validation cadence/admission separation

- Stopped the configured `strategy_validation_after_microplans` threshold from automatically creating an
  Art Director `review_due` barrier. The meaningful-pass counter and configured cadence remain durable
  artistic guidance/telemetry, while observed failure, uncertainty, protected-quality loss, task completion
  and the ordinary bounded task-review cadence retain their review behavior.
- Updated the planner/painter regression to prove that reaching the strategy-validation threshold alone keeps
  the directive active and admits continued Painter work instead of demanding narrative validation metadata.

## 2026-10-01 — E.7c stage-label/admission separation

- Removed backward/unknown artistic stage labels as standalone visual-mutation vetoes. A label-only backward
  declaration can execute but cannot downgrade the canonical durable painting stage.
- Preserved explicit structural reset semantics: only a valid `stage_reset` may move durable stage state
  backwards, and that reset continues to invalidate dependent refinement/physical-stack evidence. Invalid
  explicit reset tuples still fail closed.

## 2026-10-02 — E.7c brush-rationale/admission separation

- Removed `brush_preset_choice_reason` and `brush_retry_reason` prose as standalone mutation-admission
  certificates. Multi-candidate material work still requires an explicit evidence-bound preset choice, and
  presets outside the preflighted role portfolio remain rejected.
- Prior failed/rolled-back brush usage remains durable artistic context, but retrying an explicitly selected
  safe preset no longer requires a narrative explanation before Photoshop dispatch. This removes another
  schema-repair turn without weakening executable preset fit, document/layer safety or recovery semantics.
- Updated the compact-contract regression to prove an explicit unexplained choice and same/cross-problem
  retries are admissible while implicit multi-candidate selection remains fail-closed.

## 2026-10-02 — E.7c completion-reason/admission separation

- Removed per-row `global_brief_assessment.brief_item_results[].reason` and
  `pre_final_hostile_review.checks[].reason` as mandatory completion certificates. Structured item state and
  hostile-review area/status remain authoritative; supplied prose is preserved as optional audit guidance.
- Kept completion fail-closed on exact contract/frame/authorized-critic provenance, complete hard-brief coverage,
  recognition evidence, unresolved hard debt, the full hostile-review area matrix and mapped major defects.
- Added a regression proving an evidence-bound satisfied brief and a clear six-area hostile review can complete
  without narrative reason fields.

## 2026-10-02 — E.7c layer-separation prose/admission separation

- Removed `layer_separation_check.reasons` as a mandatory VisualMicroPlan/MCP admission certificate. Structural
  authority remains `change_kind + substantial + rollback_value + independent_adjustment_expected`; these fields
  still derive required isolation and remain bound to logical-layer rollback semantics.
- Kept required isolation, logical-owner consistency and anti-layer-explosion enforcement fail-closed. Optional
  reasons remain available as artistic/audit guidance rather than being synthesized to satisfy a schema.
- Added runtime and public compact-schema regressions. Focused verification: `visual-microplan` +
  `compact-contract-regressions` **2 files / 114 tests green**; `npm run build:server` green.

## 2026-10-02 — E.7c scene-geometry applicability prose separation

- Removed `scene_geometry_model.applicability_rationale` as a mandatory certificate when structured scene
  applicability is not `coherent_3d`. The applicability enum and validated projection/frame structure remain
  executable authority; supplied rationale is preserved only as optional artistic/audit guidance.
- Kept exact document/frame provenance, projection/vanishing evidence validation and downstream geometry or
  completion debt fail-closed. Added a normalization regression proving a flat/collage declaration persists
  without prose while optional rationale is still retained when supplied.

## 2026-10-02 — E.7c value-exception structural authority

- Replaced Value Gate exception prose as admission authority with an exact durable `style_contract_basis`.
  Both `override` and `style-not-applicable` must identify a valid style-contract field whose criterion exactly
  matches the active Art Director `style_contract`; stale/mismatched bases fail closed.
- `override_reason` and `applicability_reason` are now optional artistic/audit guidance. Override still requires
  exact-current grayscale evidence and criterion statuses; prose alone cannot authorize either exception path.
- Updated the public Guard schema and value/planner fixtures. Focused verification: `value-check` +
  `planner-painter` **2 files / 73 tests green**; the broader refinement/unified fixture run remains red only on
  the pre-existing missing-`perceptual_hierarchy` fixture drift, not on Value Gate assertions.

## 2026-10-02 — E.7c strategy-validation reason separation

- Removed `strategy_validation.reason` as a mandatory narrative certificate when reconciling a durable/legacy
  strategy-validation review barrier. Exact-current frame provenance and the actual `dominant_objective_read` and
  `strategy_fit` visual findings remain required; replans still require a changed rendering strategy or first-pass
  sequence.
- Added a regression proving an evidence-bound `pass` can close without duplicate reason prose while preserving the
  visual findings themselves.

## 2026-10-02 — E.7c painting-profile transition prose separation

- Removed `profile_transition_reason` as a mandatory certificate for the one supported in-place
  `simple_graphic -> nontrivial_painting` upgrade. The explicit requested profile plus the stronger validated
  nontrivial-painting obligations remain the transition authority; optional prose is retained only as audit/artistic
  context.
- Updated the public Guard schema and planner/painter regression so a fully preflighted upgrade succeeds without
  synthesized narrative text while an upgrade missing the stronger brush preflight still fails closed.
