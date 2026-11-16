/**
 * いまキャンバスに出している Storybook の出どころ（ブランチとコミット）。
 * ローカルでは起動時の git の状態、デプロイ先ではビルド時に渡した値になる。
 * コメントの既定の区画（ブランチ）と、コメントに残すコミットに使う
 */
export type ReviewTarget = {
  /** @example 'feature/application-search' */
  branch: string;
  /** 短いコミットハッシュ。分からなければ 'unknown' */
  commit: string;
};
