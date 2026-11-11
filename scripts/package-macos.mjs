import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Validate the completed build before replacing either bundled release file.
export function packageMacEngine(root, binary, exec = execFileSync) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const integrityPath = path.join(root, 'integrity.json');
  const integrity = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
  if (integrity.version !== manifest.version) throw new Error('Package and integrity versions differ');
  const reported = exec(binary, ['--version'], {encoding: 'utf8'}).trim();
  if (reported !== integrity.engine_version) throw new Error(`Unexpected native engine version: ${reported}`);
  const engine = createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  const target = path.join(root, 'bin/cursor-magpie-bridge');
  fs.copyFileSync(binary, `${target}.new`);
  fs.chmodSync(`${target}.new`, 0o755);
  fs.renameSync(`${target}.new`, target);
  fs.writeFileSync(`${integrityPath}.new`, JSON.stringify({...integrity, engine}, null, 2) + '\n');
  fs.renameSync(`${integrityPath}.new`, integrityPath);
  return engine;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  if (!process.argv[2]) throw new Error('Usage: node scripts/package-macos.mjs BUILT_ENGINE');
  console.log(`Bundled macOS arm64 engine: ${packageMacEngine(root, path.resolve(process.argv[2]))}`);
}
