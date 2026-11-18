import { useState } from "react";
import {
  MAX_CUSTOM_WIDTH,
  parseWidthInput,
  type WidthOption,
} from "../model/custom-widths";
import { FRAMES_PER_ROW_OPTIONS } from "../model/layout";
import { focusCanvas } from "./canvas-dom";

type DisplaySettingsProps = {
  showComponents: boolean;
  onShowComponentsChange: (show: boolean) => void;
  width: number;
  /** 切り替えられる幅（設定の幅と、見る人が自分で足した幅） */
  widthOptions: ReadonlyArray<WidthOption>;
  /** 幅を選ぶ（欄から選んだ・「幅を足す」で入れた。設定にも自分用にも無い幅は、受け取る側が自分用に足す） */
  onWidthChange: (width: number) => void;
  /** 自分で足した幅を外す */
  onWidthRemove: (width: number) => void;
  perRow: number;
  onPerRowChange: (perRow: number) => void;
};

/**
 * キャンバスの並べ方の設定（幅・自分用の幅・横に並べる数・部品も表示）。左の画面の一覧の下に出す
 */
export const DisplaySettings = ({
  showComponents,
  onShowComponentsChange,
  width,
  widthOptions,
  onWidthChange,
  onWidthRemove,
  perRow,
  onPerRowChange,
}: DisplaySettingsProps) => {
  // 足す幅の入力（px）。足せない値のまま足そうとしたら、欄に印を付ける
  const [widthInput, setWidthInput] = useState("");
  const [widthInvalid, setWidthInvalid] = useState(false);
  const selectedCustom =
    widthOptions.find((option) => option.width === width)?.custom ?? false;
  return (
    <section
      aria-labelledby="display-settings-heading"
      className="flex flex-col gap-2 border-t border-line px-3 py-2 text-sm text-ink-sub"
    >
      <h2
        id="display-settings-heading"
        className="text-xs font-bold text-muted"
      >
        表示
      </h2>

      <label className="flex items-center justify-between gap-2 whitespace-nowrap">
        幅
        <select
          value={width}
          className="min-w-0 rounded-md border border-line bg-panel px-1.5 py-1 text-sm text-ink"
          onChange={(event) => onWidthChange(Number(event.target.value))}
        >
          {widthOptions.map((option) => (
            <option key={option.width} value={option.width}>
              {option.width}px{option.custom ? "（自分用）" : ""}
            </option>
          ))}
        </select>
      </label>

      {/* 設定に無い幅を、見る人が自分用に足す（ブラウザに覚える。足した幅は iframe で並べる） */}
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          const next = parseWidthInput(widthInput);
          if (next === undefined) {
            setWidthInvalid(true);
            return;
          }
          setWidthInput("");
          setWidthInvalid(false);
          onWidthChange(next);
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          aria-label="足す幅（px）"
          aria-invalid={widthInvalid}
          title={`好きな幅（px。1〜${MAX_CUSTOM_WIDTH} の整数）を自分用に足します。このブラウザに覚え、ほかの人には出ません`}
          placeholder="幅を足す"
          value={widthInput}
          className={[
            "w-full min-w-0 rounded-md border bg-transparent px-1.5 py-1 text-sm outline-none focus:border-accent",
            widthInvalid ? "border-warn" : "border-line",
          ].join(" ")}
          onChange={(event) => {
            setWidthInput(event.target.value);
            setWidthInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") focusCanvas();
          }}
        />
        <button
          type="submit"
          className="rounded-md border border-line px-1.5 py-1 text-sm whitespace-nowrap text-ink-sub hover:bg-panel-sub"
        >
          追加
        </button>
        {selectedCustom && (
          <button
            type="button"
            className="rounded-md border border-line px-1.5 py-1 text-sm whitespace-nowrap text-ink-sub hover:bg-panel-sub"
            aria-label={`${String(width)}px を外す`}
            title={`自分用に足した幅 ${String(width)}px を外します`}
            onClick={() => onWidthRemove(width)}
          >
            外す
          </button>
        )}
      </form>

      <label className="flex items-center justify-between gap-2 whitespace-nowrap">
        横に
        <select
          value={perRow}
          aria-label="1行に並べる状態の数"
          className="rounded-md border border-line bg-panel px-1.5 py-1 text-sm text-ink"
          onChange={(event) => onPerRowChange(Number(event.target.value))}
        >
          {FRAMES_PER_ROW_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}枚
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 whitespace-nowrap">
        <input
          type="checkbox"
          checked={showComponents}
          onChange={(event) => onShowComponentsChange(event.target.checked)}
        />
        部品も表示
      </label>
    </section>
  );
};
