# Third-party components and algorithm attribution

Last updated: 2026-10-09

PaintPilot owns its adapters and integration code. The libraries below retain their upstream authorship and licenses; the repository MIT license does not replace these licenses. [Machine-readable registry](third-party-components.json) records exact installed versions, source revisions, usage paths, and SHA-256 of retained notices/evidence. The pnpm lockfile records resolved package integrity.

| Direct production dependency | Authors / attribution | Package license | Actual use |
| --- | --- | --- | --- |
| `clipper2-ts@2.0.1-18` | Angus Johnson (original Clipper2); Jeremy Tribby (TypeScript port) | BSL-1.0 | Even-odd outer contour normalization; union and subtraction of explicit exclusions; inward offset for each brush radius. No triangulation or benchmark assets. |
| `bezier-js@6.1.4` | Pomax | MIT | Cubic construction contours split adaptively at 0.25-pixel flatness; local declarations cover only the used API. Dependency source is imported unchanged. |
| `@modelcontextprotocol/sdk@1.30.0` | Anthropic, PBC | MIT | Existing MCP server/client protocol transport. |
| `jpeg-js@0.4.4` | Eugene Ware; decoder: notmasteryet; encoder: Adobe Systems Incorporated / Andreas Ritter | BSD-3-Clause | Existing JPEG decoding/encoding. The package declares BSD-3-Clause; retain additional Apache-2.0 decoder and BSD encoder file-level notices. |
| `ikts@1.3.7` | Leonard Goldstein; Fullik by lo-th; Caliko by Alastair Lansley et al / Federation University Australia; FABRIK by Andreas Aristidou and Joan Lasenby | MIT | Bounded 2D/3D articulated construction with authored lengths, roots, targets and bend limits. |

### clipper2-ts 2.0.1-18

Source: [https://github.com/countertype/clipper2-ts](https://github.com/countertype/clipper2-ts). Revision: `bf6e0303217bdffcbe2f03ab7f6218194df8e7e4`.

Used in: `src/core/contour-geometry.ts`, `src/core/painterly-strokes.ts`.

Retained notices/licenses: [clipper2-ts-LICENSE.txt](licenses/clipper2-ts-LICENSE.txt), [clipper2-ts-NOTICE.txt](licenses/clipper2-ts-NOTICE.txt).

### bezier-js 6.1.4

Source: [https://github.com/Pomax/bezierjs](https://github.com/Pomax/bezierjs). Revision: `a41f3e08e9724c9973eca0eb5c1304120e72fc70`.

Used in: `src/core/contour-geometry.ts`, `src/core/object-construction.ts`, `src/types/bezier-js.d.ts`.

Retained notices/licenses: [bezier-js-NOTICE.txt](licenses/bezier-js-NOTICE.txt).

### @modelcontextprotocol/sdk 1.30.0

Source: [https://github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk). Revision: `npm:@modelcontextprotocol/sdk@1.30.0`.

Used in: `src/core/photoshop-mcp-server.ts`.

Retained notices/licenses: [modelcontextprotocol-sdk-LICENSE.txt](licenses/modelcontextprotocol-sdk-LICENSE.txt).

### jpeg-js 0.4.4

Source: [https://github.com/eugeneware/jpeg-js](https://github.com/eugeneware/jpeg-js). Revision: `npm:jpeg-js@0.4.4`.

Used in: `src/core/painterly-strokes.ts`.

Retained notices/licenses: [jpeg-js-LICENSE.txt](licenses/jpeg-js-LICENSE.txt), [jpeg-js-NOTICE.txt](licenses/jpeg-js-NOTICE.txt), [Apache-2.0.txt](licenses/Apache-2.0.txt).

### ikts 1.3.7

Source: [goldst/IK.ts](https://github.com/goldst/IK.ts). Revision: `40b7e2859082f08df88655160ad18fa22b72d02e`.

Author: Leonard Goldstein. Retained upstream lineage: Fullik by lo-th; Caliko by Alastair Lansley and
Federation University Australia; FABRIK by Andreas Aristidou and Joan Lasenby. The upstream README uses
"Calico" in its credit section; the link points to Caliko. Runtime dependency is imported unchanged.

Used in: `src/core/ik-construction.ts`, `src/core/object-construction.ts`. Retained notices/licenses:
[ikts-LICENSE.txt](licenses/ikts-LICENSE.txt), [ikts-NOTICE.txt](licenses/ikts-NOTICE.txt).
The project-authored adapter and tests constrain supported behavior; upstream describes work in progress
and does not ship a substantive test command. No claim of independent anatomy/artistic validation.

### Algorithm inspiration, rather than included external code

[Aaron Hertzmann, SIGGRAPH 1998: Painterly Rendering with Curved Brush Strokes of Multiple Sizes](https://mrl.cs.nyu.edu/publications/painterly98/) informs the project-authored bounded adapter in `src/core/painterly-strokes.ts`. No external implementation was copied.

IK.ts is integrated as `ikts@1.3.7` through the bounded object-construction adapter. Clipper2 is used through the separately credited TypeScript port `clipper2-ts`, not the original C++ binary or a WASM package. Poly2Tri benchmark assets are not used or included.

This inventory covers all direct production dependencies, not all transitive or development dependencies. Dependency packages retain their own source notices. The JPEG package also carries decoder/encoder file-level licenses, reproduced above. Bezier.js publishes only an MIT declaration/header; its companion notice records that fact and supplies standard MIT text without claiming it is an upstream file.

## Maintenance and distribution

For every new dependency, copied/adapted source, algorithm or bundled asset: record author, repository, exact revision/version, actual usage paths and relationship (dependency, adapted code, or inspiration); retain required copyright/license/notice text. Do not reattribute external work to PaintPilot. Update this registry and the corresponding notices on upgrades. `npm run verify:third-party-notices` rejects unrecorded direct dependencies, version/evidence drift, missing notices, and files omitted from package distribution. Both npm file allowlist and MCPB staging include this notice, the registry and `licenses/`. Historical Photoshop MCP provenance remains in [NOTICE](NOTICE).
