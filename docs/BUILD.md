# 构建说明

## 本机状态

已发现：

```text
node v24.17.0
npm 11.13.0
cargo 1.96.0
rustc 1.96.0
Visual Studio Build Tools 2022 17.14.35
Windows SDK 10.0.26100.0
```

未发现：

```text
pnpm
winget
```

注意：Visual Studio Build Tools 2022 当前安装在非默认路径 `C:\Program`。这是本机工具链状态，不是项目目录。新的命令行窗口里构建 Tauri 前，需要先加载：

```bat
C:\Program1\VC\Auxiliary\Build\vcvars64.bat
```

## 开发命令

安装依赖：

```bash
npm install
```

启动前端开发服务：

```bash
npm run dev
```

运行测试：

```bash
npm run test
```

构建前端：

```bash
npm run build
```

启动 Tauri 开发模式：

```bash
npm run tauri:dev
```

构建 Windows EXE：

```bash
npm run tauri:build
```

当前本机推荐完整打包命令：

```bat
cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && npm run tauri:build"
```

当前本机推荐 Rust 后端测试命令：

```bat
cd src-tauri
cmd /c ""C:\Program1\VC\Auxiliary\Build\vcvars64.bat" && cargo test"
```

不要在同一条 `cmd /c` 命令中追加 `set PATH=%USERPROFILE%\.cargo\bin;%PATH%`；`cmd` 会提前展开 `%PATH%`，可能覆盖 `vcvars64.bat` 刚写入的 MSVC `link.exe` 路径，导致 `linker link.exe not found`。

## Rust 工具链要求

Tauri EXE 构建必须安装 Rust：

```text
rustc
cargo
```

Windows 下还需要可用的 C/C++ 链接工具和 Windows SDK 导入库。

已验证失败路径：

- 仅安装 Rust/Cargo 时，`npm run tauri:build` 会因找不到 MSVC `link.exe` 失败。
- 强制 `RUSTFLAGS="-C linker=rust-lld"` 后，仍会因缺少 `kernel32.lib`、`ntdll.lib`、`userenv.lib`、`ws2_32.lib`、`dbghelp.lib` 等 Windows SDK 导入库失败。
- 未配置 bundle 图标时，`tauri-build` 会因缺少 `.ico` 图标或 MSI 找不到 `.ico` 失败。
- MSI 默认 `en-US` / 1252 代码页无法打包中文产品名，必须使用 `bundle.windows.wix.language = "zh-CN"`。

当前已通过路径：

```text
npm run tauri:build: 通过
Vite warning: 懒加载的 Monaco 编辑器 chunk 和 YAML worker 大于 500 kB
```

## 前端分块与许可证清单

`npm run build` 会通过 Vite / Rolldown 生成以下构建约束：

- `dist/.vite/third-party-licenses.md`：生产包内第三方依赖许可证清单。
- 首屏 `dist/index.html` 只预加载主入口、Rolldown runtime、`vendor-yaml-core` 和主样式，不预加载 Monaco 编辑器 JS/CSS。
- 编辑器页默认渲染轻量 textarea；用户点击 Monaco 图标后，才渲染 `YamlEditor` 并加载 `vendor-monaco-editor`、`vendor-monaco-yaml`、`editor.worker`、`yaml.worker`。

最近一次前端构建对比：

| 指标 | 优化前 | 当前 |
|---|---:|---:|
| 主入口 JS | 422.11 kB / gzip 131.89 kB | 327.98 kB / gzip 102.33 kB |
| `YamlEditor` 入口 chunk | 2,282.98 kB / gzip 586.40 kB | 2.24 kB / gzip 1.16 kB |
| Monaco 编辑器运行时 | 混入 `YamlEditor` chunk | 独立懒加载 `vendor-monaco-editor` 2,260.61 kB / gzip 578.67 kB |
| 许可证清单 | 未生成 | `dist/.vite/third-party-licenses.md` 25.28 kB |

`vendor-monaco-editor` 和 `yaml.worker` 仍会触发 Vite 的 500 kB chunk 提示；这是当前选择 Monaco + YAML language service 的已知体积成本，不应通过提高 `chunkSizeWarningLimit` 掩盖。继续优化前需先确认不破坏默认轻量编辑路径、Monaco 懒加载和 YAML 诊断能力。

## 输出

最近一次成功输出：

```text
src-tauri/target/release/yaml-proxy-editor.exe
src-tauri/target/release/bundle/nsis/YAML 代理配置编辑器_0.1.0_x64-setup.exe
src-tauri/target/release/bundle/msi/YAML 代理配置编辑器_0.1.0_x64_zh-CN.msi
```

Tauri 打包时会按需下载并缓存 NSIS / WiX 工具到 `%LOCALAPPDATA%\tauri`，下载由 `npm run tauri:build` 主动触发，不属于应用运行时联网行为。

Rust 后端当前新增直接依赖：

```text
tempfile 3.27.0
url 2.5.8
```

离线构建前需要确保 Cargo registry/cache 中已有这些 crate 及其传递依赖。
