# Auth0 の設定

デプロイ先の review-canvas は、Auth0 のアクセストークンでログインを確かめます（手元では擬似ログインなので、Auth0 は要りません）。
ログインはメールのワンタイムコード（パスワードレス）だけにし、使う人はこちらで作って招待します。

review-canvas だけに使う **専用の Auth0 テナント**を作る前提で書きます（ほかのアプリのテナントと分けておけば、ここでの設定がほかのアプリのログインに影響しません）。テナントに、次のものを作ります。

1. **API**（Applications → APIs → Create API）
   - Identifier: 任意の URL の形の値（例: `https://review-canvas.example.com/api`）。これが `REVIEW_CANVAS_AUTH0_AUDIENCE`
   - Signing Algorithm: RS256
   - Token Expiration: 86400 秒（24 時間）以下（API はこれより長いトークンを 401 にする）
   - Allow Offline Access: オン（画面は更新用トークンを使う）
2. **Application**（Applications → Create Application → Single Page Web Applications）
   - Allowed Callback URLs・Allowed Logout URLs・Allowed Web Origins: デプロイの出力 `Url`（`https://<配信のドメイン>`。末尾の `/` なし）。初回は URL が分からないので、1 度デプロイしてから入れる
   - Refresh Token Rotation: オン
   - Domain・Client ID が `REVIEW_CANVAS_AUTH0_DOMAIN`・`REVIEW_CANVAS_AUTH0_CLIENT_ID`
3. **API を Application から使えるようにする**（Applications → APIs → 1. の API → Application Access → 2. の Application の **User Access** を **Authorized**）
   - 新しいテナントでは既定で許可されておらず、ログインが `invalid_request`（`Client "..." is not authorized to access resource server "..."`）で失敗する

## 使える人（招待した人だけ）

入口は **テナントの側で絞ります**。ログインは **メールのワンタイムコード（パスワードレス）** だけにし、次の 3 つがそろって、招待した人だけが使えます（下の「ログインの方法」）。

1. パスワードレスの接続 `email` の **Disable Sign Ups** をオン（自分で登録させない）
2. Application で有効にする接続は **`email` だけ**（`Username-Password-Authentication`・ソーシャルログインはオフ）
3. 使う人はこちらで作って招待する（User Management → Users → Create User。Connection は `email`）

API はそのうえで、アクセストークンに載った **メールアドレスが確かめ済み（`email_verified` が true）** であることを求めます。確かめ済みでなければ 403（`ReviewerNotAllowedError`）を返し、画面は「このアカウントでは使えません。招待されたアカウントでログインしてください」と「別のアカウントでログイン」を出します。メールのコードでログインできた時点でメールアドレスは確かめ済みになります。

- メールアドレスのドメインでは絞りません（`REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS` の既定は `*`。どのドメインも通す）。ドメインやメールアドレスで絞りたくなったら、`REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS`（例: `example.co.jp`）・`REVIEW_CANVAS_ALLOWED_EMAILS` を指定します（[deploy.md](deploy.md)）。ドメインは `@` の後ろ全体の完全一致で、大文字・小文字は区別しません
- アクセストークンには既定でメールアドレスが載らないため、次の Post Login の Action で載せます。**Action は必須です**（無いと全員 403）。手元の擬似ログインでは確かめません

**Post Login の Action**（Actions → Library → Build Custom → Login / Post Login。作ったら Actions → Triggers → post-login に置く）:

- Secrets に `REVIEW_CANVAS_CLIENT_ID`（2. の Client ID）を入れる。Action はこの Application のログインのときだけ動き、ほかの Application には何もしない（専用のテナントでも、あとから Application を足したときの安全のため）
- 既定では拒まず、API が読むクレームを載せるだけです。ドメイン・メールアドレスでログインの時点から拒みたいときは、コメントにした部分を戻します（API の `REVIEW_CANVAS_ALLOWED_*` と同じ一覧にする）

```js
const NAMESPACE = "https://review-canvas/";

// （任意）ログインの時点で、ドメイン・メールアドレスで拒むときに使う。API の REVIEW_CANVAS_ALLOWED_* と同じにする
// const ALLOWED_DOMAINS = ["example.co.jp"];
// const ALLOWED_EMAILS = [];

exports.onExecutePostLogin = async (event, api) => {
  // review-canvas の Application のログインのときだけ動く
  if (event.client.client_id !== event.secrets.REVIEW_CANVAS_CLIENT_ID) return;

  const email = (event.user.email ?? "").trim().toLowerCase();

  // （任意）ドメイン・メールアドレスで拒む
  // const parts = email.split("@");
  // const allowed =
  //   event.user.email_verified === true &&
  //   parts.length === 2 &&
  //   parts[0] !== "" &&
  //   (ALLOWED_DOMAINS.includes(parts[1]) || ALLOWED_EMAILS.includes(email));
  // if (!allowed) {
  //   api.access.deny("このアカウントでは使えません。招待されたアカウントでログインしてください");
  //   return;
  // }

  // API が読むクレーム（メールアドレス・確かめ済みか・表示名）をアクセストークンに載せる
  api.accessToken.setCustomClaim(`${NAMESPACE}email`, email);
  api.accessToken.setCustomClaim(
    `${NAMESPACE}email_verified`,
    event.user.email_verified === true,
  );
  api.accessToken.setCustomClaim(
    `${NAMESPACE}name`,
    event.user.name ?? event.user.email,
  );
};
```

コメントにした部分を戻して Action で拒まれると、画面は「ログインできませんでした（このアカウントでは使えません。招待されたアカウントでログインしてください）」と「ログインし直す」を出します。

## ログインの方法（メールのワンタイムコード・招待制）

ログインはメールに届くワンタイムコード（パスワードレス）だけにし、使う人はこちらで作って招待します（自分では登録させない。パスワードは持たせない）。

1. Authentication → Passwordless → **Email** をオンにし、接続 `email` を作る。設定で **Disable Sign Ups** をオンにする（OTP の長さ・有効期限は既定のままでよい）
2. Applications → 2. の Application → Connections で、**`email` だけ**を有効にする（`Username-Password-Authentication` とソーシャルログインはすべてオフ）。ログインの画面は Universal Login（Identifier First）を使う
3. 使う人を招待する: User Management → Users → **Create User**（Connection は **`email`**、メールアドレスだけを入れる）。本人には「ログインの画面でメールアドレスを入れると、コードがメールで届く」と伝える

ログインのたびにメールのコードで本人を確かめるので、`email_verified` は最初のログインで true になります。**最初の 1 人を招待したら、ログインの後に User Management → Users → その人の `email_verified` が true になっているかを確かめてください。**

Post Login の Action（上）は**必ず置いてください**。API が読むメールアドレス・確かめ済みかのクレームは Action だけが載せるので、置かないとだれも使えません（全員 403）。

## 使う人を足す・外す

- 足す: User Management → Users → **Create User**（Connection は `email`、メールアドレスだけを入れる）。本人には「ログインの画面でメールアドレスを入れると、コードがメールで届く」と伝える
- 外す: 同じ画面でその人を **Block** するか削除する。発行済みのアクセストークンは期限（API の Token Expiration）まで使えるので、すぐに止めたいときは Token Expiration を短くしておく
- ドメイン・メールアドレスで絞るときは、API の `REVIEW_CANVAS_ALLOWED_EMAIL_DOMAINS`・`REVIEW_CANVAS_ALLOWED_EMAILS`（[deploy.md](deploy.md)）と、Post Login の Action のコメントにした部分を同じ一覧にする

## AI が呼ぶ（M2M のトークン）

AI（コーディングエージェント）・CI が、人の代わりに API を呼ぶ（未解決のコメントを読む・返信する・「AI 修正済み」の印を付ける。[api.md](api.md#ai-が直して返すスレッドの状態)）ときは、人のログインを使い回さず、Auth0 の **Machine to Machine（client credentials）** のトークンを使います。既定ではどの client も通しません。**テナントで許可し、さらに review-canvas の設定に挙げた client だけ**が通ります。

1. **Machine to Machine Application を作る**（Applications → Create Application → Machine to Machine Applications）。名前は用途が分かるもの（例: `review-canvas-fixer`）。使う API に上の 1. の API を選ぶ（Permissions は要りません）
   - これで Applications → APIs → 1. の API → Application Access で、その Application の **Client Access** が Authorized になります（外すとトークンを取れなくなります）
   - Client ID と Client Secret を控える。**Client Secret は秘密**です（リポジトリ・設定ファイル・書き出しに置かない。CI のシークレットや手元の環境変数で渡す）
2. **review-canvas に client を挙げる**: `REVIEW_CANVAS_M2M_CLIENTS`（`-c m2mClients=`）に `<Client ID>:<表示名>` をカンマ区切りで指定して出し直す（[deploy.md](deploy.md)）

   ```bash
   # いつもの値（REVIEW_CANVAS_AUTH0_* など）に足して出す
   REVIEW_CANVAS_M2M_CLIENTS=<Client ID>:fixer pnpm run deploy --profile <プロファイル>
   ```

   - 表示名は文字・数字・空白・`.`・`_`・`-` の 30 文字まで。コメントの書いた人・印を付けた人には「AI（fixer）」と残ります
   - 挙げていない client のトークンは 403（`ReviewerNotAllowedError`）です。`*` のような「どの client も通す」書き方はありません

3. **トークンを取る**（client credentials）

   ```bash
   curl -sS --request POST "https://<テナントのドメイン>/oauth/token" \
     --header "content-type: application/json" \
     --data '{"client_id":"<Client ID>","client_secret":"<Client Secret>","audience":"<API の Identifier>","grant_type":"client_credentials"}'
   ```

   返ってきた `access_token` を `X-Authorization: Bearer <access_token>` で送ります。MCP サーバー（[ai.md](ai.md)）は、Client ID・Client Secret を環境変数で渡せばトークンを自分で取り、期限まで使い回します

API は client のトークンを次のように確かめます（`api/infrastructure/auth/m2m-clients.ts`）。

- 署名・発行元・宛先・期限は人のトークンと同じ（RS256・JWKS・有効期限は 24 時間まで）
- `gty` が `client-credentials` か、`sub` が `@clients` で終わるトークンは client のものとして扱い、人の確かめ（メールアドレス）には回しません。`azp`（Client ID）が設定の一覧にあり、`sub` が `<azp>@clients` のものだけを通します
- 利用者 ID は `sub`（`<Client ID>@clients`）、表示名は設定の「AI（表示名）」です。トークンの中の名前・メールアドレスのクレームは読みません
- client ができることは人と同じです（読む・書く・返信・解決／再開・印の付け外し。編集・削除は自分が書いたコメントだけ）。書いたコメント・付けた印には利用者 ID が残るので、あとからどの client が何をしたかを確かめられます

**止めるとき**: 設定から外して出し直す（すぐに 403 になります）か、Auth0 で API の Client Access を外す・Client Secret を入れ替える（発行済みのトークンは期限まで有効なので、急ぐときは設定から外すほうが確かです）。

- M2M のトークンの発行数は Auth0 のプランで上限があります。呼ぶたびに取り直さず、期限（`expires_in`）まで使い回してください
- 手元（擬似ログイン）では client の確かめはありません。MCP サーバーは擬似のトークンを自分で作ります（[ai.md](ai.md)）
