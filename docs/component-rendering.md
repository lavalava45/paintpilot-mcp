# Component space and construction rendering

Canvas coordinates are used by all drawing tools. `logical_layer.component_space`
separately declares what the component depicts:

- `world` (default): an object in the scene, retaining spatial construction and
  support/parent requirements when applicable.
- `canvas`: paper, a flat backdrop or graphic field. It still has a semantic owner,
  independent edit rights and exact-image Critic review, but does not require an
  invented physical support or object construction model.

A durable owner's space cannot be changed to escape existing debt. Canvas declarations
conflicting with construction, spatial bindings, support roles or saved construction
bindings are rejected. Do not classify a depicted building or animal as a canvas field.
Distinct meaningful parts remain independently editable in either space.

## Line-first construction

`next_pass.construction.rendering` selects how calculated closed contours are executed:

```json
{
  "mode": "outline",
  "size": 2,
  "opacity": 85,
  "flow": 80,
  "preset_name": "Hard Round"
}
```

Width is in canvas pixels. Opacity and flow are in (0,100]. The optional preset must be
installed; otherwise the prepared brush is used. `fill` remains the mass-rendering mode.
A line intention cannot silently execute a fill. An outline requires an explicit width
unless inherited from the last confirmed construction of the same owner. Confirmed
continuations inherit the renderer and style; failed or uncertain operations do not.

The compiler generates the existing `photoshop_paint_regions` operation with
`render_mode: "outline"`, `stroke_size` and `stroke_flow`. Native execution strokes the
closed paths using BRUSH, without filling them. Owned replacement verifies the selected
layer before clearing it, clips against old/new contour bounds including line width,
and restores foreground/brush state in one history transaction. Failure aborts it.

Pencil is an appearance choice: controlled BRUSH lines are preferred. Native PENCIL
uses current tool settings and must report positive diameter and opacity before use.
That readiness check alone does not prove a visible mark.

## Correction and acceptance

Critic admission receives durable semantic owners, so construction can be repaired with
real structural brush geometry on an existing independent component. Named part/relation
requirements, unchanged-geometry checks, semantic separation and visual rechecks remain.
A texture or detail pass cannot stand in for a structural correction.

The artist must still choose plausible geometry and separate meaningful parts. Contour
rendering cannot repair an incorrectly authored silhouette or turn one combined facade
into independent layers. Offline contract and simulated-host checks do not prove artistic
quality. Next acceptance is the user's same-prompt pagoda run, checking early thin lines,
recognizable architecture, retained style and editable parts against actual pixels.

After building, activate both parts: Restart the PaintPilot CoS plugin, Reload UXP, then
refresh the chat's tool catalogue so the new public fields are available. Deployment
health must confirm the loaded pair; source/dist equality alone is not live activation.
