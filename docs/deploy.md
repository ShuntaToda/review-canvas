# AWS へ出す・片付ける

`infra/` の CDK アプリで、AWS アカウントへ 1 式（CloudFront・S3・Lambda・DynamoDB）を出します。Storybook はスタックでは置かず、出した後にブランチごとにスクリプト・GitHub Actions で置きます（[publishing.md](publishing.md)）。
使う側の CDK アプリに組み込むときは、コンストラクト `ReviewCanvas` を使います（[host-setup.md](host-setup.md#cdk-に組み込む)）。

## 前提

- `pnpm install` 済み（Docker は不要）
- AWS CLI で、出し先のアカウントのプロファイル（`--profile` に渡すもの）を使える
- 出し先のアカウント・リージョンで `cdk bootstrap` 済み（`pnpm --dir infra exec cdk bootstrap aws://<アカウントID>/<リージョン> --profile <プロファイル>`。下の環境変数も付けて実行する）
- Auth0 のテナント・API・Application を作ってある（[auth0.md](auth0.md)。Allowed Callback URLs 等は、1 度出してから出力の `Url` を入れる）
- 出す人の権限は [github-aws-permissions.md](github-aws-permissions.md)

## 出す

```bash
REVIEW_CANVAS_AUTH0_DOMAIN=<テナント>.<リージョン>.auth0.com \
REVIEW_CANVAS_AUTH0_CLIENT_ID=<Client ID> \
REVIEW_CANVAS_AUTH0_AUDIENCE=https://review-canvas.example.com/api \
REVIEW_CANVAS_CONFIG=../my-app/review-canvas.config.json \
pnpm run deploy --profile <プロファイル>
```

画面をビルド（`build:deployed`）してから `cdk deploy` します。ビルド済みなら `pnpm --dir infra run deploy:no-build --profile <プロファイル>` で省けます。デプロイはこの 2 つのスクリプトから行ってください（`cdk deploy` を直に、とくに `--app cdk.out` で動かさない。組み立て済みの `cdk.out` を渡す経路は、出し先のアカウントを確かめないため）。

出し先のリージョンは、プロファイルの既定のリージョンです。`deploy`・`destroy` は、アプリの中のスタックをすべて扱います（ふだんは 1 つ。IP 制限を us-east-1 以外で使うときだけ、Web ACL のスタック `<スタック名>-Waf` が増える）。

## 設定

値は環境変数か CDK のコンテキスト（`-c`）で渡します（`infra/lib/settings.ts`）。使う人・組織に固有の値の既定は持ちません。

| 環境変数（コンテキスト）                                               | 内容                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REVIEW_CANVAS_AUTH0_DOMAIN`（`-c auth0Domain=`）                      | テナントのドメイン（`https://` も末尾の `/` も付けない）。必須                                                                                                                                                                                                                              |
| `REVIEW_CANVAS_AUTH0_CLIENT_ID`（`-c auth0ClientId=`）                 | SPA の Client ID。必須                                                                                                                                                                                                                                                                      |
| `REVIEW_CANVAS_AUTH0_AUDIENCE`（`-c auth0Audience=`）                  | API の Identifier。必須                                                                                                                                                                                                                                                                     |
| `REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS`（`-c allowedEmailDomains=`）     | 使ってよいメールアドレスのドメイン（カンマ区切り）。指定しなければ `*`（どのドメインも通す。`*` はほかのドメインと混ぜられない。`*` のときは組み立てるときに警告を出す）。空を指定するとドメインでは通さず、`REVIEW_CANVAS_ALLOWED_EMAILS` だけで決める（そのときは ALLOWED_EMAILS が必須） |
| `REVIEW_CANVAS_ALLOWED_EMAILS`（`-c allowedEmails=`）                  | ドメインのほかに使ってよいメールアドレス（カンマ区切り）。既定は無し                                                                                                                                                                                                                        |
| `REVIEW_CANVAS_M2M_CLIENTS`（`-c m2mClients=`）                        | 人の代わりに API を呼んでよい client（AI・CI の Machine to Machine Application）。`<Client ID>:<表示名>` のカンマ区切り（[auth0.md](auth0.md#ai-が呼ぶm2m-のトークン)）。既定は無し（どの client も通さない）                                                                               |
| `REVIEW_CANVAS_DEFAULT_BRANCH`（`-c defaultBranch=`）                  | 画面を開いたときに選ぶブランチ。既定は `main`（置いていなければ、いちばん新しく置いたブランチ）                                                                                                                                                                                             |
| `REVIEW_CANVAS_STACK_NAME`（`-c stackName=`）                          | スタック名。既定は `ReviewCanvas`。同じアカウントに何人か出すときに分ける。発行用ロールの名前（`<スタック名>-GitHubActionsPublish`）の頭にもなる                                                                                                                                            |
| `REVIEW_CANVAS_ACCOUNT`（`-c account=`）                               | 出し先のアカウント ID。指定すると、資格情報のアカウントが違えば止める（既定は資格情報のアカウント）                                                                                                                                                                                         |
| `REVIEW_CANVAS_GITHUB_OIDC_PROVIDER`（`-c githubOidcProvider=`）       | GitHub Actions から Storybook を置くロールを作るとき: `create`（アカウントに GitHub の OIDC プロバイダーが無い）か、既にあるプロバイダーの ARN。指定しなければロールを作らない（手元のスクリプトだけで置く）                                                                                |
| `REVIEW_CANVAS_GITHUB_ENVIRONMENT`（`-c githubEnvironment=`）          | ワークフローのジョブの environment。既定は `review-canvas`（sub は `<接頭辞>:environment:review-canvas` に完全一致）                                                                                                                                                                        |
| `REVIEW_CANVAS_GITHUB_MAIN_ENVIRONMENT`（`-c githubMainEnvironment=`） | 既定のブランチを置くジョブの environment。既定は `review-canvas-main`（`REVIEW_CANVAS_GITHUB_ENVIRONMENT` と別の名前にする）                                                                                                                                                                |
| `REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX`（`-c githubOidcSubPrefix=`）    | ロールを引き受けられるリポジトリ（OIDC トークンの sub の接頭辞。`repo:<owner>/<repo>`、immutable subject を使うなら ID 付きの形）。`REVIEW_CANVAS_GITHUB_OIDC_PROVIDER` を指定したときは必須（既定は持たない）                                                                              |
| `REVIEW_CANVAS_CONFIG`（`-c config=`）                                 | 使う側の設定ファイル（`review-canvas.config.json`）。並べる Storybook の id・名前・幅を API へ渡す。既定はこのリポジトリのサンプルの `review-canvas.config.json`                                                                                                                            |
| `REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS`（`-c protectedAccountIds=`）     | 出してはいけないアカウント ID（カンマ区切り）。出し先がこれに当たれば止める。既定は無し                                                                                                                                                                                                     |
| `REVIEW_CANVAS_PROTECTED_ACCOUNTS_FILE`（`-c protectedAccountsFile=`） | 出してはいけないアカウント ID を書いた JSON（`["<ID>", ...]` か `[{ "accountId": "<ID>" }, ...]`）。上と合わせて使える                                                                                                                                                                      |

見られる人を絞る設定（どれも任意。指定しなければ今までと同じ構成。選び方と手順は [host-setup.md](host-setup.md#見られる人を絞るip-制限ログイン連動)）:

| 環境変数（コンテキスト）                                                                                       | 内容                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `REVIEW_CANVAS_ALLOWED_IP_CIDRS`（`-c allowedIpCidrs=`）                                                       | 許可する IP の範囲（CIDR。IPv4・IPv6。カンマ区切り）。指定すると、これだけを通す Web ACL（AWS WAF）を作り、2 つの配信に付ける                   |
| `REVIEW_CANVAS_WEB_ACL_ARN`（`-c webAclArn=`）                                                                 | 自分で用意した Web ACL（CloudFront 用。us-east-1 の `global`）の ARN。指定すると、作らずにこれを 2 つの配信に付ける（上と同時には指定できない） |
| `REVIEW_CANVAS_CANVAS_DOMAIN`（`-c canvasDomain=`）・`REVIEW_CANVAS_STORYBOOK_DOMAIN`（`-c storybookDomain=`） | キャンバスと Storybook の独自ドメイン（同じ親ドメインの下の、別々のドメイン）                                                                   |
| `REVIEW_CANVAS_COOKIE_DOMAIN`（`-c cookieDomain=`）                                                            | 署名付きクッキーを付ける親ドメイン（2 つのドメインに共通の親。review-canvas 専用のサブドメインにする。自動では決めない）                        |
| `REVIEW_CANVAS_CERTIFICATE_ARN`（`-c certificateArn=`）                                                        | 2 つのドメインを含む ACM の証明書（us-east-1）の ARN                                                                                            |
| `REVIEW_CANVAS_STORYBOOK_PUBLIC_KEY_FILES`（`-c storybookPublicKeyFiles=`）                                    | 署名付きクッキーを確かめる公開鍵（PEM）のファイル（カンマ区切り。先頭が、いま署名に使う鍵）                                                     |
| `REVIEW_CANVAS_STORYBOOK_PRIVATE_KEY_PARAMETER`（`-c storybookPrivateKeyParameter=`）                          | 先頭の公開鍵と対の秘密鍵を入れた、SSM パラメータストアの SecureString の名前（`/` で始まる）                                                    |
| `REVIEW_CANVAS_HOSTED_ZONE_ID`（`-c hostedZoneId=`）・`REVIEW_CANVAS_HOSTED_ZONE_NAME`（`-c hostedZoneName=`） | Route 53 のホストゾーン。渡すと 2 つのドメインのレコードを作る（独自ドメインを指定したときだけ。2 つを対で渡す）                                |

- API の `STAGE_NAME` は `DEV` だけです（`LOCAL` は擬似ログインと `/api/doc` を許すため、デプロイ先では使えない）
- 出してはいけないアカウント（`protectedAccountIds`）は、アプリから組み立てる経路（`deploy`・`deploy:no-build`・`diff`・`destroy`・`synth`）で、組み立てるときに出し先のアカウントを確かめて止めます。本番のアカウントなど、レビュー用のツールを置かないアカウントを入れておくと、資格情報の取り違えで出すことを防げます
- `synth`・`diff`・`destroy` も、Auth0 の 3 つの値（`REVIEW_CANVAS_AUTH0_*`）を付けないと動きません（スタックを組み立てるときに確かめるため）

```bash
REVIEW_CANVAS_AUTH0_DOMAIN=... REVIEW_CANVAS_AUTH0_CLIENT_ID=... REVIEW_CANVAS_AUTH0_AUDIENCE=... \
pnpm --dir infra run diff --profile <プロファイル>     # destroy・synth も同じ
```

## 出力

| 出力                                                        | 内容                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Url`                                                       | キャンバスの URL（Auth0 の Allowed Callback URLs・Allowed Logout URLs・Allowed Web Origins に入れる）  |
| `StorybookUrl`                                              | Storybook を配るオリジン（キャンバスと別のオリジン）                                                   |
| `StorybookBucket`・`StorybookDistributionId`                | Storybook の置き場（置くスクリプトが読む）                                                             |
| `DistributionId`・`CommentTableName`                        | キャンバスの配信・コメントのテーブル                                                                   |
| `DefaultBranch`                                             | 既定のブランチ（置くスクリプトが、ワークフローの値と食い違えば止める）                                 |
| `PublishRoleArn`・`PublishMainRoleArn`                      | GitHub Actions から置くロール（OIDC プロバイダーを指定したときだけ）                                   |
| `DistributionDomainName`・`StorybookDistributionDomainName` | 2 つの配信の `*.cloudfront.net` の名前（独自ドメインを指定したときだけ。自分の DNS で CNAME を張る先） |

出力の名前は、`ReviewCanvas` を使う側のスタックに組み込んだときも同じです（1 つのスタックに 1 つだけ置く）。

## はじめて使うときの手順

1. スタックを出す（上の「出す」）。GitHub Actions から置くなら、OIDC プロバイダーと `REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX` を指定する。アカウントに GitHub の OIDC プロバイダーがまだ無ければ `REVIEW_CANVAS_GITHUB_OIDC_PROVIDER=create`、あればその ARN（`aws iam list-open-id-connect-providers --profile <プロファイル>` で確かめる）。`create` で作ったプロバイダーは、スタックを消すと一緒に消えます
2. 出力の `Url` を Auth0 の Application に入れる（[auth0.md](auth0.md)）
3. 使う側のリポジトリで、呼ぶワークフローを置き、GitHub Environment を作る（[host-setup.md](host-setup.md#ワークフローから置く)・[github-aws-permissions.md](github-aws-permissions.md)）
4. はじめの 1 回は、ワークフローを手で動かして（Run workflow）置くブランチを指定するか、手元で `review-canvas publish --profile <プロファイル>` を動かす。初回は OIDC トークンの sub が `<接頭辞>:environment:review-canvas` の形になっていることを、失敗したときのエラーで確かめる（違えば `REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX` で直して出し直す）

## 片付ける

```bash
REVIEW_CANVAS_AUTH0_DOMAIN=... REVIEW_CANVAS_AUTH0_CLIENT_ID=... REVIEW_CANVAS_AUTH0_AUDIENCE=... \
pnpm run destroy --profile <プロファイル>
```

- IP 制限を us-east-1 以外で使っているときは、**入れたときと同じ `REVIEW_CANVAS_ALLOWED_IP_CIDRS` を付けて**動かします（付けないと、us-east-1 の `<スタック名>-Waf` のスタックが残り、Web ACL の料金が掛かり続ける）。残してしまったときは `aws cloudformation delete-stack --stack-name <スタック名>-Waf --region us-east-1 --profile <プロファイル>` で消します（[host-setup.md](host-setup.md#ip-制限aws-waf)）
- バケット（画面・置いた Storybook）は中身ごと消えます。コメントのテーブル（`CommentTableName`）だけは残ります（要らなければ手で消す）
- 消した後に出し直すと新しいテーブルを作るため、残したテーブルのコメントは画面に出ません
- `create` で作った GitHub の OIDC プロバイダーも消えます（同じアカウントのほかのものが使っていないか確かめてから消す）
- Auth0 のテナント・GitHub Environment・リポジトリの変数は手で消します

## 持たないもの

小さく使う前提のため、アクセスログ・アラームは持ちません。要るときは、使う側のスタックで `ReviewCanvas` を組み込み、そちらで足してください。WAF（IP 制限）と独自ドメイン（ログイン連動）は、既定では作らず、設定を渡したときだけ作ります（[host-setup.md](host-setup.md#見られる人を絞るip-制限ログイン連動)）。

CI（`.github/workflows/ci.yml`）は、架空の Auth0 の値で synth（Lambda のバンドルを含む）し、デプロイ先の画面のビルドに擬似ログインのコードが入っていないことを確かめます（`pnpm run check:deployed-bundle`）。AWS にはつなぎません。
