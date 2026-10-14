# Deployment health

PaintPilot source, compiled `dist`, the running CoS MCP child and the loaded Photoshop
UXP companion are separate states. A CoS restart runs existing JavaScript; it does not
compile TypeScript. ChatGPT Plugins Refresh updates exposed metadata, not these processes.

## Activation procedure

1. Finish the coordinated source edits. Run `npm run build:server`.
2. At an agreed artist pause, use CoS → Plugins → this Photoshop MCP plugin → Restart.
3. Reload only Photoshop MCP UXP Bridge in UXP Developer Tool when its code changed.
   Use Unload → Load for manifest changes. The initial deployment-marker update needs one reload.
4. Run `npm run deployment:health`. Continue only after it reports `status: "current"`.
5. If native painting code changed, separately verify a bounded pass on a disposable document
   when authorized. A health match proves activation, not artistic or native-pixel correctness.

Build/check commands do not restart any application or paint. Never restart a component
during an uncertain/dispatched operation merely to activate code; preserve its original journal
and reconcile it through Guard. No automatic replay is part of deployment.

## What the check proves

The successful build writes `dist/paintpilot-build.json` with server source/config/lockfile
fingerprints, output fingerprints, the expected bridge revision and the UXP bundle fingerprint.
The generated `uxp-plugin/deployment-build.js` carries the UXP fingerprint. Both processes
capture their build identity once when loading; replacing files on disk does not relabel them.
This catches changes without a revision bump, as well as named revision mismatches.

`build:server` compiles into an isolated directory, verifies that sources did not change during
compilation and publishes the candidate only on success. Concurrent builds are serialized by a
checkout-local lock; an interrupted lock reports its path and must be checked against its owner PID.
Failed compilation leaves the previous `dist` intact. An incomplete build, edited outputs, missing
manifest or source/dist mismatch prevents the next production CLI startup with a concrete build action.
Source-free packaged installations validate their compiled manifest without requiring `src`.

The local check reads one `/health` response from the already running bridge; it does not spawn
a replacement MCP server and mistake that process for CoS. The endpoint supplies the real MCP
PID/build identity and the last UXP build announcement. A missing/disconnected/foreign runtime
is unknown or requires action, never evidence of a successful update.

```powershell
npm run deployment:health
npm run deployment:health -- --offline
npm run deployment:health -- --bridge-url http://127.0.0.1:38453/health
```

The default port is `PHOTOSHOP_UXP_BRIDGE_PORT` or 38452. If CoS uses another bridge endpoint,
pass that exact endpoint; checking one endpoint does not certify other running instances.
Offline exit code 0 confirms source/build consistency only; running MCP/UXP remain unverified.

Existing `photoshop_guard_capabilities` accepts `{ "deployment_health": true }` for the same
compact, explicit check. Refresh ChatGPT plugin metadata if that new argument is not exposed.
Ordinary capabilities publish the immutable running build identity without rereading all sources.
Do not insert deployment checks before every painting pass.
