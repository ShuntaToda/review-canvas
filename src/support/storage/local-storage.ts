/**
 * ブラウザに覚える値（画面の幅・擬似ログインの名前など）。
 * プライベートウインドウ等で使えないときは、覚えずに既定の値で動かす
 */
export const readLocalStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeLocalStorage = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // 覚えられなくても動かす
  }
};
