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
  assert.match(text, /install\.js'?\]?,?\s*'setup'|'setup'/, 'a first run falls back to setup');
  assert.match(text, /supervisor\.lock/, 'an already running supervisor is reused');
});
