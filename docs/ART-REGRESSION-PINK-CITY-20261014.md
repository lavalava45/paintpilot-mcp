# Art regression audit — pink flying city, 2026-10-14

Status: incident evidence, **not** a benchmark of final quality. The two runs
used the same core brief, but different art-run profiles and deliberately
different compositions. Neither run proves that the five RC-reconciliation
commits caused the quality regression.

| Evidence | Earlier run | Later run |
| --- | --- | --- |
| Process | `processes/flying-pink-ninja-city-process/20261014-marker-city` | `processes/flying-ninja-city-process/pink-marker-city-20261014` |
| Profile | `simple_graphic` | `nontrivial_painting` |
| Composition | Multiple islands and bridges | Director selected `central-island` over `archipelago` |
| Completed visual dispatches at review | 19 | 3 |
| Model-visible Guard calls / rejected | 55 / 17 | 24 / 14 |
| Recognizable cast | 3 ninja | 3 ninja |
| Last brush-style pass | No confirmed organic marker strokes | `pink-city-organic-architectural-revision-05` did **not** paint: `guard_select_brush` failed `brush_setter_unverified` |
| Preflight | No durable nontrivial brush-role requirement | 123 inventoried presets, but roles `pink-marker` and `dry-texture` had `candidate_evidence=[]` and `probe_status=not-needed` |

## Causal findings

1. **Preset name is not native proof.** The Photoshop UXP selector emitted
   `preset_verification.source=unavailable` and `observed_preset=null`.
   The preparatory action failed before `photoshop_paint_strokes` could execute.
   The recorded microplan included 12 strokes; **zero were dispatched**.
   Never count authored actions as applied pixels.
   The same `brush_setter_unverified` failure was already reported for
   two Mykonos brush retries on 2026-10-11/12 (see CHANGELOG). This is a
   pre-existing Photoshop preset readback limitation, not a newly
   introduced regression from the 2026-10-14 RC reconciliation.
2. **Inventory is not a mark-profile.** The durable `brush_preflight`
   describes names/roles without observed footprints, buildup, pressure or
   behavior on canvas. The original technique requirement was therefore
   effectively unverified despite `completed=true`.
3. **Composition loss is independent of brush failure.** The new Director
   chose a single central island and proceeded to local revisions before
   completing broader environment relationships. In the earlier run, the
   artist established two side islands and bridges by its sixth visual
   operation. Neither layout is universally mandatory, but the current
   choice left significantly less spatial narrative.
4. **The stricter profile increased coordination cost.** The later run's
   rejected-to-visible-Guard-call ratio is `14/24` versus `17/55`.
   Its rejected operations include ownership, construction geometry,
   intent/material obligations, and repeated plan normalization. These
   are safety and semantic constraints, not proof that painting improved.
   `simple_graphic` skips some of these constraints; this does not justify
   silently downgrading the profile or weakening existing pixel protections.
5. **Loop escape remained advisory.** `decision_loop_stall` recognized
   an absence of progress but did not select an executable different
   strategy; follow-up work saved a PSD, not a better image.

## Regression criteria for subsequent runs

- Record the actual native preset identity or a truly **observed** alternative
  brush mark. Do not infer mark character from the name or successful API call.
- On incompatible native selection or unverifiable brush, stop before pixel
  mutation, attempt an independently verifiable alternative, then either
  continue using a genuinely different safe method or surface a bounded
  blocker. No infinite preset retry or repeated status calls.
- Evaluate brief-specific whole-frame composition against alternative
  hypotheses **before** local finish work. Preserve broad scene potential;
  do not interpret recognizability of three ninja as composition completion.
- Measure elapsed time to the first meaningful visual change, number of
  verified changes per Guard call, rejected plan reasons, and exact
  before/after pixels. A successful save operation is not visual progress.

The exact images and runtime-state files reside in the two process directories
above. The prior version has a richer **observed** composition at comparable
elapsed time, but differences in profile and stage prohibit isolating this to
one recent commit without a controlled A/B rerun.
