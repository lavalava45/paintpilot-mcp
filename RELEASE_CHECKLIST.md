# Release Checklist — Photoshop MCP Digital Painting Edition

> **Developer Preview scope (2026-10-17):** the initial experimental release
> requires one user-run real-image trial, a passing canonical verifier,
> a live Photoshop/UXP Guard smoke, a reproducible tagged source/package,
> fresh-install verification and explicit limitations. The independent
> six-scene artistic qualification below still gates a **Beta** claim, not
> an honestly labeled experimental Developer Preview. Only the
> `digital-painting` branch is used for ongoing development and release tags.

> **Current art acceptance, updated 2026-10-13:** authoritative prompts are [the user's six replacement subjects](docs/RELEASE-QUALIFICATION-SCENES-USER-20261013.md), not the superseded pagoda/cabin/Mykonos set. The first tiger pilot [stopped at a reproducible Guard/Director priority correction conflict](docs/RELEASE-S01-TIGER-INCIDENT-20261013.md). No artwork has passed; do not publish Beta on source-only evidence.

Use this checklist before publishing a tagged GitHub release. For the current
**PaintPilot Beta** qualification, use it together with
[`docs/RELEASE-HARDENING.md`](docs/RELEASE-HARDENING.md) and the coordinated
[`deployment-health`](docs/deployment-health.md) activation gate.

The Beta qualification scope is the Windows **Painting Mode** route:
**MCP client → this repository's `dist/painting-mode.js` → embedded Guard → UXP bridge → Photoshop**.
Production semantic Photoshop mutation is UXP-only/fail-closed and must pass through
the embedded Guard. Other local stdio host configurations remain project entry points,
but they are not evidence for this Plugins-only Beta qualification.

**Developer Preview packaging acceptance (2026-10-20):** `verify:canonical`
**PASS** (2422/2422 tests; 223/223 files), extracted Windows ZIP and MCPB
both-mode MCP protocol smoke PASS, release build-integrity checks PASS. The
live guarded Photoshop/UXP create-and-close test PASS; pixel-fill admission
was blocked before dispatch because the disposable document had no art-run.
The running MCP was older than the independently tested release ZIP. No live
pixel edit **from that ZIP** was accepted. The user has accepted the layered
forest cottage as the one-image trial; no independent pixel-quality audit is
claimed. Explicitly disclose these limits for Developer Preview only.
Six-scene qualification remains a separate **Beta** gate. Any release-preparation
source changes create a new candidate SHA that must be checked again.
The draft public notes are in
[`docs/DEVELOPER-PREVIEW-RELEASE-NOTES.md`](docs/DEVELOPER-PREVIEW-RELEASE-NOTES.md).

**1.8.0-preview.2 candidate, 2026-10-30:** the independently extracted
two-mode MCPB and Windows ZIP passed offline stdio smoke and SHA-256 checks;
`verify:canonical` passed 2428 tests in 224 files. This is **not a public
release**. Before tagging, require successful Windows packaging CI and a
real installed-host upgrade/reload/disposable-Photoshop acceptance. See
[`docs/MCPB-UPGRADE-IMPLEMENTATION.md`](docs/MCPB-UPGRADE-IMPLEMENTATION.md)
and the versioned `preview.2` release notes.

## Repository

- [ ] Project repository remote is configured as `origin`.
- [ ] Canonical release checkout has no persistent historical `upstream` remote; external comparisons,
      when needed, use an exact URL/revision or a disposable checkout outside the project tree.
- [ ] `pnpm-lock.yaml` is tracked, matches `package.json`, and a clean `pnpm install --frozen-lockfile`
      reproduces the dependency tree without extraneous direct packages.
- [ ] Working tree is clean and the exact candidate commit SHA is recorded before qualification.
- [ ] Release branch contains the intended painting API and visual-control skill changes.
- [ ] `README.md`, `INSTALL.md`, `CHANGELOG.md`, and painting docs describe the same feature set.
- [ ] No local machine paths, credentials, temporary screenshots, or test-only secrets are committed unintentionally.

## Validation

- [ ] `pnpm install --frozen-lockfile` in a clean disposable checkout (the repository tracks `pnpm-lock.yaml`, not `package-lock.json`; do not mutate the running development tree to validate dependency reproducibility).
- [ ] `npm run build:server`
- [ ] `npm run lint`
- [ ] `npm run verify:photoshop-prompts`
- [ ] `npm run verify:provenance`
- [ ] `npm run verify:external-intake`
- [ ] `npm run verify:tool-counts`
- [ ] `npm run verify:product-identity`
- [ ] `npm run test:embedded-guard-mcp`
- [ ] `npx vitest run src/platform/uxp-bridge-server.test.ts`
- [ ] `npm run verify:canonical` on the frozen candidate before live qualification.
- [ ] `node scripts/test-painting-tools.mjs` with a supported Photoshop version running, only after deployment health is current and using disposable test content.
- [ ] `npm run test:measurement-tools` with a disposable open Photoshop document; confirm temporary guides are restored/removed by the test.
- [ ] Confirm `photoshop_paint_strokes` is present in `tools/list`.
- [ ] Confirm `photoshop_measure_points`, `photoshop_add_guides`, `photoshop_list_guides`, `photoshop_clear_guides`, `photoshop_transform_landmarks`, and `photoshop_compare_landmarks` are present in `tools/list`.
- [ ] Run `node scripts/test-landmark-ergonomics.mjs` and confirm `LANDMARK_ERGONOMICS_TEST_OK`.
- [ ] Confirm `ps.digital_painting_control` is present in `prompts/list`.
- [ ] Run at least one disposable fresh-composition smoke before the six-scene qualification; do not reuse prior demo geometry as release evidence.

## Plugins runtime activation

- [ ] Run `npm run deployment:health -- --offline` after the final build. Treat exit code 0 as source/`dist` consistency only; it does not certify the running MCP child or loaded UXP companion.
- [ ] At an authorized artist pause, restart **only** the PaintPilot MCP server connection after rebuilding `dist/painting-mode.js`. Do not restart the whole host merely to activate the build.
- [ ] Reload **only** Photoshop MCP UXP Bridge in Adobe UXP Developer Tool when UXP code changed; use **Unload → Load** when `uxp-plugin/manifest.json` changed. Do not restart Photoshop for ordinary plugin activation.
- [ ] Run `npm run deployment:health` against the endpoint used by this installed plugin and continue only when it reports `status: "current"`.
- [ ] Confirm fingerprint/runtime parity: `running_mcp.project_root` is the frozen release checkout, the running MCP `build_id` matches the built manifest, source and `dist` fingerprints agree, and loaded UXP reports `connected: true`, matching revision, and the matching UXP source fingerprint. A foreign runtime, missing identity, stale build, or revision-only match is a release blocker.
- [ ] Confirm activation/recovery never replays an uncertain mutation. Build and health commands themselves must not paint, restart applications, or relabel an already running process.

## Documentation

- [ ] Installation from a fresh clone/ZIP has been tested on a clean directory.
- [ ] Product instructions present **Painting Mode** (`dist/painting-mode.js`) and **Photoshop Tools** (`dist/photoshop-tools.js`) as two modes of one independent PaintPilot product. The external controller/daemon provider chain is not a supported route.
- [ ] Local-development docs distinguish schema refresh from restarting the actual MCP server process and do not recommend whole-host restarts or obsolete restart-helper scripts.
- [ ] UXP docs describe localhost long-poll, `Reload` for `main.js`, `Unload → Load` for manifest changes, and health verification via `plugin_connected` / `transport: "long-poll"`.
- [ ] Native catalog/required-mode documentation matches the current **135 tools / 16 public Guard tools** surface and raw mutations fail closed with `guard_required`.
- [ ] `PHOTOSHOP_PATH` guidance covers current Photoshop versions.
- [ ] `NOTICE` is included and current; it records historical origin, major architectural divergence,
      selective-port attribution policy, and the retained upstream MIT notice path.
- [ ] Built/package artifacts include both `LICENSE` and `NOTICE`; `npm run verify:provenance` is green.
- [ ] Known limitations are listed (for example Mixer Brush status, `SINGLE_HISTORY` timeout tradeoffs, and segmented-dynamics rendering).

## PaintPilot Beta six-scene qualification

- [ ] Before the first run, freeze the six exact prompts and scene constraints in [`docs/RELEASE-QUALIFICATION-SCENES.md`](docs/RELEASE-QUALIFICATION-SCENES.md) with the rules in [`docs/RELEASE-HARDENING.md`](docs/RELEASE-HARDENING.md): three retained/problem-known and three previously unseen, with document dimensions, style/finish goals, references/seeds when used, installed brush inventory, termination rules, baseline identity, and frozen scoring thresholds.
- [ ] Run every scene from a clean disposable document against the same frozen candidate. Do not tune code, Guard/compiler policy, prompts, evaluator directions, brush inventory, or the scoring rubric in response to a candidate result. An admitted general fix creates a new candidate and requires all six scenes again.
- [ ] Beta technical acceptance is **6/6** scenes reaching an initial recognizable composition and at least one meaningful correction without manual JSON/schema repair or an engineer restart. A technically nonrecoverable refusal, same-cause retry loop, or missing mandatory review evidence fails the run.
- [ ] Across the six runs observe zero lost previously accepted pixel regions, unauthorized/foreign-owner edits, silent uncertain-mutation replay, or unreported document/session identity mismatch. Verify exact PSD save/reopen and one planned MCP/UXP restart-recovery drill.
- [ ] Record exact delivered frames, runtime/build identity, PSD/layer topology, review checkpoints, rejection/recovery evidence, and timing for every scene. Same-chat Painter/Critic self-review is not independent artistic certification.
- [ ] Keep the Beta claim bounded: Beta may ship with honestly documented unfinished final images if the technical/safety gates pass. Do not claim six independently accepted finished artworks unless the separate 1.0 artistic thresholds are actually satisfied.

## Version / release notes

- [ ] Choose a release version/tag.
- [ ] Move relevant entries from `CHANGELOG.md` Unreleased into the release section.
- [ ] No upstream baseline/version is required. If this release contains a non-trivial selective
      external port, record its exact source revision/PR, intake mode, affected paths and applicable
      attribution/license obligations in the release evidence/notes.
- [ ] Call out painting-specific additions and known limitations.
- [ ] State the exact PaintPilot Beta support boundary and any excluded/untested host or Photoshop configurations; do not generalize Plugins-only qualification evidence to other routes.
- [ ] Tag the tested commit only after the validation steps above pass.

## Post-release

- [ ] For a newer MCPB, retain the historical `manifest.name`; increase the
      product version so the host can treat it as an upgrade rather than a new
      extension. Validate with the official `mcpb` CLI and inspect SHA256SUMS.
- [ ] Upgrade a private-installed MCPB on a clean host: verify whether its
      extension settings persist (host-specific), that mode selection survives,
      and that the UXP manifest continues to be registered at the stable
      `%LOCALAPPDATA%\PaintPilot\uxp-plugin` path.
- [ ] Complete UXP Reload (or Unload/Load after permission changes), verify
      bridge fingerprint parity and preserve controller/journal and backup data
      in `%LOCALAPPDATA%\PaintPilot`. Never run old/new MCPB concurrently.
- [ ] Check the extracted MCPB's launcher exports exactly 39 Painting tools or
      135 direct tools for the current release surface, with the required Guard
      policy; run real Photoshop acceptance using a disposable document.
- [ ] Verify GitHub release assets/source links.
- [ ] Install once using the public release instructions rather than the developer checkout.
- [ ] From that public installation, confirm `npm run deployment:health` is `current` for the installed Plugins child/UXP pair before re-running a disposable live Photoshop smoke test.
- [ ] Confirm upgrade instructions from the previous release work without losing MCP client configuration.
