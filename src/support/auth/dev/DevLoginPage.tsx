import { useState } from "react";
import { useCompleteDevLogin } from "./dev-login-context";
import {
  DEV_NAME_MAX_LENGTH,
  normalizeDevName,
  readInitialDevName,
} from "./dev-session";

/**
 * 擬似ログインの画面（ローカル開発・テスト用）。名前を決めるとその名前でログインする。
 * 同じ名前なら同じ人として扱う（自分の名前のコメントを編集・削除できる）。デプロイ先のビルドには入らない
 */
export const DevLoginPage = () => {
  const completeLogin = useCompleteDevLogin();
  const [name, setName] = useState(readInitialDevName);
  const normalized = normalizeDevName(name);
  return (
    <main className="flex h-full items-center justify-center p-8">
      <form
        aria-label="擬似ログイン"
        className="flex w-full max-w-sm flex-col gap-3 rounded-lg border border-line bg-panel p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (normalized !== undefined) completeLogin(normalized);
        }}
      >
        <h1 className="text-base font-bold text-ink">
          Review Canvas（擬似ログイン）
        </h1>
        <p className="text-sm text-ink-sub">
          ローカル用のログインです。コメントに出す名前を決めてください。同じ名前で入れば、自分のコメントを編集・削除できます。
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-bold">名前</span>
          <input
            value={name}
            maxLength={DEV_NAME_MAX_LENGTH}
            // ログインの画面を開いたらすぐ打てるようにする（この画面の入力欄は1つだけ）
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="rounded-md border border-line px-2.5 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={normalized === undefined}
          className="self-end rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-white hover:bg-accent-strong disabled:opacity-40"
        >
          ログイン
        </button>
      </form>
    </main>
  );
};
