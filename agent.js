export const agent = {
  id: "cursor-bridge",
  name: "Cursor · Magpie Bridge",
  icon: "data:image/png;base64,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",
  bin: "cursor",
  dir: "~/.cursor",
  config: "~/.config/magpie-cursor-bridge/connection.json",
  format: "json",
  model: "model",
  ua: ["cursor-magpie-bridge"],
  notice: "打开开关即可接管 Cursor，无需重启。首次会自动安装后台桥接（约几十秒）；若弹出证书确认，选“是”。就绪后在 Cursor 里打开对话面板或点一下模型下拉框，Magpie 的模型就会出现在列表里。"
};

// Turning the agent on starts the bridge itself, so no setup step comes first.
// Node built-ins load lazily: if the sandbox offers none, the plugin still loads
// and the toggle still reports a connection.
export function connect({ gateway, model, models }) {
  start();
  return {
    enabled: true,
    gateway: gateway.v1,
    key: gateway.key,
    models: models.map(m => ({id: m.id, name: m.name || m.id, context: m.context || null}))
  };
}

function start() {
  Promise.resolve().then(async () => {
    if (process.env.MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART) return;
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const {spawn, execFileSync} = await import('node:child_process');
    const root = process.env.CURSOR_BRIDGE_ROOT || path.join(os.homedir(), '.config', 'magpie-cursor-bridge');
    // A live supervisor already keeps Cursor pointed at the bridge, but only
    // when it runs this plugin's version. Upgrading the plugin in Magpie leaves
    // the old supervisor holding the lock, and returning early on "alive" made
    // every upgrade a no-op: the version check in staged() was never reached.
    if (alive(fs, path, execFileSync, root) && runningVersion(fs, path, root) === null) {
      watch(fs, path, root, Date.now()); return;
    }
    const release = staged(fs, path, root);
    const launched = Date.now();
    if (release) { launch(fs, path, spawn, chooseRuntime(fs, path, release), release, root); watch(fs, path, root, launched); return; }
    await setup(fs, path, spawn, root);
    watch(fs, path, root, launched);
  }).catch(error => {
    // Swallowing this silently left Cursor on its own models with the toggle
    // still reading "connected"; keep the reason where the bridge status lives.
    report(error);
  });
}

// connect() must answer Magpie immediately, so readiness is reported through
// status.json rather than the return value. Polling stops once the bridge
// settles, so a healthy start costs a single read.
function watch(fs, path, root, since) {
  const file = path.join(root, 'status.json');
  const settled = () => {
    try {
      const state = JSON.parse(fs.readFileSync(file, 'utf8'));
      // A status written before this start belongs to the previous run.
      if (!(Number(state.heartbeat) >= since)) return null;
      return ['connected', 'error', 'paused'].includes(state.state) ? state.state : null;
    } catch { return null; }
  };
  let attempts = 0;
  const tick = () => {
    if (settled() || ++attempts > 60) return;
    setTimeout(tick, 1000).unref?.();
  };
  setTimeout(tick, 1000).unref?.();
}

// A Magpie connect() is one shot: nothing runs afterwards, so a supervisor that
// later dies stays dead until the user toggles the agent again. That is left to
// the watchdog built into bridge.js, which the supervisor starts for itself --
// so launch() must not disable it.

// Never let a diagnostics write decide whether connect() succeeded. spawn()
// failures have no other trace, so the injected fs/path are used when the caller
// already imported them.
function report(error, fs, path, root) {
  try {
    const write = (fs, path, root) => {
      fs.mkdirSync(root, {recursive: true, mode: 0o700});
      fs.writeFileSync(path.join(root, 'autostart.log'), `${new Date().toISOString()} ${error?.message || error}\n`, {flag: 'a'});
    };
    if (fs && path && root) { write(fs, path, root); return; }
    // A relative specifier keeps the module importable before connect() runs.
    import('node:fs').then(async fs => {
      const os = await import('node:os');
      const path = await import('node:path');
      write(fs, path, process.env.CURSOR_BRIDGE_ROOT || path.join(os.homedir(), '.config', 'magpie-cursor-bridge'));
    }).catch(() => {});
  } catch {}
}

// The lock holds the owner's start time, because Windows hands a dead
// supervisor's pid to an unrelated process and that process looks alive.
function alive(fs, path, execFileSync, root) {
  const dir = path.join(root, 'supervisor.lock');
  let pid = 0, start = null;
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8'));
    pid = Number(owner.pid);
    start = owner.start || null;
  } catch {
    try { pid = Number(fs.readFileSync(path.join(dir, 'pid'), 'utf8')); } catch { return false; }
  }
  if (!(pid > 0)) return false;
  try { process.kill(pid, 0); } catch { return false; }
  if (!start) return true;
  // Compare start times where the platform can report them, so a reused pid
  // no longer looks like the supervisor we left behind. (tasklist lists no
  // start time, so PowerShell is the only Windows source for the pair.)
  try {
    const out = execFileSync(process.platform === 'win32' ? 'powershell' : 'ps',
      process.platform === 'win32'
        ? ['-NoProfile', '-NonInteractive', '-Command', `$p=Get-Process -Id ${pid} -ErrorAction Stop; $p.ProcessName+'|'+$p.StartTime.ToUniversalTime().ToString('o')`]
        : ['-p', String(pid), '-o', 'lstart='],
      {encoding: 'utf8', windowsHide: true, timeout: 8000, stdio: ['ignore', 'pipe', 'ignore']});
    return out.trim() === start;
  } catch {
    return true;
  }
}

// The version of the supervisor that is actually serving, as published in
// status.json. Null means it matches this plugin (or cannot be told apart), so
// the caller may reuse it; a string means an older plugin is still in charge and
// the release has to be rebuilt before the next launch.
function runningVersion(fs, path, root) {
  const mine = manifestVersion(fs, path);
  if (!mine) return null;
  let state;
  try { state = JSON.parse(fs.readFileSync(path.join(root, 'status.json'), 'utf8')); } catch { return null; }
  const theirs = typeof state.version === 'string' ? state.version : null;
  // A status without a version cannot be attributed, so it is not evidence of a
  // stale supervisor; reinstalling on it would fight a healthy bridge.
  if (!theirs || theirs === mine) return null;
  return theirs;
}

// The release install.js staged, when it matches the plugin that is asking for
// it. Magpie replaces this plugin's files from GitHub without touching
// installation.json, so the recorded release can belong to an older plugin: an
// old release carries an old bridge.js, which on Windows has no watchdog at all
// and therefore stays dead after its first exit. A version mismatch must fall
// back to setup() and stage a release that actually matches these files.
function staged(fs, path, root) {
  try {
    const record = JSON.parse(fs.readFileSync(path.join(root, 'installation.json'), 'utf8'));
    const release = record.release;
    if (!release) return null;
    if (!fs.existsSync(path.join(release, 'bridge.js'))) return null;
    if (!fs.existsSync(path.join(release, 'bin'))) return null;
    // Without the plugin's own version there is nothing to compare against, so
    // keep the release: refusing it would reinstall on every single connect.
    const manifest = manifestVersion(fs, path);
    if (manifest && record.version !== manifest) return null;
    return release;
  } catch {
    return null;
  }
}

// The plugin version, read next to agent.js. Missing or malformed means unknown.
function manifestVersion(fs, path) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDirectory(path), 'package.json'), 'utf8'));
    return typeof manifest.version === 'string' ? manifest.version : null;
  } catch {
    return null;
  }
}

function chooseRuntime(fs, path, release) {
  const name = process.platform === 'win32' ? 'runtime.exe' : 'runtime';
  // setup copies the runtime into the release, so the bridge needs nothing global.
  const copy = path.join(release, 'bin', name);
  return fs.existsSync(copy) ? copy : process.execPath;
}

// First run: the packaged setup stages a release, trusts the local CA and starts
// the supervisor. It runs hidden; a Windows UAC prompt is the only sign.
async function setup(fs, path, spawn, root) {
  const here = sourceDirectory(path);
  const installer = path.join(here, 'install.js');
  if (!fs.existsSync(installer)) return;
  const runtime = magpieBun(fs, path) || process.execPath;
  await new Promise(resolve => {
    // CURSOR_BRIDGE_ROOT is a test-isolation switch, not an install location:
    // passing the real root here made pathed() move the startup entry into a
    // private Startup folder, so an upgrade left the real one pointing at the
    // previous release. Only forward it when the caller set it themselves.
    const env = {...process.env};
    if (process.env.CURSOR_BRIDGE_ROOT) env.CURSOR_BRIDGE_ROOT = root;
    else delete env.CURSOR_BRIDGE_ROOT;
    const child = spawn(runtime, [installer, 'setup'], {
      cwd: here, detached: true, stdio: 'ignore', windowsHide: true, env
    });
    child.on?.('error', resolve);
    child.on?.('exit', resolve);
    child.unref?.();
    const timer = setTimeout(resolve, 60000);
    timer.unref?.();
  });
}

function launch(fs, path, spawn, runtime, release, root) {
  // Stay in Magpie's process tree. A detached process has no parent, so memory
  // cleaners treat it as idle and kill it; Cursor then keeps dialing a dead port.
  // The supervisor is started with its own watchdog enabled: connect() runs once
  // per toggle, so nothing else would ever restart a supervisor that dies later.
  const child = spawn(runtime, [path.join(release, 'bridge.js'), 'supervise'], {
    cwd: release, stdio: 'ignore', windowsHide: true,
    env: {...process.env, CURSOR_BRIDGE_ROOT: root}
  });
  // spawn reports a runtime that cannot execute here, not by throwing. Recording
  // it is the only trace a failed launch leaves: without this the toggle reads
  // "connected" while no supervisor exists and Cursor shows its own models.
  child.on?.('error', error => report(error, fs, path, root));
  child.unref?.();
}

// The directory holding this plugin, as a filesystem path on Windows too.
function sourceDirectory(path) {
  const url = new URL(import.meta.url);
  const file = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1');
  return path.dirname(file);
}

// Magpie ships Bun; reusing it keeps setup independent of a system Node install.
function magpieBun(fs, path) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const bases = [
    path.join(home, 'Desktop', 'data', 'cache', 'bun'),
    path.join(home, '.cache', 'magpie', 'bun'),
    path.join(process.env.LOCALAPPDATA || '', 'magpie', 'bun')
  ];
  for (const base of bases) {
    let versions = [];
    try { versions = fs.readdirSync(base).sort().reverse(); } catch { continue; }
    for (const version of versions) {
      for (const name of ['magpie-bun.exe', 'magpie-bun']) {
        const file = path.join(base, version, name);
        if (fs.existsSync(file)) return file;
      }
    }
  }
  return null;
}
