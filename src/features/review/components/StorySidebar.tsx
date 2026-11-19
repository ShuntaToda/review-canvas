import { Search } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { COMPARE_MARK_LABELS, type CompareMark } from "../model/branch-compare";
import type { RowPlacement } from "../model/layout";
import type { Story } from "../model/storybook";
import { focusCanvas } from "./canvas-dom";

/**
 * 左の画面の一覧。上に絞り込みと、キャンバスと同じ並びの画面（タイトル）・状態（ストーリー）、下に表示の設定（children）。
 * 状態を押すと、キャンバスがその状態へ移る
 */
export const StorySidebar = ({
  rows,
  currentStoryId,
  query,
  onQueryChange,
  searchRef,
  onSelectStory,
  marks,
  changedOnly,
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
  /** 既定のブランチと比べた印（印のある状態だけ。既定のブランチ・目録が無いときは渡さない） */
  marks?: ReadonlyMap<string, CompareMark>;
  /** 「変わった画面だけ」の絞り込み（出せないときは渡さない） */
  changedOnly?: { checked: boolean; onChange: (checked: boolean) => void };
  /** 下に出す表示の設定 */
  children: ReactNode;
}) => (
  <aside
    aria-label="画面の一覧"
    data-story-list
    // 狭い幅では、キャンバスの上に重ねて幅いっぱいに出す（右のコメント一覧と同じ）
    className="flex w-60 shrink-0 flex-col border-r border-line bg-panel max-md:absolute max-md:inset-0 max-md:z-40 max-md:w-full max-md:border-r-0"
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
      {changedOnly !== undefined && (
        <label className="flex items-center gap-2 text-sm text-ink-sub">
          <input
            type="checkbox"
            checked={changedOnly.checked}
            onChange={(event) => changedOnly.onChange(event.target.checked)}
          />
          変わった画面だけ
        </label>
      )}
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto py-1">
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-center text-sm text-muted">
          {changedOnly?.checked === true
            ? "既定のブランチから変わった画面はありません"
            : "絞り込みに合う画面はありません"}
        </p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.title}>
              <h3
                className="truncate px-3 pt-2 pb-0.5 text-xs font-bold text-ink"
                title={row.title}
              >
                {row.title}
              </h3>
              <ul>
                {row.frames.map(({ story }) => {
                  const mark = marks?.get(story.id);
                  return (
                    <li key={story.id}>
                      <button
                        type="button"
                        aria-current={
                          story.id === currentStoryId ? "true" : undefined
                        }
                        className={[
                          "flex w-full items-center gap-2 py-1 pr-3 pl-6 text-left text-sm",
                          story.id === currentStoryId
                            ? "bg-accent-soft text-accent"
                            : "text-ink-sub hover:bg-panel-sub hover:text-ink",
                        ].join(" ")}
                        title={`${row.title} / ${story.name}`}
                        onClick={() => onSelectStory(story)}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {story.name}
                        </span>
                        {mark !== undefined && (
                          <span className="shrink-0 rounded border border-line px-1 text-xs text-ink-sub">
                            {COMPARE_MARK_LABELS[mark]}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </nav>

    {/* 狭い幅では、幅や並べ方を変える欄は出さない（閲覧・返信・解決ができれば足りる） */}
    <div className="max-md:hidden">{children}</div>
  </aside>
);
