function cloneLines(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

function windowKey(lines, start, width) {
  return lines.slice(start, start + width).join('\u0000');
}

export function findCrossPathCloneBlocks(currentFiles, baselineFiles, minLines = 8) {
  if (!Number.isInteger(minLines) || minLines < 2) {
    throw new Error('minLines must be an integer >= 2');
  }

  const baselineLines = new Map();
  const index = new Map();
  for (const [path, text] of baselineFiles) {
    const lines = cloneLines(text);
    baselineLines.set(path, lines);
    for (let start = 0; start + minLines <= lines.length; start += 1) {
      const key = windowKey(lines, start, minLines);
      const matches = index.get(key) ?? [];
      matches.push({ path, start });
      index.set(key, matches);
    }
  }

  const blocks = [];
  const seen = new Set();
  for (const [path, text] of currentFiles) {
    const current = cloneLines(text);
    for (let start = 0; start + minLines <= current.length; start += 1) {
      const candidates = index.get(windowKey(current, start, minLines)) ?? [];
      for (const candidate of candidates) {
        if (candidate.path === path) continue;
        const baseline = baselineLines.get(candidate.path);
        if (!baseline) continue;
        if (
          start > 0 &&
          candidate.start > 0 &&
          current[start - 1] === baseline[candidate.start - 1]
        ) {
          continue;
        }

        let length = minLines;
        while (
          start + length < current.length &&
          candidate.start + length < baseline.length &&
          current[start + length] === baseline[candidate.start + length]
        ) {
          length += 1;
        }

        const key = `${path}:${start}:${candidate.path}:${candidate.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push({
          path,
          start_line: start + 1,
          lines: length,
          upstream_path: candidate.path,
          upstream_start_line: candidate.start + 1,
        });
      }
    }
  }

  return blocks.sort(
    (a, b) => b.lines - a.lines || a.path.localeCompare(b.path) || a.start_line - b.start_line
  );
}
