# 成熟开源方案审计

## 当前项目结论

本项目目标是 Windows 本地 EXE 桌面应用，核心能力是 YAML 编辑、Clash / Mihomo / OpenClash 配置识别、订阅管理、节点管理、DNS / fake-ip 泄露风险审计、diff、备份和导出。

最终采用：

- 桌面壳：Tauri 2
- 前端：React + TypeScript + Vite
- 编辑器：Monaco Editor
- YAML 编辑增强：monaco-yaml
- YAML 解析 / 格式化：`yaml`
- 桌面对话框：Tauri dialog plugin
- 配置 diff：`json-diff-ts`
- 图标：`lucide-react`
- Windows 打包工具链：Rust/Cargo + Microsoft Visual Studio Build Tools 2022 + Windows SDK
- Windows 安装包工具：Tauri CLI 按需缓存的 NSIS / WiX

暂不采用：

- Electron：可行但体积和运行时成本更高。
- PySide6：可行但 Monaco/YAML 编辑体验和前端生态不如 React + Monaco。
- Rust `serde_yaml`：该 crate 已 deprecated，不作为核心 YAML 解析方案。

## 本次订阅与防泄露优化审计

| 方案名称 | 来源 | 许可证 | 核心能力 | 优点 | 缺点 | 维护状态 | 与当前项目的契合度 | 可能冲突点 | 是否采用 | 采用方式 |
|---|---|---|---|---|---|---|---|---|---|---|
| Mihomo `proxy-providers` 配置格式 | MetaCubeX / mihomo 官方文档 | 文档许可按官方站点为准 | `type: http`、`url`、`interval`、`health-check`、`proxy` 等 provider 字段 | 与 OpenClash/Mihomo 用户 YAML 直接匹配 | 版本变化需持续关注 | 活跃 | 高 | 直接写入 provider 会改动用户 YAML，必须用户主动触发 | 采用 | 只复用字段格式；用户只填名称和 URL，默认值在 `src/services/config/configOptimizer.ts` |
| Mihomo 规则类型表 | MetaCubeX / mihomo 官方 rules 文档 | 文档许可按官方站点为准 | `DOMAIN-REGEX`、`IP-ASN`、`DST-PORT`、`PROCESS-PATH`、`AND` / `OR` / `NOT` 等扩展规则 | 避免把用户真实 Mihomo 规则误判为不支持 | 逻辑规则含嵌套逗号，解析不能用简单 split | 活跃 | 高 | 规则类型过严会造成误报，过松会漏报真实错误 | 采用 | 抽到 `src/services/rules/ruleTypes.ts`，Clash 分析和规则导入共享 |
| Mihomo DNS / fake-ip / fallback-filter 配置 | MetaCubeX / mihomo 官方文档 | 文档许可按官方站点为准 | `enhanced-mode: fake-ip`、`nameserver-policy`、`fallback-filter` | 字段语义权威，与现有 DNS 审计一致 | 不等于真实网络泄露检测 | 活跃 | 高 | 自动联网或承诺绝对匿名会越界 | 采用 | 只做本地 YAML 改写和审计提示，不发起网络请求 |
| Mihomo TUN `strict-route` 相关配置 | MetaCubeX / mihomo 官方文档 | 文档许可按官方站点为准 | TUN 路由控制和 DNS 接管相关字段 | 能表达物理网卡/路由侧防绕过意图 | 不同 OpenWrt 环境兼容性需用户验证 | 活跃 | 中 | 强制启用 TUN 可能破坏用户路由 | 部分采用 | 仅设置保守字段，默认不启用 TUN |
| MetaCubeX/meta-rules-dat | GitHub | 仓库包含 LICENSE，具体条款需按仓库文件复核 | geosite/geoip `.mrs` 规则集 | 维护活跃，适配 Mihomo rule-provider | 运行时拉取会新增远程依赖 | 活跃 | 中 | 自动注入远程规则会改变联网边界 | 不自动采用 | 仅作为用户现有 YAML 和规则格式参考 |
| blackmatrix7/ios_rule_script | GitHub | GPL-2.0 | 大量 Clash 规则列表 | 覆盖面广、社区常用 | GPL 直接嵌入存在许可证传染风险 | 活跃 | 低 | 许可证和体量均不适合直接内置 | 不采用 | 只参考常见规则分类，不复制规则内容 |
| liandu2024/clash | GitHub | 未在搜索结果中确认明确开源许可证 | OpenClash 社区配置样例 | 贴近用户提供 YAML 的写法 | 样例质量与许可证需逐项核对 | 活跃度需持续审计 | 低 | 不能在许可证不明时内置规则或文件 | 不采用 | 仅作为人工比对配置形态的参考 |

本次最终没有引入新依赖。配置写入继续使用现有 `yaml` 包，网络仍只限用户主动触发的订阅刷新、测速和 provider 检查。

## 本次批量订阅与跨客户端导出审计

| 方案名称 | 来源 | 许可证 | 核心能力 | 优点 | 缺点 | 维护状态 | 与当前项目的契合度 | 可能冲突点 | 是否采用 | 采用方式 |
|---|---|---|---|---|---|---|---|---|---|---|
| subconverter | GitHub `tindy2013/subconverter` | 按仓库 LICENSE 复核 | 多客户端订阅格式转换 | 生态成熟，覆盖 Clash、V2Ray、Surge、Quantumult 等转换场景 | 引入服务端/配置模板/规则集后复杂度和联网边界明显扩大 | 活跃度需持续复核 | 中 | 直接内置会新增运行时服务和外部规则模板风险 | 不采用 | 只借鉴“导入统一归一化节点，再按目标客户端导出”的设计 |
| Clash Verge Rev profiles | GitHub `clash-verge-rev/clash-verge-rev` | GPL-3.0 | 多 profile / 订阅配置管理 | 贴近 Clash Verge 用户工作流 | GPL 代码不能直接复制进当前项目；其重点是客户端而不是 YAML 编辑服务层 | 活跃 | 中 | 许可证和 UI 架构不适合直接复用 | 不采用 | 只借鉴 profile/订阅列表管理体验 |
| Hiddify Next | GitHub `hiddify/hiddify-next` | 按仓库 LICENSE 复核 | 多协议客户端，常见分享链接导入 | 目标用户会使用 VLESS/Trojan/SS/Hysteria2/TUIC 等分享链接 | 客户端实现体量大，跨平台代码不适合嵌入 | 活跃 | 中 | 直接复用会引入无关运行时和许可证审计成本 | 不采用 | 导出 V2Ray/Hiddify 常见分享链接文本和 Base64 订阅内容 |
| v2rayN | GitHub `2dust/v2rayN` | GPL-3.0 | Windows V2Ray 客户端和分享链接生态 | 常见用户会从 v2rayN/Hiddify 导入分享链接或 Base64 订阅 | GPL 代码不可直接复制；完整客户端能力超出当前目标 | 活跃 | 中 | 许可证冲突和功能越界 | 不采用 | 只按通用 URI 分享格式生成链接 |
| 现有 `yaml` + 项目自有转换函数 | 项目现有依赖 / 自研服务层 | ISC / 项目自有 | 批量订阅 URL 解析、`proxy-providers` 写入、Clash YAML 与分享链接导出 | 无新增依赖，离线/联网边界不变，服务层可测 | 分享链接覆盖常见协议，不承诺所有客户端私有扩展完全等价 | 自维护 | 高 | 转换过宽会泄漏 URL 或生成不可用字段，必须测试 | 采用 | `batchSubscription.ts`、`configOptimizer.ts`、`subscriptionExport.ts` |

直接复用：现有 `yaml`、现有订阅刷新、现有节点解析和 provider 写入模板。
只借鉴设计：subconverter 的“统一中间模型再导出目标格式”、Clash Verge 的 profile 管理入口、Hiddify/v2rayN 的分享链接导入习惯。
不采用：不内置 subconverter 服务，不复制 GPL 客户端代码，不新增远程模板/规则集，不自动托管订阅 URL。
适配模块：`src/services/subscription/batchSubscription.ts`、`src/services/subscription/subscriptionExport.ts`、`src/services/config/configOptimizer.ts`、`src/App.tsx`、`tests/batchSubscription.test.ts`、`tests/subscriptionExport.test.ts`、`tests/configOptimizer.test.ts`。
回滚方式：移除订阅页批量输入区和节点页导出格式选择，删除 `batchSubscription.ts` / `subscriptionExport.ts` 及对应测试；单订阅刷新和原有 YAML 导出不受影响。

## 本次远程 provider 内容结构校验审计

| 方案名称 | 来源 | 许可证 | 核心能力 | 优点 | 缺点 | 维护状态 | 与当前项目的契合度 | 可能冲突点 | 是否采用 | 采用方式 |
|---|---|---|---|---|---|---|---|---|---|---|
| 现有 `yaml` + 服务层轻量校验 | npm `yaml` / 项目现有服务 | ISC / 项目自有 | 解析 `proxies`、`payload`、数组结构，并做节点/规则计数 | 无新增依赖，离线边界不变，能识别 HTTP 200 但返回 HTML/空响应的误成功 | 不是完整 Mihomo schema，只做可用性前置提示 | 活跃 | 高 | 过度严格会误伤真实 provider | 采用 | `providerCheck.ts` 在读取前 2 MiB 内校验结构 |
| 复用订阅解析器完整解析 proxy provider | 项目现有 `subscriptionParser.ts` | 项目自有 | 解析 Clash YAML、base64 节点、常见节点链接 | 节点解析能力更深 | 订阅解析器的 fallback 会接受任意 URL 协议，provider 可用性检查容易误判 HTML 链接 | 自维护 | 中 | 模块职责会从“检查”滑向“导入/转换” | 不直接采用 | 只借鉴格式识别思路，provider 检查保留更严格的协议白名单 |
| 新增 JSON Schema / Clash schema 依赖 | npm / 社区 schema | 取决于来源 | 更完整的 schema 校验 | 规则明确，可扩展到编辑器诊断 | Clash/Mihomo 版本差异大，schema 维护成本高，可能误报用户配置 | 不稳定 | 中 | 引入新依赖和版本绑定，可能破坏当前轻量检查目标 | 不采用 | 后续如做编辑器 schema 再单独审计 |
| 下载完整 provider 后再校验 | 自研流程 | 项目自有 | 完整读取响应后解析 | 理论上能更准确计数 | 大订阅会增加内存、延迟和网络读取成本 | 自维护 | 低 | 与当前 2 MiB 上限和离线/隐私边界冲突 | 不采用 | 保持前 2 MiB 读取上限 |
| 解析 `.mrs` 二进制规则集 | Mihomo 规则集生态 | 取决于规则集来源 | 校验二进制规则内容 | 能覆盖 `format: mrs` | 需要新增解析能力或依赖，且不适合轻量连通性检查 | 需持续审计 | 低 | 可能引入大体积依赖和二进制格式维护成本 | 不采用 | `format: mrs` 仅检查连通性和响应边界 |

直接复用：现有 `yaml` 解析能力、原生 `fetch`、`AbortController`、2 MiB 响应读取上限。
只借鉴设计：订阅解析器对 Clash YAML / 代理链接列表的格式识别。
不采用：新增 schema 依赖、完整下载后校验、`.mrs` 二进制解析。
适配模块：`src/services/provider_check/providerCheck.ts`、`src/App.tsx`、`tests/providerCheck.test.ts`、`docs/NETWORK_POLICY.md`、`docs/TESTING.md`、`AGENTS.md`。
保留现有代码：URL 提取、协议限制、URL 脱敏、并发检查、读取上限、失败 finding。
替换/增强代码：HTTP 200 成功路径从“只报告可访问”增强为“可访问 + 内容结构轻量确认”。

## 本次构建性能与许可证清单审计

| 方案名称 | 来源 | 许可证 | 核心能力 | 优点 | 缺点 | 维护状态 | 与当前项目的契合度 | 可能冲突点 | 是否采用 | 采用方式 |
|---|---|---|---|---|---|---|---|---|---|---|
| Vite / Rolldown `output.codeSplitting.groups` | 当前已采用的 Vite 8 / Rolldown | MIT | 按模块规则拆分 chunk | 不新增依赖，能把 Monaco 编辑器、monaco-yaml、YAML 核心分成可缓存 chunk | 不能降低 Monaco 自身体积；错误分组可能导致首屏预加载或执行顺序问题 | 活跃 | 高 | `yaml` 同时被业务服务和 monaco-yaml 使用，必须单独分组避免把编辑器依赖带回首屏 | 采用 | 在 `vite.config.ts` 中拆出 `vendor-monaco-editor`、`vendor-monaco-yaml`、`vendor-yaml-core` |
| Vite `build.license` | 当前已采用的 Vite 8 | MIT | 输出生产包第三方依赖许可证清单 | 不新增依赖，构建时自动记录 bundled dependencies 许可文本 | 只覆盖前端 bundle 依赖，不替代 Rust/Cargo 许可证审计 | 活跃 | 高 | 许可证文件路径变更需同步文档和发布检查 | 采用 | 输出 `dist/.vite/third-party-licenses.md` |
| Vite `modulePreload.resolveDependencies` | 当前已采用的 Vite 8 | MIT | 控制 HTML / JS 动态导入预加载依赖 | 能阻止 HTML 首屏预加载 Monaco JS，同时保留点击进入编辑器后的动态预加载 | 属于实验性 API，Vite 升级前需复测 | 活跃 | 中 | 配置过度过滤会造成编辑器打开时瀑布加载或缺依赖 | 采用 | 只在 `hostType === "html"` 时过滤编辑器相关资产 |
| 本地 Vite HTML 后处理插件 | 项目自有 | 项目自有 | 从最终 `index.html` 移除 Monaco CSS 首屏 link | 解决动态编辑器 CSS 被注入首屏的问题，不影响动态导入时加载 | 依赖生成文件命名约定，Vite 升级前需通过构建产物复核 | 自维护 | 中 | Regex 范围过宽会误删非编辑器样式 | 采用 | 仅删除 `vendor-monaco-editor-*.css` 的首屏 stylesheet link |
| 默认轻量 textarea 编辑器 | Web 平台原生控件 | 平台 API | 首屏 YAML 文本编辑 | 不新增依赖，打开编辑页即可编辑，不自动加载 Monaco 大 chunk | 缺少 Monaco 的 schema、补全和高级诊断 | 浏览器/WebView 维护 | 高 | 不能替代专业 Monaco 体验，必须保留手动启用入口 | 采用 | 编辑器页默认渲染 textarea，点击 Monaco 图标后加载 `YamlEditor` |
| 提高 `chunkSizeWarningLimit` | Vite 配置 | MIT | 隐藏大 chunk 警告 | 配置最简单 | 只掩盖 Monaco/YAML worker 体积事实，不能改善首屏加载或可缓存性 | 活跃 | 低 | 会降低发布时对意外大 chunk 的敏感度 | 不采用 | 保留 Vite 警告作为体积监控信号 |
| 引入 Monaco 替代编辑器 | CodeMirror / Ace 等开源项目 | 多为 MIT / BSD | 更轻量编辑器可能降低包体积 | 可能显著减小编辑器运行时 | 会替换当前 Monaco + monaco-yaml 诊断能力，影响核心体验和已有测试 | 活跃 | 低 | 与当前“专业 YAML 工作台”目标冲突，迁移成本大 | 不采用 | 暂不替换，只优化加载边界 |

本轮补充结论：直接复用 Web 平台原生 textarea 作为首屏轻量编辑路径；只借鉴 IDE 的渐进增强设计，保留 Monaco 作为用户主动启用的高级编辑器；不采用提高 `chunkSizeWarningLimit`、替换 Monaco 或新增打包分析依赖。适配模块新增 `src/App.tsx` 和 `src/styles.css`。

直接复用：Vite / Rolldown 分块、Vite 许可证清单、Vite module preload 依赖解析。

只借鉴设计：按编辑器域拆分 vendor chunk，保留首屏工作台和编辑器运行时的边界。

不采用：不提高 chunk warning 阈值，不替换 Monaco，不新增打包分析或许可证工具依赖。

当前适配模块：`vite.config.ts`、`src/main.tsx`、`src/components/editor/YamlEditor.tsx`、`tests/buildConfig.test.ts`、`tests/monacoLazyLoad.test.ts`、`docs/BUILD.md`。

回滚方式：删除 `vite.config.ts` 中 `build.modulePreload`、`build.rolldownOptions.output.codeSplitting`、`build.license` 和 `defer-editor-html-assets` 插件，并把 `src/main.tsx` 的 worker 初始化恢复到入口；回滚后必须重新检查首屏 HTML 是否重新预加载 Monaco。

## 本次原生订阅请求安全审计

| 方案名称 | 来源 | 许可证 | 核心能力 | 优点 | 缺点 | 维护状态 | 与当前项目的契合度 | 可能冲突点 | 是否采用 | 采用方式 |
|---|---|---|---|---|---|---|---|---|---|---|
| Rust `std::process::Command` 参数传递 | Rust 标准库 | Rust 许可 | 以参数数组调用 `curl.exe` | 不经过 shell 拼接，避免把订阅 URL 当命令片段解释 | 仍依赖系统 `curl.exe` 可用 | 随 Rust 维护 | 高 | URL 校验若弱于前端会扩大 native 请求边界 | 采用 | 保持 `.arg(url)` 传参，不拼接命令字符串 |
| Rust `std::env::temp_dir` + 手写文件名 | Rust 标准库 | Rust 许可 | 获取系统临时目录 | 无新增依赖 | 官方文档提示共享临时目录中固定/可预测文件名有安全风险；并发时需自行处理冲突和清理 | 随 Rust 维护 | 低 | 可能被预测、预创建或并发覆盖 | 不采用 | 已替换为 `tempfile` |
| `tempfile` crate | crates.io / GitHub `Stebalien/tempfile` | MIT OR Apache-2.0 | 安全创建和自动清理临时文件/目录 | 成熟小库，专注临时文件，避免可预测固定路径和清理遗漏 | 新增 Rust 依赖，Cargo.lock 增加 `tempfile` 及其平台依赖 | 活跃 | 高 | 构建需下载 crate；许可证需纳入 Rust 依赖审计 | 采用 | `src-tauri/src/commands/subscription_commands.rs` 使用 `TempDirBuilder` 为 native curl 响应创建独占临时目录 |
| `url` crate | crates.io / Servo rust-url | MIT OR Apache-2.0 | WHATWG URL 解析 | 与前端 `URL` 行为更一致，能严格解析端口、主机、IPv6 和规范化 URL | 需要在 `Cargo.toml` 声明直接依赖；已在 Cargo.lock 中由 Tauri 传递依赖存在 | 活跃 | 高 | 解析结果会规范化 `https:///host` 这类输入，测试必须对齐前端行为 | 采用 | Rust command 层用 `Url::parse` 替换手写 authority/port 拆解 |
| Rust 标准字符串替换 + `url` 解析结果 | Rust 标准库 / `url` crate | Rust / MIT OR Apache-2.0 | native curl stderr 脱敏 | 无新增依赖，能按当前请求 URL 移除完整 URL、path、query 和 authority 凭据 | 只针对当前请求 URL 上下文，不做通用日志审计 | 随 Rust / url 维护 | 高 | 过度替换会误伤 query 参数名，测试必须覆盖 | 采用 | `clean_network_error` 返回前按当前 URL 脱敏 |
| 继续只用前端 URL 校验 | 当前代码 | 项目自有 | 在 TypeScript 层拒绝非法 URL | 已有实现，无 Rust 改动 | Tauri command 可被前端调用，后端仍必须自守边界 | 自维护 | 低 | native curl 路径会比浏览器 fetch 路径更松 | 不采用 | Rust command 层新增 `validate_native_subscription_url` |

直接复用：`tempfile` 的独占临时目录创建与清理；`url` crate 的 WHATWG URL 解析；Rust `Command` 的参数数组调用模型；Rust 标准字符串替换用于当前请求 URL 上下文脱敏。

只借鉴设计：前端 `parseAllowedSubscriptionUrl` 的 http/https、主机和控制字符边界；Rust 侧最终由 `Url::parse` 承担 URL 结构解析。

不采用：不为当前 native curl 请求引入完整 HTTP 客户端；不继续使用手写可预测临时文件名；不继续维护手写 URL authority/port 拆解。

当前适配模块：`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/src/commands/subscription_commands.rs`、`docs/NETWORK_POLICY.md`、`docs/OPEN_SOURCE_AUDIT.md`、`AGENTS.md`。

回滚方式：移除 `tempfile` / `url` 的直接依赖声明和 `Cargo.lock` 中对应新增项，把 `create_request_temp_dir` 和 `validate_native_subscription_url` 恢复为标准库实现；回滚后必须重新证明并发请求不会复用同一路径、错误路径会清理临时文件，且 Rust URL 边界与前端 `URL` 行为一致。

## 本次 YAML 导入清单审计

| 方案名称 | 来源 | 许可证 | 核心能力 | 优点 | 缺点 | 维护状态 | 与当前项目的契合度 | 可能冲突点 | 是否采用 | 采用方式 |
|---|---|---|---|---|---|---|---|---|---|---|
| 现有 `yaml` 包 | npm | ISC | 严格解析、宽松解析、Document/Map/Seq 遍历 | 已在项目内使用，无新增依赖，可同时支持保存前严格校验和导入后尽量列清单 | 不是 Clash 专用 schema，需要项目服务层自己识别业务字段 | 活跃 | 高 | 若把宽松解析用于保存会掩盖重复 key 风险 | 采用 | 严格解析用于校验/保存，宽松解析只用于导入清单读取 |
| `js-yaml` | npm | MIT | YAML 解析和 dump | 成熟、生态广 | 项目已有 `yaml`，重复引入收益低；Document 级结构遍历不如当前实现直接 | 活跃 | 低 | 增加依赖和解析行为差异 | 不采用 | 无 |
| 自研字符串扫描 | 本地实现 | 项目自有 | 按行扫描 top-level 和缩进 | 初看简单 | 容易误判锚点、引用、引号、重复 key 和复杂 YAML | 自维护 | 低 | 会绕过现有 YAML parser，风险高 | 不采用 | 无 |

## 方案对比表

| 方案名称 | 用途 | 来源 | 许可证 | 维护状态 | 优点 | 缺点 | 是否采用 | 采用范围 | 可能冲突点 |
|---|---|---|---|---|---|---|---|---|---|
| Tauri 2 | Windows EXE 桌面壳、本地命令、文件系统能力 | npm `@tauri-apps/cli` / 官方文档 | Apache-2.0 OR MIT | 活跃 | 轻量、适合本地 EXE、Rust 后端适合文件和任务 | 本机需要 Rust/Cargo、MSVC 链接器和 Windows SDK | 采用 | 桌面壳、命令桥、打包 | 工具链不完整会阻塞 EXE / MSI / NSIS 构建验证 |
| Rust/Cargo stable | Tauri Rust 后端编译 | rustup 官方安装器 | MIT/Apache-2.0 生态为主，具体 crate 见 Cargo.lock | 活跃 | Tauri 官方构建链路必需 | Windows MSVC target 还需要链接器和 SDK | 采用 | 本机开发/打包工具链 | 只装 Rust 不足以完成 Windows 打包 |
| Microsoft Visual Studio Build Tools 2022 + Windows SDK | MSVC 链接器和 Windows SDK 导入库 | Microsoft 官方 Build Tools | Microsoft Visual Studio / Windows SDK 许可 | 活跃 | 提供 `link.exe`、`kernel32.lib` 等 Tauri Windows 打包必需能力 | 系统级安装、占用磁盘；当前安装在非默认 `C:\Program1` | 采用 | 本机打包工具链，不随应用分发 | 安装路径异常，构建前需加载 `C:\Program1\Common7\Tools\VsDevCmd.bat` |
| NSIS | Windows 安装包生成 | Tauri CLI 下载缓存 | zlib/libpng | 活跃 | 生成 `.exe` 安装包，Tauri 官方支持 | 构建时会下载工具包 | 采用 | `npm run tauri:build` 的 NSIS bundle | 属于构建期联网，不是运行时联网 |
| WiX Toolset 3.14 | Windows MSI 生成 | Tauri CLI 下载缓存 | .NET Foundation / WiX 许可 | 维护稳定 | 生成 `.msi` 安装包，Tauri 官方支持 | 默认 `en-US` 代码页不能容纳中文产品名 | 采用 | `npm run tauri:build` 的 MSI bundle | 必须设置 `bundle.windows.wix.language = "zh-CN"` |
| Electron | 桌面壳备选 | Electron 官方 / npm | MIT | 活跃 | 生态成熟、Windows 打包成熟 | 应用体积大、运行时重 | 不采用 | 仅作为 Tauri 不可落地时的备选 | 与轻量 EXE 目标冲突 |
| PySide6 | Python 桌面备选 | PyPI / Qt | LGPL / GPL / commercial | 活跃 | 快速开发桌面 UI | Monaco 集成弱，YAML 编辑器体验较差 | 不采用 | 仅作为快速原型备选 | 与专业 Monaco 编辑体验冲突 |
| Monaco Editor | YAML 编辑器核心 | npm `monaco-editor` | MIT | 活跃 | 高亮、折叠、行号、搜索、编辑体验成熟 | 体积较大，需要 worker 配置 | 采用 | YAML 编辑页 | 需要控制 worker 和包体积 |
| monaco-yaml | Monaco YAML language service | npm `monaco-yaml` | MIT | 活跃 | YAML 诊断、schema、补全能力成熟 | 需要与 Monaco worker 正确集成 | 采用 | 编辑器 YAML 语言能力 | 配置不当会导致 worker 报错 |
| `yaml` | YAML 解析、格式化、错误定位 | npm `yaml` | ISC | 活跃 | TypeScript 可用，支持 CST/Document、错误信息清晰 | 不负责 Clash 业务语义 | 采用 | 前端解析、格式化、结构树输入 | 大文件性能需测试 |
| `serde_yaml` | Rust YAML 解析 | crates.io | MIT/Apache-2.0 | deprecated | Rust 生态常见 | 已 deprecated，不适合新项目核心依赖 | 不采用 | 暂无 | 会引入维护风险 |
| JSON Schema / YAML schema | 配置结构校验 | monaco-yaml / 后续 schema 文件 | 视 schema 来源而定 | 需持续维护 | 适合编辑期提示 | Clash/Mihomo 版本差异大 | 借鉴 | 编辑器提示和基础字段校验 | schema 过严会误报 |
| Tauri dialog plugin | 打开 / 另存对话框 | npm `@tauri-apps/plugin-dialog` / Rust plugin | MIT OR Apache-2.0 | 活跃 | 桌面原生文件选择体验 | 需要 Tauri plugin 配置 | 采用 | 打开 YAML、另存 YAML | Web fallback 需要单独处理 |
| `json-diff-ts` | 配置 diff | npm | MIT | 活跃 | TypeScript、零依赖、可用于对象 diff | 文本 diff 仍需单独展示 | 采用 | 配置合并和版本对比 | YAML 文本 diff 需要补充 |
| `tempfile` | Rust 临时文件/目录 | crates.io / GitHub | MIT OR Apache-2.0 | 活跃 | 安全创建和清理临时文件/目录，适合 native curl 响应落盘 | 新增 Rust 依赖和少量平台依赖 | 采用 | Tauri native 订阅请求的响应头/响应体临时目录 | 构建期需下载 crate，离线构建需缓存 Cargo 依赖 |
| `url` | Rust URL 解析 | crates.io / Servo rust-url | MIT OR Apache-2.0 | 活跃 | WHATWG URL parser，和前端 URL 标准更接近 | 需要直接依赖声明，离线构建需缓存 Cargo 依赖 | 采用 | Tauri native 订阅 URL 解析和规范化 | 规范化行为必须通过测试与前端保持一致 |
| 原生 `fetch` | 单个订阅刷新和远程 provider 检查 | Web / Tauri WebView 标准 API | 平台 API | 随运行时维护 | 无新增依赖、支持 AbortController、足够覆盖 GET/超时/脱敏场景 | 高级重试和代理控制需自写 | 采用 | subscription、provider_check | WebView 跨域失败时只能报告错误，不能静默绕过 |
| Mihomo external-controller API | 节点延迟 / 可用性 / 稳定性测速 | MetaCubeX / mihomo 官方文档 | 文档许可需按来源确认 | 活跃 | 与 Clash / Mihomo 场景一致，可按节点名测试 delay | 依赖本机内核运行和 controller secret；下载测速能力有限 | 采用 | speedtest 节点 delay、可用性、稳定性样本 | 只允许回环 controller，避免访问未知主机 |
| Mihomo 常见 health-check URL | 延迟测试默认 URL | MetaCubeX / mihomo 官方文档和配置示例 | 文档许可需按来源确认 | 活跃 | `https://www.gstatic.com/generate_204` 在 url-test、fallback、load-balance、proxy-provider health-check 示例中反复出现，轻量返回 204 | 在不可访问 Google 的网络环境下可能失败，用户需可编辑 | 采用 | speedtest 默认延迟 URL、分组样例保持一致 | 只能作为用户主动测速的默认输入，不得启动即请求 |
| Cloudflare speedtest 下载 API | 下载测速默认 URL | GitHub `cloudflare/speedtest` | MIT | 活跃 | 官方 README 默认 `downloadApiUrl` 为 `https://speed.cloudflare.com/__down`，支持按 `bytes` 请求文件大小 | 会访问 Cloudflare，结果受用户网络到 Cloudflare 的路径影响 | 采用 | speedtest 默认下载 URL，固定 5 MiB | 只能作为用户主动测速的默认输入，不得自动请求 |
| 原生 `fetch` + `AbortController` | 下载 URL 受控测速、测速取消 | Web / Tauri WebView 标准 API | 平台 API | 随运行时维护 | 无新增依赖、可取消、易脱敏 | 不能自动按单个代理协议拨号 | 采用 | speedtest 下载探测 | 不声称完整按节点下载测速 |
| React 本地状态 | YAML 多标签页状态 | 当前项目已采用 React | MIT | 已在项目内使用 | 无新增依赖，足够表达 tabs + active id，状态范围局部清晰 | 不适合跨页面复杂共享状态 | 采用 | 编辑器文档标签状态 | 后续若需要全局会话恢复，需要独立持久化模块 |
| Redux Toolkit | 全局状态管理备选 | npm `@reduxjs/toolkit@2.12.0` | MIT | 活跃，npm 元数据 2026-05-15 更新 | 生态成熟、适合复杂全局状态 | 当前多标签需求过小，引入 store/切片会增加复杂度 | 不采用 | 暂无 | 与局部 UI 状态职责不匹配 |
| Zustand | 轻量全局状态管理备选 | npm `zustand@5.0.14` | MIT | 活跃，npm 元数据 2026-05-28 更新 | API 小、接入成本低 | 当前只需 App 局部状态，无需全局 store | 不采用 | 暂无 | 容易把页面局部状态提升过早 |
| Jotai | 原子化状态管理备选 | npm `jotai@2.20.1` | MIT | 活跃，npm 元数据 2026-06-11 更新 | 原子模型灵活，适合细粒度共享状态 | 当前文档标签没有跨组件深层共享需求 | 不采用 | 暂无 | 抽象收益低于依赖和学习成本 |
| axios | HTTP 客户端备选 | npm `axios@1.18.1` | MIT | 活跃 | API 成熟、拦截器生态多 | 为当前 GET 检查引入额外依赖收益低 | 不采用 | 暂无 | 增加包体积和维护面 |
| ky | HTTP 客户端备选 | npm `ky@2.0.2` | MIT | 活跃 | 小型 fetch 封装、重试方便 | 当前需求不需要封装层 | 不采用 | 暂无 | 与原生 fetch 能力重复 |
| got | Node HTTP 客户端备选 | npm `got@15.0.7` | MIT | 活跃 | Node 侧能力强 | 前端/Tauri WebView 不适合作为主入口 | 不采用 | 暂无 | 与前端运行环境不匹配 |
| subconverter | 订阅转换逻辑参考 | GitHub | GPL 系项目需谨慎确认 | 维护状态需持续审计 | 订阅格式和转换经验丰富 | 许可证和体量不适合直接嵌入 | 只借鉴 | 订阅解析设计参考 | GPL 兼容和网络边界风险 |
| MetaCubeX / mihomo 文档 | Clash/Mihomo 字段语义 | 官方文档 / GitHub | 文档许可需按来源确认 | 活跃 | 字段语义权威 | 版本变化快 | 采用为参考 | 字段识别、兼容性检查 | 需要标注目标版本 |
| OpenClash 配置样例 | OpenClash 兼容性参考 | OpenClash GitHub / 社区配置 | 需逐项确认 | 活跃 | 贴近目标用户环境 | 社区样例质量不一 | 借鉴 | 兼容检查测试样例 | 不能盲目当 schema |

## 直接复用能力

- Monaco Editor：编辑器、行号、折叠、搜索、基础高亮。当前固定 `0.52.2`，用于同时避开 `0.54.0-dev-20250909` 到 `0.56.0-dev-20260211` 范围内 npm audit 标出的 `dompurify` 间接依赖漏洞，以及 `monaco-yaml` 在 0.53+ 下的 worker handler 兼容问题。
- monaco-yaml：YAML language service、诊断、schema 接入能力。
- `yaml`：解析、错误定位、格式化输出。
- Tauri 2：桌面壳、本地命令、Windows EXE 打包链路。
- Tauri dialog plugin：打开 / 保存对话框。
- Tauri `onDragDropEvent`：桌面端文件拖入事件，只读取 `.yaml` / `.yml` 路径并复用已有 `read_text_file` 后端安全检查。
- Rust/Cargo + Microsoft Visual Studio Build Tools 2022 + Windows SDK：本机 Windows EXE / NSIS / MSI 构建链路。
- `tempfile`：Tauri native 订阅请求中为 `curl.exe` 响应头和响应体创建独占临时目录，避免可预测固定临时路径和清理遗漏。
- `url`：Tauri native 订阅请求中解析和规范化用户 URL，避免手写拆解遗漏 IPv6、端口和特殊 authority 边界。
- Tauri CLI 缓存的 NSIS / WiX：生成 Windows 安装包，构建期使用，不进入应用运行时。
- `json-diff-ts`：结构化配置 diff。
- 原生 `fetch`：用户主动触发的单个订阅刷新和远程 provider 检查，不引入 axios/ky/got。
- 原生 `fetch` + `AbortController`：用户主动触发的测速请求、下载探测和取消，不引入 axios/ky/got。
- Mihomo external-controller API：复用本地 Clash/Mihomo 内核的 `/proxies/{name}/delay` 节点测速能力。
- Mihomo 文档中的 `https://www.gstatic.com/generate_204`：作为延迟测试默认 URL。
- Cloudflare speedtest 的 `https://speed.cloudflare.com/__down`：作为下载测速默认 URL，并用 `bytes=5242880` 控制单次读取规模。
- React 本地状态：用于 YAML 多标签页的标签列表、活动标签和关闭回退，不引入 Redux Toolkit / Zustand / Jotai。
- 现有 TypeScript 合并服务：用于节点名称、代理分组字段和 DNS 非列表字段冲突的逐项选择，不为该能力新增依赖。
- 现有 TypeScript 节点服务：用于订阅节点导入当前 YAML、去重、同名冲突改名和目标分组写入，不为该能力新增依赖。
- 浏览器标准 `URL` / `URLSearchParams` / `atob`：用于解析 vmess / trojan / ss / vless / hysteria2 / hy2 / tuic 常见链接和 base64 订阅，不引入 subconverter 或额外解析库。
- MetaCubeX / mihomo 官方代理协议文档：用于校准 Hysteria2 和 TUIC 的 Mihomo 字段名，解析结果仍由本项目服务层做最小字段映射。

## 只借鉴设计的能力

- subconverter：只借鉴订阅格式识别、节点去重、转换管线设计，不直接嵌入。
- OpenClash / mihomo 配置样例：只作为兼容性检查和测试 fixture 参考。

## 不采用的能力

- 不用 Electron 作为首选桌面壳。
- 不用 PySide6 作为首选 UI。
- 不用 deprecated 的 `serde_yaml` 做核心 YAML 解析。
- 不为当前 YAML 多标签页引入全局状态库。
- 不引入自动更新、遥测、统计或 CDN 依赖。

## 冲突检查

| 检查项 | 结论 |
|---|---|
| 技术栈冲突 | Tauri + React + Monaco 与目标一致；Rust/Cargo、MSVC 链接器和 Windows SDK 已补齐，Tauri EXE / NSIS / MSI 构建已验证通过。 |
| 目录结构冲突 | 当前目录为空，无旧结构冲突。 |
| 运行方式冲突 | 使用 npm；当前未安装 pnpm，因此不采用 pnpm。 |
| 数据库设计冲突 | 当前不引入数据库，先使用本地文件和后续 Tauri store。 |
| 配置系统冲突 | 新增 Tauri 配置和 docs，不与旧配置冲突。 |
| 权限模型冲突 | 只允许用户触发的文件和网络操作。 |
| 离线 / 联网边界冲突 | 订阅、测速、连通性、provider 检查四类运行时网络行为集中管理；测速默认 URL 只在用户点击“开始测速”后访问；`npm run tauri:build` 会在构建期下载 NSIS / WiX，不属于应用运行时联网。 |
| 许可证冲突 | 当前项目依赖为 MIT、ISC、Apache-2.0 OR MIT，未发现阻塞性许可证；Microsoft Build Tools / Windows SDK 是本机工具链许可，不随应用分发。 |
| 安全审计冲突 | `monaco-editor@0.55.1` 触发 `dompurify` audit；已降级并固定到 `0.52.2`。 |

## 回滚方案

- 若 Tauri 构建无法落地：保留 React/Monaco 前端和核心 TypeScript 服务，评估 Electron 作为桌面壳替代。
- 若 Monaco worker 集成不稳定：保留 `yaml` 解析和基础 textarea fallback，但不得把 fallback 当作最终编辑体验。
- 若 `json-diff-ts` 不满足 YAML 文本 diff：仅替换 diff 模块，不影响解析、审计、备份模块。

## 来源

- Tauri: https://tauri.app/
- Tauri config reference: https://v2.tauri.app/reference/config/
- Rustup: https://rustup.rs/
- Visual Studio Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/
- NSIS: https://nsis.sourceforge.io/
- WiX Toolset: https://wixtoolset.org/
- Monaco Editor: https://www.npmjs.com/package/monaco-editor
- monaco-yaml: https://www.npmjs.com/package/monaco-yaml
- yaml: https://www.npmjs.com/package/yaml
- Tauri dialog plugin: https://www.npmjs.com/package/@tauri-apps/plugin-dialog
- json-diff-ts: https://www.npmjs.com/package/json-diff-ts
- tempfile: https://crates.io/crates/tempfile
- url: https://crates.io/crates/url
- rust-url repository: https://github.com/servo/rust-url
- Rust `temp_dir`: https://doc.rust-lang.org/std/env/fn.temp_dir.html
- Rust `Command`: https://doc.rust-lang.org/std/process/struct.Command.html
- serde_yaml: https://crates.io/crates/serde_yaml
- MetaCubeX Hysteria2 proxy docs: https://wiki.metacubex.one/en/config/proxies/hysteria2/
- MetaCubeX TUIC proxy docs: https://wiki.metacubex.one/en/config/proxies/tuic/
- MetaCubeX External Controller config docs: https://wiki.metacubex.one/en/config/general/
- MetaCubeX API docs: https://wiki.metacubex.one/en/api/
- MetaCubeX url-test docs: https://wiki.metacubex.one/en/config/proxy-groups/url-test/
- MetaCubeX proxy-provider health-check docs: https://wiki.metacubex.one/en/config/proxy-providers/
- MetaCubeX rule-providers docs: https://wiki.metacubex.one/en/config/rule-providers/
- Cloudflare speedtest: https://github.com/cloudflare/speedtest
