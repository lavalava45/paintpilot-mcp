import { PHOTOSHOP_DRAWING_ROUTE } from '../host-guidance.js';
import { DEPICTION_DETAIL_GUIDANCE } from '../../core/depiction-detail.js';
import {
  readChoiceArg as argEnum,
  readIntegerArg as argInt,
  readTextArg as argString,
  makeGuideResult as userPrompt,
  type PhotoshopPromptTemplate,
} from '../guide-contract.js';

const FINISH_LEVELS = ['sketch', 'study', 'polished'] as const;
const BUDGET_MODES = ['soft', 'hard'] as const;

export const digitalPaintingControlTemplate: PhotoshopPromptTemplate = {
  name: 'ps.digital_painting_control',
  description:
    'Guide Photoshop painting through multiscale checks, rollback and state-based completion.',
  arguments: [
    {
      name: 'subject',
      description: 'What to draw or paint. Required.',
      required: true,
    },
    {
      name: 'style',
      description: 'Optional style: anime, ink, painterly, charcoal, comic.',
      required: false,
    },
    {
      name: 'finish_level',
      description: 'Target finish level: sketch, study, or polished. Default: study.',
      required: false,
    },
    {
      name: 'constraints',
      description: 'Constraints: monochrome, layers, canvas, required features.',
      required: false,
    },
    {
      name: 'preferred_brushes',
      description:
        'Preferred pack/presets; not all are mandatory.',
      required: false,
    },
    {
      name: 'required_brushes',
      description:
        'Required presets: use meaningfully; report missing, never substitute.',
      required: false,
    },
    {
      name: 'stroke_budget',
      description: 'Stroke count; soft default.',
      required: false,
    },
    {
      name: 'budget_mode',
      description: 'soft (default) or hard cap.',
      required: false,
    },
  ],
  handler: (args) => {
    const subject = argString(args, 'subject', 'unspecified subject');
    const style = argString(args, 'style', 'unspecified style');
    const finishLevel = argEnum(args, 'finish_level', FINISH_LEVELS, 'study');
    const constraints = argString(args, 'constraints', 'none stated');
    const preferredBrushes = argString(args, 'preferred_brushes', 'none stated');
    const requiredBrushes = argString(args, 'required_brushes', 'none stated');
    const strokeBudget = Math.max(0, argInt(args, 'stroke_budget', 0));
    const budgetMode = argEnum(args, 'budget_mode', BUDGET_MODES, 'soft');

    const budgetText =
      strokeBudget > 0
        ? budgetMode === 'hard'
          ? `Hard stroke cap: ${strokeBudget}; simplify to fit.`
          : `Soft stroke budget: ~${strokeBudget} for scope, not completion. Finish required corrections.`
        : `No stroke cap; choose marks by visual need.`;

    const finishText =
      finishLevel === 'sketch'
        ? 'Sketch: readable silhouette/proportion/gesture and main values/colors; omit optional micro-detail.'
        : finishLevel === 'polished'
          ? 'Polished: resolve focal detail, edges/lines, accents and cleanup.'
          : 'Study: resolve forms/depth/focal detail/values/colors and cleanup; avoid micro-detail chasing.';

    const text = [
      PHOTOSHOP_DRAWING_ROUTE,
      `Goal: Paint "${subject}" in Photoshop via short preview-driven passes; never run blind stroke programs.`,
      `Style: ${style}`,
      `Finish: ${finishLevel}`,
      `Constraints: ${constraints}`,
      `Preferred brush source/presets: ${preferredBrushes}`,
      `Required brush presets: ${requiredBrushes}`,
      budgetText,
      finishText,
      ``,
      `HARD EXECUTION INVARIANTS:`,
      `- PaintPilot Painting Mode is sticky: MCP client → dist/painting-mode.js → embedded Guard → UXP. No retired external controller recovery. Other image-generation modes require an explicit user-requested change.`,
      `- Pin document.id as document_id; invalid/closed ids fail closed. Never silently retarget tabs.`,
      ``,
      `- CYCLE: next_pass={request_key,problem_id?,document_id,goal,region/protection,action_class?,actions}. request_key=idempotent; problem_id=stable. Send previous_operation_id + actual previous_observation + next_pass once; omit next_pass to close. Guard acknowledges the exact stored receipt internally. After save, re-review a closed frame with review_operation_id + previous_observation.critic_review (optional next_pass), never previous_operation_id or historical frames.`,
      `GUARD / CONTROLLER:`,
      `- OPEN BRIEF: compare 4–6 candidates (at least four) from four problem families; reject duplicates/atmosphere-only premises. Choose subject+setting+action+spatial problem; ease never decides alone. Never browse or consult prior runs/lists or cross-run artistic memory. One-time choice: no Guard gate and no subject-selection repeat inside the paint loop.`,
      `- Hierarchy: COMPOSITION → SHAPE → VALUE → FORM → EDGE → MATERIAL → DETAIL. Do not advance while a lower-frequency must-fix remains.`,
      `- RECOGNITION BLOCK-IN: 3–7 discriminative cues (importance is not proportional to size) + style cue; rough the whole subject across passes, NOT one pass. Fix the largest barrier until overview reads unaided.`,
      `- Choose REFERENCE REPRODUCTION, FREE COMPOSITION, or STYLIZED PAINTING; free composition establishes composition/light/depth/palette before detail.`,
      `- Derive a minimal STYLE CONTRACT; judge USER BRIEF + STRUCTURAL READABILITY + STYLE CONTRACT. Style never excuses broken tangencies/occlusion.`,
      `- ART RUN: bind one immutable processes/<subject>-process/<run>/ before paint; keep painting-state.json, frames/, checkpoints/, final/ there. accepted_frame != current_frame.`,
      `- EXECUTION BRIEF: preserve original_brief verbatim. Map aspirational style/finish to proven Photoshop methods and short SINGLE-OWNER passes; never invent photorealism, watercolor brushes or guaranteed detail, or omit required subjects. installed-brush-preset executes paint_strokes; region-block-in executes paint_regions. A missing project art_run requires a separate setup action before mutation, not a style warning.`,
      `- PASS LIMITS: one VisualMicroPlan = one rollback unit, <=1 new layer, 1–4 contiguous compatible mutations; preparation first. Limits come from actions; a pass is not an artistic stage.`,
      `- SUBJECT MILESTONE: nontrivial_painting starts with requested subject/recognition cues. In simple_graphic only, the first execution may be ONE independent paper/sky/canvas field; then establish subject/setting cues in bounded owner passes before polishing. Never call the initial sky field complete, or combine sky, cottages, trees, canal and boats as one owner. Director optional; empty-canvas value_check omitted or pending/observed=false.`,
      `- EDITABLE COMPONENTS: predeclare scene_ownership_plan objects/units. ${DEPICTION_DETAIL_GUIDANCE}`,
      `- NO SOURCE DURING ART: use method selection.execution_contract.allowed_commands, input_schema and next_pass skeleton. If missing, retrieve exact public schema once via Guard capabilities(tool_names); no invented aliases or src/tests/dist inspection. Apply all field_correction_packet items together; Guard derives technical pins, not art decisions. If blocked, report cause. Closed target: reconcile(id,outcome=abandoned,document_closed_confirmed=true,reason).`,
      `- LAYER SEPARATION CHECK: substantial independent object/material/light/plane uses create-new/temporary-hypothesis, never layer per stroke. protected_layer_ids protects accepted ids; protected_regions is descriptive only. Replacement needs replace_protected_layer_ids.`,
      `- COMMENTARY: technical=developer/debug telemetry only; artistic=artist-facing visual reasoning plus practical Photoshop craft/settings; mixed=artistic first + compact separated debug note. In ru use natural, good Russian for concise tutorial rationale; never expose private chain-of-thought. Sticky режим техника|художник|вместе + detail. Use presentation_context.language (ru/en/es/pt-BR/de/fr; auto=conversation language) for all user-visible text, including root first-person goal; no fixed prefix. State intent/change, not completion. Guard reuses artistic_commentary; no duplication.`,
      `- HOT LOOP: problem → scale/region → action class → visual intent → impact class → method → registered runtime tool/fallback → hypothesis → mutate → inspect → observed_change + target_resolved + regressions + uncertainty → accept/correct/rollback. Change failed strategies; never invent APIs. Guard expands observations.`,
      `- SCENE-RELATIONSHIP AUDIT: global/shape/form/stage/final check support/contact, gaps, cast shadows, occlusion/depth, tangencies, silhouette/proportion; detail gets a quick regression scan. Local success never excuses structural defects.`,
      `- Action classes: ADD, REFINE, REPLACE, ERASE, ROLLBACK, LEAVE. ADD is not default; never bury regressions. Inspect/replan after rollback unless user said stop/wait or DoD passes.`,
      ``,
      `BRUSH PREFLIGHT / ROLE MAP:`,
      `- Non-trivial brush pass: bounded inventory → role map → effective settings → selective probe → completed brush_preflight. Regions/fills need none.`,
      `- photoshop_select_brush_preset: fresh authoritative readback required. At preset_verification.source=unavailable STOP named retries. Optional: NEW hard-brush-line Guard pass, photoshop_set_brush → native size/hardness/spacing readback → photoshop_paint_strokes, no preset selection. A required exact preset blocks; never infer identity.`,
      `- Brush role map: Guard compiles paint_strategy (material → intent → role → preset → pressure); next_pass.brush_role disambiguates. No raw bypass; pressure is simulated in stroke.`,
      ``,
      `MARK / STRUCTURE GUARDS:`,
      `- Structure before texture: inspect thumbnail first. paint_regions is early scaffold; later only bounded REPLACE/ERASE with exact layer and clip_bounds, never flat ADD block-in.`,
      `- Match brush scale/topology to missing information: 2D patches for broad coverage, wide form/flow strokes, narrow linear structure. Reject wrong footprints, not primitive categories.`,
      `- Primitive footprint is must-fix in realistic work when circles/scallops/ribbons/regular bands read before the depicted form. Roll back, erase or structurally repaint; do not hide it with weak texture.`,
      `- Respect occlusion/protection across each stroke path. Fix silhouettes with erase/mask/repaint or real background, never flat sampled-color carving.`,
      `- Recover via history/semantic layers. Before risk, anchor history or isolate layer. AUTO may add history steps; SINGLE_HISTORY trades timeout risk for one undo.`,
      `- CORRECTION ACCEPTANCE GATE: inspect REPLACE/ERASE/silhouette/background fixes at local and thumbnail scales. Reject seams, corners, halos, value/color jumps, scallops or equal/higher defects.`,
      ``,
      `CONDITIONAL REFERENCE RULES:`,
      `- Keep reference and target separate/pinned; sample as evidence, never default to underlay/paste/trace.`,
      `- Proportion-sensitive work: use landmarks/guides/measure/compare; prefer semantic bounds + local u/v over guessed coordinates.`,
      `- Manufactured/geometric integrity: check axes/taper/symmetry/parallelism/convergence/spacing/silhouette; no invented perfection.`,
      `- Measurements are evidence, not paint; retain the no-tracing default. Photoshop pixels are authoritative.`,
      ``,
      `WORKFLOW / PACING:`,
      `- USER COMMUNICATION: commentary is not Guard bookkeeping. Give artistic updates/blockers; do not manufacture a three-field report after brush/layer preparation/polling. UI evidence is separate from durable receipt.`,
      `- LONG-CALL UX: cycle-auto ~7–10s+ returns durable job_id + semantic progress. Poll the same job with photoshop_guard_job_poll (Core: job-poll); job id is not completion or visual observation.`,
      `- HARD UI FOCUS BARRIER: keep Photoshop backgrounded. Never automatically switch the active Photoshop document or call photoshop_set_active_document without explicit permission. On wrong tab, find tool via photoshop_guard_capabilities(tool_names); activate pinned document_id only with prior permission and args.user_authorized_focus_switch=true (never invent consent); verify photoshop_get_state before paint. Without permission, ask to activate through MCP instead of making the user click the tab. Never unpin document_id or paint on another tab.`,
      `- ATOMIC VISUAL BUNDLE: one visual problem, one semantic region/tightly-coupled set, one action class, one stage/scale, one acceptance question. Otherwise split and preview separately.`,
      `- HARD PREVIEW BARRIER: mutation/bundle → capture → inspect → improvement|neutral|regression before next visual mutation. Job id is not completion; no blind multi-pass chains.`,
      `- PRIMARY PROGRESS METRIC: resolved visual problems, not protocol activity. Resolve only with meaningful change + improvement + accept + target_resolved=yes; accept alone retains pixels, not resolution. trend_signals track negative recurring defects only.`,
      `- HARD VISUAL EXECUTION-EVIDENCE GATE: meaningful|insufficient|unknown; unknown/no-op cannot be improvement. Delta proves execution; compare same-document BEFORE. SHA/delivery proves identity, not art.`,
      `- subtle_local is pre-declared for fine corrections: require the same focus region BEFORE and AFTER; small/local work requires matching focus evidence.`,
      `- WORKFLOW-STALL GATE: after 8 external actions without a meaningful visual change, or 2 visually insufficient passes, another mutation requires a structural executable strategy change. Legacy replan prose never bypasses the gate.`,
      `- HARD VISUAL CADENCE: next canonical cycle = next meaningful visual pass. photoshop_get_state is not required between normal visual passes. Proven systemic failure → one compact diagnostic investigation → causal replan → next visual pass. decision_loop_stall at 90s is advisory, NOT a Guard failure; continue the largest unresolved visual correction unless a safety gate blocks.`,
      `- Art Director plans; Painter uses adaptive cadence and judges brief/style pixels and repairs the main defect. At critic_role.required, switch to WHOLE-SCENE Critic; return previous_observation.critic_review and resume Painter in the same cycle. Exposed/user-authorized Core agents may delegate exact images/brief. No local model; roles are not calibrated authority.`,
      `- PAINTER: local preview/verdict; no global re-plan per stroke; bind directive/task/scope/change_domains.`,
      `- METHOD CHOICE: use selected command, schema and skeleton without extra status. Compound objects: authored constraints/IK; smooth contours: curve=smooth. Painterly: aligned reference or authored form_field/light with clip_exclusions. Rebuild changed rigid parts; retain brief/contact debt and independent layers. No fake references or source reads.`,
      `- EARLY PLANNER RETURN on serious error, global value/composition drift, likeness/main-shape loss or unsafe directive; global edits need task permission.`,
      `- Development capture: Guard archives a monotonic frame after each mutation/tiny bundle in frames/ with same-stem .txt commentary; split different regions/roles/stages.`,
      `- SILENT STALL: silent_stall after 90s with known next required action or pending obligation and no job; read-only churn does not reset it.`,
      `- EDGE CONTROL: boundary hard|firm|soft|lost|broken; edge intent changes method selection/fallback; mutation names method_id; AFTER edge_observations require boundary_id + observed_behavior + target_met.`,
      `- STAGE GATES: VALUE GATE: unobserved never PASS; DETAIL blocked on fail/missing; override/style-N/A needs justification. REFINEMENT GATE: refinement_check pending/fail blocks DETAIL; pass needs meaningful representation_change and resolved form/edge/material/residual_block_in. texture-only never clears debt; style-N/A binds style_contract.`,
      `- Batching only inside one atomic bundle; never combine independent semantic passes or postpone preview/inspection barrier.`,
      `- TRANSACTION: VisualMicroPlan is one intent/region/method/risk, 1–4 contiguous ops, optional BEFORE, mandatory AFTER. subtle_local requires matching >=800px focus. Verdict releases HARD PREVIEW BARRIER.`,
      `- Never auto-retry a VisualMicroPlan mutation error: first inspect reconciliation preview, then correct/rollback/replan.`,
      `- PAIRED PSD CHECKPOINT: checkpoint/stage/recovery PSD → checkpoints/, finals → final/. checkpoint-due tracks mutation risk, not time; save+verify, then resume next planned visual cycle. On uxp_bridge_unavailable query photoshop_get_capabilities once. Never COM/ExtendScript fallback/barrier clearance. No next visual mutation until ready; retry save only.`,
      `- Fresh-composition uses generic infrastructure only, never prior scene geometry/plans or runs as inspiration.`,
      `- After timeout/disconnect/restart/interrupted UI compare original process/document/history/preview with persisted frame; classify completed|not-executed|partial/uncertain, reconcile/recover, never blindly retry.`,
      ``,
      `DEFINITION OF DONE:`,
      `- Composition/subject read at intended scale; forms/proportions, contact/cast shadows and depth/occlusion cohere. Focal features/value/color/edges satisfy finish/style.`,
      `- Applicable measurement evidence is reconciled; cleanup is complete; no must-fix structural/overlap/tangent/readability defect remains; explicit user constraints are satisfied.`,
      `- Stop when additional marks are optional refinement. A soft stroke budget is not a finish line; a hard budget remains a user constraint.`,
    ].join('\n');

    return userPrompt(
      `Digital painting control: ${subject} — ${finishLevel}${style !== 'unspecified style' ? `, ${style}` : ''}.`,
      text
    );
  },
};
