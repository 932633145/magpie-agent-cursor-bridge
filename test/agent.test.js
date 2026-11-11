import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {agent, connect} from '../agent.js';
import {sourceUpdate} from '../lib/upgrade.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, '..', 'agent.js');
const text = fs.readFileSync(source, 'utf8');

test('turning the agent on returns the Magpie connection', () => {
  const result = connect({
    gateway: {v1: 'http://127.0.0.1:3425/v1', key: 'magpie-cursor-bridge'},
    model: 'group/auto',
    models: [{id: 'group/auto', name: 'Auto', context: 256000}, {id: 'x', name: 'x'}],
  });
  assert.equal(result.enabled, true);
  assert.equal(result.gateway, 'http://127.0.0.1:3425/v1');
  assert.equal(result.key, 'magpie-cursor-bridge');
  assert.deepEqual(result.models, [
    {id: 'group/auto', name: 'Auto', context: 256000},
    {id: 'x', name: 'x', context: null},
  ]);
});

test('connect() answers where Magpie runs it: a sandbox with no Node globals', () => {
  // Magpie compiles this module in moejs: no `process`, no timers, no built-in
  // module to import. Reading process.env in connect() raised "connect:
  // ReferenceError: process is not defined" on every model switch, and a suite
  // that ran it under Node could not see it. The module is therefore loaded in a
  // context that offers nothing Node does.
  const module = text
    .replace('export const agent', 'const agent')
    .replace('export function connect', 'function connect');
  const {connect: sandboxed} = vm.runInNewContext(`${module}\n;({agent, connect})`, {});
  const result = sandboxed({
    gateway: {v1: 'http://127.0.0.1:3425/v1', key: 'k'},
    model: 'm',
    models: [{id: 'm'}],
  });
  assert.equal(result.gateway, 'http://127.0.0.1:3425/v1');
  assert.equal(result.key, 'k');
  // Objects made in the sandbox carry that realm's prototype, so compare values.
  assert.deepEqual(JSON.parse(JSON.stringify(result.models)), [{id: 'm', name: 'm', context: null}]);
});

test('the module reaches for no host API at all', () => {
  // Starting the bridge from here was tried twice and both times the module was
  // the wrong place for it: the sandbox has no way to spawn, and a late env read
  // installed a test's working copy into the real profile. Setup owns install and
  // upgrade; the supervisor owns the lifecycle.
  const code = text.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /^\s*import\s/m, 'no static import');
  assert.doesNotMatch(code, /import\(/, 'no dynamic import');
  assert.doesNotMatch(code, /\bprocess\b/, 'no process');
  assert.doesNotMatch(code, /\bsetTimeout\b/, 'no timers');
  assert.doesNotMatch(code, /\bspawn\b/, 'nothing is started from here');
  assert.equal(typeof agent.id, 'string');
  assert.equal(agent.config, '~/.config/magpie-cursor-bridge/connection.json');
  assert.equal(agent.format, 'json');
  assert.equal(agent.model, 'model');
});

test('an updated plugin in Magpie is handed to its own installer', () => {
  // Magpie replaces a plugin's files from GitHub and never rewrites
  // installation.json, so the release staged by the previous plugin would keep
  // serving and the update would look applied while the build stayed the same.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-upgrade-'));
  const plugin = path.join(root, 'node_modules', 'magpie-agent-cursor-bridge');
  fs.mkdirSync(plugin, {recursive: true});
  try {
    const record = (source) => fs.writeFileSync(path.join(root, 'installation.json'), JSON.stringify({version: '0.2.8-beta-3', release: root, source}));
    const version = (value) => fs.writeFileSync(path.join(plugin, 'package.json'), JSON.stringify({name: 'magpie-agent-cursor-bridge', version: value}));
    fs.writeFileSync(path.join(plugin, 'install.js'), '');
    record(plugin);
    version('0.2.8-beta-4');
    assert.deepEqual(sourceUpdate(root, '0.2.8-beta-3'), {source: plugin, version: '0.2.8-beta-4'});
    assert.equal(sourceUpdate(root, '0.2.8-beta-4'), null, 'the version this process runs needs nothing');
    version('');
    assert.equal(sourceUpdate(root, '0.2.8-beta-3'), null, 'a manifest without a version proves nothing');
    fs.rmSync(path.join(plugin, 'install.js'));
    version('0.2.8-beta-4');
    assert.equal(sourceUpdate(root, '0.2.8-beta-3'), null, 'a plugin with no installer is not one');
    fs.writeFileSync(path.join(plugin, 'install.js'), '');
    fs.rmSync(path.join(root, 'installation.json'));
    assert.equal(sourceUpdate(root, '0.2.8-beta-3'), null, 'no record, nothing to compare');
    record(path.join(root, 'gone'));
    assert.equal(sourceUpdate(root, '0.2.8-beta-3'), null, 'a source that is gone is not an update');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('the supervisor applies that update without touching a test profile', () => {
  const bridge = fs.readFileSync(path.join(here, '..', 'bridge.js'), 'utf8');
  assert.match(bridge, /installUpdate\(\)/, 'the supervisor looks for an updated plugin');
  const update = bridge.slice(bridge.indexOf('function installUpdate'), bridge.indexOf('const signals=process.platform'));
  assert.match(update, /sourceUpdate\(root, version\)/, 'the comparison is the plugin Magpie holds');
  assert.match(update, /root !== path\.join\(os\.homedir\(\), '\.config', 'magpie-cursor-bridge'\)/, 'a scratch root never installs the real profile');
  assert.match(update, /delete env\.CURSOR_BRIDGE_ROOT/, 'the installer must not redirect the Startup entry');
  assert.match(update, /'install\.js'\), 'setup'/, 'the plugin\'s own installer stages and starts the new build');
  assert.match(update, /Date\.now\(\) - upgradeAt < 600000/, 'a failed install is not retried every pass');
});

test('a toggle never kills Cursor', () => {
  // Restarting Cursor to make it re-read http.proxy cost the user every open
  // editor and produced the 499s in the gateway log, without making the model
  // list arrive any sooner in practice.
  const bridge = fs.readFileSync(path.join(here, '..', 'bridge.js'), 'utf8');
  const reload = bridge.slice(bridge.indexOf('function reloadCursor'), bridge.indexOf('function ensureCursorReadsNewProxy'));
  assert.match(reload, /CURSOR_BRIDGE_RESTART_CURSOR !== '1'/, 'killing Cursor is opt-in, not the default');
  const first = reload.indexOf('if (process.env.CURSOR_BRIDGE_RESTART_CURSOR');
  const kill = reload.indexOf('taskkill');
  assert.ok(first > -1 && first < kill, 'the opt-in check guards the kill');
  // The published address is what Cursor holds, so it must not move per toggle.
  assert.match(bridge, /const relayPort=/, 'the relay keeps one published address');
});

test('an upgrade stops the previous watchdog, not only the supervisor', () => {
  // The watchdog keeps its own lock and outlives the supervisor it guards, so
  // stopping just the supervisor left the previous release's watchdog running.
  const installer = fs.readFileSync(path.join(here, '..', 'lib/install.js'), 'utf8');
  const stop = installer.slice(installer.indexOf('export async function stopJob'), installer.indexOf('export async function bootstrap'));
  assert.match(stop, /watchdog\.lock/, 'the watchdog lock is stopped too');
  assert.match(stop, /supervisor\.lock/, 'the supervisor is still stopped');
});

test('a startup entry that names another release fails the install', () => {
  const installer = fs.readFileSync(path.join(here, '..', 'lib/install.js'), 'utf8');
  const activate = installer.slice(installer.indexOf('export async function activate'), installer.length);
  assert.match(activate, /written\.includes\(release\)/, 'the entry is read back and checked');
  assert.match(activate, /启动项未指向本次发布/, 'a mismatch is reported instead of ignored');
});

test('an engine that exits before ready is not reported as a certificate problem', () => {
  const bridge = fs.readFileSync(path.join(here, '..', 'bridge.js'), 'utf8');
  // Exit code 107 was reported as "check certificate trust" on a machine whose
  // CA was trusted; the hint sent every reader down the wrong path.
  assert.doesNotMatch(bridge, /check certificate trust/);
  assert.match(bridge, /bridge engine exited before ready/);
});

test('a transient model refresh failure keeps a healthy engine connected', () => {
  const bridge = fs.readFileSync(path.join(here, '..', 'bridge.js'), 'utf8');
  const refresh = bridge.slice(bridge.indexOf('let effective;'), bridge.indexOf('// The gateway answers', bridge.indexOf('let effective;')));
  assert.match(refresh, /temporary gateway failure must not tear down a healthy engine/);
  assert.match(refresh, /child && child\.exitCode===null && child\.signalCode===null && relay && ready/);
  assert.match(refresh, /status\('connected'/);
  assert.match(refresh, /continue;/);
});

test('the notice says how the bridge gets installed, updated and refreshed', () => {
  // The toggle cannot install anything: saying it does sent users to a switch
  // that could not help them, and left the reason for a stale build unexplained.
  assert.match(agent.notice, /setup\.ps1/, 'first use names the installer');
  assert.match(agent.notice, /自动升级/, 'an update in Magpie applies itself');
  assert.match(agent.notice, /无需重启/);
  assert.match(agent.notice, /选中的模型/, 'the SCM actions use the selected model too');
});

test('the embedded logo is a decodable PNG, not a hand-edited string', () => {
  const icon = text.match(/icon:\s*"data:image\/png;base64,([^"]+)"/)[1];
  const png = Buffer.from(icon, 'base64');
  // Magpie renders the data URI directly, so a truncated or duplicated chunk
  // silently drops the logo from the Agents list instead of failing loudly.
  const chunks = [];
  for (let i = 8; i + 8 <= png.length;) {
    const length = png.readUInt32BE(i);
    const type = png.toString('ascii', i + 4, i + 8);
    chunks.push(type);
    i += 12 + length;
    if (type === 'IEND') { assert.equal(i, png.length, 'no trailing bytes after IEND'); break; }
  }
  assert.deepEqual(chunks.filter(t => t === 'IHDR'), ['IHDR'], 'one header chunk');
  assert.deepEqual(chunks.slice(-1), ['IEND'], 'ends with IEND');
  assert.ok(chunks.filter(t => t === 'IDAT').length > 0, 'carries image data');
  assert.ok(png.equals(fs.readFileSync(path.join(here, '..', 'icon.png'))), 'matches icon.png');
});

test('the bridge never opens a console window on Windows', () => {
  const bridge = fs.readFileSync(path.join(here, '..', 'bridge.js'), 'utf8');
  // The supervisor runs without a console of its own, so every child it starts
  // must hide its console; otherwise Windows flashes a window at each restart.
  const calls = [...bridge.matchAll(/spawn\([\s\S]*?\n?\s*\}\);/g)].map(match => match[0]);
  assert.ok(calls.length >= 3, 'bridge spawns the engine, taskkill and an update installer');
  for (const call of calls) assert.match(call, /windowsHide:\s*true/, call.trim());
});
