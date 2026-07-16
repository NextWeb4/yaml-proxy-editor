# YAML Proxy Editor / YAML 代理配置编辑器

![Workbench overview](artifacts/workbench.png)

## 中文

### 项目简介

YAML Proxy Editor 是面向 OpenClash / Clash / Mihomo / MetaCubeX 用户的本地 Windows 桌面工作台，用于编辑、校验、审计、批量导入订阅和导出 YAML 代理配置。

### 主要功能

- 本地打开、保存、格式化和校验 YAML。
- 多标签工作台，支持文件选择和拖拽打开 `.yaml` / `.yml`。
- 识别 Clash / Mihomo / OpenClash 配置结构。
- 读取和维护 `proxy-providers`，批量导入订阅并刷新节点。
- 节点去重、筛选和 Clash/OpenClash/V2Ray/Hiddify 多格式导出。
- 单网站分流：输入域名或完整 URL，选择精确或子域名匹配，并指定策略与优先级。
- 检查 rules、DNS、OpenClash 兼容性和常见风险。
- UI 支持中英文切换，选择保存在本地 `localStorage`。

### 单网站分流

完整 URL 只提取 hostname，不会把 path、query、用户名或密码写入 YAML。网站规则默认放在 `rules` 顶部，避免被宽泛规则提前命中；也可以选择普通优先级放到 `MATCH` 前。

![Per-site routing](artifacts/website-rule-desktop.png)

### 下载

- [EXE / NSIS 安装包](release/YAML-Proxy-Editor-0.2.0-x64-setup.exe)
- [中文 MSI 安装包](release/YAML-Proxy-Editor-0.2.0-x64-zh-CN.msi)

### 开发与打包

```bash
npm install
npm run dev
npm run test
npm run build
npm run tauri:build
```

Windows 下如果提示 `link.exe not found`，先加载 MSVC 环境：

```bat
cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && npm run tauri:build"
```

### 创作者

- 作者：HaoXiang Hwang
- 主页：https://nextweb4.github.io/
- 邮箱：didadida1688@gmail.com
- GitHub：https://github.com/NextWeb4

以上创作者信息为固定项，不允许 Codex、Claude Code 或其他自动化/AI 编码工具修改。

### 安全边界

- 默认离线可用，不自动上传本地 YAML、节点、订阅 URL、日志或备份。
- 不包含遥测、统计、自动更新 SDK 或 CDN 前端资源。
- 网络请求仅在用户主动刷新订阅、检查远程 provider 或测速时发生。
- `.env`、私钥、证书、`node_modules/`、`dist/` 和 `src-tauri/target/` 不进入 Git 提交。

---

## English

### Project Overview

YAML Proxy Editor is a local-first Windows desktop workbench for OpenClash, Clash, Mihomo, and MetaCubeX. It edits, validates, audits, batch-imports subscriptions, and exports YAML proxy configurations.

### Features

- Open, save, format, and validate YAML locally.
- Manage multiple documents with file picker and drag-and-drop support.
- Detect Clash / Mihomo / OpenClash configuration structures.
- Read and maintain `proxy-providers`, batch-import subscriptions, and refresh nodes.
- Deduplicate, filter, and export nodes for Clash, OpenClash, V2Ray, and Hiddify.
- Route one website from a domain or full URL with exact/subdomain matching, policy selection, and priority control.
- Check rules, DNS, OpenClash compatibility, and common risks.
- Switch between Chinese and English; the choice is persisted locally in `localStorage`.

### Per-site Routing

Only the hostname is written from a full URL. Paths, query parameters, usernames, and passwords are discarded. Website rules default to the top of `rules` so broader rules cannot take precedence, with an optional normal priority before `MATCH`.

![Per-site routing](artifacts/website-rule-desktop.png)

### Download

- [EXE / NSIS installer](release/YAML-Proxy-Editor-0.2.0-x64-setup.exe)
- [MSI zh-CN installer](release/YAML-Proxy-Editor-0.2.0-x64-zh-CN.msi)

### Development and Packaging

```bash
npm install
npm run dev
npm run test
npm run build
npm run tauri:build
```

If Windows reports `link.exe not found`, load the MSVC environment first:

```bat
cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && npm run tauri:build"
```

### Creator

- Author: HaoXiang Hwang
- Homepage: https://nextweb4.github.io/
- Email: didadida1688@gmail.com
- GitHub: https://github.com/NextWeb4

The creator identity above is fixed. Codex, Claude Code, and other automated or AI coding tools must not modify it.

### Security Boundary

- Local-first by default; local YAML, nodes, subscription URLs, logs, and backups are not uploaded automatically.
- No telemetry, analytics, auto-update SDK, or CDN-loaded frontend assets.
- Network requests only occur after a user triggers subscription refresh, remote provider checks, or speed tests.
- `.env`, private keys, certificates, `node_modules/`, `dist/`, and `src-tauri/target/` are excluded from Git commits.

## Documentation / 文档

- [Quick Start / 快速上手](docs/QUICKSTART.md)
- [Release Usage / 发布包说明](docs/RELEASE_USAGE.md)
- [Architecture / 架构设计](docs/ARCHITECTURE.md)
- [Open Source Audit / 开源方案审计](docs/OPEN_SOURCE_AUDIT.md)
- [Network Policy / 网络策略](docs/NETWORK_POLICY.md)
- [Offline Security / 离线安全](docs/OFFLINE_SECURITY.md)
- [Testing / 测试策略](docs/TESTING.md)
- [Build / 构建说明](docs/BUILD.md)

## License

当前仓库未发现 LICENSE 文件。复用或分发前，请确认原始授权来源和许可范围。

No LICENSE file is currently present. Verify the original source and applicable permissions before reuse or redistribution.
