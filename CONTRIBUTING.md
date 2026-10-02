# Contributing to Photoshop MCP — Digital Painting Edition

Thank you for your interest in contributing! This is a community-maintained project and is not affiliated with or endorsed by Adobe Inc.

> **Project identity:** this repository is independently maintained at
> `lavalava45/photoshop-mcp-digital-painting`. Historical origin and upstream distribution
> separation are documented in [`NOTICE`](NOTICE). Do not publish this project's builds under
> another project's npm scope, MCP Registry id, website, or author branding.

## Language policy

This project uses **English** as its canonical language for all project artifacts:

- **Pull request titles, descriptions, and commit messages** must be written in English.
- **Source code, comments, and user-facing UI strings** must be written in English.
- **Documentation** (README, guides, inline docs) must be written in English.

Issues and review comments may be written in any language, but English is preferred so maintainers and future contributors can search and reference them easily.

## Before you start

1. Search [project issues](https://github.com/lavalava45/paintpilot-mcp/issues) and [pull requests](https://github.com/lavalava45/paintpilot-mcp/pulls) to avoid duplicate work. Check historical upstream separately when useful for provenance or comparison.
2. For large or architectural changes, open an issue first to discuss the approach.
3. For bug fixes and small improvements, a PR without a prior issue is fine.

## Development setup

### Prerequisites

- **Node.js** ≥ 18
- **npm**
- **Adobe Photoshop** installed and scriptable (required only for integration tests)

### Getting started

```bash
git clone https://github.com/lavalava45/paintpilot-mcp.git
cd photoshop-mcp-digital-painting
pnpm install --frozen-lockfile
npm run build
```

## Distribution and releases

This project is source-distributed from
[lavalava45/photoshop-mcp-digital-painting](https://github.com/lavalava45/paintpilot-mcp)
and is normally used through a local stdio build. It currently has **no public npm
package, no MCP Registry entry, and no directory-listing release flow**.

The repository intentionally does not contain GitHub Actions that publish to npm,
the MCP Registry, Smithery, Glama, or other third-party catalogs. Do not add
credentials or publishing commands for unrelated/historical distribution identifiers to this project.

For a source release of the project:

1. Run the validation suite documented below.
2. Update the project's changelog/version metadata if a tagged GitHub source release is desired.
3. Keep `server.json`, `mcpb/manifest.json`, package metadata, links, and release notes
   under the project's own `lavalava45/paintpilot-mcp` repository identity.
4. Create/push a Git tag or GitHub Release only under this repository. No external
   registry publication is implied by a GitHub tag.

The original project's release and registry procedures belong to
[alisaitteke/photoshop-mcp](https://github.com/alisaitteke/photoshop-mcp). Consult
that repository when auditing upstream changes; do not copy its distribution
credentials or identifiers into this project. See `NOTICE` for provenance.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/` | MCP server core, Guard, semantic tools, prompts and platform routing |
| `scripts/` | Integration and verification test scripts |
| `docs/` | Additional project documentation |

See [`docs/architecture.md`](docs/architecture.md) for a detailed breakdown.

## Making changes

1. Branch from `master`.
2. Keep diffs focused — avoid unrelated refactors in the same PR.
3. Follow existing patterns:
   - MCP tools in `src/tools/`
   - Prompt templates in `src/prompts/templates/`

### External/upstream source intake

Do not wholesale merge historical upstream changes into the maintained architecture. For any
non-trivial selective port from `alisaitteke/photoshop-mcp` or another external source, record in the
PR/change evidence:

- source repository and exact commit/tag/PR;
- the current project problem, compatibility need, or measured value that justifies intake now;
- affected project paths that received the port or adaptation;
- whether source text was copied, substantially adapted, or independently reimplemented;
- any license/copyright/notice obligations that must travel with the change.

Retain required third-party notices whenever future external source intake creates such an
obligation. The root `LICENSE` describes the current independently maintained project; historical
origin remains in [`NOTICE`](NOTICE). See [`docs/external-intake.md`](docs/external-intake.md) for
the maintained intake decision workflow. An external release or upstream branch advance is not, by
itself, a reason to merge, rebase, version-bump, or publish this project.

## Code style

- **TypeScript** with strict mode enabled (`tsconfig.json`).
- **ESLint:** `npm run lint`
- **Prettier:** `npm run format:check` (check) or `npm run format` (auto-fix)

Match the style of surrounding code. Prefer extending existing abstractions over introducing parallel patterns.

## Testing

Tests are tiered by whether Photoshop must be running:

### Required (no Photoshop needed)

```bash
npm run verify:canonical
```

Run this before every PR. It performs a clean server build, verifies the package surface,
runs lint and the complete source Vitest acceptance inventory, checks acceptance-matrix
test references for drift, and runs the compact-v2, painting-policy, prompt and tool-count
verifiers.

`npm run format:check` is currently **advisory/non-gating** while the inherited repository
format baseline is being normalized. Do not treat a repository-wide Prettier failure as a
canonical verification failure unless formatting is explicitly promoted into
`verify:canonical`.

### Recommended (Photoshop must be running)

```bash
npm run test:mcp-local    # prompt-layer smoke tests
npm run test:measurement-tools
npm run test:document-targeting-live
```

Integration tests communicate with a live Photoshop instance over stdio — the same path used by Cursor and Claude Desktop. Note which tests you ran in your PR description.

## Pull request checklist

- [ ] PR title, description, and commit messages are in **English**
- [ ] Code comments and user-facing strings are in **English**
- [ ] `npm run verify:canonical` passes
- [ ] Integration tests run (if applicable — requires Photoshop)
- [ ] Screenshots attached for UI changes

A [pull request template](.github/pull_request_template.md) is provided automatically when you open a PR on GitHub.

## Reporting bugs

Open a [project GitHub Issue](https://github.com/lavalava45/paintpilot-mcp/issues) and include:

- Windows version
- Photoshop version
- Node.js version
- Steps to reproduce
- Expected vs. actual behavior
- Relevant log output (`LOG_LEVEL=0` for debug)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
