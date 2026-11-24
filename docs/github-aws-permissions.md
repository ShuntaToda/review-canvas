# GitHub と AWS の権限

## AWS: 出す人

`pnpm run deploy` は CDK のブートストラップのロール（`cdk-<修飾子>-deploy-role-*`・`file-publishing-role-*` など）を引き受けて出します。出す人の資格情報に要るのは次のとおりです。

- `cdk bootstrap` 済みのアカウント・リージョン（ブートストラップは、IAM・CloudFormation・S3・ECR を作れる人が 1 度だけ行う）
- ブートストラップのロールを引き受ける `sts:AssumeRole`（`arn:aws:iam::<アカウント>:role/cdk-*`）
- 置くスクリプトを手元で動かす人は、下の「発行用ロール」と同じ範囲（`sb/` の下の読み書き・Storybook 用の配信のキャッシュを消す・スタックの出力を読む）

出してはいけないアカウントは `REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS`・`REVIEW_CANVAS_PROTECTED_ACCOUNTS_FILE` に入れておくと、組み立てる時点で止まります（[deploy.md](deploy.md)）。

GitHub Actions（`deploy.yml`）から出すときは、出す人の代わりに下の「出す用のロール」が、同じブートストラップのロールを引き受けます。

## AWS: 出す用のロール（deploy.yml が引き受ける）

このリポジトリの `.github/workflows/deploy.yml` からスタックを出すときに、ワークフローが OIDC で引き受けるロールです。本体とは別の CDK アプリ（`infra/bin/deploy-role.ts`。スタック既定 `ReviewCanvasDeployRole`、出力 `DeployRoleArn`）で、手元から 1 度作ります（手順は [deploy.md](deploy.md#ワークフローから出す)）。

- 信頼: OIDC トークンの `aud`（`sts.amazonaws.com`）と `sub`（`<接頭辞>:environment:<出す Environment>`。既定 `review-canvas-deploy`）の完全一致だけ。OIDC プロバイダーは作らず、今あるもの（出し先のアカウントのもの）の ARN を受けます
- 権限: `sts:AssumeRole` を、出し先のリージョンと us-east-1 の `cdk-<修飾子>-{deploy,file-publishing,image-publishing,lookup}-role-<アカウント>-<リージョン>` にだけ許します。ほかの権限は持ちません（リソースを作るのは、ブートストラップの CloudFormation の実行ロール）
- 時間: 最大のセッション時間は 2 時間（CloudFront の更新を含む deploy が 1 時間を超えても切れないように）
- 発行用ロール（Storybook を置くだけ）とは別のロール・別の Environment です。本体のスタックに作らせないのは、自分を出すロールを自分で作ると初回に出せず、権限を広げたときに自分で自分を広げられてしまうためです
- 受け入れているリスク:
  - ブートストラップの実行ロールは、既定では `AdministratorAccess` を持ちます（`cdk bootstrap --cloudformation-execution-policies` で絞れる）。このロールを引き受けられれば、CloudFormation を通してアカウントの中のものを変えられるので、出す Environment に承認（Required reviewers）と、既定のブランチだけから動かせる制限を必ず付けます
  - `sub` にはブランチ（ref）が入らないため、既定のブランチからだけ出すことは、Environment の制限に頼ります（発行用ロールの `review-canvas-main` と同じ）
  - `id-token: write` はジョブ単位なので、OIDC のトークンを取る権利は、同じジョブの依存のインストール・ビルドのステップ（依存のスクリプト）にも渡ります。既定のブランチの lockfile の依存だけが動く前提です（依存を上げる変更は PR のレビューで見る）

## AWS: 発行用ロール（GitHub Actions が引き受ける）

`REVIEW_CANVAS_GITHUB_OIDC_PROVIDER` と `REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX` を指定して出すと、スタックが 2 つのロールを作ります（`infra/lib/github-publish-role.ts`）。

| ロール（出力）       | 引き受けるジョブ                                                    | 書ける場所                                                                                                                           |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `PublishRoleArn`     | 既定のブランチ以外を置く・消すジョブ（environment `review-canvas`） | `sb/<ブランチのキー>/*`（`sb/*/*`）。ただし `sb/<既定のブランチのキー>/*` と共有のサービスワーカー `sb/mockServiceWorker.js` は Deny |
| `PublishMainRoleArn` | 既定のブランチを置くジョブ（environment `review-canvas-main`）      | `sb/<既定のブランチのキー>/*` と `sb/mockServiceWorker.js` だけ                                                                      |

- 信頼: OIDC トークンの `aud`（`sts.amazonaws.com`）と `sub`（`<接頭辞>:environment:<environment>`）を完全一致で確かめます。接頭辞は `REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX`（`repo:<owner>/<repo>`。既定は持たない）、environment の名前は `REVIEW_CANVAS_GITHUB_ENVIRONMENT`・`REVIEW_CANVAS_GITHUB_MAIN_ENVIRONMENT`（既定 `review-canvas`・`review-canvas-main`）
- 受け入れているリスク: `sub` にはブランチ（ref）が入らないため、既定のブランチ用のロールを既定のブランチのジョブだけが引き受けられることは、GitHub の Environment の制限（`review-canvas-main` を既定のブランチだけにする。下の「GitHub: 使う側のリポジトリ」）に頼ります。ref も `sub` で確かめるには、GitHub 側で OIDC の `sub` の形を変える設定（リポジトリの OIDC の subject claim のカスタマイズ）が要り、このスタックの信頼ポリシーはその形を想定していません
- どちらのロールにも許すのは、Storybook のバケットの `sb/` の下の一覧（`s3:ListBucket` を `sb/*` の接頭辞に限る）・目録の読み取り、このスタックの出力を読むこと（`cloudformation:DescribeStacks`）、Storybook 用の配信のキャッシュを消すこと（`cloudfront:CreateInvalidation`）だけです。画面（バケットの直下の `index.html`・`assets/`・`app-config.json`）・API・テーブルには触れません
- 使う側のリポジトリに write 権限のある人は、既定のブランチ以外のどのブランチの Storybook も置き換えられます（中身はモックのデータの Storybook だけを置く前提）

## GitHub: 使う側のリポジトリ

1. **Environment を 2 つ作る**（Settings → Environments）
   - `review-canvas`: どのブランチからも置けるよう、デプロイできるブランチの制限・承認を付けない
   - `review-canvas-main`: デプロイできるブランチを既定のブランチだけに制限する（Deployment branches and tags → Selected branches → 既定のブランチ）。これで、ほかのブランチのワークフローからは既定のブランチの Storybook を置き換えられません
2. **呼ぶワークフローの権限**: 呼ぶジョブに `permissions: { contents: read, id-token: write }` を付ける（呼ばれる側は、AWS を使うジョブにだけ `id-token: write` を付け、ほかのジョブは `contents: read` だけにする）
3. **変数**（Settings → Secrets and variables → Actions → Variables。名前は呼ぶワークフローで決める。例）
   - `REVIEW_CANVAS_AWS_ROLE_ARN`・`REVIEW_CANVAS_AWS_MAIN_ROLE_ARN`: 出力の `PublishRoleArn`・`PublishMainRoleArn`
   - `REVIEW_CANVAS_DEFAULT_BRANCH`: スタックの既定のブランチ（既定は `main`）と、使う側のリポジトリの既定のブランチが違うとき（スタックを `main` から変えたとき・リポジトリの既定のブランチが `main` 以外のとき）。空ならリポジトリの既定のブランチを使い、スタックの既定のブランチと食い違えば置くスクリプトが止めます
   - `REVIEW_CANVAS_STACK_NAME`・`REVIEW_CANVAS_AWS_REGION`: スタックを `ReviewCanvas` 以外の名前・`ap-northeast-1` 以外のリージョンに出したとき
4. **Actions の許可**: 組織・リポジトリで使える Action を絞っているときは、`ShuntaToda/review-canvas`（フォークを使うときはそのリポジトリ。`review_canvas_repository` にも同じものを渡す）の再利用ワークフローと、`publish.yml` が使う Action（`actions/checkout`・`actions/setup-node`・`actions/upload-artifact`・`actions/download-artifact`・`pnpm/action-setup`・`aws-actions/configure-aws-credentials`。どれもコミットの SHA で固定）を許す

ロールの ARN・アカウント ID は秘密ではありませんが、公開リポジトリから呼ぶときは変数に入れ、ワークフローのファイルに直に書かないでおくと出し直したときに直しやすくなります。

このリポジトリ自身のブランチの Storybook を置くワークフロー（`storybook.yml`）の用意は、[deploy.md](deploy.md#ブランチの-storybook-をワークフローから置く) にあります。

## GitHub: このリポジトリから出す（deploy.yml）

1. **Environment を作る**: 出す Environment（既定 `review-canvas-deploy`。発行用の `review-canvas`・`review-canvas-main` と別の名前）に、Required reviewers と、デプロイできるブランチを既定のブランチだけにする制限（Deployment branches and tags → Selected branches）を付ける
2. **ワークフローの権限**: ワークフロー全体は `contents: read` だけで、出すジョブにだけ `id-token: write` を付けてあります（AWS を使うのはそのジョブだけ）。出すジョブは、既定のブランチのコードだけを動かします
3. **変数・Secret**: [deploy.md の「値を置く」](deploy.md#3-値を置く)の表のとおり。出すことを有効にするのは、リポジトリの変数 `REVIEW_CANVAS_DEPLOY_ENABLED`（`true`）です。置いていないリポジトリ（フォークなど）では、AWS につながずに終わります
4. **Actions の許可**: 使える Action を絞っているときは、`deploy.yml` が使う Action（`actions/checkout`・`actions/setup-node`・`pnpm/action-setup`・`aws-actions/configure-aws-credentials`。どれもコミットの SHA で固定）を許す
