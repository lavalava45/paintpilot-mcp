# Changelog

- 2026-10-10 — **P0-E.26 offline COS Goal/Loop continuation boundary fix, activation pending.** Verified the *running* COS process is `chat-on-steroids-OUR-RELEASE-2.1.32/release/win-unpacked/Chat On Steroids.exe`; its actual `node.exe` MCP child launches this PaintPilot repo's `dist/cos-plugin.js`. Read the exact Goal/Loop / Automatic Continue source in that same 2.1.32 checkout. The host's Goal helper previously received the canonical assistant/user transcript and only **counts** of local tool calls, not an attributed Guard `next_state`; after a Painter final, it could incorrectly accept a helper `stop` as `no-reply` / reached-goal despite `continue_required`. This is a demonstrated source-path vulnerability consistent with the overnight symptom, not a validated trace of every historical session.

  Modified COS checkout (not the running packaged binary): added `src/main/painting-guard-continuation.ts` with bounded exact-turn/chat/attribution MCP-Guard-receipt classification; connected it to both existing `src/main/goal.ts` Goal/Loop after-turn and finish follow-up paths. It sends **only fixed host-authored** `unresolved|blocked` status guidance to the decision helper; no raw tool args/results, new model, scheduler, side-channel or separate loop. An unsupported `stop` with verified unfinished Guard debt gets at most one corrected decision request; a second refusal is shown as settled, non-retryable `painting_guard_unresolved_no_action`, avoiding endless identical API/ChatGPT retries. Wrong turn/chat, unattributed, truncated, failing or forged argument-only evidence is not continuation authority. A technical save/pass closure cannot prove the whole artwork finished; rejected/uncertain Guard execution can only direct safe reconciliation or expose a blocker. Explicit user Off/STOP and existing source-turn/outbox ownership remain supreme. Updated `src/shared/goal-errors.ts`, new targeted receipt tests and two end-to-end mocked Goal STOP/continue tests.

  **Offline proof:** COS TypeScript typecheck PASS; focused suites `test/painting-guard-continuation.test.ts`, `test/goal.test.ts`, `test/goal-backends.test.ts`, `test/goal-control-race.test.ts` and `test/session-finish.test.ts`: **5/5 files, 256/256 tests PASS**. No live painting, actual model/API calls, Photoshop UI operations, COS/UXP plugin reloads, packaged host build or unattended continuation performed. **Still open:** authorized COS release/activation of the changed source and real Goal-enabled final→continue acceptance (plus user Stop, genuine whole-brief finish, no-gain/blocker behaviour). Until the running packaged app is updated, the change is a validated source implementation, **not** a live fix. Roadmap E.26 remains P0; E.27 prerequisites stay unchanged.

- 2026-10-10 — **Process-video missing-sidecar recovery.** Recorded attempts may retain a video clip without an AFTER commentary file. The assembly script now warns and falls back to manifest artistic_intent/outcome_note; absent outcome is explicitly unconfirmed, never fabricated as success. Existing empty sidecars or missing intent still fail. Timeline records source and expected/missing paths. Restored violinist entry 0050 from its durable ERASER readiness rejection (not executed, no image changes); five focused subtitle tests and script syntax checks pass. No Photoshop operation or artwork video rendering was run.

- 2026-10-10 — **Documentation and Git publication readiness audit.** Synchronized the
  published UXP bridge revision (`compact-v2-20261009-component-rebuild`) in
  `AGENTS.md`, corrected the `cycle_auto` inline-image versus explicit-redelivery
  behavior in architecture/tool documentation, completed the 15-tool public Guard
  list, and linked object construction, painterly-stroke and same-chat Critic
  guides from the English/Russian entry points. A local link scan found no
  unresolved relative targets across 50 Markdown files. The current working
  tree passed `npm run verify:canonical`: **136/136 test files, 1512/1512 tests**,
  build, package/third-party, Guard-contract, policy, tool-count, provenance
  and acceptance checks; ESLint reported **0 errors / 84 warnings**.
  This is repository verification, not a new live-Photoshop or artistic acceptance.

- 2026-10-10 — **Process-video subtitles distributed by commentary block.** `scripts/dev/build-process-video.mjs` retains authored intent/craft/result blocks and assigns equal consecutive durations inside each actually rendered clip, including slowdown and final-frame hold. It preserves text, global SRT numbering and shared millisecond boundaries; `timeline.json` now includes per-clip `subtitle_cues` and distribution/count metadata. Plain legacy lines remain supported; only sub-millisecond-capacity overflow merges adjacent blocks. Updated the usage guide and added four focused offline block/timing checks. No artwork video was rendered or Photoshop operation run.

- 2026-10-10 — **Natural artist commentary.** Artistic/mixed pre-pass goals use concise first-person intent or direct action with context-dependent openings, rather than infinitive task labels. Aligned server guidance, painting guide and working kernel; no fixed/random prefix, duplicate narration or claim of completed work. Language/detail preferences and the existing goal-to-commentary path remain intact. Source/policy verification only; no live painting or plugin restart.

- 2026-10-10 — **E.25 rigid two-owner acceptance; E.11 real guarded Smart Filter, missing native history receipt fixed in source (live replay still blocked).** Continued on existing isolated document 795 via COS Photoshop Guard. Added new generic rigid model `e25_rigid_panel_20261010` with independently editable panel shell / inset bar on native Photoshop layers 5 / 6. Live operations `e25_rigid_panel_shell_20261010_f`, `e25_rigid_panel_bar_20261010_g` built them; `e25_rigid_pose_shell_rev2_h2`, `e25_rigid_pose_bar_rev2_i` applied the same author-chosen parent translation + 18° rotation through component rebuild on their original layers. Whole-frame native BEFORE/AFTER showed both components moving together, retaining the inset proportion and removing old contours. Changing scale of `rigid=true` without `reshape_object_ids` was correctly refused pre-dispatch (`construction_rigid_shape_changed`). Saved checkpoint `processes/e24-e25-live-acceptance-process/run-01/export/e25-rigid-ik-connected-20261010.psd`. A subsequent native +9 px move of layer 2, `e25_ortho_scene_geometry_control_l`, produced exact bounds `(209,130)–(279,195)` and registered an orthographic scene geometry model grounded in current test pixels. This demonstrates coupled *construction rebuild*, not automatic multi-owner native transform propagation or complete perspective/cutout acceptance.

  **E.11 new native evidence:** with a durable orthographic Scene Geometry Model and explicitly limited optical test exception, `e11_camera_bound_gaussian_20261010_m` successfully executed the real `photoshop_apply_gaussian_blur(radius=3)` on blue lower-link owner `fore_link`. BEFORE/AFTER showed only this link softened. Photoshop converted physical `NORMAL` layer id **4** to `SMARTOBJECT` id **7**, with a Smart Filter mask; Guard's durable `fore_link` owner advanced to layer 7 while other owner ids/layers stayed intact. Native `photoshop_get_history` showed one `MCP Gaussian Blur` history entry. **But** the old UXP response had no `history_steps` evidence, so `previous_observation(action=rollback)` failed closed with `semantic_pass_rollback_unproven` and **no Undo was executed**. Instead the exact blurred test frame was reviewed and accepted as a *temporary control outcome*; the original pre-blur PSD remained saved. No artistic image was modified.

  **Targeted fix:** in `uxp-plugin/p2-filter-ops.js`, return `history_steps: 1` for Gaussian/Motion/Smart protected blurs **only after** successful `hostControl.suspendHistory` → `resumeHistory(true)` commits the Smart Object conversion (if needed) and filter as one Photoshop history transaction. Do not infer the count from the two individual `batchPlay` commands. Updated `tests/guarded-blur.test.ts` for fresh/existing Smart Objects and all three blur modes; added a nested atomic `details.history_steps` history-ownership regression in `tests/visual-microplan.test.ts`. `node --check` PASS; targeted **109/109 tests PASS** (31 guarded blur + 78 visual microplan), `git diff --check` PASS. No broad build or full suite was claimed.

  **Live deployment/recovery limitation:** Adobe UXP Developer Tool showed `Plugin Reload Successful`, but the Photoshop UXP bridge subsequently became unavailable to COS during a *different* operation `close-old-technical-document-20261010-a` that Guard reports as **uncertain**. The Photoshop desktop had an open unrelated `Save As` dialog inside `window-violinist-process`; this conversation did not initiate, dismiss or alter that modal, did not reconcile another operation, and did not replay any Photoshop mutation. The new UXP receipt/rollback has **not been verified live** after reload. Before more live work, reconcile the other operation with its owner, regain matching bridge/document incarnation, then re-run one separate protected blur and its Guard-owned exact bounded undo. E.25's cutout/perspective and full dependent transforms, E.11 Smart Filter rollback/semantic parity, and therefore E.27 `local-warp` remain OPEN/DEFERRED. Updated `docs/PAINTING-ROADMAP.md` accordingly, preserving unrelated agent edits.

- 2026-10-10 — **E.25/E.11 sequential live acceptance; E.27 dependency gate remains open.**
  Operated exclusively through the loaded COS Plugins / embedded Guard / native
  Photoshop UXP in the existing isolated **640×480 document 795**; no artwork
  document, application restart, ImageGen, source implementation or dependency
  was changed. `photoshop_ping` confirmed connected matching bridge
  `compact-v2-20261009-component-rebuild`; the loaded Guard advertised
  `2026-10-10-chat-critic-journal-boundary`. Native E.25 operation
  `e25_native_scale_move_20261010_a` executed `scalePercent=50` with
  `centerAnchor=false`, then `deltaX=80, deltaY=30` through one Guard pass.
  Photoshop physically reported bounds **(200,130)–(270,195)** on original
  owner/layer 2, exactly the target from **(120,100)–(260,230)**, with a
  delivered actual AFTER image; prior compiler rejection is resolved in
  this specific live case.

  E.25 articulated physical-pixel acceptance: model
  `e25_joint_linkage_20261010` revision 1 was solved with IK.ts and two smooth
  separately editable components, built by
  `e25_articulated_upper_20261010_a` (native layer 3) and
  `e25_articulated_fore_20261010_b` (native layer 4). The projected common
  hinge/contact visibly connected. The artist-authored IK target then changed
  from `(187,382)` to `(156,390)` (model revision 2); operations
  `e25_articulated_pose_upper_20261010_c` and
  `e25_articulated_pose_fore_20261010_e` explicitly rebuilt their respective
  prior physical layers rather than layering new pixels over old shapes.
  Native AFTER shows the updated connected two-segment mechanism and retains
  the unrelated turquoise rectangle. The temporarily disconnected state after
  rebuilding only the first dependency was reviewed; a speculative
  `global_readability=degraded` continuation caused a pre-dispatch global
  must-fix refusal, corrected by reporting that whole-frame readability was
  stable while the dependent component required rebuilding. The control PSD
  was saved as
  `processes/e24-e25-live-acceptance-process/run-01/export/e25-pose-rebuilt-control-20261010.psd`.

  E.11 one-owner non-destructive live case:
  `e11_mask_stroke_native_20261010_c` executed prepared layer selection,
  brush settings and one native BRUSH stroke with `paint_target=layer-mask`
  on owner/layer 2. The review showed the intended white cutout without
  changing linked mechanical parts. The ordinary review requested rollback;
  Guard reported exactly **one history step remaining**, and
  `e11_mask_native_bounded_rollback_20261010_e` executed exactly one
  `photoshop_undo` under Guard. The resulting whole-frame SHA-256
  **`f4ba1dc18e838ead60238553c67e7e26ffd008955d1dfecb8964ee33025c226a`**
  exactly matches the pre-mask accepted frame; Photoshop again reported four
  layers, no selection and the previous active fore-link. No uncertain or
  pending visual operations remain. An attempted restore via
  `restore_anchor_operation_id` correctly failed read-only because this
  calibration frame was not registered as an artistic anchor.

  **Unclosed:** the E.11 Gaussian Smart Filter branch was refused in read-only
  preflight (`imaging_preflight_required`, then
  `scene_camera_imaging_model_invalid` and
  `imaging_preflight_camera_model_missing`) because this test graphic lacks
  genuinely supported scene-camera/depth bindings. No Smart Object conversion
  or blur pixels were dispatched. Full E.11 preparation/history semantic
  parity, Smart Filter ownership, exact-anchor restore on a registered anchor,
  interrupted recovery and E.25 rigid connected move/scale, perspective and
  cutout negative controls remain open. **E.27 `local-warp` was not started**:
  the required E.25 + E.11 acceptance gates are not fully met. Updated only
  `docs/PAINTING-ROADMAP.md` and this changelog; current roadmap entries for
  unrelated agents and E.26/E.7f were preserved.

- 2026-10-10 — Roadmap intake only: added **P0-E.26, autonomous Painter
  continuation across the CoS host-turn boundary**, to
  `docs/PAINTING-ROADMAP.md`. The user-supplied overnight audit reports seven
  separate unattended Painter activations, four neutral/unresolved visual
  passes, 15 rejections among 32 `cycle_auto` attempts, and a
  `continue_required` Guard result that did not cause another pass in the
  same activation. The new open task requires proving the actual stopping
  boundary and active CoS checkout, differentiating execution, pixel
  acceptance, local goal, whole-brief completion and host activation ending,
  then implementing and narrowly testing host continuation if needed.
  Explicit user stop, safe blockers and evidence-confirmed completion remain
  legitimate termination conditions; no arbitrary time/pass limit is allowed.
  The five planned offline regressions cover neutral/no continuation,
  save/debt preservation, repeated refusal, user stop and true completion.
  These are **reported audit inputs and planned tests, not an established
  root cause or implemented/tested fix**. No source changes, full canonical
  run, live painting, model call, CoS/Photoshop restart or focus action was
  undertaken for this intake; existing overnight engineering work is retained.

- 2026-10-10 — Docs: added concise IK.ts/FABRIK, Clipper2 (TypeScript port), Bezier.js and Hertzmann algorithm credits to the canonical English/Russian READMEs. Linked upstream sources and THIRD_PARTY_NOTICES; explicitly distinguished direct dependencies from project-authored research-inspired code and disclaimed automatic anatomy/artistic validation. No runtime changes.

- 2026-10-10 — E.24/E.25 live Photoshop acceptance, first isolated run and
  confirmed compiler defect. New RGB 640×480 document 795 was created only
  through embedded `photoshop_guard_cycle_auto`, bound to
  `processes/e24-e25-live-acceptance-process/run-01`; no earlier artwork
  was touched. The semantic owner `test_block_owner` was created on actual
  Photoshop layer 2. Native reported bounds `(120,100)–(260,230)` match the
  requested 140×130 region; independent exact BEFORE/AFTER image delivery
  and same-chat review were exercised. The document creation report/ack
  closed automatically on continuation. A read-only lint of the initial
  candidate returned the three independent owner/isolation violations,
  corrected by explicitly declaring `logical_layer.decision=create-new`.
  The separate `scale 50% (top-left) → move (+80,+30)` pass then reproduced
  a **pre-dispatch** `invalid_visual_microplan` / `deterministic_repair_repeat`
  rejection: no transform or other mutation was performed. The offline
  root cause was an incomplete list of mutations in
  `src/core/visual-microplan-compiler.ts`: transforms and stamps did not
  auto-append their mandatory last `photoshop_get_preview`. Fixed by
  referencing `VISUAL_MICROPLAN_MUTATION_TOOLS`, the canonical executor
  set, rather than a duplicated allowlist. Added an idempotent transform
  scale→move and stamp regression in
  `tests/visual-microplan-compiler.test.ts`; targeted suites PASS
  **119/119** and `npm run build:server` PASS. Complete
  `npm run verify:canonical` **PASS 136/136 files, 1511/1511 tests**,
  including build, Guard public contract, third-party notices, packaging,
  lint, policy/prompts, provenance, tool counts and live-evidence ledger;
  log `.photoshop-runtime/e24e25-20261010-canonical.log`.
  Exact control PSD saved via Guard to
  `export/e24-e25-pre-transform-control.psd` inside this run.
  **Pending:** plugin-only restart of the managed COS child to load the
  repaired build; rerun E.25 and check actual destination bounds
  `(200,130)–(270,195)` (0–2 px), protected pixel ownership, connected
  rigid/articulated parts and remaining E.24 review/Director gates.
  Built source/test repair is **not yet live accepted**.

- 2026-10-10 — Roadmap housekeeping: moved the completed source-implementation
  and offline-test narrative out of `docs/PAINTING-ROADMAP.md`. The retired
  checkpoints include IK.ts articulated construction, Clipper2/Bezier curves,
  Hertzmann painterly strokes, reusable object geometry, semantic component
  ownership, nonvisual closure, COS image/brief reuse, terminal owner recovery,
  native mask repair, bounded continuation, document-incarnation-safe ChatGPT
  Critic, compact contract/machine-gate recovery, and all seven Agent 1–3
  throughput/archive passes. Their dated implementation details, tests and
  regressions remain in the CHANGELOG entries below. Earlier 88/100, 90/100
  and 1470/1476 test snapshots are historical. Latest saved canonical gate:
  **136/136 files, 1510/1510 tests PASS**. Source-only closure is not Photoshop
  live approval, artistic gain or E.8a/E.8 time-to-quality acceptance.
  The roadmap now retains the unclosed acceptance scenarios and dependencies.

- 2026-10-10 — Agent 3 seventh run: E.8a selected-event memory safeguard.
  `scripts/dev/benchmark-throughput-archive.mjs` retains no more than 16 MiB
  of serialized selected events or 50,000 selected events while verifying an
  archive. When exceeded, the benchmark reports `unverified`, discards its
  partial selected collection and withholds exact counters instead of
  exhausting memory or misreporting a truncated run. Foreign-incarnation
  events are still checked but do not consume the selected-event budget.
  `tests/benchmark-archive-large.test.ts` adds a >16 MiB selected-event
  regression: **FAIL 1/2 before fix**, **PASS 2/2 after fix**.
  Four focused benchmark suites **PASS 20/20**; `node --check` and scoped
  `git diff --check` **PASS**. Full `npm run verify:canonical` **PASS**:
  **136/136 Vitest files, 1510/1510 tests**, build, published Guard contract,
  packaging, policies and provenance; ESLint **0 errors, 84 warnings**.
  Logs: `.photoshop-runtime/agent3-turn7-focused.log` and
  `.photoshop-runtime/agent3-turn7-canonical.log`.
  This is a fail-closed interim bound, not a streaming exact-counter solution;
  live concurrent/interrupted-host acceptance, unkeyed catch paths and E.8
  quality/time comparison remain open. No Photoshop mutation or reset.

- 2026-10-10 — Agent 2 seventh run: E.8a streaming archive benchmark.
  `scripts/dev/benchmark-throughput-archive.mjs` now reads the append-only
  throughput archive in 64 KiB chunks instead of rejecting archives above
  32 MiB or loading the entire input file into memory. It retains a 1 MiB
  per-entry bound, checksum/sequence validation for **all** incarnations,
  exact-incarnation selection, a required final newline, and pre/post file
  identity/size/mtime/ctime checks. New
  `tests/benchmark-archive-large.test.ts` builds a >32 MiB archive with
  39 large foreign-incarnation events and a late owned event, then verifies
  rejection of late checksum damage and an unterminated final entry. Before
  the source fix the large-archive regression **FAIL 1/1** (32 MiB limit);
  after the source fix the three benchmark suites **PASS 13/13** and Node
  syntax **PASS**. Full `npm run verify:canonical` **PASS 136/136 Vitest
  files, 1509/1509 tests**, build, public Guard contract, package, maintained
  ESLint (0 errors, 84 warnings), policy, prompts, provenance and evidence
  checks. Full log: `.photoshop-runtime/agent2-turn7-canonical.log`.
  The input reader is bounded, but retained selected events still scale with
  their count. Live concurrent/interrupted-host ordering, unkeyed catch-path
  attribution and E.8 quality/time remain open. No Photoshop mutation,
  reset/clean/revert or commit.

- 2026-10-10 — Agent 1 seventh run: E.8a archive-backed run benchmark.
  Added `scripts/dev/benchmark-throughput-archive.mjs` as a read-only
  fail-closed verifier for complete JSONL evidence, checksum, sequence,
  incarnation, legacy-history and bounded stable reads. Integrated verified
  archive events into `scripts/dev/benchmark-painting-cycles.mjs`; the
  64-event mirror remains a conservative fallback only for pre-archive runs.
  A missing declared or damaged archive cannot silently fall back to mirror totals.
  `tests/benchmark-archive-integration.test.ts` covers >64 owned events,
  exclusion of foreign incarnations, corruption, missing declared archive,
  state/archive sequence mismatch, legacy history and pending-incarnation
  unkeyed events. First full canonical attempt **FAIL 1/1508** because the
  new test fixture omitted its own `runDir` variable; corrected without
  changing the runtime contract. Focused benchmark/archive suites **PASS
  24/24**; TypeScript no-emit **PASS**; final full `npm run verify:canonical`
  **PASS 135/135 Vitest files, 1508/1508 tests**, build, Guard public contract,
  package, maintained ESLint (0 errors, 84 warnings), policy, prompts,
  provenance, compact-v2 and evidence checks. Scoped `git diff --check`
  and Node syntax checks **PASS**.
  E.8a live concurrent/interrupted-host validation, unkeyed catch paths,
  >32 MiB offline archive support and E.8 quality/time remain open.
  No Photoshop mutation or restart; no worktree reset/clean/revert.

- 2026-10-10 — Agent 3 sixth run: partial E.8a durable event archive.
  Added `src/core/guard/throughput-event-archive.ts` and integrated append-after-
  state-commit in `src/core/guard/session-store.ts`. Events are fsync-persisted
  in an append-only JSONL stream independent of the bounded 64-event mirror;
  monotonic sequence, SHA-256 checksum, document-incarnation identity, bounded
  paging and explicit gap/corruption/legacy-history diagnostics prevent a
  truncated or uncertain archive being mistaken for complete evidence.
  `tests/throughput-event-archive.test.ts` covers 75-event restart/paging,
  numeric document-id reuse and pending identity, corrupted/truncated entries,
  unarchived legacy history and an interrupted append sequence gap.
  Initial targeted run FAIL 1/16 from an incorrect malformed-JSON expectation;
  corrected fixture. Baseline before source edits: 12/12 existing throughput
  tests PASS. Focused three-suite run PASS 17/17 before final robustness
  additions, then **18/18 PASS** after them. Full `npm run verify:canonical` PASS on the final source:
  134/134 test files, 1504/1504 tests, TypeScript/build, ESLint, Guard public
  contract, packaging, policy, prompts, provenance and evidence checks.
  Logs: `.photoshop-runtime/agent3-turn6-canonical.log` (1503 tests) and
  `.photoshop-runtime/agent3-turn6-canonical-final.log` (1504 tests).
  Scoped `git diff --check` PASS (line-ending warnings only).
  Run-scoped benchmark integration, real concurrent/interrupted-host
  acceptance, unkeyed event attribution and E.8 quality/time remain open.
  No Photoshop mutation, COS restart, reset/clean/revert or commit.

- 2026-10-10 — Agent 2 sixth run: E.8a semantic-action source integrity.
  `src/core/guard/session-store.ts` no longer coerces missing, textual, negative,
  fractional, null or unsafe `semantic_actions` into a recorded numeric count.
  A valid explicit zero and valid integer are retained, including asynchronous
  non-model-visible dispatch. The read-only throughput projection marks missing
  recent action measurements `unverified` with
  `recent_semantic_actions_unmeasured` and withholds the derived action/round-trip
  ratio instead of presenting a false zero. New
  `tests/throughput-semantic-source-integrity.test.ts` reproduces six failures
  before the source fix (**FAIL 6/7**) and passes afterward; focused source,
  benchmark and throughput suites **PASS 26/26**, TypeScript no-emit **PASS**,
  scoped ESLint **PASS**. Full `npm run verify:canonical` **PASS**:
  **133/133 Vitest files, 1498/1498 tests**, server build, Guard public
  contract, packaging, maintained lint (0 errors, 83 warnings), policy/prompt,
  provenance and live-evidence checks. Full log:
  `.photoshop-runtime/agent2-turn6-canonical.log`.
  This does not reconstruct old coerced counts, repair
  legacy aggregate semantics, extend 64-event retention, attribute unkeyed
  exceptions or establish real concurrent/interrupted-host E.8a acceptance.
  No Photoshop mutation, reset/clean/revert or commit.

- 2026-10-10 — Agent 1 sixth run: E.8a exact semantic-action count integrity.
  `scripts/dev/benchmark-painting-cycles.mjs` now refuses to report a partial
  `semantic_artistic_actions_dispatched` total as exact when a selected throughput
  event lacks `semantic_actions`, contains a non-integer/coerced/negative value,
  or causes unsafe integer overflow. Such totals are `null` with a specific
  warning; proven round-trip/event ownership remains independently `complete`.
  A separate `tests/benchmark-semantic-action-integrity.test.ts` reproduces six
  failing cases before the fix and checks explicit zero versus missing evidence.
  Before fix **FAIL 6/6**; after fix benchmark/throughput suites **PASS 19/19**,
  TypeScript no-emit **PASS**, full `npm run verify:canonical` **PASS**:
  **132/132 files, 1491/1491 tests**, server build, public Guard contract,
  packaging, maintained ESLint (0 errors, 83 warnings), policy/prompt,
  provenance and evidence checks. Full log:
  `.photoshop-runtime/agent1-turn6-canonical.log`. Read-only COS Photoshop ping
  confirms ready UXP and matching bridge revisions, document 64. No Photoshop
  mutation, plugin restart, reset/clean/revert or commit. E.8a still requires
  durable >64-event retention, catch-path ownership and real concurrent/
  interrupted-host proof; no speed/quality claim is made.

- 2026-10-10 — Agent 3 fifth run: E.8a Guard telemetry-failure isolation.
  `src/core/guard/runtime.ts` now separates the actual `cycleAuto` execution
  exception from post-result throughput/attempt-audit writes. A failed
  diagnostic write no longer turns a completed Guard result into a second
  rejected event, and a failed rejection-counter write cannot mask the original
  Guard error. A failed durable operation-receipt read no longer records an
  invented zero-action event. The returned Guard result retains its original
  safety/execution fields and, when telemetry evidence is lost, explicitly
  carries `throughput_accounting_integrity: {status:'unverified', reasons:[...]}`.
  Four regressions in `tests/cycle-auto-telemetry-failures.test.ts` cover
  throughput persistence failure, separate compiler-audit failure, receipt-read
  failure and failure while recording a thrown Guard exception. Focused
  throughput/async-poll/telemetry suites **PASS 11/11**, TypeScript no-emit
  **PASS**, scoped ESLint **PASS** (0 errors, 23 existing warnings), scoped
  whitespace check **PASS**. Full `npm run verify:canonical` **PASS**:
  131/131 Vitest files, 1485/1485 tests, server build, maintained lint
  (0 errors, 83 warnings), public Guard contract, packaging, compact-v2,
  policy/prompts, provenance, tool counts and live-evidence ledger. Full log:
  `.photoshop-runtime/agent3-turn5-canonical.log`. E.8a remains open for durable >64-event history, proven ownership of
  other catch-path failures and live concurrent/interrupted-host evidence.
  No Photoshop mutation, COS restart, reset/clean/revert or commit.

- 2026-10-10 — Agent 2 fifth run: E.8a run-scoped optional metric completeness.
  `scripts/dev/benchmark-painting-cycles.mjs` no longer sums only the measured
  subset of model-visible throughput events and reports it as the exact run
  repair/split/ambiguity/rejection/typed-violation total. Missing, malformed or
  textual counts produce `null`/unknown; explicit numeric zeros remain valid.
  `buildHotLoopSummary` no longer fills incomplete run metrics from visual-pass
  latency rows that omit rejected/recovery/bookkeeping calls. A diagnostic warning
  identifies incompletely measured fields without conflating them with the
  separately proven run-ownership `complete` flag.
  `tests/benchmark-painting-cycles.test.ts` adds partial, fully measured and
  malformed-count cases and corrects old mixed-prefix expectations that
  previously asserted partial sums as exact. Red regression **FAIL 1/8** before
  source correction; focused benchmark/throughput **PASS 13/13**, TypeScript
  no-emit **PASS**, scoped ESLint **PASS** (test file ignored by the current
  lint config; CLI's pre-existing `console` rule disabled), scoped whitespace
  check **PASS**. Full `npm run verify:canonical` **PASS**: 130/130 Vitest
  files, 1481/1481 tests, build, public Guard contract, packaging, maintained
  lint (0 errors, 83 warnings), policy/prompts, provenance, tool counts and
  evidence ledger. Log: `.photoshop-runtime/agent2-turn5-canonical.log`.
  Remaining E.8a: unowned catch-path events, live concurrent/
  interrupted-host evidence and retention beyond the 64-event mirror. No
  Photoshop mutation, plugin restart, cleanup or commit.

- 2026-10-10 — Agent 1 fifth run: E.8a event retention boundary integrity.
  `scripts/dev/benchmark-painting-cycles.mjs` now treats a linked run with an
  empty retained throughput mirror as unverified rather than zero model-visible
  calls. A full 64-event window whose earliest timestamp equals the run start
  is also incomplete because evicted events may share that millisecond. A
  retained event strictly before start remains a valid boundary witness.
  `tests/benchmark-painting-cycles.test.ts` adds two regressions and a positive
  control. Corrected fixtures reproduced FAIL 2/7 before the source change;
  focused benchmark/throughput tests PASS 12/12, TypeScript PASS and scoped
  whitespace check PASS. Full canonical PASS: 130/130 files, 1480/1480 tests,
  build, Guard public contract, packaging and policy checks; maintained ESLint
  0 errors / 83 warnings. Log: `.photoshop-runtime/agent1-turn5-canonical.log`.
  Read-only COS ping confirmed Photoshop/UXP ready, matching Bridge revisions,
  active document 64. No Photoshop mutation or restart. Real concurrent and
  interrupted-host coverage and quality/time acceptance remain open.

- 2026-10-10 — Agent 3 fourth run: E.8a stale-handoff redirect accounting.
  `src/core/guard/runtime.ts` now records model-visible rejected/deferred
  calls returned by the pending-visual `cycleAuto` early redirect. The event
  intentionally stays unkeyed: the old pending visual operation cannot prove
  ownership of the new request. Telemetry write errors are isolated from the
  safety redirect and cannot permit a stale mutation. Regression in
  `tests/embedded-guard.test.ts` checks the round-trip counter, absence of
  invented operation attribution and fail-closed behavior on a simulated
  diagnostic write failure. E.8a real concurrent/interrupted-host validation,
  catch-path ownership and 64-event retention remain open. Four focused
  suites **PASS 114/114**; `git diff --check` **PASS** (line-ending warnings
  only). Full `npm run verify:canonical` **PASS**: 130/130 Vitest files,
  1478/1478 tests, TypeScript/build, maintained ESLint, public Guard contract,
  packaging, policy/prompts, provenance, tool counts and evidence ledger.
  Log: `.photoshop-runtime/agent3-turn4-canonical.log`. No Photoshop mutation,
  COS restart, commit or worktree cleanup.

- 2026-10-10 — Agent 2 fourth run: E.8a missing-versus-zero event integrity.
  `src/core/guard/session-store.ts` no longer inserts zero-valued per-event
  repair, split, ambiguity, rejection and typed-violation measurements when
  callers supply no value. Explicit zero and empty `violation_accounting`
  remain recorded. Historical document-wide additive totals are unchanged.
  `tests/throughput-integrity.test.ts` reproduces the former false zero and
  verifies persisted events against run-benchmark completeness accounting.
  Red-before-fix focused **FAIL 1/4**; after correction focused throughput
  and benchmark **PASS 10/10**, including rejection of malformed numeric
  evidence; TypeScript no-emit **PASS**, scoped ESLint **PASS** and scoped
  `git diff --check` **PASS**. Full final `npm run verify:canonical`
  **PASS**: 130/130 Vitest files, 1478/1478 tests, build, public Guard
  contract, packaging, maintained lint (0 errors, 83 warnings), compact-v2,
  policy/prompts, provenance, tool counts and evidence ledger. Final log:
  `.photoshop-runtime/agent2-turn4-canonical-final.log` (the first green
  intermediate run, 1477/1477, is in `agent2-turn4-canonical.log`).
  No Photoshop mutation, restart, worktree cleanup or commit;
  live ownership and quality/time acceptance remain open.

- 2026-10-10 — Agent 1 fourth run: E.8a benchmark timestamp-integrity fix.
  `scripts/dev/benchmark-painting-cycles.mjs` no longer silently discards
  throughput events whose `at` is absent or invalid when the event could
  belong to the selected operation prefix. Exact run-scoped round-trip,
  rejection, recovery and repair totals become **unknown**; undated events
  with explicitly foreign operation ids remain excluded. The diagnostic
  `undated_potential_events` records how many events lack usable timestamps.
  `tests/benchmark-painting-cycles.test.ts` adds a regression for an undated
  owned rejection, malformed-date unkeyed recovery and provably foreign
  undated event. Red test **FAIL 1/5** before source correction, then focused
  **PASS 5/5**, TypeScript no-emit **PASS**, scoped ESLint **PASS**
  (`no-undef` disabled for the benchmark CLI's pre-existing `console` globals),
  `git diff --check` **PASS**. Full `npm run verify:canonical` **PASS**:
  **130/130 Vitest files, 1476/1476 tests**, server build, public Guard
  contract, packaging, maintained lint (0 errors, 83 warnings), compact-v2,
  policy/prompts, provenance, dependencies, tool counts and evidence ledger.
  Full log: `.photoshop-runtime/agent1-turn4-canonical.log`. Read-only COS
  ping confirmed Photoshop UXP ready and matching bridge; bounded Guard
  recovery returned no active job or visual barrier on document 64. The
  violinist artwork remains open and was not mutated or restarted. E.8a
  real concurrent/interrupted-run validation and quality/time acceptance
  remain open. No commit or worktree cleanup was performed.

- 2026-10-10 — Agent 3 third run: E.8a async job polling attribution.
  `src/core/guard/runtime.ts` now persists the exact reserved operation id in
  durable job metadata before the first poll and records each poll's
  model-visible bookkeeping event against that id. It refuses attribution
  when the reservation and started receipts disagree and never substitutes
  `previous_operation_id` from a continuation. New
  `tests/async-poll-throughput-ownership.test.ts` covers starting/running
  polls, repeated polls, unkeyed legacy jobs and conflicting persisted ids.
  The source fix addresses one real cause of missing run-scoped throughput
  ownership, not all unkeyed error paths or E.8a live acceptance.
  Checks: initial fixture **FAIL 2/2** (test lacked the documented
  `next_pass.document_id` used by `cycleInputDocumentId`); corrected targeted
  tests **PASS 2/2**, four focused suites **116/116 PASS**, TypeScript
  no-emit **PASS**, scoped ESLint **PASS** (0 errors, 23 existing warnings),
  `git diff --check` **PASS**. Full `npm run verify:canonical` **PASS**:
  **130/130 Vitest files, 1475/1475 tests**, server build, public Guard
  contract, packaging, maintained lint (0 errors, 83 warnings), compact-v2,
  policy/prompts, provenance, dependencies, tool counts and evidence ledger.
  COS/Photoshop ping **ready** with matching UXP revision; public recovery
  projection shows no active job or visual debt, but a separate violinist
  artwork remains open. No Photoshop mutation or plugin restart was made.

- 2026-10-10 — Agent 2 third run: corrected unowned throughput-event
  attribution in `scripts/dev/benchmark-painting-cycles.mjs`. Previously the
  operation-prefix benchmark silently counted unkeyed recovery/bookkeeping
  events solely by timestamp, even when another run used the same process
  directory. It now excludes those events from selected-run evidence and
  reports exact round-trip, rejection, recovery and repair totals as **unknown**
  when any unkeyed event occurs within the selected journal window. Explicitly
  keyed events remain available as diagnostics; an unkeyed event outside the
  selected window does not contaminate otherwise complete counters. No event
  provenance or performance gain is invented. `tests/benchmark-painting-cycles.test.ts`
  adds an overlapping-prefix regression and keeps the fully keyed control.
  `docs/PAINTING-ROADMAP.md` retains the remaining E.8a live/event-emission
  work; `docs/roadmap-final-acceptance-matrix.md` records this partial source
  closure and marks its earlier 42-failure snapshot as historical.

  Checks: focused benchmark **4/4 PASS** (previously 3/3); TypeScript no-emit
  **PASS**; scoped script ESLint with `no-undef` disabled **PASS**;
  default direct ESLint invocation **FAIL** on three pre-existing `console`
  `no-undef` errors in the benchmark CLI (the test file is ignored by the
  configured ESLint scope); `git diff --check` **PASS**. Full
  `npm run verify:canonical` **PASS**: **129/129 test files, 1473/1473 tests**,
  build, maintained lint, public contract, packaging, policy/prompt,
  provenance, tool counts and evidence ledger. Full log:
  `.photoshop-runtime/agent2-turn3-canonical.log`. Read-only COS ping confirmed
  Photoshop UXP ready and matching `compact-v2-20261009-component-rebuild`;
  Guard status requested bounded public resume, but that resume call was
  blocked by host safety checks. No restart, mutation, source activation or
  live artistic/latency acceptance was performed. The dirty working tree and
  other agents' edits were preserved; no commit was created.

- 2026-10-10 — Agent 1 third run: `src/core/guard/chat-critic.ts`
  refuses requests for old journal operations excluded from the current
  incarnation-filtered document records. This blocks stale review after numeric
  Photoshop document-id reuse, including final approval. Two regressions in
  `tests/chat-critic-role.test.ts` cover pure requests and SessionStore filtering.
  Critic plus Embedded Guard 116/116 PASS; final Critic 15/15 PASS;
  TypeScript no-emit PASS. No Photoshop mutation or journal rewrite.
  Full `npm run verify:canonical` **PASS**: 129/129 test files, 1472/1472
  tests, build, ESLint (0 errors, 83 warnings), contracts, packaging, policy,
  provenance and evidence checks. Log:
  `.photoshop-runtime/agent1-turn3-canonical.log`. After that gate the source
  implementation revision was advanced to
  `2026-10-10-chat-critic-journal-boundary`; the subsequent server build,
  public Guard contract self-test and Critic 15/15 **PASS**.
  COS ping confirms connected UXP and matching bridge, but the loaded Guard
  remains on the preceding revision. Live pixel/owner acceptance remains open.

- 2026-10-10 — Agent 3, second run: closed the ten remaining compact-contract
  regressions against the current code and safety rules. `src/core/geometry-contract.ts`
  now emits distinct machine-readable `geometry_dependency_missing`,
  `geometry_preflight_insufficient` and `perspective_basis_required` diagnostics
  instead of collapsing all early semantic decisions into
  `geometry_binding_required`; `src/core/guard/cycle-compiler.ts` preserves these
  codes without dispatch. Three new `src/core/geometry-contract.test.ts` cases
  verify independent perspective/binding errors and precise reference/preflight
  diagnostics. `src/core/scene-ownership-plan.ts` adds a narrowly authorized
  temporary-to-independent unit transition; `src/core/guard/session-store.ts`
  permits it only during explicit keep, with unchanged plan id, semantic unit,
  owner, objects and all other declarations. No physical Photoshop layer or
  historical pixels are relabelled. `tests/scene-ownership-plan.test.ts` and
  `tests/compact-contract-regressions.test.ts` cover allowed promotion, rejected
  remaps and durable keep. The compact fixtures now use distinct physical
  component owners; optical blur tests create an actual owner/camera basis,
  provide numeric layer targets and imaging preflight, and retain fail-closed
  premature MATERIAL-blur representation debt. `docs/performance-and-latency.md`
  no longer advertises a retired public field name in the maintained guide.

  Checks: compact baseline **90/100 PASS, 10 FAIL**; final compact **100/100
  PASS**; combined compact/embedded Guard/geometry/scene-ownership **213/213
  PASS**; TypeScript no-emit **PASS**. First complete `npm run verify:canonical`
  had **129/129 test files and 1470/1470 tests PASS**, but overall **FAIL**
  at the stale documentation compact-v2 audit. After correcting that exact
  documentation violation, the **full canonical rerun PASS**: **129/129 files,
  1470/1470 tests**, build, lint, public Guard contract, third-party notices,
  package, compact-v2, painting policy, prompts, source independence, product
  identity, provenance, external intake, tool counts and live-evidence ledger.
  Logs: `.photoshop-runtime/agent3-turn2-baseline.log`,
  `.photoshop-runtime/agent3-turn2-final-focused.log`,
  `.photoshop-runtime/agent3-turn2-canonical.log` (first FAIL),
  `.photoshop-runtime/agent3-turn2-canonical-final.log` (PASS).
  No plugin restart, Photoshop mutation, live-pixel or independent artistic
  acceptance was performed; those remain open in the roadmap.

- 2026-10-10 — Agent 2, second run: hardened fail-closed known-owner repair in
  `src/core/guard/preflight-repair.ts`. A mixed omitted/foreign physical-layer
  target no longer receives automatic owner/region injection; the original
  payload is rejected without dispatch. In `src/core/guard/cycle-compiler.ts`,
  no-progress repair retains its original actionable errors alongside the
  systemic-repeat diagnostic. `tests/compact-contract-regressions.test.ts`
  checks mixed target refusal and declares component ownership for the Art
  Director attention fixture, preserving the simple_graphic safety contract.

  Checks: compact suite before **88/100 PASS, 12 FAIL**, after **90/100 PASS,
  10 FAIL**; targeted owner conflict **1/1 PASS**; `preflight-repair`
  **8/8 PASS**; TypeScript no-emit **PASS**;
  scoped ESLint **0 errors, 7 existing any-type warnings**; `git diff --check`
  **PASS**. Logs: `.photoshop-runtime/agent2-compact-20261010-run2.log`,
  `.photoshop-runtime/agent2-compact-20261010-run2-final.log`,
  `.photoshop-runtime/agent2-preflight-20261010-run2.log`. Remaining ten
  cases are classified in `docs/PAINTING-ROADMAP.md`. Full canonical not rerun;
  no Photoshop mutation, managed-child restart or live artistic acceptance.

- 2026-10-10 — Agent 1, second run: hardened the ChatGPT Critic document-incarnation fallback in `src/core/guard/chat-critic.ts`. The request hash already included a host-witness token when the explicit incarnation field was absent, but prior-checkpoint reuse and persisted findings compared only the missing field. A reused numeric document id with an unchanged brief could inherit stale approval. All checks now use the same resolved stable identity. With no stable incarnation, reuse fails closed. Two new regressions in `tests/chat-critic-role.test.ts` cover a changed witness and unknown identity.

  Verification: `chat-critic-role` + `embedded-guard` **115/115 PASS**; isolated `embedded-guard` **102/102 PASS** without altering its existing assertion; TypeScript no-emit **PASS**; scoped ESLint **PASS**. Logs: `.photoshop-runtime/agent1-turn2-critic-embedded.log`, `.photoshop-runtime/agent1-turn2-embedded-baseline.log`, `.photoshop-runtime/agent1-turn2-typecheck.log`. Separate compact-contract run: **88/100 PASS, 12 FAIL**. Full canonical not rerun; no plugin restart, Photoshop mutation or live artistic acceptance.

- 2026-10-10 — Agent 3: fixed three failing focused machine-gate suites without weakening component ownership or stroke safety. `src/tools/painting-tools.ts` rejects unsupported `batch_mode` at the shared `strokeExecutionBudget` preflight. `tests/mask-and-rejection.test.ts` now separates a valid two-batch partial-write uncertainty from a 15-batch no-dispatch refusal, and checks SINGLE_HISTORY and invalid-mode refusal. `tests/geometry-contract-repair.test.ts` explicitly scopes schematic components; `tests/session-store-regressions.test.ts` declares the independently editable component required for temporary-owner promotion after restart.

  Checks: repaired suites **128/128 PASS**; adjacent painting/throughput suites **36/36 PASS**; `npx tsc --noEmit` **PASS**; scoped source ESLint **PASS**; isolated `uxp-bridge-server` suite **PASS**. Remaining reproduced failures: `compact-contract-regressions` (**32**) and `embedded-guard` (**1**), logged in `.photoshop-runtime/agent3-focused-failures.log`. The prior full canonical run remains **FAIL**; no post-repair full rerun, managed-child restart, Photoshop mutation or artistic acceptance.

- 2026-10-10 — Agent 2: restore four independent machine-gate contracts without touching live Photoshop state. `scripts/dev/generate-tool-backend-inventory.mjs` now discovers `*-catalog.ts` declarations and `tool: helper('photoshop_*', ...)` shapes, reads the actual `photoshop-mcp-server.ts` catalog and classifies `photoshop_geometry_calculate` as pure Node geometry; generated `docs/available-tools.md` now matches the authoritative 132-tool/15-Guard source catalog, current UXP revision and zero pending P1–P3 UXP tools. `tests/uxp-migration-completeness.test.ts` now checks generated rows and A/B/C/D class totals against the public tool total to prevent the silent partial-inventory regression.

  `tests/director-attention-recovery.test.ts` now exercises known/unknown public discovery with the actual runtime `capabilities()` receiver rather than an incomplete prototype stub, retaining no-dispatch and cloned-schema assertions. `src/prompts/templates/digital-painting-control.ts` restores explicit canonical commentary mode boundaries and the one-time open-brief candidate/anti-memory/no-extra-Guard-gate contract; compacted overlapping guidance without weakening the painting-policy invariants. Relevant checks: four suites **20/20 PASS**; `npx tsc --noEmit` **PASS**; source ESLint **0 errors** (initial combined run had 3 ignored-test-file warnings); `npm run verify:painting-policy` **PASS** (prompt 17,991/18,000 characters); `npm run verify:photoshop-prompts` **PASS**; `npm run verify:tool-counts` **PASS** (132 atomic, 15 Guard); `git diff --check` **PASS**. `npm run generate:tool-backend-inventory` is idempotent by SHA-256 and `tests/uxp-migration-completeness.test.ts` **5/5 PASS** after regeneration. The prior full canonical run remains **FAIL** (42 baseline failures, six other suites still awaiting repair/retest); no new full canonical, plugin restart, live Photoshop acceptance or artistic-quality claim.

- 2026-10-10 — Agent 1: prevent cross-incarnation ChatGPT Critic reuse; `implementation_revision=2026-10-10-chat-critic-incarnation`. The prior review lookup keyed its latest checkpoint by original-brief hash alone, so reopening a Photoshop document with a reused numeric id and identical brief could suppress the new scene's early Critic checkpoint. Unresolved findings could also leak from the previous incarnation into the new canvas. Critic requests/reviews now retain document id and stable incarnation, and both checkpoint reuse and finding carry-forward require both identities. Legacy unbound reviews trigger conservative fresh assessment rather than granting approval. No pixel mutation, reviewer promotion or historical state rewrite. Two new regressions exercise id reuse, changed incarnation, old findings and legacy reviews.

  Validation: focused Critic 11/11 PASS; four affected suites 35/35 PASS; TypeScript no-emit and server build PASS; scoped ESLint 0 errors / 2 warnings (one existing any, one ignored test file). Full `npm run verify:canonical` **FAIL** at the broader acceptance suite: 118/128 test files and 1421/1463 tests passed, 10 files / 42 tests failed, including 32 compact-contract tests, stale public prompt assertions, old component-scope fixtures, generated inventory count and UXP receipt race. None of those failures is in the changed Critic tests; attribution to previous changes is not established by this run. Full log: `.photoshop-runtime/agent1-canonical-20261010.log`. Do not claim a green canonical gate, release readiness, live activation or artistic acceptance.

- 2026-10-10 — ChatGPT Critic role; `implementation_revision=2026-10-10-chat-critic-role`. UXP stays `compact-v2-20261009-component-rebuild`.

  Ordinary same-chat image review now explicitly switches Painter → Critic → Painter at bounded nontrivial-painting checkpoints: first three completed visual passes, stage changes, six additional passes and final review. Critic assesses the whole exact scene against original_brief through five existing visual criteria and bounded visible/construction findings. previous_observation.critic_review travels in the same cycle_auto continuation; no extra evaluation endpoint, image recapture or automatic local-model inference. Public schema, inline/explicit delivery, response-budget guidance, durable verdicts, final retained-frame review and continuation/status agree on the contract. Reports bind to operation/frame/brief/stable document incarnation; omitted checkpoints return a complete minimal template using the delivered image.

  Findings survive local target success and nonvisual exports; unknown rereview preserves unresolved findings. Only the corresponding explicit pass clears them. Final completion cannot override Critic fail/unknown. Optional host-side Core agents handoff supplies actual spawn/message guidance with exact image paths and report binding, status/reuse before spawn and saved model defaults. The parent appends its original brief only when delegating, avoiding duplicate brief text at routine checkpoints. This plugin does not invoke spawn or invent host availability/worker reports. Same-chat role and reported delegation are distinguished from calibrated independent Critic authority; the existing registry and E.8 human acceptance remain separate.

  Updated canonical Roadmap, artistic-evaluator docs, AGENTS, host guidance and painting prompt. Compacted repeated prompt/kernel policy while preserving required operational invariants and existing limits: kernel 12,984 characters; prompt 17,977 characters. Restored the pre-existing missing sticky-route metadata on cycle/status/resume; the host-visible route coverage check now passes. The retired automatic LM Studio evaluator remains retired.

  Verification: 43 distinct focused offline cases PASS across targeted runs (nine new Critic, five evaluator-retirement, 13 chat-economy, 16 executable-form/completion controls). Policy consistency/compactness, Photoshop prompt/route coverage, in-place TypeScript build and built public-schema/revision/default checks PASS; scoped ESLint 0 errors / 16 any-type warnings. Package/import check PASS (182 dist JS files). No Photoshop action/launch, live model request, real spawn, plugin restart or interruption of the running Painter. Source checks do not certify artistic improvement; activate through user-run CoS Plugins Restart after the current run.

- 2026-10-10 — Bounded painting continuation; `implementation_revision=2026-10-10-bounded-continuation`. UXP stays `compact-v2-20261009-component-rebuild`.

  Explicit document resume now scopes Director/history/job projection and not-executed journal cleanup to that document, so an older painting cannot supply its next action. Optional lint accepts previous_operation_id + previous_observation with next_pass and validates the complete continuation without recording a verdict or dispatching; the same payload then executes once through cycle_auto. Malformed first construction reports available independent proportion/material/scene/binding prerequisites together instead of hiding them behind the first model error. No geometry or artistic choices are invented.

  Exact tool discovery supplies discovery_revision and optional if_revision compact unchanged receipts. Unknown stacking aliases explicitly report the absent existing-layer reorder capability and return the actual create_layer placement contract (above_layer_id/below_layer_id); pixel translation is no longer offered as a stacking substitute. Existing artwork is not recreated. Guidance caches setup schemas/brush evidence, batches missing contracts, treats lint as optional and combines exact-image assessment with the next action.

  Repeated delivery of an exact image already delivered for the same operation in a host-proven chat reuses the delivery receipt without claiming visual observation. Forced delivery requires a real images-unavailable|delivery-failed reason and is bounded per exact operation/frame/roles/chat; persistent absence becomes an actionable client blocker. New/unknown chats still need actual image delivery; accepted observations remain required for cross-operation reuse and partial failures retain retryability.

  Later-run audit found false brush_role_material_fitness_mismatch: free-text working_scale was compared literally with medium/global. Prose is now descriptive; exact legacy scale tokens still restrict selection. Optional typed allowed_scales survives public schema, durable preflight and compiler projection, rejecting invalid values. Material, intent, preset, pressure and actual method checks remain enforced. Other observed refusals (changed ownership/geometry bindings, unresolved primitive form, mismatched construction intent/method and missing previous review) remain genuine repair obligations.

  Verification: 38/38 focused offline cases PASS; TypeScript no-emit and in-place build PASS; scoped ESLint 0 errors / 45 any-type warnings. Built public-schema/revision and package/import checks are recorded in the timing report. No Photoshop dispatch/launch, live acceptance, plugin restart or interruption of the running Painter. Source tests do not establish artistic improvement or numeric latency gains. Activate this source revision with CoS Plugins Restart after the current run; this slice changes no UXP code.


- 2026-10-09 — Violinist-run fixes; `implementation_revision=2026-10-09-executable-form-contract`, UXP `compact-v2-20261009-component-rebuild`.

  Fresh nontrivial compound owners now require executable shared construction with chosen dimension/ratio checks or IK lengths. Added category-independent bounded `proportion_checks` and fixed intrinsic `rigid` objects with shared pose and explicit reshape authorization. Pure solve remains optional/read-only; manual model-bound pose transforms, direct compatibility bypasses and stale-part refinement are refused. Changed/unbuilt component debt survives save/closure. Existing components rebuild with explicit REPLACE on one pinned nonbackground raster layer: clear old silhouette then repaint in one history transaction, rolling back on failure. Legacy paintings are retained and require explicit migration/rebuild.

  Reference-free painterly passes accept an explicitly authored ellipsoid/light-field, orientation, light direction and distinct chosen shadow/light colors. This analytic target feeds the existing bounded brush planner and clipping/native budget; provenance distinguishes it from a real JPEG reference and never invents reference paths or anatomical proof. Guidance requires separate wall/opening/frame/curtain owners, early scene/light masses and structure correction before accents.

  Fixed document-wide artistic debt after nonvisual PSD/JPEG saves: closure stays active/continue_required instead of silently stopping unresolved form/light/contact work. The nonvisual stall watchdog also covers unfinished paintings without a Director. Added exact command sets, batches of up to eight tool contracts, actionable unknown-name alternatives, technical-contract classifications, and local nested-microplan final-preview/unique-owner transform-pin repair without overriding explicit conflicts. Public guidance still forbids source reads by the Painter and preserves exact-image review/recovery. Focused offline verification only; no plugin activation, Photoshop launch/drawing or independent artistic acceptance.

  Fresh enforced art runs finish only after the existing exact whole-frame review supplies painting_completion against original_brief (brief_fidelity, form_proportions, light_material, composition_context, editable_parts, contact_and_protection: pass|fail|unknown). Guard binds that assessment to the frame SHA and original brief; all criteria must pass and other debts must be closed. Saves preserve it, later pixels/brief invalidate it. This is Painter self-assessment, not independent quality certification; explicit user pause/stop remains valid. No extra review call or compulsory painting when only final review metadata is missing.


  Final verification: 55/55 focused offline cases PASS (16 new executable-form/completion cases + 39 existing construction/painterly/repair controls); final TypeScript build, built public-schema/revision check, native JS parse, notices and package/import checks PASS. Scoped ESLint: 0 errors, 57 any-type warnings. The separate fresh MCP initialization audit timed out and is not claimed as passed; no Photoshop mutation/launch or plugin restart was performed. Source checks do not establish native rendering quality or wall-time gains.


- 2026-10-09 — Integrated IK.ts (`ikts@1.3.7`, source 40b7e2859082f08df88655160ad18fa22b72d02e) in the existing general construction lane; `implementation_revision=2026-10-09-ik-construction`. Optional `model.ik_chains` solves explicit object-local 2D/3D contact targets with authored bone lengths, fixed/shared parent roots and interior bend limits. Connected chains are ordered by dependencies. General constraints cannot stretch or move solved joints; independent format failures, unreachable reach intervals, numerical/limit failures and relation conflicts reject before painting. Relative part contours, per-component ownership, durable revisions/rebuild debt, projection and ordinary exact-image review remain. Bounds: eight chains, 16 bones each, 64 iterations; no new MCP endpoint or model service.

  Public schema/capabilities, host initialize guidance, painting prompt template and agent rules now connect reach/contact/pose objectives to the construction path, and continuous contours/aligned-reference refinement to existing contour/painterly paths. Added exact version/revision, license and retained IK.ts → Fullik → Caliko → FABRIK lineage to the third-party registry and packaged notices. Nine focused IK checks and 21 construction regressions PASS; TypeScript, scoped ESLint, notice/version/package gates plus four rejection self-tests, and built revision/host-guidance verification PASS. Live painting, activation and independent artistic acceptance remain user-run.


- 2026-10-09 — Integrated Bezier.js 6.1.4 and Clipper2 via clipper2-ts 2.0.1-18 in the existing embedded Guard route (`implementation_revision=2026-10-09-clipper-bezier`). Smooth construction retains its authored Catmull-Rom shape with adaptive cubic subdivision at 0.25-pixel tolerance / 256-point cap; failure is actionable rather than silently reducing precision. Painterly planning uses polygon normalization, union/subtraction of explicit `clip_exclusions`, and brush-center insets retaining holes/disconnected islands; existing conservative distance checks, component ownership, executor budgets and exact native-pixel review remain. No new MCP tool, source-reading requirement or inference/review service. Renderer changes invalidate changed smooth target hashes without rewriting retained pixels.

  Added THIRD_PARTY_NOTICES.md, a version/evidence/usage registry and retained license/copyright texts for all four direct production dependencies, with separate original Clipper2/TypeScript-port attribution and Hertzmann algorithm inspiration. Bezier.js's missing standalone license file is stated explicitly; preserved upstream declarations accompany standard MIT text. Existing JPEG decoder Apache and encoder BSD notices are also retained. Added a narrow drift/package-inclusion gate to publish/canonical checks and MCPB build; npm allowlist/MCPB staging ship notices/licenses, and MCPB resolves the recorded dependency versions. Geometry/construction/painterly/component checks: 47/47 PASS; TypeScript, scoped ESLint, MCPB-script typecheck, notice gate plus four rejection self-tests, and pack integrity PASS. Live painting, artistic acceptance and plugin activation remain user-run.


- 2026-10-09 — Bounded Hertzmann-inspired painterly refinement through the existing Guard/BRUSH lane. next_pass.painterly consumes an aligned materialized JPEG reference and explicit canvas placement plus one existing component's clip polygon or current construction part. It derives the authoritative completed whole-frame BEFORE and pinned physical owner internally, computes an omitted reference SHA, and rejects explicit changed bytes, conflicting owners, stale construction references and mixed authored actions. No new MCP endpoint, neural model, daemon or alternate dispatch path.

  Original adaptation of the SIGGRAPH 1998 method: masked three-box Gaussian approximation, residual-grid seeds, Sobel-gradient tangents with direction/curvature continuity, coarse-to-fine marks, reproducible per-scale ordering and a circular planning surrogate. The actual native stroke budget trims oversized packages while retaining candidate debt. A trimmed surrogate after-error is not reported as the executed package's estimate. Direction-smoothed polylines replace the original B-spline renderer; nominal round footprints are conservatively contained, but native soft/stamp fringes are not certified as polygon-clipped. Actual preview/observation remains required and the next pass replans rather than replaying old generated strokes. The ordinary artistic review exposes compact reference/owner/count metadata with pixel/artistic verification false.

  Ten focused new offline cases and 31 relevant construction/component controls PASS (41 total), including the real native public schema/budget, concave swept footprints, source/canvas registration, SHA/format failures, current-document frame authority and actual Guard compilation without Photoshop dispatch. TypeScript, scoped ESLint and server build PASS. Implementation revision is 2026-10-09-hertzmann-strokes; UXP remains compact-v2-20261009-mask-preservation. Canonical Roadmap, Changelog, AGENTS and public docs updated in the project. Seven full pre-edit files were SHA-verified in current chat work/hertzmann-baseline. No native painting, restart or artistic-quality claim; E.7e/E.18 user-run acceptance is open.

- 2026-10-09 — E.7d general object construction, independent of object category. Added one bounded landmark/constraint solver for distance, ratio, coincidence, parallel/perpendicular directions, angles, midpoints and symmetry. Explicit initial positions, fixed anchors, relative/axis-bound contour controls, object poses/scales and a shared orthographic/perspective camera produce coherent projected component contours. No animal/instrument/machine name selects an algorithm; subject_kind affects editable ownership only. Shapes remain freely supplied outlines, with optional smooth interpolation.

  next_pass.construction generates one selected component through the existing compiler/controller lane, including distinct ownership, layer creation or exact existing-owner binding and chosen RGB color. Completed dispatched current-document models persist with the operation and are reused by id/revision; stale/conflicting revisions, foreign/retired/failed models, mixed raw actions and owner substitutions are rejected. Optional pure solving uses the existing guard_status construction_model mode, with no Photoshop call, persistence or new MCP endpoint. construction_ref reports unconstructed parts and earlier targets requiring rebuild after a model revision. The normal exact-image review exposes the compiled target and bounded projected landmarks; numerical success never claims pixel or artistic proof. No automatic redraw or disassembly of historical pixels occurs.

  Format and unsolved relation errors are returned together before dispatch. The solver is bounded (48 iterations, 32 movable landmarks, 128 total points/relations, 64 parts, 16 objects); failed convergence is not asserted to prove mathematical impossibility. Proportion/reference choices and camera/style coherence remain artistic inputs. This release does not add semantic reference extraction, surface rendering, collision solving or ARAP deformation.

  Twenty-one focused new checks plus the existing component-scope and technical-closure controls PASS (52 total). Examples cover an animal, a crane and a violin with a second subject through the same code, including actual ratio/angle/depth calculations, attached contours, public pure status, one-component compiler output, revision debt and document/layer ownership. TypeScript, scoped ESLint and server build PASS. Latest implementation revision is 2026-10-09-object-construction; UXP remains compact-v2-20261009-mask-preservation. Public contract, AGENTS, canonical Roadmap and this Changelog updated in the project. Full pre-edit existing-file copies were SHA-verified at current chat work/object-construction-baseline. No live painting, app/plugin restart or current scene mutation; activation, actual pixel/layer fidelity and artistic quality remain user-run acceptance.

- 2026-10-09 — Guard recovery for an untouched Photoshop document after UXP reconnect. The existing documented recovery path required a saved `current_frame` SHA even when no visual pass had ever run. That left a user-confirmed, still-open new `Untitled-1` permanently quarantined after brush-only setup. Added a deliberately narrow `pristine_bootstrap` recovery: no saved/accepted frames, no visual journal activity, no semantic owners, fresh exact new-document history, one verified Background layer and matching document identity across two UXP probes and repeat history. All other cases keep the saved-frame SHA/owner verification or fail closed. Existing run and pixels are never reset or replayed. Targeted recovery suite 21/21 PASS; TypeScript check, server build and MCP published-catalog acceptance PASS. Photoshop MCP child still needs a plugin-only restart to load the build; live painting was not performed.

- 2026-10-09 — E.17/E.24 remove the reproduced document-create → brush-select report round trip. The frozen painter continuation omitted previous_operation_id, so the old built compiler rejected it with “emit real assistant prose, then record it with report” despite a completed dispatched document creation and its durable execution receipt. Earlier compact closure handled only an explicitly repeated id.

  Public next_pass/painting_intent continuation now inherits exactly one outstanding confirmed nonvisual operation. Its completed durable receipt must match the operation identity, protocol and execution outcome; failed/error/uncertain/partial/undispatched, visual and invalid-receipt records are excluded. Multiple obligations are never guessed, and the blocker names the public compact closure call with an explicit id. Authored ids/observations, close-only requests and internal state-only revalidation are not replaced. The compiler remains read-only; the existing controller closure lane writes the technical report and exact receipt acknowledgement. It never supplies a visual verdict or declares the artistic task complete.

  Twenty-one focused offline checks PASS, including the saved brush request, ack-only debt, ambiguous debts and unchanged visual-review debt. The previous build reproduced the exact refusal; the rebuilt compiler accepts the saved continuation with the correct inherited id. TypeScript no-emit, scoped ESLint and server build PASS. Latest implementation revision is 2026-10-09-nonvisual-closure; UXP stays compact-v2-20261009-mask-preservation. Canonical Roadmap/Changelog and painting guidance updated in the project. Byte-verified baseline: current chat work/nonvisual-closure-baseline. No live painting, plugin/app restart, current-scene mutation or broad audit was performed. User-run timing and activation acceptance remain open.

- 2026-10-09 — Close the simple_graphic component-ownership bypass. The current dragon/woman run switched to simple_graphic before its first visual pass and committed one woman-whole unit (body costume and hair) on layer 2. Component declarations were gated only by nontrivial_painting. Offline replay of the exact saved 25 KB request against the previous built compiler produced no violations; the corrected compiler rejects it with field-level component guidance in simple_graphic, nontrivial_painting and an unset profile before dispatch.

  Semantic layer creation now requires ownership/component metadata independent of rendering profile, including initial block-in; substantial temporary subjects receive the same check. Public objects require subject_kind: person/animal/furniture/window/plant/custom-compound must be compound objects with independently owned parts. Whole complex subjects cannot claim single-part for those types; single-component denotes a real part and continuous-field must use continuous-field editability. Existing compound unique-owner/physical-layer checks remain. Keep/promotion also validates subject scope, so temporary construction is not a commitment bypass. Missing scope is an explicit artistic decision with allowed values and visible-part examples, never a guessed automatic split or a request to read source.

  Historical plans remain readable. An unknown subject scope may be classified additively once; declared scope and existing ownership bindings cannot be relabelled/remapped. Existing monolithic pixels are not automatically extracted, rewritten or falsely certified as separate. Twenty-four targeted ownership/recovery checks PASS, including an accepted face-only pass with separately planned hair/garment owners, actual shared-layer rejection and promotion rejection. TypeScript no-emit, scoped ESLint and server build PASS. Implementation revision is 2026-10-09-component-scope and includes the preceding chat-economy fixes; UXP remains compact-v2-20261009-mask-preservation. No live painting, plugin restart, current-scene change or broad audit was performed. Canonical Roadmap/Changelog updated in the project; byte-verified pre-edit snapshots are in the current chat work/component-scope-baseline.

- 2026-10-09 — Chat-space economy for routine Guard results and exact review images. Completed healthy cycle/poll responses archive compatibility receipts/reports/acknowledgements, successful compiler-repair journals and routine latency instead of repeating them in chat. Full responses retain a diagnostic archive path and SHA; execution, exact targets, save/export result, next action, errors, uncertainty and deferred passes stay public. An unavailable archive preserves the original response. A replay of 101 saved text results reduced cycle_auto text bytes by 8.8% (548,669 → 500,493) and job_poll by 17.5% (200,770 → 165,579). These are offline serialized-text measurements, not model tokens or live latency.

  Review delivery uses a bounded optional per-runtime cache, host-proven conversation metadata, current document incarnation, verified file bytes/SHA and an already accepted exact-image verdict. Confirmed identical images and an already reviewed original brief are referenced in the same chat; equal BEFORE/AFTER bytes share one inline block. Fresh AFTER/crops are still delivered. A new/unknown chat, restart, quarantined document identity, changed bytes, unobserved image or wrong verdict cannot inherit image proof. Missing crops remain review debt. Public review_image(force_redelivery=true) sends the complete required image set and original brief again. CoS source now forwards its existing caller conversation identity through MCP metadata without changing model-authored arguments; cross-call reuse requires that host update. Without it, Guard keeps full image delivery across calls.

  Source implementation revision is 2026-10-09-chat-economy; the UXP companion remains compact-v2-20261009-mask-preservation from the previous mask fix. Twenty-seven targeted PaintPilot checks and three CoS metadata-forwarding cases PASS; PaintPilot TypeScript build/scoped ESLint and an isolated CoS production build PASS. CoS full typecheck remains blocked by four existing implicit-any errors in unchanged test/session.test.ts. Canonical Roadmap/Changelog updated in the project. No application/plugin restart, live painting or existing-chat compaction was performed; this reduces future growth after activation, not old stored history.

- 2026-10-09 — Real owner-recovery payload and actionable status compaction. The newly loaded terminal-recovery revision removed the false busy gate, but the cabin still failed document_identity_owner_mismatch with all five retained layers present. Fresh CoS evidence shows the canonical photoshop_get_layers result uses details.layers; identity recovery only parsed layers/data.layers, so its observed id set was empty. The recovery fixture now uses the real atomic envelope and reproduced the failure before the fix. Recovery parses that envelope plus legacy forms/nested rows; accepts only finite positive native-number physical ids and rejects foreign document contexts, actual missing owners, malformed ids and failed reads. A specific public error includes owner_identity_comparison with observed ids and missing bindings, with mutation/replay disabled. Fresh exact saved-frame bytes and stable before/after document witness checks remain required; no forced rebind, historical owner changes or journal repair was used.

  Status compaction also reproduced two defects: ready documents were selected by numeric history order (59 instead of the current 2942), and an oversized owner binding discarded actionable recovery details. Selection now prioritizes the authoritative resume/job/unresolved blocker and otherwise the readiness document. The public fallback preserves the first exact blocker/count, next public recovery call and no-replay flag; full data remains archived diagnostically. Original state/owner bindings are unchanged. Four status cases, six owner/pixel/error cases and eight gradient cases PASS in the narrow 18-case run; a separate replay of the frozen real six-layer cabin result and all five durable owners also PASS (19 targeted checks total). the complete status-budget file also passed 10/10 earlier. TypeScript no-emit/server build, native JS syntax and scoped source ESLint PASS. Live cabin recovery and artistic continuation remain unverified until activation; no Photoshop mutation/restart was performed.

- 2026-10-09 — E.6 native gradient-mask preservation slice. Inspection of the recorded temple-owner destruction found that the tool lost layer_id, selected an ordinal channel rather than the mask explicitly, and auto-created a selection-derived mask that could hide retained content outside an active selection. The pinned id is now public and forwarded through the bridge. Native gradient dispatch reuses existing owner/mask validation and reveal-all creation, refuses mismatched/disabled masks, restores the original channels and commits or aborts one Photoshop history unit. Failed descriptor results do not report success. The existing Photoshop grayscale polarity remains unchanged (100 percent black to 0); transition percentages remain absolute canvas-axis endpoints, not a local clipping rectangle. Public guidance directs local carving to bounded black BRUSH mask strokes and states that an unselected gradient affects the whole owner. Disposable owner staging and actual native pixel/selection acceptance remain open E.6 gates.

  Seven offline native descriptor/failure cases plus the atomic pinned-forwarding case PASS. Implementation revision is 2026-10-09-recovery-owner-mask; matching companion revision is compact-v2-20261009-mask-preservation. Activation requires both the managed MCP child and the UXP companion update; neither was restarted here. Baseline copies of changed existing files are byte-verified in the current chat work/roadmap-priority-baseline before edits. Canonical Roadmap/Changelog are updated in the project on 2026-10-09.


- 2026-10-09 — False document_identity_recovery_busy after terminal abandonment. The painter's 10:16–10:18 journal showed no active jobs/uncertain work in public diagnostics while same_document_confirmed=true was repeatedly rejected. Read-only inspection identified exactly three historical operations (cat-rabbit-soft-dominance-repair-20261003-01, still-life-clean-masses-03, wuxia-run03-road-edge-eraser-probe): each retains phase=uncertain but already has authoritative resolved.outcome=abandoned. Identity recovery's raw phase predicate incorrectly resurrected them as global pending work.

  Added a shared pending-work predicate used by the identity gate and both status projections. Abandoned lifecycle closure excludes those historical records without changing phase, execution evidence, job/history files or pixels. Durable pre-dispatch proof remains usable only without positive mutation evidence; genuine unresolved work, malformed resolution claims and global active jobs still block. Status/full resume and bounded recovery/ownership projections expose identity_recovery_blockers with exact operation/job/document ids. Busy rejections now use the specific code and provide a next_public_call for poll or fresh reconcile evidence, with mutation_replay_permitted=false. Identity-unverified resume chooses that recovery call before requesting confirmation and keeps top/document guidance consistent. Existing fresh exact-frame SHA, document witness, owner-id and mismatch quarantine checks remain intact.

  Frozen the three actual terminal records' recovery metadata in an offline fixture. The positive replay failed before the source fix and passed afterward; byte checks prove the old operation records remain unchanged. Eight focused checks PASS: six terminal/blocker/public-diagnostic/proof cases plus two existing pixel/owner mismatch controls. TypeScript no-emit and server build PASS; scoped ESLint 0 errors. Implementation revision is 2026-10-09-identity-recovery-terminal. Canonical roadmap and changelog updated in the project. No runtime journal rewrite, document rebinding, Photoshop mutation, live acceptance, plugin restart or foreground action was performed by this source change; user-run activation and fresh-state acceptance remain open.

- 2026-10-09 — Director/attention contract repair and Plugins exposure. The frozen cabin request and logs showed five serial Director rejections, opaque attention_binding and leaked causal metadata; the later 09:35:46 request returned PLUGIN_NOT_EXPOSED without reaching the plugin. Guard-required tools/list now publishes safe reads plus Guard endpoints in continuation/recovery priority order, while blocked raw mutations remain registered internally. Duplicate next_pass schemas in read-only status/lint refer to the complete cycle_auto contract; Director descriptions are compacted without removing fields. Offline catalog shrank from 132 tools / 247,293 bytes to 38 tools / 106,593 bytes. Host exposure after reload is still user-run acceptance, not a verified live result.

  Attention binding uses one shared full schema. Only missing identity and consumed dimensions are derived from the unique owner zone already authorized by the active task and the executable pass effects. Explicit foreign/stale bindings and task-zone conflicts remain rejected; independent shape/authorization issues are returned together with available ids and revision. Causal strategy/family/escalation stays on the Guard operation envelope rather than unsupported executor args. Director preflight collects schema/conditional observed-check requirements and independent composition, hierarchy/task-zone, evaluation revision and evidence failures before state mutation. Authoritative state/evidence checks still run at commit. Public director_fields expands bounded retrieval and returns schema-compatible templates without runtime stamps/null optional defaults; hard brief items/recognition targets and evidence identities are preserved. The public Director schema now declares the mandatory hierarchy and supported brief items. Valid pending first reviews remain legal and create no observed evidence.

  A reproduced bounded black-brush ERASE on an existing owner's mask no longer requires an unrelated atmospheric construction role. The exception requires matching pinned layer ids, valid explicit region bounds and black BRUSH mask strokes only; ordinary pixel paint, mismatched targets, ADD, nonblack strokes or absent bounds retain the construction requirement. Owner/mask/selection/history/evidence admission remains unchanged. Painter guidance honors explicit brush requests through Guard, keeps progress narration short, stops host-exposure investigation at the concrete blocker, and develops form/light/contact/edge structure before decorative accents. Hidden atomic commands retain an exact public argument contract via photoshop_guard_capabilities(tool_name=...), returning one schema without executing the command or reading source; mutation bypass stays refused. Added implementation_revision=2026-10-09-director-attention-contract for cheap activation verification.

  Minimal offline verification: nine new focused regressions plus five saved geometry-repair cases, one actual compiler/executor attention-and-metadata case, two existing Planner default/contract cases and one positive mask-target/source-preservation proof case: **18/18 PASS**. TypeScript build PASS; scoped ESLint reports no errors. No Photoshop drawing, managed-child restart, browser/foreground control or live acceptance was performed. The newest observed painter journal ended at 09:38:32 after exposure rejection and a rejected lint, without a new painting pass. Previous public-recovery code was demonstrably loaded; this newer build still needs user activation. Canonical roadmap and this changelog are saved in the project with 2026-10-09 dates.

- 2026-10-09 — Cabin-run execution/recovery and editable component fixes. Expanded stroke cost is checked before dispatch (including SINGLE_HISTORY); one call/pass admits at most eight conservative AUTO batches, retains dynamics, reports original-stroke split guidance, and reserves 12 seconds for preview/closure. This is a conservative source budget, not a measured live throughput guarantee. Per-batch deadline checks stop further dispatch before consuming that reserve; uncertain earlier batches remain non-replayable. Partial mutation failure and subsequent preview/deadline failure are exposed separately, and completed async processes with uncertain operations no longer return successful continuation. Oversized status never instructs the Painter to read runtime/source files: bounded public resume recovery/ownership subsets and reconcile capture_evidence collect/close fresh same-document state plus a materialized inline image internally. Exact image SHA and current document witness are checked; capture itself neither classifies execution nor clears the original barrier. Owner-specific requests keep full bindings; unactionably large public context remains a concrete blocker. Missing unambiguous region targets are repaired before adaptive budget splitting, including the deferred suffix; explicit foreign targets remain rejected. Durable scene ownership accepts additive units/objects only, retains existing bindings and selects the newest surviving plan; temporary promotion uses the same rule. Copy export is nonvisual and avoids a new artistic preview/verdict while retaining normal file/operation closure.

  New committed nontrivial owners must declare scene_ownership_plan.objects with single-part or compound-object classification. Compound objects are virtual containers whose components each have an independent unique semantic owner and physical layer; shared-owner flattening, duplicate physical bindings and migration onto sibling component layers are rejected. The public schema and Painter guidance specify one component/pass with exact intermediate pixel review, preserving normal occlusion/construction bindings. Examples: bed frame/mattress/blanket/pillows, window frame/glass/curtains, separately editable animal body/head/ears/eyes. Tiny inseparable accents stay together. The contract cannot infer undeclared parts from pixels or unflatten existing paintings: honest semantic classification and human visual acceptance remain required. Legacy owners can continue; new committed owners require an additive component declaration. Minimal offline validation: six affected suites **46/46 PASS** plus two focused existing owner-create/continuation cases **2/2 PASS**, including the saved geometry rejection's corrected request, expanded 76-stroke/912-segment/228-batch rejection, additive plan rollback selection, public evidence capture and partial-job classification. TypeScript build PASS; scoped ESLint 0 errors / 28 pre-existing warnings. Narrow diff whitespace check PASS. No managed-child restart, live Photoshop check or painting mutation was launched. User-run activation, actual layer separation/intermediate images, recovery and timing acceptance remain open.

- 2026-10-09 — First-paint geometry contract repair after the cabin run spent repeated model turns on never-dispatched preflight failures. Public Guard geometry schemas now expose horizon/point/evidence, families, support planes, anchors, control sections, constraints and exact-evidence fields through the same compact contract used for all-field checking. The compiler fills only omitted, uniquely established owner/model/revision and pinned source document identities and records repair provenance; explicit values are preserved for ordinary conflict/staleness validation. Before constructing an operation, it collects independent shape/reference errors together, including conditional support-contact/family requirements, and returns field paths, allowed values/ids and an explicitly incomplete correction template. Technical format errors use CONTRACT_CORRECTION rather than a blanket artistic-decision classification. No coordinate, support, projection, relation or evidence is synthesized. Consecutive technical geometry rejections for the same problem, even with different request keys/fingerprints, return a systemic stop-and-report blocker; a valid correction remains admissible. No spurious missing-cycle error is added when an existing next_pass fails geometry validation. The real first cabin request is frozen in tests/fixtures/cabin-first-geometry-rejection.json: one diagnostic covers its horizon, evidence, plane roles and missing binding, and explicit artistic corrections pass offline compilation with automatic technical identities. Minimal validation: geometry-contract repair plus existing preflight repair suites **12/12 PASS** (~3 s), TypeScript build PASS, scoped ESLint **0 errors / 4 existing warnings**, and narrow whitespace check PASS. The rebuilt child is not restarted and no live Photoshop check or mutation is run. Roadmap records the remaining user-run activation/first-frame acceptance.

- 2026-10-09 — Four last-painter-run follow-ups, source/offline only. UXP session changes now preserve and quarantine durable art-run/frame/Director/owner/history state rather than certify document reincarnation; same-session document-object replacement still resets stale authority. Public `photoshop_guard_resume(same_document_confirmed=true)` requires user confirmation and fresh exact preview/owner evidence, keeps the logical incarnation stable on verified rebind, and rejects changed/missing evidence or uncertain/running work without replay. The value analyzer reads the exact delivered frame, writes grayscale plus low-frequency files automatically, registers its own completed Guard evidence and returns the real id/SHA/Director fields; source alteration/overwrite and stale frames fail. Read evidence records retain metadata rather than duplicate image base64. `resume(director_fields)` exposes saved style/conflict/strategy/assessment without importing SessionStore; Director updates return a small acknowledgement instead of the full document journal. The narrow E.7b preparation + one mask/stroke/Gaussian-filter path accounts for history-writing preparation (including explicit zero counts), stops after preparation failure, retains imaging/owner checks, remaps verified Smart Object ids, and keeps missing/partial history unproven. Mixed-owner/mixed-method expansion remains deferred. Staged `processes/e7e-wuxia-road-form-process/run-01`: SHA-verified v2 BEFORE PNG/PSD, separate working PSD, unchanged original brief, 15-minute/six-pass road/contact/reed-bank construction experiment and explicit acceptance/failure criteria. It is prepared, not run; no image-quality gain, live restart, Photoshop mutation or live acceptance is claimed. Local validation: six affected suites **331/331 PASS**, TypeScript no-emit and direct `tsc` build PASS, scoped ESLint **0 errors / 29 warnings**, and diff whitespace check PASS. Corrected the old direct-blur fixture to supply the explicit target and imaging authority already required by admission; no safety gate was weakened. Build used no dist cleanup and no plugin restart. Roadmap now points to remaining user-run acceptance instead of repeating closed source work.

- 2026-10-08 — Roadmap actualization after the E.25/E.18/AUD-08 source-hardening series. Consolidated the completed source-side work out of `docs/PAINTING-ROADMAP.md` so the roadmap again contains forward actions rather than implementation history. The retired roadmap details are already backed by the accumulated 2026-10-07/08 entries and current regression coverage: canonical cubic fidelity; strict 0–2 px tolerance; physical-layer identity/source-bound checks; ordered transform arithmetic; finite numeric validation for transforms/canvas/paint payloads; mixed-operation and multi-layer provenance refusal; stroke/dab/stamp footprint and module/grid topology/envelope validation; all-or-nothing validation before mutation; connected-owner affine propagation with crop→canvas projection and malformed-parent refusal; E.18 scene/canvas invalidation hardening; AUD-08 durable-owner target repair; and Embedded Guard regression reconciliation. The active roadmap now starts at the real remaining boundary: restart the rebuilt managed Plugins child, then execute live constrained-geometry, ordered scale→move, connected-object and generated-geometry pixel acceptance. No implementation or acceptance claim was added by this documentation cleanup; unrelated dirty-tree changes were left untouched.

- 2026-10-08 — E.25 restored-transform tolerance integrity. Read the current AGENTS.md, roadmap, changelog and dirty git status/diff; verified COS → Plugins → UXP `photoshop_ping` (ready, matching `compact-v2-20261005-curve-fidelity`, no active document) and Guard status (no active jobs, locks or pending visual verdicts). Reproduced a red-before-fix live-preflight false acceptance: a restored `validated-landmark-transform` receipt with `tolerance_px=1000` accepted a physically displaced active layer even though the exact dispatch validator permits only 0–2 px. `observedLayerBoundsIssue` now independently refuses negative, nonfinite or greater-than-2-pixel persisted tolerances before comparing source bounds, preserving pinned-layer identity checks. Added a regression for 2.01/1000/Infinity/NaN with a matching physical layer id and displaced bounds. Focused executable-geometry/Geometry Binding/scene-model suites **48/48 PASS**, TypeScript `--noEmit` PASS, scoped ESLint PASS and `npm run build:server` PASS. Updated the forward live gate and acceptance matrix without claiming Photoshop pixel acceptance. The managed child still requires a verified restart to activate the rebuild; no Photoshop document was modified and unrelated dirty changes were preserved.

- 2026-10-08 — E.24/E.17 embedded Guard regression maintenance. Read current AGENTS.md, roadmap, changelog and dirty Git status/diff; verified COS → Plugins → UXP readiness (`ready=true`, matching bridge revisions, no documents) and Guard status (no active jobs/locks/verdicts). Reproduced **94/101** embedded-Guard failures, then reconciled seven stale expectations without weakening admission: exact commentary sidecars, bounded status/full projection, legal block-in brush inference, optional artistic commentary, method-hint validation, language-matched recovery, and the compact cycle description (source now says one pass is not an entire stage). Embedded Guard **101/101 PASS**, response-budget **2/2 PASS**, TypeScript no-emit PASS, scoped ESLint 0 errors (one existing warning), server build PASS. Source, tests and docs saved in the dirty tree; E.25 live pixel/owner/scale→move acceptance still requires managed Plugins child reload. No Photoshop pixels changed.

- 2026-10-08 — E.25 bounded executable-geometry raster tolerance. Began with the current AGENTS.md, roadmap, changelog and dirty Git status/diff; verified COS → Plugins → UXP `photoshop_ping` (`ready=true`, matching `compact-v2-20261005-curve-fidelity` revisions, zero open documents) and `photoshop_guard_status` (no active jobs, locks or pending visual verdicts). Reproduced a red-before-fix fail-open: an off-corridor raster point could be certified with `tolerancePx=Infinity` or a canvas-sized caller tolerance, producing empty issues despite the point being far outside the analytic boundary. Exact executable geometry now refuses nonfinite, negative or greater-than-2-pixel tolerances before checking any paint or transform, while valid 1–2 px checks remain accepted; non-exact bindings retain their previous no-op behavior. Added a focused regression for Infinity/NaN/negative/1000 px plus the valid control. Four affected geometry suites **55/55 PASS**; TypeScript `--noEmit` PASS, scoped ESLint PASS, `npm run build:server` PASS, source/docs `git diff --check` PASS (line-ending warnings only). The source fix and tests are saved in the dirty working tree without touching unrelated changes. The managed `cos-plugin.js` child still needs a UI restart before live E.25 pixel/scale→move acceptance; no Photoshop pixels were modified. The roadmap retains only the live gate.

- 2026-10-08 — E.25 depth-scale preflight provenance consistency. Read current AGENTS.md, roadmap, changelog and dirty Git status/diff before editing; verified the canonical COS → Plugins → UXP `photoshop_ping` (ready, matching `compact-v2-20261005-curve-fidelity`, no open document). A new regression first reproduced a contradictory report: reversed near/mid expected sizes raised `geometry_constraint_conflict` while the same `runGeometryPreflight` emitted a `depth-scale` `pass` check. The preflight now emits the positive depth-scale check **only when every ordered size comparison succeeds**, preserving the existing rejection and valid-case pass without adding a model-facing round or weakening geometric constraints. Focused geometry suites **59/59 PASS**, TypeScript `--noEmit` PASS, scoped ESLint PASS, server build PASS, and source/test `git diff --check` PASS. Source and tests are saved in the working tree; the manager-owned Photoshop MCP PID 16824 (started 2026-10-06) still predates this build. No Photoshop document was modified; E.25 physical-layer and raster/scale→move live acceptance remains open.

- 2026-10-08 — E.25 exact fit-to-document source-frame integrity. Began with current AGENTS.md, PAINTING-ROADMAP.md, CHANGELOG.md and dirty git status/diff; verified the canonical COS → Plugins → UXP ping (ready, matching `compact-v2-20261005-curve-fidelity` revisions, no open document). Reproduced a red-before-fix fail-open: a persisted scene and exact-evidence frame both containing `width: "400"` could pass strict equality, then `Number("400")` silently converted that invalid dimension into a certified 400 px fit-to-document transform. Exact geometry evidence now requires finite positive native-number width/height on both source frames; fit-to-document no longer coerces the canvas dimensions. Added a regression covering strings, booleans, null, Infinity and the valid numeric control. Focused executable geometry/Geometry Binding/scene-model tests **47/47 PASS**, TypeScript no-emit PASS, scoped source ESLint PASS, server build PASS and git diff check PASS. Broader embedded Guard baseline independently measured **94/101 PASS** with seven existing failures (stale language/schema fixtures, FORM physical-stack admission and capability-status projection); this change does not claim their resolution. Source/test changes are saved; live transform/pixel acceptance remains open until the host-managed MCP child is restarted. No Photoshop document was changed.

- 2026-10-08 — E.25 pinned physical-layer identity preflight for ordered transforms. Began with current AGENTS.md, roadmap, changelog and actual dirty git status/diff; confirmed COS → Plugins → UXP readiness with matching `compact-v2-20261005-curve-fidelity` revisions, no open Photoshop document and no active Guard jobs. Reproduced a **red-before-fix** case: `observedLayerBoundsIssue` accepted a different active Photoshop layer with the same source rectangle as the pinned semantic owner. The exact landmark-transform preflight now checks `logical_layer.layer_id` against the freshly observed active-layer `id` before comparing bounds: a different id yields `executable_geometry_constraint_conflict`, missing/invalid live identity yields `executable_geometry_unverifiable`, and matching identity preserves the normal bounds check. Legacy unpinned plans retain their existing bounds-only behavior; no speculative owner id is inferred. Added a source regression for mismatched, missing and matching active layer ids. Focused geometry/Geometry Binding/scene-model/UXP-routing tests **59/59 PASS**, TypeScript `--noEmit` PASS, scoped ESLint **0 errors** (15 existing warnings in runtime.ts), `npm run build:server` PASS. Broader embedded-Guard run **126/134 PASS** with eight failures outside this narrow change (one timeout and seven stale/changed-contract fixture expectations); full-suite green is not claimed. The managed `cos-plugin.js` child remains PID 16824 (started 2026-10-06), older than the rebuilt modules. No live transform/pixel acceptance or Photoshop document mutation is claimed; E.25 live owner/scale→move acceptance remains open.

- 2026-10-08 — E.25 atomic source-geometry materialization and brush-fixture isolation. Started from current AGENTS.md, roadmap, changelog and dirty git status/diff; verified the canonical COS → Plugins → UXP `photoshop_ping` (`ready=true`, `plugin_connected=true`, matching `compact-v2-20261005-curve-fidelity` revisions), no active Guard jobs and no open Photoshop document. Reproduced a **red-before-fix** exact-geometry defect: a valid horizontal stroke was rewritten and `derived-boundary-sections` provenance emitted even when a sibling stroke contained a nonnumeric point; a valid stroke could also be rewritten before a malformed sibling region was discovered. `materializeBoundaryDerivedStrokeSections`, `materializeBoundaryDerivedRegionBands` and the combined entry now prevalidate sibling paint payloads before the first coordinate rewrite, preserving original input and withholding partial provenance on malformed mixed strokes/regions. Added regression coverage for both direct and mixed cases. Repaired two previously failing SessionStore brush-preflight/exclusive-pack fixtures by exercising their intended brush admission at SHAPE rather than FORM; added a separate assertion that a valid preflighted FORM pass **still fails closed** without an observed physical-stack review. SessionStore is now **97/97 PASS** (previously 95/97); combined geometry/Geometry Binding/scene-model/UXP-path/SessionStore/compact-contract tests **238/238 PASS**. `tsc --noEmit`, source ESLint, `npm run build:server`, and `git diff --check` passed (Git line-ending warnings only; test file is outside the scoped ESLint configuration). Updated the roadmap to retain only the E.25 live pixel/physical-owner acceptance gate. Managed `cos-plugin.js` remains the pre-build PID 16824, so this code is **not** live-activated; no Photoshop pixels were modified and no live transform acceptance is claimed.

- 2026-10-08 — E.25 connected-descendant transform evidence hardening: read current AGENTS/roadmap/changelog and the dirty git status/diff before edits; canonical COS → Plugins → UXP ping remained ready with matching `compact-v2-20261005-curve-fidelity` revisions and no open document. Found a second `Number(null)` fail-open path in SessionStore's durable `validated-landmark-transform` propagation: malformed persisted parent `source_bounds`/`target_bounds` could be coerced into plausible numeric rectangles and incorrectly move a child's geometry anchors. Added a red-before-fix journal regression covering null/boolean source and string/null target bounds, then required all eight coordinates to be native finite numbers with positive rectangles before affine propagation. Verified the two existing valid descendant/crop cases plus the new case **3/3 PASS**; the complete SessionStore suite is **95/97 PASS**, with two pre-existing FORM physical-stack/brush-preflight fixture failures outside this change. TypeScript no-emit, scoped source ESLint, `npm run build:server` and git diff check PASS. The managed Photoshop MCP child remains PID **16824** (older than the build); no live transform/pixel acceptance or Photoshop document mutation is claimed. The roadmap retains only E.25 live connected-object acceptance, with completed source details here.

- 2026-10-08 — E.18/E.25 legacy generated-geometry camera authority: began with AGENTS/roadmap/changelog and the actual dirty git status/diff; canonical COS → Plugins → UXP ping was healthy (`ready=true`, matching `compact-v2-20261005-curve-fidelity`, zero open documents). Reproduced a red source regression where a pre-fix line-only provenance snapshot falsely returned `current` when projection changed but the scene revision number was reused. Snapshot-free legacy provenance had the same revision-equality bypass. Both now require a persisted source scene for camera/canvas parity regardless of revision equality; missing authority fails closed. SessionStore resolves the original scene only from records preceding the generated paint operation, so a later same-revision scene cannot retroactively certify the older contour. Added source regressions and a journal integration case proving that later reused-revision camera records do not corrupt the original source lookup. Verification: executable-geometry **32/32 PASS**, targeted SessionStore journal integration **1/1 PASS** (95 skipped), TypeScript no-emit, scoped source ESLint, server build and git diff check PASS. Broader SessionStore run exposed **94/96 PASS**, with two brush-preflight/physical-stack fixture failures outside this geometry change; full-suite green is not claimed. Managed `cos-plugin.js` is still the old PID **16824** (started 2026-10-06), so the rebuilt source is not live-activated. No Photoshop pixels were modified; E.18/E.25 live acceptance remains open.

- 2026-10-08 — E.25 exact-paint physical target provenance: re-read current AGENTS/roadmap/changelog and dirty git status/diff; verified canonical COS → Plugins → UXP `photoshop_ping` (`ready=true`, matching bridge revisions) and empty active Guard jobs, with no Photoshop document open. Reproduced a source-level false success: one exact Geometry Binding could certify corridor-correct regions dispatched to two different `layer_id` targets, or a mix of explicit and implicit physical targets. Added a red-before-fix regression covering two regions, separate region steps, cross-tool region/dab targets, missing and null targets; same-target and legacy all-implicit controls remain accepted. Exact paint provenance and boundary materialization now refuse conflicting, invalid or partly implicit physical target sets before rewriting coordinates, without modifying unrelated micro-plan ownership logic. Focused geometry/Geometry Binding/scene-model/UXP-path plus compact-contract suites **140/140 PASS**; TypeScript no-emit, scoped ESLint, `npm run build:server` and diff check PASS. No live pixel acceptance is claimed; no Photoshop document was modified. E.25 live target/scale→move acceptance remains open.

- 2026-10-08 — E.25 exact paint evidence scope: starting from the current dirty working tree and canonical ready UXP ping, reproduced a false corridor-provenance success when a geometrically valid region was bundled with a layer switch or a second unmeasured fill/gradient (red-before-fix regression). The validator now refuses exact paint combined with target-changing preparation, undo or other unverified mutations, regardless of action order; deterministic materialization refuses the same mixed sequence before rewriting coordinates. Pure brush/color/selection preparation and standalone non-geometric operations retain their existing behavior. Reused the canonical `VISUAL_MICROPLAN_PREPARE_TOOLS` inventory instead of introducing a second independent tool classification. Focused geometry/Geometry Binding/scene-model/UXP-path tests **45/45 PASS** and expanded compact-contract run **139/139 PASS**; TypeScript no-emit, scoped ESLint, `npm run build:server` and diff check pass. Managed `cos-plugin.js` PID 16824 still predates this source; no live pixel acceptance or Photoshop document mutation is claimed. E.25's remaining work is managed-child activation and actual Photoshop geometry/transform acceptance.

- 2026-10-08 — E.25 exact-transform evidence scope hardened. Starting from the current dirty tree, AGENTS/roadmap/changelog and a healthy canonical Plugins ping, reproduced a source false acceptance: a verified rotation plus an unverified paint action minted orientation-transform provenance, and a layer switch before an otherwise matching landmark move could mint landmark-transform provenance. Added a red-before-fix regression for mixed rotation/paint, mixed layer-switch/move and paint-after-move; the validator now rejects any exact transform sequence containing actions outside the transform and pure `photoshop_transform_landmarks` evidence scope, regardless of where the extra action occurs. Orientation/materialization also refuses to rewrite mixed sequences. The canonical pure landmark + transform case remains accepted. Focused geometry/Geometry Binding/scene-model/UXP-path tests **44/44 PASS**, TypeScript no-emit, scoped ESLint, `npm run build:server` and diff check pass. The existing managed `cos-plugin.js` child remains older than the rebuilt source; no Photoshop document is open and no live pixel or transform acceptance is claimed. No Photoshop pixels were modified.

- 2026-10-08 — E.25 exact brush/stamp footprint numeric evidence hardening. Started from current AGENTS/roadmap/changelog, dirty git status/diff and healthy canonical Plugins ping; Guard had no active jobs or pending verdicts, but Photoshop had no active document. Reproduced a false positive in executable-geometry validation: dab/stamp centers and sizes were coerced from strings, booleans or null into numbers, and stroke size/dynamics accepted coerced or partially invalid widths. A new regression failed before the fix and passes afterward. Exact executable point/footprint checks now require native finite x/y, positive numeric dab/stamp sizes and positive numeric stroke size/dynamics; a malformed explicitly declared dynamics range cannot be ignored merely because a valid base size exists. Valid numeric paths remain accepted. Focused executable geometry/Geometry Binding/scene-model/UXP-path suites **43/43 PASS**; TypeScript no-emit, scoped ESLint, server build and git diff check PASS. This closes only the source-level fail-open case, not live pixel acceptance. The managed Plugins child was not restarted and no Photoshop document was modified; E.25 live geometry and scale→move checks remain open.

- 2026-10-08 — AUD-08 known-owner compact hot-loop target repair. Re-read the current AGENTS/roadmap/changelog and dirty tree; the canonical Photoshop Plugins ping is healthy (`ready=true`, UXP bridge revisions match), with no active Photoshop document. Reproduced the existing **92/93** compact-contract failure: a continuation pass omitted `regions[0].layer_id` for a durable owner on layer 9, and the visual-plan validator emitted generic `invalid_visual_microplan` even though the compiler inherited `logical_layer.layer_id=9`. The deterministic repair lane previously ran known-owner injection only for typed `AUTO_PATCH` violations, leaving this unambiguous omission unrepaired. The repair now handles that narrowly identified generic violation, requiring a unique durable owner and exclusively region actions with no explicit foreign targets; create-new/lifecycle owners are never inferred. Added regression coverage that explicit foreign targets and mixed omitted/foreign targets remain rejected rather than being silently rewritten or converted to `deterministic_repair_repeat`. Final compact-contract suite **94/94 PASS** (93 original plus one explicit/mixed-target regression); TypeScript `--noEmit`, scoped ESLint, `npm run build:server` and `git diff --check` all pass. This closes only the source-level local repair defect; AUD-08 live host acceptance and E.25 live scale→move remain open. No Photoshop pixels were changed, and the managed MCP child was not restarted.

- 2026-10-08 — E.25 exact transform arguments must be native finite numbers. Starting from the current dirty repository, canonical Plugins ping remained UXP-ready but the managed `cos-plugin.js` PID 16824 still predates the rebuilt source. Added red-before-fix regressions proving that an exact landmark-derived no-op move could be falsely certified with `deltaX=null`, `'0'` or `false`, and a 100% scale with string/boolean input could likewise mint validated-transform provenance. An orientation-derived rotation also accepted a string angle via numeric coercion. The executable validator now refuses nonnumeric/nonfinite move, scale and rotate arguments before provenance/dispatch while retaining numeric move/scale/rotate paths. Focused four-suite regressions **42/42 PASS**; `tsc --noEmit`, scoped ESLint, `npm run build:server` and `git diff --check` PASS. The extended compact-contract suite is **92/93 PASS**: the one failing existing known-owner layer-binding repair scenario is unrelated to transform argument validation and is not claimed fixed. No Photoshop mutation or live destination-pixel acceptance is claimed; the managed child still requires UI restart. The roadmap now retains only the pending E.25 live ordered-transform gate instead of repeating closed source implementation.

- 2026-10-08 — E.25 strict numeric Photoshop-layer bounds evidence. Re-read AGENTS, the current roadmap/changelog and the dirty tree before editing; the canonical Plugins ping remains UXP-ready with matching bridge revisions, but the host-managed `cos-plugin.js` child is still the old PID 16824. Reproduced another fail-open live-bound comparison: malformed persisted `source_bounds.left=null` was coerced to numeric zero by `Number(null)`, so a layer with a zero-origin bound could be falsely certified; the same coercion affected observed UXP bounds, and strings/booleans were also accepted as numeric evidence. Added red-before-fix regression cases for null/string/boolean source and observed bounds, then required finite native-number coordinates with positive rectangle dimensions. The focused geometry/Geometry Binding/scene-model/UXP-path suites pass **41/41**, TypeScript no-emit, scoped ESLint, `npm run build:server` and `git diff --check` pass. The wider SessionStore/embedded-Guard baseline remains **188 passed / 9 failed**, with failures in separate stale descriptions, language assumptions and FORM/physical-stack fixtures; no claim of full-suite green or live pixel acceptance. Source changes and tests are saved in the working tree; restart only the managed Plugins child before attempting real scale→move acceptance.

- 2026-10-08 — E.25 landmark-transform live-bounds verification fail-closed hardening. Re-read the live dirty tree and reproduced a source-level bypass: a persisted `validated-landmark-transform` provenance with absent `source_bounds` skipped the final Photoshop active-layer comparison entirely; an empty bounds object could also pass the previous `Object.keys(...).every(...)` comparison vacuously. Added red-before-fix regressions for missing, empty, partial bounds and negative tolerance, then normalized all four source coordinates and required finite nonnegative tolerance before accepting any live match. Missing/malformed provenance now returns `executable_geometry_unverifiable` before dispatch; valid source/observed bounds still match, mismatched bounds still conflict. Focused executable geometry/Geometry Binding/scene-model/UXP-path tests **41/41 PASS**; TypeScript no-emit, scoped ESLint, server build and git diff check passed. An extended SessionStore/embedded-Guard baseline found 188 passed and 9 failed in other scenarios, not resolved here. This closes the persisted-source-bounds bypass only; the managed MCP child has not yet been restarted and real scale→move Photoshop pixel/bounds acceptance remains open.

- 2026-10-08 — E.18/E.25 generated-geometry projection invalidation: reproduced a false `current` result when the scene projection kind or source canvas dimensions changed but the line members in an executable-geometry provenance snapshot stayed identical (regression failed before fix). Newly materialized geometry now snapshots the projection kind/horizon and source frame alongside its exact line dependencies; the staleness checker refuses projection/canvas drift even when a caller reuses the same scene revision, while unrelated revisions still reuse valid geometry. Pre-fix durable line-only snapshots require the matching source revision to establish projection parity and otherwise fail closed; the older snapshot-free fallback also checks source-frame drift. SessionStore now supplies the authoritative persisted source revision for legacy line-only snapshots, preserving selective reuse for unrelated changes; an integration regression verifies that a subsequent horizon change still produces `generated_geometry_rebuild_required`. No Photoshop pixels were modified. Focused geometry/scene/Geometry Binding/UXP-path tests **41/41**, selected SessionStore integration regression **1/1** (95 skipped), TypeScript no-emit, scoped ESLint, `npm run build:server` and diff check passed. A broader SessionStore/embedded-Guard run exposed nine additional failures in other fixtures/contracts; these were not changed in this slice. Managed-child reload and E.18/E.25 live acceptance remain open.

- 2026-10-08 — E.25 single-module contour multiplicity: reproduced a false success when the same derived four-corner module was submitted as two region contours. Added regression assertions for rejection, missing provenance and unchanged input on rejected materialization (red before the fix). The validator now requires exactly one region contour for exact-module provenance, and the materializer checks multiplicity before modifying input. Stroke-only geometry is unchanged. This is a source fix, not Photoshop pixel acceptance; managed Plugins child reload is still pending. Focused 27/27 and combined executable-geometry/Geometry Binding/scene-model/UXP-path tests 41/41 pass; tsc --noEmit, scoped ESLint and npm run build:server pass.

- 2026-10-08 — E.25 multi-cell grid completeness regression fixed. Starting from the actual dirty working tree, reproduced a false executable-provenance success for a two-cell derived grid when a region payload painted only one cell: every remaining point matched a derived corner, so the validator certified an incomplete grid. The same membership loophole allowed an extra duplicate cell contour. Added both negative cases to the existing grid regression (red before the fix) and now require the complete derived cell count before admitting region-based grid provenance, preserving existing stroke-only behavior. Focused executable-geometry suite **27/27**, combined executable-geometry/Geometry Binding/scene-model/UXP-path suites **41/41**, `tsc --noEmit`, scoped ESLint, `git diff --check` and `npm run build:server` all pass. Separately restored the canonical Photoshop route without replacing the managed MCP child: launched Photoshop 27.8 and UXP Developer Tool, loaded the existing bridge, and verified `photoshop_ping` reports `ready=true`, `plugin_connected=true`, `transport=uxp`, and matching `compact-v2-20261005-curve-fidelity` revisions. The rebuilt server still requires a managed Plugins child restart before live tests exercise the new source. This is readiness plus source validation, **not** live grid-pixel or ordered-transform acceptance; those remain open.

- 2026-10-08 — E.25 exact circular-footprint corridor regression fixed. Re-read the dirty working tree and found a real source-level false acceptance: four cardinal samples of a 48px dab/stamp centered at (98,240) passed a slanted perspective corridor even though the circular support crossed the left boundary by more than the 2px tolerance. Added a failing regression for both `photoshop_paint_dabs` and rotated/flipped `photoshop_paint_stamp_instances`, then added analytic boundary-normal extremal witnesses for both tools alongside existing cardinal checks. No public API, Guard cycle, or Photoshop mutation changed; source validation now refuses the reproduced diagonal escape without minting executable provenance. Focused geometry suite **27/27**, `tsc --noEmit`, scoped ESLint, `npm run build:server`, new-file whitespace audit and tracked-document `git diff --check` all pass; live Photoshop acceptance remains separately open.

- 2026-10-07 — E.25 ordered-transform compiler boundary hardened and rebuilt. Re-read the actual dirty tree and reproduced the live `(50% top-left scale) -> move (80,30)` request on document 59: the persistent Plugins child still rejected it before Photoshop dispatch with `compact_pass_multiple_direct_operations`, confirming that the running child has not loaded the source fix yet. Added an embedded-Guard regression that registers the transform capability set and submits scale+move through the real compact `next_pass` compiler boundary; this catches the integration failure that the earlier method-class unit regression could not. Focused embedded-Guard regression passes 1/1 (100 skipped), the earlier transform classification regression passes 1/1 (69 skipped), `npm run build:server` passes, and `tsc --noEmit` passes. No live mutation occurred in the rejected attempt and no destination-bounds acceptance is claimed; the next live step is to restart only the managed plugin child and repeat the same semantic transform, then inspect actual Photoshop bounds/pixels.

- 2026-10-07 — E.25 ordered-transform live attempt found and fixed a compact-compiler integration blocker. First closed the pending canonical-curve operation honestly: the initial verdict payload was rejected before dispatch because it lacked the mandatory `whole frame` observation; corrected resubmission closed `e25-live-canonical-curve-20261007-02` with no mutation replay. The next real scale→move attempt (50% top-left scale followed by the reproduced `(80,30)` translation) was then rejected before dispatch as `compact_pass_multiple_direct_operations`, proving that the existing source-level ordered-transform validator could not yet be reached through the canonical compact facade. `src/core/visual-microplan.ts` now admits `photoshop_move_layer`, `photoshop_scale_layer`, and `photoshop_rotate_layer` as bounded `transform` mutations and classifies them consistently, preserving the general ban on bundling unrelated direct operations. Added a focused regression in `tests/visual-microplan.test.ts`; it passes 1/1 (69 skipped), `tsc --noEmit` passes, and `git diff --check` passes. A broader `visual-microplan + embedded-guard` run was 161/169 with eight pre-existing failures in unrelated stale fixtures/timeout/physical-stack expectations; none exercises this new transform classification. Live destination-bounds acceptance remains pending until the rebuilt managed plugin child loads this source change.

- 2026-10-07 — E.25 live canonical-probe setup advanced on the verified persistent route: after re-reading AGENTS.md, the current roadmap, dirty-tree status/diff and the existing curve-fidelity evidence, rechecked the live Plugins route (`ready=true`, UXP connected, matching `compact-v2-20261005-curve-fidelity`). With no active Photoshop document, dispatched the bounded nonvisual setup operation `e25-live-canonical-curve-20261007-01` through `photoshop_guard_cycle_auto`; Photoshop created a fresh isolated 400×300 px, 72 dpi RGB diagnostic document (id 59). Existing artwork was not modified. This is setup only: no curve pixels, transform bounds, or connected-object behavior have been accepted yet; the next call must continue through the compact Guard facade and then paint the canonical-handle probe without diagnostic handle swapping.

- 2026-10-07 — E.24 live-recovery readiness rechecked without manufacturing Guard debt: started from the actual dirty tree, re-read the active roadmap/runtime recovery code, and queried the persistent Plugins route. `photoshop_ping` is `ready=true` with matching `compact-v2-20261005-curve-fidelity` revisions; Guard status has no pending visual verdicts, active jobs, locks, or uncertain operations, so there is no honest compiler-rejected delivery-debt operation on which to perform the live `review_arguments` recovery yet. The roadmap now records this precise live precondition instead of implying an immediately recoverable operation. Revalidated the owning compiler-rejection regression **1/1**, `tsc --noEmit`, and `git diff --check`; all pass (line-ending warnings only). No Photoshop mutation was dispatched and no live-recovery acceptance is claimed.

- 2026-10-07 — E.24 exact review-debt recovery arguments: re-read the live dirty tree before editing and tightened the ordinary delivery-debt envelope to match the compiler-rejection recovery contract by returning `review_arguments: { operation_id }` alongside the review tool/id. The existing compiler-rejected regression proves exact review delivery, no mutation replay, no premature verdict/closure, and successful continuation after review; focused Vitest passes 1/1, `tsc --noEmit` passes, and `git diff --check` passes. Live host recovery remains the acceptance gate and is not claimed from source tests.

- 2026-10-07 — E.24 activated schema acceptance: after re-reading the actual dirty working tree and confirming the managed UXP route is still ready with matching `compact-v2-20261005-curve-fidelity` revisions, inspected the live Chat On Steroids Plugins surface rather than inferring exposure from source. `photoshop_guard_review_image` and `photoshop_guard_cycle_auto` are both advertised, while no legacy/duplicate `photoshop_guard_cycle*` mutation-cycle endpoint is present. This closes only the E.24 shared-schema exposure sub-gate; compiler-rejected review recovery and real same-chat modelling/final-review behavior remain live acceptance work. The attempted fresh E.25 diagnostic-document mutation was blocked by the host safety layer before dispatch, so no Photoshop mutation, pixel evidence, or E.25 completion is claimed.

- 2026-10-07 — E.25 managed UXP activation gate closed: re-read the live working tree/roadmap and verified the actual route instead of inheriting the prior failed activation attempt. Photoshop 27.8 and Adobe UXP Developer Tool were not running at the start of this run, so both were started and the already-configured `Photoshop MCP UXP Bridge` was explicitly loaded from UDT. Bridge health changed from `plugin_connected=false`, zero polls and no revision to one waiting long-poll with `plugin_connected=true`, and canonical Plugins `photoshop_ping` now reports `ready=true`, `transport=uxp`, `revisionMatch=true` and matching `compact-v2-20261005-curve-fidelity` revisions. No pixel/transform acceptance is inferred from readiness: the next E.25 gate is the fresh canonical-handle pixel probe, followed by real ordered-transform and connected-object acceptance.

- 2026-10-07 — E.25 live-activation retry: re-read the current repository/roadmap and attempted the highest-priority live gate rather than assuming prior activation. Photoshop 27.8 and Adobe UXP Developer Tool were launched; UDT sees `Photoshop MCP UXP Bridge` in `Ready` state, but the canonical Plugins `photoshop_get_state` route still fails closed with `uxp_bridge_unavailable`, so no Photoshop mutation or E.25 live acceptance was claimed. Revalidation of the accumulated E.25 source work: executable geometry + Geometry Binding + spatial support + session-store regressions are 135/137, with the same two pre-existing FORM brush-preflight fixtures blocked earlier by `physical_stack_check_required`; `tsc --noEmit` and `git diff --check` pass. The next E.25 item remains managed UXP bridge connection followed by the canonical curve pixel probe and real transform/connected-object acceptance.

- 2026-10-07 — E.25.4 connected projection integration: added an end-to-end source regression that starts with focus-crop-local child construction, maps it into document coordinates, persists it under an existing semantic parent, then applies a validated non-uniform parent construction-revision transform. The descendant keeps document-space anchors/control bounds and advances to the new parent revision. Focused propagation tests pass 2/2; Geometry Binding + spatial-support tests pass 15/15; `tsc --noEmit` and `git diff --check` pass. E.25.4 source projection is complete; real Photoshop connected-object acceptance remains open.

- 2026-10-07 — E.25.4 connected-owner coordinate provenance: added a single validated `previewToCanvasAffine` projection for full-frame/resized/focus-crop evidence and regression-covered Geometry Binding projection through it, preventing crop-local construction coordinates from being persisted as document coordinates. This complements the existing parent move/scale propagation; live connected-object acceptance remains open.

## 2026-10-07 — E.25 parent construction-revision propagation

- Extended validated landmark-transform provenance with its derived destination bounds and connected it to durable semantic-owner projection. A successful structural parent move/scale/fit can now derive the exact affine delta from source→target bounds, reproject descendant Geometry Binding anchors/control sections through the connected subtree, and advance direct children from the prior to the new `parent_construction_revision`.
- Propagation is evidence-gated: only `validated-landmark-transform` provenance for the same parent owner with finite positive source/target extents is admitted. Geometry Binding normalization remains fail-closed; semantic dependency ids, constraints and exact-evidence provenance are preserved by the existing affine primitive.
- Added a session-store regression for a parent non-uniform scale plus the reproduced `(80,30)` translation, proving child revision advancement and numeric anchor/bounds reprojection. Focused new/geometry tests pass; `tsc --noEmit` and `git diff --check` pass. The broader session-store file currently has two unrelated pre-existing failures at the FORM physical-stack gate, so they are not claimed green here. Preview/crop-to-canvas mapping and live Photoshop acceptance remain open.

## 2026-10-07 — E.25 connected-owner affine geometry projection

- Added a deterministic `transformGeometryBinding` primitive for the next E.25.4 slice. A parent move/scale can now reproject an existing owner's document-space near/far anchors, centerline, control-section points and expected bounds around an explicit origin while preserving semantic dependencies, constraints and exact-evidence provenance.
- The projection is non-mutating and fails closed for non-finite translations/origins or non-positive/non-finite scales. Focused regressions cover the reproduced `(80,30)` translation combined with non-uniform scale, preservation of dependency/evidence metadata, source immutability and malformed transforms.
- This is source infrastructure, not a claim that parent propagation is complete: compiler integration with parent construction revisions and preview/crop-to-canvas mapping remain open. Live Photoshop acceptance is also still blocked by the managed UXP route reporting `plugin_connected=false`, `bridge_revision=null` (expected `compact-v2-20261005-curve-fidelity`).

## 2026-10-07 — E.25 live layer-bound transform preflight

- Landmark-derived move/scale/fit provenance now retains the source rectangle used by the ordered transform proof. Before dispatch, the existing fresh UXP state probe compares that rectangle with the actual active Photoshop layer bounds; absent live bounds fail as unverifiable and mismatched bounds fail as a constraint conflict, so caller-declared source rectangles can no longer certify a different affected layer.
- Added focused source-bound regressions covering matching, mismatched and unavailable observed layer bounds while preserving the existing 2px raster tolerance. Validation: executable-geometry suite **26/26**, TypeScript `--noEmit` and `git diff --check` passed. E.25.3 source binding is implemented; managed-runtime live move/scale/fit destination acceptance remains open.

## 2026-10-07 — E.25 constrained curve envelopes and stamp footprints

- Exact two-family module/grid validation now checks authored cubic support against each derived convex cell, using Bezier extrema projected onto every cell-edge normal. Valid inward curvature remains accepted while a handle that makes the rendered curve escape its derived module/grid envelope is rejected before dispatch.
- `photoshop_paint_stamp_instances` now participates in exact corridor validation. Each explicit instance size is treated as a conservative circular support envelope, invariant under angle/flip; a center-inside but footprint-outside stamp is rejected, and missing/non-positive size fails closed rather than certifying a point-only placement.
- Added focused module/grid curve-envelope and stamp-footprint regressions. Validation: executable-geometry suite **26/26**, TypeScript `--noEmit`, scoped ESLint and `git diff --check` passed. E.25 constrained paint-geometry source verification is complete; managed runtime activation/live pixel acceptance and actual Photoshop source-bound transform evidence remain open.

## 2026-10-07 — E.25 exact stroke footprint validation

- Exact two-boundary stroke validation now checks painted brush coverage rather than certifying only the path centerline. Explicit per-stroke `size` and the maximum declared `dynamics.size` become a conservative radius; straight/authored-cubic critical points are offset along both analytic boundary normals so a centerline that fits while its brush escapes is rejected before dispatch.
- Exact-bound strokes without an explicit positive size or size-dynamics range now fail closed because the prepared Photoshop brush baseline is not executable geometry evidence available to this validator. Existing narrow derived-section coverage remains valid within the configured raster tolerance.
- Added a focused regression covering centerline-inside/footprint-outside rejection, contained fixed-size and dynamic-size strokes, and unknown-width refusal. Validation: executable-geometry suite **25/25**, TypeScript `--noEmit`, and scoped ESLint passed.

## 2026-10-07 — E.25 ordered module/grid contour topology

- Exact two-family module/grid validation now checks contour sequence, not only set membership of dispatched corners. Cyclic starts and reversed winding remain valid, while bow-tie/reordered contours and duplicate-corner contours fail closed before dispatch.
- Added focused regressions for grid bow-tie and duplicate-corner payloads. Validation: executable-geometry suite **24/24**, TypeScript `--noEmit`, scoped ESLint and `git diff --check` all pass.

## 2026-10-07 — E.25 exact dab footprint validation

- Extended exact executable-geometry validation to treat `photoshop_paint_dabs` as an area mutation rather than a zero-width center point. For a dab with explicit diameter, the validator checks the center plus the four cardinal points of the circular brush envelope against the accepted two-boundary corridor; a center that is valid while its painted footprint escapes is now rejected before dispatch.
- Exact-bound dab payloads now fail closed when `x`/`y` or an explicit positive `size` is unavailable, instead of silently producing no executable geometry/provenance. Successful dab validation records the same deterministic corridor provenance used by exact region/stroke geometry.
- Validation: `src/core/executable-geometry-validation.test.ts` passed 24/24; `tsc --noEmit` passed; scoped ESLint for the implementation/test passed. Live Photoshop remains blocked by the unchanged UXP readiness gate (`plugin_connected=false`, bridge revision missing), so no mutation was attempted. E.25.2 remains open for ordered contour topology, constrained curved module/grid envelopes, and remaining stamp/stroke footprint coverage.

## 2026-10-07 — E.25 curve activation preflight

- Revalidated the accumulated E.25 curve/compiler work from the actual dirty working tree before attempting the live gate: `src/core/executable-geometry-validation.test.ts`, `src/core/scene-geometry-model.test.ts` and `tests/uxp-path-geometry.test.ts` passed 29/29 targeted assertions.
- The installed Photoshop route is reachable, but the readiness probe is fail-closed: `ready=false`, `plugin_connected=false`, `bridge_revision=null`, expected revision `compact-v2-20261005-curve-fidelity`, reason `uxp_bridge_revision_missing`. No Photoshop mutation or diagnostic-swap probe was attempted against that unready runtime.
- Roadmap item E.25.1 now distinguishes completed source verification from the still-open managed MCP/UXP activation and canonical-handle live pixel probe. No unrelated dirty-tree work was overwritten.

## 2026-10-06 — Remove three redundant Guard planning requirements

- Unchanged continue-logical-layer/adjust of a known durable owner inherits layer_separation_check and rollback facts before validation. No repeated questionnaire, state read or internal repair/recompile. New owners/layers, construction changes, explicit rollback reassessment, stage_reset, cross_layer_correction and destructive work retain explicit assessment/authority; target and ownership conflicts remain validated.
- Optional method hints no longer require visual_intent and impact_class as a pair. Unique omissions still derive from executable capabilities; ambiguous omissions stay absent while supplied hints/preferred methods are checked against execution. Incompatible hints and explicit avoid_method_ids still refuse, including exclusion-only requests and an excluded step method_id. Complete-contract method drift and construction-role/destructive checks remain intact; no goal-keyword inference or artistic certificate.
- Director directives no longer require three style constraints, 8/12-character prose or a 1-3 first-pass list. Objectives/strategies remain non-empty; a supplied list must be well-formed. Real structural prompt conflicts and required user confirmation remain mandatory; short actual confirmation is accepted. Public schema, AGENTS, roadmap and Russian recovery guidance match these rules.
- Expanded existing cases: 13 selected tests passed, 147 skipped; after adding exclusion-only/step-exclusion assertions, the affected grouped negative test passed again (92 skipped). No added test cases or full suite. TypeScript no-emit passed; scoped source ESLint had zero errors and three existing warnings (test files are outside its configured scope). [Verification](processes/guard-requirement-trim-process/run-01/verification.json).
- Source only: working dist not rebuilt, MCP/UXP not restarted, Photoshop not called; activation and live timing/quality acceptance remain open. Full nine-file pre-change snapshot SHA-256 verified at `processes/documentation-maintenance-process/pre-guard-requirement-trim-20261006T001441/`.

## 2026-10-06 — E.25 ordered move/scale/fit bounds validation

- Exact landmark-transform validation now projects all four rectangle edges through the dispatched sequence, using the current rectangle at each step. Scale uses the actual declared center/top-left anchor; omitted centerAnchor defaults to center, matching UXP. Fit/fill uses current dimensions and recenters before subsequent moves. Intermediate target/bounds changes that cannot be simulated do not receive transform provenance.
- The reproduced 200% top-left scale reaches (10,20)-(210,220), so it no longer certifies target (90,50)-(290,250) without move (80,30). A correctly composed scale+move passes. The refusal gives computed and target bounds, distinguishes position-only correction from a size mismatch, and never presents a move as sufficient when dimensions differ. No new public field, extra Guard cycle, Photoshop call or source-bound assertion.
- Expanded existing tests without increasing the case count: 7 selected transform tests passed, 16 skipped. Covered missing/corrected move, mixed-anchor order, center default, fit/move order, changed layer mid-sequence, stale frame and advisory scope. TypeScript no-emit and scoped ESLint passed; no full suite or working-dist rebuild.
- This closes only ordered arithmetic against declared frames. Actual Photoshop source-layer bounds/landmark binding, live pixel acceptance and activation remain open in E.25. No MCP/UXP restart, state probe or artwork mutation was performed. [Verification](processes/ordered-transform-process/run-01/verification.json).
- Full pre-patch snapshot: `processes/documentation-maintenance-process/pre-ordered-transforms-20261005T224250/`. Before resumed verification/docs edits, four current files were SHA-256 verified in `processes/documentation-maintenance-process/pre-ordered-transform-verification-20261006T000309/`. Work stops here at the user's requested pause.

## 2026-10-05 — Derive missing method classification without goal-keyword inference

- Direct and bundled compact passes now derive omitted visual_intent/impact_class only when compatible executable capabilities and supplied fields yield one choice. Explicit fields remain unchanged; compatible preferred methods can narrow the choice and avoid_method_ids filter candidates. No new public field, tool, state read, repair cycle or artistic certificate.
- Removed the English goal-regex fallback that could reinterpret an invalid complete classification based on words such as line/structure/texture. Missing metadata is now language-independent; complete incompatible contracts, ambiguity, construction-role authority, forbidden methods and REPLACE/ERASE/ROLLBACK retain their checks. Existing owner/scene inheritance was inspected and reused without another implementation layer.
- Reworked two existing regressions: direct/bundled execution in Russian/English, missing-field ambiguity, destructive authority, explicit exclusion and unchanged complete-contract method drift. Four selected tests passed, 89 skipped; no test count increase or full suite. Server TypeScript build and scoped ESLint passed (zero errors, two existing warnings). Compiler shrank by 18 lines. Roadmap and Russian instructions retain activation/live acceptance. [Verification](processes/executable-classification-process/run-01/verification.json).
- Source/docs/test snapshot SHA-256 verified before editing, plus all 684 previous dist files verified before clean/build: `processes/documentation-maintenance-process/pre-executable-classification-20261005T221635/`. Current dist contains the change. Active MCP still expects bootstrap-identity while UXP reports curve-fidelity; child activation remains pending.

## 2026-10-05 — Initial toning without perspective negotiation; current dist build

- Reproduced runtime mismatch: active UXP advertises `compact-v2-20261005-curve-fidelity`, while the MCP child expects `compact-v2-20261005-bootstrap-identity` and reports `plugin_connected=false`. The old working dist still wired automatic local artistic evaluation. Rebuilt working dist from current source; a managed MCP-child restart is still needed to activate it. No foreground takeover, child restart or Photoshop mutation was performed.
- The compiler now derives a narrow initial-tone exemption from actual actions: one ADD fill, pinned to its newly created committed layer, before the first recorded visual frame, with no declared construction role/tier/change, surface/geometry binding, parent or depth relation. This coat requires no scene perspective model. Existing document/layer pinning, semantic ownership, physical opacity, protections, executable validation and exact-image review remain. No new public field, endpoint or Guard cycle; uniform color proves no spatial modelling or artistic completion. Active selection behavior is unchanged.
- One grouped integration regression verifies actual async fill execution, delivered review image without automatic verdict, and refusals for declared construction or a different target. The existing spatial-gradient negative regression also passed: 2 selected tests, 91 skipped. Server TypeScript build passed; scoped ESLint has zero errors and two existing warnings. No full suite. Roadmap retains the live zero-negotiation acceptance; Russian recovery instructions describe the minimal path. [Verification](processes/initial-tone-process/run-01/verification.json).
- Full pre-change source/docs/test and previous dist snapshot: `processes/documentation-maintenance-process/pre-initial-tone-20261005T213438/`; all 681 files SHA-256 verified before editing/build cleanup.

## 2026-10-05 — E.25 actual cubic bounds before dispatch

- Document/clip preflight and the UXP region/stroke boundary now check actual cubic extrema, including the closing contour segment. Public control handles remain finite absolute positions and may lie outside the canvas/clip when the curve stays inside; removed the conflicting region handle schema minimum. Anchors and real curve excursions remain bounded. This prevents the reproduced valid curve with handle (-5,10) from being rejected while its X extent is only [2.113,7.887]. Public left/right semantics remain incoming/outgoing; callers must not add the native adapter themselves.
- Exact two-boundary region/stroke corridor validation includes extrema of the curve projected against both analytic boundaries, plus boundary-order crossings. The reproduced inside-anchor curve escaping to approximately x=297.5 is rejected without executable provenance; a bounded curve with an outside-corridor control handle passes. Checks are local math in the existing preflight; no model requests or extra Guard cycles. This slice validates contour/centerline placement, not painted brush footprint, module/grid curve interiors or contour topology; those remain explicit in E.25.
- Expanded existing tests rather than adding more cases: 11 selected tests passed, 82 skipped, across compiler/corridor, Node preflight and shared UXP path regression. Node/UXP cubic math agrees on finite/off-canvas/closing/projection cases; invalid curves are stopped before preparation. TypeScript isolated emit, UXP syntax and scoped ESLint passed. [Verification](processes/curve-fidelity-process/run-02/verification.json). Build: `processes/curve-fidelity-process/run-02/build`; activation/live acceptance remains deferred.
- Updated the roadmap, AGENTS and Russian recovery instructions. Existing MCP/UXP revision is advanced to `compact-v2-20261005-curve-fidelity`: after a server build the old companion is rejected until UXP reload, preventing mixed adapter execution. Full thirteen-file current snapshot is SHA-verified: [archive](processes/documentation-maintenance-process/pre-curve-envelopes-20261005T1720/). No Photoshop mutation or restart was needed for this follow-up slice.

## 2026-10-05 — E.25 native curve fidelity and compiler preservation

- A fresh isolated 400x300px/72dpi Photoshop diagnostic proved native PathPointInfo directions are consumed opposite to the public incoming/outgoing convention. The original filled upper edge differs from the cubic oracle by 47.24px mean / 55.73px max. A diagnostic-only handle swap on the old UXP runtime reduces this to 0.85px mean / 1.55px max. Corrected ordinary and canonical dynamic strokes have maximum center error 1.12px and 0.55px; their maximum difference is 1.5px with a 4px brush. SHA-verified JPEG analysis uses explicit 2px raster/segmentation tolerance: [evidence](processes/curve-fidelity-process/run-01/pixel-verification.json), [repeatable analysis](processes/curve-fidelity-process/run-01/verify-pixels.mjs).
- UXP now adapts public left=incoming/right=outgoing at the shared region/stroke path boundary; CPU dynamic sampling retains its canonical convention. Public schema descriptions clarify absolute incoming/outgoing coordinates. The compiler no longer treats authored handles or smooth points as straight boundary sections, region bands or line-family modules/grids; the reproduced 60px midpoint flattening and region-handle loss are prevented. Straight construction/invalidation behavior remains unchanged.
- Five existing targeted compiler tests were expanded and passed; one shared native path adapter regression passed. TypeScript isolated emit, UXP syntax and narrow lint/diff checks passed. Build: `processes/curve-fidelity-process/run-01/build`. No full suite, local-model experiment, new public endpoint or extra per-stroke Guard layer was added. Guard review for all three diagnostic paint operations was closed; existing artwork was not painted.
- Source is not activated: dist/MCP/UXP were not reloaded. Live corrected probes supplied swapped native handles solely to the old runtime; they prove the adapter behavior, not that the deployed plugin loaded the new source. After activation use canonical payloads with no diagnostic swaps. Broader curve-envelope/off-canvas, topology, actual transform bounds and connected object construction remain in E.25. Verified full six-file snapshot: [archive](processes/documentation-maintenance-process/pre-curve-fidelity-20261005T1704/).

## 2026-10-05 — Coordinate construction audit and E.25 priority

- Audited measurement/landmark math, scene/camera/binding scope, compiler materialization/validation, preview/canvas units, UXP curve delivery and layer transformations. [Audit and repeatable evidence](processes/coordinate-audit-process/run-01/AUDIT.md) reproduce curve-handle loss (60px midpoint change), unchecked curve excursions, rejected valid on-canvas curves, accepted crossing contours, uninspected dabs/non-exact bindings and a top-left scale falsely matching a target requiring (80,30) translation. Handle loss/curve excursion/wrong-scale acceptance also reproduce against the current dist file; worker freshness was not claimed.
- Exact stored still-life JPEG hash was verified. Its cup boundaries differ from supplied cubic semantics by 46.7–57.1 canvas px; interchanged handles predict them within 1.4–2.7px. Native isolated proof remains pending: source mapping matches Adobe incoming/outgoing naming, so no blind handle reversal was made. That actual pass has no scene model/binding; materializer defects are separate reproductions, not asserted as its cause.
- Core geometry math, DPI conversion and representative transform/corridor checks pass: 13 existing narrow tests, 20 unrelated skipped, no added test cases. Production code, runtime and artwork remain unchanged. E.25 now precedes further quality acceptance and records ordered coding/acceptance criteria, including a numeric construction for every semantic object without new orchestration layers.
- Full current roadmap/changelog copies were SHA-verified before editing: [archive](processes/documentation-maintenance-process/pre-coordinate-audit-20261005T184743/). No claim that passing arithmetic tests establishes correct anatomy or better painting.

## 2026-10-05 — Same-chat pixel review; remove automatic local evaluation

- Production no longer instantiates LocalArtisticEvaluator, prepares/loads it at art-run creation, starts inference after dispatch or waits for inference during review. The standalone evaluator remains explicit experimental developer code; no painting tool invokes it. Removed local-assessment overrides from both cycle compilation and verdict validation; historical timeout/assessment records remain on disk but no longer appear as current review/continuation authority.
- Existing explicit and inline image delivery now return localized artistic_review with original brief, pass goal, stage, bound task and exact AFTER SHA. The host is asked directly to inspect visible form/proportion/perspective/light against the requested style, record the main defect in existing previous_observation and fix it through the next ordinary construction pass. Repeated failure calls for changing construction, not adding texture/highlights. No new required observation fields, provider calls, schema branches, per-stroke gate or Guard round; image-delivery provenance/no-replay rules remain intact. Same-chat self-review is not independent acceptance or proof of better painting.
- Updated host/control instructions, AGENTS, architecture, evaluator workflow, painting skill, visual-evaluation reference, seven Russian docs and E.24/priority order. Full twenty-three-file verbatim pre-edit snapshots are SHA-verified in [the archive](processes/documentation-maintenance-process/pre-same-chat-review-20261005T180115/); the retired provider documentation is preserved there in full.
- Extended/reworked two existing tests: all-stage/repeated review, Russian/English configuration and brief changes; exact review-debt recovery plus inline continuation despite persisted evaluator timeout. Both pass (2 passed, 103 skipped); no new test cases. Isolated TypeScript emit and changed-source ESLint passed (zero errors, 18 existing warnings). [Verification](processes/same-chat-review-process/run-01/verification.json).
- Source/isolated build only; no active MCP/UXP restart or artwork mutation. After activation, E.7e still needs actual BEFORE/AFTER evidence that the critique changes construction and improves the painting.

## 2026-10-05 — Remove the duplicate public Guard cycle

- Removed photoshop_guard_cycle from the tool factory, publication compaction, model-facing result set and document-target exclusions; no public alias or replacement layer. photoshop_guard_cycle_auto remains the single compact cycle entry for short execution, async start/poll and review/continuation. The private runtime.cycle executor stays shared by that route and its worker. Diagnostics/lock labels now use the public cycle-auto name.
- Removed the obsolete documentation/inventory row and updated current counts to 132 tools / 15 Guard / 5 prompts. Roadmap keeps activation and actual exposure acceptance. Retiring the duplicate saves 38293 bytes of published declaration/schema after the preceding description cleanup; surviving published schemas compare equal.
- Updated existing catalogue/description checks rather than adding tests: those two plus review-debt recovery passed (3 passed, 97 skipped). Isolated TypeScript emit, changed-source ESLint (zero errors, 18 existing warnings) and the catalogue-count verifier passed. [Verification](processes/guard-cycle-removal-process/run-01/verification.json). Source/build only; active dist, MCP, UXP and connector metadata are unchanged.
- Full fifteen-file pre-edit snapshots were SHA-verified in [the archive](processes/documentation-maintenance-process/pre-remove-guard-cycle-20261005T174713/).

## 2026-10-05 — Shorter Guard catalogue descriptions

- Rewrote all 16 Guard tool summaries around the action and required continuation, removing repeated transport/architecture prose. Condensed shared next-pass and art-run field guidance; removed the repeated UXP-only sentence from both color-sampling tools. No field, enum, bound, default, required list or handler changed.
- Preserved call-critical conditions in one sentence so existing publication compaction cannot discard them: anchor id instead of actions, protected-layer REPLACE/ERASE, backward stage reset, scale/region bounds and model revision updates. Cycle-auto still names exact-image review and async polling. Full originals remain in the SHA-verified [five-file archive](processes/documentation-maintenance-process/pre-guard-descriptions-20261005T173815/).
- Exact same-dependency catalogue comparison: Guard declarations shrink from 176849 to 170108 UTF-8 bytes (6741 saved). Structural comparison excluding descriptions is identical for every Guard tool. Several cycle fields grow slightly because previously truncated invocation conditions are restored; schema structure remains the main cost. Current settings already disable the redundant guard_cycle declaration: the projected whole Plugins catalogue drops from 243421 to 236187 bytes with review/cycle-auto/poll/status retained. This is an offline projection, not proof that the active connector loaded it; no limit was raised.
- Extended the existing catalogue-contract test rather than adding another test. That check plus review-debt recovery passed (2 passed, 98 skipped); isolated TypeScript emit and changed-source ESLint passed (zero errors, one existing warning). [Size comparison](processes/guard-description-compaction-process/run-01/size-comparison.json). Source/build only: no active dist replacement, MCP/UXP restart, connector refresh or artwork mutation.

## 2026-10-05 — Actionable exact-review recovery after compiler rejection

- A prior operation's image-delivery debt could cause compiler rejection before the runtime's delivery-recovery branch. The rejected-cycle envelope now preserves all compiler/finalization errors and adds `delivery_recovery` with `photoshop_guard_review_image`, exact operation arguments and a specific next action. Close-only and combined continuation requests both use this path. No new dispatch, image capture, acknowledgement, artistic verdict or mutation replay occurs while delivery is pending.
- One grouped regression reproduced the missing hint before the source fix, then passed close-only, valid continuation and simultaneous malformed-next-pass cases. It verifies zero additional mutation/closure until exact images are delivered, exact AFTER provenance and successful ordinary continuation afterwards. The two existing neighbouring closure-safety tests also passed: 3 passed, 97 skipped. Isolated TypeScript emit passed in `processes/review-debt-recovery-process/run-01/build`; runtime ESLint has zero errors (15 existing warnings; tests are outside its configuration).
- Live discovery found a separate publication mismatch: the installed Photoshop catalog contains 133 tools, including enabled `photoshop_guard_review_image`, but the current CoS Plugins exec inventory omits it and a direct non-existent-operation probe returns Unknown tool before dispatch. This does not prove an absent Photoshop implementation. Refresh/reconnect the ChatGPT Plugins connection and verify actual tool exposure before asking Painter to recover; do not substitute ordinary preview or weaken the delivery barrier.
- Source/build validation does not activate the patch. Running MCP, CoS, UXP and artwork were not restarted or changed. Roadmap retains activation/publication and real recovery acceptance. Full four-file SHA-verified pre-edit snapshot: [archive](processes/documentation-maintenance-process/pre-review-debt-recovery-20261005T164402/).

## 2026-10-05 — New Painter diagnosis and hidden recognition quota

- New chat reused document 1364 from run-03; rebinding it to run-04 correctly failed immutability. Its first painting request mixed fill and region methods and received a not-executed rejection in 322 ms. The same refusal exposed an actual compact-contract bug: the compiler does not forward recognition_features, but RECOGNITION_BLOCK_IN required 3–7 entries. Removed that execution quota rather than adding another required prose field. Optional annotations still validate as strings, global recognition scope remains required, and exact-image review/independent evaluation still own artistic assessment.
- The corrected package completed through the persistent native MCP worker PID 24740 in 6.7 seconds and saved an exact preview. The next modelling package never dispatched: model-facing review delivery remained unregistered after local view_image, and local review findings omitted exact source-document region_bounds. The later raw paint_strokes call correctly returned guard_required; subsequent Desktop activity was Save As, not evidence of modelling. These are distinct from the repaired transport failure.
- Source fix does not change the active Painter session or weaken delivery/localization gates. Activation remains pending. Full five-file SHA-verified snapshot: [archive](processes/documentation-maintenance-process/pre-recognition-quota-20261005T132000Z/).
- Two focused parser checks passed (67 unrelated tests skipped), including optional/empty/short/long feature annotations, malformed entries and preserved global scope. Isolated TypeScript emit passed. [Diagnosis and verification](processes/new-painter-diagnosis-process/run-01/diagnosis.json) records the successful worker, both refusal boundaries and Desktop Save As. The user stopped the Painter; no mutation, restart or message was sent to that chat by this audit.

## 2026-10-05 — Persistent Photoshop route and pre-dispatch Bezier validation

- Activation confirmed after the user's restart at 16:03:02 local: MCP PID changed from 6696 to 24740 (parent 24548), native ping returned ready with matching UXP revision, and both deployed tool-module hashes match the validated build. Coordinate preflight is now activated. Actual async painting and artistic acceptance remain untested. Evidence: [restart confirmation](processes/persistent-route-validation-process/run-01/restart-confirmed.json).
- The installed CoS Plugins route is currently live: two native photoshop_ping calls, about 96 seconds apart, returned UXP ready with revision compact-v2-20261005-bootstrap-identity. The same manager-owned MCP child PID 6696 persisted across those calls (parent 2344, created 15:20:43 local). It was already running when inspected; this investigation did not restart it or change configuration. Earlier Unknown tool results do not establish why publication recovered.
- Confirmed the run-03 stall: the one-request shell pipeline closed .tmp-live-mcp-client.mjs after the async-start reply, retiring the process that owned the worker. Disabled that temporary client before child creation. Canonical architecture/agent/Russian recovery docs now state actual connection ownership; durable receipts are recovery evidence, not detached workers. No second daemon, controller or CoS source change.
- Existing microplan bounds preflight now validates absolute left/right Bezier pairs as well as anchors, and the region clip envelope. Public region schema documents absolute coordinates and rejects negative anchors/handles. Coordinate failures aggregate in the existing not-executed envelope before preparation; no new Photoshop read, Guard cycle or artistic gate.
- Four focused tests passed: negative offsets, positive out-of-canvas handles, clip-envelope violations and valid absolute handles. Both faulty handles appear in one rejection, zero tool execution, no reconciliation debt. TypeScript no-emit and isolated emit passed, changed-source ESLint and painting-policy checks passed; 65 unrelated tests skipped. Two validated tool modules are staged in dist; the running child remains unchanged and needs the installed-plugin Restart. No UXP change is required. A real async painting pass remains a separate live gate; these checks do not prove artistic improvement.
- Full eleven-file SHA-256-verified pre-edit archive (nine source/docs/helper files plus two production modules): [snapshot](processes/documentation-maintenance-process/pre-persistent-route-20261005T123000Z/). Earlier stall evidence: [diagnosis](processes/painting-stall-diagnosis-process/run-01/diagnosis.json).

## 2026-10-05 — E.8a recorder, checkpoint and scoped-repair accounting

- Recorder overhead no longer contaminates photoshop_dispatch_wall_ms: the dispatch clock ends before trace finalization, also on failed execution. Separate prepare/finalize timings contain settle, FFmpeg stop and postprocessing phases; those child phases must not be added again. Recorder errors stay best-effort, replay performs no new capture/dispatch, and no additional Guard cycles or Photoshop reads were introduced.
- Due automatic PSD checkpoints retain their own journal latency: wall prefix through durable verification/report/ack, dispatch wall and reported Photoshop execution (unknown remains null). The boundary explicitly precedes telemetry persistence, which total cycle wall still includes. Existing async preparation carries the checkpoint receipt into the result; the following pass references the checkpoint operation instead of duplicating its duration. Throughput denominators include recorder/checkpoint overhead without double-counting checkpoint dispatch. One additional journal latency write occurs only for a due checkpoint; no healthy-loop write was added.
- Compiler violation rows retain cycle/finalization/next_operation scope and initial/introduced origin. Payload repair cannot mark closure/request errors repaired; systemic repair repetition remains unresolved. The existing state retains scoped counters alongside the compatibility map. Benchmark repair percentages use only typed deterministic next-operation defects; legacy, unowned or inconsistent rows produce unknown rather than an invented success percentage. This does not complete whole-run event ownership or judge artistic quality.
- Eight focused checks passed across four files (99 unrelated tests skipped): recorder success/failure/replay and clip/warning phases; checkpoint success/timing, healthy no-debt/prepared-reference single-projection and failed-save safety; compiler/durable scope separation; scoped benchmark accounting and existing mixed-run benchmark compatibility. Isolated TypeScript emit passed under processes/three-accounting-validation-process/run-01/build. No active dist, MCP, UXP or Photoshop changes; live performance/artistic acceptance stays open.
- Painting-policy/size gate passed. Changed TypeScript sources have zero ESLint errors; the benchmark script retains exactly three pre-existing console/no-undef errors, verified against the snapshot (17 warnings across the selected files). All 13 snapshot hashes and changed-document links verified. Evidence: [validation record](processes/three-accounting-validation-process/run-01/verification.json).
- Full pre-edit snapshots: [verified archive](processes/documentation-maintenance-process/pre-three-accounting-tasks-20261005T111239Z/), including two additional benchmark files preserved before editing. Roadmap now retains live acceptance and remaining event ownership rather than completed implementation instructions.

## 2026-10-05 — Three throughput slices: final validation

- Eight distinct focused checks passed after correcting completed-timeline compatibility; no full suite. Isolated TypeScript emit passed, changed-source ESLint has zero errors (one warning), and painting-policy/size checks passed. The isolated build is under processes/three-throughput-validation-process/run-01/build; the active dist/MCP/UXP and Photoshop session were not replaced.
- [Verification and transport fixture](processes/three-throughput-validation-process/run-01/verification.json). All nine pre-edit snapshots retain matching SHA-256; changed-document relative links resolve. Roadmap moved the implemented requirements to history and keeps only remaining code/live gates. Human/artistic acceptance remains open.

## 2026-10-05 — E.8a stale dispatch-mirror detection

- Artistic throughput now compares the stored action total with receipt-owned dispatch counts from the current document incarnation, using the request's existing journals/state projection. Other documents and superseded incarnations are excluded. Completed, failed-or-uncertain and not-started mutation receipts are distinguished. Category totals are checked, and the ratio is derived from the counters instead of trusting its cached value.
- Proven mirror disagreement marks accounting_integrity=stale and suppresses the actions-per-call ratio (null). Legacy/unknown dispatch evidence and unowned recent events stay unverified. Model-visible call totals are not reconstructable from paint receipts; the check does not invent replacement totals, repair state, grant artistic success or claim full run-event ownership. No extra state/Photoshop reads or durable counter owner.
- Three owning checks passed: stale/missing/interrupted count, wrong-document/incarnation exclusion, inconsistent categories, exact partial receipts and unverified legacy/unowned evidence, plus existing throughput aggregation. Two new grouped tests; no full suite. Remaining timing/ownership/live gates stay in Roadmap.

## 2026-10-05 — E.8a complete review-service boundary

- The public review endpoint is now measured after receipt persistence and response construction, immediately before return. The exact observed endpoint is joined to the existing delivery receipt and flushed with the next ordinary journal write; no extra telemetry write or MCP round. Process-local buffering is bounded and bound to operation/frame/receipt identity. Restart before flush leaves an explicitly incomplete service prefix, not a fabricated full boundary or model gap.
- Three owning checks passed, including all-stage existing review compatibility, delayed receipt persistence/single-write/restart/flush and existing diagnostic-marker semantics. This proves timestamp accounting, not live acceleration. Documentation/source remain staged; the running test session was untouched.

## 2026-10-05 — E.8e/AUD-29 bounded public state responses

- Public status/resume serialize within a hard 24-KiB UTF-8 budget. Healthy responses avoid extra disk work. Oversized responses persist the full projection, omit broad diagnostics/inventories first, select the document owning the next action and bound repeated rows. Identity, SHA, tokens, paths and retained owner bindings are never cut into fragments. Pathological required context returns an explicit incomplete-state error and durable reference instead of false readiness. Internal Guard state/cycle validation is unchanged.
- Two grouped checks passed: Unicode bytes, review/recovery/checkpoint/owner preservation, exact disk copy and unchanged input/healthy no-write; actual status/resume handlers, many documents, job selection and unfit mandatory context. Live context/throughput acceptance remains open. Originals are in [the verified snapshot](processes/documentation-maintenance-process/pre-three-throughput-tasks-20261005T081304Z/). Running MCP/UXP/Photoshop were not touched.

## 2026-10-05 — E.7e live probe staged; activation pending

- Verified the running child/bridge still use the 20261003 revision. Preserved the failed still-life PSD as an exact SHA-verified input in [the probe](processes/e7e-mug-volume-process/run-01/acceptance.json); original PSD is untouched. No Photoshop mutation or restart yet. Stock CoS/UXP reload requires foreground permission under the root AGENTS rule; checked background interfaces do not expose this action.
- Full current Roadmap/Changelog copies were verified in [the pre-probe archive](processes/documentation-maintenance-process/pre-e7e-live-20261005T073038Z/). E.7e image-quality acceptance remains open.

## 2026-10-05 — Independent pixel review; remove repeated protocol negotiation

- Production EmbeddedGuard now has a separate vision evaluator at the existing exact-frame review boundary, across every visual stage and final selection. It receives the original user brief, bound task, stage/intention and whole AFTER, with same-document BEFORE/existing focus crop; no Painter conversation/self-verdict. Local goal, Planner task, stage readiness and whole-brief finish remain separate. Contradicted completion is corrected internally; unfinished useful pixels and ordinary safe continuation remain possible. Machine suggestions do not generate new blocking aesthetic debt.
- Store the original brief once through art-run. Exact document/incarnation/frame/brief/contract/stage binding rejects stale or foreign assessments. Identical reviews share inference; timeout/offline/invalid output produces uncertainty with a 30-second cooldown, never success or paint replay. Default installed local provider: Gemma 4 12B IT; bounded preparation starts at artistic run, skips already resident models, and stays outside Photoshop's execution lock. No model download, new public tool, per-stroke evaluation or extra Guard cycle.
- Public stage/scale defaults now match execution. Covered root, nested action-schema, method, bounds and construction-role errors aggregate before dispatch, including PaintingIntent parsing. Omitted technical action keys are generated deterministically with collision handling and created-layer bindings; caller-owned references survive. Completed nonvisual operations need no invented artistic observation. Dependent checks still require their prerequisites: this is not a claim that arbitrary failed requests expose every possible downstream error.
- Fixed reproduced create-document identity loss across UXP modal return: capture inside the modal and accept only the uniquely new document, never an arbitrary active document or another create. Source bridge revision: compact-v2-20261005-bootstrap-identity. Deferred MCP/UXP reload and actual live bootstrap verification remain open.
- Actual local inference on the failed historical still-life distinguished realistic modelling (unmet/not-ready/unsatisfied, 25.4s) from early geometric block-in (met/ready/uncertain, 13.4s). The real existing review handler with the default backend and selected Russian returned unmet/not-ready/unsatisfied in 23.9s, delivered the exact image and retained pixels while downgrading claimed goal/task completion: [receipt](processes/artistic-evaluator-integrated-review-ru-result.json). Review timing now includes evaluator time instead of attributing it to the next agent call. Cold-load failures, GPU residency and a questionable intentional-flat control are recorded; human calibration, lower total latency and better actual painting are not proven.
- Validation: 37 distinct owning checks passed (four grouped evaluator tests cover all stages, cache/identity/failure, scoped closure and broader-task separation; parser/compiler/bootstrap checks). Automatic keys and layer-reference handling passed the owning five-check rerun without adding another test. TypeScript emit passed; changed-source ESLint has zero errors (18 warnings), and the policy-size gate passed without raising its limits. No full-suite run. Documentation including all docs/ru pages and Roadmap now distinguishes Painter, plan-storing Director and independent evaluator; E.24 live/calibration precedes E.7e real rendering and E.8 matched quality/time.
- Full pre-edit source/tests/docs snapshot (310 files) was SHA-256 verified in [the archive](processes/documentation-maintenance-process/pre-autonomous-architecture-20261005-20261004-222926Z/). Removed Roadmap history remains there. MCP/UXP were not restarted; the running painting path is not claimed to have adopted this source yet.

## 2026-10-05 — Live dab/stroke diagnostic; ineffective modelling settings reproduced

- Compared Soft Round 64 px isolated dabs and 10 px strokes on a separate white 640×360, 72 DPI document through the existing Guard. Dab-center RGB: opacity/flow 100/100 → 1; 100/10 → 229; 20/10 → 250. The short stroke at 20/10 also returned RGB 250. The zero-length dab-path hypothesis was not reproduced: isolated dabs deposit paint. Weak settings explain very low paint deposition in this probe; they do not alone prove the cause of every prior artistic failure.
- Corrected the diagnostic request to `scale=small` for the small test marks. No diagnostic bypass, new mode, source-code change, artistic-check removal or MCP/UXP restart. The initial create returned `uxp_document_id_unavailable` after creating the document; reconciled the terminal receipt, verified the created target and reused it without another create. The test document was closed after exact image review.
- Evidence: [comparison frame](processes/dab-vs-stroke-diagnostic-process/run-01/export/frames/0001_dab-vs-stroke-probe-paint-20261005-01.jpg), [measurements](processes/dab-vs-stroke-diagnostic-process/run-01/probe-result.json). One live paired comparison and seven point samples; no unit-test expansion/full regression. This is tool evidence, not an artistic success. E.7e remains open for actual form, cloth construction and coherent illumination.
- Verbatim pre-edit Roadmap/Changelog copies were SHA-256 verified in [the archive](processes/documentation-maintenance-process/pre-brush-diagnostic-result-20261004-221816Z/).

## 2026-10-04 — Rendering first; remove the remaining early-stage region bias

- The default mass selector still promoted region-block-in in GLOBAL_BLOCK_IN/COMPOSITION/RECOGNITION_BLOCK_IN, although SHAPE no longer did so. Removed that stage override and its helper. Ordinary mass selection now uses the existing brush preference in every stage; explicit compatible region actions/preferences and actual flat-coverage style evidence remain valid. No new veto, tool, orchestration round or claim that a brush preset establishes volume.
- Reordered Roadmap around actual rendering before further general orchestration. The stairwell stayed in GLOBAL_BLOCK_IN under simple_graphic, and its representation rebuild used 15 flat regions. The cat/rabbit counterexample used a real bristle preset and 11 strokes under nontrivial_painting/SHAPE but still received local target=yes and a finish claim while the masses remained schematic. Therefore switching profile, stage or brush alone does not close artistic quality. The animals face away toward the sunset; acceptance must respect that pose and the original style.
- The next evidence is a bounded substantial image improvement in form/light/material, judged before finishing overlays; only reproduced execution obstacles justify more code. New test count is zero: existing selector expectations were updated. Full pre-edit copies are in [the verified archive](processes/documentation-maintenance-process/pre-brush-rendering-pivot-20261004-195113Z/). Live rendering improvement remains unverified; MCP/UXP reload is still deferred.
- Additional reproduced evidence: the sunset wash used five then four broad native brush strokes, not the Gradient tool. Colour-field strengthening received target=yes; this cannot demonstrate the requested depiction. Validation: five existing selector checks passed, including explicit region execution and intentional flat-coverage evidence; changed-source ESLint and one server build passed. No new tests or full-suite run.

## 2026-10-04 — E.11 short undo restores retained artistic state in the existing cycle

- An ordinary exact-depth undo previously reverted pixels while leaving discarded stage/problem/representation and Director completion facts. The existing pass journal now captures its server-owned pre-pass state from the request projection. Final review restores that bounded state only with exact source history ownership, confirmed undo count, the same document incarnation and intact whole-frame evidence with identical decoded pixels. Preferences/counters and original verdict/failure history survive; a newer Director plan remains authoritative and its stale assessments require review.
- Execution alone no longer retires the rejected source or clears this semantic recovery debt. Interrupted closure retries the same review without another undo. The existing closure transaction snapshots the affected source journal too, preventing journal/state divergence when closure is rolled back. Cached proof invalidates on changed source/baseline evidence or incarnation.
- Review + next pass compiles against the retained facts and revalidates after actual closure; runtime refreshes only the affected source record in its supplied projection. No new Guard/model round, Photoshop read, rollback store or public contract. Legacy/no exact ownership/incarnation retains its explicit physical-only scope; actual contiguous-history and scene/layer parity remain E.11 live acceptance.
- Validation: reduced the new test set from 16 to five distinct scenarios; those five and two existing compiler compatibility checks passed. One server build passed; changed-source ESLint has zero errors (17 pre-existing warnings). Earlier broader recovery probes are preserved, not added to the active suite. Originals and the pre-reduction tests are in [the verified archive](processes/documentation-maintenance-process/pre-bounded-undo-semantics-20261004-190422Z/). MCP/UXP were not restarted.

## 2026-10-04 — E.17 read-only progress cannot request a visual review by tool-name heuristic

- Explicit nonvisual classification now wins over `paint`/`transform` fragments in a tool name. Completed method selection and landmark calculation point to using their result, without inventing a missing final frame or another artistic review. No dispatch/admission change or new call. Covered alongside the localized progress checks; live progress acceptance remains E.17.
- Six-slice validation: 39 distinct focused checks passed (14 progress/public sync-async, four fallback, 15 accepted-anchor and six projection checks). One server build passed; changed-source ESLint has zero errors and 15 existing `any` warnings. MCP/UXP were not restarted. Ordinary bounded-undo semantic parity, broader batching and actual quality/time acceptance remain open in Roadmap.

## 2026-10-04 — E.8e reuse presentation state across active-job projections

- Status/resume projection supplies its existing painting-state snapshot to active-job narration. Standalone job scans load presentation state once, lazily, rather than once per active job. Selected commentary language is preserved; each new request still observes fresh job/state data. No new endpoint, cache owner or Photoshop call.
- Validation: six focused projection/state-reuse checks passed, including multiple jobs, zero reads with supplied state and existing status/resume single-scan expectations. Originals are in [the verified archive](processes/documentation-maintenance-process/pre-priority-roadmap-continuation-20261004-174444Z/). Hard response-byte budgeting and live throughput remain E.8e work; no MCP/UXP restart.

## 2026-10-04 — E.11 restore Director progress without reverting a newer plan

- The existing exact-anchor semantic snapshot also captures bounded Director task/progress/assessment and global-finish facts. The same directive revision restores those outcomes while retaining its plan; rejected-only completion/final-comparison claims disappear. A newer directive remains authoritative, with discarded-frame assessments invalidated and ordinary Director review due on the exact restored frame.
- No additional state store, model certificate, Guard round or Photoshop read. Snapshot identities/scopes validate before history retirement or closure. The public restore result and durable verdict expose the actual mutable/Director scope, including legacy physical-only recovery. Validation: all 15 accepted-anchor checks passed, including same-plan unfinished-task recovery, changed-plan preservation, legacy scope and mismatched semantic identity retaining the barrier/history debt. Source/doc originals are in [the verified archive](processes/documentation-maintenance-process/pre-priority-roadmap-continuation-20261004-174444Z/). Ordinary bounded undo and live parity remain open; no MCP/UXP restart.

## 2026-10-04 — E.11 restore mutable scene facts with the exact accepted anchor

- Existing accepted-anchor snapshots now capture server-derived stage, active problem, visual problems, representation/physical-stack/review debt and confirmed-goal facts. Exact verified restoration restores those fields, including removal of rejected-only facts; current preferences, run counters and original verdict/failure history remain intact. Legacy snapshots report their limited semantic scope explicitly.
- Mutable state persists before final verdict publication or barrier release. Interrupted persistence keeps closure pending and can finish from the existing verification without another Photoshop undo. Mismatched semantic snapshot identity or scope cannot close restoration.
- Validation: all 11 accepted-anchor checks passed, including semantic recovery across restart and interrupted persistence. Complete pre-edit copies are in [the verified archive](processes/documentation-maintenance-process/pre-priority-roadmap-continuation-20261004-174444Z/). Art Director assessment, ordinary undo and live parity remain E.11 work; no MCP/UXP restart.

## 2026-10-04 — E.7c fallback explanation cannot reject a primary brush pass

- Removed a reproduced parser refusal caused solely by `fallback_reason` without a fallback method ID. Descriptive notes remain audit guidance and do not invent fallback authority. A primary brush-built continuous field now accepts such a note; the optical-veil restriction still requires its executable fallback identity.
- Validation: four focused MATERIAL/continuous-field/fallback checks passed. No execution constants, review obligations or method restrictions changed. Full pre-edit copies are in [the verified archive](processes/documentation-maintenance-process/pre-priority-roadmap-continuation-20261004-174444Z/); live acceptance remains in E.7c.

## 2026-10-04 — E.17 truthful progress across jobs, diagnostics and resume

- Progress uses the primary commentary language and preserved artistic intent across job start, failure diagnostics and resume, independently of panel UI locale. Recorded observations retain their defects; command completion no longer claims a captured/reviewed image when none exists. Terminal nonexecution, failure and partial/uncertain execution cannot be reported as completed.
- Confirmed nonexecution points to request correction without unnecessary reconciliation; a recorded accepted review no longer asks for a second visual review. Pending rollback remains distinct from a completed reversal. Pre-dispatch rows use the stable request identity. The async hot path reuses the existing presentation snapshot rather than loading new state for language.
- Validation: 13 focused progress/public sync-async checks passed. No Photoshop/MCP restart or live speed/quality claim. Complete source/doc snapshots are SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-priority-roadmap-continuation-20261004-174444Z/); E.17 retains live acceptance.

## 2026-10-04 — E.17 localized narration and effective commentary detail

- Fixed compact/intent compilation overwriting artist-facing narration with the technical goal. Optional `artistic_commentary` now survives both routes; the goal remains authoritative for execution. A script-language mismatch produces a non-blocking cycle hint and can be repaired in `previous_observation.artistic_commentary` during the ordinary review closure. There is no translator, extra Guard cycle, admission gate or Photoshop read. Source prose is retained when no localized narration is supplied; the server cannot recover unsent chat text.
- Frame commentary now honors detail in artistic/mixed modes: short retains intent, tool names and the complete observed result; normal adds layer, preset and recorded main settings; detailed also lists region colors/opacities and gradient stops on readable separate lines. Stroke/dab parameter overrides contribute their recorded brush settings. The technical audit layout and original artistic limitations remain intact; verbosity never invents a quality claim.
- Repaired the two completed dreamcore stairwell comments using translations of their recorded intentions, with durable presentation overrides and provenance. Original goals, actions, reports and artistic verdicts are preserved. Sixteen full pre-edit snapshots are SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-commentary-language-detail-20261004-171707Z/), alongside repair/audit evidence.
- Output language is the existing primary `user_config.language`, independent of the UXP panel's locale. It applies at every commentary detail level; changing it does not reset mode/detail. The mismatch hint also uses that output language. Plugin UI localization is unchanged.
- Validation: 18 focused tests passed, including six saved-language/detail combinations, public initial narration and ordinary closure repair with unchanged mutation/preview counts, Russian/English correction, preserved limitations and existing final-review rollback refresh. Server build, narrow source ESLint (zero errors, three existing warnings) and painting-policy verification passed. MCP/UXP have not been restarted; live verification remains in E.17.

## 2026-10-04 — E.11 retire restored history only after exact anchor verification

- Verified accepted-anchor restoration retires only its Guard-owned same-document history suffix from current-frame authority. Retained owner bindings, hypotheses/construction revisions and geometry models survive; discarded layer owners disappear. Original verdicts and failure history remain intact across restart. Current geometry, lighting/color, camera and ownership-plan selectors ignore invalidated source records; historical revision lookups remain available.
- Preview/state parity must pass before retirement or closure. Interrupted journal retirement stays pending and supports idempotent semantic completion without another Photoshop undo. Cross-document/out-of-range/missing history fails closed. Mutable state outside journal projections (active problem, stage/finish and representation/review debt) and live parity remain the next E.11 slice.
- Validation: accepted-anchor module covers retained owner/model recovery and restart, preserved failures, parity mismatch retaining rollback debt, interrupted semantic completion and existing stale/ambiguous anchor refusals. Full pre-edit copies are [archived](processes/documentation-maintenance-process/pre-continuation-rollback-three-tasks-20261004-155135Z/). No MCP/UXP restart or live quality/speed claim.
- Three-slice validation: 36 distinct focused tests passed (9 anchor, 8 session-store, 17 artistic-recovery, 2 combined/async); server build passed, source ESLint has zero errors and 15 pre-existing `any` warnings. E.22 progressive canvas playback remains planned, not implemented by these changes.

## 2026-10-04 — E.11 retire rejected owner authority after complete bounded undo

- Reproduced and fixed successful bounded undo leaving the rejected pass authoritative for physical owner bindings and construction revisions. Completed ordinary undo marks that source as rolled back/non-authoritative; existing journal projections recover the retained owner while preserving the rejected verdict and learning history. Failed or mismatched-depth undo cannot mark rollback completed or clear its debt.
- Anchor restore is excluded from ordinary undo finalization: its separate exact preview/state verifier owns completion. Visual repaint rollback is not promoted to proven Photoshop history reversal. Six focused tests passed, including full/partial/failed undo and existing owner restart/stack/trend checks; full semantic-state/live parity remains open. Pre-edit copies are [archived](processes/documentation-maintenance-process/pre-continuation-rollback-three-tasks-20261004-155135Z/); no MCP/UXP restart.

## 2026-10-04 — E.8e strategy feedback reaches combined and async results

- Ordinary successful visual cycle envelopes include bounded same-problem recovery feedback from the request-local snapshot. Combined closure uses the just-recorded observation; async execution stores the same envelope, so polling delivers it without recomputing recovery. Rollback/uncertain execution receives no speculative continuation feedback; existing preview/review/receipt barriers and policy remain authoritative.
- Validation: two focused public-flow tests passed for synchronous and asynchronous combined closure after confirmed no effect; one mutation/final preview, stable problem ID, supplied projection reuse and no recovery recalculation on repeated poll. Complete snapshots are SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-continuation-rollback-three-tasks-20261004-155135Z/). MCP/UXP were not restarted; live usefulness stays in Roadmap.

## 2026-10-04 — E.8e bounded strategy history in existing continuation actions

- Existing close-only/status/resume next-action text now includes failed, regressive and promising strategy families plus the existing policy's required causal change/escalation level. It reuses the already calculated recovery history and request projection: no new memory/status/Photoshop call or state owner. Families are observed outcomes, not preferred-method recommendations; neutral acceptance/invalidated improvements cannot become promising evidence.
- Each category keeps at most three recent family labels (64 UTF-8 bytes plus an ellipsis when clipped) and an omitted count. Complete identities/history remain authoritative for admission and on disk; the bounded display cannot authorize parameter-only retries or reset exhaustion.
- Validation: all 17 recovery-module checks passed, including same-problem isolation, preserved retained improvement, zero fresh journal/state loads in the projected continuation, long multibyte-label bounds, rollback/resolution, restart and parameter-only retry policy. Combined closure/poll delivery and actual restore/live usefulness remain Roadmap gates. Full pre-edit copies are [archived](processes/documentation-maintenance-process/pre-owner-recovery-three-tasks-20261004-151925Z/). MCP/UXP were not restarted.
- Final three-slice check: 28 focused tests passed (77 unrelated tests skipped), TypeScript/server build passed; source ESLint has zero errors and two pre-existing `any` warnings. No live speed/quality or full semantic-rollback parity claim.

## 2026-10-04 — E.11/E.8e preserve recovery learning after frame invalidation

- Reproduced and fixed rolled-back or non-authoritative resolved attempts erasing same-problem failure history. Such records remain in the attempt history and rollback counts, but cannot resolve the problem or supply useful retained work/strongest-known frames. Administrative acceptance of neutral results is no longer presented as useful artistic progress; a retained accepted observed improvement still resets a genuinely resolved problem.
- Validation: all 15 tests in the recovery module passed, including three new regressions that failed before the fix, restart durability, parameter-only retries, distinct strategies and finite exhaustion. No additional journal/Photoshop reads or rollback store. This closes the learning-history defect only; full semantic undo/anchor parity remains E.11 work. Full pre-edit copies are [archived](processes/documentation-maintenance-process/pre-owner-recovery-three-tasks-20261004-151925Z/); MCP/UXP were not restarted.

## 2026-10-04 — E.8e inherit continuing-owner description and rollback facts

- Compact continuation/adjustment inherits an omitted hypothesis from the existing durable owner. An omitted rollback value follows the explicit current layer-separation assessment, then the saved owner value; its duplicated separation field is filled only when absent. Explicit reassessments/conflicts and unknown/new-owner requirements remain authoritative. No invented default, new state read or repair/recompile is needed.
- Validation: 10 focused checks passed (78 skipped): both continuation modes with saved/current rollback assessments, explicit reassessment, and existing target-authority/conflict cases; one final preview and zero auto-repairs remain. Full source/test/Roadmap/CHANGELOG snapshots are SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-owner-recovery-three-tasks-20261004-151925Z/). MCP/UXP were not restarted; live validation stays in AUD-08.

## 2026-10-04 — E.8e inherit the continuing owner's target before preflight repair

- Compact `continue-logical-layer` / `adjust` now inherit omitted physical layer ID and name from the same document's durable owner during first compilation. This removes the internal rejection/repair/recompile used by the existing facade for that omission; it is not a measured model-round-trip or wall-time speedup.
- Use the owner's authoritative current layer after multi-layer migration; never guess from member IDs when current authority is missing. Explicit conflicting IDs and mutation-target/semantic-owner mismatch remain refused. Actual dispatch pins the inherited target, with no new state/preview read, lookup surface or metadata store.
- Validation: six focused checks passed (77 unrelated tests skipped), covering ordinary continuation, adjustment, migrated owners, wrong explicit ID, missing current authority and existing semantic-pollution refusal. Successful paths retain one final preview and zero automatic repairs. TypeScript/server build passed; source ESLint has zero errors and two pre-existing `any` warnings. Four full pre-edit files are SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-owner-target-inheritance-20261004-144518Z/). MCP/UXP were not restarted; live proof remains in AUD-08 after the deferred reload.

## 2026-10-04 — E.7c MATERIAL passes no longer require a planning questionnaire

- Removed `material_response_plan_required` from compact direct/bundled compilation and VisualMicroPlan parsing. A MATERIAL brush/filter pass can execute without restating the seven-component material plan. No plan, passed certificate or completion claim is fabricated from omission; final preview/review, observed debt and exact-frame refinement/DETAIL requirements remain unchanged.
- Supplied plans still normalize/validate role/style structure, with existing bundled scene-lighting/geometry checks preserved. Fixed the direct filter route rejecting its compiler-normalized planning metadata as an unsupported journal request field; it now remains audit-only metadata, never durable owner-binding or review authority. Removed the retired refusal classification and aligned schemas, AGENTS and canonical methods guidance.
- Validation: 15 focused checks passed (152 unrelated tests skipped), covering direct blur and bundled brush with/without a plan, unchanged preview specs/counts, retained final review, invalid supplied metadata, missing lighting model and existing texture-only/material-debt/detail refusals. TypeScript, server build and painting-policy verification passed; source ESLint has zero errors and three pre-existing `any` warnings. Twelve full pre-edit snapshots are in [the SHA256/size-verified archive](processes/documentation-maintenance-process/pre-optional-material-plan-20261004-140759Z/). No MCP/UXP restart or live quality/speed claim; Roadmap retains the owning live check.

## 2026-10-04 — E.22 progressive drawing presentation queued after the capture trial

- Added the user's next step to E.22: demonstrate intermediate canvas states inside the existing UXP execution batch, with one Guard operation and final review. The optional capture path must preserve painting/recovery semantics and measure overhead; duplicated frames, fixed-delay inflation or before/after crossfades cannot prove progressive drawing.
- Planning only; no executor change, tests/build or runtime restart. Full Roadmap/CHANGELOG snapshots were SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-progressive-video-plan-20261004-140053Z/).

## 2026-10-04 — E.22 test capture at 120 fps with quarter-speed action clips

- Capture now requests 120 fps through the existing HWND/gdigrab routes. Action trimming presents each retained frame once at 30 fps, slowing individual clips by four without slowing Photoshop execution or adding Guard rounds. Final assembly stays at 30 fps and does not slow the clips again.
- New trace entries retain real operation timestamps plus frame-derived playback duration for SRT/assembly timing; older entries keep their previous timing/speed. Existing recorder failure isolation and non-authoritative video semantics remain unchanged. Stable delivery of 120 distinct Photoshop frames remains a live check after the deferred restart.
- The real FFmpeg smoke exposed and fixed existing subtitle-filter escaping of Windows paths, including spaces, apostrophes and brackets. Two synthetic action clips retained 120/60 frames at 30 fps for 4/2 seconds; the assembled captioned MP4 retained 180 frames for 6 seconds, with correct 0–4/4–6-second SRT boundaries and no second slowdown. No Photoshop capture was used.
- Validation: all 20 tests in the recorder module, source ESLint and server build passed; real FFmpeg/ffprobe smoke evidence is [archived](processes/documentation-maintenance-process/pre-video-120fps-guard-intake-20261004-134829Z/video-smoke-evidence.json). Full pre-edit source/test/Roadmap/CHANGELOG/source-note snapshots were SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-video-120fps-guard-intake-20261004-134829Z/). MCP/UXP were not restarted; the current child still needs the deferred reload to use this test setting.

## 2026-10-04 — Guard reliability ideas assigned to existing Roadmap tasks

- Reviewed [the supplied plan](processes/documentation-maintenance-process/pre-video-120fps-guard-intake-20261004-134829Z/docs/PAINTPILOT-GUARD-RELIABILITY-PLAN.md) against current compiler inheritance, automatic checkpoint, effect classification and anchor restore paths. The note remains intact as design context; Roadmap is the single ordered queue. No Guard change is implemented by this intake.

| Source | Decision / owning work |
| --- | --- |
| P0.1 no-effect | E.17: terminal execution plus exact decoded equality; reject below-threshold delta as proof of absence. Partial/uncertain dispatch still reconciles. Existing no-op artistic normalization is not reopened. |
| P0.2 mechanism matrix | E.14: reuse runtime capability evidence and invalidate on backend drift. Known ineffective mechanisms are unsuitable for structural fixes; missing proof does not impose a universal probe/admission gate. |
| P0.3 inheritance | E.8e/AUD-08: current compiler already inherits many owner fields; fix only reproduced omissions/conflicts without extra reads. |
| P0.4 semantic rollback | E.11: verify ordinary undo and exact-anchor restore return owner/construction/geometry/depth/surface/scene semantics as well as pixels; preserve failed-attempt history. |
| P1.1 staging | E.6: pull forward the observed local temple-mask/whole-owner destruction case; use existing bounded staging/ownership, not staging on every mutation. |
| P1.2 strategy projection | E.8e: derive one bounded actionable projection from existing attempt history; no separate memory or status archaeology. |
| P1.3 checkpoints | Already implemented in runtime; E.8a owns remaining failure/parity/timing validation. Do not add another save lifecycle. |
| P1.4 preparation grouping | Independent E.7b slice: nonvisual preparation + one proven bounded mutation, one review; later mixed-method expansion still depends on E.11. |
| P2.1 impact estimator / P2.2 unified transaction | Conditional on repeated implementation duplication or failures; extend existing mechanisms first. No immediate new abstraction/controller project. |
| P2.3 benchmark | Extend existing E.8 scenarios; 50% fewer avoidable failure-path model turns is a target, not a gate or measured result; pair with unchanged safety and actual image quality. |

- Documentation validation: narrow changes preserve existing task ownership/dependencies and quality/safety criteria; the complete source note is unchanged, including deferred ideas. No new independent Guard queue, controller, mandatory capability-probe cycle or aesthetic score was adopted.

## 2026-10-04 — E.17 frame comments refresh from final review instead of stale placeholders

- Reproduced the user's exact temple-mask and mountain-ridge examples in run-02 journals. Both contained specific English intent and observed failed results, while the frame TXT retained a generic Russian success-like summary. The active process had emitted the pre-fix compact formatter; final verdict closure only rewrote comments for proven no-ops.
- Final visual closure now refreshes the frame sidecar and compact report result from the normalized observed verdict. Sidecar rendering also prefers the saved verdict when reopening a legacy report. Failed passes retain their real defects and explicitly state that rollback was selected, without claiming rollback has already executed.
- Preserved the pre-pass text verbatim instead of rewriting it into "Now I want"; removed redundant generic completion text from compact artistic/mixed comments. Compact Did uses known Photoshop technique/settings. Added gradient-mask direction/bounds, region-fill RGB/opacity and the declared working-layer name to the existing formatter.
- Existing `goal` schema descriptions now identify the exact artist-facing chat message in the selected language; no new field, call, translation service or prose veto. Source English is preserved when Russian chat prose was never sent to MCP; the formatter does not invent a translation or observation.
- Restored the two affected frame TXT files in Russian from the recorded intent/settings/review, with translation provenance in the maintenance archive. They are reconstructions from the journals, not verbatim recoveries of absent chat text. Operation journals and Photoshop pixels were not rewritten.
- Validation: six focused sidecar/closure/language tests, TypeScript, source ESLint, painting-policy verification and server build passed. Eight full current-file snapshots were SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-commentary-refresh-20261004-131623Z/). MCP/UXP reload remains deferred; the running old process needs reload to use this fix.

## 2026-10-04 — E.17 physical-stack review no longer requires a separate Art Director call

- Moved physical-stack authority to document state. Ordinary `previous_observation.physical_stack_check` reuses the Director's existing schema/normalizer; closure derives exact preview SHA and operation id. The VALUE/later gate now works with and without an active Director. Changing/reviewing a directive preserves the document check when no replacement is supplied. Combined observation+next-pass validates the supplied review, installs it at closure and rechecks the durable gate before dispatch; it does not force a separate close-only call.
- Kept observed depth/occlusion/opaque coverage/transparency/layer-order criteria and physical-owner signatures. Missing review remains pending; omission cannot erase observed debt. Fresh nontrivial runs and structural stage resets start pending; structural-owner changes invalidate a pass. Legacy journals already beyond the gate without the field retain their compatibility path.
- Exact same-document/current-operation whole-frame evidence remains required; crop, stale/foreign/forged evidence cannot certify the physical stack. A failed review cannot complete its target/task; rolled-back review evidence is not installed as the document check. Existing geometric layer-order and new structural-owner checks remain unchanged.
- Removed the mandatory Director wording from AGENTS. Roadmap retains only the live proof after the deferred reload. This reduces separate setup/review calls, not the requirement to observe actual pixels or prove artistic finish.
- Validation: 152 related test cases passed across physical-stack, compact-cycle and Planner/Painter modules (151 in the combined run plus the repaired legacy-fixture case on targeted rerun). Covers combined SHAPE→FORM closure, invalid review rejected before dispatch and no extra Photoshop calls for ordinary closure. TypeScript, server build and painting-policy checks passed; source ESLint has zero errors and three pre-existing `any` warnings. Eleven full pre-edit files were SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-physical-review-20261004-122820Z/). MCP/UXP were not restarted; live speed/quality impact remains unmeasured.

## 2026-10-04 — Rendering progress: remove contour-count certification and close proven no-ops without repair turns

- Confirmed the existing SHAPE routing fix: region fill has no automatic priority for modelling. Removed `structured_mass_iconic_primitive_compound` and its 3–4-point preflight heuristic; adding a fifth point can no longer serve as a workaround. Valid planes and early scaffolds remain executable, while actual geometry/method/protection checks and ordinary visual-review barriers remain active. Admission does not establish modelled form.
- Integrated the parallel owner-local representation-fidelity bridge: observed primitive/scaffold debt remains unfinished across refinement/detail and exact style exemptions are preserved. No independent image evaluator, new review service or universal form-quality score is claimed.
- Added exact full decoded-pixel equality to the existing BEFORE/AFTER computation. For a comparable unchanged whole frame, a claimed accepted improvement/task completion is normalized to neutral/unresolved/task-continue. Closure returns the factual correction immediately rather than refusing the wording and causing another repair turn. Sparse zero-delta samples, JPEG byte identity, changed frames and unavailable comparison are not substituted for that exact proof.
- Corrected no-op frame comments and stored report results; the original unsupported claim remains in the operation journal. Creative intent/tools are retained. The correction cannot resolve the tracked goal or count as artistic improvement, and owner-debt checks run against the corrected claim. No new transport read, model-authored certificate or numerical quality gate was added.
- Finished the previously failing painting prompt check: sticky commentary commands, creative/tutorial explanation and selected language are explicit; shortened repeated wording from 18,287 to 17,965 source characters while retaining execution/recovery/capture/critic invariants. Historical performance notes now identify the retired vertex heuristic accurately. Roadmap retains only the owning live rendering/opacity experiments.
- Validation: all 213 tests in the six affected Guard/representation/method/opacity/routing modules passed; `build:server`, painting-policy verification, source ESLint and UXP JavaScript syntax checks passed (two pre-existing `any` warnings in cycle-compiler). Thirteen full pre-edit originals were SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-rendering-progress-20261004-094218Z/); its `concurrent-checkpoint/` preserves the parallel work before integration. MCP/UXP were not restarted; live visual improvement remains to be demonstrated after the deferred reload.

## 2026-10-04 — Owner-local representation fidelity bridge

- Separated recognition/detail economy from representation fidelity without adding a subject-specific art rule: a representational semantic owner reviewed with `primitive_footprint=suspect` now carries durable owner-local `scaffold-debt`, mapped to `representation_change=insufficient` and `residual_block_in=debt` even when the subject is recognizable.
- Guard no longer permits `target_resolved=yes` for that primitive/scaffold-dominant owner. The debt is exposed in artistic continuation context, blocks a passing representational `refinement_check`, `DETAIL`, and nontrivial finalization, and clears only after a reviewed `primitive_footprint=none|acceptable` resolving pass. Intentional flat/iconic/primitive output remains available only through the existing exact `style_contract` exemption.
- Added a subject-agnostic regression pack covering recognizable-but-primitive refusal, durable owner debt and continuation visibility, later structural resolution, DETAIL blocking and exact style exemption. No object-name heuristics or canonical "correct shape" recipes were introduced.
- Validation at that checkpoint: 169 focused tests passed across the new bridge, refinement gate, compact Guard contract and SessionStore regressions; `npm run build:server` and source ESLint for `session-store.ts` passed. Painting-policy prompt compactness/commentary failures were left open there and are resolved by the subsequent rendering-progress change above.

## 2026-10-04 — E.7e local brush transparency and factual layer compositing

- Fixed UXP stroke/dab overrides leaking size/opacity/flow into later marks with omitted settings, later AUTO chunks and subsequent calls. Omission now uses the prepared brush baseline; temporary overrides restore it before history commit, with best-effort restoration on failed batches. Persistent changes remain `photoshop_set_brush`. Dabs establish Brush Tool before reading its options, and the accepted color-write/brush-reapplication order is preserved.
- Strokes/dabs and region receipts now include actual target-layer and parent-group opacity, fill opacity and blend mode from DOM properties. These facts survive real tool routing and the compact Guard `confirmed_targets.paint_targets` projection, including bundled mutations; no additional model-authored certificate, transport read, review call or refusal was added. Intentional layer/group transparency and explicit translucent brush settings are preserved. Execution settings are not a pixel-coverage or artistic-quality certificate.
- The methods policy separates opaque body coverage from translucent modelling and effects. Roadmap keeps only the remaining live occlusion/transparency check after the deferred reload.
- Validation: 23 focused native-loop/routing tests passed, including baseline inheritance, color-write recovery, separate calls/chunks, failure rollback, deliberate transparency, PENCIL isolation and compact bundled/region facts; `tsc --noEmit`, JavaScript syntax and source ESLint checks passed. Full pre-edit snapshots were SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-paint-opacity-20261004-092503Z/). Build, MCP/UXP restart and live Photoshop confirmation remain deferred.

## 2026-10-04 — E.7c/E.7e large-area construction is no longer locked to gradients or polygon block-in

- `continuous-field` now offers installed-brush strokes and soft-brush buildup alongside the native linear gradient; soft-brush buildup supports actual construction of painted masses. A gradient remains a valid base field, not evidence that an entire depicted area has reached its requested form/light/material finish.
- `SHAPE` no longer automatically ranks region block-in first. Genuine early recognition/composition/block-in keeps its fast scaffold. Compatible concrete actions retain their chosen mechanism rather than being rewritten to a newly preferred brush or gradient; explicit exclusions, capability/impact compatibility and existing execution/target/review checks remain in force.
- The planning tool now honors its existing `preferred_method_id` for ordinary painting. Construction-role compilation accepts that compatible choice, derives uniquely compatible methods from actual mutation tools and uses relevant existing style traits. No new model-authored certificate, discovery call, execution field or controller was added.
- Removed VisualMicroPlan's requirement to invent `fallback_from_method_id=continuous-color-field` when brush construction is the primary continuous-field method. Unrelated mechanisms retain their explicit fallback path; fake gradient labels on region fills remain rejected. Installed presets still require the existing brush-role/preparation evidence.
- Host guidance and the canonical methods policy separate completion of a field/texture pass from completion of the depicted area through the existing frame observation/task assessment; removed stale gradient-only and universal region-mass recommendations. Roadmap E.7e now targets the largest deficient area as well as focal objects, including sky/terrain, with brief-relative structure/depth and intentional-flat controls rather than mandatory clouds/noise/texture.
- Validation: 24 focused method-palette, compact Guard and VisualMicroPlan tests passed; `tsc --noEmit` passed. Includes primary brush-field execution with and without a preferred-method hint, preserved final preview, region/icon refusals and existing gradient metadata derivation. Full pre-edit snapshots are SHA256-verified in [the archive](processes/documentation-maintenance-process/pre-area-rendering-choice-20261004-090047Z/). No build/restart/live painting performed; artistic quality gain remains an E.7e live check.

## 2026-10-04 — E.17 compact artistic frame comments retain intent, craft and observed limits

- Fixed the compact report assembler replacing every artistic rationale with a generic Photoshop-pass sentence. `why` now retains the existing artistic intent/goal; execution confirmation remains separate from observed artistic gain.
- Preserve the complete supplied `previous_observation.observed` paragraph in frame sidecars, including unresolved geometry, preservation choices and the next artistic step. Legacy region observations are all retained when no overall observation exists. A language mismatch no longer silently replaces meaningful source prose with a placeholder; caller-authored text must still follow the selected language, while local scaffolding remains localized.
- Reuse the existing tool-description renderer: filled regions/layer fill, named brush/layer, every supplied brush configuration (including spacing/smoothing), Gaussian Blur radius, layer opacity/blend mode and gradient endpoints/color stops are displayed from stored actions. Artistic mode hides protocol metadata; mixed mode puts the artistic explanation first and a separate compact technical record afterward.
- Compact sidecars keep execution-only/unassessed and uncertain states explicit rather than conjugating the goal into a claimed accomplishment. Missing result text does not claim that the image was checked. The existing observation field now explains how to reuse the artist-facing post-pass paragraph; no new field, mandatory prose admission, report/model call, state read or review round was added.
- Validation: 9 focused tests passed across SessionStore/embedded Guard, including both artistic/mixed rich comments, language preservation, uncertain/unobserved execution, frame archival and the existing compact closure/no-prose admission cases; `tsc --noEmit` passed. Full-file pre-edit copies were SHA256/size verified in [the archive](processes/documentation-maintenance-process/pre-artistic-commentary-fix-20261004-084316Z/). Server build/restart and live Photoshop confirmation remain deferred; Roadmap retains the owning live check.

## 2026-10-04 — Editmamei ideas consolidated into the canonical Roadmap

- Reviewed the external note against current Roadmap, existing confirmed-target/result projection, capability snapshots, receipt boundaries and host guidance. These are independently evaluated design ideas, not a code port or proof of new runtime gaps. Main quality/time priorities remain unchanged; added only compact owner-specific actions/acceptance.

| Source idea | Decision / canonical destination |
| --- | --- |
| 1. Intent/principle memory | ADAPT: shared invariants; conditional Task 10 audits reproduced recipe leakage and tests transfer to another scene/style. Scene plans/history/fixtures are not universal art recipes; no new memory subsystem without evidence. |
| 2. Authoritative post-state | ADAPT, priority 2 / AUD-08: reuse existing receipt/confirmed_targets only for established facts, separate pinned targets from observed active state, keep unknowns explicit and prove zero added post-state reads. No second mutation-result/state authority. |
| 3. Deterministic verification then visual review | ADAPT, priority 1 / E.17: cheap existing receipt/bounds/mask/BEFORE-AFTER diagnosis for reproduced no-op/wrong-target/out-of-region false conclusions; no new mandatory metrics round or aesthetic score. |
| 4. Reversible/checkpointed mutation | ALREADY COVERED: baseline recovery/checkpoint invariants and E.11 live history proof; do not add a checkpoint before every pass. |
| 5. Local perception | DEFER UNTIL EVIDENCE, Task 15c: existing backend/owner geometry first; bounded edges/components/masks only for repeated coordinate failures and measured benefit. No generic CV/ONNX/face-mesh project. |
| 6. Actual preview after meaningful work | ALREADY COVERED: exact whole-frame/OBJECT/MICRO barriers, debt and E.17 finalization; no second preview pipeline. |
| 7. Tool surface/discovery | ADAPT, parallel P0 / E.8c: measure schema bytes and wrong selection before homogeneous consolidation/search gating; preserve required-action exposure/typing, no mega-tool or mandatory extra discovery call. |
| 8. Runtime overview/capabilities | ADAPT / AUD-29: project existing relevant capability_snapshots/protocol/backend facts; replace stale prompt inventories without new overview/current-state endpoints. |
| 9. Adaptive reusable recipes | ADAPT only as intent/constraints/evidence under idea 1 / conditional Task 10; reject object/stroke/style recipe banks and inaccessible Pro-template assumptions. |
| 10. Community source audit | DEFER UNTIL A REPRODUCED GAP: conditional narrow pinned-revision audit in E.17/E.8e/E.8c; mechanism/current path/gap/adapt-or-reject plus cost and validation. A full parity audit is not the next painting task. |

- [Editmamei README](https://github.com/editmamei/editmamei/blob/dev/README.md) confirms its active-state reporting, verification/capability approach and distinct COM/AppleScript photo-editing boundary. README claims do not validate Community implementation details; source inspection remains conditional before any port. Existing [external-intake policy](docs/external-intake.md) remains authoritative; no source copied, dependency installed or transport changed.
- The superseded active note `docs/PAINTPILOT-EXTERNAL-IDEAS-EDITMAMEI.md` is removed after full SHA256/size verification. Its complete text, references and unadopted ideas remain in the [verbatim archive](processes/documentation-maintenance-process/pre-editmamei-consolidation-20261004-082239Z/docs/PAINTPILOT-EXTERNAL-IDEAS-EDITMAMEI.md), alongside pre-edit Roadmap/CHANGELOG and a preservation audit.
- Documentation-only validation: heading/dependency/acceptance preservation, local links and narrow diff audit; no code, build, tests or MCP restart. The preceding hot-loop-reference change is included in these checks.

## 2026-10-04 — Historical hot-loop plan and remaining acceptance targets

- Marked PAINTING-HOT-LOOP-OPTIMIZATION-PLAN as a historical technical reference: E.8d owns its implemented foundation; P0-A…P0-H are not a new backlog. Current Roadmap owns remaining hardening and acceptance. Preserved the original technical details and dated benchmark evidence.
- Added compact warm-route median targets to E.8: actual review-to-intent 10–15 s, server intent-received-to-dispatch ≤2 s and ≤1.5 model-visible Guard calls per artistic mutation. Targets do not become runtime gates; a diagnostic proxy cannot validate an unknown intent-ready interval.
- E.8e now requires controlled live evidence for an existing deterministic repair and safe split/defer, with audit/no-recovery/no-extra-read and review-dependent continuation, paired with E.8 artistic quality comparison. The 2026-10-02 benchmark exercised zero automatic repairs/splits; its engineering result does not close these live cases or total quality/time acceptance.
- Documentation-only checks: full SHA256-verified backups, narrow diff/local-link/preservation audit. No code, build, tests or MCP restart. [Backup](processes/documentation-maintenance-process/pre-hotloop-reference-20261004-081940Z/).

## 2026-10-04 — Roadmap compaction: open actions and acceptance only

- Condensed PAINTING-ROADMAP from 510 lines / 41,772 bytes / 4,941 words to 368 lines / 27,283 bytes / 3,052 words. Kept open task headings/dependencies, centralized safety/quality invariants and moved E.8b/E.8c beside E.8. Ready implementations retain only concrete validation/live gates; completion records belong here. No implementation or live/human acceptance was promoted by this cleanup.
- Retired implementation descriptions: E.7a independent closure/checkpoints; E.8d typed repair and AUD-01 request-local snapshots; AUD-10/AUD-11/AUD-27 typed repair/splitting, numeric budgets and encountered/repaired/unresolved class/code accounting; AUD-09 bounded problem/task/dependency/owner continuation. AUD-09 still awaits the separate canonical painting-policy gate; unknown ambiguity remains semantic/systemic. Existing dated entries retain the detailed test and implementation history.
- AUD-16/AUD-37 brush role/preflight reuse preserves the original probe epoch on identical evidence. Catalog/preset, effective-settings and authoritative UXP runtime-instance drift record catalog_changed/settings_changed/runtime_changed; healthy repeated art-run binding plus a visual pass already proves zero inventory/settings reads. Only the one-drift/one-reprobe live gate remains. AUD-29 geometry summary, E.7c softness/method/cadence and E.17 compact results/captions/accepted-task prerequisite are recorded in their 2026-10-04 entries above.
- E.18 current-tree revalidation on 2026-10-03 was 152/152 PASS; the earlier one compact-contract and four session-store failures no longer reproduced in that saved tree. Stale-child/transient ENOTEMPTY build history does not reopen geometry helper/transform/debt implementation. E.11 repository ownership/rollback plumbing, E.19 model/binding/preflight/invalidation, E.22 capture/shutdown reliability, E.8c local exposure mitigation and P1-D.3a local config/UI/live acceptance are historical; their remaining live/host/portable gates stay in Roadmap.
- Moved baseline timing evidence out of active instructions: night-city run-01 was approximately 29:10; 14 successful operations totalled preflight 35.647 s, dispatch 12.826 s and complete Guard cycles 77.001 s. Dispatch includes embedded preview work; unsuccessful attempts are excluded. These historical totals neither measure the current runtime nor attribute all other wall time to Guard CPU. The matched benchmark and old-budget target remain open in E.8.
- Validation is documentation-only: full SHA256-verified snapshots, heading/open-task preservation, local-link and narrow diff audits. Per-slice checks stay narrow; canonical verification remains required at machine closure/before PR or release. No code changes, build, tests or MCP restart.
- Full pre-cleanup source and preservation audit: [archive](processes/documentation-maintenance-process/pre-roadmap-compaction-20261004T080229Z/docs/PAINTING-ROADMAP.md), [audit](processes/documentation-maintenance-process/pre-roadmap-compaction-20261004T080229Z/preservation-audit.json). Every removed source fact remains in the verbatim snapshot.

## 2026-10-04 — E.8e / AUD-29 bounded geometry summary in status/resume

- Status/resume now project Scene Geometry identity, revision, applicability, exact source-frame binding, projection kind and the source operation journal path instead of repeating all geometry coordinates. Full geometry remains in the durable journal and compiler context; owner binding/debt and recovery projections are unchanged.
- A 512-line regression reduces the geometry payload from approximately 34.5 KB to under 1 KB, preserves full-model retrieval and exact document-incarnation filtering, and keeps the single-snapshot scan invariant. This closes only the geometry-summary slice; the overall status/resume hard byte budget remains open.
- Validation: focused status/resume regressions **3/3 PASS**, `tsc --noEmit` **PASS**, narrow `git diff --check` **PASS**. No build or MCP restart; live latency/artistic acceptance remains unmeasured.

## 2026-10-04 — E.7c advisory cadence no longer requires Director setup boilerplate

- Removed the mandatory one/two-pass strategy checkpoint from the model-facing schema and instructions. Cadence and initial strategy-validation fields are optional: new directives default to 2/pending; omission on the same directive preserves its configured cadence and existing validation state.
- Reaching the advisory count does not force a Director call. Existing evidence-triggered task/whole-frame review and persisted due-strategy review remain authoritative; the latter still requires exact-current-frame pass/replan evidence. Aligned AGENTS and host guidance with runtime behavior.
- Validation: focused Planner cases **3/3 PASS**, `tsc --noEmit` **PASS**, narrow `git diff --check` **PASS**. No build or MCP restart; live acceptance remains open.

## 2026-10-04 — E.7c bundled methods reuse executable derivation

- VisualMicroPlan now reuses the direct-operation capability-based method resolver when its actual mutation tools uniquely identify an available method compatible with the declared intent/impact. A prepared soft-dab pass survives stale Smudge metadata without a model repair turn; actions, parameters, targets, brush preparation and preview contract remain unchanged.
- Explicit construction roles, ambiguous choices, avoided methods and destructive replacement/erase/rollback retain their existing refusal paths. Semantic step-method/tool validation is unchanged; no new schema, keyword rule or orchestration layer was added.
- Validation: focused compact-contract cases **6/6 PASS**, `tsc --noEmit` **PASS**, narrow `git diff --check` **PASS**. Method-derivation live acceptance remains open. No build or MCP restart.

## 2026-10-04 — E.7c derived continuous fields no longer reject stale descriptive metadata

- When color-gradient actions uniquely derive `construction_role=continuous-field`, ordinary additive/refinement passes now normalize stale visual-intent/preferred-method hints to that executable construction instead of demanding a model resubmission. Actions, layer targets, coordinates, stops and mandatory preview remain unchanged; no goal-keyword inference or new review step was added.
- Explicit construction roles, excluded methods and destructive replacement/erase/rollback retain the existing refusal path. Other VisualMicroPlan method drift remains open.
- Validation: focused compact-contract cases **8/8 PASS**, `tsc --noEmit` **PASS**, narrow `git diff --check` **PASS**. No build or MCP restart; live artistic/latency acceptance remains open.

## 2026-10-04 — E.7c direct methods derive from unambiguous executable actions

- A direct Photoshop operation no longer rejects solely because a stale preferred method selects another tool, when the actual action uniquely identifies an available method compatible with the declared visual intent/impact. Gaussian Blur now survives stale Smudge metadata without a model repair turn; the tool, arguments and document pin remain unchanged.
- Derivation uses capability data, not goal keywords. Ambiguous/unavailable choices, explicit avoided methods, declared construction roles and destructive replacement/erase/rollback retain their existing authority. VisualMicroPlan descriptive/construction drift remains open.
- Validation: focused compact-contract cases **5/5 PASS**, `tsc --noEmit` **PASS**, narrow `git diff --check` **PASS**. No build or MCP restart; runtime speed/artistic acceptance remains unmeasured.

## 2026-10-04 — E.7c ordinary softness review replaces mandatory duplicate certification

- Broad soft/form/blur/atmosphere work now closes through the ordinary exact-current whole-frame observation; Guard no longer rejects solely because the five-criterion `softness_review` is absent. Omission does not manufacture a passed certificate or criterion notes.
- Optional detailed review retains its validation. Ordinary `soft_dominance` must-fix findings retain rejection of contradictory acceptance/target completion, exact-frame debt, priority blocking and negative trend signals. Document/preview provenance, execution uncertainty and rollback authority are unchanged.
- Aligned the public schema, AGENTS and painting method policy. Validation: softness regressions **12/12 PASS**, `tsc --noEmit` **PASS**, narrow `git diff --check` **PASS**. No build or MCP restart; live perceptual acceptance remains open.

## 2026-10-04 — E.17 execution captions no longer conjugate artistic intent into success

- Compact report `did`, consumed by frame sidecars, now describes confirmed/unconfirmed execution instead of copying the planned artistic goal. Pre-pass intent remains available separately; visual result still comes from observation.
- Technical, artistic and mixed modes all preserve execution uncertainty; no new fields, review rounds or barriers were added.
- Validation: compact-model scenarios across all three modes **3/3 PASS**; `tsc --noEmit` **PASS**. No build or MCP restart. Remaining progress/host-guidance and global artistic assessment work stays open.

## 2026-10-04 — E.17 Planner completion cannot promote discarded attempts

- Art Director task completion now requires an accepted, non-regressing frame as well as explicit task-scope completion evidence. A contradictory `completed` claim on a correction/rollback no longer completes the task or activates its dependent successor; regression/rollback retains the existing failed-task review path.
- Accepted neutral frames can still complete an explicitly assessed task; no new pixel-change quota, schema, questionnaire or model retry was added.
- Validation: focused Planner retention cases **3/3 PASS**; `tsc --noEmit` **PASS**. No build or MCP restart. Remaining brief-quality assessment and Director strategy feedback are still open.

## 2026-10-04 — E.17 compact visual reports separate intent from observation

- Compact closure no longer uses a visual tool's summary/serialized result as artistic observation; those can repeat the requested goal. Without an observation, the report states execution confirmation separately and leaves the visual result unassessed.
- A supplied visual observation remains the result source; no extra model field, review turn or Guard barrier was added. Non-visual execution summaries retain their existing fallback.
- Validation: focused compact-model closure regression **1/1 PASS**; `tsc --noEmit` **PASS**. Remaining E.17 task/global assessment and caption/progress work is still open. No build, live Photoshop run or artistic-quality claim accompanies this slice.

## 2026-10-04 — AUD-16/AUD-37 healthy-path zero-reprobe proof

- Added end-to-end registry counters around the existing capability/art-run reuse regression. Initial run binding, repeated binding of identical durable brush evidence, and a healthy visual pass now explicitly prove **0** calls to both `photoshop_list_brush_presets` and `photoshop_get_brush_settings`.
- This closes the healthy-path half of the run-level brush reuse acceptance without adding a new cache or weakening invalidation. The remaining AUD-16/AUD-37 acceptance is the complementary drift case: one authoritative catalog/settings/runtime change must cause exactly one bounded reprobe.
- Validation: focused embedded-Guard regression **1/1 PASS**; `tsc --noEmit` **PASS**; `git diff --check` **PASS** (line-ending warnings only).

## 2026-10-04 — AUD-16/AUD-37 authoritative runtime invalidation witness

- Added an opaque per-load UXP companion runtime-instance witness to long-poll registration metadata and propagated it through bridge health/readiness without an extra Photoshop command/read.
- `photoshop_guard_set_art_run` now binds newly persisted brush preflight evidence to that authoritative runtime witness internally. A later preflight from a different loaded companion runtime deterministically records `runtime_changed` with `invalidation_source=bridge_runtime_witness`; the model does not supply or interpret the witness.
- Preserved the public brush-preflight schema: runtime identity is transport evidence injected after model-input validation, not another model-authored field. Catalog/settings inference and fail-closed unexplained semantic changes remain unchanged.
- Validation: UXP bridge suite **37/37 PASS**; session-store regressions **75/75 PASS**; focused embedded capability/art-run regression **1/1 PASS**; `tsc --noEmit` **PASS**; `git diff --check` **PASS** (line-ending warnings only). A full embedded-Guard run reached **91 PASS** but one pre-existing long bootstrap-receipt test hit its 5 s timeout; the directly affected focused regression passes.

## 2026-10-04 — AUD-16/AUD-37 observed brush-preflight drift attribution

- Replaced model-only invalidation attribution for run-level brush evidence with deterministic inference where the newly observed evidence is sufficient: installed inventory/preset identity drift becomes `catalog_changed`, while role effective-settings/pressure/probe drift becomes `settings_changed`. Changes that are not explained by those observable facts still fail closed unless an explicit runtime/catalog/settings invalidation is supplied.
- Corrected the public schema placement of `brush_preflight_invalidation`: it now belongs to `photoshop_guard_set_art_run`, where replacement evidence is actually persisted, rather than the read-only status input.
- Persisted `invalidation_source=observed_preflight_diff|explicit` so the audit trail distinguishes inferred Photoshop evidence drift from an explicit runtime invalidation.
- Validation: `tests/session-store-regressions.test.ts` **74/74 PASS**; `tsc --noEmit` **PASS**. Remaining AUD-16/AUD-37 work is authoritative runtime-drift binding plus end-to-end proof that healthy repeated passes cause zero repeated inventory/settings probes and one real drift causes exactly one bounded reprobe.

## 2026-10-04 — AUD-09 bounded artistic continuation closure

- Completed the existing compact artistic-continuation projection instead of adding another planner/status surface. The current problem now carries its bounded region, hypothesis, dependency ids and an explicit structural/global flag; current/next task candidates retain only their relevant owner ids.
- Relevant semantic owners now expose only continuation-critical layer identity plus durable geometry/camera/attention bindings. When task-zone ownership is known, unrelated scene owners are filtered out rather than expanding the continuation payload into a scene reconstruction.
- Preserved request-local projection reuse: the continuation path still consumes supplied records/painting state and does not fetch full scene geometry/lighting/camera models. The focused regression also continues to fail if a hidden journal rescan is introduced.
- Validation: focused continuation regression **1/1 PASS**; full `tests/session-store-regressions.test.ts` **74/74 PASS**; `tsc --noEmit` **PASS**; canonical acceptance suite **1009/1009 PASS** after aligning one stale compact-closure source expectation with the already-present `guard_compact_closure` runtime behavior. The full canonical command then stops at the separate painting-policy verifier because the concurrently edited `digital-painting-control.ts` is missing its required sticky-commentary/tutorial-rationale invariants and exceeds the 18,000-character compactness guard. AUD-09 implementation is complete but final closure remains gated on that repository-wide policy check.

## 2026-10-04 — AUD-16/AUD-37 run-level brush-preflight reuse boundary

- Made durable brush inventory/role/preset/settings evidence genuinely run-level: re-submitting semantically identical brush_preflight now preserves the existing evidence and its original recorded_at probe epoch instead of silently manufacturing a fresh preflight.
- Replacing established brush evidence now fails closed unless the caller supplies a typed relevant invalidation (catalog_changed, settings_changed, or runtime_changed); accepted replacement records the invalidation reason. This prevents ordinary healthy continuation from turning into implicit brush re-probing while leaving a bounded path for real invalidation.
- Exposed the typed invalidation on photoshop_guard_set_art_run and added regression coverage for healthy reuse, unqualified replacement rejection, and settings-driven replacement.
- Validation: tests/session-store-regressions.test.ts **74/74 PASS**; tsc --noEmit **PASS**; git diff --check **PASS** (line-ending warnings only). Remaining AUD-16/AUD-37 work is automatic binding to observed catalog/settings/runtime invalidation plus a repeated-healthy-pass zero-brush-probe regression.

## 2026-10-04 — AUD-S6 async bounded-scan closure

- Revalidated the actual durable async reservation/worker/poll path against both empty and 300-record operation histories. The complete path performs exactly **one** full `SessionStore.records()` scan in either case; reservation and repeated job polling add no journal rescan.
- No production-code change was required for this final slice: the existing prepared-job worker already captures one authoritative request-local projection and reuses it through execution, while the durable job reservation remains the cross-process concurrency authority.
- Added a focused two-size regression so future async-helper additions cannot make full journal scans grow with helper count/history size. Targeted embedded-Guard tests: **2/2 PASS**; `tsc --noEmit`: **PASS**.
- AUD-12/AUD-13/AUD-32 (AUD-S6) is now removed from the active roadmap; the next E.8e implementation slice is bounded continuation/run-level reuse (AUD-09/AUD-16/AUD-37), while AUD-08 remains the separate deterministic-fact compilation slice.

## 2026-10-04 — AUD-S6 compiler artistic-recovery projection reuse

- Removed the independent compiler journal rescan identified by the prior rejected-cycle regression: `collectDynamicOperationViolations()` now receives the cycle/lint request's existing `GuardProjectionContext` and passes its records through `artisticRecoveryForProblem()` instead of falling back to `SessionStore.records()`.
- Kept the optimization request-local and fail-closed: cycle projection refresh after a real abandonment mutation is unchanged, and lint uses its own freshly captured projection.
- Strengthened the focused cycle regression with 300 completed historical records; missing-document recovery plus dynamic compiler recovery now perform exactly **one** full `records()` scan for the request. Targeted embedded-Guard regression: **1/1 PASS**; `tsc --noEmit`: **PASS**.
- AUD-S6 remains open for bounded-scan proof on the actual async reservation/job continuation path and any async-helper rescan that proof exposes.

## 2026-10-04 — AUD-S6 cycle recovery projection reuse

- Reused the cycle request's initial `GuardProjectionContext` for pre-dispatch missing-document/abandonment discovery instead of scanning the operation journal before immediately capturing the same records again.
- Recovery still fails safe: if abandonment actually mutates durable state, the cycle recaptures records/state/jobs before compiler and async-selection decisions; the ordinary non-mutating path keeps the original snapshot.
- Added a focused rejected-cycle regression proving recovery receives the request-local projection and does not add a third journal scan. The fixture exposes one independent residual compiler/state scan, which remains open under AUD-S6.

## 2026-10-04 — AUD-S6 bounded large-history status scan

- Reused the status request's initial `GuardProjectionContext` for missing-document/abandonment discovery instead of scanning operation journals and painting state once before `statusCompact` and then capturing them again.
- Kept recovery correctness explicit: when missing-document reconciliation actually mutates durable abandonment state, status recaptures a fresh projection before constructing the response; the ordinary non-mutating hot path stays at one journal scan.
- Added a 300-operation focused regression proving `statusWithCapabilitySnapshots()` performs exactly one full `records()` scan regardless of history size. Targeted embedded-Guard tests: **2/2 PASS**; `tsc --noEmit`: **PASS**.
- AUD-S6 remains open only for residual async-helper projection propagation and bounded-scan evidence on those paths.

## 2026-10-04 — AUD-S6 resize readiness invalidation

- Revalidated the current tree and completed the pending resize slice without adding a Photoshop state read to the readiness hot path: the UXP companion emits a bounded `document_geometry_changed` event from Photoshop's `imageSize` notification, the bridge advances a local geometry revision, and that revision participates in the existing readiness route fingerprint.
- Added/verified the focused regression proving a cached readiness hit becomes a miss immediately after the resize notification while document id/name/instance witness remain unchanged.
- Fixed the event-parser TypeScript narrowing exposed by this new event kind by keeping the durable `UxpBridgeEvent` contract specific to `document_closed` while parsing inbound event names as strings before dispatch.
- Validation: `src/platform/uxp-bridge-server.test.ts` **37/37 PASS**; `tsc --noEmit` **PASS**. AUD-S6 remains open for residual async/status projection reuse and bounded large-history scan evidence.

## 2026-10-04 — AUD-S6 readiness cache now distinguishes same-id/same-name document reincarnation

- Extended the UXP long-poll registration metadata with the existing per-Document-object instance witness; no new document-state read or alternate transport was introduced.
- Included that witness in the bridge health snapshot and readiness route fingerprint, so a closed/reopened Photoshop document cannot inherit a cached readiness result merely because Photoshop recycled both its numeric document id and filename.
- Added a focused regression covering identical id/name with a changed instance witness. `src/platform/uxp-bridge-server.test.ts`: 36/36 PASS; `tsc --noEmit`: PASS; `git diff --check`: PASS (line-ending warnings only).
- AUD-S6 remains open for resize invalidation, residual async/status projection reuse, and bounded large-history scan evidence.

- 2026-10-04: continue E.8e AUD-12/AUD-13/AUD-32 readiness hardening. The existing 2 s UXP readiness cache now rechecks the bridge server's in-process health/route fingerprint before returning a hit, so connection, bridge revision, document count, active document id, or active document name changes invalidate cached readiness immediately instead of waiting for TTL expiry. Failed readiness probes are no longer cached, allowing immediate recovery on the next request. Added a same-numeric-document-id replacement regression proving a changed registered document route is observed as a cache miss inside the TTL. `src/platform/uxp-bridge-server.test.ts`: **35/35 PASS**; `tsc --noEmit`: **PASS**.

- 2026-10-04: continue E.8e AUD-12/AUD-13 status projection reuse. `statusWithCapabilitySnapshots()` now captures one request-local Guard projection after close-recovery reconciliation and passes it directly into `statusCompact`, rather than allowing compact status to recapture operation journals/painting state internally. Added a focused embedded-Guard regression that requires the supplied projection and proves exactly one projection capture for the status request. Focused regression **1/1 PASS**; `tsc --noEmit` **PASS**.

- 2026-10-04: continue E.8e AUD-12/AUD-13 request-local projection reuse in the explicit review response. `photoshop_guard_review_image` now captures one Guard projection and feeds its painting-state snapshot to `presentationContext` as well as the full projection to `artisticContinuationContext`, eliminating the former separate presentation-state read while preserving the already projection-backed continuation/owner/deferred-pass path. Added focused embedded-Guard assertions that one review response captures exactly one projection and reads painting state exactly once; focused review tests pass 17/17 and `tsc --noEmit` passes.

- E.8e/AUD-12/13 explicit-review continuation reuse: `artisticContinuationContext` now accepts a request-local Guard projection and reuses its painting state and operation records for semantic-owner and deferred-pass derivation. The explicit review response captures that projection once before constructing artistic continuation, removing nested `records()` rescans from this response helper. Added a focused regression that makes any fallback `records()` call fail while proving projection-backed continuation is identical. Targeted session-store regression: 1/1 PASS; `tsc --noEmit`: PASS.

- E.8e/AUD-12/13 request-local journal reuse: the ordinary Guard cycle now passes its already captured projection into automatic-checkpoint debt/source selection and uses the same projection records for auto-vs-async dispatch selection, removing two avoidable full operation-journal rescans from the hot path. Added a focused regression proving checkpoint-debt probing performs zero `records()` reads when a request-local projection is supplied. Also restored the missing type-only `ViolationRepairClass` import left by the preceding deterministic-accounting slice, clearing `tsc --noEmit`. Targeted embedded-guard tests: 2/2 PASS; `tsc --noEmit`: PASS.

- E.8e/AUD-12 read reuse: Guard visual-microplan compilation now carries finite document bounds from the same fresh UXP state witness used for authoritative document-incarnation validation into execution preflight. This removes the redundant `photoshop_list_documents` call on the normal guarded path without weakening target/incarnation pinning; standalone preflight keeps the list-documents fallback. Added a focused regression proving supplied authoritative bounds reject out-of-bounds geometry with zero list-document reads. `tests/visual-microplan-compiler.test.ts`: 18/18 PASS. The wider embedded-guard target was 103/104 with the pre-existing concurrent `guard_execution` vs `guard_compact_closure` report-source expectation failure; `tsc --noEmit` is currently blocked by the existing missing `ViolationRepairClass` type in `cycle-compiler.ts`.

## 2026-10-04 — E.8e deterministic-violation denominator

- Added typed compiler accounting for deterministic violations encountered, repaired and unresolved, including durable per-repair-class/code totals in artistic-throughput state.
- The run-scoped benchmark now computes the local deterministic-repair percentage from the proven encountered-violation denominator when present; semantic/systemic ambiguity remains outside that denominator. Targeted benchmark/session-store/preflight/compact-contract validation passes 138/138.

## 2026-10-04 — E.8e typed mutation-budget split control

- Removed human-readable error prose from mutation-budget split control. Compact budget violations now carry
  typed numeric `requested_mutations` / `allowed_mutations` plus `splittable` metadata, and the deterministic
  splitter consumes only those structured details.
- A generic downstream `invalid_visual_microplan` budget duplicate no longer converts an otherwise safe typed
  split into a model-owned retry; the bounded prefix is still fully recompiled/revalidated before dispatch, so
  independent validation failures remain fail-closed.
- Added regression coverage proving safe split survives arbitrary message rewording and that prose alone cannot
  trigger a split. Causally dependent step-reference actions remain inseparable.
- Validation: `tests/preflight-repair.test.ts` + `tests/compact-contract-regressions.test.ts` **63/63 PASS**.
  `npm run verify:canonical` reached **996/997 tests PASS** after successful build/pack/lint (zero lint errors);
  the sole failure is the concurrently changed compact-closure report-source expectation in
  `embedded-guard.test.ts` (`guard_execution` expected vs `guard_compact_closure` actual), outside this
  mutation-budget slice.

## 2026-10-04 — E.8e AUD-07 inline ordinary review delivery

- `photoshop_guard_cycle_auto` now returns the exact required MCP image blocks inline when the complete review bundle fits the existing byte/block budget, and persists the same visual-delivery receipt before returning.
- The normal fitting path no longer requires a separate `photoshop_guard_review_image` round; the visual observation barrier remains unchanged. Explicit review remains available for redelivery/recovery and remains required when a complete bundle cannot be delivered inline.
- Overflow remains deterministic and fail-closed: incomplete inline delivery falls back to the reference-only cycle result with explicit remaining roles, without pretending that omitted pixels were reviewed.
- Updated focused Guard regressions for fitting whole/crop/before bundles, same-operation OBJECT/MICRO escalation, explicit redelivery, async poll reference behavior and encoded-byte overflow.
- Validation: focused `embedded-guard` inline/overflow suite **5/5 PASS**; `npm run build:server` **PASS**.

## 2026-10-03 — AUD-02 current-tree regression blocker cleared

- Re-read the live repository, `AGENTS.md`, roadmap/changelog and working-tree status/diff before continuing the
  first active priority. Re-ran the exact three-file AUD-02 verification slice with Vitest against the saved tree:
  **152/152 PASS**. The previously reported 1 compact-contract plus 4 session-store failures are no longer
  reproducible and are removed from active roadmap work rather than preserved as stale blockers.
- Revalidated the required real CoS -> embedded Guard -> UXP route with `photoshop_ping`: connected/ready,
  `transport=uxp`, bridge revision `compact-v2-20261003-user-config-ui`, exact revision match. Guard status is
  readable through the same live route. No reset/revert/clean or unrelated production edits were used.
- AUD-02 now returns to its actual remaining boundary: current-child generated-geometry debt/status-resume,
  current-revision recompute or rejection, and final real-Photoshop pixel agreement. Existing unrelated pending
  visual debt on the user's active document is not replayed or mutated for this acceptance run.

## 2026-10-03 — Roadmap consolidation: completed slices moved out of forward work

Documentation-only consolidation. The following are existing accomplishments from the 2026-10-01/02/03
entries and acceptance evidence, not newly implemented or newly tested behavior. Full pre-cleanup roadmap
and changelog bytes are preserved in
`processes/documentation-maintenance-process/pre-roadmap-cleanup-20261003T201104Z/` with SHA-256 manifests.
The compact roadmap retains open actions, dependencies, audit ids and quality/time acceptance; detailed
implementation and revalidation history belongs here and in the acceptance matrix.
Concurrent pre-write revalidation reported 147/152 with five AUD-02 fixture/projection failures; that latest
entry is preserved verbatim below. Subsequent 152/152 revalidation above cleared this transient blocker;
E.18 retains only its current-child live proof. No tests are rerun by this documentation cleanup.

- **E.7a (2026-10-01):** independent/idempotent previous-observation closure and internal layered-PSD checkpoint
  save/verification. Invalid next plans do not undo valid closure; failed/uncertain persistence remains recoverable.
- **Completed E.7c slices (2026-10-01/02):** non-authoritative free-form rationale/commentary, guidance-only
  strategy cadence, structured stage/owner/recovery authority and unambiguous construction/material derivation.
  Existing corrective debt/history and best-frame authority remain. Residual prose gates, ordinary-review
  softness compilation and AGENTS/schema synchronization are still forward work.
- **AUD-S1/S3 correctness foundations (2026-10-03; AUD-03, AUD-04, AUD-05, AUD-06, AUD-17, AUD-19,
  AUD-20, AUD-24, AUD-25):** durable critic/hostile-review
  authority, truthful close-only/direct-operation state, full-graph must-fix dependency selection, exact-frame
  whole-image review, bounded scene-relation auditing, sub-threshold structural whole-frame evidence and exact
  style-contract authority for geometry opt-outs are regression-protected. This does not close AUD-S9 live quality.
- **E.8d (2026-10-02):** PaintingIntent → compiler → durable injection → bounded typed local repair → Guard,
  post-review deferred selection, rejection/recovery separation and compact continuation. The accepted eight-pass
  run recorded 1.25 model-visible Guard round trips per artistic mutation. **AUD-01** request-local projection
  reuse removed redundant global journal/state scans; retain it as a regression invariant, not another task.
- **AUD-02/E.7d/E.18 repository implementation (2026-10-03):** actual executable region/stroke/transform validation,
  bounded landmark/orientation authority, boundary-derived sections/bands/grid cells and dependency-snapshot
  provenance; generated rebuild debt survives status/resume and clears after current-revision regeneration.
  Detailed numeric/test/build revalidations remain in the original AUD-02 entries below.
- **AUD-02 partial live acceptance (2026-10-03):** hostile facade coordinates were replaced by the analytic
  quadrilateral and Photoshop pixels agreed; revised rail corridor pixels and dependency staleness also passed.
  **Still open:** current-child generated-debt/status/resume/recompute/pixel proof. Later stale-child runs and
  concurrent `ENOTEMPTY` clean-dist attempts are inconclusive and do not supersede the last verified bundle.
- **E.11 repository foundation (2026-10-01):** exact/unproven/partial semantic history ownership, exact rollback
  handles and fail-closed unproven pseudo-rollback. Live Photoshop span/boundary correspondence remains open
  before wider E.7b mixed-method/multi-layer scope.
- **E.8b PaintPilot-side continuation:** durable checkpoint/resume/timeline projection and opt-in review/planning
  boundary diagnostics are implemented. Marker calls are benchmark-only. Host compaction/watchdog joins and
  local AUD-29 bounded status/resume projections remain open.
- **E.8c local catalog mitigation (2026-10-02):** descriptions compacted without changing internal schemas or
  semantics; the recorded 133-tool catalog was 249,865 bytes (135-byte headroom). This is a historical snapshot,
  not current capacity proof. Protected host control-plane publication/order/overflow/live acceptance remains open.
- **P1-D.3a local/live config (2026-10-03):** versioned `user_config` and `presentation_context`, auto/ru/en,
  technical/artistic/mixed and short/normal/detailed; defaults auto+mixed+normal, active-run mode/detail precedence,
  strict presentation-only authority, GET/POST settings and Photoshop-locale UXP UI. Full mode meanings and local
  acceptance are in the existing P1-D.3a entry below. Only portable packaging/additional-host parity remains.
- **E.22 per-action capture reliability (2026-10-02):** two consecutive production clips finalized correctly with
  Photoshop HWND WGC capture, bounded shutdown/non-activating wake and trimmed wake frames; the 48-byte MP4
  failure is closed. Photoshop must stay open/non-minimized. Bad-attempt/correction/resume chronology and final
  MP4/SRT rebuild acceptance remain open; optional recording cannot block painting.
- **Standalone repository cutover:** completed previously. Identity/governance/funding/milestone/release work
  remains open; no release or public-settings action is performed by this documentation cleanup.

## 2026-10-03 — AUD-02 current-tree revalidation exposed concurrent regression drift

- Re-read the live repository, `AGENTS.md`, roadmap/changelog and full working-tree status/diff before continuing.
  The canonical CoS -> embedded Guard -> UXP route is connected/ready and reports matching
  `compact-v2-20261003-user-config-ui` bridge revision.
- `npm run build:server` is **PASS** again; the earlier transient Windows `ENOTEMPTY` clean-dist collision did not
  reproduce.
- The focused current-tree verification is **FAIL 147/152**: executable geometry remains **23/23 PASS**, while
  compact-contract has 1 failure (the shared-owner fixture now reaches the art-run project-folder admission gate)
  and session-store has 4 stale-binding projection expectation/order failures. These failures appeared against the
  concurrently modified working tree and must be reconciled before the remaining live AUD-02 proof can be trusted.
- No reset/revert/clean or unrelated edits were performed. The live generated-debt/status-resume/recompute/pixel
  gate remains open, but repository green status is no longer claimed until the five targeted regressions are fixed.

## 2026-10-03 — AUD-02 continuation revalidation

- Re-read the live repository, `AGENTS.md`, roadmap/changelog and working-tree status/diff before continuing AUD-02.
- Revalidated executable geometry **23/23 PASS** and the combined compact-contract + session-store suite
  **129/129 PASS**; `git diff --check` remains clean apart from existing LF→CRLF warnings.
- Revalidated the actual CoS → embedded Guard → UXP route: connected/ready and bridge revision
  `compact-v2-20261003-user-config-ui` matches the expected revision.
- A concurrent `npm run build:server` attempt is **INCONCLUSIVE** because Windows returned `ENOTEMPTY` while
  `scripts/clean-dist.mjs` was removing `dist/`. No reset/clean or ad-hoc child termination was used; the failed
  build is not treated as a newer verified bundle. The fresh-child generated-debt/status-resume/recompute/pixel gate
  remains open.

## 2026-10-03 — AUD-02 fresh-child gate rechecked after harness repair

- Re-read the live repository, `AGENTS.md`, roadmap/changelog and working-tree status/diff before continuing the
  first active priority. The canonical CoS -> Guard -> UXP route is connected/ready and reports matching
  `compact-v2-20261003-user-config-ui` bridge revision.
- Revalidated the complete repository-side AUD-02 slice after the session-store fixture repair:
  executable-geometry **23/23 PASS**, compact-contract **56/56 PASS**, session-store **73/73 PASS**,
  `npm run build:server` **PASS**, and `git diff --check` **PASS**.
- The verification build refreshed `dist/cos-plugin.js` at 22:33:18, while the actually loaded Digital Painting
  child remains PID 17740 from 20:05:36. The remaining generated-debt/status-resume/recompute/pixel acceptance is
  therefore **INCONCLUSIVE due only to child freshness**. Project policy requires the canonical
  Plugins -> Digital Painting Edition -> Restart; no ad-hoc process termination was used.

## 2026-10-03 — AUD-02 validation harness restored

- Re-read the live repository, `AGENTS.md`, roadmap/changelog and working-tree status/diff before continuing. The
  canonical CoS -> Guard -> UXP route is connected/ready with matching
  `compact-v2-20261003-user-config-ui` bridge revision.
- Repaired two session-store regression fixtures that attempted to write process-local commentary frames before their
  `frames/` parent directories existed. The fixture now creates the parent explicitly, preserving the production
  closure snapshot/restore semantics while allowing the intended exact-byte and atomic-rollback assertions to run.
- Verification: session-store regressions **73/73 PASS**; executable-geometry + compact-contract regressions
  **79/79 PASS**; `npm run build:server` **PASS**; `git diff --check` **PASS**.
- The only remaining AUD-02 gate is still live freshness: the loaded Digital Painting child PID 17740 predates the
  current verified server bundle. Per `AGENTS.md`, the final generated-debt/status-resume/recompute/pixel proof must
  wait for the canonical Plugins -> Digital Painting Edition -> Restart rather than an ad-hoc process kill.

## 2026-10-03 — AUD-02 current-build revalidation

- Re-read the live repository, AGENTS.md, roadmap/changelog and working-tree status/diff before continuing. The
  canonical CoS -> Guard -> UXP route remains connected/ready with matching bridge revision
  compact-v2-20261003-user-config-ui.
- Re-ran the focused generated/executable-geometry slice: **24/24 PASS**, including the durable generated rebuild
  lifecycle regression; npm run build:server **PASS** and full git diff --check **PASS**.
- The verification build refreshed dist/cos-plugin.js at 21:30:30, while the loaded Digital Painting child remains
  PID 17740 from 20:05:36. Therefore the remaining live generated-debt/recompute/pixel acceptance is still
  **INCONCLUSIVE due to server freshness**, not a repository-test failure. Per AGENTS.md, do not substitute an
  ad-hoc process kill for the canonical CoS Plugins -> Digital Painting Edition -> Restart action.

## 2026-10-03 — AUD-02 generated rebuild closure regression

- Re-read the actual repository, `AGENTS.md`, roadmap/changelog, git status/diff and live Photoshop route before
  continuing. The canonical CoS -> Guard -> UXP route is connected/ready, but the loaded Digital Painting child is
  still PID 17740 from 20:05:36 while the verified `dist/cos-plugin.js` is newer (20:48:20), so the remaining live
  acceptance is freshness-blocked rather than failed.
- Extended the focused generated-geometry regression through the other half of the rebuild lifecycle: after a source
  boundary change creates durable owner-specific rebuild debt and that debt survives `resume()`, a newly recorded
  current-revision derived payload for the same owner now proves the debt clears from generated-debt, compact and
  status projections and no longer owns `next_required_action`.
- Verification: focused generated-geometry rebuild lifecycle regression **1/1 PASS**. The live recompute/pixel proof
  still requires the canonical Plugins UI restart because project policy forbids substituting a process kill for that
  restart.

## 2026-10-03 — AUD-02 resume projection regression

- Re-read the actual repository, AGENTS policy, roadmap/changelog, git status/diff and current process state before
  continuing. The loaded Digital Painting child remains PID 17740 from 20:05:36; the verified server bundle was rebuilt
  successfully at 20:48, so live generated-debt acceptance is still freshness-blocked rather than failed.
- Strengthened the generated-geometry rebuild regression so the durable debt is now asserted not only in compact/status
  projections but also through `resume(42)`, including the owner-specific `next_required_action` and resume-summary next
  step. This directly protects the repository side of the remaining AUD-02 status/resume acceptance contract.
- Verification: focused generated-geometry session-store regression **1/1 PASS**; executable-geometry + compact-contract
  regressions **79/79 PASS**; `npm run build:server` **PASS**; `git diff --check` **PASS** before the documentation update.
- Remaining live gate is unchanged: canonically restart only the Digital Painting child onto the current build, repeat
  the convergence revision, observe generated rebuild debt/next action through live status/resume, then prove
  recompute/rejection against current Photoshop pixels.

## 2026-10-03 — AUD-02 live rail/support derivation and stale-dependency evidence

- Re-read the live repository, AGENTS policy, roadmap/changelog and working-tree diff before continuing AUD-02.
  The canonical CoS -> embedded Guard -> UXP route was connected/ready with matching bridge revision.
- Ran a real rail/support acceptance pass on the disposable 400x300 Photoshop document. Scene Geometry revision 2
  moved the convergence boundaries to left=(20,280)->(200,80) and right=(180,280)->(200,80), while the caller
  deliberately supplied an unrelated full-width rectangle. The compiler replaced it with the derived corridor before
  dispatch. Direct UXP samples proved the rendered result: #3C6EB4 at (150,149) and (180,111), while (130,149) and
  (199,111) remained #FFFFFF.
- Advanced the same scene to revision 3 while changing the left convergence source. Compact Guard status then marked
  `aud02-rail-owner` stale with `reason=dependency_changed` and changed dependencies `depth,left,track`, while the
  revision-3 witness owner remained current. This is positive live evidence for durable dependency staleness.
- The loaded Digital Painting child is still PID 17740 from 20:05:36, older than the verified server bundle (rebuilt
  successfully during this run after the earlier 20:12 artifact). Its status therefore does not yet exercise the
  current generated-provenance `generated_geometry_rebuild_debt` projection. Remaining live gate: canonical child
  restart, repeat the convergence revision on the current build, then prove rebuild debt plus recompute/rejection and
  current Photoshop pixels. Do not interpret the stale child's empty generated-debt array as repository failure.
- Verification: executable-geometry + compact-contract regressions **79/79 PASS**, `npm run build:server` **PASS**,
  and touched geometry/session-store `git diff --check` **PASS**.

## 2026-10-03 — AUD-02 live facade parameter-to-pixel acceptance

- Re-read the current repository/roadmap/changelog and verified that the Digital Painting Edition child is now fresh:
  PID 17740 was created at 20:05:36, newer than the verified `dist/cos-plugin.js` build at 19:49:41. The canonical
  CoS -> embedded Guard -> UXP route is connected/ready with matching bridge revision.
- Ran a fresh disposable 400x300 Photoshop acceptance document through `photoshop_guard_cycle_auto`. The caller
  intentionally supplied the hostile region contour `[(1,240),(399,240),(390,160),(10,160)]`; the fresh compiler
  replaced it before dispatch with the analytic boundary-derived contour
  `[(72,240),(168,240),(184,160),(136,160)]`. The operation completed successfully on layer `AUD02 Band`.
- Proved parameter-to-rendered-pixel agreement with the real UXP Imaging sampling path. Samples at (80,239),
  (150,200), (140,161) and (180,161) returned the exact fill #B4783C; (70,239) and (186,161) remained #FFFFFF,
  while (134,161) was the expected antialiased boundary transition. This closes the architectural-facade live slice
  that the stale child could not prove.
- AUD-02 remains active only for its separate rail/support live case: source-convergence change must produce durable
  stale-dependent debt and a recomputed/rejected rail/support construction against actual Photoshop pixels.
- Post-acceptance verification: executable-geometry + compact-contract regressions **79/79 PASS**,
  `npm run build:server` **PASS**, and touched roadmap/changelog `git diff --check` **PASS**. The verification build
  itself is newer than the already accepted live child, so another live mutation must again restart/reload the child
  before using it as freshness evidence; this does not invalidate the completed facade acceptance trace.

## 2026-10-03 — AUD-02 freshness recheck

- Re-read the current repository state and rebuilt the server successfully with `npm run build:server`.
- The Photoshop route is connected and ready with matching bridge revision. The active Digital Painting child was
  created at 19:04:57, while the current verified build is newer (about 19:52), so live acceptance still requires the
  canonical child restart before the derived-band parameter-to-pixel check can be meaningful.

## 2026-10-03 — AUD-02 live child-freshness verification

- Re-verified the repository geometry slice before another live attempt: focused executable-geometry tests **23/23
  PASS**, `npm run build:server` **PASS**, and `git diff --check` **PASS**.
- Re-verified the canonical CoS/Photoshop route with `photoshop_ping`: UXP is connected/ready and bridge revision
  `compact-v2-20261003-user-config-ui` matches. The remaining live gate is blocked by server-code freshness rather than
  Photoshop/UXP availability: the running repository `dist/cos-plugin.js` child was created at 19:04:57, while the
  verified build artifact is newer (19:32 after this run's build). Per `AGENTS.md`, the next action is to restart only
  this Digital Painting Edition child through CoS Plugins, then rerun the derived-band mutation and pixel sampling.
  No stale-process mutation was replayed; AUD-02 remains open only for that live parameter-to-pixel proof.

## 2026-10-03 — AUD-02 live-acceptance build unblock and loaded-server evidence

- Re-read the live repository/Guard state and exercised the real Chat On Steroids Plugins -> embedded Guard -> UXP
  route on a disposable 800x600 document. The loaded server accepted the current UXP document-incarnation witness but
  rejected an intentionally hostile exact region contour as outside the bound perspective corridor, showing that this
  loaded code had not yet picked up the newly implemented compiler-side boundary materialization. This is useful
  negative live evidence, **not** parameter-to-rendered-pixel acceptance.
- Unblocked a fresh production build without changing runtime semantics: narrowed the compact previous verdict before
  passing it to `compactClosureDefaults`, and normalized optional export/video sequence numbers once before use. These
  were the three concurrent TypeScript errors that had previously made the AUD-02 full build result inconclusive.
- Verification: executable-geometry + compact-contract regressions **79/79 PASS** and `npm run build:server` **PASS**.
  The remaining AUD-02 gate is unchanged: load the rebuilt server, rerun the exact derived rail/facade case, and verify
  the computed boundary against actual Photoshop pixels.

## 2026-10-03 — AUD-02 orientation-backed exact rotate validation

- Closed the remaining repository-only executable-transform gap for exact `photoshop_rotate_layer`. When current exact
  geometry evidence exists, the durable owner centerline supplies the source orientation and exactly one bound
  `parallel_family` analytic line supplies the target orientation. Guard derives the shortest undirected rotation,
  replaces the caller-authored `degrees` before executable validation/dispatch, and therefore does not accept a guessed
  angle as geometry proof.
- Ambiguous/missing orientation authority and stale exact evidence remain fail-closed. Successful validation persists
  `validated-orientation-transform` provenance with a snapshot of the exact target line, preserving dependency-scoped
  invalidation when that scene orientation later changes.
- Verification: executable-geometry + compact-contract regressions **79/79 PASS**. Full TypeScript `--noEmit` remains
  **INCONCLUSIVE for this slice** because concurrent shared-tree edits currently report unrelated errors in
  `cycle-compiler.ts`, `runtime.ts` and `process-video-trace.ts`. AUD-02 repository implementation is complete; its
  remaining gate is live Photoshop parameter-to-rendered-pixel acceptance.

## 2026-10-03 — P1-D.3a live presentation config, Photoshop-locale UXP UI and commentary-mode contract

- Reworked exported `artistic` commentary from report-style metadata into first-person process narration intended for
  viewers. Artistic sidecars no longer expose frame/operation/stage/region headers or the `Before pass` / `After pass`
  / `Did` / `Why` / `Result` scaffolding. They now open with a human intention (`Теперь я хочу…` / `Now I want…`),
  name the concrete Photoshop tools actually present in the VisualMicroPlan (brush, pencil, eraser, Smudge, selection,
  masks, gradients, transforms, blend modes, Curves/Levels, blur, Content-Aware Fill), include observable brush
  settings such as size/hardness/opacity/flow when available, and close with natural first-person action plus
  `Для того чтобы…` / `В результате…`. Technical and mixed modes retain their diagnostic/report structure.
- Fixed stale UXP presentation controls after switching Photoshop documents. The panel now tracks the active
  document id in its long-poll loop and re-reads `/settings/user-config` whenever the active document changes, so
  a document-level sticky commentary mode/detail can no longer be hidden behind values left on screen from the
  previously active document. This specifically prevents the panel from showing `artistic` while Guard is actually
  emitting `technical` sidecars for the newly active art run.

- Added a versioned user-presentation configuration layer without creating a second policy store. The existing
  controller `.photoshop-runtime/controller/painting-state.json` now carries normalized `user_config` v1 with
  `language=auto|ru|en`, `commentary_mode=technical|artistic|mixed` and
  `commentary_detail=short|normal|detailed`. Invalid persisted values fall back field-by-field with warnings;
  invalid writes fail cleanly. New art runs inherit configured mode/detail while an existing art run keeps its
  sticky document-level override until the user changes it explicitly.
- Added the host-neutral localhost settings surface `GET/POST /settings/user-config`. The UXP MCP Bridge panel now
  exposes editable dropdowns for all three fields, saves through that API, restores effective values, and preserves
  the same settings across UXP reload/restart. The panel was also resized for the added controls, given bounded
  vertical scrolling and long-line wrapping, and now follows Photoshop's UXP `host.uiLocale`; English is the
  publish-safe fallback and the current English Photoshop instance renders the panel in English.
- Added compact model-facing `photoshop.presentation_context.v1` projection to Guard status/resume, artistic
  continuation and exact-checkpoint recovery. It carries only the effective language/mode/detail plus provenance;
  canonical commentary behavior remains single-source in the server guidance and no second prompt/policy language
  was introduced. Live document `415` was verified with `language=auto`, `commentary_mode=technical`,
  `commentary_detail=short` coming from the real active art-run/user-config state.
- Reclassified commentary modes as a strict content boundary rather than a tone preference. `technical` now means
  developer/debug telemetry only: Photoshop/UXP/MCP state, operation lifecycle, runtime/capability limits, Guard
  admission/barriers/evidence/receipts/checkpoints/recovery, ids/hashes/protocol/schema, compiler/preflight/repair/
  retry/fallback diagnostics, errors, timing and capture telemetry. It explicitly does not expose hidden reasoning.
  `artistic` now owns all artist-useful reasoning **and Photoshop craft**: visual problem/intent, composition,
  hierarchy, depth, perspective/geometry, form, value/light, color, material, edge/recognition logic, preservation,
  layer/mask/selection structure, brush choice and settings, opacity/flow/hardness/size/spacing/smoothing/pressure,
  blend modes, adjustment/filter/gradient/transform parameters, inspected before/after result and next artistic step.
  `mixed` renders the artistic explanation first, then one clearly separated compact technical/debug note without
  duplicating the same fact. `commentary_detail` changes only depth/length inside the chosen boundary.
- Unified language semantics across all modes: `ru` = Russian, `en` = English, and `auto` follows the current
  conversation language. The legacy hard-coded `Artist voice is natural Russian` rule and hard-coded Russian
  completion-format hint were removed; completion reporting remains the same localized Did / Why / Result semantics.
- Added focused regression coverage for user-config normalization/persistence/precedence, model-facing
  `presentation_context`, UXP host-locale fallback and the technical/artistic/mixed content contract. Verification:
  focused presentation/config tests **9/9 PASS**, embedded Guard integration **84/84 PASS**,
  `npm run build:server` PASS and touched-slice `git diff --check` PASS. Live `photoshop_ping` is connected/ready on
  UXP with matching revision `compact-v2-20261003-user-config-ui`, and the live settings API returns the same effective
  values shown by Guard.

## 2026-10-03 — AUD-02 executable region/stroke/transform validation slices

- Extended two-family derivation from one cell to repeated adjacent-cell layouts. An exact binding with two analytic
  line families and at least two members in each now deterministically orders each family by its intersections with
  the other family, derives every adjacent quadrilateral, and replaces a matching sequence of one-contour/four-point
  `photoshop_paint_regions` regions with those computed cells. Region count/shape mismatches are not guessed. The
  executable validator recognizes only the resulting grid corners and provenance snapshots every participating source
  line, preserving dependency-scoped rebuild behavior. Focused executable-geometry + compact-contract regressions
  **77/77 PASS**. Full TypeScript `--noEmit` remains **INCONCLUSIVE for this slice** because concurrent shared-tree
  edits currently report unrelated errors in `cycle-compiler.ts`, `runtime.ts` and `process-video-trace.ts`.
- Extended deterministic compiler geometry to a bounded two-family module case. When an exact Geometry Binding names
  exactly two analytic lines from each of two Scene Geometry line families, PaintPilot derives the four module corners
  from the four cross-family line intersections and replaces all caller-authored contour coordinates before dispatch.
  Executable validation accepts only those derived corners, and provenance snapshots all four source lines so changing
  one family member selectively invalidates the generated module. Ambiguous/parallel/non-four-line constructions are
  not guessed. Verification: executable-geometry + compact-contract regressions **76/76 PASS**. Full TypeScript
  `--noEmit` is **INCONCLUSIVE for this slice** because concurrent shared-tree edits currently report unrelated type
  errors in `cycle-compiler.ts`, `runtime.ts` and `process-video-trace.ts`.
- Wired generated-geometry staleness into durable continuation scheduling. `SessionStore` now scans the latest
  persisted `derived-boundary-sections` provenance per owner, evaluates it against the current Scene Geometry revision,
  exposes only affected owners as `generated_geometry_rebuild_debt` in compact/status projections, and makes that debt
  a concrete `next_required_action` before ordinary continuation. An unrelated scene change creates no rebuild debt;
  changing a recorded source boundary schedules only its generated owner. Focused scheduling regression **1/1 PASS**;
  executable-geometry + compact-contract regressions **75/75 PASS**. The broader session-store suite is
  **INCONCLUSIVE for this slice** because two pre-existing snapshot tests still address the old run-root `frames/`
  directory after concurrent export-layout changes. Full TypeScript `--noEmit` remains **INCONCLUSIVE** on the same
  unrelated concurrent errors already recorded below (`cycle-compiler.ts`, `runtime.ts`, `process-video-trace.ts`).
- Made generated-geometry selective invalidation self-contained in durable provenance. Newly derived boundary
  sections now persist compact snapshots of the exact analytic line members that generated their Photoshop
  coordinates, so `generatedGeometryProvenanceState()` can distinguish an unrelated later Scene Geometry revision
  from a changed/missing source boundary without requiring the historical full scene revision to remain available.
  Legacy provenance without snapshots keeps the previous fail-closed source-revision requirement. This removes a
  durability prerequisite from the pending continuation/rebuild integration without weakening dependency scope.
  Verification: executable-geometry + compact-contract regressions **75/75 PASS**.
- Added dependency-scoped staleness for compiler-generated executable geometry provenance. The new
  `generatedGeometryProvenanceState()` compares the source/current Scene Geometry revisions and intersects actual
  changed structural ids with the exact dependency ids persisted by the generated payload. An unrelated scene change
  therefore leaves that generated payload current, while a changed source boundary invalidates only the dependent
  generated geometry; unavailable source revisions and model-identity changes fail closed. This is the selective
  invalidation primitive for generated dependents; wiring its result into durable continuation/rebuild scheduling
  remains open. Verification: executable-geometry + compact-contract regressions **75/75 PASS**. Full TypeScript
  `--noEmit` is **INCONCLUSIVE for this slice** because the current shared working tree has three unrelated type-check
  failures in concurrent edits: `cycle-compiler.ts` (`TS2345` around `previous_visual_verdict`), `runtime.ts`
  (`TS18048` for possibly undefined `exportSequence`) and `process-video-trace.ts` (`TS2322`/`TS18048` for optional
  `sequence`).
- Extended deterministic compiler materialization from horizontal strokes to bounded four-point facade/module region
  bands. When an exact `photoshop_paint_regions` contour has exactly two unambiguous horizontal levels, the caller's
  y levels and winding remain independent artistic/construction choices while all four x coordinates are replaced from
  the two accepted analytic boundary dependencies before validation/dispatch. Ambiguous or non-band contours are left
  to normal fail-closed validation rather than guessed. The aggregate derivation provenance preserves the exact source
  dependency ids, tool family and generated-point count. Focused tests also prove a revised source boundary changes the
  emitted region coordinate. Verification: executable-geometry + compact-contract regressions **74/74 PASS**. Full
  TypeScript `--noEmit` is currently **INCONCLUSIVE for this slice** because a concurrent unrelated
  `compactClosureDefaults(..., compiledInput.previous_visual_verdict)` change in `cycle-compiler.ts` fails type-check
  with `TS2345` (`unknown` is not assignable to `Record<string, unknown> | undefined`).
- Wired the boundary-section derivation into the compiler for exact horizontal two-point
  `photoshop_paint_strokes`. The y coordinate remains the independent caller choice, but both dependent x endpoints
  are replaced from the two accepted analytic boundary lines before executable validation and dispatch. The existing
  geometry-preflight record now persists `derived-boundary-sections` provenance (scene model/revision, exact dependency
  ids and generated point count). Focused coverage proves hostile caller x coordinates are replaced and that a changed
  source boundary deterministically changes the emitted endpoint. Broader region/multi-family derivation and
  generated-dependent invalidation remain open. Verification: executable-geometry + compact-contract regressions
  **72/72 PASS**, TypeScript `--noEmit` PASS.
- Added the first compiler-independent deterministic facade/module derivation primitive: `deriveBoundarySection()`
  computes the left/right horizontal section endpoints directly from the two analytic boundary-line dependencies in
  the accepted Scene Geometry/Binding. It returns the exact dependency ids and cannot accept caller-supplied derived x
  coordinates. A focused regression proves that changing one source boundary changes only the corresponding derived
  endpoint. This is infrastructure, not AUD-02 completion: compiler emission of these derived sections into Photoshop
  payloads and durable generated-dependent provenance/invalidation remain open. Verification: executable-geometry +
  compact-contract regressions **71/71 PASS**, TypeScript `--noEmit` PASS.
- Closed a lifecycle bypass in executable geometry enforcement: once an owner carries completion-relevant exact
  geometry, every later visual mutation now revalidates the actual compiled payload after durable binding/evidence
  staleness checks. VALUE/MATERIAL/TEXTURE continuation can no longer escape E.18 merely because it is no longer
  classified as a fresh structured-construction pass; hand-guessed region/stroke/transform coordinates still fail
  closed before dispatch. Verification after this change: focused executable-geometry + full compact-contract
  regressions **70/70 PASS** and TypeScript `--noEmit` PASS.
- Hardened the positive landmark-transform path so the pure caller-supplied
  `photoshop_transform_landmarks` helper cannot bootstrap its own completion authority. Move/scale/fit validation is
  admitted only when the Geometry Binding also carries exact evidence pinned to the current durable document
  id/incarnation/dimensions; stale-frame evidence falls back to fail-closed `executable_geometry_unverifiable`.
  Focused + compact regressions: **70/70 PASS**; TypeScript `--noEmit` PASS.
- Added `executable-geometry-validation.ts` and wired it into the existing E.18 coherent-3D Geometry Binding
  preflight. For exact completion-relevant region/stroke construction with two bound analytic boundary lines, Guard now
  inspects the actual compiled `photoshop_paint_regions` contour and `photoshop_paint_strokes` path coordinates that will be dispatched rather than
  accepting parallel geometry metadata as sufficient proof.
- Actual region vertices outside the accepted perspective corridor fail closed with
  `executable_geometry_constraint_conflict`; an exact region payload whose analytic boundary mapping cannot be
  established fails closed as `executable_geometry_unverifiable`. Non-exact/organic region work is unchanged.
- Exact `photoshop_move_layer`, `photoshop_scale_layer`, `photoshop_rotate_layer` and
  `photoshop_fit_layer_to_document` mutations now fail closed as `executable_geometry_unverifiable` until the
  executable path has source bounds/landmarks and a derived destination that can be checked numerically. This closes
  the silent metadata-only transform bypass without pretending that arbitrary transform percentages/offsets prove geometry.
- Successful exact region/stroke executable validation now persists a compact provenance record in the existing
  durable `geometry_preflight`: scene model id/revision, the exact boundary dependency ids, dispatched tool family,
  validated point count and tolerance. Rejected geometry never mints that provenance, so later state can distinguish
  an accepted executable check from parallel declarative metadata without adding a second geometry state machine.
- Closed a fail-open edge in that validator: malformed exact region/stroke payloads can no longer have invalid points
  silently filtered into an empty/partial point set. Missing/empty point lists and non-finite coordinates now produce
  `executable_geometry_unverifiable` and cannot mint executable provenance.
- Added a bounded positive transform path: when the same compiled operation contains exactly one explicit
  `photoshop_transform_landmarks` source/target frame, exact `photoshop_move_layer` and top-left uniform
  `photoshop_scale_layer` payloads are numerically checked against that derivation. Matching payloads persist
  `validated-landmark-transform` provenance; mismatched deltas/scales fail closed. Center-anchored uniform scale now
  has the same positive path when source/target frames prove an unchanged center; a shifted target center is rejected
  as a constraint conflict. `photoshop_fit_layer_to_document` now also has a positive path: source bounds plus durable
  document dimensions deterministically derive the centered aspect-preserving fit/fill target frame, which must match
  the explicit landmark target frame. Rotate stays unverifiable because axis-aligned frames do not encode orientation.
- Added focused inside-corridor/off-corridor region/stroke regressions plus transform fail-closed, positive-derived and
  mismatch coverage. This is a bounded AUD-02 slice, not completion: broader multi-family compiler derivation,
  dependency invalidation/provenance and live Photoshop parameter-to-pixel acceptance remain open.
- Verification: `npx vitest run src/core/executable-geometry-validation.test.ts tests/compact-contract-regressions.test.ts`
  **69/69 PASS**, TypeScript `--noEmit` PASS, and touched-slice `git diff --check` PASS.

## 2026-10-03 — AUD-20 exact style-contract authority for geometry opt-outs

- Closed the self-declared perspective bypass for committed structured/spatial construction. A Scene Geometry Model
  with `orthographic_or_diagrammatic`, `flat_or_collage` or `intentional_non_euclidean` applicability now needs an
  `applicability_style_contract_basis` whose field and criterion exactly match the active durable Art Director
  `style_contract`; applicability enum, rationale prose or review text alone cannot authorize the exception.
- Kept `coherent_3d` and exploratory `insufficient_evidence` semantics unchanged. Unsupported opt-outs fail closed as
  `scene_geometry_opt_out_unauthorized` before Photoshop mutation, and the compact public schema exposes the bounded
  exact-basis field instead of adding another geometry/critic subsystem.
- Added focused authority normalization tests and changed the compact Guard regression so unbacked orthographic,
  flat/collage and non-Euclidean declarations are rejected while coherent 3D remains dispatchable.
- Verification: `npx vitest run src/core/scene-geometry-model.test.ts tests/compact-contract-regressions.test.ts`
  **61/61 PASS** and TypeScript `--noEmit` PASS.

## 2026-10-03 — AUD-06 truthful direct-operation change domains

- Removed the directive-bound direct-operation fallback that labeled every visual tool as `local-tone`. Known direct
  tonal adjustments now expose `large-value`; whole-layer transforms expose `composition` + `silhouette`; bounded
  mask/filter/property semantics retain their appropriate local edge/tone domains.
- Unknown direct visual effects no longer inherit local permission accidentally. Under an active Planner directive,
  the compact compiler emits `direct_visual_change_domain_ambiguous` instead of inventing a safe local domain.
- Added focused coverage for global Curves/exposure, whole-layer transforms, gradient-mask/local-edge work,
  layer-opacity/local-tone work and an ambiguous direct visual effect.
- Verification: `npx vitest run tests/direct-change-domains.test.ts` **4/4 PASS**, TypeScript `--noEmit` PASS, and
  touched-slice `git diff --check` PASS.

## 2026-10-03 — AUD-25 sub-threshold structural whole-frame review

- Closed the remaining significance-threshold escape in visual verdict validation. A pass that is accepted, has a
  decoded pixel change, and is structural/global-sensitive through durable `affected_relations` or a global change
  domain now requires a `region="whole frame"` observation even when `execution_effect` is below `meaningful`.
- Preserved the existing bounded path for ordinary local micro-edits: the new rule is keyed to structural/global
  scope rather than making every low-delta brush adjustment pay a global-review round trip. Existing task review
  cadence remains the bound on long local sequences.
- Added a focused embedded-Guard regression with a deliberately sub-threshold decoded pixel delta. The same pass is
  marked with a structural affected relation and proves that local-only evidence is rejected before verdict closure.
- Verification: focused whole-frame regressions **2/2 PASS**, TypeScript `--noEmit` PASS, and touched-slice
  `git diff --check` PASS.

## 2026-10-03 — AUD-17 bounded whole-frame scene-relation audit

- Strengthened the existing exact-frame `whole_image_glance` instead of adding another critic/state machine. When
  durable Painter/task state already declares affected scene relations, the pending whole-frame boundary now carries
  that bounded `required_relations` scope; global composition/depth domains add their canonical relation scope.
- A glance with applicable relations must submit structured `relationship_audit.checks` for every required relation
  as `pass|defect|uncertain`. A concrete `defect` must use the existing structural `review_finding` vocabulary rather
  than free prose. Completion cannot consume a defect inline; it must first be persisted through normal review.
- `must-fix` structural findings from that exact-frame audit enter the existing durable `visual_problems` path with
  operation id + frame SHA evidence and therefore reuse the existing gate that blocks cosmetic/detail masking until
  the structural debt is resolved or reclassified.
- Kept the MCP schema addition intentionally compact because AUD-30 schema-budget exposure is already open in the
  sibling host lane; runtime performs the strict nested validation.
- Verification: `npx vitest run tests/planner-painter.test.ts` **63/63 PASS**, TypeScript `--noEmit` PASS,
  touched-slice `git diff --check` PASS, tool-count verification PASS (`133` atomic / `16` Guard). The broader
  `npm run test:embedded-guard-mcp` schema-budget assertion remains **FAIL** at `275493 > 250000`; that is the
  separately tracked current AUD-30 exposure and is not claimed fixed by this slice.

## 2026-10-03 — AUD-19 exact-frame whole-image review barrier

- Made pending `whole_image_glance.due` a fail-closed Painter pre-mutation barrier in the existing Planner gate.
  Stage/global/final review debt now preserves its bound operation id and frame SHA instead of allowing a later
  visual mutation to supersede the exact frame before review.
- Kept the existing exact-frame glance normalization as the only clearing path: the required trigger,
  operation id, frame SHA and materialized current-frame bytes must match before the glance is accepted.
- Extended the stage-boundary Planner regression to prove the next visual mutation is rejected while the glance is
  due and becomes admissible after the exact bound frame is reviewed.
- Verification: `npx vitest run tests/planner-painter.test.ts` **62/62 PASS**,
  `npx vitest run tests/guard-state-evidence-correctness.test.ts` **4/4 PASS**, TypeScript `--noEmit` PASS,
  and `git diff --check` PASS.

## 2026-10-03 — AUD-04 durable critic-result authority binding

- Closed the forged-authority path in `global_brief_assessment`: caller-supplied `critic_authority=authorized` plus a non-empty `critic_result_id` no longer qualifies as independent validation by itself.
- Added a durable per-document authorized-critic-result registry in the existing painting state. Registered records are immutable by id and bind the authority source to the exact result id, frame SHA, artistic-contract id and contract revision; no second critic/lifecycle state machine or public tool was added.
- Global brief normalization now marks a claim independently validated only when its caller fields match that exact durable record. Missing, stale-frame, wrong-contract or wrong-authority records fail closed as `not-independently-validated`.
- Preserved the P0-D human-calibration boundary: registration requires an explicit durable `authority_source`; this slice does not promote the advisory world-consistency critic or repository fixtures into broader completion authority.
- Added focused regressions for missing/stale/exact critic records and updated Planner completion fixtures to register their synthetic authorized results explicitly.
- Verification: `npx vitest run tests/artistic-contract.test.ts tests/planner-painter.test.ts` **73/73 PASS** and TypeScript `--noEmit` PASS.

## 2026-10-03 — AUD-03 hostile-review completion authority

- Closed the caller-downgrade hole in pre-final hostile review: any required review area that reports `status=defect` now keeps `completion_allowed=false` even when the caller labels the mapped `major_defect` as `debt_class=soft`.
- Preserved `debt_class` as defect metadata, but it no longer overrides the review area's completion authority. The current contract has no structured exact-brief/style allowed-deviation grant, so a reported defect remains fail-closed rather than accepting an unproven exception.
- Added a focused artistic-contract regression for `status=defect` plus caller-supplied soft debt.
- Verification: `npx vitest run tests/artistic-contract.test.ts` **10/10 PASS**, TypeScript `--noEmit` PASS, and `git diff --check` PASS.
## 2026-10-03 — AUD-05 truthful close-only completion state

- Fixed the remaining close-only lifecycle split brain: finalizing the just-finished technical operation now derives
  its model-facing continuation from the same canonical document state used by Guard status/resume instead of
  returning `next_state=closed` / `next_required_action=ready` while artistic work remains.
- Close-only responses now return `next_state=continue_required` plus the concrete canonical next action when an
  unresolved visual problem, unfinished Art Director task/review, rollback, checkpoint or other durable workflow
  obligation remains. A genuinely complete document still returns `closed` / `ready`.
- Extended the unfinished-directive regression to prove a locally resolved operation can close technically while the
  user/model-facing workflow remains active and points at the remaining Planner task.
- Verification: focused `tests/embedded-guard.test.ts` regression PASS, TypeScript `--noEmit` PASS, and touched-slice
  `git diff --check` PASS.

## 2026-10-03 — AUD-24 full-graph must-fix dependency selection

- Fixed `largestOpenMustFix()` so must-fix completion debt is ranked first and then resolved through the full
  visual-problem dependency graph instead of deleting lower-severity prerequisite nodes before eligibility is
  computed. A global must-fix that depends on an unresolved should-fix now remains completion debt while the
  prerequisite becomes the actionable blocker.
- Added a focused Planner regression proving the lower-severity prerequisite is surfaced as `primary_blocker`, the
  dependent must-fix remains in the backlog, and the next action points to the prerequisite rather than reporting no
  must-fix blocker.
- Verification: `npx vitest run tests/planner-painter.test.ts` **62/62 PASS**, TypeScript `--noEmit` PASS, and
  touched-slice `git diff --check` PASS.

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
## 2026-10-03 — AUD-02 fresh-runtime gate revalidated

- Re-read the live repository/roadmap/Guard instructions and verified the actual Digital Painting child before any acceptance claim. `photoshop_ping` is connected/ready with matching bridge revision, but PID 17740 (20:05:36) still predates the freshly rebuilt `dist/cos-plugin.js`; therefore no stale-runtime mutation was counted as live generated-provenance evidence.
- `npm run build:server` PASS; executable-geometry 23/23 PASS; compact-contract regressions 56/56 PASS; `git diff --check` PASS. The selected session-store run was 71/73 with two unrelated fixture setup ENOENTs for missing frame-sidecar parent directories, so those failures are INCONCLUSIVE for AUD-02 rather than geometry regressions.
- AUD-02 remains blocked only on the canonical CoS Plugins restart followed by live generated rebuild-debt status/resume, current-revision recompute/rejection, and final Photoshop pixel proof.
## 2026-10-04 — E.8e scale-compatible deterministic brush-role resolution

- Tightened compact-pass brush-role resolution so the durable preflight role must match the requested pass scale in addition to material role and visual intent. A medium pass no longer becomes ambiguous merely because an otherwise equivalent detail-only role exists.
- Explicitly forcing a preflighted role from the wrong working scale now fails closed through the existing `brush_role_material_fitness_mismatch` path; ambiguous same-scale roles remain model-owned rather than being silently selected.
- Added focused regression coverage for scale-separated deterministic resolution and explicit scale mismatch. Verification: `tests/compact-contract-regressions.test.ts` **57/57 green**, TypeScript `--noEmit` green, `git diff --check` green (line-ending warnings only).

### 2026-10-07 — E.25 live canonical cubic raster acceptance

- Rechecked the actual working tree and current E.25 roadmap before live dispatch. The isolated Photoshop document `59` from the prior bootstrap remained active at 400x300 RGB/72 dpi.
- Closed the outstanding nonvisual bootstrap receipt/report through the compact Guard finalization path, then bound document 59 to `processes/curve-fidelity-process/run-02` as a `simple_graphic` diagnostic art run.
- Executed `e25-live-canonical-curve-20261007-02` through `photoshop_guard_cycle_auto` on the matching UXP runtime. The region payload used canonical handles unchanged: outgoing `[90,40]` from `(80,140)` and incoming `[190,120]` at `(180,140)`; no legacy diagnostic left/right swap was applied.
- Added `processes/curve-fidelity-process/run-02/verify-canonical-pixels.mjs` and durable `canonical-pixel-verification.json`. Read-only JPEG analysis of the exact 400x300 materialized AFTER frame (`25f05077...c52f3fe`) measured mean upper-edge error **0.845 px**, max **1.546 px** against the analytic cubic oracle, passing the E.25 **2 px** raster tolerance.
- The Guard visual mutation completed successfully and produced exact BEFORE/AFTER evidence. The subsequent compact verdict/finalization call was blocked by the host safety layer before dispatch, so this run records the independently reproducible pixel acceptance but does not claim that the pending Guard visual verdict was closed.
- Validation: `node processes/curve-fidelity-process/run-02/verify-canonical-pixels.mjs` PASS; `git diff --check` PASS. Remaining E.25 live gates are the ordered `(80,30)` transform and connected rigid/articulated construction acceptance.
