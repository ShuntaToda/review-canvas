# ブランチの Storybook を置く

1 つの配信（URL）に、ブランチごとの Storybook を置きます。画面の「ブランチ」で選ぶと、そのブランチの Storybook とコメントに入れ替わります。
置くのは手元の CLI（`review-canvas publish`）か、使う側のリポジトリから呼ぶワークフロー（`.github/workflows/publish.yml`）です。

## 置き場

| S3 のキー                                           | 中身                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sb/<ブランチのキー>/<id>/`                         | そのブランチの Storybook のビルド結果。`assets/`（名前にハッシュを持つ）を先に immutable で足し（消さない）、ほかを no-cache で入れ替え、橋渡し（`review-canvas-bridge.js`）と、橋渡しを差し込んだ `iframe.html`・`index.json` を続けて置き、目録を書いた後で古い `assets/` を消す（置いている途中に開いている画面が、消えたファイルを読みに行かないように）。途中で止まったときは置き直してください |
| `sb/<ブランチのキー>/<id>/review-canvas-shots/`     | 置くときに撮ったストーリーの画像（`<ストーリー ID>-<幅>-<中身のハッシュ>.png`。設定の `widths` の幅ごと・ページ全体の高さ）。名前に中身のハッシュを持つので immutable で足し、目録を書いた後で古いものを消す                                                                                                                                                                                         |
| `sb/<ブランチのキー>/<id>/review-canvas-shots.json` | 画像の目録 `{ version: 1, shots: [{ storyId, width, height, path }], playFunctions }`（no-cache）。キャンバスはこれがあれば画像を並べ、無ければ（撮る前の版で置いた・撮れなかった）いままでどおり iframe で出す                                                                                                                                                                                      |
| `sb/<ブランチのキー>/meta.json`                     | 目録 `{ version: 1, branch, commit, builtAt, storybooks }`。置くときは最後に書き、消すときは最初に消す（目録があれば中身は揃っている）                                                                                                                                                                                                                                                               |
| `index.html`・`assets/`・`app-config.json`          | キャンバスの画面（スタックが置く。どのブランチでも同じ）                                                                                                                                                                                                                                                                                                                                             |
| `sb/mockServiceWorker.js`                           | msw のサービスワーカー。Storybook 用の配信が `/mockServiceWorker.js`（オリジン直下でないと効かない）として返す。どのブランチでも同じものを読む。**既定のブランチを置くときだけ**、そのブランチのもので上書きする（オリジンの直下・scope `/` で動くので、ほかのブランチからは書けない）                                                                                                               |
| `mockServiceWorker.js`                              | 画面の配信の、自分を外すだけのサービスワーカー（スタックが置く）                                                                                                                                                                                                                                                                                                                                     |

- ブランチのキーは、ブランチ名の英数字と `.` `_` `-` をそのまま、ほかのバイト（`/`・`~`・日本語など）を UTF-8 の 1 バイトずつ `~XX`（大文字の 16 進）にしたものです。例: `main` → `main`、`claude/x-y` → `claude~2Fx-y`、`fix~1` → `fix~7E1`。逆に戻せ、別のブランチが同じキーになりません（`api/infrastructure/published-storybooks/branch-key.ts` と `infra/scripts/branch-key.ts`。同じ中身であることをテストで確かめる）
- API（`/api/meta`）は `sb/` の直下を一覧して各ブランチの `meta.json` を読み、ビルドした日時の新しい順に返します（30 秒ためてから読み直すため、置いてから画面の一覧に出るまで最大 30 秒ほどかかります）。目録の無い・壊れたもの（置いている途中・消している途中）は無いものとします。Lambda に許すのは `sb/` の直下の一覧と `sb/*/meta.json` の読み取りだけです
- 既定のブランチ（`REVIEW_CANVAS_DEFAULT_BRANCH`。既定は `main`）が置いてあればそれを、無ければいちばん新しく置いたブランチを開きます
- 置いたブランチのコメントのコミットは、そのブランチに置いてある Storybook のコミットです
- 1 ブランチあたりの大きさは Storybook のビルド結果の分です（`--test` のビルドにすると小さくなる）。S3 の保存は 1GB あたり月 0.025 USD ほどなので、10MB の Storybook を 50 ブランチ置いても月 0.02 USD 程度です。置くたびに Storybook 用の配信のキャッシュを 1 パス（`/sb/<キー>/*`。既定のブランチは `/mockServiceWorker.js` も）消します（月 1,000 パスまでは無料）。置く・消すのは PUT・DELETE で 1 ブランチ 300 ファイルほど

## 手元から置く・消す

review-canvas を取り出した場所で `pnpm install` しておき、使う側のリポジトリの中から CLI を動かします（`bin/review-canvas.mjs`。`node <review-canvas>/bin/review-canvas.mjs` か、取り出した場所で `pnpm link --global` して `review-canvas` として呼ぶ）。

```bash
# いまのチェックアウトの Storybook を設定ファイルのとおりにビルドし、いまのブランチとして置く
review-canvas publish --profile <プロファイル>

# ブランチを消す（目録 → 中身 → キャッシュの順）
review-canvas unpublish <ブランチ> --profile <プロファイル>

# 置いてあるか（true/false）・置いてあるブランチの一覧（JSON）
review-canvas is-published <ブランチ> --profile <プロファイル>
review-canvas list --profile <プロファイル>
```

- 設定ファイルは `--config`（無ければ、動かした場所の git の根の `review-canvas.config.json`）、置くチェックアウトは `--repo-root`（無ければ動かした場所の git の根）です。ビルドのコマンドは設定ファイルのあるディレクトリで動かし、`outDir` もそこから解きます。`outDir` が `--repo-root` の外を指していたら止めます（絶対パス・`..` は設定の検証でも止める）
- 置き場（バケット・Storybook 用の配信の ID）と、橋渡しが受け付ける画面のオリジンは、`--bucket`・`--distribution-id`・`--canvas-origin`（または環境変数 `REVIEW_CANVAS_BUCKET`・`REVIEW_CANVAS_STORYBOOK_DISTRIBUTION_ID`・`REVIEW_CANVAS_CANVAS_ORIGIN`）が無ければ、スタック（`--stack-name`。既定 `ReviewCanvas`）の出力 `StorybookBucket`・`StorybookDistributionId`・`Url` から読みます
- 置くときは、橋渡し（`pnpm run build:bridge`）を review-canvas の版でビルドし、各 Storybook の `iframe.html` に差し込んでから置きます（元のビルド結果は書き換えない）
- 既定のブランチは、置くときはいつもスタックの出力 `DefaultBranch` を読みます。`--default-branch`（環境変数 `REVIEW_CANVAS_DEFAULT_BRANCH`）がそれと違えば止めます。共有のサービスワーカーは、このブランチを置くときだけ書きます
- `is-published` は目録（`meta.json`）を head-object で確かめます。発行用ロールの一覧（ListBucket）は `sb/` の下に絞っているため、無いキーが 404 ではなく 403 になることがあり、そのときは目録のキーを接頭辞にした一覧の件数で確かめ直します（一覧もできなければ失敗にする）
- `publish` は `--branch`・`--commit`（既定は Git のいまのブランチと短いコミット）・`--skip-build`（ビルド済みのものを置く）・`--dry-run`（AWS の操作を出すだけ）・`--region` を受けます。AWS の操作は AWS CLI（`aws`）で行うので、手元に入れておいてください
- ブランチ名は API が受け付ける形（英数字で始まる英数字と `._-/`、`..` なし、200 文字まで）だけを置けます
- 置くときは、ビルドのあとに全ストーリーのスクリーンショットを撮ります（`infra/scripts/story-screenshots.ts`。Playwright の Chromium で、ビルド結果を手元の `127.0.0.1` から配って開く）。設定の `widths` の幅ごとに、窓の高さを `baseHeight` にして開き、描画と play 関数が終わってから（Storybook の描画の段階が `completed`・`finished`・`errored` などになってから）、アニメーションを止めてページ全体を撮ります（16000px より長い画面はそこで切る）。並べて撮り（CPU の数まで。4 つまで）、1 枚 30 秒で諦めます。撮れなかったストーリーは目録に載らず、キャンバスが iframe で出します
- Chromium は `pnpm --dir infra exec playwright install chromium` で入れておきます。入っていない・撮れないときは、知らせを出して画像なしで置きます（置くこと自体は止めない）。`--skip-screenshots` を付けると撮らず、ビルド結果の中にすでにある画像と目録（`review-canvas-shots/`・`review-canvas-shots.json`）を確かめて置きます（無ければ画像なし）。撮るだけなら `pnpm --dir infra run screenshots --repo-root <dir> --config <file>` です
- 置く画像は、目録に載っていて、置き場の直下にあり、リンクでなく、中身が PNG のものだけです（目録の幅・高さは PNG から読み直す）
- ビルドは Storybook の `--test` にするのがおすすめです（docs のアドオン・自動の docs・ソースマップを外す。画面ごとの iframe が DocsRenderer を読まなくなり、軽くなる）

## GitHub Actions から置く

使う側のリポジトリから、review-canvas の `.github/workflows/publish.yml` を `workflow_call` で呼びます（呼び方は [host-setup.md](host-setup.md#ワークフローから置く)）。

| きっかけ（呼ぶ側のイベント）  | すること                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| 手で動かす（`branch` を指定） | そのブランチをチェックアウトして置く（空ならワークフローを動かしたブランチ）                   |
| 手で動かす（`all` に印）      | いま置いてあるブランチを全部置き直す（2 つずつ。既定のブランチは除く）                         |
| どこかのブランチへの push     | そのブランチが置いてあり、設定ファイルの `watchPaths` が前の push から変わったときだけ置き直す |
| ブランチを消した              | 置いてあれば消す                                                                               |

- 置いていないブランチは push しても置きません。置くかどうかは、はじめに手で決めます（手で動かすか、手元の `review-canvas publish`）
- 同じブランチの置く・消すは並べず、順に動かします（途中で止めると置き場が半端になるため、途中のものは止めない）
- `role_arn` が空なら、どのジョブも動かさずに終わります。既定のブランチを置くときに `main_role_arn` が空なら、その置く処理は失敗します
- 置く手順（スクリプト・橋渡し）は、`review_canvas_ref`（40 桁のコミットの SHA。`uses:` の `@` と同じにする）の review-canvas から取り出します。SHA でなければ止めます
- ビルドと置くことはジョブを分けます。置くブランチは `host/` へ取り出して、AWS の資格情報を持たないジョブ（`build`。`id-token` なし）で Storybook をビルドし、成果物にします。AWS の資格情報を持つジョブ（`publish`）は、橋渡しを review-canvas のコミットから自分でビルドし（成果物の中のものは使わない）、成果物を review-canvas のスクリプトで置くだけで、置くブランチのコードは動かしません
- スクリーンショットも `build` のジョブで撮ります（置くブランチのストーリーをブラウザで動かすので、AWS の資格情報を持たない側で）。撮る手順は `review_canvas_ref` の review-canvas のもので、Chromium はそのジョブで入れます（`playwright install --with-deps --only-shell chromium`）。撮れなくてもジョブは続き、画像なしで置きます。`publish` のジョブは成果物の画像を確かめて置くだけで、ブラウザを動かしません（`--skip-screenshots`）。既定のブランチだけは、下のとおり `publish` のジョブが自分でビルドするので、そこで撮ります
- 既定のブランチは成果物を使わず、`publish` のジョブが既定のブランチのチェックアウト（Environment で既定のブランチからだけ動く。動かしたブランチが既定のブランチでなければ止める）から自分でビルドして置きます（ほかのブランチのビルドが、既定のブランチ向けの成果物を上げても使われない）。`all` で置き直すときも既定のブランチは外すので、既定のブランチは既定のブランチへの push か、既定のブランチから手で動かして置き直します
- 成果物の設定ファイルの `id`・`outDir` は、ビルドのジョブ（シェル）と置くスクリプト（zod）の両方で形を確かめます
- 置いてあるか・目録の一覧の答えは形を確かめ（`true`/`false`・文字列の JSON の配列）、形が違えば失敗にします。シェルは `pipefail` で動かします。ブランチを消したときは、置いてあるかを見ずに消します（置いていなければ何もしない）
- AWS につなぐジョブだけが OIDC のトークン（`id-token: write`）を持ちます。使うアクションはコミットの SHA で固定しています。認証情報を扱うジョブでは pnpm のキャッシュを使いません
- push で動くのは、push したブランチにある呼ぶ側のワークフローのファイルです。ブランチの削除と、手で動かすときの既定（Use workflow from）は既定のブランチにあるファイルで動くため、既定のブランチに入るまではブランチを消しても Storybook は消えません（手元の `review-canvas unpublish` で消す）
- 既定のブランチは 1 つの値で決めます。スタックの `REVIEW_CANVAS_DEFAULT_BRANCH`（出力 `DefaultBranch`）と同じ値を `default_branch` に渡してください（空ならリポジトリの既定のブランチ）。食い違えば、置くスクリプトが止めます
- ロール・Environment の分け方と、ロールに許すことは [github-aws-permissions.md](github-aws-permissions.md) にあります
