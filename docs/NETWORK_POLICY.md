# 网络策略

## 默认原则

本应用是本地 Windows EXE。默认不联网，不上传本地配置，不做遥测，不做统计，不自动检查更新，不使用 CDN。

## 允许联网的场景

只有以下用户主动触发的场景允许联网：

1. 用户主动添加订阅 URL 后测试或刷新订阅。
2. 用户主动点击延迟测试或下载测速。
3. 用户主动点击连通性检测。
4. 用户主动检查远程 proxy-provider 或 rule-provider。

## 禁止联网的场景

1. 不上传本地 YAML。
2. 不上传节点信息。
3. 不上传订阅 URL。
4. 不上传日志。
5. 不做遥测。
6. 不做统计。
7. 不自动检查更新。
8. 不访问未知域名。
9. 不使用 CDN。

## 模块边界

所有网络请求必须集中在：

```text
subscription/
speedtest/
connectivity/
provider_check/
```

其他模块不得直接发起网络请求。

当前已实现的联网入口：

- `src/services/subscription/subscriptionRefresh.ts`
  - 只允许 `http:` / `https:` 订阅 URL。
  - 只在用户点击订阅页“测试订阅”或“刷新”按钮时请求。
  - Tauri 桌面端优先调用 `src-tauri/src/commands/subscription_commands.rs` 的本地请求命令，避免浏览器 CORS / User-Agent 限制导致误判；浏览器预览模式回退到原生 `fetch`。
  - 桌面端本地请求使用系统 `curl.exe`，按 Mihomo、Clash.Meta、Clash Verge、Clash for Windows、Browser、curl 多种 User-Agent profile 尝试，不新增 HTTP 依赖。
  - 桌面端本地请求必须与前端保持同等 URL 边界：使用 Rust `url` crate 解析和规范化 URL，只允许 `http` / `https`、必须有主机名、不得包含空白或控制字符，端口合法性交给 URL parser 严格处理。
  - 桌面端本地请求的响应头和响应体只能写入 `tempfile` 创建的独占临时目录，请求结束或失败后必须清理，禁止使用可预测固定临时文件名。
  - 桌面端本地请求返回 curl stderr 前必须按当前请求 URL 脱敏；完整 URL、path、query、username、password 不得进入 Rust error、UI 或日志。
  - 响应内容仅在本地解析为 Clash/Mihomo YAML 或节点链接。
  - 日志只记录脱敏 URL 摘要，例如 `https://example.com/...?token=<redacted>`。
  - 订阅刷新失败错误必须通过 `sanitizeSubscriptionError` 脱敏，覆盖完整 URL、同域规范化 URL、path、query、username、password，页面层不得手写替代逻辑。
  - 支持解析 `subscription-userinfo` 响应头中的流量信息。
- `src/services/provider_check/providerCheck.ts`
  - 只提取当前 YAML 中用户已配置的 `proxy-providers` / `rule-providers`。
  - 只检查 `type: http` 且 `url` 为 `http:` / `https:` 的 provider。
  - 只在用户点击 OpenClash 页“检查”按钮时请求。
  - 使用原生 `fetch`，不引入额外 HTTP 依赖。
  - 默认最多读取每个 provider 响应前 2 MiB，确认可访问后取消后续响应流，避免超大订阅占用过多内存。
  - HTTP 成功后只做轻量内容结构校验：`proxy-providers` 识别 `proxies` YAML 或常见代理链接列表，`rule-providers` 识别 `payload` YAML、`format: text` 文本规则或 `format: mrs` 连通性。
  - 可访问但返回 HTML、登录页、验证码页、空响应或未知结构时必须标记为 warning；不得把单纯 HTTP 200 当作 provider 可用。
  - 请求不携带本地 YAML、节点信息、订阅 URL 或日志内容。
  - UI 和日志只展示脱敏 URL 摘要，例如 `https://example.com/...?token=<redacted>`。
- `src/services/speedtest/speedtestPlanner.ts`
  - 生成本地测速任务队列、取消队列和计算结果评分。
- `src/services/speedtest/speedtestDefaults.ts`
  - 延迟测试默认 URL 为 `https://www.gstatic.com/generate_204`，依据 Mihomo url-test / health-check 常见示例。
  - 下载测速默认 URL 为 `https://speed.cloudflare.com/__down?bytes=5242880`，依据 Cloudflare speedtest 下载 API。
  - 这些 URL 只作为测速页输入框默认值，应用启动、打开文件、切换页面时不得自动请求。
- `src/services/speedtest/speedtestRunner.ts`
  - 只在用户点击测速页“开始测速”按钮时请求。
  - 节点级延迟 / 可用性 / 稳定性测速只访问本机 Mihomo / OpenClash external-controller，controller 地址必须是 `127.0.0.1`、`localhost` 或 `::1`，`0.0.0.0` 会映射为 `127.0.0.1`。
  - 使用 Mihomo `/proxies/{name}/delay?url=...&timeout=...` API，测试 URL 来自测速页输入框，且只允许 `http:` / `https:`。
  - 下载测速只访问测速页输入框中的下载 URL，并记录本地速度样本；当前不自动切换代理分组，不声称这是完整按节点下载测速。
  - 使用原生 `fetch` 和 `AbortController`，不引入额外 HTTP 依赖。
  - 下载测速的超时 / 取消必须覆盖响应头获取和响应体读取，避免慢速或卡住的下载流阻塞队列。
  - 测速日志只记录本机 controller 摘要、脱敏测速 URL、状态、耗时和错误类型，不记录完整 token。
  - 测速失败错误必须脱敏下载 URL、controller request URL 中嵌套的测速 URL、path 和 query；异常 message 不得直接透传用户输入 URL。

当前明确不联网的配置优化入口：

- `src/services/config/configOptimizer.ts`
  - 写入机场订阅 provider 时只改写当前 YAML，不刷新订阅、不检查 URL 可达性。
  - DNS/IP 防泄露优化只补齐本地配置字段和 rules，不下载 rule-provider，不请求泄露测试网站。
  - UI 和日志展示订阅 URL 时必须使用脱敏结果。

## 日志要求

每次网络请求必须记录本地审计日志：

- 触发来源
- 请求类型
- 目标域名或 URL 摘要
- 开始时间
- 结束时间
- 成功或失败
- 错误类型

日志不得包含代理节点密码、完整订阅 URL token 或本地 YAML 内容。

## 用户可见性

网络行为必须在 UI 中可见：

- 订阅刷新状态
- 测速任务状态
- 连通性检查状态
- provider 检查状态
- 最近错误信息
