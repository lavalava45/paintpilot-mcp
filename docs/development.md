# Development and Operations

Current build, validation and troubleshooting guide for **Photoshop MCP — Digital Painting Edition**.

← Back to [README](../README.md)

For end-user installation and MCP host configuration, see [`INSTALL.md`](../INSTALL.md). Architecture and Guard/UXP contracts live in [`architecture.md`](architecture.md).

## 1. Build from source

```bash
git clone <repository-url>
cd photoshop-mcp-digital-painting
pnpm install --frozen-lockfile
npm run build
```

An `upstream` remote is optional and is used only for selective comparison/intake. Normal build,
test, packaging and runtime operation must work from this repository alone. If you want to inspect
upstream changes, add it explicitly:

```bash
git remote add upstream https://github.com/alisaitteke/photoshop-mcp.git
git fetch upstream
```

Fetching is discovery only; do not turn the comparison remote into a routine merge/rebase target.
Evaluate individual candidate changes under [`external-intake.md`](external-intake.md), which requires
a current project need, architecture-fit review, provenance and the ordinary project acceptance gates.

Useful commands:

```bash
npm run build
npm run build:server
npm run dev
npm run lint
npm run format:check
```

## 2. Canonical repository verification

The main repository gate is:

```bash
npm run verify:canonical
```

It currently builds the server and runs the maintained package, lint, acceptance, compact-v2,
painting-policy, prompt, source-independence, product-identity, provenance, tool-count and
live-evidence checks.

Focused checks include:

```bash
npm run test:unit
npm run test:acceptance
npm run test:embedded-guard-mcp
npm run verify:painting-policy
npm run verify:photoshop-prompts
npm run verify:source-independence
npm run verify:product-identity
npm run verify:provenance
npm run verify:external-intake
npm run verify:tool-counts
npm run verify:compact-v2-contract
npm run verify:acceptance-matrix
npm run verify:live-evidence-ledger
```

Photoshop-dependent or targeted integration helpers still exposed by `package.json` include:

```bash
npm run test:mcp-local
npm run test:measurement-tools
npm run test:landmark-ergonomics
npm run test:painting-batching-live
npm run test:document-targeting
npm run test:document-targeting-live
npm run test:color-sampling
npm run test:color-sampling-live
```

Do not infer maintained status from an old command mentioned in Git history. `package.json` is the
authority for current runnable scripts.

## 3. UXP companion

Production semantic Photoshop dispatch is UXP-only and fail-closed. The Photoshop-side companion is
in `uxp-plugin/`.

### Load the plugin

1. Install Adobe UXP Developer Tool.
2. Add `uxp-plugin/manifest.json`.
3. Load the plugin.
4. Open the **MCP Bridge** panel in Photoshop.
5. Start the MCP server.

The Node bridge listens on `127.0.0.1:38452` by default. Override the port with
`PHOTOSHOP_UXP_BRIDGE_PORT`.

`GET /health` reports listener and companion state. A healthy loaded development companion should
report `plugin_connected: true` and `transport: "long-poll"`.

The bridge also exposes read-only diagnostic endpoints used by development probes. Those diagnostics
must not be treated as an alternate production mutation route.

### Applying local code changes

After server changes:

```text
npm run build:server
Chat On Steroids app
→ Plugins
→ this Digital Painting Edition entry
→ …
→ Restart
```

Restart the custom child only. A ChatGPT-side Plugins refresh updates connector/schema metadata but
does not guarantee that the existing `dist/cos-plugin.js` process was replaced.

After `uxp-plugin/main.js` changes:

```text
Adobe UXP Developer Tool
→ Photoshop MCP UXP Bridge
→ …
→ Reload
```

After `manifest.json` changes use **Unload → Load** so permissions are re-read.

### Network permission note

The live-tested Photoshop 2026 UXP runtime rejects narrowed loopback HTTP declarations for the bridge
with `Manifest entry not found`. The development manifest therefore uses the broader network
permission required by that runtime, while the bridge HTTP server itself still binds only to
`127.0.0.1`.

## 4. Current production assumptions

- Production semantic Photoshop dispatch is **UXP-only / fail-closed**.
- There is no production ExtendScript/COM fallback.
- Raw `photoshop_execute_script` and the former recipe execution layer are retired.
- Document-bound operations fail closed on target mismatch instead of silently switching tabs.
- Uncertain dispatched mutations are reconciled from state/evidence; they are never replayed through
  another backend.
- `photoshop_save_document` is UXP-only and preserves the active working context.
- Preview and color-sampling reads use the UXP Imaging API.
- The authoritative generated backend/access inventory is
  [`available-tools.md`](available-tools.md#generated-backend-and-access-inventory).

Exact live/repository acceptance claims belong in
[`roadmap-final-acceptance-matrix.md`](roadmap-final-acceptance-matrix.md), not in this operator guide.

## 5. Exact raster registration

Do not rely on clipboard copy/paste when exact full-canvas registration matters. Photoshop may center
trimmed transparent clipboard content and change absolute document-space placement.

For exact registration, prefer a document-to-document layer duplicate from the opened source into the
target document, then close the source without saving. If a pre-rendered technical element is used as
a fallback, retain full-canvas transparent margins so document coordinates remain stable.

## 6. Native AI-adjacent Photoshop features

The MCP surface does not expose cloud text/image generation. Native Photoshop features that are
explicitly represented by the semantic catalog remain usable according to runtime capabilities. Neural
Filters require the UXP companion.

## 7. Troubleshooting

### Photoshop not found

Ensure Photoshop is installed in a normal detectable location, or provide `PHOTOSHOP_PATH`.

Example MCP environment configuration:

```json
{
  "env": {
    "PHOTOSHOP_PATH": "C:\\Custom\\Path\\Adobe Photoshop 2026\\Photoshop.exe"
  }
}
```

### Photoshop is detected but the semantic route is not ready

Check `photoshop_ping` and the UXP bridge health. Production mutations require a ready, compatible
UXP companion. Do not interpret detection of Photoshop alone as proof that semantic dispatch is ready.

### Rebuilt CoS plugin still runs old code

**Symptom:** `npm run build:server` succeeds but behavior still matches the old build.

**Cause:** schema refresh and child-process replacement are different operations.

**Fix:** restart only this Digital Painting Edition plugin from the Chat On Steroids Plugins
UI. If freshness matters, verify that the child PID/creation time changed.

### UXP bridge still runs old `main.js`

Use **Reload** in Adobe UXP Developer Tool. For manifest changes use **Unload → Load**. Then check
`http://127.0.0.1:38452/health`.

### UXP bridge reports `Manifest entry not found`

The currently tested Photoshop 2026 runtime requires the development manifest's broader network
permission for this loopback bridge. After a permission change, use **Unload → Load**, not only
Reload.

Confirm `plugin_connected: true` before UXP-only operations such as document persistence.

### `uxp_bridge_unavailable`

This is a deliberate fail-closed result, not an instruction to fall back to COM/ExtendScript.
Restore compatible companion readiness, then reconcile/continue the original Guard workflow as
appropriate.

### MCP request timeout

A host may impose its own timeout on an MCP request. Long Guard work can return a durable `job_id`;
continue the same job with the supported poll/status/resume path instead of replaying the mutation.

A client-side timeout does not prove that Photoshop did not execute the operation.

### Debug logging

Set `LOG_LEVEL=0` for detailed local logs:

```json
{
  "env": {
    "LOG_LEVEL": "0"
  }
}
```

## 8. Usage examples

Natural-language examples for the semantic catalog:

- “Create a 1920×1080 document, add a background layer and centered text.”
- “Open this image, adjust contrast, sharpen it and export a JPEG.”
- “Set the active layer to Multiply at 80% opacity.”
- “Select this region and create a layer mask.”
- “Ping Photoshop and inspect capabilities/state before editing.”

For guarded digital painting, use the runtime workflow in
[`digital-painting-agent-skill.md`](digital-painting-agent-skill.md), not generic examples as a
painting recipe.
