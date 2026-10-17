# Changelog

## Unreleased

- Starting the bridge is reported as `starting` until the engine is up, so a reader never sees the previous run's `connected` during the gap.
- The agent notice no longer tells users to restart Cursor. The catalogue is served per request, so opening a panel or the model picker is enough; the old wording sent users to a restart that merely masked the startup delay.

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
