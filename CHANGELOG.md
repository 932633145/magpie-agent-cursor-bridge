# Changelog

## 0.2.7

A toggle restarted Cursor to make it re-read `http.proxy`, which cost every open
editor and put the gateway's 499s in the log while the model list still took its
time. The upgrade path also left two things behind: the real Startup entry still
named the previous release, and the previous release's watchdog kept running.

### Changed

- A connect or disconnect no longer restarts Cursor. The relay already keeps the
  published address constant, so a toggle does not change the value Cursor holds;
  `CURSOR_BRIDGE_RESTART_CURSOR=1` restores the old kill for anyone who wants it.
  `CURSOR_BRIDGE_NO_RESTART` is gone, since not restarting is now the default.

### Fixed

- An automatic install no longer redirects the Startup entry. `connect()` passed
  `CURSOR_BRIDGE_ROOT`, and `pathed()` treats that as an isolated install, so the
  entry was written into a private folder while the real one kept pointing at the
  release it was meant to replace: the next login started the old build. The
  variable is now forwarded only when the caller set it themselves.
- Upgrading stops the previous watchdog. It holds its own lock and outlives the
  supervisor it guards, so stopping only `supervisor.lock` left the old release's
  watchdog watching a directory that had already been replaced.
- `activate` reads the Startup entry back and fails when it does not name the
  release being installed, instead of reporting success.

## 0.2.6

Magpie replaces this plugin's files from GitHub but never rewrites the record of
the installed release, so after an update the supervisor on disk was still the
previous plugin's. `start()` asked whether a supervisor was alive and, when the
old one still held its lock, returned before anything compared versions: an
upgrade from the Magpie plugin page silently kept running the old build, and the
toggle still read connected.

### Fixed

- A live supervisor is reused only when it runs the plugin's own version. The
  version it publishes in `status.json` is compared with `package.json`, and a
  mismatch falls through to `setup()`, which stops the old supervisor and stages
  a release matching the files that are actually installed. Upgrading in Magpie
  now takes effect on the next toggle instead of requiring a manual install.
- A `status.json` without a version is not treated as a mismatch. An older
  supervisor cannot be attributed that way, and rebuilding on it would fight a
  healthy bridge on every connect.

## 0.2.5

Cursor reads `http.proxy` once and keeps using that address, so writing the
setting was never enough: Cursor only noticed when its own retry backoff
expired. Leaving the address stable helped, but the switch still felt slow.

### Fixed

- Cursor is restarted when, and only when, the published proxy address actually
  changes. This is what upstream cursor-byok does: it ends Cursor before writing
  the settings, and Cursor reads the new proxy as it reopens. The switch is now
  immediate in both directions instead of waiting for Cursor to come around.
  A rewrite with the same address still does nothing, so a healthy bridge never
  kills Cursor in a loop.
- `applyProxy` now reports whether the settings text changed, which is what
  separates a real switch from the per-pass rewrite. Disconnecting relies on the
  same signal, so Cursor drops the Magpie models as soon as the keys are removed
  instead of continuing to use a proxy that is gone.

### Added

- `CURSOR_BRIDGE_NO_RESTART=1` keeps Cursor running, trading the immediate
  switch for Cursor's own refresh delay. Useful while something unsaved is open.

## 0.2.4

Cursor caches the proxy address it read from `settings.json`, so anything that moved that address cost a visible stall. Both changes below keep the published address and the map behind it still.

### Fixed

- Cursor is given a stable proxy address. The engine takes an ephemeral port on every start, so a watchdog restart moved the address while Cursor kept dialing the previous one; its `agent-store-sync` then failed with "Failed to establish a socket connection to proxies" and retried on a backoff, which is what made the model list appear late after a reconnect. The supervisor now listens on a fixed port (`CURSOR_BRIDGE_RELAY_PORT`, default 52407) and forwards to whatever port the engine holds, so a restart is invisible to Cursor. Verified: the engine moved from pid 21340 to 31640 with the published address unchanged, and both the proxy CONNECT and the catalogue still answered.
- The fixed port is bound, not probed. Asking "is this port free?" first was a race with the previous supervisor's closing socket, which answered "busy" and published a different address -- exactly the churn the fixed port prevents. Binding is retried briefly, and a fallback port is announced in `status.json` instead of being adopted silently.
- A toggle is noticed in under a second. The serving loop waited two seconds and the catalogue was refreshed every fifteen, although the gateway answers in tens of milliseconds. Disconnect and reconnect now measure about 0.8s each, down from 1.5s and 1.9s.

## 0.2.3

Everything below was found on a machine where Magpie showed the agent as connected while Cursor listed only its own models. The bridge had been dead for seventeen hours and nothing said so.

### Fixed

- A release staged by an earlier plugin is no longer launched. Magpie replaces this plugin's files from GitHub but never rewrites `installation.json`, so the recorded release could belong to the previous plugin; the older `bridge.js` has no watchdog, and one exit left the bridge down for good. A version mismatch now falls back to `setup()` and stages a release that matches the installed files.
- The supervisor starts with its own watchdog enabled. `launch()` passed `CURSOR_BRIDGE_NO_WATCHDOG=1`, which disabled the only watchdog that exists: `connect()` runs once per toggle, so nothing else could ever restart a supervisor that died. A killed supervisor was revived within a second in testing, and Cursor's proxy followed the new port.
- A failed launch is recorded in `autostart.log`. `spawn` reports an unrunnable runtime through its `error` event instead of throwing, and the handler was empty, so a launch that never produced a supervisor left no evidence anywhere.
- An engine that exits before `ready` no longer reports "check certificate trust". Exit code 107 was printed with that hint on a machine whose CA was trusted all along, sending every reader down the wrong path; the message now says the engine exited before ready and leaves the cause to the engine's own stderr.
- A scratch `home` no longer writes the Startup entry of the real profile. `paths()` read `APPDATA` unconditionally, so running the tests overwrote the real Startup script with a path into `%TEMP%`; that tree was deleted when the test finished and every later login silently started nothing.
- `install.js` honours `CURSOR_BRIDGE_ROOT`. It ignored the variable `agent.js` passes when falling back to `setup()`, so a run that asked for an isolated root rewrote the real `installation.json`, staged into the real release directory and started a second supervisor.
- `npm-shrinkwrap.json` no longer pins the package to macOS/arm64. Installing on Windows was refused by npm's platform check while `package.json` already allowed both platforms.

### Changed

- Starting the bridge is reported as `starting` until the engine is up, so a reader never sees the previous run's `connected` during the gap.
- The agent notice no longer tells users to restart Cursor. The catalogue is served per request, so opening a panel or the model picker is enough; the old wording sent users to a restart that merely masked the startup delay.

### Added

- A release bump no longer breaks the tests: they read the version from `package.json` instead of repeating the string.

## 0.2.2

- Turning the agent on starts the bridge: a staged release is launched as the supervisor, and a first run falls back to the packaged setup.
- Node built-ins load lazily inside `connect()`, so the agent module still imports when the sandbox offers none.
- Windows certificate trust follows the engine's own CA verdict. The bridge reads the local machine root store, so a per-user import no longer reports success while the bridge refuses to start.
- The packaged native engine stays at 0.2.1: its version is compiled into the binary, so `integrity.json` now pins `engine_version` separately and a JavaScript release no longer has to match it.

### Fixed

- A stale `supervisor.lock` no longer disables model sync. The lock records the owner's pid *and* start time, so a dead supervisor whose pid was reused by an unrelated process is reclaimed instead of answering "already running". This was the reported cause of Cursor showing no Magpie models while Magpie still showed the agent as connected.
- `status.json` now carries a heartbeat, so a supervisor that dies without a clean shutdown no longer leaves a frozen `connected` state that reads as healthy.
- A failed autostart is recorded in `autostart.log` instead of being swallowed, so a bridge that never started is diagnosable.
- The install tests run even where the OS temp directory refuses the native engine's certificate store.

## 0.2.1

- Hide Cursor Auto in the bridge model picker using Cursor's display configuration, including clearing cached Auto controls. Magpie models and route groups remain selectable.

## 0.2.0

- Standard Magpie Agent package with an explicit file allowlist and bundled JavaScript dependency.
- Independent, per-machine certificate initialization; no original Cursor BYOK installation needed.
- Windows trust checks the generated CA thumbprint, so an older Cursor BYOK root with the same name is not treated as trusted.
- The agent module imports only relative files, so Magpie's plugin sandbox can load it.
- Explicit macOS certificate trust step with SSL trust verification; existing certificates preserved.
- Setup reuses Magpie's Bun and keeps a local runtime copy, removing the dependency on user-installed Node.
- Plugin/native version pairing and native SHA-256 verification.
- Complete version directories and rollback of launch configuration after failed service registration.
- Status reports the actual running version. Updating the plugin requires rerunning setup to activate the matching service.
- Apple Silicon macOS only; no installation lifecycle scripts and no credentials in the package.

## 0.1.1

- Return only Magpie's model catalogue, without appending Cursor subscription models.

## 0.1.0

- Cursor protocol bridge through Magpie, background lifecycle, and recoverable proxy settings.
