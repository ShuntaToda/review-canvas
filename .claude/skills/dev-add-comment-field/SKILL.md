---
name: dev-add-comment-field
description: 【review-canvas 自身の開発用】コメント（DynamoDB の ReviewCanvasComment）に項目を足す。domain・保存の形・API の応答・画面と書き出しを、前からのデータを読める形でそろえる。review-canvas のリポジトリで作業していて、「コメントに項目を足して」「ReviewCanvasComment に属性を追加して」と言われたときにだけ使う。ほかのテーブル・ほかのリポジトリには使わない。使う側のリポジトリに写すスキルではない。
---

# コメントの項目を足す

review-canvas のリポジトリ自身で、コメントに項目を足す手順です。順番は `docs/architecture.md`「DynamoDB の項目（コメントの項目）を足すとき」、今の項目は `docs/api.md`「データ」にあります。

## 先に確かめること

- 前からあるデータには、その項目が無い。「無い」をどう読むか（null・既定値）を決める。決まっていなければ人に確かめる
- 持っている項目から決められる値は、保存しない（スレッドの状態は `resolved` と `aiFixedAt` から決めている。`docs/adr/0004-derive-thread-status.md`）
- 利用者 ID・メールアドレスなど、人を指す値を応答・書き出しに出すかは、人に確かめる

## 手順

1. `api/domain/model/comment/comment.ts`: `CommentProps`・クラスの項目・値を決めるメソッド（`create`・更新のメソッド）。`comment.small.test.ts` と `comment.dummy.ts` を直す
2. `api/infrastructure/repository/comment-repository.ts`: `commentDdbItemSchema`（省ける項目にする）・`ddbItemToDomain`（無いときの値）・`ddbItemFromDomain`。更新で書くなら、その更新の式と条件にも足す。small と medium のテストに「項目の無い前からのデータを読める」例を足す
3. 応答に出すなら `api/handler/api/route/comment/comment-schema.ts`（スキーマと `toCommentResponse`）→ `pnpm run openapi:generate && pnpm run codegen`
4. 画面で使うなら `src/features/review/` の model・components。書き出しに入れるなら `model/export-json.ts`・`model/markdown.ts`（入れる項目は挙げたものだけ）
5. MCP サーバー（`bin/review-canvas-mcp.mjs`）が返す形に入れるかを決める
6. `docs/api.md` の「データ」の表と、応答の説明を直す
7. 確かめる: `pnpm run docker:up && pnpm run validate && pnpm run openapi:check && pnpm run test`（応答を変えたら、コミットに `openapi.json` も入れる）

## 守ること

- 前からある項目の名前・意味・型は変えない（使う側のデータが読めなくなる）
- キー・TTL・テーブルの論理 ID は変えない。変える必要があるなら、手を止めて人に確かめる
- 検査が落ちたら、メッセージのとおりにコードを直す。黙らせない
