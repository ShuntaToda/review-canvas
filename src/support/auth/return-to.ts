/** 戻り先が使えないときに戻る先（キャンバスのトップ） */
const HOME_PATH = "/";

/**
 * ログイン後の戻り先を、同じサイトのパスに限る。
 * 戻り先は外から与えられうるため、そのまま移ると別のサイトへ誘導できてしまう（オープンリダイレクト）。
 * `/` で始まるものだけを受け付け、`//`・`/\` で始まるものと、解決したオリジンが今のサイトと違うもの・
 * 解決したパスが `//` で始まるものはトップに戻す
 */
export const toSafeReturnTo = (
  returnTo: string | null | undefined,
  origin: string = window.location.origin,
): string => {
  if (
    returnTo == null ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.startsWith("/\\")
  ) {
    return HOME_PATH;
  }
  let resolved: URL;
  try {
    resolved = new URL(returnTo, origin);
  } catch {
    return HOME_PATH;
  }
  if (resolved.origin !== origin || resolved.pathname.startsWith("//")) {
    return HOME_PATH;
  }
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
};

/** ログインの画面から戻るときにアドレスへ付く値（認可コード・状態・失敗）。SDK が戻りとして読むもの */
const authResponseParams = ["code", "state", "error", "error_description"];

/**
 * クエリ（`?a=1` の形）から、ログインの画面から戻るときに付く値を取り除く。
 * 取り除くものが無ければ受け取ったまま返す（並び・書き方を変えない）
 */
export const withoutAuthResponseParams = (search: string): string => {
  const params = new URLSearchParams(search);
  if (!authResponseParams.some((name) => params.has(name))) {
    return search;
  }
  authResponseParams.forEach((name) => params.delete(name));
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
};
