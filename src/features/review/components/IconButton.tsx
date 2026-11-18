type IconButtonProps = {
  /** 何をするボタンか（アイコンだけのときは、読み上げと title に使う） */
  label: string;
  onClick: () => void;
  /** アイコン */
  children: React.ReactNode;
  /**
   * アイコンの横に出す文字。アイコンだけでは何をするか伝わりにくい操作に付ける。
   * 狭い幅ではアイコンだけにしたいときは、hideTextWhenNarrow を付ける
   */
  text?: React.ReactNode;
  hideTextWhenNarrow?: boolean;
  pressed?: boolean;
  disabled?: boolean;
};

/**
 * アイコンのボタン（文字を添えた形も同じ見た目で出す）。押している状態（pressed）は色で示す
 */
export const IconButton = ({
  label,
  onClick,
  children,
  text,
  hideTextWhenNarrow = false,
  pressed,
  disabled = false,
}: IconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    disabled={disabled}
    className={[
      "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md text-sm whitespace-nowrap text-ink-sub hover:bg-panel-sub hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
      text === undefined
        ? "w-8"
        : hideTextWhenNarrow
          ? "w-8 lg:w-auto lg:px-2"
          : "px-2",
      pressed === true ? "bg-accent-soft text-accent" : "",
    ].join(" ")}
    onClick={onClick}
  >
    {children}
    {text !== undefined && (
      <span className={hideTextWhenNarrow ? "hidden lg:inline" : ""}>
        {text}
      </span>
    )}
  </button>
);
