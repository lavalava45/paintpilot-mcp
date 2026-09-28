# Compact v2 verifier contract

Date: 2026-09-26
Scope: retained verifier artifact for completed roadmap task 13b.

**13b behavior accepted.** Current implementation/live status is authoritative in
[`roadmap-final-acceptance-matrix.md`](roadmap-final-acceptance-matrix.md); this file exists only to
preserve the compact-v2 deletion/migration invariants consumed by
`scripts/verify-compact-v2-contract-audit.mjs`. Migration-era analysis and superseded blockers live
in Git history.

## 1. State-transition table

| State / fact | Canonical owner | Required next action |
| --- | --- | --- |
| No pending work | embedded Guard | accept one compact `next_pass` |
| Previous visual operation pending review | Guard journal + visual barrier | close with `previous_operation_id + previous_observation`; optionally continue with a new `next_pass` |
| Async job active | embedded Guard job store | poll the same durable job; never launch replacement mutation work |
| Dispatch outcome uncertain | Guard journal / durable UXP receipt | recover/reconcile exact state; never blind-replay |
| UXP companion unavailable or revision-mismatched | backend readiness gate | fail closed with `uxp_bridge_unavailable` before semantic Photoshop dispatch |
| Removed public compact-v1/full-cycle field supplied | compact compiler boundary | reject before dispatch with `legacy_contract_removed` |
| Visual mutation completed | Guard visual barrier | exact delivered evidence must be observed/classified before the next visual mutation |
| Completed compact closure | Guard/session store | preserve independent technical/artistic/global outcome state |

The model-facing normal route is `photoshop_guard_cycle_auto`. Internal compiled state may still use
legacy-named structures, but those names are not public authoring options.

## 2. Round-trip ledger

| Scenario | Public compact shape | Invariant |
| --- | --- | --- |
| First bounded pass | `photoshop_guard_cycle_auto(next_pass)` | one guarded dispatch request |
| Healthy continuation | `previous_operation_id + previous_observation + next_pass` | closure and continuation stay in one compact call |
| Healthy finalization | `previous_operation_id + previous_observation` | no standalone report/ack/verdict detour |
| Async execution | one start + same-job polls | polling does not authorize duplicate mutation |
| Uncertain execution | recovery read(s) + reconcile | exact evidence/receipt resolves uncertainty; no replay |
| UXP readiness failure | failed pre-dispatch request | restore compatible companion readiness; do not fall back to legacy transport |

## 3. Schema ownership matrix

| Contract | Current status |
| --- | --- |
| `next_pass` | canonical public model-authored mutation request |
| `previous_operation_id` | canonical public pointer to the operation being closed |
| `previous_observation` | canonical model-authored artistic observation/closure input |
| `next_operation` | internal compiled/state representation only; raw public use rejected |
| `previous_report` | internal technical closure representation only; raw public use rejected |
| `previous_operation_ack` | internal durable acknowledgement representation only; raw public use rejected |
| `previous_visual_verdict` | internal expanded verdict representation only; public callers use `previous_observation` |
| `execution_outcome` | current Guard-owned technical outcome projection |
| `artistic_outcome` | current Guard-owned artistic outcome projection |
| `global_brief_outcome` | current whole-brief outcome projection; independent from local artistic resolution |
| `comparison_metric` | current comparison evidence state; may be unavailable without erasing bounded artistic judgment |
| `strategy_signature` | not a public model-authored compact field; structural strategy-change policy remains runtime-owned |

Public raw legacy fields above must fail with `legacy_contract_removed`; they must never be silently
adapted into a second public contract.

## 4. Exact deletion / migration manifest

| Surface | Disposition |
| --- | --- |
| standalone `photoshop_guard_report` | **DONE / DELETED** from public tool catalog; internal report state remains Guard-owned |
| standalone `photoshop_guard_ack_operation` | **DONE / DELETED** from public tool catalog; exact durable acknowledgement remains internal |
| standalone `photoshop_guard_verdict` | **DONE / DELETED** from public tool catalog; compact observation expands internally |
| external controller CLI / daemon path | **DONE / DELETED** from canonical production route |
| `PersistentMcpClient` daemon client | **DONE / DELETED** from maintained production path; Git history is archival evidence |
| raw `photoshop_execute_script` public mutation route | **DONE / DELETED** |
| production ExtendScript/COM semantic fallback | **DONE / DELETED**; production router is UXP-only / fail-closed |
| revisionless/stale UXP readiness | rejected; exact bridge revision is required |

Deletion does not mean internal journal fields with legacy names must be renamed if they remain
non-public and are still required for durable recovery.

## 5. Artist/Planner → Compiler → Guard → Critic ownership matrix

| Layer | Owns | Must not own |
| --- | --- | --- |
| Artist / Planner | artistic goal, bounded semantic pass, observed artistic change | receipt tokens, transport fallback, invented Photoshop capabilities |
| Compact compiler | normalize `next_pass`, derive conservative executable structure, reject removed public fields | artistic success claims |
| Guard / SessionStore | admission, journaling, no-replay, barriers, durable outcomes, recovery, checkpoints | fabricate model visual observation |
| Photoshop backend | UXP-only semantic execution with pinned targets | alternate legacy replay |
| Critic / observation layer | actual frame interpretation, local artistic outcome, uncertainty | technical receipt truth or global completion without evidence |

## 6. Capability-snapshot contract

The capability boundary must expose enough information to decide whether the current compact route is
safe without source/schema discovery. At minimum the maintained runtime contract covers:

- compact Guard protocol version;
- runtime-state version;
- expected and actual UXP bridge revision/readiness;
- raw mutation bypass state;
- registered semantic capability availability;
- fail-closed behavior when required UXP capability is unavailable.

A missing/stale companion is not a degraded permission to dispatch elsewhere: the production result is
`uxp_bridge_unavailable`.

## 7. Top blockers ordered by first/next meaningful-paint impact

There is **no open 13b implementation blocker** in this artifact. Task 13b is accepted.

Any current forward work, live-only gate or human artistic acceptance belongs in
`PAINTING-ROADMAP.md` / `roadmap-final-acceptance-matrix.md`, not in this completed migration audit.
In particular, the presence or absence of a future named `strategy_signature` must not be inferred
from this historical verifier artifact.

## 8. Executable regression scenarios

The retained verifier contract requires regression coverage for these behaviors:

1. raw `next_operation`, `previous_report`, `previous_operation_ack` and
   `previous_visual_verdict` are rejected before dispatch with `legacy_contract_removed`;
2. `photoshop_guard_report`, `photoshop_guard_ack_operation` and
   `photoshop_guard_verdict` are absent from the public catalog;
3. compact continuation closes the prior operation and advances with one public call;
4. claimed/uncertain UXP work is recovered under the same durable command identity, never redispatched;
5. missing/stale UXP readiness fails closed with `uxp_bridge_unavailable`;
6. current outcome projection keeps `execution_outcome`, `artistic_outcome` and
   `global_brief_outcome` distinct;
7. `comparison_metric` degradation does not silently promote or overwrite artistic/global outcome;
8. generated tool/backend inventory remains synchronized with the current public catalog.

## 9. Stale instruction audit

Maintained model-facing docs/prompts must not recommend removed public closure/full-operation routes.
The verifier scans maintained surfaces for:

- public use of `next_operation`;
- public use of `previous_report` / `previous_operation_ack` /
  `previous_visual_verdict`;
- normal-path calls to `photoshop_guard_report`, `photoshop_guard_ack_operation` or
  `photoshop_guard_verdict`;
- wording that reintroduces a legacy/full Guard contract as the normal route.

Catalog counts are intentionally verified only by `verify:tool-counts`, which derives them from
TypeScript source and avoids duplicating numeric expectations in this compact-contract verifier.

Historical/internal/test references are allowed only where they prove rejection, retirement or durable
internal-state behavior.

## 10. 13b acceptance status

**13b behavior accepted; required audit artifacts and behavior gates are now accepted.**

The maintained proof boundary is:

- this compact verifier artifact for structural/deletion invariants;
- `roadmap-final-acceptance-matrix.md` for current acceptance status;
- `available-tools.md` for current generated backend/access status;
- source tests for actual compact rejection, recovery, UXP-only routing and outcome behavior.

Superseded migration tables, old implementation blockers, phase-by-phase migration notes and duplicate
ownership analysis are intentionally retained only in Git history.
