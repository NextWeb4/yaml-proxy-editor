# AGENTS.md

## 1. 项目结构
- 根目录是 `yaml-proxy-editor`。
- 前端主入口在 `src/main.tsx`，主工作台在 `src/App.tsx`。
- 创作者信息固定在 `src/app/creatorInfo.ts`，UI 侧栏创作者卡片也读取这里的数据。
- 业务逻辑放在 `src/services/`，按 `yaml`、`subscription`、`nodes`、`rules`、`config`、`provider_check`、`openclash`、`desktop`、`editor` 分层。
- Tauri 后端在 `src-tauri/`，打包配置在 `src-tauri/tauri.conf.json`。
- 文档在 `docs/`，测试在 `tests/`，构建产物在 `dist/` 和 `src-tauri/target/`。

## 2. 运行命令
- 安装依赖：`npm install`
- 前端开发：`npm run dev`
- Tauri 开发：`npm run tauri:dev`
- 当前项目使用 npm；未发现 pnpm / yarn 配置。
- Windows 下若缺少 `link.exe`，先运行 `C:\Program1\VC\Auxiliary\Build\vcvars64.bat` 再执行 Tauri 或 Rust 命令。

## 3. 测试命令
- 前端测试：`npm run test`
- TypeScript 检查：`npx tsc -b`
- Rust 后端测试：`cd src-tauri && cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && cargo test"`
- 修改 `src/App.tsx`、创作者信息或语言切换逻辑后，必须至少补充或更新 `tests/creatorInfo.test.ts`。
- 当前未发现独立 lint / format 命令。

## 4. 构建命令
- 前端构建：`npm run build`
- Windows 安装包构建：`npm run tauri:build`
- Tauri 构建依赖 `src-tauri/icons/icon.ico` 和 `src-tauri/tauri.conf.json`。
- Windows 打包前要先加载 MSVC 环境，否则容易缺少 `link.exe`。

## 5. 代码风格
- 前端使用 TypeScript + React。
- 业务逻辑优先放进 `src/services/`，UI 组件只负责组合状态和呈现。
- 固定创作者信息是 `HaoXiang Huang`、`https://nextweb4.github.io/`、`didadida1688@gmail.com`。
- 创作者信息只允许从 `src/app/creatorInfo.ts` 读取；`README.md`、`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、测试和 workflow 必须同步。
- UI 语言切换状态使用 `localStorage`，当前键名是 `yaml-proxy-editor.language`。
- 新增图标按钮优先使用 `lucide-react`。

## 6. 模块边界
- YAML 解析和格式化只放在 `src/services/yaml/`。
- 订阅导入、刷新、导出和 provider 写入只放在 `src/services/subscription/` 与 `src/services/config/`。
- 节点、规则、DNS 和 OpenClash 逻辑分别留在各自服务目录，不要塞回 `src/App.tsx`。
- Tauri 原生网络和文件命令只放在 `src-tauri/src/`。
- 网络请求只允许出现在用户主动触发的订阅、provider 检查和测速流程中。

## 7. 禁止事项
- 不要在代码里重新写一份会漂移的创作者姓名、邮箱或主页。
- Codex、Claude Code 或其他自动化工具修改作者相关文件时，只能同步上述固定创作者信息，不能改成模板名或旧作者名。
- 不要默认上传本地 YAML、节点、订阅 URL、日志或备份。
- 不要引入遥测、自动更新 SDK 或 CDN 前端资源。
- 不要为了修复单个问题大范围重写主工作台。
- 不要绕过保存前校验、URL 脱敏或离线边界。
- 不要把没有验证过的社区说法写成 GitHub 官方事实。

## 8. 完成标准
- 涉及 UI、创作者信息或语言切换的修改后，必须确认 `src/app/creatorInfo.ts`、README、package 元数据、Rust 元数据和 workflow 保持一致。
- 涉及 YAML / 配置逻辑的修改后，至少要补测试并跑 `npm run test` 或 `npx tsc -b`。
- 发布前需要验证 `npm run build`；打包任务还要验证 `npm run tauri:build`。
- 如果没有 LICENSE 文件，README 里必须明确写“当前未发现 LICENSE 文件”。

## 9. Review 标准
- 优先检查 creator identity 是否同步、README 是否中英双语、构建命令是否真实、以及语言切换是否保存到 `localStorage`。
- 优先检查 URL 脱敏、网络边界、保存前校验、Tauri 打包配置和 Windows MSVC 依赖。
- 发现新依赖时，要说明来源、许可证、维护状态、采用范围和回滚方式。
- 当前没有独立 lint / format 命令，Review 时不要假设它们存在。

## 10. 常见风险
- `link.exe` 缺失会直接阻塞 Tauri 构建。
- GitHub token 权限不足时，仓库内容读取和写入会表现不一致。
- README、package 元数据、Rust 元数据和 workflow 很容易出现作者信息不同步。
- 语言切换若不走 `localStorage`，刷新后会回到默认语言。
- 当前仓库没有 LICENSE 文件，复用或分发前需要再确认授权来源。
