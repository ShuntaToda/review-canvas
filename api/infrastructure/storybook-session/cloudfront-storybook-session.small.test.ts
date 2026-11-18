import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  buildCloudFrontPolicy,
  CloudFrontStorybookSession,
} from "./cloudfront-storybook-session";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

/** CloudFront の base64（- _ ~）を元に戻す */
const fromCloudFrontBase64 = (value: string): Buffer =>
  Buffer.from(
    value.replaceAll("-", "+").replaceAll("_", "=").replaceAll("~", "/"),
    "base64",
  );

const EXPIRES_AT = new Date("2026-11-18T01:30:00.500Z");

describe("buildCloudFrontPolicy", () => {
  test("[正常系]配信の下の全部を、期限（秒）まで読めるポリシーを、空白の無い JSON で作る", () => {
    expect(
      buildCloudFrontPolicy("https://sb.review.example.com/*", EXPIRES_AT),
    ).toBe(
      '{"Statement":[{"Resource":"https://sb.review.example.com/*","Condition":{"DateLessThan":{"AWS:EpochTime":1794965400}}}]}',
    );
  });
});

describe("CloudFrontStorybookSession", () => {
  const session = new CloudFrontStorybookSession({
    storybookOrigin: "https://sb.review.example.com",
    keyPairId: "K2EXAMPLE",
    cookieDomain: "review.example.com",
    loadPrivateKey: () => Promise.resolve(privateKey),
  });

  test("[正常系]ポリシー・署名・鍵の ID の 3 つのクッキーを作り、署名は対の公開鍵（RSA・SHA-1）で確かめられる", async () => {
    const cookies = await session.sign(EXPIRES_AT);

    expect(cookies.map(({ name }) => name)).toStrictEqual([
      "CloudFront-Policy",
      "CloudFront-Signature",
      "CloudFront-Key-Pair-Id",
    ]);
    const [policy, signature, keyPairId] = cookies.map(({ value }) => value);
    expect(keyPairId).toBe("K2EXAMPLE");
    const policyText = fromCloudFrontBase64(policy ?? "").toString("utf8");
    expect(policyText).toBe(
      buildCloudFrontPolicy("https://sb.review.example.com/*", EXPIRES_AT),
    );
    expect(
      createVerify("RSA-SHA1")
        .update(policyText)
        .verify(publicKey, fromCloudFrontBase64(signature ?? "")),
    ).toBe(true);
  });

  test("[正常系]クッキーの値には、クッキーにそのまま書けない文字（+ = / ; 空白）を含めない", async () => {
    for (const { value } of await session.sign(EXPIRES_AT)) {
      expect(value).toMatch(/^[A-Za-z0-9\-_~]+$/);
    }
  });

  test("[正常系]付けるドメインと、消すときに使うクッキーの名前を持つ", () => {
    expect(session.cookieDomain).toBe("review.example.com");
    expect(session.cookieNames).toStrictEqual([
      "CloudFront-Policy",
      "CloudFront-Signature",
      "CloudFront-Key-Pair-Id",
    ]);
  });

  test("[異常系]秘密鍵を読めなければ、クッキーを作らずに失敗する", async () => {
    const broken = new CloudFrontStorybookSession({
      storybookOrigin: "https://sb.review.example.com",
      keyPairId: "K2EXAMPLE",
      cookieDomain: "review.example.com",
      loadPrivateKey: () => Promise.reject(new Error("読めません")),
    });

    await expect(broken.sign(EXPIRES_AT)).rejects.toThrow("読めません");
  });
});
