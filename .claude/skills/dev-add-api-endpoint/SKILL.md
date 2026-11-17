---
name: dev-add-api-endpoint
description: 【review-canvas 自身の開発用】API のルートを 1 本足す。雛形（pnpm run new:api）でユースケース・ハンドラ・テスト・DI の登録を作り、中身を書いて検査を通す。「API を足して」「エンドポイントを追加して」「ルートを増やして」と言われたときに使う。使う側のリポジトリに写すスキルではない。
---

# API のルートを 1 本足す

review-canvas のリポジトリ自身で、API（`api/`）にルートを足す手順です。置き場と決まりは `docs/architecture.md`「API を 1 本足すとき」、決まりの一覧は `AGENTS.md`「道具で縛っている決まり」にあります。

## 手順

1. 足すものを決める: HTTP メソッド・パス・どのルーター（`api/handler/api/route/` の `comment`・`thread`・`meta`）に置くか・ユースケースの名前（動詞で始める。例 `count-comments`）。API の形（入力・出力・エラー）が決まっていなければ、書く前に人に確かめる
2. 雛形を作る

   ```bash
   pnpm run new:api <メソッド> <ルートのディレクトリ>/<ハンドラの名前> <ユースケースの名前> --path <パス>
   # 例: pnpm run new:api get comment/comment-count count-comments --path /count
   ```

   ユースケース・ハンドラ・それぞれの small テスト・`service-id.ts`・`register-container.ts`・ルーターの `index.ts`・`openapi.json` が、検査を通る形でできる

3. 内側から書く: domain（モデルのメソッド・リポジトリの契約・エラー）→ ユースケース → infrastructure（契約を足したとき）→ ハンドラ（スキーマは同じディレクトリの `<名前>-schema.ts`）。それぞれテストを先に直す
4. ユースケースの Props に足したものは、`register-container.ts` の登録にも足す
5. `pnpm run openapi:generate && pnpm run codegen` で契約と画面の型を作り直す（手で直さない）
6. 画面・MCP サーバーから呼ぶなら、`src/features/review/api/review-api.ts`・`bin/review-canvas-mcp.mjs` に足す
7. `docs/api.md` を直す
8. 確かめる: `pnpm run validate && pnpm run openapi:check && pnpm run test`（medium は先に `pnpm run docker:up`）

## 守ること

- 検査が落ちたら、メッセージのとおりにコードを直す。`eslint-disable`・`any`・ignore で黙らせない
- 今の時刻・ID は `fetchNow`・`generateId` を Props で受ける。環境変数は `register-container.ts` で読む
- 投げるのは `AppError` の派生（404・409 などルートに固有のものは、ハンドラの `responses` にも書く）
- 前からある API の形（項目・パス・エラーの名前）は変えない。変えるときは人に確かめる（`docs/development.md`「リリースと互換性」）
