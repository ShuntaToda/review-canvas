// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReviewMeta } from "../api/review-api";
import type * as CanvasModule from "../components/Canvas";
import type * as ReviewData from "../hooks/useReviewData";
import type { Camera } from "../model/camera";
import type { RowPlacement } from "../model/layout";
import type { LinkHighlight } from "../model/story-link";
import type { Story } from "../model/storybook";
import { ReviewPage } from "./ReviewPage";
import type * as Auth from "@/support/auth";

/**
 * 画面のつながり（矢印・札・戻る・つながる画面だけ）の結線を、作業の画面ごと描いて確かめる。
 * API・Storybook の読み込みとログインは偽物にし、キャンバスは並べた画面のタイトルと見え方だけを出す偽物にする
 * （矢印と札はキャンバスの上に重ねる別の部品なので、本物が出る）
 */
const fixtures = vi.hoisted(() => {
  const story = (title: string, name = "Default"): Story => ({
    id: `${title.toLowerCase().replaceAll("/", "-")}--${name.toLowerCase()}`,
    title,
    name,
    importPath: null,
    source: "shop",
  });
  const stories: Story[] = [
    story("Shop/List"),
    story("Shop/Form"),
    story("Shop/Form", "Filled"),
    story("Shop/Done"),
    story("Shop/Admin"),
    story("Guide/Top"),
    story("Components/Button"),
  ];
  const published = (branch: string) => ({
    branch,
    commit: "abc1234",
    builtAt: null,
    basePath: `/sb/${branch}/`,
    storybooks: [
      { source: "shop", available: true },
      { source: "blog", available: true },
    ],
  });
  const meta: ReviewMeta = {
    defaultBranch: "main",
    branches: [published("main"), published("feature/cart")],
    sources: {
      storybooks: [
        {
          id: "shop",
          label: "サンプルショップ",
          widths: [375, 1280],
          defaultWidth: 1280,
          baseHeight: 800,
        },
        {
          id: "blog",
          label: "ブログ",
          widths: [375, 1280],
          defaultWidth: 1280,
          baseHeight: 800,
        },
      ],
      excludeTitlePrefixes: ["Components/"],
    },
  };
  const rect = { index: 0, x: 20, y: 100, width: 120, height: 40 };
  const shotOf = (id: string, width: number) => ({
    storyId: id,
    width,
    height: 800,
    path: `review-canvas-shots/${id}-${String(width)}-0123456789abcdef.png`,
    transitions: [rect],
  });
  const transitions = {
    "shop-list--default": [
      { index: 0, to: "shop-form--default", label: "在庫があるとき" },
      { index: 1, to: "components-button--default" },
      { index: 2, to: "guide-top--default" },
      { index: 3, to: "shop-gone--default", label: "消えた画面" },
      { index: 4, to: "shop-done--default", label: "<img src=x>注文" },
    ],
    "shop-form--default": [{ index: 0, to: "shop-form--filled" }],
    "shop-form--filled": [{ index: 0, to: "shop-list--default" }],
  };
  /** 目録（kind: transitions は遷移あり、old は遷移を残す前の版、none は目録が無い） */
  const state = { manifest: "transitions" as "transitions" | "old" | "none" };
  const manifest = () =>
    state.manifest === "none"
      ? null
      : {
          version: 1,
          shots: stories.flatMap((s) => [
            shotOf(s.id, 375),
            shotOf(s.id, 1280),
          ]),
          playFunctions: {},
          ...(state.manifest === "transitions" ? { transitions } : {}),
        };
  const blogStories: Story[] = [{ ...story("Blog/Entry"), source: "blog" }];
  return { stories, blogStories, meta, state, manifest };
});

vi.mock("../hooks/useReviewData", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewData>();
  const shots = await import("../model/story-shots");
  const loaded = <T,>(data: T) => ({
    data,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: () => Promise.resolve(data),
  });
  return {
    ...actual,
    useReviewMeta: () => loaded(fixtures.meta),
    useStorybookSession: () => ({
      access: "public",
      ready: true,
      error: undefined,
      retry: () => undefined,
    }),
    useStories: () =>
      loaded({
        shop: { kind: "ok" as const, stories: fixtures.stories },
        blog: { kind: "ok" as const, stories: fixtures.blogStories },
      }),
    useShots: () =>
      loaded({
        shop: shots.buildShotCatalog(
          shots.parseShotsManifest(fixtures.manifest()),
          "https://sb.example.com/sb/main/shop/",
        ),
        blog: shots.buildShotCatalog(
          null,
          "https://sb.example.com/sb/main/blog/",
        ),
      }),
    useComments: () =>
      loaded({
        comments: [],
        asOf: "2026-11-13T10:00:00.000+09:00",
        diffsSinceFull: 0,
      }),
    useBranches: () => loaded([]),
  } satisfies typeof ReviewData;
});

vi.mock("@/support/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof Auth>();
  return {
    ...actual,
    useAuth: () => ({
      isLoading: false,
      isAuthenticated: true,
      user: { sub: "auth0|yamada", name: "山田 太郎" },
      loginWithRedirect: () => Promise.resolve(),
      logout: () => Promise.resolve(),
      getAccessTokenSilently: () => Promise.resolve("token"),
    }),
  } satisfies typeof Auth;
});

vi.mock(
  "../components/Canvas",
  () =>
    ({
      Canvas: ({
        rows,
        camera,
        linkHighlight,
        containerRef,
        onCameraChange,
      }: {
        rows: ReadonlyArray<RowPlacement>;
        camera: Camera;
        linkHighlight: LinkHighlight | null;
        containerRef: (element: HTMLDivElement | null) => void;
        onCameraChange: (update: (camera: Camera) => Camera) => void;
      }) => (
        <div
          ref={containerRef}
          data-testid="canvas"
          data-camera={JSON.stringify(camera)}
          data-highlight={linkHighlight?.storyId ?? ""}
        >
          <ul aria-label="キャンバスの画面">
            {rows.map((row) => (
              <li key={row.title}>{row.title}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              onCameraChange((current) => ({
                ...current,
                x: current.x - 900,
                y: current.y - 900,
              }))
            }
          >
            キャンバスを動かす
          </button>
        </div>
      ),
    }) satisfies typeof CanvasModule,
);

const open = (search: string) => {
  window.history.replaceState(null, "", `/${search}`);
  return render(
    <ReviewPage
      storybookOrigin="https://storybook.example.com"
      storybookAccess="public"
    />,
  );
};
const LIST = "?page=shop&story=shop-list--default";

const canvas = () => screen.getByTestId("canvas");
const canvasTitles = () =>
  within(screen.getByRole("list", { name: "キャンバスの画面" }))
    .queryAllByRole("listitem")
    .map((item) => item.textContent);
const urlParams = () => new URLSearchParams(window.location.search);
const label = (name: string) => screen.getByRole("button", { name });
const queryLabel = (name: string | RegExp) =>
  screen.queryByRole("button", { name });
const lineRoles = () =>
  [...document.querySelectorAll("[data-transition-line]")].map((line) =>
    line.getAttribute("data-transition-line"),
  );
const openPicker = () =>
  fireEvent.click(screen.getByRole("button", { name: /画面のつながり/ }));
const reachableOnly = () =>
  screen.getByRole<HTMLInputElement>("checkbox", {
    name: "この画面からつながる画面だけ表示",
  });

class FakeResizeObserver {
  readonly #callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }
  observe() {
    this.#callback(
      [
        {
          contentRect: { width: 1000, height: 800 },
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  disconnect() {
    return undefined;
  }
}

beforeEach(() => {
  window.localStorage.clear();
  fixtures.state.manifest = "transitions";
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ReviewPage の画面のつながり", () => {
  test("[正常系]目録に遷移があれば、真ん中の画面から出る線に札を付け、入ってくる線も引く", () => {
    open(LIST);

    expect(label("在庫があるとき → Shop/Form／Default")).not.toBeNull();
    expect(lineRoles()).toContain("selected");
    // Shop/Form／Filled → Shop/List（入ってくる線）。札は付けない
    expect(lineRoles()).toContain("incoming");
    expect(queryLabel("→ Shop/List／Default")).toBeNull();
  });

  test("[正常系]遷移を残す前の目録・遷移の無い画面では、線を引かず、理由も出さない", () => {
    fixtures.state.manifest = "old";
    open(LIST);

    expect(lineRoles()).toStrictEqual([]);
    expect(
      screen.queryByText(
        "この表示では画面のつながりを出せません（画像を撮っていない幅・ブランチ）",
      ),
    ).toBeNull();
  });

  test("[正常系]画像の無いブランチでは線を引かず、理由を出し、「つながる画面だけ」を押せない", () => {
    fixtures.state.manifest = "none";
    open(LIST);

    expect(lineRoles()).toStrictEqual([]);
    expect(
      screen.getAllByText(
        "この表示では画面のつながりを出せません（画像を撮っていない幅・ブランチ）",
      ).length,
    ).toBeGreaterThan(0);
    openPicker();
    expect(reachableOnly().disabled).toBe(true);
  });

  test("[正常系]自分用に足した幅（画像を撮っていない幅）では理由を出し、「つながる画面だけ」を押せない。撮った幅に戻すと出る", () => {
    window.localStorage.setItem(
      "review-canvas.customWidths",
      JSON.stringify({ shop: [500] }),
    );
    window.localStorage.setItem(
      "review-canvas.widths",
      JSON.stringify({ shop: 500 }),
    );
    open(LIST);

    expect(lineRoles()).toStrictEqual([]);
    expect(
      screen.getAllByText(
        "この表示では画面のつながりを出せません（画像を撮っていない幅・ブランチ）",
      ).length,
    ).toBeGreaterThan(0);
    openPicker();
    expect(reachableOnly().disabled).toBe(true);

    fireEvent.change(screen.getByRole("combobox", { name: "幅" }), {
      target: { value: "1280" },
    });
    expect(lineRoles()).toContain("selected");
    expect(reachableOnly().disabled).toBe(false);
  });

  test("[正常系]「選んだ画面」「すべて」「出さない」で出る線が変わり、次に開いたときも同じ選択肢になる", () => {
    const view = open(LIST);
    expect(lineRoles()).not.toContain("other");

    openPicker();
    fireEvent.click(screen.getByRole("radio", { name: "すべて" }));
    // Shop/Form／Default → Shop/Form／Filled（選んだ画面に関わらない線）を薄く足す
    expect(lineRoles()).toContain("other");
    expect(lineRoles()).toContain("selected");

    fireEvent.click(screen.getByRole("radio", { name: "出さない" }));
    expect(lineRoles()).toStrictEqual([]);
    expect(queryLabel("在庫があるとき → Shop/Form／Default")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "すべて" }));
    view.unmount();
    open(LIST);
    expect(lineRoles()).toContain("other");
    openPicker();
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: "すべて" }).checked,
    ).toBe(true);
  });

  test("[正常系]札で飛び、「戻る」で元の位置・倍率に戻る。2 段飛んで 2 段戻れる", () => {
    open(LIST);
    const initialCamera = canvas().dataset["camera"];

    fireEvent.click(label("在庫があるとき → Shop/Form／Default"));
    expect(urlParams().get("story")).toBe("shop-form--default");
    expect(canvas().dataset["highlight"]).toBe("shop-form--default");
    expect(label("Shop/List／Defaultへ戻る")).not.toBeNull();

    fireEvent.click(label("→ Shop/Form／Filled"));
    expect(urlParams().get("story")).toBe("shop-form--filled");
    expect(label("Shop/Form／Defaultへ戻る")).not.toBeNull();

    fireEvent.click(label("Shop/Form／Defaultへ戻る"));
    expect(urlParams().get("story")).toBe("shop-form--default");

    fireEvent.click(label("Shop/List／Defaultへ戻る"));
    expect(urlParams().get("story")).toBe("shop-list--default");
    expect(canvas().dataset["camera"]).toBe(initialCamera);
    expect(queryLabel(/へ戻る$/)).toBeNull();
  });

  test("[正常系]ブランチを替えると「戻る」が消える", () => {
    open(LIST);
    fireEvent.click(label("在庫があるとき → Shop/Form／Default"));
    expect(queryLabel(/へ戻る$/)).not.toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "ブランチ" }), {
      target: { value: "feature/cart" },
    });

    expect(urlParams().get("branch")).toBe("feature/cart");
    expect(queryLabel(/へ戻る$/)).toBeNull();
  });

  test("[正常系]ページを替えると「戻る」が消え、元のページへ戻っても出ない", () => {
    open(LIST);
    fireEvent.click(label("在庫があるとき → Shop/Form／Default"));
    expect(queryLabel(/へ戻る$/)).not.toBeNull();
    const pageSelect = screen.getByRole("combobox", { name: "ページ" });

    fireEvent.change(pageSelect, { target: { value: "blog" } });
    expect(canvasTitles()).toStrictEqual(["Blog/Entry"]);
    expect(queryLabel(/へ戻る$/)).toBeNull();

    fireEvent.change(pageSelect, { target: { value: "shop" } });
    expect(queryLabel(/へ戻る$/)).toBeNull();
  });

  test("[正常系]札で飛ぶと「戻る」へフォーカスを移し、戻りきると押した札へフォーカスを戻す", () => {
    open(LIST);
    const first = label("在庫があるとき → Shop/Form／Default");
    first.focus();

    fireEvent.click(first);
    expect(document.activeElement).toBe(label("Shop/List／Defaultへ戻る"));

    fireEvent.click(label("→ Shop/Form／Filled"));
    expect(document.activeElement).toBe(label("Shop/Form／Defaultへ戻る"));

    // 1 段戻っても、まだ積んだものがあれば「戻る」に居続ける
    fireEvent.click(label("Shop/Form／Defaultへ戻る"));
    expect(document.activeElement).toBe(label("Shop/List／Defaultへ戻る"));

    fireEvent.click(label("Shop/List／Defaultへ戻る"));
    expect(document.activeElement).toBe(
      label("在庫があるとき → Shop/Form／Default"),
    );
  });

  test("[正常系]画面名の絞り込みで隠れた行き先は「（この表示にありません）」を付け、押すと絞り込みを外して飛び、戻ると絞り込みも戻る", () => {
    open(LIST);
    const search = screen.getByRole<HTMLInputElement>("searchbox", {
      name: "画面名で絞り込む",
    });
    fireEvent.change(search, { target: { value: "List" } });
    expect(canvasTitles()).toStrictEqual(["Shop/List"]);

    fireEvent.click(
      label("在庫があるとき → Shop/Form／Default（この表示にありません）"),
    );
    expect(search.value).toBe("");
    expect(canvasTitles()).toContain("Shop/Form");
    expect(urlParams().get("story")).toBe("shop-form--default");

    fireEvent.click(label("Shop/List／Defaultへ戻る"));
    expect(search.value).toBe("List");
    expect(canvasTitles()).toStrictEqual(["Shop/List"]);
  });

  test("[正常系]部品で隠れた行き先は、押すと「部品も表示」を入れて飛び、戻ると切る", () => {
    open(LIST);
    const components = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "部品も表示",
    });
    expect(components.checked).toBe(false);

    fireEvent.click(
      label("→ Components/Button／Default（この表示にありません）"),
    );
    expect(components.checked).toBe(true);
    expect(canvasTitles()).toContain("Components/Button");

    fireEvent.click(label("Shop/List／Defaultへ戻る"));
    expect(components.checked).toBe(false);
    expect(canvasTitles()).not.toContain("Components/Button");
  });

  test("[正常系]見せる範囲で隠れた行き先は、押すと範囲を外して飛び、戻ると範囲も戻る", () => {
    open(`${LIST}&scope=Shop`);

    fireEvent.click(label("→ Guide/Top／Default（この表示にありません）"));
    expect(urlParams().has("scope")).toBe(false);
    expect(canvasTitles()).toContain("Guide/Top");

    fireEvent.click(label("Shop/List／Defaultへ戻る"));
    expect(urlParams().get("scope")).toBe("Shop");
    expect(canvasTitles()).not.toContain("Guide/Top");
  });

  test("[正常系]行き先が無ければ「→ <ストーリー ID>（見つかりません）」で、押せない", () => {
    open(LIST);

    const missing = label("→ shop-gone--default（見つかりません）");
    // disabled にせず aria-disabled にする（Tab で止まって読める）
    expect(missing).toHaveProperty("disabled", false);
    expect(missing.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(missing);
    expect(queryLabel(/へ戻る$/)).toBeNull();
    expect(urlParams().get("story")).toBe("shop-list--default");
  });

  test("[正常系]目録の label に HTML を書いても文字として出す", () => {
    open(LIST);

    const text = label("<img src=x>注文 → Shop/Done／Default");
    expect(text.querySelector("img")).toBeNull();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  test("[正常系]つながる画面だけ: 選んだ画面から出る向きにたどれる画面だけを並べ、カメラを動かしても変わらず、切ると戻る", () => {
    open(LIST);
    expect(canvasTitles()).toContain("Shop/Admin");

    openPicker();
    fireEvent.click(reachableOnly());
    // Shop/List → Shop/Form → Shop/Form（Filled）→ Shop/List と行ったり来たりしても止まる。Shop/Admin へはつながらない
    const reachable = ["Shop/List", "Shop/Form", "Shop/Done", "Guide/Top"];
    expect(canvasTitles()).toStrictEqual(reachable);
    expect(urlParams().get("story")).toBe("shop-list--default");

    fireEvent.click(screen.getByRole("button", { name: "キャンバスを動かす" }));
    expect(canvasTitles()).toStrictEqual(reachable);

    fireEvent.click(reachableOnly());
    expect(canvasTitles()).toContain("Shop/Admin");
  });

  test("[正常系]つながる画面だけ: 札で飛ぶと飛んだ先を起点にし直し（行き止まりでも止まらない）、戻ると元の起点に戻る", () => {
    open(LIST);
    openPicker();
    fireEvent.click(reachableOnly());
    fireEvent.click(label("<img src=x>注文 → Shop/Done／Default"));

    // Shop/Done は行き止まり
    expect(canvasTitles()).toStrictEqual(["Shop/Done"]);

    fireEvent.click(label("Shop/List／Defaultへ戻る"));
    expect(canvasTitles()).toStrictEqual([
      "Shop/List",
      "Shop/Form",
      "Shop/Done",
      "Guide/Top",
    ]);
  });
});
