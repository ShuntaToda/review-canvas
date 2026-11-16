// @vitest-environment jsdom
import {
  ANCHOR_MAX_BYTES,
  captureAnchor,
  componentChainOf,
  cssSelectorOf,
  fitAnchor,
  headingBefore,
  hitTest,
  nthPathOf,
  pickTarget,
  safeJson,
} from "./anchor-capture";
import type { CommentAnchor } from "./threads";

const STORY = {
  id: "shop-orderform--default",
  title: "Shop/OrderForm",
  name: "Default",
  importPath: "./src/pages/OrderForm.stories.tsx",
};

/** jsdom は配置を計算しないので、要素の矩形を決めておく */
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

const byId = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`#${id} がありません`);
  return element;
};

beforeEach(() => {
  document.body.innerHTML = "";
  delete (window as Window & { __STORYBOOK_PREVIEW__?: unknown })
    .__STORYBOOK_PREVIEW__;
});

describe("captureAnchor", () => {
  test("[正常系]ボタンの中の文字（span）を押すとボタンへさかのぼって指し、testid・ロールと名前・見出し・区画・矩形・押した位置の割合を集める", () => {
    document.body.innerHTML = `
      <main>
        <h2>ご注文内容の確認</h2>
        <form aria-label="ご注文内容" data-testid="order-form">
          <button id="submit" type="submit" data-testid="submit-button" class="btn"><span id="label">注文する</span><svg><path id="icon"></path></svg></button>
        </form>
      </main>`;
    setRect(document.body, { left: 0, top: 0, width: 390, height: 844 });
    setRect(byId("submit"), { left: 40, top: 600, width: 310, height: 48 });
    setRect(byId("label"), { left: 150, top: 610, width: 80, height: 20 });

    // 押した位置は span（#label）の中。一番奥の要素は span で、押せる祖先のボタンを指す
    const point = { x: 195, y: 612 };
    expect(hitTest(document, point)?.id).toBe("label");
    const anchor = captureAnchor({ document, point, story: STORY });

    expect(anchor).toMatchObject({
      version: 1,
      tag: "button",
      testId: "submit-button",
      closestTestId: { testId: "submit-button", depth: 0 },
      elementId: "submit",
      role: "button",
      name: "注文する",
      text: "注文する",
      attributes: { type: "submit" },
      state: { hasValue: null, checked: null, disabled: false },
      selector: '[data-testid="submit-button"]',
      heading: "ご注文内容の確認",
      region: { kind: "form", label: "ご注文内容" },
      box: { x: 40, y: 600, width: 310, height: 48 },
      offset: { x: 0.5, y: 0.25 },
      components: [],
      story: {
        title: STORY.title,
        name: STORY.name,
        importPath: STORY.importPath,
        args: null,
        globals: null,
      },
    });
    expect(anchor?.ancestors[0]).toStrictEqual({
      tag: "form",
      role: "form",
      name: "ご注文内容",
      testId: "order-form",
    });
    expect(anchor?.nthPath).toBe(
      "html > body > main:nth-of-type(1) > form:nth-of-type(1) > button:nth-of-type(1)",
    );
    expect(anchor?.html).toContain('<button id="submit"');
  });

  test("[正常系]入力欄は label を名前にし、入れた値の中身は持たず「値がある」ことだけを持つ", () => {
    document.body.innerHTML = `
      <label for="name">お名前</label>
      <input id="name" name="fullName" placeholder="例: 山田 太郎" value="山田太郎">
      <textarea id="memo">秘密のメモ</textarea>`;
    const input = byId("name") as HTMLInputElement;
    input.value = "山田太郎";
    setRect(input, { left: 0, top: 0, width: 200, height: 40 });

    const anchor = captureAnchor({
      document,
      point: { x: 10, y: 10 },
      story: STORY,
    });

    expect(anchor).toMatchObject({
      tag: "input",
      role: "textbox",
      name: "お名前",
      text: null,
      attributes: { name: "fullName", placeholder: "例: 山田 太郎" },
      state: { hasValue: true, checked: null, disabled: false },
    });
    expect(anchor?.attributes).not.toHaveProperty("value");
    expect(JSON.stringify(anchor)).not.toContain("山田太郎");
  });

  test("[正常系]HTML の抜き出しでは、中の入力欄の値と textarea の中身を落とす（画面の DOM は変えない）", () => {
    document.body.innerHTML = `
      <div id="box" data-testid="box"><input value="山田太郎"><textarea>秘密のメモ</textarea><p>見える文字</p></div>`;
    setRect(byId("box"), { left: 0, top: 0, width: 300, height: 100 });

    const anchor = captureAnchor({
      document,
      point: { x: 5, y: 5 },
      story: STORY,
    });

    expect(anchor?.html).not.toContain("山田太郎");
    expect(anchor?.html).not.toContain("秘密のメモ");
    expect(anchor?.text).toBe("見える文字");
    expect(document.querySelector("textarea")?.textContent).toBe("秘密のメモ");
  });

  test("[正常系]HTML の抜き出しは 500 文字で切り、切ったことが分かるようにする", () => {
    document.body.innerHTML = `<div id="long" data-testid="long">${"あ".repeat(800)}</div>`;
    setRect(byId("long"), { left: 0, top: 0, width: 300, height: 100 });

    const anchor = captureAnchor({
      document,
      point: { x: 5, y: 5 },
      story: STORY,
    });

    expect(anchor?.html).toHaveLength(500);
    expect(anchor?.html?.endsWith("…")).toBe(true);
    expect(anchor?.html?.startsWith('<div id="long"')).toBe(true);
  });

  test('[正常系]contenteditable（""・plaintext-only も）の中身は持たない', () => {
    document.body.innerHTML = `<div id="box" data-testid="box"><div contenteditable="">秘密A</div><div contenteditable="plaintext-only">秘密B</div><div contenteditable="false">見える</div></div>`;
    setRect(byId("box"), { left: 0, top: 0, width: 300, height: 100 });

    const anchor = captureAnchor({
      document,
      point: { x: 5, y: 5 },
      story: STORY,
    });

    expect(anchor?.html).not.toContain("秘密");
    expect(anchor?.html).toContain("見える");
  });

  test("[正常系]タグ・ロール・区画の種類は、API の上限（40 文字）に切る", () => {
    const longRole = "r".repeat(60);
    document.body.innerHTML = `<section role="${longRole}" aria-label="区画"><button id="b" role="${longRole}">押す</button></section>`;
    setRect(byId("b"), { left: 0, top: 0, width: 100, height: 40 });

    const anchor = captureAnchor({
      document,
      point: { x: 5, y: 5 },
      story: STORY,
    });

    expect(anchor?.role?.length).toBeLessThanOrEqual(40);
    expect(anchor?.ancestors[0]?.role?.length).toBeLessThanOrEqual(40);
    expect(anchor?.region?.kind.length).toBeLessThanOrEqual(40);
  });

  test("[正常系]Storybook のプレビューから args と globals を JSON で読む（関数は名前に置き換える）", () => {
    document.body.innerHTML = `<p id="text">文字</p>`;
    setRect(byId("text"), { left: 0, top: 0, width: 100, height: 20 });
    Object.assign(window, {
      __STORYBOOK_PREVIEW__: {
        storyStoreValue: {
          args: {
            get: (id: string) =>
              id === STORY.id ? { label: "注文する", onClick: () => 0 } : {},
          },
          userGlobals: { get: () => ({ locale: "ja" }) },
        },
      },
    });

    const anchor = captureAnchor({
      document,
      point: { x: 5, y: 5 },
      story: STORY,
    });

    expect(anchor?.story.args).toBe(
      '{"label":"注文する","onClick":"[Function]"}',
    );
    expect(anchor?.story.globals).toBe('{"locale":"ja"}');
  });

  test("[異常系]何も無い所（body だけ）を押したときは、手がかりを持たない（位置だけのピンになる）", () => {
    setRect(document.body, { left: 0, top: 0, width: 100, height: 100 });

    const anchor = captureAnchor({
      document,
      point: { x: 5, y: 5 },
      story: STORY,
    });

    expect(anchor).toBeNull();
  });
});

describe("hitTest", () => {
  test("[正常系]elementFromPoint が要素を返さない（inert の iframe など）ときは、矩形を見比べて一番奥の見えている要素を選ぶ", () => {
    document.body.innerHTML = `<div id="outer"><p id="inner">文字</p><p id="hidden" style="display:none">隠す</p></div>`;
    setRect(byId("outer"), { left: 0, top: 0, width: 300, height: 300 });
    setRect(byId("inner"), { left: 10, top: 10, width: 100, height: 20 });
    setRect(byId("hidden"), { left: 0, top: 0, width: 300, height: 300 });

    expect(hitTest(document, { x: 20, y: 15 })?.id).toBe("inner");
    expect(hitTest(document, { x: 200, y: 200 })?.id).toBe("outer");
  });

  test("[正常系]返った要素の矩形が位置を含まない（行全体を覆うリンクの ::after など）ときは、その位置を含む次の要素を選ぶ", () => {
    document.body.innerHTML = `<div id="row"><a id="link" href="/x">詳細</a><span id="cell">山田</span></div>`;
    setRect(byId("row"), { left: 0, top: 0, width: 600, height: 40 });
    setRect(byId("link"), { left: 0, top: 10, width: 40, height: 20 });
    setRect(byId("cell"), { left: 300, top: 10, width: 80, height: 20 });
    const link = byId("link");
    document.elementFromPoint = () => link;
    document.elementsFromPoint = () => [
      link,
      byId("cell"),
      byId("row"),
      document.body,
      document.documentElement,
    ];

    try {
      expect(hitTest(document, { x: 320, y: 20 })?.id).toBe("cell");
      expect(hitTest(document, { x: 20, y: 20 })?.id).toBe("link");
      expect(hitTest(document, { x: 500, y: 20 })?.id).toBe("row");
    } finally {
      delete (document as Partial<Document>).elementFromPoint;
      delete (document as Partial<Document>).elementsFromPoint;
    }
  });
});

describe("cssSelectorOf・nthPathOf", () => {
  test("[正常系]data-testid・id の無い要素は、兄弟と区別できる nth-of-type を付け、1 つに絞れる短さで止める", () => {
    document.body.innerHTML = `
      <ul data-testid="menu"><li><a href="/a">A</a></li><li><a id="b" href="/b">B</a></li></ul>`;
    const link = byId("b");

    const selector = cssSelectorOf(link);

    expect(selector).toBe('[id="b"]');
    link.removeAttribute("id");
    const withoutId = cssSelectorOf(link);
    expect(withoutId).toBe("li:nth-of-type(2) > a");
    expect(document.querySelectorAll(withoutId)).toHaveLength(1);
  });

  test("[正常系]自動で振られた id（React の useId など）は手がかりにしない", () => {
    document.body.innerHTML = `<div><span id=":r1:">x</span></div><div><span>y</span></div>`;
    const span = document.querySelector("span");
    if (span === null) throw new Error("span がありません");

    expect(cssSelectorOf(span)).not.toContain(":r1:");
    expect(document.querySelectorAll(cssSelectorOf(span))[0]).toBe(span);
    expect(nthPathOf(span)).toBe(
      "html > body > div:nth-of-type(1) > span:nth-of-type(1)",
    );
  });
});

describe("headingBefore", () => {
  test("[正常系]要素の内に見出しがあれば、前の要素の見出しではなく内の最初の見出しを拾う", () => {
    document.body.innerHTML = `
      <h2>おすすめ</h2>
      <article id="card"><img alt=""><h3>白いマグカップ</h3><h4>在庫あり</h4></article>`;

    expect(headingBefore(byId("card"))).toBe("白いマグカップ");
  });

  test("[正常系]内に見出しが無ければ、前にあるいちばん近い見出しを拾う（要素が入っている見出しも含む）", () => {
    document.body.innerHTML = `
      <h2>おすすめ</h2><h3><span id="inside">白いマグカップ</span></h3>
      <button id="buy">カートに入れる</button>`;

    expect(headingBefore(byId("buy"))).toBe("白いマグカップ");
    expect(headingBefore(byId("inside"))).toBe("白いマグカップ");
  });
});

describe("componentChainOf", () => {
  test("[正常系]React の fiber をたどり、外側からのコンポーネント名にする（4 文字未満の縮めた名前・Context・Provider は除き、memo・forwardRef は名前で読む）", () => {
    document.body.innerHTML = `<button id="b">x</button>`;
    const OrderForm = () => null;
    const SubmitButton = () => null;
    const e = () => null;
    const fiber = {
      type: "button",
      return: {
        type: SubmitButton,
        return: {
          type: e,
          return: {
            type: { displayName: "Navigation", Provider: {} },
            return: {
              type: { displayName: "FieldGroup", render: () => null },
              return: {
                type: Object.assign(() => null, { displayName: "Ave" }),
                return: {
                  type: { displayName: "ThemeProvider" },
                  return: { type: OrderForm, return: null },
                },
              },
            },
          },
        },
      },
    };
    Object.assign(byId("b"), { __reactFiber$abc123: fiber });

    expect(componentChainOf(byId("b"))).toStrictEqual([
      "OrderForm",
      "FieldGroup",
      "SubmitButton",
    ]);
  });

  test("[正常系]Vue のコンポーネント（__vueParentComponent）もたどる", () => {
    document.body.innerHTML = `<button id="b">x</button>`;
    Object.defineProperty(byId("b"), "__vueParentComponent", {
      enumerable: false,
      value: {
        type: { __name: "SubmitButton" },
        parent: { type: { name: "OrderForm" }, parent: null },
      },
    });

    expect(componentChainOf(byId("b"))).toStrictEqual([
      "OrderForm",
      "SubmitButton",
    ]);
  });

  test("[正常系]フレームワークの手がかりが無ければ空", () => {
    document.body.innerHTML = `<button id="b">x</button>`;

    expect(componentChainOf(byId("b"))).toStrictEqual([]);
  });
});

describe("fitAnchor・safeJson", () => {
  const big = (): CommentAnchor => ({
    version: 1,
    tag: "div",
    testId: null,
    closestTestId: null,
    elementId: null,
    role: null,
    name: "あ".repeat(200),
    text: "あ".repeat(200),
    attributes: Object.fromEntries(
      Array.from({ length: 24 }, (_, i) => [`aria-x${i}`, "あ".repeat(200)]),
    ),
    state: { hasValue: null, checked: null, disabled: false },
    selector: "div",
    nthPath: "html > body > div:nth-of-type(1)",
    ancestors: Array.from({ length: 5 }, () => ({
      tag: "div",
      role: null,
      name: "あ".repeat(80),
      testId: "x".repeat(200),
    })),
    heading: "あ".repeat(200),
    region: null,
    box: { x: 0, y: 0, width: 10, height: 10 },
    offset: { x: 0.5, y: 0.5 },
    styles: { color: "red" },
    html: "<div>".padEnd(500, "x"),
    components: ["A1b"],
    story: {
      title: "T",
      name: "N",
      importPath: null,
      args: "x".repeat(1200),
      globals: "x".repeat(600),
    },
  });

  test("[正常系]上限の大きさを超えたら、特定に効きにくいものから削って収める（testid・セレクタ・矩形は残す）", () => {
    const anchor = big();
    expect(
      new TextEncoder().encode(JSON.stringify(anchor)).length,
    ).toBeGreaterThan(ANCHOR_MAX_BYTES);

    const fitted = fitAnchor(anchor);

    expect(
      new TextEncoder().encode(JSON.stringify(fitted)).length,
    ).toBeLessThanOrEqual(ANCHOR_MAX_BYTES);
    expect(fitted.story.args).toBeNull();
    expect(fitted.attributes).toStrictEqual({});
    expect(fitted.selector).toBe("div");
    expect(fitted.box).toStrictEqual(anchor.box);
  });

  test("[正常系]収まっているものはそのまま返す", () => {
    const anchor = { ...big(), attributes: {}, ancestors: [] };

    expect(fitAnchor(anchor)).toBe(anchor);
  });

  test("[正常系]循環する値・長い値も JSON にして切る", () => {
    const value: Record<string, unknown> = { a: "x".repeat(50) };
    value["self"] = value;

    expect(safeJson(value, 20)).toHaveLength(20);
    expect(safeJson({ self: value }, 1000)).toContain("[Circular]");
    expect(safeJson(undefined, 10)).toBeNull();
  });
});

describe("pickTarget", () => {
  test("[正常系]押せる要素の外の SVG（アイコン）の中を押したら、SVG の外の要素を指す", () => {
    document.body.innerHTML = `<div class="card"><svg><g><path id="p"></path></g></svg><p>本文</p></div>`;
    const path = document.getElementById("p");
    if (path === null) throw new Error("path がありません");

    expect(pickTarget(path).className).toBe("card");
  });

  test("[正常系]押せる要素の中の SVG を押したら、押せる要素を指す", () => {
    document.body.innerHTML = `<a href="/x" id="link"><svg><path id="p"></path></svg>開く</a>`;
    const path = document.getElementById("p");
    if (path === null) throw new Error("path がありません");

    expect(pickTarget(path).id).toBe("link");
  });
});
