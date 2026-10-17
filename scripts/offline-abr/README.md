# Offline ABR tip references (diagnostic only)

The vendored `vendor/brushbox-abr.cjs` is from Stef4678/brushbox,
commit `ac4531d0dde2919c056ded2705478147ae6da100`, licensed MIT
(full notice: `vendor/LICENSE`). Upstream: https://github.com/Stef4678/brushbox

Run `node scripts/offline-abr/reference.cjs path/to/brushes.abr`.
It reads local files only, uses no external executable, and never accesses Photoshop.
Its JSON output omits raw alpha pixels but includes dimensions and exact alpha SHA-256.

Sampled masks (including available secondary dual-brush masks) are decoded
directly from the ABR. Computed brushes have **no
stored bitmap** and are reported `computed-descriptor-only` even when their
shape parameters are known. Dual-brush effects, texture, dynamics, interpolation
and rotation are **not** simulated. Exact mask mismatch can disqualify a tip;
exact agreement reports only `consistent-only`, never verified identity.
The routine does not authorize a Guard preflight or brush mutation.
