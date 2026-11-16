import type { CommentAnchor } from "./comment-anchor";
import {
  CommentNotAuthorError,
  CommentNotThreadRootError,
} from "./comment-errors";
import type { Reviewer } from "@/domain/model/reviewer/reviewer";

/**
 * コメントを付ける Storybook（キャンバスの「ページ」）の ID。設定ファイル（review-canvas.config.json）の storybooks[].id。
 * 設定から外した ID のコメントも読めるよう、型は文字列にし、形だけを決める
 * （api/infrastructure/config/review-canvas-config.ts の SOURCE_ID_PATTERN と同じ。テストで揃えている）
 */
export const STORY_SOURCE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export type StorySource = string;

/**
 * Comment プロパティ
 */
export type CommentProps = {
  branch: string;
  id: string;
  parentId: string | null;
  source: StorySource;
  storyId: string;
  x: number;
  y: number;
  frameWidth: number | null;
  anchor: CommentAnchor | null;
  body: string;
  author: string;
  authorId: string;
  commit: string;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * レビューのコメント（ピン）ドメインモデル。
 *
 * スレッドの最初のコメント（parentId=null）がピンの位置と解決の状態を持ち、返信（parentId=最初のコメントのID）は
 * 位置を最初のコメントから写す。返信への返信は作らない（スレッドは1段）。
 * 位置はキャンバス上の座標ではなく、画面（ストーリー）の左上からの px で持つ。並べ方・倍率を変えてもピンがずれないようにするため
 */
export class Comment {
  /**
   * コメントを分ける区画（Git のブランチ名）。ブランチごとにビルドした Storybook へ別々にコメントするため
   *
   * @example 'feature/order-search'
   */
  readonly branch: string;

  /**
   * コメントのID (ULID)。同じブランチの中で、IDの昇順が書いた順になる
   *
   * @example '01J1H3V7X4K9QW2RT8ZB5C6DYF'
   */
  readonly id: string;

  /**
   * 返信のときだけ、スレッドの最初のコメントのID。最初のコメントはnull
   */
  readonly parentId: string | null;

  /**
   * どちらの Storybook のストーリーか
   */
  readonly source: StorySource;

  /**
   * Storybook のストーリーID
   *
   * @example 'pages-login--default'
   */
  readonly storyId: string;

  /**
   * ピンの位置（画面の左上からの横方向の px）
   */
  readonly x: number;

  /**
   * ピンの位置（画面の左上からの縦方向の px）
   */
  readonly y: number;

  /**
   * コメントを書いたときの画面の幅(px)。幅を切り替えて見たときに、どの幅での指摘かを示す（不明ならnull）
   *
   * @example 1280
   */
  readonly frameWidth: number | null;

  /**
   * ピンが指している要素の手がかり（置いたときにクリックした要素から集める）。
   * 要素を取れなかった（画面を読み込む前・キーボードで置いた）コメントと、手がかりを持つ前に書かれたコメント、返信は null
   */
  readonly anchor: CommentAnchor | null;

  /**
   * 本文
   *
   * @example 'ボタンの文言がモックと違います'
   */
  readonly body: string;

  /**
   * 書いた人の表示名（書いた時点のトークンの表示名。表示にだけ使う）
   *
   * @example '山田'
   */
  readonly author: string;

  /**
   * 書いた人の利用者ID（トークンの sub）。本文の編集・削除で本人かどうかをこれで比べる。
   * 利用者IDを持たない項目は空文字で、誰も編集・削除できない
   *
   * @example 'auth0|6543210fedcba9876543210f'
   */
  readonly authorId: string;

  /**
   * 書いた時点で表示していた Storybook のコミット（短いハッシュ）
   *
   * @example 'c9ebd82'
   */
  readonly commit: string;

  /**
   * 解決済みか（スレッドの最初のコメントだけが意味を持つ。返信は常にfalse）
   */
  readonly resolved: boolean;

  /**
   * 解決した人（未解決ならnull）
   */
  readonly resolvedBy: string | null;

  /**
   * 解決した日時（未解決ならnull）
   */
  readonly resolvedAt: Date | null;

  /**
   * 作成日時
   */
  readonly createdAt: Date;

  /**
   * 更新日時（本文の編集・解決・再開で進む）
   */
  readonly updatedAt: Date;

  // コンストラクタは #private 構文にできない（privateキーワード必須）ため、#private推奨ルールを除外する
  // eslint-disable-next-line no-restricted-syntax
  private constructor(props: CommentProps) {
    this.branch = props.branch;
    this.id = props.id;
    this.parentId = props.parentId;
    this.source = props.source;
    this.storyId = props.storyId;
    this.x = props.x;
    this.y = props.y;
    this.frameWidth = props.frameWidth;
    this.anchor = props.anchor;
    this.body = props.body;
    this.author = props.author;
    this.authorId = props.authorId;
    this.commit = props.commit;
    this.resolved = props.resolved;
    this.resolvedBy = props.resolvedBy;
    this.resolvedAt = props.resolvedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * スレッドの最初のコメント（新しいピン）を生成する
   *
   * 生成時のルールをここに集約する: 未解決で始まり、createdAt=updatedAt=now。
   */
  static create({
    branch,
    id,
    source,
    storyId,
    x,
    y,
    frameWidth,
    anchor,
    body,
    author,
    commit,
    now,
  }: {
    branch: string;
    id: string;
    source: StorySource;
    storyId: string;
    x: number;
    y: number;
    frameWidth: number | null;
    anchor: CommentAnchor | null;
    body: string;
    author: Reviewer;
    commit: string;
    now: Date;
  }): Comment {
    return new Comment({
      branch,
      id,
      parentId: null,
      source,
      storyId,
      x,
      y,
      frameWidth,
      anchor,
      body,
      author: author.name,
      authorId: author.id,
      commit,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * 永続化された状態からCommentを復元する（リポジトリが使う）
   *
   * 生成時のルールは適用せず、保存済みの全フィールドをそのまま組み立てる
   */
  static reconstruct(props: CommentProps): Comment {
    return new Comment(props);
  }

  /**
   * スレッドの最初のコメントか
   */
  isThreadRoot(): boolean {
    return this.parentId === null;
  }

  /**
   * このスレッドへの返信を生成する。位置・ストーリーは最初のコメントから写す（要素の手がかりは大きいので写さない。最初のコメントが持つ）。
   * 返信への返信は作らない（スレッドは1段）ため、返信に対して呼ぶと CommentNotThreadRootError
   */
  reply({
    id,
    body,
    author,
    commit,
    now,
  }: {
    id: string;
    body: string;
    author: Reviewer;
    commit: string;
    now: Date;
  }): Comment {
    if (!this.isThreadRoot()) {
      throw new CommentNotThreadRootError({
        context: { branch: this.branch, commentId: this.id },
      });
    }
    return new Comment({
      branch: this.branch,
      id,
      parentId: this.id,
      source: this.source,
      storyId: this.storyId,
      x: this.x,
      y: this.y,
      frameWidth: this.frameWidth,
      anchor: null,
      body,
      author: author.name,
      authorId: author.id,
      commit,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * 本文を書き換えた新しいCommentを返す。書いた本人（利用者IDが同じ人）だけが書き換えられる
   */
  editBody({
    body,
    editor,
    now,
  }: {
    body: string;
    editor: Reviewer;
    now: Date;
  }): Comment {
    this.#assertAuthor(editor);
    return new Comment({ ...this.#props(), body, updatedAt: now });
  }

  /**
   * 解決・再開した新しいCommentを返す。誰でもできる（Figma と同じ）。
   * 解決の状態はスレッドの最初のコメントだけが持つため、返信に対して呼ぶと CommentNotThreadRootError
   */
  setResolved({
    resolved,
    actor,
    now,
  }: {
    resolved: boolean;
    actor: Reviewer;
    now: Date;
  }): Comment {
    if (!this.isThreadRoot()) {
      throw new CommentNotThreadRootError({
        context: { branch: this.branch, commentId: this.id },
      });
    }
    return new Comment({
      ...this.#props(),
      resolved,
      resolvedBy: resolved ? actor.name : null,
      resolvedAt: resolved ? now : null,
      updatedAt: now,
    });
  }

  /**
   * 削除してよいかを確かめる。書いた本人（利用者IDが同じ人）だけが消せる（最初のコメントを消すとスレッドごと消える）
   */
  assertDeletableBy(actor: Reviewer): void {
    this.#assertAuthor(actor);
  }

  /** 本人かは利用者IDで比べる（表示名は同じ名前の別の人がいうるため使わない）。利用者IDを持たないコメントは誰のものでもない */
  #assertAuthor(actor: Reviewer): void {
    if (this.authorId === "" || actor.id !== this.authorId) {
      throw new CommentNotAuthorError({
        context: { branch: this.branch, commentId: this.id },
      });
    }
  }

  #props(): CommentProps {
    return {
      branch: this.branch,
      id: this.id,
      parentId: this.parentId,
      source: this.source,
      storyId: this.storyId,
      x: this.x,
      y: this.y,
      frameWidth: this.frameWidth,
      anchor: this.anchor,
      body: this.body,
      author: this.author,
      authorId: this.authorId,
      commit: this.commit,
      resolved: this.resolved,
      resolvedBy: this.resolvedBy,
      resolvedAt: this.resolvedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
