# PaintPilot Beta / 1.0 — fixed six-scene qualification set

> **SUPERSEDED.** The user replaced all six subjects on 2026-10-13. The current exact prompts are [RQP-2026-10-13-02](RELEASE-QUALIFICATION-SCENES-USER-20261013.md). The old pagoda/cabin/Mykonos list below is historical only. The [S01 tiger blocker](RELEASE-S01-TIGER-INCIDENT-20261013.md) is recorded independently.

Protocol version **RQP-2026-10-13-01**. Status: **preregistered prompts, not run**.
This is *evaluation data*, never a request to add object-, material-,
scene-, or brush-name exceptions to production. Run under the frozen
[Release Hardening rules](RELEASE-HARDENING.md). If source, prompt, Guard,
UXP or installed brush inventory changes during evaluation, the candidate
changes and **all six** scenes must be rerun. No Photoshop painting is
authorized by merely reading this file.

## Registration and reproducibility

- **Three retained cases:** use original briefs already saved in the local
  `painting-state.json` for pagoda, Mykonos and cabin. The exact strings below
  were retrieved from those saved records on 2026-10-13; these are **known
  regression cases**, not held-out examples. These historical process records
  are read-only reference evidence and do not become fresh qualification runs.
- **Three unseen cases:** the human figure, natural landscape and free painterly
  illustration below have new briefs registered here before qualification.
  Preserve their wording; never use them as engineering fixture exceptions or
  tune code based on their theme. No imagery, geometry or pixels from these
  cases may be injected as a pre-made Photoshop result.
- All cases: new blank RGB 8-bit Photoshop document, 72 ppi, white initial
  background (the prompt can require recoloring), sRGB profile if available.
  Width × height is specified for each case. Ordinary Photoshop/UXP/Guard
  settings, full installed brush inventory, fixed host/model configuration,
  and exact candidate build are recorded once in each run manifest. Preserve
  the requested independent layers and author all images only through the
  selected Photoshop MCP route.
- Run the three retained and three novel cases in the ID order S01…S06.
  Register evaluator identities and baseline-build identity before the first
  baseline run; archive all failures, not only successes. No hidden manual
  corrections, engineer interventions, prompt additions or source edits.

## Immutable prompts

### S01 — Pagoda: retained architectural line drawing

Canvas: **1080 × 1920** (9:16), vertical. Historical brief source:
`processes/pagoda-kraft-sketch-process/study-01/painting-state.json`.

> Hyper-detailed fine pencil sketch on aged vintage kraft paper, grand multi-tiered historic traditional East Asian wooden pagoda tower, intricate ornate carved curved roof eaves, symmetrical frontal composition, warm sepia monochrome palette, subtle distant mountain silhouette background, tiny lone human figure at the entrance to demonstrate massive scale, technical architectural illustration style, clean lines, depth detail, 9:16 aspect ratio. User explicitly requests COS Plugins / Photoshop MCP only, no image generation.

Visual targets: fine controlled architectural strokes, complex carvings and
eave relationships, plausible column/roof support, tiny figure at entrance,
paper/pencil material, legible distance and occlusion.

### S02 — Cabin: retained object-rich interior

Canvas: **1600 × 1200** (4:3), horizontal. Historical brief source:
`processes/cozy-lakeside-cabin-process/study-01/painting-state.json`.

> Warm comforting chocolate tone illustration style, soft early morning sunlight filling a lush cozy wooden cabin bedroom, overflowing green houseplants and flowering vines trailing from ceiling and shelves, large floor to ceiling French window with white wooden frames, soft sage green floral lace curtains with ruffled trim, long rustic wooden windowsill table lined with various potted plants in terracotta and ceramic pots, sparkling sun-dappled lake and green forest scenery visible outside the window, fluffy knit sage green throw draped over a light wooden bed, fluffy white longhair cat curled peacefully on a vintage woven area rug on the wood plank floor, warm ambient soft lamp glow, ultra detailed, peaceful healing cottagecore aesthetic, soft warm natural lighting, cozy calm atmosphere

Visual targets: complex object inventory; window opening, frame and curtains
independently editable; bed/throw, cat/rug, plants and reflected/ambient light
coherent in depth and materials; natural non-geometric foliage.

### S03 — Mykonos: retained urban perspective

Canvas: **1400 × 1800** (7:9), vertical. Historical brief source:
`processes/mykonos-alley-process/mediterranean-summer-01/painting-state.json`.

> Kim Jung Gi illustration style, rich retro saturated color palette, highly detailed maximalist artwork, dramatic cinematic lighting and shadow contrast, sharp clear brushwork, ultra high definition 32k quality, perfect masterpiece details, natural asymmetrical composition. Beautiful narrow cobblestone alley on Mykonos island, iconic Cycladic whitewashed hillside buildings with bright blue window frames, wooden shutters and small wrought iron balconies, potted greenery and flowering bushes lining the stone path, bright clear vivid blue sky, warm Mediterranean summer afternoon atmosphere, sunlit stone streets, painterly clean aesthetic. Draw only with COS Plugins / MCP Photoshop, no imagegen.

Visual targets: perspective-consistent window openings and facades, credible
receding cobblestone street, shadows attached to form, organic greenery, rich
light/color hierarchy. The request asks for a **bright clear vivid blue sky**;
clouds are *not* a mandatory pass criterion merely because a prior run explored
cloud refinement.

### S04 — Human figure: previously unseen pose and contact

Canvas: **1200 × 1800** (2:3), vertical.

> Paint a traditional gouache illustration of a seated adult violinist practicing alone in a narrow sunlit rehearsal room. Three-quarter view from slightly above: the musician leans forward, one hand accurately supports the violin neck and the other holds the bow against the strings. A small wooden chair carries the body's weight, both shoes make believable contact with the worn floor, and a folded music stand stands nearby. Use muted ultramarine, ochre, warm gray and soft window light. Keep the violin, bow, hands, head, clothes, chair and stand separately editable where independent correction is needed. Favor expressive brushwork with credible proportions and spatial relationships, not photorealism. Draw in Photoshop through the existing MCP painting workflow only.

Visual targets: credible joint anatomy, contact with chair and floor, hand-to-
instrument pose relations, separate violin/bow, readable expressive gouache.

### S05 — Landscape: previously unseen organic nature

Canvas: **1600 × 1000** (8:5), horizontal.

> Create a painterly early-autumn landscape after rainfall: a shallow winding stream in the foreground bends into an open meadow, with leaning alder trees, reeds, mossy rocks and yellowing foliage along the banks. A low mist softens distant wooded hills while sunlight briefly breaks through heavy uneven clouds. Use restrained natural greens, slate blue and amber accents, with soft transitions in air and water but deliberate sharper edges at near rocks and reeds. The stream's banks and reflection must maintain coherent spatial depth; do not turn trees, clouds or stones into repeated mechanical silhouettes. Work as an original layered Photoshop painting using the MCP route; do not use any pre-generated image or pasted backdrop.

Visual targets: irregular vegetation and stone silhouettes, plausible
atmospheric depth and water reflections, edge softening independent of optical
camera blur, coherent directional light and multiple brush functions.

### S06 — Free illustration: previously unseen expressive composition

Canvas: **1400 × 1400** (1:1), square.

> Paint an imaginative, loose editorial illustration: a small nighttime street bookstall sheltered beneath a glowing yellow umbrella, surrounded by tall indigo buildings and a few pedestrians moving through rain. The umbrella and warmly lit books form the focal point; reflected puddles guide the eye through an asymmetric composition. Use visibly varied dry-brush and wet-paint textures, selectively lost edges and bold simplified shapes, while preserving legible spatial overlap and believable cast light. The result should feel handmade and expressive rather than like a flat geometric icon or a photorealistic render. Keep the umbrella, stall, books, pedestrians, buildings and major light/reflection regions independently adjustable as needed. Paint through Photoshop MCP only.

Visual targets: open-ended painterly expression, visual hierarchy, warm/cool
contrast, organic edges and reflections, coherent occlusion and editability.

## Fixed assessment and immutable run evidence

Use the numeric safety/autonomy, blinded two-reviewer 1–5 image rubric and
speed thresholds from `RELEASE-HARDENING.md`. Both reviewers must see the
original prompt and exact completed *image*, but not the Painter explanation,
tool receipts, or each other's scores. Missing/unfinished output is a failure,
not a missing data row. Preserve disagreements, the actual run trace, safe
fallback image, PSD, before/after frames, first-recognizable timing, wall time,
rejections, owner topology and operation identities per scene.

Do not fill this manifest with invented results. The exact code SHA,
deployed MCP/UXP identities, baseline timing and individual review outcomes
are **PENDING** until recorded from a frozen real qualification run.
