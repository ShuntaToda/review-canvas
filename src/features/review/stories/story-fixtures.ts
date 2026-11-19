import type { BranchItem, ReviewMeta } from "../api/review-api";
import type { Comment } from "../model/threads";
import {
  DEFAULT_BRANCH,
  FEATURE_BRANCH,
  storyBasePrefixOf,
  storyBranchKey,
} from "./story-branches";
import type { AuthUser } from "@/support/auth";

/**
 * ストーリー用の固定のデータ（名前・文字は架空のもの）。キャンバスの中身は、サンプルのショップを撮った画像と目録（./fixtures/）
 */

/** ログインしている人（自分） */
export const STORY_ME: AuthUser = { sub: "auth0|yamada", name: "山田 太郎" };
const SATO = { author: "佐藤 花子", authorId: "auth0|sato" } as const;
const YAMADA = { author: STORY_ME.name, authorId: STORY_ME.sub } as const;

/** 置いてあるブランチの置き場の頭（この Storybook の置き場の下。.storybook/main.ts の staticDirs が、サンプルのショップをここへ置く） */
export const STORY_BASE_PREFIX = storyBasePrefixOf(window.location.href);

const published = (branch: string, commit: string, builtAt: string) => ({
  branch,
  commit,
  builtAt,
  basePath: `${STORY_BASE_PREFIX}${storyBranchKey(branch)}/`,
  storybooks: [{ source: "shop", available: true }],
});

/** /api/meta の応答。並べるのはサンプルのショップ 1 つ（撮った幅は 375 だけ） */
export const storyMeta: ReviewMeta = {
  defaultBranch: DEFAULT_BRANCH,
  branches: [
    published(DEFAULT_BRANCH, "a1b2c3d", "2026-11-18T09:00:00.000+09:00"),
    published(FEATURE_BRANCH, "e4f5a6b", "2026-11-18T15:30:00.000+09:00"),
  ],
  sources: {
    storybooks: [
      {
        id: "shop",
        label: "サンプルショップ",
        widths: [375],
        defaultWidth: 375,
        baseHeight: 812,
      },
    ],
    excludeTitlePrefixes: ["Components/"],
  },
};

type CommentSeed = Pick<Comment, "id" | "storyId" | "x" | "y" | "body"> &
  Partial<Comment>;

const comment = (seed: CommentSeed): Comment => ({
  branch: DEFAULT_BRANCH,
  parentId: null,
  source: "shop",
  frameWidth: 375,
  ...YAMADA,
  commit: "a1b2c3d",
  resolved: false,
  resolvedBy: null,
  resolvedAt: null,
  status: "open",
  aiFixedBy: null,
  aiFixedById: null,
  aiFixedAt: null,
  createdAt: "2026-11-17T10:00:00.000+09:00",
  updatedAt: "2026-11-17T10:00:00.000+09:00",
  ...seed,
});

const aiFixed = {
  status: "ai-fixed",
  aiFixedBy: "AI（review-bot）",
  aiFixedById: "review-bot@clients",
  aiFixedAt: "2026-11-18T11:00:00.000+09:00",
} as const;

const resolved = {
  status: "resolved",
  resolved: true,
  resolvedBy: STORY_ME.name,
  resolvedAt: "2026-11-18T12:00:00.000+09:00",
} as const;

/** 返信のあるスレッドの頭（共有リンクから開くストーリーで開く） */
export const THREAD_WITH_REPLIES_ID = "01JD7Z0000000000000000C001";

/** 未解決・確認待ち・解決済みが混ざった、既定のブランチのコメント（返信のあるスレッドを 1 つ含む） */
export const mixedComments: ReadonlyArray<Comment> = [
  comment({
    id: THREAD_WITH_REPLIES_ID,
    storyId: "shop-productlist--default",
    x: 200,
    y: 260,
    body: "ボタンの文言を「カートに追加」にそろえたいです",
    ...SATO,
  }),
  comment({
    id: "01JD7Z0000000000000000C002",
    parentId: THREAD_WITH_REPLIES_ID,
    storyId: "shop-productlist--default",
    x: 200,
    y: 260,
    body: "了解です。feature/new-cart で直します",
    createdAt: "2026-11-17T10:30:00.000+09:00",
    updatedAt: "2026-11-17T10:30:00.000+09:00",
  }),
  comment({
    id: "01JD7Z0000000000000000C003",
    parentId: THREAD_WITH_REPLIES_ID,
    storyId: "shop-productlist--default",
    x: 200,
    y: 260,
    body: "お願いします。ほかの画面のボタンも合わせてください",
    ...SATO,
    createdAt: "2026-11-17T11:00:00.000+09:00",
    updatedAt: "2026-11-17T11:00:00.000+09:00",
  }),
  comment({
    id: "01JD7Z0000000000000000C004",
    storyId: "shop-orderform--default",
    x: 180,
    y: 170,
    body: "郵便番号の入力欄に、入れ方の例を出してください",
  }),
  comment({
    id: "01JD7Z0000000000000000C005",
    storyId: "admin-orders--default",
    x: 260,
    y: 60,
    body: "注文の一覧を、日付で並べ替えられるようにしたいです",
    ...SATO,
  }),
  comment({
    id: "01JD7Z0000000000000000C006",
    storyId: "shop-orderform--validation-error",
    x: 120,
    y: 240,
    body: "エラーが赤い文字だけで、色が見分けにくい人に伝わりません",
    ...SATO,
    ...aiFixed,
  }),
  comment({
    id: "01JD7Z0000000000000000C007",
    storyId: "shop-productlist--empty",
    x: 120,
    y: 110,
    body: "商品が無いときに、トップへ戻るリンクがほしいです",
    ...aiFixed,
  }),
  comment({
    id: "01JD7Z0000000000000000C008",
    storyId: "shop-orderform--filled",
    x: 160,
    y: 300,
    body: "入力済みの欄の枠の色が薄すぎます",
    ...SATO,
    ...resolved,
  }),
  comment({
    id: "01JD7Z0000000000000000C009",
    storyId: "shop-productlist--default",
    x: 120,
    y: 540,
    body: "価格の「円」の前の空白をそろえてください",
    ...resolved,
  }),
];

/** feature/new-cart のコメント */
export const featureComments: ReadonlyArray<Comment> = [
  comment({
    id: "01JD7Z0000000000000000C101",
    branch: FEATURE_BRANCH,
    commit: "e4f5a6b",
    storyId: "shop-productlist--default",
    x: 110,
    y: 260,
    body: "「送料無料」の印は、条件があるなら注記がほしいです",
    ...SATO,
  }),
];

/** コメントのあるブランチの一覧（/api/branches） */
export const branchItemsOf = (
  comments: ReadonlyArray<Comment>,
): BranchItem[] => {
  const byBranch = new Map<string, Comment[]>();
  for (const c of comments) {
    byBranch.set(c.branch, [...(byBranch.get(c.branch) ?? []), c]);
  }
  return [...byBranch].map(([branch, list]) => ({
    branch,
    commentCount: list.length,
    lastCommentedAt:
      list
        .map((c) => c.createdAt)
        .sort()
        .at(-1) ?? null,
  }));
};
