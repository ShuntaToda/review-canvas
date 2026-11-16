import {
  readLocalStorage,
  writeLocalStorage,
} from "@/support/storage/local-storage";

/**
 * 擬似ログインの状態（ログインした名前）。ブラウザ（localStorage）に置き、開き直しても続けて書けるようにする（開発用）。
 * トークンは保存せず、取り出すたびに作る（期限を気にしなくてよいように）
 */
export const DEV_SESSION_STORAGE_KEY = "review-canvas.devAuth.name";

/** 以前の画面（名前を決めるダイアログ）が覚えていた名前のキー。擬似ログインの画面の初期値にだけ使う */
export const LEGACY_AUTHOR_STORAGE_KEY = "review-canvas.author";

/** 名前の上限の文字数（API が表示名を切る長さと同じ） */
export const DEV_NAME_MAX_LENGTH = 50;

/** 名前として使える形にする（前後の空白を落とす）。空・長すぎるときは undefined */
export const normalizeDevName = (raw: string): string | undefined => {
  const name = raw.trim();
  if (name === "" || Array.from(name).length > DEV_NAME_MAX_LENGTH) {
    return undefined;
  }
  return name;
};

/** 保存した名前を読む。無い・読めないときは未ログインとして undefined */
export const readDevSession = (): string | undefined => {
  const stored = readLocalStorage(DEV_SESSION_STORAGE_KEY);
  return stored === null ? undefined : normalizeDevName(stored);
};

export const writeDevSession = (name: string): void => {
  writeLocalStorage(DEV_SESSION_STORAGE_KEY, name);
};

export const clearDevSession = (): void => {
  try {
    window.localStorage.removeItem(DEV_SESSION_STORAGE_KEY);
  } catch {
    // 使えない環境では置かれてもいない
  }
};

/** 擬似ログインの画面の名前の初期値（以前に決めた名前があればそれ） */
export const readInitialDevName = (): string =>
  readLocalStorage(LEGACY_AUTHOR_STORAGE_KEY) ?? "";
