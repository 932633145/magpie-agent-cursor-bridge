import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRelay, available, listenFixed} from '../lib/relay.js';

const echo = port => new Promise(resolve => {
  const server = net.createServer(socket => socket.pipe(socket));
  server.listen(port, '127.0.0.1', () => resolve(server));
});

const roundTrip = (port, payload) => new Promise((resolve, reject) => {
  const socket = net.connect({port, host: '127.0.0.1'});
  let seen = '';
  socket.on('error', reject);
  socket.on('data', chunk => {
    seen += chunk.toString();
    if (seen.length >= payload.length) { socket.destroy(); resolve(seen); }
  });
  socket.write(payload);
});

test('the relay forwards bytes to whatever upstream port is current', async () => {
  // Cursor keeps dialing the address it read once, so the relay must survive an
  // engine restart that moves the upstream to a different port.
  const first = await echo(0);
  const firstPort = first.address().port;
  let upstream = firstPort;
  const relay = createRelay(() => upstream);
  const port = await relay.listen();
  try {
    assert.equal(await roundTrip(port, 'hello'), 'hello');
    // Simulate the engine restarting on another port.
    await new Promise(r => first.close(r));
    const second = await echo(0);
    upstream = second.address().port;
    assert.equal(await roundTrip(port, 'again'), 'again');
    await new Promise(r => second.close(r));
  } finally {
    await relay.close();
  }
});

test('a relay asked for a free fixed port keeps that exact port', async () => {
  const free = await available(0);
  assert.equal(free, true);
  const up = await echo(0);
  const relay = createRelay(() => up.address().port, {port: 0});
  const port = await relay.listen();
  try {
    assert.ok(port > 0);
    assert.equal(await roundTrip(port, 'x'), 'x');
  } finally {
    await relay.close();
    await new Promise(r => up.close(r));
  }
});

test('available() reports a port that something else already holds', async () => {
  const holder = await echo(0);
  try {
    assert.equal(await available(holder.address().port), false);
    assert.equal(await available(0), true);
  } finally {
    await new Promise(r => holder.close(r));
  }
});

test('listenFixed waits out a port that is still closing and keeps the address', async () => {
  // A watchdog restart happens about a second after the previous supervisor
  // died, and its socket can still be closing. Probing first used to answer
  // "busy" and publish a new port, which is the churn the fixed port prevents.
  const up = await echo(0);
  const holder = await echo(0);
  const busy = holder.address().port;
  // Release the holder shortly after the first attempt, like a dying process.
  setTimeout(() => holder.close(), 300);
  const {relay, port, fixed} = await listenFixed(() => up.address().port, busy, {attempts: 20, delay: 150});
  try {
    assert.equal(fixed, true, 'the preferred port is used once it frees up');
    assert.equal(port, busy);
    assert.equal(await roundTrip(port, 'kept'), 'kept');
  } finally {
    await relay.close();
    await new Promise(r => up.close(r));
  }
});

test('listenFixed falls back to any port when the preferred one never frees', async () => {
  const up = await echo(0);
  const holder = await echo(0);
  const taken = holder.address().port;
  const {relay, port, fixed} = await listenFixed(() => up.address().port, taken, {attempts: 2, delay: 50});
  try {
    assert.equal(fixed, false);
    assert.notEqual(port, taken);
    assert.equal(await roundTrip(port, 'fallback'), 'fallback');
  } finally {
    await relay.close();
    await new Promise(r => holder.close(r));
    await new Promise(r => up.close(r));
  }
});

test('the bridge publishes the relay port, not the engine port', () => {
  const text = fs.readFileSync(new URL('../bridge.js', import.meta.url), 'utf8');
  // The engine's port changes on every start; publishing it is what left Cursor
  // dialing a closed port after a restart.
  assert.match(text, /publicProxy\(\)/, 'status and settings use the stable address');
  assert.match(text, /listenFixed/, 'the fixed listener is created by the supervisor');
  assert.doesNotMatch(text, /proxy:ready\.proxy/, 'the engine port must not be published directly');
});

test('bridge.js loads and answers status without starting an engine', () => {
  const file = new URL('../bridge.js', import.meta.url);
  const run = spawnSync(process.execPath, [fileURLToPath(file), 'status'], {encoding: 'utf8', windowsHide: true});
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.stderr, /SyntaxError|ReferenceError|before initialization/);
});
