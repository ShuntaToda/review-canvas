import { ChevronDown, ChevronRight, Focus, Search } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useRef } from "react";
import type { RowPlacement } from "../model/layout";
import { buildStoryTree, type StoryTreeNode } from "../model/story-tree";
import type { Story } from "../model/storybook";
import { focusCanvas } from "./canvas-dom";

/** 木の 1 段ごとの字下げ(px) */
const INDENT = 12;

/**
 * 左の画面の一覧。上に絞り込みと、キャンバスと同じ並びの画面（タイトル）・状態（ストーリー）を、
 * タイトルの「/」の段ごとに折りたためる木で出し、下に表示の設定（children）。
 * 状態を押すと、キャンバスがその状態へ移る。フォルダの「ここだけ表示」で、見せる範囲をそのフォルダに絞る
 */
export const StorySidebar = ({
  rows,
  currentStoryId,
  query,
  onQueryChange,
  searchRef,
  onSelectStory,
  scope,
  onScopeChange,
  collapsed,
  onToggleFolder,
  children,
}: {
  /** キャンバスに並べている行（絞り込んだあと。並びもキャンバスと同じ） */
  rows: ReadonlyArray<RowPlacement>;
  /** いま真ん中に見えている状態 */
  currentStoryId: string | undefined;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: Ref<HTMLInputElement>;
  onSelectStory: (story: Story) => void;
  /** 見せる範囲（フォルダのパス。絞っていなければ undefined） */
  scope: string | undefined;
  onScopeChange: (scope: string | undefined) => void;
  /** 閉じたフォルダのパス */
  collapsed: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;
  /** 下に出す表示の設定 */
  children: ReactNode;
}) => {
  const asideRef = useRef<HTMLElement>(null);
  // 範囲を替えると押したボタンが消える（フォーカスが body へ落ちる）ので、替わった後に移す先のフォルダ（無ければ検索欄）
  const pendingFocus = useRef<{
    scope: string | undefined;
    path: string;
  } | null>(null);
  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null || pending.scope !== scope) return;
    pendingFocus.current = null;
    const aside = asideRef.current;
    if (aside === null) return;
    const folder = [
      ...aside.querySelectorAll<HTMLElement>("[data-folder-path]"),
    ].find((element) => element.dataset["folderPath"] === pending.path);
    (
      folder ?? aside.querySelector<HTMLElement>('input[type="search"]')
    )?.focus();
  });
  const changeScope = (next: string | undefined, focusPath: string) => {
    pendingFocus.current = { scope: next, path: focusPath };
    onScopeChange(next);
  };

  return (
    <aside
      ref={asideRef}
      aria-label="画面の一覧"
      data-story-list
      // 狭い幅では、キャンバスの上に重ねて幅いっぱいに出す（右のコメント一覧と同じ）
      className="flex w-full shrink-0 flex-col border-r border-line bg-panel max-md:absolute max-md:inset-0 max-md:z-40 max-md:w-full max-md:border-r-0"
    >
      <div className="flex flex-col gap-2 border-b border-line px-3 py-2">
        <h2 className="text-sm font-bold">画面</h2>
        <label className="flex items-center gap-1.5 rounded-md border border-line px-2 focus-within:border-accent">
          <Search aria-hidden className="size-4 shrink-0 text-muted" />
          <input
            ref={searchRef}
            type="search"
            aria-label="画面名で絞り込む"
            placeholder="絞り込む（/）"
            value={query}
            className="w-full min-w-0 bg-transparent py-1 text-sm outline-none"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              // 抜けた先をキャンバスにする（blur だと抜けた入力欄が「最後にいた所」に残り、画面の中に取られたフォーカスがそこへ戻るため）
              if (event.key === "Escape") focusCanvas();
            }}
          />
        </label>
        {scope !== undefined && (
          <div className="flex items-center gap-2 text-xs">
            <span
              className="min-w-0 flex-1 truncate text-ink-sub"
              title={scope}
            >
              表示: {scope}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-md border border-line px-2 py-0.5 whitespace-nowrap text-ink-sub hover:bg-panel-sub"
              onClick={() => changeScope(undefined, scope)}
            >
              すべて表示
            </button>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto py-1">
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted">
            絞り込みに合う画面はありません
          </p>
        ) : (
          <TreeList
            nodes={buildStoryTree(rows)}
            depth={0}
            currentStoryId={currentStoryId}
            onSelectStory={onSelectStory}
            scope={scope}
            onScopeChange={(path) => changeScope(path, path)}
            // 文字で絞り込んでいるあいだは、閉じたフォルダも開いて出す（消すと覚えた開閉に戻る）
            isOpen={(path) => query.trim() !== "" || !collapsed.has(path)}
            onToggleFolder={(path) => {
              // 開いて出しているあいだに押しても、見えない所で覚えた開閉を変えない
              if (query.trim() === "") onToggleFolder(path);
            }}
          />
        )}
      </nav>

      {/* 狭い幅では、幅や並べ方を変える欄は出さない（閲覧・返信・解決ができれば足りる） */}
      <div className="max-md:hidden">{children}</div>
    </aside>
  );
};

/** 木の各段で引き継ぐもの */
type TreeProps = {
  currentStoryId: string | undefined;
  onSelectStory: (story: Story) => void;
  scope: string | undefined;
  onScopeChange: (scope: string) => void;
  isOpen: (path: string) => boolean;
  onToggleFolder: (path: string) => void;
};

const TreeList = ({
  nodes,
  depth,
  ...props
}: TreeProps & {
  nodes: ReadonlyArray<StoryTreeNode>;
  depth: number;
}) => (
  <ul>
    {nodes.map((node) =>
      node.kind === "folder" ? (
        <FolderItem
          key={`folder:${node.path}`}
          node={node}
          depth={depth}
          {...props}
        />
      ) : (
        <ScreenItem
          key={`screen:${node.row.title}`}
          name={node.name}
          row={node.row}
          depth={depth}
          currentStoryId={props.currentStoryId}
          onSelectStory={props.onSelectStory}
        />
      ),
    )}
  </ul>
);

const FolderItem = ({
  node,
  depth,
  ...props
}: TreeProps & {
  node: Extract<StoryTreeNode, { kind: "folder" }>;
  depth: number;
}) => {
  const open = props.isOpen(node.path);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li>
      <div className="flex items-center pr-1">
        <button
          type="button"
          aria-expanded={open}
          data-folder-path={node.path}
          className="flex min-w-0 flex-1 items-center gap-1 py-1 text-left text-xs font-bold text-ink hover:bg-panel-sub"
          style={{ paddingLeft: 8 + depth * INDENT }}
          title={node.path}
          onClick={() => props.onToggleFolder(node.path)}
        >
          <Chevron aria-hidden className="size-3.5 shrink-0 text-muted" />
          <span className="truncate">{node.name}</span>
        </button>
        {props.scope !== node.path && (
          <button
            type="button"
            aria-label={`${node.path} だけを表示`}
            title="ここだけ表示"
            className="shrink-0 rounded-md p-1 text-muted hover:bg-panel-sub hover:text-ink"
            onClick={() => props.onScopeChange(node.path)}
          >
            <Focus aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
      {open && <TreeList nodes={node.children} depth={depth + 1} {...props} />}
    </li>
  );
};

const ScreenItem = ({
  name,
  row,
  depth,
  currentStoryId,
  onSelectStory,
}: {
  name: string;
  row: RowPlacement;
  depth: number;
  currentStoryId: string | undefined;
  onSelectStory: (story: Story) => void;
}) => (
  <li>
    <h3
      className="truncate pt-2 pr-3 pb-0.5 text-xs font-bold text-ink"
      style={{ paddingLeft: 12 + depth * INDENT }}
      title={row.title}
    >
      {name}
    </h3>
    <ul>
      {row.frames.map(({ story }) => (
        <li key={story.id}>
          <button
            type="button"
            aria-current={story.id === currentStoryId ? "true" : undefined}
            className={[
              "block w-full truncate py-1 pr-3 text-left text-sm",
              story.id === currentStoryId
                ? "bg-accent-soft text-accent"
                : "text-ink-sub hover:bg-panel-sub hover:text-ink",
            ].join(" ")}
            style={{ paddingLeft: 24 + depth * INDENT }}
            title={`${row.title} / ${story.name}`}
            onClick={() => onSelectStory(story)}
          >
            {story.name}
          </button>
        </li>
      ))}
    </ul>
  </li>
);
