# PaintPilot MCPB upgrades — implementation and acceptance

**30 October 2026 — candidate engineering work. The public `preview.2`
release has NOT been published.** Only `1.8.0-preview.1` is available on
GitHub Releases, and its MCPB remains direct Photoshop Tools only.

## Product objective

Distribute **one Windows MCPB** that supports both Painting Mode (Guard required)
and Photoshop Tools (direct operations), and make upgrades preserve user state
and the registered UXP companion path.

## Architecture

- `mcpb/manifest.json` retains the already-established stable machine name
  `photoshop-mcp-digital-painting`; the package's SemVer is copied from
  `package.json`. Changing the name would cause a second extension instead
  of an in-place update.
- `server/launch.cjs` is the stable entry point.
  `PAINTPILOT_MODE=tools` (default) selects `dist/photoshop-tools.js`;
  `PAINTPILOT_MODE=painting` selects `dist/painting-mode.js`. It enforces the
  Guard mode even when conflicting legacy environment flags are supplied.
  Unknown modes exit without starting MCP.
- The launcher redirects the controller journal, preview barriers, UXP
  receipts, brush-pack records, execution lock, process-video settings, and
  backend trace to `%LOCALAPPDATA%\PaintPilot`. A test-only override
  `PAINTPILOT_DATA_HOME` must be absolute. Existing user-supplied runtime
  path overrides are honored.
- `mcpb/uxp-sync.cjs` verifies the packaged UXP files using SHA-256 and
  synchronizes them to a **stable** `uxp-plugin` subdirectory under the same
  data root. The prior copy is retained as `uxp-plugin.previous` for rollback;
  suspicious partial updates cause an error rather than silent deletion.
- UXP Developer Tool still needs a **one-time registration** of the stable
  plugin manifest. After an update changing the companion, users need to
  **Reload** the existing plugin (Unload/Load if permissions changed).
  Photoshop/UXP cannot safely be hot-replaced during an ongoing mutation.

## Delivery is controlled by the desktop host

The official MCPB format provides an installable local bundle, not a universal
silent-update service. Self-installed custom MCPBs in Claude Desktop normally
require installing the newer `.mcpb` again; extensions managed through a
directory may update automatically. Other MCP clients vary. The release
pipeline must publish version-incremented MCPBs and SHA-256 checksums; stable
extension identity lets supporting hosts retain installation identity and
often settings, but **preservation of the host's saved form values is not
guaranteed across untested clients**. Never download and execute a newer
server from within a running Photoshop mutation.

## Verification so far

- Official `@anthropic-ai/mcpb` schema validation passes. A stale `enum`
  property in the old manifest was removed because schema v0.4 rejects it.
- Local unit tests verify mode allowlist, enforced Guard mode, stable writable
  paths, UXP overwrite on version change, backup and journal retention, and
  recovery refusal for a pending update.
- Built a **local, untagged** test candidate `1.8.0-preview.2-rc.1` from an
  isolated worktree based on Git HEAD plus only package-related changes. The
  main checkout's unrelated uncommitted Guard and test files were not copied
  into the candidate or overwritten by its compiler.
- Independent extraction/stdio smoke of that candidate has passed for
  **135 Photoshop Tools / 39 Painting tools / 5 prompts**, with the correct
  per-mode Guard setting and a stable external UXP/data directory. No native
  Photoshop edits were made in these tests.
- Final rebuilt and independently extracted local candidate is saved at
  `release/candidates/photoshop-mcp-digital-painting-1.8.0-preview.2-rc.1.mcpb`
  with SHA-256
  `3543b83bb18feb139e46c2efed5d85baffbe8cf805e5559ab01342372d1c509e`.
  The adjacent `.sha256.txt` was produced after a full checksums match against
  the isolated build. **The candidate is unsigned; this is not a public release.**
- `mcpb info` successfully read the final candidate. All four standalone
  packaging-upgrade tests passed, and 20 owning process-video tests passed.
  Product-identity, provenance, and package-import gates passed.

## Remaining before a public update

- Test installing the candidate through the **actual** supported desktop
  host and replacing the already-installed older MCPB; explicitly verify
  mode preference retention and user config for that host.
- Add/register the UXP companion once from the stable folder; test a
  subsequent update + Reload with a disposable Photoshop document and
  matching UXP/Guard revision. Do not migrate or mutate a real ongoing art
  session as an installation test.
- Run the applicable release gates (including canonical verifier and fresh
  live Photoshop/UXP acceptance) from the exact frozen release SHA, then cut
  a **new GitHub tag/version**. Do not relabel the already released
  `1.8.0-preview.1` MCPB as supporting two modes.
- Consider code signing with a maintained trusted certificate. A SHA-256
  published beside a GitHub release is an integrity check, not equivalent
  to a publisher signature.

User-facing instructions: [`mcpb/UPGRADE.md`](../mcpb/UPGRADE.md).

## Final local candidate review — 2026-10-30

- The source version was raised consistently to **`1.8.0-preview.2`** in
  `package.json`, `server.json`, and `mcpb/manifest.json`; this is a
  **candidate number, not a released Git tag**.
- Root source commit for the independently packaged candidate:
  `2a90862ab4b05db243df3430f0b70ccff22364b5`. Three focused commits
  include Guard and host Stop regression fixes, the Glama/Linux discovery CI
  gate plus a Windows MCPB package/ZIP/checksum CI job, and versioned
  packaging/release documentation.
- Full local `npm run verify:canonical` **PASS**: 224 Vitest files, 2428
  tests, plus the other canonical gates. ESLint reported 0 errors and
  201 existing warnings; the historical live-evidence ledger verified 21
  entries, with 2 ignored historical records unavailable.
- `npm run test:mcpb-upgrade`: **4/4 PASS**; official MCPB manifest validation
  **PASS**. The new builder refuses to copy previous-preview release notes
  into the ZIP. Product identity now requires version parity.
- Final `npm run build:mcpb`: **PASS**. Both final archives were independently
  extracted and started over MCP stdio (direct tools 135, guarded painting 39,
  5 prompts each; guarded raw mutations denied). They report the matching
  `preview.2` version, include current installation instructions and
  preserve an external managed UXP/data path.
- Built local artifacts (not Git-tracked or published):
  - `release/photoshop-mcp-digital-painting-1.8.0-preview.2.mcpb`:
    `4f38f0b474215366fbdcaa3f5b9ca210025a58b5712fcc9e2ed1a9026aec7f21`
  - `release/paintpilot-windows-1.8.0-preview.2.zip`:
    `78a921717f6674f82bdd46f55271915b46170ffea3fc352f2d209a99089b5cb9`
  - Stable unversioned local MCPB alias: same bytes and SHA-256 as versioned
    MCPB. The checksum file matches all three.
- Previously published `preview.1` local versioned ZIP/MCPB hashes still
  match their GitHub release asset digests, and those old files were not
  overwritten.

**Not yet qualified:** a real supported desktop host updating an installed
`preview.1` extension to `preview.2` with preserved user configuration;
the UXP companion's one-time registration and Reload across that upgrade;
a disposable Photoshop edit through the installed upgrade; and successful
final GitHub Windows packaging CI on the pushed commit. These remain
mandatory before tagging and publishing the new MCPB as a working upgrade.
The candidate is unsigned (checksums do not establish publisher identity).
