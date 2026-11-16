import { createContext, use } from "react";

/** 擬似ログインの画面で決めた名前でログインする */
export type CompleteDevLogin = (name: string) => void;

/**
 * 擬似ログインの画面から Provider へログインを伝える口。
 * 本物の Auth0 で「ログインの画面から戻ってきて SDK が状態を作る」部分にあたる
 */
export const DevLoginContext = createContext<CompleteDevLogin | undefined>(
  undefined,
);

export const useCompleteDevLogin = (): CompleteDevLogin => {
  const completeLogin = use(DevLoginContext);
  if (completeLogin === undefined) {
    throw new Error(
      "擬似ログインの画面は DevAuthProvider の内側で使ってください",
    );
  }
  return completeLogin;
};
