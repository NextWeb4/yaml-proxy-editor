# AGENTS.md

## 1. 项目结构
- 项目根目录：`D:\Codex\yaml`。
- 前端入口在 `src/main.tsx`，主工作台在 `src/App.tsx`，Monaco 编辑器组件在 `src/components/editor/YamlEditor.tsx`。
- 业务逻辑放在 `src/services/`：YAML 解析在 `src/services/yaml/`，Clash 结构识别在 `src/services/clash/`，订阅解析/刷新在 `src/services/subscription/`，节点/规则/DNS/OpenClash/配置优化分别在对应子目录。
- Tauri 后端在 `src-tauri/`，命令入口在 `src-tauri/src/commands/`，Rust 核心逻辑在 `src-tauri/src/core/`。
- 文档在 `docs/`，样例 YAML 在 `examples/`，测试在 `tests/`，Playwright/人工验证截图在 `artifacts/`。

## 2. 运行命令
- 安装依赖：`npm install`。
- 前端开发服务：`npm run dev`，默认 `http://127.0.0.1:1420`。
- Tauri 开发模式：`npm run tauri:dev`。
- 当前项目使用 npm；未发现 pnpm/yarn 配置。
- 当前本机已发现 Rust/Cargo 和 Windows 打包产物；如新 shell 找不到 MSVC 链接器，优先用 `cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && cargo test"` 这类命令加载编译环境。
- 不要在同一条 `cmd /c` 里用 `set PATH=%USERPROFILE%\.cargo\bin;%PATH%` 覆盖 `vcvars64.bat` 刚写入的 PATH，否则可能重新丢失 `link.exe`。

## 3. 测试命令
- 单元测试：`npm run test`。
- TypeScript 类型检查：`npx tsc -b`。
- Rust 后端测试：`cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && cargo test"`，工作目录为 `src-tauri`。
- 修改 `src/services/` 下 YAML、Clash、订阅、节点、规则、DNS、OpenClash、配置优化、备份或合并逻辑后，必须新增或更新 `tests/`。
- 修改单网站分流或规则页交互后，必须运行 `npm run test -- tests/ruleEditor.test.ts`，并运行 `artifacts/verify_website_rule_ui.py` 验证桌面与窄屏布局。
- 修改 `src-tauri/src/commands/` 或 `src-tauri/src/core/` 后，必须运行 `cargo fmt` 和上述 Rust 后端测试；当前本机已安装 `rustfmt`。
- 当前未发现单独的 lint / format 命令；如新增，必须写入 `package.json` 和本文档。

## 4. 构建命令
- 前端构建：`npm run build`。
- Windows EXE / NSIS / MSI 构建：`npm run tauri:build`。
- Tauri 打包依赖 `src-tauri/icons/icon.ico` 和 `src-tauri/tauri.conf.json`。
- 中文 MSI 必须保持 `bundle.windows.wix.language = "zh-CN"`，否则 WiX 可能因代码页无法写入中文产品名而失败。
- 前端生产构建必须继续输出 `dist/.vite/third-party-licenses.md`；修改 `vite.config.ts` 后必须确认该许可证清单仍生成。

## 5. 代码风格
- 前端使用 TypeScript + React；新增业务逻辑优先写成 `src/services/` 下的纯函数，并配套 Vitest。
- UI 组件只组合状态和服务结果，不直接写 YAML 解析、订阅下载、规则修正、DNS 防泄露或文件写入逻辑。
- 新增图标按钮优先使用 `lucide-react`。
- 单网站地址解析、hostname 规范化、重复规则替换和插入优先级必须放在 `src/services/rules/ruleEditor.ts`；`RulesPage` 只收集表单值并展示预览/结果。
- 创作者信息必须从 `src/app/creatorInfo.ts` 读取；署名、个人网页、邮箱为固定项目，不得在页面组件中另写一份可漂移的副本。
- 编辑器页默认必须先渲染轻量 textarea，用户点击 Monaco 图标后才允许渲染 `YamlEditor` 并加载 Monaco 大 chunk；不要把编辑器实现塞回首屏主 chunk。
- Monaco worker 初始化只允许由 `src/components/editor/YamlEditor.tsx` 懒加载触发；不要在 `src/main.tsx` 或 `src/App.tsx` 静态导入 `src/app/monacoWorkers.ts`。
- `src/App.tsx` 不允许保留当前默认导航之外的不可达页面组件；测速、合并、备份目录、设置页如需恢复，必须由用户明确要求并重新补 UI 验证。
- 新增中文文档使用 UTF-8；不要写泛泛口号，只写会影响后续开发行为的事实和约束。

## 6. 模块边界
- `src/services/config/configOptimizer.ts` 负责机场订阅 provider 写入、DNS/fake-ip/TUN/IP 防泄露优化；页面只调用该服务。
- `src/services/subscription/providerSelection.ts` 负责把当前 YAML 的 `proxy-providers` 同步到订阅管理页表单；导入 YAML 后不得继续显示静态“手动订阅”或示例 URL。
- `src/services/yaml/yamlService.ts` 负责导入 YAML 后的格式识别、结构树和配置清单；这些内容必须在左侧栏体现，遇到重复 key 时清单可用宽松解析列出内容，但保存前校验必须继续严格阻止。
- 节点页必须显示当前 YAML 的 `proxy-providers` 订阅源，但不得把远程 provider 伪装成已下载的真实节点；真实节点只来自 `proxies` 或用户主动刷新后解析出的订阅内容。
- 订阅测试/刷新前端逻辑只允许在 `src/services/subscription/`，Tauri 原生订阅请求只允许在 `src-tauri/src/commands/subscription_commands.rs`；远程 provider 检查只允许在 `src/services/provider_check/`，测速只允许在 `src/services/speedtest/`。
- 批量订阅文本解析只允许放在 `src/services/subscription/batchSubscription.ts`；页面只传入原始多行文本并展示 findings，不得在组件里手写 URL 提取、命名或脱敏。
- 节点订阅导出和 Clash/V2Ray/Hiddify 分享链接转换只允许放在 `src/services/subscription/subscriptionExport.ts`；节点页只负责筛选、选择格式、复制和展示结果。
- 单网站分流必须接受域名或完整 URL，仅把规范化后的 hostname 写入 YAML；不得保存 URL path、query、username 或 password，也不得因填写网站触发网络请求。
- 单网站分流默认写入 `rules` 顶部以优先于宽泛规则；用户选择普通优先级时才写到 `MATCH` 前。相同类型和 hostname 的旧规则必须替换目标而不是并存冲突，`MATCH` 必须继续保持最后一条。
- Tauri 原生订阅请求必须使用 Rust `url` crate 解析和规范化 URL，并与前端保持同等边界：只允许 `http` / `https`、必须有主机名、不得包含空白或控制字符。
- Tauri 原生订阅请求写 curl 响应头/响应体时必须使用 `tempfile` 创建独占临时目录，并在成功、HTTP 错误、curl 启动失败、响应读取失败时清理。
- Tauri 原生订阅请求返回 curl stderr 前必须脱敏当前请求 URL；完整 URL、path、query、username、password 不得出现在 Rust `AppError::Network` 文本中。
- 订阅刷新错误脱敏只允许调用 `src/services/subscription/subscriptionRefresh.ts` 的 `sanitizeSubscriptionError`；页面组件不得手写 `replaceAll(rawUrl, ...)` 这类局部脱敏。
- 测速失败错误必须在 `src/services/speedtest/speedtestRunner.ts` 内脱敏；下载 URL、controller request URL 中嵌套的测速 URL、path、query 不得出现在日志 message 中。
- 远程 provider 检查必须在 `src/services/provider_check/providerCheck.ts` 内同时做连通性和轻量内容结构校验：proxy provider 只识别 `proxies` YAML 或常见代理链接列表，rule provider 只识别 `payload` YAML、`format: text` 文本规则或 `format: mrs` 连通性；不得为了校验读取超过默认 2 MiB 上限。
- `proxy-providers` 的机场订阅模板只允许用户填写名称和 URL；`type: http`、`interval: 86400`、`health-check`、`proxy: DIRECT` 保持服务层默认。
- 防泄露优化必须保持用户主动触发，不得在打开文件、切换页面或应用启动时自动改写 YAML。
- 当前主导航已精简为编辑器、订阅、节点、规则、DNS、OpenClash；不要把测速、合并、备份目录、设置页重新暴露为默认入口，除非用户明确要求。
- 左侧栏必须同时承担导航和当前 YAML 内容索引；内容索引只保留格式卡片和可点击结构统计，不要再展开完整 `analysis.inventory` 清单造成侧栏拥挤。
- 中等桌面窗口（约 1000px 宽）点击导航或结构统计后不得折叠左侧栏；侧栏图标化折叠只允许用于小屏移动断点。

## 7. 禁止事项
- 不允许默认上传本地 YAML、节点信息、订阅 URL、日志或备份文件。
- 不允许自动访问未知域名、遥测、统计、自动检查更新或使用 CDN。
- 不允许 Codex、Claude Code 或任何自动化/AI 编码工具修改 `src/app/creatorInfo.ts`、`README.md`、`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 中的创作者署名 `HaoXiang Hwang`、个人网页 `https://nextweb4.github.io/`、邮箱 `didadida1688@gmail.com`。
- 不允许为 YAML 解析、Monaco 高亮、diff、schema 校验重复造轮子；优先复用当前依赖 `yaml`、`monaco-yaml`、`json-diff-ts`。
- 不允许在 `src/App.tsx` 中继续堆叠新的大块业务算法；新增算法必须下沉到服务模块。
- 不允许页面用字符串拼接直接生成 `DOMAIN` / `DOMAIN-SUFFIX` 网站规则，也不允许在日志中记录用户输入的完整 URL。
- 不允许为了修 bug 大范围重写配置编辑链路；先复现、定位输入/状态/转换/输出，再做最小修复。

## 8. 完成标准
- 涉及 YAML 改写的功能必须可通过 `npx tsc -b` 和对应 Vitest 验证。
- 单网站分流完成标准包括：完整 URL/裸域名规范化、精确/子域名匹配、策略分组选择、顶部/普通优先级、同站点目标更新、非法输入保护、`MATCH` 兜底顺序和 UI 窄屏无重叠。
- 涉及保存文件的行为必须继续走保存前校验和备份链路。
- 涉及网络的行为必须由用户点击触发，并在 UI/日志中使用脱敏 URL。
- 发布前不能只验证前端构建；需要验证 `npm run build`，发布任务还需要验证 `npm run tauri:build` 产物。
- `npm audit --audit-level=low` 如出现漏洞，必须先记录影响范围和冲突，再决定升级、降级、替换或隔离。

## 9. Review 标准
- 优先检查网络边界、订阅 URL 脱敏、DNS/fake-ip/IP 防泄露规则、OpenClash provider 兼容性、规则顺序和 MATCH 兜底。
- 新增依赖必须说明来源、许可证、维护状态、采用范围、替代方案和回滚方式；当前 Rust `tempfile` 只允许用于 Tauri native 订阅请求临时目录，Rust `url` 只允许用于 Tauri native URL 解析。
- 修改 `src/services/config/configOptimizer.ts` 后，必须检查重复 provider、非法 URL、已有 `use` 分组写入、泄露测试直连规则修正和私有 IP 规则。
- 修改应用外壳、README、package 元数据、Rust 包元数据或 Tauri 打包配置时，必须确认创作者信息仍为 `HaoXiang Hwang`、`https://nextweb4.github.io/`、`didadida1688@gmail.com`，且不得由 AI/自动化工具变更。
- 修改订阅管理页 provider 选择、写入或删除链路后，必须检查导入 YAML 的 `proxy-providers` 能回填名称/URL，新增草稿 URL 为空，修改/删除会写回当前 YAML。
- 修改订阅刷新、native fetch 或错误处理后，必须检查完整 URL、同域规范化 URL、path、query、username、password 不会出现在 Rust error、UI finding 或日志中。
- 修改批量订阅导入后，必须检查多行名称/URL 解析、重复名称后缀、非法行 finding、写入 `proxy-providers` 默认模板、`proxy-groups.use` 同步，以及日志/界面只显示脱敏 URL。
- 修改节点订阅导出/转换后，必须检查 Clash/Mihomo YAML、Clash Verge/OpenClash provider YAML、V2Ray/Hiddify 分享链接、Base64 订阅输出，并覆盖无法转换节点的 warning。
- 修改测速逻辑后，必须检查下载失败和 controller 失败日志不会泄漏测速 URL token、嵌套 URL、path 或 query。
- 修改远程 provider 检查后，必须覆盖可访问但返回 HTML/登录页/空响应的 warning、proxy YAML 节点计数、rule YAML/text 规则计数、`format: mrs` 不解析内容，以及失败错误不泄漏 provider URL token。
- 修改节点页后，必须检查只有 `proxy-providers` 和少量本地 `direct/reject` 的 YAML 能展示订阅源列表。
- 修改 `src/services/yaml/yamlService.ts` 后，必须检查普通 Clash YAML、重复 key YAML、错误缩进 YAML 的格式识别和配置清单。
- 修改单网站分流后，必须检查 URL path/query/凭据不会进入规则，IPv4/IPv6 输入会提示使用高级 IP 规则，重复站点不会产生互相冲突的规则，且现有规则表、批量导入、模板和注释功能不回归。
- 页面组件不得直接承担订阅下载、测速、文件写入或 YAML 结构改写职责。
- 修改 `vite.config.ts` 的分块、module preload 或 HTML 生成逻辑后，必须检查 `dist/index.html` 不包含 `vendor-monaco-editor` / `vendor-monaco-yaml` / `YamlEditor` 的首屏 preload 或 stylesheet link。
- 修改编辑器页加载逻辑后，必须检查默认渲染路径不会出现 `<YamlEditor>`，运行 `tests/monacoLazyLoad.test.ts`，并用 `artifacts/verify_editor_lazy_load.py` 做默认 textarea / 手动启用 Monaco 的 Playwright 验证。

## 10. 常见风险
- 用户 YAML 可能存在重复 provider 名称；配置优化服务使用宽松解析并在写回时归并，测试必须覆盖。
- 远程 provider 可访问不代表内容可用；机场登录页、验证码页、HTML 错误页或空响应必须作为结构 warning，而不是成功。
- DNS / 泄露审计只能给出配置风险建议，不得承诺绝对匿名或真实网络环境一定无泄露。
- `serde_yaml` 已 deprecated；Rust 侧如需要 YAML 解析，必须重新审计替代方案。
- Monaco 固定在 `0.52.2`；升级前必须同时验证 npm audit 和 `monaco-yaml` worker 兼容性。
- Vite 大 chunk warning 当前主要来自懒加载的 Monaco 编辑器和 YAML worker；不要通过单纯提高 `chunkSizeWarningLimit` 掩盖，先确认首屏入口和 HTML preload 边界。
- 订阅和测速功能容易突破离线边界，新增请求必须集中在允许联网模块内。
- Clash/Mihomo 规则按顺序命中；单网站规则若错误追加在宽泛 GEOSITE/GEOIP 后可能不生效，因此默认优先插入顶部并必须有顺序测试。
