# AGENTS.md

AI のコーディングエージェント向けの、このリポジトリでの約束です（人向けの説明は README.md と docs/）。

## このリポジトリ

Storybook の画面をキャンバスに並べてコメントするレビュー用のアプリです。1 つのリポジトリに次を持ちます。

- `api/` — API（Hono・zod-openapi・inversify。domain / use-case / infrastructure / presenter / di-container / handler の層分け。import の向きは eslint が確かめる）
- `src/` — 画面（React・vite・Tailwind CSS）。`src/features/review/bridge/` は Storybook の iframe に差し込む橋渡し
- `infra/` — CDK（コンストラクト `ReviewCanvas`・そのまま出すアプリ）と、ブランチの Storybook を置くスクリプト
- `bin/` — CLI（`review-canvas.mjs`）と、AI がコメントを読んで返すための MCP サーバー（`review-canvas-mcp.mjs`。依存を持たない JavaScript。docs/ai.md）
- `.claude/skills/fix-review-comments/` — 使う側で AI がコメントを直して返すためのスキル。`llms.txt` は AI 向けの文書の入口
- `examples/sample-storybook/` — 架空のショップのサンプル Storybook（手元で動かすときに並べる）
- `.github/workflows/publish.yml` — 使う側のリポジトリから呼ぶ再利用ワークフロー

## 守ること

- 生成物を手で直さない: `openapi.json`（`pnpm run openapi:generate`）・`src/generated/`（`pnpm run codegen`）・`review-canvas.config.schema.json`（`pnpm run config:schema`）
- 設定ファイルの形は `api/infrastructure/config/review-canvas-config.ts`（zod）が正。API・CDK・置くスクリプトはここから読む
- 使う側に固有の値（組織・リポジトリ・AWS アカウント・Auth0 のテナント・メールのドメイン）を既定値としてコードに書かない。CDK のコンテキスト・環境変数・設定ファイルから受ける
- 例に使う名前・ドメインは架空のもの（`example.com`・`example.co.jp`・山田 太郎・サンプルのショップ）にする
- ワークフローの Action はコミットの SHA で固定する。資格情報（`id-token: write`）は AWS を使うジョブにだけ付け、そのジョブで信頼しないブランチのコードを動かさない
- スタックの論理 ID・出力の名前・ワークフローの入力・S3 の置き場の形・コメントの項目は、使う側が頼っているので崩さない（docs/development.md「リリースと互換性」）
- 文書（`docs/` など）を足した・消した・名前を変えたときは、README の「ドキュメント」の表と `llms.txt` の両方を直す
- コミットのメッセージは日本語で短く 1 行。箇条書き・AI の署名（Co-Authored-By 等）は付けない（lefthook が止める）

## 確かめる

```bash
pnpm install
pnpm run validate        # eslint・prettier・tsc・cspell・JSON Schema
pnpm run docker:up       # medium テストの DynamoDB Local
pnpm run test
pnpm run openapi:check
pnpm run infra:validate && pnpm run infra:test
pnpm run build && pnpm run build:bridge && pnpm run build:deployed && pnpm run check:deployed-bundle
```

CDK の組み立ては架空の値で確かめます（docs/development.md「検証」）。AWS へ出す・置くのは人が決めます。
