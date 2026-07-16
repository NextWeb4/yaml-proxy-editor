# 测试策略

## 测试命令

当前目标测试命令：

```bash
npm run test
npm run build
```

Tauri EXE 构建命令：

```bash
npm run tauri:build
```

注意：当前本机已补齐 Rust/Cargo 和 VS Build Tools；新的命令行窗口运行 Tauri 构建前需要加载 `C:\Program1\Common7\Tools\VsDevCmd.bat`。

## 当前验证结果

最近一次本地验证：

```text
npm run test: 26 个测试文件 / 150 个测试通过
npm run test -- tests/ruleEditor.test.ts: 1 个测试文件 / 20 个测试通过
npm run test -- tests/batchSubscription.test.ts tests/configOptimizer.test.ts tests/subscriptionExport.test.ts tests/subscriptionParser.test.ts tests/nodeManager.test.ts: 5 个测试文件 / 30 个测试通过
npm run test -- tests/providerCheck.test.ts: 1 个测试文件 / 11 个测试通过
npm run test -- tests/clashService.test.ts tests/ruleEditor.test.ts tests/mergeConfig.test.ts: 3 个测试文件 / 27 个测试通过
npm run test -- tests/mergeConfig.test.ts tests/subscriptionRefresh.test.ts tests/nodeManager.test.ts: 3 个测试文件 / 24 个测试通过
npm run test -- tests/nodeManager.test.ts tests/clashService.test.ts: 2 个测试文件 / 14 个测试通过
npm run test -- tests/subscriptionRefresh.test.ts: 1 个测试文件 / 5 个测试通过
npm run test -- tests/subscriptionRefresh.test.ts tests/configOptimizer.test.ts tests/providerSelection.test.ts: 3 个测试文件 / 14 个测试通过
npm run test -- tests/configOptimizer.test.ts tests/providerSelection.test.ts: 2 个测试文件 / 10 个测试通过
npm run test -- tests/subscriptionParser.test.ts tests/configOptimizer.test.ts tests/providerSelection.test.ts: 3 个测试文件 / 18 个测试通过
npm run test -- tests/subscriptionRefresh.test.ts tests/providerSelection.test.ts tests/clashService.test.ts tests/nodeManager.test.ts: 4 个测试文件 / 19 个测试通过
npm run test -- tests/speedtestDefaults.test.ts tests/fileDrop.test.ts tests/speedtestRunner.test.ts: 3 个测试文件 / 11 个测试通过
npx tsc -b: 通过
npm run build: 通过
npm audit --audit-level=low: 0 vulnerabilities
cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && cargo fmt && cargo test": 5 个 Rust 测试通过
npm run tauri:build: 通过，已生成 Windows EXE / NSIS / MSI
Tauri 产物: src-tauri/target/release/yaml-proxy-editor.exe
Tauri 产物: src-tauri/target/release/bundle/nsis/YAML 代理配置编辑器_0.2.0_x64-setup.exe
Tauri 产物: src-tauri/target/release/bundle/msi/YAML 代理配置编辑器_0.2.0_x64_zh-CN.msi
已知 warning: Vite 提示 Monaco/YAML worker chunk 大于 500 kB；默认编辑页使用轻量 textarea，点击 Monaco 图标后才加载编辑器大 chunk
Playwright YAML 新建 Mihomo 模板验证: 通过，截图 artifacts/editor-new-template-mihomo.png
Playwright 节点管理页验证: 通过，截图 artifacts/nodes-manager.png、artifacts/nodes-add-to-group.png
Playwright 规则批量导入验证: 通过，截图 artifacts/rules-bulk-import.png
Playwright 规则批量注释验证: 通过，截图 artifacts/rules-bulk-comment.png
Playwright 文件拖入覆盖层验证: 通过，截图 artifacts/file-drop-overlay.png
Playwright 文件拖入打开标签验证: 通过，截图 artifacts/file-drop-opened.png
Playwright OpenClash 远程 provider 检查入口验证: 通过，截图 artifacts/openclash-provider-check.png
Playwright 编辑器渐进加载验证: 通过，脚本 artifacts/verify_editor_lazy_load.py，截图 artifacts/editor-lazy-before.png 和 artifacts/editor-lazy-after.png
Playwright 左侧栏紧凑索引和点击后不折叠验证: 通过，脚本 artifacts/verify_sidebar_index_compact.py，截图 artifacts/sidebar-index-compact.png 和 artifacts/sidebar-index-after-click-1000.png
Playwright 批量订阅写入和节点多格式导出验证: 通过，脚本 artifacts/verify_batch_subscription_export.py，截图 artifacts/batch-subscription-import.png 和 artifacts/node-export-formats.png
Playwright 单网站分流和规则页响应式验证: 通过，脚本 artifacts/verify_website_rule_ui.py，截图 artifacts/website-rule-desktop.png、artifacts/website-rule-1000.png 和 artifacts/website-rule-narrow.png
Playwright YAML 多标签页验证: 通过，截图 artifacts/editor-document-tabs.png
Playwright 订阅节点导入当前 YAML 验证: 通过，截图 artifacts/subscription-import-nodes.png
App.tsx 不可达旧页面清理验证: SpeedtestPage / MergePage / BackupsPage / SettingsPage / GroupsPage 均不存在
```

## 必测范围

- YAML 解析测试
- YAML 导入后的格式识别和配置清单测试，包括重复 key 时可列出清单、保存前仍阻止
- YAML 新建配置模板测试
- YAML 文件拖入过滤测试，包括 `.yaml` / `.yml` 大小写兼容和非 YAML 文件忽略
- YAML 多标签页状态 / 切换 / 关闭测试
- YAML 格式化测试
- 错误 YAML 定位测试
- 保存前 YAML 语法校验测试
- proxies 解析测试
- proxy-groups 引用测试
- profile / sniffer / hosts / tun / OpenClash 兼容字段结构识别测试
- rules 引用 / 无效规则 / Mihomo 扩展规则类型 / 嵌套逗号逻辑规则 / 顺序风险 / 国内外目标混乱测试
- DNS 审计测试
- fake-ip 审计测试
- 订阅管理 provider 选择测试，包括导入 YAML 后从 `proxy-providers` 回填名称/URL、保留仍存在的当前选择、新增草稿 URL 为空
- 节点页必须展示当前 YAML 的 `proxy-providers` 订阅源，同时不把远程 provider 当作真实 `proxies` 节点
- 机场订阅 provider 写入测试，包括写入预览、非法 URL、默认模板、重复 provider 归并、从当前 YAML 回填后修改/删除和已有 `use` 分组引用更新
- 批量订阅导入测试，包括多行名称/URL 解析、重复名称后缀、非法行 finding、批量写入 `proxy-providers` 默认模板和已有 `use` 分组引用更新
- DNS/IP 防泄露优化测试，包括 IPv6 关闭、fake-ip、nameserver-policy、fallback-filter、TUN strict-route、私有 IP 规则和泄露测试规则修正
- 订阅解析测试，包括 Clash YAML、proxies 非数组保护、base64 节点列表、vmess / trojan / ss / vless / hysteria2 / hy2 / tuic 常见链接归一化和导入鉴权字段保留
- 订阅测试 / 单个刷新、URL 脱敏、失败错误脱敏、HTTP 状态、节点解析和流量信息测试；失败错误脱敏必须覆盖完整 URL、同域规范化 URL、path、query、username、password；Tauri native curl stderr 也必须在 Rust error 中脱敏
- 订阅节点导入当前 YAML 测试，包括节点去重、同名冲突改名、加入目标分组和 proxies 非数组保护
- 节点去重测试
- 节点管理筛选 / 地区和倍率推断 / 重命名 / 禁用 / 批量加入分组 / 导出测试；导出必须覆盖 Clash/Mihomo YAML、Clash Verge/OpenClash provider YAML、V2Ray/Hiddify 分享链接、Base64 订阅内容和无法转换节点 warning
- 测速队列生成 / 取消 / 结果评分 / 分组推荐 / Mihomo controller 延迟测速 / 默认测速 URL / 下载 URL 受控测速 / 响应体读取超时 / 日志脱敏和失败错误脱敏测试
- 规则新增 / 删除 / 移动 / 模板 / 批量导入 / 批量注释 / 重复测试
- 单网站分流测试，包括完整 URL 只保留 hostname、精确/子域名匹配、顶部/普通优先级、同站点目标替换、IP/非法输入保护、规则筛选和窄屏无重叠
- OpenClash 兼容检查测试，包括 provider URL / interval / path / health-check
- 远程 provider 检查测试，包括目标提取、协议限制、URL 脱敏、proxy YAML 结构计数、rule YAML/text 结构计数、HTML/未知结构 warning、响应读取上限和失败脱敏
- OpenClash 导出测试
- YAML 合并测试，包括单文件/批量合并、批量中途失败保留已成功来源、来源级统计、策略优先级、节点去重、节点名称/代理分组字段/DNS 非列表字段冲突手动选择、分组代理合并、规则合并、DNS 合并和语法错误保护
- diff 测试，包括结构差异和 YAML 解析错误保护
- 备份文件名 / 备份目录快照 / 手动快照保护 / 稳定版本标记持久化 / 备份包导出保护 / 版本差异入口 / 备份回滚测试

## Fixture 要求

测试样例应放在：

```text
tests/fixtures/
```

至少包含：

- 有效 Clash 配置
- 错误缩进 YAML
- 缺失分组引用
- DNS/fake-ip 风险配置
- base64 节点订阅样例
- Clash/Mihomo 订阅 YAML 样例

## 验收标准

- 修改解析、合并、审计、备份逻辑后必须新增或更新测试。
- 任何涉及保存文件的改动必须证明备份先于写入发生。
- 任何涉及网络的改动必须证明请求入口在允许模块内。
- 默认联网 URL 必须证明只是用户主动测速时的输入值，不得在应用启动或页面切换时请求。
