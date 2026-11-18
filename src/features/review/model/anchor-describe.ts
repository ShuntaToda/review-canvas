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

/** role を、レビューする人の言葉にする（無い role はそのまま出さず「要素」にする） */
const ROLE_WORDS: Readonly<Record<string, string>> = {
  button: "ボタン",
  link: "リンク",
  textbox: "入力欄",
  searchbox: "検索の入力欄",
  combobox: "選ぶ欄",
  listbox: "選ぶ欄",
  option: "選択肢",
  checkbox: "チェックボックス",
  radio: "ラジオボタン",
  switch: "切り替え",
  slider: "スライダー",
  spinbutton: "数の入力欄",
  heading: "見出し",
  img: "画像",
  image: "画像",
  list: "リスト",
  listitem: "リストの項目",
  table: "表",
  row: "表の行",
  cell: "表のセル",
  columnheader: "表の見出し",
  rowheader: "表の見出し",
  form: "フォーム",
  dialog: "ダイアログ",
  alert: "お知らせ",
  status: "お知らせ",
  navigation: "ナビゲーション",
  main: "本文",
  banner: "ヘッダー",
  contentinfo: "フッター",
  region: "区画",
  tab: "タブ",
  tabpanel: "タブの中身",
  menu: "メニュー",
  menuitem: "メニューの項目",
  paragraph: "文",
};

/**
 * 要素を、レビューする人の言葉で一言にする（例: ボタン「注文する」・入力欄「お名前」）。
 * role・タグ名は出さない（詳しい手がかりは describeAnchor。吹き出しでは title に添える）
 */
export const describeTarget = (anchor: CommentAnchor): string => {
  const kind =
    (anchor.role === null ? undefined : ROLE_WORDS[anchor.role]) ?? "要素";
  const label = anchor.name ?? anchor.text;
  return label === null ? kind : `${kind}「${clip(label, 40)}」`;
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
