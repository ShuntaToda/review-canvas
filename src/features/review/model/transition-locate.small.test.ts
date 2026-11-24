// @vitest-environment jsdom
import type { TransitionSpec } from "./story-shots";
import { locateTransitionButtons } from "./transition-locate";

/** jsdom は配置を計算しないので、data-rect="x,y,幅,高さ" から矩形を返す（無い要素は大きさ 0 = 見えていない） */
const rectOf = (element: Element): DOMRect => {
  const [x = 0, y = 0, width = 0, height = 0] = (
    element.getAttribute("data-rect") ?? ""
  )
    .split(",")
    .filter((part) => part !== "")
    .map(Number);
  return new DOMRect(x, y, width, height);
};

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return rectOf(this);
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** 書いた行をすべて探す */
const locate = (rows: TransitionSpec[]) =>
  locateTransitionButtons(
    document,
    { rows, overflow: false },
    rows.map((_, index) => index),
  );

describe("locateTransitionButtons", () => {
  test("[正常系]role と name（exact）で探し、見つかったボタンの位置を返す", () => {
    document.body.innerHTML = `
      <button data-rect="10,20,80,30">ログイン</button>
      <button data-rect="10,60,80,30">ログインする</button>
      <a href="/signup" data-rect="10,100,80,20">新規登録</a>`;

    expect(
      locate([
        { from: { role: "button", name: "ログイン" }, to: "a--b" },
        { from: { role: "link", name: "新規登録" }, to: "a--c" },
      ]),
    ).toStrictEqual([
      { index: 0, box: { x: 10, y: 20, width: 80, height: 30 } },
      { index: 1, box: { x: 10, y: 100, width: 80, height: 20 } },
    ]);
  });

  test("[正常系]名前は中の文字をつなげて読む（インラインの要素の間に空白を入れない）・aria-label を先に読む", () => {
    document.body.innerHTML = `
      <button data-rect="0,0,50,20">Log<b>in</b></button>
      <button aria-label="閉じる" data-rect="0,30,20,20">×</button>`;

    expect(
      locate([
        { from: { role: "button", name: "Login" } },
        { from: { role: "button", name: "閉じる" } },
        { from: { role: "button", name: "×" } },
      ]),
    ).toStrictEqual([
      { index: 0, box: { x: 0, y: 0, width: 50, height: 20 } },
      { index: 1, box: { x: 0, y: 30, width: 20, height: 20 } },
      { index: 2, box: null },
    ]);
  });

  test("[正常系]text（exact）で探し、文字を持つ要素から押せる要素へさかのぼる", () => {
    document.body.innerHTML = `
      <a href="/cart" data-rect="5,5,120,40"><span data-rect="10,10,60,20">カートを見る</span></a>
      <p data-rect="0,80,300,20">カートを見るには、ログインしてください</p>`;

    expect(locate([{ from: { text: "カートを見る" } }])).toStrictEqual([
      { index: 0, box: { x: 5, y: 5, width: 120, height: 40 } },
    ]);
  });

  test("[正常系]testId で探す（値は CSS のセレクタにしないので、引用符を含んでもよい）", () => {
    document.body.innerHTML = `
      <button data-testid='go"next' data-rect="1,2,3,4">次へ</button>`;

    expect(locate([{ from: { testId: 'go"next' } }])).toStrictEqual([
      { index: 0, box: { x: 1, y: 2, width: 3, height: 4 } },
    ]);
  });

  test("[正常系]2 つ以上に当たる行は位置を決めず、heading で絞れば 1 つに決まる", () => {
    document.body.innerHTML = `
      <h2 data-rect="0,0,200,30">お届け先</h2>
      <button data-rect="0,40,80,30">変更</button>
      <h2 data-rect="0,100,200,30">お支払い方法</h2>
      <button data-rect="0,140,80,30">変更</button>`;

    expect(
      locate([
        { from: { role: "button", name: "変更" } },
        { from: { role: "button", name: "変更", heading: "お支払い 方法" } },
      ]),
    ).toStrictEqual([
      { index: 0, box: null },
      { index: 1, box: { x: 0, y: 140, width: 80, height: 30 } },
    ]);
  });

  test("[正常系]見えていない要素（大きさが無い・visibility: hidden）は数えない。aria-hidden の中は role で探さない", () => {
    document.body.innerHTML = `
      <button>購入する</button>
      <button style="visibility: hidden" data-rect="0,0,80,30">購入する</button>
      <div aria-hidden="true"><button data-rect="0,40,80,30">購入する</button></div>
      <button data-rect="0,80,80,30">購入する</button>`;

    expect(
      locate([{ from: { role: "button", name: "購入する" } }]),
    ).toStrictEqual([
      { index: 0, box: { x: 0, y: 80, width: 80, height: 30 } },
    ]);
  });

  test("[異常系]見つからない行は null、決め方が書けていない行（撮るときも目録に残らない）は返さない", () => {
    document.body.innerHTML = `<button data-rect="0,0,10,10">OK</button>`;

    expect(
      locate([
        { from: { role: "button", name: "キャンセル" } },
        { from: null },
        { from: { role: "button" } },
        { from: { role: "button", name: "OK", text: "OK" } },
        { from: { text: "OK" } },
      ]),
    ).toStrictEqual([
      { index: 0, box: null },
      { index: 4, box: { x: 0, y: 0, width: 10, height: 10 } },
    ]);
  });

  test("[正常系]頼まれた行（目録にある行）だけを探す", () => {
    document.body.innerHTML = `<button data-rect="0,0,10,10">OK</button>`;

    expect(
      locateTransitionButtons(
        document,
        {
          rows: [
            { from: { role: "button", name: "OK" } },
            { from: { text: "OK" } },
          ],
          overflow: false,
        },
        [1],
      ),
    ).toStrictEqual([{ index: 1, box: { x: 0, y: 0, width: 10, height: 10 } }]);
  });

  test("[正常系]text は、その文字を持ついちばん内側の要素だけに当たる（包む要素とで 2 つにしない）", () => {
    document.body.innerHTML = `
      <div data-rect="0,0,300,40"><span data-rect="4,4,60,20">注文履歴</span></div>`;

    expect(locate([{ from: { text: "注文履歴" } }])).toStrictEqual([
      { index: 0, box: { x: 4, y: 4, width: 60, height: 20 } },
    ]);
  });

  test("[正常系]ロールは Playwright に寄せる: role 属性は知っている最初の語、タグから決まるロール（p は paragraph）", () => {
    document.body.innerHTML = `
      <div role="foo button" data-rect="0,0,40,20">次へ</div>
      <p aria-label="送料のお知らせ" data-rect="0,30,200,20">送料無料</p>
      <a data-rect="0,60,40,20">戻る</a>`;

    expect(
      locate([
        { from: { role: "button", name: "次へ" } },
        { from: { role: "paragraph", name: "送料のお知らせ" } },
        { from: { role: "link", name: "戻る" } },
      ]),
    ).toStrictEqual([
      { index: 0, box: { x: 0, y: 0, width: 40, height: 20 } },
      { index: 1, box: { x: 0, y: 30, width: 200, height: 20 } },
      // href の無い a はリンクではない
      { index: 2, box: null },
    ]);
  });

  test("[異常系]Playwright の知らない role は、要素に書いてあっても見つからない（撮るときと同じ）", () => {
    document.body.innerHTML = `<div role="foo" title="次へ" data-rect="0,0,40,20">次へ</div>`;

    expect(locate([{ from: { role: "foo", name: "次へ" } }])).toStrictEqual([
      { index: 0, box: null },
    ]);
  });

  test("[異常系]画面の左・上の外にある要素は数えない", () => {
    document.body.innerHTML = `<button data-rect="-20,0,10,10">戻る</button>`;

    expect(locate([{ from: { role: "button", name: "戻る" } }])).toStrictEqual([
      { index: 0, box: null },
    ]);
  });
});
