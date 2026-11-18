import { IssueStorybookSessionUseCaseImpl } from "./issue-storybook-session-use-case";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildStorybookSessionDummy } from "@/domain/support/storybook-session/dummy";

const NOW = new Date("2026-11-18T01:00:00.000Z");

describe("IssueStorybookSessionUseCase", () => {
  test("[正常系]いまから 30 分のあいだ Storybook の配信を読めるクッキーを返す", async () => {
    const useCase = new IssueStorybookSessionUseCaseImpl({
      storybookSession: buildStorybookSessionDummy(),
      fetchNow: () => NOW,
      logger: new LoggerDummy(),
    });

    expect(await useCase.execute({})).toStrictEqual({
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

    expect(await useCase.execute({})).toStrictEqual({ session: null });
  });
});
