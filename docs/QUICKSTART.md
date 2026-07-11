# Quick Start / 快速上手

This guide helps new users install YAML Proxy Editor, open an existing Clash/OpenClash/Mihomo YAML file, refresh subscriptions, and export a usable configuration without changing the project source code.

本文帮助新用户安装 YAML Proxy Editor、打开现有 Clash/OpenClash/Mihomo YAML、刷新订阅并导出可用配置，不涉及修改项目源码。

## 1. Install / 安装

Use one of the prebuilt Windows installers in the repository `release/` directory:

使用仓库 `release/` 目录中的 Windows 安装包：

- `release/YAML-Proxy-Editor-0.1.0-x64-setup.exe`
- `release/YAML-Proxy-Editor-0.1.0-x64-zh-CN.msi`

Choose the EXE installer for the common NSIS setup flow. Choose the MSI installer when you prefer Windows Installer based deployment.

常规安装建议使用 EXE；需要 Windows Installer 部署流程时使用 MSI。

## 2. Open A YAML File / 打开 YAML 文件

1. Start YAML Proxy Editor.
2. Open an existing OpenClash, Clash, Mihomo, or MetaCubeX YAML file.
3. Review the left sidebar index to confirm proxies, proxy providers, rule providers, DNS, and OpenClash sections were recognized.
4. Keep a backup of important production configuration before saving changes.

1. 启动 YAML Proxy Editor。
2. 打开已有 OpenClash、Clash、Mihomo 或 MetaCubeX YAML 文件。
3. 在左侧索引确认节点、订阅源、规则源、DNS 和 OpenClash 配置被正确识别。
4. 保存前请保留重要生产配置的备份。

## 3. Refresh Subscriptions / 刷新订阅

Subscription refresh is user-triggered. The app should not upload local YAML files or automatically contact unknown domains.

订阅刷新必须由用户主动触发；应用不应上传本地 YAML，也不应自动访问未知域名。

Recommended flow:

推荐流程：

1. Import or define provider URLs in the subscription page.
2. Run provider checks only for URLs you trust.
3. Refresh subscriptions when you want to update proxy nodes.
4. Review warnings before writing changes back to the YAML file.

## 4. Export / 导出

After editing or refreshing, export the configuration format required by your client:

编辑或刷新后，按客户端需要导出：

- Clash / Mihomo YAML
- OpenClash provider YAML
- Share-link subscriptions for supported clients
- Base64 subscription text when required by downstream tools

## 5. Related Docs / 相关文档

- `docs/BUILD.md` explains local build steps.
- `docs/TESTING.md` lists verification commands.
- `docs/NETWORK_POLICY.md` documents network boundaries.
- `docs/OFFLINE_SECURITY.md` explains local-first safety expectations.

Before modifying source code, read `AGENTS.md` and keep creator identity, network boundaries, and release files unchanged unless the project owner explicitly requests otherwise.

修改源码前请先阅读 `AGENTS.md`，除非项目所有者明确要求，否则不要改创作者信息、网络边界或 release 安装包。