import { useAuth } from "./auth-client";
import { savePendingReturnTo } from "./pending-return-to";

/**
 * ログインし直すボタン。ログインの状態を消してキャンバスのトップへ戻り、ログインの入口（AuthGate）からログインし直す
 * （Auth0 はログアウトしてからログインの画面へ、擬似ログインは名前を決める画面へ）。
 * ログインの失敗・期限切れ（API の 401）のどこからでも、同じ操作で抜けられるようにする。
 * ログアウトはオリジンへしか戻れない（Allowed Logout URLs）ので、いま開いている画面を覚えておき、次のログインの後にそこへ戻す
 */
export const LoginAgainButton = ({
  className = "",
  label = "ログインし直す",
}: {
  className?: string;
  /** 文言（許可していないアカウントのときは「別のアカウントでログイン」） */
  label?: string;
}) => {
  const { logout } = useAuth();
  return (
    <button
      type="button"
      className={`rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-white hover:bg-accent-strong ${className}`}
      onClick={() => {
        const { pathname, search, hash } = window.location;
        savePendingReturnTo(`${pathname}${search}${hash}`);
        void logout({ logoutParams: { returnTo: window.location.origin } });
      }}
    >
      {label}
    </button>
  );
};
