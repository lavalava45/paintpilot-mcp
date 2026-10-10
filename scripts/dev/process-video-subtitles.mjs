// Keep authored commentary blocks whole; this is not sentence segmentation.
export function subtitleBlocks(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  // Existing sidecars place the Photoshop craft block directly after intent,
  // without a blank separator. Detailed settings stay with that craft block.
  const separated = normalized.replace(
    /\n(?=(?:В Photoshop я использую|In Photoshop I use)(?:[ \t.,:]|$))/g,
    '\n\n',
  );
  const paragraphs = separated.split(/\n[ \t]*\n+/)
    .map((part) => part.split('\n').map((line) => line.trim()).filter(Boolean).join('\n'))
    .filter(Boolean);
  // Older/plain sidecars may use one line per block without paragraph separators.
  return paragraphs.length > 1 ? paragraphs : paragraphs[0].split('\n');
}

export function distributeSubtitleBlocks(blocks, start, end, firstIndex = 1) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new Error('Subtitle segment needs finite positive duration and nonnegative start');
  }
  if (!Number.isSafeInteger(firstIndex) || firstIndex < 1) {
    throw new Error('Subtitle index must be a positive integer');
  }
  const startMs = Math.round(start * 1000);
  const endMs = Math.round(end * 1000);
  const durationMs = endMs - startMs;
  if (durationMs < 1) throw new Error('Subtitle segment is shorter than SRT millisecond precision');
  if (!Array.isArray(blocks) || blocks.some((block) => typeof block !== 'string' || !block.trim())) {
    throw new Error('Subtitle blocks must be nonempty text strings');
  }
  if (!blocks.length) return [];
  // A very short segment cannot fit more positive SRT cues than milliseconds.
  // Merge adjacent blocks only in that case, preserving all text and its order.
  const count = Math.min(blocks.length, durationMs);
  const parts = Array.from({ length: count }, () => []);
  blocks.forEach((block, index) => parts[Math.floor(index * count / blocks.length)].push(block));
  return parts.map((part, index) => ({
    index: firstIndex + index,
    start: (startMs + Math.round(durationMs * index / count)) / 1000,
    end: (startMs + Math.round(durationMs * (index + 1) / count)) / 1000,
    text: part.join('\n'),
  }));
}
