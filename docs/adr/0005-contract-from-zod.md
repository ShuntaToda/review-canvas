# 0005 API の契約は zod のスキーマを正とし、OpenAPI と画面の型を生成する

## 状況

- 画面（`src/`）と API（`api/`）を 1 つのリポジトリに持つが、画面から API のソースは import しない（別々にビルドする）
- AI・外の道具も API を呼ぶ（MCP サーバー・`GET /api/threads`）

## 決めたこと

- ルートは `createRoute`（`@hono/zod-openapi`）で書き、入力の検証と OpenAPI を同じ zod のスキーマから出す
- `openapi.json` は生成物としてコミットし、API のコードと合っているかを CI が確かめる（`pnpm run openapi:check`）
- 画面の型（`src/generated/`）は `openapi.json` から毎回作り、コミットしない
- 設定ファイルの形も zod（`api/infrastructure/config/review-canvas-config.ts`）を正とし、JSON Schema を生成する

## 結果

- API の形を変えると、画面の型検査が落ちる。`openapi.json` を作り直し忘れると CI が落ちる
- OpenAPI に載らないルートは作れない（`local/handler-shape` と `api/architecture.small.test.ts`）
- 依存を持たない JavaScript の MCP サーバーは型を使えないので、呼ぶパスが `openapi.json` にあることをテストで確かめる
