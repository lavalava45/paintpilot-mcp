# Painting profiles: choosing the right workflow

[Русский](../ru/painting-profiles.md) · [English documentation](README.md) · [Technical profile settings](../digital-painting.md)

PaintPilot is still under development and real-image validation. **Neither profile guarantees that the agent will finish a complex painting unattended.** A profile selects a workflow, not an artistic skill level.

| Photoshop panel setting | Intended use | What to expect |
| --- | --- | --- |
| `simple_graphic` — graphic / markers | Flat graphics, small illustrations, simple posters, limited palettes and clear silhouettes | A more direct construction workflow. A reasonable starting point, but not a guarantee of a finished image or a way around Guard. |
| `nontrivial_painting` — complex / experimental | Interrelated figure or object parts, perspective, volume, materials and lighting; exploration of new painting tasks | **An experimental, hands-on collaboration mode.** Strict construction, layer ownership, brush and visual-review checks may repeatedly interrupt progress. Some briefs cannot yet be completed. |
| `Auto` — artist chooses | When you prefer not to select a profile manually | The agent chooses on creation of a new art run. **Auto does not mean “simplest”**: if the profile is omitted, the current fallback remains `nontrivial_painting`. |

## Guard-by-guard comparison

**Scope:** the behavior implemented in the **committed `digital-painting` branch**, not experimental changes in an uncommitted working tree. A new source build is not automatically the version loaded in COS/Photoshop; verify the actual MCP/UXP deployment before interpreting a live failure. These rows are *families of checks*, not a one-to-one registry of individual error codes.

**Legend:** **Required** = a failure can stop execution; **Conditional** = enforced when the operation or supplied contract makes it applicable; **Advisory** = reported without granting permission to damage the document; **—** = no additional profile-specific requirement. A conditional or advisory check is **not** a promise that all other Guard checks will pass.

| Guard / contract family | `simple_graphic` | `nontrivial_painting` | What it is intended to protect or evaluate |
| --- | --- | --- | --- |
| MCP/UXP readiness, document ID and incarnation | **Required** | **Required** | Target the exact live Photoshop document; reject stale identity and disconnected execution. |
| Native tool schemas, bounded mutations, selected target, protected layers | **Required** | **Required** | Prevent malformed commands, wrong-layer edits and damage to explicitly protected work. |
| Guard journal, History/Undo, recovery and uncertain-result no-replay | **Required** | **Required** | Keep an auditable operation and reconcile uncertain Photoshop effects rather than blindly retrying. |
| Exact BEFORE/AFTER evidence and frame-bound observations | **Required** where specified by the operation | **Required** where specified by the operation | Judge actual pixels instead of equating a successful tool call with a good picture. |
| Semantic layer owners, editable-component scope and cross-layer changes | **Conditional**, with narrow safe normalizations for simple canvas fills | **Stricter** on new/changed components and ownership declarations | Keep independent subjects editable and prevent one component from silently taking another's pixels. |
| Brush preset selection, native settings and brush inventory preflight | **Native tool/settings checks**; no general run-level brush-role preflight | **Run-level brush preflight** for brush-dependent work, plus native checks | Confirm usable tools; the experimental profile also requires more evidence of brush roles and installed presets. |
| Painting-method palette, material/brush-role compatibility | **Conditional** for supplied methods/strategies; some uniquely resolvable cases may be normalized | **More detailed conditional checks** for declared strategy, material and method | Current experimental technique classifications can still reject combinations: they are **not** an exhaustive catalog of valid art. |
| Whole-scene foundation (composition and representative technique) | **Conditional**; a narrowly verified, clipped sky gradient may continue with an advisory | **Required** before dependent detail when foundation policy is active | Avoid developing detail while the requested scene or medium is visibly absent. The Simple exception is **not** a blanket bypass. |
| Scene geometry, perspective and construction dependencies | **Conditional**, e.g. explicit world-space/geometry bindings | **Required for applicable committed spatial/structured construction** | Check stated geometric relationships; simple flat graphics need not claim a 3D camera. |
| Physical stack, opacity roles, occlusion and stage-dependent review | Physical owner/depth references are **conditional** | **Additional required metadata and stage gates** for relevant new layers/refinement | Compare declared layer/depth relations with real Photoshop layer placement. |
| Art Director / Planner directives, stage and priority routing | **Conditional** on active directive and requested operation | **Conditional**, with a fuller experimental construction/refinement workflow | Coordinate multi-pass work, but planning annotations are not proof that a visual result is correct. |
| Softness, value structure, refinement debt and material/lighting evidence | **Review/advisory or conditional** as applicable | **Additional review obligations** for selected stages and risks | Flag poor form, uncontrolled softness or inconsistent lighting after looking at evidence. |
| Same-chat whole-image Critic and visual relationships | **Scheduled** | **Scheduled** | Both use frame-bound Critic checkpoints: after three passes (or first non-block-in result), later at stage changes, after six more passes, and at final review. No separate artistic model is secretly called. |
| Completion claim and unresolved reviewed defects | **Required evidence** | **Required evidence**, with more experimental prerequisites | Neither profile may declare a finished painting merely because its last Photoshop operation succeeded. |

### What the table does *not* mean

- **Simple is not Guard OFF.** It still uses the guarded MCP path and can stop on document identity, layer ownership, missing exact-frame evidence, actual native-tool errors or other applicable contracts. To issue direct Photoshop commands without the *painting workflow* Guard, see the separate [connection modes](../../README.md#two-ways-to-connect-to-photoshop); direct tools still have native technical checks.
- **Nontrivial is not a more capable renderer.** It activates stricter construction/brush/physical-scene contracts and can reject artistic techniques that Photoshop itself can execute. This is a current software limitation, not evidence the artwork is impossible.
- **An artistic warning is not technical authorization.** Conversely, a preferred brush, method class, palette role or perspective *recipe* should not in principle become a universal ban on valid styles. The goal is to test each such Guard independently and reserve hard denial for justified safety or explicit user constraints; this is a **future validation/refactoring goal**, not a claim that the published Guard already implements it perfectly.
- **Profiles are not interchangeable with the two connection modes.** Painting Mode with either profile uses Guard; direct Photoshop Tools is a separate route without the painting admission workflow.

### Selecting or changing the profile

Set **MCP Bridge → Painting profile** before starting a new art run. Changing that panel preference normally applies to the **next** run; it does not silently rewrite the active run. A separately supported, explicitly requested **in-place upgrade from `simple_graphic` to `nontrivial_painting`** requires a verified brush-preflight inventory and its other transition obligations. A downgrade in the same run is not supported. A new document/run is the straightforward way to choose a different profile. See [the code for the transition contract](../../src/core/guard/artistic-contract.ts) and [user-config projection](../../src/core/guard/session-user-config-projection.ts).

### Where to verify the implementation

The main entry points are [cycle admission](../../src/core/guard/cycle-compiler.ts), [durable Guard state and visual gates](../../src/core/guard/session-store.ts), [profile-specific Simple normalizations](../../src/core/guard/simple-graphic-leniency.ts), [physical stack rules](../../src/core/guard/compact-physical-stack.ts), [scene foundation](../../src/core/guard/scene-foundation.ts), [runtime readiness](../../src/core/guard/runtime.ts) and [same-chat Critic scheduling](../../src/core/guard/chat-critic.ts). A green unit test validates only its specified contract, not the visual quality of a finished painting. The deferred [per-Guard qualification program](../PAINTING-ROADMAP.md#deferred-per-guard-qualification-program) proposes auditing each blocker against real failures and actual Photoshop behavior.

## What “experimental” actually means

`nontrivial_painting` is **not a “maximum quality” switch** and is not yet positioned as an unattended route to finished complex illustrations. It is a test environment for more demanding construction in real Photoshop. Guard may require evidence for proportions, geometry, component placement and editable-layer ownership, applicable brush settings, a consistent document state, or an actual visible improvement.

Some stops are **legitimate safeguards**; others reveal limitations in an insufficiently supported workflow or software contract. Repeated blockers are a genuine current limitation of PaintPilot. Selecting the experimental profile does not automatically remove them.

The intended experience is collaboration between the agent-artist and the user. You can clarify the brief, answer specific composition questions, choose between supported alternatives, identify visible problems and help investigate a reproducible blocker. The agent must follow Guard's safe correction paths rather than bypassing checks to keep drawing. If there is no supported way forward, the correct outcome is an explanation of the blocker and preservation of confirmed work—**not a misleading claim that the painting is complete**.

**About “learning”:** conversation and error logs **do not automatically retrain the model**, add Photoshop capabilities or permanently fix Guard. They can expose missing workflows that maintainers may subsequently address through explicit code, policy and test changes or future releases. A workaround found during one session is not proof that the system has acquired a durable new skill.

## Choosing a first project

For an initial independent trial, **explicitly select `simple_graphic`** and use a bounded brief: one object, simple composition, few colors and a result that can be inspected. Stops are still possible, and image quality still requires review.

Choose `nontrivial_painting` when you are prepared for **interactive experimentation and troubleshooting**: working through recurring constraints, redirecting the next artistic step and sometimes stopping with unfinished art. Consider it participation in the system's development, not a promise of uninterrupted production.

Select the profile under **MCP Bridge → Painting profile** in Photoshop. The setting applies to a **new art run**, not an already-bound painting. Both profiles retain Guard's safety and exact-image review requirements.
