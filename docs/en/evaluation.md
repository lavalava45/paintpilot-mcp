# Evaluating the system and publishing work studies

[Русский](../ru/evaluation.md) · [English contents](README.md)

## Same-chat image review is not independent evaluation

Ordinary inline/review asks the agent in the same conversation
to inspect delivered exact BEFORE/AFTER against the original
brief and style. It records visible observations and the
principal mismatch, then changes construction where needed.
An earlier automatic LM Studio/Gemma evaluator is not part
of the current production run. The Critic role can enforce
more consistent criteria, but its judgement remains
self-assessment; code, JSON and model confidence alone do
not establish artistic improvement.

## Why evaluation requires its own method

Choosing the best picture, hiding failed runs or measuring
only faster commands can make a system appear improved
without demonstrating better art. Separate **visual quality,
reliability, recovery, efficiency, holdout transfer and
independent human preference**.

## 1. Controlled exercises

- **Sphere:** major values, turning form, reflected light,
  cast/contact shadow, and edge control.
- **Cube or simple building:** plane separation, geometric
  consistency, structural readability and edge hierarchy.
- **Small still life:** overlap, negative space, depth
  order and physical contact.
- **Small portrait:** proportions, placement of features,
  volume and selective detail.
- **Unseen holdout task:** generalization beyond a practiced
  scene. Reusing the same favorite prompt is not transfer proof.

These are controlled exercises, not automatic acceptance
of the full system on complicated scene briefs.

## 2. Positive and negative controls

To test recognition of actual form improvement, include:
real form development; texture-only changes; residual block-in
geometry; harmful over-detailing; and an **intentionally
flat graphic style** that should not be wrongly judged
as failed realism.

![Historical sphere exercise from block-in to detail](../ru/images/progressive-refinement-blockin-to-detail.jpg)

*Four original Russian labels mark block-in, major form,
form and light, and detail after form.*

## 3. Independent human evaluation

Blinded reviewers should see the original brief and
the relevant images, not tool logs, stroke counts, an
internal verdict, expected answers or computational cost.
Ask whether large and secondary forms improved, edges
became more informative, material/light interaction became
more specific, block-in artifacts decreased, added detail
is useful, important structure survived, and the image
better serves the original intent. Include **yes / no /
uncertain / not applicable**, not forced positive answers.

## 4. Do not collapse the metrics

| Dimension | Example measures |
| --- | --- |
| Artistic | Recognition, form, human preference, regressions |
| Reliability | Uncertain execution, wrong-document attempts, no-replay, recovery success, unresolved review debt |
| Efficiency | Tool/model turns, useful passes per turn, Photoshop execution, exact image bytes and extra crops |
| Transfer | Performance on unseen briefs and styles |

Higher throughput cannot compensate for worse artwork.

## 5. A serious causal case study

![Historical railway structural correction](../ru/images/railway-perspective-before-after.jpg)

*Annotated railway evidence is a causal example, not a new
independent artist rating or automatically accepted finish.*

A public report should include:

**A. Original brief:** unaltered user request.

**B. Initial interpretation:** intended focus, major masses,
depth and recognition cues.

**C. First readable block-in:** the first frame where the
main structure can be judged.

**D. First major defect:** show the actual weak intermediate
frame, not just the strongest result.

**E. Causal correction:** problem → proposed cause →
bounded pass → visual evidence → grounded observation.

**F. Multi-scale review:** which whole/object/micro crops
were required, and why.

**G. Regression and restore:** when it happened, show the
accepted point, worse hypothesis, decision and verified restore.

**H. Final comparison:** original brief, end frame, known
limitations and genuinely collected independent ratings.

## 6. Minimal evidence images for a public study

Collect initial canvas, recognition block-in, structural
pass, weak intermediate frame, corrected version,
at least one registered local crop, final save, and
an actual restore/failure example if available.
One attractive final picture cannot document method.

## 7. Useful plots

**Semantic throughput:** useful artistic mutations per
model interaction, with regressions and recovery alongside.

**Verification cost:** whole-only versus all-scales
versus adaptive; compare bytes, crop count, missed
defects and whole-frame damage.

**Recovery:** exact, unknown, reconciled and repeated
operations. Ideally extra inspection never replays
the original mutation.

**Latency:** separate Guard preflight, Photoshop
execution, journal/preview processing, transport and
unexplained inter-call delay. Do not label unmeasured
delay as model reasoning.

## 8. Practices to avoid

Do not publish only successes, give variants unequal
budgets, alter prompt/tools/review policy simultaneously
without recording it, mistake an internal verdict for
independent rating, hide negative controls, or claim
speedups without specifying the metric and environment.

## 9. Selecting the first study

Choose a run with a complete causal trail, not necessarily
the prettiest image: original brief, recognition stage,
one meaningful correction, multiple inspection scales,
verified saved result and ideally an unsuccessful
branch. Until such a study exists, do not invent
before/after cases or human evaluation results.
