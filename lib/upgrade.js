import fs from 'node:fs';
import path from 'node:path';

// The plugin Magpie holds, when it is not the one this process runs from.
//
// Magpie replaces a plugin's files in place from GitHub and never rewrites
// installation.json, and it runs agent modules in moejs, which cannot start a
// process. So the release staged by the previous plugin would keep serving
// forever: this supervisor is the only process left that can notice, and the
// plugin's own installer is the only thing that stages, stops and starts.
// Null means there is nothing to install, or nothing to compare against.
export function sourceUpdate(root, running) {
  let source;
  try {
    source = JSON.parse(fs.readFileSync(path.join(root, 'installation.json'), 'utf8')).source;
  } catch {
    return null;
  }
  if (!source) return null;
  let version;
  try {
    version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
  if (!version || version === running) return null;
  if (!fs.existsSync(path.join(source, 'install.js'))) return null;
  return {source, version};
}
