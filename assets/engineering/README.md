# Engineering illustrations

These four engineering illustrations support the English and Russian root README
pages, which reference the same English-labelled PNG files. Three are conceptual
imagegen diagrams. Adaptive multiscale verification uses one real saved Photoshop
process frame and two literal crops, assembled deterministically on 2026-10-11.
None is a benchmark or proof of live artistic acceptance. The illustrations do not
replace the linked engineering contracts and their limits.

| Image | Mechanism | Engineering reference |
| --- | --- | --- |
| [Authored geometry and editable components](geometry-and-editable-components.png) | Authored landmarks/constraints, numerical solving and separately owned raster parts | [Object construction](../../docs/object-construction.md), [painterly strokes](../../docs/painterly-strokes.md) |
| [Adaptive multiscale verification](adaptive-multiscale-verification.png) | Real saved process frame with exact nested object/micro crops | [Visual evaluation](../../docs/visual-evaluation.md) |
| [Bounded artistic autonomy](bounded-artistic-autonomy.png) | Same-conversation roles; Painter → Guard → UXP → Photoshop; pixel-review feedback | [Architecture](../../docs/architecture.md), [artistic review](../../docs/artistic-evaluator.md) |
| [Evidence-bound recovery](evidence-bound-recovery.png) | Journal/state/preview reconciliation before a new authorized mutation | [Architecture](../../docs/architecture.md) |

The model specifies proportions and artistic intent; numerical success does not prove
anatomy or quality. Clipping bounds a nominal brush footprint, not every native preset
fringe. The Critic role is not a separate calibrated evaluator. Recovery distinguishes
completed, not-executed, partial and still-uncertain work; no branch authorizes blind replay.

Generation prompts, final-file hashes and dimensions are retained in
[generation-prompts.json](generation-prompts.json). Two targeted imagegen edits corrected
the Guard execution connector and the recovery sequence before publication.
On 2026-10-11, an imagegen edit replaced the mechanical-arm example with a cat
reaching a windowsill, to make the subject being painted unambiguous. IK.ts,
Bezier.js and Clipper2 are shown as methods chosen when needed, not a mandatory
serial pipeline. The layer thumbnails illustrate selected editable parts; they
are not an exhaustive decomposition or a Photoshop screenshot.

Existing library/algorithm attribution remains in
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).

## Real-frame multiscale example

The source is [Ontime stage-05](multiscale-source-ontime-stage-05.png), copied byte
for byte from `processes/ontime-blue-hour-patisserie-process/run-01/final/ontime-blue-hour-stage-05.png`.
The [window crop](multiscale-object-crop.png) is `[1350, 370, 1510, 550]`;
the [corner crop](multiscale-micro-crop.png) is `[1370, 390, 1434, 454]` in source
pixels, with exclusive right/bottom coordinates. The latter is also exactly
`[20, 20, 84, 84]` within the window crop. This is work in progress, not a polished
success example or a claim that a Guard review ran on these rectangles.

The overview is resized for display. Native crops are enlarged by nearest
neighbour; crop boxes are presentation overlays. No source content, viewpoint,
lighting or detail is regenerated. See [provenance and hashes](multiscale-provenance.json).
Rebuild with `python assets/engineering/build-multiscale-diagram.py` (Pillow and
Windows Arial fonts). The original imagegen version was replaced because its
three scenes depicted different windows rather than crops of one image.
