import { useRef, useState } from "react";
import { isImeComposing } from "../model/shortcuts";

type CommentFormProps = {
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
  /** 書き直したかを比べる元の本文（編集の書きかけから始めたとき。無ければ initialValue） */
  originalValue?: string;
  /** 出したときに入力欄へフォーカスを移す（利用者がピンを置いた・開いた直後だけ使う） */
  focusOnMount?: boolean;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  /** 書きかけを外へ預ける（閉じたり画面が落ちたりしても、開き直したときに戻せるように） */
  onDraftChange?: (body: string) => void;
};

/**
 * コメントの入力欄。Ctrl/⌘+Enter で送る。
 * Esc は、書きかけがあれば入力欄から抜けるだけ（もう一度 Esc で閉じる）。書きかけが無ければ閉じる
 */
export const CommentForm = ({
  placeholder,
  submitLabel,
  initialValue = "",
  originalValue,
  focusOnMount = false,
  onSubmit,
  onCancel,
  onDraftChange,
}: CommentFormProps) => {
  const [body, setBody] = useState(initialValue);
  // 書き直したかは、出したときの本文と比べる（書きかけを外へ預けると initialValue が追って変わるため）
  const [initialBody] = useState(originalValue ?? initialValue);
  const [sending, setSending] = useState(false);
  // 出した直後のフォーカスで、カーソルを末尾に置いたか（その後に利用者が動かしたカーソルは動かさない）
  const caretPlacedRef = useRef(false);
  const canSubmit = body.trim() !== "" && !sending;

  const submit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      await onSubmit(body.trim());
      setBody("");
      onDraftChange?.("");
    } catch {
      // 失敗は呼び出し側が通知する。書いた本文は消さずに残し、送り直せるようにする
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <textarea
        aria-label={placeholder}
        placeholder={placeholder}
        value={body}
        rows={3}
        // 吹き出しを開いたらすぐ書けるようにする（利用者が開いた直後だけ）
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={focusOnMount}
        // 書きかけを戻したときは、続きを書けるようカーソルを末尾に置く
        onFocus={(event) => {
          if (!focusOnMount || caretPlacedRef.current) return;
          caretPlacedRef.current = true;
          const end = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(end, end);
        }}
        className="w-full resize-y rounded-md border border-line bg-panel px-2.5 py-2 text-sm leading-relaxed text-ink outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
        onChange={(event) => {
          setBody(event.target.value);
          onDraftChange?.(event.target.value);
        }}
        onKeyDown={(event) => {
          // 日本語の変換中の Enter・Esc は変換のためのもの（確定・取り消し）なので、ここでは扱わない
          if (isImeComposing(event.nativeEvent)) return;
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
          if (event.key !== "Escape") return;
          const edited = body.trim() !== "" && body !== initialBody;
          if (edited) {
            // 書きかけを消さないよう、入力欄から抜けるだけにする（キャンバスのショートカットが効く状態に戻る）
            event.preventDefault();
            event.stopPropagation();
            // フォーカスは吹き出しの外枠に置く（Tab で吹き出しの中に戻れ、もう一度 Esc で閉じられる）
            const container =
              event.currentTarget.closest<HTMLElement>('[role="dialog"]');
            if (container === null) event.currentTarget.blur();
            else container.focus();
            return;
          }
          if (onCancel !== undefined) {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto min-w-0 truncate text-xs text-muted">
          Ctrl / ⌘ + Enter で送信
        </span>
        {onCancel !== undefined && (
          <button
            type="button"
            className="shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-ink-sub hover:bg-panel-sub"
            onClick={onCancel}
          >
            キャンセル
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-bold whitespace-nowrap text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? "送信中…" : submitLabel}
        </button>
      </div>
    </form>
  );
};
