'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configure } = require('../mcpb/launch.cjs');
const { fingerprint, syncUxp } = require('../mcpb/uxp-sync.cjs');

test('MCPB keeps the established package identity and offers both modes', () => {
  const manifest = require('../mcpb/manifest.json');
  assert.equal(manifest.name, 'photoshop-mcp-digital-painting');
  assert.equal(manifest.server.entry_point, 'server/launch.cjs');
  assert.match(manifest.server.mcp_config.args[0], /launch\.cjs$/);
  assert.equal(manifest.server.mcp_config.env.PAINTPILOT_MODE, '${user_config.mode}');
  assert.equal(manifest.user_config.mode.default, 'tools');
});

test('launcher selects only the two real entries; overrides hostile mode flags', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paintpilot-mcpb-config-'));
  try {
    for (const [mode, entry, guard] of [
      ['tools', 'photoshop-tools.js', 'off'],
      ['painting', 'painting-mode.js', 'required'],
    ]) {
      const env = { PAINTPILOT_MODE: mode, PHOTOSHOP_GUARD_MODE: guard === 'off' ? 'required' : 'off', PAINTPILOT_DATA_HOME: root };
      const r = configure({ env, platform: 'win32', bundle: root });
      assert.equal(path.basename(r.entry), entry);
      assert.equal(env.PHOTOSHOP_GUARD_MODE, guard);
      assert.equal(env.PHOTOSHOP_CONTROLLER_RUNTIME_DIR, path.join(root, 'controller'));
      assert.equal(env.PHOTOSHOP_UXP_RECEIPT_DIR, path.join(root, 'uxp-command-receipts'));
      assert.equal(env.PAINTPILOT_RUNTIME_ROOT, root);
      assert.equal(env.PAINTPILOT_PROCESS_VIDEO_TRACE_SETTINGS_FILE, path.join(root, 'process-video-trace-settings.json'));
    }
    for (const mode of ['pAinting', '../../tools.js', 'off']) {
      assert.throws(() => configure({env: {PAINTPILOT_MODE: mode, PAINTPILOT_DATA_HOME:root}, platform:'win32', bundle:root}), /PAINTPILOT_MODE/);
    }
    assert.throws(() => configure({env: {}, platform:'linux', bundle:root}), /Windows only/);
    assert.throws(() => configure({env: {PAINTPILOT_DATA_HOME:'relative'}, platform:'win32', bundle:root}), /absolute/);
  } finally {
    fs.rmSync(root, {recursive:true, force:true});
  }
});

test('new bundle updates managed UXP folder in place and preserves user data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paintpilot-mcpb-upgrade-'));
  try {
    const a = path.join(root, 'release-a');
    const b = path.join(root, 'release-b');
    const dataHome = path.join(root, 'user-data');
    fs.mkdirSync(a); fs.mkdirSync(b);
    fs.writeFileSync(path.join(a, 'manifest.json'), '{"version":"1"}');
    fs.writeFileSync(path.join(a, 'main.js'), 'console.log("v1");');
    fs.writeFileSync(path.join(b, 'manifest.json'), '{"version":"2"}');
    fs.writeFileSync(path.join(b, 'main.js'), 'console.log("v2");');

    assert.equal(syncUxp({source:a,dataHome}).updated, true);
    fs.mkdirSync(path.join(dataHome, 'controller'));
    fs.writeFileSync(path.join(dataHome, 'controller', 'journal.json'), '{"user":"original"}');
    const same = syncUxp({source:a,dataHome});
    assert.equal(same.updated, false);
    assert.equal(syncUxp({source:b,dataHome}).updated, true);
    assert.equal(fs.readFileSync(path.join(dataHome,'uxp-plugin','main.js'),'utf8'), 'console.log("v2");');
    assert.equal(fs.readFileSync(path.join(dataHome,'uxp-plugin.previous','main.js'),'utf8'), 'console.log("v1");');
    assert.equal(fs.readFileSync(path.join(dataHome,'controller','journal.json'),'utf8'), '{"user":"original"}');
    assert.equal(fingerprint(path.join(dataHome,'uxp-plugin')), fingerprint(b));
  } finally {
    fs.rmSync(root, {recursive:true,force:true});
  }
});

test('bad companion and interrupted update do not overwrite installed copy', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paintpilot-mcpb-safe-'));
  try {
    const source = path.join(root, 'source');
    const dataHome = path.join(root, 'data');
    fs.mkdirSync(source);
    assert.throws(() => syncUxp({source,dataHome}), /manifest missing/);
    fs.writeFileSync(path.join(source,'manifest.json'),'{"name":"okay"}');
    syncUxp({source,dataHome});
    const stage=path.join(dataHome,'uxp-plugin.pending');
    fs.mkdirSync(stage);
    fs.writeFileSync(path.join(source,'manifest.json'),'{"name":"new"}');
    assert.throws(() => syncUxp({source,dataHome}),/Pending UXP update/);
    assert.equal(fs.readFileSync(path.join(dataHome,'uxp-plugin','manifest.json'),'utf8'),'{"name":"okay"}');
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
