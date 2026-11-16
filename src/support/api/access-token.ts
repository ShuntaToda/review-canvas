/** API に付けるアクセストークンを返す処理（ログインの窓口の getAccessTokenSilently） */
export type AccessTokenSource = () => Promise<string>;

/**
 * API のクライアント（モジュールに1つ）へ、ログインの窓口のトークンの取り方を渡す口。
 * ログインの入口（AuthGate）がログイン済みになったときに置き、外れたら下ろす。
 * 置かれる前に呼ばれたリクエスト（子の画面の effect は親の effect より先に走る）は、置かれるまで待つ
 */
export const createAccessTokenSlot = () => {
  let current: AccessTokenSource | undefined;
  let waiters: ((source: AccessTokenSource) => void)[] = [];
  return {
    set: (source: AccessTokenSource | undefined): void => {
      current = source;
      if (source === undefined) return;
      const pending = waiters;
      waiters = [];
      pending.forEach((resolve) => resolve(source));
    },
    get: (): Promise<AccessTokenSource> =>
      current !== undefined
        ? Promise.resolve(current)
        : new Promise((resolve) => waiters.push(resolve)),
  };
};

export type AccessTokenSlot = ReturnType<typeof createAccessTokenSlot>;

/** 画面が使うトークンの口（api-client.ts の apiClient が読む） */
export const accessTokenSlot = createAccessTokenSlot();
