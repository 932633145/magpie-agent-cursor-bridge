import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export function preferences(options = {}) {
  const {gitModel = '', gitPrompt = '', tabMode = 'forward', tabModel = ''} = options;
  for (const [key, value] of Object.entries({gitModel, gitPrompt, tabMode, tabModel})) {
    if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  }
  if (![gitModel, tabModel].every(v => v.length <= 512 && !/[\r\n\0]/.test(v))) throw new Error('Invalid model ID');
  if (gitPrompt.length > 16000) throw new Error('Git prompt exceeds 16000 characters');
  if (!['forward', 'local', 'off'].includes(tabMode)) throw new Error('Invalid Tab mode');
  if (tabMode === 'local' && !tabModel.trim()) throw new Error('Select a model before enabling local Tab');
  const value = {gitModel: gitModel.trim(), gitPrompt, tabMode, tabModel: tabModel.trim()};
  return {...value, revision: createHash('sha256').update(JSON.stringify(value)).digest('hex')};
}

// ENOENT is the only absence: malformed or unreadable state is not a reset.
export function readPreferences(root) {
  try { return preferences(JSON.parse(fs.readFileSync(path.join(root, 'preferences.json'), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return preferences(); throw error; }
}
