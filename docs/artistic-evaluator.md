# Pixel review in the painting chat

Current source, 2026-10-10: ChatGPT stays the painting host and explicitly switches into a
Critic role at bounded checkpoints. Ordinary painting does not create, prepare or call a local artistic
model. `photoshop_guard_review_image` and inline cycle-auto delivery return the actual registered
images plus `artistic_review`, a direct request to the host in the SAME chat. It is guidance awaiting
an observation, never a server-generated judgment or independent approval.

## ChatGPT Critic checkpoints

`implementation_revision=2026-10-10-chat-critic-role`. The default reviewer is the SAME ChatGPT chat,
with an explicit Painter → Critic → Painter role switch. Critic judges the whole exact AFTER against
the original brief, setting aside the Painter's explanations and tool success. BEFORE supports change
comparison. A restrained background may serve the requested style; merely filling a wall does not
establish convincing space or light. This role is implemented in the normal image-delivery/continuation
path, not as a separate inference service.

For nontrivial paintings, the first checkpoint is after three completed visual passes (or the first
result outside GLOBAL_BLOCK_IN). Further checkpoints occur at a stage change, after six more visual
passes, and at final review. Ordinary component passes retain their short existing observation.
`artistic_review.critic_role` supplies the exact request id and five existing visual criteria:
brief_fidelity, form_proportions, light_material, composition_context, contact_and_protection.
Editable-part ownership remains checked through its existing evidence, separately from pixels.

At a due checkpoint, include this additional object in the same cycle_auto's previous_observation:

```json
{
  "critic_review": {
    "request_id": "<current artistic_review.critic_role.request_id>",
    "reviewer": "same-chat-role",
    "criteria": {
      "brief_fidelity": "pass",
      "form_proportions": "pass",
      "light_material": "unknown",
      "composition_context": "fail",
      "contact_and_protection": "pass"
    },
    "findings": [{
      "criterion": "composition_context",
      "visible": "The room is still a flat field behind the subject.",
      "next_change": "Build the main lit and shadow planes linking room and subject."
    }]
  }
}
```

These are illustrative judgments, never defaults to copy without inspecting pixels. Every fail needs
one concrete visible deficit and one construction change; unknown is not a pass. Guard binds the report
to the operation, exact frame, original brief and stable document incarnation. A missing checkpoint
returns the complete minimal response template, asking for the already-delivered image; no source
reading, recapture or separate closure call is needed. Findings survive local target success and PSD/JPEG
saves. Unknown rereview preserves prior findings; only an explicit pass on that criterion clears them.
Final painting_completion cannot claim pass for Critic's failed/unknown criteria.

### Optional host-spawned Critic

If the host actually exposes Core agents and subagent use is authorized, it may delegate instead.
`optional_spawn` provides a compact spawn_template with exact AFTER/available same-document BEFORE paths,
SHA, request id and the report contract. To avoid repeating the full brief in every parent-chat response,
the parent must append its complete retained original brief to the worker task before dispatch. Without
that brief or actual image access, do not fabricate an evaluation: retain same-chat review or unknown.

Use the real Core agents API: status once, message a suitable sleeping worker or spawn once with
context/workers. Preserve saved model/reasoning defaults; no forced local model. The worker only reviews
pixels and the brief, without Photoshop mutations, focus changes, sources, shell scripts or image
generation. It returns its report via finish; the parent collects status once. Pending work remains
pending rather than triggering a polling loop or an invented verdict. Carry the received report into
the same continuation with reviewer=spawned-reviewer. This plugin does not call spawn itself, alter the
host's tool exposure or claim that an unavailable host capability exists.

Both report origins are explicit. Same-chat role switching is not isolated independent judgment;
host-reported delegation alone is not calibrated authority either. The existing independent Critic
registry and human/held-out E.8 acceptance are separate. Automatic LM Studio evaluation stays retired.

## One review, one continuation

1. Record the original user task once as `original_brief` in `photoshop_guard_set_art_run`.
2. Inspect delivered AFTER and available BEFORE against that brief and its intended style. Describe
   visible form, proportions, perspective and light; executed tools and plan labels prove no quality.
3. Use existing `previous_observation.observed` (or `observed_change`) for the visible result,
   `primary_mismatch` for the largest remaining defect and `target` (or `target_resolved`) for the
   actual goal outcome. State uncertainty when images or the brief are insufficient.
4. In the same ordinary continuation call, choose a `painting_intent` or `next_pass` that fixes that
   defect through a concrete construction change. If construction failed repeatedly, change it rather
   than adding texture or highlights. Existing unresolved-problem routing retains the critique. At due Critic checkpoints, include
   critic_review in this same call; no provider request, per-stroke gate or assessment call is added.

Example: if a realistic cup remains a faceted silhouette, review must say the light-to-shadow turn
and rim/body/base relationship are missing. The next pass rebuilds/modelled surfaces and their edges;
adding gloss cannot establish the missing rounded volume. An intentionally flat poster is judged
against its own brief, not forced into realism. Distinguish useful pass gain, task completion,
stage readiness and whole-image finish. Retaining unfinished pixels can be appropriate.

Review uses the selected commentary language (Russian/English), independently of panel localization.
Exact image hashes/delivery, incomplete-role recovery and mutation no-replay rules are unchanged.
Stored legacy local-model results no longer override ordinary observations or appear as current
review/continuation authority. Guard validates protocol/provenance; field presence cannot establish
artistic quality. Self-review is NOT independent artistic acceptance; human/held-out acceptance remains
separate in E.8. After source activation, E.7e must demonstrate actual better construction on the image.

## Retired automatic local evaluator

The 2026-10-05 prototype connected a separate LM Studio vision request, default `gemma-4-12b-it`,
to every review. It could wait 30 seconds for inference and did not prove better paintings.
That automatic integration is removed. Production does not instantiate it, prepare/load a model at
art-run creation, start background inference after dispatch, or await inference during image delivery.
The standalone evaluator and explicit runtime method remain experimental developer code/tests;
there is no painting-tool invocation or automatic fallback to that provider.

Earlier controls and latency observations are historical evidence, not current acceptance or proof
of artistic competence. Their documentation is preserved verbatim in
[the pre-change archive](../processes/documentation-maintenance-process/pre-same-chat-review-20261005T180115/docs/artistic-evaluator.md).
Current implementation and narrow verification belong to [CHANGELOG](../CHANGELOG.md).
