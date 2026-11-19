import { useState } from "react";
import { SWRConfig } from "swr";
import { STORY_ME } from "./story-fixtures";
import { App } from "@/App";
import { createFakeAuthModule } from "@/support/auth/fake";

/**
 * ストーリー 1 つ分のキャンバス。画面の入口（main.tsx）と同じ App を、偽のログインで描く。
 * API・Storybook の配信は MSW が返す（./story-handlers.ts）ので、Storybook のオリジンを Storybook の配信として渡す。
 * SWR のキャッシュはストーリーごとに作り直す（前のストーリーの応答を持ち越さない）
 */
export const ReviewStory = ({ loggedIn = true }: { loggedIn?: boolean }) => {
  const [auth] = useState(() =>
    createFakeAuthModule(loggedIn ? STORY_ME : undefined),
  );
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <div className="h-screen">
        <App
          auth={auth}
          storybookOrigin={window.location.origin}
          storybookAccess="public"
        />
      </div>
    </SWRConfig>
  );
};
