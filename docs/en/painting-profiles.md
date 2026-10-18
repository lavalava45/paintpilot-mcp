# Painting profiles: choosing the right workflow

[Русский](../ru/painting-profiles.md) · [English documentation](README.md) · [Technical profile settings](../digital-painting.md)

PaintPilot is still under development and real-image validation. **Neither profile guarantees that the agent will finish a complex painting unattended.** A profile selects a workflow, not an artistic skill level.

| Photoshop panel setting | Intended use | What to expect |
| --- | --- | --- |
| `simple_graphic` — graphic / markers | Flat graphics, small illustrations, simple posters, limited palettes and clear silhouettes | A more direct construction workflow. A reasonable starting point, but not a guarantee of a finished image or a way around Guard. |
| `nontrivial_painting` — complex / experimental | Interrelated figure or object parts, perspective, volume, materials and lighting; exploration of new painting tasks | **An experimental, hands-on collaboration mode.** Strict construction, layer ownership, brush and visual-review checks may repeatedly interrupt progress. Some briefs cannot yet be completed. |
| `Auto` — artist chooses | When you prefer not to select a profile manually | The agent chooses on creation of a new art run. **Auto does not mean “simplest”**: if the profile is omitted, the current fallback remains `nontrivial_painting`. |

## What “experimental” actually means

`nontrivial_painting` is **not a “maximum quality” switch** and is not yet positioned as an unattended route to finished complex illustrations. It is a test environment for more demanding construction in real Photoshop. Guard may require evidence for proportions, geometry, component placement and editable-layer ownership, applicable brush settings, a consistent document state, or an actual visible improvement.

Some stops are **legitimate safeguards**; others reveal limitations in an insufficiently supported workflow or software contract. Repeated blockers are a genuine current limitation of PaintPilot. Selecting the experimental profile does not automatically remove them.

The intended experience is collaboration between the agent-artist and the user. You can clarify the brief, answer specific composition questions, choose between supported alternatives, identify visible problems and help investigate a reproducible blocker. The agent must follow Guard's safe correction paths rather than bypassing checks to keep drawing. If there is no supported way forward, the correct outcome is an explanation of the blocker and preservation of confirmed work—**not a misleading claim that the painting is complete**.

**About “learning”:** conversation and error logs **do not automatically retrain the model**, add Photoshop capabilities or permanently fix Guard. They can expose missing workflows that maintainers may subsequently address through explicit code, policy and test changes or future releases. A workaround found during one session is not proof that the system has acquired a durable new skill.

## Choosing a first project

For an initial independent trial, **explicitly select `simple_graphic`** and use a bounded brief: one object, simple composition, few colors and a result that can be inspected. Stops are still possible, and image quality still requires review.

Choose `nontrivial_painting` when you are prepared for **interactive experimentation and troubleshooting**: working through recurring constraints, redirecting the next artistic step and sometimes stopping with unfinished art. Consider it participation in the system's development, not a promise of uninterrupted production.

Select the profile under **MCP Bridge → Painting profile** in Photoshop. The setting applies to a **new art run**, not an already-bound painting. Both profiles retain Guard's safety and exact-image review requirements.
