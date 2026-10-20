# PaintPilot 1.8.0-preview.1 — Developer Preview (draft release notes)

> **Not yet published or tagged.** Final asset checksums and
> public-install result will be filled in only after the final candidate is
> frozen and its distributed artifact is tested. This is a **Developer Preview**,
> not a qualified PaintPilot Beta or a guarantee of unattended finished art.

## What is included

- Photoshop MCP for Windows with **135 native tools**, including **16 public
  Guard tools**, and **5 MCP prompt templates**.
- **Painting Mode** with the `simple_graphic` and experimental
  `nontrivial_painting` profiles. The embedded Guard manages bounded painting
  passes, document and layer identity, visual checkpoints, Undo/recovery and
  uncertain-operation handling.
- **Photoshop Tools** for direct, individual Photoshop operations. Direct mode
  does not automatically create an artistic plan or journal its edits as a
  Guard-managed painting session.
- Photoshop UXP Bridge for Photoshop-side operations, bridge readiness checks
  and native result verification.

## Scope and current evidence

- **Windows 10/11 only.** Primarily tested with Photoshop 2026 and a local
  stdio MCP client on Windows. No macOS/Linux or other Photoshop-version
  compatibility guarantee is made.
- `verify:canonical` passed on 2026-10-20: **2422/2422 acceptance tests** in
  **223 files**. This is automated contract validation, not a measurement of
  finished-image quality.
- A disposable Photoshop create/layer/pixel/save/close/reopen smoke was
  previously recorded. The user independently reports completing a layered
  fairy-tale forest cottage and accepted it as the one-image Developer Preview
  art trial on 2026-10-20. The exact PSD save/reopen and independent visual
  quality of **that cottage** were not separately audited here.
- On 2026-10-20 the installed MCP build matched the checkout, and the UXP
  Bridge was connected at revision
  `compact-v2-20261019-owner-binding-v20`. A separate clean checkout passed
  `pnpm install --frozen-lockfile`, `npm run build:server`, `verify:pack` and
  offline deployment health. Public release-asset installation remains open.
- The six-scene independent qualification, stronger autonomous quality claims,
  and full restart/recovery drills are **future Beta gates**.

## Installation (both PaintPilot modes)

1. Extract `paintpilot-windows-1.8.0-preview.1.zip` to a stable Windows
   directory and follow [RELEASE-INSTALL.md](RELEASE-INSTALL.md).
   Runtime dependencies and compiled JavaScript are already included.
2. Load `server/uxp-plugin/manifest.json` using Adobe UXP Developer Tool and
   start Photoshop.
3. For **Painting Mode**, connect the MCP client to
   **`server/dist/painting-mode.js`**. For **Photoshop Tools**, connect to
   **`server/dist/photoshop-tools.js`**. Both share one UXP companion.
4. Reconnect the selected MCP server, then verify that the MCP/UXP versions
   agree. For Painting Mode choose `simple_graphic` initially.

Alternatively, install the GitHub **source** release/tag and build using
`pnpm install --frozen-lockfile` and `npm run build:server` as described in
[INSTALL.md](../INSTALL.md).

**Packaging distinction:** the main Windows ZIP includes **both** PaintPilot
product modes. The optional `photoshop-mcp-digital-painting-1.8.0-preview.1.mcpb`
uses `server/dist/photoshop-tools.js` and defaults to **direct Photoshop
Tools** in MCPB-compatible hosts. Installing an MCPB does not constitute
Painting Mode live acceptance. Release labeling preserves the distinction.

## Known limitations

- The `nontrivial_painting` profile is experimental. Its extra geometry,
  brush, construction and artistic-review checks can repeatedly block
  otherwise plausible work. It is not a higher-quality rendering switch.
- `simple_graphic` is the recommended starting point, not a guarantee of
  accurate, autonomous or fully finished artwork. Both profiles retain Guard
  safety and evidence requirements.
- A client **Stop** button is not verified to cancel an already-issued
  Photoshop operation. PaintPilot's own stop/recovery mechanisms are separate;
  uncertain execution must be reconciled rather than blindly retried.
- Photoshop may not provide reliable readback of a selected **named brush
  preset**. Native tip settings and generic brush fallback can sometimes be
  verified, but an unverified preset name is not treated as proof.
- Brush-feature coverage, including Mixer Brush, segmented dynamics and
  `SINGLE_HISTORY` timeout behavior, remains conditional on the specific
  operation and verified Photoshop host behavior. There is no blanket
  claim of arbitrary brush parity.
- Camera/depth-of-field blur requires an accepted scene geometry/camera
  binding. A new explicit `painterly_softening` contract allows **only bounded
  local Gaussian glow** (0.1–24 px) on a unique existing transparent
  `optical-effect` owner, with native Smart Filter/Undo protection and
  exact-image review. This is not permission to defocus opaque scene geometry.
  The new route still requires a fresh MCP load and live acceptance (RH-05).
- Scene geometry/camera data is not registered by including the word
  "register" in a save description. To register without changing pixels,
  explicitly supply `next_pass.scene_geometry_model` on an exact-frame PSD
  save, then `next_pass.scene_camera_imaging_model` on a subsequent PSD save
  bound to the durable geometry revision. Read back the Guard models after
  each completed checkpoint; ordinary successful PSD exports provide no
  model authority. This workflow has offline contract validation only.
- Direct Photoshop Tools operations are intentionally distinct from the
  guarded artistic session. A direct edit to the same PSD is not automatically
  incorporated into Painting Mode's journal.

## Before publishing

- Freeze the independent PaintPilot version `1.8.0-preview.1` and planned tag
  `paintpilot-v1.8.0-preview.1`; avoid confusing inherited historical `v1.7.*`
  Git tags with PaintPilot releases.
- Build the **versioned** Windows ZIP (both modes) and optional MCPB from the
  reviewed commit, record their SHA-256 values, and verify the actual archive
  entry points, licenses and UXP files.
- Validate installation and a disposable guarded Photoshop smoke **using
  exactly the distributed files**, not the development checkout.
- Publish the reviewed branch commit/tag and GitHub Release only after those
  gates are green. Keep the six-scene Beta qualification separate.
