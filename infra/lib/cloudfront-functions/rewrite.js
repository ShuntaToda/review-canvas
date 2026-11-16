/**
 * レビュー用キャンバスの画面の配信の viewer-request 関数（CloudFront Functions・cloudfront-js-2.0）。
 * 中身は S3 のファイルなので、ディレクトリを指すパスをその中の index.html に書き換える。
 *
 * - `%` か `//` を含むパス: 404（`/sb%2Fmain/...`・`//sb/...` のような書き方で、下の `/sb` の判定を抜けさせない。
 *   画面のファイルの名前にこれらは無い。バケットのポリシーでも、この配信からは sb/ の下を読めない）
 * - `/sb`・`/sb/...`（Storybook の置き場）: 404。Storybook はキャンバスと別のオリジン（Storybook の配信。storybook-rewrite.js）でだけ配る
 *   （同じバケットにあるが、キャンバスのオリジンでストーリーのコードを動かさない）
 * - `/`（末尾が /）: その下の `index.html`（キャンバスの画面）
 * - 最後のセグメントに拡張子（"."）を持たないパス: キャンバスの画面（`/index.html`。画面は1枚で、状態はクエリで持つ）
 * - それ以外（`/assets/x.js`・`/app-config.json`・`/mockServiceWorker.js` 等）: そのまま S3 へ渡す
 *
 * `/api/*` のビヘイビアには付けない（API のパスを書き換えないため）。単体テストは test/rewrite-function.small.test.ts（vm でこのファイルを読む）
 */
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf("%") !== -1 || uri.indexOf("//") !== -1) {
    return { statusCode: 404, statusDescription: "Not Found" };
  }
  if (uri === "/sb" || uri.indexOf("/sb/") === 0) {
    return { statusCode: 404, statusDescription: "Not Found" };
  }
  if (uri.charAt(uri.length - 1) === "/") {
    request.uri = uri + "index.html";
    return request;
  }
  var lastSegment = uri.substring(uri.lastIndexOf("/") + 1);
  if (lastSegment.indexOf(".") === -1) {
    request.uri = "/index.html";
  }
  return request;
}
