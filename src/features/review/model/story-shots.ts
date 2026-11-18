/**
 * 発行のときに撮ったストーリーのスクリーンショット（Storybook と同じ置き場に置く）と、その目録。
 * キャンバスはふだんこの画像を並べ、触る画面だけ iframe に切り替える（model/frame-mode.ts）。
 * 目録が無い（撮る前の版で置いた・撮れなかった）ときは、いままでどおり iframe で出す。
 *
 * 置き場（Storybook 1 つ分の置き場 sb/<ブランチのキー>/<id>/ の下）:
 *   review-canvas-shots.json                              … 目録
 *   review-canvas-shots/<ストーリー ID>-<幅>-<中身のハッシュ>.png … 画像（名前に中身のハッシュを持つので、長く持たせる）
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
};

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

/** 目録の幅の上限(px)。目録は置くブランチが書けるので、壊れた値でキャンバスを崩さないためだけのもの（コメントの API が受け付ける frameWidth の上限と同じ） */
const MAX_SHOT_WIDTH = 10_000;

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

const parseShot = (raw: unknown): StoryShot | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const { storyId, width, height, path } = raw as Record<string, unknown>;
  if (typeof storyId !== "string" || storyId === "") return null;
  if (!isPositiveInteger(width, MAX_SHOT_WIDTH)) return null;
  if (!isPositiveInteger(height, MAX_SHOT_HEIGHT)) return null;
  if (!isShotPath(path)) return null;
  return { storyId, width, height, path };
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

/** キャンバスが 1 枚を出すのに要る分（画像の URL と高さ） */
export type ShotView = { url: string; height: number };

/** Storybook 1 つ分の画像を、ストーリーと幅から引く口 */
export type ShotCatalog = {
  /** その幅で撮った画像（無ければ undefined。iframe で出す） */
  find: (storyId: string, width: number) => ShotView | undefined;
  /** play 関数を持つか（分からなければ undefined） */
  hasPlayFunction: (storyId: string) => boolean | undefined;
  /** 画像の枚数 */
  size: number;
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
      { url: `${storybookUrl}${shot.path}`, height: shot.height },
    ]),
  );
  const playFunctions = manifest?.playFunctions ?? {};
  return {
    find: (storyId, width) => byKey.get(shotKey(storyId, width)),
    hasPlayFunction: (storyId) =>
      Object.hasOwn(playFunctions, storyId)
        ? playFunctions[storyId]
        : undefined,
    size: byKey.size,
  };
};

/** 画像の無い Storybook（目録が無い・読めない） */
export const EMPTY_SHOT_CATALOG = buildShotCatalog(null, "");
