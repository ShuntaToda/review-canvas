import { toSafeReturnTo } from "./return-to";

/**
 * 「ログインし直す」で離れた画面（パス・クエリ・ハッシュ）を、次のログインの後に戻る先として覚えておく。
 * Auth0 のログアウトはオリジン（Allowed Logout URLs に載せた値）へしか戻れないため、開いていたページ・スレッド（?page=&comment=）を
 * ここで持ち越す。このタブだけで使う（sessionStorage）。使えない環境では覚えずにトップへ戻る
 */
export const PENDING_RETURN_TO_STORAGE_KEY = "review-canvas.auth.returnTo";

export const savePendingReturnTo = (returnTo: string): void => {
  try {
    window.sessionStorage.setItem(PENDING_RETURN_TO_STORAGE_KEY, returnTo);
  } catch {
    // 覚えられなくてもログインし直せる（戻り先がトップになるだけ）
  }
};

/**
 * 覚えた戻り先を取り出して消す（1 度だけ使う）。同じサイトのパスでなければ使わない（toSafeReturnTo）
 */
export const takePendingReturnTo = (): string | undefined => {
  let stored: string | null;
  try {
    stored = window.sessionStorage.getItem(PENDING_RETURN_TO_STORAGE_KEY);
    window.sessionStorage.removeItem(PENDING_RETURN_TO_STORAGE_KEY);
  } catch {
    return undefined;
  }
  return stored === null ? undefined : toSafeReturnTo(stored);
};
