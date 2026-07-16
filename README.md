[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

# YAML Proxy Editor

A local-first Windows desktop workbench for editing, auditing, importing, and exporting Clash, OpenClash, and Mihomo YAML configurations.

[![Last commit](https://img.shields.io/github/last-commit/NextWeb4/yaml-proxy-editor?style=flat-square)](https://github.com/NextWeb4/yaml-proxy-editor/commits/main)
[![Repository size](https://img.shields.io/github/repo-size/NextWeb4/yaml-proxy-editor?style=flat-square)](https://github.com/NextWeb4/yaml-proxy-editor)
[![GitHub stars](https://img.shields.io/github/stars/NextWeb4/yaml-proxy-editor?style=flat-square)](https://github.com/NextWeb4/yaml-proxy-editor)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-24C8DB?style=flat-square&logo=tauri&logoColor=white)

![YAML Proxy Editor workbench overview](artifacts/workbench.png)

## What It Does

- Opens, saves, formats, and validates `.yaml` and `.yml` files locally.
- Manages multiple documents through tabs, a file picker, and drag-and-drop.
- Recognizes Clash, Mihomo, and OpenClash configuration structures.
- Reads and updates `proxy-providers`, batch-imports subscription entries, and refreshes nodes after an explicit user action.
- Normalizes, deduplicates, filters, groups, and exports nodes for Clash/OpenClash, V2Ray, and Hiddify workflows.
- Adds, imports, reorders, comments, and deletes rules while preserving `MATCH` fallback ordering.
- Creates per-site routing rules from a domain or full URL with exact/subdomain matching and policy selection.
- Audits rules, DNS/fake-IP settings, OpenClash compatibility, remote provider responses, and common configuration risks.
- Switches between Chinese and English and stores the choice in local `localStorage` under `yaml-proxy-editor.language`.

## Per-Site Routing

When a full URL is entered, only its normalized hostname is written to YAML. The path, query, username, and password are discarded and entering a site does not itself make a network request. New website rules default to the top of `rules`; normal priority inserts them before `MATCH`. An existing rule with the same type and hostname is updated instead of duplicated.

![Per-site routing form and generated rule preview](artifacts/website-rule-desktop.png)

## Download

The repository contains these version 0.2.0 Windows packages:

- [NSIS setup executable](release/YAML-Proxy-Editor-0.2.0-x64-setup.exe)
- [Chinese MSI installer](release/YAML-Proxy-Editor-0.2.0-x64-zh-CN.msi)

## Develop

The project uses npm with `package-lock.json`, React 19, TypeScript, Vite, Vitest, Tauri 2, and Rust. A Tauri desktop build on Windows also requires a working Rust/MSVC toolchain.

```bash
npm install
npm run dev
```

`npm run dev` binds Vite to `127.0.0.1:1420`. To run the desktop shell during development:

```bash
npm run tauri:dev
```

## Test and Build

```bash
npm run test
npm run build
npm run tauri:build
```

- `npm run test` runs the Vitest suite under `tests/`.
- `npm run build` performs the TypeScript project build and creates the Vite frontend bundle.
- `npm run tauri:build` runs the frontend build and produces the configured NSIS and MSI bundles.

If the Tauri build reports a missing `link.exe`, run it from a terminal where the Visual Studio C++ build environment has been loaded.

## Architecture

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Application shell, page state, and service composition |
| `src/components/editor/` | Lazily loaded Monaco YAML editor |
| `src/services/yaml/` | YAML parsing, formatting, validation, and templates |
| `src/services/subscription/` | Subscription parsing, refresh, selection, and export |
| `src/services/nodes/` | Node normalization, filtering, grouping, and export |
| `src/services/rules/` | Rule parsing, editing, templates, and website rules |
| `src/services/config/` | Provider and DNS/fake-IP/TUN hardening changes |
| `src/services/openclash/` | OpenClash compatibility checks and exports |
| `src/services/provider_check/` | User-triggered remote provider checks |
| `src/services/desktop/` | Browser/Tauri file and subscription bridges |
| `src-tauri/src/` | Native file, backup, and subscription commands plus error handling |
| `tests/` | Vitest regression suite and YAML fixtures |

The frontend reuses the established `yaml`, `monaco-yaml`, `json-diff-ts`, and `lucide-react` packages. Monaco is loaded only after the user enables the full editor so its large editor and worker chunks do not block the initial workbench.

## Local and Network Boundary

- Local YAML, nodes, subscription URLs, logs, and backups are not uploaded automatically.
- The frontend does not use telemetry, analytics, an auto-update SDK, or CDN-hosted runtime assets.
- Network access occurs only after the user starts subscription refresh, remote provider checks, or speed tests.
- User-supplied URLs may contain secrets. Error messages and logs must redact full URLs, paths, queries, usernames, and passwords.
- Opening, formatting, validating, auditing, editing, and saving a local file must remain offline.
- Before saving, strict validation still blocks duplicate keys even if a tolerant analysis path was able to show a partial inventory.

More detail is available in [`docs/QUICKSTART.md`](docs/QUICKSTART.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/NETWORK_POLICY.md`](docs/NETWORK_POLICY.md), [`docs/OFFLINE_SECURITY.md`](docs/OFFLINE_SECURITY.md), [`docs/TESTING.md`](docs/TESTING.md), and [`docs/BUILD.md`](docs/BUILD.md).

## Creator

- HaoXiang Hwang
- [didadida1688@gmail.com](mailto:didadida1688@gmail.com)
- [https://nextweb4.github.io/](https://nextweb4.github.io/)

The creator identity is a fixed project value shared by application, package, Rust, installer, test, and workflow metadata.

## License

No `LICENSE` file is currently present in the repository. Confirm the original authorization and applicable permissions before reuse or redistribution; the absence of a project license is not cured by the licenses of its dependencies.
