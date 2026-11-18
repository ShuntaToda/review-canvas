# 0002 AWS の構成は S3・CloudFront・Lambda・DynamoDB だけにする

## 状況

- 使う側のリポジトリが、自分の AWS アカウントへ CDK で出して使う（コンストラクト `ReviewCanvas`・そのまま出すアプリ）
- 使う人はレビューに関わる人だけで、置くのはモックのデータで動く Storybook とコメント

## 決めたこと

- 持つのは、S3 のバケット 1 つ・CloudFront の配信 2 つ（画面と API・Storybook）・Lambda 1 つ（API）・DynamoDB のテーブル 1 つ（コメント）と、GitHub Actions から置くためのロール
- アクセスログ・アラームは持たない。要るときは、使う側のスタックに `ReviewCanvas` を組み込んで足す（[deploy.md](../deploy.md#持たないもの)）
- WAF（IP 制限）・独自ドメイン（Storybook のログイン連動）は、既定では作らない。Storybook を関係者の外に見せたくない使い方のために、設定を渡したときだけ作る（[host-setup.md](../host-setup.md#見られる人を絞るip-制限ログイン連動)）
- ログインは外の IdP（Auth0）のアクセストークンを API が確かめる。利用者の台帳は持たない

## 結果

- 常に動く計算資源を持たない（呼ばれたときだけ Lambda が動く）
- `cdk destroy` でバケットごと消える。コメントのテーブルだけ残る
- 監視・防御を足すのは使う側の仕事になる
- スタックの論理 ID・出力の名前は、使う側が頼るので変えない（[development.md](../development.md#リリースと互換性)）
