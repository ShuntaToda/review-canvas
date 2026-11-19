import { ChevronDown, Workflow } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useDismissiblePopover } from "../hooks/useDismissiblePopover";
import {
  TRANSITION_MODES,
  type TransitionMode,
  TRANSITIONS_UNAVAILABLE_MESSAGE,
} from "../model/transitions";

type TransitionPickerProps = {
  mode: TransitionMode;
  onModeChange: (mode: TransitionMode) => void;
  /** 「この画面からつながる画面だけ表示」を入にしているか */
  reachableOnly: boolean;
  onReachableOnlyChange: (on: boolean) => void;
  /** 選んだ画面が無い（キャンバスに画面が無い）ときは、つながる画面だけに絞れない */
  hasSelectedStory: boolean;
  /** 画像を撮っていない表示（画像の無いブランチ・自分用に足した幅）。理由を出し、つながる画面だけに絞れない */
  unavailable: boolean;
};

/**
 * 上の帯の「画面のつながり」。押すと小さなパネルを開き、出し方（選んだ画面・すべて・出さない）と
 * 「この画面からつながる画面だけ表示」を選ぶ。出し方はブラウザに覚える（受け取る側）
 */
export const TransitionPicker = ({
  mode,
  onModeChange,
  reachableOnly,
  onReachableOnlyChange,
  hasSelectedStory,
  unavailable,
}: TransitionPickerProps) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const reasonId = `${baseId}-reason`;
  useDismissiblePopover({
    open,
    containerRef,
    buttonRef,
    onClose: () => setOpen(false),
  });
  const current =
    TRANSITION_MODES.find((option) => option.mode === mode)?.label ?? "";
  return (
    <div
      ref={containerRef}
      className="relative flex min-w-0 items-center gap-1"
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-describedby={unavailable ? reasonId : undefined}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm whitespace-nowrap text-ink-sub hover:bg-panel-sub aria-expanded:bg-panel-sub"
        onClick={() => setOpen(!open)}
      >
        <Workflow aria-hidden className="size-4" />
        <span className="max-lg:sr-only">画面のつながり</span>
        <span className="text-xs text-muted max-lg:sr-only">: {current}</span>
        <ChevronDown aria-hidden className="size-3.5" />
      </button>
      {unavailable && (
        <span
          id={reasonId}
          className="max-w-56 truncate text-xs text-warn max-md:sr-only"
          title={TRANSITIONS_UNAVAILABLE_MESSAGE}
        >
          {TRANSITIONS_UNAVAILABLE_MESSAGE}
        </span>
      )}
      {open && (
        <div
          id={panelId}
          className="absolute top-full left-0 z-40 mt-1 flex w-72 flex-col gap-2 rounded-md border border-line bg-panel p-3 text-sm text-ink shadow-lg"
        >
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-bold text-muted">
              画面のつながり
            </legend>
            {TRANSITION_MODES.map((option) => (
              <label key={option.mode} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${baseId}-mode`}
                  value={option.mode}
                  checked={mode === option.mode}
                  onChange={() => onModeChange(option.mode)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 border-t border-line pt-2">
            <input
              type="checkbox"
              checked={reachableOnly && !unavailable}
              disabled={unavailable || (!reachableOnly && !hasSelectedStory)}
              onChange={(event) => onReachableOnlyChange(event.target.checked)}
            />
            この画面からつながる画面だけ表示
          </label>
          {unavailable && (
            <p className="text-xs text-warn">
              {TRANSITIONS_UNAVAILABLE_MESSAGE}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
