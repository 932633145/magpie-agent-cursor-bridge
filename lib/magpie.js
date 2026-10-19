import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Magpie keeps the Connect switch in its own state file: an agent it is wired
// to carries `wired: true`, and switching off drops the field. Nothing is
// written to the agent's own config on disconnect, so this is the only signal a
// bridge has that the user turned it off. Reading it is what lets Cursor get its
// own model list back without a manual toggle.
export const agentId = 'cursor-bridge';

export function candidates(home = os.homedir()) {
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData/Local');
  const roaming = process.env.APPDATA || path.join(home, 'AppData/Roaming');
  return [
    path.join(home, 'Desktop', 'data', 'cache', 'agents-state.json'),
    path.join(home, '.cache', 'magpie', 'agents-state.json'),
    path.join(local, 'magpie', 'cache', 'agents-state.json'),
    path.join(local, 'Programs', 'magpie', 'cache', 'agents-state.json'),
    path.join(roaming, 'magpie', 'cache', 'agents-state.json')
  ];
}

// Returns null when Magpie's state cannot be read, so a missing or half-written
// file never turns into a disconnect. Only a clear answer counts.
export function wired(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
  let state;
  try { state = JSON.parse(text).state; } catch { return null; }
  const agents = state?.agents;
  if (!Array.isArray(agents)) return null;
  const mine = agents.find(agent => agent?.id === agentId);
  // Magpie lists every agent it knows, so a missing entry means this plugin is
  // not installed in its view; treat that as no opinion rather than a switch.
  if (!mine) return null;
  return mine.wired === true;
}

// The first readable Magpie state wins; null when none of them is usable.
export function readWired(home) {
  for (const file of candidates(home)) {
    const answer = wired(file);
    if (answer !== null) return answer;
  }
  return null;
}

// Used by the supervisor's loop: a clear `false` means the user switched off.
export function switchedOff(home) {
  return readWired(home) === false;
}

// Magpie omits `wired` both when the switch is off and after a restart that
// forgot the switch. Treating every omission as "off" made the bridge refuse
// to come back. Only a switch we have already seen turn on, and then off,
// should stop it.
export function nextMagpieGate(previous, reading) {
  if (reading === true) return {hold: false, next: true};
  if (reading === false && (previous === true || previous === false)) return {hold: true, next: false};
  return {hold: false, next: previous};
}
