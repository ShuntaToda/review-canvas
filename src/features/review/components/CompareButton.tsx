import { GitCompare } from "lucide-react";
import type { Story } from "../model/storybook";

/**
 * 画面の見出しの「ほかのブランチと比べる」ボタン（「Storybook で開く」の隣）。Frame が onCompare を受けたときだけ出す
 * （比べる相手が無いとき・比べる相手の目録をはじめて読み終える前は渡さない（useBranchCompare の canOpen））
 */
export const CompareButton = ({
  story,
  onCompare,
}: {
  story: Story;
  onCompare: (story: Story) => void;
}) => (
  <button
    type="button"
    // 閉じたときのフォーカスの戻り先（canvas-dom.ts の focusCompareButton が探す）
    data-compare-story={story.id}
    className="inline-flex shrink-0 items-center rounded p-0.5 text-muted hover:bg-panel hover:text-accent"
    aria-label={`${story.title} / ${story.name} をほかのブランチと比べる`}
    title="ほかのブランチと比べる"
    // 「Storybook で開く」と同じく、キャンバスの中を Tab で巡らせない（画面の数だけ止まるため）
    tabIndex={-1}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={() => onCompare(story)}
  >
    <GitCompare aria-hidden className="size-3.5" />
  </button>
);
