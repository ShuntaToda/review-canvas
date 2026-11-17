# つくりと決まり

コードを足すときに「どこに何を置くか」と、それを確かめている道具をまとめます。決まりは、できるだけ上の層で縛ります。

1. **構造** — 置き場・型・生成物で、そもそも書けないようにする
2. **静的な検査** — lint・型・テスト・CI
3. **実行時の確かめ** — 起動時の例外・条件付きの書き込み
4. **文章** — この文書・[AGENTS.md](../AGENTS.md)・コードのコメント
5. **人のレビュー**

道具で縛れる決まりは、文章やコメントで書かずに道具へ移します（足し方は [development.md](development.md#道具で縛る決まりを足す)）。コメントに書くのは「なぜ・出典・外の制約」だけです。

## API（`api/`）の層

import の向きは外から内への一方向です（handler → di-container → infrastructure → use-case → domain）。

| 層                | 置くもの                                                                                            | やってはいけないこと（縛っている道具）                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/model/`   | ドメインモデル（`Comment`）・リポジトリの契約（型）・domain のエラー                                | npm パッケージ・`node:*` の import（`local/no-external-imports`）。今の時刻・乱数を直に取る（`local/no-ambient-time-or-random`）。素の `Error` を投げる（`local/app-error`） |
| `domain/support/` | 外の世界の契約（`FetchNow`・`GenerateId`・`Logger`・`PublishedStorybooks` など）と、その `dummy.ts` | 同上                                                                                                                                                                         |
| `use-case/`       | 1 ファイル 1 ユースケース（`<名前>-use-case.ts`）。要るものは props で受ける                        | 同上。クラスの名前・数・`execute`（`local/use-case-shape`）。infrastructure・handler の import（`import/no-restricted-paths`）                                               |
| `infrastructure/` | 契約の実装（DynamoDB・S3・Auth0・git・設定ファイル）。保存の形と domain の変換                      | handler・di-container の import（`import/no-restricted-paths`）。`process.env` を読む（`no-restricted-properties`。値は引数で受ける）                                        |
| `presenter/`      | エラーを HTTP の応答（ステータス・名前）へ変える                                                    | npm パッケージの import（`local/no-external-imports`）                                                                                                                       |
| `di-container/`   | inversify の登録（`service-id.ts` の ID・`register-container.ts`）。環境変数を読む                  | 登録漏れ・ID のずれ（`api/architecture.small.test.ts`）                                                                                                                      |
| `handler/api/`    | ルート（`route/<名前>/`）・ミドルウェア・入口（`entrypoint/{local,lambda,cli}`）                    | ルートのファイルの形（`local/handler-shape`）。OpenAPI に載らないルート・認証を通らないルート・テストの無いルート（`api/architecture.small.test.ts`）                        |
| `util/`           | 層をまたぐ小さな道具（日時・エラーの基底）。`testing-util/` はテスト専用                            | di-container・handler・infrastructure・use-case の import（`import/no-restricted-paths`）                                                                                    |

npm パッケージを import してよい場所は `eslint.config.mjs` の `packageBoundaries` にあります（AWS SDK は infrastructure・di-container・入口、hono は handler、zod は handler と infrastructure、など）。

### エラー

- 投げるのは `AppError`（`api/util/error-util.ts`）の派生だけです。ステータスは presenter が親のクラスから決めます（`InvalidError`=400・`AuthenticationError`=401・`ForbiddenError`=403・`NotFoundError`=404・`ConflictError`=409）
- domain に固有のエラーは `api/domain/model/<名前>/<名前>-errors.ts` に置き、`override name = "<クラス名>"` を書きます（API の応答の `error` になる）
- 起動時の設定の誤り（infrastructure・di-container）は素の `Error` で落とします（利用者には返さない）

### テスト

- `<対象>.small.test.ts`: 外につながない（リポジトリは `vi.fn()` か dummy）。`pnpm run test:small` で Docker なしに回せます
- `<対象>.medium.test.ts`: DynamoDB Local を使う（`api/util/testing-util/dynamodb.ts`。small からは import できない）
- ハンドラのテストは `describe("<メソッド> <パス>")` で始めます（つくりのテストが、ルートごとのテストの有無をこの題で確かめる）
- カバレッジの下限は層ごとに `vitest.config.ts` の `thresholds` にあります（`pnpm run test:coverage`）

## 画面（`src/`）

| 置き場                          | 置くもの                                                               | やってはいけないこと（縛っている道具）                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `features/<名前>/model/`        | 純粋な処理（座標・配置・絞り込み・書き出し）。kebab-case の .ts        | ほかの feature の中を読む（`import/no-restricted-paths`・`no-restricted-imports`。入口は `index.ts`）                            |
| `features/<名前>/api/`          | API の呼び出し（`apiClient` を包む）                                   | `fetch` を直に呼ぶ（`no-restricted-globals`。`src/support/api` を通す）                                                          |
| `features/<名前>/hooks/`        | `useXxx.ts`（読み込み・状態）                                          | `use` で始まらないファイル名（`check-file/filename-naming-convention`）                                                          |
| `features/<名前>/components/`   | コンポーネント（`PascalCase.tsx`）                                     | `localStorage` を直に使う（`no-restricted-globals`。`src/support/storage` を通す）                                               |
| `features/<名前>/pages/`        | ページ（`PascalCase.tsx`）                                             | 同上                                                                                                                             |
| `support/`・`utils/`・`config/` | feature を知らない共有の部品（API クライアント・ログイン・保存・設定） | feature の import（`import/no-restricted-paths`）。サーバー側のパッケージ・`node:*`・`api/` の import（`no-restricted-imports`） |
| `generated/`                    | `openapi.json` から作る API の型（コミットしない）                     | 手で直す（`pnpm run codegen` が毎回作り直す）                                                                                    |

## API を 1 本足すとき

雛形を作ってから中身を書きます。

```bash
pnpm run new:api <メソッド> <ルートのディレクトリ>/<ハンドラの名前> <ユースケースの名前> [--path <パス>]
# 例: pnpm run new:api get comment/comment-count count-comments --path /count
```

雛形は次を作り・書き足し、`openapi.json` と画面の型を作り直します。作った直後の状態で `validate`・`test` が通ります（CI の scaffold ジョブが確かめる）。

1. `api/use-case/<名前>-use-case.ts` と `.small.test.ts`
2. `api/handler/api/route/<ディレクトリ>/<メソッド>-<名前>-handler.ts` と `.small.test.ts`
3. `api/di-container/service-id.ts`（ID）・`register-container.ts`（登録）・`route/<ディレクトリ>/index.ts`（ルーターへの追加）

そのあとに書くもの:

1. domain に要るもの（モデルのメソッド・リポジトリの契約・エラー）を足し、テストを書く
2. ユースケースの入力・出力・処理を書く。要るもの（リポジトリ・`fetchNow` など）を Props に足し、`register-container.ts` の登録にも足す
3. リポジトリの契約を足したら、`api/infrastructure/repository/` に実装し、medium のテストを書く
4. ハンドラのスキーマ（同じディレクトリの `<名前>-schema.ts`）・パス・応答を書き、`pnpm run openapi:generate`
5. 画面から呼ぶなら `src/features/<名前>/api/` に足す（型は `pnpm run codegen` で `src/generated/` に出る）
6. MCP サーバーから呼ぶなら `bin/review-canvas-mcp.mjs` に足す（パスが `openapi.json` にあることをテストが確かめる）
7. `docs/api.md` の表を直す

## 画面の機能を足すとき

1. 純粋な処理を `src/features/review/model/<名前>.ts` に書き、`.small.test.ts` を書く（DOM・React に頼らない形にする）
2. API を呼ぶなら `src/features/review/api/review-api.ts` に足す
3. 読み込み・状態は `hooks/useXxx.ts`、見た目は `components/Xxx.tsx`（操作のあるものは `.small.test.tsx` を書く）
4. 複数の場所で使う文言は `src/constants/messages.ts` に置く
5. 新しい feature を作るときは `src/features/<名前>/index.ts` を入口にし、ほかからはそこだけを import する
6. デプロイ先のビルドに入れてはいけないもの（擬似ログイン）は、動的 import と MODE の分岐で外す（`pnpm run check:deployed-bundle` が確かめる）

## DynamoDB の項目（コメントの項目）を足すとき

前からあるデータには新しい項目が無いので、「無い」を読める形にします（[development.md](development.md#リリースと互換性)）。

1. `api/domain/model/comment/comment.ts` の `CommentProps` とクラスに足す（値を決めるメソッド・テストも）
2. `api/infrastructure/repository/comment-repository.ts` の `commentDdbItemSchema`（項目は省ける形にする）・`ddbItemToDomain`・`ddbItemFromDomain` に足し、small・medium のテストを書く
3. 応答に出すなら `api/handler/api/route/comment/comment-schema.ts`（`toCommentResponse`）に足し、`pnpm run openapi:generate && pnpm run codegen`
4. 画面・書き出し（`src/features/review/model/export-json.ts`・`markdown.ts`）で使うなら足す（書き出しに入れる項目は挙げたものだけ）
5. `docs/api.md` の「データ」の表を直す
6. キー・TTL を変えるときは `infra/lib/review-canvas.ts` と `api/util/testing-util/dynamodb.ts`・手元のテーブル作成もそろえる（テーブルの論理 ID は変えない）

## 決めたことの記録

なぜこの形にしたかは [adr/](adr/README.md) に置きます。
