import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {shouldRevive} from '../lib/watch.js';

test('a supervisor that died while serving is started again', () => {
  const stale = Date.parse('2026-01-01T00:00:00Z');
  for (const state of ['connected', 'starting', 'paused', 'error']) {
    assert.equal(shouldRevive({state, heartbeat: stale}), true, state);
  }
  assert.equal(shouldRevive(null), true);
});

test('a fresh heartbeat means a replacement is already up, so do not start another', () => {
  const now = Date.now();
  assert.equal(shouldRevive({state:'connected', heartbeat: now - 5000}, now), false);
  assert.equal(shouldRevive({state:'starting', heartbeat: now - 19000}, now), false);
  assert.equal(shouldRevive({state:'connected', heartbeat: now - 21000}, now), true);
});

test('a clean stop or an explicit disconnect stays down', () => {
  assert.equal(shouldRevive({state:'stopped'}), false);
  assert.equal(shouldRevive({state:'disconnected', reason:'已在 Magpie 中关闭接入'}), false);
  assert.equal(shouldRevive({state:'disconnected'}), false);
  assert.equal(shouldRevive({state:'idle'}), false);
});

test('the supervisor starts a detached watchdog', () => {
  const text = fs.readFileSync(new URL('../bridge.js', import.meta.url), 'utf8');
  assert.match(text, /command==='watch'/);
  assert.match(text, /ensureWatch\(\)/);
  assert.match(text, /CURSOR_BRIDGE_NO_WATCHDOG/);
  assert.match(text, /detached:true/);
});
