import { describe, expect, it } from 'vitest';
import { findCrossPathCloneBlocks } from '../scripts/source-independence-clones.mjs';

describe('cross-path source-independence clone detector', () => {
  it('detects a moved contiguous block even when indentation changes', () => {
    const baseline = new Map([
      ['src/old.ts', 'one();\ntwo();\nthree();\nfour();\nfive();\nsix();\nseven();\neight();\nnine();'],
    ]);
    const current = new Map([
      ['src/new.ts', 'header();\n  one();\n  two();\n  three();\n  four();\n  five();\n  six();\n  seven();\n  eight();\nfooter();'],
    ]);

    expect(findCrossPathCloneBlocks(current, baseline, 8)).toEqual([
      {
        path: 'src/new.ts',
        start_line: 2,
        lines: 8,
        upstream_path: 'src/old.ts',
        upstream_start_line: 1,
      },
    ]);
  });

  it('does not report the same path or a sequence below the threshold', () => {
    const text = 'a();\nb();\nc();\nd();\ne();\nf();\ng();';
    expect(findCrossPathCloneBlocks(new Map([['src/a.ts', text]]), new Map([['src/a.ts', text]]), 7))
      .toEqual([]);
    expect(findCrossPathCloneBlocks(new Map([['src/new.ts', text]]), new Map([['src/old.ts', text]]), 8))
      .toEqual([]);
  });
});
