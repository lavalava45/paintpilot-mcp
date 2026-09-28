# Release and compatibility policy

This project owns its releases independently. Upstream tags or releases are inputs for selective review only; they do not trigger a release, version bump, merge, or compatibility promise here.

## Product version

The package/MCPB product version follows Semantic Versioning. A release is cut only from this repository after its applicable roadmap/acceptance gates pass.

- **PATCH**: compatible bug fixes, performance/reliability work, documentation, and selectively ported external fixes that do not change a public contract.
- **MINOR**: backward-compatible product capability additions.
- **MAJOR**: intentional incompatible changes to a supported public product contract.

Internal protocol revisions are not inferred from the product version. A product release may change one or more protocol revisions independently when the corresponding contract changes.

## Runtime compatibility contracts

The canonical painting lane is UXP-only and fail-closed. Compatibility is determined by explicit runtime contracts reported by Guard/capabilities, not by package-version coincidence: compact Guard protocol version, runtime-state version, and UXP bridge revision. A missing or incompatible required revision is a readiness failure; production code must not fall back to a retired ExtendScript/COM painting path.

The currently live-accepted host baseline is **Adobe Photoshop 2026 on Windows with the repository UXP companion**. Other Photoshop/OS combinations are not claimed supported until they have explicit acceptance evidence. The companion manifest and Guard capability snapshot remain the authoritative machine-readable constraints for UXP/bridge readiness.

## Release acceptance

Before publishing a product release:

1. install dependencies from this repository declared manifests;
2. run the canonical repository verifier and required build/lint/type checks;
3. build the MCPB and UXP companion from this repository;
4. verify required protocol/runtime/bridge revisions and migration notes;
5. run applicable live Photoshop acceptance gates for changed runtime behavior;
6. record user-visible changes, breaking/migration requirements, and acceptance evidence in release notes/CHANGELOG.

Release notes must describe the canonical Guard/UXP lane directly. Any breaking protocol, runtime-state, bridge, persisted-state, or user-facing contract change must state the required migration/reload action.

## External and upstream changes

Upstream is an external source, not a synchronization authority. Candidate fixes/features are reviewed against the current architecture and selectively ported, cherry-picked, or reimplemented. They receive the same tests and acceptance requirements as project-owned changes and should retain appropriate attribution in commit/release notes.

The maintained decision procedure is [`external-intake.md`](external-intake.md). An upstream tag,
release, or branch advance does not establish a project release baseline. Release notes identify exact
external sources only when a release actually contains a non-trivial selective port.

Git ancestry and the preserved MIT license document provenance; they do not determine release cadence or supported compatibility.
