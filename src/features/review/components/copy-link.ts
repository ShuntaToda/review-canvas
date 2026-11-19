/**
 * リンクをコピーし、結果をお知らせで伝える（スレッド・コメント一覧の「リンク」と、画面の見出しの「この画面のリンクをコピー」）
 */
export const copyLinkWithToast = (
  url: string,
  notify: (message: string) => void,
): Promise<void> =>
  navigator.clipboard
    .writeText(url)
    .then(() => notify("リンクをコピーしました"))
    .catch(() => notify("リンクをコピーできませんでした"));
