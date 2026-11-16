/**
 * ピンが指している要素の手がかり（アンカー）の上限の大きさ（JSON にしたときのバイト数）。
 * 1 件の大きさを抑え、一覧の 1 ページの応答（COMMENTS_PER_PAGE 件）が Lambda の応答の上限に届かないようにする
 */
export const COMMENT_ANCHOR_MAX_BYTES = 8192;

/** アンカーの形の版。形を変えるときに上げ、古い形を読み分けられるようにする */
export const COMMENT_ANCHOR_VERSION = 1;

/** 画面（フレーム）の左上からの矩形(px) */
export type AnchorBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * ピンが指している要素の手がかり（アンカー）。
 * 置いたときに画面（iframe）の中のクリックした要素から集め、ピンを要素に追従させるのと、
 * 書き出した Markdown・API を読む人（AI を含む）がどの要素への指摘かを特定するのに使う。
 * DOM から読めるものだけで作り、UI のフレームワークには依らない（コンポーネント名だけは読めたときに添える）。
 * 入力欄に利用者が入れた値は持たない（値があるかどうかだけを持つ）
 */
export type CommentAnchor = {
  version: typeof COMMENT_ANCHOR_VERSION;
  /** 要素のタグ名（小文字）。@example 'button' */
  tag: string;
  /** 要素そのものの data-testid */
  testId: string | null;
  /** 要素か、いちばん近い祖先の data-testid と、何段上か（0=要素そのもの） */
  closestTestId: { testId: string; depth: number } | null;
  /** 要素の id 属性 */
  elementId: string | null;
  /** ロール（role 属性、無ければタグから決まるロール）。@example 'button' */
  role: string | null;
  /** アクセシブルな名前。@example '申し込む' */
  name: string | null;
  /** 見えている文字（200 字まで） */
  text: string | null;
  /** 手がかりになる属性（value は持たない） */
  attributes: Record<string, string>;
  /** 入力欄などの状態（値の中身は持たない） */
  state: {
    /** 入力欄に値が入っているか（入力欄でなければ null） */
    hasValue: boolean | null;
    /** チェックボックス・ラジオの選択（それ以外は null） */
    checked: boolean | null;
    disabled: boolean;
  };
  /** 要素を指す CSS セレクタ */
  selector: string;
  /** 文書の根からの nth-of-type の道筋 */
  nthPath: string;
  /** 祖先の要約（近い順に数段） */
  ancestors: {
    tag: string;
    role: string | null;
    name: string | null;
    testId: string | null;
  }[];
  /** 前にあるいちばん近い見出しの文字 */
  heading: string | null;
  /** 囲んでいるフォーム・区画・ダイアログなど */
  region: { kind: string; label: string | null } | null;
  /** 置いたときの要素の矩形 */
  box: AnchorBox;
  /** 要素の中でクリックした位置（左上からの割合。0〜1） */
  offset: { x: number; y: number };
  /** デザインのレビューに使う見た目（計算後の値） */
  styles: Record<string, string>;
  /** 要素の HTML の抜き出し（入力の値は落とす） */
  html: string | null;
  /** コンポーネント名の連なり（外側から。読めたときだけ） */
  components: string[];
  /** 置いたときのストーリー */
  story: {
    title: string;
    name: string;
    /** ストーリーのファイル。@example './src/features/login/Login.stories.tsx' */
    importPath: string | null;
    /** ストーリーの args（JSON。長いものは切る） */
    args: string | null;
    /** Storybook の globals（JSON。長いものは切る） */
    globals: string | null;
  };
};

/** JSON にしたときのバイト数（上限 COMMENT_ANCHOR_MAX_BYTES と比べる） */
export const commentAnchorByteLength = (anchor: unknown): number =>
  new TextEncoder().encode(JSON.stringify(anchor)).length;
