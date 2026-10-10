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
    'Guide arbitrary Photoshop subjects through multiscale visual checks, rollback and state-based completion.',
  arguments: [
    {
      name: 'subject',
      description: 'What to draw or paint. Required.',
      required: true,
    },
    {
      name: 'style',
      description: 'Optional style direction, e.g. anime, ink sketch, painterly, charcoal, comic.',
      required: false,
    },
    {
      name: 'finish_level',
      description: 'Target finish level: sketch, study, or polished. Default: study.',
      required: false,
    },
    {
      name: 'constraints',
      description: 'User constraints: monochrome, layer count, canvas size or required features.',
      required: false,
    },
    {
      name: 'preferred_brushes',
      description:
        'Preferred pack/presets; preference never makes all brushes mandatory.',
      required: false,
    },
    {
      name: 'required_brushes',
      description:
        'Required exact presets: use meaningfully; report missing, never substitute.',
      required: false,
    },
    {
      name: 'stroke_budget',
      description: 'Approximate stroke count; soft default.',
      required: false,
    },
    {
      name: 'budget_mode',
      description: 'soft (default) or hard; hard must not exceed stroke_budget.',
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
          ? `Hard stroke cap: ${strokeBudget}; simplify to fit the user constraint.`
          : `Soft stroke budget: about ${strokeBudget} for scope/batching, not completion. Continue required correction.`
        : `No stroke cap; choose marks by visual need and requested finish.`;

    const finishText =
      finishLevel === 'sketch'
        ? 'Sketch: readable silhouette/proportion/gesture and main values/colors; leave nonessential micro-detail.'
        : finishLevel === 'polished'
          ? 'Polished: resolve focal details, coherent edges/lines, deliberate accents and cleanup.'
          : 'Study: resolve main forms/depth/focal details/values/colors and cleanup, without micro-detail chasing.';

    const text = [
      `Goal: Paint "${subject}" in Photoshop through a short preview-driven control loop; do not execute a long blind stroke program.`,
      `Style: ${style}`,
      `Finish: ${finishLevel}`,
      `Constraints: ${constraints}`,
      `Preferred brush source/presets: ${preferredBrushes}`,
      `Required brush presets: ${requiredBrushes}`,
      budgetText,
      finishText,
      ``,
      `HARD EXECUTION INVARIANTS:`,
      `- Photoshop/COS/MCP is sticky: Chat_On_Steroids_Plugins → dist/cos-plugin.js → embedded Guard. Retired Core/controller is no recovery route. Use image_gen only if the user changes execution mode.`,
      `- Pin document-bound operations with the working document.id as document_id; invalid/closed ids fail closed. Never silently retarget an active tab.`,
      ``,
      `- CYCLE: next_pass={request_key,problem_id?,document_id,goal,region/protection,action_class?,actions}. request_key=idempotent attempt; problem_id=stable problem. Send previous_operation_id + actual previous_observation + next_pass once; omit next_pass to close. Guard acknowledges the exact stored receipt internally.`,
      `GUARD / CONTROLLER:`,
      `- OPEN BRIEF: delegated subject compares 4–6 candidates (at least four) from four problem families this turn; reject duplicates/atmosphere-only premises. Choose subject+setting+action+spatial problem; ease never decides alone. Never browse or consult prior runs/lists or cross-run artistic memory. Selection is a one-time planning choice: no Guard gate and no subject-selection repeat inside the paint loop.`,
      `- Hierarchy: COMPOSITION → SHAPE → VALUE → FORM → EDGE → MATERIAL → DETAIL. Do not advance while a lower-frequency must-fix remains.`,
      `- RECOGNITION BLOCK-IN: derive 3–7 discriminative cues (importance is not proportional to size) + style cue; rough the whole subject across sequential passes. The stage is NOT one pass. Until overview reads unaided, fix the largest barrier.`,
      `- Choose REFERENCE REPRODUCTION, FREE COMPOSITION, or STYLIZED PAINTING; free composition establishes composition/light/depth/palette before detail.`,
      `- Derive a minimal STYLE CONTRACT; judge USER BRIEF + STRUCTURAL READABILITY + STYLE CONTRACT. Style never excuses broken tangencies/occlusion.`,
      `- ART RUN: bind one immutable processes/<subject>-process/<run>/ before paint; keep painting-state.json, frames/, checkpoints/, final/ there. accepted_frame != current_frame.`,
      `- PASS LIMITS: one VisualMicroPlan = one rollback unit, <=1 new layer, 1–4 contiguous compatible mutations; preparation first. Limits come from actions; a pass is not an artistic stage.`,
      `- SUBJECT FIRST: first pixels include requested subject/recognition cues; next bounded owner passes establish setting/path/masses before refinement. No independent sky/fog/gradient first task. Director optional; initial value_check omitted or pending/observed=false on empty canvas.`,
      `- EDITABLE COMPONENTS: predeclare scene_ownership_plan objects/units. Compound containers have independent semantic owners/layers for adjustable parts (bed/blanket/pillow; window/glass/curtain; body/head/eyes). Build/review one component per pass; tiny inseparable accents stay. Plans extend additively; never flatten to evade ownership.`,
      `- NO SOURCE DURING ART: setup/correction/recovery uses public Photoshop/Guard only; never read/import src/tests/dist or schemas via Core/shell, or fabricate evidence. Apply returned corrections once, else report the blocker. Confirmed closed target: reconcile(id,outcome=abandoned,document_closed_confirmed=true,reason), evidence collected internally.`,
      `- LAYER SEPARATION CHECK: substantial independent object/material/light/plane uses create-new/temporary-hypothesis, never layer per stroke. protected_layer_ids protects accepted ids; protected_regions is descriptive only. Replacement needs replace_protected_layer_ids.`,
      `- COMMENTARY: technical=developer/debug telemetry only; artistic=artist-facing visual reasoning plus practical Photoshop craft/settings; mixed=artistic first + compact separated debug note. Sticky режим техника|художник|вместе + detail. Use presentation_context.language (ru=natural Russian). Emit root goal in first person (“Я планирую…”, “Я уточню…”); vary by context, no fixed prefix. State intent/change, not completion. Guard reuses artistic_commentary; no duplicate or hidden chain-of-thought.`,
      `- HOT LOOP: problem → scale/region → action class → visual intent → impact class → method → registered runtime tool/fallback → hypothesis → mutate → inspect → observed_change + target_resolved + regressions + uncertainty → accept/correct/rollback. Change failed strategies; never invent APIs. Guard expands compact observations.`,
      `- SCENE-RELATIONSHIP AUDIT: global/shape/form/stage/final checks support/contact, floating/gaps, cast shadows, occlusion/depth, tangencies/intersections, silhouette/proportion; detail gets a quick regression scan. Local success never excuses equal/higher structural defects.`,
      `- Action classes: ADD, REFINE, REPLACE, ERASE, ROLLBACK, LEAVE. ADD is not default; do not bury a known regression. A successful rollback must still be inspected and replanned unless the user said stop/wait or DoD passes.`,
      ``,
      `BRUSH PREFLIGHT / ROLE MAP:`,
      `- Before first brush-dependent stroke/dab in a non-trivial run, do bounded brush inventory → role map → effective settings → selective probe → completed brush_preflight. Region/fill and unrelated preparation do not require it.`,
      `- photoshop_select_brush_preset returns fresh authoritative effective-settings readback; duplicate only if stale/changed/diagnostic. Guard may insert it from durable brush_preflight; do not repeat the preset.`,
      `- Keep a compact brush role map. Guard compiles paint_strategy (material → intent → role → preset → pressure); optional next_pass.brush_role disambiguates roles. Raw bypass is blocked; simulated pressure must exist in the stroke.`,
      ``,
      `MARK / STRUCTURE GUARDS:`,
      `- Structure before texture: inspect thumbnail first. paint_regions is early scaffold; later only bounded REPLACE/ERASE with exact layer and clip_bounds, never flat ADD block-in.`,
      `- Match brush scale/topology to missing information: 2D patches for broad coverage, wide form/flow strokes, narrow linear structure. Reject wrong footprints, not primitive categories.`,
      `- Primitive footprint is must-fix in realistic work when circles/scallops/ribbons/regular bands read before the depicted form. Roll back, erase or structurally repaint; do not hide it with weak texture.`,
      `- Respect occlusion/protection across each stroke path. Fix silhouettes with erase/mask/repaint or real background, never flat sampled-color carving.`,
      `- NORMAL is the baseline blend; other modes solve specific problems, never conceal structural defects.`,
      `- Recovery uses history and semantic layers. Before risky work set a history anchor or isolated layer. AUTO may make multiple history steps; SINGLE_HISTORY trades timeout risk for one undo step.`,
      `- Normalize mark role/scale/value/chroma/opacity/flow; never blindly K-means [R,G,B,size].`,
      `- CORRECTION ACCEPTANCE GATE: REPLACE/ERASE/silhouette/background repairs need fix/perimeter inspection at local and thumbnail scale. Reject seams, corners, halos, color/value jumps, scallops or equal/higher new defects.`,
      ``,
      `CONDITIONAL REFERENCE RULES:`,
      `- Keep reference and target separate/pinned; sample as evidence, never default to underlay/paste/trace.`,
      `- Proportion-sensitive work: use landmarks/guides/measure/compare; prefer semantic bounds + local u/v over guessed coordinates.`,
      `- Manufactured/geometric integrity: check axes/taper/symmetry/parallelism/convergence/spacing/silhouette; do not impose unsupported perfection.`,
      `- Discrepancy diagnostics are critic evidence, never paint or an optimization target.`,
      `- Reference proportions: marks relative to stable anchor width: value 8–12%, form 2–6%, feature edges 0.5–2%, micro <0.5%. Patches build planes; paths mainly deliberate linear detail.`,
      `- Optional curve fitting/segmentation/discrepancy/quantization/surrogates provide evidence/proposals/constraints. Keep the no-tracing default; Photoshop is pixel ground truth.`,
      ``,
      `WORKFLOW / PACING:`,
      `- USER COMMUNICATION: commentary is not Guard bookkeeping. Give concise artistic updates/blockers; do not manufacture a three-field report after brush/layer preparation/polling. UI evidence is separate from the durable receipt.`,
      `- LONG-CALL UX: cycle-auto ~7–10s+ work returns durable job_id + semantic progress. Poll the same job with photoshop_guard_job_poll (Core: job-poll); a job id is not completion and does not replace the eventual visual observation.`,
      `- HARD UI FOCUS BARRIER: keep Photoshop backgrounded. Never automatically switch the active Photoshop document/tab or use photoshop_set_active_document without explicit permission; pin document_id.`,
      `- ATOMIC VISUAL BUNDLE: one visual problem, one semantic region/tightly-coupled set, one action class, one stage/scale, one acceptance question. Otherwise split and preview separately.`,
      `- HARD PREVIEW BARRIER: completed mutation/bundle → capture → inspect → improvement|neutral|regression before another visual mutation. A job id is not completion; never queue blind multi-pass chains.`,
      `- PRIMARY PROGRESS METRIC: resolved visual problems, not protocol activity. Resolve only after meaningful change + improvement + accept + target_resolved=yes; accept alone retains pixels, not resolution. trend_signals are negative recurring defects only.`,
      `- HARD VISUAL EXECUTION-EVIDENCE GATE: meaningful|insufficient|unknown; unknown/no-op cannot be improvement. Delta proves execution; comparisons need comparable same-document BEFORE. SHA/delivery is identity, not art.`,
      `- subtle_local is pre-declared for fine corrections: require the same focus region BEFORE and AFTER; small/local work requires matching focus evidence.`,
      `- WORKFLOW-STALL GATE: after 8 external actions without a meaningful visual change, or 2 visually insufficient passes, another mutation requires a structural executable strategy change. Legacy replan prose never bypasses the gate.`,
      `- HARD VISUAL CADENCE: next canonical cycle = next meaningful visual pass. photoshop_get_state is not required between normal visual passes. Proven systemic failure → one compact diagnostic investigation → causal replan → next visual pass. decision_loop_stall at 90s is advisory.`,
      `- Art Director plans; Painter uses adaptive cadence and judges brief/style pixels and repairs the main defect. At critic_role.required, switch to WHOLE-SCENE Critic; return previous_observation.critic_review and resume Painter in the same cycle. Exposed/user-authorized Core agents may delegate exact images/brief. No local model; roles are not calibrated authority.`,
      `- PAINTER: local preview/verdict; no global re-plan per stroke; bind directive/task/scope/change_domains.`,
      `- METHOD CHOICE: compounds use executable constraints/proportion_checks or IK authored lengths/anchors; smooth contours use curve=smooth. One-owner painterly uses aligned JPEG or authored form_field/light/colors with clip_exclusions. Shared rigid pose/revisions rebuild changed parts; never copy IK coordinates. Saves preserve brief/form/contact debt. Batch capabilities.tool_names; no fake references, source reads or flattened compounds.`,
      `- EARLY PLANNER RETURN on serious error, global value/composition drift, likeness/main-shape loss or unsafe directive; global edits need task permission.`,
      `- SILENT-STALL: silent_stall after ~90s with known next action/pending obligation and no job; read-only churn does not reset it.`,
      `- Development capture: Guard archives a monotonic frame after each mutation/tiny bundle in frames/ with same-stem .txt commentary; split different regions/roles/stages.`,
      `- LAYER ROLLBACK: one layer = one reversible hypothesis; every VisualMicroPlan declares layer_separation_check; reuse/discard/merge ids explicitly.`,
      `- EDGE CONTROL: boundary hard|firm|soft|lost|broken; edge intent changes method selection/fallback; mutation names method_id; AFTER edge_observations require boundary_id + observed_behavior + target_met.`,
      `- STAGE GATES: VALUE GATE: unobserved never PASS; DETAIL blocked on fail/missing; override/style-N/A needs justification. REFINEMENT GATE: refinement_check pending/fail blocks DETAIL; pass needs meaningful representation_change and resolved form/edge/material/residual_block_in. texture-only never clears debt; style-N/A binds style_contract.`,
      `- Batching only inside one atomic bundle; never combine independent semantic passes or postpone preview/inspection barrier.`,
      `- TRANSACTION: VisualMicroPlan is one intent/region/method/risk, 1–4 contiguous ops, optional BEFORE, mandatory AFTER. subtle_local requires matching >=800px focus. Verdict releases HARD PREVIEW BARRIER.`,
      `- Never auto-retry a VisualMicroPlan mutation error: capture/classify the reconciliation preview first, then correct/rollback/replan.`,
      `- PAIRED PSD CHECKPOINT: checkpoint/stage/recovery PSD → checkpoints/, finals → final/. checkpoint-due tracks mutation risk, not time; save+verify, then resume next planned visual cycle. On uxp_bridge_unavailable query photoshop_get_capabilities once. Never COM/ExtendScript fallback/barrier clearance. No next visual mutation until ready; retry save only.`,
      `- Fresh-composition work reuses generic infrastructure only, never prior scene geometry/plans or prior runs as subject inspiration.`,
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
