# General object construction

Implemented source revision: `2026-10-09-ik-construction` (includes the earlier general-construction and contour-library work).

This is one category-independent construction language and numerical solver. Object names do not select
algorithms. An animal, instrument, vehicle, machine, invented creature or abstract prop uses the same points,
parts, poses and geometric relations. The examples are offline acceptance data, not a closed object catalog.
`subject_kind` affects editable component ownership only; `custom-compound` covers other compound subjects.

## Public workflow

Use `photoshop_guard_cycle_auto(next_pass=...)` with `next_pass.construction` instead of hand-written actions.
Keep the usual request key, document id, goal, artistic decisions and applicable scene/style/review contracts.
Construction does not bypass those contracts or automatically choose a new camera/style.

```json
{
  "request_key": "study-component-01",
  "document_id": 4280,
  "goal": "Build one independently editable component",
  "construction": {
    "model": "<object matching the public construction model schema>",
    "part_id": "chosen-component",
    "color": { "red": 90, "green": 110, "blue": 80 }
  }
}
```

The model placeholder above must be a JSON object, not a string. After a completed pass, subsequent components
omit `model` and send `model_id`, optional exact `revision`, `part_id` and explicit RGB `color`. Guard reads the
current document's durable model internally. It generates one component per pass, its ownership plan and
layer-separation metadata, and binds the paint to that component's exact existing layer or a newly created layer.
Different parts retain different owners/layers. Explicit conflicting owner/layer decisions are rejected.
Do not combine generated construction with authored `actions` or anchor restore. Existing-layer fills are
additive; reconstruction/erasure and preservation still use the established explicit Guard workflow.

Optional pure calculation: `photoshop_guard_status(construction_model=<model>)` returns solved/projected landmarks,
component bounds and exact target hashes without querying Photoshop, writing a model or painting. It does not
make the model durable. `construction_ref={document_id,model_id}` inspects a completed durable construction and
reports already constructed parts requiring rebuild after a geometry revision, and parts not yet constructed.
These modes are exclusive with ordinary status/lint/timing arguments. No additional MCP tool was introduced.

Painting agents obtain the complete contract from public tool schemas/field corrections, not by reading this
document, examples, source, tests or runtime journals during painting.

## Model

- `model_id`, positive `revision`, `basis`: provenance of the chosen proportions (reference, accepted construction,
  or explicit artistic choice). A text provenance declaration is not verified reference or pixel evidence.
- `objects`: stable id, subject kind, optional intrinsic-to-scene `origin`, uniform `scale`, and rotation in degrees
  `[x,y,z]` applied in that order. A change of pose preserves the object's intrinsic ratio constraints.
- `points`: stable id, object id, initial `position=[x,y]` or `[x,y,z]`, and `fixed`. Unfixed landmarks are solved
  from the supplied pose. Fixed values remain fixed; no anatomical pose is invented from an object name.
- Optional point `relative_to`: its position is an offset from another point in the same object. Optional
  `axis_to` rotates that offset with the parent-to-axis direction. X follows that axis; Y is perpendicular,
  using the object's Z direction (Y reference when the axis is near Z). This carries contour controls along
  with moving/rotating structural landmarks. Dependencies must be acyclic and initial axes nondegenerate.
- `parts`: stable id (also semantic owner id), object id, descriptive role, ordered closed `outline` point ids,
  and optional `curve=linear|smooth`. Smooth contours use bounded Catmull–Rom sampling after projection;
  smoothing is an artistic choice and may overshoot control points. Outlines describe free-form shapes,
  not a fixed catalog of geometric icons. The first implementation generates filled closed contours.
- `constraints`: independent ids and geometric relations. Default `space=object` uses intrinsic coordinates
  and requires all referenced points to belong to one object. `space=scene` includes poses/scales and permits
  relations between different objects. Perspective shortening is applied afterward, not confused with
  intrinsic or scene lengths.
- `camera`: `orthographic|perspective`, pixel `origin=[x,y]`, positive `scale`; perspective also requires positive
  `distance` and `focal_length`. Scene X points right, Y down, Z away from the camera. Perspective projects
  using `focal_length/(distance+Z)`; points at/behind the camera plane are rejected. Use the chosen scene camera
  consistently; a calculated construction camera does not independently authorize contradictory scene geometry.

Constraint point order:

| Kind | Points | Meaning/value |
| --- | --- | --- |
| distance | A,B | Length AB = value |
| ratio | A,B,C,D | Length AB / length CD = value |
| coincident | A,B | Same position; attachment/contact |
| parallel | A,B,C,D | AB parallel to CD; seed determines direction |
| perpendicular | A,B,C,D | AB perpendicular to CD |
| angle | A,B,C,D | Angle between AB and CD = value in degrees [0,180] |
| midpoint | A,B,C | A = midpoint of B,C |
| symmetric | A,B,C,D | A,B reflected about axis C,D (in 3D: 180-degree axial symmetry) |

The bounded damped least-squares solver starts from explicit point positions. It moves only unfixed
coordinates/offsets; a flat construction stays flat unless supplied depth/pose establishes 3D freedom.
It has 48 iterations, at most 32 movable landmarks (128 total points), 128 relations, 64 parts and 16 objects.
The default tolerance is 0.0001; distance/position residuals use construction units, angle residuals radians,
and ratio/parallel/perpendicular residuals dimensionless values. Impossible constraints, a poor initial pose
or failure to converge return all outstanding relation residuals together before any Photoshop dispatch.
Nonconvergence does not prove mathematical impossibility. References/basis and artistic proportions remain
artist decisions; the solver cannot discover correct violin/crocodile dimensions from their names.

## Revisions, review and preservation

Same model id/revision cannot be overwritten with different geometry. Advance revision when changing the model;
stale requested revisions are rejected. Cached models come only from completed, dispatched, current-document,
nonfailed and nonretired operation records. Quarantined identity, foreign documents and rolled-back models cannot
grant authority. Compiling or pure solving is read-only. The existing execution lane owns durable operation writes.

Changing a model does not retroactively redraw other parts. Public `construction_ref` reports their differing
target hashes as `parts_requiring_rebuild`. Reconstruct/review those owners explicitly; historical pixels/layers
are never relabelled to pretend they have changed. Unconstructed components are also listed.

The existing exact-image review includes the selected construction target, bounds and up to 16 projected outline
landmarks. Compare actual visible proportions, connected contours and occlusion with those targets and the
original brief. A passing numerical solve, planned contour or successful dispatch never sets
`pixel_geometry_verified` or `artistic_quality_verified` to true. These remain explicit false claims until real
image evidence can support a separate assessment. No extra model review round or inference service was added.

This implementation supplies construction and projection, not automatic anatomy recognition, reference
extraction, surface shading, a full 3D renderer, collision/occlusion solving, ARAP deformation, or automatic
disassembly of existing flattened pixels. Existing painting tools provide materials/light/detail after form review.

## Offline acceptance data

- [Crocodile](../examples/object-construction/crocodile.json): arbitrary free-form body/head/tail with a tail/head ratio.
- [Crane](../examples/object-construction/crane.json): rigid boom length/angle, attached contour and vertical cable.
- [Violin with gnome](../examples/object-construction/violin-gnome.json): curved instrument, separate neck, second
  articulated subject and shared perspective/depth.

These deliberately simple studies check mathematics and ownership, not finished artwork or realistic anatomy.
User-run acceptance after activation must inspect actual physical layers, projection, contour shape and the
construction comparison in delivered images. No live test or plugin/app restart was performed during implementation.


## Smooth contour geometry (2026-10-09)

`curve: smooth` preserves the existing closed Catmull-Rom shape, converts it to cubic Bezier segments,
and uses Bezier.js subdivision to meet a 0.25 canvas-pixel flatness tolerance. There are at most 256
output points per part. A part that cannot meet accuracy within the cap produces
`construction_curve_budget` with its part/outline path and concrete correction; no silent truncation.
This improves curve approximation, not the chosen artistic proportions or anatomy. Anchors, constraints,
projection, editable component ownership and the existing image review still govern the result.

The new renderer can change a smooth part's target hash. Existing pixels are retained; stale targets
require ordinary rebuild/review, and an old recorded contour is not certified against a recomputed shape.
`contour_geometry` records adapter revision and exact library versions in solve/provenance metadata.
See [third-party credits](../THIRD_PARTY_NOTICES.md). The contour-library adapter is separate from the articulated solver described below.


## Articulated target/contact construction (2026-10-09)

`model.ik_chains` uses IK.ts (`ikts@1.3.7`, FABRIK) before the generic relation solver. Each chain preserves
bone lengths measured from its authored initial pose. No noun selects a skeleton or anatomical ratios.
The same format describes arms, legs, articulated tails, crane links or other connected rigid parts.

```json
{"ik_chains":[{"id":"reach","points":["shoulder","elbow","hand"],"target":[3,2],"dimension":"2d","bend_limits":[120]}]}
```

The referenced landmarks must exist in one object with absolute object-local coordinates. A top-level
root is fixed. Every other joint is non-fixed and driven by only one chain. A child's root may be a
parent's driven landmark; dependency order is resolved internally, and cycles/multiple writers are
rejected. Relative contour controls (`relative_to` / `axis_to`) remain supported and follow the solved
joint poses; chain joints themselves may not be relative controls. Parts still have distinct owners
and physical layers; one part is constructed/reviewed per pass.

There are at most eight chains, 2..17 points per chain (1..16 bones), 64 solve iterations per chain,
and 32 general movable landmarks in addition to bounded IK-driven points, within the existing 128-point
model cap. Every authored bone length must be >=0.000001 construction units. `target` is explicit
[x,y] or [x,y,z], within +/-1000000. `dimension` is inferred from local depth if omitted; 2d requires z=0.
Common object transforms, orthographic/perspective projection and original relation checks still apply.

Optional `bend_limits` has exactly points.length-2 values in [0,180] degrees: maximum deflection from
straight at each interior joint (2d symmetric limits; 3d ball-joint cones). Omission means 180/free;
0 means straight. Hinge-axis constraints, pole-vector control and automatic anatomical limits are not
implemented. The initial pose supplies the bend/plane hint; revise it when an ambiguous or singular
pose cannot reach the target within tolerance. Authored length/anchor identities are never relaxed.

Successful results include `ik` metadata with backend/version, targets, actual endpoints, lengths and
residual. Guard independently checks finite coordinates, root, lengths, bends and endpoint error against
model tolerance. Unreachable targets (`construction_ik_unreachable`) include the authored reach interval;
unsolved limited/singular poses (`construction_ik_unsatisfied`) require revising pose/limits/target.
A parent-driven 2d root leaving z=0 returns `construction_ik_plane_conflict` with a dimension correction. Independent chain-format failures are collected as `construction_ik_format_invalid`. Generic constraints
that conflict with solved joints are rejected, not solved by stretching the chain. A failure paints nothing.

A target/pose edit requires advancing model revision. Changed part hashes drive the existing rebuild debt;
retained pixels are never silently moved or relabelled as corrected. Durable model storage, public status
solve and normal exact-image review remain the existing route. IK success is not pixel/artistic acceptance.
See [authorship and license lineage](../THIRD_PARTY_NOTICES.md).

## Choosing a method from the brief

A brief involving reach, physical contact or a pose revision calls for jointed construction with stable
lengths. Continuous contours call for smooth curve construction. Form/light/material refinement from a
real aligned reference calls for the bounded painterly path; explicit cutouts protect openings/accessories.
These are problem-based choices supported by host guidance, not a requirement to use every feature in every
painting. No reference path/alignment or artistic proportions may be fabricated merely to enable a method.

## Executable proportions and shared rigid pose (2026-10-09)

Fresh nontrivial art runs enforce shared construction for planned compound components. Pure
`guard_status(construction_model=...)` remains read-only and creates no executable binding. Part ids
match independent ownership ids. Choose measured distance/ratio constraints, authored IK lengths,
or `proportion_checks:[{id,points:[A,B,C,D],min,max}]` for intrinsic length(A,B)/length(C,D).
Bounds are authored from the brief/reference/artistic intent, never inferred from an object name.
Add actual axis/attachment/contact constraints where needed; numerical success is not pixel proof.

`objects[].rigid:true` requires fixed local points/offsets. A later rigid edit changes shared
origin/rotation; shape, uniform scale and component membership cannot change silently. For an
intentional shape correction name `construction.reshape_object_ids`, advance revision and rebuild
the changed parts. Old/current projected target hashes track stale components. Model-bound manual
rotate/move operations are refused, including nested and direct compatibility requests. Partial
rebuilds may remain saved; refinement/completion cannot hide their debt. Legacy runs retain their
existing policy; adopting construction means explicitly replacing/reviewing the existing parts.

Rebuilding an existing component uses `action_class=REPLACE` and `paint_regions.replace_contents`
inside one history transaction on one pinned owned nonbackground raster layer. The backend selects
layer pixels, clears old contents then paints the new contour; failure rolls back the transaction.
It does not clear another component or flatten the scene. Real UXP acceptance is still user-run.
