import type { UseCase } from "./interfaces";
import type { FetchNow } from "@/domain/support/fetch-now";
import type { Logger } from "@/domain/support/logger";
import {
  STORYBOOK_SESSION_TTL_SECONDS,
  type StorybookSession,
  type StorybookSessionCookie,
} from "@/domain/support/storybook-session";

export type IssueStorybookSessionUseCaseInput = Record<string, never>;

export type IssueStorybookSessionUseCaseOutput = {
  /** 付けるクッキー（Storybook の配信がクッキーを求めない設定なら null。何も付けない） */
  session: {
    cookies: StorybookSessionCookie[];
    cookieDomain: string;
    maxAgeSeconds: number;
    expiresAt: Date;
  } | null;
};

export type IssueStorybookSessionUseCaseProps = {
  /** Storybook の配信がクッキーを求めない設定なら null */
  readonly storybookSession: StorybookSession | null;
  readonly fetchNow: FetchNow;
  readonly logger: Logger;
};

export type IssueStorybookSessionUseCase = UseCase<
  IssueStorybookSessionUseCaseInput,
  IssueStorybookSessionUseCaseOutput
>;

/**
 * ログインした人に、Storybook の配信を読むためのクッキーを出す（期限は短い。画面が切れる前に取り直す）。
 * だれに出してよいかは、API の認証（ログインした・使ってよい人）で決まっている
 */
export class IssueStorybookSessionUseCaseImpl implements IssueStorybookSessionUseCase {
  readonly #storybookSession: StorybookSession | null;

  readonly #fetchNow: FetchNow;

  readonly #logger: Logger;

  constructor({
    storybookSession,
    fetchNow,
    logger,
  }: IssueStorybookSessionUseCaseProps) {
    this.#storybookSession = storybookSession;
    this.#fetchNow = fetchNow;
    this.#logger = logger;
  }

  async execute(
    _input: IssueStorybookSessionUseCaseInput,
  ): Promise<IssueStorybookSessionUseCaseOutput> {
    this.#logger.debug("IssueStorybookSessionUseCase 開始");
    if (this.#storybookSession === null) return { session: null };

    const expiresAt = new Date(
      this.#fetchNow().getTime() + STORYBOOK_SESSION_TTL_SECONDS * 1000,
    );
    return {
      session: {
        cookies: await this.#storybookSession.sign(expiresAt),
        cookieDomain: this.#storybookSession.cookieDomain,
        maxAgeSeconds: STORYBOOK_SESSION_TTL_SECONDS,
        expiresAt,
      },
    };
  }
}
