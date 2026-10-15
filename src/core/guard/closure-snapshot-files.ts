// @ts-nocheck
// Byte-for-byte closure rollback snapshots; Guard selects the files and owns replay policy.
import fs from 'node:fs';
import path from 'node:path';

export function captureClosureFiles(paths) {
  return [...paths].map(file => {
    const existed = fs.existsSync(file);
    return {
      file,
      existed,
      ...(existed ? { bytes: fs.readFileSync(file).toString('base64') } : {}),
    };
  });
}

export function restoreClosureFiles(snapshot) {
  if (!snapshot?.files) return false;
  for (const entry of snapshot.files) {
    const existed = entry.existed ?? typeof entry.bytes === 'string';
    if (!existed) {
      try { fs.unlinkSync(entry.file); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      continue;
    }
    if (typeof entry.bytes !== 'string') {
      throw new Error(`Corrupt closure snapshot for ${entry.file}: missing bytes`);
    }
    fs.mkdirSync(path.dirname(entry.file), { recursive: true });
    fs.writeFileSync(entry.file, Buffer.from(entry.bytes, 'base64'));
  }
  return true;
}
