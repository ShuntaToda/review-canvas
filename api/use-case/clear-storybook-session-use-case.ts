import type { UseCase } from "./interfaces";
import type { Logger } from "@/domain/support/logger";
import type { StorybookSession } from "@/domain/support/storybook-session";

export type ClearStorybookSessionUseCaseInput = Record<string, never>;

export type ClearStorybookSessionUseCaseOutput = {
  /** 消すクッキー（Storybook の配信がクッキーを求めない設定なら null。何もしない） */
  session: { cookieNames: string[]; cookieDomain: string } | null;
};

export type ClearStorybookSessionUseCaseProps = {
  /** Storybook の配信がクッキーを求めない設定なら null */
  readonly storybookSession: StorybookSession | null;
  readonly logger: Logger;
};

export type ClearStorybookSessionUseCase = UseCase<
  ClearStorybookSessionUseCaseInput,
  ClearStorybookSessionUseCaseOutput
>;

/**
 * ログアウトのときに、Storybook の配信を読むためのクッキーをブラウザから消す。
 * 署名付きクッキーはサーバーの側では取り消せない（写し取られたクッキーは期限まで使える）ので、期限を短くしてある
 */
export class ClearStorybookSessionUseCaseImpl implements ClearStorybookSessionUseCase {
  readonly #storybookSession: StorybookSession | null;

  readonly #logger: Logger;

  constructor({ storybookSession, logger }: ClearStorybookSessionUseCaseProps) {
    this.#storybookSession = storybookSession;
    this.#logger = logger;
  }

  async execute(
    _input: ClearStorybookSessionUseCaseInput,
  ): Promise<ClearStorybookSessionUseCaseOutput> {
    this.#logger.debug("ClearStorybookSessionUseCase 開始");
    if (this.#storybookSession === null) {
      return Promise.resolve({ session: null });
    }
    return Promise.resolve({
      session: {
        cookieNames: [...this.#storybookSession.cookieNames],
        cookieDomain: this.#storybookSession.cookieDomain,
      },
    });
  }
}
