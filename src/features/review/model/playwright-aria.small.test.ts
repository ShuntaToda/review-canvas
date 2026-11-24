// @vitest-environment jsdom
import { createAriaReader } from "./playwright-aria";

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

/** html の中の data-target を付けた要素 */
const targetOf = (html: string): Element => {
  document.body.innerHTML = html;
  const target = document.querySelector("[data-target]");
  if (target === null) throw new Error("data-target がありません");
  return target;
};

describe("createAriaReader().roleOf（Playwright の getAriaRole と同じロール）", () => {
  test.each([
    ["a（href あり）", `<a data-target href="/">x</a>`, "link"],
    ["a（href なし）", `<a data-target>x</a>`, null],
    ["area（href あり）", `<map><area data-target href="/"></map>`, "link"],
    ["input（type なし）", `<input data-target>`, "textbox"],
    ["input text", `<input data-target type="text">`, "textbox"],
    ["input search", `<input data-target type="search">`, "searchbox"],
    [
      "input text（list が datalist）",
      `<input data-target list="l"><datalist id="l"></datalist>`,
      "combobox",
    ],
    [
      "input text（list が datalist でない）",
      `<input data-target list="l"><div id="l"></div>`,
      "textbox",
    ],
    ["input hidden", `<input data-target type="hidden">`, null],
    ["input file", `<input data-target type="file">`, "button"],
    ["input button", `<input data-target type="button">`, "button"],
    ["input image", `<input data-target type="image">`, "button"],
    ["input submit", `<input data-target type="submit">`, "button"],
    ["input reset", `<input data-target type="reset">`, "button"],
    ["input checkbox", `<input data-target type="checkbox">`, "checkbox"],
    ["input radio", `<input data-target type="radio">`, "radio"],
    ["input range", `<input data-target type="range">`, "slider"],
    ["input number", `<input data-target type="number">`, "spinbutton"],
    ["input password", `<input data-target type="password">`, "textbox"],
    ["input 知らない type", `<input data-target type="foo">`, "textbox"],
    ["select", `<select data-target></select>`, "combobox"],
    ["select multiple", `<select data-target multiple></select>`, "listbox"],
    ["select size=2", `<select data-target size="2"></select>`, "listbox"],
    ["img（alt あり）", `<img data-target alt="ロゴ">`, "img"],
    ["img（alt なし）", `<img data-target>`, "img"],
    ["img（alt が空）", `<img data-target alt="">`, "presentation"],
    [
      "img（alt が空・title あり）",
      `<img data-target alt="" title="t">`,
      "img",
    ],
    [
      "img（alt が空・aria 属性あり）",
      `<img data-target alt="" aria-describedby="d">`,
      "img",
    ],
    [
      "img（alt が空・tabindex あり）",
      `<img data-target alt="" tabindex="0">`,
      "img",
    ],
    ["form（名前なし）", `<form data-target></form>`, null],
    [
      "form（aria-label）",
      `<form data-target aria-label="検索"></form>`,
      "form",
    ],
    ["section（名前なし）", `<section data-target></section>`, null],
    [
      "section（aria-labelledby）",
      `<section data-target aria-labelledby="h"><h2 id="h">注文</h2></section>`,
      "region",
    ],
    ["td（table）", `<table><tr><td data-target>x</td></tr></table>`, "cell"],
    [
      "td（grid）",
      `<table role="grid"><tr><td data-target>x</td></tr></table>`,
      "gridcell",
    ],
    [
      "td（treegrid）",
      `<table role="treegrid"><tr><td data-target>x</td></tr></table>`,
      "gridcell",
    ],
    [
      "th（scope=col）",
      `<table><tr><th data-target scope="col">x</th><td>1</td></tr></table>`,
      "columnheader",
    ],
    [
      "th（scope=rowgroup）",
      `<table><tr><th data-target scope="rowgroup">x</th></tr><tr><td>1</td></tr></table>`,
      "rowheader",
    ],
    [
      "th（横に中身のある td）",
      `<table><tr><th data-target>x</th><td>1</td></tr></table>`,
      "rowheader",
    ],
    [
      "th（両隣が th）",
      `<table><tr><th>a</th><th data-target>x</th><th>b</th></tr></table>`,
      "columnheader",
    ],
    [
      "th（1 つだけ・行が 1 つ）",
      `<table><tr><th data-target>x</th></tr></table>`,
      null,
    ],
    [
      "th（1 つだけ・行が 2 つ）",
      `<table><tr><th data-target>x</th></tr><tr><td>1</td></tr></table>`,
      "columnheader",
    ],
    ["header（区画の外）", `<header data-target></header>`, "banner"],
    [
      "header（article の中）",
      `<article><header data-target></header></article>`,
      null,
    ],
    [
      "header（role を書いた article の中は数えない）",
      `<article role="note"><header data-target></header></article>`,
      "banner",
    ],
    [
      "header（role=region の中）",
      `<div role="region"><header data-target></header></div>`,
      null,
    ],
    ["footer（区画の外）", `<footer data-target></footer>`, "contentinfo"],
    ["footer（nav の中）", `<nav><footer data-target></footer></nav>`, null],
    ["p", `<p data-target>x</p>`, "paragraph"],
    ["mark（getByRole には書けない）", `<mark data-target>x</mark>`, "mark"],
    ["div", `<div data-target>x</div>`, null],
    [
      "role の知らない語は飛ばす",
      `<div data-target role="foo button">x</div>`,
      "button",
    ],
    [
      "presentation（押せない要素）",
      `<h2 data-target role="presentation">x</h2>`,
      "presentation",
    ],
    [
      "presentation（押せる要素は元のロール）",
      `<button data-target role="presentation">x</button>`,
      "button",
    ],
    [
      "none（aria 属性があると元のロール）",
      `<h2 data-target role="none" aria-label="見出し">x</h2>`,
      "heading",
    ],
    [
      "none（無効にした button は元のロールにしない）",
      `<button data-target role="none" disabled>x</button>`,
      "none",
    ],
    [
      "li（親の ul が presentation）",
      `<ul role="presentation"><li data-target>x</li></ul>`,
      "presentation",
    ],
  ])("%s", (_, html, role) => {
    expect(createAriaReader().roleOf(targetOf(html))).toBe(role);
  });
});

describe("createAriaReader().nameOf（Playwright の getByRole の name と比べる名前）", () => {
  test.each([
    [
      "リンクの中の img の alt",
      `<a data-target href="/"><img alt="サンプルショップ"></a>`,
      "サンプルショップ",
    ],
    [
      "ボタンの中の svg の aria-label",
      `<button data-target><svg aria-label="閉じる"></svg></button>`,
      "閉じる",
    ],
    [
      "ボタンの中の img の alt",
      `<button data-target><img alt="検索"></button>`,
      "検索",
    ],
    [
      "img の alt と文字をつなぐ",
      `<a data-target href="/"><img alt="木のマグカップ"> 木のマグカップ</a>`,
      "木のマグカップ 木のマグカップ",
    ],
    [
      "display: none の子は読まない",
      `<style>.md-only { display: none }</style><button data-target>カートに入れる<span class="md-only">（3 点）</span></button>`,
      "カートに入れる",
    ],
    [
      "visibility: hidden・aria-hidden の子は読まない",
      `<button data-target>購入<span style="visibility: hidden">（隠し）</span><span aria-hidden="true">★</span></button>`,
      "購入",
    ],
    [
      "子の aria-labelledby",
      `<button data-target><span aria-labelledby="l"></span></button><span id="l">送信</span>`,
      "送信",
    ],
    [
      "svg の title",
      `<button data-target><svg><title>戻る</title></svg></button>`,
      "戻る",
    ],
    [
      "input image の alt",
      `<input data-target type="image" alt="注文する">`,
      "注文する",
    ],
    [
      "インラインの要素の間に空白を入れない・ブロックの前後には入れる",
      `<button data-target>Log<b>in</b><div>今すぐ</div></button>`,
      "Login 今すぐ",
    ],
    [
      "aria-label を中の文字より先に読む",
      `<button data-target aria-label="閉じる">×</button>`,
      "閉じる",
    ],
    [
      "aria-labelledby を aria-label より先に読む",
      `<button data-target aria-labelledby="l" aria-label="x">×</button><span id="l">閉じる</span>`,
      "閉じる",
    ],
    [
      "label の付いたボタン",
      `<label for="b">ラベル</label><button data-target id="b">中身</button>`,
      "ラベル",
    ],
    [
      "label の中の入力欄（自分の値は読まない）",
      `<label>数量 <input data-target value="2"></label>`,
      "数量",
    ],
    [
      "aria-labelledby の先の入力欄は値を読む",
      `<input data-target aria-labelledby="l"><span id="l">数量 <input value="2"> 個</span>`,
      "数量 2 個",
    ],
    [
      "input submit の value・既定の名前",
      `<input data-target type="submit">`,
      "Submit",
    ],
    [
      "paragraph には名前を付けられない",
      `<p data-target aria-label="送料のお知らせ">送料無料</p>`,
      "",
    ],
    [
      "名前を中の文字から取らないロールは title",
      `<nav data-target title="パンくず">ホーム</nav>`,
      "パンくず",
    ],
  ])("%s", (_, html, name) => {
    expect(createAriaReader().nameOf(targetOf(html))).toBe(name);
  });
});

describe("createAriaReader().isHidden・isVisible", () => {
  test.each([
    ["ふつうの要素", `<button data-target>x</button>`, false],
    [
      "aria-hidden の中",
      `<div aria-hidden="true"><button data-target>x</button></div>`,
      true,
    ],
    [
      "display: none の中",
      `<div style="display: none"><button data-target>x</button></div>`,
      true,
    ],
    [
      "visibility: hidden",
      `<button data-target style="visibility: hidden">x</button>`,
      true,
    ],
    ["script", `<script data-target></script>`, true],
  ])("isHidden: %s", (_, html, hidden) => {
    expect(createAriaReader().isHidden(targetOf(html))).toBe(hidden);
  });

  test("[正常系]isVisible は大きさがあり visibility が visible のものだけ", () => {
    const shown = targetOf(`<button data-target>x</button>`);
    vi.spyOn(shown, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 10, 10),
    );
    expect(createAriaReader().isVisible(shown)).toBe(true);

    const collapsed = targetOf(
      `<button data-target style="visibility: collapse">x</button>`,
    );
    vi.spyOn(collapsed, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 10, 10),
    );
    expect(createAriaReader().isVisible(collapsed)).toBe(false);

    const empty = targetOf(`<button data-target>x</button>`);
    expect(createAriaReader().isVisible(empty)).toBe(false);
  });
});
