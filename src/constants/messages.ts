/**
 * 手元（pnpm run dev・serve）・テストのビルドか。手元でだけ役に立つ手順（コマンド・DynamoDB Local など）は、
 * デプロイ先のビルドでは出さない（レビューする人には打てないため）
 */
const LOCAL_BUILD = import.meta.env.MODE !== "deployed";

/** 手元でだけ出す手順（デプロイ先のビルドでは null） */
export const localHints = {
  /** API に届かないとき */
  apiDown: LOCAL_BUILD
    ? "手元では `pnpm run serve`（開発中は `pnpm run dev`）で起動しているか確かめてください。"
    : null,
  /** Storybook のビルド結果が無いとき */
  buildStorybook: LOCAL_BUILD ? "pnpm run build:storybook" : null,
} as const;

/**
 * 画面に出す文言のうち、複数の場所で使うもの・API の失敗に対応するもの
 */
export const messages = {
  /** 本人以外の編集・削除（CommentNotAuthorError） */
  notAuthor: "自分が書いたコメントだけを編集・削除できます",
  /** ブランチのコメント数の上限（CommentLimitExceededError） */
  limitExceeded: "このブランチのコメント数が上限に達しています",
  /** 解決済みのスレッドへの AI 修正済みの印の付け外し（CommentAlreadyResolvedError） */
  alreadyResolved: "このスレッドはすでに解決済みです",
  /** 対象のコメントが無い（404） */
  notFound: "このコメントは削除されました",
  /** 開いていた・リンクで開いたスレッドが、いまのブランチのコメントに無い */
  threadNotFound:
    "このコメントは見つかりません（削除されたか、別のブランチのコメントです）",
  /** ログインの期限切れ・トークンを取得できない（401） */
  unauthorized: "ログインの期限が切れました。ログインし直してください",
  /** 使ってよい人ではない（ReviewerNotAllowedError。403） */
  notAllowed:
    "このアカウントでは使えません。招待されたアカウントでログインしてください",
  /** URL の ?branch= が API の受け付けない名前 */
  invalidBranch: (branch: string) =>
    `ブランチ名「${branch}」は開けません。英数字で始まり、英数字と . _ - / だけの名前（.. を含まない・200 文字まで）にしてください`,
  /** コメントの読み込みが失敗し、読み直している（サーバーが落ちている等） */
  commentsRetrying: `コメントを読めません。10 秒ごとに読み直します${
    LOCAL_BUILD
      ? "（手元では API と DynamoDB Local が動いているか確かめてください）"
      : ""
  }`,
  /** コメントの読み込みが 400（読み直しても通らない） */
  commentsInvalid:
    "コメントを読めません（要求を受け付けられませんでした）。URL のブランチを確かめ、ページを開き直してください",
  /** 入力の誤り（400） */
  invalid: "入力を確かめてください",
  /** サーバーにつながらない（fetch そのものの失敗） */
  network: LOCAL_BUILD
    ? "サーバーに接続できません。起動しているか確かめてください"
    : "サーバーに接続できません。少し待ってから、もう一度試してください",
  /** そのほかの失敗 */
  failed: (status: number) => `通信に失敗しました（${status}）`,
  /**
   * 「変わった画面だけ」で並べる画面が無い（画面の一覧とキャンバス。文字の絞り込みと重ねたときは、その語を添える）。
   * 文の終わりの「。」は、出す場所の書き方に合わせて付ける
   */
  noChangedStories: (query: string, compareBase: string) =>
    query === ""
      ? `${compareBase} から変わった画面はありません`
      : `「${query}」に当たる、変わった画面はありません`,
} as const;
