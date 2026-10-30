'use strict';

// This file is bundled alongside the MCPB launcher. The companion lives in a
// stable, PaintPilot-owned location so an extension upgrade does not require
// re-registering a different extracted path in Adobe UXP Developer Tool.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function fingerprint(directory) {
  if (!fs.statSync(directory).isDirectory()) throw new Error('UXP source must be a directory');
  const hash = crypto.createHash('sha256');
  function visit(relative) {
    for (const item of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (item.name === '.DS_Store' || item.name.endsWith('.tmp')) continue;
      const child = path.join(relative, item.name);
      if (item.isSymbolicLink()) throw new Error('Symlinks are not supported in the UXP companion');
      if (item.isDirectory()) visit(child);
      else if (item.isFile()) {
        hash.update(child.replaceAll('\\', '/')).update('\0');
        hash.update(fs.readFileSync(path.join(directory, child))).update('\0');
      } else throw new Error('Unsupported UXP directory entry: ' + child);
    }
  }
  visit('');
  return hash.digest('hex');
}

function syncUxp({ source, dataHome }) {
  if (!path.isAbsolute(source) || !path.isAbsolute(dataHome))
    throw new Error('UXP sync requires absolute source and data directories');
  const target = path.join(dataHome, 'uxp-plugin');
  const backup = path.join(dataHome, 'uxp-plugin.previous');
  const stage = path.join(dataHome, 'uxp-plugin.pending');
  if (!fs.existsSync(path.join(source, 'manifest.json'))) throw new Error('UXP manifest missing');
  const sourceHash = fingerprint(source);
  fs.mkdirSync(dataHome, { recursive: true });
  // A previous interrupted update needs human diagnosis, not blind deletion.
  if (fs.existsSync(stage)) throw new Error('Pending UXP update exists: ' + stage);
  if (fs.existsSync(target) && fingerprint(target) === sourceHash)
    return { updated: false, target, hash: sourceHash };
  fs.cpSync(source, stage, {
    recursive: true,
    filter: file => !path.basename(file).endsWith('.tmp') && path.basename(file) !== '.DS_Store',
  });
  if (fingerprint(stage) !== sourceHash) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw new Error('UXP staged copy did not match the bundled source');
  }
  // Only discard the old rollback after the replacement is fully staged
  // and hash-verified. A failed copy must leave the prior rollback intact.
  if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
  let savedPrevious = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      savedPrevious = true;
    }
    fs.renameSync(stage, target);
  } catch (error) {
    if (savedPrevious && !fs.existsSync(target) && fs.existsSync(backup)) {
      fs.renameSync(backup, target);
    }
    throw error;
  }
  return { updated: true, target, hash: sourceHash };
}

module.exports = { syncUxp, fingerprint };
