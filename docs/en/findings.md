# Engineering and research findings

[Русский](../ru/findings.md) · [English contents](README.md)

## A reproducible limitation of artistic review

In an earlier experiment, a separate evaluator described a
missing volume yet also declared the target reached. The
present same-chat Critic protocol separates five whole-scene
criteria and does not treat a detected defect as success.
That addresses response consistency, **not** the model's
perceptual fallibility. Positive/negative controls, next-pass
improvement and independent assessment remain necessary.

The following lessons arose while building a visual agent
for a stateful external editor. Some are engineering invariants;
others remain testable hypotheses.

## 1. Tool success is not artistic success

```text
successful API call ≠ changed pixels ≠ useful change ≠ resolved brief
```

Keep execution, image significance and artistic outcome distinct.

## 2. Texture is not form

More marks, edges or noise may suggest activity without improving
volume. Observe planes, edge hierarchy and material response
before allowing detail.

![Historical form-development exercise](../ru/images/progressive-refinement-blockin-to-detail.jpg)

## 3. The primitive trap

Rectangles, circles, simple regions and repeated stamps are
easy to encode but not necessarily adequate artistic
representations. Select the method from the visible defect.

## 4. Inspection scale must match the question

Use whole-frame for composition, object crop for shape,
micro crop for seams and halos. There is no universal best
preview resolution.

![Historical whole-frame and object crop](../ru/images/multiscale-whole-and-object-focus.jpg)

## 5. A local improvement may harm the whole

One crisply corrected object may steal attention, flatten
depth or disrupt global values. Never lose whole-frame
context during local inspection.

## 6. No answer does not mean no mutation

A timeout proves missing transport acknowledgement, not
that Photoshop made no change. Reconcile uncertain state;
never blindly repeat external work.

## 7. An image must belong to the right state

A compelling crop from yesterday cannot close today's
operation. Bind source pixels, bounds and exact document/
operation identity.

## 8. Brush names are weak semantic evidence

Observe actual marks under known settings instead of trusting
descriptive preset names.

![Historic hard and soft brush probes](../ru/images/brush-probe-observed-behavior.jpg)

## 9. Parameter variation does not erase copying

Five rotated, recolored instances of one complex stamp
may remain conspicuously cloned. Better structural
integration is required.

## 10. More autonomy is not the goal by itself

Bundling commands may reduce overhead but can hide a
structural mistake. Optimize **useful artistic progress**
per model interaction and wall-clock time while tracking
regressions and safe recovery.

## 11. Unit tests cannot fabricate aesthetic evidence

Schema and state-machine tests can validate coordinates,
ownership and review obligations; a mocked “form improved”
response cannot establish convincing image quality.
Human judgement remains a distinct acceptance layer.

## 12. Creative autonomy needs retreat

```text
plan → execute → inspect → accept / correct / restore / replan
```

Verified restoration is a creative instrument as well as a
failure-recovery mechanism.

![Historical rejected pass and restored frame](../ru/images/homestead-rejected-pass-and-rollback.jpg)

## 13. Structured state beats an infinite transcript

Current issue, owner layers, previous outcome, accepted
anchor and review debt are more actionable than pages
of unverified narration.

## 14. UI side effects are correctness issues

Even read-only inspection can be harmful if it unexpectedly
steals focus from the user's Photoshop workflow. Native
behavior must be live-tested.

## 15. Claims need appropriate evidence

| Claim | Suitable evidence |
| --- | --- |
| Tool exists | Source and a reproducible test |
| Recovery contract holds | Regression and failure-injection tests |
| Photoshop executed the mutation | Native live receipt and image |
| Image is artistically better | Independent visual/human assessment |
| Method generalizes | Holdout task |
| Performance improved | Controlled measured comparison |

## 16. Related decisions require a shared scene

The railway test exposed different perspective assumptions
for rails, platform and train, followed by independently
selected cold/warm color relationships. Subsequent work
implemented document-bound scene geometry, applicable
Geometry Preflight, versioned scene lighting/color,
and dependency/provenance checks. **Live coverage and
quality remain open**, so the historic test is not a
demonstration of the new algorithms.

![Historical railway perspective correction](../ru/images/railway-perspective-before-after.jpg)

See the [full causal case study](process-revision-perspective-color.md).

## Future article topics

The primitive trap; form versus texture; adaptive inspection
scale; no-replay in stateful applications; memory without
training; evidence-based brush semantics; independent human
art review; and the railway geometry/color case study.
