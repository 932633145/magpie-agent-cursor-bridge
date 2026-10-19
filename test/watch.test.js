import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
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

test('a watchdog that never started is retried instead of giving up', () => {
  const text = fs.readFileSync(new URL('../bridge.js', import.meta.url), 'utf8');
  // One attempt at startup can lose the race against a previous watchdog that
  // still holds the lock; it then exits and nothing ever tries again, so a
  // killed supervisor is never revived. The loop must keep checking.
  const loop = text.slice(text.indexOf('while(!ending)'));
  assert.match(loop, /ensureWatch\(\)/, 'the serving loop re-checks the watchdog');
  assert.match(text, /watchAlive\(\)/, 'a live watchdog is detected before spawning another');
  assert.match(text, /watchdog\.lock/, 'the watchdog lock is what identifies a live watchdog');
});

test('bridge.js parses and its state is declared before the first call', () => {
  const file = new URL('../bridge.js', import.meta.url);
  const text = fs.readFileSync(file, 'utf8');
  // A `let` used by a function that runs before its declaration throws
  // "Cannot access before initialization" at startup, and the supervisor exits
  // instantly without writing a status -- the exact failure this file exists to
  // prevent. Parsing alone cannot see it, so the order is checked directly.
  const callAt = text.indexOf('ensureWatch();');
  const declAt = text.indexOf('let watchSpawnedAt');
  assert.ok(callAt > 0 && declAt > 0, 'both the call and the declaration exist');
  assert.ok(declAt < callAt, 'watchSpawnedAt must be declared before ensureWatch() runs');
  // A duplicate declaration is a syntax error that only shows up when the module
  // is imported, so count it here rather than relying on a text match.
  assert.equal((text.match(/let watchSpawnedAt/g) || []).length, 1, 'watchSpawnedAt is declared once');
  // Importing the module must not throw; `status` only prints the recorded
  // state, so it never starts an engine or touches Cursor's settings.
  const run = spawnSync(process.execPath, [fileURLToPath(file), 'status'], {encoding: 'utf8', windowsHide: true});
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.stderr, /SyntaxError|ReferenceError|before initialization/);
});
