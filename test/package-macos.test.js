import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {packageMacEngine} from '../scripts/package-macos.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-package-macos-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'bin'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({version: '0.2.8-beta-8'}));
  const integrity = {version: '0.2.8-beta-8', engine_version: '0.2.1', engine: 'old-mac', engine_win32_x64: 'keep-windows'};
  fs.writeFileSync(path.join(root, 'integrity.json'), JSON.stringify(integrity));
  fs.writeFileSync(path.join(root, 'bin/cursor-magpie-bridge'), 'old');
  const binary = path.join(root, 'built-engine');
  fs.writeFileSync(binary, 'new-arm64-engine');
  return {root, binary, integrity};
}

test('macOS packaging validates engine_version and preserves Windows integrity', t => {
  const {root, binary, integrity} = fixture(t);
  const hash = createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  assert.equal(packageMacEngine(root, binary, (cmd, args) => {
    assert.equal(cmd, binary);
    assert.deepEqual(args, ['--version']);
    return '0.2.1\n';
  }), hash);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'integrity.json'))), {...integrity, engine: hash});
  assert.equal(fs.readFileSync(path.join(root, 'bin/cursor-magpie-bridge'), 'utf8'), 'new-arm64-engine');
});

test('macOS packaging rejects a wrong engine before replacing release files', t => {
  const {root, binary, integrity} = fixture(t);
  assert.throws(() => packageMacEngine(root, binary, () => '9.9.9\n'), /Unexpected native engine version/);
  assert.equal(fs.readFileSync(path.join(root, 'bin/cursor-magpie-bridge'), 'utf8'), 'old');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'integrity.json'))), integrity);
});

test('macOS packaging rejects inconsistent release versions before executing a binary', t => {
  const {root, binary} = fixture(t);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({version: '0.2.8-beta-9'}));
  assert.throws(() => packageMacEngine(root, binary, () => assert.fail('must not execute')), /versions differ/);
  assert.equal(fs.readFileSync(path.join(root, 'bin/cursor-magpie-bridge'), 'utf8'), 'old');
});
