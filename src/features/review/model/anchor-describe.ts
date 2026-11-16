import { clip } from "./anchor-dom";
import type { CommentAnchor } from "./threads";

/**
 * 要素を一言で表す（例: button「注文する」・textbox「お名前」（input））。
 * ロール（無ければタグ）と、名前（無ければ見えている文字）で書く。ロールとタグが違えばタグを添える
 */
export const describeAnchor = (anchor: CommentAnchor): string => {
  const kind = anchor.role ?? anchor.tag;
  const label = anchor.name ?? anchor.text;
  const tag = kind === anchor.tag ? "" : `（${anchor.tag}）`;
  return label === null
    ? `${kind}${tag}`
    : `${kind}「${clip(label, 40)}」${tag}`;
};

/** 囲んでいる区画を一言で（例: form「ご注文内容」） */
export const describeRegion = (
  region: NonNullable<CommentAnchor["region"]>,
): string =>
  region.label === null
    ? region.kind
    : `${region.kind}「${clip(region.label, 40)}」`;

/** 祖先 1 段を一言で（例: form「ご注文内容」[data-testid=order-form]） */
export const describeAncestor = (
  ancestor: CommentAnchor["ancestors"][number],
): string => {
  const kind = ancestor.role ?? ancestor.tag;
  const name = ancestor.name === null ? "" : `「${clip(ancestor.name, 40)}」`;
  const testId =
    ancestor.testId === null ? "" : `[data-testid=${ancestor.testId}]`;
  return `${kind}${name}${testId}`;
};
