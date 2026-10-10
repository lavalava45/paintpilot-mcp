# Guard / MCP public contract audit

## What the automatic gate actually verifies

Run after building the local Photoshop MCP server:

```powershell
npm run build:server
npm run verify:guard-public-contract
```

The second command is part of `verify:canonical` immediately after the build.
It starts a **fresh, separate MCP child** in Guard-required mode, requests
`tools/list`, checks every published input schema recursively for self-contradictions,
and verifies critical model-expressible inputs and ownership-schema parity.
It never writes to Photoshop. It also runs two negative controls: deleting
`subject_kind` and introducing an unexpressible field demanded by Guard must
both fail the audit.

The audit reports:

- `schema_fingerprint`: SHA-256 of normalized published tool input schemas.
  Changes to descriptions, defaults and ordering of object properties do not
  change the fingerprint; structural changes do.
- `checked_model_paths`: explicit paths that are essential to Guard painting,
  recovery, ownership, geometry, lighting, camera and review.
- `permissive_untyped_next_pass_tools`: `status` and `lint_next_pass`
  publish intentionally permissive object wrappers to conserve connector
  schema size. The Guard compiler validates their payloads. These wrappers
  are not false schema mismatches merely because the child keys are omitted.

To check a real Guard lint/rejection diagnostic for **additional mandatory
fields not present in the hardcoded critical-path list**, save the
read-only diagnostic JSON and run:

```powershell
node scripts/dev/audit-guard-public-contract.mjs --diagnostics path\to\guard-lint.json
```

The audit normalizes `objects[0]` to `objects[]` and tests
`violations[].details.path` and `details.required_fields` against the
**published** `photoshop_guard_cycle_auto` schema. A field required by Guard
but rejected by the public schema is a release-blocking error. Diagnostic
files must be genuine Guard outputs rather than invented execution evidence.

## What cannot be proven by one tools/list snapshot

The local test proves only the **new child** is internally consistent. COS may
still be running an **older plugin child**, and ChatGPT may still use an
**older cached connector action signature**. Each is a separate surface:

1. Source TypeScript and tests.
2. Built `dist/` child, queried by the audit.
3. Installed COS plugin child, queried after plugin-only restart.
4. ChatGPT's actually published tool-action schema after connector Refresh.

For deployment acceptance verify the installed COS child after its own Restart,
then refresh the ChatGPT connector and compare its actual exposed
`photoshop_guard_cycle_auto` signature to the critical fields and the
fingerprint/snapshot from the newly built child. In particular,
`next_pass.scene_ownership_plan.objects[].subject_kind` must be permitted and
support `person`. Do **not** claim deployment complete based only on the
local audit. Do not bypass Guard if the host signature remains stale.

## Whole-pipeline test matrix

The source-side checks are necessary but not sufficient:

| Boundary | Check | Failure means |
| --- | --- | --- |
| Canonical schema -> each tool registry entry | Object schema parity and critical paths | A Guard-required field cannot be expressed |
| MCP `tools/list` -> Guard-required policy | Recursive self-consistency, bounds, enum/required and raw-mutation gate | Impossible request or unsafe bypass |
| Guard semantic compiler -> validator | Unit/fixture scenarios for simple, compound, background, geometry, camera, lighting, owners, brush and recovery | A legal request is rejected, or an illegal request accepted |
| Built MCP child -> installed COS child | Restart/plugin catalog freshness and schema fingerprint | Old process still active |
| COS catalog -> ChatGPT tool actions | Refresh and compare the actual published signature | Host-side stale cache; fixing TypeScript alone does not help |
| Guard lint -> Photoshop mutation | No-mutation preflight, then a disposable-document acceptance pass with pixel/layer evidence | Contracts compile but fail during real execution |

To cover **new conditional requirements** systematically, add one scenario to
the Guard regression tests and capture the corresponding read-only lint
violation. Unlike structural introspection, conditional rules cannot be
inferred exhaustively from a JSON schema (for example, a support-plane
constraint is required only in a coherent-3D owner with the relevant
binding). Keep that distinction explicit. Live pixel tests require an
authorized disposable test document and must not run in the schema audit.

## Release gate

A release is not ready while any of these is true:

- Compiler demands a field forbidden by the published schema.
- Internal schema or externally exposed enum/required constraints conflict.
- Canonical local tests or representative semantic-lint fixtures regress.
- Built/installed/host catalogs disagree after refresh.
- A real guarded mutation cannot complete its required review and recovery
  without unsafe replay.

Keep the full unfiltered test results, including historical fixture failures,
separate from the schema gate; a green `tools/list` audit is not a claim that
the complete artistic or regression suite passed.
