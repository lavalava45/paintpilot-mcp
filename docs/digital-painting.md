# Digital Painting Implementation Index

Same-chat visual review and whole-scene Critic checkpoints run at existing pass boundaries;
[review authority and live limits](artistic-evaluator.md). This is not an independent vision model.
Director plans are separate from pixel judgment. Code checks do not close artistic quality
acceptance. Conceptual illustrated documentation:
[English](en/README.md) · [Русский](ru/README.md).

This document maps the painting system to its implementation. It is **not an allowlist of tools**
and is not loaded as the agent's runtime painting prompt.

## Creative use cases are compositions of capabilities

See the [Russian](ru/use-cases.md) and [English](en/use-cases.md)
practical use-case guides for music artwork, promotional layouts, editorial
illustrations, storyboards, game concepts and revisions to existing PSDs.
They do not introduce new MCP tools or bypass Guard. A request such as
“draw an album cover” requires a visual brief, explicit canvas/output
requirements, appropriate layer ownership, actual visual review, text
verification and a separate successful export. Different aspect ratios
require individual composition checks; an export receipt cannot prove
retail-platform conformity or print readiness.

Supported concepts include scene construction, painting tools, layers,
transforms, text, preview/review, save/export and optional process recording.
The specific set available in **a running session** still comes from the
current public capabilities snapshot and compatible UXP bridge, not
from examples in the guide. A missing UXP bridge, unresolved operation
or unverified required brush preset must not become a speculative mutation
or automatic fallback.

The absence of a Photoshop capability from this page does not forbid its use. The executable
surface is determined by the current runtime `ToolRegistry`, public tool schema and generated
capability information—not by a manually maintained Markdown list.

## Sources of truth

| Question | Authority |
| --- | --- |
| How the painting agent should work | [`digital-painting-agent-skill.md`](digital-painting-agent-skill.md) and [`painting-policy/`](painting-policy/) |
| What to implement next | [`PAINTING-ROADMAP.md`](PAINTING-ROADMAP.md) — short priority plan |
| Requirements for the selected task | [`PAINTING-WORK-DETAILS.md`](PAINTING-WORK-DETAILS.md) — existing task IDs and acceptance |
| Which tools exist in the current build | Runtime tool catalog and [`available-tools.md`](available-tools.md) |
| Which semantic painting methods are currently executable | Runtime method-capability snapshot produced from registered tools |
| Which backend/access mode each tool currently uses | [`available-tools.md`](available-tools.md#generated-backend-and-access-inventory) |
| Exact accepted fields and result shapes | Current public JSON schema and TypeScript compiler/runtime validators |
| Protocol conformance examples | [`tests/fixtures/visual-microplan-contract-fixtures.md`](../tests/fixtures/visual-microplan-contract-fixtures.md); executable test fixtures, never artistic recipes |

Do not infer a closed painting palette from examples in documentation. General Photoshop
capabilities—documents, layers, selections, masks, transforms, adjustments, filters, blending,
history, persistence and export—remain available when registered and admitted by the current Guard.
The method compiler should select among actual capabilities according to the artistic pass, rather
than defaulting every problem to strokes, dabs or filled regions.
Contract fixtures must not influence that ranking. Mask/composite and adjustment requests remain
their own executable method families and must not be translated into region fills merely to fit a
VisualMicroPlan example.

## Runtime architecture

### Painting profile selection in the Photoshop panel

The **MCP Bridge** panel (alongside video recording, language and commentary
controls) has a persistent **Painting profile** selector:

| Panel setting | Meaning |
| --- | --- |
| `simple_graphic` — graphic / markers | Force the simpler graphic/marker workflow for a **new** art run. |
| `nontrivial_painting` — complex / experimental | Opt into a **research-stage, interactive** workflow with stronger construction, material and brush-preflight requirements for a **new** art run. Repeated Guard blockers and unfinished paintings are currently possible; this is not a guaranteed autonomous quality upgrade. |
| **Auto — artist chooses** | Artist selects either supported profile from the original brief when binding a new run. If omitted, the prior `nontrivial_painting` default still applies, so Auto may enter the experimental workflow. |

For a first controlled trial, explicitly select `simple_graphic`; neither profile
guarantees completion. In `nontrivial_painting`, user feedback can clarify
artistic intent and help diagnose supported correction paths, but cannot
override Guard's safety gates or automatically train persistent new capabilities.
See the reader-facing [English](en/painting-profiles.md) and
[Russian](ru/painting-profiles.md) profile guides.

For an explicit **Guard-by-Guard applicability matrix** (required, conditional,
advisory and profile-specific), see the [English comparison](en/painting-profiles.md#guard-by-guard-comparison)
or [Russian comparison](ru/painting-profiles.md#сравнение-guard-по-профилям).
The matrix documents the committed public implementation, not experimental
local changes or a guarantee that a new build has been loaded by COS/UXP.

The selector is stored in the existing versioned controller user configuration
and travels through `/settings/user-config`. Guard status exposes
`presentation_context.painting_profile_selection`. At new-run setup an
explicit panel choice takes precedence over an agent's conflicting request:
the Guard rejects mismatches instead of silently disregarding the panel.
The setting does **not** retroactively modify an already bound art run;
the panel shows that the choice applies to the next run. A manually pinned
profile stays fixed throughout that run; an auto-selected run may use only
the previously permitted guarded monotonic upgrade. Existing layer/History,
brush-preflight and recovery safety rules remain in force.

```text
compact artistic pass
  → Guard cycle compiler
  → semantic method/capability selection
  → internal ToolRegistry dispatch
  → PhotoshopBackendRouter
  → UXP or an explicitly reported unavailable capability
  → Photoshop
  → canonical preview evidence
  → model-owned artistic observation
```

Primary implementation areas:

- `src/core/guard/` — durable operation state, compilation, jobs, barriers and recovery;
- `src/core/visual-microplan.ts` — bounded semantic transaction execution;
- `src/tools/guard-tools.ts` — public guarded facade;
- `src/tools/method-palette-tools.ts` — semantic method and capability selection;
- `src/tools/painting-tools.ts` — brush/configuration and raster mark primitives;
- `src/tools/visual-microplan-tools.ts` — VisualMicroPlan schema/handler;
- `src/tools/measurement-tools.ts` — geometry and landmark helpers;
- `src/tools/value-check-tools.ts` — preview-derived value evidence;
- `src/core/refinement-check.ts` — durable subject-agnostic de-block-in/stage-exit evidence
  used by the existing Art Director/Guard DETAIL gate;
- other `src/tools/*` modules — the general Photoshop editing surface;
- `src/platform/photoshop-backend.ts` — semantic backend routing;
- `src/platform/uxp-bridge-client.ts` and `uxp-plugin/main.js` — Node/UXP protocol;
- `src/prompts/` — host-visible routing and compact runtime guidance.

This separation is organizational, not a permission boundary. A painting pass may compose any
registered, Guard-admitted Photoshop primitives that fit one coherent artistic operation.

## Maintained execution invariants

- Mutations use the embedded Guard; raw public mutation bypass fails closed.
- Document and layer identity stay pinned. Document-bound work never switches tabs implicitly.
- Backend selection is final before dispatch. A dispatched or uncertain mutation is never replayed
  automatically through another backend.
- Lost responses recover the original durable command/result; recovery does not create a substitute
  mutation.
- Technical execution and artistic resolution are separate facts. Tool success or pixel delta does
  not prove that the pass improved the image.
- DETAIL progression is also separate from texture/mark count: the durable `refinement_check`
  must close lower-frequency form/block-in debt or record an exact style-contract exception.
- Visual evidence belongs to the exact document and operation. BEFORE/AFTER comparison geometry must
  be canonical; unavailable machine comparison must be reported rather than invented.
- The agent supplies artistic goals and observations. Compiler/Guard own technical schema,
  preparation, receipts, closure and recovery bookkeeping.
- Photoshop must remain background-safe. No implementation may launch, foreground or switch the
  active application/document without the explicitly authorized route.

The compact-only migration work that formerly lived under roadmap tasks 13a–13c is accepted. Current
forward work is tracked only in `PAINTING-ROADMAP.md`; do not resurrect completed migration tasks here.

## Runtime capability discovery

The Guard exposes a revision-bound capability snapshot at art-run start. It includes:

- supported semantic methods and their executable primitive families;
- installed/preflighted brush roles where applicable;
- pinned document and stable layer targets;
- unavailable capabilities and explicit bounded alternatives;
- compact contract, runtime and UXP bridge revisions.

The snapshot is cached for the matching revision and invalidated by real readiness/revision/capability
changes. A healthy Painter must not read this file, source code or raw schemas between passes to
discover how to proceed. Runtime method-capability tools and the public catalog supplement the
snapshot for explicit planning/diagnostic needs; their output is evidence, not an artistic decision
and not permission to select the smallest technically admissible primitive.

## Photoshop 27.8 / UXP implementation constraints

These are current executor facts, not artistic policy:

- In the accepted host, UXP Imaging API reads execute inside `core.executeAsModal` even though they
  are read-only.
- Assigning `app.foregroundColor` inside a painting modal can restore stale brush opacity/flow. The
  UXP painting implementation re-applies requested size/opacity/flow after the color write.
- Created stroke/dab paths are retrieved by unique name before `strokePath`; do not assume the path
  creation call returns a directly usable object in this host.
- The live-tested UXP runtime rejects narrowed loopback-domain manifest declarations. The companion
  manifest currently uses `domains: "all"`, while the Node bridge remains bound only to
  `127.0.0.1`. Do not broaden the listener.
- Public scripting layers tested so far do not expose arbitrary per-point native stylus samples.
  Simulated pressure and segmented dynamics are approximations, not real tablet replay.

When these host constraints change, update the implementation tests and this short section. Do not
retain dated experiment narratives here.

## Validation entry points

Use the narrow checks relevant to the changed package, then the acceptance gates required by the
roadmap item. Common repository checks include:

```text
npm run verify:tool-counts
npm run verify:photoshop-prompts
npm run verify:painting-policy
npm run build:server
npm run test:unit
npm run test:embedded-guard-mcp
```

Live Photoshop acceptance is required for behavior that depends on Photoshop pixels, history,
selection/target restoration, UXP modal behavior or foreground safety. Repository-green results do
not substitute for the explicitly named live acceptance in the roadmap.
