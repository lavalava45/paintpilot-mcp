# Practical PaintPilot use cases

[Русский](../ru/use-cases.md) · [English contents](README.md) · [Technical implementation index](../digital-painting.md)

> Updated 16 October 2026. These are **ideas and proposed pilot briefs**,
> not a list of artistically accepted production deliveries. Implemented
> editing primitives and a saved PSD do not establish image quality.
> Refer to the [roadmap](../PAINTING-ROADMAP.md) for outstanding live gates.

## What Photoshop MCP adds

The value proposition is not “a better one-shot image generator.” It is
**working in a real, editable Photoshop document**, preserving separate
components and changing the requested part without automatically rebuilding
everything else. A user can ask: “reduce background contrast,” “rebuild only
the character,” “preserve the headline,” or “show what the last pass changed.”
Guard binds edits to actual document state, layer ownership, operation
receipts and exact visual review. PSD/export/process artifacts are useful,
but their correctness must be checked on each real job.

For **new** painting runs, the Photoshop panel offers
`simple_graphic` (graphic/marker style), `nontrivial_painting`
(more demanding painting) and an Auto artist choice. An explicit panel
selection does not retroactively alter an active run or bypass Guard.
Before actual painting, verify the loaded MCP child and UXP bridge are
ready and have compatible revisions.

## 1. Creative projects

| Project | Brief concept | Deliverable and necessary review |
| --- | --- | --- |
| **Album or single cover** | Genre, mood, palette and strong visual metaphor, optionally exact artist/title text | Layered PSD and square PNG; thumbnail readability, exact words and asset rights |
| **Visual identity for a music release** | An album cover, three related singles and a show announcement sharing one palette and visual motif | Individually composed/exported designs; coherence, typography and proper crop |
| **Gig or festival poster** | An illustration with deliberate space for acts, date and venue | Every event fact and type hierarchy checked; print specifications supplied separately |
| **Podcast artwork and episode cards** | Recurring iconography and a changing episode-specific symbol | Repeated style, safe areas and platform-specific dimensions |
| **Book or short-story cover** | Metaphor or scene with author/title areas | Editable type and format-specific layout; bleed, spine and print profile depend on printer |
| **Travel poster, greeting card or city print** | Architecture, place and season in a flat, woodcut or retro-poster style | Geometry, legibility and actual print resolution |
| **Stickers, badges and merchandise art** | Limited-palette characters, objects and variants | Transparent boundaries, clean silhouettes; manufacturing templates verified separately |
| **Editorial or newsletter illustration** | Explain one theme or accompany an article visually | Semantic fit, without inventing charts or factual diagrams |
| **Children’s illustration series** | Several scenes sharing a character and palette | Independent character/anatomy consistency review across pages |
| **Game concept art and props** | Environment, interior or prop explored in separate passes | Logical layer separation, intended camera/scale, engine-specific export later |
| **Storyboard, comic or music-video concept** | A sequence of key frames, staging and atmosphere | Narrative clarity and manually assessed cross-frame consistency |
| **Improve an existing PSD** | “Correct this train’s perspective; preserve light and background” | Exact target doc/layers, BEFORE/AFTER, history and verified recovery |

## 2. Workflows that exploit the MCP design

**Conversational art direction:** modify one layer/area after observing
the actual Photoshop result. This may be more useful than asking an image
generator to reproduce the identical composition from scratch each time.

**One creative world, several formats:** reuse agreed subject, palette
and hierarchy to produce separate cover, square post, vertical story
and banner compositions. Each ratio and typography needs its own review;
one-click flawless omnichannel resizing has not been demonstrated.

**Process footage and teaching:** capture actual Photoshop actions,
assemble retimed footage and produce external SRT captions from saved
commentary. This is a separate local export workflow—not automatic
music-synchronized video editing, licensing, or a polished movie.

**Controlled artistic comparison:** give the same brief and resources
to the `simple_graphic` and `nontrivial_painting` profiles. Compare
readability, useful edits per unit time, regressions and independent
human preference, not raw tool-call counts alone.

## 3. Three concrete pilot prompts

### A. Fictional album cover

```text
In Photoshop, design a square album cover for the fictional record
"After the Last Train" by "Northern Light".
Style: energetic but melancholic indie rock.
Main image: a lone illuminated railway carriage on a foggy,
empty platform. Desaturated teal atmosphere, a small amber
accent, and no photo collage.
Start with composition and silhouette, then develop light and materials.
Artist and title must remain legible at thumbnail size; invent no
additional text. Keep major elements separately editable, save a PSD,
review exact BEFORE/AFTER after meaningful passes, and export PNG
only once the actual text and complete composition have been checked.
```

This is an effective first pilot because the result has explicit
composition, lighting, text, layer and export acceptance points.

### B. Poster for the same fictional music world

```text
Create a vertical show poster using the visual world of the album.
Preserve the train motif and color relationships while composing
specifically for a portrait layout, not stretching the old cover.
Reserve separate type areas for artist, date, venue and admission.
If event details were not supplied, clearly mark placeholders:
do not invent a real show. Review legibility at reduced scale.
```

### C. Correct an existing painting

```text
Inspect the open PSD against its original brief. Identify the
largest remaining visible mismatch. Propose one bounded correction,
preserve accepted qualities and unrelated layers, and modify only
the agreed component. Show exact BEFORE/AFTER and recheck the full
composition. If execution is uncertain, reconcile before any retry.
```

This tests the main distinction from one-shot generation: editing
an **existing, meaningful document**.

## 4. Important limits

- **Typography and factual precision:** review names, dates, addresses,
  logos, codes and licenses. Something that looks like a letter is not
  proof of correct text.
- **Rights and source material:** use owned or appropriately licensed
  images, fonts, characters and brand assets. A tool's availability
  does not grant publication rights.
- **Production output:** color profile, bleed, dpi, dielines and
  marketplace specifications come from the actual customer/printer brief.
- **Perceptual quality:** difficult anatomy, recurring character identity,
  subtle painting and hands-free multi-design delivery still need real
  acceptance and human judgement.
- **Execution safety:** unavailable UXP, unverified brush identity or
  unresolved operation receipts are blockers, not permission to replay
  uncertain Photoshop changes through alternate routes.

## 5. A bounded commercial experiment

A plausible service pilot is an **illustrated music cover + editable PSD +
one agreed revision + announcement adaptation** for independent musicians.
Do not promise turnaround, pricing or reproducible artistic quality
without measured trial projects. Track actual time, failures, human fixes
and customer satisfaction. Editable assets, traceable operation history
and focused iterative direction—not merely producing an image—are
the likely differentiators.

Technical references: [painting profiles and implementation](../digital-painting.md),
[available tools](../available-tools.md),
[recorded process showcase](../showcase.md), and
[live release qualification](../RELEASE-HARDENING.md).
