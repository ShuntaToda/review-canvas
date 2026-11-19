/**
 * ストーリーの中の URL。キャンバスは状態を URL のクエリ（?branch=・?comment= など）で読み書きするが、
 * ストーリーの中ではそれが Storybook の iframe の URL で、Storybook 自身のクエリ（?id=・?viewMode= など）も持つ。
 * キャンバスが書き換えても Storybook のクエリを残し、ストーリーごとにキャンバスのクエリを置き直す
 */

/** Storybook が iframe の URL に持つクエリ */
const STORYBOOK_PARAMS = ["id", "viewMode", "args", "globals"] as const;

/** 次の URL（相対でもよい）に、今の URL の Storybook のクエリが無ければ足す。返すのはパス・クエリ・ハッシュ */
export const withStorybookParams = (next: string, current: string): string => {
  const url = new URL(next, current);
  const currentParams = new URL(current).searchParams;
  for (const name of STORYBOOK_PARAMS) {
    const value = currentParams.get(name);
    if (value !== null && !url.searchParams.has(name)) {
      url.searchParams.set(name, value);
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
};

/** 今の URL の Storybook のクエリだけを残し、キャンバスのクエリ（search。先頭の ? はあってもなくてもよい）に置き換える */
export const storyUrlOf = (search: string, current: string): string => {
  const url = new URL(current);
  const params = new URLSearchParams();
  for (const name of STORYBOOK_PARAMS) {
    const value = url.searchParams.get(name);
    if (value !== null) params.set(name, value);
  }
  for (const [name, value] of new URLSearchParams(search)) {
    params.set(name, value);
  }
  return `${url.pathname}?${params.toString()}`;
};

/**
 * キャンバスが URL を書き換えても、Storybook のクエリを残すようにする（Storybook の preview で 1 度だけ呼ぶ）。
 * 残さないと、読み直したときに Storybook がどのストーリーを開くか分からなくなる
 */
export const keepStorybookParams = (): void => {
  const replaceState = window.history.replaceState.bind(window.history);
  window.history.replaceState = (data, unused, url) =>
    replaceState(
      data,
      unused,
      url == null
        ? url
        : withStorybookParams(String(url), window.location.href),
    );
};

/** ストーリーを描く前に、キャンバスのクエリを置き直す（前のストーリーのクエリを持ち越さない） */
export const applyStoryUrl = (search: string): void => {
  window.history.replaceState(
    null,
    "",
    storyUrlOf(search, window.location.href),
  );
};

/**
 * ストーリーの通信のうち、MSW を通して（そのまま）読ませてよいもの。この Storybook の置き場の中の、Storybook 自身のファイル
 * （ビルドの読み込み・ストーリーの一覧など）と、置いてあるブランチの置き場（basePrefix）に置いたサンプルのショップの Storybook のファイル
 * （動く画面で開く iframe.html・その読み込み。.storybook/main.ts の staticDirs）。
 * API（api/）と、置き場の画像の目録・画像（review-canvas-shots）は含めない（ストーリーの handler に無ければ止める）
 */
export const isStorybookOwnFile = (
  requestUrl: string,
  storybookUrl: string,
  basePrefix: string,
): boolean => {
  const dir = new URL(".", storybookUrl);
  const url = new URL(requestUrl);
  if (url.origin !== dir.origin || !url.pathname.startsWith(dir.pathname)) {
    return false;
  }
  if (url.pathname.startsWith(basePrefix)) {
    return !/\/review-canvas-shots(\.json$|\/)/.test(url.pathname);
  }
  return !url.pathname.startsWith(`${dir.pathname}api/`);
};
