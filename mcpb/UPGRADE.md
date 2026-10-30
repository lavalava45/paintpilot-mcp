# PaintPilot MCPB — install and upgrade (Windows Developer Preview)

## What the bundle does

This bundle contains both PaintPilot modes. You do **not** need to install Node.js or npm separately if your MCPB-compatible desktop host provides a Node runtime (as Claude Desktop does). You **do** need locally installed Adobe Photoshop and Adobe UXP Developer Tool. The host must support loading local MCPB extensions; not all MCP clients do.

The bundle identity is always `photoshop-mcp-digital-painting`. Keep this name unchanged in future manifests; increase `version` for every release. The version comes from `package.json`.

## First installation

1. In an MCPB-compatible desktop application, use its **Install Extension** action and select the PaintPilot `.mcpb` file.
2. In extension settings choose **mode = tools** (default: direct Photoshop operations) or **mode = painting** (Guard-controlled experimental painting). Restart the connection to switch. Both modes share the same UXP companion.
3. On first MCPB launch, PaintPilot copies its packaged UXP companion to:
   `%LOCALAPPDATA%\PaintPilot\uxp-plugin\manifest.json`
   On Windows, this is a **stable path across MCPB version upgrades**.
4. In Adobe UXP Developer Tool, add **that stable manifest path once** (not the temporary extraction directory inside the desktop application), then load it into Photoshop. Do not attempt to use Photoshop tools before the UXP companion is connected.
5. Check `photoshop_ping`. For guarded painting, also check `photoshop_guard_capabilities` and the exact bridge revision before starting a new art-run.

The first launch may take place before you can register the UXP companion. Its initial attempt to connect to Photoshop may not succeed until the companion is loaded.

## Updating

1. Finish or stop any current Photoshop operation and close the old PaintPilot MCP connection. Never run two different versions against the same document/UXP bridge concurrently.
2. Download the newer, signed or hash-verified `.mcpb` release **from this project's official GitHub Releases**. Check the release notes and SHA-256 checksum before installing.
3. Use your desktop application's extension update/install action to install the **new version with the same manifest name**. A custom/self-installed MCPB generally needs to be reinstalled manually: **do not assume automatic updates**. Versions distributed through an official managed extension directory may receive host-provided automatic updates.
4. Start the extension. The launcher will synchronize its UXP companion into the same stable folder. If it changed, the launcher prints a message to **stderr** requesting a UXP reload; **reload the existing PaintPilot UXP companion** in Adobe UXP Developer Tool before making edits. If the UXP manifest/permissions changed, use Unload → Load instead. Do not re-register a new path.
5. Reconnect the selected MCP mode; confirm `photoshop_ping`, bridge revision/readiness and actual expected tool list before resuming a prior session.

**Preserved outside the replaceable archive:** local Guard controller/journal, preview barriers, command receipts, brush-pack records, backend trace, process-video settings and the UXP companion:
`%LOCALAPPDATA%\PaintPilot\`.

The UXP folder's immediately preceding version remains as `%LOCALAPPDATA%\PaintPilot\uxp-plugin.previous\` after a successful update. To roll back, **stop the MCP client and unload UXP first**; restore that backup only alongside the corresponding older MCPB version. Restoring only one side can cause a bridge revision mismatch. User-created Photoshop documents are never modified by the packaging/update procedure.

**Not a fully automatic product updater:** the MCPB format does not give an independently distributed extension permission to silently update itself. Host delivery is separate from release production. Photoshop/UXP can still require a manual Reload when files change. Do not ship a candidate archive as an update to a published version without a new version, passing release verification and a real test using a disposable Photoshop document.

## Technical verification

Package builder: `npm run build:mcpb`. The builder regenerates the bundle manifest version from the package version, bundles production dependencies and verifies deployment fingerprints; the resulting artifacts are produced under `release/`. Run the official MCPB validator on the generated manifest, check `mcpb info`, extract independently and execute the read-only both-mode smoke. For a new public release, run the canonical release gates and confirm a real Photoshop/UXP session on a disposable document.

The two-mode entry is `server/launch.cjs`: `PAINTPILOT_MODE=tools|painting`. A malformed mode fails closed. The runner forces the corresponding Guard policy instead of trusting a conflicting `PHOTOSHOP_GUARD_MODE` environment value. Writable state and plugin files are never stored in the host's replaceable MCPB extraction tree.
