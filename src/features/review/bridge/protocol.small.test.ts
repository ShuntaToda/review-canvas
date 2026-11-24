import { commentAnchorFixture } from "./bridge-fixtures";
import {
  acceptBridgeEvent,
  acceptParentEvent,
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL_VERSION,
  canonicalOrigin,
  PARENT_CHANNEL,
  parseAnchor,
  parseBridgeMessage,
  parseCanvasOrigins,
  parseParentMessage,
  toBridgeEnvelope,
  toParentEnvelope,
} from "./protocol";

const parent = { name: "parent" };
const other = { name: "other" };

describe("acceptParentEvent", () => {
  const allowedOrigins = ["https://canvas.example.com"];

  test("[正常系]親の window から、許したオリジンで届いたものだけを受け取る", () => {
    expect(
      acceptParentEvent(
        { origin: "https://canvas.example.com", source: parent },
        { parent, allowedOrigins, connectedOrigin: null },
      ),
    ).toBe(true);
  });

  test.each([
    ["許していないオリジン", "https://evil.example.com", parent, null],
    ["親でない window", "https://canvas.example.com", other, null],
    [
      "つないだのと違うオリジン",
      "https://canvas.example.com",
      parent,
      "https://other.example.com",
    ],
  ])("[異常系]%s からは受け取らない", (_label, origin, source, connected) => {
    expect(
      acceptParentEvent(
        { origin, source },
        {
          parent,
          allowedOrigins: [...allowedOrigins, "https://other.example.com"],
          connectedOrigin: connected,
        },
      ),
    ).toBe(false);
  });
});

describe("acceptBridgeEvent", () => {
  const frameWindow = { name: "frame" };

  test("[正常系]その iframe の window から、Storybook のオリジンで届いたものだけを受け取る", () => {
    expect(
      acceptBridgeEvent(
        { origin: "https://sb.example.com", source: frameWindow },
        { frameWindow, storybookOrigin: "https://sb.example.com" },
      ),
    ).toBe(true);
  });

  test.each([
    ["違うオリジン", "https://canvas.example.com", frameWindow],
    ["別の iframe の window", "https://sb.example.com", other],
    ["送り元なし", "https://sb.example.com", null],
  ])("[異常系]%s からは受け取らない", (_label, origin, source) => {
    expect(
      acceptBridgeEvent(
        { origin, source },
        { frameWindow, storybookOrigin: "https://sb.example.com" },
      ),
    ).toBe(false);
  });

  test("[異常系]iframe の window が無い（外した）ときは受け取らない", () => {
    expect(
      acceptBridgeEvent(
        { origin: "https://sb.example.com", source: null },
        { frameWindow: null, storybookOrigin: "https://sb.example.com" },
      ),
    ).toBe(false);
  });
});

describe("parseCanvasOrigins", () => {
  test("[正常系]カンマ区切りの http(s) のオリジンを正規の形で読み、ほかは捨てる", () => {
    expect(
      parseCanvasOrigins(
        "https://Canvas.example.com, http://localhost:4100,*,null,https://a.example.com/path,javascript:alert(1),",
      ),
    ).toStrictEqual(["https://canvas.example.com", "http://localhost:4100"]);
    expect(parseCanvasOrigins(null)).toStrictEqual([]);
  });

  test("[異常系]利用者名付き・パス付きのものはオリジンにしない", () => {
    expect(canonicalOrigin("https://user:pass@example.com")).toBeNull();
    expect(canonicalOrigin("https://example.com/sb/")).toBeNull();
    expect(canonicalOrigin("https://example.com/")).toBe("https://example.com");
  });
});

describe("parseParentMessage", () => {
  test("[正常系]印と版の付いた知らせを読む", () => {
    expect(
      parseParentMessage(
        toParentEnvelope({ type: "hello", interactive: true }),
      ),
    ).toStrictEqual({ type: "hello", interactive: true });
    expect(
      parseParentMessage(
        toParentEnvelope({
          type: "capture",
          requestId: 3,
          point: { x: 1, y: 2 },
          story: { id: "a--b", title: "A", name: "B", importPath: null },
        }),
      ),
    ).toStrictEqual({
      type: "capture",
      requestId: 3,
      point: { x: 1, y: 2 },
      story: { id: "a--b", title: "A", name: "B", importPath: null },
    });
  });

  test("[正常系]ピンを探す知らせは、形の合う手がかりだけを残す", () => {
    const anchor = commentAnchorFixture();
    expect(
      parseParentMessage({
        channel: PARENT_CHANNEL,
        version: BRIDGE_PROTOCOL_VERSION,
        type: "locate",
        requestId: 1,
        pins: [
          { id: "t1", anchor },
          { id: "t2", anchor: { ...anchor, version: 2 } },
          { id: 3, anchor },
        ],
      }),
    ).toStrictEqual({
      type: "locate",
      requestId: 1,
      pins: [{ id: "t1", anchor }],
    });
  });

  test.each([
    ["印が違う", { channel: BRIDGE_CHANNEL, version: 1, type: "blur" }],
    ["版が違う", { channel: PARENT_CHANNEL, version: 2, type: "blur" }],
    ["知らない種類", { channel: PARENT_CHANNEL, version: 1, type: "eval" }],
    [
      "形が違う",
      {
        channel: PARENT_CHANNEL,
        version: 1,
        type: "hello",
        interactive: "yes",
      },
    ],
    [
      "番号が負",
      {
        channel: PARENT_CHANNEL,
        version: 1,
        type: "capture",
        requestId: -1,
        point: { x: 0, y: 0 },
        story: { id: "a", title: "A", name: "B", importPath: null },
      },
    ],
    ["文字列", "hello"],
    ["null", null],
  ])("[異常系]%s知らせは null", (_label, data) => {
    expect(parseParentMessage(data)).toBeNull();
  });
});

describe("parseParentMessage（遷移のボタン）", () => {
  test("[正常系]遷移のボタンを探す頼みを読む（番号が正しくなければ null）", () => {
    expect(
      parseParentMessage(
        toParentEnvelope({ type: "transitions", requestId: 5 }),
      ),
    ).toStrictEqual({ type: "transitions", requestId: 5 });
    expect(
      parseParentMessage({
        channel: PARENT_CHANNEL,
        version: BRIDGE_PROTOCOL_VERSION,
        type: "transitions",
        requestId: -1,
      }),
    ).toBeNull();
  });
});

describe("parseBridgeMessage", () => {
  const render = {
    preview: true,
    started: true,
    phase: "playing",
    hasPlayFunction: true,
  };

  test("[正常系]つないだ・描画・高さ・キーの知らせを読む", () => {
    expect(
      parseBridgeMessage(
        toBridgeEnvelope({
          type: "ready",
          render,
          focused: false,
          height: 640,
        }),
      ),
    ).toStrictEqual({ type: "ready", render, focused: false, height: 640 });
    expect(
      parseBridgeMessage(toBridgeEnvelope({ type: "size", height: 900 })),
    ).toStrictEqual({ type: "size", height: 900 });
    expect(
      parseBridgeMessage(
        toBridgeEnvelope({
          type: "keydown",
          key: "c",
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          isComposing: false,
          typing: false,
        }),
      ),
    ).toMatchObject({ type: "keydown", key: "c", typing: false });
  });

  test("[正常系]集めた手がかりは形を確かめ、違えば null にする（コメントは手がかりなしで送る）", () => {
    const anchor = commentAnchorFixture();
    expect(
      parseBridgeMessage(
        toBridgeEnvelope({ type: "captured", requestId: 1, anchor }),
      ),
    ).toStrictEqual({ type: "captured", requestId: 1, anchor });
    expect(
      parseBridgeMessage({
        ...toBridgeEnvelope({ type: "captured", requestId: 1, anchor: null }),
        anchor: { ...anchor, tag: 1 },
      }),
    ).toStrictEqual({ type: "captured", requestId: 1, anchor: null });
  });

  test("[正常系]探した結果は、形の合うものだけを残す", () => {
    const box = { x: 1, y: 2, width: 3, height: 4 };
    expect(
      parseBridgeMessage({
        channel: BRIDGE_CHANNEL,
        version: BRIDGE_PROTOCOL_VERSION,
        type: "located",
        requestId: 2,
        results: [
          { id: "t1", found: { x: 1, y: 2, box } },
          { id: "t2", found: null },
          { id: "t3", found: { x: "1", y: 2, box } },
        ],
      }),
    ).toStrictEqual({
      type: "located",
      requestId: 2,
      results: [
        { id: "t1", found: { x: 1, y: 2, box } },
        { id: "t2", found: null },
      ],
    });
  });

  test("[正常系]遷移のボタンを探した結果は、形の合う行だけを残す（範囲は親の側で確かめる）", () => {
    const box = { x: 1, y: 2, width: 3, height: 4 };
    expect(
      parseBridgeMessage({
        channel: BRIDGE_CHANNEL,
        version: BRIDGE_PROTOCOL_VERSION,
        type: "transitions",
        requestId: 4,
        results: [
          { index: 0, box: { ...box, extra: "x" } },
          { index: 1, box: null },
          { index: -1, box },
          { index: 1.5, box },
          { index: 2, box: { ...box, width: "3" } },
          { index: 3 },
          "x",
        ],
      }),
    ).toStrictEqual({
      type: "transitions",
      requestId: 4,
      results: [
        { index: 0, box },
        { index: 1, box: null },
      ],
    });
    expect(
      parseBridgeMessage(toBridgeEnvelope({ type: "interacted" })),
    ).toStrictEqual({ type: "interacted" });
  });

  test("[異常系]遷移のボタンを探した結果は、ストーリーに書ける行の上限より多くは読まない", () => {
    const results = Array.from({ length: 60 }, (_, index) => ({
      index,
      box: null,
    }));
    const parsed = parseBridgeMessage(
      toBridgeEnvelope({ type: "transitions", requestId: 1, results }),
    );
    expect(parsed?.type === "transitions" && parsed.results).toHaveLength(50);
  });

  test.each([
    ["親からの印", { channel: PARENT_CHANNEL, version: 1, type: "blur" }],
    [
      "高さが数でない",
      { channel: BRIDGE_CHANNEL, version: 1, type: "size", height: "1" },
    ],
    [
      "描画の様子の形が違う",
      {
        channel: BRIDGE_CHANNEL,
        version: 1,
        type: "render",
        render: { preview: true },
      },
    ],
  ])("[異常系]%s知らせは null", (_label, data) => {
    expect(parseBridgeMessage(data)).toBeNull();
  });
});

describe("parseAnchor", () => {
  test("[異常系]8KB を超える手がかりは null", () => {
    const anchor = commentAnchorFixture();
    const attributes = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`data-x${i}`, "あ".repeat(60)]),
    );
    expect(parseAnchor({ ...anchor, attributes })).toBeNull();
  });
});
