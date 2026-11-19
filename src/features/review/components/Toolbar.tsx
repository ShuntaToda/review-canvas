import {
  CircleHelp,
  Hand,
  MessageSquarePlus,
  MousePointer2,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { useSources } from "../hooks/useSources";
import { type BranchOption, branchOptionLabel } from "../model/branch-options";
import type { Tool } from "../model/shortcuts";
import type { StorySource } from "../model/sources";
import { AccountMenu } from "./AccountMenu";
import { CompareBranchPicker } from "./CompareBranchPicker";
import { IconButton } from "./IconButton";

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
  branch: string;
  /** 選んでいるブランチの Storybook のコミット（置いていなければ undefined） */
  commit: string | undefined;
  /** 切り替える欄の行（model/branch-options） */
  branchOptions: ReadonlyArray<BranchOption>;
  onBranchChange: (branch: string) => void;
  /** 比べる相手（undefined は比較しない） */
  compareBase: string | undefined;
  /** 比べる相手に選べるブランチ（無ければ「比較するブランチ」を出さない） */
  compareBaseOptions: ReadonlyArray<string>;
  /** 比べる相手を選んだ（「比較しない」は NO_COMPARE） */
  onCompareChoiceChange: (choice: string) => void;
  /** ログインしている人の表示名 */
  userName: string;
  onLogout: () => void;
  onHelp: () => void;
  storyListOpen: boolean;
  onToggleStoryList: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /** 道具の右に置く「画面のつながり」（TransitionPicker） */
  transitionPicker?: React.ReactNode;
};

/**
 * 上の操作の帯。いつも使うものだけを 1 段に並べる（ページ・左右の開閉・道具・画面のつながり・比較するブランチ・ブランチ・使い方・アカウント）。
 * 絞り込みと並べ方の設定は、左の画面の一覧（StorySidebar）にある
 */
export const Toolbar = ({
  page,
  onPageChange,
  openCounts,
  tool,
  onToolChange,
  branch,
  commit,
  branchOptions,
  onBranchChange,
  compareBase,
  compareBaseOptions,
  onCompareChoiceChange,
  userName,
  onLogout,
  onHelp,
  storyListOpen,
  onToggleStoryList,
  sidebarOpen,
  onToggleSidebar,
  transitionPicker,
}: ToolbarProps) => {
  const sources = useSources();
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-panel px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2 md:flex-1">
        <h1 className="hidden text-sm font-bold whitespace-nowrap text-ink min-[1400px]:block">
          Review Canvas
        </h1>
        {/* Storybook が 1 つなら、切り替える先が無いので出さない */}
        {sources.ids.length > 1 && (
          <select
            aria-label="ページ"
            title="括弧の中は未解決・確認待ちの件数"
            value={page}
            className="max-w-48 min-w-0 rounded-md border border-line bg-panel px-1.5 py-1 text-sm text-ink"
            onChange={(event) => onPageChange(event.target.value)}
          >
            {sources.ids.map((source) => {
              const count = openCounts[source] ?? 0;
              return (
                <option key={source} value={source}>
                  {sources.label(source)}
                  {count > 0 ? `（${String(count)}）` : ""}
                </option>
              );
            })}
          </select>
        )}
        <IconButton
          label="画面の一覧（[）"
          pressed={storyListOpen}
          onClick={onToggleStoryList}
        >
          <PanelLeft aria-hidden className="size-4" />
        </IconButton>
      </div>

      <div role="toolbar" aria-label="操作" className="flex gap-0.5">
        {TOOLS.map(({ tool: value, label, key, Icon }) => (
          <IconButton
            key={value}
            label={`${label}（${key}）`}
            pressed={tool === value}
            // アイコンだけでは何の道具か伝わりにくいので、名前を添える（キーは小さく）
            text={
              <>
                {label}
                <kbd className="ml-1 font-sans text-[10px] text-muted">
                  {key}
                </kbd>
              </>
            }
            hideTextWhenNarrow
            onClick={() => onToolChange(value)}
          >
            <Icon aria-hidden className="size-4" />
          </IconButton>
        ))}
      </div>
      {transitionPicker}

      <div className="flex min-w-0 items-center justify-end gap-0.5 max-md:ml-auto md:flex-1">
        {/* 選べる相手が無い（置いてあるブランチが 1 つだけ・今のブランチを置いていない）なら出さない */}
        {compareBaseOptions.length > 0 && (
          <CompareBranchPicker
            compareBase={compareBase}
            options={compareBaseOptions}
            onCompareChoiceChange={onCompareChoiceChange}
          />
        )}
        <label className="mr-1 flex min-w-0 items-center gap-1.5 text-sm whitespace-nowrap text-ink-sub max-md:mr-0">
          <span className="max-lg:sr-only">ブランチ</span>
          <select
            value={branch}
            // コミットは常には出さず、説明に出す（帯を 1 段に収めるため）
            title={
              commit === undefined
                ? undefined
                : `Storybook のコミット: ${commit}`
            }
            className="max-w-40 min-w-0 rounded-md border border-line bg-panel px-1.5 py-1 text-sm text-ink max-md:max-w-28"
            onChange={(event) => onBranchChange(event.target.value)}
          >
            {branchOptions.map((b) => (
              <option key={b.branch} value={b.branch}>
                {branchOptionLabel(b)}
              </option>
            ))}
          </select>
        </label>
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
        <AccountMenu userName={userName} onLogout={onLogout} />
      </div>
    </header>
  );
};
