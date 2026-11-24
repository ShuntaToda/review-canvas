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

値は環境変数か CDK のコンテキスト（`-c`）で渡します（`infra/lib/settings.ts`）。使う人・組織に固有の値の既定は持ちません。ワークフローから出すときの置き場は下の「ワークフローから出す」にあります（`REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY` はワークフローだけが読むもので、手元では使いません）。

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

## ワークフローから出す

`.github/workflows/deploy.yml` は、既定のブランチへの push と、手で動かしたとき（Actions → deploy → Run workflow）に、出す Environment の承認を待ってから、上の「出す」と同じスクリプト（`pnpm --dir infra run deploy:no-build`）でスタックを出します。リポジトリの変数 `REVIEW_CANVAS_DEPLOY_ENABLED` が `true` で、既定のブランチで動いたときだけ出し、それ以外（有効にしていないリポジトリ・フォーク・ほかのブランチ）は Environment に入らず、AWS にもつながずに飛ばします。

ワークフローが引き受けるのは、本体とは別の小さな CDK アプリ（`infra/bin/deploy-role.ts`）で作る「出す用のロール」です。権限は CDK のブートストラップのロールを引き受けることだけです（[github-aws-permissions.md](github-aws-permissions.md#aws-出す用のロールdeployyml-が引き受ける)）。このリポジトリをフォーク・写したリポジトリで使うときは、push の `branches` を自分の既定のブランチにします（ジョブも既定のブランチかを確かめる）。コンストラクト `ReviewCanvas` を自分の CDK アプリに組み込む使う側は、自分のワークフローを書きます（このワークフローは `infra/bin/review-canvas.ts` を出すもの）。

### 前提

- 本体のスタックを、上の「出す」で手元から 1 度出してある
- 出し先のアカウントに GitHub の OIDC プロバイダーがある。無ければ、本体を `REVIEW_CANVAS_GITHUB_OIDC_PROVIDER=create` で出して作る（あるかは `aws iam list-open-id-connect-providers --profile <プロファイル>` で確かめ、あればその ARN を使う）。出す用のロールのアプリはプロバイダーを作りません（アカウントに 1 つしか作れず、本体のスタックが持っていることがあるため）
- 出し先のリージョンと us-east-1 の両方で、同じ修飾子で `cdk bootstrap` 済み（IP 制限を us-east-1 以外で使うときは、Web ACL のスタックを us-east-1 に出すため）。本体の修飾子は `infra/cdk.json` の `@aws-cdk/core:bootstrapQualifier`（無ければ `hnb659fds`）です。変えたら、同じ値を `REVIEW_CANVAS_BOOTSTRAP_QUALIFIER` に付けて出す用のロールを出し直します

### 1. 出す用のロールを作る（手元から 1 度）

```bash
REVIEW_CANVAS_GITHUB_OIDC_PROVIDER=arn:aws:iam::<アカウントID>:oidc-provider/token.actions.githubusercontent.com \
REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX=repo:<owner>/<repo> \
pnpm --dir infra run deploy-role:deploy --profile <プロファイル>
```

出し先は、プロファイルの既定のアカウント・リージョン（本体と同じリージョンにする）です。差だけを見るときは `deploy-role:diff` を使います。出力の `DeployRoleArn` を、下の Secret `REVIEW_CANVAS_DEPLOY_ROLE_ARN` に入れます。

| 環境変数（コンテキスト）                                                                                | 内容                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REVIEW_CANVAS_GITHUB_OIDC_PROVIDER`（`-c githubOidcProvider=`）                                        | 今ある OIDC プロバイダーの ARN。必須（`create` は受けない）                                                                                                                                  |
| `REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX`（`-c githubOidcSubPrefix=`）                                     | ロールを引き受けられるリポジトリ（`repo:<owner>/<repo>`。本体と同じ形）。必須                                                                                                                |
| `REVIEW_CANVAS_DEPLOY_ENVIRONMENT`（`-c deployEnvironment=`）                                           | 出す Environment。既定 `review-canvas-deploy`。発行用ロールの Environment（`REVIEW_CANVAS_GITHUB_ENVIRONMENT`・`REVIEW_CANVAS_GITHUB_MAIN_ENVIRONMENT`。無ければ既定の名前）と同じなら止める |
| `REVIEW_CANVAS_BOOTSTRAP_QUALIFIER`（`-c bootstrapQualifier=`）                                         | ブートストラップの修飾子。既定 `hnb659fds`                                                                                                                                                   |
| `REVIEW_CANVAS_DEPLOY_ROLE_STACK_NAME`（`-c deployRoleStackName=`）                                     | スタック名。既定 `ReviewCanvasDeployRole`                                                                                                                                                    |
| `REVIEW_CANVAS_ACCOUNT`・`REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS`・`REVIEW_CANVAS_PROTECTED_ACCOUNTS_FILE` | 出し先・出してはいけないアカウント。本体と同じ確かめ方で止める                                                                                                                               |

### 2. 出す Environment を作る

リポジトリの Settings → Environments で、出す Environment（既定 `review-canvas-deploy`。ロールを作ったときと同じ名前）を作り、次を付けます。

- Required reviewers: 出すことを決める人。承認を押すまで AWS は変わりません
- Deployment branches and tags: Selected branches → 既定のブランチだけ（ロールの信頼は Environment の名前までしか見ないため、ほかのブランチから出させない）

発行用ロールの Environment（`review-canvas`・`review-canvas-main`）とは別の名前にします。名前を変えたときは、リポジトリの変数 `REVIEW_CANVAS_DEPLOY_ENVIRONMENT` にも同じ名前を置きます。

### 3. 値を置く

手元で出すときに渡している値（上の「設定」）を、次のとおりに置きます。独自ドメイン・ログイン連動（`REVIEW_CANVAS_CANVAS_DOMAIN` など）を使っているスタックでは、ワークフローはそれらの値を渡さず、出すと独自ドメイン・ログイン連動が外れるので、有効にしません。公開リポジトリの Actions の記録は誰でも読めるので、Auth0 の値・スタック名・リージョン・既定のブランチ・Environment の名前のほかは Secret に置きます（Secret は、値がそのまま記録に出たときに伏せ字になる）。

| 置き場                                                                        | 名前                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| リポジトリの変数（Settings → Secrets and variables → Actions → Variables）    | `REVIEW_CANVAS_DEPLOY_ENABLED`（`true` で有効。大文字小文字を区別しない。下の 5 で置く）・`REVIEW_CANVAS_DEPLOY_ENVIRONMENT`（任意）                                                                                                                                                                                                                                                                                                                      |
| 出す Environment の変数（Environment secrets ではなく Environment variables） | 必須: `REVIEW_CANVAS_AUTH0_DOMAIN`・`REVIEW_CANVAS_AUTH0_CLIENT_ID`・`REVIEW_CANVAS_AUTH0_AUDIENCE`・`REVIEW_CANVAS_AWS_REGION`（出し先のリージョン）。任意: `REVIEW_CANVAS_STACK_NAME`・`REVIEW_CANVAS_DEFAULT_BRANCH`（Storybook の既定のブランチ。本体の設定）・`REVIEW_CANVAS_GITHUB_ENVIRONMENT`・`REVIEW_CANVAS_GITHUB_MAIN_ENVIRONMENT`・`REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY`                                                               |
| 出す Environment の Secret                                                    | 必須: `REVIEW_CANVAS_DEPLOY_ROLE_ARN`（出力の `DeployRoleArn`）・`REVIEW_CANVAS_CONFIG_BASE64`（設定ファイルを base64 にしたもの）。任意: `REVIEW_CANVAS_ACCOUNT`・`REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS`・`REVIEW_CANVAS_GITHUB_OIDC_PROVIDER`・`REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX`・`REVIEW_CANVAS_ALLOWED_IP_CIDRS`・`REVIEW_CANVAS_WEB_ACL_ARN`・`REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS`・`REVIEW_CANVAS_ALLOWED_EMAILS`・`REVIEW_CANVAS_M2M_CLIENTS` |

- 設定ファイルは `base64 -w 0 review-canvas.config.json`（macOS は `base64 -i review-canvas.config.json`）の出力を置きます。ワークフローは `$RUNNER_TEMP` の下に書き出し、その絶対パスを `REVIEW_CANVAS_CONFIG` に渡します。空・base64 として読めなければ、リポジトリにあるサンプルの設定のまま出さないよう止まります
- 任意の値は、置いていなければ環境変数として渡しません（手元で付けずに出したときと同じ既定になる）
- GitHub は、出す Environment に無い名前を、リポジトリ・組織の同じ名前の変数・Secret から引き継ぎます。ほかの用途で同じ名前を置いていると、それが渡ります（Environment に置いたものが先）
- 使ってよいメールのドメインを空にする（メールアドレスだけで絞る）ときは、Environment の変数 `REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY` を `true`（大文字小文字は区別しない）にし、Secret `REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS` は置きません（GitHub の Secret は空の値を置けず、置かないと既定の `*` になるため）。両方あると、出さずに止まります。`true`・`false` のほかの値も止まります
- 出してはいけないアカウントは `REVIEW_CANVAS_PROTECTED_ACCOUNT_IDS` に入れます（`REVIEW_CANVAS_PROTECTED_ACCOUNTS_FILE` は渡しません）。独自ドメイン・ログイン連動の値（`REVIEW_CANVAS_CANVAS_DOMAIN` など）も渡しません
- 必須の値が無ければ、AWS の資格情報を取る前に、無い名前を出して止まります

### 4. 初めて出す前に、手元で同じ値の差を確かめる

ワークフローは `cdk diff`・`synth` を動かしません（設定ファイルの中身・IP の範囲が、伏せ字にならない形で記録に出るため）。有効にする前に、Environment に置いたのと同じ値を手元で付けて差を見ます。先に画面をビルドしておきます（しないと画面を置くリソース `AppAssetsDeployment` が組み立てに入らず、その削除が差に混ざる）。

```bash
pnpm run build:deployed
REVIEW_CANVAS_AUTH0_DOMAIN=... REVIEW_CANVAS_AUTH0_CLIENT_ID=... REVIEW_CANVAS_AUTH0_AUDIENCE=... \
REVIEW_CANVAS_CONFIG=<Secret に置いたのと同じ設定ファイル> \
<置いたほかの値> \
pnpm --dir infra run diff --profile <プロファイル>
```

`REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS_EMPTY` を `true` にしたときは、手元では代わりに `REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS=`（空）を付けます（`_EMPTY` はワークフローだけが読む）。

発行用ロール（`PublishRoleArn`・`PublishMainRoleArn`）・IP 制限の Web ACL の削除や置き換え、独自ドメイン・証明書・CloudFront の別名（Aliases）・ログイン連動（署名付きクッキーの鍵など）の削除、Auth0 の値・設定ファイル・使ってよいメール・M2M の client・スタック名の変更が出ないことを確かめます。出たら、置いた値の漏れ・誤りを直してから有効にします。

### 5. 有効にする

リポジトリの変数 `REVIEW_CANVAS_DEPLOY_ENABLED` を `true` にします。次の既定のブランチへの push か、Run workflow で動き、承認を待ちます。止めるときは変数を消すか `false` にします（`true` の比べ方は大文字小文字を区別しない）。

### 動かすときに気をつけること

- 出すのは 1 つずつです（`concurrency` は 1 つのグループで、動いている途中のものは止めない）。承認待ちのまま古くなった実行は、承認せずに却下します（Review deployments → Reject。古いコミットを出さないため）
- 資格情報を取るのは、設定の書き出しとビルドの後です。アカウント ID は記録で伏せ字になります（`mask-aws-account-id`）。ロールは 2 時間で引き受けます（CloudFront の更新を含む deploy が 1 時間を超えても切れないように）
- ワークフローの `cdk deploy` は `--require-approval never` で動きます（確認に答えられないため）。IAM などの権限を変える変更は、PR のレビューで人が見ます
- 値が誤っていて組み立てが止まったときは、エラーに値の一部（IP の範囲・メールアドレス・設定ファイルの中身など）が出ることがあります。Secret の伏せ字は、値全体と一致したときだけ効くためです。Actions の記録を誰が読めるかを踏まえて、値は手元の diff で確かめてから置きます
- `.claude/` だけの PR の自動マージ（`auto-merge-claude.yml`）では、GitHub の仕組み上、このワークフローは動きません（出す必要の無い変更なので、そのままにしてあります）

## ブランチの Storybook をワークフローから置く

`.github/workflows/storybook.yml` は、このリポジトリのブランチの Storybook（`review-canvas.config.json` のもの）を、このリポジトリのスタックへ置きます。使う側に出している `publish.yml` を、同じコミットのまま呼びます（[publishing.md](publishing.md#github-actions-から置く)）。リポジトリの変数 `REVIEW_CANVAS_PUBLISH_ENABLED` が `true` のときだけ動き、ほか（フォーク・写したリポジトリ）は AWS につながずに飛ばします。

| きっかけ                   | すること                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| どのブランチへの push でも | `watchPaths` が変わったとき、そのブランチを置く・置き直す（置いていないブランチも置く。新しいブランチは変わったとみなす）。画像だけのブランチ `issue-images` の push では動かさない |
| ブランチを消した           | そのブランチを消す                                                                                                                                                                  |
| 手で動かす（Run workflow） | `branch` のブランチを置く。`all` で、置いてあるブランチ（既定のブランチを除く）を全部置き直す                                                                                       |

- スクリーンショットは、既定のブランチもほかのブランチも CI（`build` のジョブ）で撮ります。撮る場所をそろえるので、文字の形の違いで、どの画面も「変更」になることがありません
- 置く手順（スクリプト・橋渡し・撮影）は、push したコミットの版を使います。ブランチで変えた橋渡し・撮影を、そのまま置いて試せます。そのため、既定のブランチ以外を置く AWS のジョブでは、そのブランチの置くスクリプトが動きます。このリポジトリにブランチを push できるのは write 権限のある人だけで（フォークからの PR では push のワークフローは動かない）、そのジョブのロールが書けるのは、既定のブランチ以外の置き場だけです（[github-aws-permissions.md](github-aws-permissions.md#aws-発行用ロールgithub-actions-が引き受ける)）。動くのは置くスクリプトと、`pnpm install` で入る依存（lifecycle のスクリプトを含む）です。これで増える力はありません。Environment `review-canvas` にはブランチの制限が無いので、write 権限のある人は、もともと自分のブランチのワークフローからこのロールを引き受けられます。そのロールでできるのは、ほかの人のものを含む既定のブランチ以外の Storybook を書き換える・消すことと、Storybook の配信のキャッシュを消すことです
- ロールの ARN はリポジトリの Secret から渡し、資格情報を取った後はアカウント ID を伏せ字にします（公開リポジトリの Actions の記録は誰でも読めるため）
- `review-canvas.config.json` の `watchPaths` に `infra/scripts/` を入れてあり、置くスクリプトだけを変えた push でも置き直します。ほかの置く手順の変更（設定の形・infra の依存の版など）だけのときは、Run workflow で置き直します
- マージしたブランチを消すと Storybook も消えます。Settings → General → Pull Requests の「Automatically delete head branches」を有効にしておくと、置いたままになりません。push の直後にブランチを消すと、消す処理が先に終わり、後から置く処理が終わって Storybook が残ることがあります。残ったら手で消します（Run workflow ではなく、手元の `review-canvas unpublish <ブランチ>`）

### 有効にする

1. **スタックに発行用のロールを作らせる**: 出す Environment（`review-canvas-deploy`）の Secret に、`REVIEW_CANVAS_GITHUB_OIDC_PROVIDER`（アカウントにある GitHub の OIDC プロバイダーの ARN。無ければ `create`）と `REVIEW_CANVAS_GITHUB_OIDC_SUB_PREFIX`（`repo:<owner>/<repo>`。immutable subject のリポジトリは ID 付き。出す用のロールと同じ接頭辞）を置き、deploy を動かします。出力に `PublishRoleArn`・`PublishMainRoleArn` が出ます
2. **Environment を 2 つ作る**: `review-canvas`（ブランチの制限・承認なし）と `review-canvas-main`（既定のブランチだけ。承認は付けない）。[github-aws-permissions.md](github-aws-permissions.md#github-使う側のリポジトリ) の 1 と同じです
3. **Secret を置く**（Settings → Secrets and variables → Actions → Repository secrets）: `REVIEW_CANVAS_PUBLISH_ROLE_ARN`（出力 `PublishRoleArn`）・`REVIEW_CANVAS_PUBLISH_MAIN_ROLE_ARN`（出力 `PublishMainRoleArn`）
4. **有効にする**（3 の Secret を置いてから）: リポジトリの変数 `REVIEW_CANVAS_PUBLISH_ENABLED` を `true` にします。スタックを `ReviewCanvas` 以外の名前・`ap-northeast-1` 以外のリージョンに出したときは、リポジトリの変数 `REVIEW_CANVAS_STACK_NAME`・`REVIEW_CANVAS_AWS_REGION` も置きます。スタックの既定のブランチを `main` から変えたときは `REVIEW_CANVAS_DEFAULT_BRANCH`、発行用ロールの Environment の名前を変えたときは `REVIEW_CANVAS_GITHUB_ENVIRONMENT`・`REVIEW_CANVAS_GITHUB_MAIN_ENVIRONMENT` も置きます。どれも、出す Environment に置いた同じ名前の変数と同じ値にします（`storybook.yml` のジョブは Environment を持たないので、出す Environment の変数は見えません）
5. **既定のブランチを置き直す**: Actions → storybook → Run workflow を既定のブランチで動かします（手元で撮った画像を、CI で撮った画像に入れ替える）。続けて `all` に印を付けて動かすと、置いてあるほかのブランチも CI で撮り直します

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
