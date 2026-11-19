import { describe, expect, test } from "vitest";
import {
  allowedOriginsOf,
  escapeHtml,
  flowHtml,
  guardRoute,
  isAllowedUrl,
  missingImageMessage,
  parseFlow,
  pointHtml,
  pointsAllowedOrigins,
  redirectDecision,
  splitAllowArgs,
  toPageUrl,
} from "../scripts/annotate-screen-model";

describe("toPageUrl", () => {
  test("[正常系]URL はそのまま、手元のパスは file: の URL にする", () => {
    expect(toPageUrl("http://localhost:4100/?branch=main", "/work")).toBe(
      "http://localhost:4100/?branch=main",
    );
    expect(toPageUrl("screens/order.html", "/work")).toBe(
      "file:///work/screens/order.html",
    );
  });
});

describe("pointHtml", () => {
  const html = pointHtml(
    {
      title: "論点 a　<時間帯>",
      sub: "見本の画面を撮ったもの",
      notes: [
        ["1", "<b>ここで決めたいのは</b>"],
        ["", "（画面に無い）文言"],
      ],
      options: [
        ["★a1　選べる", "再配達が減る"],
        ["a2　選べない", "画面が短い"],
      ],
    },
    "AAAA",
    320,
  );

  test("[正常系]見出しは文字として出し、説明は HTML のまま並べる", () => {
    expect(html).toContain("<h1>論点 a　&lt;時間帯&gt;</h1>");
    expect(html).toContain("<b>ここで決めたいのは</b>");
  });

  test("[正常系]★ で始まる選択肢だけを推奨の枠にし、番号の無い説明は印を変える", () => {
    expect(html).toContain('<div class="opt rec"><b>★a1　選べる</b>');
    expect(html).toContain('<div class="opt"><b>a2　選べない</b>');
    expect(html).toContain('<span class="n blank">・</span>');
    expect(html).toContain("data:image/png;base64,AAAA");
    expect(html).toContain("width:320px");
  });
});

describe("pointHtml（説明も選択肢も無いとき）", () => {
  test("[正常系]説明の欄を出さず、赤枠を付けた画面だけにする", () => {
    const html = pointHtml({ title: "今の画面" }, "AAAA", 320);

    expect(html).not.toContain('class="side"');
    expect(html).toContain("data:image/png;base64,AAAA");
  });
});

describe("isAllowedUrl・allowedOriginsOf", () => {
  const origins = allowedOriginsOf([
    "http://localhost:4100/?branch=main",
    "file:///work/screen.html",
    "壊れた URL",
  ]);

  test("[正常系]開く画面の http(s) のオリジンだけを集める（file: と読めない URL は入れない）", () => {
    expect([...origins]).toStrictEqual(["http://localhost:4100"]);
  });

  test.each([
    ["開く画面と同じオリジン", "http://localhost:4100/api/threads"],
    ["手元のファイル", "file:///work/screen.html"],
    ["ページの中で作る画像", "data:image/png;base64,AAAA"],
    ["blob", "blob:http://localhost:4100/0a1b"],
    ["空のページ", "about:blank"],
  ])("[正常系]%s は通す", (_, url) => {
    expect(isAllowedUrl(url, origins)).toBe(true);
  });

  test.each([
    ["外のオリジン", "https://analytics.example.com/collect"],
    ["同じホストの別のポート", "http://localhost:4101/api/threads"],
    ["http と https の違い", "https://localhost:4100/"],
    ["WebSocket", "ws://localhost:4100/"],
    ["読めない URL", "::"],
  ])("[異常系]%s は止める", (_, url) => {
    expect(isAllowedUrl(url, origins)).toBe(false);
  });
});

describe("missingImageMessage", () => {
  test("[異常系]どの段の画像かと、絶対パスで渡す直し方を書く", () => {
    expect(missingImageMessage(1, "b.png", "/work/b.png")).toMatch(
      /steps\[1\]\.image（b\.png）が見つかりません: \/work\/b\.png。.*絶対パスで渡して/,
    );
  });
});

describe("flowHtml", () => {
  test("[正常系]段ごとに見出しと画像を並べ、操作のある段の後ろにだけ矢印を置く", () => {
    const html = flowHtml([
      {
        title: "① 一覧",
        image: "a.png",
        action: "「コメント」を押す",
        base64: "AA",
      },
      { title: "② ピン", image: "b.png", base64: "BB" },
    ]);

    expect(html.match(/class="arrow"/g)).toHaveLength(1);
    expect(html.indexOf("① 一覧")).toBeLessThan(
      html.indexOf("「コメント」を押す"),
    );
    expect(html.indexOf("「コメント」を押す")).toBeLessThan(
      html.indexOf("② ピン"),
    );
  });
});

describe("parseFlow", () => {
  test("[正常系]title・image・action を読む（action は省ける）", () => {
    expect(
      parseFlow({
        steps: [
          { title: "①", image: "a.png", action: "押す" },
          { title: "②", image: "b.png" },
        ],
      }),
    ).toStrictEqual([
      { title: "①", image: "a.png", action: "押す" },
      { title: "②", image: "b.png" },
    ]);
  });

  test.each([
    ["steps が無い", {}, /steps を 1 つ以上/],
    ["steps が空", { steps: [] }, /steps を 1 つ以上/],
    [
      "image が無い",
      { steps: [{ title: "①" }] },
      /steps\[0\] に title と image/,
    ],
    [
      "action が文字列でない",
      { steps: [{ title: "①", image: "a.png", action: 1 }] },
      /steps\[0\]\.action/,
    ],
  ])("[異常系]%s ときは直し方つきで止める", (_, json, message) => {
    expect(() => parseFlow(json)).toThrow(message);
  });
});

describe("escapeHtml", () => {
  test('[正常系]& < > " を文字にする', () => {
    expect(escapeHtml('a & <b> "c"')).toBe("a &amp; &lt;b&gt; &quot;c&quot;");
  });
});

describe("pointsAllowedOrigins", () => {
  test("[正常系]キャンバス（4100）を撮るとき、許した Storybook（4102）のオリジンも通し、ほかのポートは止める", () => {
    const origins = pointsAllowedOrigins(
      "http://localhost:4100/?branch=main",
      [
        { allow: ["http://localhost:4102"] },
        { url: "http://localhost:4100/x" },
      ],
      [],
    );

    expect(
      isAllowedUrl("http://localhost:4102/sb/main/iframe.html", origins),
    ).toBe(true);
    expect(isAllowedUrl("http://localhost:4100/api/threads", origins)).toBe(
      true,
    );
    expect(isAllowedUrl("http://localhost:4101/api/threads", origins)).toBe(
      false,
    );
  });

  test("[正常系]CLI の --allow のオリジンも通す", () => {
    expect([
      ...pointsAllowedOrigins(
        "file:///work/a.html",
        [],
        ["http://localhost:4102"],
      ),
    ]).toStrictEqual(["http://localhost:4102"]);
  });

  test("[異常系]読めないオリジンは、直し方つきで止める", () => {
    expect(() =>
      pointsAllowedOrigins("http://localhost:4100/", [{ allow: ["4102"] }], []),
    ).toThrow(
      /通すオリジンが読めません: 4102。http:\/\/localhost:4102 のように/,
    );
  });
});

describe("splitAllowArgs", () => {
  test("[正常系]--allow <オリジン> と --allow=<オリジン> を抜き出し、残りの引数の順を保つ", () => {
    expect(
      splitAllowArgs([
        "points",
        "--allow",
        "http://localhost:4102",
        "http://localhost:4100/",
        "/out",
        "--allow=http://127.0.0.1:4102",
        "/spec.mjs",
      ]),
    ).toStrictEqual({
      allow: ["http://localhost:4102", "http://127.0.0.1:4102"],
      rest: ["points", "http://localhost:4100/", "/out", "/spec.mjs"],
    });
  });

  test("[異常系]--allow の後ろが無ければ、直し方つきで止める", () => {
    expect(() => splitAllowArgs(["points", "--allow"])).toThrow(
      /--allow の後ろに/,
    );
  });
});

describe("redirectDecision", () => {
  const origins = new Set(["http://localhost:4100", "http://localhost:4102"]);
  const from = "http://localhost:4100/login";

  test.each([
    ["3xx でない応答", { status: 200, location: undefined }],
    ["Location の無い 304", { status: 304, location: undefined }],
    ["同じオリジンへの相対の転送", { status: 302, location: "/home" }],
    [
      "許した Storybook のオリジンへの転送",
      { status: 301, location: "http://localhost:4102/sb/main/" },
    ],
  ])("[正常系]%s は返す", (_, response) => {
    expect(redirectDecision(response, from, origins)).toBe("fulfill");
  });

  test.each([
    [
      "外のオリジンへの 302",
      { status: 302, location: "https://attacker.example.com/collect" },
    ],
    [
      "スキームを省いた外への 307",
      { status: 307, location: "//attacker.example.com/" },
    ],
    [
      "許していないポートへの 308",
      { status: 308, location: "http://localhost:4101/" },
    ],
  ])("[異常系]%s は止める", (_, response) => {
    expect(redirectDecision(response, from, origins)).toBe("abort");
  });
});

describe("guardRoute", () => {
  const ORIGINS = new Set(["http://localhost:4100"]);
  const closedError = () =>
    new Error("Target page, context or browser has been closed");
  type FakeResponse = {
    status: () => number;
    headers: () => Record<string, string>;
  };
  const fakeRoute = (
    url: string,
    fetch: () => Promise<FakeResponse>,
    { abortFails = false, fulfillFails = false } = {},
  ) => {
    const calls: string[] = [];
    return {
      calls,
      route: {
        request: () => ({ url: () => url }),
        abort: () => {
          calls.push("abort");
          return abortFails ? Promise.reject(closedError()) : Promise.resolve();
        },
        continue: () => {
          calls.push("continue");
          return Promise.resolve();
        },
        fetch: async () => {
          calls.push("fetch");
          return fetch();
        },
        fulfill: () => {
          calls.push("fulfill");
          return fulfillFails
            ? Promise.reject(closedError())
            : Promise.resolve();
        },
      },
    };
  };
  const ok = (): Promise<FakeResponse> =>
    Promise.resolve({ status: () => 200, headers: () => ({}) });

  test("[正常系]許したオリジンの応答は返し、外は止め、手元のファイルはそのまま通す", async () => {
    const allowed = fakeRoute("http://localhost:4100/a", ok);
    const outside = fakeRoute("https://example.com/", ok);
    const file = fakeRoute("file:///work/a.html", ok);

    await guardRoute(allowed.route, ORIGINS);
    await guardRoute(outside.route, ORIGINS);
    await guardRoute(file.route, ORIGINS);

    expect(allowed.calls).toEqual(["fetch", "fulfill"]);
    expect(outside.calls).toEqual(["abort"]);
    expect(file.calls).toEqual(["continue"]);
  });

  test("[異常系]許した範囲の外へ転送する応答は止める", async () => {
    const redirect = fakeRoute("http://localhost:4100/r", () =>
      Promise.resolve({
        status: () => 302,
        headers: () => ({ location: "https://example.com/" }),
      }),
    );

    await guardRoute(redirect.route, ORIGINS);

    expect(redirect.calls).toEqual(["fetch", "abort"]);
  });

  test("[異常系]相手のサーバーが止まっている（取るのに失敗した）ときは、投げずにその要求だけ止める", async () => {
    const refused = fakeRoute("http://localhost:4100/api", () =>
      Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:4100")),
    );

    await expect(guardRoute(refused.route, ORIGINS)).resolves.toBeUndefined();
    expect(refused.calls).toEqual(["fetch", "abort"]);
  });

  test("[異常系]通信の途中で閉じた（返すのも止めるのも失敗する）ときも、投げない", async () => {
    const closed = fakeRoute("http://localhost:4100/a", ok, {
      abortFails: true,
      fulfillFails: true,
    });
    const closedOutside = fakeRoute("https://example.com/", ok, {
      abortFails: true,
    });

    await expect(guardRoute(closed.route, ORIGINS)).resolves.toBeUndefined();
    await expect(
      guardRoute(closedOutside.route, ORIGINS),
    ).resolves.toBeUndefined();
    expect(closed.calls).toEqual(["fetch", "fulfill", "abort"]);
  });
});
