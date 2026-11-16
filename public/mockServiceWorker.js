/**
 * キャンバスのオリジンに登録された msw のサービスワーカー（Storybook のモックの API）を外すためのもの。
 * Storybook は別のオリジンで配るため、このオリジンでは要らない。ブラウザが更新を確かめたときにこのファイルを読み、
 * 自分を外して、開いている画面を読み直す（キャンバスの API へのリクエストを、モックのサービスワーカーに横取りさせない）
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
