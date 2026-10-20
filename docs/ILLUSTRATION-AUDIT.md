# PaintPilot documentation — illustration provenance audit

**Audit: 2026-10-19.** Scope: rendered raster illustrations referenced by
`docs/**/*.md`, `README.md` and `README.ru.md`; local shared assets used
by those documents. Code snippets containing image extensions, generated
Mermaid diagrams, linked MP4 footage, the Sol signature asset and external
status badges are not presented as painting illustrations.

The test for *our work* is **actual PaintPilot Photoshop output**, not merely
an image placed in this repository. A schematic drawn by software can
explain the mechanism, but it must not masquerade as a Photoshop result,
real Guard evidence, a layer-panel capture, an IK trace or a measured outcome.

## Results

| Figure or image family | Finding | Action / remaining evidence limit |
| --- | --- | --- |
| `assets/engineering/geometry-and-editable-components.png` | **Previously non-project / potentially misleading.** Imagegen cat and stylized layer thumbnails did not originate in a PaintPilot painting run. | **Replaced** with actual violinist artwork and *explicitly schematic* landmarks/owner roles. No claim that IK ran in this image's session. |
| `assets/engineering/bounded-artistic-autonomy.png` | **Previously conceptual imagegen**, no project image evidence. | **Replaced** with actual Pink City artwork and deterministic Guard/UXP flow. Flow describes contract, not a live receipt. |
| `assets/engineering/evidence-bound-recovery.png` | **Previously conceptual imagegen**, not a real recovery trace. | **Replaced** with deterministic recovery decision flow and real historical homestead rejection/rollback comparison. **Important:** the homestead case is not evidence of a lost MCP reply. |
| `assets/engineering/adaptive-multiscale-verification.png` | **Our own / relevant.** Source is an actual saved Ontime stage-05 PaintPilot frame, with exact source and nested crop coordinates/hashes. | **Kept.** [Pixel provenance](../assets/engineering/multiscale-provenance.json); does not prove the Guard made that crop selection during a live run. |
| `assets/showcase/violinist-demo-preview.jpg` | **Our own / relevant.** Still for repository-linked real Photoshop process video. | **Kept.** Frame is a presentation still; not proof of overall painting quality. |
| `assets/mascot/guardbot.jpg` | **Our project mascot.** Origin recorded in [mascot narrative](mascot.md) as a historic Photoshop holdout. | **Kept.** Identity asset, not a claim about current release performance. A cryptographically linked original source run is not provided by that narrative alone. |

### Ten shared historical figures in `docs/ru/images/`

All ten are presented in the English and Russian chapters as **historic
PaintPilot exercise/case-study illustrations**, not stock photographs or
representative results of the current release. Most are curated comparison
plates with explanatory annotations; their pixel hashes alone do not bind
them to a specific original operation receipt. See the
[Russian](ru/README.md#статус-иллюстраций) and
[English](en/README.md#historical-illustrations) limitations.

| Figure | Classification | Match to the actual surrounding article |
| --- | --- | --- |
| `snow-temple-final-overview.jpg` | Historical project scene — **keep** | Overview, composition and scene relationships, not modern quality acceptance |
| `homestead-recognition-blockin.jpg` | Historical project scene — **keep** | Recognition-first landscape block-in |
| `progressive-refinement-blockin-to-detail.jpg` | Historical project composite — **keep** | Sphere: block-in to large form and later selective detail |
| `brush-probe-observed-behavior.jpg` | Historical project composite — **keep** | Distinct visible brush-trial marks |
| `homestead-tree-stamp-risk-crop.jpg` | Historical project crop — **keep** | Risk of mechanical brush stamping on a tree |
| `homestead-rejected-pass-and-rollback.jpg` | Historical project comparison — **keep with scope clarification** | Artistic rejection and restoration; **not** proof of recovery from transport loss |
| `multiscale-whole-and-object-focus.jpg` | Historical project composite — **keep with evidence limit** | Global and local scene review; exact source-frame receipt/hash for this historic plate is not currently recorded alongside the file |
| `railway-causal-pass-before-after.jpg` | Historical project comparison — **keep** | A bounded railway edit, not a benchmark of today's controller |
| `railway-perspective-before-after.jpg` | Historical project annotated comparison — **keep** | Misaligned perspective and subsequent correction; drawn guidelines are interpretation |
| `railway-light-fog-wet-surface.jpg` | Historical project scene — **keep** | Light/fog/reflections, not a calibrated physical-lighting result |

**Evidence boundary:** The historical classification uses existing project
documentation and visibly consistent historical project imagery. Unlike
the two newly selected source paintings and the Ontime crop, no complete
per-figure source SHA + native operation receipt was reconstructed in this
pass. Therefore none of the ten images is independently certified here
as a current-live-Guard acceptance result. Future stronger evidence should
add exact run, frame, operation ID and source hash—not regenerate the pixels.

## What actually changed

1. Replaced **three** project-facing imagegen technical diagrams with
   deterministic Pillow compositions of actual PaintPilot paintings and
   clearly differentiated schematic labels/arrows.
2. Retained the **ten** historical chapter figures, the one exact-source
   Ontime verification plate, the real video still and the project mascot.
3. Updated only relevant README captions and provenance notes in both
   languages, not the explanatory article bodies.
4. Archived the historical prompts/hash expectations **in place** in
   [generation-prompts.json](../assets/engineering/generation-prompts.json)
   with `entry_status=superseded` and separate active hashes.

Sources, current figure hashes, generation recipe and caveats:
[Engineering illustration provenance](../assets/engineering/README.md).
Rebuild the three replacements without imagegen:
`python assets/engineering/build-project-diagrams.py`.
