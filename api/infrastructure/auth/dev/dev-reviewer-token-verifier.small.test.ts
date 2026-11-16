import { DevReviewerTokenVerifier } from "./dev-reviewer-token-verifier";
import { TokenVerificationFailedError } from "@/domain/support/auth/reviewer-token-verifier";
import { buildFetchNowDummy } from "@/domain/support/fetch-now/dummy";
import {
  buildDevReviewerToken,
  devReviewerTokenPayloadFrom,
} from "@/infrastructure/auth/dev/dev-reviewer-token.dummy";

const encode = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

describe("DevReviewerTokenVerifier", () => {
  const verifier = new DevReviewerTokenVerifier({
    fetchNow: buildFetchNowDummy(),
  });

  test("[正常系]署名なし JWT から sub と表示名を読み取る", async () => {
    await expect(
      verifier.verify(buildDevReviewerToken()),
    ).resolves.toStrictEqual({ id: "dev|山田", name: "山田" });
  });

  const validHeader = encode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const validPayload = encode(JSON.stringify(devReviewerTokenPayloadFrom()));

  test.each([
    { name: "空文字", token: "" },
    {
      name: "2つにしか区切られていない",
      token: `${validHeader}.${validPayload}`,
    },
    {
      name: "署名部が空でない",
      token: buildDevReviewerToken({ signature: encode("signature") }),
    },
    {
      name: "alg が none 以外",
      token: buildDevReviewerToken({ header: { alg: "HS256", typ: "JWT" } }),
    },
    {
      name: "ペイロードが base64url として読めない",
      token: `${validHeader}.${validPayload}=.`,
    },
    {
      name: "ペイロードが JSON の配列",
      token: `${validHeader}.${encode("[1,2]")}.`,
    },
    {
      name: "必須のクレームが無い（共通の検査を通す）",
      token: buildDevReviewerToken({ payload: { sub: "dev|山田" } }),
    },
  ])("[異常系]$name なら TokenVerificationFailedError", async ({ token }) => {
    await expect(verifier.verify(token)).rejects.toThrow(
      TokenVerificationFailedError,
    );
  });
});
