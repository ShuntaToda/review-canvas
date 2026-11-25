import {
  clickStory,
  resolveSelectedStory,
  storyOnCanvas,
  togglePin,
} from "./selected-story";

const none = {
  pinned: undefined,
  clicked: undefined,
  thread: undefined,
  center: undefined,
  lastCenter: undefined,
};

describe("resolveSelectedStory", () => {
  test("[正常系]固定 ＞ クリック ＞ スレッド ＞ 真ん中 の順に、最初にあるものを選ぶ", () => {
    const all = {
      pinned: "pinned",
      clicked: "clicked",
      thread: "thread",
      center: "center",
      lastCenter: "last",
    };
    expect(resolveSelectedStory(all)).toBe("pinned");
    expect(resolveSelectedStory({ ...all, pinned: undefined })).toBe("clicked");
    expect(
      resolveSelectedStory({ ...all, pinned: undefined, clicked: undefined }),
    ).toBe("thread");
    expect(
      resolveSelectedStory({
        ...all,
        pinned: undefined,
        clicked: undefined,
        thread: undefined,
      }),
    ).toBe("center");
  });

  test("[境界値]真ん中がすき間なら直前に真ん中にあった画面、それも無ければ選ばない", () => {
    expect(resolveSelectedStory({ ...none, lastCenter: "last" })).toBe("last");
    expect(resolveSelectedStory(none)).toBeUndefined();
  });
});

describe("storyOnCanvas", () => {
  const shown = (storyId: string) => storyId === "shop-list--default";

  test("[正常系]いまのページで、キャンバスに並んでいる画面だけ返す", () => {
    expect(
      storyOnCanvas(
        { source: "shop", storyId: "shop-list--default" },
        { source: "shop", shown },
      ),
    ).toBe("shop-list--default");
  });

  test("[境界値]並んでいない画面・ほかのページの画面・選んでいないときは undefined", () => {
    expect(
      storyOnCanvas(
        { source: "shop", storyId: "shop-form--default" },
        { source: "shop", shown },
      ),
    ).toBeUndefined();
    expect(
      storyOnCanvas(
        { source: "blog", storyId: "shop-list--default" },
        { source: "shop", shown },
      ),
    ).toBeUndefined();
    expect(storyOnCanvas(null, { source: "shop", shown })).toBeUndefined();
  });
});

describe("togglePin", () => {
  const list = { source: "shop", storyId: "shop-list--default" };
  const form = { source: "shop", storyId: "shop-form--default" };

  test("[正常系]固定していなければ固定し、固定している画面ならもう一度で外す", () => {
    expect(togglePin(null, list)).toStrictEqual(list);
    expect(togglePin(list, list)).toBeNull();
  });

  test("[正常系]別の画面の「固定」を押すと、固定がその画面へ移る（同じ ID でもページが違えば別の画面）", () => {
    expect(togglePin(list, form)).toStrictEqual(form);
    const otherPage = { source: "blog", storyId: "shop-list--default" };
    expect(togglePin(list, otherPage)).toStrictEqual(otherPage);
  });
});

describe("clickStory", () => {
  const list = { source: "shop", storyId: "shop-list--default" };
  const form = { source: "shop", storyId: "shop-form--default" };

  test("[正常系]固定していなければ、クリックした画面を覚える", () => {
    expect(clickStory(null, form, { pinned: false })).toStrictEqual(form);
    expect(clickStory(list, form, { pinned: false })).toStrictEqual(form);
  });

  test("[正常系]固定しているあいだのクリックは覚えない（前のままにする）", () => {
    expect(clickStory(null, form, { pinned: true })).toBeNull();
    expect(clickStory(list, form, { pinned: true })).toStrictEqual(list);
  });
});
