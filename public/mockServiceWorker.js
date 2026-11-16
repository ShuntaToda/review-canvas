/**
 * キャンバスのオリジンに前の版で登録された msw のサービスワーカーを外すためのもの。
 * 以前は Storybook をキャンバスと同じオリジンで配っていて、ここに msw のサービスワーカー（Storybook のモックの API）が登録された。
 * いまの Storybook は別のオリジンで配るため、このオリジンでは要らない。ブラウザが更新を確かめたときにこのファイルを読み、
 * 自分を外して、開いている画面を読み直す（キャンバスの API へのリクエストを、古いサービスワーカーに横取りさせない）
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })(),
  );
});
