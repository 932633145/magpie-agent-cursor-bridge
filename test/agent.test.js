import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {connect, ensureSupervisor} from '../agent.js';

const temp = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-agent-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
};

test('turning the agent on writes a Magpie connection', () => {
  const previous = process.env.MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART;
  process.env.MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART = '1';
  try {
    const result = connect({
      gateway: {v1: 'http://127.0.0.1:3425/v1', key: 'magpie-cursor-bridge'},
      model: 'group/auto',
      models: [{id: 'group/auto', name: 'Auto', context: 256000}],
    });
    assert.equal(result.enabled, true);
    assert.equal(result.gateway, 'http://127.0.0.1:3425/v1');
    assert.deepEqual(result.models, [{id: 'group/auto', name: 'Auto', context: 256000}]);
  } finally {
    if (previous === undefined) delete process.env.MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART;
    else process.env.MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART = previous;
  }
});

test('connect starts setup only when the supervisor is not already running', t => {
  const root = temp(t);
  const calls = [];
  const spawnImpl = (...args) => {
    calls.push(args);
    return {unref() {}};
  };
  assert.equal(ensureSupervisor({root, spawnImpl, env: {}}), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1].slice(1), ['setup']);

  fs.mkdirSync(path.join(root, 'supervisor.lock'));
  fs.writeFileSync(path.join(root, 'supervisor.lock', 'pid'), String(process.pid));
  assert.equal(ensureSupervisor({root, spawnImpl, env: {}}), false);
  assert.equal(calls.length, 1);

  fs.writeFileSync(path.join(root, 'supervisor.lock', 'pid'), '99999999');
  assert.equal(ensureSupervisor({root, spawnImpl, env: {}}), true);
  assert.equal(calls.length, 2);
  assert.equal(ensureSupervisor({root, spawnImpl, env: {MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART: '1'}}), false);
  assert.equal(calls.length, 2);
});
