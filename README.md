# YAML Proxy Editor / YAML 代理配置编辑器

![Workbench overview](artifacts/workbench.png)

## 中文

### 项目简介
YAML Proxy Editor 是一个面向 OpenClash / Clash / Mihomo / MetaCubeX 用户的本地 Windows 桌面工作台，用于编辑、校验、审计、批量导入订阅和导出 YAML 代理配置。

### 功能特点
- 本地打开、保存、格式化和校验 YAML。
- 多标签工作台，支持文件选择和拖拽打开 `.yaml` / `.yml`。
- 识别 Clash / Mihomo / OpenClash 配置结构。
- 读取和维护 `proxy-providers`。
- 批量粘贴订阅 URL，写入 provider 模板或刷新节点。
- 节点去重、筛选和多格式导出。
- 检查 rules、DNS、OpenClash 兼容性和风险。
- 侧栏提供创作者信息，UI 语言切换状态会保存到 `localStorage`。

### 安装方法
```bash
npm install
```

### 使用方法
```bash
npm run dev
```

也可以直接启动 Tauri 桌面版：

```bash
npm run tauri:dev
```

### 打包说明
```bash
npm run build
npm run tauri:build
```

Windows 下如果提示 `link.exe not found`，先加载 MSVC 环境：

```bat
cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && npm run tauri:build"
```

打包产物通常会输出到 `src-tauri/target/release/`，并生成 Windows 安装包。

### 作者信息
- 作者：HaoXiang Huang
- 邮箱：didadida1688@gmail.com
- 主页：https://nextweb4.github.io/
- GitHub：https://github.com/NextWeb4

上述创作者信息为固定项；Codex、Claude Code 或其他自动化工具只能同步这些信息，不能替换成模板署名或旧作者信息。

### License
当前未发现 LICENSE 文件。使用或分发前，请先确认原始授权来源。

---

## English

### Project Introduction
YAML Proxy Editor is a local-first Windows desktop workbench for OpenClash, Clash, Mihomo, and MetaCubeX users. It is used to edit, validate, audit, batch-import subscriptions, and export YAML proxy configurations.

### Features
- Open, save, format, and validate YAML locally.
- Multi-tab workbench with file picker and drag-and-drop support.
- Detect Clash / Mihomo / OpenClash configuration structures.
- Read and maintain `proxy-providers`.
- Batch-paste subscription URLs, write provider templates, or refresh nodes.
- Deduplicate, filter, and export nodes in multiple formats.
- Check rules, DNS, OpenClash compatibility, and common risks.
- The sidebar shows creator information, and the UI language toggle persists in `localStorage`.

### Installation
```bash
npm install
```

### Usage
```bash
npm run dev
```

You can also start the desktop app with Tauri:

```bash
npm run tauri:dev
```

### Build / Packaging
```bash
npm run build
npm run tauri:build
```

If Windows reports `link.exe not found`, load the MSVC environment first:

```bat
cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && npm run tauri:build"
```

Build artifacts are typically written to `src-tauri/target/release/`, together with the Windows installers.

### Author
- Author: HaoXiang Huang
- Email: didadida1688@gmail.com
- Homepage: https://nextweb4.github.io/
- GitHub: https://github.com/NextWeb4

The creator identity is fixed. Codex, Claude Code, and other automation tools may only keep this information synchronized; they must not replace it with template names or old author data.

### License
No LICENSE file was found in this repository. Verify the original source and permission before reuse or redistribution.
