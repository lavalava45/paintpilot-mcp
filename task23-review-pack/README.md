# Task 23 blinded human review pack

This directory materializes the remaining human-required Task 23 acceptance gate.

All five cases are now bound to exact SHA-256 identified BEFORE/AFTER frames. The three negative
controls were deliberately constructed through the canonical Guard -> UXP Photoshop route; their
operation ids and construction method are frozen in pack-manifest.json.

human-labels.blank.json intentionally contains no verdicts. Automated workers must not fill it on
behalf of an independent human evaluator.

The source manifest and filenames are producer-side evidence and are **not** evaluator-facing because
they expose positive/negative control identities and construction cues. Give an evaluator only
`task23-blinded-evaluator-bundle.zip` (the materialized contents are also in
`blinded-evaluator-pack/`). The neutral case mapping is kept separately in
`blinding-map.private.json` and must not be disclosed until the completed human form is returned.

The image pack is materialization-complete but Task-23 acceptance is not complete until an independent
blinded evaluator fills the labels and those labels satisfy docs/visual-evaluation.md section 12.

The first human answers were returned on 2026-09-27 and are preserved in normalized form at
`human-labels.received-20260927.json`. They predate any case-level aggregation rule, so they are not
retroactively converted into a PASS/FAIL by vote counting. They correctly reject the three negative
controls and do not force the flat/stylized control toward realism, but the positive case includes
`NO` for edge hierarchy and `N-A` for secondary forms. The returned answer block also omitted the
evaluator identity, review date and explicit independence attestation fields from the original form;
those are preserved as unknown rather than reconstructed. Task 23 therefore remains open.

For any repeat human round, use the predeclared non-retroactive
`aggregation-rule.v2.json`: all applicable required positive criteria must pass; N-A is allowed only
when the target/style contract makes a criterion genuinely inapplicable.

An external blinded model review from Gemini is preserved in
`external-model-review.gemini.json`. It is supporting evidence only: it does not satisfy or replace
the independent-human acceptance gate.
