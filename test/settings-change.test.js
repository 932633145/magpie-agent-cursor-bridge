import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyProxy, restoreProxy} from '../lib/settings.js';

const temp = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-settings-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
};

test('applyProxy reports whether the settings text actually changed', t => {
  // Cursor caches http.proxy, so the caller needs to know when the value it
  // would have read is different: that is when Cursor has to read it again.
  const dir = temp(t);
  const settings = path.join(dir, 'settings.json');
  const journal = path.join(dir, 'journal.json');
  fs.writeFileSync(settings, '{}\n');

  assert.equal(applyProxy(settings, journal, 'http://127.0.0.1:52407'), true, 'first write changes the file');
  assert.equal(applyProxy(settings, journal, 'http://127.0.0.1:52407'), false, 'same value is not a change');
  assert.equal(applyProxy(settings, journal, 'http://127.0.0.1:52408'), true, 'a new address is a change');
});

test('restoreProxy reports the undo so a restart can follow it', t => {
  const dir = temp(t);
  const settings = path.join(dir, 'settings.json');
  const journal = path.join(dir, 'journal.json');
  fs.writeFileSync(settings, '{\n  "editor.fontSize": 14\n}\n');
  const before = fs.readFileSync(settings, 'utf8');

  applyProxy(settings, journal, 'http://127.0.0.1:52407');
  assert.notEqual(fs.readFileSync(settings, 'utf8'), before);
  restoreProxy(journal);
  assert.equal(fs.readFileSync(settings, 'utf8'), before, 'the original text comes back');
});

test('a cached proxy is only replaced when the address differs', t => {
  const dir = temp(t);
  const settings = path.join(dir, 'settings.json');
  const journal = path.join(dir, 'journal.json');
  fs.writeFileSync(settings, '{}\n');
  // The supervisor reapplies on every pass; only the transition may prompt a
  // restart, or Cursor would be killed in a loop while the bridge is healthy.
  const changes = ['http://127.0.0.1:52407', 'http://127.0.0.1:52407', 'http://127.0.0.1:52407']
    .map(proxy => applyProxy(settings, journal, proxy));
  assert.deepEqual(changes, [true, false, false]);
});
