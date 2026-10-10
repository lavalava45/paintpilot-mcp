# Reference-guided painterly strokes

Source revision: `2026-10-09-hertzmann-strokes`. User-run native/artistic acceptance remains open.

Original bounded adaptation of Aaron Hertzmann's
[Painterly Rendering with Curved Brush Strokes of Multiple Sizes (SIGGRAPH 1998)](https://mrl.cs.nyu.edu/publications/painterly98/).
It generates ordinary Photoshop BRUSH actions inside the existing Guard route, without a new MCP endpoint,
neural model, daemon, image-generation service or additional review round.

## Use

First establish an independently editable component and a completed whole-frame Guard preview. Choose an
aligned materialized JPEG reference that contains the desired form/light, not merely the current flat block-in.
The algorithm reproduces supplied image structure; it does not invent anatomy, composition or lighting.
Provide the reference's canvas placement and one component's contour or durable construction part:

```json
{
  "next_pass": {
    "request_key": "painterly-body-01",
    "document_id": 42,
    "goal": "Model the body from the accepted reference",
    "painterly": {
      "owner_id": "body",
      "reference": { "path": "C:\\art\\body-reference.jpg" },
      "reference_bounds": { "left": 100, "top": 100, "right": 500, "bottom": 500 },
      "construction_ref": { "model_id": "study", "revision": 1, "part_id": "body" },
      "brush_radii": [24, 12, 6],
      "max_strokes": 24,
      "error_threshold": 18
    }
  }
}
```

These ids/path/bounds are illustrative; use actual public returned state. If there is no construction model,
replace `construction_ref` with `clip_contour`, an ordered polygon of 3..256 `{x,y}` points in canvas pixels.
An explicit `region_bounds` must contain that component contour; choose a narrower clip to restrict the edit.
Keep ordinary stage, material/brush role, style, preservation and previous-observation metadata when applicable.
The current preflighted preset and native BRUSH executor remain authoritative. A circular brush with a known
footprint is the clearest first experiment. Guard retains existing brush preparation and quality checks.

The reference accepts an optional expected `sha256`; an explicit mismatch is rejected. When omitted, Guard hashes
the bytes it actually decodes and retains that SHA. Files must be JPEG, at most 16 MiB/16 MP. Export an aligned
JPEG when the source is PNG or oversized. No base64 is put in text context. Reference placement preserves aspect
ratio; current whole-frame capture must also match the confirmed canvas aspect ratio. The current-frame path,
SHA, canvas dimensions and operation id come internally from authoritative completed current-document state;
the artist cannot supply an arbitrary BEFORE or relabel a stale frame. Changed bytes require public recovery.

One pass continues exactly one existing component on its pinned physical layer. It cannot create a whole subject
on one layer, choose a foreign owner, mix authored actions/construction fill/anchor restore, or bypass protected
state, geometry/style contracts or exact-image review. The Painter obtains the full contract from public tool
schemas/corrections, never by reading repository source/examples during painting.

## Algorithm and limits

1. Sample the reference and real whole-frame BEFORE into a bounded local analysis raster.
2. For each descending brush radius, approximate Gaussian smoothing with three separable running-sum box filters.
   RGB and the component mask are filtered together to prevent outside-reference colors bleeding into the component.
3. Calculate color residuals, find the largest eligible error inside each grid cell, and reserve work for finer scales.
4. Follow tangents to Sobel luminance gradients, maintaining direction continuity and filtered curvature. Stop at
   color-error, length or footprint boundaries; a zero-gradient start yields a dab.
5. Randomize selected marks reproducibly within each scale. Update a circular-brush surrogate only to guide finer
   scales in this same package. Native rendering guides every subsequent pass.
6. Generate one ordinary `photoshop_paint_strokes` action and reduce its count, if necessary, using the actual
   `strokeExecutionBudget`. Counts/remaining candidate debt and exact source/plan hashes persist with the operation.

This first adapter uses direction-smoothed polylines, not the paper's cubic B-spline renderer. It prioritizes
the largest residuals under a bounded budget rather than rendering every candidate. It also clips the nominal
round footprint conservatively, whereas the paper's original process repairs coarse edges at finer scales.
These are explicit integration differences, not a claim of a pixel-identical reproduction.

Default radii `[16,8,4]` are **canvas pixels**, default budget 24 strokes (maximum 32), and Photoshop size is twice
the radius. Choose radii appropriate to the component's actual size. Native cost includes per-stroke settings and
path length, so fewer than the requested maximum may fit. There are at most four radii and 24 direction steps;
default analysis longest side is 192 (maximum 384). Radius/count/threshold controls are artistic parameters, not
required prose. A stroke budget must reserve at least one mark per requested radius.

The native preset can have soft fringes, texture or stamp extent beyond the mathematical round footprint.
No new native polygon selection/mask implementation was added. Inspect actual marks outside the intended part;
offline containment is not a guarantee of native pixel clipping. Existing selections can also affect rendering.
Surrogate color error is never image evidence or a completion gate. When a budget trims the simulated package,
the after-error estimate is omitted rather than attributed to a different executed package.

The usual exact-image review includes a compact `painterly_target` with the reference path/SHA, owner, count and
remaining candidate debt. If the reference has not actually been observed, report that uncertainty; its path/SHA
alone never certifies reference observation. Judge visible form, light/material, edges and original style.
If zero marks are eligible, inspect the image and parameters; that condition does not prove the artwork is done.

After a successful reviewed pass, repeat the request with a new request key and the previous observation.
The generator replans from the new current frame. Do not carry a stroke-list offset, replay the old generated
marks, or automatically retry an uncertain mutation. Native timeout/reconcile/rollback behavior remains unchanged.

## Acceptance

Offline checks cover real public/native schemas and execution budget, curved scale ordering, deterministic planning,
matching-image no-op, concave footprint containment, coordinate registration, SHA/file errors, owner/model conflicts,
actual Guard compilation and current-document frame authority. These do not establish native artistic quality.

After activation, try one already built component with an observed reference and suitable preflighted brush.
Compare equal-scale BEFORE/AFTER, actual physical owner and contour, form/light against the original brief,
elapsed time to a visible gain and number of model calls. Continue only if there is a visible gain; a textured
flat pictogram is a failure of form, regardless of stroke count. No live painting/restart was run for this change.


## Polygon domains and explicit protected cutouts (2026-10-09)

Clipper2 is used through `clipper2-ts`, a separately credited TypeScript port. The adapter normalizes
the declared outer contour with even-odd fill, unions explicit exclusions, subtracts them, then computes
an inward offset once per brush radius. Holes and disconnected surviving islands remain intact.
The original distance checks remain conservative safeguards against rounding and offset approximation.

Optional `clip_exclusions` contains 0..8 ordered polygons, each 3..256 finite points in canvas pixels
inside `reference_bounds`. Exclusions are a union, not XOR: overlap never reopens a protected area.
They may protect openings/accessories/other pixels within the one selected component clip; they do not
authorize drawing another owner or create/split physical layers. Example addition to an existing pass:

```json
{"clip_exclusions": [[{"x":20,"y":20},{"x":40,"y":20},{"x":40,"y":40},{"x":20,"y":40}]]}
```

The integer domain uses 1024 units per pixel, finite coordinates within +/-10,000,000 pixels, and a
32-contour / 4096-vertex computed-mask cap. Excess complexity is rejected with
`painterly_clip_geometry_invalid` and correction text rather than silently losing holes/islands.
An eroded-away region produces no stroke at that radius. Provenance records library versions,
exclusion count, settings and a clip hash covering the outer contour and exclusions.

These are computational stroke domains, not a native Photoshop selection/mask. Preset fringes,
texture and softness still require the ordinary exact-image review. No extra MCP endpoint or model
round is added. Credits/licenses are in [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md).

## Painting from a text brief without a reference (2026-10-09)

Choose exactly one `reference` OR `form_field`. `form_field` is an explicit analytic target, not a
photographic reference: `{kind:ellipsoid|light-field,center:{x,y},radius:{x,y},light_direction:[x,y,z],
shadow_color:{red,green,blue},light_color:{red,green,blue},rotation_degrees?,ambient?}`. Colors must
differ. Bounds use the existing `reference_bounds` canvas rectangle. Ellipsoid normals follow the
authored orientation/light; light-field gives broad chosen illumination falloff. Choose appropriate
independent component contours/exclusions; the planner cannot discover anatomy, folds or cast shadows.
The existing bounded gradient/residual brush planner and native budget compile marks on the selected
existing owner. Provenance explicitly says `source_kind=authored-form-field` and stores its parameters
and digest, with no fake reference path/SHA. Review real pixels and native fringes as usual.
