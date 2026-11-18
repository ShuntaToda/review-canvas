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

- 手元の設定は `.env` です。無ければ起動のときに `.env.example` から作ります（`pnpm run config:local`）。DynamoDB Local へつなぐ値（`AWS_ENDPOINT_URL_DYNAMODB`・`AWS_REGION`・`AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY`）は、シェルに AWS の資格情報があっても `.env` の値を使います（`AWS_SESSION_TOKEN`・`AWS_PROFILE` は外す）
- 並べる Storybook は設定ファイル（`REVIEW_CANVAS_CONFIG`。既定はこのリポジトリの `review-canvas.config.json`）から読みます。別のリポジトリの Storybook を並べるときは `review-canvas dev --config ../my-app/review-canvas.config.json`（ブランチ・コミットはそのリポジトリの git から読む）
- Storybook は、デプロイ先と同じく画面と別のオリジン（`http://localhost:4102`）で配ります。ストーリーのコードを画面（ログインのトークンを持つ側）と同じオリジンで動かさないためです。画面と Storybook は、配るときに `iframe.html` へ差し込む橋渡し（`review-canvas-bridge.js`。`pnpm run build:bridge` で `dist-bridge/` にできる。`local`・`serve` はビルドしてから起こす）と `postMessage` だけでやり取りします（[security.md](security.md#storybook-との橋渡しsrcfeaturesreviewbridge)）
- 橋渡しが受け付ける画面のオリジンは `CANVAS_ORIGINS`（カンマ区切り。既定は `http://localhost:4100,http://127.0.0.1:4100`）です。`PORT` で画面を別のポートで配るときは合わせてください
- 2 回目からは `pnpm run local`（画面のビルドを省く）で起動できます
- コメントのテーブル（`ReviewCanvasComment`）が無ければ、起動時に作ります。中身を空にしたいときは `pnpm run db:refresh`
- Storybook のビルドが無いページは、画面にビルドの手順を出します（ほかのページは使えます）。Storybook を直したら `pnpm run build:storybook` をやり直し、ブラウザを開き直してください
- 手元では擬似ログインです。最初に名前を入れると、その名前（利用者 ID は `dev|<名前>`）でコメントを書けます。署名の無いトークンなので、API は `STAGE_NAME=LOCAL` かつ `AUTH_MODE=dev`（`.env`）のときだけ受け付けます。ツールバーの「ログアウト」で名前を入れ直せます（別のタブで名前を変えると、開いているタブも合わせて切り替わります）。API が 401 を返したとき（ログインの期限切れ）は、画面に「ログインし直す」を出します
- サーバーは自分の端末（`127.0.0.1`）だけで待ち受けます（擬似ログインは誰でも名乗れるため）
- 手元で Auth0 のトークンを確かめたいときは、`.env` の `AUTH_MODE` を `auth0` にし、`AUTH0_ISSUER`・`AUTH0_AUDIENCE` を入れてください（画面の擬似ログインのトークンは通らなくなります）
- 手元では、起動したときの Git の状態（`git rev-parse`）のブランチ・コミットに、手元のビルド結果を 1 件置いてあるものとして扱います（`/sb/<id>/`）。別のブランチとして書きたいときは `.env` の `REVIEW_BRANCH`・`REVIEW_COMMIT` で上書きできます。ほかのブランチはコメントだけ読めます（ブランチの一覧に「（コメントのみ）」と出る）

## つくり

層ごとの責務・置き場・足すときの順番は [architecture.md](architecture.md)、決めたことの記録は [adr/](adr/README.md) にあります。

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
├── bin/                      # CLI（review-canvas.mjs）・MCP サーバー（review-canvas-mcp.mjs）
├── eslint-rules/             # このリポジトリだけの ESLint ルール（層ごとのファイルの形など）
├── scripts/                  # 開発用のスクリプト（new-api.mjs: API の雛形）・リポジトリの決まりのテスト
├── .claude/                  # Claude Code の hook・スキル・レビュー用のサブエージェント
├── .github/workflows/        # ci.yml（このリポジトリの CI）・publish.yml（使う側から呼ぶ再利用ワークフロー）
├── review-canvas.config.json # サンプルの設定（並べる Storybook）。review-canvas.config.schema.json は生成物
└── openapi.json              # API の契約（生成物）
```

## 検証

```bash
pnpm run validate          # eslint・prettier・tsc（API・画面・設定）・cspell・knip・設定の JSON Schema が最新か
pnpm run test              # API・画面・道具の small・medium テスト（medium は DynamoDB Local を使う。先に docker:up）
pnpm run test:small        # small だけ（Docker なし）
pnpm run test:structure    # つくりの決まりのテストと、自前の lint ルール・雛形・hook のテストだけ（数秒）
pnpm run test:coverage     # すべてのテストと、層ごとのカバレッジの下限（CI はこれを動かす）
pnpm run openapi:check     # openapi.json が API のコードと合っているか（手元のファイルと比べる。コミットの前でも確かめられる）
pnpm run infra:validate    # infra の tsc・prettier・eslint
pnpm run infra:test        # infra のテスト（スタックの形・置くスクリプト・配信の関数）
pnpm --dir examples/sample-storybook run validate
```

- API を変えたら `pnpm run openapi:generate` で `openapi.json` を作り直します（画面の型 `src/generated/` は `codegen` で作る。どちらも手で直さない）
- 設定ファイルの形（`api/infrastructure/config/review-canvas-config.ts`）を変えたら `pnpm run config:schema` で `review-canvas.config.schema.json` を作り直します
- テストの名前は `*.small.test.ts`（外につながない）・`*.medium.test.ts`（DynamoDB Local を使う）です
- CDK の組み立て（Lambda のバンドルを含む）は、架空の値で確かめられます: `REVIEW_CANVAS_AUTH0_DOMAIN=tenant.example.com REVIEW_CANVAS_AUTH0_CLIENT_ID=dummy REVIEW_CANVAS_AUTH0_AUDIENCE=https://review-canvas.example.com/api pnpm run synth --quiet`
- 使う側の CDK アプリに組み込んだ形は、CI の「Synth embedded」が `infra/test/embedded-app.ts` を infra の外から動かして確かめます
- ワークフロー（`.github/workflows/`）は CI の actionlint で確かめます。手元では `actionlint` をそのまま動かします（`shellcheck` が PATH に無いと run のシェルを確かめずに通るので、先に入れておく）
- コミットの前後に lefthook が prettier・eslint（pre-commit）、メッセージが 1 行で AI の署名が無いこと（commit-msg）、tsc・openapi・cspell・つくりのテスト・knip（pre-push）を確かめます
- コミットメッセージの決まりは `scripts/check-commit-message.mjs` にあり、CI のジョブ commit-messages が PR のコミットの範囲にも同じものをかけます（`--no-verify`・GitHub の画面で作ったコミットも見る）。マージコミットは見ません（「Update branch」などで GitHub が作り、文面を選べない）。`git revert` が付ける本文（`This reverts commit …`。件名が `Revert "`・`Reapply "` で始まるもの）だけは 1 行の例外として認めます（戻したコミットを指す決まった形のため）。手元（commit-msg）では、エディタに出る git の案内（`#` だけの行と、`#` の後ろが空白（スペース・タブ）の行。`# On branch …`・`#<TAB>modified: …`・`# Conflicts:`）と、`git commit -v` の切り取り線から後ろを除いてから数えます（コメントの文字を `core.commentChar` で変えていれば、その文字で見る）。`-m "# 本文"` のように案内と同じ形で付けた本文は手元では見分けられないので、CI が見つけます。PR をまとめてマージするときのメッセージは、人が 1 行に直します
- API を 1 本足すときは `pnpm run new:api`（[architecture.md](architecture.md#api-を-1-本足すとき)）。CI の scaffold ジョブが、雛形で作った直後の状態で `validate` と `test:small` を通します

## 道具で縛っている仕組みと理由

決まりは、文章より道具で縛ります（[adr/0007](adr/0007-enforce-by-tools.md)）。決まりの一覧と違反のメッセージは [AGENTS.md](../AGENTS.md#道具で縛っている決まり)、層ごとの置き場は [architecture.md](architecture.md) にあります。ここには、入れている仕組みごとの「防ぐもの」と「引き受けているもの」を残します。

| 仕組み                                                                                                                                                   | 防ぐもの                                                                                                                                                                                                                                                                                   | 引き受けているもの（遅さ・誤検出・保守）                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 自前の ESLint ルール（`eslint-rules/`。ユースケース・ハンドラの形、ルートとミドルウェアの足し方、エラーの形、時刻と乱数、外部 import、パッケージの境界） | 層ごとの決まりからの外れ。既存のプラグインでは書けない・メッセージに直し方を書けないもの                                                                                                                                                                                                   | ルールとテストを自分で保つ（8 本・RuleTester のテスト付き）。エラーと日時の整形は型情報でも見る（型を使う lint はもともと有効なので、時間はほぼ変わらない。テストは `eslint-rules/fixtures/` の tsconfig で型を作る） |
| `import/no-cycle`                                                                                                                                        | 層の向きの決まりをすり抜ける相互依存・読み込み順の不具合                                                                                                                                                                                                                                   | eslint が数秒伸びる（import 先を読む）                                                                                                                                                                                |
| `check-file`（ファイル名・ディレクトリ名・テストの名前）                                                                                                 | 名前のゆれ。つくりのテスト・雛形が名前から対応を探すので、ゆれると検査が効かなくなる                                                                                                                                                                                                       | 入口（`src/main.tsx`）とモードの設定（`src/config.test.ts`）の 2 つを対象から外している                                                                                                                               |
| `eslint-comments`・`reportUnusedDisableDirectives`                                                                                                       | 理由の無い disable・直したあとに残った disable・構造を守るルール（`local/*`・層の向き・循環・`no-restricted-*`・`check-file/*`）の disable・コメントでの設定の変更（`/* eslint ルール: "off" */`・`/* global */`・範囲やファイルの `/* eslint-disable */`。使えるのは 1 行だけの disable） | メッセージは英語（プラグインのもの。hook が直し方を添える）。構造のルールの例外は、コメントではなく `eslint.config.mjs` の対象・`ignores` に理由つきで書く                                                            |
| `no-restricted-*`（`process.env`・`console`・`fetch`・`localStorage`・サーバー側のパッケージ）                                                           | 設定・出力・通信・保存の出入口が散らばること                                                                                                                                                                                                                                               | 出入口を足すときは `eslint.config.mjs` の許す場所を直す                                                                                                                                                               |
| `switch-exhaustiveness-check`・`consistent-type-imports`・`no-non-null-assertion`・`no-param-reassign`                                                   | case の書き忘れ・型だけの import による循環・`!` で隠した undefined                                                                                                                                                                                                                        | `!` はテストでは許している                                                                                                                                                                                            |
| つくりのテスト（`api/architecture.small.test.ts`）                                                                                                       | DI の登録漏れ・ルーターへの足し忘れ・認証を通らないルート・テストの無いユースケースとルート・OpenAPI に載らないルート（アプリに登録されたルートと 1 対 1 で比べる）                                                                                                                        | ファイル名と `describe` の題の決まりに頼る（題を変えると落ちる）                                                                                                                                                      |
| 契約のテスト（`bin/review-canvas-mcp-contract.small.test.mjs`）・`openapi:check`・`validate:schema`                                                      | API・設定の形と、それを使う側（画面・MCP・JSON Schema）のずれ                                                                                                                                                                                                                              | MCP は正規表現で呼び出しを読む（`call("GET", …)` の形を変えたらテストも直す）                                                                                                                                         |
| リポジトリの決まりのテスト（`scripts/repo-rules.small.test.mjs`）                                                                                        | タグで指した Action・範囲で書いた依存・一覧に載っていない文書                                                                                                                                                                                                                              | なし（1 秒かからない）                                                                                                                                                                                                |
| `knip`                                                                                                                                                   | 使われない export・ファイル・依存が残ること（AI は消し忘れやすい）                                                                                                                                                                                                                         | 2 秒ほど。動的に読むもの・CLI として動かす依存は `knip.jsonc` に理由つきで書く                                                                                                                                        |
| tsconfig（`@tsconfig/strictest`。infra は添字の確認まで）                                                                                                | undefined の見落とし・省いたプロパティと undefined の混同                                                                                                                                                                                                                                  | infra は `exactOptionalPropertyTypes` を入れていない（aws-cdk-lib の型どうしが合わなくなる）                                                                                                                          |
| カバレッジの下限（層ごと）                                                                                                                               | テストの無い domain・use-case・infrastructure・presenter・handler・画面の model と support が増えること                                                                                                                                                                                    | テストに 2〜3 秒足す。下限は今の値の少し下で、上げ下げは `vitest.config.ts`                                                                                                                                           |
| 雛形（`pnpm run new:api`）と CI の scaffold ジョブ                                                                                                       | 足すときの書き漏れ（ID・登録・ルーター・テスト・OpenAPI）。雛形そのものが決まりからずれること                                                                                                                                                                                              | CI が 1 ジョブ増える。`register-container.ts`・ルーターの形を変えたら雛形も直す                                                                                                                                       |
| Claude Code の hook（`.claude/hooks/`）                                                                                                                  | AI が違反に気づくのが遅れること（編集の直後に返す）。Bash で書き換えたファイルは、手を止める前にまとめて確かめる                                                                                                                                                                           | 編集 1 回に 4〜6 秒（型を使う lint）。手を止める前は数秒〜数十秒（変えたファイルの数による。変更したファイルの eslint・prettier と、変更のあるパッケージの tsc）                                                      |
| lefthook（pre-commit・commit-msg・pre-push）                                                                                                             | CI まで行ってから落ちること                                                                                                                                                                                                                                                                | push の前に数十秒                                                                                                                                                                                                     |

入れていないもの:

| 候補                                                           | 入れていない理由                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dependency-cruiser                                             | 層の向き・循環は eslint（`import/no-restricted-paths`・`import/no-cycle`）で足りている。同じ決まりを 2 つの道具に書くと、片方だけ直す事故が起きる                                                                                             |
| ブランチ名・コメント ID の branded type                        | リポジトリ・ユースケースの引数はすべて名前付き（`{ branch, commentId }`）で、取り違えは起きにくい。入れるとテストの値 260 か所ほどに変換が要り、zod の brand は domain に持ち込めない（外部 import の禁止）ので境界ごとに変換を書くことになる |
| infra の `exactOptionalPropertyTypes`                          | aws-cdk-lib の型どうし（`Bucket` と `IBucket` など）が合わなくなる                                                                                                                                                                            |
| `@typescript-eslint/no-unnecessary-condition`                  | 橋渡し・要素の手がかりの処理が、型の上では起きない DOM の値を実行時に確かめている（9 か所）。型を信じて消すと守りが減る                                                                                                                       |
| `consistent-type-assertions`（オブジェクトへの `as` を禁じる） | テストの偽物づくりで使っており、得るものが小さい                                                                                                                                                                                              |
| ハンドラ 1 つにテストファイル 1 つ                             | 同じルーターのテストをまとめて書いている所がある。代わりに、ルートごとに `describe("<メソッド> <パス>")` があることを確かめている                                                                                                             |
| ファイルの行数・複雑さの上限                                   | 今のコードが越えており、分け方は機械では決められない                                                                                                                                                                                          |

### Claude Code の hook

`.claude/settings.json` の hook は、次の 2 つです（中身は `.claude/hooks/`）。

- 編集のたび（`Edit`・`Write`・`MultiEdit`）: 編集したファイルに eslint と prettier（長い出力は eslint の分だけを切り、直し方の案内は必ず付ける）。Bash で書き換えたファイル（`sed`・生成コマンド）はここを通らないので、対象を広げずに、次の hook と pre-commit で見つけます（Bash のたびに動かすと、読むだけのコマンドでも数秒かかる）
- 手を止める前（`Stop`）: まだコミットしていない変更のファイルに eslint と prettier、変更のあるパッケージに tsc（api・画面・infra・vite と vitest の設定）

hook はリポジトリのコード（`.claude/hooks/`・`eslint.config.mjs`・`node_modules/.bin`）を、開いた人の権限で動かします。信頼しないブランチ（外から来た PR など）を手元で開くときは、`.claude/settings.local.json` に `{ "disableAllHooks": true }` を置いて止めてください。

## 道具で縛る決まりを足す

決まりを足す・変えるときは、次の順で考えます（上で済むなら下は足さない）。

道具で守る相手は「AI が自然に書いてしまう形」です。頼まれた機能を素直に書いたら決まりから外れていた、という形（ヘルスチェックをミドルウェアで返す・`router.get` でルートを足す・`new Date()` を直に呼ぶ）は、道具で落とします。わざと検査を外す書き方（`as unknown as X` の二重のアサーション・`eval`・`Reflect` や文字列の連結での難読化）は、安く塞げるものだけ塞ぎ（二重のアサーション・グローバルの別名・型のアサーションでの包みは lint が落とす）、残りは 5 段目の人のレビューとレビュー役（`.claude/agents/architecture-reviewer.md` の「黙らせ方」）が見ます。抜け道を 1 つ塞ぐたびに「もう 1 段ずらした抜け道」は出るので、ずらすのに手間が要る書き方まで道具で追いかけません。

1. **構造で防げないか**: 置き場・型・生成物・雛形で、そもそも書けない形にする
2. **既存の lint ルールで書けないか**: `eslint.config.mjs` に足す。`no-restricted-imports`・`no-restricted-globals`・`no-restricted-properties`・`check-file` は `message`・`errorMessage` に直し方を書ける
3. **1 ファイルの中で分かる決まり**なら、自前の ESLint ルール（`eslint-rules/rules/<名前>.mjs`）にする
4. **ファイルどうしの対応**（A があれば B もある）なら、つくりのテスト（`api/architecture.small.test.ts`・`scripts/repo-rules.small.test.mjs`）に足す

足すときに守ること:

- メッセージは日本語で、「何が決まりか・どう直すか・どこへ置くか」を書く（AI がメッセージだけで直せるように）。テストは題に直し方を書く
- 自前のルールには RuleTester のテスト（`<名前>.small.test.mjs`。通る例と落ちる例）を書き、`eslint-rules/index.mjs` に登録する
- 今のコードに違反があれば、例外を足さずにコードを直す。直せない例外は、設定の `ignores` に理由のコメントを付けて 1 つずつ書く
- わざと違反を入れて、落ちること・メッセージで直せることを確かめる
- [AGENTS.md](../AGENTS.md#道具で縛っている決まり) の表に 1 行足し、上の「[道具で縛っている仕組みと理由](#道具で縛っている仕組みと理由)」に防ぐものと引き受けるものを書く
- `pnpm run validate` の時間を前後で測る（キャッシュなしで 1 分を大きく越えるなら、対象を絞る）

## リリースと互換性

npm には出しません。使う側は、このリポジトリのコミット（40 桁の SHA）を指して使います（ワークフローの `uses: ...@<SHA>` と `review_canvas_ref`、CLI・CDK は取り出したコミット）。

- 互換を崩す変更（設定ファイルの形・ワークフローの入力・スタックの出力の名前・論理 ID・API の形・S3 の置き場の形・DynamoDB の項目）は、できるだけ避け、避けられないときは README と該当の docs に「移し方」を書いてから入れます
- スタックの論理 ID は変えません（`ReviewCanvasStack` はコンストラクト `ReviewCanvas` を id `Default` で置き、論理 ID にコンストラクトの id を足さない）。変えるとテーブル・バケットが作り直されます
- コメントの `source` は文字列で持ちます。設定から外した id のコメントも読め、画面には id をそのまま名前として出します
- スレッドの状態（`open`・`ai-fixed`・`resolved`）は保存せず、`resolved` と AI 修正済みの印（`aiFixedAt`）から決めます。印を持つ前のコメントは印なしとして読み、API の `resolved`・`PUT .../resolution` はそのままです（状態を足しても、前からのデータ・呼び出しは動く）
- 置き場の目録（`meta.json`）は `version: 1` です。形を変えるときは version を上げ、古い目録も読めるようにします
- Storybook ごとの画像の目録（`review-canvas-shots.json`）も `version: 1` です。目録の無い置き場（撮る前の版で置いたブランチ）は、キャンバスが iframe で出します（置き直すと画像になる）
- 依存は `pnpm-workspace.yaml` の `minimumReleaseAge`（出てから 3 週間）を待ってから上げ、`save-exact` で固定します

### 移し方: 画面の幅・高さの既定をなくした版へ

画面の幅・高さは使う側が決めるものとして、review-canvas が持っていた px の既定・候補の範囲をなくしました。この版より前のコミットから上げるときは、次を確かめます。

| 変わったこと                                                              | 前                          | 今                                                                                                                 | すること                                                                                                                      |
| ------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `storybooks[].baseHeight`                                                 | 省くと 800                  | 必須                                                                                                               | 省いていた Storybook に、いままでの値 `"baseHeight": 800`（か、使いたい高さ）を書く                                           |
| `storybooks[].widths`・`defaultWidth` の範囲                              | 200〜4000 の整数を 8 個まで | 1〜10000 の整数を 32 個まで（壊れた値を弾くためだけの上限。コメントの API が受け付ける `frameWidth` の上限と同じ） | なし（前の設定はそのまま通る）                                                                                                |
| `storybooks[].baseHeight` の範囲                                          | 200〜4000                   | 1〜16000（画面が伸びる高さの上限と同じ）                                                                           | なし                                                                                                                          |
| 書き出しの Markdown（Issue 向け）の、確認待ちのスレッドの印               | `（AI 修正済み・確認待ち）` | `（確認待ち）`（プロンプト向けの見出しの状態も「確認待ち」。画面の呼び名にそろえた）                               | 書き出した Markdown の印を文字で拾っている道具があれば、新しい印に合わせる（JSON の `status` の値 `ai-fixed` は変えていない） |
| 画面が伸びる高さの上限                                                    | 6000px                      | 16000px（Chromium が 1 枚として描ける・撮れる大きさ。使う側が選ぶ値ではない）                                      | なし                                                                                                                          |
| 設定に無い id のページ（設定から外した Storybook のコメントを開いたとき） | 幅 1280・高さ 800 で並べる  | 1 つ目の Storybook の幅・高さを借りて並べる                                                                        | なし                                                                                                                          |
| 置き場                                                                    | Storybook のビルド結果だけ  | 画像（`review-canvas-shots/`）と目録（`review-canvas-shots.json`）が増える                                         | 発行用のロール・バケットの決まりは `sb/<ブランチのキー>/` の下のままなので、足すものは無い                                    |
| 同時に読み込む iframe                                                     | 1 つ                        | 3 つ（play 関数を持つ・持つか分からないストーリーは 1 つずつのまま）                                               | なし                                                                                                                          |

- `baseHeight` を省いた設定ファイルは、形の検証で止まります（手元の `review-canvas dev`・`publish`、ワークフロー、CDK の `synth`。どれも設定ファイルを同じ zod で読むため）。**設定ファイルは置くブランチのものを読む**ので、置いてあるブランチにも `baseHeight` を入れてから（既定のブランチに入れて取り込んでから）、ワークフロー・CDK の指すコミットを上げてください。先に上げると、`baseHeight` の無いブランチの置き直しが失敗します（置いてある Storybook はそのまま残る）
- JSON Schema（`review-canvas.config.schema.json`）の `required` にも `baseHeight` が入ります。`$schema` を古いコミットに固定していれば、エディタの表示はそのコミットのままです
- ワークフローの入力・出力、スタックの出力・論理 ID、S3 の置き場のいままでのキー、コメントの項目は変えていません。ワークフローは `build` のジョブで Chromium を入れて撮る分、時間が延びます（目安として、このリポジトリの外で、サンプルを 93 ストーリーに増やした Storybook を 3 つの幅で撮ったときは、4 コアの端末で 40 秒ほどでした。リポジトリの中のサンプルは 9 ストーリーです）
- 画像は、この版で置き直したブランチから出ます。前に置いたブランチは、置き直すまで iframe のまま動きます
