# Release Checklist — Photoshop MCP Digital Painting Edition

Use this checklist before publishing a tagged GitHub release.

## Repository

- [ ] Project repository remote is configured as `origin`.
- [ ] Any historical comparison remote is optional and does not participate in build/runtime/package steps.
- [ ] Working tree is clean.
- [ ] Release branch contains the intended painting API and visual-control skill changes.
- [ ] `README.md`, `INSTALL.md`, `CHANGELOG.md`, and painting docs describe the same feature set.
- [ ] No local machine paths, credentials, temporary screenshots, or test-only secrets are committed unintentionally.

## Validation

- [ ] `npm ci`
- [ ] `npm run build:server`
- [ ] `npm run lint`
- [ ] `npm run verify:photoshop-prompts`
- [ ] `npm run verify:provenance`
- [ ] `npm run verify:external-intake`
- [ ] `npm run verify:tool-counts`
- [ ] `npm run test:embedded-guard-mcp`
- [ ] `npx vitest run src/platform/uxp-bridge-server.test.ts`
- [ ] `node scripts/test-painting-tools.mjs` with a supported Photoshop version running.
- [ ] `npm run test:measurement-tools` with an open Photoshop document; confirm temporary guides are restored/removed by the test.
- [ ] Confirm `photoshop_paint_strokes` is present in `tools/list`.
- [ ] Confirm `photoshop_measure_points`, `photoshop_add_guides`, `photoshop_list_guides`, `photoshop_clear_guides`, `photoshop_transform_landmarks`, and `photoshop_compare_landmarks` are present in `tools/list`.
- [ ] Run `node scripts/test-landmark-ergonomics.mjs` and confirm `LANDMARK_ERGONOMICS_TEST_OK`.
- [ ] Confirm `ps.digital_painting_control` is present in `prompts/list`.
- [ ] Run at least one fresh-composition artistic regression test without reusing prior demo geometry.

## Documentation

- [ ] Installation from a fresh clone/ZIP has been tested on a clean directory.
- [ ] Chat On Steroids instructions use the canonical Plugins → `dist/cos-plugin.js` → embedded Guard route; Core/controller is described only as dev/debug/recovery compatibility.
- [ ] Local-development docs distinguish ChatGPT Plugins **Refresh** from CoS plugin-process **Restart**, document that only the custom Photoshop MCP plugin should be restarted after a server rebuild, and do not recommend whole-CoS restarts or obsolete restart-helper scripts.
- [ ] UXP docs describe localhost long-poll, `Reload` for `main.js`, `Unload → Load` for manifest changes, and health verification via `plugin_connected` / `transport: "long-poll"`.
- [ ] Native catalog/required-mode documentation matches the tested **130 tools / 14 Guard tools** and raw mutations fail closed with `guard_required`.
- [ ] `PHOTOSHOP_PATH` guidance covers current Photoshop versions.
- [ ] `NOTICE` is included and current; it records historical origin, major architectural divergence,
      selective-port attribution policy, and the retained upstream MIT notice path.
- [ ] Built/package artifacts include both `LICENSE` and `NOTICE`; `npm run verify:provenance` is green.
- [ ] Known limitations are listed (for example Mixer Brush status, `SINGLE_HISTORY` timeout tradeoffs, and segmented-dynamics rendering).

## Version / release notes

- [ ] Choose a release version/tag.
- [ ] Move relevant entries from `CHANGELOG.md` Unreleased into the release section.
- [ ] No upstream baseline/version is required. If this release contains a non-trivial selective
      external port, record its exact source revision/PR, intake mode, affected paths and applicable
      attribution/license obligations in the release evidence/notes.
- [ ] Call out painting-specific additions and known limitations.
- [ ] Tag the tested commit only after the validation steps above pass.

## Post-release

- [ ] Verify GitHub release assets/source links.
- [ ] Install once using the public release instructions rather than the developer checkout.
- [ ] Re-run the live Photoshop smoke test from that installation.
- [ ] Confirm upgrade instructions from the previous release work without losing MCP client configuration.
