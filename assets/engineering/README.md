# Engineering illustrations — project artwork and explicit schematics

The English and Russian root README pages use four shared engineering figures.
**None of the four published diagrams now uses externally generated scene content.**
Three were rebuilt on 2026-10-19 using artwork from actual PaintPilot Photoshop
runs, with typography, arrows and explanatory construction overlays drawn by
Pillow. The fourth already used one saved PaintPilot frame and two exact crops.
The diagrams are explanatory compositions, **not** screenshots of Guard decisions,
executed IK constraints, verified native Photoshop layer stacks or live acceptance.

| Image | Mechanism | Engineering reference |
| --- | --- | --- |
| [Authored geometry and editable components](geometry-and-editable-components.png) | Our violinist painting with *schematic*, not observed, landmarks and potential ownership scopes | [Object construction](../../docs/object-construction.md), [painterly strokes](../../docs/painterly-strokes.md) |
| [Adaptive multiscale verification](adaptive-multiscale-verification.png) | Real saved process frame with exact nested object/micro crops | [Visual evaluation](../../docs/visual-evaluation.md) |
| [Bounded artistic autonomy](bounded-artistic-autonomy.png) | Contract flow and image from the actual Pink City painting; **not** a live trace | [Architecture](../../docs/architecture.md), [artistic review](../../docs/artistic-evaluator.md) |
| [Evidence-bound recovery](evidence-bound-recovery.png) | Schematic lost-reply resolution plus a **separate historic artistic rollback**, not evidence that this case lost an MCP reply | [Architecture](../../docs/architecture.md) |

The model specifies proportions and artistic intent; numerical success does not
prove anatomy or quality. Clipping bounds a nominal brush footprint, not every
native preset fringe. The Critic role is not a calibrated independent evaluator.
Recovery has completed, not-executed, partial and uncertain outcomes; no branch
authorizes blind replay. In the geometry figure, three libraries are **independent
optional methods**, not a mandatory pipeline. Ownership labels illustrate possible
editing scopes; they must not be interpreted as a capture of the source run's layers.

## Provenance of the replacement figures

The original full-sized Photoshop outputs below live in the ignored local
`processes/` archive. For **reproducibility in a fresh checkout**, we also keep
JPEG derivatives of the two selected works under this directory. These derivatives
were resized/encoded with Pillow, not regenerated or retouched.

| Published figure | Project-produced source | Source SHA-256 | Repository input |
| --- | --- | --- | --- |
| Geometry | `processes/window-violinist-process/study-01/final/violinist_window_study_v5.png` | `adfc107d0d6307ad5a78e369247cd502927a288455c8209fff198b66e26ae499` | [Violinist JPEG](source-paintpilot-violinist.jpg), SHA-256 `361ff064494c3d1790086f082a5160525f9713d1b3f4d7a6c25a60684b5ac49f` |
| Autonomy | `processes/flying-pink-ninja-city-process/20261014-marker-city/final/flying-pink-ninja-city-marker-v3-grain.png` | `c37fdbf071a63af12f932ff6849ed332cd31801026682ce153e614ef0b187063` | [Pink City JPEG](source-paintpilot-pink-city.jpg), SHA-256 `869da64990a1bec0f85a9b07a2ac95c022f9c574e204bf6b6644d0887bd68524` |
| Recovery | Historical [homestead rejected/rollback comparison](../../docs/ru/images/homestead-rejected-pass-and-rollback.jpg) | `6da87d7039d0626b1fa21695764cb30d9f8d3975484cb128eba60b7da99c3cbf` (published comparison, not a source-frame identity proof) | The same `docs/ru/images/` file |

Published diagram SHA-256s after reconstruction:

| File | SHA-256 |
| --- | --- |
| `geometry-and-editable-components.png` | `cd5ba1d6a57592a30b35f8d580f5160e7800067493c37610a25b58e73885f073` |
| `bounded-artistic-autonomy.png` | `7cf1ccf8f322360001089aa4cef55d72df05033dd83c185b0adf0c366fcd8e14` |
| `evidence-bound-recovery.png` | `6fbeeb05ba0c396a1f05aacce9d62aa419041128e780ddc3ab323737b6ab0b57` |

Rebuild: `python assets/engineering/build-project-diagrams.py` (Pillow and a
system Segoe UI or DejaVu font). Font rendering and Pillow versions affect PNG
file hashes, so inspect visual output as well as link integrity.
The previous **imagegen** diagram prompts and old PNG hashes remain as
[explicitly superseded historical metadata](generation-prompts.json), not
as the provenance of the current figures. The former cat-on-windowsill example
was not project artwork and has been removed.
See the [complete documentation-image audit](../../docs/ILLUSTRATION-AUDIT.md).

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
