# S01 — tiger qualification: blocked painter/Director route (2026-10-13)

**Status: FAILED/UNFINISHED exploratory Photoshop trial. Do not label as a painted tiger or accepted Beta scene.**

Related exact prompt: [the user-specified six-scene manifest](RELEASE-QUALIFICATION-SCENES-USER-20261013.md), section S01. This is a concrete reproducible incident from **COS Plugins → PaintPilot MCP → UXP Photoshop**, not an ImageGen task.

## Exact checkpoint at handoff

| Fact | Confirmed state |
| --- | --- |
| Candidate source commit tested | `e345698b3736dff5b0f7bdb07c170762f593c644` |
| Live MCP/UXP prior to S01 | `deployment:health = current`; live server and UXP fingerprints matched the candidate at start |
| Photoshop document | `document_id=3508`, RGB `1200 × 1800` |
| Run directory, relative to candidate root | `processes/tiger-moon-oil-process/release-qualification-s01-20261013` |
| Durable run state | `painting-state.json` inside the run directory |
| Current stage | `GLOBAL_BLOCK_IN` |
| Last real **visual** operation | `s01-tiger-torso-block-01` |
| Current-frame SHA-256 | `99a0000d8ca8aeed9c29f4392188726644b9741d16ec7071bd85d744a7eec474` |
| Current frame acceptance | `accepted=false`, `goal_confirmation=unresolved` |
| Exact frame | `export/frames/0003_s01-tiger-torso-block-01.jpg` |
| Layered saved PSD | `final/tiger-s01-unfinished-blockin.psd` (320,055 bytes when checked) |
| Nonvisual save operation | `s01-save-unfinished-psd-01`, completed and acknowledged |
| Guard resume | No active job, pending operation ACK, pending report, uncertain mutation or identity recovery blockers; `decision-loop stall` advisory |
| Active primary defect | `cumulative-trend-primitive-footprint-repeating`, global, must-fix, open, `priority_review_required=true` |
| Guard's `workflow_metrics.workflow_stall` flag | `false` at inspection; **do not** conflate it with the advisory decision-loop stall or route conflict |
| Accidental art-run configuration | `painting_profile=simple_graphic` despite user requesting a realistic romantic oil painting. Review profile selection before a *new* run; no causality inferred without experiments. |

All run-relative paths above are under:
`E:\Downloads\devspace-test\release-candidates\paintpilot-beta-rc-20261013\processes\tiger-moon-oil-process\release-qualification-s01-20261013\`

## What is actually painted and what remains missing

The observed frame has **only** (1) a nearly uniform dark indigo background, (2) a cream-colored smooth circular moon on its own layer, and (3) a smooth warm-brown oval tiger torso mass with two color patches on a separate layer. No recognizably roaring head, jaw, front or hind paws, tail, fur, contact with moss-covered rocky ledge, misty mountains, or painterly oil finish exists. The torso has not passed artistic acceptance.

The three executed visual operations, in order:

1. `s01-tiger-night-sky-base-01` — indigo base, accepted solely as an initial bounded color underpainting.
2. `s01-tiger-moon-celestial-01` — moon disk, independent layer, accepted solely for bounded placement.
3. `s01-tiger-torso-block-01` — broad torso mass, explicitly reported **unresolved** as primitive / scaffold-dominant. Last real visual operation.

Earlier requests were rejected by Guard and did not mutate Photoshop; they must not be counted as art passes. In particular, `s01-tiger-anatomical-mass-01` was rejected for `scene_component_decomposition_required`: a tiger is a compound animal and cannot own all separately editable anatomy on one layer. A corrected multiple-owner scene plan was then declared, and only the torso was painted.

## Reproducible orchestration conflict

At the final torso visual review, the agent truthfully marked its primitive footprint as `suspect` and its bounded target as `unresolved`. The Guard then promoted a cumulative trend from both the moon and torso into:

```
problem_id: cumulative-trend-primitive-footprint-repeating
scale: global
severity: must-fix
status: open
region: multiple materially separate regions
supporting_regions:
  - moon: bounds [800,145,1015,365]
  - torso: bounds [245,756,706,1125]
```

The agent tried the **next necessary substantive art step**, a separate tiger head/neck component at medium scale, instead of adding atmosphere or decorative detail. Guard rejected `s01-tiger-head-neck-01` with `stage_priority_gate`:

> medium mutation blocked by unresolved global must-fix "cumulative-trend-primitive-footprint-repeating" ... Use photoshop_guard_art_director action=review to bind an active medium construction task to correction_target ... addresses_problem_id="cumulative-trend-primitive-footprint-repeating"

The first Director request lacked `directive.value_check` and was rejected with actionable schema guidance. After adding `value_check: {status:pending, observed:false}` and an explicit construction plan for the missing animal anatomy, **Art Director rejected the prescribed route too** with public code `guard_art_director_rejected`:

> directive.tasks[0].correction_target problem_id="cumulative-trend-primitive-footprint-repeating" requires an open global must-fix or an open medium must-fix with Critic-reviewed region_bounds enclosing the proposed target; current=missing. A label or Director-only region is not spatial evidence.

**Observable contradiction:** the priority gate sees this global must-fix as blocking; the Director gate does not recognize sufficiently Critic-verified spatial authority to define a bounded target for precisely that problem. The recorded `active_problem` has supporting bounds from the two independent regions, but the proposed tiger-head target was not accepted as Critic-enclosed evidence. This is a **specific failed corrective route**, not proof that every possible alternate public route is impossible.

After two semantic repair attempts, no further mutation was dispatched; the torso visual verdict was closed as **unresolved**, a layered PSD copy was saved and its save receipt acknowledged. The latest public `photoshop_guard_resume(document_id=3508,projection=recovery)` confirmed no pending jobs or uncertain mutations. The current image remains an unfinished trial and should be preserved.

## Next engineering and artistic steps (NOT YET DONE)

**Source fix recorded after this incident:** The repeatable conflict is a
close+next *transactional durability* fault, not proof that the Art Director
needs weaker spatial admission. On a new cumulative global must-fix promoted
by a valid previous exact-image verdict, post-closure Painter priority
revalidation used to restore the entire closure snapshot on rejection, so the
following Director request could not find the problem it had been told to
repair. The guarded runtime now **retains that validated visual closure and
its promoted global debt** when only the new next pass is rejected by the
newly durable global priority. No rejected Photoshop mutation is dispatched.
Rollback/uncertain closure still restores the snapshot, and Director medium
task/geometry/ownership requirements remain intact.

Owning regressions:
- `tests/embedded-guard.test.ts`: real two-pass cumulative promotion inside
  a combined close+next cycle, retained valid verdict and newly durable
  global must-fix, no execution of the rejected continuation; existing
  rollback snapshot test remains required.
- `tests/planner-painter.test.ts`: durable multi-region cumulative defect
  admitted by Director as a bounded medium correction, while the global
  parent remains open and an unplanned pass is rejected.

**Engineering tests do not prove artistic recovery.** Rebuild/activate this
source change, run the corrected Director/Painter path in a fresh Photoshop
S01 document, and inspect the actual tiger anatomy before closing this
incident. The original failed PSD remains untouched.

1. **Do not patch around the tiger/theme.** Construct a subject-agnostic owning regression test using an open *cumulative global* must-fix promoted from multiple materially separated Critic-reviewed regions, followed by a real medium construction correction that directly addresses it. Test both public Guard rejection instructions and Art Director's region-admission rule against the same durable state. Preserve exact Critic/owner/rollback authority; do not weaken safety.
2. Determine the general viable mapping from multi-region cumulative evidence to a bounded medium correction, or provide a clear executable alternative (such as a legitimate global construction pass). No ungrounded region union and no fabricated Critic assessment. The user should not have to hand-author technical metadata already saved in Guard.
3. Validate the appropriate **supported** art profile and available oil/texture brushes before the next realistic painting run; `simple_graphic` is confirmed and may be inappropriate, but must not be silently replaced with an invented profile.
4. Rebuild a new candidate and rerun owning tests, canonical verification, activation fingerprint checks, then rerun **S01 from a new blank Photoshop document**, preserving the current PSD and exact preview as failure evidence.
5. Require anatomical tiger, actual jaw/legs/contact, form lighting, rich fur and rocky/environmental painting before considering an artistic result acceptable. Do not use ImageGen or pre-rendered artworks.
6. Keep S02–S06 as **not started**. The user-specified six-scene manifest was written only after S01 began; this old S01 remains a pilot failure, not a preregistered accepted run.

## Source of truth / reproducibility

- **Prompt set:** `docs/RELEASE-QUALIFICATION-SCENES-USER-20261013.md`
- **Run and current image:** `processes/tiger-moon-oil-process/release-qualification-s01-20261013/painting-state.json` + `export/frames/0003_s01-tiger-torso-block-01.jpg`
- **Saved editable image:** `processes/tiger-moon-oil-process/release-qualification-s01-20261013/final/tiger-s01-unfinished-blockin.psd`
- **Canonical project policy:** `docs/RELEASE-HARDENING.md`
- **Existing 6-scene set in `docs/RELEASE-QUALIFICATION-SCENES.md`:** obsolete for this new six-scene evaluation, retained for historical reference only.

## Cross-run forensic comparison: cabin cat (2026-10-08) vs tiger (2026-10-13)

**This is the discriminating evidence missing from the generic 'use brushes' conclusion.** The old cat produced a *recognizable stylized animal*; its Critic verdict nevertheless remained `target_resolved=no`, `primitive_footprint=suspect`, `artistic_outcome=unresolved`. It was **not** proof of oil-paint realism or artistic acceptance.

Historical successful-at-recognition cat evidence exists in the **original developer workspace**, not necessarily in this isolated release-candidate worktree:

- `E:\\Downloads\\devspace-test\\experiments\\photoshop-mcp-digital-painting\\processes\\cozy-lakeside-cabin-process\\study-01\\export\\frames\\0005_cabin-sage-lace-curtains-04.jpg` — **BEFORE**, a flat but already positioned white cat scaffold on a rug next to the bed.
- Same path, `0006_cabin-cat-organic-form-05.jpg` / `.txt` — **AFTER** and exact commentary; the cat acquired a readable back, curled tail, face, ears, closed eyes and front paws.
- Same run, `export\\videos\\0006_cabin-cat-organic-form-05.mp4` — native Photoshop drawing capture.
- `E:\\Downloads\\devspace-test\\experiments\\photoshop-mcp-digital-painting\\.photoshop-runtime\\controller\\operations\\cabin-cat-organic-form-05.json` — executed native operation receipt. One create-layer and one `photoshop_paint_regions` with **30 independent color regions, 30 closed contours, 348 explicit points**, all 100% opacity; there were **no Photoshop brush strokes in this pass**. The rendered action itself was measured in seconds.
- Cat `painting_profile=nontrivial_painting` and `GLOBAL_BLOCK_IN`. Preferred `Square Charcoal` fur brush was listed in brush preflight but **not used** for this recognizable cat pass.

For the new tiger trial, the actual frame `processes/tiger-moon-oil-process/release-qualification-s01-guard-fix-20261013/export/frames/0005_s01-fix-tiger-torso-construct-v1.jpg` (under **this candidate workspace**) shows only a solid indigo ground plus four large anatomical silhouettes, with a smooth elliptical torso and tubular neck. Tiger likewise had `painting_profile=nontrivial_painting`. Head, jaw, neck and torso were compiled as **one filled region per `construction.part_id`**, one Photoshop pass for each; main anatomical detail was absent.

**Causal distinction, not yet a proved artistic fix:** the current enforced compound-object construction pipeline (introduced after the cat pass, in the 2026-10-10 integration commit `8775e56`) owns compound parts on separate semantic layers and sends a single part outline through the construction compiler. On an already construction-bound owner, structural replacement using guessed raw `paint_regions` is rejected with `construction_execution_required`; the valid correction path must use a revised shared construction model. This is a constraint on *execution route*. It is **not** evidence that Guard invented the oval: the artist-authored tiger model itself used a handful of smooth outline points forming the oval. Thus both **weak authoring of form** and **one-outline-per-part execution granularity** are involved. The cat's 30 regions demonstrate that rich semantic subforms are possible in Photoshop without switching to a textured brush method.

**Minimal falsifiable next experiment, before another long art session:** use a disposable copy / dedicated run; preserve all nine anatomical owner IDs and their independent layers, as required. For **one** owner (head or torso) revise the construction model to a visibly asymmetric, anatomically structured contour and run an authorized bounded replacement. Inspect exact BEFORE/AFTER. If the corrected outline is faithfully rasterized, the ellipse originated in authoring, not Guard normalization. If a valid improved target is rejected or simplified back into a primitive, isolate the enforced construction compiler/Guard restriction. Then test whether rich face/plane/ear/paw subregions can be added **within the same exact owner** using a lawful detail/refinement route (not arbitrary whole-animal ownership), measuring visible recognizability and operation count. Fail fast if the result is still a featureless primitive after the bounded experiment; do not add cosmetic stripes, sky or new release functionality. Painterly oil-finish acceptance is a later, distinct test.

**Time/performance warning:** cat's object-form drawing was a single short pass; tiger accrued many Guard/planning round-trips before any meaningful drawing. Track guard rejects and host/model gaps separately from actual Photoshop execution time. Regression acceptance must score **image recognizability per wall-clock minute**, not just TypeScript/Vitest PASS counts.

## Bounded falsification experiment: same-owner torso construction vs multi-plane color (2026-10-13)

**Result: PARTIAL TECHNICAL PASS / ARTISTIC FAIL / SECOND PROBE NOT DISPATCHED.** Stop as promised; do not assert this is a tiger or a completed S01 scene. Every Photoshop drawing operation below used COS Plugins / guarded Photoshop MCP, **never ImageGen**.

- Active Photoshop document: `3527`, original 1200x1800 RGB S01 trial, same independent owners and physical layer 5 for `tiger-torso`. Previous separate head, jaw, neck layers retained.
- Guard Art Director: `s01-tiger-global-primitive-reconstruction-v2`; active task `s01-torso-structural-rebuild-v2`, open `cumulative-trend-primitive-footprint-repeating`. The task's authorized correction extent was expanded to `[260,775,705,1130]` to actually enclose **both** the old owned torso pixels and the new target. A newly authored Critic re-review used the exact current image/critic request and **split the compound brief-fidelity failure into ten independently failed obligations**, preserving all missing animal/environment requirements rather than marking an entire criterion passed.
- Visual operation `s01-torso-asymmetric-structure-experiment-20261013` **COMPLETED** as a guarded `REPLACE` on the existing owner layer 5. Reused durable model id `s01-tiger-connected-anatomy`, advanced revision **1 → 2** and replaced the nine-point smooth oval torso outline by a **32-landmark artist-authored asymmetrical contour**. Geometry/status verified the new model before painting. Exact delivered frame SHA-256 `ab4ecf5d74d4369f69d205c700bf5a2b3d1425ae5fd4361b83194c121e615e83`. Durable JPEG: `export/frames/0006_s01-torso-asymmetric-structure-experiment-20261013.jpg` under the ongoing run.
- **Whole-frame and focus BEFORE/AFTER inspection:** Photoshop copied the new outline, including uneven dorsal profile and notched belly. It did **not** simplify the contour back to the prior ellipse. This falsifies the hypothesis that the construction rasterizer automatically normalizes a valid novel contour into an oval. The outcome is still a crude flat abstract long-neck quadruped shape, with no credible tiger anatomy. Verdict finalized `target=unresolved`, `primitive_footprint=suspect`, global defect remains open. Authored design quality remains the major visible failure.
- Second planned A/B probe `s01-torso-same-owner-16-color-planes-20261013` supplied **16 distinct shaded anatomical `photoshop_paint_regions` areas**, each pinned to existing `layer_id:5` and fitting the current authorized correction region. Its first read-only lint reached `ok=true` after correct `construction_role=structured-mass`, `visual_intent=mass` and `region-block-in`. However, `cycle_auto` returned `whole_image_glance_required` with `execution=not-executed` and `visual_mutation_started=false` after the proposed contour correction. We submitted an exact SHA-bound `Art Director action=review` with `whole_image_glance.trigger=global_change`; it returned `ok=true`. A second identical semantic 16-region continuation still returned the **same** `whole_image_glance_required` under `post_closure_semantic_revalidation`, without dispatching any colored subforms. This might involve the close+next provisional transaction ordering, but **the cause is not established**. Do not claim that Guard cannot execute multi-region detail on an existing construction owner: it was **not tested on pixels**.
- Stopped rather than retrying unchanged contracts. Finalized the visible contour correction without a subsequent art mutation. Saved a *new* layered evidence PSD: `final/s01-tiger-asymmetric-torso-experiment-20261013.psd` (**337,139 bytes**) under `processes/tiger-moon-oil-process/release-qualification-s01-guard-fix-20261013`; technical save receipt acknowledged. The earlier `s01-tiger-anatomy-unfinished-guard-fix-20261013.psd` was retained.

**What this experiment establishes:** (1) An artist-authored asymmetric contour can be rendered faithfully under enforced compound construction, without owner/layer reassignment. (2) Such a contour, when authored without adequate feline morphology, still fails to produce a recognizable tiger. (3) Whether multiple meaningful color/material planes can execute within a construction-bound owner remains **unverified**, because the guard admitted them at lint but refused them at actual close+next priority review. The next engineering hypothesis is narrowly scoped: reproduce `whole_image_glance_required` after an acknowledged SHA-bound Director whole-image review during a combined visual close+next, and test the two-step durable closure route. Independently test same-owner many-region execution. Keep requirements for layer protection and Critic accounting intact. **No more full tiger run** until the smallest such A/B demonstrates visible anatomy and acceptable wall-clock cost.
