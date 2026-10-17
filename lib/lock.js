import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// A supervisor is identified by pid *and* start time. Windows reuses pids, and
// process.kill(pid, 0) answers "alive" for whatever now owns that number, which
// used to make a stale lock look held and leave the bridge permanently dead.

export function processStartTime(pid) {
  if (!(pid > 0)) return null;
  try {
    if (process.platform === 'win32') {
      // tasklist has no start-time column and wmic is gone from Windows 11, so
      // ask PowerShell. It is the only source that pairs pid and start time.
      const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `$p=Get-Process -Id ${pid} -ErrorAction Stop; $p.ProcessName+'|'+$p.StartTime.ToUniversalTime().ToString('o')`
      ], {encoding: 'utf8', windowsHide: true, timeout: 8000, stdio: ['ignore', 'pipe', 'ignore']});
      return out.trim() || null;
    }
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function alive(pid) {
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); return true; } catch {}
  // EPERM means the process exists but belongs to someone else.
  return processStartTime(pid) !== null;
}

// The lock is only held while the recorded process is still that process.
export function held(lockFile) {
  try {
    const owner = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    const pid = Number(owner.pid);
    if (!alive(pid)) return false;
    // An older lock wrote nothing but the pid; pid alone is all we can check.
    if (!owner.start) return true;
    const now = processStartTime(pid);
    return now === null || now === owner.start;
  } catch {
    return false;
  }
}

export function claim(lockFile) {
  fs.mkdirSync(path.dirname(lockFile), {recursive: true, mode: 0o700});
  try {
    fs.mkdirSync(lockFile);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (held(path.join(lockFile, 'owner.json'))) throw new Error('bridge supervisor already running');
    fs.rmSync(lockFile, {recursive: true, force: true});
    fs.mkdirSync(lockFile);
  }
  const owner = {pid: process.pid, start: processStartTime(process.pid), wrote: new Date().toISOString()};
  fs.writeFileSync(path.join(lockFile, 'owner.json'), JSON.stringify(owner));
  // Also record what earlier releases expected, so an older supervisor still
  // sees a live owner instead of treating a newer lock as stale.
  fs.writeFileSync(path.join(lockFile, 'pid'), String(process.pid));
  return owner;
}

export function release(lockFile, owner = {pid: process.pid}) {
  try {
    const current = JSON.parse(fs.readFileSync(path.join(lockFile, 'owner.json'), 'utf8'));
    // Never remove a lock that another process has already taken over.
    if (current.pid !== owner.pid) return;
  } catch {}
  try { fs.rmSync(lockFile, {recursive: true, force: true}); } catch {}
}
