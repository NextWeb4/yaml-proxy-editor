<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/English-0969da?style=flat-square" alt="English"></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-c8102e?style=flat-square" alt="简体中文"></a>
  <a href="README.ja.md"><img src="https://img.shields.io/badge/%E6%97%A5%E6%9C%AC%E8%AA%9E-8250df?style=flat-square" alt="日本語"></a>
</p>

# YAML 代理配置编辑器

一款本地优先的 Windows 桌面工作台，用于编辑、审计、导入和导出 Clash、OpenClash 与 Mihomo YAML 配置。

[![最近提交](https://img.shields.io/github/last-commit/NextWeb4/yaml-proxy-editor?style=flat-square)](https://github.com/NextWeb4/yaml-proxy-editor/commits/main)
[![仓库大小](https://img.shields.io/github/repo-size/NextWeb4/yaml-proxy-editor?style=flat-square)](https://github.com/NextWeb4/yaml-proxy-editor)
[![GitHub Stars](https://img.shields.io/github/stars/NextWeb4/yaml-proxy-editor?style=flat-square)](https://github.com/NextWeb4/yaml-proxy-editor)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-24C8DB?style=flat-square&logo=tauri&logoColor=white)

![YAML 代理配置编辑器工作台总览](artifacts/workbench.png)

## 核心能力

- 在本机打开、保存、格式化和校验 `.yaml` / `.yml` 文件。
- 通过多标签页、文件选择器和拖放管理多个文档。
- 识别 Clash、Mihomo 和 OpenClash 配置结构。
- 读取和修改 `proxy-providers`，批量导入订阅，并在用户主动操作后刷新节点。
- 规范化、去重、筛选、分组并导出 Clash/OpenClash、V2Ray 和 Hiddify 所需节点。
- 添加、导入、排序、注释和删除规则，同时保持 `MATCH` 兜底顺序。
- 从域名或完整 URL 创建单网站分流规则，支持精确/子域名匹配与策略选择。
- 审计规则、DNS/fake-IP、OpenClash 兼容性、远程 provider 响应和常见配置风险。
- 切换中英文界面，并在本地 `localStorage` 的 `yaml-proxy-editor.language` 中保存选择。

## 典型工作流程

1. 打开本地 `.yaml`/`.yml` 文件、把文件拖入工作台，或从 Clash/Mihomo 模板开始。
2. 修改 provider、节点、分组、DNS 或规则前，先查看解析清单与诊断结果。
3. 使用对应领域工具做局部修改；合并或应用范围较大的优化时先查看 diff 预览。
4. 只有确实需要联网结果时，才主动刷新订阅、检查 provider 或执行测速。
5. 再次运行校验与兼容性检查，审阅生成的 YAML，然后保存到本机或导出目标格式。

宽松分析路径可以从损坏文件中显示有用的部分结构，但不会让该文件变得可安全保存；严格校验始终是最终写入门槛。

## 单网站分流

输入完整 URL 时，只把规范化后的 hostname 写入 YAML；path、query、用户名和密码会被丢弃，填写网站本身不会发起网络请求。网站规则默认放在 `rules` 顶部；普通优先级会放到 `MATCH` 之前。相同类型和 hostname 的既有规则会更新目标，而不是重复添加。

![单网站分流表单与生成规则预览](artifacts/website-rule-desktop.png)

## 环境要求与兼容性

- **桌面目标：**仓库内安装包和 Tauri bundle 配置面向 Windows x64。
- **前端工具：**使用 npm 和已提交的 `package-lock.json`；未发现 pnpm 或 Yarn 配置。仓库没有声明最低 Node.js 版本。
- **桌面工具：**`npm run tauri:dev` 和 `npm run tauri:build` 需要 Rust 以及 Windows MSVC C++ linker 环境。
- **本地开发：**Vite 只监听 `127.0.0.1:1420`，因此开发服务器默认不会暴露到局域网。
- **配置系列：**工作台可识别 Clash、Mihomo 和 OpenClash 结构，但导出后的实际行为仍取决于目标客户端及其支持的 schema。

## 下载

仓库包含以下 0.2.0 Windows 安装包：

- [NSIS 安装程序](release/YAML-Proxy-Editor-0.2.0-x64-setup.exe)
- [中文 MSI 安装包](release/YAML-Proxy-Editor-0.2.0-x64-zh-CN.msi)

## 开发

项目使用 npm 与 `package-lock.json`，技术栈包括 React 19、TypeScript、Vite、Vitest、Tauri 2 和 Rust。在 Windows 构建 Tauri 桌面包还需要可用的 Rust/MSVC 工具链。

```bash
npm install
npm run dev
```

`npm run dev` 会把 Vite 绑定到 `127.0.0.1:1420`。开发桌面壳时运行：

```bash
npm run tauri:dev
```

## 测试与构建

```bash
npm run test
npm run build
npm run tauri:build
cargo test --manifest-path src-tauri/Cargo.toml
```

- `npm run test` 运行 `tests/` 下的 Vitest 测试。
- `npm run build` 执行 TypeScript 项目构建并生成 Vite 前端产物。
- `npm run tauri:build` 先构建前端，再生成配置中的 NSIS 和 MSI 安装包。
- `cargo test --manifest-path src-tauri/Cargo.toml` 测试原生 crate；修改 Rust 后还应运行 `cargo fmt --manifest-path src-tauri/Cargo.toml`。

可通过 `npm run preview` 在 `127.0.0.1:1420` 检查已完成的前端 bundle。项目当前没有 JavaScript/TypeScript lint 或 format script。

如果 Tauri 构建提示缺少 `link.exe`，请在已加载 Visual Studio C++ 构建环境的终端中执行。

## 架构

| 路径 | 职责 |
| --- | --- |
| `src/App.tsx` | 应用外壳、页面状态和服务组合 |
| `src/components/editor/` | 懒加载 Monaco YAML 编辑器 |
| `src/services/audit/` | DNS 与配置诊断 |
| `src/services/backup/` | 备份目录、策略和稳定快照 |
| `src/services/clash/` | Clash 配置解析与操作 |
| `src/services/diff/` | 结构化差异预览 |
| `src/services/editor/` | 多文档标签页状态 |
| `src/services/groups/` | 代理组生成 |
| `src/services/merge/` | YAML 配置合并与冲突处理 |
| `src/services/yaml/` | YAML 解析、格式化、校验和模板 |
| `src/services/subscription/` | 订阅解析、刷新、选择和导出 |
| `src/services/nodes/` | 节点规范化、筛选、分组和导出 |
| `src/services/rules/` | 规则解析、编辑、模板和网站分流 |
| `src/services/speedtest/` | 测速默认值、规划和执行 |
| `src/services/config/` | provider 与 DNS/fake-IP/TUN 优化 |
| `src/services/openclash/` | OpenClash 兼容检查和导出 |
| `src/services/provider_check/` | 用户主动触发的远程 provider 检查 |
| `src/services/desktop/` | 浏览器/Tauri 文件与订阅桥接 |
| `src-tauri/src/` | 原生文件、备份、订阅命令和错误处理 |
| `tests/` | Vitest 回归测试和 YAML fixtures |

前端复用现有 `yaml`、`monaco-yaml`、`json-diff-ts` 和 `lucide-react`。只有用户启用完整编辑器后才加载 Monaco，避免大型编辑器和 worker chunk 阻塞首屏工作台。

## 本地与联网边界

- 不会自动上传本地 YAML、节点、订阅 URL、日志或备份。
- 前端不包含遥测、分析、自动更新 SDK 或 CDN 运行时资源。
- 仅在用户主动刷新订阅、检查远程 provider 或测速时访问网络。
- 用户 URL 可能包含秘密；错误和日志必须脱敏完整 URL、path、query、用户名与密码。
- 打开、格式化、校验、审计、编辑和保存本地文件必须保持离线。
- 即使宽松分析能够列出部分结构，保存前的严格校验仍必须阻止重复 key。

更多说明见 [`docs/QUICKSTART.md`](docs/QUICKSTART.md)、[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、[`docs/NETWORK_POLICY.md`](docs/NETWORK_POLICY.md)、[`docs/OFFLINE_SECURITY.md`](docs/OFFLINE_SECURITY.md)、[`docs/TESTING.md`](docs/TESTING.md) 和 [`docs/BUILD.md`](docs/BUILD.md)。

## 创作者

- HaoXiang Hwang
- [Rays688888@Gmail.com](mailto:Rays688888@Gmail.com)
- [https://nextweb4.github.io/](https://nextweb4.github.io/)

创作者身份是固定项目值，应用、package、Rust、安装包、测试和 workflow 元数据必须保持一致。

开发协助署名为 Codex 和 Claude Code。`.github/workflows/creator-identity-lock.yml` 会检查 `README.md` 与 `AGENTS.md` 中固定的创作者信息及这两个协助名称。

## 项目状态与限制

- 这是一个活跃的公开桌面应用，当前版本为 0.2.0；仓库包含匹配版本的 NSIS 和中文 MSI 包。
- 应用界面目前支持中文和英文；README 提供三种语言并不表示应用已有日文 UI。
- “本地优先”不表示所有功能均离线：刷新订阅、远程 provider 检查和测速会执行由用户主动触发的请求。
- provider 可以访问并不代表内容有效；返回 HTML、登录页、空内容或无效 YAML 都不能视为校验成功。
- 规则顺序具有语义；网站规则即使语法正确，放在更宽泛的 GEOSITE/GEOIP 规则之后也可能永远不会命中。
- `src-tauri/tauri.conf.json` 当前把 `app.security.csp` 设为 `null`；在定义并测试明确的内容安全策略前，不应新增远程内容或运行时来源。
- 仓库当前没有项目许可证，因此复用与重新分发仍存在法律不确定性。

## 参与贡献

请将解析和修改逻辑保留在对应的 `src/services/` 领域中，将展示保留在 React 组件中，将原生文件/网络命令保留在 `src-tauri/src/`。必须维持 URL 脱敏、显式联网操作、保存前严格校验、备份行为、`MATCH` 顺序和 Monaco 懒加载。为修改过的服务补充针对性 Vitest，并运行 `npm run test` 与 `npm run build`；Rust 改动还需执行 Cargo 格式化与测试。除非替代方案已有兼容性、许可证、安全性和维护状态审计，否则继续复用既有 `yaml`、`monaco-yaml` 和 `json-diff-ts`。

## 许可证

当前仓库没有 `LICENSE` 文件。复用或分发前必须确认原始授权来源和适用范围；依赖项各自拥有许可证，并不能替代项目本身的授权。


