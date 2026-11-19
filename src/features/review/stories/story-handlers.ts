import {
  delay,
  http,
  HttpResponse,
  type JsonBodyType,
  passthrough,
  type RequestHandler,
} from "msw";
import type { Comment } from "../model/threads";
import shopIndex from "./fixtures/shop-index.json";
import featureShots from "./fixtures/shots-feature-new-cart.json";
import mainShots from "./fixtures/shots-main.json";
import {
  branchItemsOf,
  DEFAULT_BRANCH,
  FEATURE_BRANCH,
  STORY_BASE_PREFIX,
  storyBranchKey,
  storyMeta,
} from "./story-fixtures";

/**
 * ストーリーの API と Storybook の配信を、MSW で返す。ストーリーの外へは通信しない（ここに無い道は .storybook/preview.tsx で失敗にする）
 */

/** サンプルのショップを撮った画像（data: の URL。ファイル名ごと） */
const shotImages = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("./fixtures/shots/*.png", {
      query: "?inline",
      import: "default",
      eager: true,
    }),
  ).map(([path, dataUrl]) => [path.slice(path.lastIndexOf("/") + 1), dataUrl]),
);

const bytesOf = (dataUrl: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (char) =>
    char.charCodeAt(0),
  );

/** ブランチごとの目録。既定のブランチに無いストーリー（新しい画面）は、そのブランチの一覧にも載せない */
const shotsByBranchKey: Record<string, typeof mainShots> = {
  [storyBranchKey(DEFAULT_BRANCH)]: mainShots,
  [storyBranchKey(FEATURE_BRANCH)]: featureShots,
};

const indexOf = (manifest: typeof mainShots) => {
  const ids = new Set(manifest.shots.map((shot) => shot.storyId));
  return {
    ...shopIndex,
    entries: Object.fromEntries(
      Object.entries(shopIndex.entries).filter(([id]) => ids.has(id)),
    ),
  };
};

/** 置いてあるブランチの Storybook（ストーリーの一覧・画像の目録・画像） */
const storybookHandlers: RequestHandler[] = [
  http.get(`${STORY_BASE_PREFIX}:branchKey/shop/index.json`, ({ params }) => {
    const manifest = shotsByBranchKey[String(params["branchKey"])];
    return manifest === undefined
      ? new HttpResponse(null, { status: 404 })
      : HttpResponse.json(indexOf(manifest));
  }),
  http.get(
    `${STORY_BASE_PREFIX}:branchKey/shop/review-canvas-shots.json`,
    ({ params }) => {
      const manifest = shotsByBranchKey[String(params["branchKey"])];
      return manifest === undefined
        ? new HttpResponse(null, { status: 404 })
        : HttpResponse.json(manifest);
    },
  ),
  http.get(
    `${STORY_BASE_PREFIX}:branchKey/shop/review-canvas-shots/:file`,
    ({ params }) => {
      const dataUrl = shotImages[String(params["file"])];
      return dataUrl === undefined
        ? new HttpResponse(null, { status: 404 })
        : new HttpResponse(bytesOf(dataUrl), {
            headers: { "Content-Type": "image/png" },
          });
    },
  ),
];

/** API の答え方。ok=データを返す、pending=応答を返さない、unauthorized=ログインが切れた（401）、not-allowed=閲覧を許されていない（403） */
export type StoryApiMode = "ok" | "pending" | "unauthorized" | "not-allowed";

const errorResponse = (mode: "unauthorized" | "not-allowed") =>
  mode === "unauthorized"
    ? HttpResponse.json(
        { error: "UnauthorizedError", message: "ログインし直してください" },
        { status: 401 },
      )
    : HttpResponse.json(
        {
          error: "ReviewerNotAllowedError",
          message: "このアカウントでは使えません",
        },
        { status: 403 },
      );

/**
 * ストーリー 1 つ分の MSW の handler。comments は全ブランチのコメント（ブランチで絞って返す。差分の取り直しには何も変わっていないと返す）
 */
export const reviewHandlers = ({
  mode = "ok",
  comments = [],
}: {
  mode?: StoryApiMode;
  comments?: ReadonlyArray<Comment>;
} = {}): RequestHandler[] => {
  const answer = async (body: () => JsonBodyType) => {
    switch (mode) {
      case "ok":
        return HttpResponse.json(body());
      case "pending":
        await delay("infinite");
        return new HttpResponse(null, { status: 504 });
      case "unauthorized":
      case "not-allowed":
        return errorResponse(mode);
    }
  };
  return [
    http.get("/api/meta", () => answer(() => storyMeta)),
    http.get("/api/branches", () =>
      answer(() => ({ items: branchItemsOf(comments) })),
    ),
    http.get("/api/comments", ({ request }) => {
      const query = new URL(request.url).searchParams;
      const branch = query.get("branch");
      const since = query.get("since");
      return answer(() => ({
        items:
          since === null ? comments.filter((c) => c.branch === branch) : [],
        deletedIds: [],
        nextCursor: null,
        asOf: "2026-11-18T18:00:00.000+09:00",
      }));
    }),
    ...storybookHandlers,
  ];
};

/**
 * 上の handler に無い道への通信を止める（Storybook の preview で、どのストーリーにも効く最後の handler として渡す）。
 * 通すのは、この Storybook の置き場の中の、Storybook 自身のファイル（ビルドの読み込み・ストーリーの一覧など）だけ。
 * API（api/）と置いてあるブランチの置き場（STORY_BASE_PREFIX）は、ストーリーの handler に無ければ止める。
 * 止めた通信は失敗にし、MSW と同じ形（[MSW]）でコンソールに出す（scripts/check-app-storybook.mjs がこれを数える）
 */
export const blockOutsideStories = (storybookUrl: string): RequestHandler =>
  http.all("*", ({ request }) => {
    const dir = new URL(".", storybookUrl);
    const url = new URL(request.url);
    const path = url.pathname;
    if (
      url.origin === dir.origin &&
      path.startsWith(dir.pathname) &&
      !path.startsWith(`${dir.pathname}api/`) &&
      !path.startsWith(STORY_BASE_PREFIX)
    ) {
      return passthrough();
    }
    console.error(
      `[MSW] ストーリーの外への通信を止めました: ${request.method} ${request.url}`,
    );
    return HttpResponse.error();
  });
