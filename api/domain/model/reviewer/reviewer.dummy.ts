import type { Reviewer } from "./reviewer";

/** テスト用の利用者（comment.dummy.ts の既定の書いた人） */
export const YAMADA: Reviewer = { id: "auth0|yamada", name: "山田" };

/** テスト用の別の利用者 */
export const SUZUKI: Reviewer = { id: "auth0|suzuki", name: "鈴木" };

export const reviewerDummyFrom = (props?: Partial<Reviewer>): Reviewer => ({
  ...YAMADA,
  ...props,
});
