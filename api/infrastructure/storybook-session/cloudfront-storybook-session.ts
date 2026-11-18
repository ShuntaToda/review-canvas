import { createSign } from "node:crypto";
import type {
  StorybookSession,
  StorybookSessionCookie,
} from "@/domain/support/storybook-session";

/** CloudFront の署名付きクッキー（独自のポリシー）の名前 */
export const CLOUDFRONT_COOKIE_NAMES = [
  "CloudFront-Policy",
  "CloudFront-Signature",
  "CloudFront-Key-Pair-Id",
] as const;

/**
 * CloudFront が受け付ける base64（URL に使えない + = / を - _ ~ に置き換える）。
 * 出典: Amazon CloudFront Developer Guide「Setting signed cookies using a custom policy」。AWS SDK の @aws-sdk/cloudfront-signer も同じ置き換えをする
 */
const toCloudFrontBase64 = (value: Buffer): string =>
  value
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("=", "_")
    .replaceAll("/", "~");

/**
 * 独自のポリシー（配信の下の全部を、期限まで読める）。空白を入れない JSON にする。
 * 期限は秒（UNIX 時間）
 */
export const buildCloudFrontPolicy = (
  resource: string,
  expiresAt: Date,
): string =>
  JSON.stringify({
    Statement: [
      {
        Resource: resource,
        Condition: {
          DateLessThan: {
            "AWS:EpochTime": Math.floor(expiresAt.getTime() / 1000),
          },
        },
      },
    ],
  });

export type CloudFrontStorybookSessionProps = {
  /** Storybook の配信のオリジン（https://sb.review.example.com）。この下の全部を読めるクッキーを作る */
  readonly storybookOrigin: string;
  /** 配信が信頼するキーグループに入れた公開鍵の ID（CloudFront-Key-Pair-Id） */
  readonly keyPairId: string;
  readonly cookieDomain: string;
  /** 公開鍵と対の秘密鍵（PEM。RSA 2048）を読む */
  readonly loadPrivateKey: () => Promise<string>;
};

/**
 * CloudFront の署名付きクッキーを作る。ポリシーを秘密鍵で署名（RSA・SHA-1。CloudFront の決まり）し、
 * 配信は、信頼するキーグループの公開鍵で確かめる（infra/lib/review-canvas.ts）
 */
export class CloudFrontStorybookSession implements StorybookSession {
  readonly cookieDomain: string;

  readonly cookieNames = CLOUDFRONT_COOKIE_NAMES;

  readonly #resource: string;

  readonly #keyPairId: string;

  readonly #loadPrivateKey: () => Promise<string>;

  constructor({
    storybookOrigin,
    keyPairId,
    cookieDomain,
    loadPrivateKey,
  }: CloudFrontStorybookSessionProps) {
    this.cookieDomain = cookieDomain;
    this.#resource = `${storybookOrigin}/*`;
    this.#keyPairId = keyPairId;
    this.#loadPrivateKey = loadPrivateKey;
  }

  async sign(expiresAt: Date): Promise<StorybookSessionCookie[]> {
    const policy = buildCloudFrontPolicy(this.#resource, expiresAt);
    const signature = createSign("RSA-SHA1")
      .update(policy)
      .sign(await this.#loadPrivateKey());
    return [
      {
        name: "CloudFront-Policy",
        value: toCloudFrontBase64(Buffer.from(policy)),
      },
      { name: "CloudFront-Signature", value: toCloudFrontBase64(signature) },
      { name: "CloudFront-Key-Pair-Id", value: this.#keyPairId },
    ];
  }
}
