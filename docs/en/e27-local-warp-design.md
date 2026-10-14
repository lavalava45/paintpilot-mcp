# E.27 — Local warp: preparatory geometry, not an executable Photoshop method

**Status (2026-10-10): SOURCE DRAFT ONLY; NOT TESTED, NOT DEPLOYED, NOT CAPABILITY-ADVERTISED.**

This design belongs to [the painting roadmap](../PAINTING-ROADMAP.md), after E.25 connected geometry
and E.11 exact history/rollback. It does **not** authorize skipping either gate.

## Implementation boundary

- **Current real method:** `transform-layer`, using only the registered move, scale and rotate commands
  in `src/core/painting-method-palette.ts`.
- **Preparatory implementation:** `src/core/local-warp-geometry.ts` exports only a **pure mathematical
  similarity-MLS candidate mesh**, explicitly `executable: false`. It does not import Photoshop, create
  tools, register a palette method, change pixels or modify layer/history state.
- **No proven warp executor:** source inspection found no native, Guard-owned `local-warp` UXP command.
  A Photoshop UI feature or arbitrary `batchPlay` invocation is **not** a supported mutation capability.
  An offline raster warp is similarly forbidden without a supported single-owner transport that preserves
  other pixels, native masks and exact undo ownership.
- **No external MLS code:** the similarity method is independently implemented from Schaefer, McLean
  and Hoppe's 2006 mathematical description, credited in the third-party algorithm inventory.

## Candidate input (not an MCP argument or a Photoshop command)

The inert geometry draft pins one existing `ownerId`, positive `physicalLayerId` / `documentId`,
nonblank `documentIncarnation`, positive `geometryRevision`, finite image dimensions, and a bounded
canvas-space ROI. It requires 2–16 explicit, noncolliding source→destination landmarks, explicit
positive displacement (up to 64 px), stretch (1–2), sample spacing (2–32 px) and edge-feather
parameters. Optional protected points have a static radius, but **these are not native pixel masks**.

The similarity MLS calculation returns a bounded sampled forward mesh. A smooth transition
forces ROI-border samples to stay in place; protected-point zones attenuate movement. Draft
rejection covers invalid identity and geometry, points outside ROI, protected-landmark collisions,
excessive displacement, nonfinite output, sampled triangle collapse/inversion, and sampled edge
stretch/compression. Mesh dimensions are limited to 33×33 vertices.

This is **not** proof of continuous foldover freedom, interpolation accuracy between samples,
pixel isolation, or a working inverse raster sampler. The sampled mesh cannot be used as dispatch
evidence. Reject or retain `geometry-candidate-only` until those conditions have actual verification.

## Future Guard-owned integration — NOT IMPLEMENTED

1. **Capability gate:** demonstrate one genuine native/UXP deformation of existing raster pixels on a
   disposable document; verify exact layer/ROI/coördinates, preserve all unrelated pixels and observe
   what History actually records. If impossible, stop E.27; do not build an alternate transport.
2. **Real owner check:** derive `ownerId`, document incarnation, layer id, geometry revision and
   any dependent owners from durable Guard state; compare actual pre-operation pixels and layer stack.
   Disallow ambiguous owners, pending reviews/operations, unverified identity or stale model.
3. **ROI + protected pixel authority:** native mask/selection must preserve protected regions
   and other semantic owners. The provisional protected-point math is only a planner hint.
4. **Geometry and dependency check:** author the intended landmark correspondence; validate exact
   before-image pixel/coordinate correspondence, crop transform and 2D image support. Reject if
   the proposed warp changes parent/child contact or construction geometry without explicit rebuild
   or invalidation under existing E.25 rules.
5. **Atomic mutation:** only one owner, one Guard-issued operation, one bounded ROI and one
   *proven* native History span or exact anchor. Do not assume `history_steps=1` for a new operation.
6. **Existing review:** use ordinary before/after whole-frame Critic → Painter → Guard review;
   confirm visible reduction of the specific original defect and the absence of new regressions.
   If unsuccessful, exact rollback; never loop different warps blindly.

## Deferred acceptance work

- Geometry/unit: exact control landmarks; duplicate/degenerate points; ROI leakage; protected
  anchors; high stretch/foldover; near-singular transforms; displacement/mesh limits.
- Photoshop: native raster deformation and history; old/new layer id; selection/mask and
  pixel identity; protected neighbor preservation; exact before/after hash on rollback.
- Recovery: interrupted/uncertain operations, owner/geometry revision changes, stale document
  incarnations, one previously accepted pass protected from collateral undo.
- Artistic: one real, causally selected form mismatch, one correction, independent whole-frame review.

**Stop condition:** if the native route or exact recovery cannot be proven, leave this module
unregistered and E.27 deferred. Do not infer artistic quality from a numerically valid mesh.
