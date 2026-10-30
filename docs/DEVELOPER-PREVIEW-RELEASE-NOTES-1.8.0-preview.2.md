# PaintPilot 1.8.0-preview.2 — Developer Preview

> **Release candidate documentation.** A built local archive or pushed Git commit is
> **not** a published GitHub release. Check the actual GitHub Releases page for
> this exact version and for its published SHA-256 before installing.
> Experimental software for Windows, not a qualified Beta or unattended artist.

## Changes since 1.8.0-preview.1

- One MCPB now offers **Photoshop Tools** (direct MCP operations, default) and
  **Painting Mode** (embedded Guard, Art Director, Painter/Critic and review
  checkpoints). Select a mode in the MCPB host's extension settings and restart
  the MCP connection. **Only run one mode against a document at a time.**
- The MCPB launcher stores controller state, visual barriers, UXP receipts and
  brush records outside the replaceable MCPB extraction directory under
  `%LOCALAPPDATA%\PaintPilot`. A new MCPB updates its UXP companion into a
  stable `uxp-plugin` directory, preserving the prior copy for rollback.
- The UXP Developer Tool still requires **one-time manual registration** of that
  stable `uxp-plugin/manifest.json` and a **Reload** after companion changes.
  The MCPB cannot silently replace a running Photoshop UXP module.
- Guard fixes include verified-current-frame handling for Art Director whole
  image reviews and a synchronous per-call host Stop check where required.
  Those fixes preserve existing fail-closed checks and do not guarantee an
  artwork's visual quality.
- Retain Linux-safe, **read-only MCP catalog introspection** so Glama can inspect
  PaintPilot without attempting Linux Photoshop mutations.

## Installation

For a compatible desktop MCPB host, install the **versioned**
`photoshop-mcp-digital-painting-1.8.0-preview.2.mcpb` from the official
GitHub release, if published. Read the bundled `UPGRADE.md` and register
`%LOCALAPPDATA%\PaintPilot\uxp-plugin\manifest.json` in Adobe UXP Developer
Tool. The package advertises **135 direct tools** or **39 guarded Painting
Mode tools**, with 5 MCP prompts in either mode. These counts are protocol
inventory, not a guarantee that Photoshop is connected.

Alternatively use `paintpilot-windows-1.8.0-preview.2.zip`, which has both
entry points under `server/dist/` and uses the extracted
`server/uxp-plugin/manifest.json` instead of the MCPB-managed UXP path.
See the packaged `INSTALL.md`. Neither method requires compiling the
shipped production JavaScript; direct ZIP usage requires a local Node.js.

## Compatibility and limitations

- Windows 10/11 only. Photoshop 2026 with the local UXP companion is the
  principal tested integration; no macOS/Linux Photoshop operation support.
- The MCPB format does **not** guarantee automatic updates of privately
  installed extensions; the desktop host controls delivery, installation,
  settings retention and restart. Preserve the same extension identity and
  increase its version, but do not promise silent upgrades.
- `simple_graphic` is the recommended guarded starting profile.
  `nontrivial_painting` remains experimental and may stop repeatedly at
  technical/artistic evidence requirements. Photoshop Tools mode has no
  Art Director journal; direct edits are not automatically imported into
  guarded painting history.
- Host Stop behavior varies. Never assume external Stop undoes a Photoshop
  operation. Pending or uncertain operations must be reconciled rather
  than replayed.
- Existing developer preview limitations around brush-preset readback,
  Smart Filters, experimental geometry and unfinished artistic qualification
  still apply. No Beta or production-art quality claim is made.

## Release acceptance

The final published release must identify a **single frozen Git commit and
tag**, complete canonical CI, confirm a reproducible frozen-lockfile build,
validate the manifest using the official MCPB tool, and test both modes from
independently extracted archives. Keep UXP readiness and disposable-document
Photoshop acceptance separate from offline protocol tests. A local candidate
alone is **not** evidence that in-place upgrade and saved settings were
verified in a real desktop host.

The release must publish the versioned MCPB, Windows ZIP and
`SHA256SUMS.txt` with actual, independently checked SHA-256 values. A SHA-256
checksum is not a code-signing certificate.
