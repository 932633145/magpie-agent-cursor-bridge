import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {agent, connect} from '../agent.js';

const source = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent.js');

test('turning the agent on returns the Magpie connection', () => {
  process.env.MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART = '1';
  try {
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
  } finally {
    delete process.env.MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART;
  }
});

test('the agent module loads with no built-in available at import time', () => {
  const text = fs.readFileSync(source, 'utf8');
  const top = text.split('\n').filter(line => /^\s*import\s/.test(line));
  assert.deepEqual(top, [], 'built-ins must load lazily, inside connect()');
  assert.equal(typeof agent.id, 'string');
  assert.equal(agent.config, '~/.config/magpie-cursor-bridge/connection.json');
  assert.equal(agent.format, 'json');
  assert.match(agent.notice, /打开开关/);
});

test('turning the agent on starts the bridge without an explicit setup step', () => {
  const text = fs.readFileSync(source, 'utf8');
  const body = text.slice(text.indexOf('export function connect'));
  assert.match(body, /start\(\)/, 'connect must start the bridge');
  assert.match(text, /'supervise'/, 'a staged release is started as the supervisor');
  const launch = text.slice(text.indexOf('function launch'), text.indexOf('function sourceDirectory'));
  assert.doesNotMatch(launch, /detached:\s*true/, 'the supervisor stays in Magpie\'s process tree');
  // connect() runs once per toggle, so the supervisor it starts owns the only
  // watchdog. Disabling it here left a killed supervisor dead forever.
  assert.doesNotMatch(launch, /CURSOR_BRIDGE_NO_WATCHDOG/, 'the supervisor must start its own watchdog');
  assert.match(text, /'setup'/, 'a first run falls back to setup');
  assert.match(text, /supervisor\.lock/, 'an already running supervisor is reused');
});

test('a toggle never kills Cursor', () => {
  // Restarting Cursor to make it re-read http.proxy cost the user every open
  // editor and produced the 499s in the gateway log, without making the model
  // list arrive any sooner in practice.
  const text = fs.readFileSync(path.join(path.dirname(source), 'bridge.js'), 'utf8');
  const reload = text.slice(text.indexOf('function reloadCursor'), text.indexOf('function ensureCursorReadsNewProxy'));
  assert.match(reload, /CURSOR_BRIDGE_RESTART_CURSOR !== '1'/, 'killing Cursor is opt-in, not the default');
  const first = reload.indexOf('if (process.env.CURSOR_BRIDGE_RESTART_CURSOR');
  const kill = reload.indexOf('taskkill');
  assert.ok(first > -1 && first < kill, 'the opt-in check guards the kill');
  // The published address is what Cursor holds, so it must not move per toggle.
  assert.match(text, /const relayPort=/, 'the relay keeps one published address');
});

test('an automatic install does not move the startup entry out of the real profile', () => {
  // CURSOR_BRIDGE_ROOT exists so tests can install into a scratch tree. Passing
  // the real root from connect() made pathed() redirect the Startup entry into a
  // private folder, so an upgrade left the real entry pointing at the release it
  // was supposed to replace -- and the next login started the old build.
  const text = fs.readFileSync(source, 'utf8');
  const setup = text.slice(text.indexOf('async function setup'), text.indexOf('function launch'));
  assert.match(setup, /if \(process\.env\.CURSOR_BRIDGE_ROOT\) env\.CURSOR_BRIDGE_ROOT = root/, 'isolation is forwarded only when the caller asked for it');
  assert.match(setup, /delete env\.CURSOR_BRIDGE_ROOT/, 'a real install runs without the isolation root');
});

test('an upgrade stops the previous watchdog, not only the supervisor', () => {
  // The watchdog keeps its own lock and outlives the supervisor it guards, so
  // stopping just the supervisor left the previous release's watchdog running.
  const text = fs.readFileSync(path.join(path.dirname(source), 'lib/install.js'), 'utf8');
  const stop = text.slice(text.indexOf('export async function stopJob'), text.indexOf('export async function bootstrap'));
  assert.match(stop, /watchdog\.lock/, 'the watchdog lock is stopped too');
  assert.match(stop, /supervisor\.lock/, 'the supervisor is still stopped');
});

test('a startup entry that names another release fails the install', () => {
  const text = fs.readFileSync(path.join(path.dirname(source), 'lib/install.js'), 'utf8');
  const activate = text.slice(text.indexOf('export async function activate'), text.length);
  assert.match(activate, /written\.includes\(release\)/, 'the entry is read back and checked');
  assert.match(activate, /启动项未指向本次发布/, 'a mismatch is reported instead of ignored');
});

test('an upgrade replaces a live supervisor from an older plugin', () => {
  // Magpie replaces this plugin's files from GitHub and the old supervisor keeps
  // holding its lock, so "a supervisor is alive" was true after every upgrade and
  // start() returned before staged() could notice the version mismatch: upgrading
  // in Magpie silently did nothing.
  const text = fs.readFileSync(source, 'utf8');
  const start = text.slice(text.indexOf('function start'), text.indexOf('function watch'));
  assert.match(start, /runningVersion\(/, 'a live supervisor must be checked for its version');
  assert.match(start, /alive\([\s\S]*&&[\s\S]*runningVersion\([\s\S]*===\s*null/, 'only a matching version is reused');
  // The helper body ends where the next documented function begins.
  const from = text.indexOf('function runningVersion');
  const check = text.slice(from, text.indexOf('// The release install.js staged', from));
  assert.match(check, /state\.version/, 'the serving version comes from status.json');
  assert.match(check, /return theirs/, 'a different version is reported so setup() runs');
});

test('a status without a version never forces a reinstall', () => {
  // Returning a mismatch for an unattributable status would rebuild the release
  // on every connect from a plugin that cannot tell versions apart.
  const text = fs.readFileSync(source, 'utf8');
  const from = text.indexOf('function runningVersion');
  const check = text.slice(from, text.indexOf('// The release install.js staged', from));
  assert.match(check, /if \(!theirs \|\| theirs === mine\) return null/, 'unknown or equal versions are reused');
});

test('a release staged by an older plugin is replaced instead of launched', () => {
  // Magpie replaces this plugin's files from GitHub but never rewrites
  // installation.json. Launching the recorded release then runs the previous
  // plugin's bridge.js, which on Windows has no watchdog: one exit and the
  // bridge stays down while Magpie still shows the agent as connected.
  const text = fs.readFileSync(source, 'utf8');
  const staged = text.slice(text.indexOf('function staged'), text.indexOf('function manifestVersion'));
  assert.match(staged, /record\.version\s*!==\s*manifest/, 'a version mismatch must be detected');
  assert.match(staged, /return null/, 'a mismatched release falls back to setup()');
  assert.match(text, /function manifestVersion/, 'the plugin version is read next to agent.js');
});

test('a launch that never spawns is recorded instead of swallowed', () => {
  const text = fs.readFileSync(source, 'utf8');
  const launch = text.slice(text.indexOf('function launch'), text.indexOf('function sourceDirectory'));
  // spawn failures do not throw; an empty handler leaves no evidence at all.
  assert.doesNotMatch(launch, /child\.on\?\.\('error',\s*\(\)\s*=>\s*\{\s*\}\)/, 'an empty error handler hides the cause');
  assert.match(launch, /report\(error/, 'the spawn error goes to autostart.log');
});

test('an engine that exits before ready is not reported as a certificate problem', () => {
  const text = fs.readFileSync(path.join(path.dirname(source), 'bridge.js'), 'utf8');
  // Exit code 107 was reported as "check certificate trust" on a machine whose
  // CA was trusted; the hint sent every reader down the wrong path.
  assert.doesNotMatch(text, /check certificate trust/);
  assert.match(text, /bridge engine exited before ready/);
});

test('connect() answers immediately instead of blocking on startup', () => {
  process.env.MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART = '1';
  try {
    const started = Date.now();
    const result = connect({
      gateway: {v1: 'http://127.0.0.1:3425/v1', key: 'k'},
      model: 'm', models: [{id: 'm'}],
    });
    // Readiness is reported through status.json; the return value stays cheap.
    assert.ok(Date.now() - started < 1000, 'connect must not wait for the bridge');
    assert.equal(result.enabled, true);
  } finally {
    delete process.env.MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART;
  }
});

test('the notice tells users no restart is needed and how to refresh Cursor', () => {
  // Restarting Cursor was never required: the catalogue is served per request.
  // The old wording sent users to a restart that masked startup delays.
  assert.doesNotMatch(agent.notice, /重启一次 Cursor/);
  assert.match(agent.notice, /无需重启/);
  assert.match(agent.notice, /模型下拉框|对话面板/);
});

test('the supervisor runs on the runtime copy inside the staged release', () => {
  const text = fs.readFileSync(source, 'utf8');
  // setup copies the runtime into the release; a global Node or Bun may not exist.
  assert.match(text, /path\.join\(release,\s*'bin',\s*name\)/);
  assert.match(text, /installation\.json/);
});

test('every helper that joins paths takes path as a parameter', () => {
  const text = fs.readFileSync(source, 'utf8');
  // agent.js may not import node:path at module scope, because the plugin
  // sandbox can load the module with no built-ins. Each helper therefore either
  // receives `path` from start() or imports it locally. A helper that used
  // path.join without doing either threw "path is not defined", which meant
  // connect() could never start the bridge.
  for (const match of text.matchAll(/^function\s+(\w+)\s*\(([^)]*)\)\s*\{/gm)) {
    const [, name, params] = match;
    const rest = text.slice(match.index + match[0].length);
    const next = rest.search(/^function\s+\w+\s*\(/m);
    const body = next < 0 ? rest : rest.slice(0, next);
    if (!/\bpath\./.test(body)) continue;
    const takesIt = /\bpath\b/.test(params);
    const importsIt = /(?:const|let|var)\s+path\s*=/.test(body) || /import\([^)]*node:path/.test(body);
    assert.ok(takesIt || importsIt, `function ${name} uses path.* without taking or importing it`);
  }
});

test('the embedded logo is a decodable PNG, not a hand-edited string', () => {
  const text = fs.readFileSync(source, 'utf8');
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
  assert.ok(png.equals(fs.readFileSync(path.join(path.dirname(source), 'icon.png'))), 'matches icon.png');
});

test('the bridge never opens a console window on Windows', () => {
  const text = fs.readFileSync(path.join(path.dirname(source), 'bridge.js'), 'utf8');
  // The supervisor runs without a console of its own, so every child it starts
  // must hide its console; otherwise Windows flashes a window at each restart.
  const calls = [...text.matchAll(/spawn\([\s\S]*?\}\);/g)].map(match => match[0]);
  assert.ok(calls.length >= 2, 'bridge spawns the engine and taskkill');
  for (const call of calls) assert.match(call, /windowsHide:\s*true/, call.trim());
});
