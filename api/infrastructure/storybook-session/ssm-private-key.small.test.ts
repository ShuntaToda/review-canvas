import type { SSMClient } from "@aws-sdk/client-ssm";
import { buildSsmPrivateKeyLoader } from "./ssm-private-key";

const NAME = "/review-canvas/storybook-cookie-key-1";

const ssmOf = (send: ReturnType<typeof vi.fn>) =>
  ({ send }) as unknown as Pick<SSMClient, "send">;

describe("buildSsmPrivateKeyLoader", () => {
  test("[正常系]SecureString を復号して読み、2 度目からは読み直さない", async () => {
    const send = vi.fn().mockResolvedValue({ Parameter: { Value: "PEM" } });
    const load = buildSsmPrivateKeyLoader({
      ssm: ssmOf(send),
      parameterName: NAME,
    });

    expect(await load()).toBe("PEM");
    expect(await load()).toBe("PEM");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: { Name: NAME, WithDecryption: true },
    });
  });

  test("[異常系]読めなかったときは持たず、次の呼び出しで読み直す", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("AccessDenied"))
      .mockResolvedValue({ Parameter: { Value: "PEM" } });
    const load = buildSsmPrivateKeyLoader({
      ssm: ssmOf(send),
      parameterName: NAME,
    });

    await expect(load()).rejects.toThrow("AccessDenied");
    expect(await load()).toBe("PEM");
  });

  test("[異常系]値が空なら、秘密鍵が無いと分かるエラーにする", async () => {
    const load = buildSsmPrivateKeyLoader({
      ssm: ssmOf(vi.fn().mockResolvedValue({ Parameter: { Value: " " } })),
      parameterName: NAME,
    });

    await expect(load()).rejects.toMatchObject({
      name: "StorybookPrivateKeyNotFoundError",
    });
  });
});
