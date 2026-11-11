# Cursor · Magpie Bridge

让 Cursor 编辑器直接使用 Magpie 中配置的模型与路由组。模型菜单返回 Magpie 模型目录，隐藏 Cursor 默认 Auto 入口，保留 Cursor 原有登录。

## 项目来源与维护

本仓库是 [932633145/magpie-agent-cursor-bridge](https://github.com/932633145/magpie-agent-cursor-bridge) 的社区维护 Fork，由 [flylink-code](https://github.com/flylink-code) 维护；它并非 Magpie、Cursor 或上游项目的官方发行版，也不代表获得上述项目的背书。Fork 包含尚未合并上游的修改；向源工程提交的变更可见 [Pull Request #5](https://github.com/932633145/magpie-agent-cursor-bridge/pull/5)。

原生引擎基于 [leookun/cursor-byok](https://github.com/leookun/cursor-byok) v1.0.1（`2068ab20513288e6a0289d33febe872a30608610`），遵循 MIT 许可证，原始版权声明和许可文本见 [LICENSE](LICENSE)；其他依赖及来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，原生源码改动见 [source.patch](source.patch)。

**不要同时启用本 Fork 和上游版本**：二者使用相同的 `cursor-bridge` Agent ID、连接配置和本机桥接目录，可能发生配置及进程冲突。切换来源前先关闭现有桥接并确认代理已恢复，再在 Magpie 中更换插件来源；不要直接删除证书或数据目录作为切换步骤。

## 当前版本与验证范围

- `0.2.8-beta-9`：修复 Shell 输出文件引用、交错输出及头尾摘要丢失，流式退出也保留输出位置；模型通过同一环境的 Read 获取完整输出，桥接不会读取远端路径。Windows x64 与 macOS arm64 均已重建：两平台旧代码上的 3 个回归测试全部失败，修复后各 218 个 Rust 测试、70 个隔离 Node 测试通过。[Windows 构建](https://github.com/flylink-code/magpie-agent-cursor-bridge/actions/runs/43044986695) / [macOS 构建](https://github.com/flylink-code/magpie-agent-cursor-bridge/actions/runs/43044986591)。此版本不含已撤回的设置页、高级模型配置或实验性本地 Tab；macOS GUI 新修复尚未独立实测，也未认定报告者 stdout 现象的唯一原因。
- `0.2.8-beta-8`：补齐 Apple Silicon macOS 原生引擎的构建与发布流程，应用当前完整 `source.patch`，包含 Agent Run 协商、BidiAppend、Auto/失效模型哈希本地路由、网关直连及子智能体处理。[GitHub Actions macOS 15 arm64 构建](https://github.com/flylink-code/magpie-agent-cursor-bridge/actions/runs/42970154566)已通过 197 个 Rust 测试和 70 个隔离 Node 测试，以及 arm64 架构、系统动态库依赖、代码签名检查。macOS 引擎 SHA-256：`a147a83b1d3d19998fc7b7f9119b2aa55e031b1b9975093333e281e577fcf8d2`；构建来源随预发布附件提供。Windows 二进制沿用 beta-7。
- **新版 Cursor 实机反馈**：2026-11-11，[Issue #10 报告者](https://github.com/932633145/magpie-agent-cursor-bridge/issues/10#issuecomment-6796941990)确认在 Apple Silicon macOS 27.2、Cursor **3.29.15** 上安装 beta-8 并核对引擎哈希后，GUI 单轮问答正常，桥接记录为 `llm_calls completed/200`、`runs root completed`；CLI 与 Auto 路由也正常。这是报告者的实机结果，不是维护者独立复测。
- **支持方向与验证边界**：本 Fork 主要面向新版 Cursor，后续优先跟进 3.29.15 及更新版本的协议和使用情况；这不代表已验证所有更新版本，也不承诺旧版本兼容。3.26.16 未复测，不要求为验收降级。多轮、真实工具调用和子智能体仍待验证，不能由单轮成功扩大为全功能通过。代码签名检查只确认产物签名结构有效，不代表 Apple Developer ID 身份签名或公证；系统证书信任安装未由维护者独立验证。
- `0.2.8-beta-7`：Windows 引擎处理子智能体请求缺少 `message_id` 或仅携带一个父请求头的情况。Windows 发布引擎已构建；新增 Rust 回归测试未运行，一次子智能体任务已完成，但尚未独立核实该任务经过此桥接，也不能证明每种协议边界都已验证。
- `0.2.8-beta-6`：模型目录刷新临时失败时，保留仍健康的引擎和代理，避免因此主动断开 Cursor。
- beta-7 及更早预览版的新增原生修复只进入 Windows x64 二进制，macOS 引擎当时未重建；下文历史说明中的“macOS 未重建”均指对应旧版，不代表 beta-8 的发布范围。

## 安全与隐私说明

首次安装会生成本机根证书，并请求用户授权将其加入操作系统的受信任根证书库。信任根证书意味着持有对应私钥的程序能够签发受该信任范围认可的证书；请妥善保护本机账户和桥接私钥，只在信任该插件并理解风险后授权。

桥接会修改 Cursor 用户设置中的代理相关项，流量通过本机代理进入原生引擎；发往 Magpie 的模型请求再由本机网关转发给你配置的模型提供商。其他 Cursor 请求可能转发至 Cursor 上游，模型内容是否离开本机取决于所选提供商，不能将全部流量描述为仅在本机流转。

断开或卸载时，桥接尝试按日志还原自己修改过的代理项；若这些项已被其他程序或用户修改，会保留外部改动。**卸载默认保留根证书、数据和恢复记录**，不会自动撤销系统对证书的信任；如需彻底移除，应先确认不再使用该桥接，再通过操作系统证书管理工具按证书指纹核对并手动移除对应信任，谨防误删其他证书。

## 历史版本说明

`0.2.8-beta-5` 修复「Cursor Agent 突然提示 `You've hit your usage limit`、之后整轮对话不能用」：Cursor 用它上次读到的模型目录给 Agent Run 命名模型，可能送来 `default`（Cursor 自带 Auto）或一个当前目录里已不存在的哈希；旧引擎把这类 Run 转发到 Cursor 官方上游，本机账号额度用完后上游回 `ResourceExhausted`，编辑器就弹这条升级提示。现在这类 Run 一律改写为 Magpie 里选中的默认模型并在本地执行，不再交给 Cursor 上游。同时模型身份哈希不再包含显示名，在 Magpie 里给模型改名/改分组不会再让 Cursor 已存下的选择变成 `unknown model: <hash>`。**本次更新需要重建的原生引擎，只包含 Windows 二进制**：在 Magpie 更新插件即自动升级，无需改 Cursor 设置。

在 beta-4 阶段，桥接修复了 Magpie 模型切换时的 `process is not defined` 问题，并由 Supervisor 接管插件自升级；这些机制已包含在当前版本中。旧版本首次升级时曾需要手动运行 `setup.ps1`，当前 beta-7 用户按上面的安装流程执行即可。

`0.2.8-beta-3` 让 Cursor 的两个 Git 生成动作也走 Magpie 模型：SCM 面板的「生成提交信息」由桥接引擎在本地生成（语言跟随 diff 内容），「生成分支名」同样本地生成并规范化为合法 git ref，两者都不再转发到 Cursor 上游或公共 TAB 服务。**两者使用的是桥接里配置的默认模型**，也就是你在 Magpie → Agents → Cursor · Magpie Bridge 里选中的那个模型；换模型后两个动作同步跟随，不使用 Cursor 自己的模型设置。

`0.2.8-beta-2` 是 **Windows x64 测试版**：Windows 引擎通过协议协商选择 Agent Run，修复新版 Cursor 新会话持续 Reconnecting；并让引擎访问本机 Magpie 网关时不再经过系统代理，修复切换 VPN / 代理工具后请求失败；并修复桥接运行期间在 Cursor 里修改的设置（字号、状态栏、扩展默认值等）在停机或重启时被还原的问题。更新后请切换一次 Magpie 桥接开关，并在 Cursor 执行 **Developer: Reload Window**，清除窗口缓存的旧运行模式后新建对话测试。

此测试版保留现有 macOS 二进制，**macOS 尚未包含本次原生修复**；不要将其视为 macOS 已验证版本。

---

## 特性

- **平台支持**：安装器支持 Windows x64 和 Apple Silicon macOS；最新原生协议修复的支持范围见上方版本说明。
- **动态模型同步**：后台约每 4 秒向 Magpie 刷新一次模型目录；Cursor 模型菜单何时更新取决于它何时重新请求目录。
- **Git 动作本地生成**：SCM 面板的「生成提交信息」与「生成分支名」由桥接里配置的默认模型（Magpie 中为 Cursor · Magpie Bridge 选中的模型）生成，提交信息语言跟随 diff 内容，分支名输出为合法 git ref。
- **代理配置还原**：连接时配置 Cursor 代理，断开或卸载时按日志还原桥接写入的代理项，保留检测到的外部改动。
- **数据路径**：发往 Magpie 的模型请求经本机回环代理和本机网关转发给所选模型提供商；其他请求的转发与证书信任风险见上方安全说明。

---

### 在 Magpie 中安装与上架状态

本 Fork 可以直接作为 Git 插件安装：

```text
github:flylink-code/magpie-agent-cursor-bridge
```

它目前不是 `magpie-community/plugins` 的社区推荐包，也不是 Magpie 官方插件。社区仓库的 `registry.json` 和 npm 发布需要社区维护者审核；GitHub Fork 也不会自动进入 Magpie 的第三方插件发现列表。用户可以通过上面的 GitHub 地址安装，但应把它视为 `flylink-code` 维护的社区 Fork，并自行评估来源、证书和代理风险。

---

## 安装与快速上手

### 前置条件
- 已在本机安装 **Cursor** 与 **Magpie**。
- 已在 Magpie 中添加并配置好至少一个可用模型或路由组。

---

### Windows 系统使用步骤

1. **运行初始化**：
   在插件目录下打开 PowerShell 执行初始化脚本（或直接双击运行 `setup.cmd`）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\setup.ps1
   ```
   *注：首次初始化时会检查并提示信任本机生成的本地根证书（系统标准确认窗口选择“是”即可）。*
   *安装一次即可：之后在 Magpie 更新插件时，运行中的后台桥接会自行调用该脚本完成升级，不用再手动运行。*

2. **在 Magpie 中选择模型**：
   - 打开 Magpie，在 **Agents** 页面找到 **Cursor · Magpie Bridge**。
   - 打开开关，并从下拉列表中挑选您希望在 Cursor 中使用的模型或路由组。

3. **在 Cursor 中刷新模型列表**：
   - 首次开启后，后台桥接需要几十秒启动；等状态变为已连接即可。
   - 打开对话面板，或点一下底部的模型下拉框——Cursor 会重新拉取模型表，Magpie 提供的模型随即出现，点击即可畅快对话。

   > 无需重启 Cursor。模型目录是按请求下发的，只要 Cursor 重新发起一次拉取就会更新；
   > 若列表没变，再点一次模型下拉框即可。重启也只是强制刷新的一种方式。

---

### macOS 系统使用步骤

**beta-8 升级验收**：从 Magpie 更新 `github:flylink-code/magpie-agent-cursor-bridge` 后，确认插件版本为 `0.2.8-beta-8`，运行 `bash setup.command status` 检查服务。若旧 Supervisor 未自动升级，在更新后的插件目录执行 `bash setup.command`。不要只下载 Release 附件后覆盖正在运行的引擎，安装器需要同步暂存版本和完整性清单。

在 Cursor 执行一次 **Developer: Reload Window**，刷新旧的运行模式缓存，再新建对话。主要使用新版 Cursor 验收，无需为此降级旧版本：先测普通问答和多轮，再测工具、Auto/默认模型、子智能体；同时确认 Magpie 网关确有对应模型请求，而非只确认目录可见。分别记录 Cursor 版本、结果和运行中发布目录的引擎 SHA-256。若反馈日志，只提供脱敏的错误与请求标识，不上传完整 `connection.json`、数据库、密钥或对话内容。停用后确认代理恢复。

**CLI 模型 ID 迁移**：从旧版 macOS 引擎升级后，模型 ID（哈希）可能变化。新版身份计算不再包含显示名，避免以后仅改名就使选择失效。若脚本固定使用旧的 `--model` ID 并提示 `Cannot use this model`，请先运行 `cursor-agent --list-models` 查询当前 ID，再更新脚本；GUI 如保留旧选择，也需重新选择当前模型目录中的模型。桥接的失效模型回退不保证绕过 CLI 自身的目录校验。

1. **运行初始化**：
   在终端中运行：
   ```bash
   bash setup.command
   ```
   *根据系统提示完成本地钥匙串证书信任授权。*

2. **在 Magpie 中选择模型**：
   - 在 Magpie → **Agents** 中开启 **Cursor · Magpie Bridge** 并选择模型。
   - 等后台桥接启动完成（几十秒），在 Cursor 中打开对话面板或点一下模型下拉框即可看到 Magpie 的模型；无需重启 Cursor。

---

## 常用管理命令

| 操作 | Windows (PowerShell) | macOS / Linux (Bash) |
| :--- | :--- | :--- |
| **启动/更新服务** | `powershell -ExecutionPolicy Bypass -File setup.ps1` | `bash setup.command` |
| **查看后台运行状态** | `powershell -ExecutionPolicy Bypass -File setup.ps1 status` | `bash setup.command status` |
| **停用并卸载后台服务** | `powershell -ExecutionPolicy Bypass -File setup.ps1 uninstall` | `bash setup.command uninstall` |

- **断开连接**：在 Magpie 的 Agents 页面选择 Disconnect，或在终端执行 `magpie cursor-bridge default`。
- **代理自愈与还原**：当桥接服务退出或在 Magpie 中断开连接时，Cursor 的代理配置会自动恢复为初始状态。

---

## 架构与工作流程

```text
Magpie Agent 插件 → 写入私有连接配置 (connection.json)
                                ↓
                      后台监视器 (Supervisor)
                      ├─ 启停原生桥接引擎 (cursor-magpie-bridge)
                      └─ 自动维护/还原 Cursor 代理设置 (settings.json)
                                ↓
Cursor 编辑器 ──[本地 TLS 回环代理]──> 原生桥接服务 ──[OpenAI 协议兼容]──> 本地 Magpie 网关 ──> 大模型提供商
```

- **配置与数据隔离目录**：
  - Windows: `%USERPROFILE%\.config\magpie-cursor-bridge\`
  - macOS: `~/.config/magpie-cursor-bridge/`
- **运行产物与自启**：
  - Windows: 自启通过当前用户 Startup 目录无窗口后台执行。
  - macOS: 通过 `launchd` 用户 LaunchAgent 守护。

---

## 原生协议回归测试

macOS Apple Silicon：`bash scripts/build-native.sh`。仅用于独立构建环境，**不要在真实安装或运行目录热编译测试**。脚本获取固定上游提交并应用补丁，串行运行 `--lib`、bin 自测、`bridge_bidi_wire`、`bridge_route`、`commit_message` 和 `error_lifecycle`，再编译 release。需 Node.js、Rust 与 Xcode Command Line Tools；依赖源码默认以 SSH 获取。GitHub Actions 在无个人 SSH 密钥的公开构建机上将该公开依赖地址映射为 HTTPS。CI 配置见 `.github/workflows/native-macos.yml`，使用固定 macOS 15 arm64 标签、只读权限及固定 Action 提交；不会执行安装器或导入系统信任证书。

打包脚本 `scripts/package-macos.mjs` 按 `integrity.json.engine_version` 校验引擎，并保留 Windows 哈希。插件版本和原生 `--version` 可以不同；当前引擎仍自报 `0.2.1`，应使用发布 SHA-256 和构建来源区分新旧引擎。

Windows：`powershell -ExecutionPolicy Bypass -File scripts\test-native-wire.ps1`。
脚本在插件内获取固定版本源码、应用 `source.patch`，运行无需 TLS、证书或真实设置的解码器测试及原生库测试。
源码保留在已忽略的 `.native-source/`，编译产物位于 `.native-target/`。完整构建并更新 Windows 二进制与 SHA-256：`powershell -ExecutionPolicy Bypass -File scripts\build-native.ps1`（需要 Rust/MSVC 工具链）。

测试目标包括 `bridge_bidi_wire`、`commit_message`、`cursor-magpie-bridge`（bin 自测）与 `--lib`。其中上游 `provider::attempt::tests::request_transport_failure_is_one_failed_attempt` 要求本机不拦截回环请求：reqwest 默认使用 Windows 系统代理，代理开启时连向已关闭端口的请求也会被代理应答，该用例因此失败。构建前请关闭系统代理，或临时退出代理工具。

### 0.2.8-beta-3 原生引擎重建

`source.patch` 新增：headless 引擎在启动与模型目录热更新时，把提交模型固定到**桥接里配置的默认模型**（`commit_settings.model_id` 写入该模型行的 `model_hash`，提示词使用「跟随 diff 语言」的自动提示词，已有自定义提示词保留），因此 Cursor 的 `WriteGitCommitMessage` 由本机生成而不再转发；同时在引擎内本地实现 `aiserver.v1.AiService/WriteGitBranchName`（同一个默认模型、输出前规范化为合法 git ref），并把该路径加入本机拦截列表。

### 0.2.8 Windows 兼容性测试更新

已重新构建仓库内 Windows 引擎并更新 `integrity.json`。补丁支持 hex / `data_binary` 两种 BidiAppend 编码，修正 Windows 的 Unix 信号引用，并在 protobuf 解码失败时记录字段编号、wire 类型和长度（不记录字段值）。macOS 二进制保持原样，不包含这些原生变更。插件版本为 0.2.8，原生引擎版本标识仍为 0.2.1，由 SHA-256 区分构建。

Magpie 从 GitHub 仓库默认分支安装文件，不需要 GitHub Release。在 **Plugins** 更新 `github:flylink-code/magpie-agent-cursor-bridge`；若原插件来自 `932633145`，先关闭 Agents 开关，再将插件来源替换为上述 fork。确认版本为 **0.2.8-beta-7**，在更新后的插件目录运行一次 `powershell -ExecutionPolicy Bypass -File .\setup.ps1`，再开启 Agents 开关；此后在 Magpie 更新插件由后台 Supervisor 自动升级，不必再手动运行。此操作由用户执行，构建测试不会修改已安装配置或证书。重开 Cursor 对话并发送新消息。0.2.8 的 tracing 诊断未接入实际输出，Supervisor 也会丢弃引擎 stderr，因此无法从桥接日志取得 `wire_structure`。当前源码改为在解码错误响应中返回有界的 `wire structure`（仅字段编号、类型、长度和偏移，不含字段值）；重新构建安装后，可从 Cursor Agent Host 日志取得这些诊断。此源码改动尚未作为新版本发布。
Cursor 3.27.14 的 `conversation_state` wire type 6 原始故障尚未定位：合成合法状态可正常解码，合成非法状态可复现相同错误路径，但日志没有请求字节，不能据此断言字段变更或压缩问题。二进制编码支持不是该故障已修复的证据。

### 0.2.9 Windows：MCP Schema 整数转换修正

已确认 sub2api GPT 可因工具定义的 `minLength: 1.0` 被拒绝：Protobuf `Value` 用 double 表示所有数字，原转换保留浮点形式。当前源码在 MCP 输入转换边界将安全整数范围内的整值恢复为 JSON 整数，保留非整数及超出安全整数范围的浮点值。原生回归测试覆盖整数、零、负数与小数；本机已验证此前失败的 `sub2api/gpt-5.6-luna` 请求完成，HTTP 200、14 个输出 token、15 个流事件且无 provider error。0.2.9 包含更新后的 Windows 引擎和完整性校验；macOS 引擎未重新构建。

## 多供应商兼容边界

桥接通过 Magpie 网关使用统一协议，不按 DeepSeek、GPT、Kimi、GLM 或 Kiro 品牌硬编码转换。供应商名称不能证明兼容：仍需验证网关的协议转换、流式输出、工具调用及模型能力。

- 已实际验证：DeepSeek、sub2api GPT Luna/Terra 的基础对话。
- Antigravity 当前返回 HTTP 403 `permission_error`，说明账号所在地区不符合 Gemini Code Assist 使用资格。这属于上游授权拒绝，不应删改工具 Schema、盲目重试或静默切换模型来掩盖。需先在供应商支持的地区和账号条件下恢复授权，或选择其他获授权来源。
- Kiro 反代、Kimi、GLM 尚未实际联调；不承诺所有模型支持工具、图片、推理参数或同样的上下文长度。
- Schema 回归覆盖嵌套 `anyOf/properties`、整数长度/数量约束、小数 `minimum/multipleOf`、安全整数边界及非有限数处理。不按供应商删除约束，也不把所有小数强制取整。
- 新来源验收顺序：普通流式对话 → 多轮 → 工具调用及结果回传 → 该模型声明支持的图片/推理能力；分别检查授权错误（401/403）、限流（429）、参数错误（400）和上游故障（5xx），不可将所有失败都归因于桥接。

## 开源协议

本项目核心遵循 [MIT License](LICENSE)。
部分原生协议核心来源于开源项目 cursor-byok（MIT License）。
