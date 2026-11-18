import { useRef } from "react";
import { useRestoreFocus } from "../hooks/useRestoreFocus";
import { type PopoverPosition, popoverStyle } from "../model/popover";
import type { Story } from "../model/storybook";
import { CommentForm } from "./CommentForm";
import { focusCanvas } from "./canvas-dom";

/**
 * 新しいピンの書きかけ。送るとスレッドになる
 */
export const DraftPopover = ({
  story,
  position,
  author,
  initialBody,
  onDraftChange,
  onSubmit,
  onCancel,
}: {
  story: Story | undefined;
  position: PopoverPosition;
  author: string;
  /** 前に閉じた書きかけ（あれば戻す） */
  initialBody: string;
  onDraftChange: (body: string) => void;
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const ref = useRef<HTMLElement>(null);
  useRestoreFocus(ref, focusCanvas);
  return (
    <section
      ref={ref}
      role="dialog"
      // Esc で入力欄から抜けたときのフォーカスの置き場（Tab では止まらない）
      tabIndex={-1}
      aria-label="新しいコメント"
      className="absolute z-40 flex flex-col gap-2 overflow-y-auto rounded-lg border border-line bg-panel p-3 shadow-xl outline-none"
      style={popoverStyle(position)}
    >
      <p className="text-xs text-ink-sub">
        {story === undefined ? "" : `${story.title} / ${story.name}`}
        <span className="ml-2 whitespace-nowrap text-muted">
          {author} として書く
        </span>
      </p>
      <CommentForm
        placeholder="コメントを書く"
        submitLabel="コメント"
        initialValue={initialBody}
        focusOnMount
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </section>
  );
};
