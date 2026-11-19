import type { RowPlacement } from "./layout";
import type { Story } from "./storybook";

/**
 * 左の画面の一覧の木。タイトルを「/」で区切り、最後の段を画面、その上の段をフォルダにする
 * （`Shop/Order/Form` なら Shop › Order › Form）。区切りの無いタイトルは、フォルダに入れずに一番上に置く
 */
export type StoryTreeNode =
  | {
      kind: "folder";
      /** この段の名前 */
      name: string;
      /** 一番上からのフォルダのパス（`Shop/Order`。見せる範囲・開閉を覚える鍵） */
      path: string;
      children: StoryTreeNode[];
    }
  | {
      kind: "screen";
      /** 最後の段（今の見出し） */
      name: string;
      row: RowPlacement;
    };

/** タイトルの段（前後の空白を除き、空の段は捨てる） */
const segmentsOf = (title: string): string[] =>
  title
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

/**
 * キャンバスの並びのまま木にする。フォルダは、その中で最初に出る画面の位置に置く
 * （同じフォルダの画面がキャンバスで離れて並んでいても、1 つのフォルダにまとめる）
 */
export const buildStoryTree = (
  rows: ReadonlyArray<RowPlacement>,
): StoryTreeNode[] => {
  const root: StoryTreeNode[] = [];
  const folders = new Map<string, StoryTreeNode[]>();
  for (const row of rows) {
    const segments = segmentsOf(row.title);
    const folderSegments = segments.slice(0, -1);
    let children = root;
    for (let depth = 0; depth < folderSegments.length; depth += 1) {
      const path = folderSegments.slice(0, depth + 1).join("/");
      let next = folders.get(path);
      if (next === undefined) {
        next = [];
        folders.set(path, next);
        children.push({
          kind: "folder",
          name: folderSegments[depth] ?? "",
          path,
          children: next,
        });
      }
      children = next;
    }
    children.push({
      kind: "screen",
      name: segments.at(-1) ?? row.title,
      row,
    });
  }
  return root;
};

/**
 * 見せる範囲（フォルダのパス）を、一覧のフォルダのパスと同じ形にする（`Shop/`・`//Shop`・前後の空白 → `Shop`）。
 * 段が残らなければ undefined（どの画面にも合わない）
 */
export const normalizeScope = (scope: string): string | undefined => {
  const path = segmentsOf(scope).join("/");
  return path === "" ? undefined : path;
};

/** タイトルが見せる範囲（フォルダのパス）の中か */
export const isTitleInScope = (title: string, scope: string): boolean => {
  const folder = segmentsOf(scope);
  const segments = segmentsOf(title);
  return (
    folder.length > 0 &&
    segments.length > folder.length &&
    folder.every((segment, index) => segments[index] === segment)
  );
};

/** 見せる範囲の中のストーリーだけにする（範囲が無ければそのまま） */
export const filterStoriesByScope = (
  stories: ReadonlyArray<Story>,
  scope: string | undefined,
): Story[] =>
  scope === undefined
    ? [...stories]
    : stories.filter((story) => isTitleInScope(story.title, scope));

/** 閉じたフォルダ（ページごとのフォルダのパス）。はじめは全部開いているので、閉じたものだけを覚える */
export type CollapsedFolders = Readonly<Record<string, ReadonlyArray<string>>>;

/** ブラウザに覚えた形を読む（形の違う値は捨てる。全体が読めなければ undefined） */
export const parseCollapsedFolders = (
  raw: string,
): CollapsedFolders | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([source, paths]) => [
      source,
      Array.isArray(paths)
        ? paths.filter((path): path is string => typeof path === "string")
        : [],
    ]),
  );
};

/** ページのフォルダを開く・閉じる */
export const toggleCollapsedFolder = (
  collapsed: CollapsedFolders,
  source: string,
  path: string,
): CollapsedFolders => {
  const current = collapsed[source] ?? [];
  return {
    ...collapsed,
    [source]: current.includes(path)
      ? current.filter((p) => p !== path)
      : [...current, path],
  };
};

/**
 * リンク（URL の scope）で開くときの見せる範囲。いま出せる画面（「部品も表示」の入り切りを反映したもの）に
 * 合う画面が無ければ外して知らせる（missing）。リンクで開く画面（スレッド・story=）が範囲の外なら、その画面が見えるように黙って外す
 */
export const resolveInitialScope = (
  raw: string | undefined,
  {
    stories,
    focused,
  }: {
    /** 開くページの、いま出せるストーリー */
    stories: ReadonlyArray<Story>;
    /** リンクで開く画面 */
    focused: Story | undefined;
  },
): { scope: string | undefined; missing: boolean } => {
  if (raw === undefined) return { scope: undefined, missing: false };
  const scope = normalizeScope(raw);
  if (
    scope === undefined ||
    filterStoriesByScope(stories, scope).length === 0
  ) {
    return { scope: undefined, missing: true };
  }
  return {
    scope:
      focused === undefined || isTitleInScope(focused.title, scope)
        ? scope
        : undefined,
    missing: false,
  };
};
