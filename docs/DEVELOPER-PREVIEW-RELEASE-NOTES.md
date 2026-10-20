# PaintPilot — Developer Preview (draft release notes)

> **Not yet published or tagged.** Release version, final asset checksum and
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

- **Windows 10/11 only.** Primarily tested with Photoshop 2026 and the stock
  Chat On Steroids custom Plugins route on Windows. No macOS/Linux or other
  Photoshop-version compatibility guarantee is made.
- `verify:canonical` passed on 2026-10-20: **2408/2408 acceptance tests** in
  **223 files**. This is automated contract validation, not a measurement of
  finished-image quality.
- A disposable Photoshop create/layer/pixel/save/close/reopen smoke was
  previously recorded. The user independently reports completing a layered
  fairy-tale forest cottage and accepted it as the one-image Developer Preview
  art trial on 2026-10-20. The exact PSD save/reopen and independent visual
  quality of **that cottage** were not separately audited here.
- On 2026-10-20 the installed COS MCP build matched the checkout, and the UXP
  Bridge was connected at revision
  `compact-v2-20261019-owner-binding-v20`. A separate clean checkout passed
  `pnpm install --frozen-lockfile`, `npm run build:server`, `verify:pack` and
  offline deployment health. Public release-asset installation remains open.
- The six-scene independent qualification, stronger autonomous quality claims,
  and full restart/recovery drills are **future Beta gates**.

## Installation (guarded COS workflow)

1. Download the **tagged** source or release archive to a stable Windows path
   and follow [INSTALL.md](../INSTALL.md) for exact prerequisites.
2. Run `pnpm install --frozen-lockfile` and `npm run build:server` from the
   extracted repository. Do **not** install an old similarly named upstream
   npm package.
3. Load `uxp-plugin/manifest.json` using Adobe UXP Developer Tool and start
   Photoshop.
4. In Chat On Steroids, configure the custom Photoshop MCP plugin entry to
   launch **`dist/cos-plugin.js`**, not `dist/index.js`. Restart **that plugin**
   after builds or upgrades; reload the UXP companion if its code changed.
5. Confirm `npm run deployment:health` reports `current` for the installed
   MCP/UXP pair before starting a fresh painting. Choose `simple_graphic`
   explicitly for the initial bounded painting trial.

**Packaging distinction:** the `.mcpb` manifest currently launches the generic
`dist/index.js` entry point for compatible generic hosts. It is **not** the
same connection as the validated guarded COS `dist/cos-plugin.js` route.
Installing an MCPB in another host does not constitute COS Painting Mode live
acceptance. Release-asset labeling must preserve this distinction.

## Known limitations

- The `nontrivial_painting` profile is experimental. Its extra geometry,
  brush, construction and artistic-review checks can repeatedly block
  otherwise plausible work. It is not a higher-quality rendering switch.
- `simple_graphic` is the recommended starting point, not a guarantee of
  accurate, autonomous or fully finished artwork. Both profiles retain Guard
  safety and evidence requirements.
- The stock COS **Stop** button is not verified to cancel an already-issued
  Photoshop operation. PaintPilot's own stop/recovery mechanisms are separate;
  uncertain execution must be reconciled rather than blindly retried.
- Photoshop may not provide reliable readback of a selected **named brush
  preset**. Native tip settings and generic brush fallback can sometimes be
  verified, but an unverified preset name is not treated as proof.
- Brush-feature coverage, including Mixer Brush, segmented dynamics and
  `SINGLE_HISTORY` timeout behavior, remains conditional on the specific
  operation and verified Photoshop host behavior. There is no blanket
  claim of arbitrary brush parity.
- Camera-dependent optical blur requires a durable scene geometry/camera
  binding even for an otherwise flat illustration. It is not a generic
  painterly edge-softening fallback; follow an owner-bounded mask/smudge
  route where supported. The exact local firefly-glow fallback remains a
  tracked live-art acceptance item (RH-05).
- Direct Photoshop Tools operations are intentionally distinct from the
  guarded artistic session. A direct edit to the same PSD is not automatically
  incorporated into Painting Mode's journal.

## Before publishing

- Select and synchronize the independent PaintPilot release version with
  package/server/MCPB metadata; avoid confusing inherited historical `v1.7.*`
  Git tags with PaintPilot releases.
- Build the **versioned** release package from the reviewed commit, record its
  SHA-256, and verify the actual archive entry point, licenses and UXP files.
- Validate installation and a disposable guarded Photoshop smoke **using
  exactly the distributed files**, not the development checkout.
- Publish the reviewed branch commit/tag and GitHub Release only after those
  gates are green. Keep the six-scene Beta qualification separate.
