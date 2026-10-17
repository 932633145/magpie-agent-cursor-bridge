import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {agent, connect} from '../agent.js';

const source = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent.js');

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

// Magpie loads agent plugins in a sandbox that only resolves relative files.
// A node: import here makes the whole plugin fail to load in the Magpie window.
test('agent.js stays loadable by the Magpie plugin sandbox', () => {
  const text = fs.readFileSync(source, 'utf8');
  const specifiers = [...text.matchAll(/^\s*import\s[^;]*?from\s*['"]([^'"]+)['"]/gm)].map(m => m[1]);
  const dynamic = [...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
  const requires = [...text.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
  const builtin = [...specifiers, ...dynamic, ...requires].filter(s => s.startsWith('node:') || s.startsWith('fs') || s === 'path' || s === 'os' || s === 'child_process');
  assert.deepEqual(builtin, [], 'agent.js must not import Node built-ins');
  assert.equal(typeof agent.id, 'string');
  assert.equal(agent.config, '~/.config/magpie-cursor-bridge/connection.json');
  assert.equal(agent.format, 'json');
  assert.ok(agent.notice.length > 0);
});
