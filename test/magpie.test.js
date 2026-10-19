import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {wired, readWired, switchedOff, nextMagpieGate, agentId, candidates} from '../lib/magpie.js';

const temp = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magpie-state-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
};
// Magpie writes {version, state:{agents:[...]}}; only `wired` marks a switch on.
const write = (file, agents) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({version: '1', state: {agents}}));
};

test('a wired agent reads as connected', t => {
  const file = path.join(temp(t), 'agents-state.json');
  write(file, [{id: agentId, wired: true}, {id: 'codex', wired: true}]);
  assert.equal(wired(file), true);
});

test('switching off drops the field, which is what disconnect looks like', t => {
  const file = path.join(temp(t), 'agents-state.json');
  // Magpie leaves the entry in place and simply stops carrying `wired`, so an
  // absent field must mean off, not unknown.
  write(file, [{id: agentId, models: 274}, {id: 'codex', wired: true}]);
  assert.equal(wired(file), false);
});

test('an unreadable file has no opinion instead of looking disconnected', t => {
  const dir = temp(t);
  assert.equal(wired(path.join(dir, 'missing.json')), null);
  const broken = path.join(dir, 'broken.json');
  fs.writeFileSync(broken, '{"state":');
  assert.equal(wired(broken), null);
  const wrongShape = path.join(dir, 'shape.json');
  fs.writeFileSync(wrongShape, JSON.stringify({version: '1'}));
  assert.equal(wired(wrongShape), null);
});

test('a state file without this plugin is not a switch', t => {
  const file = path.join(temp(t), 'agents-state.json');
  // Magpie lists agents it knows about; if cursor-bridge is absent the plugin
  // is not installed there and the bridge must keep its current behaviour.
  write(file, [{id: 'codex', wired: true}]);
  assert.equal(wired(file), null);
  assert.equal(switchedOff(path.dirname(file)), false);
});

test('a missing wired flag does not stop a bridge that has not seen it on', () => {
  assert.deepEqual(nextMagpieGate(null, false), {hold: false, next: null});
  assert.deepEqual(nextMagpieGate(null, null), {hold: false, next: null});
});

test('switching off after it was on holds the bridge down until it is on again', () => {
  assert.deepEqual(nextMagpieGate(true, false), {hold: true, next: false});
  assert.deepEqual(nextMagpieGate(false, false), {hold: true, next: false});
  assert.deepEqual(nextMagpieGate(false, true), {hold: false, next: true});
  // A brief unreadable state file must not look like a disconnect.
  assert.deepEqual(nextMagpieGate(true, null), {hold: false, next: true});
});

test('readWired picks the first readable state file', t => {
  const home = temp(t);
  const file = candidates(home)[0];
  write(file, [{id: agentId, wired: true}]);
  assert.equal(readWired(home), true);
  write(file, [{id: agentId}]);
  assert.equal(readWired(home), false);
  assert.equal(switchedOff(home), true);
});
