/**
 * 発行のときに撮ったストーリーのスクリーンショット（Storybook と同じ置き場に置く）と、その目録。
 * キャンバスはふだんこの画像を並べ、触る画面だけ iframe に切り替える（model/frame-mode.ts）。
 * 目録が無い（撮る前の版で置いた・撮れなかった）ときは、いままでどおり iframe で出す。
 *
 * 置き場（Storybook 1 つ分の置き場 sb/<ブランチのキー>/<id>/ の下）:
 *   review-canvas-shots.json                              … 目録
 *   review-canvas-shots/<ストーリー ID>-<幅>-<中身のハッシュ>.png … 画像（名前に中身のハッシュを持つので、長く持たせる）
 *   review-canvas-shots/<ストーリー ID>-<幅>-<中身のハッシュ>-thumb.png … 縮小した画像（引いて見るときに使う。無いこともある）
 *
 * このファイルは何も import しない。置くスクリプト（infra/scripts/）からも相対パスで読むため、@/ の別名を使わない
 */

/** 画像の置き場（Storybook の置き場からの相対） */
export const SHOTS_DIR = "review-canvas-shots";

/** 目録のファイル名（Storybook の置き場からの相対） */
export const SHOTS_MANIFEST_FILE = "review-canvas-shots.json";

/** 画像 1 枚（ストーリーと幅の組み合わせごと） */
export type StoryShot = {
  storyId: string;
  /** 撮った画面の幅(px) */
  width: number;
  /** 画像の高さ(px)。中身に合わせた全体の高さ */
  height: number;
  /** 画像の場所（Storybook の置き場からの相対。review-canvas-shots/ の直下） */
  path: string;
  /** 縮小した画像（THUMB_SCALE 倍）の場所。縮小を作る前の版で撮った・作れなかったときは無い */
  thumb?: string;
  /**
   * 撮ったときの中身の高さ(px)。画像の高さは画面の最低の高さ（baseHeight）まで切り上がるので、短い画面どうしでは違いが分からない。
   * 動く画面と中身がずれていないかは、切り上げる前のこの高さで比べる（model/pending-place.ts）。残す前の版で撮ったものには無い
   */
  contentHeight?: number;
  /**
   * 撮ったときの主な要素（押せる要素と見出し）の矩形と文字。画像の上でクリックした位置の要素が、動く画面でも同じかを確かめる。
   * 残す前の版で撮った・数が多すぎた（MAX_SHOT_ELEMENTS）ときは無い（高さだけで比べる）
   */
  elements?: ShotElement[];
};

/** 撮ったときの主な要素 1 つ（位置は画面の左上から。px の整数） */
export type ShotElement = {
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 見えている文字（空白を除いて SHOT_ELEMENT_TEXT_LENGTH 文字まで。入力欄の中身は読まない） */
  text: string;
  /**
   * 要素の見出し（内の最初の見出し。無ければ前にあるいちばん近い見出し。手がかりの heading と同じ決め方で、文字は text と同じ形）。
   * 見出しが無ければ ""。同じ種類・同じ文字の要素が並ぶ画面（商品ごとの「カートに入れる」など）で、どの要素かを見分ける。
   * 残す前の版で撮った目録には無い（見出しは比べない）
   */
  heading?: string;
};

/** 1 枚に残す主な要素の数の上限。超える画面では要素を残さない（一部だけ残すと、残っていない要素を「無くなった」と見誤る） */
export const MAX_SHOT_ELEMENTS = 150;

/** 主な要素の文字を残す長さ（同じ要素かを見分けるのに足りる分だけ。目録を大きくしない） */
export const SHOT_ELEMENT_TEXT_LENGTH = 24;

/**
 * 押せる要素。中の文字・アイコンを押しても、この要素を指したとみなす（model/anchor-capture.ts）。
 * 撮るときに目録へ残す要素と、手がかりを集めるときにさかのぼる先を、同じ並びから決める
 */
export const INTERACTIVE_SELECTORS = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "label",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
] as const;

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/** 目録へ残す主な要素（押せる要素と見出し） */
export const SHOT_ELEMENT_SELECTOR = [
  ...INTERACTIVE_SELECTORS,
  ...HEADING_TAGS,
].join(", ");

/**
 * 中身の高さを測るときに中へ降りて数える要素と文字（空白だけの文字は除く）の数の上限。
 * 測って決めた値ではなく、要素の多い画面で重くしないための目安。尽きたら、それより先へは降りない（低く測る）。
 * 降りるかどうかは中身のはみ出しで決まり、はみ出しは画面の高さで変わるので、尽きる場所も画面の高さで変わりうる
 */
export const MAX_MEASURED_NODES = 5_000;

/**
 * 中身の高さ（px）を測る。橋渡し（bridge/bridge-runtime.ts）と撮影（infra/scripts/story-screenshots.ts）が同じ測り方をする
 * （どちらも上限に MAX_MEASURED_NODES を渡す）。
 * scrollHeight は画面の高さより小さくならないので、中身が縮んでも縮んだと分からない。
 * body の子要素の箱の下端（下の余白まで）に body の下の余白を足したものを中身の高さとする（#storybook-root のほか、body へ出したポータルも含む）。
 * 子要素の箱から中身が下へはみ出している（高さを画面に合わせた入れ物（height: 100vh）の中の長い中身など）ときは、
 * 中へ降りて、はみ出した要素の下端（下の余白まで）と、はみ出した文字の下端も数え、大きい方を中身の高さとする。
 * はみ出した中身の下には、入れ物の内側の下の余白も body の下の余白も足さない
 * （Chromium のページの高さ（撮影の fullPage の画像の高さ）は、はみ出した中身の下に先祖の余白を足さない。
 * 文字の矩形は行の高さより少し低いので、文字がはみ出す画面では数 px 低くなることがある）。
 * body に余白のある画面（Storybook の layout: padded）の 100vh の入れ物は、iframe を伸ばすと余白の分だけ伸びるので、切り替えた後に枠が余白の分だけ高くなりうる。
 * どれも矩形で測るので、画面の高さが変わっても、同じ中身なら同じ高さになる
 * （画面の高さで測り方が変わると、知らせた高さを iframe に付けるたびに測った高さが行き来する）。
 * 数えないもの: 画面に固定した要素、子要素の内の絶対配置の要素（その中身も。body の子要素そのものが絶対配置なら、その箱だけを数える）、
 * スクロール・切り取りをする入れ物（overflow-y が visible でない）の中身（入れ物の箱だけ）。
 * 測れる子要素が無いときは scrollHeight に戻る。
 * 撮影ではこの関数の文字列をブラウザへ渡すので、外の値を読まない（上限は引数で受ける）
 */
export const measureContentHeight = (doc: Document, limit: number): number => {
  const body = doc.body;
  const scrollHeightOf = () =>
    Math.max(doc.documentElement.scrollHeight, body?.scrollHeight ?? 0);
  if (body === null) return scrollHeightOf();
  const view = doc.defaultView;
  if (view === null) return scrollHeightOf();
  const px = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  let budget = limit;
  /** 文字の下端（数えなければ 0） */
  const textBottomOf = (node: Text): number => {
    const range = doc.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    return rect.width === 0 && rect.height === 0 ? 0 : rect.bottom;
  };
  /** 数える要素なら、その計算済みのスタイル（画面に固定した要素と、子要素の内の絶対配置の要素は数えない） */
  const styleOf = (element: Element, topLevel: boolean) => {
    const style = view.getComputedStyle(element);
    if (style.position === "fixed") return null;
    if (style.position === "absolute" && !topLevel) return null;
    return style;
  };
  /** 要素の箱の下端（下の余白まで。大きさが無ければ 0） */
  const boxBottomOf = (element: Element, style: CSSStyleDeclaration) => {
    const rect = element.getBoundingClientRect();
    return rect.width === 0 && rect.height === 0
      ? 0
      : rect.bottom + px(style.marginBottom);
  };
  /** 要素の箱から下へはみ出した中身の下端（はみ出していなければ 0）。中へ降りて測る */
  const overflowBottomOf = (
    element: Element,
    style: CSSStyleDeclaration,
  ): number => {
    // display: contents は自分の箱を持たないので、大きさによらず中へ降りる。
    // はみ出しの 1px までは測り方の端数とみなす（bridge/measure.ts の TOLERANCE と同じ幅。端数で降りる・降りないが揺れないように）
    const descend =
      style.position !== "absolute" &&
      (style.display === "contents" ||
        (style.overflowY === "visible" &&
          element.scrollHeight > element.clientHeight + 1));
    if (!descend) return 0;
    let bottom = 0;
    for (const child of Array.from(element.childNodes)) {
      // 文字・要素は iframe の中の realm のものなので、その window のクラスで見分ける
      if (child instanceof view.Text) {
        if ((child.nodeValue ?? "").trim() === "") continue;
        if (budget <= 0) break;
        budget -= 1;
        bottom = Math.max(bottom, textBottomOf(child));
        continue;
      }
      if (!(child instanceof view.Element)) continue;
      if (budget <= 0) break;
      budget -= 1;
      const childStyle = styleOf(child, false);
      if (childStyle === null) continue;
      bottom = Math.max(
        bottom,
        boxBottomOf(child, childStyle),
        overflowBottomOf(child, childStyle),
      );
    }
    return bottom;
  };
  let boxBottom = 0;
  let overflowBottom = 0;
  for (const child of Array.from(body.children)) {
    const style = styleOf(child, true);
    if (style === null) continue;
    boxBottom = Math.max(boxBottom, boxBottomOf(child, style));
    overflowBottom = Math.max(overflowBottom, overflowBottomOf(child, style));
  }
  if (boxBottom <= 0 && overflowBottom <= 0) return scrollHeightOf();
  const bodyStyle = view.getComputedStyle(body);
  // body の下の余白は、body の子要素の箱の下にだけ足す（箱からはみ出した中身の下には、Chromium のページの高さでも足されない）
  const boxed =
    boxBottom <= 0
      ? 0
      : boxBottom +
        px(bodyStyle.paddingBottom) +
        px(bodyStyle.borderBottomWidth) +
        px(bodyStyle.marginBottom);
  return Math.ceil(Math.max(boxed, overflowBottom) + view.scrollY);
};

/**
 * 画面の主な要素を集める（撮影がブラウザの中で動かす。文字列で渡すので、外の値は引数で受ける）。
 * 見えていない要素（大きさが無い・visibility: hidden）は除く。数が上限を超えたら null（残さない）。
 * 文字の読み方は手がかり（model/anchor-dom.ts の visibleText）に合わせ、入力欄の中身・隠した要素・SVG は読まない
 */
export const collectShotElements = (
  doc: Document,
  selector: string,
  maxElements: number,
  textLength: number,
): ShotElement[] | null => {
  const view = doc.defaultView;
  if (doc.body === null || view === null) return null;
  const skipped = ["script", "style", "template", "noscript", "svg"];
  const valueFields = ["input", "textarea", "select"];
  const textOf = (element: Element): string => {
    let text = "";
    const walk = (node: Node) => {
      if (text.length > textLength * 4) return;
      if (node.nodeType === 3) {
        text += node.nodeValue ?? "";
        return;
      }
      if (node.nodeType !== 1) return;
      const child = node as Element;
      const tag = child.tagName.toLowerCase();
      if (
        skipped.includes(tag) ||
        valueFields.includes(tag) ||
        child.hasAttribute("hidden") ||
        child.getAttribute("aria-hidden") === "true"
      ) {
        return;
      }
      child.childNodes.forEach(walk);
    };
    walk(element);
    return text.replace(/\s+/g, "").slice(0, textLength);
  };
  const headings = Array.from(
    doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'),
  );
  // 手がかりの見出し（model/anchor-capture.ts の headingBefore）と同じ決め方
  const headingOf = (element: Element): string => {
    let found: Element | null = null;
    for (const heading of headings) {
      if (heading === element) continue;
      const position = heading.compareDocumentPosition(element);
      // 要素が見出しを中に持つ（8=CONTAINS）。並びは文書の順なので、最初に当たったものが内の最初の見出し
      if ((position & 8) !== 0) return textOf(heading);
      // 見出しの後ろにある（4=FOLLOWING）か、見出しの中にある（16=CONTAINED_BY）
      if ((position & 4) !== 0 || (position & 16) !== 0) found = heading;
    }
    return found === null ? "" : textOf(found);
  };
  const elements: ShotElement[] = [];
  for (const element of Array.from(doc.body.querySelectorAll(selector))) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (view.getComputedStyle(element).visibility === "hidden") continue;
    if (elements.length >= maxElements) return null;
    elements.push({
      tag: element.tagName.toLowerCase(),
      x: Math.round(rect.left + view.scrollX),
      y: Math.round(rect.top + view.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      text: textOf(element),
      heading: headingOf(element),
    });
  }
  return elements;
};

/** 縮小した画像の倍率（引いて見るときに、原寸の画像を全部は読まないため） */
export const THUMB_SCALE = 0.25;

export type ShotsManifest = {
  version: 1;
  shots: StoryShot[];
  /** ストーリーが play 関数を持つか（撮ったときに分かったものだけ。ストーリー ID ごと） */
  playFunctions: Record<string, boolean>;
};

/**
 * 1 枚の高さの上限(px)。使う側の好みではなく、壊れないためだけのもの
 * （Chromium が 1 枚として描ける・撮れる大きさ 16384px に収める。これより長い画面は、ここで切って撮り、キャンバスの枠もここで切る）
 */
export const MAX_SHOT_HEIGHT = 16_000;

/** 目録の幅の上限(px)。目録は置くブランチが書けるので、壊れた値でキャンバスを崩さないためだけのもの */
export const MAX_SHOT_WIDTH = 10_000;

/** 画像のファイル名に使える文字（置き場の外・別のオリジンを指させない） */
const SHOT_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/;

/** ストーリー ID をファイル名に使える形にする */
const fileSafe = (storyId: string): string =>
  storyId.replace(/[^A-Za-z0-9_-]/g, "_").replace(/^[^A-Za-z0-9]/, "s");

/** 画像の場所（中身のハッシュを名前に入れる。中身が変われば名前が変わる） */
export const shotPath = (
  storyId: string,
  width: number,
  hash: string,
): string =>
  `${SHOTS_DIR}/${fileSafe(storyId)}-${String(width)}-${fileSafe(hash)}.png`;

/** 目録に書いてよい画像の場所か（review-canvas-shots/ の直下の .png だけ） */
export const isShotPath = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const prefix = `${SHOTS_DIR}/`;
  if (!value.startsWith(prefix)) return false;
  const file = value.slice(prefix.length);
  return SHOT_FILE_PATTERN.test(file) && !file.includes("..");
};

const isPositiveInteger = (value: unknown, max: number): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= max;

/** 中身の高さの上限(px)。画像は MAX_SHOT_HEIGHT で切るが、中身はそれより長いことがある */
const MAX_CONTENT_HEIGHT = 1_000_000;

const isCoordinate = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  Math.abs(value) <= MAX_CONTENT_HEIGHT;

const parseElement = (raw: unknown): ShotElement | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const { tag, x, y, width, height, text, heading } = raw as Record<
    string,
    unknown
  >;
  if (typeof tag !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(tag)) {
    return null;
  }
  if (!isCoordinate(x) || !isCoordinate(y)) return null;
  if (!isPositiveInteger(width, MAX_CONTENT_HEIGHT)) return null;
  if (!isPositiveInteger(height, MAX_CONTENT_HEIGHT)) return null;
  if (typeof text !== "string" || text.length > SHOT_ELEMENT_TEXT_LENGTH) {
    return null;
  }
  // 見出しは、残す前の版で撮った目録には無い。あるのに形が違えば、要素ごと捨てる
  if (heading === undefined) return { tag, x, y, width, height, text };
  if (
    typeof heading !== "string" ||
    heading.length > SHOT_ELEMENT_TEXT_LENGTH
  ) {
    return null;
  }
  return { tag, x, y, width, height, text, heading };
};

/** 主な要素の並び。1 つでも形が違えば全部を捨てる（欠けた並びで比べると、残っていない要素を「無くなった」と見誤る） */
const parseElements = (raw: unknown): ShotElement[] | null => {
  if (!Array.isArray(raw) || raw.length > MAX_SHOT_ELEMENTS) return null;
  const elements = raw.map(parseElement);
  return elements.every((element) => element !== null) ? elements : null;
};

const parseShot = (raw: unknown): StoryShot | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const { storyId, width, height, path, thumb, contentHeight } = raw as Record<
    string,
    unknown
  >;
  const elements = parseElements((raw as Record<string, unknown>)["elements"]);
  if (typeof storyId !== "string" || storyId === "") return null;
  if (!isPositiveInteger(width, MAX_SHOT_WIDTH)) return null;
  if (!isPositiveInteger(height, MAX_SHOT_HEIGHT)) return null;
  if (!isShotPath(path)) return null;
  // 縮小した画像の場所だけが違っていても、元の画像は使う
  return {
    storyId,
    width,
    height,
    path,
    ...(isShotPath(thumb) ? { thumb } : {}),
    ...(isPositiveInteger(contentHeight, MAX_CONTENT_HEIGHT)
      ? { contentHeight }
      : {}),
    ...(elements === null ? {} : { elements }),
  };
};

/**
 * 目録を読む。形の違う行は捨てる（1 行の誤りで全部を iframe に戻さない）。目録そのものの形が違えば null
 */
export const parseShotsManifest = (raw: unknown): ShotsManifest | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const { version, shots, playFunctions } = raw as Record<string, unknown>;
  if (version !== 1 || !Array.isArray(shots)) return null;
  return {
    version: 1,
    shots: shots.flatMap((entry: unknown) => {
      const shot = parseShot(entry);
      return shot === null ? [] : [shot];
    }),
    playFunctions:
      typeof playFunctions === "object" && playFunctions !== null
        ? Object.fromEntries(
            Object.entries(playFunctions).filter(
              (entry): entry is [string, boolean] =>
                typeof entry[1] === "boolean",
            ),
          )
        : {},
  };
};

/** キャンバスが 1 枚を出すのに要る分（画像の URL と高さ。thumbUrl は縮小した画像。contentHeight・elements は撮ったときの中身） */
export type ShotView = {
  url: string;
  height: number;
  thumbUrl?: string;
  contentHeight?: number;
  elements?: ReadonlyArray<ShotElement>;
};

/**
 * いまの倍率で出す画像の URL。画面上の 1px に縮小した画像の 1px 以上が当たる（粗く見えない）倍率なら、縮小した画像にする。
 * pixelRatio は端末の 1 CSS px あたりの画素数
 */
export const shotUrlAt = (
  shot: ShotView,
  zoom: number,
  pixelRatio: number,
): string =>
  shot.thumbUrl !== undefined && zoom * pixelRatio <= THUMB_SCALE
    ? shot.thumbUrl
    : shot.url;

/** Storybook 1 つ分の画像を、ストーリーと幅から引く口 */
export type ShotCatalog = {
  /** その幅で撮った画像（無ければ undefined。iframe で出す） */
  find: (storyId: string, width: number) => ShotView | undefined;
  /** play 関数を持つか（分からなければ undefined） */
  hasPlayFunction: (storyId: string) => boolean | undefined;
  /** 画像の枚数 */
  size: number;
  /** 目録を読めたか（無い・形が違うときは false。既定のブランチと比べられるかに使う） */
  hasManifest: boolean;
  /** そのストーリーの画像を、どれかの幅で 1 枚でも持つか */
  hasStory: (storyId: string) => boolean;
};

const shotKey = (storyId: string, width: number): string =>
  `${String(width)}:${storyId}`;

/** 目録から引く口を作る。storybookUrl は Storybook 1 つ分の置き場（末尾が /） */
export const buildShotCatalog = (
  manifest: ShotsManifest | null,
  storybookUrl: string,
): ShotCatalog => {
  const byKey = new Map(
    (manifest?.shots ?? []).map((shot) => [
      shotKey(shot.storyId, shot.width),
      {
        url: `${storybookUrl}${shot.path}`,
        height: shot.height,
        ...(shot.thumb === undefined
          ? {}
          : { thumbUrl: `${storybookUrl}${shot.thumb}` }),
        ...(shot.contentHeight === undefined
          ? {}
          : { contentHeight: shot.contentHeight }),
        ...(shot.elements === undefined ? {} : { elements: shot.elements }),
      },
    ]),
  );
  const playFunctions = manifest?.playFunctions ?? {};
  const storyIds = new Set((manifest?.shots ?? []).map((shot) => shot.storyId));
  return {
    find: (storyId, width) => byKey.get(shotKey(storyId, width)),
    hasPlayFunction: (storyId) =>
      Object.hasOwn(playFunctions, storyId)
        ? playFunctions[storyId]
        : undefined,
    size: byKey.size,
    hasManifest: manifest !== null,
    hasStory: (storyId) => storyIds.has(storyId),
  };
};

/** 画像の無い Storybook（目録が無い・読めない） */
export const EMPTY_SHOT_CATALOG = buildShotCatalog(null, "");
