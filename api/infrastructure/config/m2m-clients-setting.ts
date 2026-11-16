/**
 * 人の代わりに API を呼んでよい client（Auth0 の Machine to Machine Application）。
 * AI（コーディングエージェント）・CI が client credentials で取ったトークンを、ここに挙げた client の分だけ通す
 */
export type M2mClient = {
  /** Auth0 の Application の Client ID（トークンの azp） */
  clientId: string;
  /** 表示名。コメントの書いた人・印を付けた人には「AI（<これ>）」と残す */
  name: string;
};

/** Client ID の形（Auth0 の Client ID は英数字 32 文字。区切りの , : と紛れない文字だけを受ける） */
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * 表示名の形。文字・数字で始まり、文字・数字・空白・`.`・`_`・`-` の 30 文字まで
 * （書き出しの Markdown に記号を持ち込まない。区切りの , : も含められない）
 */
const CLIENT_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,29}$/u;

/**
 * 設定（AUTH0_M2M_CLIENTS。`<Client ID>:<表示名>` のカンマ区切り）を一覧にする。未設定・空ならだれも通さない（空の一覧）。
 * 形の誤り・同じ Client ID の重なりは例外（入口が起動時に止まる。誤った設定のまま、通すつもりの無い client を通さない）。
 * CDK（infra/lib/settings.ts）も同じ関数で確かめるため、このファイルは `@/` の読み込みを持たない
 *
 * @example 'AbCdEf0123456789AbCdEf0123456789:fixer'
 */
export const parseM2mClients = (
  raw: string | undefined,
  /** 例外の文言に出す設定の名前（CDK は自分の設定の名前を渡す） */
  settingName = "AUTH0_M2M_CLIENTS",
): M2mClient[] => {
  const clients = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const separator = entry.indexOf(":");
      const clientId = separator < 0 ? "" : entry.slice(0, separator).trim();
      const name = separator < 0 ? "" : entry.slice(separator + 1).trim();
      if (
        !CLIENT_ID_PATTERN.test(clientId) ||
        !CLIENT_NAME_PATTERN.test(name)
      ) {
        throw new Error(
          `${settingName} は <Client ID>:<表示名> をカンマ区切りで指定してください（表示名は文字・数字・空白・._- の 30 文字まで）: "${entry}"`,
        );
      }
      return { clientId, name };
    });
  const duplicated = clients.find(
    ({ clientId }, index) =>
      clients.findIndex((c) => c.clientId === clientId) !== index,
  );
  if (duplicated !== undefined) {
    throw new Error(
      `${settingName} に同じ Client ID が 2 つあります: "${duplicated.clientId}"`,
    );
  }
  return clients;
};

/** 一覧を設定の形（`<Client ID>:<表示名>` のカンマ区切り）に戻す（CDK が API の環境変数へ渡す） */
export const formatM2mClients = (clients: ReadonlyArray<M2mClient>): string =>
  clients.map(({ clientId, name }) => `${clientId}:${name}`).join(",");
