# COS / Photoshop Guard MCP schema synchronization

## The failure mode

Guard can require fields that an older ChatGPT connector action schema does not
allow. For example, `next_pass.scene_ownership_plan.objects[].subject_kind`
was already accepted by the live PaintPilot executor while the ChatGPT
`photoshop_guard_cycle_auto` signature still omitted it. This is a *catalog
freshness* problem, not permission to skip Guard or edit Photoshop directly.

There are four independently cached surfaces:

1. **Source**: `src/tools/guard-tools.ts` plus canonical schemas in `src/core/`.
2. **Built MCP child**: `dist/` loaded when the Node process starts.
3. **COS Plugins catalog**: populated by the child's `tools/list` after restart.
4. **ChatGPT connector actions**: published schema refreshed from COS.

Editing TypeScript alone updates none of the latter three. Refreshing ChatGPT
alone updates only the fourth and cannot reload Node code.

## Safe rollout (no Photoshop document mutation)

1. Finish editing and run targeted schema tests, `npx tsc --noEmit`, and
   `npm run build:server` from the PaintPilot repository.
2. Run `node scripts/test-embedded-guard-mcp.mjs`. It checks the actual
   `tools/list` of a newly launched MCP child, including fields previously
   unexpressible to Guard. The test must not paint a document.
3. In COS **Plugins > Digital Painting Edition**, use **Restart** for that
   plugin entry. Do not restart Photoshop, UXP or the whole COS application.
4. In ChatGPT **Settings > Plugins > Chat On Steroids Plugins**, use
   **Refresh**. COS **Automatic plugin refresh**, when enabled, may do this
   through the supported connector UI after an upstream catalog change.
5. Verify the *ChatGPT-published* `photoshop_guard_cycle_auto` action exposes
   `next_pass.scene_ownership_plan.objects[].subject_kind`,
   `next_pass.scene_camera_imaging_model`, `next_pass.imaging_preflight`,
   `next_pass.change_domains`, `next_pass.distribution_intent`, and
   `next_pass.edges`, `previous_observation.edge_observations`, and
   `painting_intent.deferred_from_operation_id`. Verify
   `photoshop_guard_keep_logical_layer.scene_ownership_plan.objects[]` also
   exposes `subject_kind`; `photoshop_guard_set_priorities.problems[]` exposes
   `depends_on_problem_ids`; and `photoshop_guard_art_director.directive`
   accepts `refinement_check.material_response` on successful refinement.
   A newly started process or passing local tests
   **alone does not prove** that the ChatGPT connector was refreshed.

If a previously opened chat still shows old signatures after Refresh, reload
that conversation or start a fresh chat and recheck its exposed tool schema.
Never bypass Guard to continue an artwork while its public schema conflicts.

## Verification scope and remaining regression-suite debt (2026-10-09)

The built MCP child passes `scripts/test-embedded-guard-mcp.mjs`: 38 published
tools, 15 Guard tools, all added public-field assertions, budget PASS, and no
Photoshop mutation. `tests/embedded-guard.test.ts` passes 102/102, and the
focused EdgeIntent compact-cycle tests pass 2/2. TypeScript compilation passes.

This does **not** mean the entire project test suite is green:
`tests/compact-contract-regressions.test.ts` remains 69/100 after repairing
the shared legacy `subject_kind` fixture. The 31 failures are *not* a reason to
loosen live Guard checks. The audit grouped them as approximately 20
geometry-binding/owner-continuation behavior conflicts to investigate, 10 old
fixtures bypassing newer scene ownership/component or camera/blur preflight
requirements, and 1 missing `cycle_latency` telemetry expectation on a
successful PaintingIntent path. This broader functional test debt is distinct
from the verified public-schema impossibilities fixed in this task. It is
intentionally not represented as resolved or hidden behind a green summary.

Finally, passing local `tools/list` does **not** refresh a previously cached
ChatGPT action schema. COS's own desktop controls intentionally exclude the
COS window from external semantic automation. The live plugin child and the
ChatGPT connector must still undergo the supported in-app Restart/Refresh
steps before declaring the user's existing chat unblocked.

## Regression safeguards

- Shared ownership schema: `sceneOwnershipPlanSchema()` in
  `src/core/scene-ownership-plan.ts`; do not reintroduce hand-written copies.
- Camera and imaging preflight: canonical schemas in their core modules.
- `tests/scene-ownership-plan.test.ts`, camera/imaging tests, and
  `scripts/test-embedded-guard-mcp.mjs` exercise both semantic acceptance and
  externally published fields. Extend these checks whenever Guard adds a
  new required model-facing input.
