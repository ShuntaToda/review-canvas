import {
  anchorMatchesShot,
  type CapturedElement,
  hasMainElementAt,
  isWaitingStale,
  nextWaiting,
  refreshesDraft,
  type PendingPlaceSituation,
  pendingPlaceStep,
  sameScreenHeight,
} from "./pending-place";
import type { ShotElement } from "./story-shots";

const situation = (
  overrides: Partial<PendingPlaceSituation> = {},
): PendingPlaceSituation => ({
  revealed: false,
  bridgeReady: false,
  bridgeMissing: false,
  canLoad: true,
  settled: false,
  shot: { height: 812 },
  liveHeight: null,
  baseHeight: 812,
  mainElementAtPoint: false,
  ...overrides,
});

describe("sameScreenHeight", () => {
  test("[正常系]撮ったときの中身の高さがあれば、切り上げる前の高さどうしを比べる（フォントの違いの分、8px までは同じ）", () => {
    const shot = { height: 812, contentHeight: 420 };
    expect(sameScreenHeight(shot, 420, 812)).toBe(true);
    expect(sameScreenHeight(shot, 428, 812)).toBe(true);
    expect(sameScreenHeight(shot, 412, 812)).toBe(true);
    // 画面の最低の高さより短い画面どうしでも、違いが分かる
    expect(sameScreenHeight(shot, 429, 812)).toBe(false);
    expect(sameScreenHeight(shot, 640, 812)).toBe(false);
  });

  test("[正常系]長い画面は、高さの 1% までを同じとみなす", () => {
    const shot = { height: 3000, contentHeight: 3000 };
    expect(sameScreenHeight(shot, 3030, 812)).toBe(true);
    expect(sameScreenHeight(shot, 2970, 812)).toBe(true);
    expect(sameScreenHeight(shot, 3031, 812)).toBe(false);
  });

  test("[正常系]撮ったときの中身の高さが無い（前の版で撮った）ときは、画面の最低の高さまで切り上げた高さで比べる", () => {
    expect(sameScreenHeight({ height: 812 }, 420, 812)).toBe(true);
    expect(sameScreenHeight({ height: 812 }, 640, 812)).toBe(true);
    expect(sameScreenHeight({ height: 812 }, 821, 812)).toBe(false);
    expect(sameScreenHeight({ height: 1200 }, 1201, 812)).toBe(true);
  });
});

describe("pendingPlaceStep", () => {
  test("[正常系]iframe を読み込んでいる途中は待つ", () => {
    expect(pendingPlaceStep(situation())).toBe("wait");
    // 橋渡しとつながっても、描画・play 関数が終わるまでは待つ
    expect(pendingPlaceStep(situation({ bridgeReady: true }))).toBe("wait");
    expect(pendingPlaceStep(situation({ revealed: true }))).toBe("wait");
  });

  test("[正常系]動く画面に切り替わった直後は、高さがまだ届いていなくても・前の高さが届いていても、高さの知らせを待つ", () => {
    const live = { revealed: true, bridgeReady: true };
    expect(pendingPlaceStep(situation(live))).toBe("settle");
    expect(pendingPlaceStep(situation({ ...live, liveHeight: 812 }))).toBe(
      "settle",
    );
    // 描画の途中に届いた高さが違っていても、待つ前には決めない
    expect(pendingPlaceStep(situation({ ...live, liveHeight: 1040 }))).toBe(
      "settle",
    );
  });

  test("[正常系]待ったあと、高さが画像と同じなら、手がかりを集める", () => {
    expect(
      pendingPlaceStep(
        situation({
          revealed: true,
          bridgeReady: true,
          settled: true,
          liveHeight: 812,
        }),
      ),
    ).toBe("capture");
  });

  test("[正常系]待ったあと、高さが画像と違えば、手がかりを集めず、クリックし直してもらう", () => {
    const live = { revealed: true, bridgeReady: true, settled: true };
    expect(pendingPlaceStep(situation({ ...live, liveHeight: 1040 }))).toBe(
      "ask-again",
    );
    expect(
      pendingPlaceStep(
        situation({
          ...live,
          shot: { height: 812, contentHeight: 420 },
          liveHeight: 640,
        }),
      ),
    ).toBe("ask-again");
  });

  describe("フォントの違いだけでは知らせを出さない", () => {
    const live = { revealed: true, bridgeReady: true, settled: true };
    const button: ShotElement = {
      tag: "button",
      x: 24,
      y: 346,
      width: 89,
      height: 34,
      text: "注文する",
    };
    const point = { x: 68, y: 363 };
    const captured = (text: string): CapturedElement => ({
      tag: "button",
      role: "button",
      text,
      box: { x: 24, y: 349, width: 92, height: 36 },
    });
    const shot = { height: 1275, contentHeight: 1275 };

    test("[正常系]高さが 6px 違っても、押した点の主な要素が同じなら置ける", () => {
      const mainElementAtPoint = hasMainElementAt([button], point);

      expect(mainElementAtPoint).toBe(true);
      expect(
        pendingPlaceStep(
          situation({ ...live, shot, liveHeight: 1281, mainElementAtPoint }),
        ),
      ).toBe("capture");
      expect(anchorMatchesShot([button], point, captured("注文する"))).toBe(
        true,
      );
    });

    test("[正常系]押した点に主な要素があれば、高さが大きく違っても高さでは決めず、集めた手がかりが違うときに知らせる", () => {
      expect(
        pendingPlaceStep(
          situation({
            ...live,
            shot,
            liveHeight: 1425,
            mainElementAtPoint: hasMainElementAt([button], point),
          }),
        ),
      ).toBe("capture");
      expect(anchorMatchesShot([button], point, captured("キャンセル"))).toBe(
        false,
      );
    });

    test.each([
      ["主な要素を残していない画像", undefined],
      ["押した点に主な要素が無い", [{ ...button, y: 600 }]],
    ])(
      "[正常系]%s は高さで決める。6px の違い（1281px）は置け、150px の違いは知らせる",
      (_, elements) => {
        const mainElementAtPoint = hasMainElementAt(elements, point);

        expect(mainElementAtPoint).toBe(false);
        expect(
          pendingPlaceStep(
            situation({ ...live, shot, liveHeight: 1281, mainElementAtPoint }),
          ),
        ).toBe("capture");
        expect(
          pendingPlaceStep(
            situation({ ...live, shot, liveHeight: 1425, mainElementAtPoint }),
          ),
        ).toBe("ask-again");
      },
    );
  });

  test("[正常系]待っても高さが届かない・画像が無くなったときは、比べずに手がかりを集める", () => {
    const live = { revealed: true, bridgeReady: true, settled: true };
    expect(pendingPlaceStep(situation(live))).toBe("capture");
    expect(
      pendingPlaceStep(situation({ ...live, shot: null, liveHeight: 1040 })),
    ).toBe("capture");
  });

  test("[正常系]橋渡しの無い Storybook・読み込めない倍率では、手がかりなしで置く", () => {
    expect(
      pendingPlaceStep(situation({ revealed: true, bridgeMissing: true })),
    ).toBe("place-without-anchor");
    expect(pendingPlaceStep(situation({ canLoad: false }))).toBe(
      "place-without-anchor",
    );
  });
});

describe("anchorMatchesShot", () => {
  const element = (overrides: Partial<ShotElement> = {}): ShotElement => ({
    tag: "button",
    x: 100,
    y: 200,
    width: 120,
    height: 40,
    text: "注文する",
    ...overrides,
  });
  const anchor = (
    overrides: Partial<CapturedElement> = {},
  ): CapturedElement => ({
    tag: "button",
    role: "button",
    text: "注文する",
    box: { x: 100, y: 200, width: 120, height: 40 },
    ...overrides,
  });
  const point = { x: 150, y: 220 };

  test("[正常系]主な要素を残していない画像（前の版で撮った）では比べない", () => {
    expect(anchorMatchesShot(undefined, point, anchor())).toBe(true);
  });

  test("[正常系]画像でクリックした位置にあった押せる要素と、タグと文字が同じなら合っている", () => {
    expect(anchorMatchesShot([element()], point, anchor())).toBe(true);
    // フォントの違いで矩形が少し違っても、同じ要素とみなす
    expect(
      anchorMatchesShot(
        [element()],
        point,
        anchor({ box: { x: 96, y: 204, width: 131, height: 44 } }),
      ),
    ).toBe(true);
    // 長い文字は、目録の側が途中で切ってある
    expect(
      anchorMatchesShot(
        [element({ text: "注文を確定して支払いへ進" })],
        point,
        anchor({ text: "注文を確定して 支払いへ進む（3 点）" }),
      ),
    ).toBe(true);
  });

  test("[正常系]高さが同じでも、並びが入れ替わって別の要素が手がかりになったら、ずれているとみなす", () => {
    expect(
      anchorMatchesShot([element()], point, anchor({ text: "キャンセル" })),
    ).toBe(false);
    expect(
      anchorMatchesShot(
        [element()],
        point,
        anchor({ tag: "a", role: "link", text: "注文する" }),
      ),
    ).toBe(false);
    // 画像では何も無かった位置に、押せる要素が出ている
    expect(anchorMatchesShot([], point, anchor())).toBe(false);
    expect(anchorMatchesShot([element({ x: 400 })], point, anchor())).toBe(
      false,
    );
  });

  test("[正常系]文字の無い要素（入力欄・アイコンのボタン）は、どちらも文字が無いときだけ合う", () => {
    const input = element({ tag: "input", text: "" });
    expect(
      anchorMatchesShot(
        [input],
        point,
        anchor({ tag: "input", role: "textbox", text: null }),
      ),
    ).toBe(true);
    expect(anchorMatchesShot([element({ text: "" })], point, anchor())).toBe(
      false,
    );
  });

  test("[正常系]主な要素でない所（文章・余白）の手がかりは、画像でもその位置に押せる要素が無ければ合っている", () => {
    const text = anchor({
      tag: "p",
      role: null,
      text: "お届け先",
      box: { x: 90, y: 190, width: 300, height: 60 },
    });
    expect(anchorMatchesShot([], point, text)).toBe(true);
    // 見出しの中の文字を指したときも合っている
    expect(
      anchorMatchesShot(
        [element({ tag: "h2", text: "お届け先", width: 600 })],
        point,
        anchor({ tag: "span", role: null, text: "お届け先" }),
      ),
    ).toBe(true);
  });

  test("[正常系]画像では押せる要素があった位置で、その外の要素が手がかりになったら、ずれているとみなす。中の深い要素なら合っている", () => {
    const card = element({
      tag: "a",
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      text: "商品",
    });
    expect(
      anchorMatchesShot(
        [card],
        point,
        anchor({
          tag: "span",
          role: null,
          box: { x: 120, y: 210, width: 80, height: 20 },
        }),
      ),
    ).toBe(true);
    expect(
      anchorMatchesShot(
        [element()],
        point,
        anchor({
          tag: "div",
          role: null,
          box: { x: 0, y: 0, width: 1000, height: 2000 },
        }),
      ),
    ).toBe(false);
  });
});

describe("キャンバスに 1 つだけ持つ待ち", () => {
  const waiting = { source: "pc", storyId: "a", point: { x: 1, y: 2 } };

  test("[正常系]別の所をクリックしたら前の待ちを取り消し、やめるのはその画面の待ちだけ", () => {
    expect(nextWaiting(waiting, "pc", "b", { x: 3, y: 4 })).toEqual({
      source: "pc",
      storyId: "b",
      point: { x: 3, y: 4 },
    });
    expect(nextWaiting(waiting, "pc", "a", null)).toBeNull();
    expect(nextWaiting(waiting, "pc", "b", null)).toBe(waiting);
    expect(nextWaiting(null, "pc", "b", null)).toBeNull();
  });

  test("[正常系]ページを変えた・コメントの道具でなくなったら、待ちを捨てる", () => {
    expect(isWaitingStale(waiting, "pc", "comment")).toBe(false);
    expect(isWaitingStale(waiting, "sp", "comment")).toBe(true);
    expect(isWaitingStale(waiting, "pc", "move")).toBe(true);
  });

  test("[正常系]いまの下書きと同じ画面・同じ位置に置き直すときだけ、下書きの手がかりの足し直しとみなす", () => {
    const draft = { storyId: "a", x: 1, y: 2 };
    expect(refreshesDraft(draft, "a", { x: 1, y: 2 })).toBe(true);
    expect(refreshesDraft(draft, "b", { x: 1, y: 2 })).toBe(false);
    expect(refreshesDraft(draft, "a", { x: 1, y: 3 })).toBe(false);
    expect(refreshesDraft(null, "a", { x: 1, y: 2 })).toBe(false);
  });
});
