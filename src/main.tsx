import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { loadConfig } from "@/config";
import { loadAuthModule } from "@/support/auth";
import "./index.css";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
);

const main = async () => {
  // 設定（デプロイ先は配信の /app-config.json）を読み、設定で選んだログインの実装を読み込む。
  // 擬似ログインはローカル開発のバンドルにしか入らない（src/support/auth/index.ts）
  const config = await loadConfig();
  const auth = await loadAuthModule(config);

  root.render(
    <React.StrictMode>
      <App auth={auth} storybookOrigin={config.storybookOrigin} />
    </React.StrictMode>,
  );
};

main().catch((error: unknown) => {
  // 設定を読めないときは画面を出せないので、理由だけを出す
  root.render(
    <main className="flex h-full items-center justify-center p-8 text-sm text-ink-sub">
      <p>
        起動できませんでした（
        {error instanceof Error ? error.message : String(error)}）
      </p>
    </main>,
  );
});
