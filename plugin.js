import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {atomic} from './lib/settings.js';
import {preferences} from './lib/preferences.js';
import {pageService} from './lib/page-service.js';

export default async function cursorBridge(_context, options = {}) {
  const root = process.env.CURSOR_BRIDGE_ROOT || path.join(os.homedir(), '.config/magpie-cursor-bridge');
  const value = preferences(options);
  fs.mkdirSync(root, {recursive: true, mode: 0o700});
  atomic(path.join(root, 'preferences.json'), JSON.stringify(value));
  const port = options.port ?? 52408;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid settings service port');
  await pageService(root, port);
  return {};
}
