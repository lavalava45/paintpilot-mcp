# Selective External Source Intake

This project reviews external code, documentation and ideas selectively. Upstream is an optional
external source for discovery and comparison, not a synchronization authority or release baseline.

## No synchronization baseline

Normal development, build, test, packaging and release work must not require an `upstream` remote or
another repository checkout. Do not wholesale merge or rebase historical upstream history into the
canonical project branch merely to keep pace with another project. A comparison remote may exist
locally when useful, but its presence is optional.

## Intake record

For every non-trivial external candidate, record enough evidence in the PR/change description to make
the decision auditable:

- source repository and exact source revision, tag, or pull request;
- the current project problem, compatibility need, or measured value that justifies intake now;
- affected project paths;
- intake mode: copied, substantially adapted, selectively cherry-picked, or independently
  reimplemented;
- architecture fit, including whether the source assumes any retired controller, COM/ExtendScript,
  legacy recipe, UI/analytics, cross-platform, or synchronization-oriented architecture;
- license/copyright/notice obligations and where required notices are preserved;
- focused tests plus the repository gates used to validate the result.

Trivial factual references or ideas that do not copy or substantially adapt source text do not need a
full intake record, but must still respect applicable licensing and attribution requirements.

## Decision procedure

1. **Start from a current need.** Do not intake a change solely for parity with another repository.
2. **Inspect the candidate change in isolation.** Evaluate the exact diff/commit against the current
   Guard/UXP architecture and maintained product surface.
3. **Choose the least coupled implementation mode.** Prefer independent reimplementation or adaptation
   when the source assumes architecture retired here. A selective cherry-pick is acceptable only when
   the individual change is architecture-compatible and its provenance remains explicit.
4. **Reject synchronization pressure.** Do not turn an upstream tag, branch advance, or release into an
   automatic merge, version bump, compatibility promise, or release trigger.
5. **Validate as project code.** External changes receive the same current tests, review and acceptance
   requirements as project-authored changes.
6. **Record provenance where it matters.** Preserve required notices and document non-trivial ports in
   the change evidence and release notes when user-visible.

## Required validation

For a non-trivial selective intake, run the focused tests for the affected area and, before acceptance,
run:

```bash
npm run verify:external-intake
npm run verify:source-independence
npm run verify:provenance
npm run verify:canonical
```

`verify:external-intake` protects the maintained workflow from drifting back toward routine upstream
synchronization. `verify:source-independence` protects the production source boundary. `verify:provenance`
protects attribution/license continuity. None of these gates require an `upstream` remote.

## Relationship to provenance

[`NOTICE`](../NOTICE) remains the canonical historical-origin and attribution document.
[`CONTRIBUTING.md`](../CONTRIBUTING.md) defines contributor-facing evidence requirements. This document
defines the maintained decision workflow for deciding whether an external change should enter the
project at all.
