# Glama compatibility: release gate

PaintPilot is indexed at https://glama.ai/mcp/servers/lavalava45/paintpilot-mcp.
Registry discoverability is a user-visible requirement, not a disposable marketing experiment.
Before removing, replacing, or simplifying Glama-facing code, verify the registry can still build and introspect the server.

## Preservation history

The four commits from `chore/glama-introspection` (2026-10-25) are part of the compatibility baseline:

- `de9bde7` — Linux-safe offline MCP introspection, Dockerfile, glama.json and tests.
- `665bbd9` — consistent license hashes and line endings across platforms.
- `bfe8d7c` — native paths in cross-platform Smart Object test fixtures.
- `a117cb9` — full Git history in CI for source-independence verification.

These changes were already consolidated into main branch commit `c6d38e4` (PR #1).
The same ten changed paths have identical Git blobs in `digital-painting` and `chore/glama-introspection` as checked on 2026-10-28; differences in working-tree CRLF/LF are not differences in committed content.
Do not cherry-pick the four commits again without checking for actual missing changes.
Do not delete the separate branch or remove the above safeguards just because its commits have different hashes from the squash commit.

## Acceptance requirements

1. A clean Linux-based Docker build succeeds using the repository Dockerfile, without Photoshop.
2. In a Linux environment, the built `dist/index.js` starts over stdio without Photoshop and supports MCP initialization, tools/list and prompts/list, and prompt retrieval. It must expose nonempty valid tool schemas.
3. Windows production Photoshop operations still fail closed without the local UXP companion. Linux introspection support must not become permission to execute Photoshop mutations on Linux.
4. Preserve `glama.json`, `Dockerfile`, `.dockerignore`, `.gitattributes`, licensing metadata, Linux-safe discovery and CI full-history checkout, or provide tested replacements.
5. Ensure package/release integrity, no missing relative imports and no unsupported or unsafe tool behavior.
6. After publication check the actual Glama server listing and scan status; a passing local test alone does not prove acceptance by Glama.

## Local checks

Run on the main branch after building, without invoking Photoshop operations:

```sh
npm run build:server
node scripts/dev/test-offline-introspection.mjs
pnpm exec vitest run src/platform/discovery-runtime.test.ts tests/image-smart-object-domain-contract.test.ts
npm run verify:pack
npm run verify:source-independence
npm run lint
```

The repository's `.github/workflows/verify.yml` additionally runs offline MCP introspection on Ubuntu after `verify:canonical`. These checks must remain part of the release/CI process.
Run the Docker build in a Linux CI environment or Docker host; verify the current listing/scan after pushing. Do not infer Docker acceptance from the Windows tests.

## 2026-10-28 evidence and limits

- Public Glama listing: PaintPilot / lavalava45, 39 indexed tools, quality A; last observed Glama scan timestamp on the page is 2026-10-25.
- All ten Glama integration files are byte-identical as Git blobs between the two branches.
- Main local offline introspection: 39 tools, 5 prompts, zero Photoshop tool invocations; passed.
- Targeted Linux-path/Smart Object tests: 9/9 passed on Windows; tests emulate platform boundaries, not a native Linux Docker build.
- `verify:pack` and `verify:source-independence`: passed.
- `lint`: exit 0 with existing warnings.
- The Windows checkout was moved in October 2026; 615 stale `node_modules` junction targets were repaired to the canonical PaintPilot directory before retesting.
- Docker CLI was not present on the local machine; image build and Glama's next remote rescan have not been independently reproduced.

**Closure rule:** leave `chore/glama-introspection` in Git history, preserve the catalog-facing behavior on `digital-painting`, and only retire the extra local worktree after Docker/Linux CI and registry checks are confirmed. Retirement of the local working directory must never delete the branch or its commits.
