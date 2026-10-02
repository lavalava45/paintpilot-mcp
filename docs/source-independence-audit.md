# Source-independence audit and closure record

Date: 2026-09-29

This audit records the transition from the historical `alisaitteke/photoshop-mcp` lineage to the
independently maintained **Photoshop MCP — Digital Painting Edition** product. The current product is
standalone in runtime, build, packaging and maintenance policy; historical origin remains documented
for provenance and licensing rather than used as primary product identity.

The comparison baseline is the historical common ancestor, upstream `v1.7.6`
(`7b635963f87b5b8ff5380c3156841f5253ec8063`). A second comparison against the refreshed
`upstream/master` gives essentially the same result.

## Current closure — 2026-09-29

P1-S residual source-independence hardening is complete. The reproducible production-runtime audit now
reports **42,288 nonblank lines / 206 aligned exact lines = 0.4871% exact-line overlap** against the
documented historical baseline. The stricter residual lists are all empty: **0 byte-identical production
files, 0 same-path contiguous exact blocks >=12 lines, 0 cross-path contiguous clone blocks >=8 normalized
lines, 0 production files >=50% exact similarity, 0 retired package entries, and 0 package-script dependency
on an upstream checkout or remote**.

The default canonical threshold in `scripts/verify-source-independence.mjs` is now **0.005 (0.50%)**, so
this is a maintained release invariant rather than a one-time measurement. Cross-path detection now
normalizes nonblank source lines and compares every maintained runtime file against every historical
baseline path at an **8-line** minimum, so moving copied implementation into a new file can no longer hide
it from the canonical gate. That pass independently rewrote the remaining Neural Filter request/result
sequence, the UXP font-search loop, and four smaller moved blocks surfaced only after the stronger detector.
The UXP bridge was intentionally not rewritten merely to chase a cosmetic 0% score; its remaining same-path
matches are ordinary transport glue and stay governed by the no-block/no-high-similarity gates.

This metric remains a **source-line overlap metric, not an authorship percentage**. `LICENSE` and `NOTICE`
remain mandatory and retain the historical origin even though the current product is no longer maintained
or presented as a fork.

Final canonical verification on this closure is green: **75/75 Vitest files / 764/764 tests**, **151
packed dist JS files**, lint **0 errors / 30 existing warnings**, **131 atomic tools / 15 Guard tools /
5 prompts**, with product-identity, provenance, external-intake and live-evidence-ledger gates all passing.

## 1. Measured provenance snapshot

The metric below uses exact matching source lines after sequence alignment. It is deliberately simple
and reproducible. It is **not an authorship percentage**: a changed line can still be derived from the
same design/source, while generic boilerplate can match independently.

### Before Phase A retirement

| Scope | LOC | Exact lines retained from v1.7.6 | Exact overlap | Non-exact current lines | Current-only-path share |
| --- | ---: | ---: | ---: | ---: | ---: |
| Canonical Photoshop/Guard runtime (`core`, `platform`, `tools`, `errors`, `prompts`, entrypoints, UXP) | 47,042 | 6,439 | **13.7%** | **86.3%** | **68.2%** |
| First-party code including scripts/UI/web | ~65k | ~18.8k | **~29%** | **~71%** | **~57%** |
| First-party code + tests | 87,266 | 19,345 | **22.2%** | **77.8%** | **67.6%** |

Against refreshed `upstream/master`, code + tests are 78.0% non-exact and the canonical runtime is
86.5% non-exact. This confirms that the previously discussed “75–80%” figure is defensible only as a
**line-divergence metric for code + tests**. It must not be presented as “75–80% independently
authored code.”

### After completed Phase A retirement

The UI/analytics retirement described below is now implemented and verified. Re-running the same
comparison against `v1.7.6` gives:

| Scope | Current LOC | Exact retained lines | Exact overlap | Non-exact current lines | Current-only-path share |
| --- | ---: | ---: | ---: | ---: | ---: |
| Canonical Photoshop/Guard runtime | 46,893 | 6,282 | **13.40%** | **86.60%** | — |
| First-party source (`src`, `scripts`, `uxp-plugin`) | 54,369 | 8,083 | **14.87%** | **85.13%** | **69.04%** |
| First-party code + tests | 76,419 | 8,498 | **11.12%** | **88.88%** | **77.25%** |

The stronger fact is architectural: the canonical Guard/painting runtime is already predominantly
project-owned, and the largest optional upstream-identical product surfaces have now been removed.

## 2. Largest retained upstream surfaces after Phase A

These are the highest-value targets for removal or replacement.

| Surface | Current exact-line overlap | Decision for standalone-product goal |
| --- | ---: | --- |
| `src/utils/` | 100% | Replace tiny live helpers with project-owned equivalents or delete with retired consumers |
| `src/index.ts` | 97.9% | Rewrite minimal standalone stdio bootstrap around the current server/Guard contract |
| `src/core/tool-registry.ts` / `prompt-registry.ts` | upstream-identical | Rewrite small registries from current requirements/tests |
| `src/core/session.ts` | 96.2% | Rewrite the now-small connection lifecycle from current requirements/tests |
| `src/core/server.ts` | 73.4% | Rewrite MCP bootstrap/dispatch shell around current Guard/tool contracts |
| `src/platform/macos-executor.ts` | ~96% | Prefer retirement if no longer product-reachable; otherwise rewrite from platform requirements |
| `src/platform/windows-detector.ts` | ~93% | Rewrite minimal detection contract or retire if redundant |
| `src/tools/selection-tools.ts` | ~78% | Specification-first rewrite around current UXP backend |
| `src/tools/layer-properties-tools.ts` | ~77% | Rewrite |
| `src/tools/filter-tools.ts` | ~83% | Rewrite |
| `src/tools/document-tools.ts` | ~61% | Rewrite retained semantic surface |
| `src/tools/text-tools.ts` | ~77% | Rewrite if retained in product scope |
| `src/tools/layer-transform-tools.ts` | ~72% | Rewrite |
| `src/tools/color-adjustment-tools.ts` | ~73% | Rewrite |
| `src/tools/mask-tools.ts` | ~68% | Rewrite |
| `src/tools/adjustment-tools.ts` | ~58% | Rewrite |
| `examples/` | ~82–83% | Replace with minimal project-owned examples |
| `mcpb/manifest.json` | 86.5% | Rewrite metadata/manifest around the final product identity |

Phase A retired the former `web/`, `src/ui/`, `src/analytics/` and `src/lib/export-paths.ts` surfaces
instead of cosmetically rewriting them. Two completely upstream-identical spike scripts also remain
outside the canonical runtime (`scripts/spike-photoshop-actions.ts`, `scripts/spike-2026-features.ts`)
and should be deleted if no maintained acceptance workflow still requires them.

By contrast, `src/core/guard/*`, VisualMicroPlan/refinement/painting policy, painting/measurement/
brush-pack functionality, the UXP companion as a whole, and most acceptance tests are already
overwhelmingly project-owned/current-only.

## 3. Local-folder dependency audit

No submodules or additional Git worktrees are configured. No project source/build script references
the adjacent original checkout by path.

| Local surface | Finding | Runtime/build dependency on upstream author work? |
| --- | --- | --- |
| `.git/` | Retains historical ancestry; persistent historical `upstream` remote removed 2026-09-29 | History/provenance only; not runtime |
| `node_modules/` | Recreated from the canonical pnpm lockfile; stale AI/Anthropic/SQLite/UI-era direct packages removed | Third-party dependencies only; no upstream-author source tree |
| `pnpm-lock.yaml` | Canonical dependency lockfile, no longer ignored; importer matches `package.json` | Reproducible dependency graph for this project |
| `.tmp-udt-asar/` | Removed 2026-09-29; it was an extracted **Adobe UXP Developer Tool 1.1.0** tree | No runtime dependency |
| `.tmp-udt/` | Removed 2026-09-29 | No runtime dependency |
| `.mcp-preview/` | Generated preview images | No |
| `.photoshop-runtime/` | Guard/UXP receipts, previews and route traces | No source dependency |
| `processes/` | Local experiment/evidence archive | No runtime dependency; contains historical archived docs that still mention upstream |
| `dist/` | Generated build output | Mirrors whatever inherited source still exists; rebuild after source-independence work |
| `release/` | Generated MCPB build artifacts | Regenerated after Phase A; current bundle contains no retired UI/analytics/web payload |
| `task8a-review-pack/`, `task23-review-pack/` | Project evaluation evidence | No |
| `assets/` | Current project-owned presentation assets | No upstream-source dependency found |
| sibling `../photoshop-mcp-alisaitteke/` | Removed 2026-09-29 after provenance audit | No project dependency |
| sibling `../adobe-desktop-mcp/` / `../udt-runtime-extracted/` | Removed 2026-09-29 after external-artifact audit | No project dependency |
| sibling proof clones / `../photoshop-mcp-digital-painting-backups/` / compact-verify workspace | Removed 2026-09-29 after verification evidence was consolidated | No project dependency |

The only upstream material found under ignored local experiment storage is historical documentation
copied into `processes/.../archive-*`; it is not imported or packaged as runtime source.

## 4. Rewrite strategy

The goal is not cosmetic renaming. The goal is that a reasonable source review no longer finds large
substantial blocks of the original implementation in the shipped first-party product.

### Phase A — remove inherited product breadth before rewriting — **COMPLETE**

The 2026-09-27 reachability audit resolved this decision: **retire the standalone browser UI and
inherited analytics from the product**. Neither is required by the canonical
ChatGPT -> Chat On Steroids Plugins -> `cos-plugin.js` -> embedded Guard -> UXP -> Photoshop route.

The completed retirement scope is:

- delete `web/` completely;
- delete `src/ui/` completely;
- delete `src/analytics/` completely;
- delete `src/lib/export-paths.ts` after the UI/analytics consumers are gone;
- remove UI/analytics-only tests, scripts, package entrypoints, build steps and documentation;
- remove analytics side-effect hooks from `src/index.ts`, `src/core/server.ts`, `src/core/session.ts`
  and `src/errors/envelope.ts`;
- move the small `getAppVersion()` helper out of analytics into a project-owned bootstrap/version
  module because server versioning is the only non-telemetry behavior currently obtained through the
  analytics tree.

The current canonical entrypoint transitively reaches 19 analytics modules and, only because of
analytics, three UI storage/config modules (`src/ui/config.ts`, `src/ui/store/kv.ts`,
`src/ui/store/db.ts`). This means analytics currently drags `better-sqlite3` and UI configuration
storage into ordinary MCP startup even though the standalone UI is never opened. Retiring both
subsystems removes that coupling.

What is intentionally lost:

- the optional local browser chat application;
- its Anthropic/OpenAI/OpenRouter/Google/custom-provider setup;
- API-key / Claude-account / Gemini-account auth flows;
- local SQLite chat history and UI configuration;
- standalone Action Plan mode;
- UI session-token HTTP API and browser frontend;
- anonymous Rybbit usage telemetry and beta chat telemetry.

None of those features participates in Guard safety, Photoshop execution, UXP dispatch, CoS routing,
painting, recovery, evidence, prompts or the MCP tool catalog.

The package/build cleanup that follows retirement is also explicit:

- remove the `photoshop-mcp-ui` bin;
- remove `dev:ui*`, `build:web`, and `start:ui` scripts;
- change the root `build` to the server build only;
- remove `web/dist` from the published file list;
- stop copying `web/dist` into MCPB;
- remove `dist/ui/cli.js` and `dist/analytics/index.js` from pack-verification requirements;
- remove the special analytics import check from `verify-pack`;
- delete `scripts/test-ui-auth.ts`, `scripts/test-analytics-smoke.ts` and analytics-only tests;
- remove UI-only production dependencies (`@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/mcp`,
  `@ai-sdk/openai`, `@anthropic-ai/claude-agent-sdk`, `@hono/node-server`,
  `@openrouter/ai-sdk-provider`, `ai`, `better-sqlite3`, `get-port`, `hono`, `open`, `zod`) where no
  remaining direct consumer exists;
- remove UI-only dev dependencies such as `@types/better-sqlite3` and `concurrently`.

Measured effect before any deeper runtime rewrite: first-party source exact-line overlap against the
actual `v1.7.6` fork baseline dropped from about **29.0% to 14.87%**. The current source tree is
**85.13% non-exact** by this metric; code + tests are **88.88% non-exact**.

Verification completed after retirement:

- `npm run verify:canonical`: **69 test files / 687 tests passed**, with zero lint errors;
- `npm run test:mcp-local`: stdio/server/prompt/tool smoke passed;
- `npm run test:embedded-guard-mcp`: **129 tools / 14 Guard tools**, required-mode mutation gate passed;
- MCPB rebuilt successfully at about **5.71 MB**, with no `server/web`, `dist/ui` or `dist/analytics`
  payload and only `@modelcontextprotocol/sdk` + `jpeg-js` as bundled production dependencies;
- the actual Chat On Steroids plugin child was restarted after the build and verified fresh by PID /
  creation time; `photoshop_ping` then reported `ready=true`, `transport=uxp`, matching UXP bridge
  revision and `plugin_connected=true`; Guard capabilities reported `embedded=true`, `mode=required`
  and `raw_mutation_bypass_blocked=true`.

Completed implementation order for Phase A:

1. sever analytics hooks and relocate version lookup;
2. remove analytics and confirm MCP/COS startup + tool/error behavior;
3. remove standalone UI/web and package/build surfaces;
4. prune now-unused dependencies/tests/docs;
5. run canonical verification, MCPB packaging and one bounded CoS/Photoshop smoke;
6. recompute source-overlap metrics before beginning Phase B.

Do not rewrite the inherited browser UI merely to preserve a feature that is not part of the intended
product. If a standalone UI becomes desirable later, build a new project-owned UI against the final
public MCP contract.

`src/utils/` is **not** part of this retirement: `logger.ts` remains live across the canonical runtime,
and the ExtendScript result/file helpers remain reachable from retained platform executors until the
later platform-substrate decision. Those files belong to later rewrite/retirement phases, not Phase A.

### Phase B — replace the small bootstrap substrate — **COMPLETE**

The bootstrap substrate was rewritten from the **current behavioral contract**, not by editing upstream
files line-by-line:

- `src/index.ts`;
- `src/core/server.ts`;
- tool/prompt registries;
- `src/utils/logger.ts`;
- `src/errors/envelope.ts`;
- session wrapper after analytics removal.

The long server wiring list was moved into the project-owned `src/core/server-tool-catalog.ts`, while
`server.ts` now owns only MCP transport, Guard gating, execution leasing and catalog installation.
`tests/bootstrap-substrate.test.ts` freezes replacement/listing/execution semantics for the registries,
injectable Session behavior and stderr-only logger behavior. `src/errors/envelope.test.ts` now also
covers preservation of already-structured envelopes plus normalization of plain/thrown failures.

Phase-B verification completed with:

- `npm run verify:canonical`: **70 test files / 693 tests passed**, zero lint errors;
- `npm run test:embedded-guard-mcp`: **129 tools / 14 Guard tools** and `guard_required` raw mutation gate;
- `verify:tool-counts` updated to follow the project-owned catalog declaration rather than assuming tool
  schemas live directly inside `server.ts`;
- a freshly restarted Chat On Steroids child passed real UXP/Guard readiness on the new substrate.

Measured exact-line overlap against `v1.7.6` after Phase B:

| Scope | Exact overlap | Non-exact current lines |
| --- | ---: | ---: |
| Canonical Photoshop/Guard runtime | **12.65%** | **87.35%** |
| First-party source | **14.15%** | **85.85%** |
| First-party code + tests | **10.60%** | **89.40%** |

Notable rewritten-file results: `server.ts` 28.2%, `logger.ts` 35.6%, `index.ts` 41.5%,
`errors/envelope.ts` 45.8%, prompt/tool registries 51.4%/54.0%, and `session.ts` 59.1%. The new
`server-tool-catalog.ts` is current-only. These percentages remain a similarity metric, not an
authorship metric.

Examples and package/MCPB product metadata remain a separate later P2.5 step after the retained
runtime/platform rewrites; they are not required to close this bootstrap-substrate phase.

### Phase C — rewrite retained high-overlap semantic tool modules

Work by capability families so acceptance remains reviewable:

1. **DONE — document + history/state**;
2. **DONE — full layer domain: base layer tools + properties/order/transform**;
3. **DONE — selection + masks**;
4. **DONE — filters + adjustments/color**;
5. **DONE — image placement + smart objects**;
6. text/style tools;
7. any remaining small generic tools.

For each family:

1. freeze the public schema and current accepted behavior in tests;
2. define the semantic operation in project terminology;
3. implement directly against `PhotoshopBackendRouter` / UXP primitives without copying the upstream
   function structure;
4. run canonical tests plus representative live Photoshop acceptance;
5. run similarity/provenance checks before closing the family.

#### Phase C1 — document + history/state — complete

The first semantic family was rewritten behind its existing MCP contract rather than by editing the
upstream-shaped inline handlers. The public 12-tool family remains:

- document: create, info, list, activate, save, close;
- history: undo, redo, history read;
- state: state read, preview, capabilities.

Implementation is now split into small declaration surfaces plus project-owned semantic operations:

- `document-tools.ts` -> `document-operations.ts`;
- `history-tools.ts` -> `history-operations.ts`;
- `state-tools.ts` -> `state-operations.ts`;
- the formerly 97.6%-matching `platform/capabilities.ts` was independently reimplemented while
  preserving version thresholds and feature keys;
- `atomic-shared.ts` was restructured without changing its JSON success/error envelope contract.

The central `withOptionalDocumentId` / `wrapDocumentIdHandler` ownership model remains unchanged:
document-bound tools still receive their optional pinned `document_id` at server registration, while
create/list/set-active/capabilities remain excluded. Production semantic dispatch remains UXP-only and
fail-closed; no document/history/state handler calls the legacy script executor.

Verification after C1:

- `npm run verify:canonical`: **72 test files / 701 tests passed** with zero lint errors;
- runtime surface remains **129 tools / 14 Guard tools / 5 prompts**;
- `tests/document-history-state-contract.test.ts` freezes family names, routing/payloads, principal
  result contours and zero legacy dispatch;
- `tests/state-preview.test.ts` preserves one-capture whole+focus materialization/hash/scale behavior;
- `src/platform/capabilities.test.ts` freezes version parsing, UXP API threshold and runtime bridge
  reachability merging.
- final MCPB rebuild remains about **5.71 MB** and `verify:pack` reports 107 packed dist JS files with
  retired UI/analytics surfaces absent;
- the CoS plugin child was restarted after the final build (`PID 12744`, created after the
  `dist/cos-plugin.js` timestamp). On that fresh process: `photoshop_ping` reported
  `ready=true`, `transport=uxp`, `revisionMatch=true`; `photoshop_get_state` returned the expected
  empty-session state; `photoshop_list_documents` returned the expected zero-document atomic result;
  `photoshop_get_capabilities` returned Photoshop 2026 with runtime UXP reachability; and
  `photoshop_get_history` correctly failed as `no_active_document`. Guard remained
  `embedded=true`, `mode=required`, `raw_mutation_bypass_blocked=true`.

Measured exact-line overlap against `v1.7.6` after C1:

| Scope | After Phase B | After C1 |
| --- | ---: | ---: |
| Canonical Photoshop/Guard runtime | 12.65% | **11.74%** |
| First-party source | 14.15% | **13.38%** |
| First-party code + tests | 10.60% | **10.01%** |

The remaining same-path overlap in the three `*-tools.ts` declaration files is predominantly the
intentionally preserved public MCP schema/description contract rather than old inline execution code.
Cross-file comparison of the old upstream tool modules against the new operation modules found no
large transplanted implementation block: the largest contiguous exact block is 10 lines for document
operations and 3 lines for history/state operations.

#### Phase C2 — full layer domain — complete

The second semantic family covers the complete server-side layer surface rather than only the three
highest-overlap files: base layer creation/deletion/list/select/fill/text/merge, layer properties,
pixel transforms and stack ordering. The public catalog remains **25 layer-domain tools** with the
same central pinned-document behavior and the same accepted success/error contours.

The former inline implementations were replaced with project-owned operation modules:

- `layer-operations.ts` — create/delete/merge-down/text/fill/list/select;
- `layer-property-operations.ts` — opacity/blend/visibility/lock/rename/duplicate/rasterize/merge/flatten;
- `layer-transform-operations.ts` — fit/scale/pixel-move/rotate;
- `layer-ordering-operations.ts` — relative and simple stack moves;
- `layer-operation-shared.ts` — bounded document-id and text-result helpers.

The four public `layer-*-tools.ts` modules were also rebuilt as compact project-owned catalog builders,
so source independence does not rely on merely moving old handler bodies elsewhere. The direct shared
`blend-mode.ts` helper was independently reimplemented from the accepted token contract. Production
dispatch remains UXP-only/fail-closed; no layer handler calls `executeScript` and no failed UXP mutation
is replayed through another backend. Existing UXP plugin handlers were not rewritten in C2 because the
plugin implementation is already overwhelmingly project-owned relative to `v1.7.6`; this phase targets
the retained high-overlap TypeScript semantic surface.

The obsolete current-only `scripts/test-layer-api-contracts.mjs` legacy/ExtendScript fixture was
retired, and README verification now points at the UXP-only Vitest contracts instead.

Verification after C2:

- `npm run verify:canonical`: **73 test files / 707 tests passed**, zero lint errors;
- embedded MCP surface remains **129 tools / 14 Guard tools / 5 prompts**;
- `tests/layer-domain-contract.test.ts` freezes all four layer families, representative schemas,
  UXP primitives/payloads, exact public confirmation text and zero legacy dispatch;
- existing `src/tools/layer-uxp-routing.test.ts`, `tests/document-target.test.ts` and
  `tests/blend-mode.test.ts` remain green;
- `verify:tool-counts` now discovers local functions explicitly returning `ToolDefinition`, allowing
  compact catalog builders without coupling the verifier to object-literal source shape.
- final MCPB rebuild is about **5.72 MB** and `verify:pack` reports 112 packed dist JS files with the
  retired UI/analytics surfaces absent;
- after that final build, the Photoshop MCP child was explicitly restarted in Chat On Steroids.
  `dist/cos-plugin.js` was built at 20:41:09 and the fresh child (`PID 16012`) was created at 20:44:01.
  On that process `photoshop_ping` reported `ready=true`, `transport=uxp`, matching bridge revision and
  `plugin_connected=true`; `photoshop_get_state` returned the expected empty-session state and the
  rewritten `photoshop_get_layers` path correctly failed closed as `no_active_document`. Guard remained
  `embedded=true`, `mode=required`, `raw_mutation_bypass_blocked=true`.

Measured exact-line overlap against `v1.7.6` after C2:

| Scope | After C1 | After C2 |
| --- | ---: | ---: |
| Canonical Photoshop/Guard runtime | 11.74% | **9.93%** |
| First-party source | 13.38% | **11.87%** |
| First-party code + tests | 10.01% | **8.89%** |

Same-path exact overlap for the rewritten layer declarations is now small: base layer tools 6.1%,
properties 7.3%, transforms 13.3%, ordering 7.6%; `blend-mode.ts` is 33.3% because the accepted public
mode-token list itself is intentionally stable. Cross-file checks against the old upstream modules find
no large moved implementation block: the largest contiguous exact block in any new layer operation
module is four lines (three lines for properties/transform/ordering).

#### Phase C3 — selection + masks — complete

The third semantic family rewrites the complete 18-tool selection/mask surface: selection inspection,
ellipse/rectangle/all/deselect/invert, expand/contract/feather/save, Select Subject, Content-Aware Fill,
layer-mask create/delete/apply, gradient masks, and clipping-mask create/release.

Implementation now uses project-owned semantic modules:

- `selection-operations.ts` — selection reads/mutations, layer-mask lifecycle, Select Subject and
  Content-Aware Fill;
- `mask-operations.ts` — gradient-mask and clipping-mask semantics;
- `selection-operation-shared.ts` — bounded argument normalization, result projection and plain-text
  compatibility helpers;
- `selection-tools.ts` / `mask-tools.ts` — compact declaration/catalog builders only.

The family preserves the deliberately mixed historical result contract: newer semantic operations keep
their atomic JSON envelopes, while rectangle/all/deselect/invert and basic layer-mask lifecycle retain
their accepted plain-text confirmations. Central `document_id` injection/pinning remains authoritative;
the UXP client still binds the request-scoped document before dispatch and no handler switches documents
implicitly. Production routing is UXP-only/fail-closed, with no `executeScript` call or mutation replay.

The old direct `PhotoshopDetector` dependency used only by Select Subject was removed from this domain.
The Photoshop-version gate now consumes the already independently rewritten
`getPhotoshopCapabilities(version).features.select_subject_v2` contract, preserving the existing
PS 23+ behavior without carrying the high-overlap detector implementation into C3.

Verification after C3:

- `npm run verify:canonical`: **74 test files / 713 tests passed**, zero lint errors;
- embedded MCP surface remains **129 tools / 14 Guard tools / 5 prompts**;
- `tests/selection-mask-domain-contract.test.ts` freezes all 18 tool names/order, representative schemas,
  normalization rules, UXP payloads, mixed result contours, semantic error mappings, Select Subject
  version gating and zero legacy dispatch;
- `src/tools/canonical-lane-blockers-uxp.test.ts` and `tests/document-target.test.ts` remain green;
- `verify:pack` reports 115 packed dist JS files with retired UI/analytics surfaces absent.
- the final MCPB rebuild is about **5.73 MB**;
- after that build, the Photoshop MCP child was explicitly restarted in Chat On Steroids.
  `dist/cos-plugin.js` was built at 21:25:48 and the fresh child (`PID 25088`) was created at 21:27:28.
  On that process `photoshop_ping` reported `ready=true`, `transport=uxp`, matching bridge revision and
  `plugin_connected=true`; `photoshop_get_state` returned the expected empty-session state and the
  rewritten `photoshop_get_selection_bounds` path correctly failed closed as `no_active_document`.
  Guard remained `embedded=true`, `mode=required`, `raw_mutation_bypass_blocked=true`.

Measured exact-line overlap against `v1.7.6` after C3:

| Scope | After C2 | After C3 |
| --- | ---: | ---: |
| Canonical Photoshop/Guard runtime | 9.93% | **8.35%** |
| First-party source | 11.87% | **10.53%** |
| First-party code + tests | 8.89% | **7.90%** |

Same-path exact overlap is now **9.0%** for `selection-tools.ts` and **20.8%** for `mask-tools.ts`;
before C3 those files were 78.2% and 67.5% respectively. The three new operation/shared modules are
current-only, and cross-file comparison against the old upstream selection/mask files finds no large
transplanted implementation block: the largest contiguous exact match is six lines.

#### Phase C4 — filters + adjustments/color — complete

The fourth semantic family covers **18 tools**: six raster filters, seven direct/Curves adjustments and
five non-destructive color-adjustment creators. The old inline handlers were replaced by project-owned
modules:

- `filter-operations.ts` — Gaussian Blur, Unsharp Mask, Add Noise, Motion Blur, High Pass and Smart Blur;
- `adjustment-operations.ts` — brightness/contrast, hue/saturation, auto levels/contrast, Curves,
  desaturate and invert;
- `color-adjustment-operations.ts` — LUT, Vibrance, Exposure, Photo Filter and Gradient Map;
- `adjustment-operation-shared.ts` — bounded numeric normalization, compatible plain-text results and
  the existing explicit positive `document_id` payload behavior for adjustment/color calls.

`filter-tools.ts`, `adjustment-tools.ts` and `color-adjustment-tools.ts` are now compact catalog builders.
The rewrite intentionally preserves the family's mixed result contract: Gaussian/Sharpen/Noise/Motion
and the direct pixel adjustments still expose their accepted plain-text confirmations, while High Pass,
Smart Blur, Curves and all five color-adjustment tools keep atomic JSON envelopes. Filter calls retain
their historical direct-handler payload shape without explicit `document_id`; request pinning remains
central in `bindPinnedDocumentId`. Adjustment/color calls retain their explicit safe positive id field in
addition to that central pinning. No operation catches a UXP failure and replays it through another
backend.

Verification after C4:

- `npm run verify:canonical`: **75 test files / 720 tests passed**, zero lint errors;
- embedded MCP surface remains **129 tools / 14 Guard tools / 5 prompts**;
- `tests/filter-adjustment-domain-contract.test.ts` freezes all 18 tool names/order, representative UXP
  primitives/actions/payloads, filter validation/defaults, Curves normalization, color clamping/defaults,
  mixed public result contours and zero legacy dispatch;
- `tests/document-target.test.ts` and `tests/uxp-migration-completeness.test.ts` remain green;
- `verify:pack` reports 119 packed dist JS files with retired UI/analytics surfaces absent.
- the final MCPB rebuild is about **5.73 MB**;
- after that final build, the Photoshop MCP child was explicitly restarted in Chat On Steroids.
  `dist/cos-plugin.js` was built at 21:34:43 and the fresh child (`PID 30576`) was created at 21:36:14.
  On that process `photoshop_ping` reported `ready=true`, `transport=uxp`, matching bridge revision and
  `plugin_connected=true`; `photoshop_get_state` returned the expected empty-session state and
  `photoshop_get_capabilities` reported the expected Photoshop 2026/UXP feature surface. A direct call to
  the rewritten `photoshop_adjust_curves` public tool was correctly rejected as `guard_required`, proving
  the C4 catalog is live while raw mutation bypass remains closed. Guard remained `embedded=true`,
  `mode=required`, `raw_mutation_bypass_blocked=true`.

Measured exact-line overlap against `v1.7.6` after C4:

| Scope | After C3 | After C4 |
| --- | ---: | ---: |
| Canonical Photoshop/Guard runtime | 8.35% | **7.02%** |
| First-party source | 10.53% | **9.39%** |
| First-party code + tests | 7.90% | **7.08%** |

Same-path exact overlap fell from 83.2% to **10.4%** for `filter-tools.ts`, from 57.6% to **11.3%**
for `adjustment-tools.ts`, and from 73.0% to **14.4%** for `color-adjustment-tools.ts`. All four new
operation/shared modules are current-only; cross-file comparison against the three old upstream tool
modules finds no contiguous exact block larger than six lines.

#### Phase C5 — image placement + smart objects — complete

The fifth semantic family covers the six asset/document-placement tools: place an external image into
the active document, open an image as a new document, convert to Smart Object, replace Smart Object
contents, edit embedded Smart Object contents, and create an independent Smart Object via Copy.

The old inline implementations were replaced by project-owned modules:

- `image-placement-operations.ts` — ordinary placed-image mutation plus the special durable/stable
  `open_image` bootstrap command path;
- `smart-object-operations.ts` — convert/replace/edit/copy semantics and result projection;
- `asset-operation-shared.ts` — positive document-target extraction, normalized optional layer names
  and common error text;
- `image-placement-tools.ts` / `smart-object-tools.ts` — compact catalog/schema builders only.

C5 deliberately keeps `open_image` separate from ordinary pinned mutations. It remains a bootstrap/global
operation with stable command identity (`_guard_operation_id` when supplied, otherwise a generated
direct id), durable UXP receipt semantics and the existing `not-executed` contour when Photoshop never
claims the command. `place_image` and all Smart Object mutations remain pinned to the requested document
through the central bridge contract and explicit compatible `document_id` payloads. Smart Object content
replacement still performs non-empty/absolute-path plus local `stat()` validation before any backend or
UXP dispatch. No failed UXP mutation is replayed through another backend.

Verification after C5:

- `npm run verify:canonical`: **76 test files / 727 tests passed**, zero lint errors;
- embedded MCP surface remains **129 tools / 14 Guard tools / 5 prompts**;
- `tests/image-smart-object-domain-contract.test.ts` freezes all six tool names/order, placed-image
  normalization/payloads, durable `open_image` command identity and failure contour, Smart Object
  trimming/document pinning/result projections, pre-dispatch replacement-file validation and zero
  legacy dispatch;
- `src/platform/uxp-bridge-server.test.ts`, `tests/document-target.test.ts`,
  `tests/uxp-migration-completeness.test.ts` and the backend UXP-only contracts remain green;
- `verify:pack` reports **122 packed dist JS files** with retired UI/analytics surfaces absent;
- final MCPB rebuild is about **5.74 MB**;
- after that build, the Photoshop MCP child was explicitly restarted in Chat On Steroids.
  `dist/cos-plugin.js` was built at 21:48:05 and the fresh child (`PID 16372`) was created at 21:49:39.
  On that process `photoshop_ping` reported `ready=true`, `transport=uxp`, matching bridge revision and
  `plugin_connected=true`; state/capabilities reads remained healthy. Direct calls to the rewritten
  `photoshop_place_image` and `photoshop_convert_to_smart_object` public tools were both correctly
  rejected as `guard_required`, proving the C5 catalog is live while raw mutation bypass remains closed.
  Guard remained `embedded=true`, `mode=required`, `raw_mutation_bypass_blocked=true`.

Measured exact-line overlap against `v1.7.6` after C5:

| Scope | After C4 | After C5 |
| --- | ---: | ---: |
| Canonical Photoshop/Guard runtime | 7.02% | **6.51%** |
| First-party source | 9.39% | **8.96%** |
| First-party code + tests | 7.08% | **6.76%** |

Same-path exact overlap fell from 58.0% to **9.7%** for `image-placement-tools.ts` and from 56.0%
to **8.3%** for `smart-object-tools.ts`. The three new operation/shared modules are current-only;
cross-file comparison against the two old upstream tool modules finds no contiguous exact block larger
than five lines.

### Phase D — Windows-only platform cut / legacy transport retirement — complete

The supported host contract is now explicitly **Windows only**. Reachability showed that production
runtime used `PhotoshopConnection` only for installation discovery/version/capability context; no
production semantic tool called `executeScript()` or `ensurePhotoshopRunning()`. All real Photoshop
execution already flowed through the UXP backend.

Phase D therefore removes rather than rewrites obsolete breadth:

- retire `macos-executor.ts`, `macos-detector.ts` and their AppleScript tests;
- retire the unused Windows COM/VBS executor, generic `ScriptExecutor`, script queue and executor tests;
- retire ExtendScript transport/file/result/string helpers that became unreachable with the executor;
- remove old ExtendScript spike/batching harnesses and POSIX-only release helper scripts;
- remove the legacy ExtendScript document-target guard path while preserving the authoritative
  request-scoped UXP `document_id` pinning contract;
- rewrite `windows-detector.ts` around Windows Registry, standard Adobe install directories,
  `PHOTOSHOP_PATH`, and `tasklist.exe` only;
- reduce `PhotoshopConnection` to a Windows discovery/version facade with no mutation or script API;
- make MCPB packaging and manifest compatibility Windows-only.

There is now no selectable or hidden cross-backend Photoshop execution fallback in first-party runtime.

Verification after Phase D:

- `npm run verify:canonical`: **71 test files / 698 tests passed**, zero lint errors;
- the full compact-v2, painting-policy, prompt coverage, tool-count and live-evidence verifiers pass;
- public MCP surface remains **129 tools / 14 Guard tools / 5 prompts**;
- `verify:pack` reports **114 packed dist JS files** with retired UI/analytics and removed legacy
  transport modules absent;
- targeted Windows discovery, document-targeting and color-sampling regressions pass after removing
  their old COM/ExtendScript assumptions.
- final Windows-only MCPB rebuild is about **5.71 MB**. `dist/cos-plugin.js` was built at
  **2026-09-28 00:47:11 +03:00** and Chat On Steroids restarted the Photoshop MCP child afterward as
  **PID 10976** at **00:48:51**. On that fresh process `photoshop_ping` reported `ready=true`,
  `transport=uxp`, `revisionMatch=true` and `plugin_connected=true`; `photoshop_get_state` returned the
  expected empty-session state; `photoshop_get_capabilities` reported Photoshop 2026 with UXP bridge/API
  reachability; and Guard reported `embedded=true`, `mode=required`,
  `raw_mutation_bypass_blocked=true`. The live route is therefore the rebuilt Windows-only
  CoS -> embedded Guard -> UXP path, not a stale pre-cut child.

Measured exact-line overlap against `v1.7.6` after Phase D:

| Scope | After C5 | After Phase D |
| --- | ---: | ---: |
| Canonical Photoshop/Guard runtime | 6.51% | **4.68%** |
| First-party source | 8.96% | **5.00%** |
| First-party code + tests | 6.76% | **3.55%** |

This is the first point at which the canonical shipped runtime passes the predeclared **<5% exact-line
overlap** engineering threshold. It does **not** by itself close P2.5: high-overlap retained production
islands such as text/style, neural/image/generic tools and prompt templates still need replacement or
explicit bounded provenance decisions before standalone rebranding.

### C6 — text + style semantic replacement — complete

C6 replaces the retained text/style implementation from the current public behavior rather than
preserving the inherited execution bodies. `text-tools.ts` and `style-tools.ts` are now compact
catalog/schema surfaces; execution lives in new project-owned `text-operations.ts` and
`style-operations.ts`.

The replacement preserves the five text tools and one layer-style tool, their established schema
defaults/result contours, UXP primitive selection, fail-closed behavior and compatible
`document_id` forwarding. No legacy script/API fallback remains. Layer-style parameter
normalization is explicit and bounded before dispatch.

`tests/text-style-domain-contract.test.ts` freezes tool names/order, text read/write payloads,
document pinning, style defaults/clamping and both pre-dispatch and post-dispatch UXP failure
behavior. Focused text/style + document-target/UXP tests pass **20/20**. Full
`npm run verify:canonical` passes **72 test files / 706 tests**, zero lint errors (23 pre-existing
warnings), `verify:pack` reports **116 packed dist JS files**, and the current dirty-worktree
surface is **130 tools / 14 Guard tools / 5 prompts**. The 130th tool is the separately developed
continuous color-gradient primitive already present in the worktree, not part of C6.

The earlier Phase-D overlap percentages remain the last reproducibly recorded whole-tree measurement;
do not infer a new percentage from C6 alone. A reproducible Phase-E similarity tool is still required
before the next whole-tree percentage is promoted. Remaining semantic targets are neural/image/
stack/export, followed by prompt templates and the final provenance gate.

### Phase E — final provenance/similarity gate

Add a reproducible audit script and fail release when any of these conditions hold:

- a shipped first-party runtime file is byte-identical to the upstream baseline, excluding license or
  intentionally retained third-party material;
- a substantial contiguous copied block remains in production source;
- any production file has high exact/token similarity to upstream without an explicit retained-origin
  exception;
- package/release artifacts contain retired upstream UI/analytics/source files;
- build/runtime requires an `upstream` remote or external upstream checkout.

Suggested engineering target before standalone rebranding:

- **<5% exact-line overlap** across shipped first-party runtime source;
- **zero substantial upstream-identical production files**;
- **zero unexplained large contiguous copied blocks**;
- all remaining exceptions documented in a provenance/third-party notice.

These are engineering gates, not a legal definition of originality.

**Status: COMPLETE (2026-09-28).** The executable gate is now part of `verify:canonical`.

#### First reproducible Phase-E run — 2026-09-28

`scripts/verify-source-independence.mjs` now implements the release audit against the documented fork-base commit. It compares nonblank production lines by same-path sequence alignment, separately detects identical files and >=12-line contiguous matching blocks, flags >=50% same-path similarity files, and checks package metadata for retired payloads/upstream-script dependencies.

The first run reports **40,038 production lines / 1,440 aligned exact lines = 3.60% exact overlap**. That passes the aggregate `<5%` target, but the release gate remains intentionally red: **1 identical file (`src/prompts/_shared.ts`), 27 substantial contiguous blocks, and 19 high-similarity production files** remain. Prominent residuals include the guide-template/shared prompt surface, declarative text/image/neural/export/style/stack catalogs, and two substantial same-path blocks in `uxp-plugin/main.js`.

`verify:source-independence` is deliberately not part of `verify:canonical` while red. The next work is to replace those residual source-text islands from the frozen public contracts, rerun this gate, and only then promote it into canonical/release verification.

## 5. Branding and attribution end-state

Do not remove the word “fork” from primary product identity **before** the source-independence gate.
After it passes, the primary README/package/product description may describe the project simply as an
independently maintained Photoshop digital-painting MCP system.

Origin attribution should remain separate from branding. While substantial upstream-derived source is
still shipped, preserve the upstream MIT copyright/license notice. After the retained implementation
has been independently replaced/removed, keep provenance in a concise `NOTICE`/`UPSTREAM.md` rather
than repeatedly presenting the product itself as “a fork.” Do not rewrite Git history merely to hide
origin; history is provenance, not a runtime dependency.

That end-state has now been reached: the maintained source-independence gate reports no identical
files, no substantial same-path copied blocks, no cross-path clone blocks and no high-similarity
implementation files. The root MIT `LICENSE` therefore identifies the current PaintPilot project;
the historical upstream author and repository remain in `NOTICE` as provenance.

The intended final distinction is:

- **product identity:** this project and its current architecture;
- **historical provenance:** originated from the MIT-licensed `alisaitteke/photoshop-mcp` codebase;
- **current maintenance/runtime:** no dependency on upstream source checkout, release cadence or code
  synchronization.

#### Residual semantic replacement — in progress (2026-09-28)
After C6, image resize/crop, image-stack and export execution were moved behind project-owned
operation modules (`image-operations.ts`, `stack-operations.ts`, `export-operations.ts`,
`residual-operation-shared.ts`), and Neural Filter normalization/execution was isolated in
`neural-operations.ts`. Their catalog builders primarily declare retained public MCP contracts.
UXP-only/fail-closed routing and document pinning are preserved. Focused validation after the
export/neural extraction is green at **3 files / 16 tests** plus a green server build; the last
full canonical baseline remains **72 files / 708 tests** and **130 tools / 14 Guard tools /
5 prompts**. P2.5 remains open for prompt replacement and the Phase-E reproducible similarity gate.

#### Prompt replacement pass — complete (2026-09-28)

The four retained inherited guide templates have now been reworked from the current five-guide public
contract and semantic-tool surface rather than left as near-verbatim upstream templates. The live
registry uses the new project-owned `src/prompts/guide-contract.ts` registration/result contract;
`ps.digital_painting_control` was already project-owned. Public prompt names and argument contracts
remain unchanged, and the prompt verifier still reports exactly five guide prompts.

After this pass `npm run verify:canonical` is green at **72 test files / 713 tests**, the public surface
is **130 tools / 14 Guard tools / 5 prompts**, and `verify:pack` reports **122 packed dist JS files**.
Lint has zero errors and 30 warnings. The Phase-D whole-tree overlap percentages remain the last
promoted measurement: this prompt pass does not invent a replacement percentage. The next P2.5
deliverable is the reproducible Phase-E provenance/similarity gate and its measured residual list.

### 2026-09-28 Phase E prompt-helper follow-up

The five maintained guide prompts now import the project-owned `guide-contract.ts` helpers directly instead of routing through the historical shared helper. The reproducible gate currently measures 1,416 exact lines across 40,188 production lines (3.52%), with zero byte-identical production files. The stricter gate is still open: 24 contiguous upstream-identical blocks of at least 12 lines and 19 high-similarity files remain. This is progress, not P2.5 completion.

### 2026-09-28 Phase E residual-island follow-up
Historical prompt helper is now a compatibility re-export and the core registry imports the project-owned guide contract directly. Image resize/crop and Neural Filter schema declarations were re-expressed while preserving public contracts. Current reproducible result: **1,278 / 40,087 = 3.19% exact overlap**, **0 identical files**, **20 >=12-line blocks**, **17 high-similarity files**. Phase E remains red. `build:server` is green; canonical tests pass **72/72 files, 716/716 tests**, but the full command then stops on an unrelated concurrent dirty-worktree tool-count drift: 128 discovered while documentation/package assertions still expect 130.

### 2026-09-28 Phase E text/document/prompt/UXP follow-up

The next residual pass targeted the largest remaining source-text islands rather than the aggregate
percentage. `text-tools.ts` and `document-tools.ts` now use project-owned declaration builders while
delegating to their already project-owned operation modules; their public names/order/schemas and
document-target behavior remain covered by `text-style-domain-contract` and
`document-history-state-contract`. The four non-painting guide templates now use the project-owned
`defineGuideTemplate` shape and the registry derives names from the maintained guide catalog. Finally,
the two >=12-line same-path blocks in `uxp-plugin/main.js` were independently replaced by a compact
neural-filter descriptor map/dispatcher while retaining the existing UXP command, error and pinning
semantics.

After these changes `npm run verify:source-independence` reports **39,924 production lines / 871
aligned exact lines = 2.18%**, **0 byte-identical production files**, **8 >=12-line contiguous blocks**
and **10 >=50%-similarity files**. The two former UXP large blocks are gone and `uxp-plugin/main.js`
falls from 110 to **49 exact lines**. Focused UXP/text/document tests are green; prompt verification is
green; the complete Vitest run passes **72 files / 716 tests**; `build:server` and `verify:pack` are
green. `verify:canonical` still stops at the already-known concurrent tool-count mismatch (**128 source
tools vs 130 asserted by unrelated docs/package metadata**), so neither canonical closure nor a fresh
live-Photoshop acceptance is claimed here. Phase E remains open until the remaining 8/10 residuals are
rewritten or explicitly bounded.

### 2026-09-28 Phase E final closure

The final residual pass independently re-expressed the retained style/export/stack/neural declaration
surfaces, the optional `document_id` schema injector, the UXP bridge server listen/retry substrate, the
host-visible units/error-recovery instruction block, and the remaining high-similarity support files
(`errors/envelope.ts`, `tools/atomic-shared.ts`, `platform/connection.ts`,
`platform/capabilities.ts`, `tools/history-tools.ts`, `tools/state-tools.ts`, and `core/session.ts`).
Maintained public schemas/results, Windows-only discovery semantics, UXP-only/fail-closed execution,
document pinning and error/recovery contracts remain covered by focused tests and project verifiers.

The reproducible final Phase-E result against fork-base commit
`7b635963f87b5b8ff5380c3156841f5253ec8063` is:

| Gate | Final result |
| --- | ---: |
| Nonblank production lines | **39,850** |
| Aligned exact lines | **628** |
| Exact-line overlap | **1.58%** |
| Byte-identical production files | **0** |
| Contiguous identical blocks >=12 lines | **0** |
| Production files >=50% exact similarity | **0** |
| Retired package entries | **0** |
| Package scripts requiring upstream | **0** |

`verify:source-independence` therefore passes and has been promoted into `verify:canonical`. Build,
pack, compact-v2, painting-policy, prompt and live-evidence verifiers are green. Parallel full-suite
runs exposed resource-contention timeouts in heavy Guard regression files even though each reported
case passed independently. The canonical acceptance runner therefore uses one Vitest worker and a
bounded **15-second infrastructure timeout**; functional assertions and the dedicated latency/
benchmark checks remain unchanged. Under that runner the inventory is clean at
**72/72 files / 716/716 tests**.

### 2026-09-28 P2.5 product-surface closure and P2.6 identity cutover

The previously reported **128 vs 130** mismatch was not a source/runtime catalog disagreement. A
runtime probe instantiated the built `PhotoshopMCPServer` and confirmed **130 registered tools**. A
name-set comparison then showed that the AST verifier missed exactly
`photoshop_resize_image` and `photoshop_crop_document`, because those declarations use
`tool: imageDefinition('photoshop_*', ...)`. `verify-tool-counts.ts` now recognizes literal tool names
at that helper-built declaration boundary; it reports **130 total = 130 atomic + 0 recipes; 14 Guard
tools; 5 prompts**.

The remaining P2.5 product surface was replaced independently:

- the three host examples now use the project's own `photoshop-digital-painting` label and Windows
  built-entry paths, with a project-owned examples README;
- package name, runtime MCP name, server metadata and MCPB metadata use
  `photoshop-mcp-digital-painting`;
- MCPB output is `photoshop-mcp-digital-painting-<version>.mcpb` plus the stable-name artifact, and
  the bundle includes both `NOTICE` and `LICENSE`;
- `NOTICE` centralizes historical upstream origin, the comparison-baseline commit and licensing/
  distribution separation;
- current primary documentation/runtime copy uses **Photoshop MCP — Digital Painting Edition** rather
  than fork branding;
- `verify:product-identity` is now a reproducible canonical gate covering these identities and
  packaging/provenance invariants.

After the identity wording changes, the runtime source gate remains green at **626 / 39,850 = 1.57%**,
with **0 identical files, 0 >=12-line blocks, 0 >=50%-similarity files, 0 retired package entries and
0 upstream-script dependencies**. The rebuilt MCPB's internal manifest and bundled `package.json`
were inspected and carry the standalone project identity. **P2.5 is complete; P2.6 standalone primary
identity is implemented.** Historical audit entries intentionally retain the word “fork” when
describing the repository's origin or earlier project phases.

### 2026-09-28 P2.7 provenance/license attribution closure

P2.7 closes the legal/provenance continuity requirement without reintroducing historical origin as
primary product branding. The root `LICENSE` remains byte-for-byte identical to the upstream MIT
license at baseline commit `7b635963f87b5b8ff5380c3156841f5253ec8063`. `NOTICE` now explicitly
records the original repository, derivative origin, project-authored work, the major architectural
divergence from the historical upstream design, and the rule for crediting future selective ports.
Contributor workflow requires non-trivial external intake to record source repository + exact
revision/PR, affected paths, whether work was copied/adapted/reimplemented, and applicable
license/notice obligations.

The new `verify:provenance` gate is part of `verify:canonical`. It verifies the retained MIT notice
against the baseline, package inclusion of `LICENSE`/`NOTICE`, MCPB MIT metadata, bundle-builder copy
requirements and the maintained selective-port policy. A freshly rebuilt MCPB was extracted and both
`server/LICENSE` and `server/NOTICE` matched the repository files by SHA-256. On the current dirty
worktree canonical verification passes **73/73 test files / 723/723 tests**, `verify:pack` reports
**123 dist JS files**, and source-independence remains strict-green at **626 / 40,257 = 1.56%** with
zero identical files, zero >=12-line exact blocks and zero >=50%-similarity files. P2.7 is complete;
P2.8 was the next integration-governance item and is closed below.

### 2026-09-28 P2.8 selective external-intake closure

Selective intake is now a maintained workflow rather than an attribution-only paragraph. The new
[`external-intake.md`](external-intake.md) contract makes an external/upstream change eligible only
when it addresses a current project problem, compatibility need or measured value; requires exact
source revision/PR, affected paths, intake mode, architecture-fit analysis and license/notice evidence;
and explicitly rejects release/version/merge pressure based only on another repository advancing.

The contributor, PR, development, release-policy and release-checklist surfaces now share that model.
The PR template captures provenance/fit fields for non-trivial intake, while project-authored changes
can explicitly mark the section not applicable. Release notes no longer require an upstream base
version in releases that contain no external port.

`npm run verify:external-intake` is part of `verify:canonical`. It verifies the maintained policy
markers, PR evidence fields and canonical wiring, scans package scripts/workflow docs (and GitHub YAML
workflows when present) for routine upstream synchronization commands, and reports that an `upstream`
remote is not required. Current result: 0 forbidden synchronization matches. Full canonical validation
passes **73/73 test files / 726/726 tests**, `verify:pack` reports **123 dist JS files**, catalog counts
are **130 tools / 14 Guard tools / 5 prompts**, and runtime source-independence remains strict-green at
**626 / 40,338 = 1.55%** with all strict residual lists empty. **P2.8 is complete.**

The overall P2 completion gate is not yet complete because P2.4 remains externally blocked: after a
fresh `git fetch`, published `origin/digital-painting` is
`0f3363a976ae35277de324f52163b45cf35f9e58` and its `scripts/build-mcpb.ts` still invokes direct
`zip -rq`. The current dirty worktree contains the Windows `Compress-Archive` repair, but P2.4 requires
that repair to be published and then validated from a new origin-only clone with no `upstream` remote.
