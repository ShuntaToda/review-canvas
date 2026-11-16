/**
 * レビュー用キャンバスの Storybook の配信（キャンバスと別のオリジン）の viewer-request 関数（CloudFront Functions・cloudfront-js-2.0）。
 * キャンバスの画面と同じバケットを読むため、Storybook の置き場（sb/ の下）の外は返さない。
 *
 * - `%` か `//` を含むパス: 404（書き方を変えて、下の判定を抜けさせない。ブランチのキーは `~XX` で書くので `%` を持たない）
 * - サービスワーカーの登録の読み込み（`Service-Worker` ヘッダ付き）で、`/mockServiceWorker.js` 以外: 403
 *   （ブランチの Storybook が自分の置き場のスクリプトを scope `/sb/` 等で登録し、ほかのブランチの応答を差し替えるのを止める）
 * - `/mockServiceWorker.js`: msw のサービスワーカー（`sb/mockServiceWorker.js`。msw-storybook-addon はオリジン直下から読む）
 * - `/sb/<ブランチのキー>/<Storybook の id>`（末尾の / が無い。id は設定の SOURCE_ID_PATTERN の形）: 末尾に / を付けた場所へ移す（301。クエリは保つ）。
 *   S3 にはその名前のファイルが無く 403 になるのと、Storybook の中の相対パスを置き場の下で解決させるため
 * - `/sb/main/shop/`（末尾が /）: その下の `index.html`（Storybook の画面）
 * - `/sb/` の下のそれ以外（`/sb/main/shop/iframe.html` 等）: そのまま S3 へ渡す
 * - それ以外（`/`・`/index.html`・`/app-config.json`・`/assets/x.js` 等。キャンバスの画面のファイル）: 404
 *
 * 単体テストは test/rewrite-function.small.test.ts（vm でこのファイルを読む）
 */
function querySuffix(querystring) {
  var parts = [];
  for (var name in querystring) {
    var entry = querystring[name];
    var values = entry.multiValue ? entry.multiValue : [entry];
    for (var i = 0; i < values.length; i++) {
      parts.push(values[i].value === "" ? name : name + "=" + values[i].value);
    }
  }
  return parts.length === 0 ? "" : "?" + parts.join("&");
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf("%") !== -1 || uri.indexOf("//") !== -1) {
    return { statusCode: 404, statusDescription: "Not Found" };
  }
  var headers = request.headers || {};
  if (headers["service-worker"] && uri !== "/mockServiceWorker.js") {
    return { statusCode: 403, statusDescription: "Forbidden" };
  }
  if (uri === "/mockServiceWorker.js") {
    request.uri = "/sb/mockServiceWorker.js";
    return request;
  }
  if (uri.indexOf("/sb/") !== 0) {
    return { statusCode: 404, statusDescription: "Not Found" };
  }
  if (/^\/sb\/[^/]+\/[a-z0-9][a-z0-9-]{0,31}$/.test(uri)) {
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: {
        location: { value: uri + "/" + querySuffix(request.querystring || {}) },
      },
    };
  }
  if (uri.charAt(uri.length - 1) === "/") {
    request.uri = uri + "index.html";
  }
  return request;
}
