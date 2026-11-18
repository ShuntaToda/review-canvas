// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { StoryIframe } from "./Frame";

afterEach(() => cleanup());

describe("StoryIframe", () => {
  test("[正常系]ストーリーは sandbox の中で動かし、親のタブを移す権限を渡さない", () => {
    render(
      <StoryIframe
        iframeRef={createRef<HTMLIFrameElement>()}
        hidden={false}
        title="商品一覧"
        src="about:blank"
        interactive
        width={375}
        height={812}
        onLoad={() => undefined}
      />,
    );

    const iframe = screen.getByTitle<HTMLIFrameElement>("商品一覧");
    const tokens = (iframe.getAttribute("sandbox") ?? "").split(/\s+/);
    expect(iframe.hasAttribute("sandbox")).toBe(true);
    expect(tokens).toEqual(
      expect.arrayContaining([
        "allow-scripts",
        "allow-same-origin",
        "allow-forms",
        "allow-popups",
        "allow-modals",
        "allow-downloads",
      ]),
    );
    expect(
      tokens.filter((token) => token.startsWith("allow-top-navigation")),
    ).toStrictEqual([]);
  });

  const renderIframe = (props: { covered?: boolean; hidden?: boolean }) => {
    render(
      <StoryIframe
        iframeRef={createRef<HTMLIFrameElement>()}
        hidden={props.hidden ?? false}
        {...(props.covered === undefined ? {} : { covered: props.covered })}
        title="商品一覧"
        src="about:blank"
        interactive
        width={375}
        height={812}
        onLoad={() => undefined}
      />,
    );
    return screen.getByTitle<HTMLIFrameElement>("商品一覧");
  };

  test("[正常系]画像の下で読み込んでいるあいだ（covered）は、見せず・触らせずに、中は動かしておく", () => {
    const iframe = renderIframe({ covered: true });

    expect(iframe.className).toContain("opacity-0");
    expect(iframe.className).toContain("absolute");
    // 見えていない画面をクリックさせない（inert にはしない。play 関数は動かす）
    expect(iframe.style.pointerEvents).toBe("none");
    expect(iframe.className).not.toContain("invisible");
    expect(iframe.style.width).toBe("375px");
    expect(iframe.style.height).toBe("812px");
  });

  test("[正常系]描画が終わって出したあと（covered でない）は、見せて、操作の道具で触れる", () => {
    const iframe = renderIframe({ covered: false });

    expect(iframe.className).not.toContain("opacity-0");
    expect(iframe.className).toContain("block");
    expect(iframe.style.pointerEvents).toBe("auto");
  });

  test("[正常系]外す手順の途中（hidden）は、covered より先に隠す", () => {
    const iframe = renderIframe({ covered: true, hidden: true });

    expect(iframe.className).toContain("invisible");
    expect(iframe.className).not.toContain("opacity-0");
  });
});
