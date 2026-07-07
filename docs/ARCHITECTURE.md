# 架构设计

## 目标

本项目是 Windows 本地 EXE 桌面应用，不是网页端。应用面向 Clash / OpenClash / Mihomo / MetaCubeX 用户，用于编辑、校验、审计和导出 YAML 代理配置。

## 技术栈

- 桌面壳：Tauri 2
- 前端：React + TypeScript + Vite
- 编辑器：默认轻量 textarea，用户点击 Monaco 图标后懒加载 Monaco Editor + monaco-yaml
- YAML 能力：`yaml`
- 本地命令：Rust + Tauri commands
- 包管理器：npm

当前本机事实：

- 已发现 Node/npm。
- 未发现 pnpm。
- 已补齐 Rust/Cargo 和 Visual Studio Build Tools；当前 VS Build Tools 在非默认 `C:\Program1`，Tauri 构建前需加载对应 `VsDevCmd.bat`。

## 模块分层

```text
UI pages/components
  ↓
frontend services
  ↓
Tauri command bridge
  ↓
Rust commands
  ↓
Rust core modules
```

## 前端目录边界

```text
src/
  App.tsx              主工作台和页面组合
  app/                 Monaco worker 和 YAML schema
  components/          可复用 UI、编辑器
  services/            YAML、Clash、订阅、审计、合并、分组、备份等业务逻辑
  types/               共享类型
```

页面组件禁止直接写：

- YAML 解析细节
- 导入 YAML 后的格式识别和配置清单生成
- Clash 引用关系检查
- 订阅下载
- 批量订阅 URL 提取、命名、校验和脱敏
- 导入 YAML 后的 `proxy-providers` 选择状态同步
- 机场订阅 provider 写入
- Clash / V2Ray / Hiddify 节点订阅导出转换
- DNS / IP / TUN 防泄露优化
- 测速逻辑
- 文件写入
- 备份回滚

## Tauri 后端目录边界

```text
src-tauri/src/
  main.rs
  lib.rs
  commands/            Tauri command 入站层
  core/                与 UI 无关的业务逻辑
```

Rust 命令层只负责参数接收、错误转换和调用核心模块；核心模块不得依赖 UI。当前用户数据目录由 `core/backup.rs` 和对应 command 按需创建。

## 核心工作流

```text
打开 YAML
  → YAML 语法校验
  → 左侧栏列出格式识别和配置清单
  → Clash / Mihomo 结构识别
  → 订阅管理页读取并管理当前 YAML 的 proxy-providers
  → 批量写入或刷新多个订阅 provider
  → 写入机场订阅 provider
  → 节点页按筛选结果导出 Clash YAML 或 V2Ray/Hiddify 分享链接订阅
  → 检查 rules / DNS
  → 应用 DNS/IP 防泄露优化
  → 自动备份
  → 导出 OpenClash 可用 YAML
```

## 数据模型

核心领域对象：

- `YamlDocumentState`
- `ClashConfigSummary`
- `ProxyNode`
- `ProxyGroup`
- `RuleItem`
- `SubscriptionProfile`
- `DnsAuditFinding`
- `CompatibilityFinding`
- `BackupSnapshot`
- `BackupVersionGroup`
- `MergePreview`
- `MergeYamlResult`

## 网络边界

联网能力只允许出现在：

```text
subscription/
speedtest/
connectivity/
provider_check/
```

所有网络行为必须：

- 用户主动触发。
- 不上传本地 YAML。
- 不上传节点信息。
- 不上传订阅 URL。
- 写入本地日志。

## 第一阶段 MVP 范围

第一阶段只跑通核心闭环的可验证切片：

- YAML 打开 / 保存桥接
- YAML 新建 Clash / Mihomo / OpenClash 模板、打开 / 保存桥接和多标签编辑状态
- YAML 解析、格式化、错误定位和保存前语法校验
- Clash / Mihomo 字段识别，包括 profile、sniffer、hosts、tun 和 OpenClash 兼容字段结构分类
- proxies / proxy-groups / rules / dns 结构摘要
- 订阅文本解析入口，支持 Clash YAML、base64 节点列表、vmess / trojan / ss / vless / hysteria2 / hy2 / tuic 常见链接归一化、单个订阅刷新、批量订阅 provider 写入、批量订阅刷新合并和订阅节点导入当前 YAML
- 节点页展示当前 YAML 的 `proxy-providers` 订阅源；真实节点仍只来自 `proxies` 或用户主动刷新后的订阅内容
- 节点去重、导入、重命名、禁用、加入分组和导出；导出支持 Clash/Mihomo YAML、Clash Verge/OpenClash provider YAML、V2Ray/Hiddify 分享链接和 Base64 订阅内容
- 服务层保留单个或多个 YAML 配置合并、来源级统计、策略优先级、冲突选择与 diff 预览能力，但当前默认导航不暴露配置合并页
- 服务层保留本地测速任务队列、取消、结果评分模型、Mihomo external-controller 节点延迟测速和用户 URL 下载测速能力，但当前默认导航不暴露测速页
- 用户主动触发的远程 proxy-provider / rule-provider 可达性检查和轻量内容结构校验
- proxy-groups 预设生成
- rules 引用检查
- DNS / fake-ip 风险审计
- 机场订阅 provider 管理，导入 YAML 后读取当前 `proxy-providers`，用户只填写名称和 URL，其余字段保持默认模板，修改/删除写回当前 YAML
- DNS / fake-ip / IPv6 / TUN / 私有 IP / 泄露测试域名的一键本地优化
- 保存前备份策略
- 备份目录快照解析、手动创建快照、历史版本分组、备份与当前 YAML 差异对比、稳定版本标记本地持久化和本地 JSON 备份包导出保留在服务层；保存动作仍保留保存前备份

## 当前默认导航

当前默认导航只暴露核心配置工作流：

```text
YAML 编辑器
订阅管理
节点管理
分流规则
DNS 审计
OpenClash
```

测速、配置合并、分组生成和备份目录能力仍保留在服务层与测试中，但不作为默认入口暴露；`src/App.tsx` 不保留这些不可达旧页面组件，保存动作仍保留保存前备份。

左侧栏除导航外，还负责展示当前导入 YAML 的格式识别和可点击结构统计；不再展开完整配置清单，避免窄侧栏内容拥挤。中等桌面窗口点击导航或结构统计后仍保持完整侧栏，小屏移动断点才允许图标化折叠；编辑器右侧只保留审计等辅助信息。

## 后续扩展

- 通过 Mihomo / OpenClash 内核能力扩展按节点下载测速和更长周期稳定性探测
- Windows installer 输出
