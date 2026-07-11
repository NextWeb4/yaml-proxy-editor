# Release Usage Notes / 发布包使用说明

YAML Proxy Editor ships Windows installers in the repository `release/` directory. This document explains when to use each package and how to keep a local-first workflow while editing proxy configuration files.

YAML Proxy Editor 在仓库 `release/` 目录中提供 Windows 安装包。本文说明不同安装包的使用场景，以及如何在编辑代理配置时保持本地优先的工作方式。

## Installers / 安装包

| File | Recommended Use |
| --- | --- |
| `YAML-Proxy-Editor-0.1.0-x64-setup.exe` | Standard Windows installation with the NSIS installer flow. |
| `YAML-Proxy-Editor-0.1.0-x64-zh-CN.msi` | Windows Installer based deployment, especially when MSI tooling is preferred. |

| 文件 | 建议用途 |
| --- | --- |
| `YAML-Proxy-Editor-0.1.0-x64-setup.exe` | 常规 Windows 安装，使用 NSIS 安装流程。 |
| `YAML-Proxy-Editor-0.1.0-x64-zh-CN.msi` | 需要 Windows Installer / MSI 部署流程时使用。 |

## Local-First Expectations / 本地优先边界

The application is designed for local YAML editing. Users should keep these expectations in mind:

应用面向本地 YAML 编辑，使用时应注意：

- Local YAML files should not be uploaded automatically.
- Network requests should be triggered by explicit user actions such as subscription refresh, provider check, or speed test.
- Subscription URLs, credentials, and request paths should be treated as sensitive information.
- Important production YAML files should be backed up before saving.

- 本地 YAML 不应被自动上传。
- 联网请求应由用户主动触发，例如订阅刷新、provider 检查或测速。
- 订阅 URL、凭据和请求路径应视为敏感信息。
- 保存重要生产配置前应保留备份。

## Suggested Release Verification / 建议发布验证

Before publishing a new installer, verify the project with the commands documented in `AGENTS.md` and `docs/TESTING.md`:

发布新安装包前，建议按 `AGENTS.md` 和 `docs/TESTING.md` 中的命令验证：

- `npm run test`
- `npx tsc -b`
- Rust backend tests from `src-tauri`
- `npm run build`
- `npm run tauri:build` when producing Windows installers

A release should not be considered complete only because the frontend build succeeds. The desktop package and network-boundary behavior matter for this project.

不要只因为前端构建成功就认为发布完成。该项目还需要关注桌面安装包和网络边界行为。

## Troubleshooting / 常见问题

### The app opens, but no YAML content is indexed

Confirm the file is a Clash/OpenClash/Mihomo-compatible YAML file. If the file contains duplicate keys or invalid indentation, fix the YAML before saving.

### 应用打开了，但没有识别 YAML 内容索引

确认文件是 Clash/OpenClash/Mihomo 兼容 YAML。如果存在重复 key 或缩进错误，应先修正 YAML 再保存。

### Subscription refresh fails

Check whether the URL is trusted, reachable, and uses `http` or `https`. Avoid pasting subscription URLs into bug reports or public screenshots.

### 订阅刷新失败

确认 URL 可信、可访问，并且使用 `http` 或 `https`。不要把订阅 URL 粘贴到公开 issue、日志或截图中。

## Related Documents / 相关文档

- `docs/QUICKSTART.md`
- `docs/BUILD.md`
- `docs/NETWORK_POLICY.md`
- `docs/OFFLINE_SECURITY.md`
- `docs/TESTING.md`