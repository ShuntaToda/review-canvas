// @vitest-environment jsdom
import { captureAnchor } from "./anchor-capture";
import { describeAnchor, describeTarget } from "./anchor-describe";
import {
  type LocatedPin,
  locateAnchor,
  locatedKey,
  mergeLocatedPins,
  pinOnElement,
} from "./anchor-locate";
import type { CommentAnchor } from "./threads";

const STORY = {
  id: "features-a--default",
  title: "Features/A",
  name: "Default",
  importPath: null,
};

const setRect = (
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
) => {
  element.getBoundingClientRect = () => ({
    ...rect,
    x: rect.left,
    y: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => rect,
  });
};

// jsdom は描画しないため、どの要素も 0×0 になる（描かれていない要素として外される）。
// 既定で 10×10 の矩形を持たせ、テストごとに setRect で上書きする
beforeAll(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    x: 0,
    y: 0,
    right: 10,
    bottom: 10,
    toJSON: () => ({}),
  });
});
afterAll(() => {
  vi.restoreAllMocks();
});

/** 画面を描いて、指定した要素を押したときの手がかりを集める */
const anchorOf = (html: string, selector: string): CommentAnchor => {
  document.body.innerHTML = html;
  const element = document.querySelector(selector);
  if (element === null) throw new Error(`${selector} がありません`);
  setRect(element, { left: 100, top: 200, width: 200, height: 40 });
  const anchor = captureAnchor({
    document,
    point: { x: 150, y: 210 },
    story: STORY,
  });
  if (anchor === null) throw new Error("手がかりが取れません");
  return anchor;
};

describe("locateAnchor", () => {
  test("[正常系]data-testid が同じ要素を、並びが変わっても見つける", () => {
    const anchor = anchorOf(
      `<form><button data-testid="submit">注文する</button></form>`,
      "button",
    );
    document.body.innerHTML = `<div><p>前に足した文</p><section><button data-testid="submit">注文する</button></section></div>`;

    expect(locateAnchor(document, anchor)?.textContent).toBe("注文する");
  });

  test("[正常系]data-testid が無くなっても、ロールと名前が同じ要素を見つける", () => {
    const anchor = anchorOf(
      `<button data-testid="old">戻る</button><button data-testid="submit">注文する</button>`,
      '[data-testid="submit"]',
    );
    document.body.innerHTML = `<button>戻る</button><button class="primary">注文する</button>`;

    expect(locateAnchor(document, anchor)?.className).toBe("primary");
  });

  test("[正常系]同じ名前の要素が複数あるときは、置いたときの位置に近いものを選ぶ", () => {
    const anchor = anchorOf(
      `<button>編集</button><button id="target">編集</button>`,
      "#target",
    );
    document.body.innerHTML = `<button id="far">編集</button><button id="near">編集</button>`;
    const far = document.getElementById("far");
    const near = document.getElementById("near");
    if (far === null || near === null) throw new Error("ボタンがありません");
    setRect(far, { left: 0, top: 0, width: 50, height: 20 });
    setRect(near, { left: 110, top: 205, width: 200, height: 40 });

    expect(locateAnchor(document, anchor)?.id).toBe("near");
  });

  test("[正常系]名前を持たない要素は、置いたときのセレクタ・道筋で見つける", () => {
    const anchor = anchorOf(
      `<div><div></div><div class="card"></div></div>`,
      ".card",
    );
    document.body.innerHTML = `<div><div></div><div class="card changed"></div></div>`;

    expect(locateAnchor(document, anchor)?.className).toBe("card changed");
  });

  test("[正常系]同じ data-testid・同じ名前のボタンが並ぶ一覧では、置いた行のボタンを、位置が変わっても選ぶ", () => {
    const rows = (prefix = "") =>
      `<table><tbody>${["A", "B", "C"]
        .map(
          (name) =>
            `<tr><td>${prefix}${name}</td><td><button data-testid="detail">詳細</button></td></tr>`,
        )
        .join("")}</tbody></table>`;
    const anchor = anchorOf(rows(), "tr:nth-of-type(2) button");
    // 行の高さが変わり、置いたときの位置にいちばん近いのは 1 行目のボタンになった
    document.body.innerHTML = `<p>前に足した文</p>${rows("新しい")}`;
    const buttons = [...document.querySelectorAll("button")];
    buttons.forEach((button, index) =>
      setRect(button, {
        left: 100,
        top: 200 + index * 300,
        width: 200,
        height: 40,
      }),
    );
    buttons.forEach((button, index) =>
      button.setAttribute("data-row", String(index)),
    );

    expect(anchor.testId).toBe("detail");
    expect(locateAnchor(document, anchor)?.getAttribute("data-row")).toBe("1");
  });

  test("[正常系]名前が同じで文字の違う要素が並ぶときは、並び・位置より先に文字で絞る", () => {
    const anchor = anchorOf(
      `<button aria-label="開く">一覧</button><button aria-label="開く" id="t">詳細</button>`,
      "#t",
    );
    // 並びを入れ替え、道筋（2 つ目）と置いたときの位置は「一覧」を指すようにする
    document.body.innerHTML = `<button aria-label="開く" id="right">詳細</button><button aria-label="開く" id="wrong">一覧</button>`;
    const right = document.getElementById("right");
    const wrong = document.getElementById("wrong");
    if (right === null || wrong === null) throw new Error("ボタンがありません");
    setRect(wrong, { left: 100, top: 200, width: 200, height: 40 });
    setRect(right, { left: 900, top: 900, width: 200, height: 40 });

    expect(locateAnchor(document, anchor)?.id).toBe("right");
  });

  test("[正常系]同じ data-testid で名前の違う要素が並ぶときは、並び・位置より先に名前で絞る", () => {
    const anchor = anchorOf(
      `<button data-testid="act" aria-label="A を編集">編集</button><button data-testid="act" aria-label="B を編集" id="t">編集</button>`,
      "#t",
    );
    // 見えている文字は同じ。並びを入れ替え、道筋（2 つ目）と置いたときの位置は「A を編集」を指すようにする
    document.body.innerHTML = `<button data-testid="act" aria-label="B を編集" id="right">編集</button><button data-testid="act" aria-label="A を編集" id="wrong">編集</button>`;
    const right = document.getElementById("right");
    const wrong = document.getElementById("wrong");
    if (right === null || wrong === null) throw new Error("ボタンがありません");
    setRect(wrong, { left: 100, top: 200, width: 200, height: 40 });
    setRect(right, { left: 900, top: 900, width: 200, height: 40 });

    expect(anchor.testId).toBe("act");
    expect(locateAnchor(document, anchor)?.id).toBe("right");
  });

  test("[異常系]描かれていない（大きさが 0 の）要素は採らず、ほかに無ければ null", () => {
    const anchor = anchorOf(
      `<button data-testid="submit">注文する</button>`,
      "button",
    );
    document.body.innerHTML = `<button data-testid="submit" id="hidden">注文する</button><button data-testid="submit" id="shown">注文する</button>`;
    const hidden = document.getElementById("hidden");
    const shown = document.getElementById("shown");
    if (hidden === null || shown === null)
      throw new Error("ボタンがありません");
    setRect(hidden, { left: 100, top: 200, width: 0, height: 0 });
    setRect(shown, { left: 900, top: 900, width: 200, height: 40 });

    expect(locateAnchor(document, anchor)?.id).toBe("shown");
    setRect(shown, { left: 0, top: 0, width: 0, height: 0 });
    expect(locateAnchor(document, anchor)).toBeNull();
  });

  test("[異常系]種類（タグ・ロール）が違う要素は採らず、見つからなければ null", () => {
    const anchor = anchorOf(
      `<button data-testid="submit">注文する</button>`,
      "button",
    );
    document.body.innerHTML = `<a data-testid="submit" href="/x">注文する</a>`;

    expect(locateAnchor(document, anchor)).toBeNull();
    document.body.innerHTML = `<p>別の画面</p>`;
    expect(locateAnchor(document, anchor)).toBeNull();
  });
});

describe("pinOnElement", () => {
  test("[正常系]見つけた要素の上で、置いたときと同じ割合の位置にピンを置く（幅が変わっても追いかける）", () => {
    const anchor = anchorOf(`<button>注文する</button>`, "button");
    expect(anchor.offset).toStrictEqual({ x: 0.25, y: 0.25 });
    const button = document.querySelector("button");
    if (button === null) throw new Error("ボタンがありません");
    setRect(button, { left: 20, top: 300, width: 400, height: 80 });

    expect(pinOnElement(button, anchor)).toStrictEqual({
      kind: "found",
      x: 120,
      y: 320,
      box: { x: 20, y: 300, width: 400, height: 80 },
    });
  });
});

describe("mergeLocatedPins", () => {
  const found: LocatedPin = {
    kind: "found",
    x: 10,
    y: 20,
    box: { x: 0, y: 0, width: 100, height: 40 },
  };

  test("[正常系]変わった結果だけを、ページ・幅ごとの鍵で足す", () => {
    const next = mergeLocatedPins(
      {},
      { source: "shop", width: 1280 },
      new Map([["01", found]]),
    );

    expect(next).toStrictEqual({ [locatedKey("shop", 1280, "01")]: found });
  });

  test("[正常系]何も変わらなければ（0.5px 未満のずれ）同じものを返す（描き直さない）", () => {
    const previous = { [locatedKey("shop", 1280, "01")]: found };

    expect(
      mergeLocatedPins(
        previous,
        { source: "shop", width: 1280 },
        new Map([["01", { ...found, x: 10.49 }]]),
      ),
    ).toBe(previous);
  });

  test("[正常系]0.5px 以上ずれたら（ピンの先でも枠でも）置き直す", () => {
    const previous = { [locatedKey("shop", 1280, "01")]: found };
    const moved = { ...found, x: 10.5 };
    const resized = { ...found, box: { ...found.box, height: 40.6 } };

    for (const result of [moved, resized]) {
      expect(
        mergeLocatedPins(
          previous,
          { source: "shop", width: 1280 },
          new Map([["01", result]]),
        ),
      ).toStrictEqual({ [locatedKey("shop", 1280, "01")]: result });
    }
  });

  test("[正常系]見つからなくなったら missing に置き換える", () => {
    const previous = { [locatedKey("blog", 390, "01")]: found };

    expect(
      mergeLocatedPins(
        previous,
        { source: "blog", width: 390 },
        new Map([["01", { kind: "missing" }]]),
      ),
    ).toStrictEqual({ [locatedKey("blog", 390, "01")]: { kind: "missing" } });
  });
});

describe("describeAnchor", () => {
  test.each([
    [`<button>注文する</button>`, "button", "button「注文する」"],
    [
      `<label for="n">お名前</label><input id="n">`,
      "input",
      "textbox「お名前」（input）",
    ],
    [`<div>ただの文字</div>`, "div", "div「ただの文字」"],
    [`<div></div>`, "div", "div"],
  ])("[正常系]%s は %s", (html, selector, expected) => {
    expect(describeAnchor(anchorOf(html, selector))).toBe(expected);
  });
});

describe("describeTarget", () => {
  test.each([
    [`<button>注文する</button>`, "button", "ボタン「注文する」"],
    [
      `<label for="n">お名前</label><input id="n">`,
      "input",
      "入力欄「お名前」",
    ],
    [`<div>ただの文字</div>`, "div", "要素「ただの文字」"],
    [`<div></div>`, "div", "要素"],
  ])("[正常系]%s は、レビューする人の言葉で %s", (html, selector, expected) => {
    expect(describeTarget(anchorOf(html, selector))).toBe(expected);
  });
});
