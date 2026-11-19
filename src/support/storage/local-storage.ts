/** 値を覚える先（ブラウザの localStorage か、差し替えたメモリ） */
type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** 差し替えた保存先（無ければブラウザの localStorage） */
let replacedStore: KeyValueStore | undefined;

const currentStore = (): KeyValueStore => replacedStore ?? window.localStorage;

/**
 * ブラウザに覚える値（画面の幅・擬似ログインの名前など）。
 * プライベートウインドウ等で使えないときは、覚えずに既定の値で動かす
 */
export const readLocalStorage = (key: string): string | null => {
  try {
    return currentStore().getItem(key);
  } catch {
    return null;
  }
};

export const writeLocalStorage = (key: string, value: string): void => {
  try {
    currentStore().setItem(key, value);
  } catch {
    // 覚えられなくても動かす
  }
};

export const removeLocalStorage = (key: string): void => {
  try {
    currentStore().removeItem(key);
  } catch {
    // 使えない環境では置かれてもいない
  }
};

/**
 * 覚える先を、空のメモリに差し替える（呼ぶたびに空から始める）。ブラウザの localStorage には残さない。
 * 自身の画面の Storybook が、ストーリーごとに呼ぶ（.storybook/preview.tsx。撮影は 1 つのブラウザで同時に数ページを開くので、
 * あるストーリーが変えた設定をほかのストーリーへ持ち越さないため）。置く版の入口からは呼ばない
 */
export const replaceLocalStorageWithMemory = (): void => {
  const values = new Map<string, string>();
  replacedStore = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
};
