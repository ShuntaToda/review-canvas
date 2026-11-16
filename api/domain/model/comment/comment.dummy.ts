import { Comment } from "./comment";
import { getDummyDate, getDummyUlid } from "@/util/testing-util/dummy-data";

export const commentDummyFrom = (props?: Partial<Comment>): Comment =>
  Comment.reconstruct({
    branch: "feature/dummy",
    id: getDummyUlid(),
    parentId: null,
    source: "shop",
    storyId: "pages-login--default",
    x: 120,
    y: 80,
    frameWidth: 1280,
    anchor: null,
    body: "ボタンの文言がモックと違います",
    author: "山田",
    authorId: "auth0|yamada",
    commit: "c9ebd82",
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    aiFixedBy: null,
    aiFixedById: null,
    aiFixedAt: null,
    createdAt: getDummyDate(),
    updatedAt: getDummyDate(),
    ...props,
  });
