import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {preferences, readPreferences} from '../lib/preferences.js';
import {pageService} from '../lib/page-service.js';
import http from 'node:http';

function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-preferences-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}
test('role preferences default to inherited Git and unchanged Tab forwarding', () => {
  const a = preferences();
  assert.equal(a.gitModel, ''); assert.equal(a.tabMode, 'forward');
  assert.equal(preferences({gitModel: ' p/a ', port: 1234}).revision, preferences({gitModel: 'p/a'}).revision);
  for (const bad of [{tabMode: 'local'}, {tabMode: 'invalid'}, {gitModel: 3}, {gitPrompt: 'x'.repeat(16001)}, {tabModel: 'a\nb'}]) assert.throws(() => preferences(bad));
});
test('missing preferences default; corrupt preferences never reset a saved choice', t => {
  const root = scratch(t);
  assert.deepEqual(readPreferences(root), preferences());
  fs.writeFileSync(path.join(root, 'preferences.json'), JSON.stringify({gitModel: 'p/git', tabMode: 'local', tabModel: 'p/tab'}));
  assert.equal(readPreferences(root).gitModel, 'p/git');
  fs.writeFileSync(path.join(root, 'preferences.json'), '{');
  assert.throws(() => readPreferences(root));
});
test('settings service exposes only public state and refuses writes or rebinding hosts', async t => {
  const root = scratch(t), server = await pageService(root, 0);
  t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
  const url = `http://127.0.0.1:${server.address().port}`;
  fs.writeFileSync(path.join(root, 'connection.json'), JSON.stringify({key: 'SECRET', gateway: 'PRIVATE', model: 'p/a', models: [{id: 'p/a', name: '<img onerror=bad>'}]}));
  fs.writeFileSync(path.join(root, 'status.json'), JSON.stringify({state: 'connected', heartbeat: Date.now(), reason: 'SECRET'}));
  const data = await (await fetch(url + '/api/state')).text();
  assert.doesNotMatch(data, /SECRET|PRIVATE/); assert.equal(JSON.parse(data).models[0].id, 'p/a');
  assert.equal((await fetch(url + '/api/state', {method: 'POST', body: '{}'})).status, 405);
  const rebound = await new Promise((resolve, reject) => {
    http.get(url + '/api/state', {headers: {Host: 'evil.test'}}, response => {response.resume(); resolve(response.statusCode);}).on('error', reject);
  });
  assert.equal(rebound, 403);
  assert.equal((await fetch(url + '/api/state', {headers: {Origin: 'https://evil.test'}})).status, 403);
  assert.equal((await fetch(url + '/preferences.json')).status, 404);
  assert.match(await (await fetch(url + '/')).text(), /本地模型/);
  fs.writeFileSync(path.join(root, 'effective.json'), '{');
  assert.equal((await fetch(url + '/api/state')).status, 503);
});
