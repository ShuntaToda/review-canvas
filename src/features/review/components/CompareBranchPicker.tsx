import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { NO_COMPARE } from "../model/branch-compare";

const NOT_COMPARING_LABEL = "比較しない";

/**
 * 上の帯の「比較するブランチ」。押すと小さなパネルを開き、上の検索欄（ブランチ名で絞り込む）と、
 * 下の「比較しない」・ブランチの一覧から選ぶ。↑↓ で動かし、Enter で決め、Esc で閉じる（閉じたらボタンへフォーカスを戻す）。
 * 読み上げは WAI-ARIA の combobox（検索欄）と listbox（一覧）の形で、動かしている行は aria-activedescendant で伝える
 */
export const CompareBranchPicker = ({
  value,
  options,
  onChange,
}: {
  /** 比べる相手（undefined は比較しない） */
  value: string | undefined;
  /** 選べるブランチ（置いてあるブランチから今のブランチを除いたもの） */
  options: ReadonlyArray<string>;
  /** 選んだ（「比較しない」は NO_COMPARE） */
  onChange: (choice: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
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
  const current = value ?? NO_COMPARE;
  const activeIndex = Math.min(active, items.length - 1);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const choose = (choice: string) => {
    onChange(choice);
    close();
  };
  const openPanel = () => {
    setQuery("");
    setActive(Math.max(0, [NO_COMPARE, ...options].indexOf(current)));
    setOpen(true);
  };

  // 開いたら検索欄へフォーカスを移す
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 動かした行を一覧の見える所に入れる
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({
      block: "nearest",
    });
  });

  // 開いている間だけ、外を押した・外へフォーカスが移った・Esc で閉じる（AccountMenu と同じ）
  useEffect(() => {
    if (!open) return;
    const isOutside = (target: EventTarget | null) =>
      !(
        target instanceof Node &&
        containerRef.current?.contains(target) === true
      );
    const handlePointerDown = (event: PointerEvent) => {
      if (isOutside(event.target)) setOpen(false);
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (isOutside(event.target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // キャンバスの Esc（スレッドを閉じる・道具を戻す）まで届かせない
      event.stopImmediatePropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    // キャンバスのショートカットは window で受けるので、その前（取り込みの段階）で受ける
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [open]);

  const handleInputKeyDown = (event: React.KeyboardEvent) => {
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
        aria-label="比較するブランチ"
        title="比較するブランチ"
        aria-expanded={open}
        aria-controls={panelId}
        className={[
          "inline-flex h-8 max-w-48 min-w-0 items-center gap-1 rounded-md border border-line px-1.5 text-sm whitespace-nowrap text-ink hover:bg-panel-sub max-md:max-w-28",
          open ? "bg-accent-soft" : "bg-panel",
        ].join(" ")}
        onClick={() => (open ? close() : openPanel())}
      >
        {value === undefined ? (
          <span className="truncate">{NOT_COMPARING_LABEL}</span>
        ) : (
          <>
            <span className="text-ink-sub max-lg:sr-only">比較:</span>
            <span className="truncate">{value}</span>
          </>
        )}
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-ink-sub" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-50 mt-1 flex w-64 flex-col gap-1 rounded-md border border-line bg-panel p-2 text-sm shadow-lg"
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
            aria-activedescendant={optionId(activeIndex)}
            value={query}
            className="rounded-md border border-line bg-panel px-2 py-1 text-sm text-ink"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
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
          {branches.length === 0 && (
            <p role="status" className="px-1.5 py-1 text-ink-sub">
              当たるブランチはありません
            </p>
          )}
        </div>
      )}
    </div>
  );
};
