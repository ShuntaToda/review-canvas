/**
 * 画面に出す文言のうち、複数の場所で使うもの・API の失敗に対応するもの
 */
export const messages = {
  /** 本人以外の編集・削除（CommentNotAuthorError） */
  notAuthor: "自分が書いたコメントだけを編集・削除できます",
  /** ブランチのコメント数の上限（CommentLimitExceededError） */
  limitExceeded: "このブランチのコメント数が上限に達しています",
  /** 対象のコメントが無い（404） */
  notFound: "このコメントは削除されました",
  /** ログインの期限切れ・トークンを取得できない（401） */
  unauthorized: "ログインの期限が切れました。ログインし直してください",
  /** 使ってよい人ではない（ReviewerNotAllowedError。403） */
  notAllowed:
    "このアカウントでは使えません。招待されたアカウントでログインしてください",
  /** URL の ?branch= が API の受け付けない名前 */
  invalidBranch: (branch: string) =>
    `ブランチ名「${branch}」は開けません。英数字で始まり、英数字と . _ - / だけの名前（.. を含まない・200 文字まで）にしてください`,
  /** 入力の誤り（400） */
  invalid: "入力を確かめてください",
  /** サーバーにつながらない（fetch そのものの失敗） */
  network: "サーバーに接続できません。起動しているか確かめてください",
  /** そのほかの失敗 */
  failed: (status: number) => `通信に失敗しました（${status}）`,
} as const;
