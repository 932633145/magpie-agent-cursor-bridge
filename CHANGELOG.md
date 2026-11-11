# Changelog

## 0.2.8-beta-9（开发中）

### Added

- Magpie 插件设置页及 Agent 菜单入口：动态模型列表、Git 独立模型、提交提示词、Tab 处理方式、保存/实际应用状态。保持 `agent.js` 无宿主副作用。
- Git 提交与分支名按请求解析指定模型，不随主模型切换而覆盖。无效模型明确失败，不静默切换。
- 默认关闭的本地 Tab 单处插入补全：有限上下文、JSON 输出约束、UTF-16 光标和 CRLF 范围处理、2 秒预算、取消旧请求、空建议安全退出；本地/关闭模式不向 Tab 上游转发代码或文件同步请求。
- 本地 Tab 使用哈希化的稳定会话标识，不记录调用正文；网关和供应商的日志策略另行适用。
- Windows x64 隔离 CI；两平台共用补丁、协议与回归目标。设置页 Chromium 窄屏浏览器测试。

### 验证边界

- 开发中，最终双平台 CI 和真实 Cursor GUI 尚未完成；不得以本段作为发布/已验证声明。
- 不支持 Intel macOS、Windows arm64、跨文件预测、Filesync-only 请求和 Notebook 补全。普通模型速度、供应商策略和真实请求兼容性需要实测。

## 0.2.8-beta-8

### Changed

- 为 Apple Silicon macOS 增加独立的 GitHub Actions 原生构建：固定 cursor-byok v1.0.1 提交并应用完整 `source.patch`，涵盖 Agent Run 协商、BidiAppend、Auto/失效模型哈希本地路由、网关直连和子智能体处理。
- macOS 构建脚本先运行原生回归测试，再检查 arm64 架构、系统动态库依赖和代码签名；构建目录与源码分离，避免嵌入编译产物。
- macOS 打包按 `engine_version` 校验原生版本，仅更新 macOS 哈希，保留 Windows 哈希；新增打包回归测试。
- Windows 原生构建脚本补上 `bridge_route` 回归测试；本次不重建 Windows 二进制。

### 验证范围

- GitHub Actions macOS 15 arm64 构建通过：197 个 Rust 测试、70 个隔离 Node 测试全部通过；产物通过 arm64 架构、系统动态库依赖与代码签名检查。构建记录：https://github.com/flylink-code/magpie-agent-cursor-bridge/actions/runs/42970154566 。
- macOS 发布二进制 SHA-256：`a147a83b1d3d19998fc7b7f9119b2aa55e031b1b9975093333e281e577fcf8d2`；引擎自报版本仍为 `0.2.1`。Windows 本地隔离 Node 测试 70/70 通过，Windows 引擎哈希保持 beta-7 不变。
- 尚未实测 Cursor 3.29.15 / 3.26.16 GUI、macOS 27.2 和系统证书安装；不能将自动化测试通过等同于真实 GUI Agent 已验证。更新后需 Reload Window 并新建对话，详情见 README。

## 0.2.8-beta-7

### Fixed

- 修复 Cursor 子智能体启动请求缺少 `message_id` 或只包含一个父请求头时被桥接引擎拒绝的问题。缺失的消息 ID 根据消息内容确定性生成，父请求头可分别提供。

### 验证范围

- 修改需要重新构建原生引擎才能生效；本版本 Windows 引擎包含该修复，macOS 引擎未重建，不包含该修复。
- Cursor 子智能体的端到端验证须在 Magpie 更新后进行。

## 0.2.8-beta-6

### Fixed

- 修复 Magpie 网关的 `/models` 临时超时或错误会导致桥接主动停止、杀掉正常运行的引擎并让 Cursor 断开的稳定性问题。现在健康引擎会保留现有模型目录和代理连接，下一轮继续刷新模型目录。

## 0.2.8-beta-5

### Fixed

- 修复「Cursor Agent 突然提示 `You've hit your usage limit`，之后整轮对话都不能用」：Cursor 用它上一次读到的模型目录给 Agent Run 命名模型，因此可能送来 `default`（Cursor 自带的 Auto）或一个当前目录里已经不存在的哈希。旧引擎把「不是 Magpie 模型」的 Run 一律转发到 Cursor 官方上游 `api2.cursor.sh`，本机登录账号的额度用完后上游返回 `ResourceExhausted`（`ERROR_RATE_LIMITED_CHANGEABLE`），编辑器就弹出这条「升级到 Pro」的提示。现在桥接把这类 Run 改写成 Magpie 里选中的默认模型并在本地执行，Agent Run 不再被交给 Cursor 上游；新增原生回归测试 `server/tests/bridge_route.rs` 断言 Cursor Auto 落到 Magpie 路由、而目录里存在的哈希保持客户端选择。
- 模型身份哈希只由路由决定（请求地址、密钥、上游模型、OpenAI 端点），不再包含显示名。此前在 Magpie 里给模型改名或改分组会换哈希，Cursor 已经存下的模型选择随即变成 `unknown model: <hash>`；现在改名不影响已有选择，旧哈希也会按上一条规则落到默认路由上。

### Changed

- 重新生成 `source.patch`，并按 v1.0.1（`2068ab2`）重建 Windows 引擎，`integrity.json` 更新对应 SHA-256；引擎自报版本仍为 `0.2.1`。产物已在纯净的 v1.0.1 工作树上 `git apply --check` 通过，打补丁后的源码与本仓库开发树逐文件一致（仅行尾不同）。
- macOS 二进制未重建，仍不包含这些原生修复。
- `integrity.json` 的 `engine`（macOS 引擎哈希）此前是 `e67ba3f8…`，而仓库里 `bin/cursor-magpie-bridge` 的实际 SHA-256 是 `c30b83c8…`，两者从加入 Windows 支持的那次提交起就不一致，macOS 安装会在哈希校验处直接失败。现在按仓库里实际发布的二进制填写。Windows 侧仍按 `engine_win32_x64` 校验，不受影响。

### 验证提示

- 在 Magpie 更新插件后由后台 Supervisor 自动升级；不必改 Cursor 设置，也不必重启 Cursor，新建对话即可。
- 升级后第一次使用旧对话时，Cursor 缓存的旧模型哈希会落到 Magpie 里选中的默认模型；想用其他模型请在模型菜单里重新选择一次。

## 0.2.8-beta-4

### Fixed

- 修复在 Magpie 里切换默认模型时报 `magpie-agent-cursor-bridge: connect: ReferenceError: process is not defined`：`connect()` 曾在同步阶段读取 `process.env` 决定是否自启，而 Magpie 用 moejs 运行插件模块（没有 `process`、没有定时器，也不能 `import` Node 内置模块），异常直接从 `connect()` 抛出，这次连接写不进任何配置，模型也就没切过去。现在 `agent.js` 只保留插件描述和 `connect()` 返回的配置，不再触碰任何宿主 API。
- 修复「在 Magpie 更新插件后仍跑旧版本」：模块在 moejs 里无法启动进程，原先写在 `agent.js` 里的自启与重装逻辑实际从未执行过。现在由后台 Supervisor（真实 Node 进程）把 `installation.json` 指向的插件版本与自身版本比较，发现更新后调用该插件的 `install.js setup`，由其暂存新的发布副本、停掉旧进程并启动新版本；同一版本失败后 10 分钟内不重试，测试用隔离目录不会触发。

### Changed

- `agent.js` 的说明文案改为：首次使用需运行 `setup.ps1`；之后在 Magpie 更新插件会自动升级；切换模型即时生效，无需重启 Cursor。
- 新增 `lib/upgrade.js`（`sourceUpdate`）及其单元测试；`agent.test.js` 增加「在没有任何 Node 全局对象的沙箱里调用 `connect()`」的回归用例，`config.test.js` 不再需要隔离根目录。

### 验证提示

- 本次仍要执行一次 `setup.ps1`：正在运行的 0.2.8-beta-3 Supervisor 还没有自升级逻辑。装好 beta-4 之后，再在 Magpie 更新插件就不必手动运行装脚本了。
- 切换模型后约 1 秒生效；不必重启 Cursor。

## 0.2.8-beta-3

### Added

- Cursor 的「生成提交信息」改由桥接引擎本地生成，使用的是**桥接里配置的默认模型**（即在 Magpie → Agents → Cursor · Magpie Bridge 中选中的那个模型）；在 Magpie 里换模型后，提交信息与分支名同步跟随。此前引擎的 `commit_settings.model_id` 一直为空，判定为直连，请求被转发到默认 TAB 服务 `https://tab.leokun.cn` 并报 `[unavailable] http error: error sending request`。现在引擎在启动与模型目录热更新时把该设置固定为默认模型行的 `model_hash`。
- 提交信息提示词改为「语言跟随 diff」：语言判断依次看最近的提交信息、注释与文档、界面文案，没有线索时用英文；已有自定义提示词不会被覆盖。
- 「生成分支名」（`aiserver.v1.AiService/WriteGitBranchName`）改为本地生成：与提交信息共用同一个默认模型，输出前规范化为合法 git ref（小写、kebab-case、折叠并去除 `..`/`//`/首尾分隔符、上限 60 字符），不再转发到 Cursor 上游。

### Changed

- 原生测试目标新增 `--test commit_message` 与 `--bin cursor-magpie-bridge`，覆盖分支名生成与提交模型同步。
- Windows 引擎重建，`integrity.json` 更新对应 SHA-256；引擎自报版本仍为 `0.2.1`。

### Fixed

- 修复测试把工作区插件安装进真实环境：`connect()` 的自动安装微任务会在测试清掉 `MAGPIE_CURSOR_BRIDGE_NO_AUTOSTART` 之后才运行，于是从插件源码目录 stage 了一份 release 到用户目录并重启后台。现在 `start()` 在 `connect()` 的同步阶段就锁定「是否自启」与「隔离根目录」，`setup()` 也按这个决定传递 `CURSOR_BRIDGE_ROOT`；`agent.test.js` 另外在文件级使用临时根目录兜底，并新增回归用例断言不会产生安装产物。

### 验证提示

- 提交信息与分支名只用 Magpie 里选中的那一个模型，不会使用 Cursor 自己的模型设置。
- 插件版本变更会触发重新 stage 发布副本：在 Magpie 更新插件后关闭再打开一次桥接开关，并在 Cursor 执行 Developer: Reload Window，再测试提交信息与分支名。

## 0.2.8-beta-2

### Fixed

- 修复桥接连上后用户在 Cursor 里改的设置被还原：撤销日志（`settings-journal.json`）此前保存了整份 `settings.json` 快照，而且每次 600ms 轮询都把用户的新改动算进“桥接写入后的文件”，停机或重启时整份快照被写回，字号、状态栏、扩展默认值等都被改回旧值。现在日志只记录桥接自己写过的 6 个代理键，还原时逐键撤销，其余设置原样保留。
- 日志不再复制用户设置全文，其中可能包含扩展的 API key 等敏感内容。

## 0.2.9-beta

### Fixed

- 修复切换 VPN / 代理工具后模型请求失败（`error sending request for url (http://127.0.0.1:3425/v1/responses)`）：桥接引擎访问本机 Magpie 网关的 HTTP 客户端不再跟随 Windows 系统代理，也不读取 `HTTP_PROXY` 等环境变量，回环请求始终直连网关。此前引擎按系统代理设置出网，代理工具退出或切换后残留的失效代理地址会让回环请求一并失败。
- 发往 Cursor 上游的客户端行为不变；新增回归测试覆盖“环境代理指向死端口时网关请求仍直连”。

### 验证提示

- Magpie 更新插件后，关闭再打开 Cursor 桥接开关即可，无需重新安装。

## 0.2.8-beta

### Fixed

- 修复新会话持续 Reconnecting：专用桥接在 BootstrapStatsig 中明确选择已支持的 Agent Run 协议，不再继承上游 `agent_host_local_loop` 灰度配置，避免将 RunInference 请求误解码为会话状态。
- 上游正常响应和本地 fallback 均应用相同的协议能力约束，覆盖明文、djb2、sha256 三种开关名称编码；普通 cursor-byok 保持上游选择不变。

### 验证提示

- Magpie 更新插件后，关闭再打开 Cursor 桥接开关。已打开的 Cursor 窗口可能缓存旧运行模式；若仍重连，请手动执行 Reload Window 后再新建对话。插件不会自动强杀 Cursor。

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
