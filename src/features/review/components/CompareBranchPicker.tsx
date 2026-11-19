import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useDismissiblePopover } from "../hooks/useDismissiblePopover";
import { NO_COMPARE } from "../model/branch-compare";
import { isImeComposing } from "../model/shortcuts";

const NOT_COMPARING_LABEL = "比較しない";
/** パネルの幅と、画面の端から空ける幅（狭い画面では画面の中に収める） */
const PANEL_WIDTH = 256;
const VIEWPORT_MARGIN = 8;

/** 動かしている行が無い（打った文字に当たるブランチが無い） */
const NO_ACTIVE = -1;

/**
 * パネルの置き場所（包む要素の左端から）と幅。ボタンの右端にそろえ、画面の左右からはみ出すときは画面の中へずらす
 */
const panelPlacement = (
  container: { left: number; right: number },
  viewportWidth: number,
): { left: number; width: number } => {
  const width = Math.min(PANEL_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const left = Math.min(
    Math.max(container.right - width, VIEWPORT_MARGIN),
    viewportWidth - VIEWPORT_MARGIN - width,
  );
  return { left: left - container.left, width };
};

/**
 * 上の帯の「比較するブランチ」。押すと小さなパネルを開き、上の検索欄（ブランチ名で絞り込む）と、
 * 下の「比較しない」・ブランチの一覧から選ぶ。↑↓ で動かし、Enter で決め、Esc で閉じる（閉じたらボタンへフォーカスを戻す）。
 * 読み上げは WAI-ARIA の combobox（検索欄）と listbox（一覧）の形で、動かしている行は aria-activedescendant で伝える
 */
export const CompareBranchPicker = ({
  compareBase,
  options,
  onCompareChoiceChange,
}: {
  /** 比べる相手（undefined は比較しない） */
  compareBase: string | undefined;
  /** 選べるブランチ（置いてあるブランチから今のブランチを除いたもの） */
  options: ReadonlyArray<string>;
  /** 選んだ（「比較しない」は NO_COMPARE） */
  onCompareChoiceChange: (choice: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<{ left: number; width: number }>({
    left: 0,
    width: PANEL_WIDTH,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${String(index)}`;

  const needle = query.trim().toLowerCase();
  const branches = options.filter((branch) =>
    branch.toLowerCase().includes(needle),
  );
  // 「比較しない」はブランチではないので、絞り込んでも先頭に残す
  const items = [NO_COMPARE, ...branches];
  const current = compareBase ?? NO_COMPARE;
  const activeIndex = Math.min(active, items.length - 1);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const choose = (choice: string) => {
    onCompareChoiceChange(choice);
    close();
  };
  /** 絞り込んでいないときの、今の相手の行 */
  const currentIndex = Math.max(0, [NO_COMPARE, ...options].indexOf(current));
  const openPanel = () => {
    setQuery("");
    setActive(currentIndex);
    const container = containerRef.current?.getBoundingClientRect();
    if (container !== undefined) {
      setPlacement(panelPlacement(container, window.innerWidth));
    }
    setOpen(true);
  };

  useDismissiblePopover({
    open,
    containerRef,
    buttonRef,
    onClose: () => setOpen(false),
  });

  // 開いたら検索欄へフォーカスを移す
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 動かした行を一覧の見える所に入れる
  useEffect(() => {
    if (!open || activeIndex === NO_ACTIVE) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({
      block: "nearest",
    });
  });

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
    // 変換中の Enter・矢印は変換の確定・候補選びで、一覧の操作ではない
    if (isImeComposing(event.nativeEvent)) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive(Math.min(activeIndex + 1, items.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
        break;
      case "Enter": {
        event.preventDefault();
        const item = items[activeIndex];
        if (item !== undefined) choose(item);
        break;
      }
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative mr-1 min-w-0 max-md:mr-0">
      <button
        ref={buttonRef}
        type="button"
        title="比較するブランチ"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={[
          "inline-flex h-8 max-w-48 min-w-0 items-center gap-1 rounded-md border border-line px-1.5 text-sm whitespace-nowrap text-ink hover:bg-panel-sub max-md:max-w-28",
          open ? "bg-accent-soft" : "bg-panel",
        ].join(" ")}
        onClick={() => (open ? close() : openPanel())}
      >
        {/* 名前は見えている文字（今の相手）に、何を選ぶボタンかを前に足したもの */}
        <span className="sr-only">比較するブランチ</span>{" "}
        {compareBase === undefined ? (
          <span className="truncate">{NOT_COMPARING_LABEL}</span>
        ) : (
          <>
            <span className="text-ink-sub max-lg:sr-only">比較:</span>{" "}
            <span className="truncate">{compareBase}</span>
          </>
        )}
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-ink-sub" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full z-50 mt-1 flex flex-col gap-1 rounded-md border border-line bg-panel p-2 text-sm shadow-lg"
          style={placement}
        >
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="ブランチを検索"
            placeholder="ブランチを検索"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex === NO_ACTIVE ? undefined : optionId(activeIndex)
            }
            value={query}
            className="rounded-md border border-line bg-panel px-2 py-1 text-sm text-ink"
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              const nextNeedle = next.trim().toLowerCase();
              const matched = options.some((branch) =>
                branch.toLowerCase().includes(nextNeedle),
              );
              // 打っているあいだは当たった最初のブランチから動かす（当たらなければどの行も動かさない）。消したら今の相手から
              setActive(
                nextNeedle === "" ? currentIndex : matched ? 1 : NO_ACTIVE,
              );
            }}
            onKeyDown={handleInputKeyDown}
          />
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="比較するブランチ"
            className="max-h-64 overflow-auto"
          >
            {items.map((item, index) => (
              <li
                key={item}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                aria-current={item === current ? "true" : undefined}
                className={[
                  "flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-ink",
                  index === activeIndex ? "bg-accent-soft" : "",
                ].join(" ")}
                // キーボードは検索欄（combobox）で受けるので、行は押したときだけ。押しても検索欄からフォーカスを外さず（外へ移ったとみなして閉じない）、その場で決める
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(item);
                }}
              >
                <Check
                  aria-hidden
                  className={[
                    "size-3.5 shrink-0",
                    item === current ? "text-accent" : "invisible",
                  ].join(" ")}
                />
                <span className="truncate">
                  {item === NO_COMPARE ? NOT_COMPARING_LABEL : item}
                </span>
              </li>
            ))}
          </ul>
          {/* 読み上げに知らせるため、知らせの入れ物は常に置き、中身だけ替える */}
          <p
            role="status"
            className={
              branches.length === 0 ? "px-1.5 py-1 text-ink-sub" : "sr-only"
            }
          >
            {branches.length === 0 ? "当たるブランチはありません" : ""}
          </p>
        </div>
      )}
    </div>
  );
};
