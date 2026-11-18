import { ClearStorybookSessionUseCaseImpl } from "./clear-storybook-session-use-case";
import { LoggerDummy } from "@/domain/support/logger/dummy";
import { buildStorybookSessionDummy } from "@/domain/support/storybook-session/dummy";

describe("ClearStorybookSessionUseCase", () => {
  test("[正常系]消すクッキーの名前と、付けていたドメインを返す", async () => {
    const useCase = new ClearStorybookSessionUseCaseImpl({
      storybookSession: buildStorybookSessionDummy(),
      logger: new LoggerDummy(),
    });

    expect(await useCase.execute({})).toStrictEqual({
      session: {
        cookieNames: ["CloudFront-Policy", "CloudFront-Signature"],
        cookieDomain: "review.example.com",
      },
    });
  });

  test("[正常系]Storybook の配信がクッキーを求めない設定なら、何もしない", async () => {
    const useCase = new ClearStorybookSessionUseCaseImpl({
      storybookSession: null,
      logger: new LoggerDummy(),
    });

    expect(await useCase.execute({})).toStrictEqual({ session: null });
  });
});
