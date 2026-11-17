# 0001 画面は静的な SPA、API は Hono を 1 つの Lambda で動かす

## 状況

- Storybook の画面を iframe でキャンバスに並べ、ピンとコメントを重ねるアプリで、画面の中身はブラウザの中で動く（座標・拡大縮小・iframe とのやり取り）
- サーバーが持つのは、コメントの読み書きと、置いてあるブランチの一覧だけ

## 決めたこと

- 画面は React の SPA（vite でビルドした静的なファイル）にし、S3 から CloudFront で配る
- API は Hono（`@hono/zod-openapi`）で書き、1 つの Lambda（関数 URL）で動かす。手元では同じ app を Node のサーバー（`api/handler/api/entrypoint/local/`）で動かす
- サーバー側で画面を描く枠組み（Next.js など）は使っていない

## 結果

- 画面の配信にサーバーの計算が要らない（S3 と CloudFront だけ）。API は `/api/*` だけを受ける
- API の app は入口（local・lambda・cli）から呼ぶだけの関数なので、ハンドラのテスト・OpenAPI の生成がサーバーを起こさずにできる（`buildHandlerTestApp`・`generate-openapi.ts`）
- 画面と API は別々にビルドし、契約（`openapi.json`）でつなぐ（[0005](0005-contract-from-zod.md)）
- サーバー側での描画・ページごとのデータの先読みは持たない

サーバー側で描く枠組みと比べた経緯は、記録に無い。
