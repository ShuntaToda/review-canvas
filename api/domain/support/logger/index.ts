export type AdditionalData =
  | Error
  | {
      [key: string]: unknown;
    };

export type MaskedObject = {
  password: string;
} & object;

/**
 * ロガー
 * 各ログレベルは『システム運用アンチパターン』の「3.5.2 何を記録すべきか？」を参考
 *
 * @interface Logger
 */
export type Logger = {
  /**
   * プログラム内で起こっていることに関連するあらゆる情報。デバッグのためのメッセージなど
   *
   * @param {string} message ログメッセージ
   * @param {AdditionalData} data 付加情報
   * @memberof Logger
   */
  debug(message: string, data?: AdditionalData): void;
  /**
   * ユーザが開始したアクションや、スケジュールされたタスクの実行、システムのスタートアップやシャットダウンなどのシステム操作
   *
   * @param {string} message ログメッセージ
   * @param {AdditionalData} data 付加情報
   * @memberof Logger
   */
  info(message: string, data?: AdditionalData): void;
  /**
   * 将来的にエラーになる可能性の状態。ライブラリ廃止警告、使用可能リソースの不足、パフォーマンス低下など
   *
   * @param {string} message ログメッセージ
   * @param {AdditionalData} data 付加情報
   * @memberof Logger
   */
  warn(message: string, data?: AdditionalData): void;
  /**
   * すべてのエラー状態
   *
   * @param {string} message ログメッセージ
   * @param {AdditionalData} data 付加情報
   * @memberof Logger
   */
  error(message: string, data?: AdditionalData): void;
  /**
   *
   * ログに追加するキーを追加する
   *
   * @param params
   * @memberof Logger
   * @example
   * logger.appendKeys({ userId: "user1" });
   * logger.info({ message: "ログメッセージ" });
   * // => { userId: "user1", message: "ログメッセージ" }
   */
  appendKeys(params: { [key: string]: unknown }): void;
  /**
   *
   * パスワードをマスクする
   *
   * @param {object} obj
   * @memberof Logger
   * // => { userId: "user1", message: "ログメッセージ" }
   */
  maskPassword(obj: object): object;

  /**
   * ログから指定したキーを削除する
   * @param key
   */
  removeKeys(keys: string[]): void;
};
