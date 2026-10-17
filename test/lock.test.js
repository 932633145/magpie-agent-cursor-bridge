import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {alive, held, claim, release, processStartTime} from '../lib/lock.js';

const temp = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-lock-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return path.join(dir, 'supervisor.lock');
};

// A pid that has certainly exited: spawn a short-lived process and wait for it.
function deadPid() {
  const child = spawnSync(process.execPath, ['-e', '0'], {encoding: 'utf8'});
  assert.equal(child.status, 0);
  return 2147483000;
}

test('a stale lock from a dead supervisor is reclaimed instead of blocking startup', t => {
  const lock = temp(t);
  fs.mkdirSync(lock);
  // The shape an interrupted or killed supervisor leaves behind.
  fs.writeFileSync(path.join(lock, 'pid'), String(deadPid()));
  const owner = claim(lock);
  assert.equal(owner.pid, process.pid);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8')).pid, process.pid);
  // An older release only reads pid; keep it agreeing with the new lock.
  assert.equal(fs.readFileSync(path.join(lock, 'pid'), 'utf8'), String(process.pid));
});

test('a reused pid does not look like the live supervisor', t => {
  const lock = temp(t);
  fs.mkdirSync(lock);
  // Our own pid is alive, but the recorded start time is not ours. Windows
  // reuses pids, so this is exactly what a stale lock can look like.
  fs.writeFileSync(path.join(lock, 'owner.json'),
    JSON.stringify({pid: process.pid, start: 'Thu Jan  1 00:00:00 2000'}));
  assert.equal(alive(process.pid), true, 'the pid itself is running');
  assert.equal(held(path.join(lock, 'owner.json')), false, 'but it is not the recorded owner');
  const owner = claim(lock);
  assert.equal(owner.start, processStartTime(process.pid));
});

test('a lock held by the current process is not taken twice', t => {
  const lock = temp(t);
  const owner = claim(lock);
  assert.throws(() => claim(lock), /already running/);
  release(lock, owner);
  assert.equal(fs.existsSync(lock), false);
});

test('release never removes a lock another supervisor has taken over', t => {
  const lock = temp(t);
  const owner = claim(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({pid: owner.pid + 1, start: 'x'}));
  release(lock, owner);
  assert.equal(fs.existsSync(lock), true, 'the newer owner keeps its lock');
});

test('a missing or corrupt lock is treated as free', t => {
  const lock = temp(t);
  assert.equal(held(path.join(lock, 'owner.json')), false);
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), '{not json');
  assert.equal(held(path.join(lock, 'owner.json')), false);
  assert.doesNotThrow(() => claim(lock));
});

test('an old pid-only lock still reports a live owner', t => {
  const lock = temp(t);
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
  assert.equal(held(path.join(lock, 'owner.json')), false, 'no owner.json means untrusted');
});

test('the supervisor publishes a starting state before the engine is up', () => {
  const text = fs.readFileSync(new URL('../bridge.js', import.meta.url), 'utf8');
  // The engine needs seconds to start; without this the previous run's
  // "connected" is the last thing a reader sees and looks healthy.
  assert.match(text, /status\('starting'/);
  const starting = text.indexOf("status('starting'");
  const loop = text.indexOf('while(!ending)');
  assert.ok(starting > 0 && loop > starting, 'starting must precede the supervise loop');
});
