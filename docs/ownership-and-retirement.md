# Ownership, provenance and retirement

Date: 2026-09-29

This document is the canonical engineering ownership/retirement map for the independently maintained
Photoshop MCP digital-painting project. It combines the P1-A reachability-based retirement record
with the P2 provenance, source-independence and product-ownership decisions.

It is **not** an authorship percentage. Decisions are based on current product need, package/runtime
reachability, architectural constraints and provenance relative to the original
`alisaitteke/photoshop-mcp` project. Git history is the archive for deleted implementations.

## 1. Current product boundary

The current product is centered on:

- the compact-v2 embedded Guard;
- `dist/cos-plugin.js` as the guarded Chat On Steroids entry;
- the semantic `photoshop_*` catalog;
- UXP-only / fail-closed production Photoshop dispatch;
- the Photoshop-side UXP companion;
- the digital-painting policy, evidence and evaluation layers.

The former external controller/daemon provider chain, raw-script execution layer, public recipe
runtime and generic Data Sets/mail-merge product breadth are not part of the current production
architecture.

The current public catalog is **131 semantic tools**, including **15 Guard tools**, plus **5 MCP guide
prompts**.

## 2. Provenance snapshot

Before the P2 reductions, the tracked `src` tree compared with `upstream/master` approximately as
follows:

- `core`: 40 current-only, 3 modified, 2 upstream-identical;
- `platform`: 7 current-only, 8 modified, 2 upstream-identical;
- `tools`: 12 current-only, 33 modified, 9 upstream-identical;
- `prompts`: 1 current-only, 4 modified, 19 upstream-identical;
- `ui`: 7 modified, 15 upstream-identical;
- `analytics`: 7 modified, 12 upstream-identical;
- `api`: 2 modified;
- `utils`: 4 upstream-identical.

This snapshot is historical context for ownership decisions, not a current authorship metric.

## 3. Current ownership / decision map

| Subsystem | Provenance / role | Product need | Current decision |
| --- | --- | --- | --- |
| `src/core/guard/*`, VisualMicroPlan, artistic/recovery/review/state modules | project-owned core | compact-v2, journaling, no-replay, recovery, review, artistic state | **KEEP / project-owned core** |
| `src/cos-plugin.ts` | project-owned entry | guarded CoS production route | **KEEP** |
| `src/core/photoshop-mcp-server.ts` + `server.ts` facade | project-owned composition root over standard MCP SDK calls | generic MCP server/bootstrap | **KEEP; compatibility facade stays thin** |
| `src/core/runtime-session.ts` + `session.ts` facade | project-owned connection lifecycle | connection lifecycle | **KEEP MINIMAL** |
| `src/core/runtime-registries.ts` + registry facades | project-owned registration substrate | stable MCP registration | **KEEP** |
| `src/platform/photoshop-backend.ts` + route trace | project-owned routing authority | production semantic transport | **KEEP; UXP-only / fail-closed** |
| UXP bridge client/server + `uxp-plugin/` | platform adapter, heavily modified | Photoshop execution and exact outcomes | **KEEP** |
| `src/platform/discovery-runtime.ts` + discovery facades | Windows-only project-owned discovery runtime | install detection, version/capability reporting | **KEEP MINIMAL; never production semantic dispatch** |
| document/layer/mask/selection/filter/export/text/smart-object semantic tools | project-owned catalog/operation surface with documented historical provenance | core editing/compositing/persistence surface | **KEEP selectively according to product evidence** |
| painting/measurement/color-sampling/brush-pack/method/value tools | project-owned or heavily modified | direct painting-product differentiation | **KEEP** |
| former `src/ui/*` + `web/` | overwhelmingly upstream-identical optional standalone browser client | not required by canonical CoS/Guard product path | **RETIRED in P2.5** |
| former `src/analytics/*` | overwhelmingly upstream-identical optional telemetry | no Photoshop/Guard correctness requirement | **RETIRED in P2.5; app-version lookup replaced by `src/core/app-version.ts`** |
| `src/prompts/host-guidance.ts`, `prompt-catalog.ts`, retained guide templates | project-owned prompt ownership surface | five guide prompts and server instructions | **KEEP; old paths are compatibility facades where retained** |
| small generic utility/error modules | project-owned runtime substrate plus ordinary generic syntax | shared support substrate | **KEEP only where product-reachable; source-independence gate remains authoritative** |
| accepted policy/evidence modules that are test-reachable but not currently on production entrypoints | project-owned accepted behavior/evidence | preserve prior acceptance claims | **DO NOT DELETE AS GENERIC CLEANUP; resolve integrate-vs-test-support explicitly** |

For ordinary maintenance, provenance alone was previously not a reason to rewrite stable live code.
That policy is superseded for **P2.5 source independence**: substantial upstream-identical or
high-overlap shipped first-party code is now an explicit retirement/rewrite target before standalone
rebranding. See [`source-independence-audit.md`](source-independence-audit.md).

## 4. Completed P1-A retirement manifest

P1-A classified the former controller/daemon compatibility surfaces from package-script, import and
maintained-test reachability.

| Surface | Classification | Final disposition / replacement |
| --- | --- | --- |
| `src/core/guard/*`, `src/tools/guard-tools.ts`, embedded async jobs | canonical required | **RETAINED**; native Guard owns journal, closure, recovery, multiscale evidence, restart/resume and anchor restore |
| `src/platform/uxp-bridge-*`, `PhotoshopBackendRouter` | canonical required | **RETAINED**; production router is now stricter than the original P1-A snapshot: UXP-only / fail-closed |
| `scripts/photoshop-session.mjs` | unreachable dead code | **REMOVED** |
| `scripts/photoshop-mcp-daemon.mjs` | unreachable dead code | **REMOVED** |
| `scripts/lib/photoshop-session-store.mjs` | unreachable duplicate state implementation | **REMOVED** |
| `scripts/lib/photoshop-cycle.mjs` | unreachable duplicate cycle executor | **REMOVED** |
| `scripts/lib/mcp-daemon-client.mjs` | historical/manual-only client | **REMOVED** |
| controller/daemon-specific test scripts and one-shot fixtures | migration/historical fixtures | **REMOVED after required assertions migrated** |
| old daemon-only layer/coordinate/protection live helpers | historical archaeology | **REMOVED** |
| `docs/reliable-core-workflow.md` | historical archaeology | **REMOVED; Git history is the archive** |
| runtime evidence under `.photoshop-runtime/` / `processes/` | acceptance evidence | **RETAIN only where the live evidence ledger/acceptance record still depends on it** |

P1-A concluded that no additional live production TypeScript surface qualified for blind deletion
under the dead-code criterion. Product-scope reduction was deliberately deferred to P2.

## 5. Completed P2 reductions

P2 removed inherited breadth only when it reduced the product's execution or maintenance surface
without deleting accepted capabilities merely because they came from upstream.

Completed reductions include:

- six generic batch/business recipes;
- the full public `photoshop_recipe_*` runtime;
- recipe-specific prompt templates, leaving five semantic guide prompts;
- Photoshop Data Sets/mail-merge tooling;
- opaque Action playback/public raw-script surfaces;
- the shared legacy ExtendScript API/snippet layer after the UXP-only cutover;
- other compatibility modules proven unreachable by maintained entrypoints.

Production semantic routing is now UXP-only / fail-closed; the retained platform executors cannot be
selected by `PhotoshopBackendRouter`.

P2.5 specification-first replacement has also completed the document/history/state, layer,
selection/mask, filter/adjustment/color, image-placement/Smart-Object and **text/style** semantic
families. For text/style, the public catalog/schema builders are separated from new project-owned
operation modules, and focused contracts preserve UXP-only/fail-closed dispatch plus document
pinning. Residual replacement work is intentionally limited to the remaining neural/image/stack/
export islands and prompt surface before the final provenance/similarity gate.

## 6. Reduction / replacement rule

For ordinary dead-code/product-scope cleanup, inherited code is removed when all of the following are
true:

1. no accepted painting/compositing/persistence/recovery workflow requires it;
2. no maintained package/test entry point requires it;
3. deletion reduces catalog/routing/backend complexity rather than merely changing ownership labels;
4. backend-specific implementation and maintained documentation are removed with the public surface;
5. the canonical repository gate remains green.

P2.5 adds a second, explicit rule: live inherited code may be **reimplemented from the current
behavioral contract** even when still useful, because source independence is itself now a declared
product requirement. Prefer deletion when the capability is not part of the intended product; prefer
specification-first replacement when it is.

## 7. Acceptance and maintenance boundary

This document records ownership and retirement decisions. It does not replace:

- [`architecture.md`](architecture.md) for current runtime architecture;
- [`available-tools.md`](available-tools.md#generated-backend-and-access-inventory) for generated per-tool backend/access status;
- [`roadmap-final-acceptance-matrix.md`](roadmap-final-acceptance-matrix.md) for accepted/pending claims;
- [`PAINTING-ROADMAP.md`](PAINTING-ROADMAP.md) for forward-looking work.

The deletion gate remains repository reachability plus the maintained verification suite; Git history
preserves removed implementation details.

- 2026-09-28 residual pass: image resize/crop, image-stack, export and Neural Filter execution now
  live behind project-owned operation modules; their catalog builders remain public-contract
  declarations. Focused validation after export/neural extraction is green (3 files / 16 tests
  plus the server build). Prompt replacement and the final reproducible provenance/similarity gate
  remain before P2.5 closure.
- 2026-09-28 prompt pass: the four retained inherited guide templates were reworked around the
  current semantic/Guard workflow, the five-prompt registry now uses project-owned
  `src/prompts/guide-contract.ts`, and `ps.digital_painting_control` remains project-owned. Public
  prompt names/arguments are preserved. Full canonical verification is green at 72 files / 713 tests;
  the remaining P2.5 blocker is the reproducible Phase-E provenance/similarity gate.
- 2026-09-28 Phase-E gate scaffold: `npm run verify:source-independence` now reproducibly measures same-path sequence-aligned production overlap against the documented fork-base commit. Aggregate runtime overlap is **3.60%**, but the stricter gate remains red on 1 identical file, 27 substantial contiguous blocks and 19 high-similarity production files. These are active rewrite targets, not accepted provenance exceptions.

### Phase E prompt ownership follow-up (2026-09-28)

All maintained `ps.*` prompt templates now depend directly on the project-owned `src/prompts/guide-contract.ts` contract. The historical `_shared.ts` helper is no longer a first-party prompt dependency and is a retirement candidate; source-independence verification reports no byte-identical production file after this pass.

### Phase E residual ownership follow-up (2026-09-28)
The historical prompt helper is no longer an owned implementation surface: `_shared.ts` is a compatibility re-export and `PromptRegistry` consumes `guide-contract.ts` directly. Image and Neural Filter declarations were independently re-expressed. Current gate: **3.19% exact overlap**, **0 identical files**, **20 large blocks**, **17 high-similarity files**; remaining residuals stay active rewrite targets.

### Phase E declaration/UXP ownership follow-up (2026-09-28)

The retained text/document declaration surfaces and all four non-painting guide-template declarations
are now expressed through project-owned catalog/guide builders; their operation modules were already
project-owned. The two remaining substantial same-path UXP blocks were also replaced without changing
the UXP-only/fail-closed transport or pinned-document contract. The reproducible gate now measures
**2.18% exact runtime overlap**, **0 identical production files**, **8 large blocks** and **10
high-similarity files**. Those 8/10 items remain active source-independence targets rather than accepted
origin exceptions. Repository tests pass 72/72 files and 716/716 tests; the aggregate canonical command
is separately blocked by the pre-existing 128-vs-130 tool-count metadata drift in the dirty worktree.

### Phase E final ownership closure (2026-09-28)

All strict production similarity residuals tracked by the reproducible Phase-E gate are now cleared.
The final pass re-expressed the remaining declaration/support islands (style/export/stack/neural,
document targeting, UXP server bootstrap, instructions, envelope/atomic results, Windows
connection/capabilities/session and history/state declarations) while keeping their maintained public
and runtime contracts. `verify:source-independence` passes at **1.58% exact overlap (628 / 39,850)**
with **0 identical files, 0 large blocks, 0 high-similarity files, 0 retired package entries and
0 upstream-script dependencies**, and is now included in `verify:canonical`.

This closes **Phase E ownership/source-similarity work**. The subsequent product-surface pass also
closed the rest of P2.5: examples, package/server metadata and MCPB presentation are project-owned;
the 128-vs-130 discrepancy was proven to be an AST-verifier blind spot rather than missing runtime
tools; and `NOTICE` is now the centralized provenance artifact.

### P2.5 product-surface / P2.6 identity ownership closure (2026-09-28)

Primary ownership now follows the standalone **Photoshop MCP — Digital Painting Edition** identity.
The npm-style package/runtime/MCPB name is `photoshop-mcp-digital-painting`; project bundles use that
artifact stem and carry `NOTICE` plus the retained `LICENSE`. Generic host examples were independently
rewritten for the maintained Windows/project route. `verify:product-identity` is canonical and prevents
old primary fork branding or unrelated distribution identifiers from becoming the current product
identity again.

Historical origin is not erased: `NOTICE` records the original `alisaitteke/photoshop-mcp` project,
the documented comparison baseline and its historical MIT licensing. Historical changelog/audit text
may continue to use “fork” descriptively. Current runtime/build/package operation has no dependency on
that upstream repository or remote. Final runtime source-independence after this cutover is
**626 / 39,850 = 1.57%**, with all strict residual lists empty.

### P2.7 provenance/license ownership closure (2026-09-28)

Attribution ownership is now explicit and mechanically checked. After the source-independence work
removed substantial copied implementation, the root MIT `LICENSE` identifies the current PaintPilot
project copyright. `NOTICE` is the canonical provenance document for historical origin, current
architectural divergence and the credit policy for future selective external ports.

`verify:provenance` is now a canonical gate. It requires the project-owned MIT `LICENSE`, historical
origin in `NOTICE`, both files in distributions, MIT MCPB metadata, and the contributor-facing
source-revision/license recording policy. A rebuilt MCPB confirms the bundled license and notice are
the repository copies. This closes P2.7; no new ownership exception is introduced. P2.8 was the next
integration-governance item and is now closed below.

### P2.8 selective external-intake ownership closure (2026-09-28)

External code is no longer modeled as a branch-level synchronization stream. The project-owned
[`external-intake.md`](external-intake.md) workflow treats historical upstream and every other external
repository as optional candidate sources. Non-trivial intake is justified by a current project need,
reviewed against the maintained Guard/UXP architecture, assigned an explicit intake mode and bound to
exact source/provenance/licensing evidence. Retired architecture is not revived for parity; adaptation
or independent reimplementation is preferred when source assumptions conflict with current ownership.

Contributor, PR and release workflows carry those requirements. `verify:external-intake` is canonical
and prevents routine upstream pull/merge/rebase/reset instructions from becoming maintained workflow;
the current check reports zero forbidden synchronization matches and does not require an `upstream`
remote. Canonical verification passes **73/73 files / 726/726 tests** with **130 tools / 14 Guard tools /
5 prompts**; source-independence remains **626 / 40,338 = 1.55%**, with all strict residual lists empty.
This closes P2.8 without creating a new ownership exception.

### P2 aggregate release-autonomy closure (2026-09-28)

P2.4 subsequently closed from published revision
`2be5260012ce026da4fd6b79437ac4beb1fa6fb4`: a fresh Windows clone with only `origin` and no
`upstream` completed dependency installation, canonical verification, MCPB packaging/archive checks
and MCP stdio initialization. P2 is therefore closed as an independent-product cutover; GitHub
fork-network presentation remains separate repository metadata rather than a runtime/build/release
dependency.

### P1-S residual source-independence closure (2026-09-29)

The final ownership hardening pass moved maintained registry/session/log/error/document-target,
Windows discovery/capability, server composition, prompt ownership and selected semantic declaration
surfaces behind project-owned implementation modules and bounded compatibility facades. Neural Filter
feature semantics no longer live in generic UXP transport plumbing. Working bridge transport code was
left intact where change would have served only the overlap score.

`verify:source-independence` now enforces a default **<0.50%** production-runtime threshold and passes
at **206 / 42,057 = 0.4898% exact-line overlap**, with **0 byte-identical production files, 0 exact
blocks >=12 lines, 0 production files >=50% exact similarity, 0 retired package entries and 0
upstream-script dependencies**. Full canonical verification passes **74/74 test files / 755/755
tests**, **150 packed dist JS files**, lint **0 errors / 30 existing warnings**, and the maintained
catalog is **131 atomic tools / 15 Guard tools / 5 prompts**. Historical attribution remains in
`LICENSE` and `NOTICE`; these overlap numbers are not an authorship percentage.
