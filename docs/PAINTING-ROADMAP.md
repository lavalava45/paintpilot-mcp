# Painting Quality Roadmap

Last updated: 2026-10-15

Goal: **a visibly better image sooner**, preserving the user's subject, style and composition.
This is the short work plan. [Technical details and acceptance](PAINTING-WORK-DETAILS.md)
hold the existing task identifiers and conditions; [CHANGELOG](../CHANGELOG.md) holds history.
[The acceptance matrix](roadmap-final-acceptance-matrix.md) records evidence status.
Reorganization does not mean any open feature or artistic claim has been completed.

**Single source of truth (2026-10-15):** this roadmap owns restoration priorities,
the entire frozen post-first-city delta, canonical Git cleanup and foreign-file
triage. [Verbatim evidence and full patch](painting-baseline-20261014/) are
supporting artifacts, **not competing roadmaps** or authorization to apply
changes. Read the Priority 0 and Git cleanup sections before selecting a task
from the older painting queue. Historical `implemented` notes are not proof
that a newer archived change is installed in the restored baseline.

**Current release direction:** [finite Release Hardening gate](RELEASE-HARDENING.md).
Freeze optional feature growth and qualify the existing Critic → Painter → Guard →
Photoshop path against six registered scenes, real pixels, safety, recovery,
autonomy and independent artistic assessment. The 2026-10-13 Mykonos failure
families are queued there by underlying cause, **not** as another P1/P2/P3
expansion. Existing roadmap outcomes remain open until their real acceptance.

## Priority 0 — restore the original creative environment, not one picture

**User decision:** restore the artist's **general creative judgment** as used in
the first successful pink floating city, across varying briefs. Do not hard-code
the old city's composition, substitute new rules for the older artist, or
cherry-pick later improvements during the control test. Another agent is
working on artistic recovery; coordinate before changing checkout, COS, or UXP.

| Aspect | Historical first run | Current evidence / limit |
| --- | --- | --- |
| Run and brief | `processes/flying-pink-ninja-city-process/20261014-marker-city`; bright pink marker city with ninjas, no imagegen | Original brief, saved art, frames and run state retained; not a universal prompt template |
| Document and time | Photoshop document `4969`; started **2026-10-14 17:29 +03**; MCP PID `26496` | Run evidence retained; historical PID's binary/source fingerprint not archived |
| Profile | `simple_graphic`; no `construction_policy: enforced`; 123 installed brush presets | Profile is **per run**, not a COS setting. Do not force all art to `simple_graphic` |
| Closest committed code | `3689249f292616c4cc258beed41c4d23453a646c`, 2026-10-14 12:21 +03 | Best evidenced pre-first-run Git snapshot; not independent proof of historical in-memory build |
| Restored technical state | `digital-painting` and `origin/digital-painting` at `3689249` | Clean tree, active MCP and loaded UXP source fingerprints agree, COS global launch points to canonical checkout; `deployment:health=current` |
| Quality | The first city progressed rapidly through large-scale forms and spatial relationships | **Artist quality NOT YET RE-QUALIFIED**: model context and choices are not restorable by Git checkout |

**Technical gate (2026-10-15):** `npm run verify:canonical` passed:
**176 test files / 1,915 tests**; source, prompt, policy, packaging and
provenance checks passed. Legacy live-evidence ledger verifies 21 of 23 local
entries; **2 evidence files are absent**. This is an engineering check, not
an artistic verdict. `%APPDATA%/chat-on-steroids/config.json` is semantically
back to its pre-intervention backup: a temporary global `simple_graphic`
instruction inserted during investigation was removed. Do not add COS-global
artist settings; do not erase the shared Guard controller with old user runs.

**Next acceptance:** on a fresh Photoshop document use the **verbatim**
historical pink-city brief, explicitly bind **only that new comparison art run**
with `painting_profile: simple_graphic`, verify the saved setting **before
painting**, then compare the first 5–12 meaningful frames, overall visual
complexity, time to recognizable whole scene, layer order, actual brush marks,
Guard refusals and artistic progress at equal time. This is experimental
control, **not** a change to the default profile for other prompts. Preserve
History, snapshots and exact run evidence. User judges image quality.

### Complete frozen changes AFTER that version — lowest risk first

**Exact range:** `3689249..fac85ea` = **six commits, 33 modified paths**;
**none applied to the restored baseline**. Every path and full diff is in the
annex. This ordering is a **review priority**, not permission to merge.

| Review tier | Complete change families and commits | Why gated |
| --- | --- | --- |
| 1. Repository-only | `f96d4ad`: Windows/docs/product identity/`.gitattributes` EOL notice integrity, retirement of five unsupported locale README stubs | Low direct art risk. Require separate license/provenance/product checks |
| 2. Guard consistency | `a3799e4`: preserve cumulative/global priority across rejected next pass; `5fdd340`: persist exact whole-image glance boundary | Safety/accounting, but can alter Director pacing; check live workflow |
| 3. Brush technical verification | Parts of `fac85ea`: native UXP brush-preset identity readback, selector fallback requiring replanning, installed-preset footprint proof; tests | May improve trust but block brush use or postpone first pixel; verify real marks and throughput |
| 4. Guard-preparation / stall gates | Parts of `fac85ea`: brush role preflight, cached probe/evidence admission, repeated preparation failure and stall recovery | Can change artistic method selection and cadence; compare failed turns and visual gain |
| 5. Direct artistic strategy **LAST** | `aef5269`: `tonal_regions` and color-region first construction; `7392a44`: recognition-prompt rewrite; artistic-prompt/Director parts of `fac85ea`: whole-frame composition contracts and replacement strategies | Highest creative-risk: may reward flat geometry and restrict art direction; require blind multi-brief A/B before *any* opt-in |

**Complete portable evidence inside this repo:**

| File | Authority / contents |
| --- | --- |
| [Full ordered change catalog](painting-baseline-20261014/POST_BASELINE_CHANGES_SORTED.md) | All **33** paths, exact changes, tests and risk distinctions; not just commit titles |
| [Full binary-safe Git patch](painting-baseline-20261014/ALL_CHANGES_AFTER_FIRST_CITY.patch) | `git diff --binary --full-index 3689249 fac85ea`; **164,992 bytes**, SHA-256 `BD1E610F53C05FEF1E0F7B355E2B8DA5021DD73BC9BCF27EFD9761A4AC7CE35D` |
| [Six full individual commit patches](painting-baseline-20261014/patches/) | `git format-patch --binary --full-index 3689249..fac85ea`; preserves each commit's message, author and isolated exact changes for future review, **not for automatic application** |
| [First-city environment audit](painting-baseline-20261014/FIRST_CITY_ENVIRONMENT_AUDIT.md) | Verified vs unknown COS, MCP, UXP, profile, state and historical runtime facts |
| [Timestamped activation record](painting-baseline-20261014/RESTORED_BASELINE_STATUS.md) | Historical PID/build snapshot; not a claim that this PID is still active |
| [Six commits](painting-baseline-20261014/SIX_COMMITS.tsv) and [all changed paths](painting-baseline-20261014/ALL_CHANGED_FILES.tsv) | Machine-readable reference indexes |
| [Full canonical test output](painting-baseline-20261014/baseline-verify-20261015.txt) | Test details, guardrails and unavailable old evidence |
| [SHA-256 inventory](painting-baseline-20261014/ARTIFACTS.sha256) | Rechecked hashes for **all 13** repository-contained evidence files and individual patches; archived external bundle hash is recorded below |

**Per-commit exact patches (chronological; review tier above, not commit order):**
[1. `a3799e4` cumulative Guard](painting-baseline-20261014/patches/0001-fix-guard-retain-new-cumulative-priority-across-reje.patch),
[2. `5fdd340` glance boundary](painting-baseline-20261014/patches/0002-fix-guard-persist-exact-glance-boundary-after-visual.patch),
[3. `aef5269` tonal regions](painting-baseline-20261014/patches/0003-feat-painting-build-color-value-regions-in-first-own.patch),
[4. `f96d4ad` repo cleanup](painting-baseline-20261014/patches/0004-chore-repo-retire-obsolete-locale-stubs-and-fix-Wind.patch),
[5. `7392a44` prompt compaction](painting-baseline-20261014/patches/0005-fix-painting-keep-recognition-prompt-bounded-and-med.patch),
[6. `fac85ea` brush/Guard/artistic changes](painting-baseline-20261014/patches/0006-fix-painter-verify-installed-brush-marks-and-escape-.patch).

**Full commit history:** `fac85eab4c978f65614da268243ae1d8747f9ec0`
is preserved in local and GitHub branch `archive/post-first-city-20261014`;
`artist-first-city-baseline-20261014` marks the frozen `3689249` baseline.
A separate verified Git bundle (34,589,458 bytes) is safely held at
`E:\Downloads\devspace-test\_archives\paintpilot-first-city-baseline-20261014\POST_FIRST_CITY_FULL_HISTORY.bundle`,
SHA-256 `EBB88D770F904BAD9B212E5E329E77D18CD6A5DE9C8E4485BEF25F2BA6E03CC5`.
The bundle is **not imported as another 35 MB binary into Git** because the
archived branch already retains every historical commit. This roadmap and the
repository's full patch remain the **authoritative entry point**. Do not
apply patches/bundles or delete preservation refs before separate approval.

## Start here

Choose one major visible defect in an existing or user-requested painting. Make the smallest
useful correction through the existing Critic → Painter → Guard workflow and compare the
whole image with the original brief. If a reproduced execution defect prevents that correction,
fix its owning boundary first. Live painting requires the user's authorization.

## 1. Make criticism lead to a real correction

**2026-10-12 line-first regression:** canvas fields no longer inherit spatial
construction requirements; calculated contours retain an explicit brush-outline
renderer, and durable owners reach Critic's structural brush admission. Implemented
and checked offline. **Next live acceptance:** repeat the pagoda brief, compare early
recognition and thin architectural lines with the retained run, and verify independent
parts; a valid command alone does not establish restored quality.
[Contract and limitations](component-rendering.md).

**Next live acceptance:** arbitrary component corrections follow the same Critic/Director decision and prerequisite route after save; technical failures do not consume artistic strategies. Verify visible form/material gain while unrelated and named structural debt stays open.

**2026-10-12 retained Critic continuation:** current-frame re-evaluation after closure/save is implemented offline via `review_operation_id`, with the same evidence binding, projection and persistence as normal review. Authored subrequirements retain their correction kind and verified prerequisites; unrelated debt stays open. Next acceptance: a real architecture-to-material continuation after save, followed by visible form/material/contact gain. Offline checks alone do not certify that gain.

**2026-10-11 offline audit-recovery fix:** a missing required spatial-relationship
check now receives a field-level, exact-frame correction instead of a terminal
Art Director error. The active Mykonos scene still needs genuine whole-image
`negative-space/composition` and `occlusion/depth` findings before paving resumes.

**2026-10-11 offline multi-defect gate fix:** one bounded Painter component
may explicitly address both an unresolved Critic problem and the active
Director global correction target via `addresses_problem_ids`, without changing
its own `problem_id`. Single-ID calls stay valid; eligible Director links are
inherited from exact active task/bounds; a selected Critic component link may also
inherit from its exact semantic owner, while other artistic choices stay explicit. Neither admission nor a local result closes global/scene debt.
**Next acceptance:** on an authorized real correction, confirm the linked
component advances visible whole-frame structure without owner/scale/protection
regressions and without a duplicate `primary_mismatch_unresolved` rejection.

**2026-10-11 offline continuation fix:** construction inherits the exact saved
semantic owner inventory instead of regenerating it from revised geometry;
only new semantic parts add declarations. Explicit remapping reports the field.
Live pixel correction and layer-preservation acceptance remain open.

**2026-10-11 offline hotfix:** method-class reuse is not geometry reuse:
changed executable region contours are a new structural strategy, while a
recolored unchanged contour is not. Owned construction REPLACE passes carry
old/new union clip bounds even in late stages. Targeted recovery checks/build
passed; actual visual improvement remains unverified.

**Outcome:** missing objects appear, composition changes where needed, and structural defects
are corrected instead of receiving more texture or highlights.
**Next:** activate and visually verify the correction loop on retained defect cases; compare
whole-scene gain and change actual construction/target after repeated no gain.
**Done when:** saved defect cases show a visible improvement without losing protected qualities.
**Status:** ranked Critic findings now constrain actual correction methods, propagate into the
next intent in the same cycle, and stop repeated unchanged construction after two no-gain
observations. Bounded structural semantics remain protected. Source implemented offline; real
visual acceptance remains open. [Details: E.7f / E.24 / E.7h](PAINTING-WORK-DETAILS.md#e7f).

**2026-10-11 structural correction:** generic named part/relation defects now retain
their original visual recheck across bounded Painter construction or brush passes.
Guard requires a matching authored correction and a compiled geometric effect, while
priority/owner protections and partial-rebuild bookkeeping remain active. Only a
current-frame Critic recheck closes a named defect. Offline source acceptance does
not certify visual quality; next acceptance is one live before/after structural repair
without extra review calls or lost component editability.

**2026-10-11 offline refinement:** filled outlines now fail topology preflight on concrete
crossing/degenerate segments before Photoshop; authored projected component relations are
enforced, even when landmarks are fixed. A structural Critic deficit outranks detail, and
repainting unchanged geometry cannot masquerade as reconstruction. Concave fills, holes
and declared intentional crossings remain legal. Retained tiger and bounded generic cases
passed targeted offline checks; **live artistic comparison is still required** before
claiming that the tiger or other actual paintings look better.

## 2. Keep meaningful parts independently editable

**Outcome:** a whole person, facade or environment cannot bypass separation by being called
"one component". Parts that need independent correction have distinct real Photoshop layers.
**Next:** activate the scope checks and verify retained facade/environment cases against pixels
and layer topology. Retain inseparable accents together; do not impose one layer per stroke.
**Done when:** the retained facade/environment failures expose missing parts and lead to safe
separation, while ordinary multi-contour work on one actual component stays legal.
**Status:** inventory/edit rights, exact-image scope review, topology checks and combined-owner
freezing with additive replacement are implemented offline. Same-part scope is reused; live
semantic/pixel acceptance remains open. [Details: E.7g](PAINTING-WORK-DETAILS.md#e7g).

## 3. Improve form, light, materials and contact shadows

**Outcome:** requested objects look convincing in their chosen style, with readable volume,
surface behaviour and grounded contact rather than silhouettes plus decorative marks.
**Next:** use authored surfaces/sections and light to verify readable turning form, material
response and contact shadows on actual pixels before adding texture.
**Done when:** exact whole-image comparisons show the intended visual gain; valid geometry or
a successful brush/gradient command alone is insufficient.
**Status:** bounded 2.5D triangles/sections, normals, oriented material response and owner-bound
cast shadows feed the existing protected painterly brush executor. Support/contact/weight review
remains active. Source implemented offline; whole-scene artistic quality and broader physical
rendering remain open. [Details: E.7e / E.7f / E.19](PAINTING-WORK-DETAILS.md#e7e).

## 4. Keep returning to the original task

**Outcome:** local successes do not replace the requested scene, style or finish.
**Next:** verify that retained continuation/recovery cases select a relevant correction using
the compact intent/unmet-requirements anchor and the full prompt at Critic/recovery boundaries.
Use existing continuation fields without extra calls or repeated unchanged image delivery.
**Done when:** saved continuation/recovery cases retain the full brief and select a correction
that addresses a substantive unresolved requirement.
**Status:** compact task anchors and full-brief restoration at whole-scene Critic/recovery
boundaries, including continuation checkpoints, are implemented offline. Earlier delivery receipts
do not suppress required prompt restoration; artistic relevance still needs visual acceptance.
[Details: E.7f original-brief anchor](PAINTING-WORK-DETAILS.md#e7f).

## 5. Spend less time negotiating, more time improving the picture

**Deployment gate (2026-10-12):** source/dist fingerprints and immutable MCP/UXP build
identities now expose unapplied changes. Next activation: coordinated build/restart/reload,
then `npm run deployment:health`; offline consistency is not live pixel acceptance.

**2026-10-11 offline:** a new purpose for an installed compatible brush can
use a bounded trial, with reusable fit only after exact-image review. Composite
Critic deficits can track image-verified component prerequisites without
closing whole-scene debt or forcing repeated links to completed prerequisites.
**Next live acceptance:** confirm native brush identity when tool-options names
are absent, no empty layer created before failed independent brush preparation,
remaining-only reuse after reconciled partial creation, and acceptance of the
exact requested whole-scene ownership review. These boundaries are implemented
offline; then compare fewer failed turns and actual visible form/material gain.

**2026-10-11 offline acceptance:** three existing-harness Guard tests now
verify reject → actual public correction → full admission → stub Photoshop
boundary for four retained incident families (layer reference, durable owner,
Critic/Director/global linkage, changed structural method). Retain exact
review and global debt; compare fewer real failed turns and whole-frame gain
only after a separately authorized live run. Offline dispatch is not quality proof.

**2026-10-11 offline update:** Guard now synchronizes the new layer action's
display name with `logical_layer.layer_name` and completes abbreviated scene
ownership continuations from saved immutable declarations. MCP next-pass
schema permits sparse continuations; new units/objects still require explicit
artistic classification, while changed existing ownership is rejected.
The remaining preflight failures for actual geometry, perspective, Critic and
component decisions are not auto-guessed. Compare live rejected turns per
useful mutation after restarting only the plugin child at a safe boundary.

**Outcome:** fewer avoidable model rounds, repeated reads and technical refusals per useful pass.
**Next:** measure one real bottleneck, remove its cause and compare whole-image gain at equal
elapsed time. Reuse confirmed technical state and review delivery; expand batching only with
owner/history safety. Fix exposure or recovery when an actual blocker appears.
**Done when:** measured time/calls improve without weaker images or lost recoverability.
**2026-10-11 narrow follow-up:** tiger journals locate 11.9s before the explicit
review request and 86.8s after review result (marginal medians). The inline
fast path avoids a redundant intermediate delivery receipt and now labels its
transport distinctly; directly owning offline regression passed. Measure one
fresh real inline cycle and quality/time comparison before calling this a speedup.
**Status:** first-pass declarations survive compact compilation and method changes. Method
selection now publishes its exact executable schema and a request skeleton without a second
mandatory discovery call; Guard gives unknown commands a legal selected-method alternative,
aggregates independently detected errors into one field-level correction packet and derives
only unambiguous owner/layer/document/revision metadata. An untruncated rejected tiger request,
its correction and isolated compiler preparation were checked offline; **these changes are
implemented, not yet validated in a live artist run**. Next narrow acceptance: compare
first-pixel time and count of preflight failures on one ordinary run, while confirming
independent-layer/History safety and unchanged visual quality. Broad performance tests,
end-to-end speed and independent image-quality comparison remain open. Telemetry hardening
is maintenance-only. [Details: E.8](PAINTING-WORK-DETAILS.md#e8).

## Conditional and later work

| Work | When to take it up |
| --- | --- |
| Runtime exposure, reconnect and uncertain-operation recovery | A real blocker prevents ordinary painting. [E.24 / E.17 / E.8c](PAINTING-WORK-DETAILS.md#e24) |
| Further transforms, perspective, History and mask transactions | The actual artwork needs an unaccepted boundary or reproduces a failure. Retain accepted narrow cases. [E.25 / E.18 / E.11 / E.6](PAINTING-WORK-DETAILS.md#e25) |
| Goal/Loop continuation | The user requests unattended host automation; never enable it automatically. [E.26](PAINTING-WORK-DETAILS.md#e26) |
| Independent evaluation and Critic calibration | Support perceptual claims or stronger critic authority; pending labels do not block ordinary safe painting. [P1-B / P0-D](PAINTING-WORK-DETAILS.md#p1-b) |
| Supplied brush/stamp packs | A real user pack and scene are available. [P0-E.7](PAINTING-WORK-DETAILS.md#supplied-packs) |
| Local warp, wider transactions and pressure profiling | A reproduced need justifies them and native safety prerequisites are met. [E.27](PAINTING-WORK-DETAILS.md#e27) |
| Process video, release, other hosts and optional 3D/perception | Later or specifically requested; these do not block the main painting path. [E.22 and later sections](PAINTING-WORK-DETAILS.md#e22) |

## Repository consolidation — ONE canonical product version (IN PROGRESS)

**Decision:** `digital-painting` is the **single maintained integration/release
branch** at `github.com/lavalava45/paintpilot-mcp`; its checkout is
`E:\Downloads\devspace-test\experiments\photoshop-mcp-digital-painting`.
No permanent RC/develop/fix/integration branch should be deployed alongside
it. Historical versions may remain accessible as **immutable annotated tags,
verified Git bundles and offline evidence**, without being live development
lines. `origin/HEAD` / GitHub default branch should ultimately point to
`digital-painting`. Do **not** equate consolidation with merging abandoned
experimental features or overwriting the first-city baseline.

**Inventory observed 2026-10-15; updated after two authorized cleanups
(re-evaluate immediately before any further deletion):**

| Branch or worktree | Relationship to frozen `3689249` | Disposition after evidence review |
| --- | --- | --- |
| Local + remote `digital-painting` | Canonical baseline, clean and deployed | **KEEP** as the only active branch; later approved changes land through review here |
| Local + remote `archive/post-first-city-20261014` | `fac85ea`, **6** post-baseline commits | **KEEP until** all required patches, tag/bundle checks and restoration work are signed off; then replace branch with an archive tag if retention permits |
| Former local `fix/brush-paint-stall-20261014` | Same tip `fac85ea` as preserved local and remote archive; **zero unique commits** | **DONE 2026-10-15:** redundant local branch and worktree `work/paintpilot-brush-recovery-20261014` removed; no corresponding GitHub branch existed; journals backed up separately |
| Local `archive/retired-beta-rc-20261013` | Diverged (**10 baseline-only / 7 RC-only** commits), not merely an ancestor | **PRESERVE unique RC history** in tag/bundle before proposing removal; do not casually drop those 7 commits |
| Former local `integration/current-project-20261014` | Ancestor of canonical history; **zero unique commits** | **DONE 2026-10-15:** redundant local branch removed |
| Former local `integration/night-refactor-20261014` | Ancestor of canonical history; **zero unique commits** | **DONE 2026-10-15:** redundant local branch and worktree `experiments/paintpilot-refactor-isolation-20261014` removed; diagnostics archived |
| Local `digital-painting-local-history-20260914` | Diverged (**113 baseline-only / 13 local-history-only**) | **PRESERVE 13 unique commits** as a tag/bundle or verify safe irrelevance; only then propose deletion |
| Local + remote `master`, remote `develop` | Old ancestor lines, not the current digital-painting product | **DELETE CANDIDATES**, but audit GitHub protections, external PRs, default branch and provenance first |
| Remote `origin/affix/*`, `origin/docs/*`, `origin/feat/*`, `origin/fix/*` | 2026-10-15 remote-tracking inventory has legacy branches (**16 branch refs**, excluding symbolic `origin/HEAD`) | Review branch ownership / open PRs / unique commits, then propose explicit per-ref remote deletion |

**Completed cleanup receipts (2026-10-15, verified locally and against
GitHub `git ls-remote --heads origin`):**

- `integration/current-project-20261014` (formerly `a9f5867`) and
  `integration/night-refactor-20261014` (formerly `aac7c72`) removed
  **locally** after confirming both tips were ancestors of `digital-painting`.
  The latter worktree was retired. Its ignored diagnostics were preserved at
  `E:\Downloads\devspace-test\_archives\paintpilot-integration-branches-closure-20261015`.
- `fix/brush-paint-stall-20261014` (formerly `fac85ea`) removed
  **locally** after proving byte-for-byte SHA equivalence with
  `archive/post-first-city-20261014` and
  `origin/archive/post-first-city-20261014`. The temporary brush-recovery
  worktree was retired; ignored runtime journals, final canonical test log and
  UXP build marker were saved with SHA-256 hashes at
  `E:\Downloads\devspace-test\_archives\paintpilot-brush-recovery-closure-20261015`.
  An initial Windows `Filename too long` deletion failure was resolved with
  a link-safe Python 3.12 cleanup; verification confirms the primary checkout
  and its dependencies remained intact.
- **GitHub:** `origin/integration/*` and
  `origin/fix/brush-paint-stall-20261014` did **not exist** as remote
  branches, so there was **nothing to delete remotely**. The GitHub archive
  `origin/archive/post-first-city-20261014` remains deliberately preserved
  at `fac85ea`; `origin/digital-painting` remains the one maintained
  integration branch. No history rewrite or force push occurred.
- **Still open:** one detached temporary worktree
  `work/paintpilot-baseline-verify-20261014`, old local/remote refs enumerated
  above and possible foreign/obsolete tracked files. They require separate
  provenance/ownership review; the target of a **single main folder** is **not
  yet fully achieved**.

**Canonicalization sequence and acceptance gates:**

1. **Freeze and inventory (no mutation):** record `git status`,
   `git worktree list --porcelain`, `git branch -avv`, tags, remote refs,
   exact divergence (e.g. `git rev-list --left-right --count HEAD...branch`),
   GitHub PR/protection/default-branch state, and active COS/UXP launch paths.
   Preserve all unrelated or another agent's uncommitted work.
2. **Prove one release source:** decide whether the verified first-city baseline
   `3689249` still passes the user's multi-brief artistic test; **do not**
   promote the newer `fac85ea` silently. Check source/dist build identity,
   running MCP PID/path, loaded UXP SHA, `deployment:health`, and enabled
   COS plugin inventory. There must be **one** intended deploy root.
3. **Archive unique history:** for every candidate branch/worktree determine
   unique commits; create permanent, reviewed annotated tag and independently
   verifiable bundle **before** removal. Keep the patch and ranked catalog
   above. Note `master`/legacy forks may have authorship/provenance value;
   deleting a branch name must not erase history or notices.
4. **Publish exact deletion manifest for approval:** paths/branch refnames
   (local and remote separately), tip SHA, unique-commit count, GitHub PRs,
   owner/worktree occupancy, destination tag/bundle and recovery instructions.
   **Do not delete anything without user approval of this concrete list.**
5. **Remove idle checkout/worktree branches first:** detach/close only after
   checking live agents and `git status`; then remove redundant **local**
   refs and old worktrees. For remote branches, confirm no protected/default
   refs or active PRs; delete explicitly approved refs on `origin`. Keep
   `origin/HEAD` correct; `git remote prune` alone does **not** delete
   remote branches.
6. **Final proof:** `git branch -avv`, `git worktree list`,
   `git remote -v`, `git status`, `git tag --list`, `git fsck`, GitHub
   default/remote ref enumeration, `npm run verify:canonical`,
   `npm run verify:external-intake`, `npm run verify:provenance`,
   `npm run verify:source-independence`, `npm run deployment:health`.
   Archive the before/after manifest and rollback instructions here.

**Definition of done:** exactly **one active maintained/deployed checkout and
one canonical source branch**; no duplicate active release candidates, no
stale COS/UXP paths, no unexplained working branches. Historical tags, bundles
and third-party provenance **remain**. Only the three named redundant local
branches and their two linked worktrees have been removed; **remaining cleanup
is planned, not authorized for automatic branch removal or history rewriting**.

## Foreign / unexplained / obsolete Git files — provenance-first cleanup (PLANNED)

**User request:** explicitly audit “files that aren't ours and somehow got
into Git”, not just branches. Classify **tracked vs ignored, project-owned vs
derived upstream vs valid third-party dependency vs generated evidence**.
An unusual path is a **candidate**, not proof of alien authorship. Preserve
`LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`,
`third-party-components.json`, `licenses/*`, Git lineage, working assets,
PSD/frames/video/process receipts, and others' unstaged edits. Follow
[source-independence audit](source-independence-audit.md),
[selective external intake](external-intake.md) and
[release-policy](release-policy.md); don't manufacture a new licensing policy.

| Audit queue | Exact paths / known context | Required decision before removal |
| --- | --- | --- |
| **A — unsupported README locale stubs** | `README.de.md`, `README.es.md`, `README.ja.md`, `README.tr.md`, `README.zh-CN.md`: currently **tracked again** because restoring `3689249` restored them. They were removed in the **deferred** `f96d4ad` | Verify these are mere unsupported placeholders, no dependent links, translations or licensing commitments; propose *documentation-only* deletion separately, without applying unrelated `f96d4ad` edits |
| **B — historically upstream-derived examples** | `examples/*` (including Claude/Cursor examples); 2026-09-29 source-independence report estimated ~82–83% exact overlap at that time | Re-run present-file provenance, usage/installer tests and upstream attribution check. Replace with new maintained project examples **only if useful**, else propose deleting obsolete copies |
| **C — unmaintained spike scripts** | `scripts/spike-photoshop-actions.ts`, `scripts/spike-2026-features.ts`: 2026-09-29 audit identified formerly upstream-identical experimental scripts; **neither is tracked at the 2026-10-15 baseline** | Treat this as historical cleanup evidence, not as two current deletion targets; confirm absence from build/distribution and revisit only if reintroduced |
| **D — inherited scaffolding/config** | `.prettierrc`, `.env.example`, legacy `mcpb/` metadata and other inherited root files | **Do not assume foreign = removable.** Classify owner, active dependency and environment/packaging impact. Keep required configuration or replace safely |
| **E — large review/evidence packs** | `task8a-review-pack/*` (~1.57 MB, 23 files) and `task23-review-pack/*` (~1.64 MB, 39 files), tracked | These may be **our own test evidence**, not foreign files. Preserve manifests, image hashes and licensing; consider archive or Git release artifact only after links/acceptance and owner sign-off |
| **F — ignored/generated local debris** | `.tmp-*`, `.mcp-preview/`, `.photoshop-runtime/`, `processes/`, `release/`, `dist/`, `node_modules/` | Separate ignored runtime records from tracked content; **never bulk-delete** user PSD, frame, export, logs or Guard journals. Propose only specific reproducible throwaways |
| **G — remaining vendor/upstream surfaces** | Legacy `src/`, `uxp-plugin/`, notices, sample files or manifests flagged by the current `verify:source-independence` or provenance inspection | No sweeping deletion: tests must prove no runtime/UXP dependency and preserve copyright/license obligations. Independent rewrites are a **separate feature proposal**, not a rollback |

**File cleanup procedure:** collect `git ls-files` / `git check-ignore -v`,
per-file `git log --follow` and upstream comparisons where justified; label
each exact path **keep / replace / archive / candidate-remove / uncertain**;
include reason, last owner/commit, test/README dependency, license evidence,
backup destination and estimated affected bytes. Present a dry-run deletion
list and user approval **before** `git rm`, branch deletion, `git clean`,
history rewriting or pushing. Execute only an approved batch, run canonical
and provenance gates, verify README RU/EN links, then update this roadmap
and commit with explicit scope. **No cleanup has been executed by this plan.**

## Keep the plan small

- One change → one directly owning check. Expand only after a failure or at integration/release.
- Judge image claims on actual images; do not present offline checks as live/artistic success.
- No routine permutation matrices, repeated accepted demos or speculative telemetry work.
- Put implementation history in CHANGELOG and task-specific conditions in PAINTING-WORK-DETAILS.
- Preserve owners, protected pixels, exact review, uncertainty/no-replay and explicit user STOP.
- Move a completed action out of the open queue only after preserving its actual evidence.
