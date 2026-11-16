# 開発・テスト・リリース

## 手元で動かす

前提: Node.js 22.12 以上（24 を推奨）・pnpm 10（`corepack enable`）・Docker（DynamoDB Local）。

```bash
pnpm install
pnpm run docker:up          # DynamoDB Local（ポート 8000）
pnpm run build:storybook    # サンプルの Storybook をビルドする（examples/sample-storybook/storybook-static）
pnpm dev                    # → http://localhost:4100（Storybook は http://localhost:4102 で配る）
```

`pnpm dev` は、vite が http://localhost:4100 で画面を配り（保存するとすぐ反映）、API はポート 4101 で起こした API サーバーへ vite が転送します。Storybook は同じ API サーバーが別のオリジン http://localhost:4102 で配り（転送しない）、橋渡しは `dev:bridge` が保存のたびにビルドし直します（反映は Storybook の画面を読み直したとき）。
画面をビルドして 1 つのサーバーで配るときは `pnpm run serve`（2 回目からは `pnpm run local`）です。

- 手元の設定は `.env` です。無ければ起動のときに `.env.example` から作ります（`pnpm run config:local`）
- 並べる Storybook は設定ファイル（`REVIEW_CANVAS_CONFIG`。既定はこのリポジトリの `review-canvas.config.json`）から読みます。別のリポジトリの Storybook を並べるときは `review-canvas dev --config ../my-app/review-canvas.config.json`（ブランチ・コミットはそのリポジトリの git から読む）
- Storybook は、デプロイ先と同じく画面と別のオリジン（`http://localhost:4102`）で配ります。ストーリーのコードを画面（ログインのトークンを持つ側）と同じオリジンで動かさないためです。画面と Storybook は、配るときに `iframe.html` へ差し込む橋渡し（`review-canvas-bridge.js`。`pnpm run build:bridge` で `dist-bridge/` にできる。`local`・`serve` はビルドしてから起こす）と `postMessage` だけでやり取りします（[security.md](security.md#storybook-との橋渡しsrcfeaturesreviewbridge)）
- 橋渡しが受け付ける画面のオリジンは `CANVAS_ORIGINS`（カンマ区切り。既定は `http://localhost:4100,http://127.0.0.1:4100`）です。`PORT` で画面を別のポートで配るときは合わせてください
- 2 回目からは `pnpm run local`（画面のビルドを省く）で起動できます
- コメントのテーブル（`ReviewCanvasComment`）が無ければ、起動時に作ります。中身を空にしたいときは `pnpm run db:refresh`
- Storybook のビルドが無いページは、画面にビルドの手順を出します（ほかのページは使えます）。Storybook を直したら `pnpm run build:storybook` をやり直し、ブラウザを開き直してください
- 手元では擬似ログインです。最初に名前を入れると、その名前（利用者 ID は `dev|<名前>`）でコメントを書けます。署名の無いトークンなので、API は `STAGE_NAME=LOCAL` かつ `AUTH_MODE=dev`（`.env`）のときだけ受け付けます。ツールバーの「ログアウト」で名前を入れ直せます（別のタブで名前を変えると、開いているタブも合わせて切り替わります）。API が 401 を返したとき（ログインの期限切れ）は、画面に「ログインし直す」を出します
- サーバーは自分の端末（`127.0.0.1`）だけで待ち受けます（擬似ログインは誰でも名乗れるため）
- 手元で Auth0 のトークンを確かめたいときは、`.env` の `AUTH_MODE` を `auth0` にし、`AUTH0_ISSUER`・`AUTH0_AUDIENCE` を入れてください（画面の擬似ログインのトークンは通らなくなります）
- 手元では、起動したときの Git の状態（`git rev-parse`）のブランチ・コミットに、手元のビルド結果を 1 件置いてあるものとして扱います（`/sb/<id>/`）。別のブランチとして書きたいときは `.env` の `REVIEW_BRANCH`・`REVIEW_COMMIT` で上書きできます。ほかのブランチはコメントだけ読めます（「ビルドなし」）

## つくり

```
review-canvas/
├── api/                      # API（Hono・zod-openapi。domain / use-case / infrastructure / presenter / di-container / handler の層分け）
│   ├── domain/               # Comment（ドメインモデル）・リポジトリの契約・PublishedStorybooks（置いてあるブランチ）
│   ├── use-case/             # 一覧・作成・返信・編集・解決/再開・削除・ブランチ一覧・メタ情報
│   ├── infrastructure/       # DynamoDB のリポジトリ・置いてあるブランチ（手元は Git とビルド結果、デプロイ先は S3 の目録）・設定ファイル（config/）
│   ├── presenter/ util/      # エラーレスポンス・日時・テスト用の道具
│   ├── di-container/         # inversify の登録
│   └── handler/api/          # ルート・entrypoint/{local,lambda,cli}
├── src/                      # 画面（React）
│   ├── features/review/      # model（座標・配置・スレッド・Markdown など純粋な処理）・components・hooks・pages・bridge（Storybook との橋渡し）
│   ├── support/ utils/
│   └── generated/            # openapi.json から作る API の型（生成物・コミットしない）
├── infra/                    # CDK（コンストラクト ReviewCanvas・そのまま出すアプリ）と、ブランチの Storybook を置くスクリプト（scripts/）
├── examples/sample-storybook # 架空のショップのサンプル Storybook（React + Vite・play 関数・msw）
├── bin/                      # CLI（review-canvas.mjs）
├── .github/workflows/        # ci.yml（このリポジトリの CI）・publish.yml（使う側から呼ぶ再利用ワークフロー）
├── review-canvas.config.json # サンプルの設定（並べる Storybook）。review-canvas.config.schema.json は生成物
└── openapi.json              # API の契約（生成物）
```

## 検証

```bash
pnpm run validate          # eslint・prettier・tsc（API・画面・設定）・cspell・設定の JSON Schema が最新か
pnpm run test              # API と画面の small・medium テスト（medium は DynamoDB Local を使う。先に docker:up）
pnpm run openapi:check     # openapi.json が API のコードと合っているか
pnpm run infra:validate    # infra の tsc・prettier・eslint
pnpm run infra:test        # infra のテスト（スタックの形・置くスクリプト・配信の関数）
pnpm --dir examples/sample-storybook run validate
```

- API を変えたら `pnpm run openapi:generate` で `openapi.json` を作り直します（画面の型 `src/generated/` は `codegen` で作る。どちらも手で直さない）
- 設定ファイルの形（`api/infrastructure/config/review-canvas-config.ts`）を変えたら `pnpm run config:schema` で `review-canvas.config.schema.json` を作り直します
- テストの名前は `*.small.test.ts`（外につながない）・`*.medium.test.ts`（DynamoDB Local を使う）です
- CDK の組み立て（Lambda のバンドルを含む）は、架空の値で確かめられます: `REVIEW_CANVAS_AUTH0_DOMAIN=tenant.example.com REVIEW_CANVAS_AUTH0_CLIENT_ID=dummy REVIEW_CANVAS_AUTH0_AUDIENCE=https://review-canvas.example.com/api pnpm run synth --quiet`
- コミットの前後に lefthook が prettier・eslint（pre-commit）、tsc・openapi・cspell（pre-push）を動かします

## リリースと互換性

npm には出しません。使う側は、このリポジトリのコミット（40 桁の SHA）を指して使います（ワークフローの `uses: ...@<SHA>` と `review_canvas_ref`、CLI・CDK は取り出したコミット）。

- 互換を崩す変更（設定ファイルの形・ワークフローの入力・スタックの出力の名前・論理 ID・API の形・S3 の置き場の形・DynamoDB の項目）は、できるだけ避け、避けられないときは README と該当の docs に「移し方」を書いてから入れます
- スタックの論理 ID は変えません（`ReviewCanvasStack` はコンストラクト `ReviewCanvas` を id `Default` で置き、以前の論理 ID を保つ）。変えるとテーブル・バケットが作り直されます
- コメントの `source` は文字列で持ちます。設定から外した id のコメントも読め、画面には id をそのまま名前として出します
- 置き場の目録（`meta.json`）は `version: 1` です。形を変えるときは version を上げ、古い目録も読めるようにします
- 依存は `pnpm-workspace.yaml` の `minimumReleaseAge`（出てから 3 週間）を待ってから上げ、`save-exact` で固定します
