# Painting Quality Roadmap

Last updated: 2026-10-15

**Scope:** ONLY pending work, decisions, acceptance criteria and preservation
rules. Implemented changes, completed cleanups and dated engineering evidence
belong in [CHANGELOG](../CHANGELOG.md). Source-specific acceptance criteria
are in [PAINTING-WORK-DETAILS](PAINTING-WORK-DETAILS.md), with current evidence
in the [acceptance matrix](roadmap-final-acceptance-matrix.md).

**Product target:** better images sooner, with the user's subject, style and
creative freedom preserved. [Release Hardening](RELEASE-HARDENING.md) remains
the finite qualification gate for real-pixel quality, safety, recovery,
autonomy and independent assessment on six registered scenes. Do not
misinterpret successful offline tests as completed artistic acceptance.

## Priority 0 — qualify the original first-city creative environment

- [ ] **Independent live artistic acceptance:** compare a newly painted pink
  floating-ninja city against the historic 2026-10-14 process, at equivalent
  frame counts and elapsed time. Check recognizable composition, early
  whole-frame progress, true marker strokes, pink palette, bridge/island
  structure, independent layers, Guard rejection rate and artistic finish.
- [ ] **Controlled configuration:** start a *new Photoshop document and new art
  run* with the exact original brief; for this **comparison run only**,
  explicitly request painting_profile: simple_graphic and verify its saved
  value before the first paint operation. Do not change the global default,
  COS configuration, historic session or original creative constraints.
- [ ] **Generalization:** independently qualify the original artist on
  different user prompts, including a complex scene, before claiming a
  general creative-environment restoration. Distinguish prompt difficulty,
  profile choice, model autonomy and runtime differences from source-code
  regressions. The historic MCP PID's exact loaded build fingerprint is
  unknown and must not be asserted.
- [ ] **Preserve evidence:** retain original process
  processes/flying-pink-ninja-city-process/20261014-marker-city, its frames,
  art journals and Guard state; protect Photoshop History/PSD and user
  archives. Coordinate with the other artist agent before changing runtime.

**Reference code:** immutable first-city Git anchor **3689249**; retained
baseline tag **artist-first-city-baseline-20261014**. Later documentation
commits do not authorize source or artist-policy changes.

## Deferred review — post-first-city changes (all pending, no cherry-picks)

The frozen six-commit range **3689249..fac85ea** affects 33 paths.
The items below are **future choices**, not accepted enhancements or a merge
sequence. Evaluate one isolated change at a time, after live artistic
qualification; retain the first-city baseline for comparison.

| Review order | Pending decision / acceptance |
| --- | --- |
| 1 — documentation and provenance | Review f96d4ad: Windows paths, product identity, notice line endings and unsupported locale placeholders. Validate licenses/README links independently; do not import unrelated edits. |
| 2 — Guard evidence | Assess a3799e4 and 5fdd340 for cumulative-priority and exact whole-image-glance durability. Prove correct real workflow, no stalled Director or extra technical rounds. |
| 3 — native brush correctness | Assess the technical part of fac85ea: Photoshop brush preset readback, fallback and installed-preset proof. Confirm actual varied strokes and no avoidable fail-closed stalls. |
| 4 — preparation/stall recovery | Assess fac85ea Guard/session preflight and repeated-stall handling against live painting throughput, History safety, and visible whole-frame progress. |
| 5 — **highest artistic risk** | Review aef5269 tonal_regions, 7392a44 recognition prompt and fac85ea artistic/Director instructions only with blind, multi-prompt visual A/B. Reject sterile block-in or new mandatory creative strategies. |

**Full evidence and exact patch (retained, not applied):**
[ordered 33-path catalog](painting-baseline-20261014/POST_BASELINE_CHANGES_SORTED.md),
[binary-safe cumulative patch](painting-baseline-20261014/ALL_CHANGES_AFTER_FIRST_CITY.patch),
[six individually attributable patches](painting-baseline-20261014/patches/),
[first-run environment audit](painting-baseline-20261014/FIRST_CITY_ENVIRONMENT_AUDIT.md),
[commit/file indexes and build logs](painting-baseline-20261014/),
[SHA-256 manifest](painting-baseline-20261014/ARTIFACTS.sha256).
The full-history bundle is at
E:/Downloads/devspace-test/_archives/paintpilot-first-city-baseline-20261014/POST_FIRST_CITY_FULL_HISTORY.bundle;
all six commits remain reachable through the local and GitHub annotated tag
**[artist-post-first-city-20261014](https://github.com/lavalava45/paintpilot-mcp/tree/artist-post-first-city-20261014)**
(target `fac85ea`). Keep the tag, bundle, catalog and exact patches available
until review of the deferred changes and archive-retention decisions is complete.

## 1. Make criticism lead to a real correction

- [ ] Re-run the pagoda line-first brief. Judge thin architectural contours,
  early recognition, independent parts and the whole image, rather than
  accepting geometry/preflight command success.
- [ ] On a real Critic/Director defect, produce a **visible** structure,
  material or light correction through the proper priority/prerequisite
  route, including after save and retained Critic re-evaluation. Keep
  unrelated scene/global debt open. Avoid repeated identical corrections.
- [ ] Re-evaluate the Mykonos scene on real pixels for negative-space/
  composition and occlusion/depth before further paving.
- [ ] Test a bounded correction addressing a Critic problem plus a Director
  global target: verify correct ownership/scale, no duplicate primary-
  mismatch rejection and a visible composition gain.
- [ ] Compare retained tiger/structural cases before and after changed
  geometry; preserve owner mappings, legitimate concave/hole topologies,
  protected pixels and independent corrective access.
- [ ] Mark this outcome accepted only when saved defect cases show a
  substantive whole-image gain without losing protected qualities.

[Technical criteria E.7f / E.24 / E.7h](PAINTING-WORK-DETAILS.md#e7f)
and [component-rendering contract](component-rendering.md).

## 2. Keep meaningful parts independently editable

- [ ] Live-check facade/environment and multi-component cases for real
  Photoshop layer topology, protected ownership and independent corrections.
  A named building/person must not conceal multiple independently editable
  parts in one semantic component; inseparable accents may share a layer.
- [ ] Prove that correction preserves unrelated components and that normal
  multi-contour strokes of one component remain legal.
- [ ] Accept only with real pixel/layer comparisons on the retained cases.

[Technical criteria E.7g](PAINTING-WORK-DETAILS.md#e7g).

## 3. Improve form, light, materials and contact shadows

- [ ] On actual images, verify turning form, authored surface light response,
  material behavior, weight and grounded cast/contact shadows before texture.
- [ ] Compare whole-frame before/after visually on several styles; valid
  2.5D geometry, a shadow operation or a successful brush call is not enough.
- [ ] Preserve subject/style fidelity; investigate broader physical modeling
  only when the retained scene demonstrates a specific need.

[Technical criteria E.7e / E.7f / E.19](PAINTING-WORK-DETAILS.md#e7e).

## 4. Keep returning to the original task

- [ ] At Critic, recovery and continuation boundaries, verify that the
  complete original brief and still-unmet requirements guide the **next**
  substantive action, including after save.
- [ ] Check that local micro-successes and delivery receipts do not cause
  premature completion or repetition of the same unchanged image.
- [ ] Accept with retained full-brief recovery cases and real continuation
  toward substantive missing requirements.

[Technical criteria E.7f](PAINTING-WORK-DETAILS.md#e7f).

## 5. Spend less time negotiating, more time improving the picture

- [ ] Measure first pixel, real refusals per useful change, review latency,
  recovery time, and image gain at equal elapsed time on one representative
  live run; evaluate native brush identity, successful probe, stalled
  preparation, partial layer creation and uncertain operation recovery.
- [ ] Confirm Photoshop History/rollback, correct document/layer owner,
  replay uncertainty and protection remain intact. Test after an authorized
  plugin refresh at a safe boundary, not by unrequested COS restart.
- [ ] Compare a fresh inline review/continuation cycle to the retained tiger
  trace; no offline speedup claim qualifies until measured on real pixels.
- [ ] Fix a *measured* bottleneck, keep the change isolated, then repeat the
  same quality/throughput comparison. Avoid speculative telemetry and
  exhaustive permutations.

[Technical criteria E.8](PAINTING-WORK-DETAILS.md#e8).

## Conditional and later work (not started or not accepted)

| Open topic | Trigger / acceptance |
| --- | --- |
| Runtime exposure, reconnect, uncertain-operation recovery | A real failure blocks normal safe painting. [E.24 / E.17 / E.8c](PAINTING-WORK-DETAILS.md#e24) |
| Further perspective, transforms, History and mask transactions | Specific live defect and native safety evidence. [E.25 / E.18 / E.11 / E.6](PAINTING-WORK-DETAILS.md#e25) |
| Goal/Loop continuation | Explicit user request, never automatic enablement. [E.26](PAINTING-WORK-DETAILS.md#e26) |
| Independent artistic evaluation / Critic calibration | Real multi-scene human labels and perceptual acceptance. [P1-B / P0-D](PAINTING-WORK-DETAILS.md#p1-b) |
| Supplied brush/stamp packs | Actual user-provided pack plus art need. [P0-E.7](PAINTING-WORK-DETAILS.md#supplied-packs) |
| Local warp, extended transactions, pressure studies | Reproduced benefit and native safeguards. [E.27](PAINTING-WORK-DETAILS.md#e27) |
| Process-video release, optional hosts and 3D/perception | Explicit later request, not a block to painting quality. [E.22](PAINTING-WORK-DETAILS.md#e22) |

## Canonical Git and filesystem consolidation — remaining work only

**Target:** one permanent maintained local branch and checkout:
**digital-painting**, in
E:/Downloads/devspace-test/experiments/photoshop-mcp-digital-painting.
Temporary experiments must use uniquely named worktrees and branches, with
mandatory cleanup after test acceptance. Preserve historical commits through
tags/bundles, not permanent competing development branches.

- [ ] **Inventory and preserve unique history** of local
  archive/retired-beta-rc-20261013 (seven branch-only commits at initial
  comparison) and digital-painting-local-history-20260914 (13
  branch-only commits at initial comparison). Verify each live SHA and
  provenance, create permanent archival tag/bundle and recovery proof.
- [ ] **Preserve and decide the two remaining divergent GitHub branches:**
  `affix/readme-i18n-8c08` (16 unique commits, tip `934669d`) and
  `docs/consolidate-readme` (1 unique commit, tip `60e7756`).
  Review their provenance and relevant historical content, create verified
  archival tags/bundles, then propose a separate decision about deleting the
  branch names. Neither branch is currently approved for deletion.
  Exact remote history and branch-deletion receipts are archived at
  `E:/Downloads/devspace-test/_archives/paintpilot-temp-folders-closure-20261015/`.
- [ ] **One deployed runtime:** verify COS plugin launch path, MCP build
  fingerprint, loaded UXP source and Git checkout agree after future
  deployments. Do not infer creative equivalence from deployment health.
- [ ] **Obtain per-batch approval**, retire idle worktrees, delete only
  approved branch refs (local and remote), check GitHub default and origin/HEAD,
  run git fsck and canonical/provenance/deployment gates, and record the
  actual results in CHANGELOG. Do not rewrite history or force push.

**Definition of done:** only the maintained digital-painting checkout/branch
is in daily use; no active duplicate release candidates or extra worktrees.
Historical commits and third-party provenance remain reachable through
retention artifacts. Branch names marked for review above are **not** an
approval to delete them.

## Foreign, unexplained or obsolete tracked files — cleanup still open

- [ ] **Unsupported locale README stubs:** examine README.de.md,
  README.es.md, README.ja.md, README.tr.md and README.zh-CN.md for actual
  content, references and provenance. Propose their removal separately
  from deferred post-first-city commits; preserve real RU/EN docs.
- [ ] **Upstream-derived examples:** audit current examples/* for source
  overlap, project applicability, documentation consumers and license
  requirements. Retain useful owned examples, replace or propose removal
  of obsolete copies.
- [ ] **Inherited config and manifests:** audit .prettierrc, .env.example,
  mcpb/ metadata and other root scaffolding for retained functional use;
  classify before proposing removal.
- [ ] **Review/evidence packs:** assess task8a-review-pack/* and
  task23-review-pack/* for provenance, independent evaluation value,
  hash-verified assets and publication suitability. Never destroy the only
  copy of evidence.
- [ ] **Generated/ignored local residue:** distinguish temporary build
  outputs from the artist's .photoshop-runtime/, processes/, PSDs, videos,
  frames, logs, exports and Photoshop histories. Propose exact files only;
  never run broad git clean across user evidence.
- [ ] **Remaining foreign/vendor source:** inspect only files justified by
  the source-independence/provenance reports. Preserve LICENSE, NOTICE,
  THIRD_PARTY_NOTICES.md, third-party-components.json and licenses/*,
  along with appropriate attribution.

**Procedure:** per path, use git ls-files, git check-ignore, git log --follow
and a verified upstream comparison if needed. Classify as keep, replace,
archive, remove candidate or unknown. Produce a deletion manifest with
owner/commit, reference checks, license duties, backup and recovery path;
request approval before any git rm, history edit, branch deletion or push
affecting source. Re-run relevant checks and document completed changes in
CHANGELOG, not as closed items here.

[Existing source-independence audit](source-independence-audit.md) ·
[Selective external intake](external-intake.md) ·
[Release policy](release-policy.md).

## Operating rules

- One demonstrable problem, one targeted change and one owning check.
- Judge art quality from original prompts and real images; offline tests
  alone cannot close artistic acceptance.
- Preserve independent layer owners, protected pixels, exact review and
  uncertainty/no-replay; respect explicit user STOP.
- On completing an item, **remove it from this roadmap and put actual
  changes, tests and deployment evidence in CHANGELOG**.
