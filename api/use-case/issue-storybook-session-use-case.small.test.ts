import { IssueStorybookSessionUseCaseImpl } from "./issue-storybook-session-use-case";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { StorybookSessionNotForClientError } from "@/domain/support/storybook-session";
import { buildStorybookSessionDummy } from "@/domain/support/storybook-session/dummy";

const PERSON = { id: "auth0|6543210fedcba9876543210f", name: "山田" };
const CLIENT = {
  id: "AbCdEf0123456789AbCdEf0123456789@clients",
  name: "AI（fixer）",
};
const NOW = new Date("2026-11-18T01:00:00.000Z");

describe("IssueStorybookSessionUseCase", () => {
  test("[正常系]いまから 30 分のあいだ Storybook の配信を読めるクッキーを返す", async () => {
    const useCase = new IssueStorybookSessionUseCaseImpl({
      storybookSession: buildStorybookSessionDummy(),
      fetchNow: () => NOW,
      logger: new LoggerDummy(),
    });

    expect(await useCase.execute({ reviewer: PERSON })).toStrictEqual({
      session: {
        cookies: [
          { name: "CloudFront-Policy", value: "2026-11-18T01:30:00.000Z" },
          { name: "CloudFront-Signature", value: "signature" },
        ],
        cookieDomain: "review.example.com",
        maxAgeSeconds: 1800,
        expiresAt: new Date("2026-11-18T01:30:00.000Z"),
      },
    });
  });

  test("[正常系]Storybook の配信がクッキーを求めない設定なら、何も出さない", async () => {
    const useCase = new IssueStorybookSessionUseCaseImpl({
      storybookSession: null,
      fetchNow: () => NOW,
      logger: new LoggerDummy(),
    });

    expect(await useCase.execute({ reviewer: PERSON })).toStrictEqual({
      session: null,
    });
  });

  test("[異常系]人の代わりに呼ぶ client（AI・CI）にはクッキーを出さない（署名もしない）", async () => {
    const storybookSession = buildStorybookSessionDummy();
    const sign = vi.spyOn(storybookSession, "sign");
    const useCase = new IssueStorybookSessionUseCaseImpl({
      storybookSession,
      fetchNow: () => NOW,
      logger: new LoggerDummy(),
    });

    await expect(useCase.execute({ reviewer: CLIENT })).rejects.toThrow(
      StorybookSessionNotForClientError,
    );
    expect(sign).not.toHaveBeenCalled();
  });

  test("[正常系]クッキーを求めない設定なら、client にも何も出さないだけで、エラーにしない", async () => {
    const useCase = new IssueStorybookSessionUseCaseImpl({
      storybookSession: null,
      fetchNow: () => NOW,
      logger: new LoggerDummy(),
    });

    expect(await useCase.execute({ reviewer: CLIENT })).toStrictEqual({
      session: null,
    });
  });
});
