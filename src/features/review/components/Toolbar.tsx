import {
  CircleHelp,
  Hand,
  MessageSquarePlus,
  MousePointer2,
  LogOut,
  PanelRight,
  Search,
  UserRound,
} from "lucide-react";
import { type Ref, useState } from "react";
import { useSources } from "../hooks/useSources";
import { type BranchOption, branchOptionLabel } from "../model/branch-options";
import {
  MAX_CUSTOM_WIDTH,
  parseWidthInput,
  type WidthOption,
} from "../model/custom-widths";
import { FRAMES_PER_ROW_OPTIONS } from "../model/layout";
import type { Tool } from "../model/shortcuts";
import type { StorySource } from "../model/sources";
import { IconButton } from "./ThreadPopover";
import { focusCanvas } from "./canvas-dom";

const TOOLS: ReadonlyArray<{
  tool: Tool;
  label: string;
  key: string;
  Icon: typeof Hand;
}> = [
  { tool: "move", label: "移動", key: "V", Icon: Hand },
  { tool: "comment", label: "コメント", key: "C", Icon: MessageSquarePlus },
  { tool: "interact", label: "操作", key: "I", Icon: MousePointer2 },
];

type ToolbarProps = {
  page: StorySource;
  onPageChange: (page: StorySource) => void;
  openCounts: Record<StorySource, number>;
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  query: string;
  onQueryChange: (query: string) => void;
  searchRef: Ref<HTMLInputElement>;
  showComponents: boolean;
  onShowComponentsChange: (show: boolean) => void;
  width: number;
  /** 切り替えられる幅（設定の幅と、見る人が自分で足した幅） */
  widthOptions: ReadonlyArray<WidthOption>;
  onWidthChange: (width: number) => void;
  /** 自分用の幅を足す（足した幅に切り替える） */
  onWidthAdd: (width: number) => void;
  /** 自分で足した幅を外す */
  onWidthRemove: (width: number) => void;
  perRow: number;
  onPerRowChange: (perRow: number) => void;
  branch: string;
  /** 選んでいるブランチの Storybook のコミット（置いていなければ undefined） */
  commit: string | undefined;
  /** 切り替える欄の行（model/branch-options） */
  branchOptions: ReadonlyArray<BranchOption>;
  onBranchChange: (branch: string) => void;
  /** ログインしている人の表示名 */
  userName: string;
  onLogout: () => void;
  onHelp: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
};

/**
 * 上の操作の帯。ページ（設定ファイルの Storybook）・操作の種類・絞り込み・幅・ブランチ・ログインしている人
 */
export const Toolbar = ({
  page,
  onPageChange,
  openCounts,
  tool,
  onToolChange,
  query,
  onQueryChange,
  searchRef,
  showComponents,
  onShowComponentsChange,
  width,
  widthOptions,
  onWidthChange,
  onWidthAdd,
  onWidthRemove,
  perRow,
  onPerRowChange,
  branch,
  commit,
  branchOptions,
  onBranchChange,
  userName,
  onLogout,
  onHelp,
  sidebarOpen,
  onToggleSidebar,
}: ToolbarProps) => {
  const sources = useSources();
  // 足す幅の入力（px）。足せない値のまま足そうとしたら、欄に印を付ける
  const [widthInput, setWidthInput] = useState("");
  const [widthInvalid, setWidthInvalid] = useState(false);
  const selectedCustom =
    widthOptions.find((option) => option.width === width)?.custom ?? false;
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel px-3 py-1.5">
      <h1 className="hidden text-sm font-bold whitespace-nowrap text-ink min-[1400px]:block">
        Review Canvas
      </h1>

      <nav aria-label="ページ" className="flex rounded-md bg-panel-sub p-0.5">
        {sources.ids.map((source) => (
          <button
            key={source}
            type="button"
            aria-current={source === page ? "page" : undefined}
            className={[
              "rounded px-3 py-1 text-sm whitespace-nowrap",
              source === page
                ? "bg-panel font-bold text-ink shadow-sm"
                : "text-ink-sub hover:text-ink",
            ].join(" ")}
            onClick={() => onPageChange(source)}
          >
            {sources.label(source)}
            {(openCounts[source] ?? 0) > 0 && (
              <span
                className="ml-1.5 rounded-full bg-accent px-1.5 text-xs font-bold text-white"
                title={`未解決・確認待ち ${openCounts[source]} 件`}
              >
                <span aria-hidden="true">{openCounts[source]}</span>
                <span className="sr-only">
                  （未解決・確認待ち {openCounts[source]} 件）
                </span>
              </span>
            )}
          </button>
        ))}
      </nav>

      <div role="toolbar" aria-label="操作" className="flex gap-0.5">
        {TOOLS.map(({ tool: value, label, key, Icon }) => (
          <IconButton
            key={value}
            label={`${label}（${key}）`}
            pressed={tool === value}
            onClick={() => onToolChange(value)}
          >
            <Icon aria-hidden className="size-4" />
          </IconButton>
        ))}
      </div>

      <label className="flex items-center gap-1.5 rounded-md border border-line px-2 focus-within:border-accent">
        <Search aria-hidden className="size-4 text-muted" />
        <input
          ref={searchRef}
          type="search"
          aria-label="画面名で絞り込む"
          placeholder="画面名で絞り込む /"
          value={query}
          className="w-32 bg-transparent py-1 text-sm outline-none"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            // 抜けた先をキャンバスにする（blur だと抜けた入力欄が「最後にいた所」に残り、画面の中に取られたフォーカスがそこへ戻るため）
            if (event.key === "Escape") focusCanvas();
          }}
        />
      </label>

      <label className="flex items-center gap-1.5 text-sm whitespace-nowrap text-ink-sub">
        <input
          type="checkbox"
          checked={showComponents}
          onChange={(event) => onShowComponentsChange(event.target.checked)}
        />
        部品も表示
      </label>

      <label className="flex items-center gap-1.5 text-sm whitespace-nowrap text-ink-sub">
        幅
        <select
          value={width}
          className="rounded-md border border-line bg-panel px-1.5 py-1 text-sm text-ink"
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
          if (widthOptions.some((option) => option.width === next)) {
            onWidthChange(next);
          } else {
            onWidthAdd(next);
          }
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
            "w-20 rounded-md border bg-transparent px-1.5 py-1 text-sm outline-none focus:border-accent",
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

      <label className="flex items-center gap-1.5 text-sm whitespace-nowrap text-ink-sub">
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

      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm whitespace-nowrap text-ink-sub">
          ブランチ
          <select
            value={branch}
            className="max-w-40 rounded-md border border-line bg-panel px-1.5 py-1 text-sm text-ink"
            onChange={(event) => onBranchChange(event.target.value)}
          >
            {branchOptions.map((b) => (
              <option key={b.branch} value={b.branch}>
                {branchOptionLabel(b)}
              </option>
            ))}
          </select>
        </label>
        {commit !== undefined && (
          <code
            // 狭い画面では帯が2段にならないよう出さない（ヘルプの横に出すコミットは、ブランチの一覧の行の見出しでも分かる）
            className="hidden rounded bg-panel-sub px-1.5 py-0.5 text-xs text-ink-sub 2xl:inline"
            title="選んでいるブランチの Storybook のコミット"
          >
            {commit}
          </code>
        )}
        <span
          className="inline-flex items-center gap-1 px-1 py-1 text-sm text-ink-sub"
          title={`${userName} としてログイン中`}
        >
          <UserRound aria-hidden className="size-4 shrink-0" />
          <span className="max-w-24 truncate">{userName}</span>
        </span>
        <IconButton label="ログアウト" onClick={onLogout}>
          <LogOut aria-hidden className="size-4" />
        </IconButton>
        <IconButton label="使い方・ショートカット（?）" onClick={onHelp}>
          <CircleHelp aria-hidden className="size-4" />
        </IconButton>
        <IconButton
          label="コメント一覧（]）"
          pressed={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <PanelRight aria-hidden className="size-4" />
        </IconButton>
      </div>
    </header>
  );
};
