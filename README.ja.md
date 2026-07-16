[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

# YAML Proxy Editor

Clash、OpenClash、Mihomo の YAML 設定を編集、監査、インポート、エクスポートする、ローカルファーストの Windows デスクトップワークベンチです。

[![最終コミット](https://img.shields.io/github/last-commit/NextWeb4/yaml-proxy-editor?style=flat-square)](https://github.com/NextWeb4/yaml-proxy-editor/commits/main)
[![リポジトリサイズ](https://img.shields.io/github/repo-size/NextWeb4/yaml-proxy-editor?style=flat-square)](https://github.com/NextWeb4/yaml-proxy-editor)
[![GitHub Stars](https://img.shields.io/github/stars/NextWeb4/yaml-proxy-editor?style=flat-square)](https://github.com/NextWeb4/yaml-proxy-editor)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-24C8DB?style=flat-square&logo=tauri&logoColor=white)

![YAML Proxy Editor ワークベンチの概要](artifacts/workbench.png)

## 主な機能

- `.yaml` / `.yml` をローカルで開き、保存、整形、検証します。
- タブ、ファイル選択、ドラッグ＆ドロップで複数文書を管理します。
- Clash、Mihomo、OpenClash の設定構造を認識します。
- `proxy-providers` を読み書きし、購読を一括登録し、ユーザー操作後にノードを更新します。
- Clash/OpenClash、V2Ray、Hiddify 用ノードを正規化、重複排除、絞り込み、グループ化、出力します。
- `MATCH` のフォールバック順を守りながらルールを追加、取り込み、並べ替え、コメント化、削除します。
- ドメインまたは URL から、完全一致/サブドメインとポリシーを指定したサイト別ルールを作ります。
- ルール、DNS/fake-IP、OpenClash 互換性、remote provider の応答、一般的な設定リスクを監査します。
- 中国語/英語 UI を切り替え、`yaml-proxy-editor.language` として `localStorage` に保存します。

## サイト別ルーティング

完全な URL を入力しても、YAML に書くのは正規化した hostname だけです。path、query、username、password は破棄され、入力だけでは通信しません。新規サイトルールは既定で `rules` の先頭に入り、通常優先度では `MATCH` の直前に入ります。同じ種類と hostname の既存ルールは重複させず更新します。

![サイト別ルーティングフォームと生成ルールのプレビュー](artifacts/website-rule-desktop.png)

## ダウンロード

リポジトリにはバージョン 0.2.0 の Windows パッケージがあります。

- [NSIS セットアップ EXE](release/YAML-Proxy-Editor-0.2.0-x64-setup.exe)
- [中国語 MSI](release/YAML-Proxy-Editor-0.2.0-x64-zh-CN.msi)

## 開発

npm と `package-lock.json` を使い、React 19、TypeScript、Vite、Vitest、Tauri 2、Rust で構成されています。Windows の Tauri ビルドには動作する Rust/MSVC ツールチェーンも必要です。

```bash
npm install
npm run dev
```

`npm run dev` は Vite を `127.0.0.1:1420` にバインドします。デスクトップシェルの開発実行:

```bash
npm run tauri:dev
```

## テストとビルド

```bash
npm run test
npm run build
npm run tauri:build
```

- `npm run test` は `tests/` の Vitest を実行します。
- `npm run build` は TypeScript プロジェクトと Vite frontend をビルドします。
- `npm run tauri:build` は frontend をビルドし、設定済み NSIS/MSI を生成します。

Tauri ビルドで `link.exe` が見つからない場合は、Visual Studio C++ ビルド環境を読み込んだ端末で実行してください。

## アーキテクチャ

| パス | 役割 |
| --- | --- |
| `src/App.tsx` | アプリシェル、ページ状態、サービスの組み合わせ |
| `src/components/editor/` | 遅延ロードする Monaco YAML エディター |
| `src/services/yaml/` | YAML 解析、整形、検証、テンプレート |
| `src/services/subscription/` | 購読の解析、更新、選択、出力 |
| `src/services/nodes/` | ノードの正規化、絞り込み、グループ化、出力 |
| `src/services/rules/` | ルール解析、編集、テンプレート、サイトルール |
| `src/services/config/` | provider と DNS/fake-IP/TUN の最適化 |
| `src/services/openclash/` | OpenClash 互換性と出力 |
| `src/services/provider_check/` | ユーザー起動の remote provider 検査 |
| `src/services/desktop/` | Browser/Tauri のファイル/購読ブリッジ |
| `src-tauri/src/` | ネイティブのファイル、バックアップ、購読、エラー処理 |
| `tests/` | Vitest 回帰テストと YAML fixture |

frontend は既存の `yaml`、`monaco-yaml`、`json-diff-ts`、`lucide-react` を再利用します。Monaco はユーザーが完全版エディターを有効にした後だけ読み込み、大きな editor/worker chunk が初期画面を妨げないようにしています。

## ローカル処理と通信の境界

- ローカル YAML、ノード、購読 URL、ログ、バックアップを自動アップロードしません。
- テレメトリー、分析、自動更新 SDK、CDN の runtime asset はありません。
- 通信はユーザーが購読更新、remote provider 検査、速度テストを開始した場合だけ行います。
- URL は秘密を含む可能性があります。エラーとログから URL、path、query、username、password を除去します。
- ローカルファイルのオープン、整形、検証、監査、編集、保存はオフラインのままです。
- 寛容な分析が部分構造を表示できても、保存前の厳密検証は重複 key を拒否します。

詳細は [`docs/QUICKSTART.md`](docs/QUICKSTART.md)、[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、[`docs/NETWORK_POLICY.md`](docs/NETWORK_POLICY.md)、[`docs/OFFLINE_SECURITY.md`](docs/OFFLINE_SECURITY.md)、[`docs/TESTING.md`](docs/TESTING.md)、[`docs/BUILD.md`](docs/BUILD.md) を参照してください。

## 作成者

- HaoXiang Hwang
- [didadida1688@gmail.com](mailto:didadida1688@gmail.com)
- [https://nextweb4.github.io/](https://nextweb4.github.io/)

作成者情報はアプリ、package、Rust、installer、test、workflow で共有する固定値です。

## ライセンス

現在、リポジトリに `LICENSE` はありません。再利用または再配布前に、元の許可と適用範囲を確認してください。依存関係のライセンスは、プロジェクト自体の許諾を代替しません。
