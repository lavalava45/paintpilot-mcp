# PaintPilot 1.8.0-preview.2 — installation (Windows, release candidate)

PaintPilot is an independent Photoshop automation product with **two modes**:
Painting Mode and Photoshop Tools. Both use the same Windows release archive
and Adobe Photoshop UXP companion.

## Installation

1. Install **Node.js 18 or later**, Adobe Photoshop and Adobe UXP Developer Tool.
2. Extract **`paintpilot-windows-1.8.0-preview.2.zip`** to a permanent folder.
   Keep `server/node_modules`, `server/dist` and `server/uxp-plugin` together.
   The archive contains compiled JavaScript and production dependencies: you
   do **not** need to install npm/pnpm packages or compile it.
3. Open Adobe UXP Developer Tool, load
   `<extracted-folder>/server/uxp-plugin/manifest.json` and start the companion
   plugin in a running Photoshop instance.
4. In your **MCP-compatible client**, add a local stdio MCP server using
   command `node` and the absolute path to **one** of the two scripts below.
5. Reconnect or restart that MCP server in your client. Read
   `photoshop_ping` to confirm the UXP bridge is connected. Guarded users can
   also check `photoshop_guard_capabilities(deployment_health:true)`.

## Mode 1: PaintPilot — Painting Mode

Choose this for AI-driven image creation, with the Art Director, Painter,
Critic, artistic progress, visual checkpoints and Guard-owned Undo/recovery.
The server entry point is:

```text
<extracted-folder>\server\dist\painting-mode.js
```

This wrapper **forces** `PHOTOSHOP_GUARD_MODE=required`; raw mutations must go
through `photoshop_guard_cycle_auto`. For initial work select the
`simple_graphic` profile. `nontrivial_painting` is stricter and experimental.

Example MCP server configuration (replace the installation path):

```json
{
  "mcpServers": {
    "paintpilot-painting": {
      "command": "node",
      "args": ["C:/path/to/paintpilot/server/dist/painting-mode.js"]
    }
  }
}
```

## Mode 2: PaintPilot — Photoshop Tools

Choose this for direct Photoshop commands via MCP to UXP: changing opacity,
renaming and moving layers, selecting areas, available filters, Undo/Redo and
other registered operations. There is **no Art Director, Critic or mandatory
artistic Guard cycle**. Photoshop's native tool-level checks still apply.

```text
<extracted-folder>\server\dist\photoshop-tools.js
```

The wrapper selects `PHOTOSHOP_GUARD_MODE=off` explicitly.

```json
{
  "mcpServers": {
    "paintpilot-tools": {
      "command": "node",
      "args": ["C:/path/to/paintpilot/server/dist/photoshop-tools.js"]
    }
  }
}
```

**These are two product modes, not two different products.** Select only one
active mode for a particular connection. The UXP companion does not change.
Direct edits do not automatically enter Painting Mode's Guard journal;
reconcile the document and layer state before continuing guarded work.

## Constraints

- Windows-only developer preview; Photoshop 2026 is the tested baseline.
- A host's Stop button may not cancel an in-flight Photoshop operation.
- Guarded local glow has contract-level verification; final independent live
  Photoshop acceptance is pending. See `RELEASE-NOTES.md` for limitations.
- The `.mcpb` file is an optional alternate installation format for
  MCPB-compatible clients. Starting with **preview.2**, the bundle lets you
  select either **Photoshop Tools** (default) or **Painting Mode** in its
  extension settings. It installs a UXP companion at the stable
  `%LOCALAPPDATA%\PaintPilot\uxp-plugin` location; register that manifest in
  Adobe UXP Developer Tool once. After updates, reload the companion as
  explained in `mcpb/UPGRADE.md` (also inside the MCPB).
  The ZIP continues to use its own `server/uxp-plugin` path, independent of
  the MCPB-managed copy.
- License and attribution are in `server/LICENSE`, `server/NOTICE` and
  `server/THIRD_PARTY_NOTICES.md`.
