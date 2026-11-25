# 使う側のリポジトリでの準備

review-canvas は、Storybook を持つアプリのリポジトリ（以下「使う側」）の外に置いて使います。使う側に足すのは、設定ファイル `review-canvas.config.json` と、置くためのワークフロー（任意）だけです。

```mermaid
flowchart LR
  subgraph host[使う側のリポジトリ]
    config[review-canvas.config.json]
    sb[Storybook のソース]
    wf[".github/workflows/review-canvas.yml<br/>（publish.yml を呼ぶ）"]
  end
  subgraph tool[review-canvas]
    cli[CLI・置くスクリプト]
    reusable[".github/workflows/publish.yml"]
    cdk[CDK（ReviewCanvas）]
  end
  wf -->|workflow_call| reusable
  config --> cli
  config --> cdk
  cli -->|ビルドして置く| aws[(AWS の配信)]
  reusable -->|ビルドして置く| aws
  cdk -->|出す| aws
```

## 設定ファイル（`review-canvas.config.json`）

使う側のリポジトリの根に置きます（ほかの場所に置くときは、CLI・ワークフロー・CDK に場所を渡す）。形は JSON Schema（このリポジトリの `review-canvas.config.schema.json`。`api/infrastructure/config/review-canvas-config.ts` の zod の定義から作る）で確かめられます。

```json
{
  "$schema": "https://raw.githubusercontent.com/ShuntaToda/review-canvas/<コミット>/review-canvas.config.schema.json",
  "storybooks": [
    {
      "id": "shop",
      "label": "ショップ",
      "build": "pnpm --dir apps/shop run build-storybook --test",
      "outDir": "apps/shop/storybook-static",
      "widths": [375, 768, 1280],
      "defaultWidth": 375,
      "baseHeight": 812
    },
    {
      "id": "console",
      "label": "運用コンソール",
      "build": "pnpm --dir apps/console run build-storybook --test",
      "outDir": "apps/console/storybook-static",
      "widths": [1024, 1280, 1920],
      "defaultWidth": 1280,
      "baseHeight": 800
    }
  ],
  "excludeTitlePrefixes": ["Components/", "Hooks/"],
  "watchPaths": [
    "apps/",
    "packages/ui/",
    "pnpm-lock.yaml",
    "review-canvas.config.json"
  ]
}
```

| 項目                        | 必須 | 内容                                                                                                                                                                                    |
| --------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storybooks[]`              | ○    | キャンバスに並べる Storybook（1〜8 個）。1 つ目が、開いたときのページ                                                                                                                   |
| `storybooks[].id`           | ○    | 英小文字・数字・`-` の 32 文字まで（`^[a-z0-9][a-z0-9-]{0,31}$`）。URL（`?page=`）・コメントの `source`・置き場（`sb/<ブランチ>/<id>/`）に残る。重ねられない                            |
| `storybooks[].label`        | ○    | 画面に出す名前（ページの切り替え・コメント一覧・Markdown の見出し）。40 文字まで                                                                                                        |
| `storybooks[].build`        | ○    | Storybook をビルドするコマンド。設定ファイルのあるディレクトリで、シェルで動かす（`--test` のビルドを推奨）                                                                             |
| `storybooks[].outDir`       | ○    | ビルド結果（`index.json`・`iframe.html` のあるディレクトリ）。設定ファイルのあるディレクトリからの相対パス（絶対パス・`..` は使えない）                                                 |
| `storybooks[].widths`       | ○    | 切り替えられる画面の幅（px）。使う側が決める（決まった候補・既定は無い）。置くときは、この幅ごとに全ストーリーの画像を撮る。1〜10000 の整数を 32 個まで（壊れた値を弾くためだけの上限） |
| `storybooks[].defaultWidth` | ○    | 既定の幅。`widths` のどれか                                                                                                                                                             |
| `storybooks[].baseHeight`   | ○    | 中身を測る前の画面の高さ（px）で、置くときに画像を撮るブラウザの窓の高さでもある。使う側が決める（既定は無い）。1〜16000 の整数                                                         |
| `excludeTitlePrefixes`      |      | 既定では並べないストーリーのタイトルの頭（画面の「部品も表示」で並べる）。既定は無し                                                                                                    |
| `watchPaths`                |      | push のときに置き直すきっかけのパス（リポジトリの根から。`git diff` に渡す）。ワークフローで push から置き直すなら要る（空だと push の実行は失敗する）                                  |

- `id` をあとから変えると、古い id のコメントは画面のページに並ばなくなります（データは残り、API・書き出しでは読める）
- 並べる Storybook は、msw・play 関数を使っていてもかまいません（play 関数を持つストーリーは、キャンバスが 1 つずつ動かす）。msw のサービスワーカー（`mockServiceWorker.js`）は Storybook の `staticDirs` で配る形にしてください
- 画面の幅・高さに、review-canvas が決めた既定はありません。設定の幅のほかの幅で見たい人は、画面の「幅を足す」で自分用の幅を足せます（そのブラウザにだけ覚える。足した幅には画像が無いので、iframe で読み込む）
- Storybook の中身は、何も指定しなければログインなしで読めます（絞るときは下の「[見られる人を絞る](#見られる人を絞るip-制限ログイン連動)」）。絞っても、モックのデータだけを使い、本物の個人情報・秘密を入れないでください

## 画面のつながり（遷移）を書く

ストーリーの `parameters.reviewCanvas.transitions` に、そのストーリーのボタンから行き先のストーリーへのつながりを書けます。置くときに撮るスクリーンショットと一緒に、行き先と、撮った幅ごとのボタンの位置を画像の目録（`review-canvas-shots.json`）に残します。キャンバスは、遷移を持つ要素から行き先の画面へ矢印を出し、札を押すと行き先へ寄ります（上の帯の「画面のつながり」。画像を撮っていない幅・ブランチでは出しません）。

```ts
export const Default: Story = {
  parameters: {
    reviewCanvas: {
      transitions: [
        {
          from: { role: "button", name: "カートに入れる", heading: "りんご" },
          to: "shop-orderform--default",
          label: "在庫があるとき",
        },
      ],
    },
  },
};
```

| 項目           | 内容                                                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transitions`  | 遷移の並び。1 ストーリーに 50 行まで（51 行目から先は読まずに知らせる）                                                                                                                                                     |
| `from`         | ボタンの決め方。`{ role, name }`（役割とアクセシブルな名前）・`{ text }`（見えている文字）・`{ testId }`（`data-testid`）のどれか 1 つ。`role` だけで `name` が無い行は書き方が違うとして読まない。名前・文字の比べ方は下に |
| `from.heading` | 任意。その要素の見出しが一致するものだけに絞る。見出しは、要素の中の最初の見出し（無ければ、文書の並びで要素より前にあるいちばん近い見出し）。空白を除いた 24 字までで、完全一致で比べる                                    |
| `to`           | 行き先のストーリー ID（`shop-orderform--default` の形。小文字の英数字と `-` で、`--` をちょうど 1 つ含む。端の `-`・続いた `---` は不可。200 字まで）。同じ Storybook にあるストーリーを書く                                |
| `label`        | 任意。矢印の札に添える文字。40 字まで                                                                                                                                                                                       |

- ボタンは、撮る幅ごとに、描画と play 関数が終わった後の画面で探します（Playwright の `getByRole`・`getByText`・`getByTestId` と同じ探し方）。見えていない要素（`display: none`・`visibility: hidden` など）は数えません。`text` で探したときは、その文字を持つ要素を含むいちばん近い押せる要素（ボタン・リンクなど。無ければその要素）の位置を残します
- 名前（`name`）・文字（`text`）は、前後の空白を除き、中の続いた空白・改行を 1 つの空白とみなして、完全一致で比べます（Playwright の `exact: true` と同じ）。大文字・小文字は区別します
- キャンバスは、画像の画面では目録の位置（撮ったときの位置）から矢印と枠を出します。動く画面（iframe）に切り替わると、同じ書き方で画面の中のボタンを探し直し（見えている要素だけ・`heading` で絞る・複数に当たる行は位置を決めない、のも同じ）、見つかった位置から出します。手元のフォントが撮ったときと違って中身の高さ・ボタンの位置が変わっても、ボタンから出ます。探し直すのは、動く画面を出したとき・幅を替えたとき・中身の大きさが変わったとき・操作のモードで中を触った後です（触らずに起きた、中身の大きさが変わらない入れ替わりは拾いません）。探している間は撮ったときの位置から出しておきます。見つからない・複数に当たる・画面の外の行は、その行だけ枠を出さず、画面の右の端から矢印を出します。撮るときに位置を残せなかった行も、動く画面で見つかればボタンから出します。動く画面での役割（`role`）・アクセシブルな名前・見えているかは、撮るときに使う版の Playwright の決め方を書き写したもので読みます（写した版が撮るときの版とそろっていることは、テストで確かめています）。違うのは、Shadow DOM の中のボタンです（動く画面では探さないので、撮るときに見つかっても、その行は画面の右の端から出ます）
  - ボタンを探す前の版の review-canvas で置いた Storybook（橋渡しが探す頼みに答えない）では、動く画面の中身の高さが撮ったときと違う・操作のモードで中を触った後は、どの行も枠を出さず画面の右の端から出します。`review_canvas_ref` をボタンを探す版に上げてから置き直すと、ボタンから出ます
- ボタンを探すのは、1 枚につき遷移を読むのと合わせて 30 秒までです。超えた（またはページが応えない・撮影の時間の上限でブラウザを閉じた）幅は、ボタンの位置を残さず、その幅の書き間違い（見つからない・画像の外・複数に当たる）も一覧に出しません。画像は置き、標準出力に `<ストーリー ID>（<幅>px）: 遷移のボタンを探せませんでした（画像は置きます）` が出ます。撮影を止める前に遷移を読み終えていれば、行き先と、幅に依らない書き間違い（行き先が無い・書き方が違う・多すぎる）は残ります
- 撮るときは、次のときにボタンが「見つかりません」になります: Playwright の知らない `role` を書いた、ボタンが画面の左・上の外にある（`left: -9999px` で隠したリンクなど）。動く画面で探すときも、同じ行は見つからないとして、画面の右の端から出します
- `transitions` が並び（配列）でないときは、遷移なしとして読みます（知らせは出ません）。`from` の項目・`to`・`label` のうち、文字でない値（数・関数など）や空白だけの文字は、書いていないものとみなします（文字でない `label` は無視され、札なしの行になる。`role` に文字でない `name` を付けた行は「書き方が違う」になる）
- 同じ `from` の行を 2 つ書いてかまいません（入力しだいで行き先が分かれるボタンなど）
- meta（`export default`）とストーリーの両方に書いたときは、Storybook の決まりどおり、ストーリーに書いた `transitions` で置き換わります（足し合わせない）
- 読むのは `transitions` だけで、ほかの `parameters` はブラウザの外へ持ち出しません
- 書き間違いは、撮った後に一覧で出します（標準出力と、GitHub Actions ではジョブのまとめ「画面のつながりの書き間違い」）。書き間違いがあっても置くことは止めません。出るのは次のものです（「行目」は書いた順で 1 から。幅だけが違う同じ書き間違いは 1 行にまとめ、`幅 375・768` のように並べる）

| 書き間違い           | 出る知らせ                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| ボタンが見つからない | `<ストーリー ID>（幅 <幅>）の <行> 行目: ボタンが見つかりません`                                |
| 画像の外             | `<ストーリー ID>（幅 <幅>）の <行> 行目: ボタンが画像の外にあります（画像の高さの上限より下）`  |
| 複数に当たる         | `<ストーリー ID>（幅 <幅>）の <行> 行目: ボタンが <N> 個に当たります。heading で絞ってください` |
| 行き先が無い         | `<ストーリー ID> の <行> 行目: 行き先のストーリー <to> がありません`                            |
| 書き方が違う         | `<ストーリー ID> の <行> 行目: 書き方が違います（<どこが>）`                                    |
| 多すぎる             | `<ストーリー ID>: 遷移が 50 行を超えています。51 行目から先は読みません`                        |

## 手元で並べる

review-canvas を使う側とは別の場所に取り出して `pnpm install` しておき、使う側の設定ファイルを渡して起こします。

```bash
git clone https://github.com/ShuntaToda/review-canvas.git
cd review-canvas && pnpm install && pnpm run docker:up

# 使う側の Storybook をビルドしてから（設定の build のとおり）
node bin/review-canvas.mjs dev --config ../my-app/review-canvas.config.json
```

`--config` を渡すと、`REVIEW_CANVAS_CONFIG`（設定ファイル）と `REVIEW_GIT_DIR`（ブランチ・コミットを読む git。設定ファイルのあるディレクトリ）を付けて `pnpm dev` を動かします。`.env` に書いてもかまいません。

## CLI

`bin/review-canvas.mjs`（`package.json` の `bin`。取り出した場所で `pnpm link --global` すると `review-canvas` で呼べる）。

| コマンド                                        | すること                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `review-canvas dev [--config]`                  | 手元でキャンバスを起こす                                                                                |
| `review-canvas publish [...]`                   | 動かした場所の git の根（`--repo-root`）の Storybook を設定のとおりにビルドし、いまのブランチとして置く |
| `review-canvas unpublish <ブランチ>`            | ブランチの Storybook を消す                                                                             |
| `review-canvas list`・`is-published <ブランチ>` | 置いてあるブランチの一覧（JSON）・置いてあるか（`true`/`false`）                                        |
| `review-canvas schema`                          | 設定ファイルの JSON Schema を作り直す（review-canvas の開発用）                                         |

置く・消すのオプション（`--profile`・`--stack-name`・`--dry-run` など）は [publishing.md](publishing.md#手元から置く消す) にあります。

## ワークフローから置く

使う側のリポジトリに、次のようなワークフローを置きます（`<コミット>` は review-canvas の 40 桁のコミットの SHA。`uses:` と `review_canvas_ref` に同じものを書く）。review-canvas をフォークして使うときは、`uses:` のリポジトリと `review_canvas_repository` をフォークにそろえます。

```yaml
# .github/workflows/review-canvas.yml
name: review-canvas

on:
  workflow_dispatch:
    inputs:
      branch:
        description: 置くブランチ（空なら、このワークフローを動かしたブランチ）
        required: false
        type: string
      all:
        description: いま置いてあるブランチを全部置き直す
        required: false
        type: boolean
        default: false
  push:
    branches: ["**"]
  delete:

permissions:
  contents: read

jobs:
  review-canvas:
    uses: ShuntaToda/review-canvas/.github/workflows/publish.yml@<コミット>
    permissions:
      contents: read
      id-token: write
    with:
      review_canvas_ref: <コミット>
      config: review-canvas.config.json
      role_arn: ${{ vars.REVIEW_CANVAS_AWS_ROLE_ARN }}
      main_role_arn: ${{ vars.REVIEW_CANVAS_AWS_MAIN_ROLE_ARN }}
      aws_region: ${{ vars.REVIEW_CANVAS_AWS_REGION || 'ap-northeast-1' }}
      stack_name: ${{ vars.REVIEW_CANVAS_STACK_NAME || 'ReviewCanvas' }}
      default_branch: ${{ vars.REVIEW_CANVAS_DEFAULT_BRANCH }}
      branch: ${{ inputs.branch || '' }}
      all: ${{ inputs.all || false }}
```

| 入力                              | 既定                                  | 内容                                                                                                                                                                                |
| --------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review_canvas_ref`               | （必須）                              | 置く手順を取り出す review-canvas のコミット（40 桁の SHA でなければ止める）                                                                                                         |
| `review_canvas_repository`        | `ShuntaToda/review-canvas`            | 置く手順を取り出す review-canvas のリポジトリ（`uses:` の `@` の前と同じもの）                                                                                                      |
| `config`                          | `review-canvas.config.json`           | 使う側のリポジトリの根からの設定ファイルの場所                                                                                                                                      |
| `role_arn`                        | 空                                    | 既定のブランチ以外を置くロール（出力 `PublishRoleArn`）。空なら（`roles_from_secrets` でなければ）どのジョブも動かさない                                                            |
| `main_role_arn`                   | 空                                    | 既定のブランチを置くロール（出力 `PublishMainRoleArn`）                                                                                                                             |
| `aws_region`                      | `ap-northeast-1`                      | スタックのリージョン                                                                                                                                                                |
| `stack_name`                      | `ReviewCanvas`                        | スタックの名前（置き場はこのスタックの出力から読む）                                                                                                                                |
| `default_branch`                  | リポジトリの既定のブランチ            | スタックの `DefaultBranch` と同じ値                                                                                                                                                 |
| `environment`・`main_environment` | `review-canvas`・`review-canvas-main` | ジョブの GitHub Environment（ロールの信頼ポリシーと同じ名前）                                                                                                                       |
| `branch`・`all`                   | 空・false                             | workflow_dispatch の入力を渡す                                                                                                                                                      |
| `node_version`・`pnpm_version`    | `24`・`10.24.0`                       | ビルドに使う Node.js・pnpm                                                                                                                                                          |
| `install_command`                 | `pnpm install --frozen-lockfile`      | 使う側のリポジトリで依存を入れるコマンド                                                                                                                                            |
| `publish_unpublished_on_push`     | false                                 | push のとき、置いていないブランチも置く（`watchPaths` が変わったとき。新しいブランチは変わったとみなす）                                                                            |
| `roles_from_secrets`              | false                                 | ロールの ARN を、入力ではなく Secret の `aws_role_arn`・`aws_main_role_arn` から受ける（`role_arn` が空でも動かす）。公開リポジトリで、Actions の記録にアカウント ID を出さないとき |

`roles_from_secrets` のときは、呼ぶジョブに `secrets: { aws_role_arn: …, aws_main_role_arn: … }` を書き、`with` の `roles_from_secrets` に有効にするかを渡します（このリポジトリの `.github/workflows/storybook.yml` が例）。どちらの渡し方でも、資格情報を取った後はアカウント ID を伏せ字にします（`mask-aws-account-id`）。

Environment・ロール・変数の用意は [github-aws-permissions.md](github-aws-permissions.md)、動き方は [publishing.md](publishing.md#github-actions-から置く) にあります。

## CDK に組み込む

そのまま出すときは、このリポジトリの CDK アプリ（`pnpm run deploy`。[deploy.md](deploy.md)）を使います。使う側の CDK アプリに組み込むときは、コンストラクト `ReviewCanvas`（`infra/lib/index.ts`）を使います。

```ts
import { Stack, type StackProps } from "aws-cdk-lib";
import type { Construct } from "constructs";
import {
  loadReviewCanvasConfig,
  readSettings,
  ReviewCanvas,
} from "<review-canvas を取り出した場所>/infra/lib";

export class ToolsStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);
    const settings = readSettings({
      context: (key) => this.node.tryGetContext(key),
      env: process.env,
    });
    new ReviewCanvas(this, "ReviewCanvas", {
      settings: { ...settings, stackName: this.stackName },
      config: loadReviewCanvasConfig("review-canvas.config.json"),
    });
  }
}
```

- 1 つのスタックに 1 つだけ置けます（出力の名前 `Url`・`StorybookBucket` などを固定するため。置くスクリプトとワークフローはこの名前で読む）
- 画面のビルド結果（`dist-deployed`）は review-canvas の側で `pnpm run build:deployed` してから組み立てます。Lambda のバンドルも review-canvas の `pnpm-lock.yaml` と、review-canvas の根に入れた esbuild で行います（review-canvas を取り出した場所で `pnpm install` しておく）
- `aws-cdk-lib`・`constructs` は使う側と同じ版の 1 つの実体を読むようにしてください（別の実体だと、コンストラクトとして認められない）。たとえば使う側の `package.json` で `"aws-cdk-lib": "link:<review-canvas を取り出した場所>/infra/node_modules/aws-cdk-lib"`（`constructs` も同じ形）にします
- `settings.stackName` はロールの名前の頭とコメントに使います。`protectedAccountIds` の確かめ（`assertDeployAccount`）は、使う側のアプリで呼んでください

## 見られる人を絞る（IP 制限・ログイン連動）

何も指定しなければ、キャンバスの画面と Storybook のファイル・画像は、URL を知っていればだれでも読めます（コメントの読み書きはログインが要る）。Storybook を関係者の外に見せたくないときは、構築するときに次の 2 つを選べます（どちらか片方でも、両方でも）。値は、ほかの設定と同じく環境変数か CDK のコンテキストで渡します（[deploy.md](deploy.md#設定)）。指定しなければ、今までと同じ構成のままです。

|                                                  | IP 制限                                                                                                 | ログイン連動（独自ドメイン）                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 止めるもの                                       | 許可していない IP からの、キャンバスの画面・API・Storybook・画像・目録のすべて（403）                   | ログインしていない人の、Storybook のファイル・画像・目録（403）。キャンバスの画面のファイルは読める（中身は持たない。API は今までどおりログインが要る） |
| 向いているとき                                   | 見る人が、決まった拠点・VPN から開く                                                                    | 見る人の場所が決まっていない。独自ドメインと証明書を用意できる                                                                                          |
| 要るもの                                         | 許可する IP の範囲                                                                                      | 同じ親ドメインの下の 2 つのドメイン・us-east-1 の ACM の証明書・署名用の鍵の対                                                                          |
| 費用の目安（月。AWS の料金表で確かめてください） | Web ACL 5 USD ＋ ルール 1 USD × 1〜2（IPv4・IPv6）＋ 要求 100 万件あたり 0.60 USD                       | 追加の料金はほぼ無し（ACM の公開証明書・キーグループ・SSM の標準のパラメータは無料。Route 53 のホストゾーンを新しく作るなら 0.50 USD）                  |
| 気を付けること                                   | AI・CI（M2M の client）や GitHub Actions の外から API を呼ぶ道具も、許可した IP からでないと 403 になる | クッキーを付ける親ドメインの下の、ほかのホストにもクッキーが送られる（下の「ドメインの決め方」）                                                        |

### IP 制限（AWS WAF）

```bash
REVIEW_CANVAS_ALLOWED_IP_CIDRS=203.0.113.0/24,2001:db8:1234::/48 \
pnpm run deploy --profile <プロファイル>
```

- `REVIEW_CANVAS_ALLOWED_IP_CIDRS`（`-c allowedIpCidrs=`）に、許可する IP の範囲（CIDR。IPv4・IPv6。カンマ区切り）を渡すと、それだけを通す Web ACL を作り、キャンバスと Storybook の 2 つの配信に付けます。1 つの IP は `/32`（IPv6 は `/128`）で書きます。`/0` は使えません
- IPv6 でつながる人がいるなら、IPv6 の範囲も入れてください（CloudFront は IPv6 でも受けるので、IPv4 だけを許可すると、IPv6 でつないだ人が 403 になります）
- CloudFront 用の Web ACL は us-east-1 にしか作れません。出し先が us-east-1 ならスタックは 1 つのまま、ほかのリージョンなら Web ACL だけのスタック `<スタック名>-Waf` を us-east-1 に一緒に作ります（`pnpm run deploy`・`destroy` は 2 つとも扱います）。その場合は、us-east-1 でも一度 `cdk bootstrap aws://<アカウント ID>/us-east-1 --profile <プロファイル>` をしておいてください。ARN は CDK のリージョンをまたぐ参照で渡すので、2 つのリージョンに受け渡し用の小さなリソース（Lambda と SSM のパラメータ）が増えます
- 自分で用意した Web ACL を使うときは、範囲の代わりに `REVIEW_CANVAS_WEB_ACL_ARN`（`-c webAclArn=`。CloudFront 用＝us-east-1 の `global` のもの）を渡します。Web ACL は作らず、渡したものを 2 つの配信に付けます（範囲と同時には指定できません）
- 範囲を変えるときは、値を変えて出し直します。やめるときは、指定を外して出し直します
- **us-east-1 以外で使っていて、やめる・片付けるとき**は、`<スタック名>-Waf` のスタックが us-east-1 に残らないようにします。CDK は、範囲を付けずに組み立てるとそのスタックを知らないので、`deploy`・`destroy` のどちらでも消しません（消し忘れると、Web ACL の月額が掛かり続ける）
  - 片付ける（`destroy`）ときは、**入れたときと同じ `REVIEW_CANVAS_ALLOWED_IP_CIDRS` を付けて** `pnpm run destroy --profile <プロファイル>` を動かします（2 つとも消える）
  - IP 制限だけをやめるときは、指定を外して出し直した**あとに**、残ったスタックを消します（先に消すと、配信が使っているので失敗する）: `aws cloudformation delete-stack --stack-name <スタック名>-Waf --region us-east-1 --profile <プロファイル>`（CloudFormation のコンソールの us-east-1 から消しても同じ）
  - 範囲を付けずに `destroy` してしまったときも、同じコマンドで残ったスタックを消します
- 使う側の CDK アプリに `ReviewCanvas` を組み込むときは、`settings.network.webAclArn` に Web ACL の ARN を渡すか、us-east-1 のスタックなら `settings.network.allowedIpCidrs` を渡します。us-east-1 以外で範囲から作るときは、`ReviewCanvasWafStack`（`infra/lib/index.ts`）を us-east-1 に置き、その `webAclArn` を渡します（両方のスタックに `crossRegionReferences: true`）

### ログイン連動（独自ドメインと署名付きクッキー）

キャンバスにログインした人だけが、Storybook の配信を読めるようにします。キャンバスがログインのあとに API を呼ぶと、API が CloudFront の署名付きクッキーをブラウザに付け、Storybook の配信は、そのクッキーの無い要求を 403 にします。

**ドメインの決め方**: キャンバス用と Storybook 用の 2 つのドメインを、同じ親ドメインの下に用意し（例: `canvas.review.example.com` と `sb.review.example.com`）、クッキーを付ける親ドメインを `REVIEW_CANVAS_COOKIE_DOMAIN`（例: `review.example.com`）で渡します。クッキーは、この親ドメインの下のどのホストにも送られます。そのため、親ドメインは 2 つのドメインから自動では決めず、使う側が明示で渡します（渡さないと組み立てで止まる）。**review-canvas 専用のサブドメイン**（例の `review.example.com`。その下には `canvas` と `sb` だけを置く）にしてください。登録しているドメインそのもの（`example.com`。ゾーンの頂点）を渡すと、`www.example.com` など兄弟のホストすべてにクッキーが送られ、そのホストを動かしている人・そこで動くスクリプトの置き主が、Storybook を読めるクッキーを受け取れます。`co.jp`・`github.io` のような、だれでも下にホストを持てるドメインも使えません（ブラウザがクッキーを受け付けない）。2 つを同じドメインにすることはできません（Storybook のコードからログインのトークンを守るため、オリジンを分けています）。

1. us-east-1 の ACM で、2 つのドメインを含む証明書（例: `*.review.example.com`）を発行する
2. 署名用の鍵の対（RSA 2048）を作り、秘密鍵を、出し先のリージョンの SSM パラメータストアに SecureString で入れる。秘密鍵のファイルは、入れたら消す（リポジトリに置かない）

   ```bash
   openssl genrsa -out storybook-cookie-key-1.pem 2048
   openssl rsa -pubout -in storybook-cookie-key-1.pem -out storybook-cookie-key-1.pub.pem
   aws ssm put-parameter --name /review-canvas/storybook-cookie-key-1 --type SecureString \
     --value file://storybook-cookie-key-1.pem --profile <プロファイル>
   rm storybook-cookie-key-1.pem
   ```

3. 6 つの値を付けて出す

   ```bash
   REVIEW_CANVAS_CANVAS_DOMAIN=canvas.review.example.com \
   REVIEW_CANVAS_STORYBOOK_DOMAIN=sb.review.example.com \
   REVIEW_CANVAS_COOKIE_DOMAIN=review.example.com \
   REVIEW_CANVAS_CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-4000-8000-000000000000 \
   REVIEW_CANVAS_STORYBOOK_PUBLIC_KEY_FILES=./storybook-cookie-key-1.pub.pem \
   REVIEW_CANVAS_STORYBOOK_PRIVATE_KEY_PARAMETER=/review-canvas/storybook-cookie-key-1 \
   pnpm run deploy --profile <プロファイル>
   ```

4. DNS を向ける。Route 53 のホストゾーンを `REVIEW_CANVAS_HOSTED_ZONE_ID`・`REVIEW_CANVAS_HOSTED_ZONE_NAME`（例: `Z0123456789ABCDEFGHIJ`・`example.com`）で渡すと、2 つのドメインのレコード（A・AAAA のエイリアス）を作ります。渡さなければ、出力の `DistributionDomainName`・`StorybookDistributionDomainName` へ、自分の DNS で CNAME を張ります
5. Auth0 の Application の Allowed Callback URLs・Allowed Logout URLs・Allowed Web Origins を、新しい `Url`（`https://canvas.review.example.com`）に変える（[auth0.md](auth0.md)）。GitHub Actions・手元から置く手順は変わりません（置き場は同じ）

- 6 つの値（2 つのドメイン・クッキーを付ける親ドメイン・証明書・公開鍵のファイル・秘密鍵のパラメータの名前）は、そろえて渡します（一部だけだと組み立てで止まる）。どれも渡さなければ、今までと同じ構成です
- 鍵は使う側が作ります。CDK が作るのは、公開鍵（CloudFront の公開鍵とキーグループ）だけで、秘密鍵は CloudFormation にも CDK の出力にも出ません。秘密鍵を読めるのは API の Lambda だけです（`ssm:GetParameter` を、そのパラメータにだけ付ける）。SecureString を自分の KMS の鍵で暗号化したときは、Lambda のロールに `kms:Decrypt` を足してください（既定の鍵 `alias/aws/ssm` なら要りません）
- クッキーの期限は 30 分です。画面は、開いたとき・ウィンドウに戻ったとき・10 分ごとにもらい直すので、開いているあいだは切れません。長く閉じていたタブに戻った直後は、もらい直すまでの一瞬、iframe・画像が 403 になることがあります（読み直すと出ます）
- **ログアウト**すると、画面は API を呼んでクッキーをブラウザから消してからログアウトします。CloudFront の署名付きクッキーは、発行した後にサーバーの側から取り消せないので、消す前に写し取られたクッキーは期限（最長 30 分）まで使えます。すぐに全員の分を止めたいときは、下の手順で鍵を入れ替え、古い公開鍵を残さずに出します
- **鍵を入れ替える**とき: 新しい鍵の対を作り、秘密鍵を別の名前のパラメータ（例: `/review-canvas/storybook-cookie-key-2`）に入れ、`REVIEW_CANVAS_STORYBOOK_PUBLIC_KEY_FILES=<新しい公開鍵>,<前の公開鍵>`・`REVIEW_CANVAS_STORYBOOK_PRIVATE_KEY_PARAMETER=<新しい名前>` で出します（先頭の公開鍵が、署名に使う鍵。2 つ目からは、前の鍵で署名したクッキーを期限まで通すために残す）。30 分より後に、前の公開鍵を外して出し直し、前のパラメータを消します。API は秘密鍵を Lambda の実行環境のあいだ持つので、同じ名前のパラメータの中身だけを書き換えても、すぐには切り替わりません（名前ごと変える）
- AI・CI（M2M の client）は API だけを呼ぶので、クッキーは要りません。API も client にはクッキーを出しません（`POST /api/storybook-session` は 403）。Storybook のファイルを道具から直に読むことは、クッキーが無いのでできなくなります
- やめるときは、6 つの値を外して出し直します（配信のドメインは `*.cloudfront.net` に戻る。Auth0 の URL も戻す）

仕組みと、守れること・守れないことは [security.md](security.md#見られる人を絞る選べる仕組み) にあります。
