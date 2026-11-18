import { LogOut, UserRound } from "lucide-react";
import { useId, useRef, useState } from "react";

/**
 * 右端のアカウントのボタン。押すと、ログインしている人の名前とログアウトを出す（めったに押さないので、常には並べない）
 */
export const AccountMenu = ({
  userName,
  onLogout,
}: {
  userName: string;
  onLogout: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  // 外へフォーカスが移ったら閉じる（外を押したとき・Tab で抜けたとき）
  const handleBlur = (event: React.FocusEvent) => {
    if (
      event.relatedTarget instanceof Node &&
      containerRef.current?.contains(event.relatedTarget) === true
    ) {
      return;
    }
    setOpen(false);
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    // キャンバスの Esc（スレッドを閉じる・道具を戻す）まで届かせない
    event.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus();
  };
  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        type="button"
        aria-label={`アカウント（${userName}）`}
        title={`アカウント（${userName}）`}
        aria-expanded={open}
        aria-controls={panelId}
        className={[
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-sub hover:bg-panel-sub hover:text-ink",
          open ? "bg-accent-soft text-accent" : "",
        ].join(" ")}
        onClick={() => setOpen(!open)}
      >
        <UserRound aria-hidden className="size-4" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-50 mt-1 w-56 rounded-md border border-line bg-panel p-2 text-sm shadow-lg"
        >
          <p className="truncate px-1 py-1 text-ink-sub" title={userName}>
            {userName} としてログイン中
          </p>
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-2 rounded px-1 py-1.5 text-left text-ink hover:bg-panel-sub"
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onClick={onLogout}
          >
            <LogOut aria-hidden className="size-4" />
            ログアウト
          </button>
        </div>
      )}
    </div>
  );
};
