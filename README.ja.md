<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/English-0969da?style=flat-square" alt="English"></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-c8102e?style=flat-square" alt="简体中文"></a>
  <a href="README.ja.md"><img src="https://img.shields.io/badge/%E6%97%A5%E6%9C%AC%E8%AA%9E-8250df?style=flat-square" alt="日本語"></a>
</p>

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
- ルール、DNS/fake-IP、OpenClash 互換性、リモートプロバイダーの応答、一般的な設定リスクを監査します。
- 中国語/英語 UI を切り替え、`yaml-proxy-editor.language` として `localStorage` に保存します。

## 基本的な作業手順

1. ローカルの `.yaml`/`.yml` を開く、ワークベンチへドロップする、または Clash/Mihomo テンプレートから開始します。
2. プロバイダー、ノード、グループ、DNS、ルールを変更する前に、解析済みの一覧と診断結果を確認します。
3. 対応するドメインツールで必要な箇所を変更し、マージや広範な最適化では差分プレビューを確認します。
4. ネットワーク上の結果が必要な場合だけ、購読更新、プロバイダー検査、速度テストを明示的に開始します。
5. 検証と互換性検査を再実行し、生成された YAML を確認してから、ローカル保存または必要な形式への出力を行います。

寛容な解析経路は壊れたファイルから有用な部分構造を表示できますが、そのファイルを安全に保存できる状態にはしません。厳密な検証が常に最終的な書き込み条件です。

## サイト別ルーティング

完全な URL を入力しても、YAML に書くのは正規化したホスト名だけです。パス、クエリ、ユーザー名、パスワードは破棄され、入力だけでは通信しません。新規サイトルールは既定で `rules` の先頭に入り、通常優先度では `MATCH` の直前に入ります。同じ種類とホスト名の既存ルールは重複させず更新します。

![サイト別ルーティングフォームと生成ルールのプレビュー](artifacts/website-rule-desktop.png)

## 動作要件と互換性

- **デスクトップ対象:** リポジトリ内のインストーラーと Tauri バンドル設定は Windows x64 向けです。
- **フロントエンドツール:** コミット済みの `package-lock.json` と npm を使います。pnpm/Yarn 設定は見つかっておらず、最低 Node.js バージョンも宣言されていません。
- **デスクトップツール:** `npm run tauri:dev` と `npm run tauri:build` には Rust と Windows MSVC C++ リンカー環境が必要です。
- **ローカル開発:** Vite は `127.0.0.1:1420` だけで待ち受けるため、開発サーバーは既定でローカルネットワークへ公開されません。
- **設定ファミリー:** Clash、Mihomo、OpenClash の構造を認識しますが、出力後の動作は対象クライアントと対応スキーマに依存します。

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
cargo test --manifest-path src-tauri/Cargo.toml
```

- `npm run test` は `tests/` の Vitest を実行します。
- `npm run build` は TypeScript プロジェクトと Vite フロントエンドをビルドします。
- `npm run tauri:build` はフロントエンドをビルドし、設定済み NSIS/MSI を生成します。
- `cargo test --manifest-path src-tauri/Cargo.toml` はネイティブクレートをテストします。Rust の変更後は `cargo fmt --manifest-path src-tauri/Cargo.toml` も実行します。

`npm run preview` を使うと、完成したフロントエンドバンドルを `127.0.0.1:1420` で確認できます。JavaScript/TypeScript のリント/フォーマットスクリプトは現在定義されていません。

Tauri ビルドで `link.exe` が見つからない場合は、Visual Studio C++ ビルド環境を読み込んだ端末で実行してください。

## アーキテクチャ

| パス | 役割 |
| --- | --- |
| `src/App.tsx` | アプリシェル、ページ状態、サービスの組み合わせ |
| `src/components/editor/` | 遅延ロードする Monaco YAML エディター |
| `src/services/audit/` | DNS と設定の診断 |
| `src/services/backup/` | バックアップ一覧、ポリシー、安定スナップショット |
| `src/services/clash/` | Clash 設定の解析と操作 |
| `src/services/diff/` | 構造化された差分プレビュー |
| `src/services/editor/` | 複数文書のタブ状態 |
| `src/services/groups/` | プロキシグループの生成 |
| `src/services/merge/` | YAML 設定のマージと競合処理 |
| `src/services/yaml/` | YAML 解析、整形、検証、テンプレート |
| `src/services/subscription/` | 購読の解析、更新、選択、出力 |
| `src/services/nodes/` | ノードの正規化、絞り込み、グループ化、出力 |
| `src/services/rules/` | ルール解析、編集、テンプレート、サイトルール |
| `src/services/speedtest/` | 速度テストの既定値、計画、実行 |
| `src/services/config/` | プロバイダーと DNS/fake-IP/TUN の最適化 |
| `src/services/openclash/` | OpenClash 互換性と出力 |
| `src/services/provider_check/` | ユーザー起動のリモートプロバイダー検査 |
| `src/services/desktop/` | ブラウザー/Tauri のファイル/購読ブリッジ |
| `src-tauri/src/` | ネイティブのファイル、バックアップ、購読、エラー処理 |
| `tests/` | Vitest 回帰テストと YAML フィクスチャ |

フロントエンドは既存の `yaml`、`monaco-yaml`、`json-diff-ts`、`lucide-react` を再利用します。Monaco はユーザーが完全版エディターを有効にした後だけ読み込み、大きなエディター/ワーカーのチャンクが初期画面を妨げないようにしています。

## ローカル処理と通信の境界

- ローカル YAML、ノード、購読 URL、ログ、バックアップを自動アップロードしません。
- テレメトリー、分析、自動更新 SDK、CDN のランタイムアセットはありません。
- 通信はユーザーが購読更新、リモートプロバイダー検査、速度テストを開始した場合だけ行います。
- URL は秘密を含む可能性があります。エラーとログから URL、パス、クエリ、ユーザー名、パスワードを除去します。
- ローカルファイルのオープン、整形、検証、監査、編集、保存はオフラインのままです。
- 寛容な分析が部分構造を表示できても、保存前の厳密検証は重複キーを拒否します。

詳細は [`docs/QUICKSTART.md`](docs/QUICKSTART.md)、[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、[`docs/NETWORK_POLICY.md`](docs/NETWORK_POLICY.md)、[`docs/OFFLINE_SECURITY.md`](docs/OFFLINE_SECURITY.md)、[`docs/TESTING.md`](docs/TESTING.md)、[`docs/BUILD.md`](docs/BUILD.md) を参照してください。

## 作成者

- HaoXiang Hwang
- [Rays688888@Gmail.com](mailto:Rays688888@Gmail.com)
- [https://nextweb4.github.io/](https://nextweb4.github.io/)

作成者情報はアプリ、パッケージ、Rust、インストーラー、テスト、ワークフローで共有する固定値です。

開発支援は Codex と Claude Code としてクレジットされています。`.github/workflows/creator-identity-lock.yml` は、`README.md` と `AGENTS.md` に固定の作成者情報と両方の支援名があることを確認します。

## プロジェクトの状態と制限

- バージョン 0.2.0 の公開中デスクトップアプリで、同じバージョンの NSIS と中国語 MSI がリポジトリに含まれます。
- アプリの UI は中国語と英語に対応しています。README が 3 言語で用意されていても、日本語 UI が実装済みという意味ではありません。
- 「ローカルファースト」は全機能がオフラインという意味ではありません。購読更新、リモートプロバイダー検査、速度テストは利用者の操作で通信します。
- プロバイダーに到達できても、HTML、ログインページ、空データ、無効な YAML が返る場合があります。接続できただけでは検証成功になりません。
- ルールの順序には意味があります。サイトルールをより広い GEOSITE/GEOIP ルールの後に置くと、構文が正しくても一致しない場合があります。
- `src-tauri/tauri.conf.json` では現在 `app.security.csp` が `null` です。明示的なコンテンツセキュリティポリシーを定義して検証するまでは、リモートコンテンツや新しい実行時オリジンを追加しないでください。
- 現在プロジェクトライセンスがないため、再利用と再配布の法的条件は不明確です。

## コントリビューション

解析と変更処理は対応する `src/services/` ドメイン、表示は React コンポーネント、ネイティブのファイル/通信コマンドは `src-tauri/src/` に保ってください。URL の秘匿化、明示的な通信操作、保存前の厳密検証、バックアップ、`MATCH` の順序、Monaco の遅延ロードを維持します。変更したサービスに対応する Vitest を追加し、`npm run test` と `npm run build` を実行してください。Rust の変更には Cargo のフォーマットとテストも必要です。互換性、ライセンス、セキュリティ、保守状況を監査した置換案がない限り、既存の `yaml`、`monaco-yaml`、`json-diff-ts` を再利用します。

## ライセンス

現在、リポジトリに `LICENSE` はありません。再利用または再配布前に、元の許可と適用範囲を確認してください。依存関係のライセンスは、プロジェクト自体の許諾を代替しません。


