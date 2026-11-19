// @vitest-environment jsdom
import { useCopyLink } from "./useCopyLink";

const URL = "https://review.example.com/?page=shop&story=a--b&width=375";

const stubClipboard = (writeText: (text: string) => Promise<void>) =>
  vi.stubGlobal("navigator", { clipboard: { writeText } });

afterEach(() => vi.unstubAllGlobals());

describe("useCopyLink", () => {
  test("[正常系]リンクをコピーできたら「リンクをコピーしました」と知らせる", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    const notify = vi.fn<(message: string) => void>();

    await useCopyLink(notify)(URL);

    expect(writeText).toHaveBeenCalledExactlyOnceWith(URL);
    expect(notify).toHaveBeenCalledExactlyOnceWith("リンクをコピーしました");
  });

  test("[異常系]コピーできなければ「リンクをコピーできませんでした」と知らせる", async () => {
    stubClipboard(() => Promise.reject(new DOMException("denied")));
    const notify = vi.fn<(message: string) => void>();

    await useCopyLink(notify)(URL);

    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "リンクをコピーできませんでした",
    );
  });
});
