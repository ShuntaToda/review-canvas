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
      ]),
    );
    expect(
      tokens.filter((token) => token.startsWith("allow-top-navigation")),
    ).toStrictEqual([]);
  });
});
