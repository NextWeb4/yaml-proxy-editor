
# AGENTS.md

## 1. Project structure
- `src/main.tsx` starts the React application and `src/App.tsx` composes the workbench.
- Put reusable behavior in the matching `src/services/` domain (`audit`, `backup`, `clash`, `config`, `desktop`, `diff`, `editor`, `groups`, `merge`, `nodes`, `openclash`, `provider_check`, `rules`, `speedtest`, `subscription`, or `yaml`). Keep UI components focused on state and presentation.
- Native commands and guards live under `src-tauri/src/`; tests and YAML fixtures live under `tests/`. Packaging is configured by `src-tauri/tauri.conf.json`.

## 2. Run commands
- Install dependencies with `npm install`; this repository uses npm and `package-lock.json`, with no pnpm/yarn configuration found.
- Run the Vite frontend with `npm run dev`.
- Run the Tauri development shell with `npm run tauri:dev` from a terminal with a working Rust/MSVC toolchain.

## 3. Test commands
- Run frontend/service tests with `npm run test`.
- Run the TypeScript project check with `npx tsc -b` (also part of `npm run build`).
- Run Rust tests with `cargo test --manifest-path src-tauri/Cargo.toml` in an initialized MSVC environment.
- Add/update the focused file under `tests/` whenever YAML, subscription, node, rule, DNS, OpenClash, provider, backup, merge, speed-test, or desktop-bridge behavior changes.

## 4. Build commands
- Build the frontend with `npm run build`.
- Build configured Windows NSIS/MSI packages with `npm run tauri:build`.
- Tauri builds require `src-tauri/icons/`, `src-tauri/tauri.conf.json`, Rust, and the Windows MSVC linker.

## 5. Code style
- Keep the centered Shields language selector in all three root READMEs with the exact visible labels `English`, `简体中文`, and `日本語`, linked in that order to `README.md`, `README.zh-CN.md`, and `README.ja.md`; do not replace the SVG labels with browser-translatable text.
- Keep the three README versions aligned in section order, facts, commands, paths, links, images, numbers, and code fences; translate headings and prose naturally while preserving identifiers.
- Use TypeScript and React patterns already present; keep algorithms out of `src/App.tsx` and in focused service modules.
- Use `lucide-react` for interface icons and preserve lazy loading for `YamlEditor`/Monaco workers.
- Creator metadata is the fixed value `HaoXiang Hwang`, `Rays688888@Gmail.com`, and `https://nextweb4.github.io/`; development assistance is credited to Codex and Claude Code. Keep `src/app/creatorInfo.ts`, README, package, Rust, installer, tests, and `.github/workflows/creator-identity-lock.yml` aligned.
- Format Rust changes with `cargo fmt --manifest-path src-tauri/Cargo.toml`. No JavaScript/TypeScript lint or format command was found; add one before claiming JS/TS lint or formatter coverage.

## 6. Module boundaries
- YAML parsing/formatting/validation stays in `src/services/yaml/`; rule hostname normalization and ordering stay in `src/services/rules/ruleEditor.ts`.
- Subscription parsing/refresh/export and URL sanitization stay under `src/services/subscription/`; remote provider checks stay under `src/services/provider_check/`.
- Native subscription requests stay in `src-tauri/src/commands/subscription_commands.rs` and must use structured URL parsing, bounded responses, isolated temporary files, cleanup, and redacted errors.
- UI pages call service APIs and must not implement YAML mutation, URL extraction, subscription downloading, or file writes directly.

## 7. Prohibited changes
- Do not upload local YAML, nodes, URLs, logs, or backups automatically; do not add telemetry, analytics, auto-update SDKs, CDN runtime assets, or unknown-domain requests.
- `src-tauri/tauri.conf.json` currently disables CSP with `app.security.csp: null`; do not add remote content or runtime origins without first defining and testing an explicit CSP.
- Do not log complete subscription/provider/speed-test URLs, paths, queries, usernames, passwords, or tokens.
- Do not replace existing `yaml`, `monaco-yaml`, or `json-diff-ts` behavior with hand-written parsers/diff engines without a documented compatibility and license audit.
- Do not modify the fixed creator identity or duplicate it as drift-prone component literals.
- Do not claim a project license while the repository has no `LICENSE` file.

## 8. Completion criteria
- Run `npm run test` and `npm run build`, and report the actual results.
- Run focused tests for the changed domain; Rust changes also run `cargo fmt --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml`.
- File-writing changes retain strict validation and the existing backup path. Network actions remain explicit user gestures and return redacted errors.
- Release changes verify `npm run tauri:build` artifacts and keep creator metadata synchronized. Do not publish while `npm audit --audit-level=low` findings are unexplained.

## 9. Review criteria
- Verify the language selector renders through GitHub without browser-translatable text and all three README versions keep the same facts, commands, links, and images.
- Review offline/network boundaries, URL redaction, rule order/`MATCH`, DNS/fake-IP safety, provider content validation, and OpenClash compatibility first.
- Check duplicate keys, invalid YAML, subscription naming collisions, malformed URLs, oversized provider responses, and partial failures.
- Confirm Monaco remains absent from the initial HTML preload and loads only after explicit editor activation.
- Confirm no UI component has absorbed service or native-command responsibilities and no metadata has drifted.

## 10. Common risks
- Remote provider reachability does not prove valid content; HTML/login/empty responses must be warnings rather than successes.
- Subscription and speed-test features can break the offline boundary or leak URL secrets through nested error text.
- Clash/Mihomo rules are order-sensitive; a site rule after broad GEOSITE/GEOIP rules may never match.
- Monaco is pinned at `0.52.2`; upgrades require worker compatibility, lazy-load, build, and dependency-audit verification.
- The repository has no project license, which blocks confident reuse or redistribution regardless of dependency licenses.


