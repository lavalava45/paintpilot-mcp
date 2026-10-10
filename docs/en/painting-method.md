# Autonomous painting method

[Русский](../ru/painting-method.md) · [English contents](README.md)

## Feedback in the current implementation

After a pass, inspect the exact BEFORE/AFTER in the same conversation.
Compare form, perspective and lighting to the original brief and style;
record the principal mismatch and make the next pass address it through
construction rather than surface decoration. A block-in is allowed as a
temporary construction state, not a finished realistic painting.
No local artistic model is automatically invoked and self-assessment
does not constitute independent approval.

## Why a checklist of objects is insufficient

The **primitive trap** occurs when easy-to-express rectangles, circles,
stamps and fills are accepted as substitutes for convincing objects.
Recognition cues are essential, but completion requires meaningful
shape, depth, material and light relationships.

## 1. Recognition first

The first meaningful visual pass should include the requested subject
and its distinguishing cues. Subsequent bounded passes can establish
the setting, path, large tonal masses and compositional support.
An atmosphere-only opening that postpones the requested subject is
generally not enough.

![Historic homestead recognition block-in](../ru/images/homestead-recognition-blockin.jpg)

*Two houses, trees and foreground props already make the subject legible;
the flat geometry is an unfinished structural state, not final quality.*

## 2. Work from large structure to detail

```text
recognition → composition and major values → silhouette and construction
→ light and volume → form and edge hierarchy → material → selective detail
```

This sequence is a working hypothesis, not a universal rule for every
style. Intentionally flat graphic work requires a different contract
from a realistic portrait. Geometry and representation constraints
must be appropriate to the authored target.

## 3. Texture is not form

Noise, brush marks and extra small edges may increase apparent activity
while leaving the object's volume unresolved. Useful form development
changes planes, transitions, material response and edge priority.

![Historic sphere: block-in, form, light, detail](../ru/images/progressive-refinement-blockin-to-detail.jpg)

*The original four-frame exercise is labelled in Russian. It is a
controlled illustration of form-before-detail, not a new model benchmark.*

## 4. A causal pass

Each pass declares a visible problem, a hypothesized cause, a bounded
action and a preservation requirement. Example: warm and lighten the
right wall enough to separate it from the background while preserving
the roof silhouette and the lamp's principal contrast. Review the
observed result, not only the executed command list.

## 5. Art Director and Painter

The Director retains whole-brief priorities and decides when the current
strategy requires a structural reset. The Painter chooses the smallest
useful component change, submits a guarded pass and inspects its pixels.
Whole-scene Critic checkpoints check brief fidelity, proportion/form,
light/material, composition/context, and contact/protection. They use
the same chat unless independently delegated review is explicitly
authorized; neither mode automatically proves quality.

## 6. Choose the method from the defect

Silhouette errors call for contour reconstruction; inconsistent
perspective requires scene geometry; weak volume needs plane and
lighting decisions; repetitive foliage needs varied structure rather
than more copies. Current tools include authored component contours,
relative landmarks, rigid poses, IK contact targets, and bounded
reference-guided strokes. The solver does **not** invent dimensions,
anatomy, or a lighting reference from an object name.

## 7. Choose brushes by observed behavior

A brush preset name cannot prove material suitability. Inspect physical
test strokes, size, softness, grain, directionality, opacity and scale
before assigning a material role. Save useful brush profiles and
invalidate them when relevant settings or observations change.

![Historic hard directional and grainy soft brush tests](../ru/images/brush-probe-observed-behavior.jpg)

*The two original Russian labels identify a hard directional stroke
and a soft grainy stroke, respectively.*

## 8. Stamps are powerful but recognizable

Changing rotation, color or scale across repeated copies does not
necessarily remove the copied appearance. Use overlaps, partial
occlusion, silhouette corrections, lighting, and integration with
surrounding form.

![Historic tree-stamp risk crop](../ru/images/homestead-tree-stamp-risk-crop.jpg)

*Historic local experiment: small variations cannot by themselves
guarantee natural foliage structure.*

## 9. Preserve achievements and permit rollback

Accepted features and semantic owners are protected from unrelated
edits. When a new hypothesis degrades the scene, an exact supported
rollback or accepted-anchor restore is preferable to attempting to
hide the damage through more texture. Native history correspondence
must be proven; some compound Smart Filter cases still need live
acceptance.

![Rejected hypothesis and retained earlier state](../ru/images/homestead-rejected-pass-and-rollback.jpg)

*Historic homestead comparison, not evidence that every current
operation can be rolled back.*

## 10. Completion is a state

Finished means the whole brief is satisfied, major structural and
review debts are closed, protected features remain intact and a
verified saved result exists. A PSD save, exhausted command list or
successful last tool call does not by itself finish the painting.

## 11. Rules versus hypotheses

Machine tests can verify schema, ownership, preflight, journal and
recovery invariants. They cannot establish that the visual hierarchy
has improved. Evaluation must include controlled positive/negative
examples, unseen tasks, actual Photoshop operation and independent
human judgement for perceptual claims.
