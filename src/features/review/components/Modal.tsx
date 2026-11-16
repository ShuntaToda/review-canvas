import { X } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

/**
 * 画面の真ん中に出すダイアログ（ブラウザの dialog。Esc で閉じ、フォーカスを中に閉じ込める）
 */
export const Modal = ({
  title,
  onClose,
  children,
  width = 480,
  initialFocusRef,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** 開いたときにフォーカスを置く要素（無ければ閉じるボタン） */
  initialFocusRef?: RefObject<HTMLElement | null>;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog === null || dialog.open) return;
    dialog.showModal();
    // ストーリーの画面（iframe）の中にフォーカスがあると、showModal だけでは中へ移らず Esc が届かないため、明示して移す
    (initialFocusRef?.current ?? closeRef.current)?.focus();
    // 外す前に閉じる（ブラウザが、開く前にフォーカスがあった所へ戻す）
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [initialFocusRef]);

  // 画面（iframe）の中から外へ伝えた Esc は window に届く（dialog の cancel にはならない）ので、ここで閉じる
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && event.target === window) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="m-auto rounded-xl border border-line bg-panel p-0 text-ink shadow-2xl"
      style={{ width }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="flex items-center border-b border-line px-4 py-3">
        <h2 className="mr-auto text-base font-bold">{title}</h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="閉じる"
          className="inline-flex size-8 items-center justify-center rounded-md text-ink-sub hover:bg-panel-sub"
          onClick={onClose}
        >
          <X aria-hidden className="size-4" />
        </button>
      </header>
      <div className="px-4 py-4">{children}</div>
    </dialog>
  );
};
