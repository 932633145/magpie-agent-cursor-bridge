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
  assert.match(text, /'setup'/, 'a first run falls back to setup');
  assert.match(text, /supervisor\.lock/, 'an already running supervisor is reused');
});

test('the supervisor runs on the runtime copy inside the staged release', () => {
  const text = fs.readFileSync(source, 'utf8');
  // setup copies the runtime into the release; a global Node or Bun may not exist.
  assert.match(text, /path\.join\(release,\s*'bin',\s*name\)/);
  assert.match(text, /installation\.json/);
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
