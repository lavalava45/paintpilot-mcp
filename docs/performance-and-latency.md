# Performance and latency

## Evaluator overhead in the current source

[Independent artistic review](artistic-evaluator.md) starts outside the mutation lease and reuses one
inference at the ordinary pass review boundary. Local controls measured 13.4s (early block-in) and 25.4s
(realistic form rejection); cold loading and GPU residency are additional costs. Include these in whole
request-to-pixel/quality-time comparisons. There is no added Guard cycle, but do not call this a measured
speed improvement until it actually reduces avoidable planning/rejection work. Provider failure has a
30s cooldown and cannot authorize replay or certify artistic success.


Current repository guide to painting-cycle performance evidence, optimization decisions and benchmark
boundaries. It combines the former policy optimization audit with the generated painting-cycle
latency benchmark.

The numbers below are **engineering evidence**, not a claim about model reasoning time or end-user
request-to-pixel latency.

## 1. Measurement boundaries

Guard telemetry can measure durable/tool-side boundaries such as:

- Guard preflight;
- Photoshop dispatch;
- closure/finalization;
- durable job/runtime projection;
- the wall interval between one returned visual result and the next Guard call.

It cannot reliably split that final interval into model reasoning, host scheduling, user think time,
visual inspection or UI rendering. Such intervals must remain labelled **unattributed**.

Do not combine journal timestamps and host tool-event timestamps as though they shared one clock
boundary.

## 2. 2026-09-20 bootstrap/status projection finding

A read-only reconstruction of the saved controller state reproduced a major local projection defect.

On the same cloned state (512 operation records, 32 historical documents and 154 job directories):

| Projection implementation | Wall time | Active-job scans | job.json reads | painting-state reads |
| --- | ---: | ---: | ---: | ---: |
| legacy nested projection | 27.245 s | 193 | 29,722 | 193 |
| request-local projection context | 0.595 s | 1 | 154 | 1 |

The optimized path reuses one request-local snapshot of operation records, painting state, active
jobs and capture time; document-specific filtering happens in memory. With frozen time, the complete
serialized result matched the legacy output.

This proves and removes the reproduced Guard projection defect. It does **not** prove that every
historical slow host call was exclusively caused by that defect.

The original smoke also showed that close-only host calls were expensive while their returned
`cycle_latency` described the previous operation, not the current finalization. Current runtime
therefore exposes dedicated finalization latency fields rather than re-labelling prior-operation
latency.

## 3. Policy/documentation optimization result

The painting policy was split into scoped modules so the runtime entry kernel can remain compact
without deleting artistic or safety invariants:

| Role | Current source |
| --- | --- |
| working runtime kernel | `digital-painting-agent-skill.md` |
| foundations / recognition / state / cadence | `painting-policy/foundations.md` |
| methods / Director-Painter / brushes / edges / value | `painting-policy/methods.md` |
| inspection / repair / rollback / conditional visual modules | `painting-policy/inspection.md` |
| reporting / focus / async / stalls / completion | `painting-policy/operations.md` |

The verifier checks the concatenated detailed modules and runtime prompt for shared invariants while
separately enforcing the compact kernel size and critical operating fields.

This is guided conditional reading, not a runtime lazy-policy loader. No preview barrier, Guard gate,
brush requirement, checkpoint rule, target protection or artistic hierarchy is relaxed by the
documentation split.

## 4. Optimization decisions

Current evidence supports these rules:

1. optimize repeated Guard/host bookkeeping before weakening visual verification;
2. preserve one bounded semantic bundle per artistic thought rather than maximizing mutation count;
3. use preparation/readiness caching where it removes repeated identical work without hiding state
   changes;
4. do not call an unattributed inter-call interval “model reasoning time”;
5. do not optimize preview materialization from aggregate dispatch telemetry until preview cost is
   independently observable;
6. production backend decisions are architectural correctness decisions, not justified solely by old
   latency comparisons with retired transports.

Fresh live-host acceptance should be recorded in the acceptance/evidence system; old benchmark
journals are repository evidence, not proof of the current live process.

## 5. Diagnostic continuation-phase instrumentation

Normal painting keeps the compact hot loop unchanged. For a timing benchmark only, PaintPilot now records
the server-side boundaries of explicit `photoshop_guard_review_image` delivery and accepts two opt-in
diagnostic markers through `photoshop_guard_status`:

1. call `photoshop_guard_review_image`; Guard records review-image request/result-ready boundaries;
2. after the image has actually been inspected, call `photoshop_guard_status` with
   `diagnostic_timing_marker={operation_id, phase:"review_finished"}`;
3. after the next bounded pass is prepared, call the same status marker with `phase:"next_pass_ready"`;
4. immediately continue with the ordinary `photoshop_guard_cycle_auto`.

The durable latency record can then partition the old opaque interval into:
`guard_response_to_review_request_ms`, `review_image_service_ms`,
`review_delivery_to_review_finished_marker_ms`,
`review_finished_to_next_pass_ready_marker_ms`,
`next_pass_ready_marker_to_guard_ms`, and `review_delivery_to_next_guard_ms`.

These markers are server-observed benchmark boundaries. They include host/tool transport around the marker
call and therefore are **not** pure model-reasoning measurements. They are diagnostic-only precisely so
ordinary painting does not gain two mandatory round trips.

## 6. Hot-loop orchestration compiler

The 2026-10-02 rainy-tram benchmark showed that Photoshop execution and JPEG delivery were not the dominant latency
classes. The primary hot-loop target is the interval after visual review, where the model previously had to reconstruct
Guard protocol state and could enter repeated preflight correction/recovery chatter.

The production path now supports:

`PaintingIntent -> NextPassCompiler -> durable-state injection -> local validation/repair -> Guard dispatch`.

The model owns the artistic decision. Repository code owns deterministic reconstruction of already-authoritative stage,
scale, owner/layer, planner, binding, protection and verification facts. The existing `next_pass` contract remains
available during migration and the ordinary Guard compiler remains the final validator.

Compiler telemetry is recorded independently from Photoshop work:

- `painting_intent_compile_ms`;
- `durable_state_injection_ms`;
- `local_validation_ms`;
- `auto_repair_ms`, `auto_repair_count`, `auto_split_count`;
- `model_semantic_ambiguity_count`;
- `preflight_rejection_exposed_to_model_count`;
- `intent_received_at`, `compiled_at`, `validated_at`, `repaired_at`, `dispatch_started_at`.

Safe deterministic repairs are journaled with fingerprints and structured repair operations. Never-dispatched rejection
is correction/resubmission state, not recovery. Safe budget splits persist a deferred sub-pass, but that remainder can
continue only after a new visual review explicitly confirms it is still appropriate.

For one-run analysis use an operation-id prefix and a standalone output file:

`node scripts/dev/benchmark-painting-cycles.mjs --operation-prefix <prefix> <output.md>`

Run wall time is bounded by the selected journals. `--process-dir` is deliberately unsupported because the operation
journals do not persist a durable process-directory run identity; treating a reused process directory as a run selector
would silently mix history. Remaining host/model/UI gaps stay labelled unattributed rather than being called reasoning
time.

### 6.1 Fresh hot-loop acceptance: `hotloop-final5-20261002`

The final scoped live run used a new 1200x800 Photoshop document and eight meaningful VisualMicroPlan passes.
Its generated report is `docs/hotloop-final5-20261002-benchmark.md`.

| metric | observed | target |
|---|---:|---:|
| median visual review | 13,337 ms | <=15,000 ms |
| review_finished -> next_pass_ready diagnostic marker | 1,752 ms | <=10-15s planning proxy |
| median PaintingIntent -> dispatch | 1,690 ms | <=2,000 ms |
| model-visible Guard round trips / artistic mutation | 1.25 | <=1.5 |
| rejected-before-dispatch round trips | 1 | <=2, preferably 0 |
| recovery-only round trips | 0 | 0 |

The benchmark does not currently persist a distinct `PaintingIntent ready` marker, so
`review_finished -> PaintingIntent ready` remains explicitly unknown; the diagnostic `next_pass_ready` marker is
reported separately rather than relabelled as model reasoning or exact intent-ready time.

One early PaintingIntent continuation in the same run measured **8,633 ms intent -> dispatch** and exposed a live
performance gap: `compactPassContext()` rebuilt durable context by repeatedly reading/scanning the global painting
state and operation history even though Guard had already captured a run-local projection. The hot path now threads
that captured projection through `PaintingIntent -> NextPassCompiler -> compileCompactPass -> deterministic repair`.
After that fix, the measured continuation samples P3-P8 all dispatched in **<=1,873 ms**, while PaintingIntent compile
fell to single-digit/low-double-digit milliseconds (4-12 ms in those samples). This is the main causal performance
result of the final live run; Photoshop dispatch itself remained roughly 3.6-4.0s and was not weakened or bypassed.

The run also confirmed **zero recovery-only turns**. Its sole predispatch rejection was
`structured_mass_iconic_primitive_compound`, the historical vertex-count heuristic retired on 2026-10-04 because
extra contour points do not prove form quality; the revised contour pass then dispatched normally. Full repository acceptance after the
implementation changes completed at **93/93 test files and 939/939 tests**.

## 7. Generated representative painting-cycle benchmark

The section between the markers below is generated from completed visual operation journals by
`scripts/dev/benchmark-painting-cycles.mjs`. Do not hand-edit it.

<!-- BEGIN GENERATED PAINTING CYCLE BENCHMARK -->
### Generated dataset

Generated by node scripts/dev/benchmark-painting-cycles.mjs from completed visual operation journals in .photoshop-runtime/controller/operations.

Dataset: **387 completed visual cycles**, including **327 VisualMicroPlan cycles**. Groups below require at least two observed samples.

Guard telemetry does **not** separately observe model reasoning, host scheduling, user think time, or preview materialization when preview capture is embedded inside the dispatched operation. Those components remain explicitly unknown rather than being re-labelled.

| workflow | n | semantic wall median / p95 ms | Guard preflight median / p95 | Photoshop dispatch median / p95 | visual-evaluation gap median / p95 | closure median / p95 | observed dominant component |
|---|---:|---:|---:|---:|---:|---:|---|
| photoshop_execute_visual_microplan \| GLOBAL_BLOCK_IN \| medium | 71 | 97449 / 399677 | 565 / 2802 | 1742 / 7784 | 84418 / 331668 | 605 / 1018 | unattributed host/model/visual-evaluation gap (84418 ms median) |
| photoshop_execute_visual_microplan \| GLOBAL_BLOCK_IN \| global | 67 | 63337 / 400031 | 236 / 2764 | 829 / 3333 | 54839 / 398004 | 308 / 967 | unattributed host/model/visual-evaluation gap (54839 ms median) |
| photoshop_execute_visual_microplan \| FORM_AND_LIGHT \| medium | 36 | 69048 / 2310758 | 459 / 1663 | 2583 / 40938 | 56875 / 2305135 | 377 / 877 | unattributed host/model/visual-evaluation gap (56875 ms median) |
| photoshop_execute_visual_microplan \| SHAPE \| medium | 35 | 83787 / 271853 | 2008 / 6639 | 1507 / 15163 | 75482 / 265617 | 754 / 3226 | unattributed host/model/visual-evaluation gap (75482 ms median) |
| photoshop_execute_visual_microplan \| FORM_AND_LIGHT \| global | 23 | 53770 / 234943 | 239 / 465 | 1106 / 8870 | 51291 / 230160 | 316 / 595 | unattributed host/model/visual-evaluation gap (51291 ms median) |
| photoshop_execute_visual_microplan \| DETAIL \| medium | 12 | 99457 / 799350 | 212 / 1671 | 13153 / 40368 | 70918 / 766540 | 124 / 377 | unattributed host/model/visual-evaluation gap (70918 ms median) |
| photoshop_execute_visual_microplan \| VALUE \| global | 11 | 51203 / 311141 | 147 / 204 | 833 / 4773 | 48721 / 309652 | 172 / 186 | unattributed host/model/visual-evaluation gap (48721 ms median) |
| photoshop_execute_visual_microplan \| SHAPE \| global | 8 | 97505 / 167682 | 2768 / 3151 | 1000 / 2247 | 88289 / 158029 | 691 / 754 | unattributed host/model/visual-evaluation gap (88289 ms median) |
| photoshop_execute_visual_microplan \| MATERIAL \| small | 7 | 82572 / 2257799 | 434 / 735 | 1451 / 9025 | 70476 / 2254795 | 556 / 635 | unattributed host/model/visual-evaluation gap (70476 ms median) |
| photoshop_execute_visual_microplan \| FORM \| medium | 6 | 51648 / 248732 | 260 / 1092 | 13487 / 55633 | 32335 / 232561 | 242 / 968 | unattributed host/model/visual-evaluation gap (32335 ms median) |
| photoshop_execute_visual_microplan \| FORM_AND_LIGHT \| small | 6 | 107962 / 160031 | 601 / 777 | 4214 / 15086 | 98480 / 142652 | 520 / 590 | unattributed host/model/visual-evaluation gap (98480 ms median) |
| photoshop_execute_visual_microplan \| FORM \| global | 6 | 145967 / 5217848 | 109 / 344 | 2370 / 59222 | 143971 / 5196806 | 260 / 448 | unattributed host/model/visual-evaluation gap (143971 ms median) |
| photoshop_execute_visual_microplan \| MATERIAL \| medium | 5 | 112862 / 189849 | 418 / 1820 | 23057 / 49008 | 57981 / 186840 | 310 / 808 | unattributed host/model/visual-evaluation gap (57981 ms median) |
| photoshop_execute_visual_microplan \| GLOBAL_BLOCK_IN \| object | 5 | 130714 / 4994619 | 780 / 964 | 1701 / 2338 | 123994 / 4987538 | 789 / 981 | unattributed host/model/visual-evaluation gap (123994 ms median) |
| photoshop_execute_visual_microplan \| DETAIL \| small | 4 | 114094 / 127819 | 122 / 1866 | 14539 / 50457 | 81820 / 98642 | 285 / 437 | unattributed host/model/visual-evaluation gap (81820 ms median) |
| photoshop_execute_visual_microplan \| DETAIL \| global | 4 | 59339 / 5955016 | 99 / 809 | 491 / 970 | 54655 / 5951857 | 111 / 711 | unattributed host/model/visual-evaluation gap (54655 ms median) |
| photoshop_set_layer_opacity \| GLOBAL_BLOCK_IN \| global | 4 | 29073 / 755986 | 4 / 169 | 102 / 108 | 27704 / 754858 | 120 / 159 | unattributed host/model/visual-evaluation gap (27704 ms median) |
| photoshop_apply_gaussian_blur \| GLOBAL_BLOCK_IN \| medium | 4 | 97409 / 62223065 | 958 / 2630 | 140 / 184 | 94045 / 62202174 | 756 / 882 | unattributed host/model/visual-evaluation gap (94045 ms median) |
| photoshop_delete_layer \| SHAPE \| medium | 4 | 63886 / 160153 | 1725 / 2411 | 38 / 81 | 57939 / 139703 | 747 / 914 | unattributed host/model/visual-evaluation gap (57939 ms median) |
| photoshop_execute_visual_microplan \| DETAIL \| object | 4 | 84027 / 118206 | 876 / 1505 | 20388 / 24886 | 58790 / 75904 | 762 / 835 | unattributed host/model/visual-evaluation gap (58790 ms median) |
| photoshop_execute_visual_microplan \| MEDIUM_FORM \| medium | 3 | 60727 / 119655 | 1033 / 1071 | 16685 / 27877 | 54618 / 96502 | 855 / 927 | unattributed host/model/visual-evaluation gap (54618 ms median) |
| photoshop_apply_gaussian_blur \| GLOBAL_BLOCK_IN \| global | 3 | 93357 / 129387 | 451 / 548 | 59 / 133 | 88865 / 128350 | 827 / 918 | unattributed host/model/visual-evaluation gap (88865 ms median) |
| photoshop_execute_visual_microplan \| DETAIL \| detail | 3 | 87914 / 676858 | 448 / 832 | 886 / 929 | 83698 / 663882 | 486 / 618 | unattributed host/model/visual-evaluation gap (83698 ms median) |
| photoshop_execute_visual_microplan \| GLOBAL_BLOCK_IN \| small | 3 | 126802 / 621463 | 3502 / 4522 | 8036 / 8936 | 112647 / 591298 | 883 / 1254 | unattributed host/model/visual-evaluation gap (112647 ms median) |
| photoshop_apply_gradient_mask \| GLOBAL_BLOCK_IN \| global | 3 | 40004 / 234483 | 5 / 9 | 93 / 137 | 39039 / 233278 | 94 / 184 | unattributed host/model/visual-evaluation gap (39039 ms median) |
| photoshop_set_layer_opacity \| FORM_AND_LIGHT \| medium | 3 | 34842 / 21554365 | 120 / 125 | 65 / 96 | 32260 / 21551342 | 359 / 548 | unattributed host/model/visual-evaluation gap (32260 ms median) |
| photoshop_execute_visual_microplan \| MICRO_DETAIL \| medium | 3 | 54699 / 89367 | 776 / 1667 | 25328 / 51936 | 20619 / 25406 | 358 / 678 | Photoshop dispatch + embedded preview (25328 ms median) |
| photoshop_apply_noise \| FORM_AND_LIGHT \| global | 3 | 15179 / 30227 | 246 / 425 | 72 / 72 | 12303 / 27236 | 625 / 657 | unattributed host/model/visual-evaluation gap (12303 ms median) |
| photoshop_delete_layer \| GLOBAL_BLOCK_IN \| medium | 2 | 73878 / 81830 | 616 / 671 | 31 / 196 | 46945 / 77101 | 615 / 1090 | unattributed host/model/visual-evaluation gap (46945 ms median) |
| photoshop_apply_gaussian_blur \| DETAIL \| global | 2 | 9837 / 10825 | 96 / 150 | 116 / 125 | 7881 / 8979 | 318 / 324 | unattributed host/model/visual-evaluation gap (7881 ms median) |
| photoshop_apply_gaussian_blur \| FORM_AND_LIGHT \| medium | 2 | 58532 / 73321 | 181 / 479 | 94 / 117 | 55580 / 69215 | 557 / 592 | unattributed host/model/visual-evaluation gap (55580 ms median) |
| photoshop_export_as \| DETAIL \| global | 2 | 18160 / 29077 | 433 / 572 | 229 / 403 | 13846 / 24035 | 841 / 874 | unattributed host/model/visual-evaluation gap (13846 ms median) |
| photoshop_apply_gaussian_blur \| FORM_AND_LIGHT \| global | 2 | 47270 / 132069 | 350 / 617 | 143 / 243 | 43453 / 109732 | 472 / 734 | unattributed host/model/visual-evaluation gap (43453 ms median) |
| photoshop_undo \| unknown-stage \| unknown-scale | 2 | 350530 / 350530 | 168 / 174 | 48 / 50 | unknown / unknown | 419 / 419 | closure (419 ms median) |
| photoshop_apply_noise \| DETAIL \| detail | 2 | 13031 / 22663 | 133 / 173 | 49 / 63 | 10358 / 20096 | 508 / 517 | unattributed host/model/visual-evaluation gap (10358 ms median) |
| photoshop_execute_visual_microplan \| MATERIAL \| global | 2 | 32017 / 37079 | 152 / 164 | 2733 / 3281 | 27443 / 32983 | 170 / 187 | unattributed host/model/visual-evaluation gap (27443 ms median) |

## Cross-workflow result

Across 327 completed VisualMicroPlan cycles, semantic wall time is 81683 ms median / 621463 ms p95. Guard preflight is 438 / 2930 ms, Photoshop dispatch (including embedded preview where inseparable) is 1566 / 25401 ms, the unattributed visual-evaluation/host/model gap is 70419 / 591298 ms, and closure is 500 / 1011 ms.

The largest observed median component is **unattributed host/model/visual-evaluation gap** at 70419 ms. This is an attribution boundary, not proof that model reasoning alone consumed that interval.

## Diagnostic continuation-phase split

Explicit review-image delivery boundaries are available for **0 VisualMicroPlan cycles**; both opt-in diagnostic markers (review_finished, next_pass_ready) are available for **0 cycles**.

These are **server-observed diagnostic boundaries**. Marker intervals include any host/tool transport around the marker call and must not be labelled pure model reasoning time. Normal painting does not require marker calls; enable them only for timing benchmarks.

## Optimization decision supported by the measurements

- Do not prioritize broad UXP migration merely to shave Photoshop execution time: in the recorded painting cycles, dispatch is materially smaller than the unattributed host/model/visual-evaluation gap for the aggregate VisualMicroPlan workflow.
- Keep the verified preparation cache and compact continuation work: they remove repeated host/Guard work without weakening the preview barrier, and target the higher-latency orchestration side of the cycle.
- Preserve one semantic bundle per bounded artistic thought rather than maximizing mutation count. Bundle size should be increased only where the measured dispatch/round-trip share justifies it and rollback remains coherent.
- Preview optimization should be revisited only after telemetry can separate preview materialization from Photoshop dispatch; the current journals intentionally report that component as unknown.

This benchmark is historical/repository evidence. The final clean-host acceptance must append fresh compact-v2 cycles from the rebuilt child rather than treating these older journals as proof of the new live route.

<!-- END GENERATED PAINTING CYCLE BENCHMARK -->

## Public state byte budget (2026-10-05)

Status/resume text is capped at 24 KiB UTF-8. Oversize full projections are saved under the existing runtime directory, with an exact full_projection_path and explicit omissions in response_budget. Small results need no extra I/O. Required identities/bindings are never abbreviated; required context that cannot fit produces an incomplete-state error. This bounds model context, not artistic quality or measured wall-time gain.

Review response-ready is sampled after receipt persistence and response construction. The endpoint joins its exact receipt on the next ordinary journal write, with no second telemetry write. A process interruption before that flush leaves review_image_response_boundary_complete=false: full service/gap intervals are unknown, and only review_image_service_prefix_ms is observed. Local ready responses expose the actual boundary immediately.

Throughput accounting_integrity compares receipt-owned dispatch counts with the run mirror in the current document incarnation. Proven disagreement suppresses the actions-per-call ratio; partial/legacy/unowned evidence remains unverified. The check reuses current projections and does not repair or reconstruct model-visible call totals.


### Recorder/checkpoint and repair scopes (2026-10-05 source)

photoshop_dispatch_wall_ms ends when dispatch resolves/rejects, before recorder finalization. recorder_prepare_ms
and recorder_finalize_ms measure lifecycle overhead; recorder_settle_ms, recorder_stop_ms and
recorder_postprocess_ms subdivide finalization and are not additive to it. Failed/unused phases remain unknown.
A due automatic checkpoint owns automatic_checkpoint_wall_ms and its dispatch/reported execution in its journal.
Its wall boundary is before the timing write; full cycle wall includes that write. The next pass carries only
an automatic_checkpoint_operation_id, including the prepared async path. Do not add checkpoint dispatch twice.
No additional Photoshop reads or model turns; one timing write only when a checkpoint is due.

violation_accounting rows carry scope (cycle/finalization/compiled mutation) and origin (initial/introduced).
Only typed deterministic compiled-mutation defects enter the benchmark repair percentage. Legacy, unowned or
inconsistent rows leave the percentage unknown. Scoped durable counters supplement the old compatibility map;
this is diagnostic evidence, not an artistic score or proof of complete run ownership. Live trace/checkpoint
latency and quality/time comparisons remain required.
